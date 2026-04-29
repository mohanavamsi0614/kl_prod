"use client";

import { cn } from "../../lib/utils";
import { Link } from "react-router-dom";
import React, { useState, createContext, useContext, useCallback, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
  isActive?: boolean;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = memo((props: React.ComponentProps<typeof motion.div>) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<"div">)} />
    </>
  );
});

SidebarBody.displayName = 'SidebarBody';

export const DesktopSidebar = memo(({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  
  const handleMouseEnter = useCallback(() => setOpen(true), [setOpen]);
  const handleMouseLeave = useCallback(() => setOpen(false), [setOpen]);
  
  return (
    <motion.div
      className={cn(
        "h-full px-4 py-4 hidden md:flex md:flex-col bg-white dark:bg-dark-surface border-r border-slate-200 dark:border-dark-border w-[280px] flex-shrink-0",
        className
      )}
      animate={{
        width: animate ? (open ? "280px" : "70px") : "280px",
      }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {children}
    </motion.div>
  );
});

DesktopSidebar.displayName = 'DesktopSidebar';

export const MobileSidebar = memo(({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  const { open, setOpen } = useSidebar();
  
  const toggleOpen = useCallback(() => setOpen(!open), [open, setOpen]);
  
  return (
    <>
      <div
        className={cn(
          "h-14 px-4 py-4 flex flex-row md:hidden items-center justify-between bg-white dark:bg-dark-surface border-b border-slate-200 dark:border-dark-border w-full"
        )}
        {...props}
      >
        <div className="flex justify-end z-20 w-full">
          <Menu
            className="text-slate-700 dark:text-slate-200 cursor-pointer h-6 w-6"
            onClick={toggleOpen}
          />
        </div>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: "easeInOut",
              }}
              className={cn(
                "fixed h-full w-full inset-0 bg-white dark:bg-dark-surface p-10 z-[100] flex flex-col justify-between",
                className
              )}
            >
              <div
                className="absolute right-10 top-10 z-50 text-slate-700 dark:text-slate-200 cursor-pointer"
                onClick={toggleOpen}
              >
                <X className="h-6 w-6" />
              </div>
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
});

MobileSidebar.displayName = 'MobileSidebar';

interface SidebarLinkProps {
  link: Links;
  className?: string;
  onClick?: () => void;
}

export const SidebarLink = memo(({
  link,
  className,
  onClick,
}: SidebarLinkProps) => {
  const { open, animate } = useSidebar();
  
  const content = (
    <>
      {link.icon}
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        transition={{ duration: 0.15 }}
        className={cn(
          "text-sm font-medium group-hover/sidebar:translate-x-1 transition duration-150 whitespace-pre inline-block !p-0 !m-0",
          link.isActive 
            ? "text-productivity-700 dark:text-productivity-400" 
            : "text-slate-600 dark:text-slate-300"
        )}
      >
        {link.label}
      </motion.span>
      {link.isActive && open && (
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="ml-auto w-1.5 h-1.5 rounded-full bg-productivity-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]" 
        />
      )}
    </>
  );

  const baseClassName = cn(
    "flex items-center justify-start gap-3 group/sidebar py-2.5 px-2 rounded-xl transition-all duration-200",
    link.isActive 
      ? "bg-productivity-50 dark:bg-productivity-600/10 text-productivity-600 dark:text-productivity-500" 
      : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100",
    className
  );

  // If it's a button (like logout/theme toggle)
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={baseClassName}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      to={link.href}
      className={baseClassName}
    >
      {content}
    </Link>
  );
});

SidebarLink.displayName = 'SidebarLink';

export default Sidebar;
