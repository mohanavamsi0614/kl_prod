/**
 * Sharing Routes
 * 
 * API endpoints for folder sharing, permission management, and user search.
 */

import express from 'express';
import { FolderPermission } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import logger from '../utils/logger';
import {
    checkFolderAccess,
    checkFileAccess,
    getSharedWithMe,
    getFolderShares,
    getOrCreateFolder,
    hasMinimumPermission
} from '../services/permissions';

const router = express.Router();

// Apply auth middleware to all routes
router.use(requireAuth);

/**
 * GET /api/sharing/shared-with-me
 * Get all folders and files shared with the current user
 */
router.get('/shared-with-me', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    try {
        const result = await getSharedWithMe(userId);

        return res.status(200).json({
            success: true,
            data: {
                folders: result.folders,
                files: result.files
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId }, 'Failed to get shared items');
        return res.status(500).json({
            success: false,
            error: 'Failed to get shared items'
        });
    }
});

/**
 * GET /api/sharing/folder/:folderId/shares
 * Get all shares for a specific folder
 */
router.get('/folder/:folderId/shares', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { folderId } = req.params;

    try {
        const result = await getFolderShares(folderId, userId);

        if (!result) {
            return res.status(404).json({
                success: false,
                error: 'Folder not found or access denied'
            });
        }

        return res.status(200).json({
            success: true,
            data: result.shares
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, folderId }, 'Failed to get folder shares');
        return res.status(500).json({
            success: false,
            error: 'Failed to get folder shares'
        });
    }
});

/**
 * POST /api/sharing/folder/:folderId/share
 * Share a folder with another user
 * Body: { email: string, permission: 'VIEW' | 'DOWNLOAD' | 'EDIT', canReshare?: boolean }
 */
router.post('/folder/:folderId/share', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { folderId } = req.params;
    const { email, permission, canReshare = false } = req.body;

    try {
        // Validate permission
        if (!Object.values(FolderPermission).includes(permission)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid permission. Must be VIEW, DOWNLOAD, or EDIT'
            });
        }

        // Find the folder
        const folder = await prisma.folder.findUnique({
            where: { id: folderId },
            include: { user: { select: { id: true } } }
        });

        if (!folder) {
            return res.status(404).json({
                success: false,
                error: 'Folder not found'
            });
        }

        // Check if user can share this folder
        const access = await checkFolderAccess(userId, folder.path, folder.userId);
        if (!access.isOwner && !access.canReshare) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to share this folder'
            });
        }

        // If user is not owner but can reshare, they can only grant up to their own permission
        if (!access.isOwner && access.permission) {
            const userPermLevel = access.permission;
            const requestedPermLevel = permission as FolderPermission;
            if (!hasMinimumPermission(userPermLevel, requestedPermLevel)) {
                return res.status(403).json({
                    success: false,
                    error: 'You cannot grant higher permissions than you have'
                });
            }
        }

        // Find user to share with
        const targetUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { id: true, firstName: true, lastName: true, email: true }
        });

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found with that email'
            });
        }

        // Cannot share with yourself
        if (targetUser.id === folder.userId) {
            return res.status(400).json({
                success: false,
                error: 'Cannot share folder with the owner'
            });
        }

        // Cannot share with yourself if you're sharing
        if (targetUser.id === userId) {
            return res.status(400).json({
                success: false,
                error: 'Cannot share folder with yourself'
            });
        }

        // Create or update share
        const share = await prisma.folderShare.upsert({
            where: {
                folderId_sharedWithId: {
                    folderId: folder.id,
                    sharedWithId: targetUser.id
                }
            },
            create: {
                folderId: folder.id,
                sharedWithId: targetUser.id,
                sharedById: userId,
                permission: permission as FolderPermission,
                canReshare
            },
            update: {
                permission: permission as FolderPermission,
                canReshare,
                sharedById: userId
            },
            include: {
                sharedWith: {
                    select: { id: true, firstName: true, lastName: true, email: true }
                }
            }
        });

        logger.info({
            userId,
            folderId,
            sharedWith: targetUser.id,
            permission,
            canReshare
        }, 'Folder shared successfully');

        return res.status(201).json({
            success: true,
            data: {
                id: share.id,
                user: share.sharedWith,
                permission: share.permission,
                canReshare: share.canReshare,
                sharedAt: share.createdAt
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, folderId }, 'Failed to share folder');
        return res.status(500).json({
            success: false,
            error: 'Failed to share folder'
        });
    }
});

