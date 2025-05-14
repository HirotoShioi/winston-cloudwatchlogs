import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LogQueue } from "./log-queue";

describe("LogQueue", () => {
	let queue: LogQueue;

	beforeEach(() => {
		queue = new LogQueue();
	});
	afterEach(() => {
		queue.reset();
	});

	describe("add", () => {
		it("should add a message to the queue", () => {
			queue.add("test message");
			expect(queue.get()).toHaveLength(1);
		});

		it("should handle empty messages", () => {
			queue.add("");
			expect(queue.get()).toHaveLength(1);
		});

		it("should truncate messages that exceed the size limit", () => {
			// Create a message that's larger than the max event size (1MB - 26 bytes)
			const largeMessage = "x".repeat(1048577); // 1MB + 1 byte
			queue.add(largeMessage);
			const messages = queue.get();
			expect(messages).toHaveLength(1);

			const message = messages[0];
			if (!message) {
				throw new Error("Expected message to be defined");
			}

			expect(message.message).toContain("[TRUNCATED]");
			expect(message.message.length).toBeLessThan(largeMessage.length);
		});
	});

	describe("get", () => {
		it("should return a copy of the queue", () => {
			queue.add("message 1");
			const messages = queue.get();
			expect(messages).toHaveLength(1);
			expect(messages[0]).toEqual({
				message: "message 1",
				timestamp: expect.any(Number),
			});

			// Modifying the returned array should not affect the queue
			messages.pop();
			expect(queue.get()).toHaveLength(1);
		});

		it("should return a deep copy of the queue", () => {
			queue.add("message 1");
			const messages = queue.get();
			expect(messages).toHaveLength(1);

			const message = messages[0];
			if (!message) {
				throw new Error("Expected message to be defined");
			}

			const originalTimestamp = message.timestamp;

			// Modifying the returned object should not affect the queue
			message.message = "modified";
			message.timestamp = 0;

			const newMessages = queue.get();
			expect(newMessages).toHaveLength(1);

			const newMessage = newMessages[0];
			if (!newMessage) {
				throw new Error("Expected new message to be defined");
			}

			expect(newMessage.message).toBe("message 1");
			expect(newMessage.timestamp).toBe(originalTimestamp);
		});
	});

	describe("reset", () => {
		it("should clear the queue", () => {
			queue.add("message 1");
			queue.add("message 2");
			expect(queue.get()).toHaveLength(2);

			queue.reset();
			expect(queue.get()).toHaveLength(0);
		});
	});

	describe("size", () => {
		it("should return 0 when queue is empty", () => {
			expect(queue.size()).toBe(0);
		});

		it("should return correct count after adding messages", () => {
			queue.add("message 1");
			queue.add("message 2");
			expect(queue.size()).toBe(2);
		});

		it("should update count after processing a batch", () => {
			queue.add("message 1");
			queue.add("message 2");
			queue.getNextBatch();
			expect(queue.size()).toBe(0);
		});
	});

	describe("getNextBatch", () => {
		it("should return empty batch when queue is empty", () => {
			const { batch, hasMore } = queue.getNextBatch();
			expect(batch).toHaveLength(0);
			expect(hasMore).toBe(false);
		});

		it("should return all messages when total size is under limit", () => {
			queue.add("message 1");
			queue.add("message 2");
			queue.add("message 3");

			const { batch, hasMore } = queue.getNextBatch();
			expect(batch).toHaveLength(3);
			expect(hasMore).toBe(false);
		});

		it("should split messages when total size exceeds limit", () => {
			// Add messages that will exceed the 1MB limit
			const mediumMessage = "x".repeat(524288); // 0.5MB
			queue.add(mediumMessage);
			queue.add(mediumMessage);
			queue.add(mediumMessage);

			const { batch, hasMore } = queue.getNextBatch();
			expect(batch.length).toBeLessThan(3);
			expect(hasMore).toBe(true);
		});

		it("should respect maximum event count limit", () => {
			// Add more than 10,000 messages
			for (let i = 0; i < 10001; i++) {
				queue.add(`message ${i}`);
			}

			const { batch, hasMore } = queue.getNextBatch();
			expect(batch.length).toBe(10000);
			expect(hasMore).toBe(true);
			expect(queue.size()).toBe(1);
		});

		it("should remove processed messages from queue", () => {
			queue.add("message 1");
			queue.add("message 2");
			queue.add("message 3");

			const { batch } = queue.getNextBatch();
			expect(batch).toHaveLength(3);
			expect(queue.size()).toBe(0);
		});

		it("should handle mixed message sizes correctly", () => {
			// Mix of small and large messages
			const smallMessage = "small message";
			const largeMessage = "x".repeat(525000); // ~0.5MB

			queue.add(smallMessage);
			queue.add(largeMessage);
			queue.add(smallMessage);
			queue.add(largeMessage);

			// 最初のバッチを取得
			const firstResult = queue.getNextBatch();

			// バッチのサイズを確認（少なくとも1つのメッセージを含む）
			expect(firstResult.batch.length).toBeGreaterThan(0);

			// 残りのメッセージがまだキューにあることを確認
			const remainingSize = queue.size();
			expect(remainingSize).toBeGreaterThan(0);
			expect(firstResult.hasMore).toBe(remainingSize > 0);

			// すべてのメッセージが処理されるまで繰り返し取得
			const processedBatches = [firstResult];
			while (queue.size() > 0) {
				processedBatches.push(queue.getNextBatch());
			}

			// すべてのバッチを合わせると4つのメッセージになるはず
			const totalProcessed = processedBatches.reduce(
				(sum, batch) => sum + batch.batch.length,
				0,
			);
			expect(totalProcessed).toBe(4);

			// 最後のバッチ取得後はキューが空になっていることを確認
			expect(queue.size()).toBe(0);
		});
		it("should process all messages in multiple batches", () => {
			const mediumMessage = "x".repeat(300000); // ~0.3MB

			// Add several messages to force multiple batches
			for (let i = 0; i < 5; i++) {
				queue.add(mediumMessage);
			}

			let batchCount = 0;
			let processedEvents = 0;
			let hasMore = true;

			while (hasMore) {
				const result = queue.getNextBatch();
				batchCount++;
				processedEvents += result.batch.length;
				hasMore = result.hasMore;
			}

			expect(batchCount).toBeGreaterThan(1);
			expect(processedEvents).toBe(5);
			expect(queue.size()).toBe(0);
		});
	});

	describe("message truncation", () => {
		it("should truncate messages that exceed MAX_LOG_EVENT_SIZE", () => {
			const largeMessage = "x".repeat(1024 * 1024 + 100); // Almost 1MB
			queue.add(largeMessage);

			const messages = queue.get();
			expect(messages).toHaveLength(1);
			const message = messages[0];
			expect(message).toBeDefined();
			expect(message?.message).toContain("[TRUNCATED]");
			expect(message?.message.length).toBeLessThan(largeMessage.length);
		});

		it("should not truncate messages within size limit", () => {
			const smallMessage = "small message";
			queue.add(smallMessage);
			const messages = queue.get();
			expect(messages[0]?.message).toBe(smallMessage);
		});

		it("should properly handle exact size limit messages", () => {
			// Create a message exactly at the size limit boundary (1MB - 26 bytes)
			const exactSizeMessage = "x".repeat(1048576 - 26);
			queue.add(exactSizeMessage);

			const messages = queue.get();
			expect(messages[0]?.message).toBe(exactSizeMessage);
			expect(messages[0]?.message).not.toContain("[TRUNCATED]");
		});

		it("should handle special characters and multi-byte Unicode correctly", () => {
			// Japanese characters, emojis, and other multi-byte characters
			const multiByteMessage =
				"日本語テキスト with emojis 😀🙏🌟 and symbols €£¥";
			queue.add(multiByteMessage);

			const messages = queue.get();
			expect(messages[0]?.message).toBe(multiByteMessage);
		});

		it("should correctly calculate message size with multi-byte characters", () => {
			// Create many multi-byte character messages to test size calculation
			const multiByteChar = "😀"; // 4 bytes in UTF-8
			const singleByteChar = "a"; // 1 byte

			// These should have different byte sizes despite same string length
			const multiByteString = multiByteChar.repeat(250000);
			const singleByteString = singleByteChar.repeat(250000);

			queue.add(multiByteString);
			queue.add(multiByteString);

			const result1 = queue.getNextBatch();
			expect(result1.batch.length).toBeLessThan(2);
			expect(result1.hasMore).toBe(true);

			queue.reset();

			queue.add(singleByteString);
			queue.add(singleByteString);
			queue.add(singleByteString);

			const result2 = queue.getNextBatch();
			expect(result2.batch.length).toBeGreaterThanOrEqual(2);
		});
	});
});
