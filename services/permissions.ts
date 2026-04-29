/**
 * Permission Service
 * 
 * Centralized access control for files and folders.
 * Enforces ownership-based and sharing-based permissions.
 */

import { FolderPermission } from '@prisma/client';
import prisma from '../lib/prisma';
import logger from '../utils/logger';

// Permission hierarchy: EDIT > DOWNLOAD > VIEW
const PERMISSION_HIERARCHY: Record<FolderPermission, number> = {
    VIEW: 1,
    DOWNLOAD: 2,
    EDIT: 3
};

export interface AccessResult {
    hasAccess: boolean;
    permission: FolderPermission | null;
    isOwner: boolean;
    canReshare: boolean;
    folderId: string | null;
    sharedById: string | null;
}

/**
 * Check if a user has access to a folder (directly or through parent inheritance)
 */
export async function checkFolderAccess(
    userId: string,
    folderPath: string,
    ownerId: string
): Promise<AccessResult> {
    // Owner always has full access
    if (userId === ownerId) {
        return {
            hasAccess: true,
            permission: FolderPermission.EDIT,
            isOwner: true,
            canReshare: true,
            folderId: null,
            sharedById: null
        };
    }

    try {
        // Find the folder in database
        const folder = await prisma.folder.findFirst({
            where: {
                userId: ownerId,
                path: folderPath
            }
        });

        // Check for direct share on this folder (only if folder exists in DB)
        if (folder) {
            const directShare = await prisma.folderShare.findUnique({
                where: {
                    folderId_sharedWithId: {
                        folderId: folder.id,
                        sharedWithId: userId
                    }
                }
            });

            if (directShare) {
                return {
                    hasAccess: true,
                    permission: directShare.permission,
                    isOwner: false,
                    canReshare: directShare.canReshare,
                    folderId: folder.id,
                    sharedById: directShare.sharedById
                };
            }
        }

        // Check parent folders for inherited permissions
        // This is crucial: even if the target folder doesn't exist in DB,
        // we still need to check if any parent folder is shared
        const pathParts = folderPath.split('/');
        let currentPath = '';
        let inheritedAccess: AccessResult | null = null;

        for (const part of pathParts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            
            // Skip if this is the current folder (already checked above)
            if (currentPath === folderPath) continue;

            const parentFolder = await prisma.folder.findFirst({
                where: {
                    userId: ownerId,
                    path: currentPath
                }
            });

            if (parentFolder) {
                const parentShare = await prisma.folderShare.findUnique({
                    where: {
                        folderId_sharedWithId: {
                            folderId: parentFolder.id,
                            sharedWithId: userId
                        }
                    }
                });

                if (parentShare) {
                    // Found inherited access - keep the highest permission found
                    if (!inheritedAccess || 
                        PERMISSION_HIERARCHY[parentShare.permission] > PERMISSION_HIERARCHY[inheritedAccess.permission!]) {
                        inheritedAccess = {
                            hasAccess: true,
                            permission: parentShare.permission,
                            isOwner: false,
                            canReshare: parentShare.canReshare,
                            folderId: parentFolder.id,
                            sharedById: parentShare.sharedById
                        };
                    }
                }
            }
        }

        if (inheritedAccess) {
            return inheritedAccess;
        }

        // No access found
        return {
            hasAccess: false,
            permission: null,
            isOwner: false,
            canReshare: false,
            folderId: null,
            sharedById: null
        };
    } catch (error) {
        logger.error({ error, userId, folderPath, ownerId }, 'Error checking folder access');
        return {
            hasAccess: false,
            permission: null,
            isOwner: false,
            canReshare: false,
            folderId: null,
            sharedById: null
        };
    }
}

/**
 * Check if a user has access to a file
 */
export async function checkFileAccess(
    userId: string,
    fileId: string,
    ownerId?: string
): Promise<AccessResult> {
    try {
        const file = await prisma.fileAsset.findUnique({
            where: { id: fileId },
            include: {
                user: { select: { id: true } },
                shares: {
                    where: { sharedWithId: userId },
                    select: {
                        id: true,
                        permission: true,
                        canReshare: true,
                        sharedById: true
                    }
                }
            }
        });

        if (!file) {
            return {
                hasAccess: false,
                permission: null,
                isOwner: false,
                canReshare: false,
                folderId: null,
                sharedById: null
            };
        }

        // Owner always has access
        if (file.userId === userId) {
            return {
                hasAccess: true,
                permission: FolderPermission.EDIT,
                isOwner: true,
                canReshare: true,
                folderId: file.folderId,
                sharedById: null
            };
        }

        // Check for direct file share
        if (file.shares && file.shares.length > 0) {
            const share = file.shares[0];
            return {
                hasAccess: true,
                permission: share.permission,
                isOwner: false,
                canReshare: share.canReshare,
                folderId: file.folderId,
                sharedById: share.sharedById
            };
        }

        // Check if file is in a shared folder
        if (file.folder) {
            return await checkFolderAccess(userId, file.folder, file.userId);
        }

        // File is at root level and user is not owner
        return {
            hasAccess: false,
            permission: null,
            isOwner: false,
            canReshare: false,
            folderId: null,
            sharedById: null
        };
    } catch (error) {
        logger.error({ error, userId, fileId }, 'Error checking file access');
        return {
            hasAccess: false,
            permission: null,
            isOwner: false,
            canReshare: false,
            folderId: null,
            sharedById: null
        };
    }
}

