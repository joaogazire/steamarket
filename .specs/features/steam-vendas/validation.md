# steam-vendas Validation

**Date**: 2026-11-10
**Spec**: `.specs/features/steam-vendas/spec.md`
**Diff range**: `8f1913e..HEAD` (HEAD = 9495fc0, 22 commits de implementação)
**Verifier**: independent sub-agent (author ≠ verifier)

**Verdict: FAIL ❌** (2 ACs bloqueados por T5/usuário; 5 lacunas de código/teste; nada aqui rodou contra a Steam real)

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1-T4, T6-T22 | ✅ Done | marcadas Done em tasks.md, commits correspondentes no log |
| T5 | ⏳ Pendente (usuário) | captura com a sessão real e preenchimento de `fixtures/NOTAS.md` (hoje "parcial") |

---

## Spec-Anchored Acceptance Criteria

Números de linha de `src/core/sugestao.test.ts` e `agrupar.test.ts` são do próprio arquivo.

| ID | Spec-defined outcome | `file:line` + assertion | Result |
| -- | -------------------- | ----------------------- | ------ |
| FIX-01 | fixtures reais (inventário, pricehistory, priceoverview, ordens) de ≥3 itens em `fixtures/` | só `fixtures/real/priceoverview-chroma2.json`; o resto é sintético (`fixtures/sinteticas/`); `scripts/capturar.ts` existe mas não foi rodado | ❌ NÃO ATENDIDO, **bloqueado por T5 (usuário)** |
| FIX-02 | `NOTAS.md` com limite de requisições observado e formato do preço de venda | `fixtures/NOTAS.md` seção "Não verificado": limite e `sellitem` listados como não verificados | ❌ NÃO ATENDIDO, **bloqueado por T5 (usuário)** |
| FIX-03 | aborta com "sessão Steam ausente" | `scripts/capturar.test.ts:20` `expect(() => exigirSessao("")).toThrow("sessão Steam ausente")`; `:10` cookie sem steamLoginSecure → false | ✅ PASS |
| INV-01 | agrupa por `market_hash_name` com contador | `src/core/agrupar.test.ts:10` `caixa?.contagem toBe(3)`; `lista-grupos.test.ts:14` `linhas toEqual(["Caixa X ×37","Faca Y ×1"])` | ✅ PASS |
| INV-02 | carrega todas as páginas | `src/steam/cliente.test.ts:35` assetids `["100","200","300"]`, `:38` `f` chamado 2x, `:39` `start_assetid=200`; roteador `roteador.test.ts:127` fila usada | ✅ PASS (fixture sintética) |
| INV-03 | exclui não vendáveis | `agrupar.test.ts:18` `g.map(nome) toEqual(["Caixa X"])`; `cliente.test.ts:37` `marketable toBe(false)` | ✅ PASS |
| INV-04 | erro + botão "tentar de novo" | `lista-grupos.test.ts:26-29` texto do erro, botão clicado → `aoTentar` 1x | ✅ PASS |
| PRC-01 | última venda, menor anúncio, maior ordem | `detalhe-preco.test.ts:21-23` `"Última venda R$ 3.00"`, `"Menor anúncio R$ 3.20"`, `"Maior ordem R$ 2.50"`; `roteador.test.ts:31` retorno completo | ✅ PASS. ⚠️ a ação "expandir grupo dispara a busca" está só em `src/content/index.ts:102`, sem teste |
| PRC-02 | cache válido reutilizado sem requisição | `cache.test.ts:14` `toEqual({x:1})` em 3.599 s; `:21` expirado `toBeUndefined`; `roteador.test.ts:45-47` 1 chamada cada | ✅ PASS |
| PRC-03 | pausa com recuo exponencial e exibe "aguardando limite da Steam" | recuo: `fila.test.ts:62` `esperas toEqual([3000,6000,12000])`, `:73` teto 60 s; aviso: `fila.test.ts:84` `avisos toEqual([3000])`; texto no roteador `roteador.test.ts:78` `mensagem:"aguardando limite da Steam"` | ⚠️ PARCIAL: o texto mostrado na pausa vem de `src/content/index.ts:57` (`painel.avisar(...)`), via porta de `src/background/index.ts:13`; nenhum teste cobre esse caminho |
| PRC-04 | no máximo 1 requisição por vez | `fila.test.ts:35` `maxAtivas toBe(1)` | ✅ PASS |
| SUG-01 | mediana ponderada até 50 unidades | `historico.test.ts:26` `{preco:300, amostra:50}` (peso 40+10); `:29`, `:44` | ✅ PASS |
| SUG-02 | <50 usa todas e mostra "N vendas" | `historico.test.ts:34` `{preco:200, amostra:20}`; `sugestao.test.ts:23` `base "mediana de 7 vendas"` | ✅ PASS |
| SUG-03 | rápido = maior ordem | `sugestao.test.ts:13` `{preco:250, base:"maior ordem de compra"}` | ✅ PASS |
| SUG-04 | equilibrado = mediana | `sugestao.test.ts:16` `{preco:300, ...}` | ✅ PASS |
| SUG-05 | paciente = max(mediana, menor anúncio) | `sugestao.test.ts:19-20` `320` e (anúncio 280) `300` | ✅ PASS |
| SUG-06 | sem histórico: menor anúncio e "sem histórico" | `sugestao.test.ts:27` `{preco:320, base:"sem histórico"}` | ✅ PASS |
| FEE-01 | líquido igual ao da Steam | `taxas.test.ts:42` contra o JS público da Steam (`fixtures/referencia`) de 3 a 11500; `:36` `liquido(115) toBe(100)` | ✅ PASS contra oráculo copiado. ⚠️ "tela de venda da Steam" real nunca conferida (T5) |
| FEE-02 | preço do comprador a partir do líquido | `taxas.test.ts:29` 1..10000 vs `GetTotalWithFees`; `:21` `comprador(100) toBe(115)` | ✅ PASS (mesma ressalva) |
| FEE-03 | envia líquido em centavos inteiros | `cliente.test.ts:98` corpo `price:"1234"`; `:114` não inteiro lança; `taxas.test.ts:50` inteiros | ✅ PASS |
| CHT-01 | gráfico de preço e volume em 7/30/90 | `grafico.test.ts:11-14` 7 pontos, volume `[2,...]`; `:28` e `:30` recorte 7 e 90 | ✅ PASS (30 dias não asserido isoladamente) |
| CHT-02 | tendência, volatilidade, spread | `analise.test.ts:15` `tendenciaPct≈100`; `:20` `volatilidade≈50/150`; `:25` `spread toBe(20)` | ✅ PASS no núcleo. ⚠️ `grafico.test.ts:36-38` só checa que os rótulos existem, não os valores exibidos |
| CHT-03 | <3 pontos → "dados insuficientes" | `analise.test.ts:34` `toBe("insuficiente")`; `grafico.test.ts:44-45` texto e `criar` não chamado | ✅ PASS |
| SEL-01 | uma venda por vez, pausa ≥3 s | `venda-lote.test.ts:27-28` `>=3000`; `:48` `toHaveBeenCalledWith(ativos[0],1234)` | ✅ PASS |
| SEL-02 | progresso "k de N" e cancelar | `lote.test.ts:54` `"2 de 3"`, `:56` `cancelar` 1x; `venda-lote.test.ts:87` `[[1,3],[2,3],[3,3]]`, `:56-57` cancelado | ✅ PASS |
| SEL-03 | recusa registrada, pula, segue | `venda-lote.test.ts:40` `recusados toEqual([{assetid:"2",motivo:"anúncio duplicado"}])`, `:41` 3 chamadas | ✅ PASS |
| SEL-04 | 429 pausa e retoma | `venda-lote.test.ts:68-69` vendidos 1, 3 chamadas; `fila.test.ts:62` | ✅ PASS |
| SEL-05 | só inicia após clique de confirmação | `lote.test.ts:29` `iniciar not.toHaveBeenCalled`; `:37` 1 chamada após clique; `:93` clique sintético não inicia | ✅ PASS |
| SEL-06 | resumo: vendidos, recusados, lembrete do celular | `lote.test.ts:63-67` `"Vendidos 2"`, `"Recusados 1"`, motivo, `"celular"`; `venda-lote.test.ts:144` `precisaConfirmar toBe(2)` | ✅ PASS |
| PKG-01 | `web-ext sign` gera `.xpi` instalável | só o script `assinar` em `package.json` e a seção do `README.md`; sem teste, sem execução (exige `WEB_EXT_API_KEY/SECRET` do usuário) | ❌ sem evidência. **Depende do usuário**; `web-ext lint` passa (0 erros) |

