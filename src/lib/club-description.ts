import { richTextToText, sanitizeRichTextHtml } from "@/lib/rich-text";

export const CLUB_DESCRIPTION_MAX_LENGTH = 500;
export const CLUB_DESCRIPTION_HTML_MAX_LENGTH = 5_000;

export const sanitizeClubDescriptionHtml = sanitizeRichTextHtml;
export const clubDescriptionToText = richTextToText;
