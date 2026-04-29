import { Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import { Toaster, toast } from 'sonner';
import { api } from './lib/api';
import { CountryProvider } from './contexts/CountryContext';
import './App.css';
import ProductivityLoader from './components/ui/ProductivityLoader';

// Lazy load components
const LoginPage = lazy(() => import('./pages/LoginPage'));
const CreateAccountPage = lazy(() => import('./pages/RegisterPage'));
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const CalendarPage = lazy(() => import('./features/calendar/CalendarPage'));
const EmailPage = lazy(() => import('./features/email/EmailPage'));
const TasksPage = lazy(() => import('./features/tasks/TasksPage'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage'));
const ChatPage = lazy(() => import('./features/chat/ChatPage'));
const ContactsPage = lazy(() => import('./features/contacts/ContactsPage'));
const FilesPage = lazy(() => import('./features/files/FilesPageWrapper'));
const IntegrationsPage = lazy(() => import('./features/integrations/IntegrationsPage'));
const HelpPage = lazy(() => import('./features/help/HelpPage'));
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'));

function App() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isExplicitLogout, setIsExplicitLogout] = useState(false);
  
  // Initialize theme from localStorage or system preference
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    const initAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const authParam = params.get('auth');
      const errorParam = params.get('error');

      if (errorParam === 'google_auth_cancelled') {
          toast.error("Google authentication was cancelled.");
          // Clean up URL
          navigate(window.location.pathname, { replace: true });
      }

      if (authParam === 'success') {
          setIsAuthenticated(true);
          setLoading(false);
          // If we are on a specific route (like /dashboard/calendar), keep it.
          // Also keep the query param so the specific page can detect it (e.g. for auto-refresh)
          // The specific page is responsible for cleaning up the URL
          if (window.location.pathname === '/' || window.location.pathname === '/login' || window.location.pathname === '/register') {
             navigate('/dashboard', { replace: true });
          }
          // Else: do nothing, let the router render the current path
      } else if (authParam === 'link_required') {
          setLoading(false);
          // Pass the query params along to the register page
          navigate(`/register${window.location.search}`, { replace: true });
      } else {
          await checkAuth();
      }
    };
    
    initAuth();
  }, [navigate]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const checkAuth = async () => {
    try {
      const res = await api.get<{ authenticated: boolean }>('/auth/status');
      setIsAuthenticated(res.authenticated);
    } catch (error) {
      console.error('Auth check failed:', error);
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
      setIsExplicitLogout(true);
      try {
        await api.post('/auth/logout', {});
      } catch (error) {
        console.error('Logout failed:', error);
      }
      setIsAuthenticated(false);
      navigate('/');
  };

  if (loading) return <ProductivityLoader fullScreen text="Initializing Productivity..." />;

  return (
    <CountryProvider>
      <Suspense fallback={<ProductivityLoader fullScreen text="Loading..." />}>
        <Toaster position="top-right" richColors theme={theme} />
      <Routes>
        <Route path="/" element={
          isAuthenticated ? <Navigate to="/dashboard" /> : (
              <LandingPage 
                  onGetStarted={() => navigate('/register')} 
                  onLogin={() => navigate('/login')}
                  theme={theme}
                  toggleTheme={toggleTheme}
              />
          )
        } />
        
        <Route path="/dashboard" element={
          isAuthenticated ? (
             <DashboardLayout theme={theme} toggleTheme={toggleTheme} onLogout={handleLogout} />
          ) : (
             <Navigate to={isExplicitLogout ? "/" : "/login"} />
          )
        }>
            <Route index element={<DashboardPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="email" element={<EmailPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="files" element={<FilesPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="help" element={<HelpPage />} />
            <Route path="settings" element={<SettingsPage onLogout={handleLogout} />} />
            <Route path="*" element={<div className="flex items-center justify-center h-full text-slate-500">Coming Soon</div>} />
        </Route>

        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/dashboard" /> : (
              <LoginPage 
              onLogin={() => { setIsAuthenticated(true); navigate('/dashboard', { replace: true }); }} 
              onNavigateToSignup={() => navigate('/register')}
              onBack={() => navigate('/')}
              />
          )
        } />
        <Route path="/register" element={
          isAuthenticated ? <Navigate to="/dashboard" /> : (
              <CreateAccountPage 
              onLogin={() => { setIsAuthenticated(true); navigate('/dashboard', { replace: true }); }}
              onNavigateToLogin={() => navigate('/login')}
              onBack={() => navigate('/')}
              />
          )
        } />
      </Routes>
      </Suspense>
    </CountryProvider>
  );
}

export default App;
