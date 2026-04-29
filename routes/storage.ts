import express from 'express';
import multer from 'multer';
import { FolderPermission } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import {
    uploadFile,
    uploadFromUrl,
    deleteFile,
    deleteFolder,
    listFiles,
    listFolders,
    createFolder,
    getSignedUrl,
    getFileStream,
    copyObject,
    moveObject,
    copyFolder,
    moveFolder,
    buildS3Key
} from '../services/s3Client';
import prisma from '../lib/prisma';
import logger from '../utils/logger';
import {
    checkFolderAccess,
    checkFileAccess,
    hasMinimumPermission,
    getOrCreateFolder
} from '../services/permissions';
import { validateFileName, validateFolderName, validateUploadUrl } from '../utils/validation';

const router = express.Router();

// Configure multer for memory storage (we'll stream to S3)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
});

// Apply auth middleware to all routes
router.use(requireAuth);

/**
 * POST /api/storage/upload-from-url
 * Upload a file from an external URL to S3
 * Body: { url: string, fileName: string, folder?: string }
 */
router.post('/upload-from-url', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    try {
        const { url, fileName, folder } = req.body;

        if (!url || !fileName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: url and fileName are required'
            });
        }

        // Validate URL
        const urlValidation = validateUploadUrl(url);
        if (!urlValidation.isValid) {
            return res.status(400).json({
                success: false,
                error: urlValidation.error
            });
        }

        // Validate filename
        const fileNameValidation = validateFileName(fileName);
        if (!fileNameValidation.isValid) {
            return res.status(400).json({
                success: false,
                error: fileNameValidation.error
            });
        }

        // Validate folder name if provided
        if (folder) {
            const folderParts = folder.split('/');
            for (const part of folderParts) {
                const folderValidation = validateFolderName(part);
                if (!folderValidation.isValid) {
                    return res.status(400).json({
                        success: false,
                        error: folderValidation.error
                    });
                }
            }
        }

        // Upload file from URL to S3
        const result = await uploadFromUrl(userId, url, fileName, folder);

        // Save metadata to database (no URL stored - generate signed URL on demand)
        const fileAsset = await prisma.fileAsset.create({
            data: {
                userId,
                fileName: result.fileName,
                s3Key: result.s3Key,
                folder: folder || null,
                mimeType: result.mimeType,
                size: result.size,
            }
        });

        // Generate signed URL for response
        const signedUrl = await getSignedUrl(result.s3Key);

        logger.info({
            userId,
            fileId: fileAsset.id,
            fileName: result.fileName,
            folder
        }, 'File uploaded from URL successfully');

        return res.status(201).json({
            success: true,
            data: {
                id: fileAsset.id,
                fileName: fileAsset.fileName,
                url: signedUrl,
                folder: fileAsset.folder,
                mimeType: fileAsset.mimeType,
                size: fileAsset.size,
                createdAt: fileAsset.createdAt
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId }, 'Failed to upload file from URL');
        return res.status(500).json({
            success: false,
            error: 'Failed to upload file from URL'
        });
    }
});

/**
 * POST /api/storage/upload
 * Direct file upload via multipart form data
 * Form fields: file (file), folder (optional string)
 */
router.post('/upload', upload.single('file'), async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    try {
        const file = req.file;
        const folder = req.body.folder;

        if (!file) {
            return res.status(400).json({
                success: false,
                error: 'No file provided'
            });
        }

        // Validate filename
        const fileNameValidation = validateFileName(file.originalname);
        if (!fileNameValidation.isValid) {
            return res.status(400).json({
                success: false,
                error: fileNameValidation.error
            });
        }

        // Validate folder name if provided
        if (folder) {
            const folderParts = folder.split('/');
            for (const part of folderParts) {
                const folderValidation = validateFolderName(part);
                if (!folderValidation.isValid) {
                    return res.status(400).json({
                        success: false,
                        error: folderValidation.error
                    });
                }
            }
        }

        // Upload file to S3
        const result = await uploadFile(userId, file.buffer, file.originalname, folder);

        // Save metadata to database (no URL stored - generate signed URL on demand)
        const fileAsset = await prisma.fileAsset.create({
            data: {
                userId,
                fileName: result.fileName,
                s3Key: result.s3Key,
                folder: folder || null,
                mimeType: file.mimetype,
                size: file.size,
            }
        });

        // Generate signed URL for response
        const signedUrl = await getSignedUrl(result.s3Key);

        logger.info({
            userId,
            fileId: fileAsset.id,
            fileName: result.fileName,
            folder
        }, 'File uploaded successfully');

        return res.status(201).json({
            success: true,
            data: {
                id: fileAsset.id,
                fileName: fileAsset.fileName,
                url: signedUrl,
                folder: fileAsset.folder,
                mimeType: fileAsset.mimeType,
                size: fileAsset.size,
                createdAt: fileAsset.createdAt
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId }, 'Failed to upload file');
        return res.status(500).json({
            success: false,
            error: 'Failed to upload file'
        });
    }
});

/**
 * POST /api/storage/folders
 * Create a folder (virtual, just creates a marker in S3)
 * Body: { folder: string, ownerId?: string }
 * If ownerId is provided, creates folder in shared context
 */
