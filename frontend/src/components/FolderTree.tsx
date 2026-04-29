import { useState, useEffect, useCallback, memo, useImperativeHandle, forwardRef } from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown, Home, Users, Plus, RefreshCw, FileText, Image, File, FileVideo, FileAudio } from 'lucide-react';
import { api } from '../lib/api';
import ProductivityLoader from './ui/ProductivityLoader';
import ProductivitySpinner from './ui/ProductivitySpinner';

interface FileNode {
  id: string;
  name: string;
  mimeType: string;
}

interface FolderNode {
  name: string;
  path: string;
  isExpanded: boolean;
  children: FolderNode[];
  files: FileNode[];
  isLoading: boolean;
}

interface SharedFolder {
  id: string;
  name: string;
  path: string;
  permission: string;
  owner: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
  };
}

interface FolderTreeProps {
  currentFolder: string | null;
  onNavigate: (path: string | null, ownerId?: string) => void;
  onFileClick?: (fileId: string) => void;
  onCreateFolder?: () => void;
  className?: string;
}

export interface FolderTreeRef {
  refresh: () => void;
}

// Helper to get file icon based on mime type
const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return <Image className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />;
  if (mimeType.startsWith('video/')) return <FileVideo className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />;
  if (mimeType.startsWith('audio/')) return <FileAudio className="w-3.5 h-3.5 text-pink-500 flex-shrink-0" />;
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) {
    return <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />;
  }
  return <File className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />;
};

