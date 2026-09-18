// Candados de las DOS PUERTAS de «elegir un renglón de la lista».
//
// ── QUÉ SE AFIRMA ACÁ, Y POR QUÉ NO SE AFIRMA LEYENDO LA PANTALLA ───────────
//
// La pantalla es una sola y se entra por dos lados. Lo que cambia entre ellos son
// cuatro cosas que tienen que cambiar JUNTAS: el endpoint al que se le habla, a
// dónde se vuelve, qué dice el botón de volver, y si «No está en la lista»
// escribe algo o solo vuelve. Un endpoint de una puerta con la vuelta de la otra
// es un defecto silencioso: la pantalla anda, guarda bien, y deja a la persona en
// una pantalla que no es la de donde vino.
//
// Están en una función pura para poder afirmarlas de a pares sin montar React. Un
// candado que buscara los strings en el JSX no vería si el par es coherente.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/entradaDeElegirFila.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { entradaDeElegirFila, destinoTrasVincular, PUERTA } from "./entradaDeElegirFila.js";
import { GRUPO_NO_CAMBIA } from "./losQueNoCambian.js";

// ===========================================================================
// 1. Desde «No es este producto» (la que ya existía)
// ===========================================================================

test("con ?fila= se le habla a otra-fila y se vuelve a revisar", () => {
  const e = entradaDeElegirFila({ importacionId: 22, fila: "17049" });
  assert.equal(e.puerta, PUERTA.FILA);
  assert.equal(e.filaId, 17049);
  assert.equal(e.productoBaseId, null);
  assert.equal(e.endpoint, "/api/proveedores/listas/22/filas/17049/otra-fila");
  assert.equal(e.volverA, "/modulos/proveedores/listas/22/revisar");
  assert.equal(e.textoVolver, "Revisar");
  // Desde acá hay una fila que desvincular, así que el botón escribe.
  assert.equal(e.sacarDeLaListaEscribe, true);
});

// ===========================================================================
// 2. Desde «No vinieron» (la puerta nueva)
// ===========================================================================

test("con ?producto= se le habla a en-la-lista y se vuelve a No cambian", () => {
  const e = entradaDeElegirFila({ importacionId: 22, producto: "1358" });
  assert.equal(e.puerta, PUERTA.PRODUCTO);
  assert.equal(e.productoBaseId, 1358);
  assert.equal(e.filaId, null);
  assert.equal(e.endpoint, "/api/proveedores/listas/22/productos/1358/en-la-lista");
  assert.equal(e.textoVolver, "No cambian");
});

test("la vuelta cae en el chip donde estaba, no en Todos", () => {
  // Volver a «Todos» obligaría a filtrar de nuevo para seguir con el siguiente,
  // que es justamente el trabajo que «No cambian» ahorra.
  const e = entradaDeElegirFila({
    importacionId: 22, producto: 1358, filtro: GRUPO_NO_CAMBIA.DEJADO,
  });
  assert.equal(e.volverA, "/modulos/proveedores/listas/22/no-cambian?filtro=DEJADO");
});

test("sin filtro se vuelve a «No vinieron», que es de donde se entra", () => {
  const e = entradaDeElegirFila({ importacionId: 22, producto: 1358 });
  assert.equal(e.volverA, "/modulos/proveedores/listas/22/no-cambian?filtro=NO_VINO");
});

test("un filtro que no es de los chips se descarta, no viaja", () => {
  // Un filtro inventado dejaría la vuelta en una pantalla filtrada por algo que
  // no existe: se ve vacía y parece que no hay nada.
  for (const malo of ["../../otra", "TODOS", "", "<script>", "NO_VINO2"]) {
    const e = entradaDeElegirFila({ importacionId: 22, producto: 1358, filtro: malo });
    assert.equal(
      e.volverA,
      "/modulos/proveedores/listas/22/no-cambian?filtro=NO_VINO",
      `el filtro ${JSON.stringify(malo)} no debería viajar`
    );
  }
});

test("desde «No vinieron», «No está en la lista» NO escribe nada", () => {
  // El producto YA está fuera de la lista: por eso apareció en «No vinieron».
  // Confirmar lo que ya es no es una decisión que haya que guardar, y mandar un
  // POST igual le inventaría una a alguien que solo miró y se fue.
  const e = entradaDeElegirFila({ importacionId: 22, producto: 1358 });
  assert.equal(e.sacarDeLaListaEscribe, false);
});

