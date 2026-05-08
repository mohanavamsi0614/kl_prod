import logger from "./logger";

type Task = () => Promise<void>;

class MailQueue {
    private queue: Task[] = [];
    private isProcessing = false;

    async add(task: Task) {
        this.queue.push(task);
        this.process();
    }

    private async process() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;
        const task = this.queue.shift();

        if (task) {
            try {
                await task();
            } catch (error) {
                logger.error({ error }, "Error processing mail task");
            }
        }

        this.isProcessing = false;
        this.process();
    }

    get length() {
        return this.queue.length;
    }
}

export const mailQueue = new MailQueue();
