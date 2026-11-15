import { SESSION_CLEANUP_SECONDS } from "../../lib/livekit/contracts.ts";

/** Signal a graceful finish, then enforce cleanup even if delivery never resolves. */
export function startSessionLifetime(seconds: number, onLimit: () => Promise<unknown>, onClose: () => void) {
  let cleanup: ReturnType<typeof setTimeout> | undefined;
  const limit = setTimeout(() => {
    cleanup = setTimeout(onClose, SESSION_CLEANUP_SECONDS * 1000);
    void Promise.resolve().then(onLimit).catch(() => {});
  }, seconds * 1000);
  return () => { clearTimeout(limit); clearTimeout(cleanup); };
}
