import { richTextToText, sanitizeRichTextHtml } from "@/lib/rich-text";

export const THEME_DESCRIPTION_MAX_LENGTH = 5_000;
export const THEME_DESCRIPTION_HTML_MAX_LENGTH = 50_000;

export const sanitizeThemeDescriptionHtml = sanitizeRichTextHtml;
export const themeDescriptionToText = richTextToText;
