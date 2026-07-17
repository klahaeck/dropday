const ALLOWED_TAGS = new Set(["p", "br", "strong", "em", "ul", "ol", "li"]);
const BLOCKED_ELEMENTS = "script|style|iframe|object|embed|svg|math|template";

export function plainTextToRichTextHtml(input: string): string {
  if (!input) return "";
  return `<p>${input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r\n?|\n/g, "<br>")}</p>`;
}

export function sanitizeRichTextHtml(input: string): string {
  return input
    .replace(/\0/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(new RegExp(`<(${BLOCKED_ELEMENTS})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi"), "")
    .replace(new RegExp(`<(${BLOCKED_ELEMENTS})\\b[^>]*\\/?>`, "gi"), "")
    .replace(/<[^>]*>/g, (tag) => {
      const match = tag.match(/^<\s*(\/?)\s*([a-z0-9-]+)[^>]*>$/i);
      if (!match) return "";
      const closing = Boolean(match[1]);
      const name = match[2].toLowerCase().replace(/^b$/, "strong").replace(/^i$/, "em").replace(/^div$/, "p");
      if (!ALLOWED_TAGS.has(name) || (name === "br" && closing)) return "";
      return closing ? `</${name}>` : `<${name}>`;
    })
    .trim();
}

export function richTextToText(html: string): string {
  return sanitizeRichTextHtml(html)
    .replace(/<br>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/(p|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
