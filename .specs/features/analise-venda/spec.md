# Análise de venda ("bons negócios")

Heurística local sobre o histórico de preços que já é baixado (sem pedido novo). **Não é previsão garantida**: marca itens
em que o histórico sugere que vender agora tende a ser melhor que esperar.

## Requisitos (EARS)
- AV-01: QUANDO o histórico de um item tiver ao menos 45 dias com dados e preço atual ≥ R$ 0,25, ENTÃO o sistema DEVE calcular pontos e motivos; senão, nenhuma análise.
- AV-02 (queda): SE a mediana dos últimos 7 dias for ≤ 85% da de 53–67 dias atrás E não maior que a dos últimos 30 dias, +35 pontos (≤ 70%: +55).
- AV-03 (pico): SE o preço atual estiver no top 20% dos últimos 180 dias E ≥ 115% da mediana de 90 dias, +40 (≥ 130%: +55).
- AV-04 (platô): SE subiu ≥ 12% em relação a 60–90 dias atrás e os últimos 14 dias variam ≤ 3%, +35 (+10 se o volume caiu ≥ 20%).
- AV-05 (Major): SE há Major em curso ou começando em até 45 dias E, nos Majors passados cobertos pelo histórico do item (≥ 2),
  a mediana nas 3 semanas do Major foi < 97% da dos 30 dias antes em ≥ 60% deles, +25. Sem evidência própria, sem sinal (o "mito" só conta se o item confirmar).
- AV-06 (contra): após queda, preço já 5–25% acima do menor dos 30 dias (rebote): −30; em alta ≥ 10% sobre 30 dias sem ser pico: −15.
- AV-07: "bom negócio" = pontos ≥ 50. Item bom ganha borda dourada fina e dica com os motivos; um ícone filtra só os bons.
- AV-08: datas dos Majors ficam em `src/core/majors.ts` (editável). Próximo: PGL Singapore 25/11–13/12/2026.

## Preço sugerido (perfil "paciente": espera um tempo médio por preço melhor)
- AV-09: preço = percentil q, ponderado por volume, dos pontos da menor janela de 2 a 14 dias que junta ~150 vendas (30 dias se houver menos de 10 vendas); q = clamp(1 − 2/v, 0.5, 0.7), v = vendas por dia. Liquidez alta → q = 0.7; baixa → mediana. Espera estimada de poucos dias, nunca venda instantânea nem espera irreal.
- AV-10: teto de 1,2× a mediana da janela (picos isolados não puxam o preço) e piso na mediana (um ponto baixo isolado não derruba).
- AV-11: item em queda (AV-02) usa q = 0.5 (vende antes de cair mais).
- AV-12: com menos de 10 vendas em 30 dias, cai para a mediana das últimas 50 vendas (comportamento anterior).

## Taxa da Steam (itens baratos)
Em BRL cada taxa tem piso de R$ 0,06 (wallet_market_minimum = 6): R$ 0,18 rende R$ 0,06 (taxa efetiva 67%); a taxa cai para o piso de ~13% só a partir de ~R$ 1,20.
- AV-13: a dica de todo item com preço mostra "Recebe R$ X (taxa N%)".
- AV-14: item com preço sugerido < R$ 0,50 (BRL) "não compensa vender agora": preço em cinza e dica "taxa alta, melhor esperar subir".
- AV-15: item que não compensa nunca é "bom negócio" (borda dourada).
- AV-16: filtro (ícone) "ocultar itens que não compensam": manda esses itens para o fim da grade (desligado por padrão).
- AV-17: perfil paciente: item barato (mediana < R$ 0,50) mira mais alto (paciente: percentil 90, teto 1,5× a mediana) para fugir do piso de taxa.
- Referência: o ideal seria listar só acima de R$ 1,20 (taxa mínima); o limite de R$ 0,50 é o ponto de partida e fica em `src/core/compensa.ts`.
