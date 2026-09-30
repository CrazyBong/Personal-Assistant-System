const status = document.getElementById("status");

document.getElementById("pair").addEventListener("click", async () => {
  status.textContent = "Pairing...";
  const result = await chrome.runtime.sendMessage({
    type: "PAIR",
    code: document.getElementById("code").value.trim(),
  });
  status.textContent = result?.ok ? "Paired with the local service." : result?.error || "Pairing failed.";
});

document.getElementById("unpair").addEventListener("click", async () => {
  const result = await chrome.runtime.sendMessage({ type: "UNPAIR" });
  status.textContent = result?.ok ? "This extension is unpaired." : result?.error || "Could not unpair.";
});
