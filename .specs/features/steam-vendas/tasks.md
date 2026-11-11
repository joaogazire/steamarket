# Steam Vendas Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/steam-vendas/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from spec and strong defaults - confirm before Execute. Guidelines found: none - strong defaults applied (projeto novo, sem testes ainda). Teste escrito antes do código em cada tarefa (red → green).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| core (puro) | unit | Todos os ramos; 1:1 com os ACs; todo caso de borda | `src/core/*.test.ts` | `npx vitest run src/core` |
| steam/cliente, background | integration | Caminhos felizes + erros (429, sessão, formato) com fixtures e `fake-indexeddb` | `src/**/*.test.ts` | `npx vitest run` |
| content (UI) | unit | Renderização e estados do ACs com jsdom | `src/content/*.test.ts` | `npx vitest run src/content` |
| Config / manifest / scripts de build | none | - (gate de build) | - | `npm run build` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tarefas com só testes unitários | `npx vitest run src/core src/content` |
| Full | Tarefas com testes de integração | `npx vitest run` |
| Build | Fim de fase, config | `npm run build && npx tsc --noEmit && npx vitest run` |

---

## Execution Plan

### Phase 1: Base e fixtures

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Núcleo puro

```
T6 → T7 → T8 → T9 → T10 → T11
```

### Phase 3: Steam, fila e cache

```
T12 → T13 → T14 → T15
```

### Phase 4: Interface

```
T16 → T17 → T18 → T19
```

### Phase 5: Venda em lote e distribuição

```
T20 → T21 → T22
```

---

## Task Breakdown

### T1: Criar package.json

**What**: Projeto TypeScript com scripts `build`, `dev`, `test` e dependências (vite, vitest, typescript, uplot, web-ext, fake-indexeddb, jsdom).
**Where**: `package.json`
**Depends on**: None
**Reuses**: nada
**Requirement**: PKG-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `npm install` termina sem erro
- [x] Gate check passes: `npm run build` (após T2 e T3, aqui só `npm install`)

**Tests**: none
**Gate**: build

**Status**: ✅ Done
---

### T2: Configurar Vite e Vitest

**What**: Build de content script e background para `dist/`, e Vitest com jsdom.
**Where**: `vite.config.ts`
**Depends on**: T1
**Reuses**: nada
**Requirement**: PKG-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `npx vitest run` roda (sem testes ainda, sai com 0 usando `--passWithNoTests`)
- [x] `npm run build` gera `dist/`

**Tests**: none
**Gate**: build

**Status**: ✅ Done
---

### T3: Criar manifest.json

**What**: Manifest MV3 do Firefox com permissão só para `https://steamcommunity.com/*`, content script nas páginas de inventário e background.
**Where**: `manifest.json`
**Depends on**: T2
**Reuses**: nada
**Requirement**: INV-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `npx web-ext lint` sem erros
- [x] Permissões listam apenas `steamcommunity.com`

**Tests**: none
**Gate**: build

**Status**: ✅ Done
---

### T4: Script de captura de fixtures

**What**: Script que, com sessão Steam logada, salva inventário, pricehistory, priceoverview e ordens de 3 itens em `fixtures/`; aborta com "sessão Steam ausente" se não logado.
**Where**: `scripts/capturar.ts`
**Depends on**: T3
**Reuses**: nada
**Requirement**: FIX-01, FIX-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Teste unitário da função `temSessao(cookies)` (com e sem cookie `steamLoginSecure`) passa
- [ ] Gate check passes: `npx vitest run src/core scripts`
- [ ] Test count: 2 tests pass

**Tests**: unit
**Gate**: quick

---

### T5: Rodar a captura e escrever NOTAS.md (manual)

**What**: O usuário roda a captura; registrar limite observado e formato do preço de venda.
**Where**: `fixtures/NOTAS.md`
**Depends on**: T4
**Reuses**: nada
**Requirement**: FIX-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Fixtures de ao menos 3 itens existem
- [ ] `NOTAS.md` traz o limite de requisições e a regra de taxa observados

**Tests**: none
**Gate**: build

---

### T6: Tipos do núcleo

**What**: Interfaces `Ativo`, `Grupo`, `Ponto`, `Analise`, `RegraTaxa`.
**Where**: `src/core/tipos.ts`
**Depends on**: Phase 1 concluída
**Reuses**: nada
**Requirement**: INV-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `npx tsc --noEmit` sem erros

**Tests**: none
**Gate**: build

---

### T7: Cálculo de taxas

**What**: `liquido` e `comprador` em centavos inteiros, validados contra as fixtures.
**Where**: `src/core/taxas.ts`
**Depends on**: T6
**Reuses**: nada
**Requirement**: FEE-01, FEE-02, FEE-03

**Tools**:

- MCP: NONE
- Skill: delegar

