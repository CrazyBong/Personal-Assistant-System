const API = "http://127.0.0.1:8765";
const WA_URL = "https://web.whatsapp.com/";

function isOverlayPage(sender) {
  return typeof sender.url === "string" && sender.url.startsWith(chrome.runtime.getURL(""));
}

function isWhatsAppTab(sender) {
  return typeof sender.tab?.url === "string" && sender.tab.url.startsWith(WA_URL);
}

async function api(path, { method = "GET", body, pairCode } = {}) {
  const saved = await chrome.storage.local.get(["leoToken"]);
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (pairCode) headers["X-Leo-Pair-Code"] = pairCode;
  if (saved.leoToken) headers["X-Leo-Token"] = saved.leoToken;
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Local service returned ${response.status}`);
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === "PAIR") {
        if (!isOverlayPage(sender)) throw new Error("Pair from the extension popup only");
        const result = await api("/pair", { method: "POST", body: {}, pairCode: String(message.code || "") });
        await chrome.storage.local.set({ leoToken: result.token });
        sendResponse({ ok: true });
        return;
      }
      if (message?.type === "UNPAIR") {
        if (!isOverlayPage(sender)) throw new Error("Unpair from the extension popup only");
        const saved = await chrome.storage.local.get(["leoToken"]);
        if (saved.leoToken) await api("/unpair", { method: "POST", body: {} });
        await chrome.storage.local.remove("leoToken");
        sendResponse({ ok: true });
        return;
      }
      if (!isWhatsAppTab(sender)) throw new Error("Leo only accepts requests from WhatsApp Web");
      if (message?.type === "CONTACTS") {
        const result = await api("/contacts");
        sendResponse({ ok: true, contacts: result.contacts });
        return;
      }
      if (message?.type === "DRAFT") {
        const result = await api("/draft", { method: "POST", body: message.payload });
        sendResponse({ ok: true, draft: result.draft });
        return;
      }
      throw new Error("Unsupported request");
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || "Local service unavailable" });
    }
  })();
  return true;
});
