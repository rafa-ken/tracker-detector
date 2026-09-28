const LISTA_PADRAO = [
  "doubleclick.net", "google-analytics.com", "googletagmanager.com",
  "facebook.net", "criteo.com", "adnxs.com", "rubiconproject.com",
  "pubmatic.com", "outbrain.com", "taboola.com", "scorecardresearch.com",
  "clarity.ms", "hotjar.com", "id5-sync.com",
];

document.getElementById("padrao").textContent = LISTA_PADRAO.join(", ");

browser.storage.local.get({ bloqueio: [], usarPadrao: true }).then((cfg) => {
  document.getElementById("lista").value = cfg.bloqueio.join("\n");
  document.getElementById("usarPadrao").checked = cfg.usarPadrao;
});

document.getElementById("salvar").addEventListener("click", () => {
  const bloqueio = document.getElementById("lista").value
    .split("\n")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const usarPadrao = document.getElementById("usarPadrao").checked;

  browser.storage.local.set({ bloqueio, usarPadrao }).then(() => {
    const st = document.getElementById("status");
    st.textContent = `salvo (${bloqueio.length} domínio(s) personalizado(s))`;
    setTimeout(() => { st.textContent = ""; }, 2500);
  });
});