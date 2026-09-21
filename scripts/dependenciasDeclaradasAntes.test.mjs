// UNA DEPENDENCIA DE HOOK NO PUEDE NOMBRARSE ANTES DE SU DECLARACIÓN.
//
//   node --import ./scripts/alias-loader.mjs --test scripts/dependenciasDeclaradasAntes.test.mjs
//
// ── EL DEFECTO, QUE YA PASÓ DOS VECES ─────────────────────────────────────
//
// El arreglo de dependencias de un hook SE EVALÚA EN CADA RENDER, así que si
// nombra una `const` declarada más abajo, esa `const` todavía no existe:
// JavaScript tira `ReferenceError: Cannot access 'x' before initialization` y
// la pantalla entera muestra "Application error: a client-side exception has
// occurred". No es un error de compilación.
//
//   · 2026-09-20, `app/modulos/compras-proveedor/[id]/page.jsx`:
//     `recargarConciliacion` estaba declarada 19 líneas DESPUÉS del `useEffect`
//     que la nombraba. La pantalla del pedido reventaba al abrirse.
//   · 2026-09-21, `app/modulos/compras-proveedor/recepcion/page.jsx`:
//     `eligiendoProveedor`, declarada después del `useAccionDePagina` que la
//     lleva en sus dependencias. Recibir mercadería reventaba al abrirse, EN
//     PRODUCCIÓN, con el build limpio y 6.653 candados en verde.
//
// Las dos veces el build compiló, la suite quedó en verde y el defecto lo
// encontró abrir la pantalla. Este candado lo mira en el fuente, que es lo
// único que cuesta cero y corre siempre.
//
// ── QUÉ MIRA, Y QUÉ NO ────────────────────────────────────────────────────
//
// Mira la posición: para cada hook con arreglo de dependencias, cada nombre del
// arreglo que ESTÉ DECLARADO en el mismo archivo con `const` tiene que estar
// declarado ANTES. No intenta entender alcances —una `const` adentro de otra
// función no se declara en el cuerpo del componente— y por eso solo se queda
// con las declaraciones de dos espacios de indentación, que son las del cuerpo.
//
// No reemplaza a abrir la pantalla: un hook puede nombrar algo declarado antes
// y romperse por otra cosa. Lo que cierra es esta forma, que ya volvió dos
// veces.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Lo trackeado Y lo que todavía no se commiteó: si no, un archivo nuevo no se mira. */
function archivosDePantalla() {
  const salida = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "app/**/*.jsx", "components/**/*.jsx"],
    { cwd: RAIZ, encoding: "utf8" }
  );
  return salida.split("\n").filter(Boolean);
}

const HOOKS = "useEffect|useMemo|useCallback|useLayoutEffect|useAccionDePagina|useTituloDePagina";

/** Saca comentarios: un nombre citado en prosa no es una dependencia. */
const sinComentarios = (txt) =>
  txt.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/**
 * Los nombres que un hook lleva en su arreglo de dependencias, con la posición
 * del hook. Se busca el `, [ ... ])` del cierre, que es donde vive el arreglo.
 */
function dependenciasDeLosHooks(codigo) {
  const out = [];
  const re = new RegExp(`\\b(${HOOKS})\\s*\\(`, "g");
  let m;
  while ((m = re.exec(codigo))) {
    const desde = m.index;
    // El cierre del hook: se busca el primer `]);` o `], [` a partir de acá.
    const cierre = codigo.indexOf(");", desde);
    if (cierre === -1) continue;
    const cuerpo = codigo.slice(desde, cierre);
    const arreglo = cuerpo.lastIndexOf("[");
    if (arreglo === -1) continue;
    const deps = cuerpo.slice(arreglo + 1, cuerpo.lastIndexOf("]"));
    if (deps.length > 400) continue; // no era el arreglo de dependencias
    const nombres = [...deps.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)]
      .map((x) => x[1])
      .filter((n) => !/^(true|false|null|undefined)$/.test(n));
    if (nombres.length) out.push({ hook: m[1], posicion: desde, nombres });
  }
  return out;
}

/** Dónde se declara cada `const` del CUERPO del componente (indentación de 2). */
function declaracionesDelCuerpo(codigo) {
  const mapa = new Map();
  const re = /^ {2}const\s+(?:\[([^\]]+)\]|([A-Za-z_$][\w$]*))\s*=/gm;
  let m;
  while ((m = re.exec(codigo))) {
    const nombres = m[1]
      ? m[1].split(",").map((x) => x.trim().split(/[:\s]/)[0]).filter(Boolean)
      : [m[2]];
    for (const n of nombres) if (!mapa.has(n)) mapa.set(n, m.index);
  }
  return mapa;
}

test("NINGÚN HOOK DEPENDE DE ALGO DECLARADO MÁS ABAJO", () => {
  const problemas = [];
  for (const rel of archivosDePantalla()) {
    const codigo = sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));
    const declarada = declaracionesDelCuerpo(codigo);
    for (const h of dependenciasDeLosHooks(codigo)) {
      for (const n of h.nombres) {
        const donde = declarada.get(n);
        if (donde !== undefined && donde > h.posicion) {
          problemas.push(`${rel}: ${h.hook} depende de "${n}", declarada después`);
        }
      }
    }
  }
  assert.deepEqual(problemas, [], problemas.join("\n"));
});

test("CONTRAPRUEBA: el detector encuentra el caso real que rompió producción", () => {
  // El código exacto que tiró "Cannot access 'k' before initialization" el
  // 2026-09-21. Sin esta contraprueba, el candado de arriba podría estar verde
  // por no encontrar nada en vez de por no haber nada.
  const roto = [
    "export default function Pantalla() {",
    "  useAccionDePagina(",
    "    () => (eligiendo ? <A /> : <B />),",
    "    [eligiendo]",
    "  );",
    "  const [eligiendo, setEligiendo] = useState(false);",
    "}",
  ].join("\n");
  const declarada = declaracionesDelCuerpo(roto);
  const hooks = dependenciasDeLosHooks(roto);
  assert.equal(hooks.length, 1);
  assert.ok(declarada.get("eligiendo") > hooks[0].posicion, "no detectó el orden invertido");

  // Y el mismo código con la declaración arriba tiene que estar limpio.
  const sano = [
    "export default function Pantalla() {",
    "  const [eligiendo, setEligiendo] = useState(false);",
    "  useAccionDePagina(",
    "    () => (eligiendo ? <A /> : <B />),",
    "    [eligiendo]",
    "  );",
    "}",
  ].join("\n");
  const d2 = declaracionesDelCuerpo(sano);
  const h2 = dependenciasDeLosHooks(sano);
  assert.ok(d2.get("eligiendo") < h2[0].posicion);
});
