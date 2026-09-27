// Metodologia de pontuação: ver docs/METODOLOGIA.md
// Cada critério tem peso unitário e teto próprio, de modo que nenhum
// indicador isolado zere a nota. Partida em 100, piso em 0.

const CRITERIOS = [
  {
    id: "terceiros",
    nome: "Domínios de 3ª parte",
    peso: 1.5,
    teto: 30,
    medir: (d) => d.thirdParties.length,
  },
  {
    id: "cookies3p",
    nome: "Cookies de 3ª parte persistentes injetados no carregamento",
    peso: 1.5,
    teto: 20,
    medir: (d) => d.injetados.filter((c) => c.party === "3ª parte" && c.tipo === "persistente").length,
  },
  {
    id: "canvas",
    nome: "Canvas fingerprint",
    peso: 15,
    teto: 15,
    medir: (d) => (d.canvas.length ? 1 : 0),
  },
  {
    id: "sync",
    nome: "Cookie sync",
    peso: 5,
    teto: 15,
    medir: (d) => d.sync.length,
  },
  {
    id: "bounce",
    nome: "Bounce tracking",
    peso: 10,
    teto: 10,
    medir: (d) => d.bounce.length,
  },
  {
    id: "hijack",
    nome: "Indícios de hijacking/hook",
    peso: 3,
    teto: 15,
    medir: (d) => d.hijack.length,
  },
  {
    id: "storage",
    nome: "Armazenamento HTML5 com 3ª parte presente",
    peso: 0.5,
    teto: 5,
    // Só penaliza se a página também contacta terceiros: armazenamento
    // local por si só é recurso legítimo de aplicação.
    medir: (d) => (d.thirdParties.length ? d.storage : 0),
  },
  {
    id: "paramsURL",
    nome: "Parâmetros de rastreio na URL",
    peso: 2,
    teto: 6,
    medir: (d) => d.paramsURL.length,
  },
];

function calcularScore(d) {
  const penalidades = [];
  let total = 0;

  for (const c of CRITERIOS) {
    const qtd = c.medir(d);
    if (!qtd) continue;
    const bruto = qtd * c.peso;
    const aplicado = Math.min(bruto, c.teto);
    total += aplicado;
    penalidades.push({
      nome: c.nome,
      qtd,
      pontos: Math.round(aplicado * 10) / 10,
      limitado: bruto > c.teto,
    });
  }

  const score = Math.max(0, Math.round(100 - total));
  let nota = "F";
  if (score >= 80) nota = "A";
  else if (score >= 60) nota = "B";
  else if (score >= 40) nota = "C";
  else if (score >= 20) nota = "D";

  return { score, nota, penalidades };
}