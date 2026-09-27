const tabsData = {};
const mainFrameChains = {};
const navHistory = {};

const PARAMS_RASTREIO = [
  "gclid", "fbclid", "msclkid", "dclid", "twclid", "igshid", "ttclid",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "_ga", "mc_eid", "oly_enc_id", "vero_id", "wickedid", "yclid",
];

// Nomes de parâmetro que sugerem identificador de usuário
const RE_PARAM_ID = /uid|uuid|(^|[_-])id([_-]|$)|sid|gid|cid|visitor|cookie/i;

// Tempo máximo numa página para considerá-la um salto de bounce
const MS_BOUNCE = 1500;

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

function extrairParams(url) {
  const out = [];
  try {
    const u = new URL(url);
    u.searchParams.forEach((v, k) => {
      if (!v) return;
      if (v.length >= 8 || RE_PARAM_ID.test(k)) out.push({ param: k, value: v });
    });
  } catch (e) { /* URL inválida */ }
  return out;
}

function paramsDeRastreio(url) {
  const achados = [];
  try {
    const u = new URL(url);
    u.searchParams.forEach((v, k) => {
      if (PARAMS_RASTREIO.includes(k.toLowerCase())) achados.push({ param: k, value: v });
    });
  } catch (e) { /* ignora */ }
  return achados;
}

// ---- Coleta de requisições ----

browser.webRequest.onBeforeRequest.addListener(
  (d) => {
    if (d.tabId < 0) return;

    if (d.type === "main_frame") {
      const host = hostOf(d.url);
      const origem = hostOf(d.originUrl);

      // Histórico de navegação (detecta bounce feito por JavaScript)
      if (!navHistory[d.tabId]) navHistory[d.tabId] = [];
      navHistory[d.tabId].push({ host, origem, ts: Date.now() });
      if (navHistory[d.tabId].length > 10) navHistory[d.tabId].shift();

      // Preserva a cadeia de redirects HTTP se esta requisição é continuação dela
      const chain = mainFrameChains[d.tabId] || [];
      const ultimo = chain[chain.length - 1];
      if (!ultimo || ultimo.to !== host) mainFrameChains[d.tabId] = [];

      tabsData[d.tabId] = {
        host,
        thirdParties: new Set(),
        hostsConhecidos: new Set([host]),
        // Parâmetros da própria URL de destino: é assim que um bounce
        // repassa o identificador de um domínio para o outro
        paramsEnviados: extrairParams(d.url).map((p) => ({ host, ...p })),
        redirects3p: [],
        paramsRastreioURL: paramsDeRastreio(d.url),
      };
      if (origem) tabsData[d.tabId].hostsConhecidos.add(origem);
      for (const h of chain) {
        tabsData[d.tabId].hostsConhecidos.add(h.from);
        tabsData[d.tabId].hostsConhecidos.add(h.to);
      }
      for (const n of navHistory[d.tabId]) {
        if (n.host) tabsData[d.tabId].hostsConhecidos.add(n.host);
      }
      return;
    }

    const t = tabsData[d.tabId];
    if (!t) return;
    const h = hostOf(d.url);
    if (!h || siteOf(h) === siteOf(t.host)) return;

    t.thirdParties.add(h);
    t.hostsConhecidos.add(h);

    if (t.paramsEnviados.length < 2000) {
      for (const p of extrairParams(d.url)) {
        t.paramsEnviados.push({ host: h, param: p.param, value: p.value });
      }
    }
  },
  { urls: ["<all_urls>"] }
);

// ---- Redirects HTTP ----

browser.webRequest.onBeforeRedirect.addListener(
  (d) => {
    if (d.tabId < 0) return;
    const de = hostOf(d.url);
    const para = hostOf(d.redirectUrl);
    if (!de || !para) return;

    if (d.type === "main_frame") {
      if (!mainFrameChains[d.tabId]) mainFrameChains[d.tabId] = [];
      mainFrameChains[d.tabId].push({ from: de, to: para });
      return;
    }

    const t = tabsData[d.tabId];
    if (!t) return;
    if (siteOf(de) !== siteOf(para) && t.redirects3p.length < 200) {
      t.redirects3p.push({ from: de, to: para });
      t.hostsConhecidos.add(de);
      t.hostsConhecidos.add(para);
    }
  },
  { urls: ["<all_urls>"] }
);

browser.tabs.onRemoved.addListener((id) => {
  delete tabsData[id];
  delete mainFrameChains[id];
  delete navHistory[id];
});

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

