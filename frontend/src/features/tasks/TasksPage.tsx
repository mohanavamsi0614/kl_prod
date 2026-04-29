import React, { useState, useEffect, useCallback, useRef, useReducer } from 'react';
import { Search, Plus, X, Calendar as CalendarIcon, Clock, Trash2, List, CheckCircle2, RefreshCw, Bell, Repeat, Mail, MessageCircle, AlertCircle, LogOut, User, Check, ChevronDown, ChevronUp, Sparkles, Pencil, Menu } from 'lucide-react';
import { api } from '../../lib/api';
import ProductivityLoader from '../../components/ui/ProductivityLoader';
import ProductivitySpinner from '../../components/ui/ProductivitySpinner';
import type { Task, TaskList, ReminderMethod, RecurrenceInterval, TaskStatus, TaskPriority, ApiConnection, RRuleFrequency, RRuleDay } from '../../types';

// RRULE presets for quick selection
const RRULE_PRESETS = {
  DAILY: { label: 'Daily', rrule: 'FREQ=DAILY' },
  WEEKDAYS: { label: 'Weekdays', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  WEEKLY: { label: 'Weekly', rrule: 'FREQ=WEEKLY' },
  BIWEEKLY: { label: 'Every 2 weeks', rrule: 'FREQ=WEEKLY;INTERVAL=2' },
  MONTHLY: { label: 'Monthly', rrule: 'FREQ=MONTHLY' },
  YEARLY: { label: 'Yearly', rrule: 'FREQ=YEARLY' },
  CUSTOM: { label: 'Custom...', rrule: '' }
} as const;

type RRulePresetKey = keyof typeof RRULE_PRESETS;

// --- Task Form Reducer ---
interface TaskFormState {
  isOpen: boolean;
  isEditing: boolean;
  taskId: string | null;
  title: string;
  description: string;
  listId: string;
  priority: TaskPriority;
  dueDate: string;
  dueTime: string;
  isReminderEnabled: boolean;
  reminderMethod: ReminderMethod;
  isRecurrent: boolean;
  recurrenceInterval: RecurrenceInterval;
  // RRULE fields
  rrulePreset: RRulePresetKey;
  customRRule: string;
  rruleFrequency: RRuleFrequency;
  rruleInterval: number;
  rruleDays: RRuleDay[];
  rruleMonthDay: number | null;
  rruleEndType: 'never' | 'count' | 'until';
  rruleCount: number;
  rruleUntil: string;
  showCustomRRule: boolean;
  syncToGoogle: boolean;
  hasUnsavedChanges: boolean;
  showDiscardConfirmation: boolean;
}

const initialFormState: TaskFormState = {
  isOpen: false,
  isEditing: false,
  taskId: null,
  title: '',
  description: '',
  listId: '',
  priority: 'MEDIUM',
  dueDate: '',
  dueTime: '',
  isReminderEnabled: false,
  reminderMethod: 'EMAIL',
  isRecurrent: false,
  recurrenceInterval: 'DAILY',
  // RRULE fields
  rrulePreset: 'DAILY',
  customRRule: '',
  rruleFrequency: 'DAILY',
  rruleInterval: 1,
  rruleDays: [],
  rruleMonthDay: null,
  rruleEndType: 'never',
  rruleCount: 10,
  rruleUntil: '',
  showCustomRRule: false,
  syncToGoogle: false,
  hasUnsavedChanges: false,
  showDiscardConfirmation: false
};

type TaskFormAction = 
  | { type: 'OPEN_ADD'; defaultListId: string }
  | { type: 'OPEN_EDIT'; task: Task }
  | { type: 'CLOSE' }
  | { type: 'CONFIRM_DISCARD' }
  | { type: 'CANCEL_DISCARD' }
  | { type: 'SET_FIELD'; field: keyof TaskFormState; value: any }
  | { type: 'RESET' };

function taskFormReducer(state: TaskFormState, action: TaskFormAction): TaskFormState {
  switch (action.type) {
    case 'OPEN_ADD':
      return { 
        ...initialFormState, 
        isOpen: true, 
        listId: action.defaultListId,
        hasUnsavedChanges: true // Start tracking changes immediately
      };
    case 'OPEN_EDIT':
      const { task } = action;
      let dateStr = '';
      let timeStr = '';
      let reminderEnabled = false;

      if (task.dueDate) {
        reminderEnabled = true;
        const date = new Date(task.dueDate);
        dateStr = date.toISOString().split('T')[0];
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        timeStr = `${hours}:${minutes}`;
      }
      
      // Parse RRULE if present
      let rrulePreset: RRulePresetKey = 'DAILY';
      let customRRule = '';
      if (task.rrule) {
        // Try to match with presets
        const matchingPreset = Object.entries(RRULE_PRESETS).find(
          ([_key, value]) => value.rrule === task.rrule
        );
        if (matchingPreset) {
          rrulePreset = matchingPreset[0] as RRulePresetKey;
        } else {
          rrulePreset = 'CUSTOM';
          customRRule = task.rrule;
        }
      }

      return {
        ...initialFormState,
        isOpen: true,
        isEditing: true,
        taskId: task.id,
        title: task.title,
        description: task.description || '',
        listId: task.list?.id || '',
        priority: task.priority,
        dueDate: dateStr,
        dueTime: timeStr,
        isReminderEnabled: reminderEnabled,
        reminderMethod: task.reminderMethod || 'EMAIL',
        isRecurrent: !!task.recurrenceInterval || !!task.rrule || !!task.isRecurring,
        recurrenceInterval: task.recurrenceInterval || 'DAILY',
        rrulePreset,
        customRRule,
        showCustomRRule: rrulePreset === 'CUSTOM',
        syncToGoogle: task.source === 'GOOGLE',
        hasUnsavedChanges: false // Reset dirty flag for edit mode initially
      };
    case 'CLOSE':
      if (state.hasUnsavedChanges) {
        return { ...state, showDiscardConfirmation: true };
      }
      return { ...state, isOpen: false };
    case 'CONFIRM_DISCARD':
      return { ...state, showDiscardConfirmation: false, isOpen: false };
    case 'CANCEL_DISCARD':
      return { ...state, showDiscardConfirmation: false };
    case 'SET_FIELD':
      // Special handling for rrulePreset to toggle custom UI
      if (action.field === 'rrulePreset') {
        return { 
          ...state, 
          [action.field]: action.value, 
          showCustomRRule: action.value === 'CUSTOM',
          hasUnsavedChanges: true 
        };
      }
      return { ...state, [action.field]: action.value, hasUnsavedChanges: true };
    case 'RESET':
      return initialFormState;
    default:
      return state;
  }
}

// Helper to build RRULE from form state
function buildRRuleFromState(state: TaskFormState): string | undefined {
  if (!state.isRecurrent) return undefined;
  
  if (state.rrulePreset !== 'CUSTOM') {
    return RRULE_PRESETS[state.rrulePreset].rrule || undefined;
  }
  
  // Build custom RRULE
  const parts: string[] = [`FREQ=${state.rruleFrequency}`];
  
  if (state.rruleInterval > 1) {
    parts.push(`INTERVAL=${state.rruleInterval}`);
  }
  
  if (state.rruleDays.length > 0 && (state.rruleFrequency === 'WEEKLY' || state.rruleFrequency === 'MONTHLY')) {
    parts.push(`BYDAY=${state.rruleDays.join(',')}`);
  }
  
  if (state.rruleMonthDay && state.rruleFrequency === 'MONTHLY') {
    parts.push(`BYMONTHDAY=${state.rruleMonthDay}`);
  }
  
  if (state.rruleEndType === 'count' && state.rruleCount > 0) {
    parts.push(`COUNT=${state.rruleCount}`);
  } else if (state.rruleEndType === 'until' && state.rruleUntil) {
    const untilDate = new Date(state.rruleUntil);
    const untilStr = untilDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    parts.push(`UNTIL=${untilStr}`);
  }
  
  return parts.join(';');
}
// -------------------------

// Confetti celebration component
const Confetti: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;
  
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe'];
  const confettiCount = 50;
  
  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {[...Array(confettiCount)].map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.5;
        const duration = 2 + Math.random() * 2;
        const color = colors[Math.floor(Math.random() * colors.length)];
        const size = 8 + Math.random() * 8;
        const rotation = Math.random() * 360;
        
        return (
          <div
            key={i}
            className="absolute animate-confetti-fall"
            style={{
              left: `${left}%`,
              top: '-20px',
              width: `${size}px`,
              height: `${size}px`,
              backgroundColor: color,
              borderRadius: Math.random() > 0.5 ? '50%' : '2px',
              transform: `rotate(${rotation}deg)`,
              animation: `confetti-fall ${duration}s ease-out ${delay}s forwards`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg) scale(1);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg) scale(0.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

// TaskItem component with animation support
interface TaskItemProps {
  task: Task;
  isRecent: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
  selectedListId: string | 'all';
  formatDueDate: (dateStr: string | null | undefined) => string;
  formatDueTime: (dateStr: string | null | undefined) => string;
  isOverdue: (dateStr: string | null | undefined, status: TaskStatus) => boolean;
}

const TaskItem: React.FC<TaskItemProps> = ({ 
  task, isRecent, onToggle, onDelete, onEdit, selectedListId, formatDueDate, formatDueTime, isOverdue 
}) => {
  const taskCompleted = task.status === 'COMPLETED';
  
  return (
    <div 
      className={`group flex items-center gap-4 p-3 rounded-xl transition-all border border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-100 dark:hover:border-slate-700 ${
        taskCompleted ? 'opacity-60' : ''
      } ${isRecent ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : ''}`}
    >
      <button 
        onClick={() => onToggle(task.id)}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
          taskCompleted 
            ? 'bg-emerald-500 border-emerald-500 text-white' 
            : 'border-slate-300 dark:border-slate-600 hover:border-emerald-500 dark:hover:border-emerald-500'
        }`}
      >
        {taskCompleted && <Check className="w-3.5 h-3.5" />}
      </button>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onEdit(task)}>
        <div className="flex items-center gap-2">
          <p className={`truncate font-medium transition-all duration-300 ${
            taskCompleted 
              ? 'text-slate-400 dark:text-slate-500 line-through' 
              : 'text-slate-900 dark:text-white'
          }`}>
            {task.title}
          </p>
          {isRecent && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <Sparkles className="w-3 h-3" />
              Done!
            </span>
          )}
          {(task.recurrenceInterval || task.rrule || task.isRecurring) && (
            <span className="inline-flex items-center gap-1" title={task.rruleDescription || undefined}>
              <Repeat className="w-3 h-3 text-slate-400" />
              {task.rruleDescription && (
                <span className="text-[10px] text-slate-400">{task.rruleDescription}</span>
              )}
            </span>
          )}
          {task.reminderMethod === 'SMS' && <MessageCircle className="w-3 h-3 text-green-500" />}
          {task.reminderMethod === 'PUSH' && <Bell className="w-3 h-3 text-purple-500" />}
          {task.reminderMethod === 'EMAIL' && <Mail className="w-3 h-3 text-blue-500" />}
        </div>
        
        {task.description && (
          <p className={`text-xs mt-0.5 truncate ${
            taskCompleted 
              ? 'text-slate-400 dark:text-slate-500' 
              : 'text-slate-500 dark:text-slate-400'
          }`}>
            {task.description}
          </p>
        )}
        
        <div className="flex items-center gap-2 mt-0.5">
          {task.list && selectedListId === 'all' && (
            <span className="text-[10px] px-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${task.list.color || 'bg-blue-500'}`} />
              {task.list.name}
            </span>
          )}
          {task.dueDate && (
            <span className={`text-[10px] flex items-center gap-1 ${
              isOverdue(task.dueDate, task.status)
                ? 'text-red-500' 
                : 'text-slate-400'
            }`}>
              <CalendarIcon className="w-3 h-3" />
              {formatDueDate(task.dueDate)}
            </span>
          )}
          {(task.reminderTime || (task.source === 'LOCAL' && task.dueDate)) && (
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDueTime(task.reminderTime || task.dueDate)}
            </span>
          )}
          {task.source === 'GOOGLE' && (
            <span className="text-[10px] text-blue-500 flex items-center gap-0.5">
              Google
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
            onClick={() => onEdit(task)}
            className="p-2 text-slate-400 hover:text-productivity-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
        >
            <Pencil className="w-4 h-4" />
        </button>
        <button 
            onClick={() => onDelete(task.id)}
            className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
        >
            <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const TasksPage: React.FC = () => {
  // Data State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [connections, setConnections] = useState<ApiConnection[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | 'all'>('all');
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Loading States
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [isSavingList, setIsSavingList] = useState(false);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  
  // Celebration state
  const [showConfetti, setShowConfetti] = useState(false);
  const [recentlyCompleted, setRecentlyCompleted] = useState<string | null>(null);
  
  // Completed section visibility
  const [showCompleted, setShowCompleted] = useState(true);
  
  // Task Form State (Reducer)
  const [formState, dispatch] = useReducer(taskFormReducer, initialFormState);

  // Create List Modal State
  const [isAddListModalOpen, setIsAddListModalOpen] = useState(false);
  const [isEditListModalOpen, setIsEditListModalOpen] = useState(false);
  const [editingList, setEditingList] = useState<TaskList | null>(null);
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState('bg-blue-500');
  const [listSyncToGoogle, setListSyncToGoogle] = useState(false);
  
  // Delete List Confirmation State
  const [deleteListConfirmation, setDeleteListConfirmation] = useState<{ isOpen: boolean; listId: string | null; listName: string }>({ isOpen: false, listId: null, listName: '' });
  
  // Mobile Menu State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Sync interval (will be fetched from config)
  const [syncIntervalMs, setSyncIntervalMs] = useState(15 * 60 * 1000); // Default 15 min
  
  // Track if we've already handled auth success
  const authHandled = useRef(false);

  // Get TASKS connections
  const tasksConnections = connections.filter(c => c.service === 'TASKS');
  const hasTasksConnection = tasksConnections.length > 0;

  // Notification timeout
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
  };

  // Fetch sync intervals from config
  useEffect(() => {
    const fetchSyncConfig = async () => {
      try {
        const config = await api.get<{
          tasks: { intervalMs: number };
        }>('/api/config/sync-intervals');
        setSyncIntervalMs(config.tasks.intervalMs);
      } catch (err) {
        console.warn('Failed to fetch sync config, using default', err);
      }
    };
    fetchSyncConfig();
  }, []);

  // Fetch tasks and lists
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      
      // Fetch connections
      const conns = await api.get<ApiConnection[]>('/api/connections');
      setConnections(conns);
      
      // Fetch tasks
      const tasksRes = await api.get<{ tasks: Task[] }>('/api/tasks/me');
      setTasks(tasksRes.tasks);
      
      // Fetch task lists
      const listsRes = await api.get<{ localLists: TaskList[] }>('/api/tasks/lists');
      setLists(listsRes.localLists);
    } catch (err: any) {
      console.error('Failed to fetch tasks:', err);
      setError(err.message || 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success' && !authHandled.current) {
      authHandled.current = true;
      window.history.replaceState({}, '', window.location.pathname);
      showNotification('Google Tasks connected!', 'success');
      fetchData();
    }
  }, [fetchData]);

  // Polling for updates
  useEffect(() => {
    if (syncIntervalMs <= 0) return;
    const intervalId = setInterval(fetchData, syncIntervalMs);
    return () => clearInterval(intervalId);
  }, [syncIntervalMs, fetchData]);

  // State for selecting which account to sync new tasks to
  const [selectedSyncAccountId, setSelectedSyncAccountId] = useState<string>('');

  const handleCloseModal = () => {
    dispatch({ type: 'CLOSE' });
  };

  const handleConfirmDiscard = () => {
    dispatch({ type: 'CONFIRM_DISCARD' });
  };

  const handleCancelDiscard = () => {
    dispatch({ type: 'CANCEL_DISCARD' });
  };

  const handleEditTask = (task: Task) => {
    dispatch({ type: 'OPEN_EDIT', task });
  };

  const handleSaveTask = async () => {
    if (!formState.title) return;
    
    setIsSavingTask(true);
    try {
      // Build due date time if reminder enabled
      let dueDate: string | undefined;
      if (formState.isReminderEnabled && formState.dueDate && formState.dueTime) {
        dueDate = new Date(`${formState.dueDate}T${formState.dueTime}`).toISOString();
      } else if (formState.isReminderEnabled && formState.dueDate) {
        dueDate = new Date(`${formState.dueDate}T00:00:00`).toISOString();
      }
      
      // Build RRULE for recurring tasks
      const rrule = buildRRuleFromState(formState);
      const isRecurring = formState.isRecurrent && !!rrule;
      
      // Build recurrence end date/count if specified
      let recurrenceEnd: string | undefined;
      let recurrenceCount: number | undefined;
      if (isRecurring) {
        if (formState.rruleEndType === 'until' && formState.rruleUntil) {
          recurrenceEnd = new Date(formState.rruleUntil).toISOString();
        } else if (formState.rruleEndType === 'count' && formState.rruleCount > 0) {
          recurrenceCount = formState.rruleCount;
        }
      }
      
      if (formState.isEditing && formState.taskId) {
         await api.patch(`/api/tasks/${formState.taskId}`, {
            title: formState.title,
            description: formState.description || undefined,
            priority: formState.priority,
            dueDate,
            reminderTime: dueDate,
            reminderMethod: formState.isReminderEnabled ? formState.reminderMethod : undefined,
            recurrenceInterval: formState.isRecurrent && formState.isReminderEnabled ? formState.recurrenceInterval : undefined,
            rrule: isRecurring ? rrule : null,
            isRecurring,
            recurrenceEnd,
            recurrenceCount,
            listId: formState.listId || undefined,
         });
         showNotification('Task updated successfully', 'success');
      } else {
          const connectionId = hasTasksConnection && formState.syncToGoogle ? (selectedSyncAccountId || tasksConnections[0].id) : undefined;
          
          await api.post('/api/tasks', {
            title: formState.title,
            description: formState.description || undefined,
            priority: formState.priority,
            dueDate,
            reminderTime: dueDate,
            reminderMethod: formState.isReminderEnabled ? formState.reminderMethod : undefined,
            recurrenceInterval: formState.isRecurrent && formState.isReminderEnabled ? formState.recurrenceInterval : undefined,
            rrule: isRecurring ? rrule : undefined,
            isRecurring,
            recurrenceEnd,
            recurrenceCount,
            listId: formState.listId || undefined,
            syncToGoogle: hasTasksConnection && formState.syncToGoogle,
            connectionId
          });
          showNotification('Task created successfully', 'success');
      }
      
      // Refresh tasks
      await fetchData();
      
      // Reset form
      dispatch({ type: 'RESET' });
    } catch (err: any) {
      console.error('Failed to save task:', err);
      setError(err.message || 'Failed to save task');
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleAddList = async () => {
    if (!newListName) return;
    
    setIsSavingList(true);
    try {
      const connectionId = hasTasksConnection && listSyncToGoogle ? (selectedSyncAccountId || tasksConnections[0].id) : undefined;
      
      await api.post('/api/tasks/lists', {
        name: newListName,
        color: newListColor,
        syncToGoogle: hasTasksConnection && listSyncToGoogle,
        connectionId
      });
      
      await fetchData();
      
      setIsAddListModalOpen(false);
      setNewListName('');
      setListSyncToGoogle(false);
      showNotification('List created successfully', 'success');
    } catch (err: any) {
      console.error('Failed to add list:', err);
      setError(err.message || 'Failed to add list');
    } finally {
      setIsSavingList(false);
    }
  };

  const handleEditList = async () => {
    if (!editingList || !newListName) return;
    
    setIsSavingList(true);
    try {
      await api.patch(`/api/tasks/lists/${editingList.id}`, {
        name: newListName,
        color: newListColor
      });
      
      await fetchData();
      
      setIsEditListModalOpen(false);
      setEditingList(null);
      setNewListName('');
      showNotification('List updated successfully', 'success');
    } catch (err: any) {
      console.error('Failed to update list:', err);
      setError(err.message || 'Failed to update list');
    } finally {
      setIsSavingList(false);
    }
  };

  const openDeleteListConfirmation = (list: TaskList) => {
    setDeleteListConfirmation({ isOpen: true, listId: list.id, listName: list.name });
  };

  const cancelDeleteListConfirmation = () => {
    setDeleteListConfirmation({ isOpen: false, listId: null, listName: '' });
  };

  const handleDeleteList = async () => {
    const listId = deleteListConfirmation.listId;
    if (!listId) return;
    
    setDeleteListConfirmation({ isOpen: false, listId: null, listName: '' });
    setDeletingListId(listId);
    try {
      await api.delete(`/api/tasks/lists/${listId}`);
      
      if (selectedListId === listId) {
        setSelectedListId('all');
      }
      
      await fetchData();
      showNotification('List deleted successfully', 'success');
    } catch (err: any) {
      console.error('Failed to delete list:', err);
      const errorMessage = err?.response?.data?.error || err.message || 'Failed to delete list';
      showNotification(errorMessage, 'error');
    } finally {
      setDeletingListId(null);
    }
  };

  const openEditListModal = (list: TaskList) => {
    setEditingList(list);
    setNewListName(list.name);
    setNewListColor(list.color || 'bg-blue-500');
    setIsEditListModalOpen(true);
  };

  const handleToggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    
    const newStatus: TaskStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    const isCompleting = newStatus === 'COMPLETED';
    
    // Optimistic update
    setTasks(tasks.map(t => 
      t.id === id ? { ...t, status: newStatus } : t
    ));
    
    // Trigger celebration if completing task
    if (isCompleting) {
      setRecentlyCompleted(id);
      setShowConfetti(true);
      setTimeout(() => {
        setShowConfetti(false);
        setRecentlyCompleted(null);
      }, 2500);
    }
    
    try {
      await api.patch(`/api/tasks/${id}`, { status: newStatus });
    } catch (err: any) {
      console.error('Failed to toggle task:', err);
      // Revert optimistic update
      setTasks(tasks.map(t => 
        t.id === id ? { ...t, status: task.status } : t
      ));
      setShowConfetti(false);
      setRecentlyCompleted(null);
      setError(err.message || 'Failed to update task');
    }
  };

  const handleDeleteTask = async (id: string) => {
    // Optimistic update
    const previousTasks = [...tasks];
    setTasks(tasks.filter(t => t.id !== id));
    
    try {
      await api.delete(`/api/tasks/${id}`);
    } catch (err: any) {
      console.error('Failed to delete task:', err);
      setTasks(previousTasks);
      setError(err.message || 'Failed to delete task');
    }
  };

  // Track syncing state per connection
  const [syncingConnections, setSyncingConnections] = useState<Set<string>>(new Set());

  const handleSyncGoogle = async (connectionId?: string) => {
    if (!hasTasksConnection) {
      return;
    }
    
    const targetConnectionId = connectionId || tasksConnections[0].id;
    
    setSyncingConnections(prev => new Set(prev).add(targetConnectionId));
    setError(null);
    
    try {
      // Just fetch data, no sync endpoint needed as we fetch live
      await fetchData();
      showNotification('Tasks refreshed!', 'success');
    } catch (err: any) {
      console.error('Failed to refresh:', err);
      if (err?.response?.data?.code === 'SCOPE_REAUTH_REQUIRED') {
        window.location.href = '/auth/google?service=TASKS';
        return;
      }
      setError(err.message || 'Refresh failed');
    } finally {
      setSyncingConnections(prev => {
        const next = new Set(prev);
        next.delete(targetConnectionId);
        return next;
      });
    }
  };

  const handleSyncAll = async () => {
    if (!hasTasksConnection) return;
    
    setIsSyncing(true);
    setError(null);
    
    try {
      await fetchData();
      showNotification('All tasks refreshed!', 'success');
    } catch (err: any) {
      console.error('Failed to refresh:', err);
      setError(err.message || 'Refresh failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUnlinkConnection = async (connectionId: string) => {
    try {
      await api.delete(`/api/connections/${connectionId}`);
      setConnections(prev => prev.filter(c => c.id !== connectionId));
      if (selectedConnectionId === connectionId) {
        setSelectedConnectionId(null);
        setSelectedListId('all');
      }
      showNotification('Account unlinked successfully', 'success');
      await fetchData();
    } catch (err: any) {
      console.error('Failed to unlink:', err);
      showNotification('Failed to unlink account', 'error');
    }
  };

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesList = selectedListId === 'all' || task.list?.id === selectedListId;
    const matchesConnection = !selectedConnectionId || task.connectionId === selectedConnectionId;
    
    // Ensure task belongs to a valid connection or is local
    const validConnectionIds = new Set(connections.map(c => c.id));
    const isConnectionValid = !task.connectionId || validConnectionIds.has(task.connectionId);
    
    return matchesSearch && matchesList && matchesConnection && isConnectionValid;
  });

  // Separate pending and completed tasks
  const pendingTasks = [...filteredTasks]
    .filter(t => t.status !== 'COMPLETED')
    .sort((a, b) => {
      // Sort by due date (earliest first)
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

  const completedTasks = [...filteredTasks]
    .filter(t => t.status === 'COMPLETED')
    .sort((a, b) => {
      // Sort by most recently updated
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });

  const colors = [
    'bg-blue-500', 'bg-red-500', 'bg-green-500', 'bg-yellow-500', 
    'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500'
  ];

  // Format date for display
  const formatDueDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDueTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const isOverdue = (dateStr: string | null | undefined, status: TaskStatus): boolean => {
    if (!dateStr || status === 'COMPLETED') return false;
    return new Date(dateStr) < new Date();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <ProductivityLoader fullScreen={false} text="Loading tasks..." />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-10 h-full flex flex-col relative overflow-hidden">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${
          notification.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300'
            : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {notification.message}
          <button onClick={() => setNotification(null)} className="ml-2 opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <header className="mb-4 lg:mb-8 flex flex-col md:flex-row md:justify-between md:items-center gap-4 shrink-0">
        <div className="flex items-center gap-3">
            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 -ml-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              <Menu className="w-6 h-6" />
            </button>
            
            <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Tasks</h1>
                <p className="text-slate-500 dark:text-slate-400 flex items-center gap-2 text-sm sm:text-base">
                  Stay organized with your to-do lists.
                  {hasTasksConnection && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs rounded-full">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                      <span className="hidden sm:inline">Google Tasks Connected</span>
                      <span className="sm:hidden">Connected</span>
                    </span>
                  )}
                </p>
            </div>
        </div>
        <div className="flex items-center gap-3">
             <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tasks..." 
                    className="pl-9 pr-4 py-2 rounded-xl bg-white dark:bg-dark-surface border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-productivity-500/50 w-64 transition-all"
                />
             </div>
             
             {/* Link Google Tasks button - only show if not connected */}
             {!hasTasksConnection && (
               <button 
                  onClick={() => window.location.href = '/auth/google?service=TASKS'}
                  className="bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 px-4 py-2 rounded-xl flex items-center gap-2 transition-colors shadow-sm"
               >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="hidden sm:inline">Link Google Tasks</span>
               </button>
             )}
             
             {/* Sync All button - only show if connected */}
             {hasTasksConnection && (
               <button 
                  onClick={handleSyncAll}
                  disabled={isSyncing}
                  className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 transition-colors shadow-sm"
               >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-productivity-500' : 'text-slate-400'}`} />
                  <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync All'}</span>
               </button>
             )}

             <button 
                onClick={() => dispatch({ type: 'OPEN_ADD', defaultListId: selectedListId === 'all' ? '' : selectedListId })}
                className="bg-productivity-600 hover:bg-productivity-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-productivity-500/20"
             >
                <Plus className="w-5 h-5" />
                <span className="hidden sm:inline">Add Task</span>
             </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
          
          {/* Sidebar / Lists */}
          <div className={`
            lg:col-span-1 
            ${isMobileMenuOpen ? 'fixed inset-0 z-50 bg-white dark:bg-dark-bg p-4 lg:p-0 lg:static lg:bg-transparent' : 'hidden lg:block'}
          `}>
             {isMobileMenuOpen && (
               <div className="flex justify-end mb-4 lg:hidden">
                 <button 
                   onClick={() => setIsMobileMenuOpen(false)}
                   className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                 >
                   <X className="w-6 h-6" />
                 </button>
               </div>
             )}
             <div className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border p-4 h-full flex flex-col overflow-hidden shadow-sm">
                
                {/* Connected Accounts Section */}
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-2">Connected Accounts</h3>
                
                {tasksConnections.length === 0 ? (
                  <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-center">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">No Google Tasks linked</p>
                    <button 
                      onClick={() => window.location.href = '/auth/google?service=TASKS'}
                      className="text-xs text-productivity-600 dark:text-productivity-400 hover:underline flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Link Account
                    </button>
                  </div>
                ) : (
                  <div className="mb-4 space-y-1">
                    {tasksConnections.map(conn => (
                      <div key={conn.id} className={`flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors ${selectedConnectionId === conn.id ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                        <button 
                            onClick={() => {
                                setSelectedConnectionId(conn.id);
                                setSelectedListId('all');
                            }}
                            className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        >
                            <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                            <User className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium truncate ${selectedConnectionId === conn.id ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                {conn.accountEmail || 'Google Tasks'}
                            </p>
                            <p className="text-[10px] text-slate-400">Connected</p>
                            </div>
                        </button>
                        <button
                          onClick={(e) => {
                              e.stopPropagation();
                              handleSyncGoogle(conn.id);
                          }}
                          disabled={syncingConnections.has(conn.id)}
                          className="p-1.5 text-slate-400 hover:text-productivity-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          title="Sync this account"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncingConnections.has(conn.id) ? 'animate-spin text-productivity-500' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleUnlinkConnection(conn.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          title="Unlink account"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button 
                      onClick={() => window.location.href = '/auth/google?service=TASKS'}
                      className="w-full text-xs text-productivity-600 dark:text-productivity-400 hover:underline flex items-center justify-center gap-1 py-2"
                    >
                      <Plus className="w-3 h-3" /> Add Another Account
                    </button>
                  </div>
                )}

                <div className="border-t border-slate-100 dark:border-slate-700 my-2" />
                
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-2">My Lists</h3>
                
                <button 
                    onClick={() => {
                        setSelectedListId('all');
                        setSelectedConnectionId(null);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl mb-2 transition-all ${
                        selectedListId === 'all' && !selectedConnectionId
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                >
                    <div className="flex items-center gap-3">
                        <List className="w-5 h-5" />
                        <span>All Tasks</span>
                    </div>
                    <span className="text-xs bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-300">
                        {tasks.length}
                    </span>
                </button>

                <div className="space-y-3 overflow-y-auto flex-1">
                    {/* Local Lists (no connection) */}
                    {lists.filter(l => !l.connectionId).length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-1">Productivity</p>
                        {lists.filter(l => !l.connectionId).map(list => {
                          const count = tasks.filter(t => t.list?.id === list.id && t.status !== 'COMPLETED').length;
                          const isSelected = selectedListId === list.id;
                          const isDeleting = deletingListId === list.id;
                          return (
                            <div 
                              key={list.id}
                              className={`group w-full flex items-center justify-between p-2.5 rounded-xl transition-all ${
                                isSelected
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                              }`}
                            >
                              <button 
                                onClick={() => {
                                  setSelectedListId(list.id);
                                  setSelectedConnectionId(null);
                                }}
                                className="flex items-center gap-3 flex-1 min-w-0 text-left"
                              >
                                <div className={`w-3 h-3 rounded-full ${list.color || 'bg-blue-500'}`} />
                                <span className="truncate">{list.name}</span>
                              </button>
                              <div className="flex items-center gap-1">
                                {count > 0 && (
                                  <span className="text-xs text-slate-400 font-medium mr-1">{count}</span>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEditListModal(list); }}
                                  className="p-1 text-slate-400 hover:text-productivity-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Edit list"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openDeleteListConfirmation(list); }}
                                  disabled={isDeleting}
                                  className="p-1 text-slate-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                                  title="Delete list"
                                >
                                  {isDeleting ? <ProductivitySpinner size="xs" /> : <Trash2 className="w-3 h-3" />}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Lists grouped by connected account */}
                    {tasksConnections
                      .filter(conn => !selectedConnectionId || conn.id === selectedConnectionId)
                      .map(conn => {
                      const connLists = lists.filter(l => l.connectionId === conn.id);
                      if (connLists.length === 0) return null;
                      
                      return (
                        <div key={conn.id}>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-1 truncate flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            {conn.accountEmail?.split('@')[0] || 'Google Tasks'}
                          </p>
                          {connLists.map(list => {
                            const count = tasks.filter(t => t.list?.id === list.id && t.status !== 'COMPLETED').length;
                            const isSelected = selectedListId === list.id;
                            const isDeleting = deletingListId === list.id;
                            return (
                              <div 
                                key={list.id}
                                className={`group w-full flex items-center justify-between p-2.5 rounded-xl transition-all ${
                                  isSelected
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                }`}
                              >
                                <button 
                                  onClick={() => {
                                      setSelectedListId(list.id);
                                      setSelectedConnectionId(null);
                                  }}
                                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                                >
                                  <div className={`w-3 h-3 rounded-full ${list.color || 'bg-blue-500'}`} />
                                  <span className="truncate">{list.name}</span>
                                </button>
                                <div className="flex items-center gap-1">
                                  {count > 0 && (
                                    <span className="text-xs text-slate-400 font-medium mr-1">{count}</span>
                                  )}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openEditListModal(list); }}
                                    className="p-1 text-slate-400 hover:text-productivity-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Edit list"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openDeleteListConfirmation(list); }}
                                    disabled={isDeleting}
                                    className="p-1 text-slate-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                                    title="Delete list"
                                  >
                                    {isDeleting ? <ProductivitySpinner size="xs" /> : <Trash2 className="w-3 h-3" />}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                </div>

                <button 
                   onClick={() => setIsAddListModalOpen(true)}
                   className="mt-4 w-full py-2 border-t border-slate-100 dark:border-slate-700 text-sm text-productivity-600 dark:text-productivity-500 font-medium hover:text-productivity-700 dark:hover:text-productivity-400 flex items-center justify-center gap-2 pt-4"
                >
                    <Plus className="w-4 h-4" /> Create New List
                </button>
             </div>
          </div>

          {/* Main Task List */}
          <div className="col-span-1 lg:col-span-3 h-full overflow-hidden">
             <div className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border h-full flex flex-col">
                 <div className="p-4 border-b border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-slate-800/50 shrink-0 flex justify-between items-center">
                     <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                         {selectedListId === 'all' ? 'All Tasks' : lists.find(l => l.id === selectedListId)?.name}
                     </h2>
                     <div className="text-xs text-slate-500">
                         {filteredTasks.filter(t => t.status !== 'COMPLETED').length} incomplete
                     </div>
                 </div>

                 {error && (
                     <div className="p-3 mx-2 mt-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
                         <AlertCircle className="w-4 h-4" />
                         {error}
                         <button onClick={() => setError(null)} className="ml-auto">
                             <X className="w-4 h-4" />
                         </button>
                     </div>
                 )}

                 <div className="flex-1 overflow-y-auto p-3">
                     {pendingTasks.length === 0 && completedTasks.length === 0 ? (
                         <div className="flex flex-col items-center justify-center h-full text-slate-500">
                             <CheckCircle2 className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-3" />
                             <p>No tasks found.</p>
                         </div>
                     ) : (
                         <div className="space-y-4">
                             {/* Pending Tasks Section */}
                             {pendingTasks.length > 0 && (
                               <div>
                                 <div className="flex items-center gap-2 mb-3 px-2">
                                   <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                   <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                     Pending
                                   </h3>
                                   <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                                     {pendingTasks.length}
                                   </span>
                                 </div>
                                 <div className="space-y-1">
                                   {pendingTasks.map(task => (
                                     <TaskItem 
                                       key={task.id} 
                                       task={task} 
                                       isRecent={recentlyCompleted === task.id}
                                       onToggle={handleToggleTask}
                                       onDelete={handleDeleteTask}
                                       onEdit={handleEditTask}
                                       selectedListId={selectedListId}
                                       formatDueDate={formatDueDate}
                                       formatDueTime={formatDueTime}
                                       isOverdue={isOverdue}
                                     />
                                   ))}
                                 </div>
                               </div>
                             )}

                             {/* Completed Tasks Section */}
                             {completedTasks.length > 0 && (
                               <div>
                                 <button 
                                   onClick={() => setShowCompleted(!showCompleted)}
                                   className="flex items-center gap-2 mb-3 px-2 w-full hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg py-1 transition-colors"
                                 >
                                   <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                   <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                     Completed
                                   </h3>
                                   <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                                     {completedTasks.length}
                                   </span>
                                   <span className="ml-auto text-slate-400">
                                     {showCompleted ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                   </span>
                                 </button>
                                 {showCompleted && (
                                   <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
                                     {completedTasks.map(task => (
                                       <TaskItem 
                                         key={task.id} 
                                         task={task} 
                                         isRecent={recentlyCompleted === task.id}
                                         onToggle={handleToggleTask}
                                         onDelete={handleDeleteTask}
                                         onEdit={handleEditTask}
                                         selectedListId={selectedListId}
                                         formatDueDate={formatDueDate}
                                         formatDueTime={formatDueTime}
                                         isOverdue={isOverdue}
                                       />
                                     ))}
                                   </div>
                                 )}
                               </div>
                             )}
                         </div>
                     )}
                 </div>
             </div>
          </div>
      </div>

      {/* Confetti celebration */}
      <Confetti show={showConfetti} />

      {/* Discard Changes Confirmation Modal */}
      {formState.showDiscardConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/60 backdrop-blur-md">
          <div className="bg-white dark:bg-dark-surface w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Unsaved Changes</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  You have unsaved changes. Are you sure you want to discard them?
                </p>
              </div>
              <div className="flex gap-3 w-full mt-2">
                <button 
                  onClick={handleCancelDiscard}
                  className="flex-1 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Keep Editing
                </button>
                <button 
                  onClick={handleConfirmDiscard}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl shadow-lg shadow-red-500/25 transition-colors"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {formState.isOpen && (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/60 backdrop-blur-md"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    handleCloseModal();
                }
            }}
        >
            <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border p-6 animate-in fade-in zoom-in duration-200 overflow-y-auto max-h-[90vh]">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{formState.isEditing ? 'Edit Task' : 'New Task'}</h2>
                    <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Task Title</label>
                        <input 
                          type="text"
                          value={formState.title}
                          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'title', value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && formState.title.trim() && !isSavingTask) {
                              e.preventDefault();
                              handleSaveTask();
                            }
                          }}
                          placeholder="e.g. Finish Q4 report"
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                          autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description <span className="text-slate-400 font-normal">(optional)</span></label>
                        <textarea 
                          value={formState.description}
                          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'description', value: e.target.value })}
                          placeholder="Add more details about this task..."
                          rows={3}
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none resize-none"
                        />
                    </div>

                    {/* Push to Google Task Toggle */}
                    {hasTasksConnection && (
                        <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                        {/* Google Tasks Icon */}
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" fill="#4285F4"/>
                                            <path d="M10.5 15.5L7.5 12.5L8.91 11.09L10.5 12.67L15.09 8.09L16.5 9.5L10.5 15.5Z" fill="white"/>
                                        </svg>
                                    </div>
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Push to Google Task</span>
                                </div>
                                <button 
                                    onClick={() => dispatch({ type: 'SET_FIELD', field: 'syncToGoogle', value: !formState.syncToGoogle })}
                                    className={`w-11 h-6 rounded-full p-1 transition-colors ${formState.syncToGoogle ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                                >
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${formState.syncToGoogle ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            {/* Account Selection Dropdown */}
                            {formState.syncToGoogle && tasksConnections.length > 0 && (
                                <div className="mt-3 pl-10 animate-in fade-in slide-in-from-top-1">
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Select Account</label>
                                    <select
                                        value={selectedSyncAccountId || tasksConnections[0].id}
                                        onChange={(e) => setSelectedSyncAccountId(e.target.value)}
                                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                    >
                                        {tasksConnections.map(conn => (
                                            <option key={conn.id} value={conn.id}>
                                                {conn.accountEmail || 'Google Tasks'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">List</label>
                        <select
                          value={formState.listId}
                          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'listId', value: e.target.value })}
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                        >
                            <option value="">No List</option>
                            {lists
                                .filter(l => formState.syncToGoogle ? l.connectionId : !l.connectionId)
                                .map(l => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Priority - Only show for local tasks (Google Tasks doesn't support priority) */}
                    {!formState.syncToGoogle && (
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Priority</label>
                        <select
                          value={formState.priority}
                          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'priority', value: e.target.value as TaskPriority })}
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                        >
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HIGH">High</option>
                        </select>
                    </div>
                    )}

                    {/* Due Date & Reminder Section */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
                                <CalendarIcon className="w-4 h-4" />
                                <span>{formState.syncToGoogle ? 'Due Date' : 'Remind Me'}</span>
                            </div>
                            <button 
                                onClick={() => dispatch({ type: 'SET_FIELD', field: 'isReminderEnabled', value: !formState.isReminderEnabled })}
                                className={`w-11 h-6 rounded-full p-1 transition-colors ${formState.isReminderEnabled ? 'bg-productivity-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                            >
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${formState.isReminderEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {formState.isReminderEnabled && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                {/* Date and Time - Time only for local tasks */}
                                <div className={formState.syncToGoogle ? '' : 'grid grid-cols-2 gap-4'}>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Date</label>
                                        <input 
                                          type="date"
                                          value={formState.dueDate}
                                          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'dueDate', value: e.target.value })}
                                          className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-productivity-500 outline-none"
                                        />
                                    </div>
                                    {/* Time - Only for local tasks (Google Tasks doesn't support time) */}
                                    {!formState.syncToGoogle && (
                                    <div>
                                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Time</label>
                                        <input 
                                          type="time"
                                          value={formState.dueTime}
                                          onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'dueTime', value: e.target.value })}
                                          className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-productivity-500 outline-none"
                                        />
                                    </div>
                                    )}
                                </div>

                                {/* Notification Method - Only for local tasks */}
                                {!formState.syncToGoogle && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Notify via</label>
                                    <div className="flex gap-3">
                                        {(['EMAIL', 'PUSH', 'SMS'] as ReminderMethod[]).map((method) => (
                                            <button
                                                key={method}
                                                onClick={() => dispatch({ type: 'SET_FIELD', field: 'reminderMethod', value: method })}
                                                className={`flex-1 flex flex-col items-center justify-center gap-1 p-2 rounded-xl border transition-all ${
                                                    formState.reminderMethod === method
                                                    ? 'bg-productivity-50 dark:bg-productivity-900/20 border-productivity-500 text-productivity-700 dark:text-productivity-400 ring-1 ring-productivity-500'
                                                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                }`}
                                            >
                                                {method === 'EMAIL' && <Mail className="w-5 h-5" />}
                                                {method === 'SMS' && <MessageCircle className="w-5 h-5" />}
                                                {method === 'PUSH' && <Bell className="w-5 h-5" />}
                                                <span className="text-xs capitalize">{method.toLowerCase()}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                )}

                                {/* Google Tasks info message */}
                                {formState.syncToGoogle && (
                                    <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-600 dark:text-blue-400 flex items-start gap-2">
                                        <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                                            <path d="M12 7v6M12 16v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                        </svg>
                                        <span>Google Tasks only supports due date (no time). The task will appear in the Tasks section of Google Calendar.</span>
                                    </div>
                                )}

                                {/* Recurrence - Only for local tasks (Google Tasks doesn't support recurrence) */}
                                {!formState.syncToGoogle && (
                                <>
                                <div className="flex items-center gap-3 pt-2">
                                    <input 
                                        type="checkbox" 
                                        id="recurrent"
                                        checked={formState.isRecurrent}
                                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'isRecurrent', value: e.target.checked })}
                                        className="w-4 h-4 rounded border-slate-300 text-productivity-600 focus:ring-productivity-500"
                                    />
                                    <label htmlFor="recurrent" className="text-sm text-slate-700 dark:text-slate-300 select-none flex items-center gap-2">
                                        <Repeat className="w-4 h-4 text-slate-400" />
                                        Make Recurrent
                                    </label>
                                </div>

                                {formState.isRecurrent && (
                                    <div className="pl-7 space-y-3">
                                        {/* RRULE Preset Selector */}
                                        <div>
                                            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Repeat</label>
                                            <select 
                                                value={formState.rrulePreset}
                                                onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'rrulePreset', value: e.target.value as RRulePresetKey })}
                                                className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none"
                                            >
                                                {Object.entries(RRULE_PRESETS).map(([key, { label }]) => (
                                                    <option key={key} value={key}>{label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        
                                        {/* Custom RRULE Builder */}
                                        {formState.showCustomRRule && (
                                            <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Every</label>
                                                        <input 
                                                            type="number"
                                                            min="1"
                                                            max="99"
                                                            value={formState.rruleInterval}
                                                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'rruleInterval', value: parseInt(e.target.value) || 1 })}
                                                            className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Frequency</label>
                                                        <select
                                                            value={formState.rruleFrequency}
                                                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'rruleFrequency', value: e.target.value as RRuleFrequency })}
                                                            className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                                                        >
                                                            <option value="DAILY">Day(s)</option>
                                                            <option value="WEEKLY">Week(s)</option>
                                                            <option value="MONTHLY">Month(s)</option>
                                                            <option value="YEARLY">Year(s)</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                
                                                {/* Day of week selector for weekly */}
                                                {formState.rruleFrequency === 'WEEKLY' && (
                                                    <div>
                                                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">On days</label>
                                                        <div className="flex gap-1">
                                                            {(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const).map((day) => (
                                                                <button
                                                                    key={day}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const days = formState.rruleDays.includes(day)
                                                                            ? formState.rruleDays.filter(d => d !== day)
                                                                            : [...formState.rruleDays, day];
                                                                        dispatch({ type: 'SET_FIELD', field: 'rruleDays', value: days });
                                                                    }}
                                                                    className={`flex-1 p-1.5 text-xs rounded-lg border transition-all ${
                                                                        formState.rruleDays.includes(day)
                                                                            ? 'bg-productivity-500 text-white border-productivity-500'
                                                                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                                                                    }`}
                                                                >
                                                                    {day.charAt(0)}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                {/* End condition */}
                                                <div>
                                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Ends</label>
                                                    <select
                                                        value={formState.rruleEndType}
                                                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'rruleEndType', value: e.target.value as 'never' | 'count' | 'until' })}
                                                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm mb-2"
                                                    >
                                                        <option value="never">Never</option>
                                                        <option value="count">After X occurrences</option>
                                                        <option value="until">On date</option>
                                                    </select>
                                                    
                                                    {formState.rruleEndType === 'count' && (
                                                        <input 
                                                            type="number"
                                                            min="1"
                                                            max="999"
                                                            placeholder="Number of occurrences"
                                                            value={formState.rruleCount}
                                                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'rruleCount', value: parseInt(e.target.value) || 10 })}
                                                            className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                                                        />
                                                    )}
                                                    
                                                    {formState.rruleEndType === 'until' && (
                                                        <input 
                                                            type="date"
                                                            value={formState.rruleUntil}
                                                            onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'rruleUntil', value: e.target.value })}
                                                            className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm"
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* Legacy selector (hidden, for backward compat) */}
                                        <input type="hidden" value={formState.recurrenceInterval} />
                                    </div>
                                )}
                                </>
                                )}
                            </div>
                        )}
                    </div>



                    <div className="pt-4 flex gap-3">
                        <button 
                          onClick={handleCloseModal}
                          disabled={isSavingTask}
                          className="flex-1 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button 
                          onClick={handleSaveTask}
                          disabled={!formState.title || (formState.isReminderEnabled && !formState.dueDate) || (!formState.syncToGoogle && formState.isReminderEnabled && !formState.dueTime) || isSavingTask}
                          className="flex-1 py-2.5 bg-productivity-600 hover:bg-productivity-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-lg shadow-productivity-500/25 transition-colors flex items-center justify-center gap-2"
                        >
                            {isSavingTask ? <><ProductivitySpinner size="sm" /> Saving...</> : (formState.isEditing ? 'Update Task' : 'Save Task')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Add List Modal */}
      {isAddListModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border p-6 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Create New List</h2>
                    <button onClick={() => setIsAddListModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">List Name</label>
                        <input 
                          type="text"
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          placeholder="e.g. Travel Plans"
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                          autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Color Code</label>
                        <div className="flex gap-3 flex-wrap">
                            {colors.map(color => (
                                <button
                                    key={color}
                                    onClick={() => setNewListColor(color)}
                                    className={`w-8 h-8 rounded-full ${color} transition-transform hover:scale-110 ${newListColor === color ? 'ring-2 ring-offset-2 ring-productivity-500 dark:ring-offset-dark-surface' : ''}`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Google Sync Option for List */}
                    {hasTasksConnection && (
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                            <div className="flex items-center gap-3">
                                <input 
                                    type="checkbox" 
                                    id="syncListToGoogle"
                                    checked={listSyncToGoogle}
                                    onChange={(e) => setListSyncToGoogle(e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-300 text-productivity-600 focus:ring-productivity-500"
                                />
                                <label htmlFor="syncListToGoogle" className="text-sm text-slate-700 dark:text-slate-300 select-none flex items-center gap-2">
                                    <RefreshCw className="w-4 h-4 text-blue-500" />
                                    Sync to Google Tasks
                                </label>
                            </div>
                            
                            {listSyncToGoogle && tasksConnections.length > 1 && (
                                <div className="pl-7">
                                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Sync to account</label>
                                    <select
                                        value={selectedSyncAccountId || tasksConnections[0].id}
                                        onChange={(e) => setSelectedSyncAccountId(e.target.value)}
                                        className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none"
                                    >
                                        {tasksConnections.map(conn => (
                                            <option key={conn.id} value={conn.id}>
                                                {conn.accountEmail || 'Google Tasks'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="pt-4 flex gap-3">
                        <button 
                          onClick={() => setIsAddListModalOpen(false)}
                          disabled={isSavingList}
                          className="flex-1 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button 
                          onClick={handleAddList}
                          disabled={!newListName || isSavingList}
                          className="flex-1 py-2.5 bg-productivity-600 hover:bg-productivity-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-lg shadow-productivity-500/25 transition-colors flex items-center justify-center gap-2"
                        >
                            {isSavingList ? <><ProductivitySpinner size="sm" /> Creating...</> : 'Create List'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Edit List Modal */}
      {isEditListModalOpen && editingList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border p-6 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Edit List</h2>
                    <button onClick={() => { setIsEditListModalOpen(false); setEditingList(null); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">List Name</label>
                        <input 
                          type="text"
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newListName.trim() && !isSavingList) {
                              e.preventDefault();
                              handleEditList();
                            }
                          }}
                          placeholder="e.g. Travel Plans"
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                          autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Color Code</label>
                        <div className="flex gap-3 flex-wrap">
                            {colors.map(color => (
                                <button
                                    key={color}
                                    onClick={() => setNewListColor(color)}
                                    className={`w-8 h-8 rounded-full ${color} transition-transform hover:scale-110 ${newListColor === color ? 'ring-2 ring-offset-2 ring-productivity-500 dark:ring-offset-dark-surface' : ''}`}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button 
                          onClick={() => { setIsEditListModalOpen(false); setEditingList(null); }}
                          disabled={isSavingList}
                          className="flex-1 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button 
                          onClick={handleEditList}
                          disabled={!newListName || isSavingList}
                          className="flex-1 py-2.5 bg-productivity-600 hover:bg-productivity-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-lg shadow-productivity-500/25 transition-colors flex items-center justify-center gap-2"
                        >
                            {isSavingList ? <><ProductivitySpinner size="sm" /> Saving...</> : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Delete List Confirmation Modal */}
      {deleteListConfirmation.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Delete List</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-300 mb-2">
              Are you sure you want to delete <span className="font-medium text-slate-900 dark:text-white">"{deleteListConfirmation.listName}"</span>?
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Tasks in this list will be moved to "All Tasks". This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={cancelDeleteListConfirmation}
                className="flex-1 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteList}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl shadow-lg shadow-red-500/25 transition-colors"
              >
                Delete List
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksPage;