const FolderTree = forwardRef<FolderTreeRef, FolderTreeProps>(({ currentFolder, onNavigate, onFileClick, onCreateFolder, className = '' }, ref) => {
  const [myFolders, setMyFolders] = useState<FolderNode[]>([]);
  const [sharedFolders, setSharedFolders] = useState<SharedFolder[]>([]);
  const [isLoadingMy, setIsLoadingMy] = useState(true);
  const [isLoadingShared, setIsLoadingShared] = useState(true);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  // Fetch root folders
  const fetchRootFolders = useCallback(async () => {
    try {
      setIsLoadingMy(true);
      const response = await api.get<{
        success: boolean;
        data: { files: any[]; folders: string[] };
      }>('/api/storage');

      if (response.success) {
        setMyFolders(response.data.folders.map((name: string) => ({
          name,
          path: name,
          isExpanded: false,
          children: [],
          files: [],
          isLoading: false
        })));
      }
    } catch (error) {
      console.error('Failed to fetch folders:', error);
    } finally {
      setIsLoadingMy(false);
    }
  }, []);

  // Fetch shared folders
  const fetchSharedFolders = useCallback(async () => {
    try {
      setIsLoadingShared(true);
      const response = await api.get<{
        success: boolean;
        data: {
          folders: SharedFolder[];
          files: unknown[];
        };
      }>('/api/sharing/shared-with-me');

      if (response.success) {
        setSharedFolders(response.data.folders);
      }
    } catch (error) {
      console.error('Failed to fetch shared folders:', error);
    } finally {
      setIsLoadingShared(false);
    }
  }, []);

  // Expose refresh method to parent
  useImperativeHandle(ref, () => ({
    refresh: () => {
      fetchRootFolders();
      fetchSharedFolders();
    }
  }), [fetchRootFolders, fetchSharedFolders]);

  useEffect(() => {
    fetchRootFolders();
    fetchSharedFolders();
  }, [fetchRootFolders, fetchSharedFolders]);

  // Fetch subfolders only when expanding (not files - for performance)
  const fetchFolderContents = async (folderPath: string): Promise<{ folders: string[]; files: FileNode[] }> => {
    try {
      const response = await api.get<{
        success: boolean;
        data: { files: Array<{ id: string; fileName: string; mimeType: string }>; folders: string[] };
      }>('/api/storage', { params: { folder: folderPath } });

      if (response.success) {
        return {
          folders: response.data.folders,
          // Don't load files in tree - improves performance
          files: []
        };
      }
    } catch (error) {
      console.error('Failed to fetch folder contents:', error);
    }
    return { folders: [], files: [] };
  };

  const toggleFolder = async (folder: FolderNode) => {
    const newExpanded = new Set(expandedPaths);
    
    if (expandedPaths.has(folder.path)) {
      newExpanded.delete(folder.path);
      setExpandedPaths(newExpanded);
    } else {
      newExpanded.add(folder.path);
      setExpandedPaths(newExpanded);

      // Load children and files if not already loaded
      if (folder.children.length === 0 && folder.files.length === 0) {
        // Mark as loading
        updateFolderLoading(folder.path, true);
        
        try {
          const { folders: subfolders, files } = await fetchFolderContents(folder.path);
          
          updateFolderContents(folder.path, 
            subfolders.map(name => ({
              name,
              path: `${folder.path}/${name}`,
              isExpanded: false,
              children: [],
              files: [],
              isLoading: false
            })),
            files
          );
        } catch (error) {
          console.error('Failed to load folder contents:', error);
          updateFolderLoading(folder.path, false);
        }
      }
    }
  };

  const updateFolderLoading = (path: string, isLoading: boolean) => {
    setMyFolders(prev => updateNodeLoading(prev, path, isLoading));
  };

  const updateNodeLoading = (nodes: FolderNode[], path: string, isLoading: boolean): FolderNode[] => {
    return nodes.map(node => {
      if (node.path === path) {
        return { ...node, isLoading };
      }
      if (path.startsWith(node.path + '/')) {
        return { ...node, children: updateNodeLoading(node.children, path, isLoading) };
      }
      return node;
    });
  };

  const updateFolderContents = (path: string, children: FolderNode[], files: FileNode[]) => {
    setMyFolders(prev => updateNodeContents(prev, path, children, files));
  };

  const updateNodeContents = (nodes: FolderNode[], path: string, children: FolderNode[], files: FileNode[]): FolderNode[] => {
    return nodes.map(node => {
      if (node.path === path) {
        return { ...node, children, files, isLoading: false };
      }
      if (path.startsWith(node.path + '/')) {
        return { ...node, children: updateNodeContents(node.children, path, children, files) };
      }
      return node;
    });
  };

  const renderFolderNode = (folder: FolderNode, depth: number = 0) => {
    const isExpanded = expandedPaths.has(folder.path);
    const isActive = currentFolder === folder.path;

    return (
      <div key={folder.path}>
        <div
          className={`
            flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer transition-colors
            ${isActive 
              ? 'bg-productivity-100 dark:bg-productivity-900/30 text-productivity-700 dark:text-productivity-300' 
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
            }
          `}
          style={{ paddingLeft: `${8 + depth * 16}px` }}
        >
          {/* Expand/Collapse button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFolder(folder);
            }}
            className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            {folder.isLoading ? (
              <ProductivitySpinner size="xs" />
            ) : isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Folder icon and name */}
          <button
            onClick={() => onNavigate(folder.path)}
            className="flex items-center gap-2 flex-1 text-left text-sm font-medium truncate"
          >
            {isExpanded ? (
              <FolderOpen className="w-4 h-4 text-productivity-500 flex-shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
            )}
            <span className="truncate">{folder.name}</span>
          </button>
        </div>

        {/* Children folders */}
        {isExpanded && folder.children.length > 0 && (
          <div>
            {folder.children.map(child => renderFolderNode(child, depth + 1))}
          </div>
        )}

        {/* Files in this folder */}
        {isExpanded && folder.files.length > 0 && (
          <div>
            {folder.files.map(file => (
              <div
                key={file.id}
                onClick={() => onFileClick?.(file.id)}
                className="flex items-center gap-2 py-1 px-2 rounded-lg cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                style={{ paddingLeft: `${24 + depth * 16}px` }}
              >
                {getFileIcon(file.mimeType)}
                <span className="text-xs truncate">{file.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* My Files Section */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3 space-y-1">
          {/* Home / All Files */}
          <button
            onClick={() => onNavigate(null)}
            className={`
              w-full flex items-center gap-2 py-2 px-3 rounded-lg text-left text-sm font-medium transition-colors
              ${currentFolder === null 
                ? 'bg-productivity-100 dark:bg-productivity-900/30 text-productivity-700 dark:text-productivity-300' 
                : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
              }
            `}
          >
            <Home className="w-4 h-4" />
            <span>My Files</span>
          </button>

          {/* Folder Tree */}
          {isLoadingMy ? (
            <div className="flex items-center justify-center py-4">
              <ProductivityLoader fullScreen={false} />
            </div>
          ) : myFolders.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
              No folders yet
            </div>
          ) : (
            <div className="mt-1">
              {myFolders.map(folder => renderFolderNode(folder))}
            </div>
          )}
        </div>

        {/* Create Folder Button */}
        {onCreateFolder && (
          <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={onCreateFolder}
              className="w-full flex items-center gap-2 py-2 px-3 rounded-lg text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-productivity-600 dark:hover:text-productivity-400 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Folder</span>
            </button>
          </div>
        )}

        {/* Shared With Me Section */}
        <div className="border-t border-slate-200 dark:border-slate-700">
          <div className="p-3">
            <div className="flex items-center gap-2 py-2 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <Users className="w-4 h-4" />
              <span>Shared with me</span>
            </div>

            {isLoadingShared ? (
              <div className="flex items-center justify-center py-4">
                <ProductivityLoader fullScreen={false} />
              </div>
            ) : sharedFolders.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-500 dark:text-slate-400">
                No shared folders
              </div>
            ) : (
              <div className="space-y-0.5">
                {sharedFolders.map(folder => (
                  <button
                    key={folder.id}
                    onClick={() => onNavigate(folder.path, folder.owner.id)}
                    className="w-full flex items-center gap-2 py-2 px-3 rounded-lg text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group"
                  >
                    <Folder className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-slate-700 dark:text-slate-300 font-medium truncate">
                        {folder.name}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {folder.owner.firstName} {folder.owner.lastName}
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${
                      folder.permission === 'EDIT' 
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                        : folder.permission === 'DOWNLOAD' 
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' 
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>
                      {folder.permission === 'EDIT' ? 'Edit' : folder.permission === 'DOWNLOAD' ? 'Download' : 'View'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={() => {
            fetchRootFolders();
            fetchSharedFolders();
          }}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>
    </div>
  );
});

FolderTree.displayName = 'FolderTree';

export default memo(FolderTree);
