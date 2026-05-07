import axios from 'axios';
import { TokenManager } from './TokenManager';
import logger from '../utils/logger';

/**
 * Returns an authenticated axios instance for Microsoft Graph API
 */
export async function getMicrosoftClient(connectionId: string) {
    try {
        const accessToken = await TokenManager.getValidAccessToken(connectionId);
        
        const client = axios.create({
            baseURL: 'https://graph.microsoft.com/v1.0',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000, // 10s timeout
        });

        // Add response interceptor for logging/error handling
        client.interceptors.response.use(
            response => response,
            error => {
                const status = error.response?.status;
                const data = error.response?.data;
                logger.error({ status, data, connectionId }, "Microsoft Graph API Error");
                return Promise.reject(error);
            }
        );

        return client;
    } catch (error) {
        logger.error({ error, connectionId }, "Failed to initialize Microsoft client");
        throw error;
    }
}