/**
 * PUT /api/sharing/share/:shareId
 * Update share permissions
 * Body: { permission: 'VIEW' | 'DOWNLOAD' | 'EDIT', canReshare?: boolean }
 */
router.put('/share/:shareId', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { shareId } = req.params;
    const { permission, canReshare } = req.body;

    try {
        // Find the share
        const share = await prisma.folderShare.findUnique({
            where: { id: shareId },
            include: {
                folder: { include: { user: { select: { id: true } } } },
                sharedWith: { select: { id: true, firstName: true, lastName: true, email: true } }
            }
        });

        if (!share) {
            return res.status(404).json({
                success: false,
                error: 'Share not found'
            });
        }

        // Check if user can modify this share
        const access = await checkFolderAccess(userId, share.folder.path, share.folder.userId);
        if (!access.isOwner && !access.canReshare) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to modify this share'
            });
        }

        // Validate permission if provided
        if (permission && !Object.values(FolderPermission).includes(permission)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid permission. Must be VIEW, DOWNLOAD, or EDIT'
            });
        }

        // Update share
        const updated = await prisma.folderShare.update({
            where: { id: shareId },
            data: {
                ...(permission && { permission: permission as FolderPermission }),
                ...(typeof canReshare === 'boolean' && { canReshare })
            },
            include: {
                sharedWith: { select: { id: true, firstName: true, lastName: true, email: true } }
            }
        });

        logger.info({ userId, shareId, permission, canReshare }, 'Share updated successfully');

        return res.status(200).json({
            success: true,
            data: {
                id: updated.id,
                user: updated.sharedWith,
                permission: updated.permission,
                canReshare: updated.canReshare,
                sharedAt: updated.createdAt
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, shareId }, 'Failed to update share');
        return res.status(500).json({
            success: false,
            error: 'Failed to update share'
        });
    }
});

/**
 * DELETE /api/sharing/share/:shareId
 * Revoke a share
 */
router.delete('/share/:shareId', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { shareId } = req.params;

    try {
        // Find the share
        const share = await prisma.folderShare.findUnique({
            where: { id: shareId },
            include: {
                folder: { include: { user: { select: { id: true } } } }
            }
        });

        if (!share) {
            return res.status(404).json({
                success: false,
                error: 'Share not found'
            });
        }

        // Check if user can delete this share
        // Owner can always delete, user with reshare permission can delete, or user removing their own access
        const isOwner = share.folder.userId === userId;
        const isSelf = share.sharedWithId === userId;
        
        if (!isOwner && !isSelf) {
            const access = await checkFolderAccess(userId, share.folder.path, share.folder.userId);
            if (!access.canReshare) {
                return res.status(403).json({
                    success: false,
                    error: 'You do not have permission to revoke this share'
                });
            }
        }

        // Delete share
        await prisma.folderShare.delete({
            where: { id: shareId }
        });

        logger.info({ userId, shareId, folderId: share.folderId }, 'Share revoked successfully');

        return res.status(200).json({
            success: true,
            data: { message: 'Share revoked successfully' }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, shareId }, 'Failed to revoke share');
        return res.status(500).json({
            success: false,
            error: 'Failed to revoke share'
        });
    }
});

/**
 * POST /api/sharing/users/search
 * Search users by email for sharing
 * Body: { q: string }
 */
router.post('/users/search', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const query = (req.body.q as string || '').toLowerCase().trim();

    try {
        if (!query || query.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Search query must be at least 2 characters'
            });
        }

        // Search users by email, excluding current user
        const users = await prisma.user.findMany({
            where: {
                AND: [
                    { id: { not: userId } },
                    { email: { not: null } },
                    {
                        OR: [
                            { email: { contains: query, mode: 'insensitive' } },
                            { firstName: { contains: query, mode: 'insensitive' } },
                            { lastName: { contains: query, mode: 'insensitive' } }
                        ]
                    }
                ]
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
            },
            take: 10
        });

        return res.status(200).json({
            success: true,
            data: users
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, query }, 'Failed to search users');
        return res.status(500).json({
            success: false,
            error: 'Failed to search users'
        });
    }
});

/**
 * POST /api/sharing/folder/by-path
 * Get or create a folder by path (for sharing UI)
 * Body: { path: string }
 */
