import type { Metadata } from "next";

import { MarkdownPage } from "@/components/help/MarkdownPage";
import { getHelpIndex } from "@/lib/help-content";

export const metadata: Metadata = { title: "Help" };

export default function HelpIndexPage() {
  const doc = getHelpIndex();
  return <MarkdownPage content={doc.content} />;
}
