# TODO — steamarket

Prioridade baixa (o usuário pausou em 11/11/2026).

## Preço na frente do item + ocultar listados (não funciona no navegador)
- Sintoma: o painel mostra `resposta inesperada da Steam: status 500 em /inventory/<steamid>/730/2`; sem isso, nenhum preço aparece e "Ocultar itens já listados" não faz nada.
- Já feito: fallback do jogo pela aba ativa (hash vem vazio), página do inventário em 2000→500→75 itens ao receber 500, logs `[steamarket]`, build no título do painel.
- Não resolvido: o 500 continua mesmo assim (a página da Steam pede `count=75&preserve_bbcode=1&raw_asset_properties=1` e recebe 200).
- Próximo passo sugerido: copiar exatamente os parâmetros da página (`preserve_bbcode`, `raw_asset_properties`) ou, melhor, ler os itens que a própria página já carregou (`g_ActiveInventory`), sem pedir o inventário de novo. Isso também diria quais itens estão listados.
- Código não commitado: rodar /code-review e /security-review antes de commitar (nada commitado ainda).

- 11/11 20:05 (build 20:05, EM TESTE): o inventário passou a ser lido da própria página (`src/content/inventario-pagina.ts`, `g_ActiveInventory`, listado = `sealed_type == 1`), e os preços em massa vêm do csgotrader (`src/background/precos-massa.ts`, cache de 6 h). Falta confirmar no navegador o log `[steamarket] inventário: N itens; listados: M; da página: true`.
- Fase 3 (build 20:15, EM TESTE): histórico da Steam só para a página visível da grade (`idsVisiveis`), seguindo ao trocar de página; cache do histórico 24 h.

- Venda (build 23:5x, EM TESTE): o clique dava 400 em /market/sellitem/ porque o POST saía do background (origem moz-extension, sem Referer). Agora sai da página via `content.fetch` (`src/content/fetch-pagina.ts`), uma venda por vez com 3 s de folga; recusa mostra o motivo da Steam.
- Painel (build 23:5x): ao lado do logo do jogo, na coluna da caixa de detalhes (`posicionar`), logo + "Listar ao clicar" + "Ocultar itens já listados".

## Outros pendentes
- item_nameid / maior ordem de compra (listing page dá 302/429).
- Testar a venda real (Referer, formato do preço líquido) com 1 item barato.
- T5 (limite de requisições), assinatura AMO (PKG-01), nova rodada do Verifier.

## Achados do /code-review de 12/11 não corrigidos (baixo risco)
- `anuncios` sem cache: cada recarga refaz até 10 pedidos de mylistings; mais de 1000 anúncios ficam sem marca.
- `semnameid`: qualquer erro (até 429) bloqueia as ordens de compra por 10 min.
- Código sem uso: lista-grupos (aoVender/definirSugestao), lote, grafico, detalhe-preco, ordenarPelaGrade, mapa `progressos`, caminho `lote-iniciar` no background.
- "Ocultar itens já listados" só manda os listados para as últimas páginas (pedido do usuário em 11/11); `marcarListados(..., ocultar)` nunca recebe true.
- Venda pela página: sessão expirada na venda aparece como erro de formato/rede, não como "entre na Steam".

