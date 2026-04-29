import { cn } from "../../lib/utils";
import * as React from "react";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white shadow-sm transition-shadow placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:border-productivity-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-productivity-500/20 disabled:cursor-not-allowed disabled:opacity-50",
          type === "search" &&
            "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
          type === "file" &&
            "p-0 pr-3 italic text-slate-400 dark:text-slate-500 file:me-3 file:h-full file:border-0 file:border-r file:border-solid file:border-slate-200 dark:file:border-slate-700 file:bg-transparent file:px-3 file:text-sm file:font-medium file:not-italic file:text-slate-700 dark:file:text-slate-200",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
