// MIRAR UNA PANTALLA: qué dice, qué se puede tocar, qué campos tiene.
//
//   node --experimental-loader ./scripts/alias-loader.mjs scripts/recorrido/mirar.mjs <ruta> [--tocar "A" --tocar "B"] [--ancho 360]
//
// Los `--tocar` se aplican EN ORDEN antes de mirar, para poder inspeccionar lo
// que aparece después de abrir un desplegable o una hoja.
//
// ── PARA QUÉ ───────────────────────────────────────────────────────────────
//
// Para no escribir el recorrido a ciegas. Un paso que busca un botón por un
// texto que no existe informa un defecto que no existe, y el CLAUDE.md tiene ese
// caso anotado dos veces: antes de atribuirle algo a la pantalla hay que
// comprobar que la medición mira donde uno cree.
//
// Es una herramienta de andamio y no forma parte del recorrido: no afirma nada,
// solo imprime.

import {
  navegar,
  evaluar,
  esperar,
  textoDeLaPantalla,
  tocables,
  tocar,
  fijarAncho,
  abrirNavegador,
  entrar,
  cerrar,
  BASE,
} from "./arnes.mjs";

const args = process.argv.slice(2);
const ruta = args.find((a) => a.startsWith("/")) ?? "/modulos/proveedores/listas";
const anchoIdx = args.indexOf("--ancho");
const ancho = anchoIdx >= 0 ? Number(args[anchoIdx + 1]) : 1366;

/** Todos los `--tocar`, en orden. */
const aTocar = args.flatMap((a, i) => (a === "--tocar" && args[i + 1] ? [args[i + 1]] : []));

await abrirNavegador();
try {
  await entrar();
  await fijarAncho(ancho);
  await navegar(`${BASE}${ruta}`);
  await esperar(2500);

  for (const t of aTocar) {
    const ok = await tocar(t, { esperaMs: 1200 });
    console.log(`toqué «${t}» → ${ok ? "OK" : "NO ESTABA"}`);
  }

  console.log("\n════ TEXTO ════");
  console.log((await textoDeLaPantalla()).slice(0, 2500));

  console.log("\n════ TOCABLES ════");
  for (const t of await tocables()) console.log("  ·", t.slice(0, 90));

  console.log("\n════ CAMPOS ════");
  const campos = await evaluar(`(() => [...document.querySelectorAll('input, textarea, select')]
    .filter((n) => n.offsetParent !== null)
    .map((n) => n.tagName + ' type=' + (n.type || '-')
      + ' aria=' + JSON.stringify(n.getAttribute('aria-label') || '')
      + ' ph=' + JSON.stringify(n.getAttribute('placeholder') || '')
      + ' val=' + JSON.stringify(String(n.value ?? '').slice(0, 30))))()`);
  for (const c of campos) console.log("  ·", c);

  console.log("\n════ LA BARRA DE ARRIBA ════");
  const barra = await evaluar(`(() => {
    const salida = [];
    for (const sel of ['header', '[data-shell-titulo]', 'nav', 'main']) {
      const n = document.querySelector(sel);
      salida.push(sel + ' → ' + (n ? JSON.stringify((n.innerText || '').slice(0, 220)) : '(no existe)'));
    }
    // Y lo que hay ANTES del <main>, que es donde vive la fila del título.
    const main = document.querySelector('main');
    if (main) {
      const previos = [];
      let n = main.previousElementSibling;
      while (n) { previos.unshift(n.tagName + '.' + (n.className || '').slice(0, 60) + ' → ' + JSON.stringify((n.innerText || '').slice(0, 120))); n = n.previousElementSibling; }
      salida.push('ANTES DEL MAIN:\\n    ' + previos.join('\\n    '));
    }
    return salida.join('\\n  ');
  })()`);
  console.log("  " + barra);
} finally {
  cerrar();
}
process.exit(0);
