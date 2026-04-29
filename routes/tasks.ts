import express from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { TokenRevokedError, InsufficientScopesError, TokenManager } from '../services/TokenManager';
import {
    fetchTaskLists,
    fetchTasks,
    createGoogleTask,
    updateGoogleTask,
    deleteGoogleTask,
    createTaskList as createGoogleTaskList,
    updateTaskList as updateGoogleTaskList,
    deleteTaskList as deleteGoogleTaskList
} from '../services/googleTasksClient';
import {
    createRecurringTaskEvent,
    updateRecurringTaskEvent,
    deleteRecurringTaskEvent,
    fetchRecurringTaskEvents,
    calendarEventToTask
} from '../services/googleCalendarClient';
import {
    generateRRule,
    parseRRule,
    isValidRRule,
    describeRRule,
    legacyToRRule,
    RRuleOptions
} from '../utils/rrule';
import logger from '../utils/logger';
import prisma from '../lib/prisma';
import { withGoogleApiRetry } from '../utils/googleApiRetry';

const router = express.Router();

router.use(requireAuth);

// Helper to parse composite IDs
type ParsedId = 
    | { type: 'GOOGLE'; connectionId: string; listId: string; taskId?: string }
    | { type: 'LOCAL'; id: string };

const parseCompositeId = (id: string): ParsedId => {
    if (id.startsWith('G:')) {
        const parts = id.split(':');
        // Format: G:connectionId:resourceId OR G:connectionId:listId:taskId
        if (parts.length >= 3) {
            return {
                type: 'GOOGLE',
                connectionId: parts[1],
                listId: parts[2],
                taskId: parts[3] // Optional
            };
        }
    }
    return { type: 'LOCAL', id };
};

// Helper to serialize metadata into notes
const serializeMetadata = (notes: string | undefined | null, metadata: any) => {
    let content = notes || '';
    
    if (metadata.reminderTime || metadata.recurrenceInterval || metadata.reminderMethod) {
        content += '\n\n--- Productivity Details ---';
        
        if (metadata.reminderTime) {
            // Format: YYYY-MM-DD HH:mm UTC
            const date = new Date(metadata.reminderTime);
            const dateStr = date.toISOString().replace('T', ' ').substring(0, 16);
            content += `\nReminder: ${dateStr} UTC`;
        }
        
        if (metadata.recurrenceInterval) {
            content += `\nRecurrence: ${metadata.recurrenceInterval}`;
        }
        
        if (metadata.reminderMethod) {
            content += `\nMethod: ${metadata.reminderMethod}`;
        }
    }
    
    return content;
};

// Helper to deserialize metadata from notes
const deserializeMetadata = (notes: string | undefined | null) => {
    if (!notes) return { cleanNotes: '', metadata: {} };
    
    const metadata: any = {};
    let cleanNotes = notes;
    
    // 1. Try parsing the new text format
    const sectionMarker = '--- Productivity Details ---';
    const sectionIndex = notes.indexOf(sectionMarker);
    
    if (sectionIndex !== -1) {
        cleanNotes = notes.substring(0, sectionIndex).trim();
        const metaSection = notes.substring(sectionIndex);
        
        // Parse Reminder
        const reminderMatch = metaSection.match(/Reminder: ([\d-]{10} [\d:]{5}) UTC/);
        if (reminderMatch) {
            try {
                metadata.reminderTime = new Date(reminderMatch[1].replace(' ', 'T') + ':00.000Z').toISOString();
            } catch (e) {}
        }
        
        // Parse Recurrence
        const recurrenceMatch = metaSection.match(/Recurrence: (\w+)/);
        if (recurrenceMatch) {
            metadata.recurrenceInterval = recurrenceMatch[1];
        }
        
        // Parse Method
        const methodMatch = metaSection.match(/Method: (\w+)/);
        if (methodMatch) {
            metadata.reminderMethod = methodMatch[1];
        }
        
        return { cleanNotes, metadata };
    }
    
    // 2. Fallback: Try parsing the old JSON format
    const jsonMatch = notes.match(/\[Productivity: (.*?)\]$/s);
    if (jsonMatch) {
        try {
            const jsonMeta = JSON.parse(jsonMatch[1]);
            cleanNotes = notes.replace(jsonMatch[0], '').trim();
            return { cleanNotes, metadata: jsonMeta };
        } catch (e) {
            // ignore
        }
    }
    
    return { cleanNotes, metadata };
};

