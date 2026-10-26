// "✓ COINCIDE" ES UNA SOLA PIEZA, Y "DEJO MI PRECIO" NO ES "COINCIDE".
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/coincideUnico.test.mjs
//
// Emanuel, 2026-10-26.
//
// 1. El "✓ Coincide" bueno es el de la tarjeta de recibir una transferencia:
//    un botón chico con contorno, arriba a la derecha. En "Recibir pedido" de
//    compras era un `SunmiLinkButton` que se veía como una etiqueta chica y
//    cuadrada. La pieza pasó al kit —`SunmiAccionRapida`— y la usan todas.
//
// 2. Pablo #337, con los números de producción: Chandon Delice, 72 × $7.700 =
//    $554.400, pack de 6 a $90.000 ($15.000 la botella); Santa Julia Malbec,
//    30 × $3.890 = $116.700, pack de 6 a $40.140 ($6.690 la botella). En los dos
//    se eligió "dejo mi precio". Eso dice que el costo no se toca, no que
//    coincida: la tarjeta dice la decisión, no "Coincide", no vuelve a frenar,
//    no muestra porcentaje, y los dos precios van por unidad.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TarjetaLineaFactura from "./TarjetaLineaFactura.jsx";
import TarjetaRecepcionMovil from "@/components/transferencias/TarjetaRecepcionMovil";
import SunmiAccionRapida, { TEXTO_COINCIDE, CLASE_ACCION_RAPIDA } from "@/components/sunmi/SunmiAccionRapida";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { formatearMoneda } from "@/lib/moneda";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const aLaVista = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const escapar = (s) => s.replace(/[$.*+?()[\]{}|\\^]/g, "\\$&");

const DEJA_EL_MIO = (precioFacturado, precioPropio) => ({
  decision: "DEJA_EL_MIO", precioFacturado, precioPropio, costoMaestroObservado: precioPropio, decididaEn: "2026-10-26T11:00:00.000Z",
});

/** La fila como la arma la conciliación del pedido 337, que nació de la factura. */
function fila({ texto, nombre, cantidad, neto, importe, producto, unidadesGuardadas = null, detalle, decision = null }) {
  const linea = { orden: 1, textoCrudo: texto, cantidad, netoUnitario: neto, subtotalImpreso: importe, costoFinalRenglon: importe, enQueViene: "unidad" };
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Pablo" }, unidadesGuardadas });
  const det = { ...detalle, costoMaestroHoy: producto.precio_costo };
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 36, estado: "CARGADO", lineas: [{ ...linea, id: 1, pedidoDetalleId: det.id, productoLocalId: 1, pedidoDetalle: det, precio, unidad: precio.unidad, decisionPrecio: decision, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [det],
    nacidoDeFactura: true,
  }).grupos[0].filas;
  return { ...f, costoMaestroHoy: producto.precio_costo, variacionNormalPct: 10, producto: nombre };
}

const PACK_6 = (precio_costo) => ({ precio_costo, factor_pack: 6, unidad_medida: "pack", modoCompraProveedor: "BULTO" });
const CHANDON = fila({
  texto: "chandon precio x2 15400", nombre: "CHANDON DELICE XCAJA", cantidad: 72, neto: 7700, importe: 554400, producto: PACK_6(90000),
  detalle: { id: 3216, cantidad: 72, precioCosto: 90000, unidad: "UNIDAD", productoBaseId: 163, factorPack: 6 },
  decision: DEJA_EL_MIO(7700, 90000),
});
const SANTA_JULIA = fila({
  texto: "Santa Julia", nombre: "SANTA JULIA MALBEC", cantidad: 30, neto: 3890, importe: 116700, producto: PACK_6(40140), unidadesGuardadas: 3,
  detalle: { id: 3218, cantidad: 30, precioCosto: 40140, unidad: "UNIDAD", productoBaseId: 1792, factorPack: 6, unidadesFisicas: 30 },
  decision: DEJA_EL_MIO(46680, 40140),
});

for (const [nombre, f, porUnidad, papel] of [
  ["CHANDON DELICE XCAJA", CHANDON, 15000, 7700],
  ["SANTA JULIA MALBEC", SANTA_JULIA, 6690, 3890],
]) {
  test(`2 · ${nombre}: CON «DEJO MI PRECIO» DICE LA DECISIÓN, NO «COINCIDE», Y LOS DOS PRECIOS POR UNIDAD`, () => {
    const html = renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila: f, sinPedidoPrevio: true }));
    const texto = aLaVista(html);
    assert.doesNotMatch(texto, /Coincide/, "dejo mi precio no es que coincida");
    assert.match(texto, new RegExp(`Dejás tu precio · ${escapar(formatearMoneda(porUnidad))} / u`));
    // Los dos precios en la misma unidad: el ERP ya no dice el pack como si fuera la unidad.
    assert.match(texto, new RegExp(`Papel ${escapar(formatearMoneda(papel))} / u`));
    assert.match(texto, new RegExp(`ERP ${escapar(formatearMoneda(porUnidad))} / u`));
    // Con la escala sin resolver no hay porcentaje, y no vuelve a frenar.
    assert.doesNotMatch(texto, /%/);
    assert.doesNotMatch(texto, /revisá la cantidad|Fijate si es este producto/);
    assert.doesNotMatch(html, /sunmi-state-warning/, "no hay nada que resolver: no va en tono de alerta");
  });
}

