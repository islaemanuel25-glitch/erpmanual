// EL PEDIDO DE MAURO #298: UN CATÁLOGO DE DOS HOJAS, LEÍDO COMO DOS FACTURAS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/mauro298.test.mjs
//
// ── DE DÓNDE SALEN LOS DATOS ───────────────────────────────────────────────
//
// De la base de producción, el 2026-10-26, después del despliegue de 21fe528e:
// los comprobantes 34 (hoja de Philips) y 35 (hoja de Lucky) del pedido 298,
// con sus 19 renglones TAL COMO QUEDARON GUARDADOS, y las 24 líneas del pedido.
// Los dos papeles estaban MAL_LEIDO y los 19 renglones con `costoFinalRenglon`
// vacío.
//
// El candado anterior de este archivo armaba las hojas con un reparto inventado,
// la de Philips ya en SIN_TOTAL y todos los costos puestos: una combinación que
// en producción no existió nunca. Por eso estaba verde y el #298 seguía roto.
//
// Lo que Emanuel verificó a mano contra los papeles: el papel no tiene
// impuestos y el importe de cada producto ya es el costo final; la hoja de
// Philips trae 15 productos que suman $1.685.500 y no tiene total; la de Lucky
// trae 4 que suman $340.600 y al pie TOTAL $2.026.100, el de las dos hojas; y
// 30 de PHILIPS MORRIS 10 son 3 packs de 10.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cierranJuntas, costosQueFaltanDelPapel } from "./fusionarHojas.js";
import { hojasQueCierranJuntas, lecturaUnida } from "./agruparHojas.js";
import { lecturaDesdeLoGuardado, papelGuardadoSinImpuestos, productoPuestoAMano } from "./lecturaGuardada.js";
import { recibidosDelCierre, resumenDelCierre } from "../cierreDeRecepcion.js";
import { textoDeLaCorreccionManual } from "./correccionManual.js";
import { pasarPorLaPuerta, ESTADO } from "./lector/puerta.js";
import { normalizarLectura } from "./lector/contrato.js";
import {
  costoQueFaltaDelImporte,
  papelSinImpuestosImpresos,
  renglonesQueFaltan,
  verificarLecturaInterpretada,
} from "./lector/lecturaInterpretada.js";
import { analizarPrecioDeLinea } from "./precioDeLinea.js";
import { deducirUnidad, lecturaElegida, UNIDAD } from "./unidadPorPrecio.js";
import { unidadesQueDiceElRenglon } from "../contenidoDelBulto.js";
import { buscarCandidatos, lineaDelPedidoPorNombreYPrecio, precioCuadra, ORIGEN_VINCULO } from "./vinculo.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// ── LOS 19 RENGLONES, COMO ESTÁN EN `ComprobanteLinea` ────────────────────
// [comprobanteId, orden, textoCrudo, cantidad, netoUnitario, subtotalImpreso]
const RENGLONES = [
  [34, 1, "PHILIPS MORRIS 10", 30, 3360, 100800],
  [34, 2, "PHILIPS SELECT RED KS", 70, 2250, 157500],
  [34, 3, "PHILIPS MORRIS 20 KS", 20, 5250, 105000],
  [34, 4, "PHILIPS MORRIS 20 CONV", 20, 5650, 113000],
  [34, 5, "CHESTERFIELD 10 CONV", 20, 3010, 60200],
  [34, 6, "CHESTERFIELD 20 KS", 30, 4650, 139500],
  [34, 7, "MARLBORO 10", 20, 3700, 74000],
  [34, 8, "MARLBORO 10 FUSION UVA", 10, 3700, 37000],
  [34, 9, "MARLBORO 20 TITANIUM BLUE", 10, 6750, 67500],
  [34, 10, "M.CRAFTED 20 BOX CONV", 10, 4050, 40500],
  [34, 11, "M.CRAFTED 20 BOX RED", 30, 4050, 121500],
  [34, 12, "M.CRAFTED 20 BOX CORAL", 30, 4050, 121500],
  [34, 13, "M.CRAFTED 20 BOX UVA", 90, 3650, 328500],
  [34, 14, "M.CRAFTED 20 KS RED", 50, 3650, 182500],
  [34, 15, "M.CRAFTED 20 SUAVE KS", 10, 3650, 36500],
  [35, 1, "LUCKY STRIKE 10", 10, 3360, 33600],
  [35, 2, "LUCKY STRIKE 10 CONV", 20, 3400, 68000],
  [35, 3, "LUCKY STRIKE 20 CONV XL", 10, 5650, 56500],
  [35, 4, "LUCKY ORIGEN 20 CONV KS", 50, 3650, 182500],
];

