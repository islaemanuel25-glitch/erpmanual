// LLAMAR A UNA API DEL ERP CON LA SESIÓN REAL, y ver qué contesta.
//
//   node --experimental-loader ./scripts/alias-loader.mjs scripts/recorrido/api.mjs <ruta> ['<json>'] [MÉTODO]
//
// Sin cuerpo hace GET; con cuerpo, POST; y el método se puede forzar —PUT, DELETE—
// con el tercer argumento.
//
// ── PARA QUÉ ───────────────────────────────────────────────────────────────
//
// Para separar dos preguntas que la pantalla mezcla: "el endpoint no lo manda" y
// "el endpoint lo manda y la pantalla no lo dibuja". Sin esto, un proveedor que
// falta en un desplegable se atribuye al lugar equivocado — y el CLAUDE.md tiene
// anotado el caso de un candado que miraba donde el problema no ocurría.
//
// Es andamio, no recorrido: no afirma nada, imprime lo que el servidor contestó.

import { navegar, evaluar, abrirNavegador, entrar, cerrar, BASE } from "./arnes.mjs";

const ruta = process.argv[2] ?? "/api/proveedores/listas/proveedores";
const cuerpo = process.argv[3] ?? null;
// El MÉTODO, cuando no es GET ni POST. Va como cuarto argumento y no como un
// script al lado: hay rutas del módulo que son PUT —la configuración de un
// proveedor— y sin esto la única forma de ejercerlas era escribir otro andamio
// que hiciera lo mismo con una letra distinta.
const metodo = (process.argv[4] ?? (cuerpo ? "POST" : "GET")).toUpperCase();

await abrirNavegador();
try {
  await entrar();
  await navegar(`${BASE}/modulos/proveedores/listas`);

  const r = await evaluar(`fetch(${JSON.stringify(ruta)}, {
    credentials: "same-origin",
    cache: "no-store",
    method: ${JSON.stringify(metodo)},
    ${cuerpo ? `headers: { "Content-Type": "application/json" }, body: ${JSON.stringify(cuerpo)},` : ""}
  }).then(async (r) => r.status + " " + (await r.text()).slice(0, 6000))`);

  console.log(r);
} finally {
  cerrar();
}
process.exit(0);
