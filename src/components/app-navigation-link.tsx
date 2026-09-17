"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { isActiveAppPath } from "@/lib/navigation";

function AppNavigationPendingStatus() {
  const { pending } = useLinkStatus();

  return <>
    <span
      className="app-navigation-pending"
      data-pending={pending ? "true" : "false"}
      aria-hidden="true"
    />
    <span className="sr-only" aria-live="polite">{pending ? "Opening…" : ""}</span>
  </>;
}

export function AppNavigationLink({
  href,
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = isActiveAppPath(pathname, href);
  const classes = [className, active ? "app-navigation-link-active" : undefined].filter(Boolean).join(" ");

  return <Link
    href={href}
    {...props}
    className={classes || undefined}
    aria-current={active ? "page" : undefined}
  >
    {children}
    <AppNavigationPendingStatus />
  </Link>;
}
