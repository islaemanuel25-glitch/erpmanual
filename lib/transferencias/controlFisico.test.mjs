// LA RECEPCIÓN ES UN CONTROL FÍSICO, Y LAS CUENTAS TIENEN QUE CERRAR.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/controlFisico.test.mjs
//
// ── LOS DOS DEFECTOS QUE ESTOS CANDADOS EXISTEN PARA IMPEDIR ──────────────
//
// 1. QUE LAS CARDS Y EL LISTADO NO COINCIDAN. La card dice "7 faltantes", se la
//    toca y aparecen 6. Con dos cálculos separados eso pasa el día que uno
//    cambia, y no hay forma de saber cuál de los dos miente. Acá se prueba que
//    el resumen y el filtro salen del MISMO `estadoDeProducto`.
//
// 2. QUE UN PACK INCOMPLETO SE ESCRIBA COMO DECIMAL. 5 packs de 6 más 5 sueltas
//    son 35 unidades. `5.833 × 6 = 34.998`, y eso es lo que quedaría en el
//    `Decimal(12,3)` del stock. Los números de acá son enteros exactos.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ESTADO_PRODUCTO,
  FILTRO,
  SIN_CATEGORIA,
  buscarEnRemito,
  buscarPorCodigoExacto,
  categoriasDelRemito,
  estadoDeProducto,
  productosVisibles,
  resumenDeRecepcion,
} from "./controlFisico.js";
import { milesimasFisicas, unidadesFisicasDe, validarDetalleRecepcion } from "./recepcion.js";

/** Una línea del remito con la forma que devuelve `/api/transferencias/detalle`. */
const linea = (extra = {}) => ({
  id: 1,
  nombre: "Producto",
  codigoBarra: null,
  codigoBarraSecundario: null,
  codigoBarraPropio: null,
  cantidadEnviada: 10,
  cantidadRecibida: null,
  recibidoUnidadesSueltas: 0,
  unidadEnviada: "UNIDAD",
  factorPack: 1,
  agregadoEnRecepcion: false,
  revisadoEnRecepcion: false,
  revisadoEnRecepcionAt: null,
  categoria: null,
  ...extra,
});

/** Un producto revisado con el resultado que se le pida. */
const revisado = (extra = {}) =>
  linea({ revisadoEnRecepcion: true, revisadoEnRecepcionAt: "2026-09-09T12:00:00Z", ...extra });

// ═══════════════════════════════════════════════════════════════════════════
// 1-4. EL DENOMINADOR ES EL REMITO, Y LA SUMA CIERRA
// ═══════════════════════════════════════════════════════════════════════════

test("1. el total del remito EXCLUYE los productos agregados en recepción", () => {
  const items = [
    linea({ id: 1 }),
    linea({ id: 2 }),
    linea({ id: 3, agregadoEnRecepcion: true, cantidadEnviada: 0, cantidadRecibida: 2 }),
  ];
  const r = resumenDeRecepcion(items);
  assert.equal(r.totalRemito, 2, "un producto agregado no es un producto del remito");
  assert.equal(r.noDeclarados, 1);
  assert.equal(r.pendientes, 2, "agregar un producto no puede crear un pendiente");
});

test("2-3-4. EL CASO DEL PEDIDO: 139 + 7 + 3 = 149 revisados, 10 diferencias, 1 aparte", () => {
  const items = [];
  let id = 0;
  // 139 correctos: enviado 10, recibido 10.
  for (let i = 0; i < 139; i++) items.push(revisado({ id: ++id, cantidadRecibida: 10 }));
  // 7 faltantes.
  for (let i = 0; i < 7; i++)
    items.push(revisado({ id: ++id, cantidadRecibida: 8, motivoPrincipal: "Faltante" }));
  // 3 sobrantes.
  for (let i = 0; i < 3; i++)
    items.push(revisado({ id: ++id, cantidadRecibida: 12, motivoPrincipal: "Sobrante" }));
  // 1 del remito todavía sin revisar → 150 originales.
  items.push(linea({ id: ++id }));
  // 1 agregado en recepción, APARTE.
  items.push(linea({ id: ++id, agregadoEnRecepcion: true, cantidadEnviada: 0, cantidadRecibida: 2 }));

  const r = resumenDeRecepcion(items);

  assert.equal(r.totalRemito, 150);
  assert.equal(r.revisados, 149);
  assert.equal(r.pendientes, 1);
  assert.equal(r.correctos, 139);
  assert.equal(r.faltantes, 7);
  assert.equal(r.sobrantes, 3);
  assert.equal(r.noDeclarados, 1);

  // Las dos igualdades que tienen que cerrar.
  assert.equal(r.correctos + r.faltantes + r.sobrantes, r.revisados, "139 + 7 + 3 = 149");
  assert.equal(r.revisados + r.pendientes, r.totalRemito, "149 + 1 = 150");

  // Diferencias son 10, NO 11: el no declarado no es una diferencia del remito.
  assert.equal(r.diferencias, 10);
  assert.notEqual(r.diferencias, 11, "el producto agregado se está contando como diferencia");
});

