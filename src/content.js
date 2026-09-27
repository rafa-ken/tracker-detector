(function () {
  console.log("[TD] content script carregado em", location.href);

  const canvasUsos = new Set();

  function marcar(metodo) {
    console.log("[TD] canvas:", metodo);
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
      console.log("[TD] hook aplicado:", nome);
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

  // ---- Storage HTML5 (medido depois do load) ----

  function count(storage) {
    try { return storage.length; } catch { return 0; }
  }

  function medirStorage() {
    const data = {
      localStorage: count(window.localStorage),
      sessionStorage: count(window.sessionStorage),
      indexedDB: 0,
    };

    console.log("[TD] storage medido:", data);

    const send = () => browser.runtime.sendMessage({ type: "storageReport", data });

    if (window.indexedDB && indexedDB.databases) {
      indexedDB.databases()
        .then((dbs) => { data.indexedDB = dbs.length; send(); })
        .catch(send);
    } else {
      send();
    }
  }

  if (document.readyState === "complete") {
    setTimeout(medirStorage, 500);
  } else {
    window.addEventListener("load", () => setTimeout(medirStorage, 500));
  }
})();