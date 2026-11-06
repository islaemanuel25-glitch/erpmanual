// UN SALTO DE PRECIO GRANDE SE PUEDE ACEPTAR DESDE LA HOJA.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/picnicSaltoDePrecio.test.mjs
//
// Emanuel, 2026-10-29: PICNIC 38g, el papel cobra $375,35 la unidad y el ERP la
// tiene a $246,00 (53 % más). El aumento es real, y la hoja decía "La mercadería
// entra igual y tu costo no se toca" sin ofrecer aceptarlo. La regla de antes
// —ante un salto así no se ofrece aceptar— la reemplazó el dueño.
//
// La fila se arma por el mismo camino que la conciliación —`analizarPrecioDeLinea`
// y `filasDeConciliacion`—, como en `pablo337Hoja.test.mjs`, y no a mano.

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
import { formatearMoneda } from "@/lib/moneda";
import {
  ESTADO_LINEA,
  estadoDeLinea,
  loQueNoCuadra,
  saltoDePrecioAceptable,
  textoSiAceptaElSalto,
  textoSiNoAceptaElSalto,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const aLaVista = (el) => renderToStaticMarkup(el).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const literal = (s) => s.replace(/[$.*+?()[\]{}|\\^]/g, "\\$&");

const PICNIC = { precio_costo: 246, factor_pack: 1, unidad_medida: "unidad", modoCompraProveedor: "BULTO" };
const DETALLE = { id: 9001, cantidad: 40, precioCosto: 246, unidad: "UNIDAD", productoBaseId: 501, factorPack: 1 };

function picnic({ producto = PICNIC, detalle = DETALLE, corrida = false, neto = 375.35 } = {}) {
  const importe = Math.round(40 * neto * 100) / 100;
  const linea = { orden: 1, textoCrudo: "PICNIC 38G", cantidad: 40, netoUnitario: neto, subtotalImpreso: importe, costoFinalRenglon: importe, enQueViene: "unidad" };
  const precio = analizarPrecioDeLinea({ linea, producto, proveedor: { nombre: "Distribuidora" } });
  const det = { ...detalle, costoMaestroHoy: producto.precio_costo };
  const [f] = filasDeConciliacion({
    comprobantes: [{ id: 70, estado: "CARGADO", lineas: [{ ...linea, id: 800, pedidoDetalleId: det.id, productoLocalId: 1, pedidoDetalle: det, precio, unidad: precio.unidad, costoMaestroCatalogo: producto.precio_costo }] }],
    detalles: [det],
  }).grupos[0].filas;
  return { ...f, costoMaestroHoy: producto.precio_costo, variacionNormalPct: 10, producto: "PICNIC 38g", corridaSospechada: corrida };
}

const abrir = (fila, extra = {}) =>
  aLaVista(
    React.createElement(HojaCorregirLinea, {
      fila, abierta: true, onCerrar() {}, onGuardar() {}, onCorregirPapel() {}, onAceptarPrecio() {}, onDejarMiPrecio() {}, ...extra,
    })
  );

test("PICNIC es un salto de PRECIO, y es lo único que frena: se puede aceptar", () => {
  const f = picnic();
  assert.equal(loQueNoCuadra(f).que, "PRECIO");
  // Sin "Fijate si es este producto" desde el 2026-10-29: la alerta es visual.
  assert.match(loQueNoCuadra(f).texto, /\(53 % más\)\.$/);
  assert.equal(saltoDePrecioAceptable(f), true);
});

test("la hoja ofrece aceptarlo, con los dos números de una unidad y sin advertencias", () => {
  const hoja = abrir(picnic());
  // El título pasó de "El precio no se puede comparar" a "Precio" (2026-10-29),
  // y desde el maní de Prod Nat (2026-11-05) dice la diferencia real, como un
  // cambio normal.
  assert.match(hoja, / El precio subió 52,6 % Tenías /);
  assert.doesNotMatch(hoja, /El precio no se puede comparar|Fijate si es este producto|El papel cobra/);
  // El mismo número y signo que el título (2026-11-06): subió, "+52,6 %".
  assert.match(hoja, new RegExp(literal(`Tenías ${formatearMoneda(246)} / u +52,6 % · la factura trae ${formatearMoneda(375.35)} / u`)));
  assert.match(hoja, /Aceptar el precio nuevo/);
  assert.match(hoja, new RegExp(literal(`Pasa a ser tu costo: ${formatearMoneda(375.35)}. El margen se recalcula.`)));
  assert.match(hoja, /Dejar el que tenía/);
  assert.match(hoja, new RegExp(literal(`y tu costo queda en ${formatearMoneda(246)}.`)));
  assert.doesNotMatch(hoja, /tu costo no se toca/);
});

test("los textos dicen qué queda en cada caso, con el formato de moneda de la pantalla", () => {
  assert.equal(formatearMoneda(375.35), "$375,35");
  assert.equal(textoSiAceptaElSalto(375.35), "Pasa a ser tu costo: $375,35. El margen se recalcula.");
  assert.equal(
    textoSiNoAceptaElSalto({ entra: "40 unidades", erp: 246 }),
    "Si no lo aceptás, entran 40 unidades y tu costo queda en $246,00."
  );
});

test("al guardar con «aceptar» elegido, va por la misma ruta que el caso normal", () => {
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(hoja, /if \(cambio \|\| \(saltoAceptable && aceptaPrecio !== null\)\) \{\s*const r = aceptaPrecio \? await onAceptarPrecio\?\.\(fila\) : await onDejarMiPrecio\?\.\(fila\);/);
  assert.match(hoja, /const saltoAceptable = saltoDePrecioAceptable\(fila\) && !yaDecidioElFreno && !noSePuedeAceptar;/);
});

test("el servidor deja pasar el salto, preguntando lo mismo sobre la fila de la hoja", () => {
  const ruta = codigoDe("app/api/compras-proveedor/comprobantes/aceptar-precio/route.js");
  assert.match(ruta, /if \(motivoQueFrena && !dejaElMioBajoFreno && !aceptaUnSalto\) \{/);
  // Y lo que frena se pregunta sobre la fila de la hoja si está (2026-11-06).
  assert.match(ruta, /const motivoQueFrena = filaComoLaVeLaHoja != null \? motivoSinComparacion\(filaComoLaVeLaHoja\) : sinComparacion;/);
  // La fila de la hoja, con lo que la ruta de la pantalla le agrega, y las dos
  // preguntas sobre ella (la segunda desde el maní de Prod Nat, 2026-11-05).
  assert.match(ruta, /const filaComoLaVeLaHoja =\s*filaDeLaHoja != null\s*\?\s*\{\s*\.\.\.filaDeLaHoja,/);
  assert.match(ruta, /const aceptaUnSalto = filaComoLaVeLaHoja != null && saltoDePrecioAceptable\(filaComoLaVeLaHoja\);/);
  assert.match(ruta, /const frenoLevantado = filaComoLaVeLaHoja != null && saltoSinBultoConOpciones\(filaComoLaVeLaHoja\);/);
  assert.match(ruta, /unidad: analisis\.unidad,\s*frenoLevantado,\s*\}\);/);
});

test("lo que no es un precio sigue sin poder aceptarse: un papel corrido, una escala", () => {
  const corrida = picnic({ corrida: true });
  assert.equal(saltoDePrecioAceptable(corrida), false);
  assert.match(abrir(corrida), /tu costo no se toca/);
  // Chandon de Pablo #337: el papel cobra la mitad de la botella, es escala.
  // Desde el maní de Prod Nat (2026-11-05) eso vale solo con bulto: sin pack
  // hay una sola lectura y es un salto de precio. Así que el producto es un
  // pack de 12 a $9.008,40 —$750,70 la unidad— y el papel cobra $375,35:
  // ninguna lectura lo explica.
  const PACK = { ...PICNIC, factor_pack: 12, unidad_medida: "pack", precio_costo: 9008.4 };
  const escala = picnic({ producto: PACK, detalle: { ...DETALLE, precioCosto: 9008.4, unidad: "BULTO", factorPack: 12 } });
  assert.equal(escala.unidad.requiereDecision, true, "ninguna lectura explica el precio");
  assert.equal(loQueNoCuadra(escala).que, "ESCALA");
  assert.equal(saltoDePrecioAceptable(escala), false);
  assert.doesNotMatch(abrir(escala), /Aceptar el precio nuevo/);
});

// ── LAS TRES REGLAS DE EMANUEL DEL 2026-10-29 ─────────────────────────────
//
// 1. Viene marcada la opción del precio MÁS ALTO entre el ERP y el papel, en
//    todos los casos de la hoja.
// 2. Al lado del renglón ERP, un porcentaje con la pieza de las líneas
//    normales, en la tarjeta y en la hoja. Desde el 2026-11-06 es cuánto varió
//    el precio —"+" si subió—, verde si pagás menos y rojo si pagás más.
// 3. Una diferencia mayor a la variación normal del proveedor alerta solo con
//    el tono de la tarjeta, sin frases.

/** La hoja como HTML, para leer qué opción viene marcada. */
const hojaHtml = (fila) =>
  renderToStaticMarkup(
    React.createElement(HojaCorregirLinea, {
      fila, abierta: true, onCerrar() {}, onGuardar() {}, onCorregirPapel() {}, onAceptarPrecio() {}, onDejarMiPrecio() {},
    })
  );
/** `aria-pressed` del botón de la opción cuyo título es `titulo`. */
const marcada = (html, titulo) => {
  const boton = html.split("<button").find((b) => b.includes(`>${titulo}<`));
  assert.ok(boton, `no está la opción «${titulo}»`);
  return /aria-pressed="true"/.test(boton.slice(0, boton.indexOf(">")));
};
const tarjetaHtml = (fila) => renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila }));
/** El porcentaje del renglón ERP y su tono, como lo dibuja la pieza. */
const porcentaje = (html, texto, tono) => new RegExp(`${tono}">${literal(texto)}<`).test(html);