// ==================== TASK LISTS ====================

/**
 * GET /api/tasks/lists - Get all task lists (local + Google)
 */
router.get('/lists', async (req: AuthRequest, res) => {
    const userId = req.user!.id;

    try {
        // 1. Get local task lists
        let localLists = await prisma.taskList.findMany({
            where: { userId },
            include: {
                _count: {
                    select: { tasks: true }
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        // Ensure a default "Productivity" list exists for local tasks
        const hasDefaultList = localLists.some(list => list.name === 'Productivity' && !list.connectionId);
        if (!hasDefaultList) {
            const defaultList = await prisma.taskList.create({
                data: {
                    userId,
                    name: 'Productivity',
                    color: 'bg-Productivity-500'
                },
                include: {
                    _count: {
                        select: { tasks: true }
                    }
                }
            });
            localLists = [defaultList, ...localLists];
            logger.info({ userId }, 'Created default Productivity list for user');
        }

        const mappedLocalLists = localLists.map(list => ({
            id: list.id,
            name: list.name,
            color: list.color,
            source: 'LOCAL'
        }));

        // 2. Get Google task lists
        const connections = await prisma.serviceToken.findMany({
            where: { userId, service: 'TASKS' }
        });

        let googleLists: any[] = [];
        
        await Promise.all(connections.map(async (conn) => {
            try {
                const lists = await withGoogleApiRetry(
                    () => fetchTaskLists(conn.id),
                    { maxRetries: 2 },
                    `tasks.lists:${conn.id}`
                );
                
                const mapped = lists.map(list => ({
                    id: `G:${conn.id}:${list.id}`,
                    name: list.title || 'Untitled List',
                    color: 'bg-blue-500', // Default color for Google lists
                    source: 'GOOGLE',
                    connectionId: conn.id,
                    googleListId: list.id
                }));
                
                googleLists.push(...mapped);
            } catch (error) {
                logger.warn({ error, connectionId: conn.id }, 'Failed to fetch Google lists');
            }
        }));

        res.json({ localLists: [...mappedLocalLists, ...googleLists] });
    } catch (error) {
        logger.error({ error, userId }, 'Failed to fetch task lists');
        res.status(500).json({ error: 'Failed to fetch task lists' });
    }
});

/**
 * POST /api/tasks/lists - Create a new task list
 */
router.post('/lists', async (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const { name, color, syncToGoogle, connectionId } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Missing required field: name' });
    }

    try {
        if (syncToGoogle && connectionId) {
            // Create on Google
            const googleList = await createGoogleTaskList(connectionId, name);
            
            res.status(201).json({
                id: `G:${connectionId}:${googleList.id}`,
                name: googleList.title,
                color: color || 'bg-blue-500',
                source: 'GOOGLE',
                connectionId,
                googleListId: googleList.id
            });
        } else {
            // Create local
            const taskList = await prisma.taskList.create({
                data: {
                    userId,
                    name,
                    color: color || 'bg-blue-500'
                }
            });

            res.status(201).json({
                id: taskList.id,
                name: taskList.name,
                color: taskList.color,
                source: 'LOCAL'
            });
        }
    } catch (error) {
        logger.error({ error, userId }, 'Failed to create task list');
        res.status(500).json({ error: 'Failed to create task list' });
    }
});

/**
 * PATCH /api/tasks/lists/:id - Update a task list
 */
router.patch('/lists/:id', async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const { name, color } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Missing required field: name' });
    }

    try {
        const parsed = parseCompositeId(id);

        if (parsed.type === 'GOOGLE') {
            // Update Google Task List
            const { connectionId, listId } = parsed;
            
            const updatedList = await updateGoogleTaskList(connectionId, listId, name);
            
            res.json({
                id,
                name: updatedList.title,
                color: color || 'bg-blue-500',
                source: 'GOOGLE',
                connectionId,
                googleListId: listId
            });
        } else {
            // Update Local Task List
            const taskList = await prisma.taskList.findUnique({ where: { id } });
            
            if (!taskList || taskList.userId !== userId) {
                return res.status(404).json({ error: 'Task list not found' });
            }

            const updatedList = await prisma.taskList.update({
                where: { id },
                data: {
                    name,
                    color: color || taskList.color
                }
            });

            res.json({
                id: updatedList.id,
                name: updatedList.name,
                color: updatedList.color,
                source: 'LOCAL'
            });
        }
    } catch (error) {
        logger.error({ error, userId }, 'Failed to update task list');
        res.status(500).json({ error: 'Failed to update task list' });
    }
});

/**
 * DELETE /api/tasks/lists/:id - Delete a task list
 */
router.delete('/lists/:id', async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
        const parsed = parseCompositeId(id);

        if (parsed.type === 'GOOGLE') {
            // Delete Google Task List
            const { connectionId, listId } = parsed;
            
            await deleteGoogleTaskList(connectionId, listId);
            res.json({ success: true });
        } else {
            // Delete Local Task List
            const taskList = await prisma.taskList.findUnique({ where: { id } });
            
            if (!taskList || taskList.userId !== userId) {
                return res.status(404).json({ error: 'Task list not found' });
            }

            // Delete all tasks in this list first (or set listId to null)
            await prisma.task.updateMany({
                where: { listId: id },
                data: { listId: null }
            });

            await prisma.taskList.delete({ where: { id } });
            res.json({ success: true });
        }
    } catch (error: any) {
        // Handle Google's default list deletion error
        if (error?.code === 400 && error?.message?.includes('default')) {
            return res.status(400).json({ error: 'Cannot delete the default task list' });
        }
        logger.error({ error, userId }, 'Failed to delete task list');
        res.status(500).json({ error: 'Failed to delete task list' });
    }
});

