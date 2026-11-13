# steamarket

Extensão para Firefox que coloca preço, total e venda rápida na página do **seu próprio** inventário da Steam.

*Firefox extension that adds prices, totals and quick selling to your own Steam inventory page. English and Spanish are available in the settings.*

## O que faz

- Mostra o preço sugerido em cada item da grade e o total do inventário (com quanto você recebe depois das taxas).
- **Listar** em cada item, ou selecione vários e use **Listar N** para vender em lote.
- Ordena por preço, agrupa itens iguais e manda os já listados e os "Not Marketable" para o fim.
- Idiomas: português, inglês e espanhol (clique no logo do painel ou no ícone da extensão).

## Segurança

- Só age quando você clica. Toda venda ainda precisa ser **confirmada por você no app da Steam no celular**.
- Antes de cada venda, confere o menor anúncio na Steam e recusa preços fora do mercado (menos da metade ou mais do dobro).
- Não coleta dados. O único servidor fora da Steam é `prices.csgotrader.app`, de onde baixa uma tabela pública de preços do CS2 (sem cookies, sem enviar nada seu).
- A venda é feita de dentro da página da Steam (`content.fetch`), com a sua sessão, como o botão "Sell" da própria Steam.
- Por enquanto a venda só funciona com carteira em reais (BRL).

## Desenvolvimento / Build (for reviewers)

Requirements: Node.js 22+ and npm. Linux, macOS or Windows.

```
npm ci                    # install exact dependencies
node scripts/build.mjs    # bundles src/ with esbuild into dist/ (same as: npm run build)
```

`dist/` is the add-on as uploaded (manifest, icons, `ajustes.html` and the bundled `background.js`, `content.js`, `ajustes.js`). The bundles are plain esbuild IIFE output of the TypeScript in `src/`, no minification.

Other commands:

```
npm test                              # vitest
npx tsc --noEmit                      # types
npx web-ext lint --source-dir dist    # add-on lint
npx web-ext run --source-dir dist     # try it in a temporary Firefox profile
```

## Licença

MIT. Not affiliated with Valve or Steam.
