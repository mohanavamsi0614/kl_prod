import React, { useState, useCallback, useRef, useMemo, memo } from 'react';
import { UploadCloud, Link2, X, ImagePlus, AlertCircle, FileText, Image, File, Files } from 'lucide-react';
import { cn } from '../lib/utils';
import { validateFileName, validateUploadUrl } from '../lib/validation';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { AnimatedUpload } from './ui/animated-upload';
import ProductivitySpinner from './ui/ProductivitySpinner';

// Maximum file size: 50MB (must match backend limit)
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILE_SIZE_MB = 50;

interface UnifiedUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadFile: (file: File, onProgress?: (progress: number) => void) => Promise<void>;
  onUploadFromUrl: (url: string, fileName: string) => Promise<void>;
  currentFolder: string | null;
  isUploading: boolean;
}

type UploadMode = 'file' | 'url';

const getFileIcon = (mimeType: string, size: 'sm' | 'lg' = 'lg') => {
  const sizeClass = size === 'sm' ? 'w-5 h-5' : 'w-8 h-8';
  if (mimeType.startsWith('image/')) {
    return <Image className={`${sizeClass} text-purple-500`} />;
  }
  if (mimeType.includes('pdf')) {
    return <FileText className={`${sizeClass} text-red-500`} />;
  }
  return <File className={`${sizeClass} text-slate-500`} />;
};