test("2 · CONTRAPRUEBA: SIN LA DECISIÓN, SANTA JULIA FRENA Y DICE QUÉ NO CUADRA", () => {
  const html = renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila: { ...SANTA_JULIA, decisionPrecio: null }, sinPedidoPrevio: true }));
  assert.match(html, /sunmi-state-warning/);
  assert.match(aLaVista(html), /Fijate si es este producto/);
  assert.doesNotMatch(aLaVista(html), /Dejás tu precio/);
});

test("1 · «✓ COINCIDE» DE COMPRAS ES LA MISMA PIEZA QUE EL DE TRANSFERENCIAS", () => {
  // Una fila de compras que coincide de verdad, del mismo papel: el aceite
  // Zanoni, 60 × $3.050 = $183.000, pack de 12 a $37.200 (−1,6 %, dentro de la
  // variación), con "dejo mi precio" sobre $36.600 como está en producción.
  const coincide = fila({
    texto: "aceite zanoni", nombre: "ACEITE ZANONI", cantidad: 60, neto: 3050, importe: 183000,
    producto: { precio_costo: 37200, factor_pack: 12, unidad_medida: "pack", modoCompraProveedor: "BULTO" },
    detalle: { id: 3215, cantidad: 5, precioCosto: 37200, unidad: "BULTO", productoBaseId: 1, factorPack: 12 },
    decision: DEJA_EL_MIO(36600, 37200),
  });
  const deCompras = renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila: coincide, sinPedidoPrevio: true }));
  const botonDe = (html) => html.match(new RegExp(`<button[^>]*>${escapar(TEXTO_COINCIDE)}</button>`))?.[0] ?? null;
  const delKit = renderToStaticMarkup(React.createElement(SunmiAccionRapida, null, TEXTO_COINCIDE));
  const enCompras = botonDe(deCompras);
  assert.ok(enCompras, "la tarjeta de compras no dibujó «✓ Coincide»");
  // La misma clase que el kit, y no la del enlace chico de antes.
  const clases = (html) => (html.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/).sort().join(" ");
  assert.equal(clases(enCompras), clases(delKit));
  assert.ok(enCompras.includes(CLASE_ACCION_RAPIDA));
  assert.doesNotMatch(enCompras, /no-underline/, "volvió el enlace chico");
  // Y la de transferencias dibuja exactamente lo mismo, con el caso real de su
  // fixture (`tarjetaRecepcionAntes.fixture.json`, ACEITE, tal como lo arma la
  // pantalla).
  const foto = JSON.parse(fs.readFileSync(path.join(RAIZ, "components/transferencias/tarjetaRecepcionAntes.fixture.json"), "utf8"));
  const aceite = foto.casos.find((c) => c.nombre === "ACEITE");
  const { momento, nombre, html, ...props } = aceite;
  const enTransferencias = botonDe(renderToStaticMarkup(React.createElement(TarjetaRecepcionMovil, props)));
  assert.ok(enTransferencias, "la tarjeta de transferencias no dibujó «✓ Coincide»");
  assert.equal(clases(enTransferencias), clases(delKit));
});

test("1 · NADIE MÁS DEFINE EL TEXTO NI LA CLASE: SOLO EL KIT", () => {
  // Con `--untracked`: una pantalla nueva todavía sin commitear también cuenta
  // (CLAUDE.md, regla 10).
  const salida = execFileSync(
    "git",
    ["grep", "-l", "--untracked", "-E", `"✓ Coincide"|"sunmi-btn-accent-outline"`, "--", "components", "app", "lib"],
    { cwd: RAIZ, encoding: "utf8" }
  )
    .split("\n")
    .filter((f) => f && !f.endsWith(".test.mjs") && !f.endsWith(".json"));
  // Las que lo nombran solo en comentarios no cuentan: se mira el código.
  const conCodigo = salida.filter((f) =>
    /"✓ Coincide"|"sunmi-btn-accent-outline"/.test(
      fs.readFileSync(path.join(RAIZ, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    )
  );
  assert.deepEqual(conCodigo, ["components/sunmi/SunmiAccionRapida.jsx"]);
});
