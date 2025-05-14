export type LogEvent = {
	message: string;
	timestamp: number;
};

export class LogQueue {
	#MAX_BATCH_SIZE = 1048576; // 1 MB
	#MAX_LOG_EVENT_SIZE = 1048576; // 1 MB - 26 bytes (overhead)
	#MAX_EVENTS_PER_BATCH = 10000; // CloudWatch's limit
	#EVENT_OVERHEAD = 26; // 26 bytes per event
	#queue: LogEvent[] = [];

	/**
	 * Add a log event to the queue
	 */
	add(message: string): void {
		const safeMessage = this.#truncateMessage(message);
		this.#queue.push({ message: safeMessage, timestamp: Date.now() });
	}

	/**
	 * Get the next batch of logs that fits within the size limit
	 * @returns {LogEvent[]} The next batch of logs and whether there are more logs to process
	 */
	getNextBatch(): { batch: LogEvent[]; hasMore: boolean } {
		if (this.#queue.length === 0) {
			return { batch: [], hasMore: false };
		}

		const batch: LogEvent[] = [];
		let currentBatchSize = 0;

		for (const event of this.#queue) {
			const eventSize = this.#calculateMessageSize(event.message);
			if (
				currentBatchSize + eventSize > this.#MAX_BATCH_SIZE ||
				batch.length >= this.#MAX_EVENTS_PER_BATCH
			) {
				break;
			}
			batch.push(event);
			currentBatchSize += eventSize;
		}

		// Remove processed events from the queue
		this.#queue = this.#queue.slice(batch.length);

		return {
			batch,
			hasMore: this.#queue.length > 0,
		};
	}

	get(): LogEvent[] {
		// Create a deep copy of the queue
		return this.#queue.map((event) => ({
			message: event.message,
			timestamp: event.timestamp,
		}));
	}

	size(): number {
		return this.#queue.length;
	}

	reset(): void {
		this.#queue = [];
	}

	/**
	 * Calculate the size of a message in bytes including overhead
	 */
	#calculateMessageSize(message: string): number {
		const encoder = new TextEncoder();
		return encoder.encode(message).length + this.#EVENT_OVERHEAD;
	}

	/**
	 * Check if a message needs to be truncated and return the safe version
	 * Uses binary search to efficiently find the maximum safe length that fits within CloudWatch's size limit
	 * while preserving as much of the original message as possible
	 */
	#truncateMessage(message: string): string {
		const encoder = new TextEncoder();
		const truncationSuffix = "[TRUNCATED]";
		const maxSize = this.#MAX_LOG_EVENT_SIZE - this.#EVENT_OVERHEAD;

		// If message is already within size limit, return as is
		const messageBytes = encoder.encode(message).length;
		if (messageBytes <= maxSize) {
			return message;
		}

		// Binary search to find the maximum safe length
		let low = 0;
		let high = message.length;

		while (low < high) {
			const mid = Math.floor((low + high + 1) / 2);
			const truncatedMsg = message.substring(0, mid);
			const truncatedBytes = encoder.encode(
				truncatedMsg + truncationSuffix,
			).length;

			if (truncatedBytes <= maxSize) {
				low = mid;
			} else {
				high = mid - 1;
			}
		}

		// Return the longest safe message that fits within size limit
		return message.substring(0, low) + truncationSuffix;
	}
}
