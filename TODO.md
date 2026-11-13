# TODO — steamarket

## Pendentes conhecidos
- Jogos sem preço rápido (fora do CS2): a ordem por preço usa só os preços já carregados quando você ligou a setinha; os refinados depois não reordenam (de propósito, para nada pular).
- Venda só com carteira BRL.
- item_nameid / maior ordem de compra: a página de listagem da Steam às vezes dá 302/429.
- `anuncios` sem cache: cada recarga refaz até 10 pedidos de mylistings; mais de 1000 anúncios ficam sem marca.
- `semnameid`: qualquer erro (até 429) bloqueia as ordens de compra por 10 min.
- Código sem uso a remover: lista-grupos, lote, grafico, detalhe-preco, ordenarPelaGrade, mapa `progressos`, caminho `lote-iniciar` no background.