const renglonesDe = (comprobanteId) =>
  RENGLONES.filter((r) => r[0] === comprobanteId).map(([, orden, textoCrudo, cantidad, netoUnitario, subtotalImpreso]) => ({
    orden,
    textoCrudo,
    codigoProveedor: null,
    cantidad,
    netoUnitario,
    subtotalImpreso,
    subtotalCorregido: null,
    internoUnitario: 0,
    pesoKg: null,
    bonificacionPct: null,
    ivaPct: null,
    costoFinalRenglon: null,
    enQueViene: "unidad",
    tipoRenglon: "MERCADERIA",
  }));

// `recetaUsada` tal como quedó guardada en los dos.
const RECETA = {
  explicacion:
    "Cómo se costea este papel (traducido de la receta que estaba cargada): el precio impreso ya trae el IVA, no se le suma nada. Las bonificaciones de cada renglón ya están en su importe.",
  interpretada: true,
  tipoComprobante: "SIN_FACTURA",
};

const PHILIPS = {
  id: 34,
  estado: "MAL_LEIDO",
  leidoEn: new Date("2026-10-26T01:45:40.966Z"),
  totalLeido: null,
  lineasEnElPapel: 15,
  lineasTranscriptas: 15,
  recetaUsada: RECETA,
  recetaVersion: 1,
  explicacionLeida:
    "Es una planilla de pedido/pedido sin comprobante fiscal ni total general impreso. Se cargan únicamente las filas con cantidad e importe mayor a cero. Los precios ya traen los impuestos incluidos.",
  conceptosDelPieLeidos: [],
  lineas: renglonesDe(34),
};
const LUCKY = {
  id: 35,
  estado: "MAL_LEIDO",
  leidoEn: new Date("2026-10-26T01:42:56.930Z"),
  totalLeido: "2026100.00",
  lineasEnElPapel: 4,
  lineasTranscriptas: 4,
  recetaUsada: RECETA,
  recetaVersion: 1,
  explicacionLeida:
    "Se trata de una planilla/lista donde los precios ya incluyen el IVA. Se transcriben únicamente las filas con cantidad solicitada e importe diferente de cero.",
  conceptosDelPieLeidos: [],
  lineas: renglonesDe(35),
};

/** El papel como queda después de `completarLosCostosDelImporte`. */
const completado = (p) => {
  const r = costosQueFaltanDelPapel(p);
  const porOrden = new Map(r.faltan.map((x) => [x.orden, x.costoFinal]));
  return {
    ...p,
    estado: r.puerta.estado,
    lineas: p.lineas.map((l) => ({ ...l, costoFinalRenglon: porOrden.get(l.orden) ?? l.costoFinalRenglon })),
  };
};

test("LA CAUSA, CON LAS FILAS DE PRODUCCIÓN: sin el costo de los renglones nada cierra ni se une", () => {
  const p = pasarPorLaPuerta({ lectura: lecturaDesdeLoGuardado(PHILIPS), receta: RECETA });
  assert.equal(p.estado, ESTADO.MAL_LEIDO, "la hoja sin total queda mal leída en vez de sin total");
  assert.match(p.porque, /PHILIPS MORRIS 10.*\(y 14 más\) le falta el costo final/);
  const l = pasarPorLaPuerta({ lectura: lecturaDesdeLoGuardado(LUCKY), receta: RECETA });
  assert.equal(l.estado, ESTADO.MAL_LEIDO);
  assert.equal(cierranJuntas([PHILIPS, LUCKY]), false);
});