test("las cards y el listado NO pueden discrepar: son el mismo estado", () => {
  const items = [];
  let id = 0;
  for (let i = 0; i < 5; i++) items.push(revisado({ id: ++id, cantidadRecibida: 10 }));
  for (let i = 0; i < 3; i++) items.push(revisado({ id: ++id, cantidadRecibida: 8 }));
  for (let i = 0; i < 2; i++) items.push(revisado({ id: ++id, cantidadRecibida: 12 }));
  for (let i = 0; i < 4; i++) items.push(linea({ id: ++id }));
  items.push(linea({ id: ++id, agregadoEnRecepcion: true, cantidadEnviada: 0, cantidadRecibida: 1 }));

  const r = resumenDeRecepcion(items);

  // Cada métrica tiene que dar exactamente lo que devuelve su filtro.
  const cuenta = (f) => productosVisibles(items, { filtro: f }).length;
  assert.equal(cuenta(FILTRO.CORRECTOS), r.correctos);
  assert.equal(cuenta(FILTRO.FALTANTES), r.faltantes);
  assert.equal(cuenta(FILTRO.SOBRANTES), r.sobrantes);
  assert.equal(cuenta(FILTRO.PENDIENTES), r.pendientes);
  assert.equal(cuenta(FILTRO.REVISADOS), r.revisados);
  assert.equal(cuenta(FILTRO.DIFERENCIAS), r.diferencias);
  assert.equal(cuenta(FILTRO.NO_DECLARADOS), r.noDeclarados);
  assert.equal(cuenta(FILTRO.TODOS), r.totalRemito, "'Todos' son los del remito");
});

// ═══════════════════════════════════════════════════════════════════════════
// 5-7. EL ESTADO DE UN PRODUCTO
// ═══════════════════════════════════════════════════════════════════════════

test("5. revisado y exacto → Correcto", () => {
  assert.equal(estadoDeProducto(revisado({ cantidadRecibida: 10 })), ESTADO_PRODUCTO.CORRECTO);
});

test("6. revisado con MENOS físico → Faltante", () => {
  assert.equal(estadoDeProducto(revisado({ cantidadRecibida: 8 })), ESTADO_PRODUCTO.FALTANTE);
  // Y en packs: 5 packs de 6 contra 6 enviados.
  assert.equal(
    estadoDeProducto(
      revisado({ cantidadEnviada: 6, cantidadRecibida: 5, unidadEnviada: "BULTO", factorPack: 6 })
    ),
    ESTADO_PRODUCTO.FALTANTE
  );
});

test("7. revisado con MÁS físico → Sobrante", () => {
  assert.equal(estadoDeProducto(revisado({ cantidadRecibida: 12 })), ESTADO_PRODUCTO.SOBRANTE);
});

test("un producto con cantidad cargada pero SIN revisar sigue pendiente", () => {
  // Es el caso que separa "empecé a contar" de "terminé de controlar".
  const d = linea({ cantidadRecibida: 10, revisadoEnRecepcion: false });
  assert.equal(estadoDeProducto(d), ESTADO_PRODUCTO.PENDIENTE);
  assert.equal(resumenDeRecepcion([d]).correctos, 0, "darlo por correcto cerraría un conteo ajeno");
});

// ═══════════════════════════════════════════════════════════════════════════
// 8-12. FILTROS
// ═══════════════════════════════════════════════════════════════════════════

