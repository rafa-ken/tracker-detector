function lista(id, itens, texto) {
  const ul = document.getElementById(id);
  itens.forEach((it) => {
    const li = document.createElement("li");
    li.textContent = texto(it);
    ul.appendChild(li);
  });
}

browser.runtime.sendMessage({ type: "getReport" }).then((r) => {
  document.getElementById("site").textContent = r.host || "sem dados (recarregue a página)";
  document.getElementById("count").textContent = r.thirdParties.length;
  lista("list", r.thirdParties, (h) => h);
});

browser.runtime.sendMessage({ type: "getCookies" }).then((r) => {
  const cookies = (r && r.cookies) || [];
  const primeira = cookies.filter((c) => c.party === "1ª parte").length;
  document.getElementById("cookieCount").textContent =
    `${cookies.length} (1ª parte: ${primeira}, 3ª parte: ${cookies.length - primeira})`;
  lista("cookieList", cookies, (c) =>
    `${c.name} — ${c.domain} (${c.party}, ${c.tipo}${c.particionado ? ", particionado" : ""})`);
});

browser.runtime.sendMessage({ type: "getStorage" }).then((r) => {
  document.getElementById("ls").textContent = r.localStorage;
  document.getElementById("ss").textContent = r.sessionStorage;
  document.getElementById("idb").textContent = r.indexedDB;
});

browser.runtime.sendMessage({ type: "getCanvas" }).then((r) => {
  const el = document.getElementById("canvas");
  if (r.metodos.length) {
    el.textContent = "SUSPEITA — métodos usados: " + r.metodos.join(", ");
    el.className = "alerta";
  }
});

browser.runtime.sendMessage({ type: "getTracking" }).then((r) => {
  if (r.sync.length) {
    const el = document.getElementById("syncResumo");
    el.textContent = `${r.sync.length} correspondência(s)`;
    el.className = "alerta";
    lista("syncList", r.sync, (s) =>
      `${s.cookie} (${s.origem}) → ${s.destino} via ?${s.param}= [${s.trecho}]`);
  }

  const saltos = r.bounce.saltos3p;
  if (saltos.length) {
    const el = document.getElementById("bounceResumo");
    el.textContent = `${saltos.length} salto(s) por domínio de 3ª parte`;
    el.className = "alerta";
    lista("bounceList", saltos, (s) => `${s.intermediario} → ${s.destino} [${s.via}]`);
  } else if (r.redirects3p.length) {
    document.getElementById("bounceResumo").textContent =
      `sem bounce no documento principal; ${r.redirects3p.length} redirect(s) cross-site em sub-recursos`;
    lista("bounceList", r.redirects3p.slice(0, 20), (s) => `${s.from} → ${s.to}`);
  }

  if (r.paramsURL.length) {
    const el = document.getElementById("paramsResumo");
    el.textContent = r.paramsURL.map((p) => p.param).join(", ");
    el.className = "alerta";
  }
});

browser.runtime.sendMessage({ type: "getHijack" }).then((r) => {
  const itens = [];
  r.websockets.forEach((h) => itens.push(`WebSocket para 3ª parte: ${h}`));
  r.polling.forEach((p) => itens.push(`polling: ${p.host} — ${p.n} req em ${p.segundos}s`));
  r.hooks.forEach((h) => itens.push(`${h.tipo}: ${h.detalhe}`));

  if (itens.length) {
    const el = document.getElementById("hijackResumo");
    el.textContent = `${itens.length} indício(s)`;
    el.className = "alerta";
    lista("hijackList", itens, (i) => i);
  }
});