// Desde el 2026-11-06 el porcentaje es cuánto varió el precio, (papel − ERP) ÷
// ERP, el mismo del título: una suba es "+" y una baja "−". El color dice si
// es bueno para Emanuel: una suba (pagás más) en el color de peligro del tema,
// una baja (pagás menos) en el de éxito (`porcentajeDelErpReglaDel26.test.mjs`).
const TONO_SUBA = "sunmi-text-danger";
const TONO_BAJA = "sunmi-text-success";
test("PICNIC: el papel sube 52,6 %, ninguna opción marcada, +52,6 % en rojo y la tarjeta en alerta, sin frases", () => {
  // Hasta el 2026-11-05 venía marcado aceptar, por ser el más alto. Desde
  // entonces una suba del papel de más del 35 % no viene marcada: hay que
  // tocar una (`subeMasQueLoPlausible`).
  const f = picnic();
  const hoja = hojaHtml(f);
  assert.equal(marcada(hoja, "Aceptar el precio nuevo"), false, "el papel sube más del 35 %");
  assert.equal(marcada(hoja, "Dejar el que tenía"), false);
  assert.ok(porcentaje(hoja, "+52,6 %", TONO_SUBA), "el precio subió: positivo");
  const tarjeta = tarjetaHtml(f);
  assert.ok(porcentaje(tarjeta, "+52,6 %", TONO_SUBA), "la tarjeta dice el mismo porcentaje");
  assert.match(tarjeta, /sunmi-state-warning/, "+53 % es más que la variación normal del 10 %");
  for (const html of [hoja, tarjeta]) {
    assert.doesNotMatch(html, /Fijate si es este producto|El precio no se puede comparar/);
  }
});

