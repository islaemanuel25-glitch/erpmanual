// EL COSTO DE UN RENGLÓN VA EN LA MISMA ESCALA QUE SU CANTIDAD.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/costoEnLaUnidadDelPedido.test.mjs
//
// ── EL CASO REAL, MEDIDO ──────────────────────────────────────────────────
//
// Pedido #242 de Paty, renglón "Hamburguesa Paty Clasica x2": quedó guardado
// con `cantidad = 90`, `unidad = "UNIDAD"` y `precioCosto = 61703`. Ese 61.703
// es el `precio_costo` del catálogo, que para un producto PACK está POR BULTO
// —`factor_pack` 30—. O sea: la cantidad en unidades sueltas y el precio en
// packs, multiplicados entre sí.
//
// Son $5.553.270 sobre un renglón que el proveedor facturó $185.110,67, y el
// 91 % del "estimado al pedir" que la bandeja mostraba para todo el pedido.
//
// ── POR QUÉ NO LO ATRAPABA NADA ───────────────────────────────────────────
//
// Porque el número es perfectamente válido: un Decimal positivo en una columna
// que acepta cualquier Decimal positivo. La ruta que crea el pedido valida que
// sea finito y mayor o igual a cero, y lo es. La escala no se puede validar
// mirando el número solo — hace falta mirar en qué unidad quedó la línea, y eso
// es lo que nadie hacía.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { convertirUnidadPedido, subtotalLinea } from "@/lib/compras-proveedor/calculoPedido";
// LA FUNCIÓN YA EXISTÍA, en el módulo de importación. Se escribió una parecida
// al lado —`costoEnLaUnidadDelPedido`, en `calculoPedido`— y se borró antes de
// commitear: ésta además sabe que un fiambre o un producto por kilo NO se
// divide por el pack, que es el caso que la copia rompía.
import { costoParaUnidad } from "@/lib/compras-proveedor/importacion/merge";

const costoEnLaUnidadDelPedido = ({ unidad, costo, factor }) =>
  costoParaUnidad({
    costoMaestro: costo,
    unidad,
    producto: { factor_pack: factor, unidad_medida: "pack", modoCompraProveedor: "BULTO" },
  });

/** El producto real, como está en el catálogo de producción. */
const HAMBURGUESA = {
  nombre: "Hamburguesa Paty Clasica x2",
  precio_costo: 61703,
  factor_pack: 30,
  unidad_medida: "pack",
  modoCompraProveedor: "BULTO",
};

/** Lo que el papel de Paty cobra por esas 90 unidades. */
const LO_QUE_COBRA_EL_PAPEL = 185110.67;

const alCentavo = (n) => Math.round(Number(n) * 100) / 100;

test("UNA LÍNEA EN UNIDAD SOBRE UN PRODUCTO PACK RECIBE EL COSTO UNITARIO", () => {
  const costo = costoEnLaUnidadDelPedido({
    unidad: "UNIDAD",
    costo: HAMBURGUESA.precio_costo,
    factor: HAMBURGUESA.factor_pack,
  });
  assert.equal(alCentavo(costo), 2056.77);
  // Y no el del bulto, que es el que se guardó.
  assert.notEqual(alCentavo(costo), 61703);

  // 90 unidades a ese costo dan lo que el proveedor facturó, con la diferencia
  // de redondeo del propio proveedor y nada más.
  assert.ok(Math.abs(90 * costo - LO_QUE_COBRA_EL_PAPEL) < 2);
  // Contra los cinco millones y medio que daba el costo sin convertir.
  assert.equal(Math.round(90 * HAMBURGUESA.precio_costo), 5553270);
});

test("UNA LÍNEA EN BULTO NO SE TOCA", () => {
  // Es el caso normal y el que no se puede romper: 1.312 renglones de
  // producción están así.
  assert.equal(
    costoEnLaUnidadDelPedido({ unidad: "BULTO", costo: 61703, factor: 30 }),
    61703
  );
});

