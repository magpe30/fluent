import type { Mode } from "../lib/practice";

// Mint-green outer contours stay visible on dark cards; inset details remain dark.
// Decorative: each parent button already has a descriptive accessible name.
export function PracticeIllustration({ mode }: { mode: Mode }) {
  return <svg className="practice-illustration" viewBox="0 0 104 76" fill="none" aria-hidden="true" focusable="false">
    {mode === "read" ? <>
      <g stroke="#0b241c" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        <path d="m15 23 35 2 36-7 5 43-37 5-36-6Z" fill="#0b241c" stroke="currentColor"/>
        <path d="M14 18q19-6 36 6v37Q32 49 17 54Zm36 6Q68 11 86 15l3 40q-20-2-39 6Z" fill="currentColor"/>
        <path d="m50 24 1 36M23 28q11 0 19 6m-18 3 17 6m20-13 16-5m-16 14 17-5"/>
      </g>
      <path d="m73 14 1 19 5-4 4 1-1-16" fill="#0b241c"/>
    </> : mode === "free" ? <>
      <g stroke="#0b241c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="m49 49-4 14m-13 2 28 2" stroke="currentColor"/>
        <path d="m31 29-2 9q-2 17 16 20 20 3 24-17l1-8" stroke="currentColor"/>
        <rect x="39" y="11" width="26" height="40" rx="13" transform="rotate(10 39 11)" fill="#0b241c" stroke="var(--brand-mint)"/>
        <rect x="36" y="8" width="26" height="40" rx="13" transform="rotate(10 36 8)" fill="currentColor"/>
        <path d="M77 19l6-5m-7 15 8 1M21 18l-5-4" stroke="currentColor"/>
        <path d="m42 18 11 2m-13 5 12 2m-13 5 11 2"/>
      </g>
    </> : <>
      <g stroke="#0b241c" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        <path d="m43 34 41-1 2 25-10 1 3 10-18-10-18 1Z" fill="#0b241c" stroke="currentColor"/>
        <path d="m40 30 41-1 2 25-10 1 3 10-18-10-18 1Z" fill="var(--brand-mint)"/>
        <path d="m15 16 52-3 2 30-28 2-16 13 2-13-10 1Z" fill="currentColor"/>
        <path d="m26 26 28-1m-27 9 17-1"/>
      </g>
      <circle cx="62" cy="45" r="2" fill="#0b241c"/>
      <circle cx="70" cy="45" r="2" fill="#0b241c"/>
    </>}
  </svg>;
}