test("1 · EN UN PAPEL SIN IMPUESTOS IMPRESOS, EL COSTO QUE FALTA ES EL IMPORTE, Y SOLO ESE", () => {
  // Desde el 2026-10-26 el criterio es si el papel trae impuestos, no su letra
  // (`papelSinImpuestosImpresos`): la función recibe esa respuesta.
  const philipsMorris = { costoFinal: null, subtotalImpreso: 100800 };
  assert.equal(papelSinImpuestosImpresos(lecturaDesdeLoGuardado(PHILIPS)), true, "las hojas de Mauro no traen ninguno");
  assert.equal(costoQueFaltaDelImporte(philipsMorris, true), 100800);
  // CONTRAPRUEBAS: un papel con impuestos no se completa; un costo dado manda;
  // un importe en $0 es una fila que no se mandó.
  assert.equal(costoQueFaltaDelImporte(philipsMorris, false), null);
  assert.equal(costoQueFaltaDelImporte({ costoFinal: 90000, subtotalImpreso: 100800 }, true), null);
  assert.equal(costoQueFaltaDelImporte({ costoFinal: null, subtotalImpreso: 0 }, true), null);
});

test("1 · LA LECTURA NUEVA: lo que contestó el lector, sin costoFinal, sale con el importe de cada producto", () => {
  // La respuesta del lector para la hoja de Philips: cantidad, precio e importe
  // de cada renglón, ningún costoFinal, sin letra y sin impuestos discriminados.
  const cruda = {
    identidad: {},
    lineas: renglonesDe(34).map((r) => ({
      descripcion: r.textoCrudo,
      cantidad: r.cantidad,
      enQueViene: "unidad",
      precioImpreso: r.netoUnitario,
      importeImpreso: r.subtotalImpreso,
      tipo: "MERCADERIA",
    })),
    pie: {},
    lineasEnElPapel: 15,
    hayTotalImpreso: false,
    discriminaImpuestos: false,
    explicacion: PHILIPS.explicacionLeida,
  };
  const lectura = normalizarLectura(cruda, { interpretada: true });
  assert.deepEqual(
    lectura.lineas.map((l) => l.costoFinal),
    renglonesDe(34).map((r) => r.subtotalImpreso)
  );
  assert.equal(verificarLecturaInterpretada(lectura).sumaCentavos, 168550000, "$1.685.500");
  assert.equal(pasarPorLaPuerta({ lectura, receta: RECETA }).estado, ESTADO.SIN_TOTAL);
  // CONTRAPRUEBA: si el papel discrimina impuestos, no se completa nada.
  const conImpuestos = normalizarLectura({ ...cruda, discriminaImpuestos: true }, { interpretada: true });
  assert.ok(conImpuestos.lineas.every((l) => l.costoFinal === null));
  assert.equal(pasarPorLaPuerta({ lectura: conImpuestos, receta: RECETA }).estado, ESTADO.MAL_LEIDO);
});

test("FACTURA B SIN NINGÚN IMPUESTO IMPRESO: el importe de cada producto es el costo, y cierra", () => {
  // Las 19 filas reales del #298, en un papel que dice FACTURA B y no imprime
  // ningún impuesto —como CCU a veces factura—, con el total al pie. Con la
  // regla de antes (solo "sin factura") quedaba con el costo vacío y "no
  // cierra", igual que pasó con Mauro (2026-10-26).
  const cruda = {
    identidad: { tipo: "B", puntoVenta: "0003", numero: "00001234" },
    lineas: [...renglonesDe(34), ...renglonesDe(35)].map((r) => ({
      descripcion: r.textoCrudo,
      cantidad: r.cantidad,
      precioImpreso: r.netoUnitario,
      importeImpreso: r.subtotalImpreso,
      tipo: "MERCADERIA",
    })),
    pie: { total: 2026100 },
    lineasEnElPapel: 19,
    hayTotalImpreso: true,
    discriminaImpuestos: false,
    explicacion: "Factura B: el precio ya trae el IVA.",
  };
  const lectura = normalizarLectura(cruda, { interpretada: true });
  assert.equal(papelSinImpuestosImpresos(lectura), true);
  assert.equal(lectura.lineas.length, 19);
  assert.ok(lectura.lineas.every((l, i) => l.costoFinal === cruda.lineas[i].importeImpreso));
  const puerta = pasarPorLaPuerta({ lectura, receta: { interpretada: true, tipoComprobante: "B" } });
  assert.equal(puerta.estado, ESTADO.CARGADO);
  assert.equal(puerta.verificacion.sumaCentavos, 202610000, "$2.026.100");
  // CONTRAPRUEBA: la misma B con IVA impreso en cada producto no se completa.
  const conIva = normalizarLectura(
    { ...cruda, lineas: cruda.lineas.map((l) => ({ ...l, alicuotaIva: 21 })) },
    { interpretada: true }
  );
  assert.ok(conIva.lineas.every((l) => l.costoFinal === null));
});

