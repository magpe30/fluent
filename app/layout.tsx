import type { Metadata } from "next";
import "./globals.css";
import "./space.css";
import "./design-tokens.css";
import "./rehearsal.css";

export const metadata: Metadata = {
  title: "Fluent — Make room for your point",
  description: "A little room to rehearse speaking English at work. Shape your own conversation, reflect on your words, and try again.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
