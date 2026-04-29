
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FileText, Image, File, UploadCloud, Search, Trash2, Download, FileType, Folder, Home, ChevronRight, X, Eye, AlertCircle, Share2, Edit3, PanelLeftClose, PanelLeft, Users, Copy, Scissors, ClipboardPaste } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import ContextMenu from '../../components/ui/ContextMenu';
import type { ContextMenuItem } from '../../components/ui/ContextMenu';
import ShareModal from '../../components/ShareModal';
import FolderTree from '../../components/FolderTree';
import type { FolderTreeRef } from '../../components/FolderTree';
import UnifiedUploadModal from '../../components/UnifiedUploadModal';
import ProductivityLoader from '../../components/ui/ProductivityLoader';
import ProductivitySpinner from '../../components/ui/ProductivitySpinner';
import { validateFolderName } from '../../lib/validation';

// Types matching backend API response
interface S3File {
  id: string;
  fileName: string;
  url: string;
  folder: string | null;
  mimeType: string;
  size: number;
  createdAt: string;
  canDownload?: boolean;
  permission?: string;
  isShared?: boolean;
}

interface FolderWithShareInfo {
  name: string;
  isShared: boolean;
}

interface StorageListResponse {
  success: boolean;
  data: {
    files: S3File[];
    folders: string[];
    foldersWithShareInfo?: FolderWithShareInfo[];
    permission?: string;
    isOwner?: boolean;
  };
}

interface StorageFileResponse {
  success: boolean;
  data: S3File;
}

interface StorageDeleteResponse {
  success: boolean;
  data: { message: string };
}

interface StorageFolderResponse {
  success: boolean;
  data: { folder: string; message: string };
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
  sharedAt: string;
}

interface SharedFile {
  id: string;
  fileName: string;
  folder: string | null;
  mimeType: string | null;
  size: number;
  permission: string;
  owner: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
  };
  sharedAt: string;
}

interface SharedWithMeResponse {
  success: boolean;
  data: {
    folders: SharedFolder[];
    files: SharedFile[];
  };
}

interface SearchResponse {
  success: boolean;
  data: {
    files: S3File[];
    pagination: {
      page: number;
      limit: number;
      totalCount: number;
      totalPages: number;
      hasMore: boolean;
    };
  };
}

// Helper to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Helper to get file type from mime type
const getFileTypeFromMime = (mimeType: string): string => {
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'docx';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'sheet';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'pptx';
  if (mimeType.startsWith('image/')) return 'image';
  return 'file';
};