test("1 · LO YA GUARDADO: los 19 costos se completan desde el importe, sin volver a leer", () => {
  const p = costosQueFaltanDelPapel(PHILIPS);
  assert.equal(p.faltan.length, 15);
  assert.equal(p.puerta.estado, ESTADO.SIN_TOTAL, "la hoja de Philips pasa a sin total");
  const l = costosQueFaltanDelPapel(LUCKY);
  assert.equal(l.faltan.length, 4);
  assert.equal(l.puerta.estado, ESTADO.MAL_LEIDO, "sola: $340.600 contra $2.026.100");
  assert.equal(l.puerta.diferenciaCentavos, 34060000 - 202610000);
  // Idempotente: completado, no le falta nada.
  assert.equal(costosQueFaltanDelPapel(completado(PHILIPS)), null);
});

test("2 · LAS DOS HOJAS, CON SUS COSTOS, SON UN COMPROBANTE DE 19 PRODUCTOS QUE CIERRA EN $2.026.100", () => {
  const hojas = [completado(PHILIPS), completado(LUCKY)];
  assert.equal(cierranJuntas(hojas), true);
  const unida = lecturaUnida(hojas.map(lecturaDesdeLoGuardado));
  assert.equal(unida.lineas.length, 19);
  const puerta = pasarPorLaPuerta({ lectura: unida, receta: RECETA });
  assert.equal(puerta.estado, ESTADO.CARGADO);
  assert.equal(puerta.verificacion.totalDeclaradoCentavos, 202610000);
  assert.equal(puerta.verificacion.sumaCentavos, 202610000);
  // La hoja de Lucky es la que cierra y la de Philips la que se le suma, en el
  // orden en que se subieron: primero Philips.
  const porId = new Map(hojas.map((h) => [h.id, h]));
  const ids = hojasQueCierranJuntas({
    conTotal: 35,
    sinTotal: [34],
    cierran: (x) => cierranJuntas(x.map((id) => porId.get(id))),
    orden: [34, 35],
  });
  assert.deepEqual(ids, [34, 35]);
});

test("3 · LAS FILAS CON IMPORTE EN $0 NO SE ESPERAN: con el total cerrando, no falta nada", () => {
  // Una lectura anterior de la hoja de Lucky contó las 24 filas del catálogo,
  // las de importe en $0 incluidas, y avisaba "transcribió 4".
  const hojas = [completado(PHILIPS), { ...completado(LUCKY), lineasEnElPapel: 24 }];
  const unida = lecturaUnida(hojas.map(lecturaDesdeLoGuardado));
  assert.equal(renglonesQueFaltan(unida), null);
  // CONTRAPRUEBA: la hoja sola no cierra, y ahí sí no hay con qué saberlo.
  assert.deepEqual(renglonesQueFaltan(lecturaDesdeLoGuardado(hojas[1])), { declaradas: 24, transcriptas: 4, faltan: 20 });
});

