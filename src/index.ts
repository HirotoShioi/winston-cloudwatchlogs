import {
	CloudWatchLogsClient,
	type CloudWatchLogsClientConfig,
	PutLogEventsCommand,
	type PutLogEventsCommandInput,
} from "@aws-sdk/client-cloudwatch-logs";
import AsyncLock from "async-lock";
import TransportStream from "winston-transport";
import { LogQueue } from "./log-queue.js";
import { LogStreamGenerator } from "./log-stream-generator";

const MESSAGE_SYMBOL = Symbol.for("message");

type LogInfo =
	| {
			[MESSAGE_SYMBOL]?: string;
			message?: string;
			[key: string]: unknown;
	  }
	| string;

export type CloudWatchLogsTransportStreamOptions = {
	logGroupName: string;
	logStreamNamePrefix?: string;
	cloudWatchLogsClientConfig: CloudWatchLogsClientConfig;
	batchSize?: number;
	flushInterval?: number;
} & TransportStream.TransportStreamOptions;

export class CloudWatchLogsTransportStream extends TransportStream {
	#client: CloudWatchLogsClient;
	#logGroupName: string;
	#logStreamGenerator!: LogStreamGenerator;
	#logQueue: LogQueue;
	#flushInterval: number;
	#flushTimer: NodeJS.Timeout | null = null;
	#lock = new AsyncLock();

	private constructor(opts: CloudWatchLogsTransportStreamOptions) {
		super(opts);
		this.#logGroupName = opts.logGroupName;
		this.#logQueue = new LogQueue();
		this.#flushInterval = opts.flushInterval ?? 3000; // 3 seconds default
		this.#client = new CloudWatchLogsClient(opts.cloudWatchLogsClientConfig);
		this.#logStreamGenerator = LogStreamGenerator.create(
			this.#client,
			this.#logGroupName,
			opts.logStreamNamePrefix,
		);
	}

	#startFlushTimer() {
		if (this.#flushTimer) {
			clearInterval(this.#flushTimer);
		}
		this.#flushTimer = setInterval(() => this.#flush(), this.#flushInterval);
	}

	async #flush() {
		await this.#lock.acquire("flush-cloudwatch-logs", async () => {
			try {
				let hasMore = true;
				while (hasMore) {
					const { batch, hasMore: remaining } = this.#logQueue.getNextBatch();
					if (batch.length === 0) break;

					const params: PutLogEventsCommandInput = {
						logGroupName: this.#logGroupName,
						logStreamName:
							await this.#logStreamGenerator.getCurrentLogStreamName(),
						logEvents: batch,
					};
					const command = new PutLogEventsCommand(params);
					await this.#client.send(command);
					hasMore = remaining;
				}
			} catch (error) {
				console.error("Failed to flush logs to CloudWatch:", error);
			}
		});
	}

	static async create(
		opts: CloudWatchLogsTransportStreamOptions,
	): Promise<CloudWatchLogsTransportStream> {
		const instance = new CloudWatchLogsTransportStream(opts);
		instance.#startFlushTimer();
		return instance;
	}

	#extractMessage(info: LogInfo): string {
		if (typeof info === "string") {
			return info;
		}
		return info[MESSAGE_SYMBOL] ?? info.message ?? "";
	}

	public override async log(info: LogInfo, next: () => void) {
		try {
			const message = this.#extractMessage(info);
			this.#logQueue.add(message);
			next();
		} catch (error) {
			console.error("Failed to queue log:", error);
			next();
		}
	}

	public override async close() {
		if (this.#flushTimer) {
			clearInterval(this.#flushTimer);
		}
		await this.#flush();
		this.#client.destroy();
	}
}
