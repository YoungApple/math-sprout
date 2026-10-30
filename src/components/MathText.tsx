import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

function normalizeMathDelimiters(text: string): string {
  return String(text ?? "")
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, body: string) => `$$${body}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, body: string) => `$${body}$`);
}

/** Renders Markdown with $...$ / $$...$$ KaTeX math (block or inline). */
export function MathText({
  children,
  className = "",
  inline = false,
}: {
  children: string;
  className?: string;
  inline?: boolean;
}) {
  const normalized = normalizeMathDelimiters(children);
  if (inline) {
    return (
      <span className={`math-inline ${className}`.trim()}>
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            p: ({ children: pChildren }) => <span>{pChildren}</span>,
          }}
        >
          {normalized}
        </ReactMarkdown>
      </span>
    );
  }
  return (
    <div className={`math-text ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
