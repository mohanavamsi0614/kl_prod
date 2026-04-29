import React from 'react';

interface ProductivitySpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * ProductivitySpinner - A compact inline spinner for buttons and small loading states
 * Uses the Productivity brand colors and a simple spinning animation
 */
const ProductivitySpinner: React.FC<ProductivitySpinnerProps> = ({ size = 'sm', className = '' }) => {
  const sizeClasses = {
    xs: 'w-3 h-3 border-[1.5px]',
    sm: 'w-4 h-4 border-2',
    md: 'w-5 h-5 border-2',
    lg: 'w-6 h-6 border-[2.5px]'
  };

  return (
    <div
      className={`
        ${sizeClasses[size]}
        rounded-full
        border-productivity-200 dark:border-productivity-800
        border-t-productivity-500 dark:border-t-productivity-400
        animate-spin
        ${className}
      `}
      role="status"
      aria-label="Loading"
    />
  );
};

export default ProductivitySpinner;
