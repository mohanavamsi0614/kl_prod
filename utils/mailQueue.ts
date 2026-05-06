import logger from './logger';

type MailTask = {
    userId: string;
    resource: string;
    tenantId: string;
    clientState?: string;
};

class MailQueue {
    private queue: MailTask[] = [];
    private processing = false;
    private handlers: ((task: MailTask) => Promise<void>)[] = [];

    async add(task: MailTask) {
        logger.info({ userId: task.userId }, 'Adding mail task to queue');
        this.queue.push(task);
        this.process();
    }

    onProcess(handler: (task: MailTask) => Promise<void>) {
        this.handlers.push(handler);
    }

    private async process() {
        if (this.processing || this.queue.length === 0) return;

        this.processing = true;
        
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) {
                try {
                    await Promise.all(this.handlers.map(handler => handler(task)));
                } catch (err) {
                    logger.error({ err, task }, 'Error processing mail task');
                }
            }
        }

        this.processing = false;
    }
}

export const mailQueue = new MailQueue();
