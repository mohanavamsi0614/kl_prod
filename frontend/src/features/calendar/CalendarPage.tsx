import React, { useState, useEffect, useMemo } from 'react';
import { Calendar as CalendarIcon, Clock, Video, Trash2, Plus, CheckCircle, Link as LinkIcon, X, Filter, LayoutList, Grid3X3, ChevronLeft, ChevronRight, Save, Users, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';
import ProductivityLoader from '../../components/ui/ProductivityLoader';
import type { CalendarEvent, CalendarSource, CalendarCategory, DefaultCalendarCategory, ApiConnection, ApiEvent } from '../../types';

// Default category list
const DEFAULT_CATEGORIES: DefaultCalendarCategory[] = ['Personal', 'Work', 'Family', 'Other'];

const CalendarPage: React.FC = () => {
  // Helper function to derive color from category
  const getCategoryColorValue = (category: CalendarCategory): string => {
    switch(category) {
      case 'Work': return 'violet';
      case 'Personal': return 'productivity';
      case 'Family': return 'emerald';
      case 'Other': return 'slate';
      default: {
        // Generate a consistent color for custom categories based on hash
        const colors = ['rose', 'orange', 'amber', 'lime', 'teal', 'cyan', 'sky', 'indigo', 'fuchsia', 'pink'];
        const hash = category.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        return colors[hash % colors.length];
      }
    }
  };

  // Store events by calendar ID to prevent duplicates and allow independent updates
  const [eventsByCalendar, setEventsByCalendar] = useState<Record<string, CalendarEvent[]>>({});
  const [calendars, setCalendars] = useState<CalendarSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  
  // Sync interval state (configurable from server)
  const [syncIntervalMs, setSyncIntervalMs] = useState(60000); // Default 60s
  
  // View State
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Derived events list: flattened, deduplicated, and sorted
  const events = useMemo(() => {
      const allEvents = Object.values(eventsByCalendar).flat();
      // Sort by start time
      return allEvents.sort((a, b) => {
          const tA = a.originalStart ? new Date(a.originalStart).getTime() : 0;
          const tB = b.originalStart ? new Date(b.originalStart).getTime() : 0;
          return tA - tB;
      });
  }, [eventsByCalendar]);

  // Link Modal State
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkProvider, setLinkProvider] = useState('Google Calendar');
  const [linkCategory, setLinkCategory] = useState<CalendarCategory>('Personal');
  const [customCategory, setCustomCategory] = useState('');
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  
  // Create Event Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedCalendarId, setSelectedCalendarId] = useState('');
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [newEventTime, setNewEventTime] = useState('');
  const [newEventEndDate, setNewEventEndDate] = useState('');
  const [newEventEndTime, setNewEventEndTime] = useState('');
  const [newEventParticipants, setNewEventParticipants] = useState('');

  // Edit Event Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editEventTitle, setEditEventTitle] = useState('');
  const [editEventDate, setEditEventDate] = useState('');
  const [editEventTime, setEditEventTime] = useState('');
  const [editEventEndDate, setEditEventEndDate] = useState('');
  const [editEventEndTime, setEditEventEndTime] = useState('');
  const [editEventParticipants, setEditEventParticipants] = useState('');

  // Delete Confirmation Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<{id: string, calendarId: string} | null>(null);

  const [filterCategory, setFilterCategory] = useState<CalendarCategory | 'All'>('All');

  // Get all unique categories (default + custom from connected calendars)
  const allCategories = useMemo(() => {
    const customCategories = calendars
      .map(c => c.category)
      .filter(cat => cat && !DEFAULT_CATEGORIES.includes(cat as DefaultCalendarCategory));
    // Return default categories + unique custom categories, sorted
    return [...DEFAULT_CATEGORIES, ...Array.from(new Set(customCategories))].sort();
  }, [calendars]);

  // Inline Notification State
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const abortControllerRef = React.useRef<AbortController | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
  
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
          calendar: { intervalMs: number };
        }>('/api/config/sync-intervals');
        setSyncIntervalMs(config.calendar.intervalMs);
      } catch (err) {
        console.warn('Failed to fetch sync config, using default', err);
      }
    };
    fetchSyncConfig();
  }, []);

  // Auto-sync using configured interval
  useEffect(() => {
    if (syncIntervalMs <= 0) return;
    
    const interval = setInterval(() => {
      if (!isLoading && !isSyncing) {
        fetchData(true);
      }
    }, syncIntervalMs);
    return () => clearInterval(interval);
  }, [isLoading, isSyncing, currentMonth, syncIntervalMs]);

  const handleDisconnect = async (connectionId: string) => {
      try {
          await api.delete(`/api/connections/${connectionId}`);

          // Remove from state immediately
          setCalendars(prev => prev.filter(c => c.id !== connectionId));
          setEventsByCalendar(prev => {
              const newState = { ...prev };
              delete newState[connectionId];
              return newState;
          });
          
          showNotification("Calendar disconnected successfully", "success");
      } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          console.error("Failed to disconnect calendar:", errorMsg);
          showNotification("Failed to disconnect calendar", "error");
      }
  };

  const fetchData = async (isSilent = false) => {
    // Cancel previous requests
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    if (!isSilent) setIsLoading(true);
    try {
      // 1. Fetch Connections
      const connections = await api.get<ApiConnection[]>('/api/connections', { signal });
      
      // Filter for CALENDAR
      const calendarConnections = connections.filter(c => c.service === 'CALENDAR');
      
      // Map to CalendarSource format
      const mappedCalendars: CalendarSource[] = calendarConnections.map(c => ({
          id: c.id,
          provider: 'Google Calendar',
          category: (c.category as CalendarCategory) || 'Personal',
          color: getCategoryColorValue((c.category as CalendarCategory) || 'Personal'),
          email: c.accountEmail
      }));
      
      setCalendars(mappedCalendars);

      if (calendarConnections.length === 0) {
          setIsLoading(false);
          return;
      }

      // Set default selected calendar for creation
      if (mappedCalendars.length > 0 && !selectedCalendarId) {
          setSelectedCalendarId(mappedCalendars[0].id);
      }

      // Stop main loading spinner so UI is visible immediately
      setIsLoading(false);
      setIsSyncing(true);

      // 2. Fetch Events for each connection
      // Fetch events for the current month view with some buffer (±1 month for smoother navigation)
      const viewMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
      const viewMonthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 2, 0);
      
      const startDate = viewMonthStart.toISOString();
      const endDate = viewMonthEnd.toISOString();

      // Note: Don't reset events here to avoid flicker - progressive loading will update them
      // Fetch events for each connection in parallel but update state incrementally (Progressive Loading)
      const fetchPromises = calendarConnections.map(async (conn) => {
          try {
              // Add timestamp to prevent browser caching
              const data = await api.get<{ events: ApiEvent[] }>(`/api/calendar/events?connectionId=${conn.id}&startDate=${startDate}&endDate=${endDate}&_t=${Date.now()}`, { signal });
              
              const newEvents = data.events
                  .filter(e => e.start && (e.start.dateTime || e.start.date)) // Filter out events without valid start
                  .map(e => {
                  // Parse the start time to get the LOCAL date (not UTC)
                  // This ensures events are displayed on the correct day in the user's timezone
                  let eventDate = '';
                  if (e.start.dateTime) {
                      const localDate = new Date(e.start.dateTime);
                      const year = localDate.getFullYear();
                      const month = String(localDate.getMonth() + 1).padStart(2, '0');
                      const day = String(localDate.getDate()).padStart(2, '0');
                      eventDate = `${year}-${month}-${day}`;
                  } else if (e.start.date) {
                      // All-day events use YYYY-MM-DD format without timezone
                      eventDate = e.start.date;
                  }
                  
                  return {
                      id: e.id,
                      title: e.summary || 'No Title',
                      date: eventDate,
                      time: e.start.dateTime ? new Date(e.start.dateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'All Day',
                      participants: e.attendees?.map(a => a.email) || [], 
                      calendarId: conn.id,
                      platform: 'Google Meet',
                      description: e.description,
                      originalStart: e.start.dateTime || e.start.date
                  };
              });

              // Update state immediately when this calendar's events arrive
              setEventsByCalendar(prev => ({
                  ...prev,
                  [conn.id]: newEvents
              }));

          } catch (error: any) {
              if (error.name !== 'AbortError') {
                  // Check if it's a scope permission error that requires re-auth
                  const errorCode = error?.response?.data?.code;
                  const statusCode = error?.response?.status;
                  const errorMessage = error?.response?.data?.error || error?.message || '';
                  
                  // Trigger re-auth for scope errors (403 with SCOPE_REAUTH_REQUIRED or similar)
                  if ((statusCode === 403 && errorCode === 'SCOPE_REAUTH_REQUIRED') || 
                      (statusCode === 403 && errorMessage.includes('Insufficient scopes')) ||
                      (statusCode === 403 && errorCode === 'INSUFFICIENT_SCOPES')) {
                      console.log(`Re-authentication required for calendar: ${conn.id}`, { errorCode, errorMessage });
                      
                      // DO NOT automatically open popup. Just show notification.
                      showNotification("Please reconnect your calendar to update permissions", "error");
                  } else if (statusCode === 403 && errorMessage.includes('Access denied to this connection')) {
                      // This is a different 403 - connection belongs to another user
                      console.error(`Access denied to calendar ${conn.id}:`, error);
                      showNotification("Access denied to this calendar connection", "error");
                  } else {
                      console.error(`Failed to fetch events for calendar ${conn.id}:`, error);
                  }
              }
          }
      });

      // Wait for all to finish just to clear syncing state
      await Promise.all(fetchPromises);

    } catch (error: any) {
      if (error.name !== 'AbortError') {
          console.error("Failed to fetch calendar data", error);
          showNotification("Failed to fetch calendar data", "error");
      }
    } finally {
      if (!signal.aborted) {
          setIsLoading(false);
          setIsSyncing(false);
      }
    }
  };

  // One-time authentication check on component mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      // Clean up URL immediately
      window.history.replaceState({}, '', window.location.pathname);
      
      // Set linking state and show notification
      setIsLinking(true);
      showNotification("Connecting calendar account...", "success");
      
      // Retry fetching data until we get calendars or max retries
      let retries = 0;
      const maxRetries = 3; // Reduced from 5 - with cache clearing, should be faster
      const retryDelay = 200; // Reduced from 800ms - check more frequently
      
      const attemptFetch = async () => {
        try {
          const connections = await api.get<ApiConnection[]>('/api/connections');
          const hasCalendar = connections.some(c => c.service === 'CALENDAR');
          
          if (hasCalendar || retries >= maxRetries) {
            await fetchData();
            setIsLinking(false);
            if (hasCalendar) {
              showNotification("Calendar linked successfully!", "success");
            }
          } else {
            retries++;
            setTimeout(attemptFetch, retryDelay);
          }
        } catch (err) {
          // If API fails, still try fetchData
          await fetchData();
          setIsLinking(false);
        }
      };
      
      // Start immediately - backend now clears cache after OAuth
      attemptFetch();
    }
  }, []); // Empty dependency array for one-time mount

  // Fetch data when calendar month changes
  useEffect(() => {
    fetchData();
  }, [currentMonth]);

  const handleCancelEventClick = (id: string, calendarId: string) => {
      setEventToDelete({ id, calendarId });
      setIsDeleteModalOpen(true);
  };

  const confirmDeleteEvent = async () => {
      if (!eventToDelete) return;
      
      try {
          await api.delete(`/api/calendar/events/${eventToDelete.id}?connectionId=${eventToDelete.calendarId}`);

          setEventsByCalendar(prev => ({
              ...prev,
              [eventToDelete.calendarId]: prev[eventToDelete.calendarId]?.filter(e => e.id !== eventToDelete.id) || []
          }));
          
          setIsEditModalOpen(false);
          setIsDeleteModalOpen(false);
          setEventToDelete(null);
          showNotification("Event cancelled successfully", "success");
      } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          console.error("Failed to delete event:", errorMsg);
          showNotification("Failed to delete event", "error");
      }
  };

  const handleLinkCalendar = () => {
    // Redirect to Google OAuth with prompt=select_account to allow adding new accounts
    // Pass category in query param so backend can persist it in state
    window.location.href = `${import.meta.env.VITE_API_URL || ''}/auth/google?prompt=select_account&category=${linkCategory}&service=CALENDAR`;
  };

  // Auto-set end date when start date changes
  useEffect(() => {
      if (newEventDate) {
          setNewEventEndDate(newEventDate);
      }
  }, [newEventDate]);

  // Auto-set end time when start time changes
  useEffect(() => {
      if (newEventTime && !newEventEndTime) {
          // Default to 1 hour later
          const start = new Date(`${newEventDate || new Date().toISOString().split('T')[0]}T${newEventTime}`);
          const end = new Date(start.getTime() + 60 * 60 * 1000);
          setNewEventEndTime(end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false}));
      }
  }, [newEventTime, newEventDate]);

  const handleCreateEvent = async () => {
    if (!newEventTitle || !newEventDate || !newEventTime) return;
    
    if (calendars.length === 0) {
        showNotification("Please link a calendar first.", "error");
        return;
    }

    const connectionId = selectedCalendarId || calendars[0].id;

    const startTime = new Date(`${newEventDate}T${newEventTime}`).toISOString();
    const endTime = new Date(`${newEventEndDate || newEventDate}T${newEventEndTime || newEventTime}`).toISOString();

    // Parse participants
    const attendees = newEventParticipants.split(',').map(email => ({ email: email.trim() })).filter(a => a.email);

    try {
        await api.post('/api/calendar/events', {
            connectionId,
            summary: newEventTitle,
            startTime,
            endTime,
            description: '', // Description is separate now
            attendees
        });
        
        // Reload to fetch new event
        fetchData();
        setIsCreateModalOpen(false);
        
        // Reset form
        setNewEventTitle('');
        setNewEventDate('');
        setNewEventTime('');
        setNewEventEndDate('');
        setNewEventEndTime('');
        setNewEventParticipants('');
        showNotification("Event created successfully", "success");

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to create event:", errorMsg);
        showNotification("Failed to create event", "error");
    }
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEditEventTitle(event.title);
    setEditEventDate(event.date);
    
    // Convert "10:00 AM" back to "10:00" for input type="time" if possible, or just keep string if it's custom
    // For simplicity in this demo, we might just set the string directly or try to parse.
    // Input type="time" expects HH:MM in 24h.
    let timeValue = event.time;
    if (event.time.includes('AM') || event.time.includes('PM')) {
        const [timePart, modifier] = event.time.split(' ');
        const [hoursStr, minutes] = timePart.split(':');
        let hours = hoursStr;
        if (hours === '12') hours = '00';
        if (modifier === 'PM') hours = (parseInt(hours, 10) + 12).toString();
        timeValue = `${hours.padStart(2, '0')}:${minutes}`;
    }
    setEditEventTime(timeValue);
    
    // Set end time (default +1h if not available in event object yet - ideally we should fetch full event details)
    // For now, let's just default to start + 1h
    const start = new Date(`${event.date}T${timeValue}`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setEditEventEndDate(event.date);
    setEditEventEndTime(end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false}));

    setEditEventParticipants(event.participants.join(', '));
    setIsEditModalOpen(true);
  };

  const handleUpdateEvent = async () => {
      if (!selectedEvent || !editEventTitle || !editEventDate || !editEventTime) return;

      const startTime = new Date(`${editEventDate}T${editEventTime}`).toISOString();
      const endTime = new Date(`${editEventEndDate || editEventDate}T${editEventEndTime || editEventTime}`).toISOString();
      
      // Parse participants
      const attendees = editEventParticipants.split(',').map(email => ({ email: email.trim() })).filter(a => a.email);

      try {
          await api.put(`/api/calendar/events/${selectedEvent.id}`, {
              connectionId: selectedEvent.calendarId,
              summary: editEventTitle,
              startTime,
              endTime,
              description: '', // Description separate
              attendees
          });

          // Reload to fetch updated event
          fetchData();
          setIsEditModalOpen(false);
          showNotification("Event updated successfully", "success");

      } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          console.error("Failed to update event:", errorMsg);
          showNotification("Failed to update event", "error");
      }
  };



  const getCategoryColor = (category: string) => {
    switch(category) {
      case 'Work': return 'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-500/20';
      case 'Personal': return 'bg-productivity-100 dark:bg-productivity-500/10 text-productivity-700 dark:text-productivity-300 border-productivity-200 dark:border-productivity-500/20';
      case 'Family': return 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20';
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  const getEventBorderColor = (calendarId: string) => {
    const cal = calendars.find(c => c.id === calendarId);
    const color = cal?.color || 'slate';
    if (color === 'violet') return 'border-l-violet-500';
    if (color === 'productivity') return 'border-l-productivity-500';
    if (color === 'emerald') return 'border-l-emerald-500';
    return 'border-l-slate-400';
  };

  // Base filter by category
  const categoryFilteredEvents = events.filter(e => {
    if (filterCategory === 'All') return true;
    const cal = calendars.find(c => c.id === e.calendarId);
    return cal?.category === filterCategory;
  });

  // Filter for list view (upcoming only)
  const upcomingEvents = categoryFilteredEvents.filter(e => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [y, m, d] = e.date.split('-').map(Number);
    const eventDateLocal = new Date(y, m - 1, d);
    
    return eventDateLocal >= today;
  });

  // Select events based on view mode: List shows upcoming only, Calendar shows all
  const filteredEvents = viewMode === 'list' ? upcomingEvents : categoryFilteredEvents;

  // Calendar Grid Helpers
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    
    const startDay = firstDay.getDay(); // 0 = Sunday
    for(let i = 0; i < startDay; i++) {
        days.push(null); 
    }
    
    for(let i = 1; i <= lastDay.getDate(); i++) {
        days.push(new Date(year, month, i));
    }
    
    return days;
  };

  const renderCalendarView = () => {
    const days = getDaysInMonth(currentMonth);
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));

    return (
        <div className="p-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h3>
                <div className="flex gap-2">
                    <button onClick={prevMonth} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                    <button onClick={nextMonth} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"><ChevronRight className="w-5 h-5" /></button>
                </div>
            </div>
            
            <div className="grid grid-cols-7 mb-2">
                {weekDays.map(d => <div key={d} className="text-center text-xs font-bold text-slate-400 uppercase tracking-wider py-2">{d}</div>)}
            </div>

            <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                {days.map((date, idx) => {
                    if (!date) return <div key={`empty-${idx}`} className="bg-slate-50 dark:bg-slate-900/50 min-h-[100px] md:min-h-[120px]"></div>;
                    
                    // Construct local date string YYYY-MM-DD
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const localDateStr = `${year}-${month}-${day}`;

                    const dayEvents = filteredEvents.filter(e => e.date === localDateStr);
                    const isToday = new Date().toDateString() === date.toDateString();

                    return (
                        <div key={idx} className={`bg-white dark:bg-slate-900 min-h-[100px] md:min-h-[120px] p-1 flex flex-col hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${isToday ? 'bg-productivity-50/30 dark:bg-productivity-500/10' : ''}`}>
                            <div className={`text-xs font-bold mb-1 w-6 h-6 flex items-center justify-center rounded-full mx-auto mt-1 ${isToday ? 'bg-productivity-600 text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                                {date.getDate()}
                            </div>
                            <div className="flex-1 overflow-y-auto px-1 custom-scrollbar">
                                {dayEvents.map(ev => {
                                     const cal = calendars.find(c => c.id === ev.calendarId);
                                     return (
                                         <button 
                                            key={ev.id} 
                                            onClick={() => handleEventClick(ev)}
                                            className={`w-full text-left text-[11px] font-medium px-2 py-1 rounded-md truncate mb-1 shadow-sm transition-all hover:opacity-90 ${
                                            cal?.category === 'Work' ? 'bg-violet-200 dark:bg-violet-500/40 text-violet-900 dark:text-violet-100' :
                                            cal?.category === 'Personal' ? 'bg-productivity-200 dark:bg-productivity-500/40 text-productivity-900 dark:text-productivity-100' :
                                            'bg-emerald-200 dark:bg-emerald-500/40 text-emerald-900 dark:text-emerald-100'
                                         }`}>
                                            <span className="opacity-75 text-[10px] mr-1">{ev.time.replace(/\s[AP]M/, '').trim()}</span>
                                            {ev.title}
                                         </button>
                                     )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    );
  };

  const [visibleEvents, setVisibleEvents] = useState(25);

  const renderListView = () => (
    <div className="divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in slide-in-from-bottom-4">
        {isLinking ? (
            <div className="flex flex-col items-center justify-center p-12">
                <ProductivityLoader fullScreen={false} text="Connecting Calendar Account" />
            </div>
        ) : isLoading ? (
            <div className="flex flex-col items-center justify-center p-12">
                <ProductivityLoader fullScreen={false} text="Loading events..." />
            </div>
        ) : filteredEvents.length === 0 ? (
            isSyncing ? (
                <div className="flex flex-col items-center justify-center p-12">
                    <ProductivityLoader fullScreen={false} text="Syncing calendars..." />
                </div>
            ) : (
                <div className="p-8 text-center text-slate-500">No upcoming events for this selection.</div>
            )
        ) : (
            <>
            {filteredEvents.slice(0, visibleEvents).map(event => {
            const calendar = calendars.find(c => c.id === event.calendarId);
            return (
              <div 
                key={event.id} 
                onClick={() => handleEventClick(event)}
                className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer"
              >
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                      {/* Date Box */}
                      <div className="flex-shrink-0 w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-xl flex flex-col items-center justify-center border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                          <span className="text-xs font-bold uppercase">{new Date(event.date).toLocaleString('default', { month: 'short' })}</span>
                          <span className="text-xl font-bold">{new Date(event.date).getDate()}</span>
                      </div>
                      
                      <div className={`flex-grow pl-4 border-l-4 ${getEventBorderColor(event.calendarId)}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{event.title}</h3>
                            {calendar && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                                calendar.category === 'Work' ? 'text-violet-700 bg-violet-100 dark:bg-violet-900/40 dark:text-violet-200' :
                                calendar.category === 'Personal' ? 'text-productivity-700 bg-productivity-100 dark:bg-productivity-900/40 dark:text-productivity-200' :
                                'text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200'
                              }`}>
                                {calendar.category}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  {event.time}
                              </span>
                              <span className="flex items-center gap-1">
                                  <Video className="w-4 h-4" />
                                  {event.platform}
                              </span>
                          </div>
                      </div>

                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                          <button 
                              onClick={(e) => {
                                  e.stopPropagation();
                                  handleCancelEventClick(event.id, event.calendarId);
                              }}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" 
                              title="Cancel Event"
                          >
                              <Trash2 className="w-5 h-5" />
                          </button>
                      </div>
                  </div>
              </div>
            );
        })}
        {visibleEvents < filteredEvents.length && (
            <div className="p-4 text-center">
                <button 
                    onClick={() => setVisibleEvents(prev => prev + 25)}
                    className="text-sm text-productivity-600 dark:text-productivity-400 hover:underline font-medium"
                >
                    Load More
                </button>
            </div>
        )}
        </>
        )}
    </div>
  );

  return (
    <div className="p-6 lg:p-10 h-full overflow-y-auto relative">
      
      {notification && (
        <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 shadow-sm animate-in slide-in-from-top-2 ${
            notification.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-200 border border-green-200 dark:border-green-800' 
            : 'bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 border border-red-200 dark:border-red-800'
        }`}>
           {notification.type === 'success' ? <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" /> : <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />}
           <p className="font-medium">{notification.message}</p>
           <button onClick={() => setNotification(null)} className="ml-auto p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors">
               <X className="w-4 h-4" />
           </button>
        </div>
      )}

      <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Calendar</h1>
            <p className="text-slate-500 dark:text-slate-400">Manage your schedule and connected calendars.</p>
        </div>
        <div className="flex gap-3">
           <button 
              onClick={() => fetchData()}
              className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-2"
              title="Refresh Calendar"
           >
              <RefreshCw className={`w-5 h-5 ${isLoading || isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing && <span className="text-xs font-medium text-slate-400">Syncing...</span>}
           </button>
           <button 
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-productivity-600 hover:bg-productivity-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-productivity-500/20"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">Create Event</span>
           </button>
           <button 
              onClick={() => setIsLinkModalOpen(true)}
              className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 transition-colors shadow-sm"
            >
              <LinkIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
              <span className="hidden sm:inline">Link Calendar</span>
           </button>
        </div>
      </header>

      {/* Connected Calendars Grid */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
           Connected Accounts
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {calendars.map(cal => (
            <div key={cal.id} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none flex flex-col gap-3 hover:border-productivity-500/50 dark:hover:border-productivity-500/50 transition-colors">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 overflow-hidden">
                        <div className={`w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center ${getCategoryColor(cal.category)} border-0`}>
                            <CalendarIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate" title={cal.email}>{cal.email || cal.provider}</h3>
                            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-0.5">
                                <CheckCircle className="w-3 h-3" /> Synced {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </p>
                        </div>
                    </div>
                    {/* Category Badge */}
                    <div className={`text-xs font-medium px-2.5 py-1 rounded-lg border flex-shrink-0 ${getCategoryColor(cal.category)}`}>
                        {cal.category}
                    </div>
                </div>
                <button 
                    onClick={() => handleDisconnect(cal.id)}
                    className="w-full py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800/50"
                >
                    Disconnect
                </button>
            </div>
          ))}
        </div>
      </section>

      {/* Events Section (List or Grid) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col shadow-sm dark:shadow-none">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              Upcoming Events
              <span className="text-xs font-normal text-slate-500 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-full">{filteredEvents.length}</span>
            </h2>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
                {/* View Toggle */}
                <div className="flex p-1 bg-slate-200 dark:bg-slate-700 rounded-lg">
                    <button 
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        title="List View"
                    >
                        <LayoutList className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => setViewMode('calendar')}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'calendar' ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                        title="Calendar View"
                    >
                        <Grid3X3 className="w-4 h-4" />
                    </button>
                </div>

                {/* Filter */}
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <select 
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value as CalendarCategory | 'All')}
                        className="appearance-none bg-white dark:bg-dark-bg border border-slate-200 dark:border-slate-700 rounded-lg text-sm pl-8 pr-8 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-productivity-500/20"
                        >
                            <option value="All">All Categories</option>
                            {allCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    </div>
                </div>
            </div>
        </div>
        
        {viewMode === 'list' ? renderListView() : renderCalendarView()}
      </div>

      {/* Link Calendar Modal */}
      {isLinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border p-6 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Link New Calendar</h2>
                    <button onClick={() => setIsLinkModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Provider</label>
                        <select 
                          value={linkProvider}
                          onChange={(e) => setLinkProvider(e.target.value)}
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                        >
                            <option>Google Calendar</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {['Personal', 'Work', 'Family', 'Other'].map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => {
                                        setLinkCategory(cat as CalendarCategory);
                                        setUseCustomCategory(false);
                                        setCustomCategory('');
                                    }}
                                    className={`p-2 rounded-lg text-sm font-medium border transition-colors ${
                                        linkCategory === cat && !useCustomCategory
                                        ? 'bg-productivity-50 dark:bg-productivity-900/20 border-productivity-500 text-productivity-700 dark:text-productivity-400' 
                                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                        
                        {/* Custom Category Input */}
                        <div className="mt-3">
                            <div className="flex items-center gap-2 mb-2">
                                <input
                                    type="checkbox"
                                    id="useCustomCategory"
                                    checked={useCustomCategory}
                                    onChange={(e) => {
                                        setUseCustomCategory(e.target.checked);
                                        if (e.target.checked && customCategory) {
                                            setLinkCategory(customCategory);
                                        }
                                    }}
                                    className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-productivity-500 focus:ring-productivity-500"
                                />
                                <label htmlFor="useCustomCategory" className="text-sm text-slate-600 dark:text-slate-400">
                                    Use custom category
                                </label>
                            </div>
                            {useCustomCategory && (
                                <input
                                    type="text"
                                    placeholder="Enter custom category name..."
                                    value={customCategory}
                                    onChange={(e) => {
                                        setCustomCategory(e.target.value);
                                        if (e.target.value.trim()) {
                                            setLinkCategory(e.target.value.trim());
                                        }
                                    }}
                                    className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-productivity-500 outline-none"
                                />
                            )}
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button 
                          onClick={() => setIsLinkModalOpen(false)}
                          className="flex-1 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                          onClick={handleLinkCalendar}
                          className="flex-1 py-2.5 bg-productivity-600 hover:bg-productivity-500 text-white font-medium rounded-xl shadow-lg shadow-productivity-500/25 transition-colors"
                        >
                            Connect Google Account
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Create Event Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border p-6 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">New Event</h2>
                    <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Calendar</label>
                        <select 
                          value={selectedCalendarId}
                          onChange={(e) => setSelectedCalendarId(e.target.value)}
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                        >
                            {calendars.map(cal => (
                                <option key={cal.id} value={cal.id}>
                                    {cal.email || cal.provider} ({cal.category})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Event Title</label>
                        <input 
                          type="text"
                          value={newEventTitle}
                          onChange={(e) => setNewEventTitle(e.target.value)}
                          placeholder="e.g. Team Sync"
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date</label>
                            <input 
                              type="date"
                              value={newEventDate}
                              onChange={(e) => setNewEventDate(e.target.value)}
                              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none [color-scheme:light] dark:[color-scheme:dark]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Time</label>
                            <input 
                              type="time"
                              value={newEventTime}
                              onChange={(e) => setNewEventTime(e.target.value)}
                              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none [color-scheme:light] dark:[color-scheme:dark]"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End Date</label>
                            <input 
                              type="date"
                              value={newEventEndDate}
                              onChange={(e) => setNewEventEndDate(e.target.value)}
                              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none [color-scheme:light] dark:[color-scheme:dark]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End Time</label>
                            <input 
                              type="time"
                              value={newEventEndTime}
                              onChange={(e) => setNewEventEndTime(e.target.value)}
                              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none [color-scheme:light] dark:[color-scheme:dark]"
                            />
                        </div>
                    </div>

                     <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Participants</label>
                        <input 
                          type="text"
                          value={newEventParticipants}
                          onChange={(e) => setNewEventParticipants(e.target.value)}
                          placeholder="Comma separated names"
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                        />
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button 
                          onClick={() => setIsCreateModalOpen(false)}
                          className="flex-1 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                          onClick={handleCreateEvent}
                          disabled={!newEventTitle || !newEventDate || !newEventTime}
                          className="flex-1 py-2.5 bg-productivity-600 hover:bg-productivity-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-lg shadow-productivity-500/25 transition-colors"
                        >
                            Create Event
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {isEditModalOpen && selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border p-6 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Edit Event</h2>
                    <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Event Title</label>
                        <input 
                          type="text"
                          value={editEventTitle}
                          onChange={(e) => setEditEventTitle(e.target.value)}
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date</label>
                            <input 
                              type="date"
                              value={editEventDate}
                              onChange={(e) => setEditEventDate(e.target.value)}
                              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none [color-scheme:light] dark:[color-scheme:dark]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Time</label>
                            <input 
                              type="time"
                              value={editEventTime}
                              onChange={(e) => setEditEventTime(e.target.value)}
                              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none [color-scheme:light] dark:[color-scheme:dark]"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End Date</label>
                            <input 
                              type="date"
                              value={editEventEndDate}
                              onChange={(e) => setEditEventEndDate(e.target.value)}
                              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none [color-scheme:light] dark:[color-scheme:dark]"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End Time</label>
                            <input 
                              type="time"
                              value={editEventEndTime}
                              onChange={(e) => setEditEventEndTime(e.target.value)}
                              className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none [color-scheme:light] dark:[color-scheme:dark]"
                            />
                        </div>
                    </div>

                     <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Participants</label>
                        <div className="relative">
                            <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input 
                            type="text"
                            value={editEventParticipants}
                            onChange={(e) => setEditEventParticipants(e.target.value)}
                            className="w-full p-3 pl-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                         <button 
                          onClick={() => handleCancelEventClick(selectedEvent.id, selectedEvent.calendarId)}
                          className="px-4 py-2.5 text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800/50 font-medium rounded-xl transition-colors flex items-center justify-center"
                          title="Delete Event"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={handleUpdateEvent}
                          disabled={!editEventTitle || !editEventDate || !editEventTime}
                          className="flex-1 py-2.5 bg-productivity-600 hover:bg-productivity-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-lg shadow-productivity-500/25 transition-colors flex items-center justify-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-dark-surface w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border p-6 animate-in fade-in zoom-in duration-200">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Cancel Event?</h2>
                <p className="text-slate-500 dark:text-slate-400 mb-6">
                    Are you sure you want to cancel this event? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setIsDeleteModalOpen(false)}
                        className="flex-1 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    >
                        No, Keep it
                    </button>
                    <button 
                        onClick={confirmDeleteEvent}
                        className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl shadow-lg shadow-red-500/25 transition-colors"
                    >
                        Yes, Cancel Event
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
