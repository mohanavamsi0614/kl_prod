import express from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import prisma from '../lib/prisma';
import { getCached, setCached, clearCache, createCacheKey } from '../utils/cache';

const router = express.Router();

router.use(requireAuth);

// GET /api/connections
router.get('/', async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.id;
        const skipCache = req.query.nocache === 'true';
        
        // Create cache key for this user's connections
        const cacheKey = createCacheKey('connections', userId);
        const cached = !skipCache ? getCached(cacheKey) : null;

        if (cached) {
            logger.info({ userId, cached: true }, 'Connections served from cache');
            return res.json(cached);
        }
        
        const connections = await prisma.serviceToken.findMany({
            where: { userId },
            select: {
                id: true,
                service: true,
                accountEmail: true,
                updatedAt: true,
                category: true
            }
        });

        // Cache connections for 60 seconds - they don't change frequently
        setCached(cacheKey, connections, 60);

        res.json(connections);
    } catch (error) {
        logger.error({ error }, 'Failed to fetch connections');
        res.status(500).json({ error: 'Failed to fetch connections' });
    }
});

// PATCH /api/connections/:id
router.patch('/:id', async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { category } = req.body;
    const userId = req.user!.id;

    try {
        const connection = await prisma.serviceToken.findUnique({
            where: { id }
        });

        if (!connection || connection.userId !== userId) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        const updatedConnection = await prisma.serviceToken.update({
            where: { id },
            data: {
                category: category || undefined
            },
            select: {
                id: true,
                service: true,
                accountEmail: true,
                updatedAt: true,
                category: true
            }
        });

        // Invalidate connections cache for this user
        clearCache(`connections:${userId}`);

        res.json(updatedConnection);
    } catch (error) {
        logger.error({ error }, 'Failed to update connection');
        res.status(500).json({ error: 'Failed to update connection' });
    }
});

// DELETE /api/connections/:id
router.delete('/:id', async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
        const connection = await prisma.serviceToken.findUnique({
            where: { id }
        });

        if (!connection || connection.userId !== userId) {
            return res.status(404).json({ error: 'Connection not found' });
        }

        await prisma.serviceToken.delete({
            where: { id }
        });

        // Invalidate connections cache for this user
        clearCache(`connections:${userId}`);
        // Also invalidate specific service caches
        if (connection.service === 'CALENDAR') {
            clearCache(`calendar:events:${id}`);
        } else if (connection.service === 'GMAIL') {
            clearCache(`gmail:emails:${userId}:${id}`);
        }

        res.status(204).send();
    } catch (error) {
        logger.error({ error }, 'Failed to delete connection');
        res.status(500).json({ error: 'Failed to delete connection' });
    }
});

export default router;
