import React from 'react';

interface ProductivityLoaderProps {
  fullScreen?: boolean;
  text?: string;
  className?: string;
}

const ProductivityLoader: React.FC<ProductivityLoaderProps> = ({ fullScreen = true, text = "Initializing Productivity...", className = "" }) => {
  
  const LoaderContent = () => (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className="relative w-24 h-24 flex items-center justify-center">
        
        {/* Layer 1: Outer Rotating Productivityt (Futuristic Ring) */}
        <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-productivity-500/50 border-r-productivity-400/30 dark:border-t-productivity-400/80 dark:border-r-productivity-300/50 animate-spin duration-[3s] ease-linear" style={{ animationDuration: '3s' }}></div>
        
        {/* Layer 2: Counter-Rotating Inner Productivityt */}
        <div className="absolute inset-3 rounded-full border-[2px] border-transparent border-b-violet-500/40 border-l-violet-400/30 dark:border-b-violet-400/60 dark:border-l-violet-300/40 animate-spin duration-[4s] ease-linear direction-reverse" style={{ animationDirection: 'reverse', animationDuration: '5s' }}></div>

        {/* Layer 3: The Pulse/Ping Effect (Radar) */}
        <div className="absolute inset-4 bg-productivity-500/20 dark:bg-productivity-400/30 rounded-full animate-ping"></div>

        {/* Layer 4: Core Logo (Breathing) */}
        <div className="relative z-10 w-12 h-12 animate-pulse-slow">
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(6,182,212,0.6)]" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="loaderGradOuter" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#06b6d4" />
                        <stop offset="100%" stopColor="#0891b2" />
                    </linearGradient>
                    <linearGradient id="loaderGradInner" x1="30" y1="30" x2="70" y2="70" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#a5f3fc" />
                        <stop offset="100%" stopColor="#22d3ee" />
                    </linearGradient>
                </defs>
                <circle cx="50" cy="50" r="48" fill="url(#loaderGradOuter)" />
                <circle cx="50" cy="50" r="24" fill="url(#loaderGradInner)" />
                <circle cx="50" cy="50" r="48" stroke="white" strokeOpacity="0.2" strokeWidth="2" />
            </svg>
        </div>

        {/* Layer 5: Static Glow Backdrop */}
        <div className="absolute inset-0 bg-productivity-400/10 dark:bg-productivity-400/20 blur-xl rounded-full -z-10"></div>
      </div>

      {/* Text Animation */}
      {text && (
        <div className="mt-8 flex flex-col items-center gap-2">
            <span className="text-lg font-medium bg-clip-text text-transparent bg-gradient-to-r from-slate-700 to-slate-500 dark:from-white dark:to-slate-400 animate-pulse">
                {text}
            </span>
            <div className="flex gap-1 h-1">
                <div className="w-1 h-1 bg-productivity-500 rounded-full animate-bounce delay-0"></div>
                <div className="w-1 h-1 bg-productivity-500 rounded-full animate-bounce delay-150"></div>
                <div className="w-1 h-1 bg-productivity-500 rounded-full animate-bounce delay-300"></div>
            </div>
        </div>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-50/90 dark:bg-[#0f172a]/95 backdrop-blur-sm transition-colors duration-500">
        <LoaderContent />
      </div>
    );
  }

  return <LoaderContent />;
};

export default ProductivityLoader;