router.post('/folder/by-path', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { path: folderPath } = req.body;

    try {
        if (!folderPath || typeof folderPath !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Folder path is required'
            });
        }

        const s3KeyPrefix = `${userId}/${folderPath}/`;
        const folder = await getOrCreateFolder(userId, folderPath, s3KeyPrefix);

        // Get shares for this folder
        const shares = await prisma.folderShare.findMany({
            where: { folderId: folder.id },
            include: {
                sharedWith: {
                    select: { id: true, firstName: true, lastName: true, email: true }
                }
            }
        });

        return res.status(200).json({
            success: true,
            data: {
                id: folder.id,
                path: folder.path,
                shares: shares.map(s => ({
                    id: s.id,
                    user: s.sharedWith,
                    permission: s.permission,
                    canReshare: s.canReshare
                }))
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, folderPath }, 'Failed to get folder');
        return res.status(500).json({
            success: false,
            error: 'Failed to get folder'
        });
    }
});

/**
 * GET /api/sharing/folder/:folderId/access
 * Check user's access to a specific folder
 */
router.get('/folder/:folderId/access', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { folderId } = req.params;

    try {
        const folder = await prisma.folder.findUnique({
            where: { id: folderId }
        });

        if (!folder) {
            return res.status(404).json({
                success: false,
                error: 'Folder not found'
            });
        }

        const access = await checkFolderAccess(userId, folder.path, folder.userId);

        return res.status(200).json({
            success: true,
            data: {
                hasAccess: access.hasAccess,
                permission: access.permission,
                isOwner: access.isOwner,
                canReshare: access.canReshare
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, folderId }, 'Failed to check access');
        return res.status(500).json({
            success: false,
            error: 'Failed to check access'
        });
    }
});

/**
 * GET /api/sharing/file/:fileId/shares
 * Get all shares for a specific file
 */
router.get('/file/:fileId/shares', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { fileId } = req.params;

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

        // Check if user has access to this file
        const access = await checkFileAccess(userId, file.id, file.userId);
        if (!access.hasAccess) {
            return res.status(403).json({
                success: false,
                error: 'Access denied'
            });
        }

        // Get all shares for this file
        const shares = await prisma.fileShare.findMany({
            where: { fileId },
            include: {
                sharedWith: {
                    select: { id: true, firstName: true, lastName: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return res.status(200).json({
            success: true,
            data: shares.map(share => ({
                id: share.id,
                user: share.sharedWith,
                permission: share.permission,
                canReshare: share.canReshare,
                sharedAt: share.createdAt
            }))
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, fileId }, 'Failed to get file shares');
        return res.status(500).json({
            success: false,
            error: 'Failed to get file shares'
        });
    }
});

/**
 * POST /api/sharing/file/:fileId/share
 * Share a file with another user
 * Body: { email: string, permission: 'VIEW' | 'DOWNLOAD' | 'EDIT', canReshare?: boolean }
 */
router.post('/file/:fileId/share', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { fileId } = req.params;
    const { email, permission, canReshare = false } = req.body;

    try {
        // Validate permission
        if (!Object.values(FolderPermission).includes(permission)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid permission. Must be VIEW, DOWNLOAD, or EDIT'
            });
        }

        // Find the file
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

        // Check if user can share this file
        const access = await checkFileAccess(userId, file.id, file.userId);
        if (!access.isOwner && !access.canReshare) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to share this file'
            });
        }

        // If user is not owner but can reshare, they can only grant up to their own permission
        if (!access.isOwner && access.permission) {
            const userPermLevel = access.permission;
            const requestedPermLevel = permission as FolderPermission;
            if (!hasMinimumPermission(userPermLevel, requestedPermLevel)) {
                return res.status(403).json({
                    success: false,
                    error: 'You cannot grant higher permissions than you have'
                });
            }
        }

        // Find user to share with
        const targetUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { id: true, firstName: true, lastName: true, email: true }
        });

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found with that email'
            });
        }

        // Cannot share with yourself
        if (targetUser.id === file.userId) {
            return res.status(400).json({
                success: false,
                error: 'Cannot share file with the owner'
            });
        }

        // Cannot share with yourself if you're sharing
        if (targetUser.id === userId) {
            return res.status(400).json({
                success: false,
                error: 'Cannot share file with yourself'
            });
        }

        // Create or update share
        const share = await prisma.fileShare.upsert({
            where: {
                fileId_sharedWithId: {
                    fileId: file.id,
                    sharedWithId: targetUser.id
                }
            },
            create: {
                fileId: file.id,
                sharedWithId: targetUser.id,
                sharedById: userId,
                permission: permission as FolderPermission,
                canReshare
            },
            update: {
                permission: permission as FolderPermission,
                canReshare,
                sharedById: userId
            },
            include: {
                sharedWith: {
                    select: { id: true, firstName: true, lastName: true, email: true }
                }
            }
        });

        logger.info({
            userId,
            fileId,
            sharedWith: targetUser.id,
            permission,
            canReshare
        }, 'File shared successfully');

        return res.status(201).json({
            success: true,
            data: {
                id: share.id,
                user: share.sharedWith,
                permission: share.permission,
                canReshare: share.canReshare,
                sharedAt: share.createdAt
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, fileId }, 'Failed to share file');
        return res.status(500).json({
            success: false,
            error: 'Failed to share file'
        });
    }
});

