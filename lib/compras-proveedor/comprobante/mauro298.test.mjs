// EL PEDIDO DE MAURO #298: UN CATÁLOGO DE DOS HOJAS, LEÍDO COMO DOS FACTURAS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/mauro298.test.mjs
//
// Los números son los del papel, verificados a mano por Emanuel (2026-10-26):
//
//   · hoja 1 (Philips, Chesterfield, Marlboro, M.Crafted): 15 productos con
//     importe, suma $1.685.500, sin total impreso;
//   · hoja 2 (Lucky, Camel): 4 productos con importe, suma $340.600, y al pie
//     TOTAL $2.026.100, que es el de LAS DOS HOJAS;
//   · el lector contó 24 filas en la hoja 2 —las del catálogo con importe en $0,
//     que no se mandaron—.
//
// Lo que NO es del papel: cómo se reparte cada suma entre sus productos. La
// cuenta solo mira las sumas, y por eso el reparto de abajo es el más simple que
// las respeta. La forma de las filas es la de `ComprobanteProveedor` con sus
// `lineas`, como las lee `fusionarHojas`.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cierranJuntas } from "./fusionarHojas.js";
import { hojasQueCierranJuntas, lecturaUnida } from "./agruparHojas.js";
import { lecturaDesdeLoGuardado } from "./lecturaGuardada.js";
import { pasarPorLaPuerta, ESTADO } from "./lector/puerta.js";
import { renglonesQueFaltan, verificarLecturaInterpretada } from "./lector/lecturaInterpretada.js";
import { deducirUnidad, lecturasPosibles, lecturaElegida, UNIDAD } from "./unidadPorPrecio.js";
import { unidadesQueDiceElRenglon } from "../contenidoDelBulto.js";
import { buscarCandidatos, lineaDelPedidoPorNombreYPrecio, precioCuadra, ORIGEN_VINCULO } from "./vinculo.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// Cada fila con las cuatro columnas del catálogo: cantidad, nombre, precio de la
// unidad e importe.
const renglones = (cuantos, suma, desde = 1) =>
  Array.from({ length: cuantos }, (_, i) => {
    const importe = i < cuantos - 1 ? Math.floor(suma / cuantos) : suma - Math.floor(suma / cuantos) * (cuantos - 1);
    return {
      orden: desde + i,
      textoCrudo: `PRODUCTO ${desde + i}`,
      cantidad: 10,
      netoUnitario: importe / 10,
      subtotalImpreso: importe,
      costoFinalRenglon: importe,
      tipoRenglon: "MERCADERIA",
      enQueViene: "unidad",
    };
  });

const RECETA = { interpretada: true, explicacion: "Catálogo de Mauro: la cantidad va en unidades.", tipoComprobante: "SIN_FACTURA" };
// Como quedaron guardadas: la 1 SIN_TOTAL; la 2 MAL_LEIDO, porque sola no cierra.
const HOJA_1 = { id: 501, estado: "SIN_TOTAL", leidoEn: new Date(), totalLeido: null, lineasEnElPapel: 15, recetaUsada: RECETA, explicacionLeida: RECETA.explicacion, lineas: renglones(15, 1685500) };
const HOJA_2 = { id: 502, estado: "MAL_LEIDO", leidoEn: new Date(), totalLeido: 2026100, lineasEnElPapel: 24, recetaUsada: RECETA, explicacionLeida: RECETA.explicacion, lineas: renglones(4, 340600, 1) };

test("1 · LAS DOS HOJAS CIERRAN JUNTAS EN $2.026.100, Y LA DE LUCKY SOLA NO", () => {
  assert.equal(cierranJuntas([HOJA_1, HOJA_2]), true);
  assert.equal(cierranJuntas([HOJA_2]), false, "sola: $340.600 contra $2.026.100");
  const unida = lecturaUnida([HOJA_1, HOJA_2].map(lecturaDesdeLoGuardado));
  assert.equal(unida.lineas.length, 19, "un comprobante de 19 productos");
  const puerta = pasarPorLaPuerta({ lectura: unida, receta: RECETA });
  assert.equal(puerta.estado, ESTADO.CARGADO);
  assert.equal(puerta.verificacion.totalDeclaradoCentavos, 202610000);
  assert.equal(puerta.verificacion.sumaCentavos, 202610000);
});

