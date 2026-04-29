import React, { useState, useEffect } from 'react';
import { X, Download, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCw, ExternalLink, FileText, Volume2, VolumeX } from 'lucide-react';
import ProductivitySpinner from '../../components/ui/ProductivitySpinner';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string | null;
  webViewLink: string | null;
}

interface FilePreviewModalProps {
  file: DriveFile;
  connectionId: string;
  onClose: () => void;
  onDownload: () => void;
}

// Helper functions to determine file type
const getFileCategory = (mimeType: string): string => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('text/') || isTextBasedMime(mimeType)) return 'text';
  if (isGoogleDocsType(mimeType)) return 'pdf'; // Google Docs export as PDF
  if (isOfficeDocument(mimeType)) return 'office';
  return 'unknown';
};

const isTextBasedMime = (mimeType: string): boolean => {
  const textMimes = [
    'application/json',
    'application/javascript',
    'application/typescript',
    'application/xml',
    'application/x-yaml',
    'application/x-sh',
    'application/x-python',
    'application/x-ruby',
    'application/x-perl',
    'application/x-php',
    'application/sql',
    'application/x-httpd-php',
  ];
  return textMimes.includes(mimeType) || mimeType.includes('text') || mimeType.includes('script');
};

const isGoogleDocsType = (mimeType: string): boolean => {
  return mimeType.startsWith('application/vnd.google-apps.');
};

const isOfficeDocument = (mimeType: string): boolean => {
  const officeMimes = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
  ];
  return officeMimes.includes(mimeType);
};

const getLanguageFromMime = (_mimeType: string, fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  const langMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'h': 'c',
    'cs': 'csharp',
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',
    'sql': 'sql',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'json': 'json',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'markdown': 'markdown',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
    'gitignore': 'text',
    'env': 'text',
    'txt': 'text',
    'log': 'text',
    'csv': 'text',
  };
  
  return langMap[ext] || 'text';
};