// ===========================================================================
// 3. Las puertas inválidas
// ===========================================================================

test("sin fila y sin producto no hay puerta: la pantalla lo dice y no pide nada", () => {
  assert.equal(entradaDeElegirFila({ importacionId: 22 }), null);
  assert.equal(entradaDeElegirFila({ importacionId: 22, fila: "", producto: "" }), null);
  assert.equal(entradaDeElegirFila({}), null);
  assert.equal(entradaDeElegirFila(), null);
});

test("un id que no es un entero positivo no se adivina", () => {
  // `"1e3"` NO está en la lista a propósito: `Number("1e3")` es 1000, un entero
  // legítimo. Es otra forma de escribir el mismo id, no un id inválido, y el
  // servidor contesta 404 si no existe. Es el mismo criterio de `enteroPositivo`
  // en `retornoPedido.js`, y se sigue en vez de inventar otro.
  for (const malo of ["0", "-1", "abc", "1.5", "  "]) {
    assert.equal(
      entradaDeElegirFila({ importacionId: 22, producto: malo }),
      null,
      `producto ${JSON.stringify(malo)} no debería resolver`
    );
    assert.equal(
      entradaDeElegirFila({ importacionId: malo, producto: 1358 }),
      null,
      `importación ${JSON.stringify(malo)} no debería resolver`
    );
  }
});

test("si vinieran las dos, gana la fila y no se mezclan", () => {
  // No debería pasar. Si pasara hay que elegir UNA: con `fila` hay un renglón
  // viejo que queda libre, así que es el camino que escribe más. Decidirlo por el
  // orden de los parámetros no es una regla.
  const e = entradaDeElegirFila({ importacionId: 22, fila: 17049, producto: 1358 });
  assert.equal(e.puerta, PUERTA.FILA);
  assert.equal(e.endpoint, "/api/proveedores/listas/22/filas/17049/otra-fila");
  assert.equal(e.volverA, "/modulos/proveedores/listas/22/revisar");
});

// ===========================================================================
// 4. A dónde se va después de atar
// ===========================================================================

test("desde «No vinieron» se cae DERECHO en el renglón recién atado", () => {
  // El renglón queda con sus lecturas recalculadas y sin contestar, y es el único
  // que le importa a quien vino hasta acá. Caer en la cola desde el principio lo
  // obligaría a pasar productos hasta encontrarlo.
  const e = entradaDeElegirFila({ importacionId: 22, producto: 1358 });
  assert.equal(
    destinoTrasVincular(e, 17049),
    "/modulos/proveedores/listas/22/revisar?filaId=17049&desde=no-cambian"
  );
});

test("desde «No es este producto» se vuelve a la cola, que es de donde se venía", () => {
  const e = entradaDeElegirFila({ importacionId: 22, fila: 17048 });
  assert.equal(destinoTrasVincular(e, 17049), "/modulos/proveedores/listas/22/revisar");
});

test("si el servidor no dice qué fila quedó, se va a la cola y no a un filaId roto", () => {
  // `?filaId=undefined` abriría la cola pidiendo una fila que no existe. Sin
  // dato, el destino honesto es la cola entera.
  const e = entradaDeElegirFila({ importacionId: 22, producto: 1358 });
  for (const sin of [undefined, null, 0, "abc"]) {
    assert.equal(
      destinoTrasVincular(e, sin),
      "/modulos/proveedores/listas/22/revisar",
      `con filaId ${JSON.stringify(sin)} no se arma un link con basura`
    );
  }
});

// ===========================================================================
// 5. Las cuatro cosas cambian JUNTAS
// ===========================================================================

test("cada puerta tiene su endpoint Y su vuelta: no hay cruces posibles", () => {
  // Es el candado que da sentido a que esto sea un módulo. Afirma el PAR, que es
  // lo que un ternario suelto en la pantalla puede desincronizar.
  const casos = [
    { entrada: { importacionId: 5, fila: 9 }, endpoint: "otra-fila", vuelta: "/revisar" },
    { entrada: { importacionId: 5, producto: 9 }, endpoint: "en-la-lista", vuelta: "/no-cambian" },
  ];
  for (const c of casos) {
    const e = entradaDeElegirFila(c.entrada);
    assert.ok(e.endpoint.endsWith(c.endpoint), `${e.endpoint} tendría que terminar en ${c.endpoint}`);
    assert.ok(e.volverA.includes(c.vuelta), `${e.volverA} tendría que incluir ${c.vuelta}`);
  }
});