**Edge cases**

- [x] sem itens vendáveis: `lista-grupos.test.ts:20` `"nenhum item vendável"`
- [x] preço abaixo do mínimo bloqueia: `detalhe-preco.test.ts:46` `botao.disabled toBe(true)` com "0,02"; núcleo `taxas.test.ts:68`; `cliente.test.ts:115`. ⚠️ spec não define o mínimo exato (spec-precision gap)
- [x] trocar de jogo cancela pendentes: `painel.test.ts:34` `{tipo:"cancelar",grupoId:"730_2"}`; roteador `:96`
- [x] fora do próprio inventário oculta controles: `painel.test.ts:10-11` `montarPainel(...) toBeNull`

**Status**: ❌ Lacunas presentes. Dos 30 requisitos: 26 PASS (dois com ⚠️ de precisão), 1 PARCIAL (PRC-03), 3 sem evidência (FIX-01, FIX-02 bloqueados por T5; PKG-01 depende do usuário).
Spec-precision gaps (⚠️): FEE-01 "igual ao da tela de venda da Steam" (oráculo é cópia do JS, não a tela); mínimo aceito pela Steam (edge); CHT-02 valores exibidos; "horas mais recentes" em SUG-01 testado com timestamps arbitrários.

---

## Discrimination Sensor