test("8. el filtro de categoría usa la categoría REAL del ProductoBase", () => {
  const items = [
    linea({ id: 1, categoria: { id: 7, nombre: "Bebidas" } }),
    linea({ id: 2, categoria: { id: 9, nombre: "Golosinas" } }),
    linea({ id: 3, categoria: null }),
  ];

  const cats = categoriasDelRemito(items);
  assert.deepEqual(cats.map((c) => c.nombre), ["Bebidas", "Golosinas", "Sin categoría"]);
  assert.equal(cats.find((c) => c.nombre === "Bebidas").id, "7", "el id es el de la categoría real");

  // Salen SOLO las del remito: no aparece ninguna categoría que no vino.
  assert.equal(cats.length, 3);

  assert.deepEqual(productosVisibles(items, { categoriaId: "7" }).map((d) => d.id), [1]);
  // "Sin categoría" es un estado de presentación, no una fila en la base.
  assert.deepEqual(
    productosVisibles(items, { categoriaId: SIN_CATEGORIA.id }).map((d) => d.id),
    [3]
  );
});

test("8b. categoría y estado se combinan", () => {
  const items = [
    revisado({ id: 1, cantidadRecibida: 10, categoria: { id: 7, nombre: "Bebidas" } }),
    linea({ id: 2, categoria: { id: 7, nombre: "Bebidas" } }),
    linea({ id: 3, categoria: { id: 9, nombre: "Golosinas" } }),
  ];
  assert.deepEqual(
    productosVisibles(items, { filtro: FILTRO.PENDIENTES, categoriaId: "7" }).map((d) => d.id),
    [2],
    "Bebidas + Pendientes"
  );
  assert.deepEqual(
    productosVisibles(items, { filtro: FILTRO.REVISADOS, categoriaId: "7" }).map((d) => d.id),
    [1]
  );
});

test("9-11. Pendientes, Revisados y Diferencias", () => {
  const items = [
    linea({ id: 1 }),
    revisado({ id: 2, cantidadRecibida: 10 }),
    revisado({ id: 3, cantidadRecibida: 8 }),
    revisado({ id: 4, cantidadRecibida: 12 }),
  ];
  assert.deepEqual(productosVisibles(items, { filtro: FILTRO.PENDIENTES }).map((d) => d.id), [1]);
  assert.deepEqual(
    productosVisibles(items, { filtro: FILTRO.REVISADOS }).map((d) => d.id).sort(),
    [2, 3, 4]
  );
  assert.deepEqual(
    productosVisibles(items, { filtro: FILTRO.DIFERENCIAS }).map((d) => d.id).sort(),
    [3, 4],
    "Diferencias agrupa faltante y sobrante"
  );
  // Y adentro se pueden distinguir.
  assert.deepEqual(productosVisibles(items, { filtro: FILTRO.FALTANTES }).map((d) => d.id), [3]);
  assert.deepEqual(productosVisibles(items, { filtro: FILTRO.SOBRANTES }).map((d) => d.id), [4]);
});

test("12. el filtro No declarado devuelve SOLO los agregados", () => {
  const items = [
    revisado({ id: 1, cantidadRecibida: 12 }),
    linea({ id: 2, agregadoEnRecepcion: true, cantidadEnviada: 0, cantidadRecibida: 2 }),
  ];
  const soloAgregados = productosVisibles(items, { filtro: FILTRO.NO_DECLARADOS });
  assert.deepEqual(soloAgregados.map((d) => d.id), [2]);
  // Y no se cuela en "Todos", que son los del remito.
  assert.deepEqual(productosVisibles(items, { filtro: FILTRO.TODOS }).map((d) => d.id), [1]);
});

// ═══════════════════════════════════════════════════════════════════════════
// 13-16. BUSCAR Y ESCANEAR DENTRO DEL REMITO
// ═══════════════════════════════════════════════════════════════════════════

test("13. se busca por nombre", () => {
  const items = [linea({ id: 1, nombre: "9 de Oro Vainilla" }), linea({ id: 2, nombre: "Coca-Cola" })];
  assert.deepEqual(buscarEnRemito(items, "oro").map((d) => d.id), [1]);
  // Sin acentos ni mayúsculas de por medio.
  assert.deepEqual(buscarEnRemito([linea({ id: 3, nombre: "Limón" })], "limon").map((d) => d.id), [3]);
});

