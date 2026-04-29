import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderPlus, Upload, Search, Trash2, Download, Folder, Home, ChevronRight, X, Eye, 
  AlertCircle, Edit3, RefreshCw, Link as LinkIcon, Unlink,
  FileText, Image, File, FileSpreadsheet, Film, Music, Archive, HardDrive
} from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import ProductivityLoader from '../../components/ui/ProductivityLoader';
import ProductivitySpinner from '../../components/ui/ProductivitySpinner';
import FilePreviewModal from './FilePreviewModal';
import UnifiedUploadModal from '../../components/UnifiedUploadModal';
import LinkDriveModal from './LinkDriveModal';

// Types for Drive API responses
interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string | null;
  iconLink: string | null;
  thumbnailLink: string | null;
  webViewLink: string | null;
  webContentLink: string | null;
  modifiedTime: string;
  createdTime: string;
  parents: string[];
  isFolder: boolean;
  capabilities?: {
    canEdit: boolean;
    canDelete: boolean;
    canDownload: boolean;
  };
}

interface DriveConnection {
  id: string;
  service: string;
  accountEmail: string;
  category: string;
  updatedAt: string;
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface DriveListResponse {
  success: boolean;
  data: {
    files: DriveFile[];
    nextPageToken: string | null;
    hasMore: boolean;
    currentFolder: { id: string; name: string };
    breadcrumb: BreadcrumbItem[];
  };
}

// Helper to format file size
const formatFileSize = (sizeStr: string | null): string => {
  if (!sizeStr) return '--';
  const bytes = parseInt(sizeStr, 10);
  if (isNaN(bytes) || bytes === 0) return '--';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Helper to format date
const formatDate = (dateStr: string): string => {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Get file icon based on MIME type
const getFileIcon = (mimeType: string): React.ReactNode => {
  if (mimeType === 'application/vnd.google-apps.folder') {
    return <Folder className="w-5 h-5 text-yellow-500" />;
  }
  if (mimeType.startsWith('image/') || mimeType === 'application/vnd.google-apps.photo') {
    return <Image className="w-5 h-5 text-green-500" />;
  }
  if (mimeType.startsWith('video/')) {
    return <Film className="w-5 h-5 text-purple-500" />;
  }
  if (mimeType.startsWith('audio/')) {
    return <Music className="w-5 h-5 text-pink-500" />;
  }
  if (mimeType === 'application/pdf' || mimeType === 'application/vnd.google-apps.document') {
    return <FileText className="w-5 h-5 text-red-500" />;
  }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'application/vnd.google-apps.spreadsheet') {
    return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
  }
  if (mimeType.includes('presentation') || mimeType === 'application/vnd.google-apps.presentation') {
    return <FileText className="w-5 h-5 text-orange-500" />;
  }
  if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('compressed')) {
    return <Archive className="w-5 h-5 text-amber-500" />;
  }
  return <File className="w-5 h-5 text-slate-400" />;
};

// Check if file type is previewable
const isPreviewable = (mimeType: string): boolean => {
  const previewableTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
    'application/pdf',
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.spreadsheet',
    'application/vnd.google-apps.presentation',
  ];
  return previewableTypes.includes(mimeType) || mimeType.startsWith('image/');
};

