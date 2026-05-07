import React, { useEffect, useState, useCallback } from 'react';
import { Calendar, Mail, CheckSquare, Clock, TrendingUp, ArrowRight, Zap, Circle, Brain } from 'lucide-react';
import { api } from '../../lib/api';
import type { Task, CalendarEvent } from '../../types';

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: 'bg-red-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-slate-300'
};

interface DashboardState {
  tasks: Task[];
  events: CalendarEvent[];
  unreadEmailCount: number;
  isLoading: boolean;
}

const DashboardPage: React.FC = () => {
  const [data, setData] = useState<DashboardState>({
    tasks: [],
    events: [],
    unreadEmailCount: 0,
    isLoading: true
  });

  const fetchDashboardData = useCallback(async () => {
    try {
      // Fetch tasks and unified dashboard summary in parallel
      const [tasksRes, summaryRes] = await Promise.allSettled([
        api.get<{ tasks: Task[] }>('/api/tasks/me'),
        api.get<{ events: CalendarEvent[], unreadEmailCount: number }>('/api/dashboard/summary')
      ]);

      setData(prev => ({
        ...prev,
        tasks: tasksRes.status === 'fulfilled' ? tasksRes.value.tasks || [] : [],
        events: summaryRes.status === 'fulfilled' ? summaryRes.value.events || [] : [],
        unreadEmailCount: summaryRes.status === 'fulfilled' ? summaryRes.value.unreadEmailCount : 0,
        isLoading: false
      }));
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      setData(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Derived Metrics
  const totalTasks = data.tasks.length;
  const completedTasks = data.tasks.filter(t => t.status === 'COMPLETED').length;
  const taskProgress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  const unreadEmails = data.unreadEmailCount;
  
  // Get today's events (filter by today's date)
  const todayStr = new Date().toISOString().split('T')[0];
  
  const todayEvents = data.events
    .filter(event => {
      // Use originalStart (ISO string) or date (YYYY-MM-DD format)
      const eventDate = event.originalStart 
        ? new Date(event.originalStart).toISOString().split('T')[0]
        : event.date;
      return eventDate === todayStr;
    })
    .slice(0, 4);

  const meetingHours = todayEvents.length; // 1 hour per meeting approximation
  const workDayHours = 8;
  const focusHours = Math.max(0, workDayHours - meetingHours);

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="p-6 lg:p-10 h-full overflow-y-auto relative bg-slate-50 dark:bg-dark-bg transition-colors">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-1">{greeting}, Alex</h1>
            <p className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
               <TrendingUp className="w-4 h-4 text-green-500" /> 
               Your productivity score is up 12% this week.
            </p>
        </div>
        <div className="text-right hidden md:block">
             <p className="text-2xl font-bold text-slate-900 dark:text-white">
                 {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
             </p>
             <p className="text-slate-400 text-sm">
                 {todayEvents.length} meetings • {data.tasks.filter(t => t.status !== 'COMPLETED').length} pending tasks
             </p>
        </div>
      </header>

      {/* Insights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          
          {/* Task Progress Card */}
          <div className="bg-white dark:bg-dark-surface border border-slate-200 dark:border-slate-700/50 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
               <div className="flex justify-between items-start mb-4">
                   <div>
                       <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Task Completion</h3>
                       <div className="text-3xl font-bold text-slate-900 dark:text-white">{taskProgress}%</div>
                   </div>
                   <div className="p-2 bg-emerald-100 dark:bg-emerald-500/20 rounded-lg text-emerald-600 dark:text-emerald-400">
                       <CheckSquare className="w-5 h-5" />
                   </div>
               </div>
               {/* Progress Bar */}
               <div className="w-full bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                   <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${taskProgress}%` }}></div>
               </div>
               <p className="text-xs text-slate-400 mt-3">{completedTasks} of {totalTasks} tasks completed</p>
          </div>

          {/* Focus Time Card */}
          <div className="bg-white dark:bg-dark-surface border border-slate-200 dark:border-slate-700/50 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
               <div className="flex justify-between items-start mb-4">
                   <div>
                       <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Focus Time</h3>
                       <div className="text-3xl font-bold text-slate-900 dark:text-white">{focusHours}h</div>
                   </div>
                   <div className="p-2 bg-violet-100 dark:bg-violet-500/20 rounded-lg text-violet-600 dark:text-violet-400">
                       <Brain className="w-5 h-5" />
                   </div>
               </div>
               {/* Visual Indicator */}
               <div className="flex gap-1 mt-2">
                   {[...Array(8)].map((_, i) => (
                       <div key={i} className={`h-2 flex-1 rounded-full ${i < meetingHours ? 'bg-red-300 dark:bg-red-900/50' : 'bg-violet-500'}`} title={i < meetingHours ? 'Meeting' : 'Focus'} />
                   ))}
               </div>
               <p className="text-xs text-slate-400 mt-3">Available focus hours today</p>
          </div>

          {/* Inbox Health Card */}
          <div className="bg-white dark:bg-dark-surface border border-slate-200 dark:border-slate-700/50 p-6 rounded-2xl shadow-sm relative overflow-hidden group">
               <div className="flex justify-between items-start mb-4">
                   <div>
                       <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">Inbox Health</h3>
                       <div className="text-3xl font-bold text-slate-900 dark:text-white">{unreadEmails}</div>
                   </div>
                   <div className="p-2 bg-sky-100 dark:bg-sky-500/20 rounded-lg text-sky-600 dark:text-sky-400">
                       <Mail className="w-5 h-5" />
                   </div>
               </div>
               <div className="flex items-center gap-2 mt-1">
                   <div className={`px-2 py-0.5 rounded text-xs font-medium ${unreadEmails === 0 ? 'bg-emerald-100 text-emerald-700' : unreadEmails < 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                       {unreadEmails === 0 ? 'Inbox Zero' : unreadEmails < 5 ? 'Manageable' : 'Needs Attention'}
                   </div>
               </div>
               <p className="text-xs text-slate-400 mt-3">Unread messages</p>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: AI Summary + Schedule */}
          <div className="lg:col-span-2 space-y-6">


              {/* Today's Agenda */}
              <div className="bg-white dark:bg-dark-surface border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-productivity-500" /> Today's Agenda
                      </h2>
                      <button className="text-sm text-productivity-600 font-medium hover:underline">View Calendar</button>
                  </div>
                  
                  <div className="relative space-y-0">
                      {/* Vertical Line */}
                      <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-slate-100 dark:bg-slate-800" />

                      {todayEvents.length === 0 ? (
                          <div className="text-center py-8 text-slate-500">No meetings scheduled for today.</div>
                      ) : todayEvents.map((event, idx) => {
                          // Mock styling for "now", "past", "future"
                          const status = idx === 0 ? 'active' : 'future'; 
                          
                          return (
                              <div key={event.id} className="relative pl-10 py-3 group">
                                  {/* Dot */}
                                  <div className={`absolute left-[11px] top-5 w-3 h-3 rounded-full border-2 border-white dark:border-dark-surface transition-colors ${status === 'active' ? 'bg-productivity-500 ring-4 ring-productivity-100 dark:ring-productivity-900/30' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                  
                                  <div className={`p-4 rounded-xl border transition-all ${status === 'active' ? 'bg-white dark:bg-slate-800/50 border-productivity-200 dark:border-productivity-900/30 shadow-sm' : 'bg-transparent border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/30'}`}>
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                          <div>
                                              <h4 className={`font-semibold ${status === 'active' ? 'text-productivity-700 dark:text-productivity-400' : 'text-slate-900 dark:text-white'}`}>
                                                  {event.title}
                                              </h4>
                                              <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 mt-1">
                                                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {event.time}</span>
                                                  <span>•</span>
                                                  <span>{event.platform}</span>
                                              </div>
                                          </div>
                                          
                                          {/* Participants Avatars */}
                                          <div className="flex -space-x-2">
                                              {event.participants.map((p, i) => (
                                                  <div key={i} className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 border-2 border-white dark:border-slate-800 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300" title={p}>
                                                      {p[0]}
                                                  </div>
                                              ))}
                                              {event.participants.length === 0 && (
                                                   <div className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs text-slate-500">No participants</div>
                                              )}
                                          </div>
                                      </div>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              </div>
          </div>

          {/* Right Column: Priorities & Tasks */}
          <div className="space-y-6">
              
              {/* Priority Tasks */}
              <div className="bg-white dark:bg-dark-surface border border-slate-200 dark:border-slate-700/50 rounded-2xl p-6">
                   <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                       <Zap className="w-5 h-5 text-amber-500" /> Priorities
                   </h2>
                   <div className="space-y-3">
                       {data.tasks.filter(t => t.status !== 'COMPLETED').slice(0, 4).map(task => {
                           return (
                           <div key={task.id} className="flex items-start gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors">
                               <button className="mt-0.5 text-slate-400 hover:text-emerald-500 transition-colors">
                                   <Circle className="w-5 h-5" />
                               </button>
                               <div className="flex-1">
                                   <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-tight">{task.title}</p>
                                   <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                                       <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority] || 'bg-slate-300'}`} />
                                       {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No date'}
                                   </p>
                               </div>
                           </div>
                           );
                       })}
                       {data.tasks.filter(t => t.status !== 'COMPLETED').length === 0 && (
                           <div className="text-center text-slate-500 py-4 text-sm">All caught up!</div>
                       )}
                       <button className="w-full mt-2 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center justify-center gap-2">
                           <ArrowRight className="w-4 h-4" /> View all tasks
                       </button>
                   </div>
              </div>

               {/* Quick Actions Card */}
               <div className="rounded-2xl p-6 shadow-sm dark:shadow-lg bg-white dark:bg-gradient-to-br dark:from-productivity-600 dark:to-violet-600 border border-slate-200 dark:border-none">
                  <h3 className="font-bold text-lg mb-2 text-slate-900 dark:text-white">Productivity Assist</h3>
                  <p className="text-slate-500 dark:text-white/80 text-sm mb-4">I can help you organize your afternoon.</p>
                  <div className="space-y-2">
                      <button className="w-full rounded-lg p-3 text-left text-sm font-medium transition-colors flex items-center gap-2 bg-slate-50 dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white">
                          <Clock className="w-4 h-4 text-productivity-600 dark:text-white/90" /> Find 1h focus time
                      </button>
                      <button className="w-full rounded-lg p-3 text-left text-sm font-medium transition-colors flex items-center gap-2 bg-slate-50 dark:bg-white/10 hover:bg-slate-100 dark:hover:bg-white/20 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white">
                          <Mail className="w-4 h-4 text-productivity-600 dark:text-white/90" /> Draft replies to unread
                      </button>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default DashboardPage;
