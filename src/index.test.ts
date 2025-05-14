import {
	CloudWatchLogsClient,
	PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudWatchLogsTransportStream } from "./index";

// Mock AWS SDK
vi.mock("@aws-sdk/client-cloudwatch-logs", () => ({
	CloudWatchLogsClient: vi.fn(),
	CreateLogStreamCommand: vi.fn(),
	DescribeLogStreamsCommand: vi.fn(),
	PutLogEventsCommand: vi.fn(),
}));

describe("CloudWatchLogsTransportStream", () => {
	const mockOptions = {
		logGroupName: "test-group",
		logStreamName: "test-stream",
		cloudWatchLogsClientConfig: {
			credentials: {
				accessKeyId: "test-key",
				secretAccessKey: "test-secret",
			},
			region: "us-east-1",
		},
		batchSize: 2,
		flushInterval: 100,
	};

	const mockCloudWatchClient = {
		send: vi.fn(),
		destroy: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		(
			CloudWatchLogsClient as unknown as ReturnType<typeof vi.fn>
		).mockImplementation(() => mockCloudWatchClient);
		// Default mock response for DescribeLogStreamsCommand
		mockCloudWatchClient.send.mockResolvedValue({
			logStreams: [{ logStreamName: "test-stream" }],
		});
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	describe("log", () => {
		it("should queue log messages and flush when batch is full", async () => {
			const instance = await CloudWatchLogsTransportStream.create(mockOptions);

			// Reset mock calls after instance creation
			mockCloudWatchClient.send.mockClear();
			mockCloudWatchClient.send.mockResolvedValue({});

			// Add first message
			await instance.log("test message 1", () => {});
			expect(mockCloudWatchClient.send).not.toHaveBeenCalled();

			// Add second message (batch size is 2)
			await instance.log("test message 2", () => {});

			// Wait for the flush to occur
			await vi.runOnlyPendingTimersAsync();

			expect(mockCloudWatchClient.send).toHaveBeenCalledWith(
				expect.any(PutLogEventsCommand),
			);
		});

		it("should handle string and object log messages", async () => {
			const instance = await CloudWatchLogsTransportStream.create(mockOptions);

			// Reset mock calls after instance creation
			mockCloudWatchClient.send.mockClear();
			mockCloudWatchClient.send.mockResolvedValue({});

			// Test string message
			await instance.log("string message", () => {});

			// Test object message
			await instance.log({ message: "object message" }, () => {});

			// Test object with Symbol message
			const messageSymbol = Symbol.for("message");
			await instance.log(
				{ [messageSymbol]: "symbol message" } as { [key: string]: unknown },
				() => {},
			);

			// Wait for any pending flushes
			await vi.runOnlyPendingTimersAsync();
		});

		it("should handle errors during logging", async () => {
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			const instance = await CloudWatchLogsTransportStream.create(mockOptions);

			// Reset mock calls after instance creation
			mockCloudWatchClient.send.mockClear();
			mockCloudWatchClient.send.mockRejectedValueOnce(new Error("AWS Error"));

			// Add enough messages to trigger a flush
			await instance.log("message 1", () => {});
			await instance.log("message 2", () => {});

			// Wait for the flush to occur
			await vi.runOnlyPendingTimersAsync();

			expect(consoleSpy).toHaveBeenCalledWith(
				"Failed to flush logs to CloudWatch:",
				expect.any(Error),
			);

			consoleSpy.mockRestore();
		});
	});

	describe("close", () => {
		it("should flush remaining logs and clear timer on close", async () => {
			const instance = await CloudWatchLogsTransportStream.create(mockOptions);

			// Reset mock calls after instance creation
			mockCloudWatchClient.send.mockClear();
			mockCloudWatchClient.send.mockResolvedValue({});

			await instance.log("test message", () => {});
			await instance.close();

			expect(mockCloudWatchClient.send).toHaveBeenCalledWith(
				expect.any(PutLogEventsCommand),
			);
		});
	});
});