test("UN PRODUCTO SIN PACK NO SE TOCA, ESTÉ EN LA UNIDAD QUE ESTÉ", () => {
  // Sin bulto no hay dos escalas, así que no hay nada que convertir. Es el caso
  // de los untables del #242: factor 1, cantidad 12, costo $1.752.
  for (const factor of [null, undefined, 0, 1]) {
    assert.equal(costoEnLaUnidadDelPedido({ unidad: "UNIDAD", costo: 1752, factor }), 1752);
    assert.equal(costoEnLaUnidadDelPedido({ unidad: "BULTO", costo: 1752, factor }), 1752);
  }
});

test("NO REDONDEA: IR Y VOLVER TIENE QUE DAR EL MISMO NÚMERO", () => {
  // 1480 / 18 = 82,222222. `precioCosto` es Decimal(18,6) justamente para no
  // perder eso, y `convertirUnidadPedido` ya tiene la misma nota. Redondear acá
  // haría que Pack → Unidad → Pack no vuelva.
  const unitario = costoEnLaUnidadDelPedido({ unidad: "UNIDAD", costo: 1480, factor: 18 });
  assert.equal(unitario, 1480 / 18);
  assert.equal(alCentavo(unitario), 82.22);
  const vuelta = convertirUnidadPedido({ unidad: "UNIDAD", cantidad: 18, costo: unitario, factor: 18 });
  assert.equal(vuelta.costo, 1480);
});

test("UN FIAMBRE O UN PRODUCTO POR KILO NO SE DIVIDE POR EL PACK", () => {
  // El caso que la copia escrita al lado rompía. `calculoPedido` lo dice en su
  // encabezado: el factor_pack NO entra en el dinero, y un fiambre no tiene
  // "costo por bulto". Con un factor cargado igual, dividirlo sería inventar.
  const fiambre = { factor_pack: 6, unidad_medida: "kg", modoCompraProveedor: "UNIDAD" };
  assert.equal(costoParaUnidad({ costoMaestro: 10120, unidad: "UNIDAD", producto: fiambre }), 10120);
  const porKilo = { factor_pack: 6, unidad_medida: "kg", modoCompraProveedor: "BULTO" };
  assert.equal(costoParaUnidad({ costoMaestro: 10120, unidad: "UNIDAD", producto: porKilo }), 10120);
});

test("SIN COSTO MAESTRO DEVUELVE NULL, QUE NO ES LO MISMO QUE CERO", () => {
  // "No hay costo" y "el costo es cero" son cosas distintas: el estimado no
  // suma las líneas sin costo, en vez de sumarles un cero.
  for (const vacio of [null, undefined, ""]) {
    assert.equal(costoParaUnidad({ costoMaestro: vacio, unidad: "UNIDAD", producto: { factor_pack: 30 } }), null);
  }
  assert.equal(costoParaUnidad({ costoMaestro: 0, unidad: "BULTO", producto: { factor_pack: 30 } }), 0);
});

test("ES EL SENTIDO INVERSO DEL QUE YA HACE `convertirUnidadPedido`", () => {
  // La pieza que ya existía convierte una línea ENTERA al alternar Pack/Unidad.
  // Ésta convierte solo el costo al SEMBRARLO desde el catálogo, que es el
  // momento en el que no había nada. Las dos tienen que coincidir o hay dos
  // criterios para la misma cuenta.
  const porLaPieza = convertirUnidadPedido({
    unidad: "BULTO",
    cantidad: 3,
    costo: HAMBURGUESA.precio_costo,
    factor: HAMBURGUESA.factor_pack,
  });
  assert.equal(porLaPieza.unidad, "UNIDAD");
  assert.equal(
    porLaPieza.costo,
    costoParaUnidad({ costoMaestro: HAMBURGUESA.precio_costo, unidad: "UNIDAD", producto: HAMBURGUESA })
  );
});

