// Candados del catálogo de compra por ubicación.
//
// Lo que defienden: que los TRES endpoints que arman un pedido decidan qué
// producto es válido con la MISMA regla, y que esa regla sea la ubicación dueña
// del pedido y no el depósito.
//
// ── POR QUÉ SON CANDADOS DE FUENTE Y NO DE COMPORTAMIENTO ─────────────────
//
// El comportamiento lo mide `scripts/sonda-proveedor-local.mjs` contra los
// endpoints reales, con base de datos: es la única forma de ver que un id de
// otra ubicación se rechace de verdad. Estos miran otra cosa que la sonda no
// puede ver: que los tres usen la MISMA fuente de verdad.
//
// Es la falla que el repo ya documentó: dos lugares que deciden lo mismo no se
// rompen el día que se escriben, se rompen el día que uno cambia. Con tres
// endpoints, el que quede atrás ofrece un producto que otro rechaza.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const CREAR = "app/api/compras-proveedor/crear/route.js";
const AGREGAR = "app/api/compras-proveedor/agregar-item/[id]/route.js";
const BUSCADOR = "app/api/compras-proveedor/productos/route.js";

test("C1. LOS TRES USAN EL PREDICADO COMPARTIDO, no una regla propia", () => {
  for (const p of [CREAR, AGREGAR, BUSCADOR]) {
    const fuente = sinComentarios(leer(p));
    assert.match(
      fuente,
      /productoVisibleWhere\(/,
      `${p} decide la visibilidad por su cuenta en vez de usar el predicado compartido`
    );
    assert.match(
      fuente,
      /from "@\/lib\/visibilidad"/,
      `${p} no importa la fuente de verdad de la visibilidad`
    );
  }
});

test("C2. NINGUNO ACOTA EL CATÁLOGO AL DEPÓSITO", () => {
  // Es el bloqueo que esta tanda saca. Las tres formas en que estaba escrito:
  // `localId: depId` al crear, `pl.localId !== pedido.depositoId` al agregar, y
  // `localId: depositoId` en el buscador.
  assert.doesNotMatch(sinComentarios(leer(CREAR)), /localId:\s*depId/);
  assert.doesNotMatch(sinComentarios(leer(AGREGAR)), /pedido\.depositoId/);
  assert.doesNotMatch(sinComentarios(leer(BUSCADOR)), /localId:\s*depositoId/);
});

test("C3. CONTRAPRUEBA de C2: el analizador vería las tres formas si volvieran", () => {
  // Un `doesNotMatch` con la expresión mal escrita pasa en verde sobre nada.
  assert.match("where: { id: { in: ids }, localId: depId, activo: true }", /localId:\s*depId/);
  assert.match("if (!pl || pl.localId !== pedido.depositoId) {", /pedido\.depositoId/);
  assert.match("where: { localId: depositoId, activo: true }", /localId:\s*depositoId/);
  // Y los comentarios no cuentan: los tres archivos NOMBRAN esas formas en prosa
  // para explicar qué cambió, así que sin `sinComentarios` C2 daría rojo sobre
  // código correcto.
  assert.equal(sinComentarios("// decía localId: depId\nconst x=1;").includes("depId"), false);
});

test("C4. AGREGAR-ITEM SIGUE A LA UBICACIÓN DUEÑA, con la función que ya decide eso", () => {
  // No se escribe otra forma de saber de quién es el pedido: `ownerLocalIdDePedido`
  // es la misma que usa `recibir` para decidir dónde entra el stock. Si acá se
  // usara otra cosa, se podría agregar una línea de un catálogo distinto del que
  // después va a recibir.
  const fuente = sinComentarios(leer(AGREGAR));
  assert.match(fuente, /ownerLocalIdDePedido\(pedido\)/);
  assert.match(fuente, /from "@\/lib\/compras\/scope"/);
});

test("C5. EL MOTOR DE RECEPCIÓN NO SE TOCÓ", () => {
  // Esta tanda termina antes de recepción. El candado es sobre las tres cosas
  // que el pedido nombra explícitamente como intocables, para que un cambio
  // colado ahí se vea en rojo en vez de pasar con el resto.
  const recibir = sinComentarios(leer("app/api/compras-proveedor/recibir/[id]/route.js"));
  assert.match(recibir, /ownerLocalIdDePedido\(pedido\)/, "recibir dejó de resolver la ubicación dueña");
  assert.match(recibir, /stockLocal\.upsert/, "recibir dejó de escribir el stock como lo hacía");
  assert.match(recibir, /actualizarCostoRealProducto/, "recibir dejó de propagar el costo maestro");

  const scope = sinComentarios(leer("lib/compras/scope.js"));
  assert.match(
    scope,
    /pedido\.creadoEnLocalId != null \? pedido\.creadoEnLocalId : pedido\.depositoId/,
    "ownerLocalIdDePedido cambió de criterio: esta tanda no lo toca"
  );
});
