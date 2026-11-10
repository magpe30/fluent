export function MicrophoneHelp({ permission }: { permission: PermissionState | "unknown" }) {
  return <div className="microphone-help">
    <p role="status">{permission === "denied"
      ? "Your browser reports that microphone permission is blocked. Allow it in this site’s permissions before trying again."
      : permission === "granted"
        ? "Site permission is allowed. If the microphone is still blocked, check your device’s privacy settings for this browser."
        : "If no permission prompt appears, check this site’s microphone permission in your browser."}</p>
    {permission === "granted" && <p>On a Mac, open <strong>System Settings → Privacy &amp; Security → Microphone</strong> and enable access for your browser. Reopen the browser if your device asks you to.</p>}
    <ol>
      <li>Open this site’s permissions in your browser—usually beside the address bar.</li>
      <li>Set <strong>Microphone</strong> to <strong>Allow</strong>, then select <strong>Try microphone again</strong>.</li>
    </ol>
    <details><summary>Still blocked?</summary><p>Your device also needs to allow microphone access for this browser. On a Mac, check <strong>System Settings → Privacy &amp; Security → Microphone</strong>. If you’re using an embedded preview, try opening Fluent in a browser tab.</p></details>
  </div>;
}
