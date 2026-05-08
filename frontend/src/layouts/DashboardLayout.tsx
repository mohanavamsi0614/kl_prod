import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { initSocket, disconnectSocket } from '../lib/socket';
import { toast } from 'sonner';

interface DashboardLayoutProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onLogout: () => void;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ theme, toggleTheme, onLogout }) => {
  useEffect(() => {
    // Initialize socket globally for the authenticated session
    const socket = initSocket(''); // Uses cookie-based auth
    
    socket.on('new_mail', (mail: any) => {
      toast.success(`New Email: ${mail.subject}`, {
        description: `From: ${mail.from}`,
        action: {
          label: 'View',
          onClick: () => window.location.href = '/dashboard/email'
        }
      });
    });

    return () => {
      disconnectSocket();
    };
  }, []);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-dark-bg overflow-hidden transition-colors duration-300">
      <Sidebar theme={theme} toggleTheme={toggleTheme} onLogout={onLogout} />
      <main className="flex-1 overflow-auto">
        <div className="p-0 h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
