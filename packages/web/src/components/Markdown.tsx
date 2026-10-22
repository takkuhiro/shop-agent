import type { ReactNode } from "react";

/** Just enough markdown for chat replies: paragraphs, bullet lists, **bold** and links. No raw HTML is ever rendered. */
function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      m[1] !== undefined ? (
        <strong key={m.index}>{m[1]}</strong>
      ) : (
        <a key={m.index} href={m[3]} target="_blank" rel="noreferrer noopener">
          {m[2]}
        </a>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks and lines are never reordered, so the position is their identity
            <ul key={i}>
              {lines.map((l, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: same as above
                <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        // biome-ignore lint/suspicious/noArrayIndexKey: same as above
        return <p key={i}>{inline(lines.join("\n"))}</p>;
      })}
    </>
  );
}