router.post('/folders', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    try {
        const { folder, ownerId } = req.body;
        const targetOwnerId = ownerId || userId;

        if (!folder) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: folder'
            });
        }

        // Validate folder name
        const folderParts = folder.split('/');
        for (const part of folderParts) {
            const folderValidation = validateFolderName(part);
            if (!folderValidation.isValid) {
                return res.status(400).json({
                    success: false,
                    error: folderValidation.error
                });
            }
        }

        // Check if folder already exists
        const existingFolder = await prisma.folder.findUnique({
            where: {
                userId_path: {
                    userId: targetOwnerId,
                    path: folder
                }
            }
        });

        if (existingFolder) {
            return res.status(409).json({
                success: false,
                error: 'A folder with this name already exists in this location'
            });
        }

        // If ownerId is provided, check access to parent folder
        if (ownerId && ownerId !== userId) {
            // Get parent folder path
            const parentPath = folderParts.slice(0, -1).join('/');
            if (parentPath) {
                const access = await checkFolderAccess(userId, parentPath, ownerId);
                if (!access.hasAccess || !hasMinimumPermission(access.permission, FolderPermission.EDIT)) {
                    return res.status(403).json({
                        success: false,
                        error: 'You do not have permission to create folders here'
                    });
                }
            } else {
                // Can't create at root of someone else's space
                return res.status(403).json({
                    success: false,
                    error: 'You cannot create folders at the root of another user\'s space'
                });
            }
        }

        // Create folder in S3 under the target owner's space
        await createFolder(targetOwnerId, folder);

        // Create folder record in database
        const s3KeyPrefix = `${targetOwnerId}/${folder}/`;
        await prisma.folder.create({
            data: {
                userId: targetOwnerId,
                name: folderParts[folderParts.length - 1],
                path: folder,
                s3Key: `${targetOwnerId}/${folder}`
            }
        });

        logger.info({ userId, targetOwnerId, folder }, 'Folder created successfully');

        return res.status(201).json({
            success: true,
            data: {
                folder,
                message: 'Folder created successfully'
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId }, 'Failed to create folder');
        return res.status(500).json({
            success: false,
            error: 'Failed to create folder'
        });
    }
});

/**
 * DELETE /api/storage/folders
 * Delete a folder and all its contents
 * Query: { folder: string }
 */
router.delete('/folders', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    try {
        const folder = req.query.folder as string;

        if (!folder) {
            return res.status(400).json({
                success: false,
                error: 'Missing required query parameter: folder'
            });
        }

        // Delete folder and its contents from S3
        const result = await deleteFolder(userId, folder);

        // Also delete any file records in the database for this folder
        const deleted = await prisma.fileAsset.deleteMany({
            where: {
                userId,
                OR: [
                    { folder: folder },
                    { folder: { startsWith: `${folder}/` } }
                ]
            }
        });

        // Delete folder record and all child folders from database
        // This will also cascade delete any FolderShare records
        await prisma.folder.deleteMany({
            where: {
                userId,
                OR: [
                    { path: folder },
                    { path: { startsWith: `${folder}/` } }
                ]
            }
        });

        logger.info({ userId, folder, s3DeletedCount: result.deletedCount, dbDeletedCount: deleted.count }, 'Folder deleted successfully');

        return res.status(200).json({
            success: true,
            data: {
                folder,
                deletedFiles: result.deletedCount,
                message: 'Folder deleted successfully'
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId }, 'Failed to delete folder');
        return res.status(500).json({
            success: false,
            error: 'Failed to delete folder'
        });
    }
});

/**
 * GET /api/storage
 * List all files for the user, optionally filtered by folder
 * Query: { folder?: string }
 */
router.get('/', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    try {
        const folder = req.query.folder as string | undefined;

        // Query database for file metadata
        const whereClause: any = { userId };
        if (folder) {
            // Get files in this specific folder only (exact match)
            whereClause.folder = folder;
        }

        const files = await prisma.fileAsset.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                fileName: true,
                s3Key: true,
                folder: true,
                mimeType: true,
                size: true,
                createdAt: true,
                _count: {
                    select: { shares: true }
                }
            }
        });

        // Generate signed URLs for all files
        const filesWithUrls = await Promise.all(files.map(async (file) => {
            const signedUrl = await getSignedUrl(file.s3Key);
            return {
                id: file.id,
                fileName: file.fileName,
                url: signedUrl,
                folder: file.folder,
                mimeType: file.mimeType,
                size: file.size,
                createdAt: file.createdAt,
                isShared: file._count.shares > 0
            };
        }));

        // List folders directly from S3 using CommonPrefixes (efficient and includes empty folders)
        const s3Folders = await listFolders(userId, folder || null);

        // Get shared folder info to determine which folders are shared
        const sharedFolders = await prisma.folderShare.findMany({
            where: {
                folder: {
                    userId,
                    path: folder 
                        ? { startsWith: folder }
                        : { not: { contains: '/' } }
                }
            },
            select: {
                folder: {
                    select: { path: true, name: true }
                }
            },
            distinct: ['folderId']
        });

        // Create a set of shared folder names for quick lookup
        const sharedFolderNames = new Set<string>();
        sharedFolders.forEach(share => {
            // Extract the folder name at the current level
            const folderPath = share.folder.path;
            if (folder) {
                // If we're in a subfolder, check if the share is exactly at this level
                if (folderPath === `${folder}/${share.folder.name}`) {
                    sharedFolderNames.add(share.folder.name);
                }
            } else {
                // At root, only add root-level shared folders
                if (!folderPath.includes('/')) {
                    sharedFolderNames.add(share.folder.name);
                }
            }
        });

        // Combine folder names with isShared flag
        const foldersWithShareInfo = s3Folders.map(folderName => ({
            name: folderName,
            isShared: sharedFolderNames.has(folderName)
        }));

        logger.info({ userId, folder, fileCount: files.length, folderCount: s3Folders.length }, 'Files and folders listed successfully');

        return res.status(200).json({
            success: true,
            data: {
                files: filesWithUrls,
                folders: s3Folders,
                foldersWithShareInfo
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId }, 'Failed to list files');
        return res.status(500).json({
            success: false,
            error: 'Failed to list files'
        });
    }
});