test("PICNIC con el ERP más caro, en el salto: −39,0 % con el color de baja, y la baja se ofrece con «Dejar» marcado", () => {
  // $150 la unidad contra $246: bajó 39,0 %, más que lo plausible. Es
  // una baja que la regla de bajas frena. Hasta el 2026-11-05 no se ofrecía;
  // desde el maní de Prod Nat, un producto SIN BULTO —PICNIC va por unidad—
  // muestra la baja con las dos opciones, y viene marcado dejar el tuyo, que
  // es el precio más alto.
  const f = picnic({ neto: 150 });
  assert.equal(loQueNoCuadra(f).que, "PRECIO");
  const hoja = hojaHtml(f);
  assert.ok(porcentaje(hoja, "−39,0 %", TONO_BAJA));
  assert.match(aLaVista(React.createElement(HojaCorregirLinea, { fila: f, abierta: true, onCerrar() {} })), / El precio bajó 39,0 % /);
  assert.equal(marcada(hoja, "Aceptar el precio nuevo"), false);
  assert.equal(marcada(hoja, "Dejar el que tenía"), true);
  assert.doesNotMatch(hoja, /El papel cobra|tu costo no se toca/);
  assert.ok(porcentaje(tarjetaHtml(f), "−39,0 %", TONO_BAJA));
});

