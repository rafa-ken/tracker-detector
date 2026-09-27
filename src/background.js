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

// ---- Coleta de requisições ----

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

// ---- Cookies ----

function classifyCookies(cookies, pageHost) {
  return cookies.map((c) => {
    const cookieDomain = c.domain.replace(/^\./, "");
    return {
      name: c.name,
      domain: cookieDomain,
      party: siteOf(cookieDomain) === siteOf(pageHost) ? "1ª parte" : "3ª parte",
      tipo: c.expirationDate ? "persistente" : "sessão",
      particionado: !!(c.partitionKey && c.partitionKey.topLevelSite),
    };
  });
}

// ---- Mensagens (um único listener para todos os tipos) ----

function activeTab() {
  return browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => tab);
}

browser.runtime.onMessage.addListener((msg, sender) => {
  switch (msg.type) {
    case "getReport":
      return activeTab().then((tab) => {
        const t = tabsData[tab.id];
        return {
          host: t ? t.host : null,
          thirdParties: t ? [...t.thirdParties].sort() : [],
        };
      });

    case "getCookies":
      return activeTab().then((tab) => {
        const t = tabsData[tab.id];
        if (!t || !t.host) return { cookies: [] };

        const topLevelSite = new URL(tab.url).protocol + "//" + siteOf(t.host);

        const sites = new Set();
        for (const h of t.thirdParties) sites.add(siteOf(h));

        const queries = [
          // 1ª parte (não particionados)
          browser.cookies.getAll({ url: tab.url }),
          // particionados sob este site de topo (Total Cookie Protection)
          browser.cookies.getAll({ partitionKey: { topLevelSite } }).catch(() => []),
        ];
        // 3ª parte não particionados, por site registrável
        for (const s of sites) {
          queries.push(browser.cookies.getAll({ domain: s }).catch(() => []));
        }

        return Promise.all(queries).then((listas) => {
          const vistos = new Set();
          const todos = [];
          for (const lista of listas) {
            for (const c of lista) {
              const pk = (c.partitionKey && c.partitionKey.topLevelSite) || "";
              const chave = c.name + "|" + c.domain + "|" + pk;
              if (vistos.has(chave)) continue;
              vistos.add(chave);
              todos.push(c);
            }
          }
          return { cookies: classifyCookies(todos, t.host) };
        });
      });

    case "storageReport":
      if (sender.tab && tabsData[sender.tab.id]) {
        tabsData[sender.tab.id].storage = msg.data;
      }
      return;

    case "getStorage":
      return activeTab().then((tab) => {
        const t = tabsData[tab.id];
        return (t && t.storage) || { localStorage: 0, sessionStorage: 0, indexedDB: 0 };
      });

    default:
      return;
  }
});