/**
 * GET /api/storage/:id
 * Get a specific file by ID with a fresh signed URL
 * Supports both owned files and files in shared folders
 */
router.get('/:id', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const fileId = req.params.id;

    try {
        // First find the file (without owner restriction to check sharing)
        const file = await prisma.fileAsset.findUnique({
            where: { id: fileId },
            include: { user: { select: { id: true } } }
        });

        if (!file) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Check if user is the owner
        const isOwner = file.userId === userId;
        
        if (!isOwner) {
            // Check if user has access via folder sharing
            const accessResult = await checkFileAccess(userId, fileId);
            
            if (!accessResult.hasAccess) {
                return res.status(404).json({
                    success: false,
                    error: 'File not found'
                });
            }
        }

        // Generate a fresh signed URL
        const signedUrl = await getSignedUrl(file.s3Key);

        return res.status(200).json({
            success: true,
            data: {
                id: file.id,
                fileName: file.fileName,
                url: signedUrl,
                folder: file.folder,
                mimeType: file.mimeType,
                size: file.size,
                createdAt: file.createdAt
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, fileId }, 'Failed to get file');
        return res.status(500).json({
            success: false,
            error: 'Failed to get file'
        });
    }
});

/**
 * GET /api/storage/:id/download
 * Download a file by ID (streams file through backend to avoid CSP issues)
 * Supports both owned files and files in shared folders
 */
router.get('/:id/download', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const fileId = req.params.id;

    try {
        // First find the file (without owner restriction to check sharing)
        const file = await prisma.fileAsset.findUnique({
            where: { id: fileId },
            include: { user: { select: { id: true } } }
        });

        if (!file) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Check if user is the owner
        const isOwner = file.userId === userId;
        
        if (!isOwner) {
            // Check if user has access via folder sharing (need at least DOWNLOAD permission)
            const accessResult = await checkFileAccess(userId, fileId);
            
            if (!accessResult.hasAccess || !hasMinimumPermission(accessResult.permission, FolderPermission.DOWNLOAD)) {
                return res.status(403).json({
                    success: false,
                    error: 'No download permission for this file'
                });
            }
        }

        // Get file stream from S3
        const { stream, contentType, contentLength } = await getFileStream(file.s3Key);

        // Set headers for download
        res.setHeader('Content-Type', contentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }

        // Pipe the stream to response
        stream.pipe(res);

        stream.on('error', (error) => {
            logger.error({ error: error.message, userId, fileId }, 'Stream error during download');
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to download file'
                });
            }
        });

    } catch (error: any) {
        logger.error({ error: error.message, userId, fileId }, 'Failed to download file');
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                error: 'Failed to download file'
            });
        }
    }
});

/**
 * DELETE /api/storage/:id
 * Delete a file by ID
 * Supports both owned files and shared files with EDIT permission
 */
router.delete('/:id', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const fileId = req.params.id;

    try {
        // Find the file first (without owner restriction to check sharing)
        const file = await prisma.fileAsset.findUnique({
            where: { id: fileId }
        });

        if (!file) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Check if user has delete permission (owner or EDIT permission via sharing)
        const accessResult = await checkFileAccess(userId, fileId, file.userId);
        if (!accessResult.hasAccess || (!accessResult.isOwner && !hasMinimumPermission(accessResult.permission, FolderPermission.EDIT))) {
            return res.status(403).json({
                success: false,
                error: 'No permission to delete this file'
            });
        }

        // Delete from S3
        await deleteFile(file.s3Key);

        // Delete from database
        await prisma.fileAsset.delete({
            where: { id: fileId }
        });

        logger.info({ userId, fileId, fileName: file.fileName, isOwner: accessResult.isOwner }, 'File deleted successfully');

        return res.status(200).json({
            success: true,
            data: {
                message: 'File deleted successfully'
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, fileId }, 'Failed to delete file');
        return res.status(500).json({
            success: false,
            error: 'Failed to delete file'
        });
    }
});

/**
 * GET /api/storage/shared/:ownerId
 * List files in a shared folder (from another user)
 * Query: { folder?: string }
 */
router.get('/shared/:ownerId', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { ownerId } = req.params;
    const folder = req.query.folder as string | undefined;

    try {
        // Verify user has access to this folder
        if (!folder) {
            return res.status(400).json({
                success: false,
                error: 'Folder path is required for shared access'
            });
        }

        const access = await checkFolderAccess(userId, folder, ownerId);
        
        if (!access.hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'Access denied to this folder'
            });
        }

        // Query files in the shared folder
        const files = await prisma.fileAsset.findMany({
            where: {
                userId: ownerId,
                folder: folder
            },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                fileName: true,
                s3Key: true,
                folder: true,
                mimeType: true,
                size: true,
                createdAt: true
            }
        });

        // Generate signed URLs only if user has download permission
        const canDownload = hasMinimumPermission(access.permission, FolderPermission.DOWNLOAD);
        
        const filesWithUrls = await Promise.all(files.map(async (file) => {
            const signedUrl = canDownload ? await getSignedUrl(file.s3Key) : null;
            return {
                id: file.id,
                fileName: file.fileName,
                url: signedUrl,
                folder: file.folder,
                mimeType: file.mimeType,
                size: file.size,
                createdAt: file.createdAt,
                canDownload
            };
        }));

        // List subfolders from S3
        const subfolders = await listFolders(ownerId, folder);

        logger.info({
            userId,
            ownerId,
            folder,
            fileCount: files.length,
            permission: access.permission
        }, 'Shared files listed successfully');

        return res.status(200).json({
            success: true,
            data: {
                files: filesWithUrls,
                folders: subfolders,
                permission: access.permission,
                isOwner: false
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, ownerId, folder }, 'Failed to list shared files');
        return res.status(500).json({
            success: false,
            error: 'Failed to list shared files'
        });
    }
});