// ── LAS LÍNEAS DEL PEDIDO 298, COMO LAS ARMA `aplanarDetalles` ────────────
// [id, productoLocalId, productoBaseId, nombre, cantidad, precioCosto]; todas pack de 10.
const PEDIDO = [
  [3189, 6076, 2045, "Chester 10 mentolado ", 2, 30780],
  [3190, 6086, 2037, "Chester 20 común", 3, 46980],
  [3191, 6276, 2128, "Dover Rojo", 50, 8800],
  [3192, 9056, 2389, "liverpool pop", 3, 16500],
  [3193, 6164, 2047, "Lucky 10", 1, 35035.2],
  [3194, 6163, 2048, "Lucky 10 mentolado", 2, 35035.2],
  [3195, 6152, 2059, "Lucky 20 convertible xl ", 1, 59346],
  [3196, 6149, 2062, "Lucky origen 20 común mentolado", 5, 37260],
  [3197, 6355, 2161, "Marlboro 10", 2, 38772],
  [3198, 6165, 2046, "Marlboro 10 Uva", 1, 38340],
  [3199, 6290, 2132, "Marlboro 20 Crafted Box", 1, 40500],
  [3200, 6089, 2035, "Marlboro 20 crafted común", 9, 37260],
  [3201, 6088, 2036, "Marlboro 20 crafted coral box", 3, 40500],
  [3202, 6090, 2034, "Marlboro 20 crafted mentolado común", 5, 37260],
  [3203, 6146, 2065, "Marlboro 20 Crafted suave ", 1, 37260],
  [3204, 6287, 2131, "Marlboro 20 Crafted Uva Box", 3, 40500],
  [3205, 6142, 2069, "Marlboro 20 titanio", 1, 70000],
  [3206, 6162, 2049, "Milenio click mentolado", 6, 18300],
  [3207, 6160, 2051, "Milenio coral", 5, 18300],
  [3208, 6159, 2052, "Milenio uva", 6, 18300],
  [3209, 6079, 2043, "Philips 10", 3, 34603.2],
  [3210, 6082, 2041, "Philips 20 común", 2, 54594],
  [3211, 6477, 2219, "philips 20 mentolado box", 2, 58320],
  [3212, 6150, 2061, "Philips 20 red común", 7, 26460],
].map(([id, productoLocalId, productoBaseId, nombre, cantidad, precioCosto]) => ({
  id,
  productoLocalId,
  productoBaseId,
  nombre,
  cantidad,
  precioCosto,
  precioCostoDelPedido: precioCosto,
  factorPack: 10,
}));

test("3 · 30 DE «PHILIPS MORRIS 10» SON 3 PACKS: el precio de la unidad contra el pack de $34.603,20", () => {
  const renglon = completado(PHILIPS).lineas[0];
  assert.equal(renglon.costoFinalRenglon, 100800);
  const analisis = analizarPrecioDeLinea({
    linea: renglon,
    producto: { precio_costo: 34603.2, factor_pack: 10, unidad_medida: "pack", modoCompraProveedor: "BULTO" },
    proveedor: { nombre: "Mauro" },
  });
  assert.equal(analisis.unidad.unidad, UNIDAD.POR_UNIDAD);
  assert.equal(lecturaElegida({ ...analisis.unidad, lecturas: analisis.unidad.lecturas }).bultos, 3);
  assert.equal(analisis.precioAEscribir, 33600, "no es una baja del 90 %");
  // CONTRAPRUEBA: el mismo renglón sin el costo —como estaba— no tiene precio ni escala.
  const sinCosto = analizarPrecioDeLinea({
    linea: PHILIPS.lineas[0],
    producto: { precio_costo: 34603.2, factor_pack: 10, unidad_medida: "pack", modoCompraProveedor: "BULTO" },
    proveedor: { nombre: "Mauro" },
  });
  assert.equal(sinCosto.sinCostoDelPapel, true);
  assert.equal(sinCosto.unidad, null);
});

test("3 · LO QUE DICE EL RENGLÓN DECIDE DONDE EL PRECIO DEJA DOS LECTURAS, Y SOLO AHÍ", () => {
  // Bulto de 2 a $1.000 facturado a $670: unidad y bulto explican el precio.
  assert.equal(deducirUnidad({ costoAnteriorFinal: 1000, precioFacturaFinal: 670, factorPack: 2 }).unidad, UNIDAD.NO_SE_PUEDE_DECIDIR);
  assert.equal(deducirUnidad({ costoAnteriorFinal: 1000, precioFacturaFinal: 670, factorPack: 2, enQueViene: "unidad" }).unidad, UNIDAD.POR_UNIDAD);
  assert.equal(deducirUnidad({ costoAnteriorFinal: 1000, precioFacturaFinal: 670, factorPack: 2, enQueViene: "bulto de 2" }).unidad, UNIDAD.POR_BULTO);
  // Lo que el precio no explica no se fuerza: el pack de Philips 10 a $3.360 con «bulto».
  assert.equal(deducirUnidad({ costoAnteriorFinal: 34603.2, precioFacturaFinal: 3360, factorPack: 10, enQueViene: "bulto" }).unidad, UNIDAD.POR_UNIDAD);
  assert.equal(unidadesQueDiceElRenglon("unidad"), 1);
  // Los valores reales de la boleta de DYSSA: los que dicen un número, y los que no.
  assert.equal(unidadesQueDiceElRenglon("packs de 6 latas"), 6);
  assert.equal(unidadesQueDiceElRenglon("tiras de 12"), 12);
  assert.equal(unidadesQueDiceElRenglon("paquetes"), null, "no dice cuántas trae: no se adivina");
  assert.equal(unidadesQueDiceElRenglon("botellas"), null);
  assert.equal(unidadesQueDiceElRenglon(""), null);
});

