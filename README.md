# Tracker Detector

Extensão para Firefox que detecta, reporta e bloqueia técnicas de rastreamento e
violação de privacidade no cliente web. Desenvolvida para a Avaliação
Intermediária de Cibersegurança (Insper).

**Autor:** Rafael Ken Reis Miyamoto

## Funcionalidades

| Recurso | Estado |
|---|---|
| Conexões a domínios de terceira parte | implementado |
| Cookies injetados no carregamento, via cabeçalhos `Set-Cookie` | implementado |
| Classificação de cookies (1ª/3ª parte, sessão/persistente) | implementado |
| Detecção de cookies particionados (Total Cookie Protection) | implementado |
| Armazenamento HTML5 (localStorage, sessionStorage, IndexedDB) | implementado |
| Canvas fingerprint | implementado |
| Cookie sync | implementado |
| Bounce tracking (redirect HTTP e navegação por JavaScript) | implementado |
| Parâmetros de rastreio na URL (`utm_*`, `gclid`, `fbclid`…) | implementado |
| Indicadores de hijacking / hook | implementado |
| Pontuação de privacidade | implementado |
| Bloqueio de requisições com lista personalizada | implementado |

## Instalação (carregamento temporário no Firefox)

A extensão não está publicada na AMO, então é carregada como add-on temporário:

1. Clone o repositório:

       git clone https://github.com/rafa-ken/tracker-detector.git

2. Abra o Firefox e acesse `about:debugging#/runtime/this-firefox`
3. Clique em **Carregar extensão temporária…**
4. Selecione o arquivo `src/manifest.json` dentro da pasta clonada
5. A extensão aparece em "Extensões temporárias" e o ícone fica disponível na
   barra de ferramentas

Observações:

- Extensões temporárias são removidas quando o Firefox é fechado; repita os
  passos acima a cada sessão.
- Após qualquer alteração no código, use o botão **Recarregar** no
  `about:debugging` e recarregue a página analisada (F5), pois a coleta começa
  na requisição do documento principal.
- Se o popup exibir "sem dados", a página foi carregada antes da extensão.
  Basta recarregá-la.

## Uso

Com a extensão carregada, navegue até a página a ser analisada, recarregue-a e
clique no ícone **Tracker Detector**. O popup apresenta, para a aba ativa:

- **Pontuação de privacidade** de 0 a 100, com a decomposição das penalidades
- Domínios de terceira parte contactados
- Requisições bloqueadas e a regra que causou cada bloqueio
- Cookies injetados no carregamento e cookies presentes no cookie jar,
  classificados em 1ª/3ª parte, sessão/persistente e particionado
- Armazenamento HTML5
- Canvas fingerprint, cookie sync, bounce tracking e parâmetros de rastreio
- Indícios de hijacking/hook

### Lista de bloqueio

O link **Editar lista de bloqueio** no popup abre a página de opções, onde é
possível adicionar domínios (um por linha, valendo também para subdomínios) e
ativar ou desativar a lista padrão embutida de rastreadores conhecidos.

O bloqueio se aplica apenas a requisições de terceira parte — recursos do
próprio site nunca são bloqueados.

**Para reproduzir as medições do relatório, a lista padrão deve estar
desativada**, de modo que a extensão opere somente como observadora e os
resultados sejam comparáveis aos do Blacklight.

## Estrutura

    src/
      manifest.json    Manifesto MV2 e permissões
      background.js    webRequest, cookies, sync, bounce, bloqueio e mensagens
      content.js       Hooks de canvas, verificação de globais e storage HTML5
      score.js         Cálculo da pontuação de privacidade
      popup.html/js    Relatório por página
      options.html/js  Lista de bloqueio personalizada
    docs/
      METODOLOGIA.md   Critérios, pesos e justificativas da pontuação
      RELATORIO.md     Entregáveis 2, 3 e 4
      RELATORIO.pdf    Mesma versão, com os prints embutidos
    evidencias/
      ddg/             Prints do plugin nas páginas de teste do DuckDuckGo
      sites/           HAR, prints do plugin e do uBlock nos três sites reais

## Resultados

Pontuação obtida nos três sites analisados, com a lista de bloqueio desativada:

| Site | Score | Domínios de 3ª parte | Cookies de 3ª parte persistentes |
|---|---|---|---|
| `www.gov.br` | 79 (B) | 9 | 0 |
| `www.insper.edu.br` | 11 (F) | 42 | 10 |
| `g1.globo.com` | 15 (F) | 61 | 11 |

A análise completa, incluindo a reconciliação com o Blacklight e o uBlock
Origin, está em `docs/RELATORIO.md`.

## Limitações conhecidas

Discutidas em detalhe no relatório:

- **Sem lista de entidades.** O agrupamento usa apenas o domínio registrável,
  então domínios de um mesmo proprietário contam como terceira parte. Em
  `g1.globo.com`, 78 das requisições classificadas como terceiros são da CDN da
  própria Globo (`glbimg.com`, `g.globo`).
- **Domínio registrável por heurística**, sem lista de sufixos públicos.
- **Armazenamento medido só no quadro principal.** A consulta usa
  `{ frameId: 0 }`; iframes de terceira parte não entram na contagem.
- **Fingerprinting restrito ao canvas.** `navigator`, `screen`, WebGL,
  AudioContext e enumeração de fontes não são instrumentados. Fingerprinting em
  `OffscreenCanvas` ou Web Workers também não é alcançado.
- **Sem detecção de session recording nem keystroke capture**, que o Blacklight
  identifica e que estavam presentes em um dos sites analisados.
- **Cookies definidos por JavaScript.** A métrica de cookies injetados lê os
  cabeçalhos `Set-Cookie`; cookies gravados via `document.cookie` aparecem
  apenas na leitura do cookie jar.
- **Canvas sem distinção de intenção.** Qualquer chamada às APIs de canvas é
  sinalizada, inclusive usos legítimos como gráficos e editores de imagem.
- **Bounce por tempo de permanência.** O limiar de 1500 ms separa bem os casos
  observados, mas um bounce lento ou um clique muito rápido cai do lado errado.
- **Pegada observável.** A extensão altera protótipos no contexto da página e é,
  em princípio, detectável por script que inspecione o `toString()` desses
  métodos — o mesmo risco de extensões descrito na introdução do enunciado.

## Referências

- [MDN — WebExtensions](https://developer.mozilla.org/pt-BR/docs/Mozilla/Add-ons/WebExtensions)
- [DuckDuckGo Privacy Test Pages](https://privacy-test-pages.site/)
- [Blacklight — The Markup](https://themarkup.org/blacklight)
- [uBlock Origin](https://github.com/gorhill/uBlock)
