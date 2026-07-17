import type { ReactNode } from "react";

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "orange" | "green" | "violet" | "dark" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}
