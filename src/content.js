(function () {
  const canvasUsos = new Set();
  const suspeitas = [];
  const jaReportado = new Set();

  function siteSimples(host) {
    if (!host) return null;
    const p = host.split(".");
    if (p.length <= 2) return host;
    const sl = ["com", "org", "net", "gov", "edu"];
    const n = (p[p.length - 1].length === 2 && sl.includes(p[p.length - 2])) ? 3 : 2;
    return p.slice(-n).join(".");
  }

  function count(storage) {
    try { return storage.length; } catch (e) { return 0; }
  }

  // ---- Canvas fingerprint ----

  function marcar(metodo) {
    canvasUsos.add(metodo);
    browser.runtime.sendMessage({ type: "canvasReport", metodos: [...canvasUsos] });
  }

  function hook(proto, nome, escopo) {
    try {
      const orig = proto[nome];
      if (typeof orig !== "function") return;
      proto[nome] = exportFunction(function () {
        marcar(nome);
        switch (arguments.length) {
          case 0: return orig.call(this);
          case 1: return orig.call(this, arguments[0]);
          case 2: return orig.call(this, arguments[0], arguments[1]);
          case 3: return orig.call(this, arguments[0], arguments[1], arguments[2]);
          default: return orig.call(this, arguments[0], arguments[1], arguments[2], arguments[3]);
        }
      }, escopo);
    } catch (e) {
      console.warn("[TD] falha ao hookar", nome, e);
    }
  }

  try {
    const win = window.wrappedJSObject;
    hook(win.HTMLCanvasElement.prototype, "toDataURL", win);
    hook(win.HTMLCanvasElement.prototype, "toBlob", win);
    hook(win.CanvasRenderingContext2D.prototype, "getImageData", win);
    hook(win.CanvasRenderingContext2D.prototype, "fillText", win);
  } catch (e) {
    console.warn("[TD] sem acesso ao contexto da página", e);
  }

  // ---- Hijacking / hook ----

  function reportarHook(tipo, detalhe) {
    const chave = tipo + "|" + detalhe;
    if (jaReportado.has(chave)) return;
    jaReportado.add(chave);
    suspeitas.push({ tipo, detalhe });
    browser.runtime.sendMessage({ type: "hookReport", itens: suspeitas });
  }

  function ehNativo(fn) {
    try {
      return /\[native code\]/.test(Function.prototype.toString.call(fn));
    } catch (e) {
      return true;
    }
  }

  function checarGlobais() {
    let win;
    try { win = window.wrappedJSObject; } catch (e) { return; }

    const alvos = [
      ["fetch", () => win.fetch],
      ["XMLHttpRequest.prototype.open", () => win.XMLHttpRequest.prototype.open],
      ["XMLHttpRequest.prototype.send", () => win.XMLHttpRequest.prototype.send],
      ["navigator.sendBeacon", () => win.navigator.sendBeacon],
      ["History.prototype.pushState", () => win.History.prototype.pushState],
      ["EventTarget.prototype.addEventListener", () => win.EventTarget.prototype.addEventListener],
      ["WebSocket", () => win.WebSocket],
    ];

    for (const [nome, obter] of alvos) {
      try {
        const fn = obter();
        if (typeof fn === "function" && !ehNativo(fn)) {
          reportarHook("global alterada", nome);
        }
      } catch (e) { /* propriedade ausente */ }
    }

    try {
      const desc = Object.getOwnPropertyDescriptor(win.Document.prototype, "cookie");
      if (desc && desc.get && !ehNativo(desc.get)) {
        reportarHook("global alterada", "document.cookie (getter)");
      }
    } catch (e) { /* ignora */ }
  }

  // Scripts de terceiros injetados dinamicamente
  try {
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (!n || n.tagName !== "SCRIPT" || !n.src) continue;
          try {
            const h = new URL(n.src, location.href).hostname;
            if (siteSimples(h) !== siteSimples(location.hostname)) {
              reportarHook("script de 3ª parte injetado", h);
            }
          } catch (e) { /* src inválido */ }
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {
    console.warn("[TD] MutationObserver indisponível", e);
  }

  // ---- Storage HTML5 ----

  function lerStorage() {
    const data = {
      localStorage: count(window.localStorage),
      sessionStorage: count(window.sessionStorage),
      indexedDB: 0,
    };
    if (window.indexedDB && indexedDB.databases) {
      return indexedDB.databases()
        .then((dbs) => { data.indexedDB = dbs.length; return data; })
        .catch(() => data);
    }
    return Promise.resolve(data);
  }

  function medirStorage() {
    lerStorage().then((data) => {
      browser.runtime.sendMessage({ type: "storageReport", data });
    });
  }

  // Medição sob demanda, pedida pelo popup
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type !== "medirStorageAgora") return;
    return lerStorage();
  });

  function depoisDoLoad() {
    setTimeout(() => { medirStorage(); checarGlobais(); }, 500);
    setTimeout(checarGlobais, 3000); // hooks tardios
  }

  if (document.readyState === "complete") depoisDoLoad();
  else window.addEventListener("load", depoisDoLoad);
})();