**Done when**:

- [ ] Tabela de 1 a 10000 centavos confere com as fixtures
- [ ] `liquido(comprador(x))` não perde centavo no caso-limite documentado
- [ ] Gate check passes: `npx vitest run src/core`
- [ ] Test count: >= 6 tests pass

**Tests**: unit
**Gate**: quick

---

### T8: Agrupamento

**What**: `agrupar` por `market_hash_name`, ignorando não vendáveis.
**Where**: `src/core/agrupar.ts`
**Depends on**: T7
**Reuses**: nada
**Requirement**: INV-01, INV-03

**Tools**:

- MCP: NONE
- Skill: delegar

**Done when**:

- [ ] Contadores corretos em fixture com itens repetidos
- [ ] Item não vendável fica de fora
- [ ] Gate check passes: `npx vitest run src/core`
- [ ] Test count: >= 4 tests pass

**Tests**: unit
**Gate**: quick

---

### T9: Histórico e mediana das ~50 últimas

**What**: `parseHistorico` e `medianaUltimas(pontos, 50)` ponderada pelo volume.
**Where**: `src/core/historico.ts`
**Depends on**: T8
**Reuses**: nada
**Requirement**: SUG-01, SUG-02

**Tools**:

- MCP: NONE
- Skill: delegar

**Done when**:

- [ ] Mediana conferida à mão numa fixture
- [ ] Com menos de 50 unidades usa todas e devolve `amostra` real
- [ ] Gate check passes: `npx vitest run src/core`
- [ ] Test count: >= 5 tests pass

**Tests**: unit
**Gate**: quick

---

### T10: Sugestão por modo

**What**: `sugerir` rápido, equilibrado e paciente, com caso "sem histórico".
**Where**: `src/core/sugestao.ts`
**Depends on**: T9
**Reuses**: `medianaUltimas`
**Requirement**: SUG-03, SUG-04, SUG-05, SUG-06

**Tools**:

- MCP: NONE
- Skill: delegar

**Done when**:

- [ ] Cada modo devolve o valor definido na spec
- [ ] Sem histórico devolve o menor anúncio e `base: "sem histórico"`
- [ ] Gate check passes: `npx vitest run src/core`
- [ ] Test count: >= 5 tests pass

**Tests**: unit
**Gate**: quick

---

### T11: Análise do gráfico

**What**: `analisar` com tendência, volatilidade e spread; `"insuficiente"` com menos de 3 pontos.
**Where**: `src/core/analise.ts`
**Depends on**: T10
**Reuses**: nada
**Requirement**: CHT-02, CHT-03

**Tools**:

- MCP: NONE
- Skill: delegar

**Done when**:

- [ ] Valores conferidos à mão em série pequena
- [ ] Menos de 3 pontos devolve `"insuficiente"`
- [ ] Gate check passes: `npx vitest run src/core`
- [ ] Test count: >= 4 tests pass

**Tests**: unit
**Gate**: quick

---

### T12: Fila com recuo

**What**: Fila de 1 requisição por vez, pausa mínima de 3 s, recuo exponencial em 429 e cancelamento por grupo.
**Where**: `src/background/fila.ts`
**Depends on**: Phase 2 concluída
**Reuses**: nada
**Requirement**: PRC-03, PRC-04, SEL-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Com relógio falso: nunca 2 tarefas ao mesmo tempo
- [ ] 429 repetido dobra a espera até 60 s
- [ ] Gate check passes: `npx vitest run`
- [ ] Test count: >= 5 tests pass

**Tests**: integration
**Gate**: full

---

### T13: Cache com validade

**What**: `obter`/`guardar` em IndexedDB com TTL (histórico 1 h, preço 5 min).
**Where**: `src/background/cache.ts`
**Depends on**: T12
**Reuses**: nada
**Requirement**: PRC-02

**Tools**:

- MCP: NONE
- Skill: delegar

**Done when**:

- [ ] Entrada válida é devolvida sem nova busca; expirada, não
- [ ] Gate check passes: `npx vitest run`
- [ ] Test count: >= 3 tests pass

**Tests**: integration
**Gate**: full

---

### T14: Cliente Steam

**What**: Wrappers de inventário (paginado), histórico, visão geral, ordens e venda, com validação de formato.
**Where**: `src/steam/cliente.ts`
**Depends on**: T13
**Reuses**: fixtures da T5
**Requirement**: INV-02, INV-04, PRC-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Inventário com várias páginas é concatenado
- [ ] Resposta fora do formato lança erro tipado
- [ ] Falha de rede devolve erro que a UI mostra com "tentar de novo"
- [ ] Gate check passes: `npx vitest run`
- [ ] Test count: >= 6 tests pass

**Tests**: integration
**Gate**: full

---

### T15: Roteador do background

