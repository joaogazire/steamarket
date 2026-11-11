# Steam Vendas Specification

## Problem Statement

Vender muitos itens do inventário Steam é lento: cada item abre uma janela, o preço sugerido pela Steam ignora o histórico e não há visão agrupada. A extensão Firefox "steam-vendas" adiciona um painel na página do inventário que agrupa itens iguais, mostra preços e histórico, sugere preço e vende em lote.

## Goals

- [ ] Vender N unidades de um grupo com no máximo 3 cliques e um preço confirmado.
- [ ] Mostrar última venda, menor anúncio e maior ordem de compra de cada grupo.
- [ ] Sugerir preço em 3 modos a partir das ~50 últimas unidades vendidas.

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Extras de CS2 (float, adesivos, chaveiros) | Fase posterior; itens únicos ficam fora de grupo e lote na v1 |
| Repricing automático / venda sem clique | Risco de violar regras da Steam |
| Confirmação no celular (Steam Guard) | A extensão não contorna; usuário usa o app |
| Chrome e outros navegadores | Só Firefox |
| Compra de itens | Fora do objetivo |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| Jogos suportados | Qualquer jogo da Steam | Decidido pelo usuário | y |
| Onde fica a UI | Painel na página do inventário | Decidido pelo usuário | y |
| "Últimas 50 vendas" | Somar unidades das horas mais recentes do pricehistory até 50; mediana ponderada pelo volume | A Steam não expõe vendas individuais | y |
| Menos de 50 unidades no histórico | Usar todas as disponíveis e exibir a contagem usada | Pedido do usuário: "quando houver" | y |
| Moeda | A da conta logada (lida da página) | Evita conversão | n |
| Cache | Histórico 1 h, preço atual 5 min, IndexedDB | Reduz 429 | n |
| Ritmo da fila | 1 requisição por vez, pausa mínima 3 s, recuo exponencial em 429 | Limite da Steam perto de 20/min | n |
| Taxas | 5% Steam + 10% do jogo, mínimo 1 centavo cada, arredondamento da Steam validado na Fase 0 | Fórmula exata vem de fixtures reais | n |
| Distribuição | `web-ext sign` não listada | Uso pessoal permanente | n |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Validar endpoints (Fase 0) ⭐ MVP

**User Story**: As a dono da extensão, I want respostas reais da Steam salvas como fixtures so that o núcleo seja testado contra dados verdadeiros.

**Why P1**: Todo o plano depende de endpoints não documentados.

**Acceptance Criteria**:

1. WHEN o script de captura roda logado THEN the system SHALL salvar em `fixtures/` as respostas de inventário, pricehistory, priceoverview e itemordershistogram de ao menos 3 itens.
2. The system SHALL registrar em `fixtures/NOTAS.md` o limite de requisições observado e o formato do preço de venda.
3. IF a sessão não está logada THEN the system SHALL abortar com a mensagem "sessão Steam ausente".

**Independent Test**: Rodar o script e ver os arquivos em `fixtures/`.

---

### P1: Inventário agrupado ⭐ MVP

**User Story**: As a vendedor, I want itens iguais agrupados so that eu veja o inventário em poucas linhas.

**Why P1**: Base de todas as outras histórias.

**Acceptance Criteria**:

1. WHEN o inventário carrega THEN the system SHALL agrupar itens vendáveis por `market_hash_name` e exibir o contador de cada grupo.
2. WHERE o inventário tem mais de uma página THEN the system SHALL carregar todas as páginas antes de exibir os totais.
3. IF um item não é vendável no mercado THEN the system SHALL excluí-lo dos grupos.
4. IF o carregamento do inventário falha THEN the system SHALL exibir o erro e um botão "tentar de novo".

**Independent Test**: Abrir o inventário de um jogo com itens repetidos e conferir contadores.

---

### P1: Preços por grupo ⭐ MVP

**User Story**: As a vendedor, I want ver preços de cada grupo so that eu saiba quanto vale.

**Why P1**: Sem preço não há decisão.

**Acceptance Criteria**:

1. WHEN o usuário expande um grupo THEN the system SHALL buscar e exibir última venda, menor anúncio e maior ordem de compra.
2. WHILE um preço está em cache válido the system SHALL reutilizá-lo sem nova requisição.
3. IF a Steam responde 429 THEN the system SHALL pausar a fila com recuo exponencial e exibir "aguardando limite da Steam".
4. The system SHALL enviar no máximo 1 requisição à Steam por vez.

**Independent Test**: Expandir 3 grupos seguidos e ver 3 preços sem erro 429.

---

### P1: Sugestão de preço ⭐ MVP

**User Story**: As a vendedor, I want um preço sugerido so that eu venda perto do valor de mercado.

**Why P1**: Pedido central do usuário.

**Acceptance Criteria**:

1. WHEN o histórico de um item é carregado THEN the system SHALL calcular a mediana ponderada pelo volume das horas mais recentes até somar 50 unidades.
2. IF o histórico soma menos de 50 unidades THEN the system SHALL usar todas e exibir "N vendas".
3. WHEN o modo é "rápido" THEN the system SHALL sugerir o maior preço de ordem de compra.
4. WHEN o modo é "equilibrado" THEN the system SHALL sugerir a mediana calculada.
5. WHEN o modo é "paciente" THEN the system SHALL sugerir o maior valor entre a mediana e o menor anúncio atual.
6. IF não há histórico THEN the system SHALL sugerir o menor anúncio atual e indicar "sem histórico".

**Independent Test**: Teste unitário com fixture real; mediana conferida à mão.

---

### P1: Cálculo de taxas ⭐ MVP

