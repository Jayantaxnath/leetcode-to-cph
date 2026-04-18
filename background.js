// Use 127.0.0.1 — localhost can resolve differently inside MV3 service workers
const CPH_URL = "http://127.0.0.1:27121";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "SEND_TO_CPH") return;

  fetch(CPH_URL, {
    method: "POST",
    // text/plain skips CORS preflight; no-cors bypasses CORS enforcement entirely.
    // CPH doesn't return a meaningful response, so an opaque response is fine.
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(msg.payload),
  })
    .then(() => sendResponse({ ok: true }))
    .catch((err) => {
      console.error("[CPH background] fetch failed:", err.message);
      sendResponse({ ok: false, error: err.message });
    });

  return true; // keep channel open for async sendResponse
});