test("fuera de la variación sin ser un salto, el ERP más caro: «Dejar» marcado, color de baja, alerta sin frase", () => {
  // $220 contra $246: bajó 10,6 %, apenas fuera del 10 %.
  const f = picnic({ neto: 220 });
  assert.equal(loQueNoCuadra(f), null, "no es un salto: la hoja compara normal");
  const hoja = hojaHtml(f);
  assert.equal(marcada(hoja, "Dejar el que tenía"), true, "fuera de la variación también viene marcado el más alto");
  assert.ok(porcentaje(hoja, "−10,6 %", TONO_BAJA));
  assert.doesNotMatch(hoja, /no es normal para|Revisá la cantidad y el producto/, "sin frase de advertencia");
  const tarjeta = tarjetaHtml(f);
  assert.match(tarjeta, /sunmi-state-warning/);
  assert.ok(porcentaje(tarjeta, "−10,6 %", TONO_BAJA));
});

test("fuera de la variación, el papel más caro: «Aceptar» marcado, color de suba, alerta sin frase", () => {
  // $275 contra $246: subió 11,8 %. Una suba —la baja de arriba ya la
  // marca la regla de bajas—, así que este es el caso que ejerce la regla 1
  // fuera de la variación: hasta el 2026-10-29 no venía marcado nada.
  const f = picnic({ neto: 275 });
  assert.equal(loQueNoCuadra(f), null);
  const hoja = hojaHtml(f);
  assert.equal(marcada(hoja, "Aceptar el precio nuevo"), true);
  assert.equal(marcada(hoja, "Dejar el que tenía"), false);
  assert.ok(porcentaje(hoja, "+11,8 %", TONO_SUBA));
  assert.doesNotMatch(hoja, /no es normal para|Revisá la cantidad y el producto/);
  assert.match(tarjetaHtml(f), /sunmi-state-warning/);
});

test("dentro de la variación normal no se pinta de alerta, y viene marcado el más alto", () => {
  // $250 contra $246: subió 1,6 %. Hay que decidirlo, pero es normal.
  const f = picnic({ neto: 250 });
  assert.equal(estadoDeLinea(f), ESTADO_LINEA.PRECIO_DISTINTO, "no es «Coincide»: se decide en la hoja");
  const tarjeta = tarjetaHtml(f);
  assert.doesNotMatch(tarjeta, /sunmi-state-warning/);
  assert.ok(porcentaje(tarjeta, "+1,6 %", TONO_SUBA));
  assert.equal(marcada(hojaHtml(f), "Aceptar el precio nuevo"), true, "el papel es el más alto");
});

test("la pieza del porcentaje de la hoja es la del renglón ERP de la tarjeta, no una parecida", () => {
  const hoja = codigoDe("components/compras-proveedor/HojaCorregirLinea.jsx");
  assert.match(hoja, /import \{ PorcentajeDelErp \} from "@\/components\/compras-proveedor\/TarjetaLineaFactura";/);
  assert.doesNotMatch(hoja, /tonoDelPorcentaje|textoDelPorcentaje/, "la hoja no arma su propio porcentaje");
  const tarjeta = codigoDe("components/compras-proveedor/TarjetaLineaFactura.jsx");
  assert.match(tarjeta, /<PorcentajeDelErp erp=\{renglones\.erp\} \/>/);
});
