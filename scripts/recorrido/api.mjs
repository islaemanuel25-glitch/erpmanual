// LLAMAR A UNA API DEL ERP CON LA SESIÓN REAL, y ver qué contesta.
//
//   node --experimental-loader ./scripts/alias-loader.mjs scripts/recorrido/api.mjs /api/proveedores/listas/proveedores
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

await abrirNavegador();
try {
  await entrar();
  await navegar(`${BASE}/modulos/proveedores/listas`);

  const r = await evaluar(`fetch(${JSON.stringify(ruta)}, {
    credentials: "same-origin",
    cache: "no-store",
    ${cuerpo ? `method: "POST", headers: { "Content-Type": "application/json" }, body: ${JSON.stringify(cuerpo)},` : ""}
  }).then(async (r) => r.status + " " + (await r.text()).slice(0, 6000))`);

  console.log(r);
} finally {
  cerrar();
}
process.exit(0);
