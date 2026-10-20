const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Plain text (typed, or AI-generated) to an HTML email body: escaped first,
 * so a "<" in the text — or markup an AI suggestion picked up from the email
 * it answers — goes out as text, not as markup. Blank lines become
 * paragraphs and single newlines become <br />. Mirrors the API's
 * textToSafeHtml.
 */
export function textToSafeHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p>${paragraph
          .replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])
          .replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}