test("4 · CON PEDIDO, SE BUSCA PRIMERO EN EL PEDIDO, POR NOMBRE Y POR PRECIO", () => {
  // 30 × $3.360 del papel: $33.600 el pack contra $34.603,20 de la línea.
  const precio = { importe: 100800, cantidad: 30 };
  const elegida = lineaDelPedidoPorNombreYPrecio({ texto: "PHILIPS MORRIS 10", lineasDelPedido: PEDIDO, precio, variacionPct: 10 });
  assert.equal(elegida?.id, 3209);
  const r = buscarCandidatos({ linea: { descripcion: "PHILIPS MORRIS 10" }, lineasDelPedido: PEDIDO, pedidoVinculaSolo: true, precio, variacionPct: 10 });
  assert.equal(r.origen, ORIGEN_VINCULO.LINEA_DEL_PEDIDO);
  assert.equal(r.vinculoAutomatico?.productoBaseId, 2043);
  assert.equal(r.pedidoDetalleId, 3209);
  // CONTRAPRUEBAS: con un precio que no cuadra, o sin pedirlo, solo sugiere.
  const triple = { importe: 100800 * 3, cantidad: 30 };
  assert.equal(precioCuadra({ precio: triple, linea: PEDIDO[20], variacionPct: 10 }), false);
  assert.equal(lineaDelPedidoPorNombreYPrecio({ texto: "PHILIPS MORRIS 10", lineasDelPedido: PEDIDO, precio: triple, variacionPct: 10 }), null);
  assert.equal(buscarCandidatos({ linea: { descripcion: "PHILIPS MORRIS 10" }, lineasDelPedido: PEDIDO }).vinculoAutomatico, null);
  // Dos líneas del pedido con el mismo precio no se adivinan: Lucky 10 y Lucky 10 mentolado.
  assert.equal(lineaDelPedidoPorNombreYPrecio({ texto: "LUCKY STRIKE 10", lineasDelPedido: PEDIDO, precio: { importe: 33600, cantidad: 10 }, variacionPct: 10 }), null);
});

