(() => {
  if (window.__leoOverlayLoaded) return;
  window.__leoOverlayLoaded = true;

  const host = document.createElement("div");
  host.id = "leo-draft-overlay-host";
  host.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483647";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      .launcher { border: 0; border-radius: 999px; padding: 12px 18px; color: #fff; background: #176b52; font: 600 14px system-ui,sans-serif; box-shadow: 0 4px 18px #0004; cursor: pointer; }
      .panel { display:none; width:360px; max-height: min(78vh, 720px); overflow:auto; padding:16px; border:1px solid #d3ded8; border-radius:14px; color:#17211d; background:#fbfdfc; box-shadow:0 10px 40px #0004; font:14px/1.45 system-ui,sans-serif; }
      .panel.open { display:block; }
      .top { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
      h2 { margin:0; font-size:17px; }
      .close { border:0; background:transparent; font-size:20px; cursor:pointer; }
      label { display:block; margin:10px 0 5px; font-weight:600; }
      select, textarea, button { width:100%; border:1px solid #bdc9c2; border-radius:8px; padding:9px; color:inherit; background:white; font:inherit; }
      textarea { min-height:100px; resize:vertical; }
      textarea.reply { min-height:90px; }
      button.action { margin-top:10px; color:white; background:#176b52; border:0; font-weight:600; cursor:pointer; }
      button.secondary { margin-top:7px; background:#e9f0ec; cursor:pointer; }
      button:disabled { opacity:.5; cursor:not-allowed; }
      .notice { margin:8px 0; padding:9px; border-radius:8px; background:#edf4f0; color:#40564b; font-size:12px; }
      .error { color:#9e2d2d; }
      .check { display:flex; gap:8px; align-items:flex-start; margin:12px 0; font-size:12px; }
      .check input { margin-top:3px; }
      .status { min-height:20px; margin-top:8px; font-size:12px; }
    </style>
    <button class="launcher">Leo</button>
    <section class="panel" aria-label="Leo draft assistant">
      <div class="top"><h2>Draft a reply</h2><button class="close" aria-label="Close">×</button></div>
      <p class="notice">Draft-only mode. Leo does not scan chats or click Send. Open a one-to-one chat yourself, then verify the recipient below.</p>
      <label for="contact">Allowlisted contact</label>
      <select id="contact"><option value="">Loading contacts...</option></select>
      <label for="incoming">Message or short conversation</label>
      <textarea id="incoming" placeholder="Paste the message, or select its text in the open chat and use the button below."></textarea>
      <button id="selection" class="secondary">Use selected text from this chat</button>
      <label class="check"><input id="individual" type="checkbox"><span>I have verified that the open chat is a one-to-one chat with the selected person.</span></label>
      <button id="generate" class="action" disabled>Generate draft</button>
      <label for="reply">Suggested reply</label>
      <textarea id="reply" class="reply" placeholder="Your draft will appear here."></textarea>
      <button id="insert" class="action" disabled>Place draft in WhatsApp composer</button>
      <p class="notice">Leo never presses Send. Review the text in WhatsApp and send it yourself.</p>
      <div id="status" class="status" role="status"></div>
    </section>`;

  const $ = (selector) => root.querySelector(selector);
  const panel = $(".panel");
  const contactSelect = $("#contact");
  const incoming = $("#incoming");
  const reply = $("#reply");
  const check = $("#individual");
  const generate = $("#generate");
  const insert = $("#insert");
  const status = $("#status");
  let contacts = [];

  function setStatus(text, isError = false) {
    status.textContent = text;
    status.classList.toggle("error", isError);
  }

  function selectedContact() {
    return contacts.find((contact) => contact.id === contactSelect.value) || null;
  }

  function visibleMain() {
    const candidates = [...document.querySelectorAll("main")].filter((el) => el.getClientRects().length);
    return candidates.length === 1 ? candidates[0] : null;
  }

  function activeChatHeader() {
    const main = visibleMain();
    const header = main?.querySelector("header");
    if (!header) return { main, label: "" };
    const titleNode = header.querySelector("span[title]");
    const label = titleNode?.getAttribute("title")?.trim() || "";
    return { main, label };
  }

  function chatMatchesSelection() {
    const contact = selectedContact();
    const { label } = activeChatHeader();
    return Boolean(contact && label && label === contact.display_name);
  }

  function syncButtons() {
    const verifiedActiveContact = check.checked && chatMatchesSelection();
    generate.disabled = !(selectedContact() && verifiedActiveContact && incoming.value.trim());
    insert.disabled = !reply.value.trim() || !selectedContact() || !verifiedActiveContact;
  }

  async function loadContacts() {
    const result = await chrome.runtime.sendMessage({ type: "CONTACTS" });
    if (!result?.ok) throw new Error(result?.error || "Could not load allowlisted contacts");
    contacts = result.contacts || [];
    contactSelect.innerHTML = '<option value="">Choose a contact</option>';
    for (const contact of contacts) {
      const option = document.createElement("option");
      option.value = contact.id;
      option.textContent = contact.display_name || contact.id;
      contactSelect.appendChild(option);
    }
    if (!contacts.length) setStatus("No contacts are enabled. Add enabled_for_assistant: true entries to data/people.json.", true);
    syncButtons();
  }

  $(".launcher").addEventListener("click", async () => {
    panel.classList.add("open");
    try {
      await loadContacts();
    } catch (error) {
      setStatus(error.message, true);
    }
  });
  $(".close").addEventListener("click", () => panel.classList.remove("open"));

  for (const element of [contactSelect, incoming, check, reply]) {
    element.addEventListener("input", syncButtons);
    element.addEventListener("change", syncButtons);
  }

  $("#selection").addEventListener("click", () => {
    const contact = selectedContact();
    const { main, label } = activeChatHeader();
    if (!check.checked) {
      setStatus("Confirm that the open chat is one-to-one before using selected text.", true);
      return;
    }
    if (!contact || !main || label !== contact.display_name) {
      setStatus("Open the selected allowlisted contact's chat first. Leo will not read it.", true);
      return;
    }
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || "";
    if (!selectedText || !main.contains(selection.anchorNode)) {
      setStatus("Select message text in the open chat first.", true);
      return;
    }
    incoming.value = selectedText;
    syncButtons();
    setStatus("Selected text added. Confirm the chat is one-to-one before drafting.");
  });

  generate.addEventListener("click", async () => {
    const contact = selectedContact();
    if (!contact || !check.checked) return;
    if (!chatMatchesSelection()) {
      setStatus("The visible chat title does not match the selected contact. Nothing was sent.", true);
      return;
    }
    generate.disabled = true;
    setStatus("Generating locally with Ollama...");
    try {
      const result = await chrome.runtime.sendMessage({
        type: "DRAFT",
        payload: {
          chat_type: "individual",
          contact_id: contact.id,
          incoming_text: incoming.value.trim(),
        },
      });
      if (!result?.ok) throw new Error(result?.error || "Draft request failed");
      reply.value = result.draft;
      syncButtons();
      setStatus("Draft ready. Review it before placing it in the composer.");
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      syncButtons();
    }
  });

  insert.addEventListener("click", () => {
    const { main, label } = activeChatHeader();
    const contact = selectedContact();
    if (!check.checked || !contact || !main || label !== contact.display_name) {
      setStatus("The active chat changed or could not be verified. Draft was not inserted.", true);
      return;
    }
    const candidates = [...main.querySelectorAll('[contenteditable="true"][role="textbox"], [contenteditable="true"][data-tab]')]
      .filter((el) => el.getClientRects().length && !el.closest("[aria-hidden='true']"));
    const composers = candidates.filter((el) => /message|type/i.test(
      `${el.getAttribute("aria-label") || ""} ${el.getAttribute("data-placeholder") || ""} ${el.getAttribute("title") || ""}`
    ));
    if (composers.length !== 1) {
      setStatus("Could not identify exactly one message composer. Draft remains here.", true);
      return;
    }
    const composer = composers[0];
    if (composer.innerText.trim()) {
      setStatus("The WhatsApp composer already contains text. Clear or send it yourself first.", true);
      return;
    }
    composer.focus();
    const inserted = document.execCommand("insertText", false, reply.value);
    if (!inserted || !composer.innerText.includes(reply.value)) {
      setStatus("The browser did not confirm draft insertion. Review the composer before continuing.", true);
      return;
    }
    setStatus("Draft placed in the composer. Leo did not press Send.");
  });

  // Keep the send gate current if the user switches chats while the overlay is open.
  const observer = new MutationObserver(syncButtons);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });
})();
