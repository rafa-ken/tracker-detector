const tabsData = {};

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

// Aproximação simples de "site" (eTLD+1). Melhorar depois com lista de sufixos públicos.
function siteOf(host) {
  if (!host) return null;
  const p = host.split(".");
  if (p.length <= 2) return host;
  const secondLevel = ["com", "org", "net", "gov", "edu"];
  const n = (p[p.length - 1].length === 2 && secondLevel.includes(p[p.length - 2])) ? 3 : 2;
  return p.slice(-n).join(".");
}

browser.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.tabId < 0) return;
    if (d.type === "main_frame") {
      tabsData[d.tabId] = { host: hostOf(d.url), thirdParties: new Set() };
      return;
    }
    const t = tabsData[d.tabId];
    if (!t) return;
    const h = hostOf(d.url);
    if (h && siteOf(h) !== siteOf(t.host)) t.thirdParties.add(h);
  },
  { urls: ["<all_urls>"] }
);

browser.tabs.onRemoved.addListener((id) => delete tabsData[id]);

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "getReport") return;
  return browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    const t = tabsData[tab.id];
    return {
      host: t ? t.host : null,
      thirdParties: t ? [...t.thirdParties].sort() : [],
    };
  });
});