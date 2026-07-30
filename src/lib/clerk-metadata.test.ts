import { describe, expect, it } from "vitest";
import { hasSuperAdminAccess } from "@/lib/clerk-metadata";

describe("Clerk private metadata access", () => {
  it("grants access only for the exact superAdmin boolean", () => {
    expect(hasSuperAdminAccess({ superAdmin: true })).toBe(true);
    expect(hasSuperAdminAccess({ superAdmin: false })).toBe(false);
    expect(hasSuperAdminAccess({ superAdmin: "true" })).toBe(false);
    expect(hasSuperAdminAccess({ superadmin: true })).toBe(false);
    expect(hasSuperAdminAccess(null)).toBe(false);
    expect(hasSuperAdminAccess([])).toBe(false);
  });
});