// ==================== TASKS CRUD ====================

/**
 * GET /api/tasks/me - Get all tasks (local + Google)
 */
router.get('/me', async (req: AuthRequest, res) => {
    const userId = req.user!.id;

    try {
        // 1. Fetch ALL Local Tasks (including those synced to Google)
        const localTasks = await prisma.task.findMany({
            where: { userId },
            include: {
                taskList: true
            },
            orderBy: { createdAt: 'desc' }
        });

        // Create a map for quick lookup of synced tasks
        const localTaskMap = new Map();
        localTasks.forEach(task => {
            if (task.googleTaskId) {
                localTaskMap.set(task.googleTaskId, task);
            }
        });

        const mappedLocalTasks = localTasks.map(task => ({
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            source: task.source,
            dueDate: task.dueDate,
            reminderTime: task.reminderTime,
            reminderMethod: task.reminderMethod,
            recurrenceInterval: task.recurrenceInterval,
            // RRULE fields
            rrule: task.rrule,
            isRecurring: task.isRecurring,
            googleCalendarEventId: task.googleCalendarEventId,
            recurringParentId: task.recurringParentId,
            recurrenceEnd: task.recurrenceEnd,
            recurrenceCount: task.recurrenceCount,
            rruleDescription: task.rrule ? describeRRule(task.rrule).summary : null,
            list: task.taskList,
            connectionId: task.connectionId,
            googleTaskId: task.googleTaskId,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt
        }));

        // 2. Fetch Google Tasks
        const connections = await prisma.serviceToken.findMany({
            where: { userId, service: 'TASKS' }
        });

        let googleTasks: any[] = [];

        await Promise.all(connections.map(async (conn) => {
            try {
                // Fetch lists first to know IDs and names
                const lists = await withGoogleApiRetry(
                    () => fetchTaskLists(conn.id),
                    { maxRetries: 2 },
                    `tasks.lists:${conn.id}`
                );

                // Fetch tasks for each list in parallel
                await Promise.all(lists.map(async (list) => {
                    if (!list.id) return;
                    
                    try {
                        const tasks = await withGoogleApiRetry(
                            () => fetchTasks(conn.id, list.id!),
                            { maxRetries: 2 },
                            `tasks.list:${conn.id}:${list.id}`
                        );

                        const mapped = tasks
                            .filter(t => !localTaskMap.has(t.id)) // Filter out tasks we already have locally
                            .map(t => {
                            // Parse Google's due date (RFC 3339)
                            let dueDate = t.due;
                            
                            // Extract metadata from notes (legacy support)
                            const { cleanNotes, metadata } = deserializeMetadata(t.notes);
                            
                            return {
                                id: `G:${conn.id}:${list.id}:${t.id}`,
                                title: t.title || '(No Title)',
                                description: cleanNotes,
                                status: t.status === 'completed' ? 'COMPLETED' : 'PENDING',
                                priority: 'MEDIUM',
                                source: 'GOOGLE',
                                dueDate: dueDate,
                                reminderTime: metadata.reminderTime || null,
                                recurrenceInterval: metadata.recurrenceInterval || null,
                                reminderMethod: metadata.reminderMethod || null,
                                googleTaskId: t.id,
                                connectionId: conn.id,
                                list: {
                                    id: `G:${conn.id}:${list.id}`,
                                    name: list.title,
                                    color: 'bg-blue-500'
                                },
                                updatedAt: t.updated,
                                createdAt: t.updated
                            };
                        });
                        
                        googleTasks.push(...mapped);
                    } catch (err) {
                        logger.warn({ err, listId: list.id }, 'Failed to fetch tasks for list');
                    }
                }));

            } catch (error) {
                logger.warn({ error, connectionId: conn.id }, 'Failed to fetch Google tasks');
            }
        }));

        res.json({
            tasks: [...mappedLocalTasks, ...googleTasks]
        });
    } catch (error) {
        logger.error({ error, userId }, 'Failed to fetch tasks');
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

/**
 * POST /api/tasks - Create a new task
 */
router.post('/', async (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const {
        title,
        description,
        priority,
        dueDate,
        reminderTime,
        reminderMethod,
        recurrenceInterval,
        // RRULE-based recurrence fields
        rrule,
        isRecurring,
        recurrenceEnd,
        recurrenceCount,
        rruleOptions, // For building RRULE from options
        listId,
        syncToGoogle,
        connectionId
    } = req.body;

    if (!title) {
        return res.status(400).json({ error: 'Missing required field: title' });
    }

    // Build RRULE from options if provided
    let finalRRule = rrule;
    if (rruleOptions && !finalRRule) {
        try {
            finalRRule = generateRRule(rruleOptions as RRuleOptions);
        } catch (e) {
            logger.warn({ error: e, rruleOptions }, 'Failed to generate RRULE from options');
        }
    }
    
    // Convert legacy recurrenceInterval to RRULE if no RRULE provided
    if (!finalRRule && recurrenceInterval) {
        finalRRule = legacyToRRule(recurrenceInterval);
    }
    
    // Validate RRULE if provided
    if (finalRRule && !isValidRRule(finalRRule)) {
        return res.status(400).json({ error: 'Invalid RRULE format' });
    }

    const shouldRecur = isRecurring || !!finalRRule;

    try {
        // Check if we should create on Google
        // Either explicit syncToGoogle flag OR listId is a Google List ID
        const isGoogleList = listId && listId.startsWith('G:');
        
        // ==================== GOOGLE TASKS (all tasks - recurring and non-recurring) ====================
        // Note: Google Tasks API doesn't support recurrence, but we store recurrence locally
        // and the task will appear in the Google Tasks section of Calendar
        if (isGoogleList || (syncToGoogle && connectionId)) {
            let targetConnectionId = connectionId;
            let targetListId = '@default';

            if (isGoogleList) {
                const parsed = parseCompositeId(listId);
                if (parsed.type === 'GOOGLE') {
                    targetConnectionId = parsed.connectionId;
                    targetListId = parsed.listId;
                }
            }

            if (!targetConnectionId) {
                return res.status(400).json({ error: 'Missing connection ID for Google Task' });
            }

            // Create on Google first
            const googleTask = await createGoogleTask(targetConnectionId, targetListId, {
                title,
                notes: description, // Send clean description, NO metadata
                due: dueDate ? new Date(dueDate).toISOString() : undefined,
                status: 'needsAction'
            });

            // Create local record linked to Google Task
            const task = await prisma.task.create({
                data: {
                    userId,
                    title,
                    description,
                    priority: priority || 'MEDIUM',
                    dueDate: dueDate ? new Date(dueDate) : null,
                    reminderTime: reminderTime ? new Date(reminderTime) : null,
                    reminderMethod,
                    recurrenceInterval,
                    rrule: finalRRule,
                    isRecurring: shouldRecur,
                    recurrenceEnd: recurrenceEnd ? new Date(recurrenceEnd) : null,
                    recurrenceCount: recurrenceCount || null,
                    source: 'GOOGLE',
                    googleTaskId: googleTask.id,
                    googleListId: targetListId,
                    connectionId: targetConnectionId,
                    status: 'PENDING'
                }
            });

            // Return mapped task
            res.status(201).json({
                id: task.id, // Use local ID
                title: googleTask.title,
                description: description,
                status: 'PENDING',
                priority: 'MEDIUM',
                source: 'GOOGLE',
                dueDate: googleTask.due,
                reminderTime: reminderTime ? new Date(reminderTime).toISOString() : null,
                recurrenceInterval,
                rrule: finalRRule,
                isRecurring: shouldRecur,
                rruleDescription: finalRRule ? describeRRule(finalRRule).summary : null,
                reminderMethod,
                googleTaskId: googleTask.id,
                connectionId: targetConnectionId,
                list: { id: listId || `G:${targetConnectionId}:${targetListId}` },
                updatedAt: googleTask.updated
            });

        } else {
            // ==================== LOCAL TASK ====================
            // If no list is specified, use the default Productivity list
            let targetListId = listId && !listId.startsWith('G:') ? listId : undefined;
            
            if (!targetListId) {
                // Find or create the default Productivity list
                let defaultList = await prisma.taskList.findFirst({
                    where: { userId, name: 'Productivity', connectionId: null }
                });
                
                if (!defaultList) {
                    defaultList = await prisma.taskList.create({
                        data: {
                            userId,
                            name: 'Productivity',
                            color: 'bg-Productivity-500'
                        }
                    });
                }
                
                targetListId = defaultList.id;
            }
            
            const task = await prisma.task.create({
                data: {
                    userId,
                    title,
                    description,
                    priority: priority || 'MEDIUM',
                    dueDate: dueDate ? new Date(dueDate) : null,
                    reminderTime: reminderTime ? new Date(reminderTime) : null,
                    reminderMethod,
                    recurrenceInterval,
                    rrule: finalRRule,
                    isRecurring: shouldRecur,
                    recurrenceEnd: recurrenceEnd ? new Date(recurrenceEnd) : null,
                    recurrenceCount: recurrenceCount || null,
                    listId: targetListId,
                    source: 'LOCAL',
                    status: 'PENDING'
                },
                include: { taskList: true }
            });

            res.status(201).json({
                ...task,
                rruleDescription: finalRRule ? describeRRule(finalRRule).summary : null,
                list: task.taskList
            });
        }
    } catch (error) {
        logger.error({ error, userId }, 'Failed to create task');
        res.status(500).json({ error: 'Failed to create task' });
    }
});

/**
 * PATCH /api/tasks/:id - Update a task
 */
router.patch('/:id', async (req: AuthRequest, res) => {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user!.id;

    try {
        const parsed = parseCompositeId(id);

        if (parsed.type === 'GOOGLE') {
            // Update Google Task
            const { connectionId, listId, taskId } = parsed;
            
            if (!taskId) {
                return res.status(400).json({ error: 'Invalid Google Task ID' });
            }
            
            // Map updates to Google format
            const googleUpdates: any = {};
            if (updates.title !== undefined) googleUpdates.title = updates.title;
            
            // Handle description + metadata update
            if (updates.description !== undefined || updates.reminderTime !== undefined || updates.recurrenceInterval !== undefined || updates.reminderMethod !== undefined) {
                // We need to fetch the existing task first to preserve existing metadata if only description changes, 
                // or preserve description if only metadata changes.
                // However, for simplicity and since we usually have the full state in frontend, we'll assume 'updates' contains what we need or we overwrite.
                // Better approach: If description is updated, use it. If not, we might lose it if we don't fetch.
                // But typically PATCH sends changed fields.
                
                // To do this correctly without fetching, we'd need the current description.
                // Let's assume the frontend sends the current description if it's not changing, OR we fetch.
                // Fetching is safer.
                try {
                    const currentTask = await withGoogleApiRetry(
                        () => fetchTasks(connectionId, listId), // This fetches all, inefficient but simple for now. Ideally fetch single task.
                        { maxRetries: 1 },
                        `tasks.get:${connectionId}:${taskId}`
                    );
                    // Find our task
                    const existing = currentTask.find((t: any) => t.id === taskId);
                    
                    if (existing) {
                        const { cleanNotes, metadata: existingMeta } = deserializeMetadata(existing.notes);
                        
                        const newDescription = updates.description !== undefined ? updates.description : cleanNotes;
                        const newMetadata = {
                            reminderTime: updates.reminderTime !== undefined ? (updates.reminderTime ? new Date(updates.reminderTime).toISOString() : undefined) : existingMeta.reminderTime,
                            recurrenceInterval: updates.recurrenceInterval !== undefined ? updates.recurrenceInterval : existingMeta.recurrenceInterval,
                            reminderMethod: updates.reminderMethod !== undefined ? updates.reminderMethod : existingMeta.reminderMethod
                        };
                        
                        const hasMetadata = newMetadata.reminderTime || newMetadata.recurrenceInterval || newMetadata.reminderMethod;
                        googleUpdates.notes = hasMetadata ? serializeMetadata(newDescription, newMetadata) : newDescription;
                    }
                } catch (e) {
                    // If fetch fails, just use what we have
                    const metadata = {
                        reminderTime: updates.reminderTime ? new Date(updates.reminderTime).toISOString() : undefined,
                        recurrenceInterval: updates.recurrenceInterval,
                        reminderMethod: updates.reminderMethod
                    };
                     const hasMetadata = metadata.reminderTime || metadata.recurrenceInterval || metadata.reminderMethod;
                     if (updates.description !== undefined) {
                         googleUpdates.notes = hasMetadata ? serializeMetadata(updates.description, metadata) : updates.description;
                     }
                }
            }

            if (updates.status !== undefined) googleUpdates.status = updates.status === 'COMPLETED' ? 'completed' : 'needsAction';
            if (updates.dueDate !== undefined) googleUpdates.due = updates.dueDate ? new Date(updates.dueDate).toISOString() : null;

            const updatedTask = await updateGoogleTask(connectionId, listId, taskId, googleUpdates);
            
            // Parse back the result
            const { cleanNotes, metadata } = deserializeMetadata(updatedTask.notes);

            res.json({
                id,
                title: updatedTask.title,
                description: cleanNotes,
                status: updatedTask.status === 'completed' ? 'COMPLETED' : 'PENDING',
                dueDate: updatedTask.due,
                reminderTime: metadata.reminderTime || null,
                recurrenceInterval: metadata.recurrenceInterval || null,
                reminderMethod: metadata.reminderMethod || null,
                updatedAt: updatedTask.updated
            });
        } else {
            // Update Local Task
            const task = await prisma.task.findUnique({ where: { id } });
            if (!task || task.userId !== userId) {
                return res.status(404).json({ error: 'Task not found' });
            }
            
            // Handle RRULE updates
            let newRRule = updates.rrule;
            if (updates.rruleOptions && !newRRule) {
                try {
                    newRRule = generateRRule(updates.rruleOptions as RRuleOptions);
                } catch (e) {
                    logger.warn({ error: e }, 'Failed to generate RRULE from options');
                }
            }
            
            // Convert legacy to RRULE if needed
            if (!newRRule && updates.recurrenceInterval) {
                newRRule = legacyToRRule(updates.recurrenceInterval);
            }
            
            // Validate RRULE if provided
            if (newRRule && !isValidRRule(newRRule)) {
                return res.status(400).json({ error: 'Invalid RRULE format' });
            }
            
            const shouldRecur = updates.isRecurring !== undefined 
                ? updates.isRecurring 
                : (newRRule !== undefined ? !!newRRule : task.isRecurring);
            
            // If task has a Calendar event and RRULE is being updated, update the calendar event
            if (task.googleCalendarEventId && task.connectionId && newRRule !== undefined) {
                try {
                    await updateRecurringTaskEvent(
                        task.connectionId,
                        task.googleCalendarEventId,
                        {
                            title: updates.title || task.title,
                            description: updates.description !== undefined ? updates.description : (task.description || undefined),
                            dueDate: updates.dueDate ? new Date(updates.dueDate) : (task.dueDate || undefined),
                            rrule: newRRule || undefined
                        }
                    );
                    logger.info({ taskId: id }, 'Updated recurring calendar event');
                } catch (calendarError) {
                    logger.warn({ error: calendarError, taskId: id }, 'Failed to update calendar event');
                    // Continue with local update even if calendar update fails
                }
            }

            const updatedTask = await prisma.task.update({
                where: { id },
                data: {
                    title: updates.title,
                    description: updates.description,
                    status: updates.status,
                    priority: updates.priority,
                    dueDate: updates.dueDate ? new Date(updates.dueDate) : updates.dueDate,
                    reminderTime: updates.reminderTime ? new Date(updates.reminderTime) : updates.reminderTime,
                    reminderMethod: updates.reminderMethod,
                    recurrenceInterval: updates.recurrenceInterval,
                    rrule: newRRule,
                    isRecurring: shouldRecur,
                    recurrenceEnd: updates.recurrenceEnd ? new Date(updates.recurrenceEnd) : updates.recurrenceEnd,
                    recurrenceCount: updates.recurrenceCount,
                    listId: updates.listId
                },
                include: { taskList: true }
            });

            res.json({
                ...updatedTask,
                rruleDescription: updatedTask.rrule ? describeRRule(updatedTask.rrule).summary : null,
                list: updatedTask.taskList
            });
        }
    } catch (error) {
        logger.error({ error, id }, 'Failed to update task');
        res.status(500).json({ error: 'Failed to update task' });
    }
});

/**
 * DELETE /api/tasks/:id - Delete a task
 */
router.delete('/:id', async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;
    const deleteScope = (req.query.scope as 'single' | 'all' | 'following') || 'all';

    try {
        const parsed = parseCompositeId(id);

        if (parsed.type === 'GOOGLE') {
            // Delete Google Task
            const { connectionId, listId, taskId } = parsed;
            
            if (!taskId) {
                return res.status(400).json({ error: 'Invalid Google Task ID' });
            }

            await deleteGoogleTask(connectionId, listId, taskId);
            res.json({ success: true });
        } else {
            // Delete Local Task
            const task = await prisma.task.findUnique({ where: { id } });
            if (!task || task.userId !== userId) {
                return res.status(404).json({ error: 'Task not found' });
            }
            
            // If task has a Calendar event, delete it too
            if (task.googleCalendarEventId && task.connectionId) {
                try {
                    await deleteRecurringTaskEvent(
                        task.connectionId,
                        task.googleCalendarEventId,
                        deleteScope
                    );
                    logger.info({ taskId: id, deleteScope }, 'Deleted recurring calendar event');
                } catch (calendarError) {
                    logger.warn({ error: calendarError, taskId: id }, 'Failed to delete calendar event');
                    // Continue with local deletion even if calendar deletion fails
                }
            }

            await prisma.task.delete({ where: { id } });
            res.json({ success: true });
        }
    } catch (error) {
        logger.error({ error, id }, 'Failed to delete task');
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// ==================== RECURRING TASK UTILITIES ====================

/**
 * GET /api/tasks/recurring/instances/:taskId - Get instances of a recurring task
 */
router.get('/recurring/instances/:taskId', async (req: AuthRequest, res) => {
    const { taskId } = req.params;
    const userId = req.user!.id;
    const timeMin = req.query.timeMin as string;
    const timeMax = req.query.timeMax as string;
    
    try {
        const task = await prisma.task.findUnique({ where: { id: taskId } });
        
        if (!task || task.userId !== userId) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        if (!task.googleCalendarEventId || !task.connectionId) {
            // For local recurring tasks without calendar integration,
            // return the task itself with calculated occurrences
            if (task.rrule) {
                const parsed = parseRRule(task.rrule);
                const description = describeRRule(task.rrule);
                
                return res.json({
                    task,
                    rruleDescription: description,
                    instances: [], // Would need rrule.js for proper instance calculation
                    note: 'Local recurring task - sync with Google Calendar to see instances'
                });
            }
            return res.json({ task, instances: [] });
        }
        
        // Fetch instances from Google Calendar
        const { getRecurringEventInstances } = await import('../services/googleCalendarClient');
        
        const instances = await getRecurringEventInstances(
            task.connectionId,
            task.googleCalendarEventId,
            {
                timeMin: timeMin ? new Date(timeMin) : undefined,
                timeMax: timeMax ? new Date(timeMax) : undefined,
                maxResults: 50
            }
        );
        
        const mappedInstances = instances.map(event => ({
            id: event.id,
            title: event.summary,
            startTime: event.start?.dateTime || event.start?.date,
            endTime: event.end?.dateTime || event.end?.date,
            isCompleted: event.extendedProperties?.private?.taskCompleted === 'true',
            htmlLink: event.htmlLink
        }));
        
        res.json({
            task,
            rruleDescription: task.rrule ? describeRRule(task.rrule) : null,
            instances: mappedInstances
        });
    } catch (error) {
        logger.error({ error, taskId }, 'Failed to fetch recurring task instances');
        res.status(500).json({ error: 'Failed to fetch recurring task instances' });
    }
});

/**
 * POST /api/tasks/recurring/complete-instance - Mark a single instance as complete
 */
router.post('/recurring/complete-instance', async (req: AuthRequest, res) => {
    const { taskId, instanceEventId } = req.body;
    const userId = req.user!.id;
    
    if (!taskId || !instanceEventId) {
        return res.status(400).json({ error: 'Missing taskId or instanceEventId' });
    }
    
    try {
        const task = await prisma.task.findUnique({ where: { id: taskId } });
        
        if (!task || task.userId !== userId) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        if (!task.connectionId) {
            return res.status(400).json({ error: 'Task has no Google connection' });
        }
        
        const { markRecurringInstanceComplete } = await import('../services/googleCalendarClient');
        await markRecurringInstanceComplete(task.connectionId, instanceEventId);
        
        res.json({ success: true, message: 'Instance marked as complete' });
    } catch (error) {
        logger.error({ error, taskId, instanceEventId }, 'Failed to complete recurring instance');
        res.status(500).json({ error: 'Failed to complete instance' });
    }
});

/**
 * GET /api/tasks/recurring/sync - Sync recurring task events from Google Calendar
 */
router.get('/recurring/sync', async (req: AuthRequest, res) => {
    const userId = req.user!.id;
    const connectionId = req.query.connectionId as string;
    
    if (!connectionId) {
        return res.status(400).json({ error: 'Missing connectionId' });
    }
    
    try {
        // Fetch recurring events from Calendar
        const events = await fetchRecurringTaskEvents(connectionId, {
            timeMin: new Date(),
            timeMax: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            includeCompleted: true
        });
        
        // Map calendar events to task format
        const mappedEvents = events.map(event => ({
            ...calendarEventToTask(event),
            connectionId,
            source: 'GOOGLE'
        }));
        
        res.json({
            events: mappedEvents,
            count: mappedEvents.length,
            syncedAt: new Date().toISOString()
        });
    } catch (error) {
        logger.error({ error, userId, connectionId }, 'Failed to sync recurring events');
        res.status(500).json({ error: 'Failed to sync recurring events' });
    }
});

export default router;

