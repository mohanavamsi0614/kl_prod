/**
 * Google Drive Client for File Management
 * 
 * Provides methods for listing, downloading, uploading, renaming,
 * and deleting files in a user's Google Drive.
 */

import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';
import { TokenManager } from './TokenManager';
import logger from '../utils/logger';
import { withGoogleApiRetry } from '../utils/googleApiRetry';

// MIME type for Google Drive folders
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

// Google Docs MIME types that require export
const GOOGLE_DOCS_MIME_TYPES: Record<string, string> = {
    'application/vnd.google-apps.document': 'application/pdf',
    'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.google-apps.presentation': 'application/pdf',
    'application/vnd.google-apps.drawing': 'image/png',
};

// Export file extensions for Google Docs
const EXPORT_EXTENSIONS: Record<string, string> = {
    'application/vnd.google-apps.document': '.pdf',
    'application/vnd.google-apps.spreadsheet': '.xlsx',
    'application/vnd.google-apps.presentation': '.pdf',
    'application/vnd.google-apps.drawing': '.png',
};

/**
 * File metadata returned from Drive API
 */
export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    size: string | null;
    iconLink: string | null;
    thumbnailLink: string | null;
    webViewLink: string | null;
    webContentLink: string | null;
    modifiedTime: string;
    createdTime: string;
    parents: string[];
    isFolder: boolean;
    capabilities?: {
        canEdit: boolean;
        canDelete: boolean;
        canDownload: boolean;
    };
    owners?: { displayName: string; emailAddress: string }[];
    description?: string | null;
}

/**
 * Response for file listing
 */
export interface DriveListResponse {
    files: DriveFile[];
    nextPageToken: string | null;
    hasMore: boolean;
}

/**
 * Options for listing files
 */
export interface ListFilesOptions {
    folderId?: string;
    pageToken?: string;
    pageSize?: number;
    orderBy?: string;
    query?: string;  // Additional query filter
}

/**
 * Options for uploading files
 */
export interface UploadOptions {
    name: string;
    mimeType: string;
    folderId?: string;
    description?: string;
}

/**
 * Get an authenticated Google Drive client
 */
export const getDriveClient = async (connectionId: string): Promise<drive_v3.Drive> => {
    const accessToken = await TokenManager.getValidAccessToken(connectionId);
    
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        throw new Error('Google OAuth credentials not configured');
    }
    
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({ access_token: accessToken });
    
    return google.drive({ version: 'v3', auth: oauth2Client });
};

/**
 * Transform Drive API file to our interface
 */
function transformFile(file: drive_v3.Schema$File): DriveFile {
    return {
        id: file.id || '',
        name: file.name || '',
        mimeType: file.mimeType || '',
        size: file.size || null,
        iconLink: file.iconLink || null,
        thumbnailLink: file.thumbnailLink || null,
        webViewLink: file.webViewLink || null,
        webContentLink: file.webContentLink || null,
        modifiedTime: file.modifiedTime || '',
        createdTime: file.createdTime || '',
        parents: file.parents || [],
        isFolder: file.mimeType === FOLDER_MIME_TYPE,
        capabilities: file.capabilities ? {
            canEdit: file.capabilities.canEdit || false,
            canDelete: file.capabilities.canDelete || false,
            canDownload: file.capabilities.canDownload || false,
        } : undefined,
        owners: file.owners?.map(o => ({
            displayName: o.displayName || '',
            emailAddress: o.emailAddress || ''
        })),
        description: file.description,
    };
}

/**
 * Check if a MIME type is a Google Docs format that requires export
 */
export function isGoogleDocsType(mimeType: string): boolean {
    return mimeType in GOOGLE_DOCS_MIME_TYPES;
}

/**
 * Get export MIME type for Google Docs files
 */
export function getExportMimeType(mimeType: string): string {
    return GOOGLE_DOCS_MIME_TYPES[mimeType] || 'application/pdf';
}

/**
 * Get export file extension for Google Docs files
 */
export function getExportExtension(mimeType: string): string {
    return EXPORT_EXTENSIONS[mimeType] || '.pdf';
}

/**
 * List files in a Google Drive folder
 */
export const listFiles = async (
    connectionId: string,
    options: ListFilesOptions = {}
): Promise<DriveListResponse> => {
    const driveClient = await getDriveClient(connectionId);
    
    const {
        folderId = 'root',
        pageToken,
        pageSize = 50,
        orderBy = 'folder,name',
        query,
    } = options;
    
    // Build query: files in folder, not trashed
    let q = `'${folderId}' in parents and trashed = false`;
    if (query) {
        q += ` and ${query}`;
    }
    
    logger.info({ connectionId, folderId, pageSize, hasPageToken: !!pageToken }, 'Listing Drive files');
    
    const response = await withGoogleApiRetry(
        () => driveClient.files.list({
            q,
            fields: 'nextPageToken, files(id, name, mimeType, size, iconLink, thumbnailLink, webViewLink, webContentLink, modifiedTime, createdTime, parents)',
            pageSize: Math.min(pageSize, 100),
            pageToken: pageToken || undefined,
            orderBy,
            // Note: supportsAllDrives is not used per requirements (no shared drives)
        }),
        { maxRetries: 3 },
        `listFiles:${connectionId}`
    );
    
    const files = (response.data.files || []).map(transformFile);
    
    logger.info({ connectionId, folderId, fileCount: files.length, hasNextPage: !!response.data.nextPageToken }, 'Listed Drive files');
    
    return {
        files,
        nextPageToken: response.data.nextPageToken || null,
        hasMore: !!response.data.nextPageToken,
    };
};