**User Story**: As a vendedor, I want ver quanto recebo so that eu decida o preço.

**Why P1**: Erro de taxa vira prejuízo.

**Acceptance Criteria**:

1. WHEN o usuário informa o preço pago pelo comprador THEN the system SHALL exibir o valor líquido que o vendedor recebe, igual ao da tela de venda da Steam.
2. WHEN o usuário informa o líquido desejado THEN the system SHALL exibir o preço do comprador.
3. The system SHALL enviar à Steam o valor líquido em centavos inteiros.

**Independent Test**: Tabela de casos (1 a 10000 centavos) comparada com fixtures da Fase 0.

---

### P2: Gráfico e análise

**User Story**: As a vendedor, I want ver gráfico e métricas so that eu escolha o momento de vender.

**Why P2**: Valor analítico, não bloqueia a venda.

**Acceptance Criteria**:

1. WHEN o usuário abre um grupo THEN the system SHALL desenhar preço e volume em 7, 30 ou 90 dias conforme a escolha.
2. WHEN o gráfico é exibido THEN the system SHALL mostrar tendência (variação % entre a mediana do primeiro e do último terço), volatilidade (desvio padrão / mediana) e diferença entre menor anúncio e maior ordem de compra.
3. IF o histórico tem menos de 3 pontos THEN the system SHALL exibir "dados insuficientes" no lugar da análise.

**Independent Test**: Abrir um item com histórico longo e alternar 7/30/90.

---

### P2: Venda em lote

**User Story**: As a vendedor, I want vender várias unidades de um grupo so that eu não repita o processo item a item.

**Why P2**: Maior ganho de tempo, depende das histórias P1.

**Acceptance Criteria**:

1. WHEN o usuário escolhe quantidade e preço e confirma THEN the system SHALL enviar uma venda por vez, com pausa mínima de 3 s entre elas.
2. WHILE a fila roda the system SHALL mostrar progresso "k de N" e permitir cancelar.
3. IF uma venda é recusada THEN the system SHALL registrar o motivo, pular o item e seguir com os demais.
4. IF a Steam responde 429 THEN the system SHALL pausar a fila e retomar com recuo exponencial.
5. The system SHALL iniciar uma venda somente após clique de confirmação do usuário naquele lote.
6. WHEN a fila termina THEN the system SHALL exibir vendidos, recusados e lembrete para confirmar no celular.

**Independent Test**: Vender 3 unidades baratas e ver 3 pendentes de confirmação na Steam.

---

### P3: Instalação permanente

**User Story**: As a dono, I want a extensão assinada so that ela persista no Firefox.

**Why P3**: Conveniência.

**Acceptance Criteria**:

1. WHEN `web-ext sign` roda THEN the system SHALL gerar um `.xpi` instalável.

**Independent Test**: Instalar o `.xpi` e reiniciar o Firefox.

---

## Edge Cases

- IF o jogo não tem itens vendáveis THEN the system SHALL exibir "nenhum item vendável".
- IF o preço informado é menor que o mínimo aceito pela Steam THEN the system SHALL bloquear o envio e explicar.
- WHEN o usuário troca de jogo THEN the system SHALL cancelar requisições pendentes do jogo anterior.
- IF o usuário não está na página do próprio inventário THEN the system SHALL ocultar os controles de venda.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| FIX-01 | P1: Validar endpoints | - | Pending |
| FIX-02 | P1: Validar endpoints | - | Pending |
| FIX-03 | P1: Validar endpoints | - | Pending |
| INV-01 | P1: Inventário agrupado | - | Pending |
| INV-02 | P1: Inventário agrupado | - | Pending |
| INV-03 | P1: Inventário agrupado | - | Pending |
| INV-04 | P1: Inventário agrupado | - | Pending |
| PRC-01 | P1: Preços por grupo | - | Pending |
| PRC-02 | P1: Preços por grupo | - | Pending |
| PRC-03 | P1: Preços por grupo | - | Pending |
| PRC-04 | P1: Preços por grupo | - | Pending |
| SUG-01 | P1: Sugestão de preço | - | Pending |
| SUG-02 | P1: Sugestão de preço | - | Pending |
| SUG-03 | P1: Sugestão de preço | - | Pending |
| SUG-04 | P1: Sugestão de preço | - | Pending |
| SUG-05 | P1: Sugestão de preço | - | Pending |
| SUG-06 | P1: Sugestão de preço | - | Pending |
| FEE-01 | P1: Cálculo de taxas | - | Pending |
| FEE-02 | P1: Cálculo de taxas | - | Pending |
| FEE-03 | P1: Cálculo de taxas | - | Pending |
| CHT-01 | P2: Gráfico e análise | - | Pending |
| CHT-02 | P2: Gráfico e análise | - | Pending |
| CHT-03 | P2: Gráfico e análise | - | Pending |
| SEL-01 | P2: Venda em lote | - | Pending |
| SEL-02 | P2: Venda em lote | - | Pending |
| SEL-03 | P2: Venda em lote | - | Pending |
| SEL-04 | P2: Venda em lote | - | Pending |
| SEL-05 | P2: Venda em lote | - | Pending |
| SEL-06 | P2: Venda em lote | - | Pending |
| PKG-01 | P3: Instalação permanente | - | Pending |

**Coverage:** 30 total, 0 mapped to tasks, 30 unmapped ⚠️

---

## Success Criteria

- [ ] Vender 20 unidades de um item em menos de 3 minutos de interação.
- [ ] Zero erros 429 não tratados em uma sessão de 100 requisições.
- [ ] Líquido calculado igual ao da Steam em 100% dos casos das fixtures.
