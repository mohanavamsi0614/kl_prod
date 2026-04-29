import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

interface DashboardLayoutProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onLogout: () => void;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ theme, toggleTheme, onLogout }) => {
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
