import { google, tasks_v1 } from 'googleapis';
import { TokenManager } from './TokenManager';
import logger from '../utils/logger';

/**
 * Initializes a Google Tasks client for the specified connection.
 * Automatically handles token refreshing via TokenManager.
 */
export const getTasksClient = async (connectionId: string): Promise<tasks_v1.Tasks> => {
    try {
        logger.info({ connectionId }, 'getTasksClient: Starting initialization');
        
        const accessToken = await TokenManager.getValidAccessToken(connectionId);
        logger.info({ connectionId }, 'getTasksClient: Retrieved valid access token');

        if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
            logger.error({ connectionId }, 'getTasksClient: Missing Google credentials in environment');
            throw new Error('Google OAuth credentials not configured');
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );

        oauth2Client.setCredentials({ access_token: accessToken });
        logger.info({ connectionId }, 'getTasksClient: OAuth2 client configured');

        const tasksClient = google.tasks({ version: 'v1', auth: oauth2Client });
        logger.info({ connectionId }, 'getTasksClient: Tasks client created successfully');

        return tasksClient;
    } catch (error: any) {
        logger.error({ 
            error, 
            connectionId, 
            errorMessage: error?.message, 
            errorStatus: error?.status 
        }, 'getTasksClient: Initialization failed');
        throw error;
    }
};

/**
 * Fetch all task lists from Google Tasks
 */
export const fetchTaskLists = async (connectionId: string): Promise<tasks_v1.Schema$TaskList[]> => {
    const tasksClient = await getTasksClient(connectionId);
    
    const response = await tasksClient.tasklists.list({
        maxResults: 100
    });
    
    return response.data.items || [];
};

/**
 * Fetch all tasks from a specific task list
 * @param connectionId - The service token connection ID
 * @param taskListId - The Google Task List ID (use '@default' for default list)
 * @param showCompleted - Whether to include completed tasks (default: true)
 * @param showHidden - Whether to include hidden tasks (default: false)
 */
export const fetchTasks = async (
    connectionId: string,
    taskListId: string = '@default',
    showCompleted: boolean = true,
    showHidden: boolean = false
): Promise<tasks_v1.Schema$Task[]> => {
    const tasksClient = await getTasksClient(connectionId);
    
    const allTasks: tasks_v1.Schema$Task[] = [];
    let pageToken: string | undefined;
    
    do {
        const response = await tasksClient.tasks.list({
            tasklist: taskListId,
            maxResults: 100,
            showCompleted,
            showHidden,
            pageToken
        });
        
        if (response.data.items) {
            allTasks.push(...response.data.items);
        }
        
        pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    
    return allTasks;
};

/**
 * Create a new task in Google Tasks
 */
export const createGoogleTask = async (
    connectionId: string,
    taskListId: string,
    task: {
        title: string;
        notes?: string;
        due?: string; // RFC 3339 date (e.g., "2024-12-31T00:00:00.000Z")
        status?: 'needsAction' | 'completed';
    }
): Promise<tasks_v1.Schema$Task> => {
    const tasksClient = await getTasksClient(connectionId);
    
    const response = await tasksClient.tasks.insert({
        tasklist: taskListId,
        requestBody: {
            title: task.title,
            notes: task.notes,
            due: task.due,
            status: task.status || 'needsAction'
        }
    });
    
    return response.data;
};

/**
 * Update an existing task in Google Tasks
 */
export const updateGoogleTask = async (
    connectionId: string,
    taskListId: string,
    taskId: string,
    updates: {
        title?: string;
        notes?: string;
        due?: string | null;
        status?: 'needsAction' | 'completed';
        completed?: string | null; // RFC 3339 timestamp when task was completed
    }
): Promise<tasks_v1.Schema$Task> => {
    const tasksClient = await getTasksClient(connectionId);
    
    // First get the existing task to preserve unchanged fields
    const existingResponse = await tasksClient.tasks.get({
        tasklist: taskListId,
        task: taskId
    });
    
    const existingTask = existingResponse.data;
    
    const response = await tasksClient.tasks.update({
        tasklist: taskListId,
        task: taskId,
        requestBody: {
            ...existingTask,
            title: updates.title !== undefined ? updates.title : existingTask.title,
            notes: updates.notes !== undefined ? updates.notes : existingTask.notes,
            due: updates.due !== undefined ? updates.due : existingTask.due,
            status: updates.status !== undefined ? updates.status : existingTask.status,
            completed: updates.completed !== undefined ? updates.completed : existingTask.completed
        }
    });
    
    return response.data;
};

/**
 * Delete a task from Google Tasks
 */
export const deleteGoogleTask = async (
    connectionId: string,
    taskListId: string,
    taskId: string
): Promise<void> => {
    const tasksClient = await getTasksClient(connectionId);
    
    await tasksClient.tasks.delete({
        tasklist: taskListId,
        task: taskId
    });
};

/**
 * Move a task to a different position or make it a subtask
 */
export const moveGoogleTask = async (
    connectionId: string,
    taskListId: string,
    taskId: string,
    options?: {
        parent?: string; // Make it a subtask of this task
        previous?: string; // Position after this task
    }
): Promise<tasks_v1.Schema$Task> => {
    const tasksClient = await getTasksClient(connectionId);
    
    const response = await tasksClient.tasks.move({
        tasklist: taskListId,
        task: taskId,
        parent: options?.parent,
        previous: options?.previous
    });
    
    return response.data;
};

/**
 * Create a new task list in Google Tasks
 */
export const createTaskList = async (
    connectionId: string,
    title: string
): Promise<tasks_v1.Schema$TaskList> => {
    const tasksClient = await getTasksClient(connectionId);
    
    const response = await tasksClient.tasklists.insert({
        requestBody: {
            title
        }
    });
    
    return response.data;
};

/**
 * Update a task list in Google Tasks
 */
export const updateTaskList = async (
    connectionId: string,
    taskListId: string,
    title: string
): Promise<tasks_v1.Schema$TaskList> => {
    const tasksClient = await getTasksClient(connectionId);
    
    const response = await tasksClient.tasklists.update({
        tasklist: taskListId,
        requestBody: {
            id: taskListId,
            title
        }
    });
    
    return response.data;
};

/**
 * Delete a task list from Google Tasks
 * Note: Cannot delete the default task list
 */
export const deleteTaskList = async (
    connectionId: string,
    taskListId: string
): Promise<void> => {
    const tasksClient = await getTasksClient(connectionId);
    
    await tasksClient.tasklists.delete({
        tasklist: taskListId
    });
};
