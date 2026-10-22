import type { ReactNode } from "react";

export function Card({ kind, title, children }: { kind: string; title?: string; children: ReactNode }) {
  return (
    <div className={`card ${kind}`}>
      {title && <div className="title">{title}</div>}
      {children}
    </div>
  );
}
