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
  document.getElementById("cookieCount").textContent = cookies.length;
  const ul = document.getElementById("cookieList");
  cookies.forEach((c) => {
    const li = document.createElement("li");
    li.textContent = `${c.name} — ${c.domain} (${c.party}, ${c.tipo})`;
    ul.appendChild(li);
  });
}).catch((e) => {
  document.getElementById("cookieCount").textContent = "ERRO: " + e.message;
});