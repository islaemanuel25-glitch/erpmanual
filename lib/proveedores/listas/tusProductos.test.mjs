// LA REVISIÓN DE UNA LISTA, PRODUCTO POR PRODUCTO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/tusProductos.test.mjs
//
// Lo que se afirma acá es la regla que reemplaza a las seis tarjetas y a las
// tres pantallas sueltas (diseño de Emanuel, 2026-10-23), y la pantalla que la
// dibuja. Las filas tienen EXACTAMENTE los campos que `resultado/route.js` le
// pide a la base para esta lista —`CAMPOS_CONTEO` más el renglón—: un campo de
// menos llega en `undefined`, y es la forma en que este módulo ya contó tres
// veces "se actualizan" sobre filas que no se iban a escribir.
//
// El caso de referencia es la primera lista de Dab: de sus 158 productos, la
// lista trajo 14. Acá alcanza con uno por estado.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { lecturaDelPropuesto, lecturaElegida, lecturasDeLaFila } from "./lecturasDeLaFila.js";
import { lecturaParaPantalla } from "./explicarLectura.js";
import { ESTADO_VARIACION, TOLERANCIA_MISMO_PRECIO_PCT, esMismoPrecio } from "./rangoAumento.js";
import {
  ACCION_USAR,
  ESTADO_TU_PRODUCTO,
  FILTRO,
  MOTIVO_DESMARCADA,
  MOTIVO_OMITIDA,
  MOTIVO_SIN_COSTO_NUEVO,
  estadoDeTuProducto,
  tusProductosDeLaLista,
  filtroInicial,
  cantidadDelFiltro,
  ORDEN_FILTROS,
  quienAdministraLosCostos,
  seVe,
  primerasPalabras,
} from "./tusProductos.js";
import { MOTIVO_CONCILIACION } from "./conciliarLista.js";
import { ESTADO_LINEA } from "./estados.js";
import { MOTIVO_REVISION, contarResultado } from "./resultadoDeLaLista.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const codigoDe = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const RANGO = { minPct: 2, maxPct: 15 };

/** Una fila con los campos que selecciona la ruta, y los valores de una lista real. */
let proximoId = 1;
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
    precioConIva: 14697.5,
    unidadesPorBulto: 10,
    ...cambios,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// UN ESTADO POR PRODUCTO
// ══════════════════════════════════════════════════════════════════════════

test("SIN RENGLÓN EN LA LISTA: «Sin vincular», y si alguien lo dijo, «No viene en esta lista»", () => {
  assert.equal(estadoDeTuProducto({ filas: [] }).estado, ESTADO_TU_PRODUCTO.SIN_VINCULAR);
  assert.equal(estadoDeTuProducto({ filas: [], noViene: true }).estado, ESTADO_TU_PRODUCTO.NO_VIENE);
});

test("LISTA, TILDADA Y EN RANGO: «Cambia» — es la misma fila que aplicar va a escribir", () => {
  const r = estadoDeTuProducto({ filas: [fila()], rango: RANGO });
  assert.equal(r.estado, ESTADO_TU_PRODUCTO.CAMBIA);
});

test("LA QUE APLICAR VA A OMITIR HOY NO DICE «Cambia»: es para revisar, con su motivo", () => {
  const f = fila();
  const r = estadoDeTuProducto({ filas: [f], rango: RANGO, omitidas: new Set([f.id]) });
  assert.equal(r.estado, ESTADO_TU_PRODUCTO.REVISAR);
  assert.equal(r.motivo, MOTIVO_OMITIDA);
});

test("FUERA DE RANGO Y SIN ELEGIR: «Revisar», porque aumenta distinto de lo esperado", () => {
  const r = estadoDeTuProducto({ filas: [fila({ diferenciaPct: 99.5 })], rango: RANGO });
  assert.equal(r.estado, ESTADO_TU_PRODUCTO.REVISAR);
  assert.equal(r.motivo, MOTIVO_REVISION.AUMENTO_DISTINTO);
});

test("FACTOR DUDOSO: «Revisar» — es la decisión de caja entera o una unidad", () => {
  const r = estadoDeTuProducto({
    filas: [fila({ estado: ESTADO_LINEA.FACTOR_DUDOSO, costoMaestroPropuesto: null, diferenciaPct: null })],
    rango: RANGO,
  });
  assert.equal(r.estado, ESTADO_TU_PRODUCTO.REVISAR);
  assert.equal(r.motivo, MOTIVO_REVISION.AUMENTO_DISTINTO);
});

test("DEJADA A MANO: «No lo cambio», sin botón", () => {
  const r = estadoDeTuProducto({ filas: [fila({ excluidaManual: true })], rango: RANGO });
  assert.equal(r.estado, ESTADO_TU_PRODUCTO.NO_LO_CAMBIO);
});

test("EL MISMO PRECIO QUE YA TIENE: «Mismo precio»", () => {
  const r = estadoDeTuProducto({ filas: [fila({ estado: ESTADO_LINEA.SIN_CAMBIOS, diferenciaPct: 0 })], rango: RANGO });
  assert.equal(r.estado, ESTADO_TU_PRODUCTO.MISMO_PRECIO);
});

test("YA APLICADA: «Actualizado», le gane a lo que le gane", () => {
  const r = estadoDeTuProducto({
    filas: [fila({ diferenciaPct: 99.5 }), fila({ aplicada: true })],
    rango: RANGO,
  });
  assert.equal(r.estado, ESTADO_TU_PRODUCTO.ACTUALIZADO);
});

test("CON DOS RENGLONES, LO QUE SE VA A ESCRIBIR LE GANA A LO QUE FALTA MIRAR", () => {
  // El orden de `grupoQueNoCambia`: si una fila suya se escribe, el producto
  // cambia, aunque otra esté pendiente.
  const r = estadoDeTuProducto({ filas: [fila({ diferenciaPct: 99.5 }), fila()], rango: RANGO });
  assert.equal(r.estado, ESTADO_TU_PRODUCTO.CAMBIA);
});

