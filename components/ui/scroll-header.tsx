"use client";

import { useEffect, useState, type ComponentPropsWithoutRef } from "react";
import { Starfield } from "../starfield";
import styles from "./scroll-header.module.css";

type ScrollHeaderProps = ComponentPropsWithoutRef<"header"> & { sticky?: boolean };

/** Keeps navigation readable over scrolling content without a divider or inset panel. */
export function ScrollHeader({ sticky = true, className, children, ...props }: ScrollHeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!sticky) return;
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [sticky]);

  return <header
    {...props}
    className={[styles.header, className].filter(Boolean).join(" ")}
    data-sticky={sticky || undefined}
    data-scrolled={sticky && scrolled || undefined}
  >
    {sticky && <div className={styles.backdrop} data-header-backdrop aria-hidden="true"><Starfield still/></div>}
    {children}
  </header>;
}