/**
 * GET /api/storage/shared/:ownerId/file/:fileId
 * Get a specific shared file by ID
 */
router.get('/shared/:ownerId/file/:fileId', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { ownerId, fileId } = req.params;

    try {
        // Find the file
        const file = await prisma.fileAsset.findUnique({
            where: { id: fileId }
        });

        if (!file) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Check if file belongs to the owner and user has access to it
        if (file.userId !== ownerId) {
            return res.status(404).json({
                success: false,
                error: 'File not found in this folder'
            });
        }

        // Check if user is the owner
        const isOwner = file.userId === userId;
        
        if (!isOwner) {
            // Check if user has access via folder sharing or direct file share
            const accessResult = await checkFileAccess(userId, fileId, ownerId);
            
            if (!accessResult.hasAccess) {
                return res.status(403).json({
                    success: false,
                    error: 'You do not have access to this file'
                });
            }
        }

        // Generate a fresh signed URL
        const signedUrl = await getSignedUrl(file.s3Key);

        return res.status(200).json({
            success: true,
            data: {
                id: file.id,
                fileName: file.fileName,
                url: signedUrl,
                folder: file.folder,
                mimeType: file.mimeType,
                size: file.size,
                createdAt: file.createdAt
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, ownerId, fileId }, 'Failed to get shared file');
        return res.status(500).json({
            success: false,
            error: 'Failed to get shared file'
        });
    }
});

/**
 * GET /api/storage/shared/:ownerId/file/:fileId/download
 * Download a file from a shared folder (streams file through backend to avoid CSP issues)
 */
router.get('/shared/:ownerId/file/:fileId/download', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { ownerId, fileId } = req.params;

    try {
        // Find the file
        const file = await prisma.fileAsset.findUnique({
            where: { id: fileId }
        });

        if (!file) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Check if file belongs to the owner
        if (file.userId !== ownerId) {
            return res.status(404).json({
                success: false,
                error: 'File not found in this folder'
            });
        }

        // Check if user is the owner
        const isOwner = file.userId === userId;
        
        if (!isOwner) {
            // Check if user has access via folder sharing with download permission
            const accessResult = await checkFileAccess(userId, fileId, ownerId);
            
            if (!accessResult.hasAccess || !hasMinimumPermission(accessResult.permission, FolderPermission.DOWNLOAD)) {
                return res.status(403).json({
                    success: false,
                    error: 'You do not have download permission for this file'
                });
            }
        }

        // Get file stream from S3
        const { stream, contentType, contentLength } = await getFileStream(file.s3Key);

        // Set headers for download
        res.setHeader('Content-Type', contentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }

        // Pipe the stream to response
        stream.pipe(res);

        stream.on('error', (error) => {
            logger.error({ error: error.message, userId, ownerId, fileId }, 'Stream error during shared file download');
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to download file'
                });
            } else {
                res.end();
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, ownerId, fileId }, 'Failed to download shared file');
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                error: 'Failed to download file'
            });
        }
    }
});

/**
 * POST /api/storage/shared/:ownerId/upload
 * Upload a file to a shared folder (requires EDIT permission)
 * Form fields: file (file), folder (required string)
 */
router.post('/shared/:ownerId/upload', upload.single('file'), async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { ownerId } = req.params;

    try {
        const file = req.file;
        const folder = req.body.folder;

        if (!file) {
            return res.status(400).json({
                success: false,
                error: 'No file provided'
            });
        }

        if (!folder) {
            return res.status(400).json({
                success: false,
                error: 'Folder path is required for shared uploads'
            });
        }

        // Check edit permission
        const access = await checkFolderAccess(userId, folder, ownerId);
        
        if (!access.hasAccess || !hasMinimumPermission(access.permission, FolderPermission.EDIT)) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to upload to this folder'
            });
        }

        // Upload file to owner's S3 space
        const result = await uploadFile(ownerId, file.buffer, file.originalname, folder);

        // Get or create folder record for the owner
        const s3KeyPrefix = `${ownerId}/${folder}/`;
        const folderRecord = await getOrCreateFolder(ownerId, folder, s3KeyPrefix);

        // Save metadata to database under owner's account
        const fileAsset = await prisma.fileAsset.create({
            data: {
                userId: ownerId,
                fileName: result.fileName,
                s3Key: result.s3Key,
                folderId: folderRecord.id,
                folder: folder,
                mimeType: file.mimetype,
                size: file.size,
            }
        });

        // Generate signed URL for response
        const signedUrl = await getSignedUrl(result.s3Key);

        logger.info({
            userId,
            ownerId,
            fileId: fileAsset.id,
            fileName: result.fileName,
            folder
        }, 'File uploaded to shared folder successfully');

        return res.status(201).json({
            success: true,
            data: {
                id: fileAsset.id,
                fileName: fileAsset.fileName,
                url: signedUrl,
                folder: fileAsset.folder,
                mimeType: fileAsset.mimeType,
                size: fileAsset.size,
                createdAt: fileAsset.createdAt
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, ownerId }, 'Failed to upload to shared folder');
        return res.status(500).json({
            success: false,
            error: 'Failed to upload file'
        });
    }
});