test("Y LA PLATA DEL RENGLÓN QUEDA IGUAL SE PIDA COMO SE PIDA", () => {
  // Tres packs o noventa unidades son la misma mercadería y tienen que valer lo
  // mismo. Con el costo sin convertir, la versión en unidades valía treinta
  // veces más — que es el defecto entero, dicho en plata.
  const enBultos = subtotalLinea({
    base: HAMBURGUESA,
    cantidad: 3,
    costo: costoEnLaUnidadDelPedido({ unidad: "BULTO", costo: 61703, factor: 30 }),
  });
  const enUnidades = subtotalLinea({
    base: HAMBURGUESA,
    cantidad: 90,
    costo: costoEnLaUnidadDelPedido({ unidad: "UNIDAD", costo: 61703, factor: 30 }),
  });
  assert.equal(alCentavo(enBultos.subtotal), alCentavo(enUnidades.subtotal));
  assert.equal(alCentavo(enBultos.subtotal), 185109);

  // CONTRAPRUEBA: sin convertir, las mismas 90 unidades valen treinta veces más.
  const sinConvertir = subtotalLinea({ base: HAMBURGUESA, cantidad: 90, costo: 61703 });
  assert.equal(alCentavo(sinConvertir.subtotal), 5553270);
  assert.equal(Math.round(sinConvertir.subtotal / enUnidades.subtotal), 30);
});

// ── Y TODOS LOS CAMINOS QUE SIEMBRAN UN COSTO LO CONVIERTEN ───────────────

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("NINGÚN CAMINO COPIA `precio_costo` CRUDO A UN RENGLÓN DE PEDIDO", () => {
  // Son CUATRO los lugares donde nace el costo de una línea, y los cuatro
  // tomaban el maestro tal cual:
  //
  //   · sembrar desde los sugeridos por stock bajo;
  //   · restaurar el carrito al volver de editar un producto;
  //   · agregar un producto a mano;
  //   · el borrador de una fila todavía no agregada, que es el que engaña —su
  //     costo viaja a `agregarItem` como "costo dado" y saltea la conversión
  //     de allá.
  //
  // Más un quinto del lado del servidor: sembrar el pedido desde una factura
  // leída, donde la unidad la pone el papel y queda en UNIDAD justamente
  // cuando no se entendió.
  const pantalla = codigoDe("app/modulos/compras-proveedor/nueva/page.jsx");
  const siembra = codigoDe("lib/compras-proveedor/sembrarPedidoDesdeFactura.js");

  // Cuatro conversiones en la pantalla, una en la siembra.
  assert.equal(
    (pantalla.match(/costoParaUnidad\(\{/g) || []).length,
    4,
    "cambió la cantidad de lugares que siembran un costo: revisá si el nuevo convierte"
  );
  assert.match(siembra, /costoParaUnidad\(\{/);

  // Y ninguno de los dos vuelve a tomar el maestro crudo para un renglón.
  assert.ok(
    !/precioCosto: Number\(pr\.precio_costo \|\| 0\)/.test(pantalla),
    "volvió a copiarse el costo del catálogo sin convertir"
  );
  assert.ok(
    !/precioCosto: pl\.base\?\.precio_costo/.test(siembra),
    "la siembra desde factura volvió a copiar el maestro sin convertir"
  );
});

test("Y SE REUSA LA FUNCIÓN QUE YA EXISTÍA, NO UNA PARECIDA AL LADO", () => {
  // Se escribió una copia —`costoEnLaUnidadDelPedido`, en `calculoPedido`— y se
  // borró antes de commitear: no sabía que un fiambre no se divide por el pack.
  // Este candado existe para que no vuelva.
  assert.ok(
    !/costoEnLaUnidadDelPedido/.test(codigoDe("lib/compras-proveedor/calculoPedido.js")),
    "volvió la copia de la conversión al lado de la que ya existe"
  );
  for (const archivo of [
    "app/modulos/compras-proveedor/nueva/page.jsx",
    "lib/compras-proveedor/sembrarPedidoDesdeFactura.js",
  ]) {
    assert.match(
      codigoDe(archivo),
      /import \{ costoParaUnidad \} from "@\/lib\/compras-proveedor\/importacion\/merge"/,
      archivo
    );
  }
});