const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  file,
  connectionId,
  onClose,
  onDownload,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [actualMimeType, setActualMimeType] = useState(file.mimeType);

  const fileCategory = getFileCategory(actualMimeType);

  useEffect(() => {
    loadPreview();
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [file.id, connectionId]);

  const loadPreview = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/drive/files/${file.id}/preview?connectionId=${connectionId}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to load preview');
      }
      
      const contentType = response.headers.get('Content-Type') || file.mimeType;
      setActualMimeType(contentType);
      
      const category = getFileCategory(contentType);
      
      // For text files, read as text
      if (category === 'text') {
        const text = await response.text();
        setTextContent(text);
      } else {
        // For binary files, create blob URL
        const blob = await response.blob();
        const typedBlob = new Blob([blob], { type: contentType });
        const url = URL.createObjectURL(typedBlob);
        setBlobUrl(url);
      }
    } catch (err: any) {
      console.error('Preview error:', err);
      setError(err.message || 'Failed to load preview');
    } finally {
      setIsLoading(false);
    }
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.25));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  
  const handleOpenInDrive = () => {
    if (file.webViewLink) {
      window.open(file.webViewLink, '_blank');
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
    setZoom(1);
    setRotation(0);
  };

  const handleMediaPlay = () => setIsPlaying(true);
  const handleMediaPause = () => setIsPlaying(false);
  const toggleMute = () => setIsMuted(prev => !prev);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center gap-4">
          <ProductivitySpinner className="w-12 h-12 text-white" />
          <p className="text-slate-400">Loading preview...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center gap-4 text-center px-4">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
            <X className="w-8 h-8 text-red-400" />
          </div>
          <p className="text-white text-lg font-medium">Preview unavailable</p>
          <p className="text-slate-400 max-w-md">{error}</p>
          <div className="flex gap-3 mt-4">
            {file.webViewLink && (
              <button
                onClick={handleOpenInDrive}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Open in Drive
              </button>
            )}
            <button
              onClick={() => { onDownload(); onClose(); }}
              className="px-4 py-2 bg-productivity-500 hover:bg-productivity-600 text-white rounded-lg flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
        </div>
      );
    }

    switch (fileCategory) {
      case 'image':
        return blobUrl && (
          <div 
            className="flex items-center justify-center w-full h-full overflow-auto"
            style={{ cursor: zoom > 1 ? 'move' : 'default' }}
          >
            <img
              src={blobUrl}
              alt={file.name}
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
              }}
              draggable={false}
            />
          </div>
        );

      case 'video':
        return blobUrl && (
          <div className="flex items-center justify-center w-full h-full">
            <video
              src={blobUrl}
              controls
              autoPlay={false}
              muted={isMuted}
              onPlay={handleMediaPlay}
              onPause={handleMediaPause}
              className="max-w-full max-h-full rounded-lg"
              style={{ maxHeight: '80vh' }}
            >
              Your browser does not support video playback.
            </video>
          </div>
        );

      case 'audio':
        return blobUrl && (
          <div className="flex flex-col items-center justify-center gap-6 p-8">
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-productivity-400 to-productivity-600 flex items-center justify-center shadow-2xl">
              {isPlaying ? (
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-2 bg-white rounded-full animate-pulse"
                      style={{
                        height: `${20 + Math.random() * 30}px`,
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <Volume2 className="w-16 h-16 text-white" />
              )}
            </div>
            <p className="text-white font-medium text-lg">{file.name}</p>
            <audio
              src={blobUrl}
              controls
              autoPlay={false}
              muted={isMuted}
              onPlay={handleMediaPlay}
              onPause={handleMediaPause}
              className="w-full max-w-md"
            >
              Your browser does not support audio playback.
            </audio>
          </div>
        );

      case 'pdf':
        return blobUrl && (
          <div className="w-full h-full bg-white">
            <object
              data={`${blobUrl}#toolbar=1&navpanes=0`}
              type="application/pdf"
              className="w-full h-full"
              title={file.name}
            >
              <iframe
                src={`${blobUrl}#toolbar=1`}
                className="w-full h-full border-0"
                title={file.name}
              />
            </object>
          </div>
        );

      case 'text':
        return textContent !== null && (
          <div className="w-full h-full overflow-auto bg-slate-900 rounded-lg">
            <pre className="p-4 text-sm font-mono text-slate-300 whitespace-pre-wrap break-words">
              <code className={`language-${getLanguageFromMime(actualMimeType, file.name)}`}>
                {textContent}
              </code>
            </pre>
          </div>
        );

      case 'office':
        return (
          <div className="flex flex-col items-center gap-6 text-center px-4">
            <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center">
              <FileText className="w-10 h-10 text-blue-400" />
            </div>
            <div>
              <p className="text-white text-lg font-medium mb-2">Office Document</p>
              <p className="text-slate-400 max-w-md">
                Office documents can be viewed in Google Drive or downloaded to your device.
              </p>
            </div>
            <div className="flex gap-3 mt-2">
              {file.webViewLink && (
                <button
                  onClick={handleOpenInDrive}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in Drive
                </button>
              )}
              <button
                onClick={() => { onDownload(); onClose(); }}
                className="px-4 py-2 bg-productivity-500 hover:bg-productivity-600 text-white rounded-lg flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>
        );

      default:
        return (
          <div className="flex flex-col items-center gap-6 text-center px-4">
            <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center">
              <FileText className="w-10 h-10 text-slate-400" />
            </div>
            <div>
              <p className="text-white text-lg font-medium mb-2">Preview not available</p>
              <p className="text-slate-400 max-w-md">
                This file type ({actualMimeType}) cannot be previewed directly. You can open it in Google Drive or download it.
              </p>
            </div>
            <div className="flex gap-3 mt-2">
              {file.webViewLink && (
                <button
                  onClick={handleOpenInDrive}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in Drive
                </button>
              )}
              <button
                onClick={() => { onDownload(); onClose(); }}
                className="px-4 py-2 bg-productivity-500 hover:bg-productivity-600 text-white rounded-lg flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>
        );
    }
  };

  const getFooterMessage = () => {
    switch (fileCategory) {
      case 'image':
        return 'Use scroll or zoom buttons to zoom • Click and drag to pan';
      case 'pdf':
        return 'Use PDF viewer controls to navigate';
      case 'video':
        return 'Use video controls to play, pause, and seek';
      case 'audio':
        return 'Use audio controls to play and adjust volume';
      case 'text':
        return `${file.name} • ${getLanguageFromMime(actualMimeType, file.name).toUpperCase()}`;
      default:
        return '';
    }
  };

  return (
    <div 
      className={`fixed inset-0 z-50 bg-black/90 flex flex-col ${isFullscreen ? '' : 'p-4 md:p-8'}`}
      onClick={onClose}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-3 bg-slate-900/80 backdrop-blur-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-white font-medium truncate">{file.name}</h2>
          <span className="text-slate-400 text-sm hidden sm:inline">
            {actualMimeType.split('/').pop()?.toUpperCase()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls (for images) */}
          {fileCategory === 'image' && !isLoading && !error && (
            <>
              <button
                onClick={handleZoomOut}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <span className="text-slate-400 text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button
                onClick={handleZoomIn}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <button
                onClick={handleRotate}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                title="Rotate"
              >
                <RotateCw className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-slate-700 mx-1" />
            </>
          )}

          {/* Media controls */}
          {(fileCategory === 'video' || fileCategory === 'audio') && !isLoading && !error && (
            <>
              <button
                onClick={toggleMute}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <div className="w-px h-6 bg-slate-700 mx-1" />
            </>
          )}

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>

          {/* Open in Drive */}
          {file.webViewLink && (
            <button
              onClick={handleOpenInDrive}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              title="Open in Google Drive"
            >
              <ExternalLink className="w-5 h-5" />
            </button>
          )}

          {/* Download */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Download"
          >
            <Download className="w-5 h-5" />
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div 
        className="flex-1 flex items-center justify-center overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        {renderContent()}
      </div>

      {/* Footer info */}
      {!isLoading && !error && getFooterMessage() && (
        <div 
          className="flex items-center justify-center gap-4 py-3 px-4 bg-slate-900/80 backdrop-blur-sm text-slate-400 text-sm"
          onClick={e => e.stopPropagation()}
        >
          <span>{getFooterMessage()}</span>
        </div>
      )}
    </div>
  );
};

export default FilePreviewModal;