/**
 * POST /api/storage/shared/:ownerId/upload-from-url
 * Upload a file from URL to a shared folder (requires EDIT permission)
 * Body: { url: string, fileName: string, folder: string }
 */
router.post('/shared/:ownerId/upload-from-url', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { ownerId } = req.params;

    try {
        const { url, fileName, folder } = req.body;

        if (!url || !fileName) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: url and fileName are required'
            });
        }

        // Folder is required for shared uploads
        if (!folder) {
            return res.status(400).json({
                success: false,
                error: 'Folder path is required for shared uploads'
            });
        }

        // Check if user has EDIT access to the folder
        const access = await checkFolderAccess(userId, folder, ownerId);
        if (!access.hasAccess || access.permission !== 'EDIT') {
            return res.status(403).json({
                success: false,
                error: 'No edit access to this folder'
            });
        }

        // Validate URL
        const urlValidation = validateUploadUrl(url);
        if (!urlValidation.isValid) {
            return res.status(400).json({
                success: false,
                error: urlValidation.error
            });
        }

        // Validate filename
        const fileNameValidation = validateFileName(fileName);
        if (!fileNameValidation.isValid) {
            return res.status(400).json({
                success: false,
                error: fileNameValidation.error
            });
        }

        // Upload file from URL to S3 under the owner's folder
        const result = await uploadFromUrl(ownerId, url, fileName, folder);

        // Save metadata to database under owner's account
        const fileAsset = await prisma.fileAsset.create({
            data: {
                userId: ownerId,
                fileName: result.fileName,
                s3Key: result.s3Key,
                folder: folder,
                mimeType: result.mimeType,
                size: result.size,
            }
        });

        // Generate signed URL for response
        const signedUrl = await getSignedUrl(result.s3Key);

        logger.info({
            userId,
            ownerId,
            fileId: fileAsset.id,
            fileName: result.fileName,
            folder
        }, 'File uploaded from URL to shared folder successfully');

        return res.status(201).json({
            success: true,
            data: {
                id: fileAsset.id,
                fileName: fileAsset.fileName,
                url: signedUrl,
                folder: fileAsset.folder,
                mimeType: fileAsset.mimeType,
                size: fileAsset.size,
                createdAt: fileAsset.createdAt
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, ownerId }, 'Failed to upload from URL to shared folder');
        return res.status(500).json({
            success: false,
            error: 'Failed to upload file from URL'
        });
    }
});

/**
 * POST /api/storage/shared/:ownerId/folders
 * Create a folder in a shared folder (requires EDIT permission)
 * Body: { folder: string }
 */
router.post('/shared/:ownerId/folders', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { ownerId } = req.params;

    try {
        const { folder } = req.body;

        if (!folder) {
            return res.status(400).json({
                success: false,
                error: 'Folder path is required'
            });
        }

        // Get parent folder path
        const folderParts = folder.split('/');
        const parentPath = folderParts.slice(0, -1).join('/') || folder;

        // Check if user has EDIT access to the parent folder
        const access = await checkFolderAccess(userId, parentPath, ownerId);
        if (!access.hasAccess || access.permission !== 'EDIT') {
            return res.status(403).json({
                success: false,
                error: 'No edit access to create folders here'
            });
        }

        // Validate folder name
        const newFolderName = folderParts[folderParts.length - 1];
        const validation = validateFolderName(newFolderName);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                error: validation.error
            });
        }

        // Check if folder already exists
        const existingFolder = await prisma.folder.findUnique({
            where: {
                userId_path: {
                    userId: ownerId,
                    path: folder
                }
            }
        });

        if (existingFolder) {
            return res.status(409).json({
                success: false,
                error: 'A folder with this name already exists in this location'
            });
        }

        // Create folder in S3 under owner's account
        const s3Key = await createFolder(ownerId, `files/${folder}`);

        // Create folder record in database under owner's account
        await prisma.folder.create({
            data: {
                userId: ownerId,
                name: newFolderName,
                path: folder,
                s3Key
            }
        });

        logger.info({
            userId,
            ownerId,
            folder
        }, 'Created folder in shared context');

        return res.status(201).json({
            success: true,
            data: {
                name: newFolderName,
                path: folder
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, ownerId }, 'Failed to create folder in shared context');
        return res.status(500).json({
            success: false,
            error: 'Failed to create folder'
        });
    }
});

/**
 * DELETE /api/storage/shared/:ownerId/file/:fileId
 * Delete a file from a shared folder (requires EDIT permission)
 */
router.delete('/shared/:ownerId/file/:fileId', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { ownerId, fileId } = req.params;

    try {
        const file = await prisma.fileAsset.findFirst({
            where: {
                id: fileId,
                userId: ownerId
            }
        });

        if (!file) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Check edit permission through file's folder
        const access = await checkFileAccess(userId, fileId);
        
        if (!access.hasAccess || !hasMinimumPermission(access.permission, FolderPermission.EDIT)) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to delete this file'
            });
        }

        // Delete from S3
        await deleteFile(file.s3Key);

        // Delete from database
        await prisma.fileAsset.delete({
            where: { id: fileId }
        });

        logger.info({ userId, ownerId, fileId, fileName: file.fileName }, 'Shared file deleted successfully');

        return res.status(200).json({
            success: true,
            data: {
                message: 'File deleted successfully'
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, ownerId, fileId }, 'Failed to delete shared file');
        return res.status(500).json({
            success: false,
            error: 'Failed to delete file'
        });
    }
});

