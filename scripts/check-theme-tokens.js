#!/usr/bin/env node
/**
 * check-theme-tokens.js
 * Busca tokens de color Tailwind hardcodeados en app/modulos/**.
 * Exit 1 si encuentra matches fuera de whitelist.
 *
 * Uso:  node scripts/check-theme-tokens.js
 *       npm run check:theme
 */

const fs = require("fs");
const path = require("path");

// ── Patrones prohibidos ──────────────────────────────────────
const FORBIDDEN = [
  /\bbg-slate-/,
  /\btext-slate-/,
  /\bborder-slate-/,
  /\bring-slate-/,
  /\bbg-red-/,
  /\bbg-amber-/,
  /\bbg-cyan-/,
  /\bbg-emerald-/,
  /\bbg-green-/,
  /\bbg-black\//,
  /\btext-red-/,
  /\btext-amber-/,
  /\btext-cyan-/,
  /\btext-emerald-/,
  /\btext-green-/,
  /\btext-orange-/,
  /\bborder-red-/,
  /\bborder-amber-/,
  /\bborder-cyan-/,
  /\bborder-emerald-/,
  /\bhover:bg-slate-/,
  /\bhover:text-slate-/,
  /\bhover:text-cyan-/,
  /\bhover:text-red-/,
  /\bhover:text-emerald-/,
  /\bhover:text-amber-/,
  /\bhover:bg-cyan-/,
  /\bhover:bg-amber-/,
  /\bfocus:ring-cyan-/,
  /\bfocus:ring-slate-/,
  /\bplaceholder:text-slate-/,
];

// ── Whitelist: líneas permitidas (regex sobre contenido) ─────
const WHITELIST = [
  /text-slate-900\/80/,   // dark text on bright SunmiHeader
  /text-slate-900\/70/,   // idem
];

// ── Escanear archivos ────────────────────────────────────────
// Además de las pantallas, se revisan los componentes de caja: son piezas de
// pantalla completa (grillas, cifras, pasos) y un color fijo ahí se ve mal en la
// mitad de los temas igual que si estuviera en la página.
const ROOTS = [
  path.resolve(__dirname, "..", "app", "modulos"),
  path.resolve(__dirname, "..", "components", "caja"),
];

function walk(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walk(full));
    } else if (entry.isFile() && /\.(jsx|tsx|js|ts)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

const files = ROOTS.filter((r) => fs.existsSync(r)).flatMap((r) => walk(r));
const violations = [];

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // skip comments
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;

    for (const pattern of FORBIDDEN) {
      if (!pattern.test(line)) continue;

      // check whitelist
      const whitelisted = WHITELIST.some((w) => w.test(line));
      if (whitelisted) continue;

      const rel = path.relative(path.resolve(__dirname, ".."), file).replace(/\\/g, "/");
      violations.push({ file: rel, line: i + 1, text: line.trim(), pattern: pattern.source });
      break; // one violation per line is enough
    }
  }
}

// ── Resultado ────────────────────────────────────────────────
if (violations.length === 0) {
  console.log("✓ check-theme-tokens: 0 tokens hardcodeados encontrados.");
  process.exit(0);
} else {
  console.error(`✗ check-theme-tokens: ${violations.length} token(s) hardcodeado(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}\n`);
  }
  process.exit(1);
}