Worktree isolado `/tmp/sv-sensor` (git worktree, `node_modules` por symlink, sem `git stash`), removido ao final.

| # | File:line | Mutação | Killed? |
| - | --------- | ------- | ------- |
| 1 | `src/core/taxas.ts:32` | `Math.floor` → `Math.ceil` na taxa | ✅ Killed (3 falhas) |
| 2 | `src/core/historico.ts:117` | peso = `volume` → peso 1 (mediana sem ponderar) | ✅ Killed (5) |
| 3 | `src/core/sugestao.ts:35` | paciente: `>` → `<` (min em vez de max) | ✅ Killed (1) |
| 4 | `src/background/fila.ts:67` | recuo não dobra | ✅ Killed (2) |
| 5 | `src/background/venda-lote.ts:144` | não checar `cancelado` dentro da tarefa | ✅ Killed (1) |
| 6 | `src/background/venda-lote.ts:145` | não zerar `errosSeguidos` | ✅ Killed (1) |
| 7 | `src/content/lote.ts:61` | remover trava do aviso de 50% (`confirmar.disabled=false`) | ✅ Killed (1) |
| 8 | `src/core/agrupar.ts:7` | não filtrar `marketable` | ✅ Killed (1) |
| 9 | `src/background/fila.ts:42` | pausa mínima 3 s → 0 | ✅ Killed (5) |
| 10 | `src/background/venda-lote.ts:174` | `cancelar()` não chama `fila.cancelar(loteId)` | ❌ **Survived** |
| 11 | `src/core/sugestao.ts:31` | janela 50 → 20 | ✅ Killed (2) |
| 12 | `src/content/lote.ts:68` | remover checagem `isTrusted` | ✅ Killed (1) |
| 13 | `src/core/analise.ts` | spread com sinal invertido | ✅ Killed (1) |

**Sensor depth**: expandido (≥5, ramos de dinheiro e venda)
**Result**: 12/13 mortas, 1 sobrevivente → ❌ FAIL parcial. O mutante 10 sobrevive porque a flag `cancelado` já interrompe o lote; falta teste de que as vendas pendentes do lote saem da fila (`fila.cancelar` é chamado com o `loteId`).
**Isolamento**: `git status --porcelain` do repo real igual ao baseline (limpo antes e depois); `git worktree list` só mostra o repo real.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ amostragem (core, fila, venda-lote) sem abstração desnecessária |
| Surgical changes | ✅ só arquivos das tarefas |
| No scope creep | ⚠️ pequeno: trava de 50% do menor anúncio (`src/content/lote.ts:59`), shadow root fechado e `exigirCliqueReal` vêm de achados de segurança, não estão na spec; são proteções, porém não rastreáveis a um AC. Testes extras de robustez (`taxas`, `historico`, `validarPedidoLote`) mapeiam a achados de segurança, não a ACs |
| Matches patterns | ✅ |
| Spec-anchored outcome check | ⚠️ ver tabela (FEE-01, CHT-02, PRC-03) |
| Per-layer Coverage Expectation | ⚠️ core e fila 1:1; `src/content/index.ts` e `src/background/index.ts` (cola, 0 testes) sem cobertura |
| Documented guidelines | none - strong defaults applied |

---

## Gate Check

