/**
 * Google Drive API Routes
 * 
 * Provides REST endpoints for Google Drive file operations:
 * - List files and folders
 * - Get file metadata
 * - Download files
 * - Upload files
 * - Create folders
 * - Rename files/folders
 * - Delete (trash) files/folders
 * - Move files/folders
 * - Search files
 */

import express, { Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { TokenRevokedError, InsufficientScopesError, TokenManager } from '../services/TokenManager';
import * as driveClient from '../services/googleDriveClient';
import prisma from '../lib/prisma';
import logger from '../utils/logger';

const router = express.Router();

// Configure multer for file uploads with 50MB limit (backend enforcement)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit
    },
});

// Apply auth middleware to all routes
router.use(requireAuth);

/**
 * Middleware to validate Drive connection ownership
 */
const validateDriveConnection = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const connectionId = (req.query.connectionId as string) || (req.body?.connectionId as string);
    const userId = req.user?.id;

    if (!connectionId) {
        return res.status(400).json({
            success: false,
            error: 'Missing required parameter: connectionId',
            code: 'INVALID_REQUEST'
        });
    }

    if (!userId) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required',
            code: 'UNAUTHORIZED'
        });
    }

    try {
        const connection = await prisma.serviceToken.findUnique({
            where: { id: connectionId },
            select: { userId: true, service: true }
        });

        if (!connection) {
            return res.status(404).json({
                success: false,
                error: 'Drive connection not found',
                code: 'NOT_FOUND'
            });
        }

        if (connection.userId !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied to this connection',
                code: 'ACCESS_DENIED'
            });
        }

        if (connection.service !== 'DRIVE') {
            return res.status(400).json({
                success: false,
                error: 'Invalid connection type. Expected DRIVE service.',
                code: 'INVALID_CONNECTION_TYPE'
            });
        }

        // Validate token has required scopes
        await TokenManager.ensureTokenHasScopes(connectionId, 'DRIVE');

        // Attach connectionId to request for downstream handlers
        req.driveConnectionId = connectionId;
        next();
    } catch (error) {
        if (error instanceof TokenRevokedError) {
            return res.status(401).json({
                success: false,
                error: 'Drive connection revoked. Please reconnect.',
                code: 'TOKEN_REVOKED'
            });
        }
        if (error instanceof InsufficientScopesError) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions. Please reconnect your Drive.',
                code: 'SCOPE_REAUTH_REQUIRED',
                missingScopes: error.missingScopes
            });
        }
        logger.error({ error, connectionId, userId }, 'Error validating Drive connection');
        return res.status(500).json({
            success: false,
            error: 'Failed to validate connection',
            code: 'INTERNAL_ERROR'
        });
    }
};

/**
 * GET /api/drive/files
 * List files in a folder
 * Query params: connectionId, folderId, pageToken, pageSize, orderBy
 */
router.get('/files', validateDriveConnection, async (req: AuthRequest, res: Response) => {
    const connectionId = req.driveConnectionId!;
    const folderId = (req.query.folderId as string) || 'root';
    const pageToken = req.query.pageToken as string | undefined;
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize as string) || 50, 1), 100);
    const orderBy = (req.query.orderBy as string) || 'folder,name';

    try {
        // Get files
        const result = await driveClient.listFiles(connectionId, {
            folderId,
            pageToken,
            pageSize,
            orderBy,
        });

        // Get folder path (breadcrumb)
        const breadcrumb = await driveClient.getFolderPath(connectionId, folderId);

        // Get current folder info
        let currentFolder = { id: 'root', name: 'My Drive' };
        if (folderId !== 'root') {
            try {
                const folderMeta = await driveClient.getFile(connectionId, folderId);
                currentFolder = { id: folderMeta.id, name: folderMeta.name };
            } catch (e) {
                // If folder not accessible, use default
            }
        }

        return res.json({
            success: true,
            data: {
                files: result.files,
                nextPageToken: result.nextPageToken,
                hasMore: result.hasMore,
                currentFolder,
                breadcrumb
            }
        });
    } catch (error) {
        return handleDriveError(error, res, connectionId, 'listing files');
    }
});

/**
 * GET /api/drive/files/search
 * Search files across Drive
 * Query params: connectionId, q, pageToken, pageSize
 */
router.get('/files/search', validateDriveConnection, async (req: AuthRequest, res: Response) => {
    const connectionId = req.driveConnectionId!;
    const searchQuery = req.query.q as string;
    const pageToken = req.query.pageToken as string | undefined;
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize as string) || 50, 1), 100);

    if (!searchQuery || searchQuery.trim().length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Search query is required',
            code: 'INVALID_REQUEST'
        });
    }

    try {
        const result = await driveClient.searchFiles(connectionId, searchQuery.trim(), pageToken, pageSize);

        return res.json({
            success: true,
            data: {
                files: result.files,
                nextPageToken: result.nextPageToken,
                hasMore: result.hasMore,
                query: searchQuery
            }
        });
    } catch (error) {
        return handleDriveError(error, res, connectionId, 'searching files');
    }
});

/**
 * GET /api/drive/files/:fileId
 * Get single file metadata
 */