/**
 * Get a single file's metadata
 */
export const getFile = async (
    connectionId: string,
    fileId: string
): Promise<DriveFile> => {
    const driveClient = await getDriveClient(connectionId);
    
    logger.info({ connectionId, fileId }, 'Getting Drive file metadata');
    
    const response = await withGoogleApiRetry(
        () => driveClient.files.get({
            fileId,
            fields: 'id, name, mimeType, size, description, webViewLink, webContentLink, modifiedTime, createdTime, owners, parents, capabilities, iconLink, thumbnailLink',
        }),
        { maxRetries: 3 },
        `getFile:${connectionId}`
    );
    
    return transformFile(response.data);
};

/**
 * Get folder path (breadcrumb) from file to root
 */
export const getFolderPath = async (
    connectionId: string,
    folderId: string
): Promise<{ id: string; name: string }[]> => {
    if (!folderId || folderId === 'root') {
        return [];
    }
    
    const driveClient = await getDriveClient(connectionId);
    const path: { id: string; name: string }[] = [];
    let currentId = folderId;
    
    // Limit iterations to prevent infinite loops
    const maxDepth = 50;
    let depth = 0;
    
    while (currentId && currentId !== 'root' && depth < maxDepth) {
        try {
            const response = await driveClient.files.get({
                fileId: currentId,
                fields: 'id, name, parents',
            });
            
            const file = response.data;
            path.unshift({ id: file.id || '', name: file.name || '' });
            currentId = file.parents?.[0] || '';
            depth++;
        } catch (error: any) {
            // If we can't access a parent, stop traversal
            logger.warn({ connectionId, folderId: currentId, error: error.message }, 'Could not access parent folder');
            break;
        }
    }
    
    return path;
};

/**
 * Download a file from Google Drive
 * Returns a readable stream
 */
export const downloadFile = async (
    connectionId: string,
    fileId: string
): Promise<{ stream: Readable; mimeType: string; fileName: string; size: string | null }> => {
    const driveClient = await getDriveClient(connectionId);
    
    // First get file metadata
    const fileMeta = await withGoogleApiRetry(
        () => driveClient.files.get({
            fileId,
            fields: 'id, name, mimeType, size',
        }),
        { maxRetries: 3 },
        `downloadFileMeta:${connectionId}`
    );
    
    const mimeType = fileMeta.data.mimeType || 'application/octet-stream';
    let fileName = fileMeta.data.name || 'download';
    let downloadMimeType = mimeType;
    
    logger.info({ connectionId, fileId, mimeType, fileName }, 'Downloading Drive file');
    
    let response;
    
    // Google Docs files need to be exported
    if (isGoogleDocsType(mimeType)) {
        downloadMimeType = getExportMimeType(mimeType);
        fileName = fileName + getExportExtension(mimeType);
        
        response = await withGoogleApiRetry(
            () => driveClient.files.export(
                { fileId, mimeType: downloadMimeType },
                { responseType: 'stream' }
            ),
            { maxRetries: 3 },
            `exportFile:${connectionId}`
        );
    } else {
        response = await withGoogleApiRetry(
            () => driveClient.files.get(
                { fileId, alt: 'media' },
                { responseType: 'stream' }
            ),
            { maxRetries: 3 },
            `downloadFile:${connectionId}`
        );
    }
    
    return {
        stream: response.data as Readable,
        mimeType: downloadMimeType,
        fileName,
        size: fileMeta.data.size || null,
    };
};

/**
 * Upload a file to Google Drive
 */
export const uploadFile = async (
    connectionId: string,
    fileBuffer: Buffer,
    options: UploadOptions
): Promise<DriveFile> => {
    const driveClient = await getDriveClient(connectionId);
    
    const { name, mimeType, folderId = 'root', description } = options;
    
    logger.info({ connectionId, name, mimeType, folderId, size: fileBuffer.length }, 'Uploading file to Drive');
    
    const response = await withGoogleApiRetry(
        () => driveClient.files.create({
            requestBody: {
                name,
                parents: [folderId],
                description,
            },
            media: {
                mimeType,
                body: Readable.from(fileBuffer),
            },
            fields: 'id, name, mimeType, size, webViewLink, webContentLink, modifiedTime, createdTime, parents, iconLink',
        }),
        { maxRetries: 3 },
        `uploadFile:${connectionId}`
    );
    
    logger.info({ connectionId, fileId: response.data.id, name }, 'Successfully uploaded file to Drive');
    
    return transformFile(response.data);
};

/**
 * Create a folder in Google Drive
 */
