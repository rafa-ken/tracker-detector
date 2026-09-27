browser.runtime.sendMessage({ type: "getReport" }).then((r) => {
  document.getElementById("site").textContent = r.host || "sem dados (recarregue a página)";
  document.getElementById("count").textContent = r.thirdParties.length;
  const ul = document.getElementById("list");
  r.thirdParties.forEach((h) => {
    const li = document.createElement("li");
    li.textContent = h;
    ul.appendChild(li);
  });
});

browser.runtime.sendMessage({ type: "getCookies" }).then((r) => {
  const cookies = (r && r.cookies) || [];
  const primeira = cookies.filter((c) => c.party === "1ª parte").length;
  const terceira = cookies.length - primeira;

  document.getElementById("cookieCount").textContent =
    `${cookies.length} (1ª parte: ${primeira}, 3ª parte: ${terceira})`;

  const ul = document.getElementById("cookieList");
  cookies.forEach((c) => {
    const li = document.createElement("li");
    li.textContent =
      `${c.name} — ${c.domain} (${c.party}, ${c.tipo}${c.particionado ? ", particionado" : ""})`;
    ul.appendChild(li);
  });
}).catch((e) => {
  document.getElementById("cookieCount").textContent = "ERRO: " + e.message;
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
    el.style.color = "#b00";
  }
});