import { describe, expect, it } from "vitest";
import { DEFAULT_CLUB_ACCENT, getClubAccentForeground, normalizeClubAccent } from "@/lib/club-accent";

function getRelativeLuminance(value: string): number {
  const channels = [value.slice(1, 3), value.slice(3, 5), value.slice(5, 7)]
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function getContrastRatio(first: string, second: string): number {
  const luminances = [getRelativeLuminance(first), getRelativeLuminance(second)].sort((a, b) => b - a);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

function mixColors(foreground: string, background: string, foregroundWeight: number): string {
  return `#${[1, 3, 5].map((index) => {
    const foregroundChannel = Number.parseInt(foreground.slice(index, index + 2), 16);
    const backgroundChannel = Number.parseInt(background.slice(index, index + 2), 16);
    return Math.round((foregroundChannel * foregroundWeight) + (backgroundChannel * (1 - foregroundWeight))).toString(16).padStart(2, "0");
  }).join("")}`;
}

const sampledColors = Array.from({ length: 16 ** 3 }, (_, index) => {
  const channels = [Math.floor(index / 256), Math.floor(index / 16) % 16, index % 16].map((channel) => channel * 17);
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
});

describe("club accent", () => {
  it("falls back to the site orange for missing or invalid colors", () => {
    expect(normalizeClubAccent()).toBe(DEFAULT_CLUB_ACCENT);
    expect(normalizeClubAccent("orange")).toBe(DEFAULT_CLUB_ACCENT);
  });

  it("normalizes valid hex colors", () => {
    expect(normalizeClubAccent("#7C5CFF")).toBe("#7c5cff");
  });

  it("chooses readable foreground colors", () => {
    expect(getClubAccentForeground("#f4c750")).toBe("#000000");
    expect(getClubAccentForeground("#241144")).toBe("#ffffff");
    const minimumContrast = Math.min(...sampledColors.map((accent) => getContrastRatio(accent, getClubAccentForeground(accent))));
    expect(minimumContrast).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps every softened color variant readable in light and dark modes", () => {
    const modes = [
      { paper: "#f4f0e6", ink: "#171713" },
      { paper: "#181815", ink: "#f4f0e6" },
    ];
    const variantWeights = [0.12, 0.24, 0.28];
    const minimumContrast = Math.min(...modes.flatMap(({ paper, ink }) => variantWeights.flatMap((weight) =>
      sampledColors.map((accent) => getContrastRatio(mixColors(accent, paper, weight), ink)),
    )));

    expect(minimumContrast).toBeGreaterThanOrEqual(4.5);
  });
});
