"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Source } from "@/lib/types";

/** Turn bare [n] citations into links to the matching source. */
function linkCitations(text: string, sources: Source[] | undefined): string {
  if (!sources || sources.length === 0) return text;
  return text.replace(/(^|[^\]\w])\[(\d{1,2})\](?!\()/g, (m, pre: string, n: string) => {
    const src = sources[parseInt(n, 10) - 1];
    return src ? `${pre}[\\[${n}\\]](${src.url} "${src.title.replace(/"/g, "'")}")` : m;
  });
}

function MarkdownImpl({ content, sources }: { content: string; sources?: Source[] }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, title, children }) => {
            const isCite = /^\[\d+\]$/.test(String(children));
            return (
              <a
                href={href}
                title={title}
                target="_blank"
                rel="noreferrer"
                className={isCite ? "cite" : undefined}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {linkCitations(content, sources)}
      </ReactMarkdown>
    </div>
  );
}

export const Markdown = memo(MarkdownImpl);
