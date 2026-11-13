// Build com esbuild. Content script e background precisam ser bundles clássicos (IIFE),
// sem import/export no topo, porque o Firefox não aceita módulos em content scripts.
import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("manifest.json", "dist/manifest.json");
cpSync("icons", "dist/icons", { recursive: true });
cpSync("ajustes.html", "dist/ajustes.html");

const base = {
  bundle: true,
  format: "iife",
  target: "firefox115",
  sourcemap: false,
  logLevel: "info",
  loader: { ".css": "text", ".png": "dataurl" },
  define: { __BUILD__: JSON.stringify(new Date().toTimeString().slice(0, 5)) },
};

const entradas = [
  { entryPoints: ["src/background/index.ts"], outfile: "dist/background.js" },
  { entryPoints: ["src/content/index.ts"], outfile: "dist/content.js" },
  { entryPoints: ["src/ajustes/index.ts"], outfile: "dist/ajustes.js" },
];

for (const e of entradas) {
  const opts = { ...base, ...e };
  if (watch) await (await context(opts)).watch();
  else await build(opts);
}
