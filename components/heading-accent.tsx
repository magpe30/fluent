import type { ReactNode } from "react";

export function HeadingAccent({ children }: { children: ReactNode }) {
  return <span className="headline-point">{children}<svg viewBox="0 0 240 40" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M10 24 C38 12 60 10 82 21 S126 16 149 19 S192 31 230 25"/></svg></span>;
}
