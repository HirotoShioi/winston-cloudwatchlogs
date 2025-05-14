import {
	type CloudWatchLogsClient,
	CreateLogStreamCommand,
	DescribeLogStreamsCommand,
} from "@aws-sdk/client-cloudwatch-logs";

export class LogStreamGenerator {
	#client: CloudWatchLogsClient;
	#logGroupName: string;
	#prefix: string;
	#checkedStreams = new Set<string>();

	private constructor(
		client: CloudWatchLogsClient,
		logGroupName: string,
		prefix?: string,
	) {
		if (!logGroupName.trim()) {
			throw new Error("Log group name cannot be empty");
		}
		this.#client = client;
		this.#logGroupName = logGroupName;
		this.#prefix = prefix ?? "";
	}

	static create(
		client: CloudWatchLogsClient,
		logGroupName: string,
		prefix?: string,
	): LogStreamGenerator {
		return new LogStreamGenerator(client, logGroupName, prefix);
	}

	#generateLogStreamName(): string {
		const now = new Date();
		const year = now.getUTCFullYear();
		const month = String(now.getUTCMonth() + 1).padStart(2, "0");
		const day = String(now.getUTCDate()).padStart(2, "0");
		const hour = String(now.getUTCHours()).padStart(2, "0");
		return `${this.#prefix}${this.#prefix ? "-" : ""}${year}-${month}-${day}-${hour}-UTC`;
	}

	/**
	 * Ensures the log stream exists. If it does not, it will be created. Uses a local cache to avoid redundant API calls.
	 */
	async #ensureLogStreamExists(streamName: string): Promise<void> {
		if (this.#checkedStreams.has(streamName)) {
			return;
		}
		const logStreams = await this.#client.send(
			new DescribeLogStreamsCommand({
				logGroupName: this.#logGroupName,
				logStreamNamePrefix: streamName,
			}),
		);
		const doesLogStreamExist = logStreams.logStreams?.some(
			(stream) => stream.logStreamName === streamName,
		);
		if (!doesLogStreamExist) {
			await this.#client.send(
				new CreateLogStreamCommand({
					logGroupName: this.#logGroupName,
					logStreamName: streamName,
				}),
			);
		}
		this.#checkedStreams.add(streamName);
	}

	/**
	 * Returns the current log stream name. Ensures the log stream exists.
	 */
	async getCurrentLogStreamName(): Promise<string> {
		const streamName = this.#generateLogStreamName();
		await this.#ensureLogStreamExists(streamName);
		return streamName;
	}
}