test("1 · SE UNEN SIN PREGUNTAR, EN ORDEN DE SUBIDA, Y UN PAPEL DE MÁS NO SE METE", () => {
  // Un remito suelto sin total en el mismo pedido: sumarlo rompería la cuenta.
  const REMITO = { ...HOJA_1, id: 503, lineasEnElPapel: 1, lineas: renglones(1, 50000) };
  const porId = new Map([HOJA_1, HOJA_2, REMITO].map((h) => [h.id, h]));
  const cierran = (ids) => cierranJuntas(ids.map((id) => porId.get(id)));
  const ids = hojasQueCierranJuntas({ conTotal: 502, sinTotal: [501, 503], cierran, orden: [501, 502, 503] });
  assert.deepEqual(ids, [501, 502]);
  // CONTRAPRUEBA: sin la hoja 1 no hay con qué cerrar.
  assert.equal(hojasQueCierranJuntas({ conTotal: 502, sinTotal: [503], cierran, orden: [502, 503] }), null);
});

test("3 · LAS FILAS CON IMPORTE EN $0 NO SE ESPERAN: con el total cerrando, no falta nada", () => {
  const unida = lecturaUnida([HOJA_1, HOJA_2].map(lecturaDesdeLoGuardado));
  assert.equal(unida.lineasEnElPapel, 39, "15 + 24 contadas");
  assert.equal(renglonesQueFaltan(unida), null);
  assert.equal(pasarPorLaPuerta({ lectura: unida, receta: RECETA }).faltanLineas, null);
  // La hoja de Lucky como papel suelto que cierra contra su propio total: completa con 4.
  const lucky = { ...lecturaDesdeLoGuardado({ ...HOJA_2, totalLeido: 340600 }) };
  assert.equal(verificarLecturaInterpretada(lucky).cierra, true);
  assert.equal(renglonesQueFaltan(lucky), null);
  // CONTRAPRUEBA: sin total que cierre no hay con qué saberlo, y el aviso sigue.
  assert.deepEqual(renglonesQueFaltan(lecturaDesdeLoGuardado(HOJA_2)), { declaradas: 24, transcriptas: 4, faltan: 20 });
});

test("2 · 30 DE «PHILIPS MORRIS 10» SON 3 PACKS DE 10: el precio de la unidad contra el del pack", () => {
  const u = deducirUnidad({ costoAnteriorFinal: 33600, precioFacturaFinal: 3360, factorPack: 10, enQueViene: "unidad" });
  assert.equal(u.unidad, UNIDAD.POR_UNIDAD);
  const l = lecturaElegida({ ...u, lecturas: lecturasPosibles({ cantidad: 30, precioFinal: 3360, factorPack: 10, unidadesPorFacturada: u.unidadesPorFacturada, posibles: u.posibles }) });
  assert.equal(l.bultos, 3);
  assert.equal(l.costoPorBulto, 33600, "no es una baja del 90 %");
});

test("2 · LO QUE DICE EL RENGLÓN DECIDE DONDE EL PRECIO DEJA DOS LECTURAS, Y SOLO AHÍ", () => {
  // Bulto de 2 a $1.000 facturado a $670: unidad y bulto explican el precio.
  assert.equal(deducirUnidad({ costoAnteriorFinal: 1000, precioFacturaFinal: 670, factorPack: 2 }).unidad, UNIDAD.NO_SE_PUEDE_DECIDIR);
  assert.equal(deducirUnidad({ costoAnteriorFinal: 1000, precioFacturaFinal: 670, factorPack: 2, enQueViene: "unidad" }).unidad, UNIDAD.POR_UNIDAD);
  assert.equal(deducirUnidad({ costoAnteriorFinal: 1000, precioFacturaFinal: 670, factorPack: 2, enQueViene: "bulto de 2" }).unidad, UNIDAD.POR_BULTO);
  // Lo que el precio no explica no se fuerza: bulto de 10 a $33.600, «bulto», $3.360.
  assert.equal(deducirUnidad({ costoAnteriorFinal: 33600, precioFacturaFinal: 3360, factorPack: 10, enQueViene: "bulto" }).unidad, UNIDAD.POR_UNIDAD);
  assert.equal(unidadesQueDiceElRenglon("unidad"), 1);
  // Los valores reales de la boleta de DYSSA: los que dicen un número, y los que no.
  assert.equal(unidadesQueDiceElRenglon("packs de 6 latas"), 6);
  assert.equal(unidadesQueDiceElRenglon("tiras de 12"), 12);
  assert.equal(unidadesQueDiceElRenglon("paquetes"), null, "no dice cuántas trae: no se adivina");
  assert.equal(unidadesQueDiceElRenglon("botellas"), null);
  assert.equal(unidadesQueDiceElRenglon(""), null);
});

