// LA TARJETA DE UN PRODUCTO TUYO EN LA REVISIÓN DE UNA LISTA, DIBUJADA.
//
//   node --import ./scripts/alias-loader.mjs --test components/proveedores/listas/tarjetaProductoDeLaLista.test.mjs
//
// Se mira lo que la tarjeta DIBUJA, no su fuente. Y los `item` no se escriben a
// mano: salen de `tusProductosDeLaLista`, con filas que tienen los campos que la
// ruta del resultado le pide a la base. Un `item` "razonable" escrito acá podría
// tener una combinación de campos que el servidor nunca manda —es el defecto que
// CLAUDE.md tiene anotado tres veces—.

import test from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { readFileSync } from "node:fs";

import TarjetaProductoDeLaLista, {
  CLASE_TARJETA_FUERA_DE_RANGO,
  ROTULO_EN_LA_LISTA,
  TEXTO_CORREGIR,
  TEXTO_LISTO,
  TEXTO_NO_ESTA,
  TEXTO_NO_VIENE,
  TEXTO_OTRO,
  TEXTO_PREGUNTA_CAJA,
  TEXTO_PREGUNTA_KILOS,
  numeroDeLaRespuesta,
  TEXTO_SI,
  TEXTO_USAR,
  TEXTO_VINCULAR,
  MARCA_VINCULADO,
  cuentaDe,
} from "@/components/proveedores/listas/TarjetaProductoDeLaLista";
import { TEXTO_FUERA_DE_RANGO, tonoDelPorcentaje } from "@/components/proveedores/listas/PiezasPantallas";
import { sugerenciaDeRenglon } from "@/lib/proveedores/listas/vincularConUnaFila";
import { conLoRecordado } from "@/lib/proveedores/listas/cajaRecordada";
import { CLASE_ACCION_CORREGIR, CLASE_ACCION_RAPIDA } from "@/components/revision/PiezasDeRevision";
import { tusProductosDeLaLista } from "@/lib/proveedores/listas/tusProductos";
import { lecturaParaPantalla } from "@/lib/proveedores/listas/explicarLectura";
import { lecturaElegida, lecturasDeLaFila } from "@/lib/proveedores/listas/lecturasDeLaFila";
import { ESTADO_LINEA } from "@/lib/proveedores/listas/estados";
import { ESTADO_VARIACION } from "@/lib/proveedores/listas/rangoAumento";

const RANGO = { minPct: 2, maxPct: 15 };

let proximoId = 1;
/** Una fila con los campos que selecciona `resultado/route.js` para esta lista. */
function fila(cambios = {}) {
  return {
    id: proximoId++,
    estado: ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    motivo: null,
    costoAnterior: 1300,
    productoBaseId: 55,
    excluidaManual: false,
    aplicada: false,
    seleccionada: true,
    diferenciaPct: 13.06,
    aumentoEsperadoMinPct: 2,
    aumentoEsperadoMaxPct: 15,
    confirmadoEn: null,
    vinculadoEn: null,
    multiplicadorConfirmado: null,
    fueraDeRangoAceptadaEn: null,
    costoMaestroPropuesto: 1469.75,
    codigoCrudo: "1612",
    descripcionProveedor: "SOLITAS ANIMACION 400G",
    precioConIva: 146.975,
    unidadesPorBulto: 10,
    ...cambios,
  };
}

function itemDe({ filas = [], lecturaPorFila = null, abierta = true } = {}) {
  return tusProductosDeLaLista({
    productos: [{ id: 7, nombre: "Solitas Animación 400 g", precio_costo: 1300, codigo_barra: null, codigo_barra_secundario: null, filas }],
    rango: RANGO,
    lecturaPorFila,
    abierta,
  }).items[0];
}

/** `Intl` separa el "$" con un espacio duro; el texto esperado se escribe con uno común. */
const conEspacios = (t) => String(t).replace(/ /g, " ");

const dibujar = (props) => renderToStaticMarkup(React.createElement(TarjetaProductoDeLaLista, props));

