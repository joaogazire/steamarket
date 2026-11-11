// Build com esbuild. Content script e background precisam ser bundles clássicos (IIFE),
// sem import/export no topo, porque o Firefox não aceita módulos em content scripts.
import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("manifest.json", "dist/manifest.json");

const base = {
  bundle: true,
  format: "iife",
  target: "firefox115",
  sourcemap: false,
  logLevel: "info",
  loader: { ".css": "text" },
};

const entradas = [
  { entryPoints: ["src/background/index.ts"], outfile: "dist/background.js" },
  { entryPoints: ["src/content/index.ts"], outfile: "dist/content.js" },
];

for (const e of entradas) {
  const opts = { ...base, ...e };
  if (watch) await (await context(opts)).watch();
  else await build(opts);
}