test("DESMARCADA CON LA LISTA ABIERTA: «Para revisar», para poder volver a usarla", () => {
  // Es lo que deja el «Usar» relleno al tocarlo: `seleccion` DESMARCAR pone
  // `seleccionada: false` y nada más.
  const r = estadoDeTuProducto({ filas: [fila({ seleccionada: false })], rango: RANGO, abierta: true });
  assert.equal(r.estado, ESTADO_TU_PRODUCTO.REVISAR);
  assert.equal(r.motivo, MOTIVO_DESMARCADA);
  // Cerrada ya no se puede tildar: vuelve a ser «No lo cambio».
  const cerrada = estadoDeTuProducto({ filas: [fila({ seleccionada: false })], rango: RANGO, abierta: false });
  assert.equal(cerrada.estado, ESTADO_TU_PRODUCTO.NO_LO_CAMBIO);
  // Y lo dejado a mano NO es desmarcado: es otra columna, otra decisión.
  const dejada = estadoDeTuProducto({ filas: [fila({ seleccionada: false, excluidaManual: true })], rango: RANGO });
  assert.equal(dejada.estado, ESTADO_TU_PRODUCTO.NO_LO_CAMBIO);
});

// ══════════════════════════════════════════════════════════════════════════
// QUÉ HACE «✓ USAR»
// ══════════════════════════════════════════════════════════════════════════
//
// La lectura NO se escribe a mano: sale de `lecturaParaPantalla`, que es la que
// arma `lecturasDeLaFila` para la ruta. Así tiene los campos que tiene de verdad.

function lecturaDe({ clave = "PACK_10", multiplicador = 10, costoNuevo = 1469.75, variacionPct = 13.06, estado = ESTADO_VARIACION.ESPERADO, recomendada = true, absurda = false } = {}) {
  return lecturaParaPantalla({
    lectura: { clave, multiplicador, costoNuevo, variacionPct, estado, absurda },
    precioLista: 146.975,
    recargoPct: 0,
    factorPack: 10,
    recomendada,
  });
}

test("«USAR» SOBRE UNA PARA REVISAR CONFIRMA LA LECTURA QUE LA TARJETA MUESTRA", () => {
  const f = fila({ productoBaseId: 2, diferenciaPct: 99.5, costoMaestroPropuesto: 2587 });
  const lectura = lecturaDe({ costoNuevo: 1469.75, variacionPct: 13.06 });
  const r = tusProductosDeLaLista({
    productos: [{ id: 2, nombre: "Criollitas 300 g", precio_costo: 1300, filas: [f] }],
    rango: RANGO,
    lecturaPorFila: new Map([[f.id, { lectura, confirmable: true }]]),
  });
  const it = r.items[0];
  assert.equal(it.estado, ESTADO_TU_PRODUCTO.REVISAR);
  assert.equal(it.usar.accion, ACCION_USAR.CONFIRMAR);
  assert.equal(it.usar.clave, "PACK_10");
  // Lo que se muestra es lo que se acepta, no el número que el motor guardó.
  assert.equal(it.costoNuevo, 1469.75);
  assert.equal(it.variacionPct, 13.06);
  assert.equal(it.multiplicador, 10);
  assert.equal(it.enRango, true);
});

test("SIN LECTURA QUE ACEPTAR, O SI CONFIRMAR NO LA TOMARÍA, NO HAY «USAR»: queda «Corregir»", () => {
  const f = fila({ productoBaseId: 2, estado: ESTADO_LINEA.CODIGO_DUPLICADO });
  const conLectura = new Map([[f.id, { lectura: lecturaDe(), confirmable: false }]]);
  const productos = [{ id: 2, nombre: "Criollitas 300 g", precio_costo: 1300, filas: [f] }];
  assert.equal(tusProductosDeLaLista({ productos, rango: RANGO, lecturaPorFila: conLectura }).items[0].usar, null);
  const sinLectura = new Map([[f.id, { lectura: null, confirmable: true }]]);
  assert.equal(tusProductosDeLaLista({ productos, rango: RANGO, lecturaPorFila: sinLectura }).items[0].usar, null);
});

test("«USAR» RELLENO SOBRE UNA QUE CAMBIA LA DESMARCA, Y SOBRE UNA DESMARCADA LA VUELVE A MARCAR", () => {
  const cambia = fila({ productoBaseId: 1 });
  const desmarcada = fila({ productoBaseId: 3, seleccionada: false });
  const productos = [
    { id: 1, nombre: "Solitas Animación 400 g", precio_costo: 1300, filas: [cambia] },
    { id: 3, nombre: "Express 3 x 100", precio_costo: 1300, filas: [desmarcada] },
  ];
  const r = tusProductosDeLaLista({ productos, rango: RANGO });
  assert.equal(r.items[0].usar.accion, ACCION_USAR.DESMARCAR);
  assert.equal(r.items[1].usar.accion, ACCION_USAR.MARCAR);
  // Con la lista cerrada no hay botón: el servidor lo rechazaría.
  const cerrada = tusProductosDeLaLista({ productos, rango: RANGO, abierta: false });
  assert.equal(cerrada.items[0].usar, null);
  assert.equal(cerrada.items[1].usar, null);
});

test("EL PORCENTAJE ES VERDE ADENTRO DEL RANGO Y ÁMBAR AFUERA", () => {
  const adentro = fila({ productoBaseId: 1 });
  const afuera = fila({ productoBaseId: 2, diferenciaPct: 99.5 });
  const r = tusProductosDeLaLista({
    productos: [
      { id: 1, nombre: "A", precio_costo: 1300, filas: [adentro] },
      { id: 2, nombre: "B", precio_costo: 1300, filas: [afuera] },
      { id: 3, nombre: "C", precio_costo: 1300, filas: [] },
    ],
    rango: RANGO,
  });
  assert.equal(r.items[0].enRango, true);
  assert.equal(r.items[1].enRango, false);
  assert.equal(r.items[2].enRango, null, "sin porcentaje no hay color");
});