/**
 * PUT /api/storage/:id/move
 * Move a file to a different folder
 * Body: { targetFolder: string | null }
 */
router.put('/:id/move', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const fileId = req.params.id;
    const { targetFolder } = req.body;

    try {
        // Find the file
        const file = await prisma.fileAsset.findFirst({
            where: {
                id: fileId,
                userId
            }
        });

        if (!file) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Update file's folder in database
        // Note: We're not moving the actual S3 object, just updating the folder reference
        // This is acceptable for our use case where folder is metadata, not actual S3 structure
        
        let folderId: string | null = null;
        if (targetFolder) {
            const s3KeyPrefix = `${userId}/${targetFolder}/`;
            const folderRecord = await getOrCreateFolder(userId, targetFolder, s3KeyPrefix);
            folderId = folderRecord.id;
        }

        const updated = await prisma.fileAsset.update({
            where: { id: fileId },
            data: {
                folder: targetFolder || null,
                folderId
            }
        });

        // Generate fresh signed URL
        const signedUrl = await getSignedUrl(file.s3Key);

        logger.info({ userId, fileId, targetFolder }, 'File moved successfully');

        return res.status(200).json({
            success: true,
            data: {
                id: updated.id,
                fileName: updated.fileName,
                url: signedUrl,
                folder: updated.folder,
                mimeType: updated.mimeType,
                size: updated.size,
                createdAt: updated.createdAt
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, fileId }, 'Failed to move file');
        return res.status(500).json({
            success: false,
            error: 'Failed to move file'
        });
    }
});

/**
 * PUT /api/storage/:id/rename
 * Rename a file
 * Body: { newName: string }
 */
router.put('/:id/rename', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const fileId = req.params.id;
    const { newName } = req.body;

    try {
        if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'New name is required'
            });
        }

        // Validate filename
        const fileNameValidation = validateFileName(newName);
        if (!fileNameValidation.isValid) {
            return res.status(400).json({
                success: false,
                error: fileNameValidation.error
            });
        }

        // Find the file
        const file = await prisma.fileAsset.findFirst({
            where: {
                id: fileId,
                userId
            }
        });

        if (!file) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Update filename in database
        const updated = await prisma.fileAsset.update({
            where: { id: fileId },
            data: {
                fileName: newName.trim()
            }
        });

        // Generate fresh signed URL
        const signedUrl = await getSignedUrl(file.s3Key);

        logger.info({ userId, fileId, newName: updated.fileName }, 'File renamed successfully');

        return res.status(200).json({
            success: true,
            data: {
                id: updated.id,
                fileName: updated.fileName,
                url: signedUrl,
                folder: updated.folder,
                mimeType: updated.mimeType,
                size: updated.size,
                createdAt: updated.createdAt
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, fileId }, 'Failed to rename file');
        return res.status(500).json({
            success: false,
            error: 'Failed to rename file'
        });
    }
});

/**
 * POST /api/storage/search
 * Search files by name with pagination
 * Body: { query: string, folder?: string, page?: number, limit?: number }
 */
router.post('/search', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    try {
        const { query, folder, page = 1, limit = 20 } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Search query is required'
            });
        }

        const searchQuery = query.trim();
        if (searchQuery.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Search query cannot be empty'
            });
        }

        // Sanitize pagination params
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
        const offset = (pageNum - 1) * limitNum;

        // Build where clause
        const whereClause: any = {
            userId,
            fileName: {
                contains: searchQuery,
                mode: 'insensitive'
            }
        };

        // Optionally filter by folder
        if (folder) {
            whereClause.OR = [
                { folder: folder },
                { folder: { startsWith: `${folder}/` } }
            ];
        }

        // Count total results
        const totalCount = await prisma.fileAsset.count({
            where: whereClause
        });

        // Fetch files with pagination
        const files = await prisma.fileAsset.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limitNum,
            select: {
                id: true,
                fileName: true,
                s3Key: true,
                folder: true,
                mimeType: true,
                size: true,
                createdAt: true
            }
        });

        // Generate signed URLs for files
        const filesWithUrls = await Promise.all(files.map(async (file) => {
            const signedUrl = await getSignedUrl(file.s3Key);
            return {
                id: file.id,
                fileName: file.fileName,
                url: signedUrl,
                folder: file.folder,
                mimeType: file.mimeType,
                size: file.size,
                createdAt: file.createdAt
            };
        }));

        const totalPages = Math.ceil(totalCount / limitNum);

        logger.info({ 
            userId, 
            query: searchQuery, 
            folder, 
            resultsCount: files.length,
            page: pageNum,
            totalCount
        }, 'File search completed');

        return res.status(200).json({
            success: true,
            data: {
                files: filesWithUrls,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    totalCount,
                    totalPages,
                    hasMore: pageNum < totalPages
                }
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId }, 'Failed to search files');
        return res.status(500).json({
            success: false,
            error: 'Failed to search files'
        });
    }
});

