"use client";

import { useId } from "react";
import type { VocabularyItem } from "../lib/rehearsal";
import { HeadingAccent } from "./heading-accent";
import styles from "./vocabulary-feedback.module.css";

export function VocabularyFeedback({ items }: { items: VocabularyItem[] }) {
  const headingId = useId();
  if (!items.length) return null;
  return <section className={styles.section} aria-labelledby={headingId}>
    <h2 id={headingId}>Words for <HeadingAccent>next time.</HeadingAccent></h2>
    <p className={styles.intro}>A few expressions for the ideas you shared. Your original words can work too.</p>
    <div className={styles.items}>
      {items.map(item => <article className={styles.item} key={item.phrase}>
        <div className={styles.context}>
          <span className={styles.label}>From your conversation</span>
          <blockquote>“{item.quote}”</blockquote>
        </div>
        <div className={styles.expression}>
          <h3>{item.phrase}</h3>
          <p>{item.meaning}</p>
          <div className={styles.example}>
            <span className={styles.label}>An example</span>
            <p>“{item.example}”</p>
          </div>
          <details>
            <summary>Try it aloud <span aria-hidden="true">↗</span></summary>
            <p>Use “{item.phrase}” in one sentence. {item.practice}</p>
          </details>
        </div>
      </article>)}
    </div>
  </section>;
}