const FilesPage: React.FC = () => {
  const [files, setFiles] = useState<S3File[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [foldersWithShareInfo, setFoldersWithShareInfo] = useState<FolderWithShareInfo[]>([]);
  const [sharedFolders, setSharedFolders] = useState<SharedFolder[]>([]);
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<S3File[] | null>(null);
  
  // Shared folder viewing state
  const [viewingOwnerId, setViewingOwnerId] = useState<string | null>(null);
  const [sharedFolderBasePath, setSharedFolderBasePath] = useState<string | null>(null); // Base path of the shared folder
  const [currentPermission, setCurrentPermission] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(true);
  
  // Loading States
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  const [viewingFileId, setViewingFileId] = useState<string | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  
  // Modals - unified upload modal replaces separate file/URL modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isCreateFolderModalOpen, setIsCreateFolderModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; fileId: string | null; fileName: string }>({ isOpen: false, fileId: null, fileName: '' });
  const [deleteFolderConfirmation, setDeleteFolderConfirmation] = useState<{ isOpen: boolean; folderName: string | null }>({ isOpen: false, folderName: null });
  
  // Share Modal
  const [shareModal, setShareModal] = useState<{ 
    isOpen: boolean; 
    folderPath?: string; 
    folderName?: string;
  }>({ isOpen: false });
  
  // Rename Modal
  const [renameModal, setRenameModal] = useState<{ isOpen: boolean; fileId: string | null; currentName: string }>({ isOpen: false, fileId: null, currentName: '' });
  const [newFileName, setNewFileName] = useState('');
  
  // Folder name validation error
  const [folderNameError, setFolderNameError] = useState<string | null>(null);
  
  // Context Menu
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; position: { x: number; y: number }; type: 'file' | 'folder'; item: S3File | string | null }>({ isOpen: false, position: { x: 0, y: 0 }, type: 'file', item: null });
  
  // Multi-select
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  
  // Sidebar
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Drag and Drop
  const [isDragging, setIsDragging] = useState(false);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  
  // Clipboard for copy/cut/paste
  const [clipboard, setClipboard] = useState<{
    type: 'file' | 'folder';
    item: S3File | string;
    operation: 'copy' | 'cut';
    sourceFolder: string | null;
    sourceOwnerId?: string | null;
  } | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  
  // New Item States
  const [newFolderName, setNewFolderName] = useState('');
  
  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const folderTreeRef = useRef<FolderTreeRef>(null);

  // Fetch files from API
  const fetchFiles = useCallback(async () => {
    try {
      setIsLoading(true);
      
      let response: StorageListResponse;
      
      if (viewingOwnerId && currentFolder) {
        // Viewing shared folder
        response = await api.get<StorageListResponse>(`/api/storage/shared/${viewingOwnerId}`, { 
          params: { folder: currentFolder } 
        });
      } else {
        // Viewing own storage
        const params: Record<string, string> = currentFolder ? { folder: currentFolder } : {};
        response = await api.get<StorageListResponse>('/api/storage', { params });
      }
      
      if (response.success) {
        setFiles(response.data.files);
        setFolders(response.data.folders || []);
        setFoldersWithShareInfo(response.data.foldersWithShareInfo || []);
        setCurrentPermission(response.data.permission || null);
        setIsOwner(response.data.isOwner !== false);
      }
    } catch (error: any) {
      console.error('Failed to fetch files:', error);
      toast.error('Failed to load files');
    } finally {
      setIsLoading(false);
    }
  }, [currentFolder, viewingOwnerId]);

  // Fetch shared folders and files (only on home page)
  const fetchSharedItems = useCallback(async () => {
    // Only fetch when on home page (no current folder)
    if (currentFolder || viewingOwnerId) {
      setSharedFolders([]);
      setSharedFiles([]);
      return;
    }
    
    try {
      const response = await api.get<SharedWithMeResponse>('/api/sharing/shared-with-me');
      if (response.success) {
        setSharedFolders(response.data.folders);
        setSharedFiles(response.data.files);
      }
    } catch (error) {
      console.error('Failed to fetch shared items:', error);
    }
  }, [currentFolder, viewingOwnerId]);

  useEffect(() => {
    fetchFiles();
    fetchSharedItems();
  }, [fetchFiles, fetchSharedItems]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Backend search when debounced query changes
  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedSearchQuery.trim()) {
        setSearchResults(null);
        return;
      }

      try {
        setIsSearching(true);
        const response = await api.post<SearchResponse>('/api/storage/search', {
          query: debouncedSearchQuery.trim(),
          folder: currentFolder || undefined,
          limit: 50
        });

        if (response.success) {
          setSearchResults(response.data.files);
        }
      } catch (error: any) {
        console.error('Search failed:', error);
        // Fall back to client-side filtering on error
        setSearchResults(null);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearchQuery, currentFolder]);

  // Clear selection when folder changes
  useEffect(() => {
    setSelectedFiles(new Set());
    setSelectedFolders(new Set());
    setLastSelectedIndex(null);
    setSearchQuery('');
    setSearchResults(null);
  }, [currentFolder]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(prev => ({ ...prev, isOpen: false }));
    if (contextMenu.isOpen) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu.isOpen]);

  // Handle context menu for files
  const handleFileContextMenu = (e: React.MouseEvent, file: S3File) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      type: 'file',
      item: file
    });
  };

  // Handle context menu for folders
  const handleFolderContextMenu = (e: React.MouseEvent, folderName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      type: 'folder',
      item: folderName
    });
  };

  // Get context menu items based on type and permissions
  const getFileContextMenuItems = (file: S3File): ContextMenuItem[] => {
    const canEdit = isOwner || currentPermission === 'EDIT';
    const canDownload = isOwner || currentPermission === 'DOWNLOAD' || currentPermission === 'EDIT';
    
    return [
      { id: 'view', label: 'View', icon: <Eye className="w-4 h-4" />, onClick: () => handleViewFile(file) },
      { id: 'download', label: 'Download', icon: <Download className="w-4 h-4" />, onClick: () => handleDownload(file), disabled: !canDownload },
      { id: 'divider1', label: '', onClick: () => {}, divider: true },
      { id: 'copy', label: 'Copy', icon: <Copy className="w-4 h-4" />, onClick: () => handleCopyFile(file) },
      { id: 'cut', label: 'Cut', icon: <Scissors className="w-4 h-4" />, onClick: () => handleCutFile(file), disabled: !canEdit },
      { id: 'paste', label: 'Paste', icon: <ClipboardPaste className="w-4 h-4" />, onClick: () => handlePaste(), disabled: !clipboard || isPasting },
      { id: 'divider2', label: '', onClick: () => {}, divider: true },
      { id: 'rename', label: 'Rename', icon: <Edit3 className="w-4 h-4" />, onClick: () => openRenameModal(file), disabled: !canEdit },
      { id: 'divider3', label: '', onClick: () => {}, divider: true },
      { id: 'delete', label: 'Delete', icon: <Trash2 className="w-4 h-4" />, onClick: () => openDeleteConfirmation(file), danger: true, disabled: !canEdit }
    ];
  };

  const getFolderContextMenuItems = (folderName: string): ContextMenuItem[] => {
    const fullPath = currentFolder ? `${currentFolder}/${folderName}` : folderName;
    const canEdit = isOwner || currentPermission === 'EDIT';
    
    return [
      { id: 'open', label: 'Open', icon: <Folder className="w-4 h-4" />, onClick: () => navigateToFolder(folderName) },
      { id: 'divider1', label: '', onClick: () => {}, divider: true },
      { id: 'copy', label: 'Copy', icon: <Copy className="w-4 h-4" />, onClick: () => handleCopyFolder(folderName) },
      { id: 'cut', label: 'Cut', icon: <Scissors className="w-4 h-4" />, onClick: () => handleCutFolder(folderName), disabled: !canEdit },
      { id: 'paste', label: 'Paste', icon: <ClipboardPaste className="w-4 h-4" />, onClick: () => handlePaste(), disabled: !clipboard || isPasting },
      { id: 'divider2', label: '', onClick: () => {}, divider: true },
      { id: 'share', label: 'Share', icon: <Share2 className="w-4 h-4" />, onClick: () => openShareModal(fullPath, folderName), disabled: !isOwner },
      { id: 'divider3', label: '', onClick: () => {}, divider: true },
      { id: 'delete', label: 'Delete', icon: <Trash2 className="w-4 h-4" />, onClick: () => openDeleteFolderConfirmation(folderName), danger: true, disabled: !canEdit }
    ];
  };

  // Get context menu items for empty space (paste only)
  const getEmptySpaceContextMenuItems = (): ContextMenuItem[] => {
    const canEdit = isOwner || currentPermission === 'EDIT';
    return [
      { id: 'paste', label: 'Paste', icon: <ClipboardPaste className="w-4 h-4" />, onClick: () => handlePaste(), disabled: !clipboard || isPasting || !canEdit },
      { id: 'divider1', label: '', onClick: () => {}, divider: true },
      { id: 'newFolder', label: 'New Folder', icon: <Folder className="w-4 h-4" />, onClick: () => setIsCreateFolderModalOpen(true), disabled: !canEdit },
      { id: 'upload', label: 'Upload File', icon: <UploadCloud className="w-4 h-4" />, onClick: () => setIsUploadModalOpen(true), disabled: !canEdit },
    ];
  };

  // Handle right-click on empty space in the storage area
  const handleEmptySpaceContextMenu = (e: React.MouseEvent) => {
    // Prevent browser's default context menu in the storage area
    e.preventDefault();
    // Show storage context menu for empty space
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      type: 'file', // doesn't matter for empty space
      item: null
    });
  };

  // File selection with shift/ctrl support
  const handleFileClick = (file: S3File, index: number, e: React.MouseEvent) => {
    const allItems = [...folders.map(f => ({ type: 'folder' as const, name: f })), ...files.map(f => ({ type: 'file' as const, file: f }))];
    const fileIndex = folders.length + index;

    if (e.shiftKey && lastSelectedIndex !== null) {
      // Range selection
      const start = Math.min(lastSelectedIndex, fileIndex);
      const end = Math.max(lastSelectedIndex, fileIndex);
      
      const newSelectedFiles = new Set(selectedFiles);
      const newSelectedFolders = new Set(selectedFolders);
      
      for (let i = start; i <= end; i++) {
        const item = allItems[i];
        if (item.type === 'folder') {
          newSelectedFolders.add(item.name);
        } else {
          newSelectedFiles.add(item.file.id);
        }
      }
      
      setSelectedFiles(newSelectedFiles);
      setSelectedFolders(newSelectedFolders);
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle selection
      const newSelected = new Set(selectedFiles);
      if (newSelected.has(file.id)) {
        newSelected.delete(file.id);
      } else {
        newSelected.add(file.id);
      }
      setSelectedFiles(newSelected);
      setLastSelectedIndex(fileIndex);
    } else {
      // Single selection
      setSelectedFiles(new Set([file.id]));
      setSelectedFolders(new Set());
      setLastSelectedIndex(fileIndex);
    }
  };

  // Folder selection with shift/ctrl support  
  const handleFolderClick = (folderName: string, index: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedIndex !== null) {
      // Range selection
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      
      const newSelectedFolders = new Set(selectedFolders);
      for (let i = start; i <= end; i++) {
        newSelectedFolders.add(folders[i]);
      }
      setSelectedFolders(newSelectedFolders);
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle selection
      const newSelected = new Set(selectedFolders);
      if (newSelected.has(folderName)) {
        newSelected.delete(folderName);
      } else {
        newSelected.add(folderName);
      }
      setSelectedFolders(newSelected);
      setLastSelectedIndex(index);
    } else {
      // Single click - navigate
      navigateToFolder(folderName);
    }
  };

  // Open modals
  const openShareModal = (folderPath: string, folderName: string) => {
    setShareModal({ isOpen: true, folderPath, folderName });
  };

  const openRenameModal = (file: S3File) => {
    setRenameModal({ isOpen: true, fileId: file.id, currentName: file.fileName });
    setNewFileName(file.fileName);
  };

  // Handle rename
  const handleRename = async () => {
    if (!renameModal.fileId || !newFileName.trim()) return;
    
    try {
      setIsRenaming(true);
      const response = await api.put<StorageFileResponse>(`/api/storage/${renameModal.fileId}/rename`, {
        newName: newFileName.trim()
      });
      
      if (response.success) {
        toast.success('File renamed successfully');
        setRenameModal({ isOpen: false, fileId: null, currentName: '' });
        setNewFileName('');
        await fetchFiles();
      }
    } catch (error: any) {
      console.error('Failed to rename file:', error);
      toast.error(error.message || 'Failed to rename file');
    } finally {
      setIsRenaming(false);
    }
  };

  // Copy/Cut/Paste handlers
  const handleCopyFile = (file: S3File) => {
    setClipboard({
      type: 'file',
      item: file,
      operation: 'copy',
      sourceFolder: currentFolder
    });
    toast.success(`"${file.fileName}" copied to clipboard`);
  };

  const handleCutFile = (file: S3File) => {
    setClipboard({
      type: 'file',
      item: file,
      operation: 'cut',
      sourceFolder: currentFolder
    });
    toast.success(`"${file.fileName}" ready to move`);
  };

  const handleCopyFolder = (folderName: string) => {
    setClipboard({
      type: 'folder',
      item: folderName,
      operation: 'copy',
      sourceFolder: currentFolder,
      sourceOwnerId: viewingOwnerId
    });
    toast.success(`"${folderName}" copied to clipboard`);
  };

  const handleCutFolder = (folderName: string) => {
    setClipboard({
      type: 'folder',
      item: folderName,
      operation: 'cut',
      sourceFolder: currentFolder,
      sourceOwnerId: viewingOwnerId
    });
    toast.success(`"${folderName}" ready to move`);
  };

  const handlePaste = async () => {
    if (!clipboard) return;
    
    try {
      setIsPasting(true);
      
      if (clipboard.type === 'file') {
        const file = clipboard.item as S3File;
        const endpoint = clipboard.operation === 'copy' 
          ? '/api/storage/copy'
          : '/api/storage/move';
        
        const response = await api.post<StorageFileResponse>(endpoint, {
          fileId: file.id,
          destinationFolder: currentFolder || '',
          destinationOwnerId: viewingOwnerId || undefined
        });
        
        if (response.success) {
          toast.success(`File ${clipboard.operation === 'copy' ? 'copied' : 'moved'} successfully`);
          if (clipboard.operation === 'cut') {
            setClipboard(null);
          }
          await fetchFiles();
          folderTreeRef.current?.refresh();
        }
      } else {
        // Folder copy/move
        const folderName = clipboard.item as string;
        const sourcePath = clipboard.sourceFolder 
          ? `${clipboard.sourceFolder}/${folderName}` 
          : folderName;
        
        const endpoint = clipboard.operation === 'copy'
          ? '/api/storage/folder/copy'
          : '/api/storage/folder/move';
        
        const response = await api.post<StorageFolderResponse>(endpoint, {
          sourcePath,
          sourceOwnerId: clipboard.sourceOwnerId || undefined,
          destinationFolder: currentFolder || '',
          destinationOwnerId: viewingOwnerId || undefined
        });
        
        if (response.success) {
          toast.success(`Folder ${clipboard.operation === 'copy' ? 'copied' : 'moved'} successfully`);
          if (clipboard.operation === 'cut') {
            setClipboard(null);
          }
          await fetchFiles();
          folderTreeRef.current?.refresh();
        }
      }
    } catch (error: any) {
      console.error('Paste failed:', error);
      toast.error(error.message || `Failed to ${clipboard.operation} ${clipboard.type}`);
    } finally {
      setIsPasting(false);
    }
  };

  // Drag and drop for file upload
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only show upload overlay if dragging external files (not internal file move)
    // Check if this is an internal drag by looking for our custom data type
    const hasInternalData = e.dataTransfer.types.includes('application/json');
    if (!hasInternalData && e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set isDragging to false if we're leaving the drop zone entirely
    if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragOverFolder(null);
    
    // Check if this is an internal file move (has our JSON data)
    const internalData = e.dataTransfer.getData('application/json');
    if (internalData) {
      // This is a file move, not upload - ignore at main drop zone
      return;
    }
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;
    
    // Upload files
    setIsUploading(true);
    
    // Use shared endpoint when viewing shared folders
    const endpoint = viewingOwnerId 
      ? `/api/storage/shared/${viewingOwnerId}/upload`
      : '/api/storage/upload';
    
    for (const file of droppedFiles) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        if (currentFolder) {
          formData.append('folder', currentFolder);
        }
        
        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        
        const result = await response.json();
        
        if (result.success) {
          toast.success(`${file.name} uploaded successfully`);
        } else {
          throw new Error(result.error);
        }
      } catch (error: any) {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    
    setIsUploading(false);
    await fetchFiles();
  };

  // Handle drop on folder (move files to folder)
  const handleFolderDragOver = (e: React.DragEvent, folderName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(folderName);
  };

  const handleFolderDrop = async (e: React.DragEvent, targetFolderName: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);
    
    // Check if we're dropping files from the file list (file IDs in dataTransfer)
    const fileIds = e.dataTransfer.getData('application/json');
    if (fileIds) {
      const ids = JSON.parse(fileIds);
      
      // Determine target path based on whether it's a breadcrumb drop or folder drop
      let targetPath = '';
      if (targetFolderName === null) {
        // Drop on Home/breadcrumb root
        targetPath = '';
      } else if (targetFolderName === '') {
        // Drop on current folder (shouldn't happen but handle it)
        return;
      } else if (currentFolder && breadcrumbs.some(b => b.name === targetFolderName)) {
        // Drop on breadcrumb - use the breadcrumb path
        const breadcrumb = breadcrumbs.find(b => b.name === targetFolderName);
        targetPath = breadcrumb?.path || '';
      } else {
        // Drop on a folder tile in the current folder
        targetPath = currentFolder ? `${currentFolder}/${targetFolderName}` : targetFolderName;
      }
      
      for (const fileId of ids) {
        try {
          await api.put(`/api/storage/${fileId}/move`, { targetFolder: targetPath });
        } catch (error) {
          toast.error('Failed to move file');
        }
      }
      
      toast.success(`Moved ${ids.length} file(s)`);
      await fetchFiles();
    } else {
      // Handle regular file drop (upload)
      await handleDrop(e);
    }
  };

  // Handle file drag start (for moving)
  const handleFileDragStart = (e: React.DragEvent, file: S3File) => {
    const filesToMove = selectedFiles.has(file.id) ? Array.from(selectedFiles) : [file.id];
    e.dataTransfer.setData('application/json', JSON.stringify(filesToMove));
    e.dataTransfer.effectAllowed = 'move';
    
    // Create a custom drag image with file icon
    const dragImage = document.createElement('div');
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    dragImage.style.padding = '8px 12px';
    dragImage.style.backgroundColor = '#f3f4f6';
    dragImage.style.border = '1px solid #d1d5db';
    dragImage.style.borderRadius = '6px';
    dragImage.style.display = 'flex';
    dragImage.style.alignItems = 'center';
    dragImage.style.gap = '6px';
    dragImage.style.fontFamily = 'system-ui';
    dragImage.style.fontSize = '13px';
    dragImage.style.fontWeight = '500';
    dragImage.style.color = '#374151';
    dragImage.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
        <polyline points="13 2 13 9 20 9"></polyline>
      </svg>
      <span>${filesToMove.length} item${filesToMove.length > 1 ? 's' : ''}</span>
    `;
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  // Handle folder drag start (for moving folders)
  const handleFolderDragStart = (e: React.DragEvent, folderName: string) => {
    const folderPath = currentFolder ? `${currentFolder}/${folderName}` : folderName;
    e.dataTransfer.setData('application/folder', JSON.stringify({ path: folderPath }));
    e.dataTransfer.effectAllowed = 'move';
    
    // Create a custom drag image with folder icon
    const dragImage = document.createElement('div');
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    dragImage.style.padding = '8px 12px';
    dragImage.style.backgroundColor = '#fef3c7';
    dragImage.style.border = '1px solid #fbbf24';
    dragImage.style.borderRadius = '6px';
    dragImage.style.display = 'flex';
    dragImage.style.alignItems = 'center';
    dragImage.style.gap = '6px';
    dragImage.style.fontFamily = 'system-ui';
    dragImage.style.fontSize = '13px';
    dragImage.style.fontWeight = '500';
    dragImage.style.color = '#92400e';
    dragImage.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
      <span>${folderName}</span>
    `;
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  // Sidebar navigation handler
  const handleSidebarNavigate = (path: string | null, ownerId?: string) => {
    if (ownerId) {
      setViewingOwnerId(ownerId);
      setSharedFolderBasePath(path); // Store the base path of the shared folder
      setCurrentFolder(path);
    } else {
      setViewingOwnerId(null);
      setSharedFolderBasePath(null);
      setCurrentFolder(path);
    }
    setSearchQuery('');
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      setIsUploading(true);
      
      const formData = new FormData();
      formData.append('file', file);
      if (currentFolder) {
        formData.append('folder', currentFolder);
      }
      
      // Use shared endpoint when viewing shared folders
      const endpoint = viewingOwnerId 
        ? `/api/storage/shared/${viewingOwnerId}/upload`
        : '/api/storage/upload';
      
      // Use fetch directly for multipart upload
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success(`${file.name} uploaded successfully`);
        await fetchFiles();
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error: any) {
      console.error('Upload failed:', error);
      toast.error(error.message || 'Failed to upload file');
    } finally {
      setIsUploading(false);
      setIsUploadModalOpen(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Unified upload handlers for the modal
  const handleUploadFile = useCallback(async (file: File, onProgress?: (progress: number) => void) => {
    return new Promise<void>((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      if (currentFolder) {
        formData.append('folder', currentFolder);
      }
      
      // Use shared endpoint when viewing shared folders to upload under owner's account
      const endpoint = viewingOwnerId 
        ? `/api/storage/shared/${viewingOwnerId}/upload`
        : '/api/storage/upload';
      
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
      
      xhr.onload = async () => {
        try {
          const result = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && result.success) {
            toast.success(`${file.name} uploaded successfully`);
            await fetchFiles();
            resolve();
          } else {
            throw new Error(result.error || 'Upload failed');
          }
        } catch (error: any) {
          console.error('Upload failed:', error);
          toast.error(error.message || 'Failed to upload file');
          reject(error);
        }
      };
      
      xhr.onerror = () => {
        console.error('Upload failed: Network error');
        toast.error('Failed to upload file: Network error');
        reject(new Error('Network error'));
      };
      
      xhr.open('POST', endpoint);
      xhr.withCredentials = true;
      xhr.send(formData);
    });
  }, [currentFolder, viewingOwnerId, fetchFiles]);

  const handleUploadFromUrl = useCallback(async (url: string, fileName: string) => {
    try {
      setIsUploading(true);
      
      // Use shared endpoint when viewing shared folders
      const endpoint = viewingOwnerId 
        ? `/api/storage/shared/${viewingOwnerId}/upload-from-url`
        : '/api/storage/upload-from-url';
      
      const response = await api.post<StorageFileResponse>(endpoint, {
        url,
        fileName,
        folder: currentFolder || undefined
      });
      
      if (response.success) {
        toast.success(`${fileName} imported successfully`);
        await fetchFiles();
      }
    } catch (error: any) {
      console.error('Failed to import file from URL:', error);
      toast.error(error.message || 'Failed to import file from URL');
    } finally {
      setIsUploading(false);
    }
  }, [currentFolder, viewingOwnerId, fetchFiles]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    // Validate folder name
    const validation = validateFolderName(newFolderName.trim());
    if (!validation.isValid) {
      setFolderNameError(validation.error || 'Invalid folder name');
      return;
    }
    
    try {
      setIsCreatingFolder(true);
      setFolderNameError(null);
      const folderPath = currentFolder ? `${currentFolder}/${newFolderName}` : newFolderName;
      
      // Use shared endpoint when viewing shared folders to create folder under owner's account
      const endpoint = viewingOwnerId 
        ? `/api/storage/shared/${viewingOwnerId}/folders`
        : '/api/storage/folders';
      
      const response = await api.post<StorageFolderResponse>(endpoint, {
        folder: folderPath
      });
      
      if (response.success) {
        toast.success(`Folder "${newFolderName}" created`);
        setNewFolderName('');
        setIsCreateFolderModalOpen(false);
        await fetchFiles();
        // Refresh folder tree to show new folder
        folderTreeRef.current?.refresh();
      }
    } catch (error: any) {
      console.error('Failed to create folder:', error);
      toast.error(error.message || 'Failed to create folder');
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const openDeleteConfirmation = (file: S3File) => {
    setDeleteConfirmation({ isOpen: true, fileId: file.id, fileName: file.fileName });
  };

  const handleDelete = async (id: string) => {
    try {
      setDeletingFileId(id);
      setDeleteConfirmation({ isOpen: false, fileId: null, fileName: '' });
      
      // Use shared endpoint when viewing shared files
      const endpoint = viewingOwnerId 
        ? `/api/storage/shared/${viewingOwnerId}/file/${id}`
        : `/api/storage/${id}`;
      
      const response = await api.delete<StorageDeleteResponse>(endpoint);
      
      if (response.success) {
        toast.success('File deleted successfully');
        setFiles(prev => prev.filter(f => f.id !== id));
      }
    } catch (error: any) {
      console.error('Failed to delete file:', error);
      toast.error(error.message || 'Failed to delete file');
    } finally {
      setDeletingFileId(null);
    }
  };

  const openDeleteFolderConfirmation = (folderName: string) => {
    setDeleteFolderConfirmation({ isOpen: true, folderName });
  };

  const handleDeleteFolder = async () => {
    const folderName = deleteFolderConfirmation.folderName;
    if (!folderName) return;
    
    try {
      // Get the full folder path
      const fullFolderPath = currentFolder ? `${currentFolder}/${folderName}` : folderName;
      setDeletingFolder(folderName);
      setDeleteFolderConfirmation({ isOpen: false, folderName: null });
      
      const response = await api.delete<StorageDeleteResponse>(`/api/storage/folders?folder=${encodeURIComponent(fullFolderPath)}`);
      
      if (response.success) {
        toast.success('Folder deleted successfully');
        await fetchFiles();
        // Refresh folder tree to remove deleted folder
        folderTreeRef.current?.refresh();
      }
    } catch (error: any) {
      console.error('Failed to delete folder:', error);
      toast.error('Failed to delete folder');
    } finally {
      setDeletingFolder(null);
    }
  };

  const handleViewFile = async (file: S3File) => {
    try {
      setViewingFileId(file.id);
      toast.info('Loading file preview...');
      
      // Get fresh signed URL from backend - use shared endpoint if viewing shared folder
      const endpoint = viewingOwnerId 
        ? `/api/storage/shared/${viewingOwnerId}/file/${file.id}`
        : `/api/storage/${file.id}`;
      
      const response = await api.get<StorageFileResponse>(endpoint);
      
      if (response.success) {
        // Open file in new tab for viewing
        window.open(response.data.url, '_blank');
      }
    } catch (error: any) {
      console.error('Failed to view file:', error);
      toast.error('Failed to view file');
    } finally {
      setViewingFileId(null);
    }
  };

  const handleDownload = async (file: S3File) => {
    try {
      setDownloadingFileId(file.id);
      toast.info(`Preparing ${file.fileName} for download...`);
      
      // Use backend download endpoint to avoid CSP issues - use shared endpoint if viewing shared folder
      const endpoint = viewingOwnerId 
        ? `/api/storage/shared/${viewingOwnerId}/file/${file.id}/download`
        : `/api/storage/${file.id}/download`;
      
      const response = await fetch(endpoint, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Download failed');
      }
      
      // For large files, use streaming approach with blob URL that persists longer
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName;
      
      // Ensure link is visible for screen readers but not visually
      link.style.display = 'none';
      document.body.appendChild(link);
      
      // Trigger download
      link.click();
      
      // Clean up after a delay to ensure download starts properly (especially for large files)
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
      
      toast.success(`${file.fileName} downloaded!`);
    } catch (error: any) {
      console.error('Failed to download file:', error);
      toast.error('Failed to download file');
    } finally {
      setDownloadingFileId(null);
    }
  };

  // Navigation Logic
  const navigateToFolder = (folderName: string | null) => {
    if (folderName === null) {
      setCurrentFolder(null);
    } else if (currentFolder) {
      setCurrentFolder(`${currentFolder}/${folderName}`);
    } else {
      setCurrentFolder(folderName);
    }
    setSearchQuery('');
  };

  const getBreadcrumbs = () => {
    if (!currentFolder) return [];
    
    // For shared folders, show relative path from the shared folder base
    if (viewingOwnerId && sharedFolderBasePath) {
      // Get the shared folder name (last part of base path)
      const baseName = sharedFolderBasePath.split('/').pop() || sharedFolderBasePath;
      
      // Check if we're in a subfolder of the shared folder
      if (currentFolder === sharedFolderBasePath) {
        // At the root of shared folder
        return [{ name: baseName, path: sharedFolderBasePath }];
      }
      
      if (currentFolder.startsWith(sharedFolderBasePath + '/')) {
        // In a subfolder of the shared folder
        const relativePath = currentFolder.slice(sharedFolderBasePath.length + 1);
        const parts = relativePath.split('/');
        
        // Start with the shared folder as root
        const crumbs = [{ name: baseName, path: sharedFolderBasePath }];
        
        // Add subfolders
        parts.forEach((name, index) => {
          crumbs.push({
            name,
            path: sharedFolderBasePath + '/' + parts.slice(0, index + 1).join('/')
          });
        });
        
        return crumbs;
      }
    }
    
    // Regular folder navigation
    return currentFolder.split('/').map((name, index, arr) => ({
      name,
      path: arr.slice(0, index + 1).join('/')
    }));
  };

  // Filter Logic
  // Use search results if available, otherwise filter locally
  const filteredFiles = useMemo(() => {
    if (searchResults !== null) {
      return searchResults;
    }
    if (searchQuery) {
      return files.filter(f => f.fileName.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return files;
  }, [files, searchQuery, searchResults]);

  const filteredFolders = useMemo(() => {
    if (searchQuery) {
      return folders.filter(f => f.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return folders;
  }, [folders, searchQuery]);

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf':
        return <FileText className="w-8 h-8 text-red-500" />;
      case 'pptx':
        return <FileType className="w-8 h-8 text-orange-500" />;
      case 'docx':
        return <FileText className="w-8 h-8 text-blue-500" />;
      case 'sheet':
        return <FileText className="w-8 h-8 text-green-500" />;
      case 'image':
        return <Image className="w-8 h-8 text-purple-500" />;
      default:
        return <File className="w-8 h-8 text-slate-500" />;
    }
  };

  const breadcrumbs = getBreadcrumbs();

  const canUpload = isOwner || currentPermission === 'EDIT';
  const canEdit = isOwner || currentPermission === 'EDIT';
  const canDownload = isOwner || currentPermission === 'DOWNLOAD' || currentPermission === 'EDIT';

  return (
    <div className="flex h-full">
      {/* Folder Tree Sidebar */}
      <div className={`${isSidebarOpen ? 'w-64' : 'w-0'} transition-all duration-300 overflow-hidden border-r border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface flex-shrink-0`}>
        <FolderTree
          ref={folderTreeRef}
          currentFolder={currentFolder}
          onNavigate={handleSidebarNavigate}
          onCreateFolder={() => setIsCreateFolderModalOpen(true)}
        />
      </div>

      {/* Main Content */}
      <div 
        ref={dropZoneRef}
        className={`flex-1 p-6 lg:p-10 h-full overflow-y-auto relative ${isDragging ? 'bg-productivity-50 dark:bg-productivity-900/10' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-4 border-2 border-dashed border-productivity-500 rounded-2xl bg-productivity-100/50 dark:bg-productivity-900/30 flex items-center justify-center z-10 pointer-events-none">
            <div className="text-center">
              <UploadCloud className="w-12 h-12 mx-auto text-productivity-500 mb-2" />
              <p className="text-lg font-medium text-productivity-700 dark:text-productivity-300">Drop files here to upload</p>
              <p className="text-sm text-productivity-600 dark:text-productivity-400">to {currentFolder || 'Home'}</p>
            </div>
          </div>
        )}

        <header className="mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div className="flex items-center gap-3">
              {/* Sidebar toggle */}
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              >
                {isSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
              </button>
              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-1">
                  {viewingOwnerId ? 'Shared Files' : 'Files & Knowledge'}
                </h1>
                <p className="text-slate-500 dark:text-slate-400">
                  {viewingOwnerId 
                    ? `Viewing shared folder • ${currentPermission === 'EDIT' ? 'Can edit' : currentPermission === 'DOWNLOAD' ? 'Can download' : 'View only'}`
                    : 'Central repository for your documents and assets.'
                  }
                </p>
              </div>
          </div>
          <div className="flex items-center gap-3">
               <div className="relative hidden lg:block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                      type="text" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search files..." 
                      className="pl-9 pr-10 py-2 rounded-xl bg-white dark:bg-dark-surface border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-productivity-500/50 w-64 transition-all"
                  />
                  {isSearching && (
                    <ProductivitySpinner size="sm" className="absolute right-3 top-1/2 -translate-y-1/2" />
                  )}
               </div>
               
               <div className="flex gap-2">
                  {canUpload && (
                    <>
                      <button 
                          onClick={() => setIsCreateFolderModalOpen(true)}
                          className="bg-white dark:bg-dark-surface hover:bg-slate-50 dark:hover:bg-dark-bg text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-xl flex items-center gap-2 transition-colors shadow-sm"
                          title="New Folder"
                      >
                          <Folder className="w-5 h-5" />
                          <span className="hidden sm:inline">New Folder</span>
                      </button>
                      <button 
                          onClick={() => setIsUploadModalOpen(true)}
                          className="bg-productivity-600 hover:bg-productivity-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-productivity-500/20"
                      >
                          <UploadCloud className="w-5 h-5" />
                          <span className="hidden sm:inline">Upload</span>
                      </button>
                    </>
                  )}
               </div>
          </div>
        </header>

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          multiple
        />

        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-sm mb-6 text-slate-500 dark:text-slate-400 overflow-x-auto pb-2"
             onDragOver={(e) => handleDragOver(e)}
             onDrop={(e) => handleFolderDrop(e, null)}>
            <button 
              onClick={() => { setCurrentFolder(null); setViewingOwnerId(null); setSharedFolderBasePath(null); }}
              onDragOver={(e) => {e.preventDefault(); e.stopPropagation();}}
              onDrop={(e) => handleFolderDrop(e, null)}
              className={`flex items-center gap-1 hover:text-productivity-600 dark:hover:text-productivity-400 transition-colors ${!currentFolder ? 'font-bold text-slate-900 dark:text-white' : ''}`}
            >
                <Home className="w-4 h-4" />
                Home
            </button>
            {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb.path}>
                    <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                    <button 
                      onClick={() => setCurrentFolder(crumb.path)}
                      onDragOver={(e) => {e.preventDefault(); e.stopPropagation();}}
                      onDrop={(e) => handleFolderDrop(e, crumb.name)}
                      className={`whitespace-nowrap hover:text-productivity-600 dark:hover:text-productivity-400 transition-colors ${index === breadcrumbs.length - 1 ? 'font-bold text-slate-900 dark:text-white' : ''}`}
                    >
                        {crumb.name}
                  </button>
              </React.Fragment>
          ))}
          
          {/* Share current folder button */}
          {currentFolder && isOwner && (
            <button
              onClick={() => openShareModal(currentFolder, currentFolder.split('/').pop() || currentFolder)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-productivity-600 dark:text-productivity-400 hover:bg-productivity-50 dark:hover:bg-productivity-900/20 rounded-lg transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <ProductivityLoader fullScreen={false} text="Loading files..." />
        </div>
      )}

      {/* Shared Folders Grid - Only show on home page */}
      {!isLoading && !currentFolder && !viewingOwnerId && sharedFolders.length > 0 && (
        <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Shared with me
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {sharedFolders.map((folder) => (
                    <div 
                        key={folder.id}
                        onClick={() => handleSidebarNavigate(folder.path, folder.owner.id)}
                        className="relative flex flex-col items-center p-4 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl transition-all cursor-pointer group hover:scale-[1.02] hover:shadow-md"
                    >
                        <div className="absolute top-2 right-2">
                          <span className={`text-[10px] px-2 py-1 rounded-full font-medium ${
                            folder.permission === 'EDIT' 
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                              : folder.permission === 'DOWNLOAD' 
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' 
                                : 'bg-slate-100 dark:bg-dark-bg text-slate-600 dark:text-slate-400'
                          }`}>
                            {folder.permission === 'EDIT' ? 'Edit' : folder.permission === 'DOWNLOAD' ? 'Download' : 'View'}
                          </span>
                        </div>
                        <div className="flex flex-col items-center w-full">
                            <Folder className="w-10 h-10 text-blue-500 dark:text-blue-400 mb-2" fill="currentColor" fillOpacity={0.2} />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate w-full text-center">{folder.name}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 truncate w-full text-center mt-1">
                              {folder.owner.firstName} {folder.owner.lastName}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      )}

      {/* Shared Files Section - Only show on home page */}
      {!isLoading && !currentFolder && !viewingOwnerId && sharedFiles.length > 0 && (
        <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <File className="w-4 h-4" />
              Shared files
            </h3>
            <div className="bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700/50 bg-slate-50/50 dark:bg-dark-bg/30">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Owner</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Size</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Permission</th>
                  </tr>
                </thead>
                <tbody>
                  {sharedFiles.map((file) => (
                    <tr 
                      key={file.id}
                      className="border-b border-slate-100 dark:border-slate-700/30 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                            <File className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{file.fileName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {file.owner.firstName} {file.owner.lastName}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {formatFileSize(file.size)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          file.permission === 'EDIT' 
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                            : file.permission === 'DOWNLOAD' 
                              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' 
                              : 'bg-slate-100 dark:bg-dark-bg text-slate-600 dark:text-slate-400'
                        }`}>
                          {file.permission === 'EDIT' ? 'Edit' : file.permission === 'DOWNLOAD' ? 'Download' : 'View'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </div>
      )}

      {/* Folders Grid */}
      {!isLoading && !searchQuery && filteredFolders.length > 0 && (
        <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Folders</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {filteredFolders.map((folderName, index) => {
                    const isDeleting = deletingFolder === folderName;
                    const isSelected = selectedFolders.has(folderName);
                    const isDragOver = dragOverFolder === folderName;
                    const folderShareInfo = foldersWithShareInfo.find(f => f.name === folderName);
                    const isFolderShared = folderShareInfo?.isShared || false;
                    
                    return (
                    <div 
                        key={folderName}
                        draggable
                        onDragStart={(e) => handleFolderDragStart(e, folderName)}
                        onContextMenu={(e) => handleFolderContextMenu(e, folderName)}
                        onClick={(e) => handleFolderClick(folderName, index, e)}
                        onDragOver={(e) => handleFolderDragOver(e, folderName)}
                        onDragLeave={() => setDragOverFolder(null)}
                        onDrop={(e) => handleFolderDrop(e, folderName)}
                        className={`
                          relative flex flex-col items-center p-4 bg-white dark:bg-dark-surface border rounded-xl transition-all cursor-pointer group
                          ${isSelected ? 'border-productivity-500 bg-productivity-50 dark:bg-productivity-900/20 ring-2 ring-productivity-500/30' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:scale-[1.02]'}
                          ${isDragOver ? 'border-productivity-500 bg-productivity-100 dark:bg-productivity-900/30 scale-105' : ''}
                        `}
                    >
                        {/* Action buttons */}
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          {isOwner && (
                            <button
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  const fullPath = currentFolder ? `${currentFolder}/${folderName}` : folderName;
                                  openShareModal(fullPath, folderName); 
                                }}
                                className="p-1.5 text-slate-400 hover:text-productivity-600 rounded-lg hover:bg-productivity-50 dark:hover:bg-productivity-900/20"
                                title="Share folder"
                            >
                                <Share2 className="w-4 h-4" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                                onClick={(e) => { e.stopPropagation(); openDeleteFolderConfirmation(folderName); }}
                                disabled={isDeleting}
                                className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                                title="Delete folder"
                            >
                                {isDeleting ? <ProductivitySpinner size="sm" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                        {/* Shared indicator */}
                        {isFolderShared && (
                          <div className="absolute top-2 left-2">
                            <div className="p-1 bg-blue-100 dark:bg-blue-900/30 rounded-full" title="Shared">
                              <Users className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                            </div>
                          </div>
                        )}
                        <div className="flex flex-col items-center w-full">
                            <Folder className="w-10 h-10 text-slate-400 group-hover:text-productivity-500 dark:text-slate-600 dark:group-hover:text-productivity-400 transition-colors mb-2" fill="currentColor" fillOpacity={0.1} />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate w-full text-center">{folderName}</span>
                        </div>
                    </div>
                    );
                })}
            </div>
        </div>
      )}

      {/* Files List */}
      {!isLoading && (
      <div 
        className="bg-white dark:bg-dark-surface rounded-2xl border border-slate-200 dark:border-dark-border overflow-hidden shadow-sm"
        onContextMenu={handleEmptySpaceContextMenu}
      >
         <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-dark-bg/50 border-b border-slate-200 dark:border-dark-border">
                    <tr>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden sm:table-cell">Location</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden md:table-cell">Size</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden lg:table-cell">Date Added</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden xl:table-cell">Type</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredFiles.map((file, index) => (
                        <tr 
                            key={file.id} 
                            className={`hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group cursor-pointer ${
                                selectedFiles.has(file.id) ? 'bg-productivity-50 dark:bg-productivity-900/20' : ''
                            }`}
                            onClick={(e) => handleFileClick(file, index, e)}
                            onContextMenu={(e) => handleFileContextMenu(e, file)}
                            draggable={canEdit}
                            onDragStart={(e) => handleFileDragStart(e, file)}
                        >
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-4">
                                    <div className={`p-2 rounded-lg ${
                                        selectedFiles.has(file.id) 
                                            ? 'bg-productivity-100 dark:bg-productivity-800' 
                                            : 'bg-slate-100 dark:bg-dark-bg'
                                    }`}>
                                        {getFileIcon(getFileTypeFromMime(file.mimeType))}
                                    </div>
                                    <div className="cursor-pointer" onClick={(e) => { e.stopPropagation(); handleViewFile(file); }}>
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-slate-900 dark:text-white hover:text-productivity-600 dark:hover:text-productivity-400 transition-colors">{file.fileName}</span>
                                            {file.isShared && (
                                                <div className="p-0.5 bg-blue-100 dark:bg-blue-900/30 rounded-full" title="Shared">
                                                    <Users className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-xs text-slate-500 uppercase">{file.mimeType.split('/')[1] || 'file'}</div>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4 hidden sm:table-cell text-sm text-slate-600 dark:text-slate-400">
                                <div className="flex items-center gap-1.5">
                                    <Folder className="w-4 h-4 text-slate-400" />
                                    <span className="truncate max-w-[150px]" title={file.folder || 'Root'}>
                                        {file.folder ? file.folder.split('/').pop() || file.folder : 'Root'}
                                    </span>
                                </div>
                            </td>
                            <td className="px-6 py-4 hidden md:table-cell text-sm text-slate-600 dark:text-slate-400">
                                {formatFileSize(file.size)}
                            </td>
                            <td className="px-6 py-4 hidden lg:table-cell text-sm text-slate-600 dark:text-slate-400">
                                {new Date(file.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 hidden xl:table-cell">
                                <span className="text-xs px-2 py-1 rounded-full border bg-productivity-50 dark:bg-productivity-900/20 text-productivity-600 dark:text-productivity-400 border-productivity-100 dark:border-productivity-800">
                                    Productivity
                                </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleViewFile(file); }}
                                        disabled={viewingFileId === file.id}
                                        className="p-2 text-slate-400 hover:text-productivity-600 dark:hover:text-productivity-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                                        title="View file"
                                    >
                                        {viewingFileId === file.id ? <ProductivitySpinner size="sm" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                    {canDownload && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
                                            disabled={downloadingFileId === file.id}
                                            className="p-2 text-slate-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                                            title="Download file"
                                        >
                                            {downloadingFileId === file.id ? <ProductivitySpinner size="sm" /> : <Download className="w-4 h-4" />}
                                        </button>
                                    )}
                                    {canEdit && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); openDeleteConfirmation(file); }}
                                            disabled={deletingFileId === file.id}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                            title="Delete file"
                                        >
                                            {deletingFileId === file.id ? <ProductivitySpinner size="sm" /> : <Trash2 className="w-4 h-4" />}
                                        </button>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                    {filteredFiles.length === 0 && (
                        <tr>
                            <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                                {searchQuery ? 'No files match your search.' : 'No files in this folder.'}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
         </div>
      </div>
      )}

      </div>
      {/* End of Main Content */}

      {/* Unified Upload Modal */}
      <UnifiedUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadFile={handleUploadFile}
        onUploadFromUrl={handleUploadFromUrl}
        currentFolder={currentFolder}
        isUploading={isUploading}
      />

      {/* Create Folder Modal */}
      {isCreateFolderModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm">
             <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border p-6 animate-in fade-in zoom-in duration-200">
                 <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">New Folder</h2>
                    <button onClick={() => { setIsCreateFolderModalOpen(false); setFolderNameError(null); }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                        <X className="w-5 h-5" />
                    </button>
                 </div>
                 
                 <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Folder Name</label>
                        <input 
                          type="text"
                          value={newFolderName}
                          onChange={(e) => { setNewFolderName(e.target.value); setFolderNameError(null); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && newFolderName.trim() && !isCreatingFolder) {
                              e.preventDefault();
                              handleCreateFolder();
                            }
                          }}
                          placeholder="e.g. Project Alpha"
                          className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-bg border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                          autoFocus
                        />
                    </div>
                    {folderNameError && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <p className="text-sm text-red-600 dark:text-red-400">{folderNameError}</p>
                      </div>
                    )}
                    <div className="pt-2 flex gap-3">
                        <button 
                            onClick={() => { setIsCreateFolderModalOpen(false); setFolderNameError(null); }}
                            disabled={isCreatingFolder}
                            className="flex-1 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleCreateFolder}
                            disabled={!newFolderName.trim() || isCreatingFolder}
                            className="flex-1 py-2.5 bg-productivity-600 hover:bg-productivity-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-lg shadow-productivity-500/25 transition-colors flex items-center justify-center gap-2"
                        >
                            {isCreatingFolder ? <><ProductivitySpinner size="sm" /> Creating...</> : 'Create'}
                        </button>
                    </div>
                 </div>
             </div>
          </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/60 backdrop-blur-md">
             <div className="bg-white dark:bg-dark-surface w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border p-6 animate-in fade-in zoom-in duration-200">
                 <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                        <AlertCircle className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Delete File</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Are you sure you want to delete <span className="font-medium text-slate-700 dark:text-slate-300">"{deleteConfirmation.fileName}"</span>? This action cannot be undone.
                        </p>
                    </div>
                    <div className="flex gap-3 w-full mt-2">
                        <button 
                            onClick={() => setDeleteConfirmation({ isOpen: false, fileId: null, fileName: '' })}
                            className="flex-1 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={() => deleteConfirmation.fileId && handleDelete(deleteConfirmation.fileId)}
                            disabled={deletingFileId !== null}
                            className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl shadow-lg shadow-red-500/25 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {deletingFileId ? <><ProductivitySpinner size="sm" /> Deleting...</> : 'Delete'}
                        </button>
                    </div>
                 </div>
             </div>
          </div>
      )}

      {/* Delete Folder Confirmation Modal */}
      {deleteFolderConfirmation.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/60 backdrop-blur-md">
             <div className="bg-white dark:bg-dark-surface w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border p-6 animate-in fade-in zoom-in duration-200">
                 <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                        <AlertCircle className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Delete Folder</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Are you sure you want to delete <span className="font-medium text-slate-700 dark:text-slate-300">"{deleteFolderConfirmation.folderName}"</span> and all its contents? This action cannot be undone.
                        </p>
                    </div>
                    <div className="flex gap-3 w-full mt-2">
                        <button 
                            onClick={() => setDeleteFolderConfirmation({ isOpen: false, folderName: null })}
                            className="flex-1 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleDeleteFolder}
                            disabled={deletingFolder !== null}
                            className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl shadow-lg shadow-red-500/25 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {deletingFolder ? <><ProductivitySpinner size="sm" /> Deleting...</> : 'Delete'}
                        </button>
                    </div>
                 </div>
             </div>
          </div>
      )}

      {/* Rename Modal */}
      {renameModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/60 backdrop-blur-md">
             <div className="bg-white dark:bg-dark-surface w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border p-6 animate-in fade-in zoom-in duration-200">
                 <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-productivity-100 dark:bg-productivity-900/30 flex items-center justify-center text-productivity-600 dark:text-productivity-400">
                            <Edit3 className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Rename File</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Enter a new name for the file</p>
                        </div>
                    </div>
                    
                    <input 
                        type="text"
                        value={newFileName}
                        onChange={(e) => setNewFileName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newFileName.trim()) {
                            handleRename();
                          }
                        }}
                        placeholder="New file name"
                        className="w-full p-3 rounded-xl bg-slate-50 dark:bg-dark-bg border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none"
                        autoFocus
                    />
                    
                    <div className="flex gap-3 w-full mt-2">
                        <button 
                            onClick={() => {
                              setRenameModal({ isOpen: false, fileId: null, currentName: '' });
                              setNewFileName('');
                            }}
                            disabled={isRenaming}
                            className="flex-1 py-2.5 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleRename}
                            disabled={!newFileName.trim() || isRenaming}
                            className="flex-1 py-2.5 bg-productivity-600 hover:bg-productivity-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-lg shadow-productivity-500/25 transition-colors flex items-center justify-center gap-2"
                        >
                            {isRenaming && <ProductivitySpinner size="sm" />}
                            {isRenaming ? 'Renaming...' : 'Rename'}
                        </button>
                    </div>
                 </div>
             </div>
          </div>
      )}

      {/* Share Modal */}
      {shareModal.isOpen && (
        <ShareModal
          isOpen={shareModal.isOpen}
          onClose={() => setShareModal({ isOpen: false })}
          folderName={shareModal.folderName}
          folderPath={shareModal.folderPath}
          onShareComplete={fetchFiles}
        />
      )}

      {/* Context Menu */}
      {contextMenu.isOpen && (
        <ContextMenu
          position={contextMenu.position}
          onClose={() => setContextMenu({ isOpen: false, position: { x: 0, y: 0 }, type: 'file', item: null })}
          items={contextMenu.item === null
            ? getEmptySpaceContextMenuItems()
            : contextMenu.type === 'file' && typeof contextMenu.item !== 'string'
              ? getFileContextMenuItems(contextMenu.item as S3File)
              : contextMenu.type === 'folder' && typeof contextMenu.item === 'string'
                ? getFolderContextMenuItems(contextMenu.item)
                : []
          }
        />
      )}
    </div>
  );
};

export default FilesPage;