test("LA LECTURA ELEGIDA: la recomendada; si no, la más cercana al costo de hoy; nunca una absurda", () => {
  const fuera = ESTADO_VARIACION.DISMINUCION;
  const recomendada = lecturaDe({ clave: "PACK_10", costoNuevo: 1469.75, recomendada: true });
  const otra = lecturaDe({ clave: "MISMA_PRESENTACION", costoNuevo: 146.98, variacionPct: -88.7, estado: fuera, recomendada: false });
  assert.equal(lecturaElegida({ lecturas: [otra, recomendada] }).clave, "PACK_10");
  // Ninguna en rango: la más cercana, aunque esté fuera.
  const cerca = lecturaDe({ clave: "PACK_20", costoNuevo: 19100, variacionPct: -0.52, estado: fuera, recomendada: false });
  const lejos = lecturaDe({ clave: "PACK_24", costoNuevo: 22920, variacionPct: 19.4, estado: ESTADO_VARIACION.AUMENTO_ALTO, recomendada: false });
  assert.equal(lecturaElegida({ lecturas: [lejos, cerca] }).clave, "PACK_20");
  // La absurda no, aunque sea la única.
  const absurda = lecturaDe({ clave: "PACK_100", costoNuevo: 14697.5, recomendada: true, absurda: true });
  assert.equal(lecturaElegida({ lecturas: [absurda] }), null);
  // La del costo propuesto, al centavo, es la cuenta de las que no se revisan.
  assert.equal(lecturaDelPropuesto({ lecturas: [otra, recomendada], fila: { costoMaestroPropuesto: "1469.75" } }).clave, "PACK_10");
  assert.equal(lecturaDelPropuesto({ lecturas: [otra, recomendada], fila: { costoMaestroPropuesto: 999 } }), null);
});

// ══════════════════════════════════════════════════════════════════════════
// NUNCA UNIDAD CONTRA CAJA (Emanuel, 2026-10-24): los dos casos de Dab
// ══════════════════════════════════════════════════════════════════════════
//
// Las lecturas NO se escriben a mano: salen de `lecturasDeLaFila`, la misma que
// usa la ruta, con la fila y el producto con los nombres del modelo y los
// números de la lista de Dab. Dab no tiene lector propio: lee el genérico.

const DAB = { estado: "CONCILIADA", recargoPct: 0, impuestoAdicionalPct: null, proveedor: { id: 1, nombre: "Dab", parserListaId: null } };
const RANGO_DAB = { minPct: 0, maxPct: 12 };

/** Una fila por revisar como la deja el motor cuando no pudo elegir lectura. */
function filaDeDab({ id, codigo, descripcion, precio, costoHoy }) {
  return {
    id, estado: ESTADO_LINEA.FACTOR_DUDOSO, motivo: null, aplicada: false, excluidaManual: false, seleccionada: false,
    productoBaseId: id, codigoCrudo: codigo, codigoNormalizado: codigo, descripcionProveedor: descripcion,
    unidadProveedor: "UN", unidadesPorBulto: null, precioConIva: precio, precioSinIva: null, descuentoPct: null,
    costoAnterior: costoHoy, costoMaestroPropuesto: null, diferenciaPct: null, recargoPct: 0,
    aumentoEsperadoMinPct: 0, aumentoEsperadoMaxPct: 12, confirmadoEn: null, vinculadoEn: null,
    multiplicadorConfirmado: null, fueraDeRangoAceptadaEn: null,
  };
}

function laTarjetaDe({ fila: f, nombre, factorPack }) {
  const producto = {
    id: f.id, nombre, precio_costo: f.costoAnterior, factor_pack: factorPack, unidad_medida: "pack",
    modoCompraProveedor: null, pesoReferenciaKg: null, creadoEnLocalId: null, es_combo: false,
  };
  const { lecturas, confirmable } = lecturasDeLaFila({ fila: f, producto, cab: DAB, rango: RANGO_DAB });
  const lecturaPorFila = new Map([[f.id, { lectura: lecturaElegida({ lecturas, fila: f }), delPropuesto: null, confirmable }]]);
  return tusProductosDeLaLista({
    productos: [{ id: f.id, nombre, precio_costo: f.costoAnterior, filas: [f] }],
    rango: RANGO_DAB,
    lecturaPorFila,
    proveedor: "Dab",
  }).items[0];
}

test("9 DE ORO: $ 955 × 20 = $ 19.100 contra $ 19.200 da −0,5 % y ofrece «Usar»", () => {
  const it = laTarjetaDe({
    fila: filaDeDab({ id: 281, codigo: "281", descripcion: "9 DE ORO AGRIDULCE 200G", precio: 955, costoHoy: 19200 }),
    nombre: "9 DE ORO AGRIDULCE",
    factorPack: 20,
  });
  assert.equal(it.estado, ESTADO_TU_PRODUCTO.REVISAR);
  assert.equal(it.costoNuevo, 19100, "la tarjeta volvió a comparar la unidad contra la caja");
  assert.equal(it.multiplicador, 20);
  assert.equal(Math.round(it.variacionPct * 10) / 10, -0.5);
  assert.equal(it.enRango, false, "fuera del rango de Dab: el porcentaje va en ámbar");
  assert.equal(it.motivoTexto, "Bajó 0,5 %. Dab suele aumentar entre 0 % y 12 %.");
  // «Usar» con la caja de 20, y fuera de rango: la pantalla pregunta antes.
  assert.equal(it.usar?.accion, ACCION_USAR.CONFIRMAR);
  assert.equal(it.usar.clave, "PACK_20");
  assert.equal(it.usar.fueraDeRango, true);
});

test("AGUANTADORA YERBA: $ 1.924,46 × 10 = $ 19.244,60 contra $ 19.245 es el MISMO PRECIO, no una baja", () => {
  const it = laTarjetaDe({
    fila: filaDeDab({ id: 77, codigo: "77", descripcion: "AGUANTADORA YERBA 1KG", precio: 1924.46, costoHoy: 19245 }),
    nombre: "AGUANTADORA YERBA",
    factorPack: 10,
  });
  assert.equal(it.costoNuevo, 19244.6);
  assert.equal(it.estado, ESTADO_TU_PRODUCTO.MISMO_PRECIO);
  assert.equal(it.motivoTexto, null, "un redondeo del proveedor no pide ningún cartel");
  assert.equal(it.usar, null, "no hay nada que usar: el precio es el mismo");
  // Y la tolerancia es la que dice el módulo, no una escrita acá.
  assert.equal(esMismoPrecio(-0.002), true);
  assert.equal(esMismoPrecio(-TOLERANCIA_MISMO_PRECIO_PCT), false);
});

// ══════════════════════════════════════════════════════════════════════════
// LA LISTA Y SUS NÚMEROS
// ══════════════════════════════════════════════════════════════════════════

