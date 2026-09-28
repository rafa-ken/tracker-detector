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

// ---- Lista de bloqueio ----

const LISTA_PADRAO = [
  "doubleclick.net", "google-analytics.com", "googletagmanager.com",
  "facebook.net", "criteo.com", "adnxs.com", "rubiconproject.com",
  "pubmatic.com", "outbrain.com", "taboola.com", "scorecardresearch.com",
  "clarity.ms", "hotjar.com", "id5-sync.com",
];

let listaBloqueio = [];

function carregarLista() {
  return browser.storage.local.get({ bloqueio: [], usarPadrao: true }).then((cfg) => {
    const base = cfg.usarPadrao ? LISTA_PADRAO : [];
    listaBloqueio = base
      .concat(cfg.bloqueio || [])
      .map((s) => String(s).trim().toLowerCase())
      .filter(Boolean);
  });
}

carregarLista();
browser.storage.onChanged.addListener(carregarLista);

// Casa o host com a regra e com qualquer subdomínio dela
function regraQueBloqueia(host) {
  if (!host) return null;
  const h = host.toLowerCase();
  for (const d of listaBloqueio) {
    if (h === d || h.endsWith("." + d)) return d;
  }
  return null;
}

// ---- Utilidades ----

function hostOf(url) {
  try { return new URL(url).hostname; } catch (e) { return null; }
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

// ---- Coleta de requisições (listener bloqueante) ----

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
        websockets: new Set(),
        contagem: {},
        hooks: [],
        cookiesInjetados: [],
        bloqueados: {},
      };

      if (origem) tabsData[d.tabId].hostsConhecidos.add(origem);
      for (const h of chain) {
        tabsData[d.tabId].hostsConhecidos.add(h.from);
        tabsData[d.tabId].hostsConhecidos.add(h.to);
      }
      // Apenas a página imediatamente anterior, que pode ter sido o
      // intermediário de um bounce. O histórico completo contaminaria a
      // análise com sites sem relação com a página atual.
      const anterior = navHistory[d.tabId][navHistory[d.tabId].length - 2];
      if (anterior && anterior.host) tabsData[d.tabId].hostsConhecidos.add(anterior.host);
      return;
    }

    const t = tabsData[d.tabId];
    if (!t) return;
    const h = hostOf(d.url);
    if (!h || siteOf(h) === siteOf(t.host)) return;

    t.thirdParties.add(h);
    t.hostsConhecidos.add(h);

    const regra = regraQueBloqueia(h);
    if (regra) {
      if (!t.bloqueados[h]) t.bloqueados[h] = { n: 0, regra };
      t.bloqueados[h].n++;
      return { cancel: true };
    }

    if (t.paramsEnviados.length < 2000) {
      for (const p of extrairParams(d.url)) {
        t.paramsEnviados.push({ host: h, param: p.param, value: p.value });
      }
    }

    if (d.type === "websocket") t.websockets.add(h);

    const c = t.contagem[h] || { n: 0, primeiro: Date.now() };
    c.n++;
    c.ultimo = Date.now();
    t.contagem[h] = c;
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
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

// ---- Cookies injetados no carregamento (cabeçalhos Set-Cookie) ----

function parseSetCookie(linha, hostReq) {
  const partes = linha.split(";");
  const primeiro = partes.shift() || "";
  const i = primeiro.indexOf("=");
  if (i < 0) return null;
  const name = primeiro.slice(0, i).trim();
  if (!name) return null;

  let domain = hostReq;
  let persistente = false;
  for (const p of partes) {
    const igual = p.indexOf("=");
    const chave = (igual < 0 ? p : p.slice(0, igual)).trim().toLowerCase();
    const valor = igual < 0 ? "" : p.slice(igual + 1).trim();
    if (chave === "domain" && valor) domain = valor.replace(/^\./, "");
    if (chave === "expires" || chave === "max-age") persistente = true;
  }
  return { name, domain, persistente };
}

browser.webRequest.onHeadersReceived.addListener(
  (d) => {
    if (d.tabId < 0) return;
    const t = tabsData[d.tabId];
    if (!t) return;
    const hostReq = hostOf(d.url);
    if (!hostReq) return;

    for (const h of d.responseHeaders || []) {
      if (h.name.toLowerCase() !== "set-cookie") continue;
      // O Firefox pode juntar vários Set-Cookie num valor separado por \n
      for (const linha of (h.value || "").split("\n")) {
        const c = parseSetCookie(linha, hostReq);
        if (!c) continue;
        const chave = c.name + "|" + c.domain;
        if (t.cookiesInjetados.some((x) => x.name + "|" + x.domain === chave)) continue;
        t.cookiesInjetados.push({
          name: c.name,
          domain: c.domain,
          party: siteOf(c.domain) === siteOf(t.host) ? "1ª parte" : "3ª parte",
          tipo: c.persistente ? "persistente" : "sessão",
        });
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

browser.tabs.onRemoved.addListener((id) => {
  delete tabsData[id];
  delete mainFrameChains[id];
  delete navHistory[id];
});

// ---- Cookies do jar ----

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

    // 2) Navegação por JavaScript: cadeia de passagem que termina NESTA página.
  // Percorre de trás para frente e para no primeiro salto que não qualifica,
  // para não reportar bounces de navegações anteriores da mesma aba.
  const nav = navHistory[tabId] || [];
  for (let i = nav.length - 1; i >= 1; i--) {
    const meio = nav[i - 1];
    const destino = nav[i];
    if (!meio.host || !destino.host) break;
    if (siteOf(meio.host) === siteOf(destino.host)) break;
    if (destino.ts - meio.ts > MS_BOUNCE) break;
    if (meio.origem && siteOf(meio.origem) === siteOf(meio.host)) break;

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
        if (!t || !t.host) return { cookies: [], injetados: [] };
        return coletarCookies(tab, t).then((todos) => ({
          cookies: classifyCookies(todos, t.host),
          injetados: t.cookiesInjetados,
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
        const guardado = (t && t.storage) || { localStorage: 0, sessionStorage: 0, indexedDB: 0 };
        return browser.tabs.sendMessage(tab.id, { type: "medirStorageAgora" }, { frameId: 0 })
          .then((atual) => atual || guardado)
          .catch(() => guardado);
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

    case "hookReport":
      if (sender.tab && tabsData[sender.tab.id]) {
        tabsData[sender.tab.id].hooks = msg.itens;
      }
      return;

    case "getHijack":
      return activeTab().then((tab) => {
        const t = tabsData[tab.id];
        if (!t) return { websockets: [], polling: [], hooks: [] };

        const polling = [];
        for (const [host, c] of Object.entries(t.contagem)) {
          const janela = (c.ultimo || 0) - c.primeiro;
          if (c.n >= 10 && janela >= 5000) {
            polling.push({ host, n: c.n, segundos: Math.round(janela / 1000) });
          }
        }

        return {
          websockets: [...t.websockets],
          polling: polling.sort((a, b) => b.n - a.n),
          hooks: t.hooks || [],
        };
      });

    case "getBloqueio":
      return activeTab().then((tab) => {
        const t = tabsData[tab.id];
        if (!t) return { itens: [], total: 0 };
        const itens = Object.entries(t.bloqueados)
          .map(([host, v]) => ({ host, n: v.n, regra: v.regra }))
          .sort((a, b) => b.n - a.n);
        return { itens, total: itens.reduce((s, i) => s + i.n, 0) };
      });

    default:
      return;
  }
});