export type ClipboardWriter = Pick<Clipboard, "writeText">;

function copyWithSelection(text: string): boolean {
  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

export async function copyTextToClipboard(
  text: string,
  clipboard: ClipboardWriter | undefined = typeof navigator === "undefined" ? undefined : navigator.clipboard,
  fallbackCopy: (value: string) => boolean = copyWithSelection,
): Promise<void> {
  if (clipboard) {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      // Some browsers expose the Clipboard API but deny it. Try the selection fallback.
    }
  }

  if (fallbackCopy(text)) return;
  throw new Error("The join link could not be copied.");
}

export function clubJoinUrl(origin: string, clubSlug: string): string {
  return new URL(`/app/clubs/${encodeURIComponent(clubSlug)}`, origin).toString();
}