function laListaDeDab() {
  const filas = {
    cambia: fila({ productoBaseId: 1 }),
    revisar: fila({ productoBaseId: 2, diferenciaPct: 99.5 }),
    dejada: fila({ productoBaseId: 3, excluidaManual: true }),
  };
  const productos = [
    { id: 1, nombre: "Solitas Animación 400 g", precio_costo: 1300, filas: [filas.cambia] },
    { id: 2, nombre: "Criollitas 300 g", precio_costo: 900, filas: [filas.revisar] },
    { id: 3, nombre: "Express 3 x 100", precio_costo: 700, filas: [filas.dejada] },
    { id: 4, nombre: "Rumba 112 g", precio_costo: 450, filas: [] },
    // CERO ES UN COSTO, NO UN VACÍO: el costo de hoy de un producto sin costo
    // cargado se dice $0, no se busca otro. El cero falsy ya mordió cinco veces
    // en este módulo.
    { id: 5, nombre: "Tentaciones 0", precio_costo: 0, filas: [] },
  ];
  return { filas, productos };
}

test("LOS NÚMEROS DEL RESUMEN Y DE LOS CHIPS SALEN DEL MISMO ARREGLO QUE SE DIBUJA", () => {
  const { productos } = laListaDeDab();
  const r = tusProductosDeLaLista({ productos, rango: RANGO, noVienen: new Set([5]) });
  assert.equal(r.conteo.total, 5);
  assert.equal(r.conteo.traeLaLista, 3, "«la lista trae» cuenta tus productos con renglón");
  assert.equal(r.conteo.porEstado.SIN_VINCULAR, 1);
  assert.equal(r.conteo.porEstado.REVISAR, 1);
  assert.equal(r.conteo.porEstado.CAMBIA, 1);
  assert.equal(r.conteo.porEstado.NO_LO_CAMBIO, 1);
  assert.equal(r.conteo.porEstado.NO_VIENE, 1);
  const tentaciones = r.items.find((i) => i.productoBaseId === 5);
  assert.equal(tentaciones.costoHoy, 0, "el cero se perdió");
});

test("LOS «Cambia» SON LOS QUE CUENTA EL BOTÓN DE APLICAR", () => {
  // Con un renglón por producto, los productos que dicen «Cambia» tienen que
  // ser exactamente los `listos` de `contarResultado`, que es el número de
  // «Aplicar los N precios». Si se separaran, el botón prometería otra cosa
  // que las tarjetas.
  const { filas, productos } = laListaDeDab();
  const r = tusProductosDeLaLista({ productos, rango: RANGO });
  const conteo = contarResultado(Object.values(filas), RANGO, null);
  assert.equal(r.conteo.porEstado.CAMBIA, conteo.listos);
});

test("LA TARJETA LLEVA EL RENGLÓN DE LA LISTA, HOY → NUEVO Y EL MOTIVO EN CRIOLLO", () => {
  const { productos } = laListaDeDab();
  const r = tusProductosDeLaLista({ productos, rango: RANGO });
  const solitas = r.items.find((i) => i.productoBaseId === 1);
  assert.deepEqual(solitas.renglon, { codigo: "1612", descripcion: "SOLITAS ANIMACION 400G", precio: 14697.5, cantidad: 10 });
  assert.equal(solitas.costoHoy, 1300);
  assert.equal(solitas.costoNuevo, 1469.75);
  const criollitas = r.items.find((i) => i.productoBaseId === 2);
  // El caso concreto, con los dos números (2026-10-24).
  assert.equal(criollitas.motivoTexto, "Aumentó 99,5 %. Este proveedor suele aumentar entre 2 % y 15 %.");
});

// ══════════════════════════════════════════════════════════════════════════
// LOS CHIPS, EL BUSCADOR Y LA TARJETA QUE NO SE VA DEBAJO DEL DEDO
// ══════════════════════════════════════════════════════════════════════════

test("ARRANCA EN EL PRIMER CHIP QUE TENGA ALGO", () => {
  assert.equal(filtroInicial({ porEstado: { SIN_VINCULAR: 144, REVISAR: 2, CAMBIA: 12 } }), FILTRO.SIN_VINCULAR);
  assert.equal(filtroInicial({ porEstado: { SIN_VINCULAR: 0, REVISAR: 2, CAMBIA: 12 } }), FILTRO.REVISAR);
  // Sin nada que pida trabajo, «Vinculados»: «Todos» se fue.
  assert.equal(filtroInicial({ porEstado: { SIN_VINCULAR: 0, REVISAR: 0, CAMBIA: 0 } }), FILTRO.VINCULADOS);
});

test("LA TARJETA RESUELTA SE VA DEL CHIP: ya no hay «fijados» que la dejen en el lugar (2026-10-24)", () => {
  // Rumba, recién vinculada desde «Sin vincular», pasa a «Cambia»: con el chip
  // de «Sin vincular» puesto ya no se ve. Los `item` salen de la función que
  // arma la pantalla.
  const antes = tusProductosDeLaLista({ productos: [{ id: 4, nombre: "Rumba 112 g", precio_costo: 1300, filas: [] }], rango: RANGO }).items[0];
  const despues = tusProductosDeLaLista({
    productos: [{ id: 4, nombre: "Rumba 112 g", precio_costo: 1300, filas: [fila({ productoBaseId: 4 })] }],
    rango: RANGO,
  }).items[0];
  assert.equal(antes.estado, ESTADO_TU_PRODUCTO.SIN_VINCULAR);
  assert.equal(despues.estado, ESTADO_TU_PRODUCTO.CAMBIA);
  assert.equal(seVe(antes, { filtro: FILTRO.SIN_VINCULAR }), true);
  assert.equal(seVe(despues, { filtro: FILTRO.SIN_VINCULAR }), false);
  // Un `fijados` que alguien siga pasando no la retiene.
  assert.equal(seVe(despues, { filtro: FILTRO.SIN_VINCULAR, fijados: new Set([4]) }), false);
  assert.ok(!codigoDe("lib/proveedores/listas/tusProductos.js").includes("fijados"), "volvió «fijados» a `seVe`");
});

test("«X DE 158 LISTOS»: listo es lo que no está ni en «Sin vincular» ni en «Para revisar»", () => {
  const { productos } = laListaDeDab();
  const r = tusProductosDeLaLista({ productos, rango: RANGO });
  const pendientes = r.items.filter((i) => i.estado === ESTADO_TU_PRODUCTO.SIN_VINCULAR || i.estado === ESTADO_TU_PRODUCTO.REVISAR).length;
  assert.ok(pendientes > 0 && pendientes < r.items.length, "el caso no ejerce la cuenta");
  assert.equal(r.conteo.listosDeLaRevision, r.items.length - pendientes);
  // La barra de la pantalla sale de ese número, con el kit.
  const p = codigoDe(PANTALLA);
  assert.match(p, /const listosDeLaRevision = tusProductos\.conteo\.listosDeLaRevision \?\? 0;/);
  assert.match(p, /<SunmiBarraDeProgreso\s+hechos=\{listosDeLaRevision\}\s+total=\{tusProductos\.conteo\.total\}/);
  assert.match(p, /\{listosDeLaRevision\} de \{tusProductos\.conteo\.total\}/);
});