**What**: Recebe mensagens do painel, passa pela fila e pelo cache e responde.
**Where**: `src/background/index.ts`
**Depends on**: T14
**Reuses**: `fila`, `cache`, `cliente`
**Requirement**: PRC-01, PRC-02, PRC-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Duas mensagens iguais seguidas geram 1 requisição (cache)
- [ ] Sessão expirada vira mensagem "entre na Steam"
- [ ] Gate check passes: `npx vitest run`
- [ ] Test count: >= 4 tests pass

**Tests**: integration
**Gate**: full

---

### T16: Painel e montagem

**What**: Monta o painel só no próprio inventário e cancela pendências ao trocar de jogo.
**Where**: `src/content/painel.ts`
**Depends on**: Phase 3 concluída
**Reuses**: nada
**Requirement**: INV-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Em inventário alheio não aparecem controles de venda
- [ ] Troca de jogo cancela requisições do anterior
- [ ] Gate check passes: `npx vitest run src/core src/content`
- [ ] Test count: >= 3 tests pass

**Tests**: unit
**Gate**: quick

---

### T17: Lista de grupos

**What**: Lista de grupos com contador, estado vazio e erro com "tentar de novo".
**Where**: `src/content/lista-grupos.ts`
**Depends on**: T16
**Reuses**: `agrupar`
**Requirement**: INV-01, INV-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Grupos e contadores renderizados da fixture
- [ ] Sem itens mostra "nenhum item vendável"
- [ ] Gate check passes: `npx vitest run src/core src/content`
- [ ] Test count: >= 4 tests pass

**Tests**: unit
**Gate**: quick

---

### T18: Detalhe de preço e sugestão

**What**: Ao expandir, mostra última venda, menor anúncio, maior ordem, 3 sugestões e líquido.
**Where**: `src/content/detalhe-preco.ts`
**Depends on**: T17
**Reuses**: `sugerir`, `liquido`
**Requirement**: PRC-01, SUG-03, FEE-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Os 3 preços e as 3 sugestões aparecem
- [ ] Preço abaixo do mínimo da Steam bloqueia o botão
- [ ] Gate check passes: `npx vitest run src/core src/content`
- [ ] Test count: >= 4 tests pass

**Tests**: unit
**Gate**: quick

---

### T19: Gráfico

**What**: Gráfico uPlot de preço e volume com seletor 7/30/90 dias e métricas.
**Where**: `src/content/grafico.ts`
**Depends on**: T18
**Reuses**: `analisar`
**Requirement**: CHT-01, CHT-02, CHT-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Trocar a janela redesenha com o recorte certo
- [ ] Poucos pontos mostram "dados insuficientes"
- [ ] Gate check passes: `npx vitest run src/core src/content`
- [ ] Test count: >= 3 tests pass

**Tests**: unit
**Gate**: quick

---

### T20: Orquestração do lote

**What**: Vende N ativos um a um, pula recusados com motivo, aceita cancelar e reporta progresso.
**Where**: `src/background/venda-lote.ts`
**Depends on**: Phase 4 concluída
**Reuses**: `fila`, `cliente.vender`
**Requirement**: SEL-01, SEL-02, SEL-03, SEL-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Pausa mínima de 3 s entre vendas (relógio falso)
- [ ] Recusa no item 2 de 3 não impede o 3
- [ ] Cancelar interrompe antes do próximo envio
- [ ] Gate check passes: `npx vitest run`
- [ ] Test count: >= 5 tests pass

**Tests**: integration
**Gate**: full

---

### T21: Interface do lote

**What**: Escolha de quantidade e preço, confirmação explícita, progresso "k de N", resumo final com lembrete do celular.
**Where**: `src/content/lote.ts`
**Depends on**: T20
**Reuses**: `iniciarLote`
**Requirement**: SEL-05, SEL-06, SEL-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Nada é enviado antes do clique de confirmação
- [ ] Resumo mostra vendidos, recusados e o lembrete
- [ ] Gate check passes: `npx vitest run src/core src/content`
- [ ] Test count: >= 4 tests pass

**Tests**: unit
**Gate**: quick

---

### T22: Script de assinatura

**What**: Script `npm run assinar` com `web-ext sign` como não listada.
**Where**: `package.json` (modify)
**Depends on**: T21
**Reuses**: nada
**Requirement**: PKG-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `npm run build && npx web-ext lint` sem erros
- [ ] Assinatura real fica para o usuário (precisa das chaves da AMO)

**Tests**: none
**Gate**: build

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

Phase 1:  T1 → T2 → T3 → T4 → T5
Phase 2:  T6 → T7 → T8 → T9 → T10 → T11
Phase 3:  T12 → T13 → T14 → T15
Phase 4:  T16 → T17 → T18 → T19
Phase 5:  T20 → T21 → T22
```
