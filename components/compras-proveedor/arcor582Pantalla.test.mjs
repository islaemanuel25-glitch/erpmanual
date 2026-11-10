// ARCOR #582 EN LA PANTALLA: EL REGALO, LAS HOJAS QUE SE LEEN SOLAS Y EL NÚMERO.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/arcor582Pantalla.test.mjs
//
// ── LO QUE VIO EMANUEL (2026-11-10, recibiendo el pedido real) ────────────
//
// 1. «Mogul masti extreme 30gr», 1 u a $1,36 en el papel contra $893,55 en el
//    ERP: iba a revisar con "ERP $893,55 / u +99,8 %" en verde, la hoja decía
//    "El precio bajó 99,8 %" y ofrecía "Aceptar el precio nuevo — pasa a ser tu
//    costo: $1,36". Un regalo está resuelto: dice que vino bonificado, cuánto
//    entra y en cuánto queda el costo, y nunca ofrece su precio como costo.
// 2. Al partir el PDF, la Factura 1 se leyó y las otras tres quedaron "sin
//    leer". Partir y leer es un solo paso: las hojas nacen tomadas y las lee el
//    mismo trabajo, a continuación.
// 3. Dos de las cuatro hojas decían "Sin número todavía" con el número impreso
//    al lado de «Factura»: si el PDF tiene texto, el número sale del texto.
//
// El renglón, la línea del pedido y la ficha del regalo son los de la base
// (renglón 939 del comprobante 83, línea 3737, ficha 2143); el PDF es el real.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea from "./HojaCorregirLinea.jsx";
import TarjetaLineaFactura from "./TarjetaLineaFactura.jsx";
import { aplanarDetalles, analizarLineas } from "@/lib/compras-proveedor/comprobante/analisisDeComprobante";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import {
  ESTADO_LINEA,
  estadoDeLinea,
  hayDiferenciaDePrecio,
  rotuloDelEstado,
  saltoDePrecioAceptable,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import { renglonesDeLaTarjeta, textoDelBonificado } from "@/lib/compras-proveedor/tarjetaDeRecepcion";
import { costoMaestroDeLaLectura } from "@/lib/compras-proveedor/lecturaDelCierre";
import { partirPdfEnHojas } from "@/lib/compras-proveedor/comprobante/hojasDelPdf";
import { identidadDelTexto, textoDelPdf } from "@/lib/compras-proveedor/comprobante/lector/textoDelPapel";
import { separarHojasDelPdf } from "@/lib/compras-proveedor/comprobante/separarHojasDelPdf";
import { VARIABLE_RUTA } from "@/lib/compras-proveedor/comprobante/almacenDisco";
import { NOMBRE_CENTINELA } from "@/lib/compras-proveedor/comprobante/almacenImagenes";

const PDF = fs.readFileSync(new URL("../../lib/compras-proveedor/comprobante/arcor582.fixture.pdf", import.meta.url));

// Sin comentarios: un candado que busca texto encuentra la prosa (regla 5).
const codigoDe = (ruta) =>
  fs.readFileSync(new URL(ruta, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const plano = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

// ── 1 · EL REGALO ───────────────────────────────────────────────────────────

const MASTI = { id: 2143, nombre: "Mogul masti extreme 30gr", unidad_medida: "pack", factor_pack: 16, modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", pesoEsFijo: false, pesoReferenciaKg: null, precio_costo: 14296.72 };
const RENGLON_939 = {
  id: 939, orden: 2, textoCrudo: "HW MOGUL EXT. MASTI CONFITADOS 16x30g", codigoProveedor: "15589", cantidad: 1, netoUnitario: 1.362,
  subtotalImpreso: 1.36, costoFinalRenglon: 1.36, enQueViene: "DI", tipoRenglon: "MERCADERIA", productoLocalId: 6324, pedidoDetalleId: 3737, unidadElegida: null,
};
const LINEA_3737 = { id: 3737, cantidad: 1, unidad: "UNIDAD", precioCosto: 893.545, cantidadRecibida: null, producto: { id: 6324, baseId: 2143, base: MASTI } };

function filaDelRegalo() {
  const contexto = {
    datos: { codigosProveedor: [], productos: [{ productoBaseId: 2143, nombre: MASTI.nombre }] },
    catalogo: [MASTI],
    catalogoNormalizado: [{ productoBaseId: 2143, nombre: MASTI.nombre }],
    nombrePorBase: new Map([[2143, MASTI.nombre]]),
    datosPorBase: new Map([[2143, MASTI]]),
    decisionPorBase: new Map(),
    variacionNormalPct: 10,
  };
  const c = { id: 83, estado: "CARGADO", proveedor: { id: 7, nombre: "Arcor", umbralRevisarPct: null, umbralSospechaBajaPct: null }, lineas: [RENGLON_939] };
  const detalles = aplanarDetalles([LINEA_3737]);
  const lineas = analizarLineas({ comprobante: c, contexto, detallesPlanos: detalles, porProductoLocal: new Map([[6324, { baseId: 2143 }]]) });
  const { grupos } = filasDeConciliacion({ comprobantes: [{ ...c, lineas }], detalles });
  return { renglon: lineas[0], fila: { ...grupos[0].filas[0], variacionNormalPct: 10 } };
}

test("1 · EL REGALO NO VA A REVISAR, NO TIENE PORCENTAJE NI PRECIO QUE ACEPTAR", () => {
  const { renglon, fila } = filaDelRegalo();
  assert.equal(renglon.precio.bonificado, true);
  assert.equal(renglon.precio.precioFinal, null, "con $1,36 acá la tarjeta lo comparaba contra el ERP");
  assert.equal(renglon.precio.precioAEscribir, null);
  assert.equal(estadoDeLinea(fila), ESTADO_LINEA.COINCIDE, "decía PARA REVISAR");
  assert.equal(rotuloDelEstado(fila), "Bonificado");
  assert.equal(hayDiferenciaDePrecio(fila), false);
  assert.equal(saltoDePrecioAceptable(fila), false);
  // El cierre no escribe nada: el costo queda en el que tenía.
  assert.equal(costoMaestroDeLaLectura(fila), null);
});

test("1 · LA TARJETA Y LA HOJA DICEN QUE VINO BONIFICADO, CUÁNTO ENTRA Y EN CUÁNTO QUEDA EL COSTO", () => {
  const { fila } = filaDelRegalo();
  const r = renglonesDeLaTarjeta(fila);
  assert.equal(r.erp, null, "sin el «ERP $893,55 / u +99,8 %»");
  assert.equal(r.bonificado, textoDelBonificado(fila));
  assert.match(r.bonificado, /^Vino bonificado\. Entra 1 .+ al stock y tu costo queda en \$893,5\d \/ u\.$/);
  const t = renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila }));
  assert.ok(plano(t).includes(r.bonificado), plano(t));
  assert.doesNotMatch(plano(t), /%/);
  assert.match(t, new RegExp(`class="[^"]*sunmi-text-muted[^"]*">${r.bonificado.replace(/[.$/]/g, "\\$&")}<`), "en tono informativo");
  const h = plano(renderToStaticMarkup(React.createElement(HojaCorregirLinea, { fila, abierta: true, onCerrar() {}, onGuardar() {} })));
  assert.ok(h.includes("Vino bonificado"), h);
  assert.ok(h.includes(r.bonificado), h);
  assert.doesNotMatch(h, /Aceptar el precio nuevo|El precio bajó|pasa a ser tu costo/i);
});

// ── 2 · LAS HOJAS SE LEEN SOLAS ─────────────────────────────────────────────

test("2 · AL PARTIR, LAS HOJAS NACEN TOMADAS PARA LEERSE A CONTINUACIÓN", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arcor582-"));
  fs.writeFileSync(path.join(dir, NOMBRE_CENTINELA), "");
  const antes = process.env[VARIABLE_RUTA];
  process.env[VARIABLE_RUTA] = dir;
  try {
    const original = path.join(dir, "Arcor_0_0_81_p1.pdf");
    fs.writeFileSync(original, PDF);
    const creados = [];
    const actualizados = [];
    let siguiente = 82;
    const prisma = {
      comprobanteProveedor: { create: async ({ data }) => (creados.push(data), { id: siguiente++ }) },
      comprobanteArchivo: {
        create: async () => ({ id: 1000 + creados.length }),
        update: async ({ where, data }) => (actualizados.push({ where, data }), {}),
      },
    };
    const hojas = await partirPdfEnHojas(PDF);
    const subida = new Date("2026-11-10T17:55:47.253Z");
    const { hojasNuevas } = await separarHojasDelPdf(prisma, {
      comprobante: { id: 81, grupoId: 1, proveedorId: 7, pedidoId: 582, localOperativoId: 1, usuarioId: 1, venceEn: null, createdAt: subida },
      archivo: { id: 81, nombre: "Isla.pdf", ubicacion: original },
      hojas,
      proveedorNombre: "Arcor",
    });
    assert.deepEqual(hojasNuevas, [82, 83, 84]);
    for (const d of creados) {
      assert.ok(d.lecturaEnCursoDesde instanceof Date, "la hoja nace leyendo: la pantalla no la muestra «sin leer»");
      assert.equal(d.createdAt, subida, "en el orden de la subida, para la agrupación");
      assert.equal(d.pedidoId, 582);
    }
    assert.equal(fs.existsSync(original), false, "el PDF entero quedó repartido en sus hojas");
    assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith(".pdf")).length, 4);
  } finally {
    if (antes === undefined) delete process.env[VARIABLE_RUTA];
    else process.env[VARIABLE_RUTA] = antes;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("2 · EL MISMO TRABAJO QUE PARTE LEE LAS HOJAS, DE A UNA, DESPUÉS DE LA PRIMERA", () => {
  const ruta = codigoDe("../../app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(ruta, /hojasDelPdf = hojasNuevas;/);
  assert.match(ruta, /for \(const hojaId of hojasDelPdf\)[\s\S]*?await leerUno\(hoja,[\s\S]*?await terminarLaLectura\(prisma, \{ comprobanteId: hojaId, respuesta \}\)/);
  assert.match(
    ruta,
    /await terminarLaLectura\(prisma, \{ comprobanteId: comprobante\.id, respuesta \}\);\s*await leerLasHojasDelPdf\(\);/,
    "las hojas se leen en el trabajo, no dependen de la pantalla"
  );
});

// ── 3 · EL NÚMERO SALE DEL TEXTO ────────────────────────────────────────────

test("3 · EL PUNTO DE VENTA Y EL NÚMERO DE CADA FACTURA SALEN DEL TEXTO DEL PDF", async () => {
  const hojas = await partirPdfEnHojas(PDF);
  const numeros = [];
  for (const h of hojas) numeros.push(identidadDelTexto(await textoDelPdf(h)));
  assert.deepEqual(numeros, [
    { puntoVenta: "6769", numero: "00371634" },
    { puntoVenta: "6769", numero: "00371635" },
    { puntoVenta: "6769", numero: "00371636" },
    { puntoVenta: "6769", numero: "00371637" },
  ]);
  assert.equal(identidadDelTexto("REMITO SIN NÚMERO"), null, "sin la forma de la AFIP no se adivina");
  const ruta = codigoDe("../../app/api/compras-proveedor/comprobantes/leer/[id]/route.js");
  assert.match(ruta, /const delTexto = identidadDelTexto\([\s\S]*?const puerta = pasarPorLaPuerta\(/, "antes de la puerta, que es la que guarda la identidad");
});