test("«VINCULADOS» JUNTA LOS QUE TIENEN RENGLÓN, Y EL BUSCADOR BUSCA EN TODOS SIN MIRAR EL CHIP", () => {
  // Los `item` salen de la función que arma la pantalla, no se escriben a mano.
  const { productos } = laListaDeDab();
  const r = tusProductosDeLaLista({ productos, rango: RANGO });
  const vinculados = r.items.filter((it) => seVe(it, { filtro: FILTRO.VINCULADOS }));
  // Cambia, revisar y la dejada: los tres con renglón, en estados distintos.
  assert.deepEqual(vinculados.map((i) => i.productoBaseId).sort(), [1, 2, 3]);
  assert.equal(cantidadDelFiltro(FILTRO.VINCULADOS, r.conteo), r.conteo.traeLaLista, "el chip y la tarjeta de arriba cuentan distinto");
  assert.deepEqual(ORDEN_FILTROS, [FILTRO.SIN_VINCULAR, FILTRO.VINCULADOS, FILTRO.REVISAR, FILTRO.CAMBIA]);
  assert.equal(FILTRO.TODOS, undefined, "volvió «Todos»");
  // Con texto, el chip no cuenta: Criollitas está en «Para revisar» y se
  // encuentra con el chip de «Sin vincular» puesto.
  const criollitas = r.items.find((i) => i.productoBaseId === 2);
  assert.equal(seVe(criollitas, { filtro: FILTRO.SIN_VINCULAR }), false);
  assert.equal(seVe(criollitas, { filtro: FILTRO.SIN_VINCULAR, buscar: "crioll" }), true);
  assert.equal(seVe(criollitas, { filtro: FILTRO.SIN_VINCULAR, buscar: "rumba" }), false);
});

// ══════════════════════════════════════════════════════════════════════════
// DESDE UNA UBICACIÓN QUE NO ADMINISTRA LOS COSTOS (Emanuel, 2026-10-24)
// ══════════════════════════════════════════════════════════════════════════
//
// El caso: la lista de Dab abierta desde "Local: mini el 7"; los costos los
// administra el depósito. Pudo tocar «Usar» y recién ahí le dijeron que no.

const DEPOSITO = 1;
const MINI_EL_7 = 7;

test("QUIÉN ADMINISTRA LOS COSTOS: el dueño de la mayoría de tus productos de este proveedor", () => {
  // `creadoEnLocalId` null es del depósito (legacy), y el del depósito también.
  const productos = [{ creadoEnLocalId: null }, { creadoEnLocalId: DEPOSITO }, { creadoEnLocalId: MINI_EL_7 }];
  assert.equal(quienAdministraLosCostos(productos, DEPOSITO), DEPOSITO);
  assert.equal(quienAdministraLosCostos([{ creadoEnLocalId: MINI_EL_7 }], DEPOSITO), MINI_EL_7);
  assert.equal(quienAdministraLosCostos([], DEPOSITO), null, "sin productos no hay a dónde mandar");
});

test("DESDE UN LOCAL SIN PROPIEDAD DEL COSTO NO SE OFRECE «USAR»: ni para cambiar, ni para revisar, ni para marcar", () => {
  const f = fila({ productoBaseId: 2, diferenciaPct: 99.5 });
  const lectura = lecturaDe();
  const productos = [
    { id: 1, nombre: "Solitas Animación 400 g", precio_costo: 1300, filas: [fila({ productoBaseId: 1 })] },
    { id: 2, nombre: "Criollitas 300 g", precio_costo: 1300, filas: [f] },
    { id: 3, nombre: "Express 3 x 100", precio_costo: 1300, filas: [fila({ productoBaseId: 3, seleccionada: false })] },
  ];
  const lecturaPorFila = new Map([[f.id, { lectura, confirmable: true }]]);
  // La contraprueba en el mismo test: desde la ubicación que sí, las tres tienen botón.
  const conCostos = tusProductosDeLaLista({ productos, rango: RANGO, lecturaPorFila, puedeCambiarCostos: true });
  assert.deepEqual(conCostos.items.map((i) => i.usar?.accion), [ACCION_USAR.DESMARCAR, ACCION_USAR.CONFIRMAR, ACCION_USAR.MARCAR]);
  const sinCostos = tusProductosDeLaLista({ productos, rango: RANGO, lecturaPorFila, puedeCambiarCostos: false });
  for (const it of sinCostos.items) assert.equal(it.usar, null, `${it.nombre} ofrece «Usar» desde el local`);
});

test("LA LÍNEA «DESDE ESTA UBICACIÓN…» SE FUE DE LAS TARJETAS: la dice una sola vez el aviso de arriba", () => {
  const bloqueada = fila({ estado: ESTADO_LINEA.BLOQUEADO, motivo: MOTIVO_CONCILIACION.SIN_PROPIEDAD_COSTO });
  const productos = [{ id: 1, nombre: "A", precio_costo: 1300, filas: [bloqueada] }];
  const desdeElLocal = tusProductosDeLaLista({ productos, rango: RANGO, puedeCambiarCostos: false }).items[0];
  assert.equal(desdeElLocal.estado, ESTADO_TU_PRODUCTO.REVISAR);
  assert.equal(desdeElLocal.motivoTexto, null);
  // Desde el depósito, el porqué de ESE renglón y qué hacer.
  const desdeElDeposito = tusProductosDeLaLista({ productos, rango: RANGO, puedeCambiarCostos: true }).items[0];
  assert.match(desdeElDeposito.motivoTexto, /No es este producto/);
  // Un combo bloqueado no dice nada de ubicaciones: dice que es un combo.
  const combo = fila({ estado: ESTADO_LINEA.BLOQUEADO, motivo: MOTIVO_CONCILIACION.PRODUCTO_COMBO });
  const itCombo = tusProductosDeLaLista({ productos: [{ id: 1, nombre: "A", precio_costo: 1, filas: [combo] }], rango: RANGO }).items[0];
  assert.match(itCombo.motivoTexto, /combo/);
  assert.doesNotMatch(itCombo.motivoTexto, /ubicación/);
});