test("14. coincidencia EXACTA por los TRES códigos escaneables", () => {
  const items = [
    linea({ id: 1, codigoBarraPropio: "PROP-1" }),
    linea({ id: 2, codigoBarra: "7790895000997" }),
    linea({ id: 3, codigoBarraSecundario: "SEC-3" }),
  ];
  assert.equal(buscarPorCodigoExacto(items, "PROP-1")?.id, 1, "codigo_barra_propio");
  assert.equal(buscarPorCodigoExacto(items, "7790895000997")?.id, 2, "codigo_barra");
  assert.equal(buscarPorCodigoExacto(items, "SEC-3")?.id, 3, "codigo_barra_secundario");

  // EXACTA, no "contiene": una coincidencia parcial abriría la ficha de otro
  // producto con la mercadería en la mano.
  assert.equal(buscarPorCodigoExacto(items, "779089500099"), null);
  assert.equal(buscarPorCodigoExacto(items, ""), null);
});

test("15. escanear un producto QUE ESTÁ en el remito no abre el flujo de no declarado", () => {
  const items = [linea({ id: 1, codigoBarra: "779" })];
  const encontrado = buscarPorCodigoExacto(items, "779");
  assert.ok(encontrado, "el scanner tiene que resolverlo adentro de la transferencia");
  assert.equal(encontrado.agregadoEnRecepcion, false);
});

test("16. un producto que NO está en el remito habilita el segundo flujo", () => {
  const items = [linea({ id: 1, codigoBarra: "779" })];
  assert.equal(buscarPorCodigoExacto(items, "888"), null, "recién ahí se ofrece el catálogo del origen");
});

test("un producto YA agregado se abre, no se vuelve a agregar", () => {
  const items = [
    linea({ id: 9, codigoBarra: "888", agregadoEnRecepcion: true, cantidadEnviada: 0, cantidadRecibida: 2 }),
  ];
  const encontrado = buscarPorCodigoExacto(items, "888");
  assert.equal(encontrado?.id, 9);
  assert.equal(encontrado.agregadoEnRecepcion, true, "abre su estado existente");
});

// ═══════════════════════════════════════════════════════════════════════════
// 17-22. EL PACK INCOMPLETO, CON ARITMÉTICA EXACTA
// ═══════════════════════════════════════════════════════════════════════════

const packs = (cantidad, sueltas) =>
  milesimasFisicas({ cantidad, sueltas, unidad: "BULTO", factorPack: 6 });

test("17. 6 PACK x6 son 36 unidades físicas", () => {
  assert.equal(packs(6, 0), 36000, "en milésimas enteras");
  assert.equal(unidadesFisicasDe({ cantidad: 6, sueltas: 0, unidad: "BULTO", factorPack: 6 }), 36);
});

test("18. 5 PACK x6 + 5 sueltas son 35 EXACTAS", () => {
  assert.equal(packs(5, 5), 35000);
  assert.equal(unidadesFisicasDe({ cantidad: 5, sueltas: 5, unidad: "BULTO", factorPack: 6 }), 35);
});

