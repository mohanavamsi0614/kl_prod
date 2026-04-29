import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ items, position, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState({ x: position.x, y: position.y });
  const [isPositioned, setIsPositioned] = useState(false);

  // Adjust position after menu renders to keep it within viewport
  useLayoutEffect(() => {
    if (!menuRef.current) return;
    
    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 8;
    
    let x = position.x;
    let y = position.y;
    
    // Adjust horizontal position - show to the left if would overflow right
    if (x + rect.width > viewportWidth - padding) {
      x = Math.max(padding, viewportWidth - rect.width - padding);
    }
    
    // Adjust vertical position - show above cursor if would overflow bottom
    if (y + rect.height > viewportHeight - padding) {
      // Try to show above the click position
      y = position.y - rect.height;
      // If still overflowing top, just clamp to visible area
      if (y < padding) {
        y = Math.max(padding, viewportHeight - rect.height - padding);
      }
    }
    
    setAdjustedPosition({ x: Math.max(padding, x), y: Math.max(padding, y) });
    setIsPositioned(true);
  }, [position]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className={`fixed z-[9999] min-w-[180px] py-1.5 bg-white dark:bg-dark-surface rounded-xl border border-slate-200 dark:border-dark-border shadow-xl transition-opacity duration-100 ${isPositioned ? 'opacity-100 animate-in fade-in zoom-in-95' : 'opacity-0'}`}
      style={{ left: adjustedPosition.x, top: adjustedPosition.y }}
    >
      {items.map((item, index) => {
        if (item.divider) {
          return (
            <div
              key={`divider-${index}`}
              className="my-1.5 h-px bg-slate-200 dark:bg-slate-700"
            />
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            disabled={item.disabled}
            className={`
              w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 transition-colors
              ${item.disabled 
                ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed' 
                : item.danger 
                  ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' 
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }
            `}
          >
            {item.icon && (
              <span className="w-4 h-4 flex items-center justify-center">
                {item.icon}
              </span>
            )}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>,
    document.body
  );
};

export default ContextMenu;
