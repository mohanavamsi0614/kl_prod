import React, { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onClose: () => void;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClose
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selecting, setSelecting] = useState<'start' | 'end'>('start');
  const modalRef = useRef<HTMLDivElement>(null);

  // Parse dates for comparison - ensure local timezone by appending time
  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T00:00:00`) : null;

  // Close modal on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Close modal on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const getDaysInMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date): number => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const handleDayClick = (day: number) => {
    const selectedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    // Format date in local timezone to avoid off-by-one day errors
    const dateString = [
      selectedDate.getFullYear(),
      String(selectedDate.getMonth() + 1).padStart(2, '0'),
      String(selectedDate.getDate()).padStart(2, '0'),
    ].join('-');

    if (selecting === 'start') {
      onStartDateChange(dateString);
      // Auto-switch to end date selection if start is set
      if (!end || selectedDate < end) {
        setSelecting('end');
      }
    } else {
      onEndDateChange(dateString);
      // Auto-switch back to start if end is before start
      if (start && selectedDate < start) {
        onStartDateChange(dateString);
        onEndDateChange(startDate);
      }
    }
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const isDateInRange = (day: number): boolean => {
    if (!start || !end) return false;
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    return date >= start && date <= end;
  };

  const isDateStart = (day: number): boolean => {
    if (!start) return false;
    return (
      day === start.getDate() &&
      currentMonth.getMonth() === start.getMonth() &&
      currentMonth.getFullYear() === start.getFullYear()
    );
  };

  const isDateEnd = (day: number): boolean => {
    if (!end) return false;
    return (
      day === end.getDate() &&
      currentMonth.getMonth() === end.getMonth() &&
      currentMonth.getFullYear() === end.getFullYear()
    );
  };

  const daysInMonth = getDaysInMonth(currentMonth);
  const firstDay = getFirstDayOfMonth(currentMonth);
  const days = [];

  // Empty cells for days before month starts
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }

  // Days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const monthYear = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
      <div
        ref={modalRef}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-productivity-600 to-productivity-500 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Select Date Range</h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Date Display */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                Start Date
              </label>
              <div
                onClick={() => setSelecting('start')}
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  selecting === 'start'
                    ? 'border-productivity-500 bg-productivity-50 dark:bg-productivity-500/10'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {formatDate(startDate) || 'Not selected'}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
                End Date
              </label>
              <div
                onClick={() => setSelecting('end')}
                className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  selecting === 'end'
                    ? 'border-productivity-500 bg-productivity-50 dark:bg-productivity-500/10'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                }`}
              >
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {formatDate(endDate) || 'Not selected'}
                </p>
              </div>
            </div>
          </div>

          {/* Calendar */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 mb-4">
            {/* Month/Year Navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={handlePrevMonth}
                className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              </button>
              <h3 className="font-semibold text-slate-900 dark:text-white text-center min-w-40">
                {monthYear}
              </h3>
              <button
                onClick={handleNextMonth}
                className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              </button>
            </div>

            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-xs font-semibold text-slate-600 dark:text-slate-400 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-2">
              {days.map((day, idx) => (
                <button
                  key={idx}
                  onClick={() => day && handleDayClick(day)}
                  disabled={!day}
                  className={`aspect-square rounded-lg text-sm font-medium transition-all ${
                    !day
                      ? 'bg-transparent'
                      : isDateStart(day) || isDateEnd(day)
                      ? 'bg-productivity-600 text-white hover:bg-productivity-700 shadow-md'
                      : isDateInRange(day)
                      ? 'bg-productivity-100 dark:bg-productivity-500/20 text-productivity-900 dark:text-productivity-200'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium transition-colors"
            >
              Done
            </button>
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  onStartDateChange('');
                  onEndDateChange('');
                }}
                className="px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DateRangePicker;