/**\n * POST /api/storage/copy\n * Copy a file to a destination folder\n * Body: { fileId: string, destinationFolder: string, destinationOwnerId?: string }\n */
router.post('/copy', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    try {
        const { fileId, destinationFolder, destinationOwnerId } = req.body;

        if (!fileId) {
            return res.status(400).json({
                success: false,
                error: 'File ID is required'
            });
        }

        // Find the source file
        const sourceFile = await prisma.fileAsset.findUnique({
            where: { id: fileId }
        });

        if (!sourceFile) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Check access to source file
        const sourceAccess = await checkFileAccess(userId, fileId, sourceFile.userId);
        if (!sourceAccess.hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'Access denied to source file'
            });
        }

        // Check write access to destination folder
        const destFolder = destinationFolder || null;
        // Use provided destinationOwnerId, or default to current user for own folders
        const destOwnerId = destinationOwnerId || userId;
        
        // Check destination folder access if copying to a folder or another user's folder
        if (destFolder || destOwnerId !== userId) {
            const destAccess = await checkFolderAccess(userId, destFolder || '', destOwnerId);
            if (!destAccess.hasAccess || (!destAccess.isOwner && !hasMinimumPermission(destAccess.permission, FolderPermission.EDIT))) {
                return res.status(403).json({
                    success: false,
                    error: 'No write access to destination folder'
                });
            }
        }

        // Build new S3 key - use destination owner's ID
        const targetOwnerId = destOwnerId;
        const newS3Key = buildS3Key(targetOwnerId, destFolder, sourceFile.fileName);

        // Copy file in S3
        await copyObject(sourceFile.s3Key, newS3Key);

        // Create new file asset record - assign to destination owner
        const newFile = await prisma.fileAsset.create({
            data: {
                userId: targetOwnerId,
                fileName: sourceFile.fileName,
                s3Key: newS3Key,
                folder: destFolder,
                mimeType: sourceFile.mimeType,
                size: sourceFile.size
            }
        });

        logger.info({ userId, sourceFileId: fileId, newFileId: newFile.id, destinationFolder, destinationOwnerId: targetOwnerId }, 'File copied successfully');

        return res.status(201).json({
            success: true,
            data: newFile
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId }, 'Failed to copy file');
        return res.status(500).json({
            success: false,
            error: 'Failed to copy file'
        });
    }
});

/**
 * POST /api/storage/move
 * Move a file to a destination folder
 * Body: { fileId: string, destinationFolder: string, destinationOwnerId?: string }
 */
router.post('/move', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    try {
        const { fileId, destinationFolder, destinationOwnerId } = req.body;

        if (!fileId) {
            return res.status(400).json({
                success: false,
                error: 'File ID is required'
            });
        }

        // Find the source file
        const sourceFile = await prisma.fileAsset.findUnique({
            where: { id: fileId }
        });

        if (!sourceFile) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        // Check write access to source file (need EDIT to move)
        const sourceAccess = await checkFileAccess(userId, fileId, sourceFile.userId);
        if (!sourceAccess.hasAccess || (!sourceAccess.isOwner && !hasMinimumPermission(sourceAccess.permission, FolderPermission.EDIT))) {
            return res.status(403).json({
                success: false,
                error: 'No permission to move this file'
            });
        }

        // Check write access to destination folder
        const destFolder = destinationFolder || null;
        // Use provided destinationOwnerId, or default to current user for own folders
        const destOwnerId = destinationOwnerId || userId;
        
        // Check destination folder access if moving to a folder (not root) or if destination is another user's folder
        if (destFolder || destOwnerId !== userId) {
            const destAccess = await checkFolderAccess(userId, destFolder || '', destOwnerId);
            if (!destAccess.hasAccess || (!destAccess.isOwner && !hasMinimumPermission(destAccess.permission, FolderPermission.EDIT))) {
                return res.status(403).json({
                    success: false,
                    error: 'No write access to destination folder'
                });
            }
        }

        // Build new S3 key - use destination owner's ID for the bucket
        const targetOwnerId = destOwnerId;
        const newS3Key = buildS3Key(targetOwnerId, destFolder, sourceFile.fileName);

        // Move file in S3
        await moveObject(sourceFile.s3Key, newS3Key);

        // Update file asset record - update userId if moving to another user's folder
        const updatedFile = await prisma.fileAsset.update({
            where: { id: fileId },
            data: {
                userId: targetOwnerId,
                s3Key: newS3Key,
                folder: destFolder
            }
        });

        logger.info({ userId, fileId, destinationFolder, destinationOwnerId: targetOwnerId }, 'File moved successfully');

        return res.status(200).json({
            success: true,
            data: updatedFile
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId }, 'Failed to move file');
        return res.status(500).json({
            success: false,
            error: 'Failed to move file'
        });
    }
});

/**
 * POST /api/storage/folder/copy
 * Copy a folder to a destination location
 * Body: { sourcePath: string, sourceOwnerId?: string, destinationFolder: string, destinationOwnerId?: string }
 */