test("19. la diferencia contra 36 es -1 EXACTA", () => {
  const envM = packs(6, 0);
  const recM = packs(5, 5);
  assert.equal(envM - recM, 1000, "1000 milésimas = 1 unidad, sin residuo");

  // Y por el camino que de verdad mueve stock.
  const plan = validarDetalleRecepcion({
    detalle: {
      cantidad: 6, recibido: 5, recibidoUnidadesSueltas: 5,
      unidadEnviada: "BULTO", motivoPrincipal: "Faltante",
    },
    factorPack: 6,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.enviadaUnidades, 36);
  assert.equal(plan.recibidaUnidades, 35);
  assert.equal(plan.ajusteOrigenUnidades, 1, "vuelve 1 unidad al origen");
  assert.equal(plan.devolucionUnidades, 1);
  assert.equal(plan.hayDiferencia, true);
});

test("20. 6 PACK x6 + 1 suelta son 37", () => {
  assert.equal(packs(6, 1), 37000);
  const plan = validarDetalleRecepcion({
    detalle: {
      cantidad: 6, recibido: 6, recibidoUnidadesSueltas: 1,
      unidadEnviada: "BULTO", motivoPrincipal: "Sobrante",
    },
    factorPack: 6,
  });
  assert.equal(plan.recibidaUnidades, 37);
  assert.equal(plan.ajusteOrigenUnidades, -1, "el origen pierde 1 más");
  assert.equal(plan.excedenteUnidades, 1);
  // Y la diferencia se mide en FÍSICO: 6 == 6 en la presentación, pero 37 != 36.
  assert.equal(plan.hayDiferencia, true, "comparar solo la presentación diría que no hay diferencia");
});

test("21. NO existe la representación 5.833 para ese caso", () => {
  // Lo que se evita, escrito: el float no da 35.
  assert.notEqual(5.833 * 6, 35);
  assert.equal(Math.round(5.833 * 6 * 1000), 34998, "34.998, no 35.000");

  // Y el modelo no lo produce: 35 sale de dos enteros, no de un decimal.
  assert.equal(packs(5, 5), 35000);
  // Un `recibido` fraccionario de esa forma ni siquiera es representable en
  // milésimas × factor sin residuo, y por eso no se usa.
  assert.equal(unidadesFisicasDe({ cantidad: 5.833, sueltas: 0, unidad: "BULTO", factorPack: 6 }), 34.998);
});

test("22. en UNIDAD no hay desglose de sueltas", () => {
  // Sin bulto, la cantidad YA está en unidades físicas: un desglose se sumaría
  // encima de sí mismo.
  assert.equal(milesimasFisicas({ cantidad: 10, sueltas: 2, unidad: "UNIDAD", factorPack: 1 }), null);
  const plan = validarDetalleRecepcion({
    detalle: { cantidad: 10, recibido: 10, recibidoUnidadesSueltas: 2, unidadEnviada: "UNIDAD" },
    factorPack: 1,
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.error, "UNIDADES_SUELTAS_SIN_BULTO");

  // Y sin sueltas funciona normal, con el desglose normalizado en 0.
  const ok = validarDetalleRecepcion({
    detalle: { cantidad: 10, recibido: 10, unidadEnviada: "UNIDAD" },
    factorPack: 1,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.recibidaSueltas, 0);
});

test("22b. 5 packs + 6 sueltas es lo MISMO que 6 packs: no hay diferencia", () => {
  // El caso que prueba que la comparación es física y no de presentación.
  const plan = validarDetalleRecepcion({
    detalle: { cantidad: 6, recibido: 5, recibidoUnidadesSueltas: 6, unidadEnviada: "BULTO" },
    factorPack: 6,
  });
  assert.equal(plan.ok, true, "y no pide motivo, porque no hay diferencia que explicar");
  assert.equal(plan.recibidaUnidades, 36);
  assert.equal(plan.hayDiferencia, false);
  assert.equal(plan.ajusteOrigenUnidades, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// 23-26. NULL, BORRADOR Y REVISIÓN
// ═══════════════════════════════════════════════════════════════════════════

test("23. recibido null sigue siendo distinto de 0", () => {
  assert.equal(recibidoNull(), null);
  function recibidoNull() {
    return estadoDeProducto(linea({ cantidadRecibida: null })) === ESTADO_PRODUCTO.PENDIENTE
      ? null
      : "no pendiente";
  }
  // 0 es un dato: no llegó nada, y con revisión es un faltante.
  assert.equal(estadoDeProducto(revisado({ cantidadRecibida: 0 })), ESTADO_PRODUCTO.FALTANTE);
  // null no: nadie contó todavía.
  assert.equal(estadoDeProducto(revisado({ cantidadRecibida: null })), ESTADO_PRODUCTO.PENDIENTE);
});

test("24-25. guardar un borrador NO marca revisado; revisar SÍ lo persiste", () => {
  const guardar = leerSinComentarios("app/api/transferencias/guardar-recepcion/route.js");
  assert.ok(
    !/revisadoEnRecepcion:/.test(guardar),
    "guardar no puede cerrar el control físico: es un borrador"
  );

  const revisar = leerSinComentarios("app/api/transferencias/revisar-producto/route.js");
  assert.match(revisar, /revisadoEnRecepcion: revisado/, "revisar tiene que persistir la marca");
  assert.match(revisar, /revisadoEnRecepcionPorId: revisado \? usuarioId : null/);
  assert.match(revisar, /revisadoEnRecepcionAt: revisado \? new Date\(\) : null/);

  // Y la autoría NO viene del cliente.
  assert.match(revisar, /const usuarioId = Number\(session\.id \|\| 0\)/);
  assert.ok(
    !/body\?\.usuarioId|body\?\.revisadoEnRecepcionPorId|body\?\.revisadoEnRecepcionAt/.test(revisar),
    "el autor o la fecha se están tomando del request"
  );
});

test("26. revisar usa el MISMO mutex y valida con la MISMA función", () => {
  const revisar = leerSinComentarios("app/api/transferencias/revisar-producto/route.js");
  assert.match(revisar, /await reclamarOFallar\(tx, transferenciaId, "Recibiendo"\)/);
  assert.match(revisar, /validarDetalleRecepcion\(/, "no puede tener su propia validación");
  // La cantidad enviada, la unidad y la procedencia salen de la BASE.
  assert.match(revisar, /cantidad: d\.cantidad/);
  assert.match(revisar, /unidadEnviada: d\.unidadEnviada/);
  assert.match(revisar, /agregadoEnRecepcion: d\.agregadoEnRecepcion/);
  assert.ok(!/cantidad: body/.test(revisar), "la cantidad enviada no puede venir del request");

  // Y el lock es la PRIMERA escritura.
  const tx = revisar.slice(revisar.indexOf("prisma.$transaction"));
  assert.ok(
    tx.indexOf("reclamarOFallar") < tx.indexOf("transferenciaDetalle.update"),
    "se escribe antes de tomar el lock"
  );
});

test("confirmar exige que no quede ningún ORIGINAL sin revisar, adentro del lock", () => {
  const confirmar = leerSinComentarios("app/api/transferencias/confirmar-recepcion/route.js");
  assert.match(confirmar, /PRODUCTOS_SIN_REVISAR/);
  assert.match(confirmar, /originalesSinRevisar\(detalles\)/);

  // Después del lock y de la relectura, no sobre el snapshot de afuera.
  const tx = confirmar.slice(confirmar.indexOf("prisma.$transaction"));
  const posLock = tx.indexOf("reclamarOFallar");
  const posLectura = tx.indexOf("cargarDetallesDeRecepcion(tx");
  const posGuarda = tx.indexOf("originalesSinRevisar");
  assert.ok(posLock < posLectura, "los detalles se leen antes del lock");
  assert.ok(posLectura < posGuarda, "la guarda mira un snapshot viejo");

  // Y antes de mover un solo gramo de stock.
  for (const mutacion of ["stockLocal.upsert", "descontarConGuardia(tx", "auditoriaStock.create"]) {
    const pos = tx.indexOf(mutacion);
    assert.ok(pos > 0 && posGuarda < pos, `la guarda tiene que cortar antes de ${mutacion}`);
  }
});

test("las agregadas NO bloquean la confirmación", () => {
  // 150 originales revisados + 1 agregada sin revisar: se puede confirmar.
  const detalles = [
    { id: 1, agregadoEnRecepcion: false, revisadoEnRecepcion: true },
    { id: 2, agregadoEnRecepcion: true, revisadoEnRecepcion: false },
  ];
  assert.deepEqual(originalesSinRevisarLocal(detalles), []);

  // Y con un original sin revisar, sí bloquea.
  const conPendiente = [
    { id: 1, agregadoEnRecepcion: false, revisadoEnRecepcion: false, producto: { base: { nombre: "9 de Oro" } } },
    { id: 2, agregadoEnRecepcion: true, revisadoEnRecepcion: false },
  ];
  const p = originalesSinRevisarLocal(conPendiente);
  assert.equal(p.length, 1);
  assert.equal(p[0].nombre, "9 de Oro", "el mensaje tiene que poder nombrar cuál falta");
});

// ── utilidades del archivo ─────────────────────────────────────────────────

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { originalesSinRevisar as originalesSinRevisarLocal } from "./recepcionServidor.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
function leerSinComentarios(rel) {
  return fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
