export function Icon({ name, size = 24 }: { name: "free" | "read" | "chat" | "back" | "arrow" | "mic" | "pause" | "play" | "stop" | "refresh" | "check" | "close"; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "free" && <><path d="M3 10v4M7.5 5v14M12 2v20M16.5 7v10M21 10v4" /></>}
    {name === "read" && <><path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z" /></>}
    {name === "chat" && <><path d="M15 13H8l-4 3V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v5a3 3 0 0 1-3 3Z"/><path d="M9 17h7l4 3v-7"/></>}
    {name === "back" && <path d="m14 6-6 6 6 6M8 12h12"/>}
    {name === "arrow" && <path d="M4 12h16m-6-6 6 6-6 6"/>}
    {name === "mic" && <><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></>}
    {name === "pause" && <><path d="M8 5v14M16 5v14" strokeWidth="3"/></>}
    {name === "play" && <path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none"/>}
    {name === "stop" && <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>}
    {name === "refresh" && <><path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/></>}
    {name === "check" && <path d="m5 12 4 4L19 6"/>}
    {name === "close" && <path d="m6 6 12 12M6 18 18 6"/>}
  </svg>;
}
