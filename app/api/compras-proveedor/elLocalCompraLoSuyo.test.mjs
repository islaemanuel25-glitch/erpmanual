// Candados de "el local compra lo suyo, y el depósito sigue sin verlo".
//
// ── EL CASO ────────────────────────────────────────────────────────────────
//
// Arreglado que un local pueda ponerle proveedor a un producto propio
// (INC-0012), quedaba que no lo podía COMPRAR: el catálogo del pedido a
// proveedor resolvía el depósito del grupo y lo usaba para las tres cosas —qué
// productos son visibles, de qué ubicación son las filas de ProductoLocal, y de
// qué ubicación es el stock—. Medido: 0 productos con el proveedor ya asignado.
//
// Ahora las tres siguen a la UBICACIÓN QUE OPERA.
//
// ── LAS DOS DIRECCIONES, Y POR QUÉ VAN JUNTAS ──────────────────────────────
//
// Que el local vea lo suyo es la mitad. La otra mitad es que el depósito SIGA
// SIN VER lo del local: ésa es la regla asimétrica y esta tanda no la cambia.
// Un candado que afirmara solo la primera pasaría en verde con el predicado
// roto de par en par —devolviendo todo a todos— y eso es justamente lo que no
// puede pasar. Por eso acá las dos se afirman en el mismo test, sobre el mismo
// juego de productos.
//
// Correr con:
//   node --import ./scripts/alias-loader.mjs --test app/api/compras-proveedor/elLocalCompraLoSuyo.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { productoVisibleWhere } from "@/lib/visibilidad";

const RAIZ = process.cwd();
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");
/** Saca los comentarios ANTES de mirar: un candado que busca texto los encuentra,
 *  y en este repo eso ya dio un verde falso. */
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const CATALOGO = "app/api/compras-proveedor/productos/route.js";
const CREAR = "app/api/compras-proveedor/crear/route.js";
/** Las OTRAS dos puertas por las que entra una línea a un pedido. */
const AGREGAR = "app/api/compras-proveedor/agregar-item/[id]/route.js";
const APLICAR = "app/api/compras-proveedor/importar/aplicar/[id]/route.js";

const DEPO = 1;
const LOCAL_A = 2;
const LOCAL_B = 3;

/** Los productos del escenario, como los distingue `creadoEnLocal`. */
const DEL_DEPOSITO = { nombre: "del depósito", creadoEnLocalId: DEPO, creadoEnLocal: { es_deposito: true } };
const DEL_LOCAL_A = { nombre: "del Local A", creadoEnLocalId: LOCAL_A, creadoEnLocal: { es_deposito: false } };
const DEL_LOCAL_B = { nombre: "del Local B", creadoEnLocalId: LOCAL_B, creadoEnLocal: { es_deposito: false } };
const SIN_CREADOR = { nombre: "sin creador", creadoEnLocalId: null, creadoEnLocal: null };

/**
 * ¿Este producto pasa el `where` que devuelve `productoVisibleWhere`?
 *
 * ── POR QUÉ SE COMPRUEBA LA FORMA ANTES DE EVALUAR ────────────────────────
 *
 * Esto interpreta un fragmento de Prisma, así que es una SEGUNDA copia de la
 * semántica del `where` — y una segunda copia que se separa en silencio es
 * exactamente lo que este repo prohíbe. La defensa es que primero se afirma la
 * FORMA exacta que hoy devuelve la función: si alguien la cambia, este candado
 * se pone rojo acá, en la premisa, en vez de seguir evaluando una forma que ya
 * no existe y contestar cualquier cosa.
 */
function pasaElFiltro(producto, localIdActivo) {
  const w = productoVisibleWhere(localIdActivo);

  assert.deepEqual(
    Object.keys(w),
    ["NOT"],
    "cambió la forma de productoVisibleWhere: este candado ya no la sabe evaluar"
  );
  assert.deepEqual(
    w.NOT,
    {
      AND: [
        { creadoEnLocal: { es_deposito: false } },
        { creadoEnLocalId: { not: localIdActivo } },
      ],
    },
    "cambió la forma de productoVisibleWhere: este candado ya no la sabe evaluar"
  );

  // Con la forma confirmada, la semántica: se excluye si lo creó un local que
  // NO es depósito Y que no es el activo. Un producto sin creador no machea la
  // relación, así que no se excluye (decisión D2).
  const loCreoUnLocal = producto.creadoEnLocal?.es_deposito === false;
  const esDeOtro = producto.creadoEnLocalId !== localIdActivo;
  return !(loCreoUnLocal && esDeOtro);
}

