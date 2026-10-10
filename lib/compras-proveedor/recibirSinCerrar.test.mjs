// UNA BOLETA QUE NO CIERRA NO PUEDE DEJAR LA MERCADERÍA AFUERA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/recibirSinCerrar.test.mjs
//
// ── LA REGLA (Emanuel, 2026-10-10) ───────────────────────────────────────
//
// "Esa boleta mal leída ya no puede ingresar si yo no estoy reparando el
// sistema" no puede pasar nunca. El caso: Secco #256 en producción, Flash leyó
// bien los diez renglones y la receta genérica le sumó un 21 % que no existe:
// MAL_LEIDO por $193.732,11, y la mercadería quedó afuera.
//
// Lo que este candado afirma:
//   · con un comprobante MAL_LEIDO se recibe igual: entra el stock de lo
//     vinculado y NINGÚN costo se escribe —"dejar el que tenía" forzado—, y el
//     pedido queda "recibido sin cerrar" con el motivo;
//   · un renglón sin vincular no entra;
//   · corregir a mano un renglón que hace cerrar la cuenta lo pasa a cerrado;
//   · la corrección queda registrada con lo leído y lo puesto;
//   · SIN_TOTAL (Mauro) y CARGADO (DYSSA, DAS) no cambian;
//   · la respuesta cruda del lector queda guardada.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { papelQueNoCierra, recibidosDelCierre } from "@/lib/compras-proveedor/cierreDeRecepcion";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import {
  estadoDeLinea,
  hayDiferenciaDePrecio,
  hayQueDecidirElPrecio,
  motivoSinComparacion,
  ESTADO_LINEA,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { conLosRenglonesCorregidos, conLosSubtotalesCorregidos } from "@/lib/compras-proveedor/comprobante/lecturaGuardada";
import { normalizarLectura } from "@/lib/compras-proveedor/comprobante/lector/contrato";
import { pasarPorLaPuerta, ESTADO } from "@/lib/compras-proveedor/comprobante/lector/puerta";
import { crearLectorGemini } from "@/lib/compras-proveedor/comprobante/lector/gemini";
import { leerConCadena } from "@/lib/compras-proveedor/comprobante/lector/cadena";
import { medicionDeLaLlamada } from "@/lib/compras-proveedor/comprobante/lector/medicionDeLaLlamada";
import { textoDeLaCorreccionManual } from "@/lib/compras-proveedor/comprobante/correccionManual";

