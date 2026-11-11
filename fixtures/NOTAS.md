# Notas da Fase 0

Estado: **parcial**. T5 espera a captura com a sua sessão (veja "Como capturar").

## Verificado (10/11/2026, requisições públicas, sem login)

- `priceoverview` responde sem login. Resposta real em `real/priceoverview-chroma2.json`:
  `{"success":true,"lowest_price":"R$ 25,77","volume":"1,989","median_price":"R$ 25,77"}`.
  Preços vêm como texto formatado na moeda pedida, não em centavos.
- `market/search/render?norender=1` devolve JSON com `sell_price` em centavos (USD na consulta sem moeda).
- A página `market/listings/...` ficou atrás de 429 numa requisição sem login, então `item_nameid` **não foi obtido** por aqui.
  A página nova é renderizada por React; o regex `Market_LoadOrderSpread( N )` pode não existir mais. Conferir na captura.
- Taxas: a fonte é o JS público da Steam, copiado em `referencia/economy_common.taxas.js`.
  - `CalculateFee(base, pct)` = `ToValidMarketPrice(floor(base * pct))`, com mínimo `wallet_market_minimum` (padrão 1 centavo).
  - Comprador paga `base + taxa do jogo + taxa da Steam`. Padrões: jogo 10% (`wallet_publisher_fee_percent_default`), Steam 5% (`wallet_fee_percent`).
  - O inverso (`GetItemPriceFromTotal`) estima `floor(total / (1 + ppct + spct))` e corrige no máximo 3 passos de `wallet_currency_increment`.
  - O percentual do jogo pode variar por item/jogo (`publisherFeePct` na listagem). **A confirmar na captura.**

## Não verificado (exige sessão logada)

- Formato de `inventory/{steamid}/{appid}/{ctx}` e paginação (`more_items`, `last_assetid`).
- Formato de `pricehistory` (esperado: `prices: [["Mar 02 2023 01: +0", 12.3, "45"], ...]`, por hora nos últimos 30 dias).
- Limite real de requisições (esperado: cerca de 20 por minuto).
- `itemordershistogram` e como obter `item_nameid`.
- `sellitem`: o `Referer` e o `sessionid` exigidos. A Steam pode recusar o POST vindo do background sem o Referer da página do inventário. Se recusar, o envio passa para o content script (ver design).
- Leitura do `g_rgWalletInfo` (moeda, taxas) na página do inventário.

## Como capturar

```
read -rs STEAM_COOKIE      # cole: sessionid=...; steamLoginSecure=...   (não aparece na tela nem no histórico)
export STEAM_COOKIE
node scripts/capturar.ts <steamid64> <appid> <contextid>
unset STEAM_COOKIE
```

Copie os cookies do Firefox (Ferramentas do desenvolvedor, Armazenamento). Eles ficam só no ambiente do comando.
As respostas vão para `fixtures/privado/` (fora do git, permissão 600) e o ritmo observado fica em `captura.log`.
Para versionar algo em `fixtures/real/`, troque antes o steamid e os assetids por valores fictícios.