// Las líneas del pedido como las arma `aplanarDetalles`, con los nombres y costos
// del pedido de Mauro #232 (los de `papelDelPedido.test.mjs`).
const PEDIDO = [
  { id: 2574, productoBaseId: 2031, nombre: "Philips 10", precioCostoDelPedido: 34603.2, factorPack: 10 },
  { id: 2575, productoBaseId: 2032, nombre: "Philips 20 box", precioCostoDelPedido: 56500, factorPack: 10 },
  { id: 2565, productoBaseId: 2019, nombre: "Marlboro 20 Crafted Box", precioCostoDelPedido: 40500, factorPack: 10 },
  { id: 2560, productoBaseId: 2030, nombre: "Lucky 10 mentolado", precioCostoDelPedido: 35035.2, factorPack: 10 },
];

test("4 · CON PEDIDO, SE BUSCA PRIMERO EN EL PEDIDO, POR NOMBRE Y POR PRECIO", () => {
  // 40 × $3.360 del papel: $33.600 el pack contra $34.603,20 de la línea.
  const elegida = lineaDelPedidoPorNombreYPrecio({ texto: "PHILIPS MORRIS 10", lineasDelPedido: PEDIDO, precio: { importe: 134400, cantidad: 40 } });
  assert.equal(elegida?.id, 2574);
  const r = buscarCandidatos({ linea: { descripcion: "PHILIPS MORRIS 10" }, lineasDelPedido: PEDIDO, pedidoVinculaSolo: true, precio: { importe: 134400, cantidad: 40 } });
  assert.equal(r.origen, ORIGEN_VINCULO.LINEA_DEL_PEDIDO);
  assert.equal(r.vinculoAutomatico?.productoBaseId, 2031);
  assert.equal(r.pedidoDetalleId, 2574);
  // CONTRAPRUEBAS: con un precio que no cuadra, o sin pedirlo, solo sugiere.
  assert.equal(precioCuadra({ precio: { importe: 134400 * 3, cantidad: 40 }, linea: PEDIDO[0] }), false);
  assert.equal(lineaDelPedidoPorNombreYPrecio({ texto: "PHILIPS MORRIS 10", lineasDelPedido: PEDIDO, precio: { importe: 134400 * 3, cantidad: 40 } }), null);
  assert.equal(buscarCandidatos({ linea: { descripcion: "PHILIPS MORRIS 10" }, lineasDelPedido: PEDIDO }).vinculoAutomatico, null);
  // Un nombre que contradice la marca no se ata por más que el precio cuadre.
  assert.equal(lineaDelPedidoPorNombreYPrecio({ texto: "M.CRAFTED 20 BOX", lineasDelPedido: PEDIDO, precio: { importe: 81000, cantidad: 20 } }), null);
});

test("4 · LO VINCULADO SE GUARDA COMO ALIAS AUTOMÁTICO, NUNCA EN UN PEDIDO NACIDO DE LA FACTURA", () => {
  const v = codigoDe("lib/compras-proveedor/comprobante/vincularContraElPedido.js");
  assert.match(v, /pedido\.nacidoDeFactura === true/);
  assert.match(v, /pedidoVinculaSolo: true/);
  assert.match(v, /where: \{ id: l\.id, productoLocalId: null \}/, "una decisión a mano gana");
  assert.match(v, /persistirIdentidad\(\s*tx,\s*filasDeIdentidad\(/);
  assert.doesNotMatch(v, /confirmadaPorUsuarioId/, "no es una confirmación de nadie");
});

test("LOS PAPELES YA SUBIDOS SE RECALCULAN AL ABRIR, Y DESPUÉS DE CADA LECTURA", () => {
  const panel = codigoDe("components/comprobantes/PanelComprobantes.jsx");
  assert.match(panel, /fetch\("\/api\/compras-proveedor\/recepcion\/recalcular"/);
  const ruta = codigoDe("app/api/compras-proveedor/recepcion/recalcular/route.js");
  assert.match(ruta, /checkPerm\(session, "compras\.recibir"\)/);
  assert.match(ruta, /agruparLasHojasDelPapel\(prisma/);
  assert.match(ruta, /vincularContraElPedido\(prisma/);
  const leer = codigoDe("app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(leer, /await vincularContraElPedido\(prisma/);
  const fusion = codigoDe("lib/compras-proveedor/comprobante/fusionarHojas.js");
  assert.match(fusion, /unirLosQueCierranJuntos\(db, \{ grupoId, pedidoId \}\)/);
});