- **Gate command**: `npm run build && npx tsc --noEmit && npx vitest run`
- **Result**: build OK, tsc OK, **145 passed, 0 failed, 0 skipped** (17 arquivos)
- `npx web-ext lint --source-dir dist`: 0 erros, 0 avisos, 0 notices
- `dist/content.js` (169,7 kb) e `dist/background.js` (20,7 kb): começam com `"use strict"; (() => {`; `grep` de `^\s*(import|export) ` sem ocorrências, ou seja, IIFE clássico
- Test count antes da feature: 0 (projeto novo); delta +145
- Aviso inofensivo: `environmentMatchGlobs` deprecated no vitest 3 (`vitest.config.ts`)

---

## Fix Plans

Bloqueado por T5 (usuário), não é bug:
- **FIX-01 / FIX-02**: rodar `scripts/capturar.ts` com a sessão, trocar steamid/assetids por fictícios em `fixtures/real/`, preencher limite observado e formato do preço de venda em `fixtures/NOTAS.md`. Depois, rever formatos de inventário, pricehistory, ordens, `item_nameid` e `sellitem` (Referer) contra os parsers.
- **PKG-01**: usuário roda `npm run assinar` com as chaves do AMO e instala o `.xpi`.

Lacunas de código/teste (ranqueadas):
1. **Mutante 10 sobrevivente**, `src/background/venda-lote.ts:174` (SEL-02/SEL-04). Teste: após `lote.cancelar()`, as tarefas do `loteId` ainda na fila são rejeitadas (espiar `fila.cancelar` com `"loteN"`).
2. **PRC-03, texto "aguardando limite da Steam" sem teste de ponta a ponta**, `src/content/index.ts:57` e `src/background/index.ts:13`. Extrair/testar o tratamento da mensagem `{tipo:"pausa"}` ou testar a cola com jsdom.
3. **PRC-01, expandir grupo → busca de preço** sem teste, `src/content/index.ts:102`.
4. **CHT-02, valores exibidos não asserem número**, `src/content/grafico.test.ts:36-38` (só rótulos). Asserir os textos de tendência/volatilidade/spread formatados.
5. **Spec-precision**: FEE-01 (comparação com a tela real) e mínimo de preço (edge): ajustar spec ou confirmar na captura T5.

---

## Requirement Traceability Update

| Requirement | Previous | New |
| ----------- | -------- | --- |
| FIX-03, INV-01..04, PRC-01 (núcleo), PRC-02, PRC-04, SUG-01..06, FEE-01..03, CHT-01, CHT-03, SEL-01..06 | Pending | ✅ Verified (contra fixtures sintéticas) |
| CHT-02, PRC-03 | Pending | ⚠️ Parcial (ver lacunas 2 e 4) |
| FIX-01, FIX-02 | Pending | ❌ Pending: bloqueado por T5 (usuário) |
| PKG-01 | Pending | ❌ Pending: depende do usuário |

---

## Summary

**Overall**: ❌ Not Ready (FAIL)

**Spec-anchored check**: 26/30 ACs com valor casado com a spec (2 com ⚠️), 1 parcial, 3 sem evidência (2 por T5, 1 por assinatura do usuário); 4 spec-precision gaps
**Sensor**: 12/13 mutações mortas (1 sobrevivente)
**Gate**: 145 passed, 0 failed; web-ext lint limpo; dist sem import/export

**Honestidade**: nada rodou contra a Steam real. Fixtures sintéticas foram escritas à mão e a única real é um `priceoverview`. O oráculo de taxas é cópia do JS público, não a tela de venda. Formatos de inventário, pricehistory, itemordershistogram e `sellitem` seguem não validados até a T5.

**Next steps**: usuário executa T5 e PKG-01; implementador cobre as lacunas 1 a 4 e reverifica (iteração 1 de 3).

---

## Addendum do autor (não é do Verificador)

Depois deste relatório, o autor tratou as lacunas de código/teste 1, 2 e 4 (iteração 1 de 3):
- Lacuna 1 (mutante 10): `venda-lote.test.ts` agora espia `fila.cancelar` com o `loteId`.
- Lacuna 2 (PRC-03): tratamento da mensagem de pausa extraído para `src/content/porta.ts`, com testes em `porta.test.ts`.
- Lacuna 4 (CHT-02): `grafico.test.ts` assere tendência `+100.0%`, volatilidade `33.3%` e spread `0.20`.
- Lacuna 3 (PRC-01, expandir grupo dispara a busca) continua aberta: exige teste da cola em `src/content/index.ts`.

O veredito do Verificador continua **FAIL** até: (a) o usuário concluir a T5 (FIX-01, FIX-02) e a assinatura (PKG-01), e (b) uma nova rodada do Verificador. Este addendum não muda o veredito.