const sinComentarios = (ruta) =>
  fs
    .readFileSync(new URL(`../../${ruta}`, import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

// El papel de Secco #256, transcripto de la foto (ver `boletaSecco.fixture.json`).
const { _origen, ...PAPEL } = JSON.parse(
  fs.readFileSync(new URL("./comprobante/boletaSecco.fixture.json", import.meta.url), "utf8")
);
const lecturaDeFlash = () =>
  normalizarLectura({
    identidad: {}, lineasEnElPapel: 10, hayTotalImpreso: true, pie: PAPEL.pie,
    lineas: PAPEL.lineas.map((l) => ({
      codigoProveedor: l.codigoProveedor, cantidad: l.cantidad, descripcion: l.descripcion,
      netoUnitario: l.precio, bonificacion: l.bonificacion ?? 0, subtotalImpreso: l.total,
    })),
  });

// ── EL COMPROBANTE #256 COMO QUEDÓ EN LA BASE ─────────────────────────────

/**
 * Las columnas que la conciliación pide de `ComprobanteLinea`, con la lectura
 * de Flash, y lo que les agrega `analizarLineas`: la línea del pedido resuelta
 * en `pedidoDetalle` —de ahí sale el costo del ERP— y el `precio` del análisis.
 */
function comprobante256({ estado = "MAL_LEIDO", vinculados = [1] } = {}) {
  return {
    id: 23, estado, tipo: null, numero: null, fecha: null, totalLeido: 922533.84, diferenciaCentavos: 19373211,
    lineas: lecturaDeFlash().lineas.map((l, i) => ({
      id: 900 + i, orden: i + 1, textoCrudo: l.descripcion, codigoProveedor: l.codigoProveedor,
      cantidad: l.cantidad, netoUnitario: l.netoUnitario, subtotalImpreso: l.subtotalImpreso, subtotalCorregido: null,
      productoLocalId: vinculados.includes(i + 1) ? 50 + i : null,
      pedidoDetalleId: vinculados.includes(i + 1) ? 70 + i : null,
      pedidoDetalle: vinculados.includes(i + 1) ? { ...detalle70, id: 70 + i } : null,
      // El análisis de precio con la receta genérica: lo que propone es el 21 % de más.
      precio: { precioFinal: 11369.39, costoAnterior: 9000, precioAEscribir: 11369.39, decision: null },
    })),
  };
}
const detalle70 = { id: 70, cantidad: 10, precioCosto: 9000, cantidadRecibida: null, unidad: "BULTO", productoBaseId: 1, factorPack: 6 };

test("SECCO #256 NO CIERRA → SE RECIBE IGUAL, SIN TOCAR COSTOS, Y QUEDA DICHO POR QUÉ", () => {
  const r = papelQueNoCierra([{ estado: "MAL_LEIDO", diferenciaCentavos: 19373211, numero: null }]);
  assert.equal(r.noCierra, true);
  assert.match(r.motivo, /no cerraba por \$\s?193\.732,11/);
  assert.match(r.motivo, /los costos quedaron como estaban/);
});

test("CARGADO (DYSSA, DAS) Y SIN_TOTAL (MAURO) NO CAMBIAN", () => {
  for (const estado of ["CARGADO", "SIN_TOTAL", "DIFIERE"]) {
    assert.deepEqual(papelQueNoCierra([{ estado, diferenciaCentavos: 0 }]), { noCierra: false, motivo: null }, estado);
  }
  // Y en la fila: solo MAL_LEIDO apaga el precio.
  for (const estado of ["CARGADO", "SIN_TOTAL"]) {
    const [f] = filasDeConciliacion({ comprobantes: [comprobante256({ estado })], detalles: [detalle70] }).grupos[0].filas;
    assert.equal(f.papelNoCierra, false, estado);
    assert.equal(f.correccionDelPapel, null, estado);
  }
});

test("LA FILA DE UN PAPEL QUE NO CIERRA NO OFRECE ACEPTAR EL PRECIO", () => {
  const { grupos } = filasDeConciliacion({ comprobantes: [comprobante256()], detalles: [detalle70] });
  const lima = grupos[0].filas[0];
  assert.equal(lima.papelNoCierra, true);
  assert.equal(hayDiferenciaDePrecio(lima), false);
  assert.equal(hayQueDecidirElPrecio(lima), false);
  assert.match(motivoSinComparacion(lima), /no cierra/);
  assert.notEqual(estadoDeLinea(lima), ESTADO_LINEA.PRECIO_DISTINTO);
  // CONTRAPRUEBA: la misma fila con el papel cerrado sí pregunta.
  const cerrado = filasDeConciliacion({ comprobantes: [comprobante256({ estado: "CARGADO" })], detalles: [detalle70] })
    .grupos[0].filas[0];
  assert.equal(cerrado.costoCatalogo, 9000);
  assert.equal(hayDiferenciaDePrecio(cerrado), true);
  assert.equal(hayDiferenciaDePrecio(lima), false);
  // Y la hoja recibe lo que leyó el lector, para corregirlo.
  assert.deepEqual(lima.correccionDelPapel, { comprobanteId: 23, orden: 1, cantidad: 10, netoUnitario: 10800.218, subtotal: 93961.9 });
});

test("ENTRA LO VINCULADO; UN RENGLÓN SIN VINCULAR NO ENTRA", () => {
  const { grupos } = filasDeConciliacion({ comprobantes: [comprobante256({ vinculados: [1] })], detalles: [detalle70] });
  const recibidos = recibidosDelCierre({ filas: grupos[0].filas });
  // Solo el Lima Limón, el único vinculado a una línea del pedido.
  assert.deepEqual(Object.keys(recibidos), ["70"]);
});

test("EL CIERRE: CON UN PAPEL QUE NO CIERRA, NINGÚN COSTO SE ESCRIBE Y SE MARCA EL PEDIDO", () => {
  const ruta = sinComentarios("app/api/compras-proveedor/recibir/[id]/route.js");
  assert.match(ruta, /select: \{ totalLeido: true, estado: true, diferenciaCentavos: true, numero: true \}/);
  assert.match(ruta, /const sinCerrar = papelQueNoCierra\(facturasDelPedido\);/);
  assert.match(ruta, /for \(const det of pedido\.detalles\) \{\s*costosExcluidos\.add\(det\.id\);\s*costosAceptados\.delete\(det\.id\);/);
  assert.match(ruta, /recibidoSinCerrar: sinCerrar\.noCierra,\s*motivoSinCerrar: sinCerrar\.motivo,/);
  // Y la exclusión es la que gobierna la escritura, sin frontera y con ella.
  assert.match(ruta, /: !costosExcluidos\.has\(det\.id\);/);
  assert.match(ruta, /excluidaAMano: costosExcluidos\.has\(det\.id\),/);
  // Aceptar un precio de ese papel se rechaza en el servidor.
  const aceptar = sinComentarios("app/api/compras-proveedor/comprobantes/aceptar-precio/route.js");
  assert.match(aceptar, /if \(linea\.comprobante\.estado === "MAL_LEIDO"\) \{/);
});

// ── CORREGIR A MANO ──────────────────────────────────────────────────────

test("CORREGIR UN RENGLÓN QUE HACE CERRAR LA CUENTA LO PASA A CERRADO", () => {
  // El papel de Secco con "IVA ya incluido", y el Baggio mal leído: 157.485,82.
  const receta = { alicuotaIvaPct: 0, ivaPorLinea: false, percepciones: [], percepcionesEnCosto: true };
  const leida = lecturaDeFlash();
  const conOrden = { ...leida, lineas: leida.lineas.map((l, i) => ({ ...l, orden: i + 1 })) };
  const mal = conLosSubtotalesCorregidos(conOrden, { 7: 157485.82 });
  const antes = pasarPorLaPuerta({ lectura: mal, receta });
  assert.equal(antes.estado, ESTADO.MAL_LEIDO);
  const corregida = conLosRenglonesCorregidos(mal, { 7: { cantidad: 120, netoUnitario: 1462.382, subtotal: 175485.82 } });
  const despues = pasarPorLaPuerta({ lectura: corregida, receta });
  assert.equal(despues.cierra, true);
  assert.equal(despues.estado, ESTADO.CARGADO);
  // CONTRAPRUEBA: una corrección que no arregla nada deja el papel como estaba.
  const igual = pasarPorLaPuerta({ lectura: conLosRenglonesCorregidos(mal, { 7: { cantidad: 120 } }), receta });
  assert.equal(igual.estado, ESTADO.MAL_LEIDO);
});

test("LA CORRECCIÓN QUEDA REGISTRADA: QUIÉN, CUÁNDO, LO LEÍDO Y LO PUESTO", () => {
  const ruta = sinComentarios("app/api/compras-proveedor/comprobantes/corregir/[id]/route.js");
  assert.match(ruta, /await tx\.correccionManualRenglon\.create\(\{/);
  for (const campo of ["leido: {", "puesto: {", "cerroDespues: puerta.cierra === true", "usuarioId:", "orden,", "textoCrudo:"]) {
    assert.ok(ruta.includes(campo), `la corrección no guarda ${campo}`);
  }
  assert.match(ruta, /const lectura = conLosRenglonesCorregidos\(original, porOrden\);/);
  // Y se dice en una línea para la segunda revisión.
  const texto = textoDeLaCorreccionManual({
    textoCrudo: "JUG.BAGGIO PRONTO MULTI 1 LT (8)",
    leido: { cantidad: 120, netoUnitario: 1462.382, subtotal: 157485.82 },
    puesto: { subtotal: 175485.82 },
    quien: "Emanuel",
    creadaEn: "2026-10-10T15:30:00Z",
  });
  assert.match(texto, /^JUG\.BAGGIO PRONTO MULTI 1 LT \(8\) · total \$\s?157\.485,82 → \$\s?175\.485,82 · Emanuel, /);
  assert.ok(!texto.includes("cantidad"), "nombró un campo que no cambió");
});

// ── LA RESPUESTA CRUDA ───────────────────────────────────────────────────

test("LA RESPUESTA CRUDA DEL LECTOR QUEDA PARA LA BITÁCORA", async () => {
  const json = { identidad: {}, lineasEnElPapel: 1, hayTotalImpreso: true, lineas: [{ descripcion: "X", cantidad: 1, netoUnitario: 1, subtotalImpreso: 1 }], pie: { total: 1.21 } };
  const lector = crearLectorGemini({
    env: { GEMINI_API_KEY: "x" },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(json) }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
      }),
    }),
  });
  const r = await leerConCadena({ cadena: { titular: { ok: true, lector }, respaldo: null }, archivos: [{ mime: "image/jpeg", bytes: Buffer.from("x") }], receta: null });
  assert.equal(r.intentos[0].respuestaCruda, JSON.stringify(json));
  // Y es lo que va a la columna, por el mismo camino que la medición.
  assert.equal(medicionDeLaLlamada(r.intentos[0]).respuestaCruda, JSON.stringify(json));
  assert.equal(medicionDeLaLlamada({}).respuestaCruda, null, "sin respuesta, vacío");
  const schema = fs.readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(schema, /respuestaCruda String\?/);
});