test("4 · LO VINCULADO SE GUARDA COMO ALIAS AUTOMÁTICO, NUNCA EN UN PEDIDO NACIDO DE LA FACTURA", () => {
  const v = codigoDe("lib/compras-proveedor/comprobante/vincularContraElPedido.js");
  assert.match(v, /pedido\.nacidoDeFactura === true/);
  assert.match(v, /pedidoVinculaSolo: true/);
  assert.match(v, /where: \{ id: l\.id, productoLocalId: null \}/, "una decisión a mano gana");
  assert.match(v, /persistirIdentidad\(\s*tx,\s*filasDeIdentidad\(/);
  assert.doesNotMatch(v, /confirmadaPorUsuarioId/, "no es una confirmación de nadie");
});

test("LOS PAPELES YA SUBIDOS SE COMPLETAN Y SE UNEN AL ABRIR, Y DESPUÉS DE CADA LECTURA", () => {
  const panel = codigoDe("components/comprobantes/PanelComprobantes.jsx");
  assert.match(panel, /fetch\("\/api\/compras-proveedor\/recepcion\/recalcular"/);
  const ruta = codigoDe("app/api/compras-proveedor/recepcion/recalcular/route.js");
  assert.match(ruta, /checkPerm\(session, "compras\.recibir"\)/);
  assert.match(ruta, /agruparLasHojasDelPapel\(prisma/);
  assert.match(ruta, /vincularContraElPedido\(prisma/);
  const leer = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(leer, /agruparLasHojasDelPapel\(prisma/);
  assert.match(leer, /await vincularContraElPedido\(prisma/);
  // Los costos se completan ANTES de mirar qué hojas hay: sin ellos ninguna se suma.
  const fusion = codigoDe("lib/compras-proveedor/comprobante/fusionarHojas.js");
  const agrupar = fusion.slice(fusion.indexOf("export async function agruparLasHojasDelPapel"));
  assert.ok(
    agrupar.indexOf("await completarLosCostosDelImporte(db, deEstaCompra)") > 0 &&
      agrupar.indexOf("await completarLosCostosDelImporte(db, deEstaCompra)") < agrupar.indexOf("const hermanos"),
    "agruparLasHojasDelPapel completa los costos antes de traer las hojas"
  );
  assert.match(fusion, /unirLosQueCierranJuntos\(db, \{ grupoId, pedidoId \}\)/);
});

// ══════════════════════════════════════════════════════════════════════════
// LA SALIDA A MANO CUANDO LA LECTURA FALLA (Emanuel, 2026-10-26)
// ══════════════════════════════════════════════════════════════════════════
//
// El papel de las dos hojas ya unido, como queda guardado: un comprobante de 19
// productos con sus costos, que cierra en $2.026.100. Los de Lucky van después
// de los de Philips, con su orden corrido.
const UNIDO = (() => {
  const philips = completado(PHILIPS);
  const lucky = completado(LUCKY);
  return {
    ...philips,
    estado: "CARGADO",
    totalLeido: LUCKY.totalLeido,
    lineas: [...philips.lineas, ...lucky.lineas.map((l) => ({ ...l, orden: l.orden + 15 }))],
  };
})();
const con = (orden, cambios) => ({
  ...UNIDO,
  lineas: UNIDO.lineas.map((l) => (l.orden === orden ? { ...l, ...cambios } : l)),
});
const veredicto = (c) => pasarPorLaPuerta({ lectura: lecturaDesdeLoGuardado(c), receta: RECETA });
const BOX_CONV = UNIDO.lineas.find((l) => l.textoCrudo === "M.CRAFTED 20 BOX CONV");
const UVA = UNIDO.lineas.find((l) => l.textoCrudo === "M.CRAFTED 20 BOX UVA");

test("A MANO · «NO VINO» SACA EL PRODUCTO DE LA CUENTA DEL PAPEL, Y SE DESHACE", () => {
  assert.equal(BOX_CONV.subtotalImpreso, 40500, "BOX CONV leído con $40.500");
  assert.equal(veredicto(UNIDO).estado, ESTADO.CARGADO);
  const sinBoxConv = veredicto(con(BOX_CONV.orden, { noVino: true }));
  assert.equal(lecturaDesdeLoGuardado(con(BOX_CONV.orden, { noVino: true })).lineas.length, 18);
  // La misma puerta: sin los $40.500 la suma queda corta contra el total impreso.
  assert.equal(sinBoxConv.verificacion.sumaCentavos, 202610000 - 4050000);
  assert.equal(sinBoxConv.estado, ESTADO.MAL_LEIDO);
  // Deshecho, vuelve a cerrar.
  assert.equal(veredicto(con(BOX_CONV.orden, { noVino: false })).estado, ESTADO.CARGADO);
});

test("A MANO · LO QUE NO VINO NO ENTRA: ni stock ni cuenta de lo que queda a medias", () => {
  const fila = { lineaId: 1, pedidoDetalleId: 2565, cantidad: 10, noVino: true, revisada: false };
  assert.equal(recibidosDelCierre({ filas: [fila] })[2565], undefined, "no se manda nada por esa línea del pedido");
  assert.equal(recibidosDelCierre({ filas: [{ ...fila, noVino: false }] })[2565], 10, "contraprueba");
  assert.equal(resumenDelCierre({ filas: [fila] }).sinRevisar, 0);
});

test("A MANO · UVA CORREGIDA A 30 u Y $121.500: el precio sale solo, y pasa por la misma cuenta", () => {
  const leido = lecturaDesdeLoGuardado(UNIDO).lineas.find((l) => l.orden === UVA.orden);
  assert.equal(leido.subtotalImpreso, 328500, "leída con 90 u y $328.500");
  const sinImpuestos = papelGuardadoSinImpuestos(UNIDO);
  assert.equal(sinImpuestos, true);
  const puesto = productoPuestoAMano({ leido, cantidad: 30, importe: 121500, sinImpuestos });
  assert.deepEqual(puesto, { cantidad: 30, netoUnitario: 4050, subtotal: 121500, costoFinal: 121500 });
  // La misma puerta sobre lo corregido: la suma baja exactamente lo que cambió.
  const corregido = con(UVA.orden, { cantidad: 30, netoUnitario: 4050, subtotalCorregido: 121500, costoFinalRenglon: 121500 });
  assert.equal(veredicto(corregido).verificacion.sumaCentavos, 202610000 - 32850000 + 12150000);
  // Con impuestos impresos el costo guarda la proporción leída en ese producto.
  const conIva = productoPuestoAMano({ leido: { subtotalImpreso: 100, costoFinal: 121 }, cantidad: 2, importe: 200, sinImpuestos: false });
  assert.equal(conIva.costoFinal, 242);
  // Y sin con qué, no se inventa: queda vacío y la puerta nombra el producto.
  assert.equal(productoPuestoAMano({ leido: {}, cantidad: 2, importe: 200, sinImpuestos: false }).costoFinal, null);
  assert.ok(productoPuestoAMano({ leido, cantidad: 0, importe: 121500, sinImpuestos }).error);
});

test("A MANO · LO QUE TOCÓ UNA PERSONA NO LO PISA EL RECÁLCULO AL ABRIR", () => {
  // Philips recién leída: los 15 costos vacíos. Si alguien corrigió el primero,
  // el completado automático no lo toca aunque le siga faltando el costo.
  const tocada = { ...PHILIPS, lineas: PHILIPS.lineas.map((l) => (l.orden === 1 ? { ...l, corregidoAManoEn: new Date() } : l)) };
  const r = costosQueFaltanDelPapel(tocada);
  assert.equal(r.faltan.length, 14);
  assert.ok(!r.faltan.some((x) => x.orden === 1));
  const fusion = codigoDe("lib/compras-proveedor/comprobante/fusionarHojas.js");
  assert.match(fusion, /costoFinalRenglon: null, corregidoAManoEn: null/);
  const acomodo = codigoDe("lib/compras-proveedor/comprobante/conciliacionDelPedido.js");
  assert.match(acomodo, /l\.corregidoAManoEn != null \|\| l\.noVino === true/);
});

test("A MANO · LA RUTA CORRIGE CUALQUIER PAPEL NO RECIBIDO, LO MARCA Y LO REGISTRA", () => {
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/corregir/[id]/route.js");
  assert.doesNotMatch(ruta, /c\.estado !== ESTADO\.MAL_LEIDO/, "ya no solo los que no cerraron");
  assert.match(ruta, /c\.confirmadoEn != null \|\| pedido\?\.estado === "RECIBIDO"/);
  assert.match(ruta, /productoPuestoAMano\(\{ leido, cantidad: r\.cantidad, importe: r\.importe, sinImpuestos \}\)/);
  assert.match(ruta, /\{ noVino: puesto\.noVino, corregidoAManoEn: ahora \}/);
  assert.match(ruta, /tx\.correccionManualRenglon\.create\(/);
  // Para la segunda revisión, dicho como lo que es.
  assert.match(textoDeLaCorreccionManual({ textoCrudo: "M.CRAFTED 20 BOX CONV", leido: { noVino: false }, puesto: { noVino: true } }), /no vino/);
  assert.match(
    textoDeLaCorreccionManual({ textoCrudo: "M.CRAFTED 20 BOX UVA", leido: { cantidad: 90, subtotal: 328500 }, puesto: { cantidad: 30, subtotal: 121500 } }),
    /cantidad 90 → 30, importe \$\s?328\.500,00 → \$\s?121\.500,00/
  );
});

test("A MANO · LA HOJA DE CORREGIR: cantidad, importe, el precio a la vista y «No vino»", () => {
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(hoja, /\["Cantidad", papelCantidad, setPapelCantidad, 3\],\s*\["Importe", papelImporte, setPapelImporte, 2\],/);
  assert.match(hoja, /precioDeLaUnidad\(papelCantidad, papelImporte\)/);
  assert.match(hoja, /\{fila\.noVino \? "Vino: deshacer «No vino»" : "No vino"\}/);
  // Para cualquier papel que no se confirmó, no solo el que no cerró.
  const filas = codigoDe("lib/compras-proveedor/comprobante/filasDeConciliacion.js");
  assert.match(filas, /correccionDelPapel:\s*c\.confirmadoEn == null/);
  const tarjeta = codigoDe("components/compras-proveedor/TarjetaLineaFactura.jsx");
  assert.match(tarjeta, /fila\?\.noVino \? \(\s*"No vino"/);
});
