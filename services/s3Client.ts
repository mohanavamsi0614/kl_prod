/**
 * AWS S3 Client Service
 * 
 * Handles file uploads, downloads, and management with AWS S3.
 * Uses streaming for uploads (no local disk usage).
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as getPresignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import axios from 'axios';
import logger from '../utils/logger';

// Validate required environment variables
const AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const S3_BUCKET = process.env.AWS_S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION;

if (!AWS_ACCESS_KEY || !AWS_SECRET_KEY || !S3_BUCKET || !AWS_REGION) {
    logger.warn('AWS S3 credentials not fully configured. Storage features will be disabled.');
}

// Initialize S3 Client
const s3Client = new S3Client({
    region: AWS_REGION || 'us-east-2',
    credentials: AWS_ACCESS_KEY && AWS_SECRET_KEY ? {
        accessKeyId: AWS_ACCESS_KEY,
        secretAccessKey: AWS_SECRET_KEY
    } : undefined
});

/**
 * Check if S3 is properly configured
 */
export const isS3Configured = (): boolean => {
    return !!(AWS_ACCESS_KEY && AWS_SECRET_KEY && S3_BUCKET && AWS_REGION);
};

/**
 * Get the S3 bucket name
 */
export const getBucketName = (): string => {
    if (!S3_BUCKET) {
        throw new Error('S3 bucket not configured');
    }
    return S3_BUCKET;
};

/**
 * Build S3 key from user ID and folder/filename
 */
export const buildS3Key = (userId: string, folder: string | null, fileName: string): string => {
    const sanitizedFolder = folder ? folder.replace(/^\/+|\/+$/g, '') : null;
    const sanitizedFileName = fileName.replace(/^\/+/, '');
    
    if (sanitizedFolder) {
        return `${userId}/${sanitizedFolder}/${sanitizedFileName}`;
    }
    return `${userId}/${sanitizedFileName}`;
};

/**
 * Build public URL for S3 object
 */
