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

import { lecturaQueMuestraLaTarjeta } from "./lecturasDeLaFila.js";
import { lecturaParaPantalla } from "./explicarLectura.js";
import { ESTADO_VARIACION } from "./rangoAumento.js";
import {
  ACCION_USAR,
  ESTADO_TU_PRODUCTO,
  FILTRO,
  MOTIVO_DESMARCADA,
  MOTIVO_OMITIDA,
  estadoDeTuProducto,
  tusProductosDeLaLista,
  filtroInicial,
  seVe,
  primerasPalabras,
} from "./tusProductos.js";
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

test("LA LECTURA DE LA TARJETA: la recomendada, si no la del costo propuesto, y nunca una absurda", () => {
  const recomendada = lecturaDe({ clave: "PACK_10", costoNuevo: 1469.75, recomendada: true });
  const otra = lecturaDe({ clave: "MISMA_PRESENTACION", costoNuevo: 146.98, recomendada: false });
  assert.equal(lecturaQueMuestraLaTarjeta({ lecturas: [otra, recomendada], fila: { costoMaestroPropuesto: 146.98 } }).clave, "PACK_10");
  const sinRecomendar = lecturaDe({ clave: "PACK_10", costoNuevo: 1469.75, recomendada: false });
  // Sin recomendada: la que da el costo que la fila ya propone, al centavo.
  assert.equal(
    lecturaQueMuestraLaTarjeta({ lecturas: [sinRecomendar, otra], fila: { costoMaestroPropuesto: "1469.75" } }).clave,
    "PACK_10"
  );
  assert.equal(lecturaQueMuestraLaTarjeta({ lecturas: [sinRecomendar, otra], fila: { costoMaestroPropuesto: 999 } }), null);
  const absurda = lecturaDe({ clave: "PACK_100", costoNuevo: 14697.5, recomendada: true, absurda: true });
  assert.equal(lecturaQueMuestraLaTarjeta({ lecturas: [absurda], fila: { costoMaestroPropuesto: 14697.5 } }), null);
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
  assert.match(criollitas.motivoTexto, /Aumenta más de lo que esperabas \(esperabas entre 2 % y 15 %\)/);
});

// ══════════════════════════════════════════════════════════════════════════
// LOS CHIPS, EL BUSCADOR Y LA TARJETA QUE NO SE VA DEBAJO DEL DEDO
// ══════════════════════════════════════════════════════════════════════════

test("ARRANCA EN EL PRIMER CHIP QUE TENGA ALGO", () => {
  assert.equal(filtroInicial({ porEstado: { SIN_VINCULAR: 144, REVISAR: 2, CAMBIA: 12 } }), FILTRO.SIN_VINCULAR);
  assert.equal(filtroInicial({ porEstado: { SIN_VINCULAR: 0, REVISAR: 2, CAMBIA: 12 } }), FILTRO.REVISAR);
  assert.equal(filtroInicial({ porEstado: { SIN_VINCULAR: 0, REVISAR: 0, CAMBIA: 0 } }), FILTRO.TODOS);
});

test("UNA TARJETA TOCADA SE QUEDA EN EL LUGAR AUNQUE YA NO SEA DEL CHIP; EL RESTO SE FILTRA", () => {
  const vinculada = { productoBaseId: 4, nombre: "Rumba 112 g", estado: ESTADO_TU_PRODUCTO.CAMBIA };
  const otra = { productoBaseId: 2, nombre: "Criollitas 300 g", estado: ESTADO_TU_PRODUCTO.REVISAR };
  assert.equal(seVe(vinculada, { filtro: FILTRO.SIN_VINCULAR }), false);
  assert.equal(seVe(vinculada, { filtro: FILTRO.SIN_VINCULAR, fijados: new Set([4]) }), true);
  assert.equal(seVe(otra, { filtro: FILTRO.SIN_VINCULAR, fijados: new Set([4]) }), false);
  // El buscador busca en TUS productos, por nombre.
  assert.equal(seVe(otra, { filtro: FILTRO.TODOS, buscar: "crioll" }), true);
  assert.equal(seVe(otra, { filtro: FILTRO.TODOS, buscar: "rumba" }), false);
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

test("VINCULAR Y REVISAR SON HOJAS QUE NO SACAN DE LA PANTALLA, Y LA TARJETA CAMBIA EN EL LUGAR", () => {
  const p = codigoDe(PANTALLA);
  assert.match(p, /<HojaVincularConLaLista\s+endpoint=\{`\/api\/proveedores\/listas\/\$\{id\}\/productos\/\$\{vinculando\.productoBaseId\}\/en-la-lista`\}/);
  assert.match(p, /cuerpoNoViene=\{\{ noViene: true \}\}/);
  assert.match(p, /<HojaRevisarPrecio/);
  // Al guardar, se fija la tarjeta y se relee SIN el cargador.
  assert.match(p, /setFijados\(\(prev\) => new Set\(prev\)\.add\(productoBaseId\)\);\s*await cargar\(\{ silencioso: true \}\);/);
  assert.ok(!/router\.push\([^)]*elegir-fila/.test(p), "vincular volvió a navegar a otra pantalla");
  // Cambiar de chip suelta las fijadas.
  assert.match(p, /const elegirFiltro = \(f\) => \{\s*setFiltro\(f\);\s*setFijados\(new Set\(\)\);/);
});

test("APLICAR VA EN LA BARRA FIJA, COMO «TOTAL / ✓ CONFIRMAR», Y NO EN UN CONTROL", () => {
  // Hasta el 2026-10-23 iba al final de la lista; el diseño de Transferencias la
  // quiere en la barra de abajo, que es `fixed` y reserva su lugar medido (ver
  // `SunmiPantallaDeTrabajo`): no tapa la última tarjeta.
  const p = codigoDe(PANTALLA);
  const pie = p.slice(p.indexOf("pieDePantalla={"), p.indexOf("despuesDelPie={"));
  assert.ok(pie.length > 0, "no hay barra de abajo");
  assert.match(pie, /!controlando && abierta \?/, "la barra tiene que faltar en un control y en una lista cerrada");
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

test("«✓ USAR» LLAMA LAS RUTAS QUE YA EXISTÍAN, Y FUERA DE RANGO PREGUNTA ANTES", () => {
  const p = codigoDe(PANTALLA);
  const usar = p.slice(p.indexOf("const usar = "), p.indexOf("const noViene = "));
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
  // Al guardar desde la tarjeta, se fija y se relee sin el cargador.
  assert.match(p, /await despuesDeTocar\(pid\);/);
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
  assert.match(r, /if \(body\?\.noViene === true\) \{[\s\S]*?productoQueNoVieneEnLaLista\.upsert\(/);
  assert.match(r, /tx\.productoQueNoVieneEnLaLista\.deleteMany\(\{ where: \{ importacionId, productoBaseId \} \}\)/);
  // Y el resultado la lee para decir «No viene en esta lista».
  const res = codigoDe("app/api/proveedores/listas/[id]/resultado/route.js");
  assert.match(res, /prisma\.productoQueNoVieneEnLaLista\.findMany\(/);
  assert.match(res, /omitidas: revision\.ids/, "las tarjetas «Cambia» dejaron de mirar lo que aplicar va a omitir");
});
