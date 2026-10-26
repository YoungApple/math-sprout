import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/** Renders Markdown with $...$ / $$...$$ KaTeX math. */
export function MathText({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`math-text ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