export const createFolder = async (
    connectionId: string,
    name: string,
    parentId: string = 'root'
): Promise<DriveFile> => {
    const driveClient = await getDriveClient(connectionId);
    
    logger.info({ connectionId, name, parentId }, 'Creating folder in Drive');
    
    const response = await withGoogleApiRetry(
        () => driveClient.files.create({
            requestBody: {
                name,
                mimeType: FOLDER_MIME_TYPE,
                parents: [parentId],
            },
            fields: 'id, name, mimeType, webViewLink, modifiedTime, createdTime, parents, iconLink',
        }),
        { maxRetries: 3 },
        `createFolder:${connectionId}`
    );
    
    logger.info({ connectionId, folderId: response.data.id, name }, 'Successfully created folder in Drive');
    
    return transformFile(response.data);
};

/**
 * Rename a file or folder
 */
export const renameFile = async (
    connectionId: string,
    fileId: string,
    newName: string
): Promise<DriveFile> => {
    const driveClient = await getDriveClient(connectionId);
    
    logger.info({ connectionId, fileId, newName }, 'Renaming Drive file');
    
    const response = await withGoogleApiRetry(
        () => driveClient.files.update({
            fileId,
            requestBody: { name: newName },
            fields: 'id, name, mimeType, modifiedTime, parents, webViewLink',
        }),
        { maxRetries: 3 },
        `renameFile:${connectionId}`
    );
    
    logger.info({ connectionId, fileId, newName }, 'Successfully renamed Drive file');
    
    return transformFile(response.data);
};

/**
 * Move a file to trash (soft delete)
 */
export const trashFile = async (
    connectionId: string,
    fileId: string
): Promise<void> => {
    const driveClient = await getDriveClient(connectionId);
    
    logger.info({ connectionId, fileId }, 'Trashing Drive file');
    
    await withGoogleApiRetry(
        () => driveClient.files.update({
            fileId,
            requestBody: { trashed: true },
        }),
        { maxRetries: 3 },
        `trashFile:${connectionId}`
    );
    
    logger.info({ connectionId, fileId }, 'Successfully trashed Drive file');
};

/**
 * Move a file to a different folder
 */
export const moveFile = async (
    connectionId: string,
    fileId: string,
    newParentId: string,
    currentParentId?: string
): Promise<DriveFile> => {
    const driveClient = await getDriveClient(connectionId);
    
    // If current parent not provided, fetch it
    let removeParents = currentParentId;
    if (!removeParents) {
        const fileMeta = await driveClient.files.get({
            fileId,
            fields: 'parents',
        });
        removeParents = fileMeta.data.parents?.join(',') || '';
    }
    
    logger.info({ connectionId, fileId, newParentId, removeParents }, 'Moving Drive file');
    
    const response = await withGoogleApiRetry(
        () => driveClient.files.update({
            fileId,
            addParents: newParentId,
            removeParents,
            fields: 'id, name, mimeType, modifiedTime, parents, webViewLink',
        }),
        { maxRetries: 3 },
        `moveFile:${connectionId}`
    );
    
    logger.info({ connectionId, fileId, newParentId }, 'Successfully moved Drive file');
    
    return transformFile(response.data);
};

/**
 * Search files across the entire Drive
 */
export const searchFiles = async (
    connectionId: string,
    searchQuery: string,
    pageToken?: string,
    pageSize: number = 50
): Promise<DriveListResponse> => {
    const driveClient = await getDriveClient(connectionId);
    
    // Escape special characters in search query
    const escapedQuery = searchQuery.replace(/'/g, "\\'");
    const q = `name contains '${escapedQuery}' and trashed = false`;
    
    logger.info({ connectionId, searchQuery, pageSize }, 'Searching Drive files');
    
    const response = await withGoogleApiRetry(
        () => driveClient.files.list({
            q,
            fields: 'nextPageToken, files(id, name, mimeType, size, iconLink, thumbnailLink, webViewLink, webContentLink, modifiedTime, createdTime, parents)',
            pageSize: Math.min(pageSize, 100),
            pageToken: pageToken || undefined,
            orderBy: 'modifiedTime desc',
        }),
        { maxRetries: 3 },
        `searchFiles:${connectionId}`
    );
    
    const files = (response.data.files || []).map(transformFile);
    
    logger.info({ connectionId, searchQuery, resultCount: files.length }, 'Searched Drive files');
    
    return {
        files,
        nextPageToken: response.data.nextPageToken || null,
        hasMore: !!response.data.nextPageToken,
    };
};

/**
 * Get storage quota information
 */
export const getStorageQuota = async (
    connectionId: string
): Promise<{ limit: string; usage: string; usageInDrive: string }> => {
    const driveClient = await getDriveClient(connectionId);
    
    const response = await withGoogleApiRetry(
        () => driveClient.about.get({
            fields: 'storageQuota',
        }),
        { maxRetries: 3 },
        `getStorageQuota:${connectionId}`
    );
    
    const quota = response.data.storageQuota;
    
    return {
        limit: quota?.limit || '0',
        usage: quota?.usage || '0',
        usageInDrive: quota?.usageInDrive || '0',
    };
};
