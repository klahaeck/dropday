import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isActiveAppPath } from "@/lib/navigation";

describe("app navigation matching", () => {
  it("matches the dashboard only at the exact app root", () => {
    expect(isActiveAppPath("/app", "/app")).toBe(true);
    expect(isActiveAppPath("/app/clubs", "/app")).toBe(false);
  });

  it("matches exact destinations and segment descendants", () => {
    expect(isActiveAppPath("/app/clubs", "/app/clubs")).toBe(true);
    expect(isActiveAppPath("/app/clubs/record-room/settings", "/app/clubs")).toBe(true);
  });

  it("does not match lookalike prefixes and ignores query strings", () => {
    expect(isActiveAppPath("/app/clubhouse", "/app/clubs")).toBe(false);
    expect(isActiveAppPath("/app/library?view=table", "/app/library")).toBe(true);
    expect(isActiveAppPath("/app/library/new#details", "/app/library")).toBe(true);
  });

  it("wires current-page and descendant pending state through the shared link", () => {
    const source = readFileSync("src/components/app-navigation-link.tsx", "utf8");

    expect(source).toContain("usePathname()");
    expect(source).toContain("useLinkStatus()");
    expect(source).toContain('aria-current={active ? "page" : undefined}');
    expect(source).toContain("<AppNavigationPendingStatus />");
    expect(source).toContain('data-pending={pending ? "true" : "false"}');
  });
});