const UnifiedUploadModal: React.FC<UnifiedUploadModalProps> = memo(({
  isOpen,
  onClose,
  onUploadFile,
  onUploadFromUrl,
  currentFolder,
  isUploading
}) => {
  const [mode, setMode] = useState<UploadMode>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [cloudUrl, setCloudUrl] = useState('');
  const [cloudFileName, setCloudFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [currentFileProgress, setCurrentFileProgress] = useState(0);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setSelectedFiles([]);
    setCloudUrl('');
    setCloudFileName('');
    setError(null);
    setCurrentFileIndex(0);
    setCurrentFileProgress(0);
    setIsUploadingFiles(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [resetState, onClose]);

  const handleModeChange = useCallback((newMode: UploadMode) => {
    setMode(newMode);
    setError(null);
  }, []);

  const handleFilesSelect = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    const oversizedFiles: string[] = [];
    const invalidFiles: string[] = [];
    
    for (const file of fileArray) {
      // Check file size first
      if (file.size > MAX_FILE_SIZE) {
        oversizedFiles.push(`${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)`);
        continue;
      }
      
      const validation = validateFileName(file.name);
      if (!validation.isValid) {
        invalidFiles.push(`${file.name}: ${validation.error}`);
        continue;
      }
      validFiles.push(file);
    }
    
    // Show error for oversized files - BLOCK all uploads if any file is too large
    if (oversizedFiles.length > 0) {
      setError(`File upload limit is ${MAX_FILE_SIZE_MB}MB per file. These files exceed the limit: ${oversizedFiles.join(', ')}`);
      return; // Don't add any files if some are oversized
    }
    
    // Show error for invalid filenames
    if (invalidFiles.length > 0) {
      setError(invalidFiles.join('; '));
      if (validFiles.length === 0) return;
    }
    
    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles]);
      if (oversizedFiles.length === 0 && invalidFiles.length === 0) {
        setError(null);
      }
    }
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleFilesSelect(files);
    }
  }, [handleFilesSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFilesSelect(files);
    }
  }, [handleFilesSelect]);

  const handleRemoveFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleUploadClick = useCallback(async () => {
    if (mode === 'file') {
      if (selectedFiles.length === 0) {
        setError('Please select at least one file to upload');
        return;
      }

      // Final validation before upload - check for oversized files
      const oversizedFiles = selectedFiles.filter(f => f.size > MAX_FILE_SIZE);
      if (oversizedFiles.length > 0) {
        const fileList = oversizedFiles.map(f => `${f.name} (${(f.size / (1024 * 1024)).toFixed(1)}MB)`).join(', ');
        setError(`Cannot upload: File size limit is ${MAX_FILE_SIZE_MB}MB per file. These files exceed the limit: ${fileList}`);
        return;
      }

      setIsUploadingFiles(true);
      setCurrentFileIndex(0);
      setCurrentFileProgress(0);

      // Upload all files sequentially with real progress
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const validation = validateFileName(file.name);
        if (!validation.isValid) {
          setError(`${file.name}: ${validation.error}`);
          setIsUploadingFiles(false);
          return;
        }
        setCurrentFileIndex(i);
        setCurrentFileProgress(0);
        
        await onUploadFile(file, (progress) => {
          setCurrentFileProgress(progress);
        });
      }
      handleClose();
    } else {
      // URL mode
      const urlValidation = validateUploadUrl(cloudUrl);
      if (!urlValidation.isValid) {
        setError(urlValidation.error || 'Invalid URL');
        return;
      }

      const nameValidation = validateFileName(cloudFileName);
      if (!nameValidation.isValid) {
        setError(nameValidation.error || 'Invalid filename');
        return;
      }

      await onUploadFromUrl(cloudUrl, cloudFileName);
      handleClose();
    }
  }, [mode, selectedFiles, cloudUrl, cloudFileName, onUploadFile, onUploadFromUrl, handleClose]);

  const isUploadDisabled = useMemo(() => {
    if (isUploading) return true;
    if (mode === 'file') return selectedFiles.length === 0;
    return !cloudUrl.trim() || !cloudFileName.trim();
  }, [isUploading, mode, selectedFiles, cloudUrl, cloudFileName]);

  const totalSize = useMemo(() => {
    const bytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, [selectedFiles]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-dark-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-dark-border animate-in fade-in zoom-in duration-200 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 pb-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Upload File</h2>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="p-4 pb-0">
          <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              onClick={() => handleModeChange('file')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200",
                mode === 'file'
                  ? "bg-white dark:bg-slate-700 text-productivity-600 dark:text-productivity-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              )}
            >
              <UploadCloud className="w-4 h-4" />
              Upload File
            </button>
            <button
              onClick={() => handleModeChange('url')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200",
                mode === 'url'
                  ? "bg-white dark:bg-slate-700 text-productivity-600 dark:text-productivity-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              )}
            >
              <Link2 className="w-4 h-4" />
              From URL
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {mode === 'file' ? (
            <>
              <Input
                type="file"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
                multiple
              />

              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-all p-6",
                  isDragging
                    ? "border-productivity-500 bg-productivity-50 dark:bg-productivity-900/20"
                    : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
                )}
              >
                <div className="rounded-full bg-white dark:bg-slate-700 p-3 shadow-sm">
                  <ImagePlus className="h-6 w-6 text-slate-400 dark:text-slate-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {selectedFiles.length > 0 ? 'Add more files' : 'Click to select files'}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    or drag and drop files here
                  </p>
                </div>
              </div>

              {/* Selected files list */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Files className="w-3.5 h-3.5" />
                      {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                    </span>
                    <span>{totalSize}</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                    {selectedFiles.map((file, index) => (
                      <div 
                        key={`${file.name}-${index}`}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50"
                      >
                        <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700">
                          {getFileIcon(file.type, 'sm')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); handleRemoveFile(index); }}
                          className="h-7 w-7 text-slate-400 hover:text-red-500"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  File URL
                </label>
                <Input
                  type="url"
                  value={cloudUrl}
                  onChange={(e) => { setCloudUrl(e.target.value); setError(null); }}
                  placeholder="https://example.com/file.pdf"
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Save as
                </label>
                <Input
                  type="text"
                  value={cloudFileName}
                  onChange={(e) => { setCloudFileName(e.target.value); setError(null); }}
                  placeholder="document"
                  className="w-full"
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Info */}
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {mode === 'file' ? (
                <>
                  <span className="font-medium">Uploading to:</span> {currentFolder || 'Home'}
                  <br />
                  <span className="text-slate-500 dark:text-slate-400">Files are private and only accessible by you or those you share with.</span>
                </>
              ) : (
                <>
                  Enter a direct file URL to import. The file will be stored privately in: {currentFolder || 'Home'}
                </>
              )}
            </p>
          </div>
          
          {/* Upload Animation */}
          {(isUploading || isUploadingFiles) && (
            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <AnimatedUpload
                isAnimating={isUploading || isUploadingFiles}
                progress={mode === 'file' && selectedFiles.length > 0 
                  ? Math.round(((currentFileIndex + currentFileProgress / 100) / selectedFiles.length) * 100)
                  : undefined
                }
                fileName={mode === 'file' && selectedFiles.length > 0 
                  ? selectedFiles[currentFileIndex]?.name
                  : cloudFileName
                }
                totalFiles={mode === 'file' ? selectedFiles.length : 1}
                className="mx-auto"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 pt-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isUploading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUploadClick}
            disabled={isUploadDisabled}
            className="flex-1"
          >
            {(isUploading || isUploadingFiles) ? (
              <>
                <ProductivitySpinner size="sm" className="mr-2" />
                {mode === 'file' 
                  ? `Uploading ${currentFileIndex + 1}/${selectedFiles.length}...` 
                  : 'Importing...'}
              </>
            ) : (
              mode === 'file' 
                ? (selectedFiles.length > 1 ? `Upload ${selectedFiles.length} Files` : 'Upload')
                : 'Import File'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
});

UnifiedUploadModal.displayName = 'UnifiedUploadModal';

export default UnifiedUploadModal;
