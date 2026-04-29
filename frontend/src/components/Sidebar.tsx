import React, { useMemo, memo, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  MessageSquare, 
  Puzzle, 
  Settings, 
  LogOut, 
  Sun, 
  Moon, 
  Calendar as CalendarIcon, 
  Mail, 
  Users, 
  CheckSquare, 
  FolderOpen,
  LifeBuoy,
  Activity
} from 'lucide-react';
import { Sidebar, SidebarBody, SidebarLink } from './ui/AnimatedSidebar';
import { motion } from 'framer-motion';
import { apiCounter } from '../lib/api';

interface SidebarProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onLogout: () => void;
}

const ProductivityLogo = memo(() => (
  <svg viewBox="0 0 100 100" className="w-7 h-7 flex-shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="outerGrad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#0891b2" />
      </linearGradient>
      <linearGradient id="innerGrad" x1="30" y1="30" x2="70" y2="70" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#a5f3fc" />
        <stop offset="100%" stopColor="#22d3ee" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#outerGrad)" />
    <circle cx="50" cy="50" r="24" fill="url(#innerGrad)" filter="url(#glow)" />
    <circle cx="50" cy="50" r="48" stroke="white" strokeOpacity="0.1" strokeWidth="1" />
  </svg>
));

ProductivityLogo.displayName = 'ProductivityLogo';

const Logo = memo(() => (
  <div className="flex items-center gap-2 py-1">
    <div className="flex-shrink-0 hover:scale-105 transition-transform duration-300">
      <ProductivityLogo />
    </div>
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-productivity-600 to-productivity-500 dark:from-productivity-400 dark:to-productivity-200 tracking-tight whitespace-pre"
    >
      Productivity
    </motion.span>
  </div>
));

Logo.displayName = 'Logo';

const LogoIcon = memo(() => (
  <div className="flex items-center justify-center py-1">
    <div className="flex-shrink-0 hover:scale-105 transition-transform duration-300">
      <ProductivityLogo />
    </div>
  </div>
));

LogoIcon.displayName = 'LogoIcon';

const AppSidebar: React.FC<SidebarProps> = memo(({ theme, toggleTheme, onLogout }) => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [apiRequestCount, setApiRequestCount] = useState(0);

  // Subscribe to API counter updates
  useEffect(() => {
    const unsubscribe = apiCounter.subscribe(setApiRequestCount);
    return () => { unsubscribe(); };
  }, []);

  const navItems = useMemo(() => [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { path: '/dashboard/calendar', icon: CalendarIcon, label: 'Calendar' },
    { path: '/dashboard/tasks', icon: CheckSquare, label: 'Tasks' },
    { path: '/dashboard/email', icon: Mail, label: 'Email' },
    { path: '/dashboard/files', icon: FolderOpen, label: 'Files' },
    { path: '/dashboard/contacts', icon: Users, label: 'Contacts' },
    { path: '/dashboard/chat', icon: MessageSquare, label: 'Chat with Productivity' },
    { path: '/dashboard/integrations', icon: Puzzle, label: 'Integrations' },
    { path: '/dashboard/help', icon: LifeBuoy, label: 'Help & Feedback' },
    { path: '/dashboard/settings', icon: Settings, label: 'Settings' },
  ], []);

  const links = useMemo(() => navItems.map(item => {
    const isActive = item.end 
      ? location.pathname === item.path
      : location.pathname.startsWith(item.path);
    
    return {
      label: item.label,
      href: item.path,
      icon: (
        <item.icon 
          className={`h-5 w-5 flex-shrink-0 ${
            isActive 
              ? 'text-productivity-600 dark:text-productivity-500' 
              : 'text-slate-500 dark:text-slate-400 group-hover/sidebar:text-slate-700 dark:group-hover/sidebar:text-slate-100'
          }`} 
        />
      ),
      isActive,
    };
  }), [navItems, location.pathname]);

  const themeLink = useMemo(() => ({
    label: theme === 'dark' ? 'Light Mode' : 'Dark Mode',
    href: '#',
    icon: theme === 'dark' 
      ? <Sun className="h-5 w-5 flex-shrink-0 text-slate-500 dark:text-slate-400" />
      : <Moon className="h-5 w-5 flex-shrink-0 text-slate-500 dark:text-slate-400" />,
  }), [theme]);

  const logoutLink = useMemo(() => ({
    label: 'Sign Out',
    href: '#',
    icon: <LogOut className="h-5 w-5 flex-shrink-0 text-slate-500 dark:text-slate-400 group-hover/sidebar:text-red-500" />,
  }), []);

  return (
    <Sidebar open={open} setOpen={setOpen} animate={true}>
      <SidebarBody className="justify-between gap-6">
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
          {/* Logo */}
          <div className="mb-6 border-b border-slate-200 dark:border-dark-border pb-4">
            {open ? <Logo /> : <LogoIcon />}
          </div>
          
          {/* Navigation Links */}
          <nav className="flex flex-col gap-1">
            {links.map((link, idx) => (
              <SidebarLink key={idx} link={link} />
            ))}
          </nav>
        </div>
        
        {/* Bottom Actions */}
        <div className="border-t border-slate-200 dark:border-dark-border pt-4 flex flex-col gap-1">
          {/* API Request Counter */}
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-400 dark:text-slate-500">
            <Activity className="h-3.5 w-3.5 flex-shrink-0" />
            {open && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="whitespace-pre"
              >
                API Requests: {apiRequestCount.toLocaleString()}
              </motion.span>
            )}
            {!open && (
              <span className="sr-only">API Requests: {apiRequestCount.toLocaleString()}</span>
            )}
          </div>
          <SidebarLink 
            link={themeLink}
            onClick={toggleTheme}
          />
          <SidebarLink 
            link={logoutLink}
            onClick={onLogout}
            className="hover:text-red-500 dark:hover:text-red-400"
          />
        </div>
      </SidebarBody>
    </Sidebar>
  );
});

AppSidebar.displayName = 'AppSidebar';

export default AppSidebar;
