# Metodologia de pontuação de privacidade

Documento de referência para o critério 4 da avaliação. A implementação
correspondente está em `src/score.js`.

## Princípio

A nota parte de **100** e recebe deduções por evidência observada durante o
carregamento da página. O piso é 0. Cada critério tem um **peso unitário** (o
custo de cada ocorrência) e um **teto** (a dedução máxima que aquele critério
pode causar isoladamente).

O teto existe por uma razão metodológica: sem ele, um único indicador de alta
cardinalidade — tipicamente a contagem de domínios de terceira parte — zeraria
a nota sozinho e os demais critérios deixariam de influenciar o resultado. Com
teto, a nota final reflete a **diversidade** de técnicas de rastreamento
empregadas, não apenas o volume de uma delas.

## Critérios e pesos

| Critério | Peso unitário | Teto | Justificativa |
|---|---|---|---|
| Domínios de 3ª parte contactados | 1,5 | 30 | Cada domínio distinto é uma parte que recebe o endereço IP, o `User-Agent` e o `Referer` do usuário. É o indicador de superfície de exposição mais direto, mas também o mais sujeito a inflação por CDN legítima, daí o teto moderado. |
| Cookies de 3ª parte persistentes injetados no carregamento | 1,5 | 20 | Persistência é o que permite reidentificar o usuário entre sessões. Contam-se apenas os cookies efetivamente definidos via `Set-Cookie` nesta navegação, não o conteúdo acumulado do cookie jar. |
| Canvas fingerprint | 15 | 15 | Penalidade única e alta: é técnica de identificação sem consentimento, que não depende de armazenamento e por isso resiste à limpeza de cookies. A presença importa, a quantidade de chamadas não. |
| Cookie sync | 5 | 15 | Cada correspondência indica troca de identificador entre dois domínios distintos, o que amplia o alcance do rastreamento para além da relação usuário-site. |
| Bounce tracking | 10 | 10 | Redirecionamento por domínio intermediário existe para converter contexto de terceira parte em primeira parte e contornar as proteções do navegador. É deliberado por construção. |
| Indícios de hijacking/hook | 3 | 15 | Inclui WebSocket para terceiros, polling persistente, alteração de objetos globais e script de terceiro injetado dinamicamente. Peso unitário baixo porque isoladamente cada indício tem causas legítimas; o acúmulo é que caracteriza o risco. |
| Armazenamento HTML5 com 3ª parte presente | 0,5 | 5 | Armazenamento local é recurso legítimo de aplicação, então só penaliza quando a página também contacta terceiros. Peso baixo e teto baixo, deliberadamente. |
| Parâmetros de rastreio na URL | 2 | 6 | Decoração de link (`gclid`, `fbclid`, `utm_*`) repassa atribuição de campanha entre sites, mas é visível e removível pelo usuário, o que justifica peso menor. |

## Faixas

| Nota | Faixa | Leitura |
|---|---|---|
| A | 80–100 | Rastreamento residual ou ausente |
| B | 60–79 | Rastreamento presente, limitado a analytics e poucos terceiros |
| C | 40–59 | Rastreamento publicitário estabelecido |
| D | 20–39 | Rastreamento extensivo, múltiplas técnicas |
| F | 0–19 | Rastreamento extensivo com identificação persistente e/ou fingerprinting |

## Limitações

1. **Saturação na faixa baixa.** Em sites de mídia com muitos terceiros, vários
   critérios atingem o teto simultaneamente e a nota deixa de distinguir entre
   "ruim" e "muito ruim". Observado em `g1.globo.com` (15) e
   `insper.edu.br` (10): notas próximas apesar de perfis de rastreamento
   bastante diferentes em volume.

2. **Domínios de mesmo proprietário.** O agrupamento usa o domínio registrável
   aproximado, sem lista de sufixos públicos nem lista de entidades. CDNs do
   próprio grupo — `glbimg.com` em relação a `globo.com`, por exemplo — contam
   como terceira parte, o que penaliza indevidamente. Blacklight e uBlock Origin
   usam listas de entidade e não cometem esse erro.

3. **Efeito das proteções do próprio Firefox.** O Enhanced Tracking Protection
   bloqueia parte dos rastreadores antes que definam cookies, e o Total Cookie
   Protection particiona os demais. A nota mede, portanto, o que sobrou depois
   das defesas do navegador, e não a intenção de rastreamento do site. O mesmo
   site avaliado em navegador sem proteções receberia nota inferior.

4. **Janela de observação.** A coleta cobre o intervalo entre a requisição do
   documento principal e o momento da consulta. Recursos carregados por
   interação posterior do usuário não entram na conta.

5. **Cookies definidos por JavaScript.** A contagem de cookies injetados lê os
   cabeçalhos `Set-Cookie`. Cookies gravados via `document.cookie` no cliente
   não são contabilizados nessa métrica, embora apareçam na leitura do cookie
   jar.