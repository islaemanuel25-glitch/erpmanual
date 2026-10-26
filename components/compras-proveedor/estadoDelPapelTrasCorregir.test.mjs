// DESPUÉS DE CORREGIR O DE «NO VINO», LA LISTA DE COMPROBANTES DICE EL ESTADO NUEVO.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/estadoDelPapelTrasCorregir.test.mjs
//
// Emanuel, 2026-10-26: corregido un producto en la hoja de Corregir, o tocado
// «No vino», la conciliación y el pedido se recargaban y el aviso de la lista
// de comprobantes —"no cierra" / "cierra"— quedaba como estaba hasta recargar
// la página. El panel tiene su propia lista y nadie le avisaba.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Sin comentarios: un candado que busca texto los encuentra (CLAUDE.md, regla 5).
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const PAGINA = "app/modulos/compras-proveedor/[id]/page.jsx";
const PANEL = "components/comprobantes/PanelComprobantes.jsx";

/** El cuerpo de `corregirPapel`, hasta el cierre del useCallback. */
const corregirPapel = (p) => p.slice(p.indexOf("const corregirPapel = useCallback("), p.indexOf("}, [cargar]);", p.indexOf("const corregirPapel = useCallback(")));

test("CORREGIR UN PRODUCTO DEL PAPEL VUELVE A PEDIR LA LISTA DE COMPROBANTES, NO SOLO LA CONCILIACIÓN", () => {
  const p = codigoDe(PAGINA);
  const cuerpo = corregirPapel(p);
  assert.ok(cuerpo.length > 0, "no se encontró corregirPapel");
  // Después de que el servidor contestó bien: si falló, no hay nada nuevo que mostrar.
  const ok = cuerpo.indexOf("if (!d?.ok) return");
  const sube = cuerpo.indexOf("setRecargarPapeles((n) => n + 1)");
  assert.ok(ok >= 0 && sube > ok, "la lista de comprobantes no se vuelve a pedir después de corregir");
  assert.match(cuerpo, /setRecargarConciliacion\(\(n\) => n \+ 1\)/, "la conciliación se sigue recargando");
  // La pantalla le pasa la señal al panel.
  assert.match(p, /<PanelComprobantes[\s\S]*?recargarLista=\{recargarPapeles\}/);
});

test("«NO VINO» PASA POR LA MISMA CORRECCIÓN, ASÍ QUE TAMBIÉN REFRESCA EL ESTADO DEL PAPEL", () => {
  const p = codigoDe(PAGINA);
  const noVino = p.slice(p.indexOf("onNoVino={async"), p.indexOf("onVincular=", p.indexOf("onNoVino={async")));
  assert.match(noVino, /await corregirPapel\(\{/);
});

test("EL PANEL VUELVE A CARGAR SU LISTA CUANDO SUBE LA SEÑAL, Y NO EN LA PRIMERA VUELTA", () => {
  const c = codigoDe(PANEL);
  assert.match(c, /recargarLista = 0,/);
  assert.match(c, /useEffect\(\(\) => \{\s*if \(recargarLista > 0\) recargar\(\);[\s\S]*?\}, \[recargarLista\]\);/);
});