/**
 * Check if user has a specific minimum permission level
 */
export function hasMinimumPermission(
    userPermission: FolderPermission | null,
    requiredPermission: FolderPermission
): boolean {
    if (!userPermission) return false;
    return PERMISSION_HIERARCHY[userPermission] >= PERMISSION_HIERARCHY[requiredPermission];
}

/**
 * Get all folders and files shared with a user
 */
export async function getSharedWithMe(userId: string): Promise<{
    folders: Array<{
        id: string;
        name: string;
        path: string;
        permission: FolderPermission;
        canReshare: boolean;
        owner: { id: string; firstName: string; lastName: string | null; email: string | null };
        sharedAt: Date;
    }>;
    files: Array<{
        id: string;
        fileName: string;
        folder: string | null;
        mimeType: string | null;
        size: number;
        permission: FolderPermission;
        canReshare: boolean;
        owner: { id: string; firstName: string; lastName: string | null; email: string | null };
        sharedAt: Date;
    }>;
}> {
    try {
        // Get shared folders
        const folderShares = await prisma.folderShare.findMany({
            where: { sharedWithId: userId },
            include: {
                folder: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Get shared files
        const fileShares = await prisma.fileShare.findMany({
            where: { sharedWithId: userId },
            include: {
                file: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return {
            folders: folderShares.map(share => ({
                id: share.folder.id,
                name: share.folder.name,
                path: share.folder.path,
                permission: share.permission,
                canReshare: share.canReshare,
                owner: share.folder.user,
                sharedAt: share.createdAt
            })),
            files: fileShares.map(share => ({
                id: share.file.id,
                fileName: share.file.fileName,
                folder: share.file.folder,
                mimeType: share.file.mimeType,
                size: Number(share.file.size),
                permission: share.permission,
                canReshare: share.canReshare,
                owner: share.file.user,
                sharedAt: share.createdAt
            }))
        };
    } catch (error) {
        logger.error({ error, userId }, 'Error getting shared items');
        return { folders: [], files: [] };
    }
}

/**
 * Get all shares for a specific folder (for folder owner)
 */
export async function getFolderShares(folderId: string, requestingUserId: string): Promise<{
    shares: Array<{
        id: string;
        user: { id: string; firstName: string; lastName: string | null; email: string | null };
        permission: FolderPermission;
        canReshare: boolean;
        sharedAt: Date;
    }>;
} | null> {
    try {
        const folder = await prisma.folder.findUnique({
            where: { id: folderId }
        });

        if (!folder) return null;

        // Only owner or users with reshare permission can view shares
        if (folder.userId !== requestingUserId) {
            const userAccess = await checkFolderAccess(requestingUserId, folder.path, folder.userId);
            if (!userAccess.canReshare) {
                return null;
            }
        }

        const shares = await prisma.folderShare.findMany({
            where: { folderId },
            include: {
                sharedWith: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return {
            shares: shares.map(share => ({
                id: share.id,
                user: share.sharedWith,
                permission: share.permission,
                canReshare: share.canReshare,
                sharedAt: share.createdAt
            }))
        };
    } catch (error) {
        logger.error({ error, folderId, requestingUserId }, 'Error getting folder shares');
        return null;
    }
}

/**
 * Get or create a Folder record in the database
 * Creates the folder and any missing parent folders
 */
export async function getOrCreateFolder(
    userId: string,
    folderPath: string,
    s3KeyPrefix: string
): Promise<{ id: string; path: string }> {
    // Check if folder exists
    const existing = await prisma.folder.findFirst({
        where: {
            userId,
            path: folderPath
        }
    });

    if (existing) {
        return { id: existing.id, path: existing.path };
    }

    // Create folder and any missing parents
    const pathParts = folderPath.split('/');
    let currentPath = '';
    let parentId: string | null = null;
    let lastFolder: { id: string; path: string } | null = null;

    for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const currentS3Key = `${userId}/${currentPath}/`;

        const existingPart = await prisma.folder.findFirst({
            where: {
                userId,
                path: currentPath
            }
        });

        if (existingPart) {
            parentId = existingPart.id;
            lastFolder = { id: existingPart.id, path: existingPart.path };
        } else {
            const created: { id: string; path: string } = await prisma.folder.create({
                data: {
                    userId,
                    name: part,
                    path: currentPath,
                    parentId,
                    s3Key: currentS3Key
                }
            });
            parentId = created.id;
            lastFolder = { id: created.id, path: created.path };
        }
    }

    if (!lastFolder) {
        throw new Error(`Failed to get or create folder: ${folderPath}`);
    }
    
    return lastFolder;
}

export default {
    checkFolderAccess,
    checkFileAccess,
    hasMinimumPermission,
    getSharedWithMe,
    getFolderShares,
    getOrCreateFolder,
    PERMISSION_HIERARCHY
};
