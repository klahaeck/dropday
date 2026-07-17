export const DESCRIPTION_PREVIEW_MAX_LENGTH = 240;

export function truncateDescription(text: string, maxLength = DESCRIPTION_PREVIEW_MAX_LENGTH): string {
  const characters = Array.from(text.trim());
  if (characters.length <= maxLength) return characters.join("");
  if (maxLength <= 1) return "…".slice(0, maxLength);

  const preview = characters.slice(0, maxLength - 1).join("").trimEnd();
  const finalWhitespace = Math.max(preview.lastIndexOf(" "), preview.lastIndexOf("\n"));
  const minimumWordBoundary = Math.floor((maxLength - 1) * 0.7);
  const clipped = finalWhitespace >= minimumWordBoundary ? preview.slice(0, finalWhitespace).trimEnd() : preview;

  return `${clipped}…`;
}
