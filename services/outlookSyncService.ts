import { getMicrosoftClient } from "./microsoftClient";
import logger from "../utils/logger";

export class OutlookSyncService {
    static async subscribeToMail(connectionId: string, userId: string) {
        try {
            const client = await getMicrosoftClient(connectionId);
            
            // The notification URL must be publicly accessible (e.g., ngrok for local dev)
            const notificationUrl = `${process.env.VITE_API_URL}/api/outlook/webhook`;
            
            if (notificationUrl.includes('localhost')) {
                logger.warn("Webhook subscription skipped: VITE_API_URL is set to localhost. Use ngrok for real-time updates.");
                return;
            }

            const subscription = {
                changeType: "created",
                notificationUrl: notificationUrl,
                resource: "me/mailFolders('Inbox')/messages",
                expirationDateTime: new Date(Date.now() + 4230 * 60 * 1000).toISOString(), // ~3 days max
                clientState: userId
            };

            const response = await client.api("/subscriptions").post(subscription);
            logger.info({ userId, subscriptionId: response.id }, "Created Outlook mail subscription");
            return response;
        } catch (err) {
            logger.error({ err, userId }, "Failed to create Outlook mail subscription");
            throw err;
        }
    }
}
