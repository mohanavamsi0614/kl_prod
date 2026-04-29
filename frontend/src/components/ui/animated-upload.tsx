"use client";
import { useState, useEffect } from "react";
import { ChevronUp } from "lucide-react";
import { motion, useReducedMotion, type Easing } from "framer-motion";
import { cn } from "../../lib/utils";

interface UploadProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  isAnimating?: boolean;
  progress?: number; // 0-100 for real progress, undefined for indeterminate
  fileName?: string;
  totalFiles?: number; // Total number of files being uploaded
  onAnimationComplete?: () => void;
}

const alphabets = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const getRandomInt = (max: number) => Math.floor(Math.random() * max);

export function AnimatedUpload({
  className,
  isAnimating = false,
  progress,
  fileName,
  totalFiles = 1,
  onAnimationComplete,
}: UploadProps) {
  const [animatedProgress, setAnimatedProgress] = useState(0);
  const [filesCount, setFilesCount] = useState(0);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(60);
  const shouldReduceMotion = useReducedMotion();

  // HyperText animation state
  const [displayText, setDisplayText] = useState("READY".split(""));
  const [isTextAnimating, setIsTextAnimating] = useState(false);
  const [targetText, setTargetText] = useState("READY");
  const [textIterations, setTextIterations] = useState(0);

  // Animation configuration - using proper Framer Motion easing
  const easing: Easing = shouldReduceMotion ? "linear" : "easeOut";
  const duration = shouldReduceMotion ? 0.3 : 2.5;

  // HyperText animation logic
  useEffect(() => {
    const newTargetText = isAnimating ? "UPLOADING" : "READY";
    if (newTargetText !== targetText) {
      setTargetText(newTargetText);
      setTextIterations(0);
      setIsTextAnimating(true);
    }
  }, [isAnimating, targetText]);

  useEffect(() => {
    if (!isTextAnimating) return;

    const interval = setInterval(() => {
      if (textIterations < targetText.length) {
        setDisplayText(() =>
          targetText.split("").map((l, i) =>
            l === " "
              ? l
              : i <= textIterations
                ? targetText[i]
                : alphabets[getRandomInt(26)],
          ),
        );
        setTextIterations((currentIterations) => currentIterations + 0.1);
      } else {
        setIsTextAnimating(false);
        setDisplayText(targetText.split(""));
        clearInterval(interval);
      }
    }, 800 / (targetText.length * 10));

    return () => clearInterval(interval);
  }, [isTextAnimating, targetText, textIterations]);

  // Fix React setState error by using useEffect to call onAnimationComplete
  useEffect(() => {
    if (animatedProgress >= 100 && isAnimating) {
      const timer = setTimeout(() => {
        onAnimationComplete?.();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [animatedProgress, isAnimating, onAnimationComplete]);

  useEffect(() => {
    if (!isAnimating) {
      setAnimatedProgress(0);
      setFilesCount(0);
      setTimeRemainingSeconds(60);
      return;
    }

    // Use real progress if provided, otherwise simulate
    if (typeof progress === 'number') {
      setAnimatedProgress(progress);
      setFilesCount(totalFiles);
      setTimeRemainingSeconds(Math.max(0, Math.floor((100 - progress) / 2)));
      return;
    }

    // Animate progress from 0 to 100 (simulated)
    const progressInterval = setInterval(() => {
      setAnimatedProgress((prev) => {
        const next = prev + 1;
        setFilesCount(totalFiles);
        setTimeRemainingSeconds(
          Math.max(0, 60 - Math.floor((next / 100) * 60))
        );

        if (next >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return next;
      });
    }, duration * 10);

    return () => {
      clearInterval(progressInterval);
    };
  }, [isAnimating, duration, progress, totalFiles]);

  // Format time from seconds to "Xmin XXsec"
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}min ${remainingSeconds.toString().padStart(2, "0")}sec`;
    }
    return `${remainingSeconds}sec`;
  };

  // Motion variants - Productivity themed
  const containerVariants = {
    hidden: {
      opacity: 0,
      y: shouldReduceMotion ? 0 : 20,
      transition: { duration: 0.2, ease: easing },
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3, ease: easing },
    },
  };

  // Updated chevron animation - upward motion for upload
  const chevronVariants = {
    idle: { y: 0, opacity: 0.7 },
    animating: {
      y: shouldReduceMotion ? 0 : [0, -8, 0],
      opacity: shouldReduceMotion ? 0.7 : [0.7, .9, .7],
      transition: {
        duration: 1.5,
        ease: "easeInOut" as const,
        repeat: isAnimating ? Infinity : 0,
        repeatType: "loop" as const,
      },
    },
  };

  const chevron2Variants = {
    idle: { y: -14, opacity: 0.5 },
    animating: {
      y: shouldReduceMotion ? -8 : [-14, -18, -14],
      opacity: shouldReduceMotion ? 0.5 : [0.5, 1, 0.5],
      transition: {
        duration: 1.5,
        ease: "easeInOut" as const,
        repeat: isAnimating ? Infinity : 0,
        repeatType: "loop" as const,
        delay: 0.3,
      },
    },
  };

  // Sequential dots animation
  const dotsVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1,
      },
    },
  };

  const dotVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: [0, 1, 1, 0],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        repeatType: "loop" as const,
        ease: "easeInOut" as const,
      },
    },
  };

  return (
    <motion.div
      className={cn("w-full max-w-lg", className)}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Top header row */}
      <div className="flex items-center mb-2">
        {/* Animated ChevronUp icons - moving upward for upload */}
        <div
          className={cn(
            "flex -mt-3 flex-col items-center justify-center w-8 h-16 overflow-hidden relative"
          )}
        >
          <motion.div
            className="absolute bottom-2"
            variants={chevronVariants}
            animate={isAnimating ? "animating" : "idle"}
          >
            <ChevronUp size={24} className="text-productivity-500 dark:text-productivity-400" />
          </motion.div>
          <motion.div
            className="absolute bottom-2"
            variants={chevron2Variants}
            animate={isAnimating ? "animating" : "idle"}
          >
            <ChevronUp size={24} className="text-productivity-500 dark:text-productivity-400" />
          </motion.div>
        </div>

        {/* UPLOADING/READY banner - Productivity themed */}
        <div className="relative ml-2 flex-1 max-w-xs">
          <svg
            width="50%"
            height="32"
            viewBox="0 0 107 15"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="absolute top-1/2 left-0 transform -translate-y-1/2 w-1/2"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="productivityGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
            <path
              d="M0.445312 0.5H106.103V8.017L99.2813 14.838H0.445312V0.5Z"
              fill="url(#productivityGradient)"
            />
          </svg>
          <div className="relative px-4 py-1.5 font-mono font-bold text-sm">
            <div className="flex items-center">
              <div className="flex font-mono font-bold">
                {displayText.map((letter, i) => (
                  <motion.span
                    key={`${targetText}-${i}`}
                    className={cn("font-mono text-white font-bold", letter === " " ? "w-3" : "")}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 3 }}
                  >
                    {letter}
                  </motion.span>
                ))}
              </div>
              {isAnimating && (
                <motion.div
                  className="ml-1 flex text-white"
                  variants={dotsVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <motion.span variants={dotVariants}>.</motion.span>
                  <motion.span variants={dotVariants}>.</motion.span>
                  <motion.span variants={dotVariants}>.</motion.span>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* File name display */}
      {fileName && (
        <div className="mb-2 px-2">
          <span className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate block">
            {fileName}
          </span>
        </div>
      )}

      {/* Thick separator bar - Productivity themed */}
      <div className="w-full h-1 bg-gradient-to-r from-productivity-500 to-productivity-600 mb-3 rounded-full" />

      {/* Labels row */}
      <div className="flex items-center mb-1">
        <div className="w-32">
          <div className="text-xs font-mono text-slate-600 dark:text-slate-400">PROGRESS</div>
        </div>

        <div className="flex ml-6">
          <div className="w-28 text-left">
            <div className="text-xs font-mono text-slate-600 dark:text-slate-400">EST. TIME</div>
          </div>
          <div className="w-28 text-left">
            <div className="text-xs font-mono text-slate-600 dark:text-slate-400">FILES:</div>
          </div>
        </div>
      </div>

      {/* Values row - progress bar and info values */}
      <div className="flex items-center">
        {/* Animated Progress bar - Productivity themed */}
        <div className="w-32">
          <div className="w-full h-2.5 border border-productivity-300 dark:border-productivity-600 bg-transparent rounded-full flex items-center px-0.5">
            <motion.div
              className="h-1 bg-gradient-to-r from-productivity-500 to-productivity-600 rounded-full"
              initial={{ width: "0%" }}
              animate={{
                width: `${animatedProgress}%`,
              }}
              transition={{
                duration: shouldReduceMotion ? 0.1 : 0.3,
                ease: easing,
              }}
            />
          </div>
        </div>

        {/* Animated info values */}
        <div className="flex ml-6">
          <div className="w-28 text-left">
            <div className="text-sm font-mono text-slate-700 dark:text-slate-300">
              {formatTime(timeRemainingSeconds)}
            </div>
          </div>
          <div className="w-28 text-left">
            <div className="text-sm font-mono text-slate-700 dark:text-slate-300">
              {filesCount}
            </div>
          </div>
        </div>
      </div>

      {/* Progress percentage */}
      <div className="mt-2 px-2">
        <span className="text-lg font-bold font-mono text-productivity-600 dark:text-productivity-400">
          {Math.round(animatedProgress)}%
        </span>
      </div>

      {/* Static bottom bar - Productivity themed */}
      <div className="w-3/4 h-0.5 bg-productivity-300 dark:bg-productivity-700 mt-4 rounded-full" />
    </motion.div>
  );
}

export default AnimatedUpload;
