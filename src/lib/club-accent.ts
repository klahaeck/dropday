export const DEFAULT_CLUB_ACCENT = "#ff5c35";
export const CLUB_ACCENT_PATTERN = /^#[0-9a-f]{6}$/i;

export function normalizeClubAccent(value?: string): string {
  return value && CLUB_ACCENT_PATTERN.test(value) ? value.toLowerCase() : DEFAULT_CLUB_ACCENT;
}

function getRelativeLuminance(value: string): number {
  const channels = [value.slice(1, 3), value.slice(3, 5), value.slice(5, 7)]
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

export function getClubAccentForeground(value?: string): "#000000" | "#ffffff" {
  const luminance = getRelativeLuminance(normalizeClubAccent(value));
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);

  return blackContrast >= whiteContrast ? "#000000" : "#ffffff";
}
