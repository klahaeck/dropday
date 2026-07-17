import { richTextToText, sanitizeRichTextHtml } from "@/lib/rich-text";

export const PLAYLIST_DESCRIPTION_MAX_LENGTH = 10_000;
export const PLAYLIST_DESCRIPTION_HTML_MAX_LENGTH = 50_000;

export const sanitizePlaylistDescriptionHtml = sanitizeRichTextHtml;

export const playlistDescriptionToText = richTextToText;
