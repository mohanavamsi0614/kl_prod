import { mailQueue } from "../utils/mailQueue";
import { getMicrosoftClient } from "../services/microsoftClient";
import { emitToUser } from "../utils/socket";
import logger from "../utils/logger";
import prisma from "../lib/prisma";

export const initMailWorker = () => {
    logger.info("Mail worker initialized");
};

export const queueMailUpdate = (userId: string, connectionId: string, messageId: string) => {
    mailQueue.add(async () => {
        try {
            logger.info({ userId, messageId }, "Processing mail update");
            
            const client = await getMicrosoftClient(connectionId);
            
            // Fetch the specific message
            const response = await client.get(`/me/messages/${messageId}`);
            const message = response.data;

            // Emit to user via socket
            emitToUser(userId, "new_mail", {
                id: message.id,
                subject: message.subject,
                from: message.from?.emailAddress?.name || message.from?.emailAddress?.address,
                receivedDateTime: message.receivedDateTime,
                bodyPreview: message.bodyPreview
            });

            logger.info({ userId, messageId }, "Mail update emitted to user");
        } catch (error) {
            logger.error({ error, userId, messageId }, "Failed to process mail update");
        }
    });
};
