import { describe, expect, it, vi } from "vitest";
import { clubJoinUrl, copyTextToClipboard } from "@/lib/clipboard";

describe("clubJoinUrl", () => {
  it("builds an absolute URL to the club preview", () => {
    expect(clubJoinUrl("https://dropday.example", "needle-exchange"))
      .toBe("https://dropday.example/app/clubs/needle-exchange");
  });

  it("safely encodes the slug", () => {
    expect(clubJoinUrl("https://dropday.example/admin", "invite only"))
      .toBe("https://dropday.example/app/clubs/invite%20only");
  });
});

describe("copyTextToClipboard", () => {
  it("copies the exact join URL with the Clipboard API", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fallbackCopy = vi.fn();

    await copyTextToClipboard("https://dropday.example/app/clubs/needle-exchange", { writeText }, fallbackCopy);

    expect(writeText).toHaveBeenCalledWith("https://dropday.example/app/clubs/needle-exchange");
    expect(fallbackCopy).not.toHaveBeenCalled();
  });

  it("falls back when the Clipboard API is denied", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Not allowed"));
    const fallbackCopy = vi.fn().mockReturnValue(true);

    await copyTextToClipboard("https://dropday.example/app/clubs/needle-exchange", { writeText }, fallbackCopy);

    expect(fallbackCopy).toHaveBeenCalledWith("https://dropday.example/app/clubs/needle-exchange");
  });

  it("reports failure when neither copy method works", async () => {
    await expect(copyTextToClipboard("invite-url", undefined, () => false))
      .rejects.toThrow("The join link could not be copied.");
  });
});
