import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Users, Trash2, ChevronDown, Check, AlertCircle, Link2 } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';
import ProductivityLoader from './ui/ProductivityLoader';
import ProductivitySpinner from './ui/ProductivitySpinner';

type Permission = 'VIEW' | 'DOWNLOAD' | 'EDIT';

interface SharedUser {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
  };
  permission: Permission;
  sharedAt: string;
}

interface SearchUser {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderPath?: string;
  folderName?: string;
  onShareComplete?: () => void;
}

const PERMISSION_LABELS: Record<Permission, string> = {
  VIEW: 'Can view',
  DOWNLOAD: 'Can download',
  EDIT: 'Can edit'
};

const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  VIEW: 'View files and folders only',
  DOWNLOAD: 'View and download files',
  EDIT: 'View, download, upload, and delete files'
};

const ShareModal: React.FC<ShareModalProps> = ({ 
  isOpen, 
  onClose,
  folderPath = '', 
  folderName = '',
  onShareComplete
}) => {
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPermission, setSelectedPermission] = useState<Permission>('DOWNLOAD');
  const [showPermissionDropdown, setShowPermissionDropdown] = useState(false);
  const [removingShareId, setRemovingShareId] = useState<string | null>(null);
  const [addingUser, setAddingUser] = useState<string | null>(null);

  // Fetch folder shares
  const fetchShares = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Get or create folder record and fetch shares
      const response = await api.post<{
        success: boolean;
        data: {
          id: string;
          path: string;
          shares: SharedUser[];
        };
      }>('/api/sharing/folder/by-path', { path: folderPath });

      if (response.success) {
        setCurrentItemId(response.data.id);
        setSharedUsers(response.data.shares);
      }
    } catch (error: any) {
      console.error('Failed to fetch folder shares:', error);
      toast.error('Failed to load sharing information');
    } finally {
      setIsLoading(false);
    }
  }, [folderPath]);

  useEffect(() => {
    if (isOpen) {
      fetchShares();
    }
  }, [isOpen, fetchShares]);

  // Search users
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const searchUsers = async () => {
      try {
        setIsSearching(true);
        const response = await api.post<{
          success: boolean;
          data: SearchUser[];
        }>('/api/sharing/users/search', { q: searchQuery });

        if (response.success) {
          // Filter out users who already have access
          const existingUserIds = new Set(sharedUsers.map(s => s.user.id));
          setSearchResults(response.data.filter((u: SearchUser) => !existingUserIds.has(u.id)));
        }
      } catch (error) {
        console.error('User search failed:', error);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, sharedUsers]);

  const handleShareWithUser = async (user: SearchUser) => {
    if (!currentItemId) return;
    
    if (!user.email) {
      toast.error('Cannot share with user without email');
      return;
    }

    try {
      setAddingUser(user.id);
      
      const endpoint = `/api/sharing/folder/${currentItemId}/share`;

      const response = await api.post<{
        success: boolean;
        data: SharedUser;
      }>(endpoint, {
        email: user.email,
        permission: selectedPermission
      });

      if (response.success) {
        setSharedUsers(prev => [...prev, response.data]);
        setSearchQuery('');
        setSearchResults([]);
        toast.success(`Shared with ${user.firstName}`);
        onShareComplete?.();
      }
    } catch (error: any) {
      console.error('Failed to share:', error);
      toast.error(error.message || 'Failed to share folder');
    } finally {
      setAddingUser(null);
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    try {
      setRemovingShareId(shareId);
      
      const endpoint = `/api/sharing/share/${shareId}`;

      const response = await api.delete<{ success: boolean }>(endpoint);

      if (response.success) {
        setSharedUsers(prev => prev.filter(s => s.id !== shareId));
        toast.success('Access removed');
        onShareComplete?.();
      }
    } catch (error: any) {
      console.error('Failed to remove share:', error);
      toast.error('Failed to remove access');
    } finally {
      setRemovingShareId(null);
    }
  };

  const handleUpdatePermission = async (shareId: string, newPermission: Permission) => {
    try {
      const endpoint = `/api/sharing/share/${shareId}`;

      const response = await api.put<{
        success: boolean;
        data: SharedUser;
      }>(endpoint, { permission: newPermission });

      if (response.success) {
        setSharedUsers(prev => 
          prev.map(s => s.id === shareId ? { ...s, permission: newPermission } : s)
        );
        toast.success('Permission updated');
      }
    } catch (error: any) {
      console.error('Failed to update permission:', error);
      toast.error('Failed to update permission');
    }
  };

  const copyShareLink = async () => {
    // Generate a share link that includes the folder ID for authorized access
    if (!currentItemId) {
      toast.error('Unable to generate share link');
      return;
    }
    
    try {
      const shareUrl = `${window.location.origin}/dashboard/files?shared=${currentItemId}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Share link copied! Only users with access can view this folder.');
    } catch (error) {
      console.error('Failed to copy link:', error);
      toast.error('Failed to copy link to clipboard');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-dark-surface w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-productivity-100 dark:bg-productivity-900/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-productivity-600 dark:text-productivity-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Share "{folderName || 'Folder'}"</h2>
              {folderPath && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{folderPath}</p>
              )}
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Search & Add People */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Add people
            </label>
            
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-productivity-500 outline-none text-sm"
                />
                {isSearching && (
                  <ProductivitySpinner size="sm" className="absolute right-3 top-1/2 -translate-y-1/2" />
                )}
              </div>

              {/* Permission Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowPermissionDropdown(!showPermissionDropdown)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <span>{PERMISSION_LABELS[selectedPermission]}</span>
                  <ChevronDown className="w-4 h-4" />
                </button>

                {showPermissionDropdown && (
                  <div className="absolute right-0 mt-1 w-48 py-1 bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-lg z-10">
                    {(['VIEW', 'DOWNLOAD', 'EDIT'] as Permission[]).map(perm => (
                      <button
                        key={perm}
                        onClick={() => {
                          setSelectedPermission(perm);
                          setShowPermissionDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                      >
                        <span className={`w-4 h-4 flex items-center justify-center ${selectedPermission === perm ? 'text-productivity-600' : 'text-transparent'}`}>
                          <Check className="w-4 h-4" />
                        </span>
                        <div>
                          <div className="text-slate-900 dark:text-white font-medium">{PERMISSION_LABELS[perm]}</div>
                          <div className="text-xs text-slate-500">{PERMISSION_DESCRIPTIONS[perm]}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700 max-h-40 overflow-y-auto">
                {searchResults.map(user => (
                  <button
                    key={user.id}
                    onClick={() => handleShareWithUser(user)}
                    disabled={addingUser === user.id}
                    className="w-full p-3 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-productivity-100 dark:bg-productivity-900/30 flex items-center justify-center text-productivity-600 dark:text-productivity-400 font-medium text-sm">
                        {user.firstName[0]}{user.lastName?.[0] || ''}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-medium text-slate-900 dark:text-white">
                          {user.firstName} {user.lastName}
                        </div>
                        <div className="text-xs text-slate-500">{user.email}</div>
                      </div>
                    </div>
                    {addingUser === user.id ? (
                      <ProductivitySpinner size="sm" />
                    ) : (
                      <span className="text-xs text-productivity-600 dark:text-productivity-400">Add</span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
              <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-sm text-slate-500">
                <AlertCircle className="w-4 h-4" />
                <span>No users found matching "{searchQuery}"</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-slate-200 dark:border-slate-700" />

          {/* People with Access */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">
              People with access ({sharedUsers.length})
            </h3>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <ProductivityLoader fullScreen={false} />
              </div>
            ) : sharedUsers.length === 0 ? (
              <div className="text-center py-6 text-slate-500 dark:text-slate-400">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">This folder is not shared with anyone yet</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {sharedUsers.map(share => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-productivity-100 dark:bg-productivity-900/30 flex items-center justify-center text-productivity-600 dark:text-productivity-400 font-medium text-sm">
                        {share.user.firstName[0]}{share.user.lastName?.[0] || ''}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white">
                          {share.user.firstName} {share.user.lastName}
                        </div>
                        <div className="text-xs text-slate-500">{share.user.email}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <select
                        value={share.permission}
                        onChange={(e) => handleUpdatePermission(share.id, e.target.value as Permission)}
                        className="text-xs px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200"
                      >
                        <option value="VIEW">Can view</option>
                        <option value="DOWNLOAD">Can download</option>
                        <option value="EDIT">Can edit</option>
                      </select>
                      
                      <button
                        onClick={() => handleRemoveShare(share.id)}
                        disabled={removingShareId === share.id}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                        title="Remove access"
                      >
                        {removingShareId === share.id ? (
                          <ProductivitySpinner size="sm" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-dark-border">
          <button
            onClick={copyShareLink}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-productivity-600 dark:hover:text-productivity-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Link2 className="w-4 h-4" />
            <span>Copy link</span>
          </button>
          
          <button
            onClick={onClose}
            className="px-4 py-2 bg-productivity-600 hover:bg-productivity-500 text-white font-medium rounded-xl shadow-lg shadow-productivity-500/25 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
