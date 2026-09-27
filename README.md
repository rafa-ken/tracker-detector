# Tracker Detector

Extensão para Firefox que detecta e reporta técnicas de rastreamento e violação
de privacidade no cliente web. Desenvolvida para a Avaliação Intermediária de
Cibersegurança (Insper).

**Autor:** Rafael Ken Reis Miyamoto

## Funcionalidades

| Recurso | Estado |
|---|---|
| Conexões a domínios de terceira parte | implementado |
| Contagem de cookies (1ª/3ª parte, sessão/persistente) | implementado |
| Detecção de cookies particionados (Total Cookie Protection) | implementado |
| Armazenamento HTML5 (localStorage, sessionStorage, IndexedDB) | implementado |
| Canvas fingerprint | implementado |
| Cookie sync / bounce tracking | pendente |
| Indicadores de hijacking / hook | pendente |
| Pontuação de privacidade | pendente |
| Lista de bloqueio personalizada | pendente |

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
clique no ícone **Tracker Detector**. O popup apresenta o relatório da aba
ativa: domínios de terceira parte contactados, cookies classificados,
armazenamento HTML5 e indícios de canvas fingerprint.

## Estrutura

src/
manifest.json Manifesto MV2 e permissões
background.js Coleta de requisições, cookies e roteamento de mensagens
content.js Hooks de canvas e leitura do armazenamento HTML5
popup.html Interface do relatório
popup.js Consulta o background e monta o relatório
docs/ Metodologia de pontuação e relatório
evidencias/ Prints do plugin e arquivos HAR


## Limitações conhecidas

Pontos identificados durante o desenvolvimento, discutidos em detalhe no
relatório:

- **Contagem de cookies.** A extensão consulta o cookie jar por domínio, o que
  inclui cookies remanescentes de navegações anteriores e não apenas os
  injetados no carregamento corrente. A medição precisa exige capturar os
  cabeçalhos `Set-Cookie` durante o load.
- **Total Cookie Protection.** O Firefox particiona cookies de terceiros por
  site de topo. Cookies particionados só são retornados pela API quando a
  consulta informa o `partitionKey`, o que a extensão faz; ainda assim, parte
  dos rastreadores é bloqueada pelo ETP antes de gravar qualquer cookie.
- **Canvas fingerprint.** Os hooks cobrem `HTMLCanvasElement` e
  `CanvasRenderingContext2D` no contexto da página. Fingerprinting executado em
  `OffscreenCanvas` ou em Web Workers não é interceptado.

## Referências

- [MDN — WebExtensions](https://developer.mozilla.org/pt-BR/docs/Mozilla/Add-ons/WebExtensions)
- [DuckDuckGo Privacy Test Pages](https://privacy-test-pages.site/)
- [Blacklight — The Markup](https://themarkup.org/blacklight)
- [uBlock Origin](https://github.com/gorhill/uBlock)