router.get('/files/:fileId', validateDriveConnection, async (req: AuthRequest, res: Response) => {
    const connectionId = req.driveConnectionId!;
    const { fileId } = req.params;

    if (!fileId) {
        return res.status(400).json({
            success: false,
            error: 'File ID is required',
            code: 'INVALID_REQUEST'
        });
    }

    try {
        const file = await driveClient.getFile(connectionId, fileId);

        return res.json({
            success: true,
            data: file
        });
    } catch (error) {
        return handleDriveError(error, res, connectionId, 'getting file');
    }
});

/**
 * GET /api/drive/files/:fileId/download
 * Download a file
 */
router.get('/files/:fileId/download', validateDriveConnection, async (req: AuthRequest, res: Response) => {
    const connectionId = req.driveConnectionId!;
    const { fileId } = req.params;

    if (!fileId) {
        return res.status(400).json({
            success: false,
            error: 'File ID is required',
            code: 'INVALID_REQUEST'
        });
    }

    try {
        const { stream, mimeType, fileName, size } = await driveClient.downloadFile(connectionId, fileId);

        // Set response headers
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        if (size) {
            res.setHeader('Content-Length', size);
        }

        // Pipe the stream to response
        stream.pipe(res);

        // Handle stream errors
        stream.on('error', (error) => {
            logger.error({ error, connectionId, fileId }, 'Error streaming file download');
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to download file',
                    code: 'DOWNLOAD_ERROR'
                });
            }
        });
    } catch (error) {
        return handleDriveError(error, res, connectionId, 'downloading file');
    }
});

/**
 * GET /api/drive/files/:fileId/preview
 * Get file content for in-app preview (supports all file types)
 */
router.get('/files/:fileId/preview', validateDriveConnection, async (req: AuthRequest, res: Response) => {
    const connectionId = req.driveConnectionId!;
    const { fileId } = req.params;

    if (!fileId) {
        return res.status(400).json({
            success: false,
            error: 'File ID is required',
            code: 'INVALID_REQUEST'
        });
    }

    try {
        const { stream, mimeType: contentType, fileName, size } = await driveClient.downloadFile(connectionId, fileId);

        // Set response headers for inline display
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
        if (size) {
            res.setHeader('Content-Length', size);
        }
        // Allow CORS for frontend preview
        res.setHeader('Cache-Control', 'private, max-age=3600');

        // Pipe the stream to response
        stream.pipe(res);

        stream.on('error', (error) => {
            logger.error({ error, connectionId, fileId }, 'Error streaming file preview');
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to preview file',
                    code: 'PREVIEW_ERROR'
                });
            }
        });
    } catch (error) {
        return handleDriveError(error, res, connectionId, 'previewing file');
    }
});

/**
 * POST /api/drive/files/upload
 * Upload a file to Drive
 * Form data: file, connectionId, folderId?, name?
 */
router.post('/files/upload', upload.single('file'), validateDriveConnection, async (req: AuthRequest, res: Response) => {
    const connectionId = req.driveConnectionId!;
    const file = req.file;
    const folderId = req.body.folderId || 'root';
    const customName = req.body.name;

    if (!file) {
        return res.status(400).json({
            success: false,
            error: 'No file provided',
            code: 'INVALID_REQUEST'
        });
    }

    // Backend file size validation (redundant with multer, but explicit)
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_SIZE) {
        return res.status(400).json({
            success: false,
            error: `File size exceeds 50MB limit. File size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`,
            code: 'FILE_TOO_LARGE'
        });
    }

    try {
        const uploadedFile = await driveClient.uploadFile(connectionId, file.buffer, {
            name: customName || file.originalname,
            mimeType: file.mimetype,
            folderId,
        });

        return res.status(201).json({
            success: true,
            data: uploadedFile
        });
    } catch (error) {
        return handleDriveError(error, res, connectionId, 'uploading file');
    }
});

/**
 * POST /api/drive/folders
 * Create a folder in Drive
 * Body: { connectionId, name, parentId? }
 */
router.post('/folders', validateDriveConnection, async (req: AuthRequest, res: Response) => {
    const connectionId = req.driveConnectionId!;
    const { name, parentId = 'root' } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Folder name is required',
            code: 'INVALID_REQUEST'
        });
    }

    // Validate folder name (no special characters that Drive doesn't allow)
    const sanitizedName = name.trim();
    if (sanitizedName.length > 255) {
        return res.status(400).json({
            success: false,
            error: 'Folder name must be 255 characters or less',
            code: 'INVALID_REQUEST'
        });
    }

    try {
        const folder = await driveClient.createFolder(connectionId, sanitizedName, parentId);

        return res.status(201).json({
            success: true,
            data: folder
        });
    } catch (error) {
        return handleDriveError(error, res, connectionId, 'creating folder');
    }
});

/**
 * PATCH /api/drive/files/:fileId
 * Rename a file or folder
 * Body: { connectionId, name }
 */
