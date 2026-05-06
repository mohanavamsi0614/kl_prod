import { mailQueue } from '../utils/mailQueue';
import { getMicrosoftClient } from '../services/microsoftClient';
import prisma from '../lib/prisma';
import { emitToUser } from '../utils/socket';
import logger from '../utils/logger';

export const initMailWorker = () => {
    mailQueue.onProcess(async (task) => {
        const { userId, resource } = task;

        try {
            // Find the connection for this resource
            const connection = await prisma.serviceToken.findFirst({
                where: { userId, service: 'OUTLOOK' }
            });

            if (!connection) {
                logger.warn({ userId }, 'No Outlook connection found for mail task');
                return;
            }

            const client = await getMicrosoftClient(connection.id);
            
            // Extract message ID from resource (usually 'Users/ID/Messages/MSG_ID')
            const messageId = resource.split('/').pop();
            
            if (!messageId) return;

            // Fetch the new message
            const messageRes = await client.get(`/me/messages/${messageId}`);
            const message = messageRes.data;
            
            // Emit to user via socket
            emitToUser(userId, 'new_mail', {
                id: message.id,
                subject: message.subject,
                from: message.from?.emailAddress?.name || message.from?.emailAddress?.address,
                receivedDateTime: message.receivedDateTime,
                bodyPreview: message.bodyPreview,
                accountId: connection.id
            });

            logger.info({ userId, messageId }, 'Processed new mail and emitted socket event');
        } catch (err) {
            logger.error({ err, userId, resource }, 'Mail worker failed to process message');
        }
    });
};
