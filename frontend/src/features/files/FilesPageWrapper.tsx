import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { FolderOpen, HardDrive } from 'lucide-react';
import { toast } from 'sonner';
import ProductivityLoader from '../../components/ui/ProductivityLoader';

// Lazy load the actual content components
const MyFilesContent = lazy(() => import('./FilesPage'));
const DriveContent = lazy(() => import('../drive/DrivePage'));

type TabType = 'my-files' | 'google-drive';

const FilesPageWrapper: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Check if we came from Drive OAuth redirect
  const authSuccess = searchParams.get('auth') === 'success';
  
  // Default to Google Drive tab if auth=success (came from Drive OAuth)
  const [activeTab, setActiveTab] = useState<TabType>(authSuccess ? 'google-drive' : 'my-files');

  useEffect(() => {
    if (authSuccess) {
      // Clean up URL and show success message
      navigate('/dashboard/files', { replace: true });
      toast.success('Google Drive connected successfully!');
    }
  }, [authSuccess, navigate]);

  return (
    <div className="flex flex-col h-full">
      {/* Tab Switcher */}
      <div className="flex-shrink-0 border-b border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface px-6 pt-4">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('my-files')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'my-files'
                ? 'bg-slate-100 dark:bg-dark-bg text-productivity-600 dark:text-productivity-400 border-b-2 border-productivity-500'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-dark-bg/50'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            My Files
          </button>
          <button
            onClick={() => setActiveTab('google-drive')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'google-drive'
                ? 'bg-slate-100 dark:bg-dark-bg text-productivity-600 dark:text-productivity-400 border-b-2 border-productivity-500'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-dark-bg/50'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            Google Drive
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        <Suspense fallback={<ProductivityLoader fullScreen={false} text="Loading..." />}>
          {activeTab === 'my-files' ? (
            <MyFilesContent />
          ) : (
            <DriveContent />
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default FilesPageWrapper;
