import { richTextToText, sanitizeRichTextHtml } from "@/lib/rich-text";

export const CLUB_DESCRIPTION_MAX_LENGTH = 1_600;
export const CLUB_DESCRIPTION_HTML_MAX_LENGTH = 16_000;

export const sanitizeClubDescriptionHtml = sanitizeRichTextHtml;
export const clubDescriptionToText = richTextToText;
