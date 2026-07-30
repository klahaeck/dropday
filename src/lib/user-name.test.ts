import { describe, expect, it, vi } from "vitest";
import {
  persistWithUniqueUserName,
  resolveUserName,
} from "@/lib/user-name";

describe("user names", () => {
  it("keeps complete provider names and normalizes whitespace", () => {
    expect(resolveUserName({
      userId: "user_complete",
      firstName: "  Ada ",
      lastName: " van   Groove ",
    })).toEqual({
      firstName: "Ada",
      lastName: "van Groove",
      displayName: "Ada van Groove",
      initials: "AV",
    });
  });

  it("creates a stable quirky first and last name when both are missing", () => {
    const first = resolveUserName({ userId: "user_sso_without_name" });
    const second = resolveUserName({ userId: "user_sso_without_name" });

    expect(first).toEqual(second);
    expect(first.firstName).toMatch(/^[A-Z][a-z]+$/);
    expect(first.lastName).toMatch(/^[A-Z][a-z]+$/);
    expect(first.displayName).toBe(`${first.firstName} ${first.lastName}`);
    expect(first.initials).toBe(`${first.firstName[0]}${first.lastName[0]}`);
    expect(first.generatedNameKey).toBe(`quirky:${first.displayName.toLowerCase()}`);
  });

  it("fills only the provider name part that is missing", () => {
    const missingLastName = resolveUserName({
      userId: "user_missing_last",
      firstName: "Mina",
    });
    const missingFirstName = resolveUserName({
      userId: "user_missing_first",
      lastName: "Jones",
    });

    expect(missingLastName.firstName).toBe("Mina");
    expect(missingLastName.lastName).toBeTruthy();
    expect(missingFirstName.firstName).toBeTruthy();
    expect(missingFirstName.lastName).toBe("Jones");
  });

  it("tries the next deterministic name after a generated-name collision", async () => {
    const firstCandidate = resolveUserName({ userId: "user_collision" });
    const nextCandidate = resolveUserName({ userId: "user_collision" }, 1);
    const persist = vi.fn()
      .mockRejectedValueOnce({
        code: 11000,
        keyPattern: { generatedNameKey: 1 },
      })
      .mockResolvedValueOnce("saved");

    const resolved = await persistWithUniqueUserName({
      identity: { userId: "user_collision" },
      persist,
    });

    expect(persist).toHaveBeenNthCalledWith(1, firstCandidate);
    expect(persist).toHaveBeenNthCalledWith(2, nextCandidate);
    expect(resolved).toEqual({ name: nextCandidate, result: "saved" });
  });

  it("reuses an already allocated generated name", async () => {
    const existing = resolveUserName({ userId: "user_existing" });
    const persist = vi.fn().mockResolvedValue("saved");

    const resolved = await persistWithUniqueUserName({
      identity: { userId: "user_existing" },
      existing,
      persist,
    });

    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(existing);
    expect(resolved.name).toEqual(existing);
  });
});