test("VINCULADA Y SIN COSTO NUEVO: «Para revisar», con el porqué en criollo (ALFAJOR FULBITO)", () => {
  // Quedaba sin botones y con "—". El renglón está vinculado; lo que no se sabe
  // es por cuánto multiplicar el precio.
  const sinCosto = fila({ estado: ESTADO_LINEA.SIN_CAMBIOS, costoMaestroPropuesto: null, diferenciaPct: null });
  const r = estadoDeTuProducto({ filas: [sinCosto], rango: RANGO, abierta: true });
  assert.equal(r.estado, ESTADO_TU_PRODUCTO.REVISAR);
  assert.equal(r.motivo, MOTIVO_SIN_COSTO_NUEVO);
  const it = tusProductosDeLaLista({ productos: [{ id: 1, nombre: "ALFAJOR FULBITO", precio_costo: 300, filas: [sinCosto] }], rango: RANGO }).items[0];
  assert.match(it.motivoTexto, /No sé por cuánto multiplicar el precio de la lista/);
  // Lo que una persona dejó como está no es un pendiente.
  const dejada = fila({ excluidaManual: true, costoMaestroPropuesto: null });
  assert.equal(estadoDeTuProducto({ filas: [dejada], rango: RANGO }).estado, ESTADO_TU_PRODUCTO.NO_LO_CAMBIO);
});

test("EL BUSCADOR TAMBIÉN ENCUENTRA POR CÓDIGO: el de barras tuyo y el del renglón de la lista", () => {
  const f = fila({ productoBaseId: 1, codigoCrudo: "1612" });
  const r = tusProductosDeLaLista({
    productos: [{ id: 1, nombre: "Solitas Animación 400 g", precio_costo: 1300, codigo_barra: "7790040113206", codigo_barra_secundario: null, filas: [f] }],
    rango: RANGO,
  });
  const it = r.items[0];
  assert.equal(seVe(it, { buscar: "779004" }), true);
  assert.equal(seVe(it, { buscar: "1612" }), true);
  assert.equal(seVe(it, { buscar: "9999" }), false);
});

test("EL BUSCADOR DE LA HOJA ARRANCA CON LAS PRIMERAS PALABRAS DEL NOMBRE", () => {
  assert.equal(primerasPalabras("Solitas Animación 400 g"), "Solitas Animación");
  assert.equal(primerasPalabras("  Rumba  "), "Rumba");
  assert.equal(primerasPalabras(null), "");
});

// ══════════════════════════════════════════════════════════════════════════
// LA PANTALLA
// ══════════════════════════════════════════════════════════════════════════

const PANTALLA = "app/modulos/proveedores/listas/[id]/page.jsx";

