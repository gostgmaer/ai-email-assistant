import fs from "node:fs";
import path from "node:path";

const HELP_DIR = path.join(process.cwd(), "content", "help");

export interface HelpDoc {
  slug: string;
  title: string;
  content: string;
}

/** Whitelisted slugs only — the URL segment is user-controlled input, and
 * this reads from disk, so we never build a path from it directly. */
export const HELP_SLUGS = [
  "01-getting-started",
  "02-inbox",
  "03-compose",
  "04-tasks-and-followups",
  "05-documents",
  "06-notifications",
  "07-settings-accounts",
  "08-settings-calendars",
  "09-settings-profile",
  "10-settings-security",
] as const;

export type HelpSlug = (typeof HELP_SLUGS)[number];

function titleFromMarkdown(content: string, fallback: string): string {
  const heading = content.match(/^#\s+(.+)$/m);
  return heading ? heading[1].trim() : fallback;
}

export function getHelpIndex(): HelpDoc {
  const content = fs.readFileSync(path.join(HELP_DIR, "README.md"), "utf-8");
  return { slug: "", title: titleFromMarkdown(content, "Help"), content };
}

export function getHelpDoc(slug: string): HelpDoc | null {
  if (!HELP_SLUGS.includes(slug as HelpSlug)) return null;
  const content = fs.readFileSync(path.join(HELP_DIR, `${slug}.md`), "utf-8");
  return { slug, title: titleFromMarkdown(content, slug), content };
}