export const buildS3Url = (s3Key: string): string => {
    return `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
};

/**
 * Upload a file buffer to S3
 */
export const uploadBuffer = async (
    s3Key: string,
    buffer: Buffer,
    mimeType: string
): Promise<{ url: string; s3Key: string }> => {
    if (!isS3Configured()) {
        throw new Error('S3 is not configured');
    }

    logger.info({ s3Key, mimeType, size: buffer.length }, 'Uploading buffer to S3');

    const command = new PutObjectCommand({
        Bucket: getBucketName(),
        Key: s3Key,
        Body: buffer,
        ContentType: mimeType
    });

    await s3Client.send(command);

    const url = buildS3Url(s3Key);
    logger.info({ s3Key, url }, 'Successfully uploaded buffer to S3');

    return { url, s3Key };
};

/**
 * Upload a stream to S3 (for large files)
 */
export const uploadStream = async (
    s3Key: string,
    stream: Readable,
    mimeType: string,
    contentLength?: number
): Promise<{ url: string; s3Key: string }> => {
    if (!isS3Configured()) {
        throw new Error('S3 is not configured');
    }

    logger.info({ s3Key, mimeType, contentLength }, 'Uploading stream to S3');

    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket: getBucketName(),
            Key: s3Key,
            Body: stream,
            ContentType: mimeType,
            ContentLength: contentLength
        }
    });

    await upload.done();

    const url = buildS3Url(s3Key);
    logger.info({ s3Key, url }, 'Successfully uploaded stream to S3');

    return { url, s3Key };
};

/**
 * Delete a file from S3
 */
export const deleteObject = async (s3Key: string): Promise<void> => {
    if (!isS3Configured()) {
        throw new Error('S3 is not configured');
    }

    logger.info({ s3Key }, 'Deleting object from S3');

    const command = new DeleteObjectCommand({
        Bucket: getBucketName(),
        Key: s3Key
    });

    await s3Client.send(command);
    logger.info({ s3Key }, 'Successfully deleted object from S3');
};

/**
 * Check if an object exists in S3
 */
export const objectExists = async (s3Key: string): Promise<boolean> => {
    if (!isS3Configured()) {
        return false;
    }

    try {
        const command = new HeadObjectCommand({
            Bucket: getBucketName(),
            Key: s3Key
        });

        await s3Client.send(command);
        return true;
    } catch (error: any) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            return false;
        }
        throw error;
    }
};

/**
 * Create a folder marker in S3 (folders are just prefixes, but we create an empty object)
 */
export const createFolder = async (userId: string, folderPath: string): Promise<string> => {
    if (!isS3Configured()) {
        throw new Error('S3 is not configured');
    }

    // Normalize folder path
    const normalizedPath = folderPath.replace(/^\/+|\/+$/g, '');
    const s3Key = `${userId}/${normalizedPath}/`;

    logger.info({ s3Key }, 'Creating folder in S3');

    const command = new PutObjectCommand({
        Bucket: getBucketName(),
        Key: s3Key,
        Body: ''
    });

    await s3Client.send(command);
    logger.info({ s3Key }, 'Successfully created folder in S3');

    return s3Key;
};

/**
 * Delete a folder and all its contents from S3
 */
export const deleteFolder = async (userId: string, folderPath: string): Promise<{ deletedCount: number }> => {
    if (!isS3Configured()) {
        throw new Error('S3 is not configured');
    }

    // Normalize folder path
    const normalizedPath = folderPath.replace(/^\/+|\/+$/g, '');
    const prefix = `${userId}/${normalizedPath}/`;

    logger.info({ prefix }, 'Deleting folder and contents from S3');

    // List all objects with this prefix
    const listCommand = new ListObjectsV2Command({
        Bucket: getBucketName(),
        Prefix: prefix
    });

    const listResponse = await s3Client.send(listCommand);
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
        // Try to delete just the folder marker if no contents
        try {
            await deleteObject(prefix);
        } catch (error) {
            // Folder marker might not exist, which is fine
        }
        return { deletedCount: 0 };
    }

    // Delete all objects in the folder
    const deletePromises = listResponse.Contents.map(async (object) => {
        if (object.Key) {
            await deleteObject(object.Key);
        }
    });

    await Promise.all(deletePromises);

    logger.info({ prefix, deletedCount: listResponse.Contents.length }, 'Successfully deleted folder and contents from S3');

    return { deletedCount: listResponse.Contents.length };
};

/**
 * Get file stream from S3 for downloading
 */
export const getFileStream = async (s3Key: string): Promise<{
    stream: Readable;
    contentType: string | undefined;
    contentLength: number | undefined;
}> => {
    if (!isS3Configured()) {
        throw new Error('S3 is not configured');
    }

    const command = new GetObjectCommand({
        Bucket: getBucketName(),
        Key: s3Key
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
        throw new Error('No file content returned from S3');
    }

    return {
        stream: response.Body as Readable,
        contentType: response.ContentType,
        contentLength: response.ContentLength
    };
};

/**
 * Get object metadata from S3
 */
export const getObjectMetadata = async (s3Key: string): Promise<{
    contentType: string | undefined;
    contentLength: number | undefined;
    lastModified: Date | undefined;
}> => {
    if (!isS3Configured()) {
        throw new Error('S3 is not configured');
    }

    const command = new HeadObjectCommand({
        Bucket: getBucketName(),
        Key: s3Key
    });

    const response = await s3Client.send(command);

    return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified
    };
};

/**
 * High-level upload function - uploads a file buffer with proper key construction
 */
export const uploadFile = async (
    userId: string,
    buffer: Buffer,
    fileName: string,
    folder?: string | null
): Promise<{ fileName: string; s3Key: string; url: string; mimeType: string; size: number }> => {
    const s3Key = buildS3Key(userId, folder || null, fileName);
    const mimeType = getMimeType(fileName);
    
    const result = await uploadBuffer(s3Key, buffer, mimeType);
    
    return {
        fileName,
        s3Key: result.s3Key,
        url: result.url,
        mimeType,
        size: buffer.length
    };
};

/**
 * Validate URL is not an internal/private address (SSRF protection)
 */
const isValidExternalUrl = (urlString: string): boolean => {
    try {
        const url = new URL(urlString);
        const hostname = url.hostname.toLowerCase();
        
        // Block common internal hostnames
        const blockedHostnames = [
            'localhost',
            '127.0.0.1',
            '0.0.0.0',
            '169.254.169.254', // AWS metadata
            'metadata.google.internal', // GCP metadata
            '10.0.0.0',
            '172.16.0.0',
            '192.168.0.0'
        ];
        
        if (blockedHostnames.some(blocked => hostname === blocked || hostname.startsWith(blocked))) {
            return false;
        }
        
        // Block private IP ranges
        const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        const match = hostname.match(ipv4Regex);
        if (match) {
            const [, a, b, c] = match.map(Number);
            // 10.x.x.x (private)
            if (a === 10) return false;
            // 172.16.x.x - 172.31.x.x (private)
            if (a === 172 && b >= 16 && b <= 31) return false;
            // 192.168.x.x (private)
            if (a === 192 && b === 168) return false;
            // 169.254.x.x (link-local)
            if (a === 169 && b === 254) return false;
            // 127.x.x.x (loopback)
            if (a === 127) return false;
        }
        
        // Only allow http and https protocols
        if (!['http:', 'https:'].includes(url.protocol)) {
            return false;
        }
        
        return true;
    } catch {
        return false;
    }
};

/**
 * Upload a file from an external URL
 */
export const uploadFromUrl = async (
    userId: string,
    sourceUrl: string,
    fileName: string,
    folder?: string | null
): Promise<{ fileName: string; s3Key: string; url: string; mimeType: string; size: number }> => {
    if (!isS3Configured()) {
        throw new Error('S3 is not configured');
    }

    // SSRF protection - validate URL is external and safe
    if (!isValidExternalUrl(sourceUrl)) {
        throw new Error('Invalid URL: Only external public URLs are allowed');
    }

    logger.info({ sourceUrl, fileName, folder }, 'Downloading file from URL');

    // Download file from URL
    const response = await axios.get(sourceUrl, {
        responseType: 'arraybuffer',
        timeout: 60000, // 60 second timeout
        maxContentLength: 50 * 1024 * 1024 // 50MB max
    });

    const buffer = Buffer.from(response.data);
    const mimeType = response.headers['content-type'] || getMimeType(fileName);

    logger.info({ sourceUrl, size: buffer.length, mimeType }, 'Downloaded file, uploading to S3');

    const s3Key = buildS3Key(userId, folder || null, fileName);
    const result = await uploadBuffer(s3Key, buffer, mimeType);

    return {
        fileName,
        s3Key: result.s3Key,
        url: result.url,
        mimeType,
        size: buffer.length
    };
};

/**
 * Delete a file from S3 (alias for deleteObject)
 */
export const deleteFile = deleteObject;

/**
 * Copy a file to a new location in S3
 */
export const copyObject = async (sourceKey: string, destinationKey: string): Promise<void> => {
    if (!isS3Configured()) {
        throw new Error('S3 is not configured');
    }

    const command = new CopyObjectCommand({
        Bucket: getBucketName(),
        CopySource: `${getBucketName()}/${sourceKey}`,
        Key: destinationKey
    });

    await s3Client.send(command);
    logger.info({ sourceKey, destinationKey }, 'S3 object copied');
};

/**
 * Move a file to a new location in S3 (copy + delete)
 */
export const moveObject = async (sourceKey: string, destinationKey: string): Promise<void> => {
    await copyObject(sourceKey, destinationKey);
    await deleteObject(sourceKey);
    logger.info({ sourceKey, destinationKey }, 'S3 object moved');
};

/**
 * Copy a folder and all its contents to a new location
 */
export const copyFolder = async (
    userId: string,
    sourcePath: string,
    destinationPath: string,
    destUserId?: string
): Promise<{ copiedCount: number }> => {
    if (!isS3Configured()) {
        throw new Error('S3 is not configured');
    }

    const bucket = getBucketName();
    const destOwner = destUserId || userId;
    // Include userId in the S3 prefix
    const sourcePrefix = `${userId}/${sourcePath}${sourcePath.endsWith('/') ? '' : '/'}`;
    
    // List all objects in the source folder
    let continuationToken: string | undefined;
    let copiedCount = 0;
    
    do {
        const listCommand = new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: sourcePrefix,
            ContinuationToken: continuationToken
        });

        const response = await s3Client.send(listCommand);
        
        if (response.Contents) {
            for (const object of response.Contents) {
                if (object.Key) {
                    // Calculate new key by replacing source prefix with destination
                    const relativePath = object.Key.substring(sourcePrefix.length);
                    const folderName = sourcePath.split('/').pop() || '';
                    // Build destination key with destOwner prefix
                    const destBase = destinationPath ? `${destOwner}/${destinationPath}` : destOwner;
                    const newKey = `${destBase}/${folderName}/${relativePath}`;
                    
                    await copyObject(object.Key, newKey);
                    copiedCount++;
                }
            }
        }
        
        continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    logger.info({ sourcePath, destinationPath, copiedCount }, 'Folder copied in S3');
    return { copiedCount };
};

/**
 * Move a folder and all its contents to a new location
 */
export const moveFolder = async (
    userId: string,
    sourcePath: string,
    destinationPath: string,
    destUserId?: string
): Promise<{ movedCount: number }> => {
    const result = await copyFolder(userId, sourcePath, destinationPath, destUserId);
    await deleteFolder(userId, sourcePath);
    logger.info({ sourcePath, destinationPath, movedCount: result.copiedCount }, 'Folder moved in S3');
    return { movedCount: result.copiedCount };
};

/**
 * Get a signed URL for temporary access to a file
 */
export const getSignedUrl = async (s3Key: string, expiresInSeconds: number = 3600): Promise<string> => {
    if (!isS3Configured()) {
        throw new Error('S3 is not configured');
    }

    const command = new GetObjectCommand({
        Bucket: getBucketName(),
        Key: s3Key
    });

    const signedUrl = await getPresignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
    return signedUrl;
};

/**
 * List files in a user's storage (optionally filtered by folder)
 */
export const listFiles = async (
    userId: string,
    folder?: string | null
): Promise<Array<{ key: string; size: number; lastModified: Date | undefined }>> => {
    if (!isS3Configured()) {
        throw new Error('S3 is not configured');
    }

    const prefix = folder ? `${userId}/${folder}/` : `${userId}/`;

    const command = new ListObjectsV2Command({
        Bucket: getBucketName(),
        Prefix: prefix
    });

    const response = await s3Client.send(command);

    return (response.Contents || []).map(item => ({
        key: item.Key || '',
        size: item.Size || 0,
        lastModified: item.LastModified
    }));
};

/**
 * List folders in a user's storage using S3 CommonPrefixes (Delimiter approach)
 */
export const listFolders = async (
    userId: string,
    parentFolder?: string | null
): Promise<string[]> => {
    if (!isS3Configured()) {
        throw new Error('S3 is not configured');
    }

    const prefix = parentFolder ? `${userId}/${parentFolder}/` : `${userId}/`;

    const command = new ListObjectsV2Command({
        Bucket: getBucketName(),
        Prefix: prefix,
        Delimiter: '/' // This makes S3 return folder prefixes in CommonPrefixes
    });

    const response = await s3Client.send(command);

    // Extract folder names from CommonPrefixes
    const folders = (response.CommonPrefixes || []).map(prefix => {
        // prefix.Prefix is like "userId/folderName/" - extract just the folder name
        const fullPath = prefix.Prefix || '';
        const relativePath = fullPath.replace(`${userId}/`, '').replace(/\/$/, '');
        // If we're in a parent folder, get just the immediate subfolder name
        if (parentFolder) {
            return relativePath.replace(`${parentFolder}/`, '');
        }
        // At root level, return the top-level folder name
        return relativePath.split('/')[0];
    }).filter(name => name.length > 0);

    return [...new Set(folders)]; // Remove duplicates
};

/**
 * Helper function to get MIME type from file extension
 */
const getMimeType = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'csv': 'text/csv',
        'json': 'application/json',
        'xml': 'application/xml',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        'tar': 'application/x-tar',
        'gz': 'application/gzip',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'svg': 'image/svg+xml',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'ts': 'application/typescript'
    };
    return mimeTypes[ext] || 'application/octet-stream';
};

export default {
    isS3Configured,
    getBucketName,
    buildS3Key,
    buildS3Url,
    uploadBuffer,
    uploadStream,
    deleteObject,
    objectExists,
    createFolder,
    deleteFolder,
    getObjectMetadata,
    getFileStream,
    uploadFile,
    uploadFromUrl,
    deleteFile,
    getSignedUrl,
    listFiles,
    listFolders
};