const DrivePage: React.FC = () => {
  // Connection state
  const [connections, setConnections] = useState<DriveConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkCategory, setLinkCategory] = useState<string>('Personal');
  
  // File state
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string>('root');
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<DriveFile[] | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Modals
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; file: DriveFile | null }>({ isOpen: false, file: null });
  const [renameModal, setRenameModal] = useState<{ isOpen: boolean; file: DriveFile | null; newName: string }>({ isOpen: false, file: null, newName: '' });
  
  // Preview state
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
  
  // Upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  
  // Disconnect confirmation modal
  const [disconnectConfirmation, setDisconnectConfirmation] = useState<{ isOpen: boolean; connectionId: string | null }>({ isOpen: false, connectionId: null });

  // Fetch connections on mount
  useEffect(() => {
    fetchConnections();
  }, []);

  // Debounce search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Execute search when debounced query changes
  useEffect(() => {
    if (debouncedSearchQuery.trim() && selectedConnectionId) {
      handleSearch();
    } else {
      setSearchResults(null);
    }
  }, [debouncedSearchQuery, selectedConnectionId]);

  // Fetch files when connection or folder changes
  useEffect(() => {
    if (selectedConnectionId) {
      fetchFiles(true);
    }
  }, [selectedConnectionId, currentFolderId]);

  const fetchConnections = async () => {
    try {
      const response = await api.get<DriveConnection[]>('/api/connections');
      const driveConnections = response.filter(c => c.service === 'DRIVE');
      setConnections(driveConnections);
      
      // Auto-select first connection if available
      if (driveConnections.length > 0 && !selectedConnectionId) {
        setSelectedConnectionId(driveConnections[0].id);
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch connections:', error);
      setIsLoading(false);
      toast.error('Failed to load Drive connections');
    }
  };

  const fetchFiles = async (reset = true) => {
    if (!selectedConnectionId) return;
    
    if (reset) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const params: Record<string, string> = {
        connectionId: selectedConnectionId,
        folderId: currentFolderId,
        pageSize: '50',
      };
      
      if (!reset && nextPageToken) {
        params.pageToken = nextPageToken;
      }

      const response = await api.get<DriveListResponse>('/api/drive/files', { params });
      
      if (response.success) {
        if (reset) {
          setFiles(response.data.files);
        } else {
          setFiles(prev => [...prev, ...response.data.files]);
        }
        setNextPageToken(response.data.nextPageToken);
        setHasMore(response.data.hasMore);
        setBreadcrumb(response.data.breadcrumb);
      }
    } catch (error: any) {
      console.error('Failed to fetch files:', error);
      const errorCode = error?.response?.data?.code;
      const errorDetails = error?.response?.data?.details;
      
      if (errorCode === 'TOKEN_REVOKED' || errorCode === 'SCOPE_REAUTH_REQUIRED') {
        toast.error('Drive connection needs reauthorization. Please reconnect.');
        // Remove the connection from state so user can reconnect
        setConnections(prev => prev.filter(c => c.id !== selectedConnectionId));
        setSelectedConnectionId(null);
      } else if (errorCode === 'ACCESS_DENIED') {
        toast.error(errorDetails || 'Access denied. Please reconnect your Drive.');
        // Also remove connection for access denied as it indicates a scope issue
        setConnections(prev => prev.filter(c => c.id !== selectedConnectionId));
        setSelectedConnectionId(null);
      } else {
        toast.error(errorDetails || 'Failed to load files');
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const handleSearch = async () => {
    if (!selectedConnectionId || !debouncedSearchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await api.get<{ success: boolean; data: { files: DriveFile[] } }>('/api/drive/files/search', {
        params: {
          connectionId: selectedConnectionId,
          q: debouncedSearchQuery.trim(),
        },
      });
      
      if (response.success) {
        setSearchResults(response.data.files);
      }
    } catch (error) {
      console.error('Search failed:', error);
      toast.error('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleFolderClick = (folder: DriveFile) => {
    setCurrentFolderId(folder.id);
    setSearchQuery('');
    setSearchResults(null);
  };

  const handleBreadcrumbClick = (item: BreadcrumbItem | null) => {
    if (item === null) {
      setCurrentFolderId('root');
    } else {
      setCurrentFolderId(item.id);
    }
    setSearchQuery('');
    setSearchResults(null);
  };

  // Upload file handler for UnifiedUploadModal
  const handleUploadFile = async (file: File, onProgress?: (progress: number) => void) => {
    if (!selectedConnectionId) {
      throw new Error('No connection selected');
    }
    
    setIsUploadingFile(true);
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('connectionId', selectedConnectionId);
    if (currentFolderId !== 'root') {
      formData.append('folderId', currentFolderId);
    }
    
    // Use XMLHttpRequest for progress tracking
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });
      
      xhr.addEventListener('load', () => {
        setIsUploadingFile(false);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.success) {
              resolve();
            } else {
              reject(new Error(data.error || 'Upload failed'));
            }
          } catch {
            reject(new Error('Failed to parse response'));
          }
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });
      
      xhr.addEventListener('error', () => {
        setIsUploadingFile(false);
        reject(new Error('Network error during upload'));
      });
      
      xhr.open('POST', '/api/drive/files/upload');
      xhr.withCredentials = true;
      xhr.send(formData);
    });
  };

  // URL upload is not supported for Drive, but we need to provide the handler
  const handleUploadFromUrl = async (_url: string, _fileName: string) => {
    toast.error('URL upload is not supported for Google Drive');
    throw new Error('URL upload not supported');
  };

  // Called when upload modal completes successfully
  const handleUploadComplete = () => {
    fetchFiles(true);
    setIsUploadModalOpen(false);
  };

  const handleCreateFolder = async () => {
    if (!selectedConnectionId || !newFolderName.trim()) return;
    
    setIsCreatingFolder(true);
    try {
      const response = await api.post<{ success: boolean; data: DriveFile }>('/api/drive/folders', {
        connectionId: selectedConnectionId,
        name: newFolderName.trim(),
        parentId: currentFolderId,
      });
      
      if (response.success) {
        toast.success(`Created folder "${newFolderName}"`);
        setIsCreateFolderModalOpen(false);
        setNewFolderName('');
        fetchFiles(true);
      }
    } catch (error: any) {
      console.error('Failed to create folder:', error);
      toast.error(error?.message || 'Failed to create folder');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleDownload = async (file: DriveFile) => {
    if (!selectedConnectionId) return;
    
    setDownloadingFileId(file.id);
    try {
      const response = await fetch(`/api/drive/files/${file.id}/download?connectionId=${selectedConnectionId}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Download failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success(`Downloaded ${file.name}`);
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Download failed');
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedConnectionId || !deleteConfirmation.file) return;
    
    const file = deleteConfirmation.file;
    setDeletingFileId(file.id);
    
    try {
      const response = await api.delete<{ success: boolean }>(`/api/drive/files/${file.id}`, {
        params: { connectionId: selectedConnectionId },
      });
      
      if (response.success) {
        toast.success(`Moved "${file.name}" to trash`);
        setFiles(prev => prev.filter(f => f.id !== file.id));
        setDeleteConfirmation({ isOpen: false, file: null });
      }
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('Failed to delete file');
    } finally {
      setDeletingFileId(null);
    }
  };

  const handleRename = async () => {
    if (!selectedConnectionId || !renameModal.file || !renameModal.newName.trim()) return;
    
    try {
      const response = await api.patch<{ success: boolean; data: DriveFile }>(`/api/drive/files/${renameModal.file.id}`, {
        connectionId: selectedConnectionId,
        name: renameModal.newName.trim(),
      });
      
      if (response.success) {
        toast.success('Renamed successfully');
        setFiles(prev => prev.map(f => f.id === renameModal.file!.id ? response.data : f));
        setRenameModal({ isOpen: false, file: null, newName: '' });
      }
    } catch (error) {
      console.error('Rename failed:', error);
      toast.error('Rename failed');
    }
  };

  const handlePreview = (file: DriveFile) => {
    if (isPreviewable(file.mimeType)) {
      setPreviewFile(file);
    } else {
      // Open in Google Drive viewer
      if (file.webViewLink) {
        window.open(file.webViewLink, '_blank');
      }
    }
  };

  const handleLinkDrive = () => {
    window.location.href = `/auth/google?service=DRIVE&category=${linkCategory}`;
  };

  const handleDisconnect = async () => {
    const connectionId = disconnectConfirmation.connectionId;
    if (!connectionId) return;
    
    try {
      await api.delete(`/api/connections/${connectionId}`);
      toast.success('Google Drive disconnected');
      setConnections(prev => prev.filter(c => c.id !== connectionId));
      
      // If disconnecting the selected connection, switch to another or clear
      if (selectedConnectionId === connectionId) {
        const remaining = connections.filter(c => c.id !== connectionId);
        if (remaining.length > 0) {
          setSelectedConnectionId(remaining[0].id);
        } else {
          setSelectedConnectionId(null);
        }
        setFiles([]);
        setBreadcrumb([]);
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
      toast.error('Failed to disconnect');
    } finally {
      setDisconnectConfirmation({ isOpen: false, connectionId: null });
    }
  };

  const displayFiles = searchResults !== null ? searchResults : files;

  // No connection view
  if (!isLoading && connections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4">
        <div className="bg-slate-100 dark:bg-slate-800 p-6 rounded-full mb-6">
          <HardDrive className="w-12 h-12 text-slate-400 dark:text-slate-500" />
        </div>
        <h2 className="text-2xl font-semibold text-slate-700 dark:text-slate-200 mb-3">
          Connect Your Google Drive
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-center mb-6 max-w-md">
          Link your Google Drive account to browse, upload, and manage your files directly from Productivity.
        </p>
        <button
          onClick={() => setIsLinkModalOpen(true)}
          className="flex items-center gap-2 px-6 py-3 bg-productivity-500 hover:bg-productivity-600 text-white rounded-lg font-medium transition-colors"
        >
          <LinkIcon className="w-5 h-5" />
          Connect Google Drive
        </button>

        {/* Link Modal */}
        <LinkDriveModal
          isOpen={isLinkModalOpen}
          onClose={() => setIsLinkModalOpen(false)}
          selectedCategory={linkCategory}
          onCategoryChange={setLinkCategory}
          onSubmit={handleLinkDrive}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-dark-bg">
      {/* Header */}
      <div className="flex-shrink-0 bg-white dark:bg-dark-surface border-b border-slate-200 dark:border-dark-border px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Account selector and breadcrumb */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Account selector */}
            <div className="flex items-center gap-2">
              <select
                value={selectedConnectionId || ''}
                onChange={(e) => {
                  setSelectedConnectionId(e.target.value);
                  setCurrentFolderId('root');
                  setBreadcrumb([]);
                }}
                className="px-3 py-2 bg-slate-100 dark:bg-dark-surface rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-dark-border focus:ring-2 focus:ring-productivity-500"
              >
                {connections.map(conn => (
                  <option key={conn.id} value={conn.id}>
                    {conn.accountEmail} ({conn.category})
                  </option>
                ))}
              </select>
              
              {/* Disconnect button */}
              {selectedConnectionId && (
                <button
                  onClick={() => setDisconnectConfirmation({ isOpen: true, connectionId: selectedConnectionId })}
                  className="p-2 text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Disconnect this account"
                >
                  <Unlink className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1 text-sm overflow-x-auto whitespace-nowrap">
              <button
                onClick={() => handleBreadcrumbClick(null)}
                className="flex items-center gap-1 px-2 py-1 text-slate-600 dark:text-slate-400 hover:text-productivity-500 dark:hover:text-productivity-400 hover:bg-slate-100 dark:hover:bg-dark-surface rounded"
              >
                <Home className="w-4 h-4" />
                <span>My Drive</span>
              </button>
              {breadcrumb.map((item, index) => (
                <React.Fragment key={item.id}>
                  <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-600" />
                  <button
                    onClick={() => handleBreadcrumbClick(item)}
                    className={`px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-dark-surface ${
                      index === breadcrumb.length - 1
                        ? 'text-slate-800 dark:text-white font-medium'
                        : 'text-slate-600 dark:text-slate-400 hover:text-productivity-500'
                    }`}
                  >
                    {item.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 w-64 bg-slate-100 dark:bg-dark-surface rounded-lg text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 border border-transparent dark:border-dark-border focus:ring-2 focus:ring-productivity-500"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults(null);
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2"
                >
                  <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>

            {/* Refresh */}
            <button
              onClick={() => fetchFiles(true)}
              disabled={isLoading}
              className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-surface rounded-lg transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* New Folder */}
            <button
              onClick={() => setIsCreateFolderModalOpen(true)}
              className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-surface rounded-lg transition-colors"
              title="New Folder"
            >
              <FolderPlus className="w-5 h-5" />
            </button>

            {/* Upload */}
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-productivity-500 hover:bg-productivity-600 text-white rounded-lg font-medium transition-colors"
            >
              <Upload className="w-5 h-5" />
              Upload
            </button>

            {/* Add Account */}
            <button
              onClick={() => setIsLinkModalOpen(true)}
              className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-surface rounded-lg transition-colors"
              title="Add another Drive account"
            >
              <LinkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading && files.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <ProductivityLoader />
          </div>
        ) : displayFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400">
            <Folder className="w-16 h-16 mb-4 text-slate-300 dark:text-slate-600" />
            <p className="text-lg">
              {searchResults !== null ? 'No files found' : 'This folder is empty'}
            </p>
            {searchResults === null && (
              <p className="text-sm mt-2">Upload files or create a folder to get started</p>
            )}
          </div>
        ) : (
          <>
            {/* Search results indicator */}
            {searchResults !== null && (
              <div className="mb-4 flex items-center gap-2">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {isSearching ? 'Searching...' : `Found ${searchResults.length} results for "${debouncedSearchQuery}"`}
                </span>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults(null);
                  }}
                  className="text-productivity-500 hover:text-productivity-600 text-sm font-medium"
                >
                  Clear search
                </button>
              </div>
            )}

            {/* File grid/list */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {displayFiles.map(file => (
                <div
                  key={file.id}
                  className={`group bg-white dark:bg-dark-surface rounded-lg border border-slate-200 dark:border-dark-border p-4 hover:border-productivity-300 dark:hover:border-productivity-600 hover:shadow-md transition-all cursor-pointer ${
                    deletingFileId === file.id ? 'opacity-50' : ''
                  }`}
                  onClick={() => file.isFolder ? handleFolderClick(file) : handlePreview(file)}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon / Thumbnail */}
                    <div className="flex-shrink-0">
                      {file.thumbnailLink && !file.isFolder ? (
                        <img
                          src={file.thumbnailLink}
                          alt={file.name}
                          className="w-10 h-10 rounded object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-10 h-10 flex items-center justify-center">
                          {getFileIcon(file.mimeType)}
                        </div>
                      )}
                    </div>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-slate-800 dark:text-white truncate" title={file.name}>
                        {file.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {file.isFolder ? 'Folder' : formatFileSize(file.size)}
                        {' • '}
                        {formatDate(file.modifiedTime)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!file.isFolder && (
                        <>
                          {isPreviewable(file.mimeType) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreview(file);
                              }}
                              className="p-1.5 text-slate-500 hover:text-productivity-500 hover:bg-slate-100 dark:hover:bg-dark-surface rounded"
                              title="Preview"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(file);
                            }}
                            disabled={downloadingFileId === file.id}
                            className="p-1.5 text-slate-500 hover:text-productivity-500 hover:bg-slate-100 dark:hover:bg-dark-surface rounded disabled:opacity-50"
                            title="Download"
                          >
                            {downloadingFileId === file.id ? (
                              <ProductivitySpinner className="w-4 h-4" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameModal({ isOpen: true, file, newName: file.name });
                        }}
                        className="p-1.5 text-slate-500 hover:text-productivity-500 hover:bg-slate-100 dark:hover:bg-dark-surface rounded"
                        title="Rename"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmation({ isOpen: true, file });
                        }}
                        className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Load more */}
            {hasMore && searchResults === null && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={() => fetchFiles(false)}
                  disabled={isLoadingMore}
                  className="px-6 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {isLoadingMore ? (
                    <span className="flex items-center gap-2">
                      <ProductivitySpinner className="w-4 h-4" />
                      Loading...
                    </span>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Folder Modal */}
      {isCreateFolderModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setIsCreateFolderModalOpen(false)}>
          <div className="bg-white dark:bg-dark-surface rounded-xl p-6 w-full max-w-md shadow-xl border border-transparent dark:border-dark-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Create Folder</h3>
              <button onClick={() => setIsCreateFolderModalOpen(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-dark-bg rounded">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full px-4 py-3 bg-slate-100 dark:bg-dark-bg rounded-lg text-slate-800 dark:text-white placeholder-slate-400 border border-transparent dark:border-dark-border focus:ring-2 focus:ring-productivity-500 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  handleCreateFolder();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsCreateFolderModalOpen(false)}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-bg rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || isCreatingFolder}
                className="px-4 py-2 bg-productivity-500 hover:bg-productivity-600 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {isCreatingFolder ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.isOpen && deleteConfirmation.file && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirmation({ isOpen: false, file: null })}>
          <div className="bg-white dark:bg-dark-surface rounded-xl p-6 w-full max-w-md shadow-xl border border-transparent dark:border-dark-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Move to Trash?</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              "{deleteConfirmation.file.name}" will be moved to the trash. You can restore it from Google Drive's trash.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmation({ isOpen: false, file: null })}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-bg rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deletingFileId === deleteConfirmation.file.id}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {deletingFileId === deleteConfirmation.file.id ? 'Deleting...' : 'Move to Trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameModal.isOpen && renameModal.file && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setRenameModal({ isOpen: false, file: null, newName: '' })}>
          <div className="bg-white dark:bg-dark-surface rounded-xl p-6 w-full max-w-md shadow-xl border border-transparent dark:border-dark-border" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Rename</h3>
              <button onClick={() => setRenameModal({ isOpen: false, file: null, newName: '' })} className="p-1 hover:bg-slate-100 dark:hover:bg-dark-bg rounded">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <input
              type="text"
              value={renameModal.newName}
              onChange={(e) => setRenameModal(prev => ({ ...prev, newName: e.target.value }))}
              placeholder="New name"
              className="w-full px-4 py-3 bg-slate-100 dark:bg-dark-bg rounded-lg text-slate-800 dark:text-white placeholder-slate-400 border border-transparent dark:border-dark-border focus:ring-2 focus:ring-productivity-500 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameModal.newName.trim()) {
                  handleRename();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenameModal({ isOpen: false, file: null, newName: '' })}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-bg rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={!renameModal.newName.trim() || renameModal.newName === renameModal.file.name}
                className="px-4 py-2 bg-productivity-500 hover:bg-productivity-600 text-white rounded-lg font-medium disabled:opacity-50"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link Account Modal */}
      {/* Link Account Modal */}
      <LinkDriveModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        selectedCategory={linkCategory}
        onCategoryChange={setLinkCategory}
        onSubmit={handleLinkDrive}
      />

      {/* File Preview Modal */}
      {previewFile && selectedConnectionId && (
        <FilePreviewModal
          file={previewFile}
          connectionId={selectedConnectionId}
          onClose={() => setPreviewFile(null)}
          onDownload={() => handleDownload(previewFile)}
        />
      )}

      {/* Upload Modal */}
      <UnifiedUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false);
          handleUploadComplete();
        }}
        onUploadFile={handleUploadFile}
        onUploadFromUrl={handleUploadFromUrl}
        currentFolder={currentFolderId === 'root' ? null : currentFolderId}
        isUploading={isUploadingFile}
      />

      {/* Disconnect Confirmation Modal */}
      {disconnectConfirmation.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setDisconnectConfirmation({ isOpen: false, connectionId: null })}>
          <div className="bg-white dark:bg-dark-surface rounded-xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                <Unlink className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Disconnect Account</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {connections.find(c => c.id === disconnectConfirmation.connectionId)?.accountEmail}
                </p>
              </div>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              Are you sure you want to disconnect this Google Drive account? You can always reconnect it later.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDisconnectConfirmation({ isOpen: false, connectionId: null })}
                className="flex-1 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-dark-bg rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnect}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DrivePage;