test("UNA SOLA PANTALLA, CON LAS PIEZAS DE RECIBIR UNA TRANSFERENCIA (2026-10-24)", () => {
  const p = codigoDe(PANTALLA);
  for (const ida of ["TarjetaGrande", "TarjetaChica", "TarjetaAncha", "FilaDeCambio", "/revisar", "/no-cambian", "de a uno"]) {
    assert.ok(!p.includes(ida), `volvió «${ida}» a la revisión`);
  }
  // Las MISMAS piezas que `RecepcionMovil`, no unas parecidas.
  const recepcion = codigoDe("components/transferencias/RecepcionMovil.jsx");
  for (const pieza of ["<SunmiPantallaDeTrabajo", "<SunmiCampoBusquedaVoz", "<SunmiFiltroEstado"]) {
    assert.ok(recepcion.includes(pieza), `la recepción ya no usa ${pieza}: este candado mira otra cosa`);
    assert.ok(p.includes(pieza), `la revisión de la lista no usa ${pieza}`);
  }
  assert.match(p, /<TarjetaProductoDeLaLista/);
  // Lo de la versión del 2026-10-23 que se borró: el resumen, los chips en fila
  // corrida, la tarjeta vieja y el buscador crudo.
  for (const ida of ["<SunmiChipsFiltro", "<TarjetaDeTuProducto", "<SunmiInput", "De tus", "la lista trae"]) {
    assert.ok(!p.includes(ida), `volvió «${ida}»`);
  }
  // El buscador busca en tus productos, con el texto del diseño.
  assert.match(p, /PLACEHOLDER_BUSCADOR_LISTA = "Buscar tu producto o código…"/);
  assert.match(p, /placeholder=\{PLACEHOLDER_BUSCADOR_LISTA\}/);
  // El título y el volver, en la fila del shell.
  assert.match(p, /useTituloDePagina\("Lista de precios"\)/);
  assert.match(p, /useAccionDePagina\(\s*\(\) => <SunmiBackButton href="\/modulos\/proveedores\/listas"/);
  // La cabecera: el proveedor con su chip, y las dos cuentas.
  assert.match(p, /\{tusProductos\.conteo\.traeLaLista\} \/ \{tusProductos\.conteo\.total\}/);
  assert.match(p, /en la lista/);
  assert.match(p, /`\$\{sinVincular\} sin vincular`/);
});

test("VINCULAR Y REVISAR SON HOJAS QUE NO SACAN DE LA PANTALLA; AL RESOLVER SE RELEE Y SE AVISA ABAJO", () => {
  const p = codigoDe(PANTALLA);
  assert.match(p, /<HojaVincularConLaLista\s+endpoint=\{`\/api\/proveedores\/listas\/\$\{id\}\/productos\/\$\{vinculando\.productoBaseId\}\/en-la-lista`\}/);
  assert.match(p, /cuerpoNoViene=\{\{ noViene: true \}\}/);
  assert.match(p, /<HojaRevisarPrecio/);
  // Al resolver, se relee SIN el cargador y aparece el aviso con «Deshacer».
  assert.match(p, /const despuesDeResolver = async \(nombre, deshacer\) => \{\s*await cargar\(\{ silencioso: true \}\);\s*setHecho\(\{ nombre, deshacer, vez: Date\.now\(\) \}\);/);
  assert.match(p, /await despuesDeResolver\(nombre, deshacerDeLaHoja\(j, productoBaseId\)\);/);
  assert.ok(!/router\.push\([^)]*elegir-fila/.test(p), "vincular volvió a navegar a otra pantalla");
  // Sin `fijados`: la resuelta se va del chip.
  assert.ok(!/fijados|setFijados|despuesDeTocar/.test(p), "volvieron las tarjetas fijadas");
  assert.match(p, /onCambiar=\{setFiltro\}/);
  // El aviso: "Listo: <producto> · Deshacer", unos segundos, en la barra de abajo.
  assert.match(p, /TEXTO_HECHO = "Listo:"/);
  assert.match(p, /TEXTO_DESHACER = "Deshacer"/);
  assert.match(p, /setTimeout\(\(\) => setHecho\(null\), DURACION_AVISO_HECHO_MS\)/);
  const pie = p.slice(p.indexOf("pieDePantalla={"), p.indexOf("despuesDelPie={"));
  assert.match(pie, /\{avisoHecho\}/);
  assert.match(pie, /\) : \(\s*avisoHecho\s*\)/, "sin barra de aplicar el aviso tiene que quedar igual");
});

test("CADA ACCIÓN DE LA TARJETA TRAE SU DESHACER, Y DESHACER MANDA EL PEDIDO INVERSO", () => {
  const p = codigoDe(PANTALLA);
  // Confirmar se deshace destildando; tildar y destildar, uno con el otro.
  const usar = p.slice(p.indexOf("const usar = "), p.indexOf("const si = "));
  assert.match(usar, /cuerpo: \{ accion: ACCION_USAR\.DESMARCAR, ids: \[item\.filaId\] \}/);
  assert.match(usar, /const inversa = u\.accion === ACCION_USAR\.MARCAR \? ACCION_USAR\.DESMARCAR : ACCION_USAR\.MARCAR;/);
  // «No viene» con `noViene: false`; un vínculo, sacando la fila de la lista.
  assert.match(p, /const deshacerNoViene = \(productoBaseId\) => \(\{[\s\S]*?cuerpo: \{ noViene: false \}/);
  assert.match(p, /\/filas\/\$\{filaId\}\/otra-fila`, cuerpo: \{ noEstaEnLaLista: true \}/);
  assert.match(p, /deshacerNoViene\(item\.productoBaseId\)\s*\);/);
  // «Listo» con la caja, devolviendo la recordada que había.
  assert.match(p, /cuerpo: \{ restaurar: r\?\.anterior \?\? null \}/);
  // Y «Deshacer» manda eso y relee.
  const volver = p.slice(p.indexOf("const volverAtras = "), p.indexOf("const deshacerVinculo = "));
  assert.match(volver, /fetch\(d\.url, \{[\s\S]*?body: JSON\.stringify\(d\.cuerpo\)/);
  assert.match(volver, /await cargar\(\{ silencioso: true \}\);/);
});

test("DESHACER VUELVE LA TARJETA A SU ESTADO: «No viene» y «Cambia», con los mismos datos que manda el servidor", () => {
  // «No viene» → deshacer borra la marca → la tarjeta vuelve a «Sin vincular».
  const p = [{ id: 5, nombre: "Express 3 x 100", precio_costo: 1300, filas: [] }];
  const antes = tusProductosDeLaLista({ productos: p, rango: RANGO, noVienen: new Set() }).items[0];
  const marcada = tusProductosDeLaLista({ productos: p, rango: RANGO, noVienen: new Set([5]) }).items[0];
  const deshecha = tusProductosDeLaLista({ productos: p, rango: RANGO, noVienen: new Set() }).items[0];
  assert.equal(marcada.estado, ESTADO_TU_PRODUCTO.NO_VIENE);
  assert.deepEqual(deshecha, antes);
  // «✓ Usar» sobre una que cambia la destilda; el deshacer la vuelve a tildar y
  // la tarjeta es la misma de antes.
  const tildada = fila({ productoBaseId: 1 });
  const conTilde = tusProductosDeLaLista({ productos: [{ id: 1, nombre: "Solitas", precio_costo: 1300, filas: [tildada] }], rango: RANGO }).items[0];
  const sinTilde = tusProductosDeLaLista({
    productos: [{ id: 1, nombre: "Solitas", precio_costo: 1300, filas: [{ ...tildada, seleccionada: false }] }],
    rango: RANGO,
  }).items[0];
  assert.equal(conTilde.usar.accion, ACCION_USAR.DESMARCAR);
  assert.equal(sinTilde.usar.accion, ACCION_USAR.MARCAR, "destildada, el deshacer tiene que ser volver a tildar");
  assert.equal(sinTilde.estado, ESTADO_TU_PRODUCTO.REVISAR);
  assert.equal(conTilde.estado, ESTADO_TU_PRODUCTO.CAMBIA);
  // La ruta de «No viene» acepta el deshacer con las mismas guardas.
  const r = codigoDe("app/api/proveedores/listas/[id]/productos/[productoBaseId]/en-la-lista/route.js");
  assert.match(r, /if \(body\.noViene === false\) \{\s*await prisma\.productoQueNoVieneEnLaLista\.deleteMany\(\{ where: \{ importacionId, productoBaseId \} \}\);/);
});

test("APLICAR VA EN LA BARRA FIJA, COMO «TOTAL / ✓ CONFIRMAR», Y NO EN UN CONTROL", () => {
  // Hasta el 2026-10-23 iba al final de la lista; el diseño de Transferencias la
  // quiere en la barra de abajo, que es `fixed` y reserva su lugar medido (ver
  // `SunmiPantallaDeTrabajo`): no tapa la última tarjeta.
  const p = codigoDe(PANTALLA);
  const pie = p.slice(p.indexOf("pieDePantalla={"), p.indexOf("despuesDelPie={"));
  assert.ok(pie.length > 0, "no hay barra de abajo");
  // Y desde una ubicación que no administra los costos (2026-10-24).
  assert.match(
    pie,
    /!controlando && abierta && puedeCambiarCostos \?/,
    "la barra tiene que faltar en un control, en una lista cerrada y sin los costos"
  );
  assert.match(pie, /Para aplicar/);
  assert.match(pie, /\{listos\} \{listos === 1 \? "precio" : "precios"\}/);
  assert.match(pie, /color="amber"/);
  assert.match(pie, /disabled=\{listos === 0 \|\| aplicando\}/, "con cero precios el botón tiene que estar apagado");
  assert.match(pie, /✓ Aplicar/);
  // El número es el que consulta aplicar, y la confirmación es la de siempre.
  assert.match(p, /const listos = conteo\.listos;/);
  assert.match(p, /<HojaConfirmarAplicar/);
  assert.match(p, /fetch\(`\/api\/proveedores\/listas\/\$\{id\}\/aplicar`/);
  // Y la vieja, al final de la lista, ya no está.
  assert.ok(!p.includes("Aplicar los {listos} precios"), "volvió el botón de aplicar al final de la lista");
});

test("DESDE OTRA UBICACIÓN: UN SOLO AVISO ARRIBA, CON «IR A», Y NI USAR NI CORREGIR NI BARRA", () => {
  const p = codigoDe(PANTALLA);
  const aviso = p.slice(p.indexOf("{!puedeCambiarCostos && costos.ubicacion && ("), p.indexOf("<SunmiPantallaDeTrabajo"));
  assert.ok(aviso.length > 0, "el aviso no está ARRIBA de la pantalla de trabajo");
  assert.match(aviso, /<SunmiAviso tono="warning">/);
  assert.match(aviso, /Esta lista se trabaja desde \{nombreDeUbicacion\(costos\.ubicacion\)\}\. Desde acá podés vincular\s+pero no cambiar costos\./);
  assert.match(aviso, /`Ir a \$\{nombreDeUbicacion\(costos\.ubicacion\)\}`/);
  // Cambia la ubicación con la MISMA función que la pantalla de inicio, y vuelve
  // a ESTA lista.
  assert.match(p, /await elegirUbicacionActiva\(destino\.localId\)/);
  assert.match(p, /window\.location\.assign\(`\/modulos\/proveedores\/listas\/\$\{id\}`\)/);
  assert.match(codigoDe("app/inicio/page.jsx"), /await elegirUbicacionActiva\(local\.id\)/, "inicio volvió a escribir su propio fetch");
  // Las tarjetas lo saben, y los dos carteles que pedían aplicar no se dibujan.
  assert.match(p, /puedeCambiarCostos=\{puedeCambiarCostos\}/);
  // Los dos, abierta (para aplicar) y cerrada (en pasado), y siempre con los costos.
  for (const cond of ["abierta", "!abierta"]) {
    assert.match(p, new RegExp(`if \\(${cond} && puedeCambiarCostos && !controlando && \\(conteo\\.omitidasAlAplicar`));
    assert.match(p, new RegExp(`if \\(${cond} && puedeCambiarCostos && !controlando && \\(conteo\\.listosSinTildar`));
  }
});

test("VINCULAR EN UN SOLO PASO: la hoja de vincular sigue con la lectura, salvo sin los costos", () => {
  const p = codigoDe(PANTALLA);
  assert.match(p, /seguirConLaLectura=\{puedeCambiarCostos\}/);
  const h = codigoDe("components/proveedores/listas/HojaVincularConLaLista.jsx");
  assert.match(h, /if \(seguirConLaLectura && cuerpo\?\.filaElegidaId && j\.filaId\) \{\s*setVinculado\(j\);/);
  assert.match(h, /<DecisionDeLectura[\s\S]*?tomarLaUnica/);
  // Y la decisión toma sola la ÚNICA en rango, nunca una fuera de rango.
  const d = codigoDe("components/proveedores/listas/HojaRevisarPrecio.jsx");
  assert.match(d, /fila\.confirmable && recomendada && !recomendada\.fueraDeRango && !recomendada\.absurda/);
  assert.match(d, /if \(fila\.motivo === null && !fila\.excluida\)/);
});

test("«✓ USAR» LLAMA LAS RUTAS QUE YA EXISTÍAN, Y FUERA DE RANGO PREGUNTA ANTES", () => {
  const p = codigoDe(PANTALLA);
  const usar = p.slice(p.indexOf("const usar = "), p.indexOf("const si = "));
  assert.match(usar, /u\.fueraDeRango && !aceptarFueraDeRango[\s\S]*?setPreguntaFuera\(item\)/, "fuera de rango no pregunta");
  assert.match(usar, /\/api\/proveedores\/listas\/\$\{id\}\/filas\/\$\{item\.filaId\}\/confirmar/);
  assert.match(usar, /\{ clave: u\.clave, aceptarFueraDeRango \}/);
  assert.match(usar, /\/api\/proveedores\/listas\/\$\{id\}\/seleccion/);
  assert.match(usar, /\{ accion: u\.accion, ids: \[item\.filaId\] \}/);
  // La pregunta es la de la hoja, no una parecida.
  assert.match(p, /import HojaRevisarPrecio, \{ ConfirmarFueraDeRango \} from/);
  assert.match(p, /<ConfirmarFueraDeRango/);
  // «No viene» es el mismo pedido que hace la hoja de vincular.
  const noViene = p.slice(p.indexOf("const noViene = "), p.indexOf("const pasarAActualizar"));
  assert.match(noViene, /productos\/\$\{item\.productoBaseId\}\/en-la-lista/);
  assert.match(noViene, /\{ noViene: true \}/);
  // Al guardar desde la tarjeta, se relee sin el cargador y se avisa abajo.
  assert.match(p, /await despuesDeResolver\(item\.nombre, typeof deshacer === "function" \? deshacer\(j\) : deshacer\);/);
});

test("LAS TRES PANTALLAS QUE SE FUERON REDIRIGEN A LA REVISIÓN, Y NO DIBUJAN NADA", () => {
  for (const ruta of ["revisar", "no-cambian", "elegir-fila"]) {
    const c = codigoDe(`app/modulos/proveedores/listas/[id]/${ruta}/page.jsx`);
    assert.match(c, /redirect\(`\/modulos\/proveedores\/listas\/\$\{id\}`\)/, ruta);
    assert.ok(!/use client|return \(/.test(c), `${ruta} todavía dibuja algo`);
  }
});

test("«NO VIENE EN ESTA LISTA» SE GUARDA, Y VINCULAR LO BORRA", () => {
  const r = codigoDe("app/api/proveedores/listas/[id]/productos/[productoBaseId]/en-la-lista/route.js");
  assert.match(r, /if \(body\?\.noViene === true \|\| body\?\.noViene === false\) \{[\s\S]*?productoQueNoVieneEnLaLista\.upsert\(/);
  assert.match(r, /tx\.productoQueNoVieneEnLaLista\.deleteMany\(\{ where: \{ importacionId, productoBaseId \} \}\)/);
  // Y el resultado la lee para decir «No viene en esta lista».
  const res = codigoDe("app/api/proveedores/listas/[id]/resultado/route.js");
  assert.match(res, /prisma\.productoQueNoVieneEnLaLista\.findMany\(/);
  assert.match(res, /omitidas: revision\.ids/, "las tarjetas «Cambia» dejaron de mirar lo que aplicar va a omitir");
});
