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