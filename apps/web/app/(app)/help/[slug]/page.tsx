import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MarkdownPage } from "@/components/help/MarkdownPage";
import { getHelpDoc, HELP_SLUGS } from "@/lib/help-content";

export function generateStaticParams() {
  return HELP_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getHelpDoc(slug);
  return { title: doc?.title ?? "Help" };
}

export default async function HelpDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = getHelpDoc(slug);
  if (!doc) notFound();
  return <MarkdownPage content={doc.content} />;
}