/** Los botones que dibuja, con su texto y su clase. */
function botones(html) {
  return [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map((m) => ({
    atributos: m[1],
    texto: m[2].replace(/<[^>]+>/g, "").trim(),
  }));
}

test("SIN VINCULAR: «Vincular» arriba en la clase rápida, «No viene» abajo, y «no está» en ámbar", () => {
  const html = dibujar({ item: itemDe(), abierta: true });
  const b = botones(html);
  assert.deepEqual(b.map((x) => x.texto), [TEXTO_VINCULAR, TEXTO_NO_VIENE]);
  assert.ok(b[0].atributos.includes(CLASE_ACCION_RAPIDA), "«Vincular» no tiene la forma del «✓ Coincide»");
  assert.ok(b[1].atributos.includes(CLASE_ACCION_CORREGIR), "«No viene» no tiene la forma del «Corregir»");
  assert.ok(html.includes(ROTULO_EN_LA_LISTA));
  assert.match(html, new RegExp(`sunmi-text-warning">${TEXTO_NO_ESTA}<`));
  assert.ok(html.includes("Hoy cuesta"), "sin renglón la cuenta dice lo que cuesta hoy");
  // Sin costo nuevo, una raya.
  assert.match(html, />—</);
});

test("PARA REVISAR CON LECTURA: «✓ Usar» arriba y «Corregir» abajo, el renglón y la cuenta", () => {
  const f = fila({ diferenciaPct: 99.5, costoMaestroPropuesto: 2587 });
  const lectura = lecturaParaPantalla({
    lectura: { clave: "PACK_10", multiplicador: 10, costoNuevo: 1469.75, variacionPct: 13.06, estado: ESTADO_VARIACION.ESPERADO },
    precioLista: 146.975,
    recargoPct: 0,
    factorPack: 10,
    recomendada: true,
  });
  const item = itemDe({ filas: [f], lecturaPorFila: new Map([[f.id, { lectura, confirmable: true }]]) });
  const html = dibujar({ item, abierta: true });
  assert.deepEqual(botones(html).map((x) => x.texto), [TEXTO_USAR, TEXTO_CORREGIR]);
  assert.ok(html.includes("1612 · SOLITAS ANIMACION 400G"), "no está el renglón de la lista");
  // La multiplicación hecha, no solo "× 10" (2026-10-24).
  assert.equal(conEspacios(cuentaDe(item)), "$ 146,98 × 10 = $ 1.469,75 · hoy $ 1.300,00");
  // El porcentaje, verde porque está adentro del rango.
  assert.match(html, /sunmi-text-success[^>]*>\+13,1 %</);
});

test("CAMBIA: el mismo «✓ Usar», relleno y apretado", () => {
  const html = dibujar({ item: itemDe({ filas: [fila()] }), abierta: true });
  const b = botones(html);
  assert.deepEqual(b.map((x) => x.texto), [TEXTO_USAR, TEXTO_CORREGIR]);
  assert.match(b[0].atributos, /aria-pressed="true"/);
  assert.ok(!b[0].atributos.includes(CLASE_ACCION_RAPIDA), "relleno no puede ser el contorno");
});

test("UNA SUBA FUERA DE RANGO VA EN VERDE, CON «FUERA DE RANGO» APARTE Y EL BORDE ÁMBAR (ALICANTE PEREJIL)", () => {
  // +14,3 % sobre el 0 a 12 de Dab: antes salía en ámbar y se leía como baja.
  const rango = { minPct: 0, maxPct: 12 };
  const f = fila({ diferenciaPct: 14.3, costoMaestroPropuesto: 1485.9, aumentoEsperadoMinPct: 0, aumentoEsperadoMaxPct: 12 });
  const item = tusProductosDeLaLista({ productos: [{ id: 7, nombre: "ALICANTE PEREJIL 25G", precio_costo: 1300, filas: [f] }], rango }).items[0];
  const html = dibujar({ item, abierta: true });
  assert.match(html, /sunmi-text-success[^>]*>\+14,3 %</, "la suba no está en verde");
  assert.ok(!/sunmi-text-warning[^>]*>\+14,3 %</.test(html), "el porcentaje volvió a ámbar");
  assert.ok(html.includes(TEXTO_FUERA_DE_RANGO), "falta la etiqueta «Fuera de rango»");
  assert.ok(html.includes(CLASE_TARJETA_FUERA_DE_RANGO), "falta el borde ámbar de la tarjeta");
  // Contraprueba: la misma suba ADENTRO del rango no lleva ni etiqueta ni borde.
  const adentro = tusProductosDeLaLista({
    productos: [{ id: 7, nombre: "ALICANTE PEREJIL 25G", precio_costo: 1300, filas: [f] }],
    rango: { minPct: 0, maxPct: 15 },
  }).items[0];
  const h2 = dibujar({ item: adentro, abierta: true });
  assert.match(h2, /sunmi-text-success[^>]*>\+14,3 %</);
  assert.ok(!h2.includes(TEXTO_FUERA_DE_RANGO));
  assert.ok(!h2.includes(CLASE_TARJETA_FUERA_DE_RANGO));
});

test("EL COLOR DEL PORCENTAJE DICE SOLO LA DIRECCIÓN: verde sube, rojo baja, gris igual", () => {
  assert.equal(tonoDelPorcentaje(14.3), "sunmi-text-success");
  assert.equal(tonoDelPorcentaje(-0.5), "sunmi-text-danger");
  assert.equal(tonoDelPorcentaje(0.05), "sunmi-text-muted", "dentro de la tolerancia es el mismo precio");
  assert.equal(tonoDelPorcentaje(null), "sunmi-text-muted");
});

test("UNA LISTA CERRADA NO TIENE BOTONES, Y UN CONTROL NO TIENE «USAR»", () => {
  const cerrada = dibujar({ item: itemDe({ filas: [fila()], abierta: false }), abierta: false });
  assert.equal(botones(cerrada).length, 0);
  const control = dibujar({ item: itemDe({ filas: [fila()] }), abierta: true, controlando: true });
  assert.deepEqual(botones(control).map((x) => x.texto), [TEXTO_CORREGIR]);
});

test("DESDE UN LOCAL SIN PROPIEDAD DEL COSTO NO SE OFRECE «USAR» NI «CORREGIR», PERO SÍ VINCULAR", () => {
  // El `item` sale de `tusProductosDeLaLista` con `puedeCambiarCostos: false`,
  // que es como lo manda la ruta desde "Local: mini el 7". La contraprueba es
  // el mismo producto desde el depósito, en el test de «CAMBIA» de arriba.
  const productos = (filas) => [{ id: 7, nombre: "Solitas Animación 400 g", precio_costo: 1300, filas }];
  const cambia = tusProductosDeLaLista({ productos: productos([fila()]), rango: RANGO, puedeCambiarCostos: false }).items[0];
  const html = dibujar({ item: cambia, abierta: true, puedeCambiarCostos: false });
  assert.deepEqual(botones(html).map((x) => x.texto), [], "desde el local no hay nada que tocar en una que cambia");
  assert.ok(!html.includes(TEXTO_USAR));
  // Aunque el servidor mandara un `usar`, la tarjeta tampoco lo dibuja.
  const conUsar = itemDe({ filas: [fila()] });
  assert.ok(!dibujar({ item: conUsar, abierta: true, puedeCambiarCostos: false }).includes(TEXTO_USAR));
  // Vincular sí: el vínculo es del proveedor, no de la ubicación.
  const sinVincular = tusProductosDeLaLista({ productos: productos([]), rango: RANGO, puedeCambiarCostos: false }).items[0];
  assert.deepEqual(botones(dibujar({ item: sinVincular, abierta: true, puedeCambiarCostos: false })).map((x) => x.texto), [
    TEXTO_VINCULAR,
    TEXTO_NO_VIENE,
  ]);
});

test("UNA VINCULADA DICE QUE EL VÍNCULO ESTÁ HECHO, Y NUNCA QUEDA SIN ACCIÓN", () => {
  const html = dibujar({ item: itemDe({ filas: [fila()] }), abierta: true });
  assert.match(html, new RegExp(`sunmi-text-success" aria-label="vinculado">${MARCA_VINCULADO}<`));
  // «Mismo precio» tenía la tarjeta muda: ahora tiene «Corregir».
  const igual = itemDe({ filas: [fila({ estado: ESTADO_LINEA.SIN_CAMBIOS, diferenciaPct: 0, costoMaestroPropuesto: 1300 })] });
  assert.deepEqual(botones(dibujar({ item: igual, abierta: true })).map((x) => x.texto), [TEXTO_CORREGIR]);
  // Sin costo nuevo, «Para revisar» con «Corregir» y el porqué en ámbar.
  const sinCosto = itemDe({ filas: [fila({ estado: ESTADO_LINEA.SIN_CAMBIOS, costoMaestroPropuesto: null, diferenciaPct: null })] });
  const h = dibujar({ item: sinCosto, abierta: true });
  assert.deepEqual(botones(h).map((x) => x.texto), [TEXTO_CORREGIR]);
  assert.match(h, /sunmi-text-warning">No sé por cuánto multiplicar el precio de la lista/);
  // La aplicada no: su costo ya está escrito.
  const aplicada = itemDe({ filas: [fila({ aplicada: true })] });
  assert.deepEqual(botones(dibujar({ item: aplicada, abierta: true })).map((x) => x.texto), []);
});

test("9 DE ORO DIBUJADO: la cuenta con la caja de 20, el −0,5 % en rojo y fuera de rango, y «✓ Usar» además de «Corregir»", () => {
  // Las lecturas salen de `lecturasDeLaFila` con los números del renglón 281 de
  // Dab; no se escriben a mano.
  const f = fila({
    id: 281, estado: ESTADO_LINEA.FACTOR_DUDOSO, seleccionada: false, costoAnterior: 19200,
    costoMaestroPropuesto: null, diferenciaPct: null, codigoCrudo: "281",
    descripcionProveedor: "9 DE ORO AGRIDULCE 200G", precioConIva: 955, unidadesPorBulto: null,
    codigoNormalizado: "281", unidadProveedor: "", aumentoEsperadoMinPct: 0, aumentoEsperadoMaxPct: 12,
  });
  const producto = {
    id: 7, nombre: "9 DE ORO AGRIDULCE", precio_costo: 19200, factor_pack: 20, unidad_medida: "pack",
    modoCompraProveedor: null, pesoReferenciaKg: null, creadoEnLocalId: null, es_combo: false,
  };
  const cab = { estado: "CONCILIADA", recargoPct: 0, impuestoAdicionalPct: null, proveedor: { id: 1, nombre: "Dab", parserListaId: null } };
  const rango = { minPct: 0, maxPct: 12 };
  const { lecturas, confirmable } = lecturasDeLaFila({ fila: f, producto, cab, rango });
  const item = tusProductosDeLaLista({
    productos: [{ id: 7, nombre: "9 DE ORO AGRIDULCE", precio_costo: 19200, filas: [f] }],
    rango,
    lecturaPorFila: new Map([[f.id, { lectura: lecturaElegida({ lecturas, fila: f }), delPropuesto: null, confirmable }]]),
    proveedor: "Dab",
  }).items[0];
  assert.equal(conEspacios(cuentaDe(item)), "$ 955,00 × 20 = $ 19.100,00 · hoy $ 19.200,00");
  const html = dibujar({ item, abierta: true });
  assert.deepEqual(botones(html).map((x) => x.texto), [TEXTO_USAR, TEXTO_CORREGIR]);
  // Una baja va en rojo; que esté fuera del 0 a 12 lo dice la etiqueta aparte.
  assert.match(html, /sunmi-text-danger[^>]*>-0,5 %</);
  assert.ok(html.includes(TEXTO_FUERA_DE_RANGO));
  // El cartel ámbar que explica el motivo se mantiene.
  assert.ok(html.includes("Bajó 0,5 %. Dab suele aumentar entre 0 % y 12 %."));
  assert.ok(!html.includes(">—<"), "volvió el costo nuevo en raya");
});

// ── «¿ES ESTE?» EN LA TARJETA SIN VINCULAR (Emanuel, 2026-10-24) ─────────
//
// Los renglones tienen los campos que la ruta del resultado le pide a la base
// para sugerir (`sugerenciasParaLosSinVincular`), y la sugerencia sale de
// `sugerenciaDeRenglon`, no se escribe a mano.
function renglonLibre(cambios = {}) {
  return {
    id: proximoId++,
    codigoCrudo: "101",
    descripcionProveedor: "BIZCOCHITOS CAMPEON 300G",
    unidadProveedor: "",
    unidadesPorBulto: null,
    precioConIva: 1250.5,
    productoBaseId: null,
    ...cambios,
  };
}

function sinVincularConSugerencia(renglones, { abierta = true } = {}) {
  const nombre = "Bizcochitos Campeón 300 g";
  const s = sugerenciaDeRenglon({ filas: renglones, nombreDelProducto: nombre, productoBaseId: 7 });
  return tusProductosDeLaLista({
    productos: [{ id: 7, nombre, precio_costo: 1200, filas: [] }],
    rango: RANGO,
    abierta,
    sugerencias: s ? new Map([[7, s]]) : new Map(),
  }).items[0];
}

test("SIN VINCULAR CON UN RENGLÓN PARECIDO: pregunta «¿Es 101 · …?» con su precio, «✓ Sí» arriba y «Otro» y «No viene» abajo", () => {
  const item = sinVincularConSugerencia([renglonLibre(), renglonLibre({ codigoCrudo: "900", descripcionProveedor: "YERBA AGUANTADORA 1KG" })]);
  assert.equal(item.sugerencia?.codigo, "101");
  const html = dibujar({ item, abierta: true });
  assert.ok(html.includes("¿Es 101 · BIZCOCHITOS CAMPEON 300G?"), "falta la pregunta");
  assert.ok(conEspacios(html).includes("$ 1.250,50"), "falta el precio del renglón");
  const b = botones(html);
  assert.deepEqual(b.map((x) => x.texto), [TEXTO_SI, TEXTO_OTRO, TEXTO_NO_VIENE]);
  assert.ok(b[0].atributos.includes(CLASE_ACCION_RAPIDA));
});

test("«✓ SÍ» AVISA CON EL ITEM DE LA SUGERENCIA, Y LA PANTALLA VINCULA CON ESE RENGLÓN", () => {
  // La pieza no llama rutas: el botón dispara `onSi(item)`. La pantalla manda
  // `filaElegidaId: item.sugerencia.id` a la misma ruta que la hoja.
  const item = sinVincularConSugerencia([renglonLibre({ id: 4242 })]);
  assert.equal(item.sugerencia.id, 4242);
  const fuente = readFileSync(new URL("../../../app/modulos/proveedores/listas/[id]/page.jsx", import.meta.url), "utf8").replace(
    /\/\/[^\n]*/g,
    ""
  );
  const si = fuente.match(/const si = async \(item\) => \{[\s\S]*?\n {2}\};/)?.[0] ?? "";
  assert.ok(si, "no está el «✓ Sí» de la pantalla");
  assert.match(si, /\/en-la-lista`/);
  assert.match(si, /\{ filaElegidaId: s\.id \}/);
  assert.match(si, /const s = item\.sugerencia;/);
  // Y sigue el camino de la hoja: la única en rango se toma sola.
  assert.match(si, /tomarLaUnica: true/);
  assert.match(fuente, /onSi=\{si\}/);
});

test("SIN CANDIDATO PARECIDO, LA TARJETA QUEDA COMO ANTES; Y NUNCA SE VINCULA SOLA", () => {
  const item = sinVincularConSugerencia([renglonLibre({ descripcionProveedor: "YERBA AGUANTADORA 1KG", codigoCrudo: "900" })]);
  assert.equal(item.sugerencia, null);
  assert.deepEqual(botones(dibujar({ item, abierta: true })).map((x) => x.texto), [TEXTO_VINCULAR, TEXTO_NO_VIENE]);
  // Un renglón que ya es de otro producto no se sugiere.
  const tomado = sinVincularConSugerencia([renglonLibre({ productoBaseId: 99 })]);
  assert.equal(tomado.sugerencia, null);
  // Con la lista cerrada, tampoco.
  assert.equal(sinVincularConSugerencia([renglonLibre()], { abierta: false }).sugerencia, null);
  // La sugerencia no vincula: el producto sigue sin renglón.
  const sugerido = sinVincularConSugerencia([renglonLibre()]);
  assert.equal(sugerido.renglones, 0);
  assert.equal(sugerido.filaId, null);
});

// ── «¿CUÁNTAS TRAE LA CAJA?» (ALICANTE PIMENTÓN 25G, Emanuel, 2026-10-24) ──
//
// Con los números del renglón 4233 de Dab: $ 800,45 la unidad, hoy $ 19.680, y
// ni el catálogo ni el papel dicen cuántas trae.
function pimenton({ cajaRecordada = null, puedeCambiarCostos = true } = {}) {
  const f = fila({
    id: 4233, estado: ESTADO_LINEA.FACTOR_DUDOSO, seleccionada: false, costoAnterior: 19680,
    costoMaestroPropuesto: null, diferenciaPct: null, codigoCrudo: "4233",
    descripcionProveedor: "ALICANTE PIMENTON 25G", precioConIva: 800.45, unidadesPorBulto: null,
    // Vacío: el lector genérico no trae unidad comercial (`importacionGenerica.js`).
    codigoNormalizado: "4233", unidadProveedor: "", aumentoEsperadoMinPct: 0, aumentoEsperadoMaxPct: 12,
  });
  const producto = conLoRecordado(
    {
      id: 9, nombre: "ALICANTE PIMENTÓN 25G", precio_costo: 19680, factor_pack: null, unidad_medida: "unidad",
      modoCompraProveedor: null, pesoReferenciaKg: null, creadoEnLocalId: null, es_combo: false,
    },
    cajaRecordada
  );
  const cab = { estado: "CONCILIADA", recargoPct: 0, impuestoAdicionalPct: null, proveedor: { id: 1, nombre: "Dab", parserListaId: null } };
  const rango = { minPct: 0, maxPct: 12 };
  const { lecturas, confirmable, admiteCaja } = lecturasDeLaFila({ fila: f, producto, cab, rango });
  return tusProductosDeLaLista({
    productos: [{ id: 9, nombre: "ALICANTE PIMENTÓN 25G", precio_costo: 19680, filas: [f] }],
    rango,
    lecturaPorFila: new Map([[f.id, { lectura: lecturaElegida({ lecturas, fila: f }), delPropuesto: null, confirmable, admiteCaja }]]),
    proveedor: "Dab",
    puedeCambiarCostos,
  }).items[0];
}

test("SIN SABER CUÁNTAS TRAE LA CAJA, LA TARJETA LO PREGUNTA AHÍ MISMO, CON UN CAMPO Y «LISTO»", () => {
  const item = pimenton();
  assert.equal(item.preguntarCaja, true);
  assert.equal(item.costoNuevo, null);
  const html = dibujar({ item, abierta: true });
  assert.ok(html.includes(TEXTO_PREGUNTA_CAJA));
  assert.match(html, /<input[^>]*type="number"/);
  assert.ok(botones(html).some((b) => b.texto === TEXTO_LISTO));
  // Desde una ubicación que no administra el costo, no se pregunta.
  assert.equal(pimenton({ puedeCambiarCostos: false }).preguntarCaja, false);
});

test("CON LA CAJA DE 24 RECORDADA, LA CUENTA SE ARMA Y LA PREGUNTA SE VA", () => {
  const item = pimenton({ cajaRecordada: { clave: "CAJA_DE_24", multiplicador: 24, cantidad: 24 } });
  assert.equal(item.preguntarCaja, false);
  assert.equal(conEspacios(cuentaDe(item)), "$ 800,45 × 24 = $ 19.210,80 · hoy $ 19.680,00");
  const html = dibujar({ item, abierta: true });
  assert.ok(!html.includes(TEXTO_PREGUNTA_CAJA));
  assert.deepEqual(botones(html).map((x) => x.texto), [TEXTO_USAR, TEXTO_CORREGIR]);
});

// ── «¿CUÁNTOS KILOS TRAE LA PIEZA?» (GRANIX BOCADITO 2KG, 2026-10-24) ───
//
// Producto por kilo a $ 6.405, renglón 5808 de Dab a $ 22.105,73 la pieza, en
// bulto de 2. Los `item` salen de `lecturasDeLaFila` y `tusProductosDeLaLista`.
function granix({ kilos = null } = {}) {
  const f = fila({
    id: 5808, estado: ESTADO_LINEA.FACTOR_DUDOSO, motivo: "SIN_LECTURAS", seleccionada: false, costoAnterior: 6405,
    costoMaestroPropuesto: null, diferenciaPct: null, codigoCrudo: "5808", codigoNormalizado: "5808",
    descripcionProveedor: "GRANIX BOCADITOS CHOC BLANCO 2 K", precioConIva: 22105.73, unidadesPorBulto: 2,
    unidadProveedor: "", aumentoEsperadoMinPct: 0, aumentoEsperadoMaxPct: 12, kilosConfirmados: null,
  });
  const producto = conLoRecordado(
    {
      id: 31, nombre: "GRANIX BOCADITO CHOC. BLANCO 2KG", precio_costo: 6405, factor_pack: 1, unidad_medida: "kg",
      modoCompraProveedor: "BULTO", pesoReferenciaKg: null, creadoEnLocalId: null, es_combo: false,
    },
    kilos === null ? null : { clave: "KILOS_POR_PIEZA", multiplicador: 1, cantidad: null, kilosPorPieza: String(kilos) }
  );
  const cab = { estado: "CONCILIADA", recargoPct: 0, impuestoAdicionalPct: null, proveedor: { id: 1, nombre: "Dab", parserListaId: null } };
  const rango = { minPct: 0, maxPct: 12 };
  const leida = lecturasDeLaFila({ fila: f, producto, cab, rango });
  return tusProductosDeLaLista({
    productos: [{ id: 31, nombre: "GRANIX BOCADITO CHOC. BLANCO 2KG", precio_costo: 6405, filas: [f] }],
    rango,
    lecturaPorFila: new Map([[f.id, { ...leida, lectura: lecturaElegida({ lecturas: leida.lecturas, fila: f }), delPropuesto: null }]]),
    proveedor: "Dab",
  }).items[0];
}

test("GRANIX SIN KILOS: LA TARJETA PREGUNTA «¿CUÁNTOS KILOS TRAE LA PIEZA?», CON DECIMALES Y «LISTO»", () => {
  const item = granix();
  const html = dibujar({ item, abierta: true });
  assert.ok(html.includes(TEXTO_PREGUNTA_KILOS));
  assert.ok(!html.includes(TEXTO_PREGUNTA_CAJA), "a un producto por kilo se le preguntó la caja");
  assert.match(html, /<input[^>]*inputMode="decimal"/);
  assert.match(html, /<input[^>]*step="0\.001"/);
  assert.ok(botones(html).some((b) => b.texto === TEXTO_LISTO));
  // La cuenta de hoy, en kilos.
  assert.equal(conEspacios(cuentaDe(item)), "$ 22.105,73 la pieza · hoy $ 6.405,00 el kilo");
  // "2,5" y "2.5" son la misma respuesta.
  assert.equal(numeroDeLaRespuesta("2,5"), 2.5);
  assert.equal(numeroDeLaRespuesta("2.5"), 2.5);
  assert.ok(Number.isNaN(numeroDeLaRespuesta("")));
});

test("GRANIX CON LA PIEZA DE 2 KG: LA CUENTA EN KILOS CONTRA $ 6.405 EL KILO, Y «✓ USAR»", () => {
  const item = granix({ kilos: 2 });
  assert.equal(item.preguntarKilos, false);
  // Se eligió el bulto, que es el más cercano al costo de hoy (−13,7 %).
  assert.equal(conEspacios(cuentaDe(item)), "$ 22.105,73 ÷ (2 piezas × 2 kg) = $ 5.526,43 el kilo · hoy $ 6.405,00 el kilo");
  const html = dibujar({ item, abierta: true });
  assert.ok(!html.includes(TEXTO_PREGUNTA_KILOS));
  assert.deepEqual(botones(html).map((x) => x.texto), [TEXTO_USAR, TEXTO_CORREGIR]);
  // Una baja va en rojo, y fuera del 0 a 12 lo dice la etiqueta aparte.
  assert.match(html, /sunmi-text-danger[^>]*>-13,7 %</);
  // La pieza sola, con la cuenta del pedido de Emanuel.
  const soloPieza = { ...item, divisorKg: 2, kilosPorPieza: 2, piezas: null, costoNuevo: 11052.87, precioBase: 22105.73 };
  assert.equal(conEspacios(cuentaDe(soloPieza)), "$ 22.105,73 ÷ 2 kg = $ 11.052,87 el kilo · hoy $ 6.405,00 el kilo");
});

test("EL RECHAZO DEL SERVIDOR SE DIBUJA EN LA TARJETA DONDE SE TOCÓ", () => {
  const html = dibujar({ item: itemDe({ filas: [fila()] }), abierta: true, error: "No se pudo. No se guardó nada." });
  assert.match(html, /sunmi-text-danger[^>]*>No se pudo\. No se guardó nada\.</);
});
