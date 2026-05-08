import { getMicrosoftClient } from "./microsoftClient";
import logger from "../utils/logger";

export class OutlookSyncService {
    static async subscribeToMail(connectionId: string, userId: string) {
        try {
            const client = await getMicrosoftClient(connectionId);

            const notificationUrl = `${process.env.VITE_API_URL}/api/outlook/webhook`;

            const subscriptionPayload = {
                changeType: "created",
                notificationUrl: notificationUrl,
                resource: "me/mailFolders('Inbox')/messages",
                expirationDateTime: new Date(Date.now() + 4230 * 60 * 1000).toISOString(), // Max ~2.9 days
                clientState: userId
            };

            const response = await client.post("/subscriptions", subscriptionPayload);
            const subscription = response.data;

            logger.info({ userId, subscriptionId: subscription.id }, "Created Outlook mail subscription");

            return subscription;
        } catch (error: any) {
            logger.error({
                error: error.response?.data || error.message,
                userId,
                connectionId
            }, "Failed to create Outlook subscription");
            throw error;
        }
    }
}