function coletarCookies(tab, t) {
  const topLevelSite = new URL(tab.url).protocol + "//" + siteOf(t.host);

  const sites = new Set();
  for (const h of t.hostsConhecidos) if (h) sites.add(siteOf(h));

  const queries = [
    browser.cookies.getAll({ url: tab.url }),
    browser.cookies.getAll({ partitionKey: { topLevelSite } }).catch(() => []),
  ];
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
    return todos;
  });
}

// ---- Cookie sync ----

function detectarSync(cookies, paramsEnviados) {
  const porValor = new Map();
  for (const p of paramsEnviados) {
    if (!porValor.has(p.value)) porValor.set(p.value, []);
    porValor.get(p.value).push(p);
  }

  const achados = [];
  const jaVisto = new Set();

  for (const c of cookies) {
    const valor = c.value;
    if (!valor) continue;
    const cookieSite = siteOf(c.domain.replace(/^\./, ""));
    const candidatos = [];

    if (porValor.has(valor)) {
      // valor curto só conta se o parâmetro tem cara de identificador
      for (const p of porValor.get(valor)) {
        if (valor.length >= 8 || RE_PARAM_ID.test(p.param)) candidatos.push(p);
      }
    }

    if (valor.length >= 12) {
      for (const p of paramsEnviados) {
        if (p.value !== valor && p.value.includes(valor)) candidatos.push(p);
      }
    }

    for (const p of candidatos) {
      if (siteOf(p.host) === cookieSite) continue;
      const chave = c.name + "|" + cookieSite + "|" + p.host + "|" + p.param;
      if (jaVisto.has(chave)) continue;
      jaVisto.add(chave);
      achados.push({
        cookie: c.name,
        origem: cookieSite,
        destino: p.host,
        param: p.param,
        trecho: valor.slice(0, 16) + (valor.length > 16 ? "…" : ""),
      });
    }
  }

  return achados;
}

// ---- Bounce tracking ----

function detectarBounce(tabId, hostFinal) {
  const saltos = [];
  const jaVisto = new Set();

  // 1) Redirects HTTP no documento principal
  for (const h of mainFrameChains[tabId] || []) {
    if (h.from && siteOf(h.from) !== siteOf(hostFinal)) {
      const k = "http|" + h.from;
      if (!jaVisto.has(k)) {
        jaVisto.add(k);
        saltos.push({ intermediario: h.from, destino: h.to, via: "redirect HTTP" });
      }
    }
  }

  // 2) Navegação por JavaScript: página de passagem com permanência curta
  const nav = navHistory[tabId] || [];
  const recente = nav.slice(-4);
  for (let i = 1; i < recente.length; i++) {
    const meio = recente[i - 1];
    const destino = recente[i];
    if (!meio.host || !destino.host) continue;
    if (siteOf(meio.host) === siteOf(destino.host)) continue;
    if (destino.ts - meio.ts > MS_BOUNCE) continue;
    if (meio.origem && siteOf(meio.origem) === siteOf(meio.host)) continue;

    const k = "js|" + meio.host;
    if (jaVisto.has(k)) continue;
    jaVisto.add(k);
    saltos.push({
      intermediario: meio.host,
      destino: destino.host,
      via: `navegação JS (${destino.ts - meio.ts} ms na página)`,
    });
  }

  return { cadeia: nav.map((n) => n.host), saltos3p: saltos };
}

// ---- Mensagens ----

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
        return coletarCookies(tab, t).then((todos) => ({
          cookies: classifyCookies(todos, t.host),
        }));
      });

    case "getTracking":
      return activeTab().then((tab) => {
        const t = tabsData[tab.id];
        if (!t || !t.host) {
          return { sync: [], bounce: { cadeia: [], saltos3p: [] }, redirects3p: [], paramsURL: [] };
        }
        return coletarCookies(tab, t).then((todos) => ({
          sync: detectarSync(todos, t.paramsEnviados),
          bounce: detectarBounce(tab.id, t.host),
          redirects3p: t.redirects3p,
          paramsURL: t.paramsRastreioURL,
        }));
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

    case "canvasReport":
      if (sender.tab && tabsData[sender.tab.id]) {
        tabsData[sender.tab.id].canvas = msg.metodos;
      }
      return;

    case "getCanvas":
      return activeTab().then((tab) => {
        const t = tabsData[tab.id];
        return { metodos: (t && t.canvas) || [] };
      });

    default:
      return;
  }
}); 