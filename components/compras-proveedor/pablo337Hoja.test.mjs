// LA HOJA DE CORREGIR DE SANTA JULIA, DEL PAPEL DE MILAGROS PARA PABLO #337.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/pablo337Hoja.test.mjs
//
// Los números son los de producción del 2026-10-26, de solo lectura: el papel
// dice 30 × $3.890 = $116.700; Santa Julia Malbec es pack de 6 a $40.140 en el
// ERP —$6.690 la botella—; el pedido 337 nació de la factura; en "Cuánto
// entró" se habían cargado 5 en "Bultos de 6" y quedaron guardadas 30 unidades
// físicas; y sobre el producto había un "dejo mi precio".
//
// Y Chandon, del mismo papel: 72 × $7.700 = $554.400, pack de 6 a $90.000
// —$15.000 la botella—; el papel aclara "precio x2 15400".

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HojaCorregirLinea from "./HojaCorregirLinea.jsx";
import TarjetaLineaFactura from "./TarjetaLineaFactura.jsx";
import { analizarPrecioDeLinea } from "@/lib/compras-proveedor/comprobante/precioDeLinea";
import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";
import { cuantoSeValoriza } from "@/lib/compras-proveedor/gananciaDelDeposito";
import { formatearMoneda } from "@/lib/moneda";
import {
  AVISO_ESCALA,
  contadoEnLaEscala,
  frenoYaDecidido,
  loQueNoCuadra,
  motivoSinComparacion,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const aLaVista = (el) => renderToStaticMarkup(el).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

const SANTA_JULIA = { precio_costo: 40140, factor_pack: 6, unidad_medida: "pack", modoCompraProveedor: "BULTO" };
const CHANDON = { precio_costo: 90000, factor_pack: 6, unidad_medida: "pack", modoCompraProveedor: "BULTO" };
const DEJA_EL_MIO = { decision: "DEJA_EL_MIO", precioFacturado: 46680, precioPropio: 40140, costoMaestroObservado: 40140, decididaEn: "2026-10-26T10:48:51.510Z" };

/** La fila como la arma la conciliación del pedido 337. */
function fila({ texto, cantidad, neto, importe, producto, unidadesGuardadas = null, detalle, decision = null }) {
  const linea = { orden: 4, textoCrudo: texto, cantidad, netoUnitario: neto, subtotalImpreso: importe, costoFinalRenglon: importe, enQueViene: "unidad" };
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Pablo" }, unidadesGuardadas });
  const det = { ...detalle, costoMaestroHoy: producto.precio_costo };
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 36, estado: "CARGADO", lineas: [{ ...linea, id: 458, pedidoDetalleId: det.id, productoLocalId: 1, pedidoDetalle: det, precio, unidad: precio.unidad, decisionPrecio: decision, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [det],
    nacidoDeFactura: true,
  }).grupos[0].filas;
  return { ...f, costoMaestroHoy: producto.precio_costo, variacionNormalPct: 10, producto: texto };
}

const DETALLE = { id: 3218, cantidad: 30, precioCosto: 40140, unidad: "UNIDAD", productoBaseId: 1792, factorPack: 6, cantidadRecibida: 5, unidadesFisicas: 30, motivoPrincipal: "Faltante" };
const santaJulia30 = (decision = null) =>
  fila({ texto: "Santa Julia", cantidad: 30, neto: 3890, importe: 116700, producto: SANTA_JULIA, unidadesGuardadas: 3, detalle: DETALLE, decision });

test("1 · 5 BULTOS DE 6 QUE PASAN A UNIDADES SON 30, NO 5", () => {
  // Como está hoy: el producto frena y "Cuánto entró" va en unidades.
  const enUnidades = santaJulia30();
  assert.deepEqual(contadoEnLaEscala(enUnidades), { completos: 30, sueltas: 0 }, "quedaba el 5: 5 botellas y 25 de faltante");
  assert.equal(cuantoSeValoriza(enUnidades), 30);
  // Y al revés: como estaba cuando se cargó —pack de 3, en bultos de 6—, las
  // mismas 30 son 5 bultos.
  const enBultos = fila({ texto: "Santa Julia", cantidad: 5, neto: 23340, importe: 116700, producto: SANTA_JULIA, unidadesGuardadas: 3, detalle: DETALLE });
  assert.deepEqual(contadoEnLaEscala(enBultos), { completos: 5, sueltas: 0 });
  assert.equal(cuantoSeValoriza(enBultos), 5);
  // Lo que no completa un bulto queda como sueltas: 32 botellas en bultos de 6.
  assert.deepEqual(contadoEnLaEscala({ ...enBultos, unidadesFisicas: 32 }), { completos: 5, sueltas: 2 });
  // Sin unidades físicas guardadas no se inventa nada: se usa lo de siempre.
  assert.equal(contadoEnLaEscala({ ...enUnidades, unidadesFisicas: null }), null);
  // La hoja arranca con esto, no con `cantidadRecibida` a secas.
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(hoja, /const contado = contadoEnLaEscala\(fila\);[\s\S]*?: contado\s*\? String\(contado\.completos\)/);
});

test("2 · SANTA JULIA: LA CANTIDAD CIERRA CON EL IMPORTE, ASÍ QUE LO QUE NO CUADRA ES EL PRECIO", () => {
  const f = santaJulia30();
  const nc = loQueNoCuadra(f);
  assert.equal(nc.que, "PRECIO");
  assert.equal(
    nc.texto,
    `El papel cobra ${formatearMoneda(3890)} la unidad y vos la tenés a ${formatearMoneda(6690)} (42 % menos). Fijate si es este producto.`
  );
  assert.equal(motivoSinComparacion(f), nc.texto, "no «revisá la cantidad», que es lo único que estaba bien");
});

test("2 · CHANDON: EL PAPEL COBRA LA MITAD DE LA BOTELLA, ASÍ QUE LO QUE NO CUADRA ES LA ESCALA", () => {
  const f = fila({
    texto: "chandon precio x2 15400", cantidad: 72, neto: 7700, importe: 554400, producto: CHANDON,
    detalle: { id: 3216, cantidad: 72, precioCosto: 90000, unidad: "UNIDAD", productoBaseId: 163, factorPack: 6, cantidadRecibida: 72 },
  });
  assert.deepEqual(loQueNoCuadra(f), { que: "ESCALA", texto: AVISO_ESCALA });
});

test("2 · CON «DEJO MI PRECIO» YA DECIDIDO, EL FRENO NO ES UN AVISO NI BLOQUEA", () => {
  const f = santaJulia30(DEJA_EL_MIO);
  assert.equal(frenoYaDecidido(f), true);
  // La tarjeta no lo marca.
  const tarjeta = renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila: f }));
  assert.doesNotMatch(tarjeta, /Fijate si es este producto/);
  // La hoja lo dice como decidido, con el precio de UNA UNIDAD —la misma que el
  // "Precio de la unidad" del papel—, y sin nada en tono de alerta.
  const hoja = aLaVista(React.createElement(HojaCorregirLinea, { fila: f, abierta: true, onCerrar() {}, onGuardar() {}, onCorregirPapel() {}, onAceptarPrecio() {}, onDejarMiPrecio() {} }));
  assert.match(hoja, /Ya decidiste este precio/);
  assert.match(hoja, new RegExp(`Dejás tu precio · ${formatearMoneda(6690).replace(/\$/g, "\\$")} la unidad`));
  assert.match(hoja, /La mercadería entra igual y tu costo no se toca/);
  // Y el servidor no rechaza "dejo mi precio" bajo el freno: era el rojo de la hoja.
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/aceptar-precio/route.js");
  assert.match(ruta, /const dejaElMioBajoFreno = decisionPedida === DECISION_DE_PRECIO\.DEJA_EL_MIO && escalaSinDeducir\(comparacion\);/);
  assert.match(ruta, /if \(sinComparacion && !dejaElMioBajoFreno\) \{/);
  // CONTRAPRUEBA: sin la decisión, la tarjeta sí avisa.
  const sinDecidir = renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila: santaJulia30() }));
  assert.match(sinDecidir, /Fijate si es este producto/);
});

test("2 · LOS DOS PRECIOS JUNTOS VAN EN LA MISMA UNIDAD, DICHA AL LADO", () => {
  // Santa Julia leída en packs de 3: $46.680 el pack de 6 contra $40.140, con
  // "dejo mi precio" sobre esos números.
  const f = fila({ texto: "Santa Julia", cantidad: 5, neto: 23340, importe: 116700, producto: SANTA_JULIA, unidadesGuardadas: 3, detalle: DETALLE, decision: DEJA_EL_MIO });
  const hoja = aLaVista(React.createElement(HojaCorregirLinea, { fila: f, abierta: true, onCerrar() {}, onGuardar() {}, onCorregirPapel() {}, onAceptarPrecio() {}, onDejarMiPrecio() {} }));
  assert.match(hoja, new RegExp(`Dejás tu precio · ${formatearMoneda(40140).replace(/\$/g, "\\$")} / pack`));
  const codigo = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(codigo, /Tenías \{formatearMoneda\(tuPrecio\)\} \/ \{unidadDelPrecio\} · la factura trae\{" "\}\s*\{formatearMoneda\(fila\.costoFactura\)\} \/ \{unidadDelPrecio\}/);
});
