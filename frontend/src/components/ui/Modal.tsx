import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  children: React.ReactNode;
  onClose?: () => void;
}

const Modal: React.FC<ModalProps> = ({ children, onClose }) => {
  useEffect(() => {
    // Lock body scroll while modal open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/20 dark:bg-black/40 backdrop-blur-sm">
      {/* clicking on backdrop should close if onClose provided */}
      <div className="absolute inset-0" onClick={() => onClose && onClose()} />
      <div className="relative w-full max-h-[95vh] overflow-y-auto">{children}</div>
    </div>,
    document.body
  );
};

export default Modal;
