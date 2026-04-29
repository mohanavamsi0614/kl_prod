import React, { useState, useEffect } from 'react';
import { Puzzle, Mail, Calendar, CheckSquare, HardDrive, Link as LinkIcon, X, CheckCircle, LogOut, ExternalLink } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import ProductivityLoader from '../../components/ui/ProductivityLoader';

interface Connection {
  id: string;
  service: string;
  accountEmail: string;
  category: string;
  updatedAt: string;
}

type CalendarCategory = 'Personal' | 'Work' | 'Family';

const IntegrationsPage: React.FC = () => {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [linkModal, setLinkModal] = useState<{ isOpen: boolean; service: string; category: CalendarCategory }>({
    isOpen: false,
    service: '',
    category: 'Personal',
  });

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      const response = await api.get<Connection[]>('/api/connections');
      setConnections(response);
    } catch (error) {
      console.error('Failed to fetch connections:', error);
      toast.error('Failed to load integrations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = (service: string) => {
    setLinkModal({ isOpen: true, service, category: 'Personal' });
  };

  const handleLinkConfirm = () => {
    const serviceParam = linkModal.service.toUpperCase();
    window.location.href = `/auth/google?service=${serviceParam}&category=${linkModal.category}`;
  };

  const handleDisconnect = async (connection: Connection) => {
    try {
      await api.delete(`/api/connections/${connection.id}`);
      setConnections(prev => prev.filter(c => c.id !== connection.id));
      toast.success(`Disconnected ${connection.accountEmail}`);
    } catch (error) {
      console.error('Failed to disconnect:', error);
      toast.error('Failed to disconnect account');
    }
  };

  const getServiceIcon = (service: string) => {
    switch (service.toUpperCase()) {
      case 'GMAIL':
        return <Mail className="w-6 h-6" />;
      case 'CALENDAR':
        return <Calendar className="w-6 h-6" />;
      case 'TASKS':
        return <CheckSquare className="w-6 h-6" />;
      case 'DRIVE':
        return <HardDrive className="w-6 h-6" />;
      default:
        return <Puzzle className="w-6 h-6" />;
    }
  };

  const getServiceColor = (service: string) => {
    switch (service.toUpperCase()) {
      case 'GMAIL':
        return 'text-red-500 bg-red-50 dark:bg-red-900/20';
      case 'CALENDAR':
        return 'text-blue-500 bg-blue-50 dark:bg-blue-900/20';
      case 'TASKS':
        return 'text-green-500 bg-green-50 dark:bg-green-900/20';
      case 'DRIVE':
        return 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
      default:
        return 'text-slate-500 bg-slate-50 dark:bg-slate-800';
    }
  };

  const getServiceName = (service: string) => {
    switch (service.toUpperCase()) {
      case 'GMAIL':
        return 'Gmail';
      case 'CALENDAR':
        return 'Google Calendar';
      case 'TASKS':
        return 'Google Tasks';
      case 'DRIVE':
        return 'Google Drive';
      default:
        return service;
    }
  };

  const integrations = [
    {
      id: 'gmail',
      service: 'GMAIL',
      name: 'Gmail',
      description: 'Connect your Gmail account to read and send emails directly from Productivity.',
      icon: <Mail className="w-8 h-8" />,
      color: 'text-red-500',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      id: 'calendar',
      service: 'CALENDAR',
      name: 'Google Calendar',
      description: 'Sync your calendar events and schedule meetings from Productivity.',
      icon: <Calendar className="w-8 h-8" />,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      id: 'tasks',
      service: 'TASKS',
      name: 'Google Tasks',
      description: 'Manage your Google Tasks and stay on top of your to-do list.',
      icon: <CheckSquare className="w-8 h-8" />,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      id: 'drive',
      service: 'DRIVE',
      name: 'Google Drive',
      description: 'Browse, upload, and manage your Google Drive files without leaving Productivity.',
      icon: <HardDrive className="w-8 h-8" />,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <ProductivityLoader />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Integrations</h1>
        <p className="text-slate-600 dark:text-slate-400">
          Connect your favorite services to enhance your Productivity experience.
        </p>
      </div>

      {/* Connected Accounts */}
      {connections.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-4">Connected Accounts</h2>
          <div className="space-y-3">
            {connections.map(connection => (
              <div
                key={connection.id}
                className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${getServiceColor(connection.service)}`}>
                    {getServiceIcon(connection.service)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800 dark:text-white">
                        {getServiceName(connection.service)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        connection.category === 'Work' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' :
                        connection.category === 'Family' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                        'bg-productivity-100 text-productivity-700 dark:bg-productivity-900/30 dark:text-productivity-300'
                      }`}>
                        {connection.category}
                      </span>
                    </div>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {connection.accountEmail}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <button
                    onClick={() => handleDisconnect(connection)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Disconnect"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Integrations */}
      <div>
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-4">
          {connections.length > 0 ? 'Add More Connections' : 'Available Integrations'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map(integration => {
            const connectedAccounts = connections.filter(c => c.service === integration.service);
            
            return (
              <div
                key={integration.id}
                className="p-5 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-productivity-300 dark:hover:border-productivity-600 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl ${integration.bgColor} ${integration.color}`}>
                    {integration.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-800 dark:text-white mb-1">
                      {integration.name}
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                      {integration.description}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConnect(integration.service)}
                        className="px-4 py-2 bg-productivity-500 hover:bg-productivity-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                      >
                        <LinkIcon className="w-4 h-4" />
                        {connectedAccounts.length > 0 ? 'Add Another' : 'Connect'}
                      </button>
                      {connectedAccounts.length > 0 && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {connectedAccounts.length} connected
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Coming Soon */}
      <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-700">
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-4">Coming Soon</h2>
        <div className="flex flex-wrap gap-3">
          {['Slack', 'Microsoft 365', 'Notion', 'Trello', 'Zoom'].map(name => (
            <div
              key={name}
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg text-sm"
            >
              {name}
            </div>
          ))}
        </div>
      </div>

      {/* Link Modal */}
      {linkModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setLinkModal(prev => ({ ...prev, isOpen: false }))}>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                Connect {getServiceName(linkModal.service)}
              </h3>
              <button 
                onClick={() => setLinkModal(prev => ({ ...prev, isOpen: false }))} 
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              Choose a category for this account:
            </p>
            <div className="flex gap-2 mb-6">
              {(['Personal', 'Work', 'Family'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setLinkModal(prev => ({ ...prev, category: cat }))}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    linkModal.category === cat
                      ? 'bg-productivity-500 border-productivity-500 text-white'
                      : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-productivity-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <button
              onClick={handleLinkConfirm}
              className="w-full py-3 bg-productivity-500 hover:bg-productivity-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Continue with Google
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntegrationsPage;