/**
 * PUT /api/sharing/file-share/:shareId
 * Update file share permissions
 * Body: { permission: 'VIEW' | 'DOWNLOAD' | 'EDIT', canReshare?: boolean }
 */
router.put('/file-share/:shareId', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { shareId } = req.params;
    const { permission, canReshare } = req.body;

    try {
        // Find the share
        const share = await prisma.fileShare.findUnique({
            where: { id: shareId },
            include: {
                file: { include: { user: { select: { id: true } } } },
                sharedWith: { select: { id: true, firstName: true, lastName: true, email: true } }
            }
        });

        if (!share) {
            return res.status(404).json({
                success: false,
                error: 'Share not found'
            });
        }

        // Check if user can modify this share
        const access = await checkFileAccess(userId, share.file.id, share.file.userId);
        if (!access.isOwner && !access.canReshare) {
            return res.status(403).json({
                success: false,
                error: 'You do not have permission to modify this share'
            });
        }

        // Validate permission if provided
        if (permission && !Object.values(FolderPermission).includes(permission)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid permission. Must be VIEW, DOWNLOAD, or EDIT'
            });
        }

        // Update share
        const updated = await prisma.fileShare.update({
            where: { id: shareId },
            data: {
                ...(permission && { permission: permission as FolderPermission }),
                ...(typeof canReshare === 'boolean' && { canReshare })
            },
            include: {
                sharedWith: { select: { id: true, firstName: true, lastName: true, email: true } }
            }
        });

        logger.info({ userId, shareId, permission, canReshare }, 'File share updated successfully');

        return res.status(200).json({
            success: true,
            data: {
                id: updated.id,
                user: updated.sharedWith,
                permission: updated.permission,
                canReshare: updated.canReshare,
                sharedAt: updated.createdAt
            }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, shareId }, 'Failed to update file share');
        return res.status(500).json({
            success: false,
            error: 'Failed to update file share'
        });
    }
});

/**
 * DELETE /api/sharing/file-share/:shareId
 * Revoke a file share
 */
router.delete('/file-share/:shareId', async (req, res) => {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { shareId } = req.params;

    try {
        // Find the share
        const share = await prisma.fileShare.findUnique({
            where: { id: shareId },
            include: {
                file: { include: { user: { select: { id: true } } } }
            }
        });

        if (!share) {
            return res.status(404).json({
                success: false,
                error: 'Share not found'
            });
        }

        // Check if user can delete this share
        // Owner can always delete, user with reshare permission can delete, or user removing their own access
        const isOwner = share.file.userId === userId;
        const isSelf = share.sharedWithId === userId;
        
        if (!isOwner && !isSelf) {
            const access = await checkFileAccess(userId, share.file.id, share.file.userId);
            if (!access.canReshare) {
                return res.status(403).json({
                    success: false,
                    error: 'You do not have permission to revoke this share'
                });
            }
        }

        // Delete share
        await prisma.fileShare.delete({
            where: { id: shareId }
        });

        logger.info({ userId, shareId, fileId: share.fileId }, 'File share revoked successfully');

        return res.status(200).json({
            success: true,
            data: { message: 'File share revoked successfully' }
        });
    } catch (error: any) {
        logger.error({ error: error.message, userId, shareId }, 'Failed to revoke file share');
        return res.status(500).json({
            success: false,
            error: 'Failed to revoke file share'
        });
    }
});

export default router;

