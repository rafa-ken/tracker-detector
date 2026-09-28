function lista(id, itens, texto) {
  const ul = document.getElementById(id);
  itens.forEach((it) => {
    const li = document.createElement("li");
    li.textContent = texto(it);
    ul.appendChild(li);
  });
}

function pedir(tipo) {
  return browser.runtime.sendMessage({ type: tipo });
}

document.getElementById("abrirOpcoes").addEventListener("click", (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

Promise.all([
  pedir("getReport"),
  pedir("getCookies"),
  pedir("getStorage"),
  pedir("getCanvas"),
  pedir("getTracking"),
  pedir("getHijack"),
  pedir("getBloqueio"),
]).then(([rep, cook, stor, canv, track, hij, bloq]) => {
  const cookies = (cook && cook.cookies) || [];
  const injetados = (cook && cook.injetados) || [];

  // ---- Cabeçalho e terceiros ----
  document.getElementById("site").textContent = rep.host || "sem dados (recarregue a página)";
  document.getElementById("count").textContent = rep.thirdParties.length;
  lista("list", rep.thirdParties, (h) => h);

  // ---- Bloqueio ----
  if (bloq.total) {
    const el = document.getElementById("bloqResumo");
    el.textContent = `${bloq.total} requisição(ões) bloqueada(s) em ${bloq.itens.length} domínio(s)`;
    el.className = "alerta";
    lista("bloqList", bloq.itens, (b) => `${b.host} — ${b.n}× (regra: ${b.regra})`);
  }

  // ---- Cookies ----
  const inj1 = injetados.filter((c) => c.party === "1ª parte").length;
  document.getElementById("injCount").textContent =
    `${injetados.length} (1ª parte: ${inj1}, 3ª parte: ${injetados.length - inj1})`;
  lista("injList", injetados, (c) => `${c.name} — ${c.domain} (${c.party}, ${c.tipo})`);

  const primeira = cookies.filter((c) => c.party === "1ª parte").length;
  document.getElementById("cookieCount").textContent =
    `${cookies.length} (1ª parte: ${primeira}, 3ª parte: ${cookies.length - primeira})`;
  lista("cookieList", cookies, (c) =>
    `${c.name} — ${c.domain} (${c.party}, ${c.tipo}${c.particionado ? ", particionado" : ""})`);

  // ---- Storage ----
  document.getElementById("ls").textContent = stor.localStorage;
  document.getElementById("ss").textContent = stor.sessionStorage;
  document.getElementById("idb").textContent = stor.indexedDB;

  // ---- Canvas ----
  if (canv.metodos.length) {
    const el = document.getElementById("canvas");
    el.textContent = "SUSPEITA — métodos usados: " + canv.metodos.join(", ");
    el.className = "alerta";
  }

  // ---- Cookie sync ----
  if (track.sync.length) {
    const el = document.getElementById("syncResumo");
    el.textContent = `${track.sync.length} correspondência(s)`;
    el.className = "alerta";
    lista("syncList", track.sync, (s) =>
      `${s.cookie} (${s.origem}) → ${s.destino} via ?${s.param}= [${s.trecho}]`);
  }

  // ---- Bounce ----
  const saltos = track.bounce.saltos3p;
  if (saltos.length) {
    const el = document.getElementById("bounceResumo");
    el.textContent = `${saltos.length} salto(s) por domínio de 3ª parte`;
    el.className = "alerta";
    lista("bounceList", saltos, (s) => `${s.intermediario} → ${s.destino} [${s.via}]`);
  } else if (track.redirects3p.length) {
    document.getElementById("bounceResumo").textContent =
      `sem bounce no documento principal; ${track.redirects3p.length} redirect(s) cross-site em sub-recursos`;
    lista("bounceList", track.redirects3p.slice(0, 20), (s) => `${s.from} → ${s.to}`);
  }

  // ---- Parâmetros de rastreio ----
  if (track.paramsURL.length) {
    const el = document.getElementById("paramsResumo");
    el.textContent = track.paramsURL.map((p) => p.param).join(", ");
    el.className = "alerta";
  }

  // ---- Hijacking ----
  const indicios = [];
  hij.websockets.forEach((h) => indicios.push(`WebSocket para 3ª parte: ${h}`));
  hij.polling.forEach((p) => indicios.push(`polling: ${p.host} — ${p.n} req em ${p.segundos}s`));
  hij.hooks.forEach((h) => indicios.push(`${h.tipo}: ${h.detalhe}`));

  if (indicios.length) {
    const el = document.getElementById("hijackResumo");
    el.textContent = `${indicios.length} indício(s)`;
    el.className = "alerta";
    lista("hijackList", indicios, (i) => i);
  }

  // ---- Score ----
  const r = calcularScore({
    thirdParties: rep.thirdParties,
    cookies,
    injetados,
    canvas: canv.metodos,
    sync: track.sync,
    bounce: saltos,
    hijack: indicios,
    storage: stor.localStorage + stor.sessionStorage + stor.indexedDB,
    paramsURL: track.paramsURL,
  });

  const elScore = document.getElementById("score");
  elScore.textContent = r.score;
  elScore.className = "nota-" + r.nota;
  document.getElementById("nota").textContent = `(${r.nota})`;

  lista("penalidades", r.penalidades, (p) =>
    `${p.nome}: ${p.qtd} → −${p.pontos}${p.limitado ? " (teto)" : ""}`);
}); 