const vistosDesde = (localId) =>
  [DEL_DEPOSITO, DEL_LOCAL_A, DEL_LOCAL_B, SIN_CREADOR]
    .filter((p) => pasaElFiltro(p, localId))
    .map((p) => p.nombre);

// ===========================================================================
// 1. LAS DOS DIRECCIONES, EN EL MISMO TEST
// ===========================================================================

test("el local ve lo suyo MÁS lo del depósito, y el depósito NO ve lo del local", () => {
  const desdeElLocal = vistosDesde(LOCAL_A);
  const desdeElDeposito = vistosDesde(DEPO);

  // La mitad nueva: el Local A compra lo propio, y sigue comprando lo del
  // depósito.
  assert.ok(desdeElLocal.includes("del Local A"), "el local no ve su propio producto: no lo puede comprar");
  assert.ok(desdeElLocal.includes("del depósito"), "el local dejó de ver lo del depósito");

  // La mitad que NO cambia, y sin la cual la otra no prueba nada.
  assert.ok(
    !desdeElDeposito.includes("del Local A"),
    "EL DEPÓSITO PASÓ A VER PRODUCTOS DE UN LOCAL: se rompió la regla asimétrica"
  );
  assert.ok(desdeElDeposito.includes("del depósito"), "el depósito dejó de ver lo suyo");

  // Y entre locales tampoco se ven: no es que "el local ve todo".
  assert.ok(!desdeElLocal.includes("del Local B"), "un local pasó a ver lo de otro local");

  // Las listas completas, para que el candado diga QUÉ cambió y no solo que
  // cambió.
  assert.deepEqual(desdeElLocal.sort(), ["del Local A", "del depósito", "sin creador"].sort());
  assert.deepEqual(desdeElDeposito.sort(), ["del depósito", "sin creador"].sort());
});

test("CONTRAPRUEBA: evaluar con el depósito es lo que dejaba al local sin su producto", () => {
  // Es el defecto exacto, escrito como cuenta: el catálogo del Local A pasaba el
  // id del DEPÓSITO, así que su propio producto no pasaba el filtro.
  assert.equal(
    pasaElFiltro(DEL_LOCAL_A, DEPO),
    false,
    "si esto diera true, el predicado ya no distingue y el candado de arriba no prueba nada"
  );
  assert.equal(pasaElFiltro(DEL_LOCAL_A, LOCAL_A), true);
});

// ===========================================================================
// 2. QUE LAS RUTAS PASEN LA UBICACIÓN QUE OPERA, Y LA MISMA LAS DOS
// ===========================================================================

test("el catálogo evalúa la visibilidad, las filas y el stock con la ubicación que opera", () => {
  const f = sinComentarios(leer(CATALOGO));

  assert.match(
    f,
    /const\s+ubicacionDelPedido\s*=\s*Number\(\s*localId\s*\)/,
    "la ubicación del pedido dejó de salir del contexto resuelto"
  );
  assert.match(f, /productoVisibleWhere\(\s*ubicacionDelPedido\s*\)/, "la visibilidad no sigue a la ubicación");
  assert.match(f, /localId:\s*ubicacionDelPedido/, "las filas de ProductoLocal no siguen a la ubicación");

  // Las TRES: visibilidad, filas y stock. Se cuentan las apariciones porque dos
  // de los tres son `localId: ubicacionDelPedido` y un candado que solo hiciera
  // `match` quedaría verde si se arregla una y se olvida la otra.
  const usos = f.match(/ubicacionDelPedido/g) ?? [];
  assert.ok(usos.length >= 4, `la ubicación se usa ${usos.length} veces y tienen que ser al menos 4 (declaración + 3 usos)`);

  // Y que no quede el depósito decidiendo nada acá.
  assert.doesNotMatch(f, /productoVisibleWhere\(\s*depositoId\s*\)/, "volvió el depósito a decidir la visibilidad");
  assert.doesNotMatch(f, /localId:\s*depositoId/, "volvió el depósito a decidir de qué ubicación son las filas");
});

