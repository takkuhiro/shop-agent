import type { ReactNode } from "react";

/** Opens in a new tab. `asButton` draws the link like a button. */
export function ExternalLink({ href, asButton, children }: { href: string; asButton?: boolean; children: ReactNode }) {
  return (
    <a className={asButton ? "button" : undefined} href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}