router.patch('/files/:fileId', validateDriveConnection, async (req: AuthRequest, res: Response) => {
    const connectionId = req.driveConnectionId!;
    const { fileId } = req.params;
    const { name } = req.body;

    if (!fileId) {
        return res.status(400).json({
            success: false,
            error: 'File ID is required',
            code: 'INVALID_REQUEST'
        });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
            success: false,
            error: 'New name is required',
            code: 'INVALID_REQUEST'
        });
    }

    const sanitizedName = name.trim();
    if (sanitizedName.length > 255) {
        return res.status(400).json({
            success: false,
            error: 'Name must be 255 characters or less',
            code: 'INVALID_REQUEST'
        });
    }

    try {
        const updatedFile = await driveClient.renameFile(connectionId, fileId, sanitizedName);

        return res.json({
            success: true,
            data: updatedFile
        });
    } catch (error) {
        return handleDriveError(error, res, connectionId, 'renaming file');
    }
});

/**
 * POST /api/drive/files/:fileId/move
 * Move a file to a different folder
 * Body: { connectionId, newParentId }
 */
router.post('/files/:fileId/move', validateDriveConnection, async (req: AuthRequest, res: Response) => {
    const connectionId = req.driveConnectionId!;
    const { fileId } = req.params;
    const { newParentId } = req.body;

    if (!fileId) {
        return res.status(400).json({
            success: false,
            error: 'File ID is required',
            code: 'INVALID_REQUEST'
        });
    }

    if (!newParentId || typeof newParentId !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'New parent folder ID is required',
            code: 'INVALID_REQUEST'
        });
    }

    try {
        const movedFile = await driveClient.moveFile(connectionId, fileId, newParentId);

        return res.json({
            success: true,
            data: movedFile
        });
    } catch (error) {
        return handleDriveError(error, res, connectionId, 'moving file');
    }
});

/**
 * DELETE /api/drive/files/:fileId
 * Move a file to trash
 * Query params: connectionId
 */
router.delete('/files/:fileId', validateDriveConnection, async (req: AuthRequest, res: Response) => {
    const connectionId = req.driveConnectionId!;
    const { fileId } = req.params;

    if (!fileId) {
        return res.status(400).json({
            success: false,
            error: 'File ID is required',
            code: 'INVALID_REQUEST'
        });
    }

    try {
        await driveClient.trashFile(connectionId, fileId);

        return res.json({
            success: true,
            message: 'File moved to trash'
        });
    } catch (error) {
        return handleDriveError(error, res, connectionId, 'deleting file');
    }
});

/**
 * GET /api/drive/quota
 * Get storage quota information
 * Query params: connectionId
 */
router.get('/quota', validateDriveConnection, async (req: AuthRequest, res: Response) => {
    const connectionId = req.driveConnectionId!;

    try {
        const quota = await driveClient.getStorageQuota(connectionId);

        return res.json({
            success: true,
            data: quota
        });
    } catch (error) {
        return handleDriveError(error, res, connectionId, 'getting quota');
    }
});

/**
 * Handle Drive API errors with consistent error responses
 */
function handleDriveError(error: any, res: Response, connectionId: string, operation: string): Response {
    // Token revoked
    if (error instanceof TokenRevokedError) {
        return res.status(401).json({
            success: false,
            error: 'Drive connection revoked. Please reconnect.',
            code: 'TOKEN_REVOKED'
        });
    }

    // Insufficient scopes
    if (error instanceof InsufficientScopesError) {
        return res.status(403).json({
            success: false,
            error: 'Insufficient permissions. Please reconnect your Drive.',
            code: 'SCOPE_REAUTH_REQUIRED',
            missingScopes: error.missingScopes
        });
    }

    // Google API errors
    const statusCode = error?.code || error?.response?.status;
    const errorMessage = error?.message || error?.response?.data?.error?.message || 'Unknown error';
    const googleErrorReason = error?.response?.data?.error?.errors?.[0]?.reason;

    logger.error({ 
        error: errorMessage, 
        googleErrorReason,
        connectionId, 
        operation, 
        statusCode,
        fullError: error?.response?.data
    }, `Error ${operation}`);

    if (statusCode === 404) {
        return res.status(404).json({
            success: false,
            error: 'File or folder not found',
            code: 'NOT_FOUND'
        });
    }

    if (statusCode === 403) {
        // Check specific reasons for 403
        if (googleErrorReason === 'insufficientPermissions' || googleErrorReason === 'fproductivitydden') {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions. Please reconnect your Drive with proper access.',
                code: 'SCOPE_REAUTH_REQUIRED',
                details: errorMessage
            });
        }
        return res.status(403).json({
            success: false,
            error: 'Access denied to this file or folder',
            code: 'ACCESS_DENIED',
            details: errorMessage
        });
    }

    if (statusCode === 429) {
        return res.status(429).json({
            success: false,
            error: 'Rate limit exceeded. Please try again later.',
            code: 'RATE_LIMITED'
        });
    }

    // Multer file size error
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            error: 'File size exceeds 50MB limit',
            code: 'FILE_TOO_LARGE'
        });
    }

    // Generic error
    return res.status(500).json({
        success: false,
        error: `Failed ${operation}`,
        code: 'INTERNAL_ERROR',
        details: errorMessage
    });
}

export default router;