router.post('/folder/copy', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    try {
        const { sourcePath, sourceOwnerId: reqSourceOwnerId, destinationFolder, destinationOwnerId } = req.body;

        if (!sourcePath) {
            return res.status(400).json({
                success: false,
                error: 'Source path is required'
            });
        }

        // Use explicit sourceOwnerId from body, fallback to current user (own folders)
        const sourceOwnerId = reqSourceOwnerId || userId;
        
        // For COPY: require READ access on source (VIEW permission is sufficient)
        const sourceAccess = await checkFolderAccess(userId, sourcePath, sourceOwnerId);
        if (!sourceAccess.hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'No read access to source folder'
            });
        }

        // Destination owner defaults to current user
        const destOwnerId = destinationOwnerId || userId;
        const destFolder = destinationFolder || '';
        
        // For COPY: require WRITE access on destination (EDIT permission required)
        if (destOwnerId !== userId) {
            const destAccess = await checkFolderAccess(userId, destFolder, destOwnerId);
            if (!destAccess.hasAccess || !hasMinimumPermission(destAccess.permission, FolderPermission.EDIT)) {
                return res.status(403).json({
                    success: false,
                    error: 'No write access to destination folder'
                });
            }
        }

        // Copy folder in S3
        const result = await copyFolder(sourceOwnerId, sourcePath, destFolder, destOwnerId);

        // Copy database records for files in folder
        const sourcePrefix = sourcePath;
        const filesInFolder = await prisma.fileAsset.findMany({
            where: {
                userId: sourceOwnerId,
                OR: [
                    { folder: sourcePath },
                    { folder: { startsWith: `${sourcePath}/` } }
                ]
            }
        });

        const folderName = sourcePath.split('/').pop() || '';
        for (const file of filesInFolder) {
            const relativeFolder = file.folder?.replace(sourcePath, '') || '';
            const newFolder = destFolder ? `${destFolder}/${folderName}${relativeFolder}` : `${folderName}${relativeFolder}`;
            const newS3Key = buildS3Key(destOwnerId, newFolder, file.fileName);
            
            await prisma.fileAsset.create({
                data: {
                    userId: destOwnerId,
                    fileName: file.fileName,
                    s3Key: newS3Key,
                    folder: newFolder,
                    mimeType: file.mimeType,
                    size: file.size
                }
            });
        }

        logger.info({ userId, sourcePath, destinationFolder, copiedCount: result.copiedCount }, 'Folder copied successfully');

        const resultFolder = destFolder ? `${destFolder}/${folderName}` : folderName;
        return res.status(201).json({
            success: true,
            data: {
                folder: resultFolder,
                message: 'Folder copied successfully',
                copiedCount: result.copiedCount
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId }, 'Failed to copy folder');
        return res.status(500).json({
            success: false,
            error: 'Failed to copy folder'
        });
    }
});

/**
 * POST /api/storage/folder/move
 * Move a folder to a destination location
 * Body: { sourcePath: string, sourceOwnerId?: string, destinationFolder: string, destinationOwnerId?: string }
 */
router.post('/folder/move', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    try {
        const { sourcePath, sourceOwnerId: reqSourceOwnerId, destinationFolder, destinationOwnerId } = req.body;

        if (!sourcePath) {
            return res.status(400).json({
                success: false,
                error: 'Source path is required'
            });
        }

        // Use explicit sourceOwnerId from body, fallback to current user (own folders)
        const sourceOwnerId = reqSourceOwnerId || userId;
        
        // For MOVE: require WRITE access on source (EDIT permission required)
        const sourceAccess = await checkFolderAccess(userId, sourcePath, sourceOwnerId);
        if (!sourceAccess.hasAccess || (!sourceAccess.isOwner && !hasMinimumPermission(sourceAccess.permission, FolderPermission.EDIT))) {
            return res.status(403).json({
                success: false,
                error: 'No write access to source folder'
            });
        }

        // Destination owner defaults to source owner for same-space moves, or current user
        const destOwnerId = destinationOwnerId || sourceOwnerId;
        const destFolder = destinationFolder || '';
        
        // For MOVE: require WRITE access on destination (EDIT permission required)
        if (destOwnerId !== userId) {
            const destAccess = await checkFolderAccess(userId, destFolder, destOwnerId);
            if (!destAccess.hasAccess || !hasMinimumPermission(destAccess.permission, FolderPermission.EDIT)) {
                return res.status(403).json({
                    success: false,
                    error: 'No write access to destination folder'
                });
            }
        }

        // Move folder in S3
        const result = await moveFolder(sourceOwnerId, sourcePath, destFolder, destOwnerId);

        // Update database records for files in folder
        const folderName = sourcePath.split('/').pop() || '';
        const filesInFolder = await prisma.fileAsset.findMany({
            where: {
                userId: sourceOwnerId,
                OR: [
                    { folder: sourcePath },
                    { folder: { startsWith: `${sourcePath}/` } }
                ]
            }
        });

        for (const file of filesInFolder) {
            const relativeFolder = file.folder?.replace(sourcePath, '') || '';
            const newFolder = destFolder ? `${destFolder}/${folderName}${relativeFolder}` : `${folderName}${relativeFolder}`;
            const newS3Key = buildS3Key(destOwnerId, newFolder, file.fileName);
            
            await prisma.fileAsset.update({
                where: { id: file.id },
                data: {
                    userId: destOwnerId,
                    s3Key: newS3Key,
                    folder: newFolder
                }
            });
        }

        // Update folder record if exists
        const folderRecord = await prisma.folder.findFirst({
            where: { path: sourcePath, userId: sourceOwnerId }
        });

        const resultFolder = destFolder ? `${destFolder}/${folderName}` : folderName;
        
        if (folderRecord) {
            await prisma.folder.update({
                where: { id: folderRecord.id },
                data: { 
                    userId: destOwnerId,
                    path: resultFolder 
                }
            });
        }

        logger.info({ userId, sourcePath, destinationFolder, movedCount: result.movedCount }, 'Folder moved successfully');

        return res.status(200).json({
            success: true,
            data: {
                folder: resultFolder,
                message: 'Folder moved successfully',
                movedCount: result.movedCount
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId }, 'Failed to move folder');
        return res.status(500).json({
            success: false,
            error: 'Failed to move folder'
        });
    }
});

export default router;
