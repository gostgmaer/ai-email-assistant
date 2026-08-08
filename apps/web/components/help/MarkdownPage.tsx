import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a({ href, children }) {
    if (href?.startsWith("/")) {
      return <Link href={href}>{children}</Link>;
    }
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
};

export function MarkdownPage({ content }: { content: string }) {
  return (
    <article className="prose prose-zinc max-w-none w-full p-6 prose-headings:font-semibold prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline prose-table:text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </article>
  );
}