test("el guardado valida contra LA MISMA ubicación que sirvió el catálogo", () => {
  // Sin esto la pantalla ofrece lo que el servidor después rechaza, que es el
  // guardado engañoso. Medido antes del arreglo: el catálogo del local ofrecía
  // su producto y `crear` contestaba 400 "no pertenece al depósito".
  const f = sinComentarios(leer(CREAR));

  assert.match(
    f,
    /const\s+ubicacionDelPedido\s*=\s*Number\(\s*localId\s*\)/,
    "el guardado dejó de resolver la ubicación del contexto"
  );
  assert.match(
    f,
    /id:\s*\{\s*in:\s*ids\s*\}\s*,\s*localId:\s*ubicacionDelPedido/,
    "el guardado volvió a validar los productos contra otra ubicación que la del catálogo"
  );
  assert.doesNotMatch(f, /localId:\s*depId\s*,\s*activo/, "volvió la validación contra el depósito");

  // `depositoId` SIGUE siendo la referencia del grupo: esta tanda no cambia qué
  // significa ese campo, y el destino del stock lo fija `creadoEnLocalId`.
  assert.match(f, /depositoId:\s*depId/, "se cambió el significado de depositoId, que no es de esta tanda");
  assert.match(f, /creadoEnLocalId:\s*localId/, "el dueño del pedido dejó de ser la ubicación que opera");
});

test("LAS TRES PUERTAS por las que entra una línea preguntan lo mismo", () => {
  // Una línea entra a un pedido por tres lados: creando el pedido, agregando un
  // ítem a uno que ya existe, y aplicando una importación. Las tres validaban
  // contra el DEPÓSITO —`localId: depId` y `pedido.depositoId`— así que arreglar
  // solo la primera dejaba el catálogo ofreciendo lo que las otras dos rechazan.
  //
  // Y no se arreglan con tres consultas parecidas: las tres le preguntan a
  // `ownerLocalIdDePedido`, que ya existía y es la MISMA que usa `recibir` para
  // decidir a qué ubicación entra el stock. Así lo que se puede pedir y dónde
  // entra lo pedido no pueden separarse.
  for (const ruta of [AGREGAR, APLICAR]) {
    const f = sinComentarios(leer(ruta));
    assert.match(f, /ownerLocalIdDePedido/, `${ruta} no le pregunta a la función del dueño`);
    assert.doesNotMatch(
      f,
      /localId:\s*pedido\.depositoId/,
      `${ruta} volvió a validar contra el depósito del pedido`
    );
    assert.doesNotMatch(
      f,
      /pl\.localId\s*!==\s*pedido\.depositoId/,
      `${ruta} volvió a validar contra el depósito del pedido`
    );
  }

  // Y la de crear, que no tiene pedido todavía, usa el scope —que es lo que va a
  // quedar escrito como `creadoEnLocalId`, o sea el mismo dueño—.
  const fCrear = sinComentarios(leer(CREAR));
  assert.match(fCrear, /creadoEnLocalId:\s*localId/);
  assert.match(fCrear, /localId:\s*ubicacionDelPedido/);
});

test("ninguna de las tres le dice al usuario 'depósito' cuando rechaza", () => {
  // El mensaje viejo —"no pertenece al depósito"— mandaba a mirar el producto
  // cuando lo que pasaba era otra cosa. Con la ubicación como dueña, además,
  // sería falso.
  for (const ruta of [CREAR, AGREGAR, APLICAR]) {
    const f = sinComentarios(leer(ruta));
    assert.doesNotMatch(
      f,
      /no pertenece al depósito/,
      `${ruta} sigue diciendo "no pertenece al depósito" al rechazar`
    );
  }
});

test("la frase de la regla asimétrica sigue escrita donde se aplica", () => {
  // No es decoración: es la mitad que NO cambió, y el comentario es lo que evita
  // que la próxima lectura crea que el recorte se sacó del todo. Se busca en el
  // archivo CON comentarios, a propósito.
  // El texto se busca con los saltos de línea y el `//` de continuación
  // normalizados: el comentario se envuelve a 80 columnas y un candado que
  // exigiera la frase en una sola línea se pondría rojo por un reacomodo.
  const f = leer(CATALOGO).replace(/\s*\n\s*\/\/\s*/g, " ").replace(/\s+/g, " ");
  assert.match(
    f,
    /el depósito no arma pedidos con productos creados por un local/,
    "se perdió la explicación de la regla asimétrica en el lugar donde se aplica"
  );
});
