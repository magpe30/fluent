export const AGENT_NAME = "fluent-coach";
export const MAX_SESSION_SECONDS = 10 * 60;

export type ConversationOptions = {
  prompt: string;
  focus: "both" | "language" | "delivery";
  scenario?: "meeting" | "rehearsal";
  retry?: boolean;
  openingQuestion?: string;
};

export type ConnectionDetails = {
  server_url: string;
  participant_token: string;
  room_name: string;
};

export function parseConversationOptions(value: unknown): ConversationOptions | null {
  if (!value || typeof value !== "object") return null;
  const { prompt, focus, scenario, retry, openingQuestion } = value as Record<string, unknown>;
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) return null;
  if (focus !== "both" && focus !== "language" && focus !== "delivery") return null;
  if (scenario !== undefined && scenario !== "meeting" && scenario !== "rehearsal") return null;
  if (retry !== undefined && typeof retry !== "boolean") return null;
  if (openingQuestion !== undefined && (typeof openingQuestion !== "string" || !openingQuestion.trim() || openingQuestion.length > 4000)) return null;
  return { prompt: prompt.trim(), focus, ...(scenario ? { scenario, retry: retry === true, ...(typeof openingQuestion === "string" ? { openingQuestion: openingQuestion.trim() } : {}) } : {}) };
}
