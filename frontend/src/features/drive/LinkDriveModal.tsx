import React from 'react';
import { X } from 'lucide-react';

interface LinkDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  onSubmit: () => void;
}

const CATEGORIES = ['Personal', 'Work', 'Family'] as const;

const LinkDriveModal: React.FC<LinkDriveModalProps> = ({
  isOpen,
  onClose,
  selectedCategory,
  onCategoryChange,
  onSubmit,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-dark-surface rounded-xl p-6 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
            Connect Google Drive
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-dark-bg rounded"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <p className="text-slate-600 dark:text-slate-400 mb-4">
          Choose a category for this Drive account:
        </p>
        <div className="flex gap-2 mb-6">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                selectedCategory === cat
                  ? 'bg-productivity-500 border-productivity-500 text-white'
                  : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-productivity-400'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <button
          onClick={onSubmit}
          className="w-full py-3 bg-productivity-500 hover:bg-productivity-600 text-white rounded-lg font-medium transition-colors"
        >
          Continue with Google
        </button>
      </div>
    </div>
  );
};

export default LinkDriveModal;
