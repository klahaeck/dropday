"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_COOKIE_NAME } from "@/lib/sidebar";
import { cn } from "@/lib/utils";

type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean | ((open: boolean) => boolean)) => void;
  toggleSidebar: () => void;
  sidebarId: string;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);

  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [_open, setOpenState] = React.useState(defaultOpen);
  const sidebarId = React.useId();
  const open = openProp ?? _open;

  const setOpen = React.useCallback((value: boolean | ((current: boolean) => boolean)) => {
    const nextOpen = typeof value === "function" ? value(open) : value;

    if (onOpenChange) {
      onOpenChange(nextOpen);
    } else {
      setOpenState(nextOpen);
    }

    document.cookie = `${SIDEBAR_COOKIE_NAME}=${nextOpen}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
  }, [onOpenChange, open]);

  const toggleSidebar = React.useCallback(() => {
    setOpen((current) => !current);
  }, [setOpen]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === "b"
        && (event.metaKey || event.ctrlKey)
        && window.matchMedia("(min-width: 801px)").matches
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";
  const contextValue = React.useMemo<SidebarContextValue>(() => ({
    state,
    open,
    setOpen,
    toggleSidebar,
    sidebarId,
  }), [open, setOpen, sidebarId, state, toggleSidebar]);

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider>
        <div
          data-slot="sidebar-wrapper"
          data-state={state}
          className={cn("sidebar-wrapper", className)}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

function Sidebar({ className, ...props }: React.ComponentProps<"aside">) {
  const { sidebarId, state } = useSidebar();

  return (
    <aside
      id={sidebarId}
      data-slot="sidebar"
      data-state={state}
      data-collapsible="icon"
      className={cn("app-sidebar", className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" className={cn("sidebar-header", className)} {...props} />;
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-content" className={cn("sidebar-content", className)} {...props} />;
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" className={cn("sidebar-footer", className)} {...props} />;
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" className={cn("sidebar-menu", className)} {...props} />;
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={cn("sidebar-menu-item", className)} {...props} />;
}

function SidebarMenuButton({
  asChild = false,
  tooltip,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  asChild?: boolean;
  tooltip?: string;
}) {
  const { state } = useSidebar();
  const Comp = asChild ? Slot : "button";
  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      className={cn("sidebar-menu-button", className)}
      aria-label={state === "collapsed" ? tooltip ?? props["aria-label"] : props["aria-label"]}
      {...props}
    />
  );

  if (!tooltip || state !== "collapsed") return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" align="center">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function SidebarMenuBadge({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="sidebar-menu-badge" className={cn("sidebar-menu-badge", className)} {...props} />;
}

function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { open, sidebarId, toggleSidebar } = useSidebar();
  const label = open ? "Collapse sidebar" : "Expand sidebar";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-slot="sidebar-trigger"
          className={cn("sidebar-trigger", className)}
          aria-label={label}
          aria-controls={sidebarId}
          aria-expanded={open}
          onClick={(event) => {
            onClick?.(event);
            if (!event.defaultPrevented) toggleSidebar();
          }}
          {...props}
        >
          {open ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
};
