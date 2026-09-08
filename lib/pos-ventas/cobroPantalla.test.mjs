// CANDADOS DEL PANEL DE COBRO CON MODALIDADES.
//
// Todo lo de acá es COMPORTAMIENTO: qué botones salen de una configuración, qué
// clave lleva cada opción, qué viaja en el cuerpo y qué total se le pide al
// preview. Nada mira texto del código.
//
// ── EL DEFECTO QUE ESTOS CANDADOS EXISTEN PARA IMPEDIR ─────────────────────
//
// Que la pantalla vuelva a identificar una condición por su `MedioPago`. Con
// modalidades, "Crédito 1 pago" y "Crédito cuotas" son las dos CREDITO: con esa
// key React reusa el nodo, el panel dividido no puede tener las dos filas y el
// preview muestra un solo número —el equivocado para una de ellas—. Nada de eso
// tira un error: da un cobro equivocado.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CONDICION_FIADO,
  botonesDeCobro,
  botonesDisponiblesParaFila,
  claveDeOpcion,
  condicionesDeFilas,
  filaDeBoton,
  filasIniciales,
  formaPagoDeSeleccion,
  identidadDeSeleccion,
  modalidadesDisponiblesParaFila,
  opcionesCobrablesDe,
  opcionesDeModalidad,
  primeraFilaLibre,
  totalDeBoton,
} from "./cobroPantalla.js";
import { componerCobroSimple, evaluarDivisionPago } from "./servicios.js";
import { componerModalidades } from "./modalidadesDeMedio.js";
import { totalesPorOpcionDeCobro } from "../ofertas/previewPos.js";

// ── El local del ejemplo, y es EL caso que rompía ──────────────────────────
const mercadoPago = {
  id: 10,
  nombre: "Mercado Pago",
  activo: true,
  tipoContable: "MERCADOPAGO",
  procesador: "MERCADOPAGO",
  recargoPct: 0,
  comisionPct: 5,
  modalidades: componerModalidades([
    { id: 101, nombre: "Crédito 1 pago", activo: true, orden: 1, tipoContable: "CREDITO", recargoPct: 4, comisionPct: 3 },
    { id: 102, nombre: "Crédito cuotas", activo: true, orden: 2, tipoContable: "CREDITO", recargoPct: 8, comisionPct: 7 },
    { id: 103, nombre: "QR / saldo", activo: false, orden: 3, tipoContable: "MERCADOPAGO", recargoPct: 1, comisionPct: 2 },
  ]),
};
const bancoCredito = {
  id: 20, nombre: "Banco X", activo: true, tipoContable: "CREDITO", procesador: "BANCO",
  recargoPct: 6, comisionPct: 9, modalidades: [],
};
const efectivo = {
  id: 30, nombre: "Efectivo", activo: true, tipoContable: "EFECTIVO", procesador: null,
  recargoPct: 0, comisionPct: 0, modalidades: [],
};
const oculto = {
  id: 40, nombre: "Débito viejo", activo: false, tipoContable: "DEBITO", procesador: "BANCO",
  recargoPct: 3, comisionPct: 4, modalidades: [],
};
const MEDIOS = [efectivo, mercadoPago, bancoCredito, oculto];

const carrito = [{ productoLocalId: 1, nombre: "Yerba", cantidad: 2, precio: 1000 }];
const preview = totalesPorOpcionDeCobro({ carrito, medios: MEDIOS });

const botones = botonesDeCobro(MEDIOS);
const botonMP = botones.find((b) => b.nombre === "Mercado Pago");
const botonBanco = botones.find((b) => b.nombre === "Banco X");
const botonEfectivo = botones.find((b) => b.nombre === "Efectivo");

// ═══════════════════════════════════════════════════════════════════════════
// UN MEDIO CON MODALIDADES ES UN SOLO BOTÓN
// ═══════════════════════════════════════════════════════════════════════════

test("Mercado Pago con dos modalidades sigue siendo UN botón", () => {
  assert.equal(botones.filter((b) => b.nombre === "Mercado Pago").length, 1);
  // Y no aparecen "Mercado Pago Crédito" ni "Mercado Pago Débito" como medios.
  assert.deepEqual(botones.map((b) => b.nombre), ["Efectivo", "Mercado Pago", "Banco X"]);
});

test("un medio oculto no se dibuja", () => {
  assert.equal(botones.some((b) => b.nombre === "Débito viejo"), false);
});

test("tocar un medio con modalidades NO cobra: abre el selector", () => {
  assert.equal(botonMP.abreSelector, true);
  assert.equal(botonBanco.abreSelector, false);
});

test("con UNA sola modalidad activa el selector se abre igual", () => {
  // La regla del servidor es otra —resuelve solo cuando hay una— y acá NO se usa:
  // un botón que unas veces cobra al toque y otras abre pantalla es un botón en
  // el que no se puede confiar.
  const unaSola = { ...mercadoPago, modalidades: mercadoPago.modalidades.slice(1, 2) };
  assert.equal(botonesDeCobro([unaSola])[0].abreSelector, true);
});

test("sin configuración se cae a los CUATRO por defecto, sin inventarles id", () => {
  const porDefecto = botonesDeCobro(null);
  assert.deepEqual(porDefecto.map((b) => b.tipoContable), ["EFECTIVO", "DEBITO", "CREDITO", "MERCADOPAGO"]);
  assert.deepEqual(porDefecto.map((b) => b.medioCobroLocalId), [null, null, null, null]);
  assert.deepEqual(porDefecto.map((b) => b.clave), ["tipo:EFECTIVO", "tipo:DEBITO", "tipo:CREDITO", "tipo:MERCADOPAGO"]);
  assert.equal(porDefecto.every((b) => b.abreSelector === false), true);
});

// ═══════════════════════════════════════════════════════════════════════════
// DOS MODALIDADES DEL MISMO TIPO NO SE COLAPSAN
// ═══════════════════════════════════════════════════════════════════════════

test("dos modalidades CREDITO tienen claves distintas", () => {
  const opciones = opcionesDeModalidad(botonMP);
  assert.deepEqual(opciones.map((o) => o.tipoContable), ["CREDITO", "CREDITO"]);
  assert.notEqual(opciones[0].clave, opciones[1].clave);
  // Y una modalidad inactiva no es cobrable.
  assert.equal(opciones.length, 2);
  assert.equal(opciones.some((o) => o.nombre === "QR / saldo"), false);
});

test("un botón sin modalidades y otro con modalidad del mismo tipo tampoco chocan", () => {
  // Banco X es CREDITO; la modalidad de MP también. Con la key vieja
  // —`tipoContable.toLowerCase()`— eran el mismo botón.
  const opcionMP = opcionesDeModalidad(botonMP)[0];
  assert.notEqual(claveDeOpcion(botonBanco), claveDeOpcion(botonMP, opcionMP));
  assert.equal(claveDeOpcion(botonBanco), "medio:20");
  assert.equal(claveDeOpcion(botonMP, opcionMP), "mod:101");
});

// ═══════════════════════════════════════════════════════════════════════════
// EL TOTAL SIEMPRE SE PIDE, NUNCA SE CALCULA
// ═══════════════════════════════════════════════════════════════════════════

test("el preview le da a cada modalidad SU total", () => {
  assert.equal(preview["mod:101"].total, 2080);
  assert.equal(preview["mod:102"].total, 2160);
  assert.equal(preview["medio:20"].total, 2120);
  assert.equal(preview["medio:30"].total, 2000);
});

test("un botón con modalidades de distinto recargo no tiene UN total: tiene rango", () => {
  const r = totalDeBoton(botonMP, preview, 0);
  assert.equal(r.difiere, true);
  assert.equal(r.total, null);
  assert.equal(r.min, 2080);
  assert.equal(r.max, 2160);
});

test("un botón sin modalidades tiene su total, y no un rango", () => {
  const r = totalDeBoton(botonBanco, preview, 0);
  assert.deepEqual([r.difiere, r.total], [false, 2120]);
});

test("si las modalidades empatan, el botón vuelve a tener un solo número", () => {
  const parejo = {
    ...mercadoPago,
    modalidades: componerModalidades([
      { id: 201, nombre: "A", activo: true, orden: 1, tipoContable: "CREDITO", recargoPct: 5 },
      { id: 202, nombre: "B", activo: true, orden: 2, tipoContable: "CREDITO", recargoPct: 5 },
    ]),
  };
  const p = totalesPorOpcionDeCobro({ carrito, medios: [parejo] });
  const r = totalDeBoton(botonesDeCobro([parejo])[0], p, 0);
  assert.equal(r.difiere, false);
  assert.equal(r.total, 2100);
});

// ═══════════════════════════════════════════════════════════════════════════
// EL CUERPO LLEVA IDENTIDAD, Y NADA MÁS QUE IDENTIDAD
// ═══════════════════════════════════════════════════════════════════════════

test("cobrar una modalidad manda medioCobroLocalId y modalidadId", () => {
  const opcion = opcionesDeModalidad(botonMP)[1];
  const cobro = componerCobroSimple({
    medio: formaPagoDeSeleccion(botonMP, opcion),
    total: 2160,
    identidad: identidadDeSeleccion(botonMP, opcion),
  });
  assert.deepEqual(cobro.pagos, [{ medioCobroLocalId: 10, modalidadId: 102, monto: 2160 }]);
  // `formaPago` es el tipo contable DE LA MODALIDAD, no el del padre: es lo que
  // la venta va a congelar.
  assert.equal(cobro.formaPago, "credito");
});

test("el cuerpo NO lleva porcentajes, ni comisión, ni procesador, ni nombres", () => {
  const opcion = opcionesDeModalidad(botonMP)[0];
  const cobro = componerCobroSimple({
    medio: formaPagoDeSeleccion(botonMP, opcion),
    total: 2080,
    identidad: identidadDeSeleccion(botonMP, opcion),
  });
  const claves = Object.keys(cobro.pagos[0]).sort();
  assert.deepEqual(claves, ["medioCobroLocalId", "modalidadId", "monto"]);
});

test("un medio SIN modalidades manda su id y la modalidad en null", () => {
  const cobro = componerCobroSimple({
    medio: formaPagoDeSeleccion(botonBanco),
    total: 2120,
    identidad: identidadDeSeleccion(botonBanco),
  });
  assert.deepEqual(cobro.pagos, [{ medioCobroLocalId: 20, modalidadId: null, monto: 2120 }]);
});

test("un medio por DEFECTO no manda ids: sigue el camino de siempre", () => {
  const porDefecto = botonesDeCobro(null);
  const credito = porDefecto.find((b) => b.tipoContable === "CREDITO");
  assert.equal(identidadDeSeleccion(credito), null);
  const cobro = componerCobroSimple({
    medio: formaPagoDeSeleccion(credito),
    total: 1000,
    identidad: identidadDeSeleccion(credito),
  });
  assert.deepEqual(cobro, { formaPago: "credito", total: 1000 });
});

test("fiado sigue siendo tender único y sin identidad", () => {
  const cobro = componerCobroSimple({ medio: "fiado", total: 1000 });
  assert.deepEqual(cobro, { formaPago: "fiado", total: 1000 });
  // Y su total lo contesta el motor, no una resta escrita en la pantalla.
  assert.equal(preview.__paraCondiciones([CONDICION_FIADO]).total, 2000);
});

test("con servicios, el reparto conserva la identidad de los dos tenders", () => {
  const opcion = opcionesDeModalidad(botonMP)[0];
  const cobro = componerCobroSimple({
    medio: formaPagoDeSeleccion(botonMP, opcion),
    total: 2080,
    minEfectivoServicios: 500,
    identidad: identidadDeSeleccion(botonMP, opcion),
    identidadEfectivo: identidadDeSeleccion(botonEfectivo),
  });
  assert.equal(cobro.formaPago, "mixto");
  assert.deepEqual(cobro.pagos, [
    { medioCobroLocalId: 30, modalidadId: null, monto: 500 },
    { medioCobroLocalId: 10, modalidadId: 101, monto: 1580 },
  ]);
});

test("sin identidad de efectivo, el reparto sigue funcionando en modo legacy", () => {
  const cobro = componerCobroSimple({
    medio: "credito", total: 1000, minEfectivoServicios: 400,
  });
  assert.deepEqual(cobro.pagos, [
    { medio: "efectivo", monto: 400 },
    { medio: "credito", monto: 600 },
  ]);
});

// ═══════════════════════════════════════════════════════════════════════════
// PAGO DIVIDIDO: CADA FILA CONSERVA PADRE + MODALIDAD
// ═══════════════════════════════════════════════════════════════════════════

test("dos filas del MISMO padre con modalidades distintas son dos tenders", () => {
  const opciones = opcionesDeModalidad(botonMP);
  const filas = [
    { ...filaDeBoton(botonMP, opciones[0]), monto: "1000" },
    { ...filaDeBoton(botonMP, opciones[1]), monto: "1160" },
  ];
  const r = evaluarDivisionPago({ filas, total: 2160 });

  assert.equal(r.hayDuplicados, false, "dos modalidades distintas NO son la misma fila");
  assert.equal(r.puedeCobrar, true);
  assert.deepEqual(r.pagos, [
    { medioCobroLocalId: 10, modalidadId: 101, monto: 1000 },
    { medioCobroLocalId: 10, modalidadId: 102, monto: 1160 },
  ]);
});

test("la MISMA modalidad repetida sí se detecta como duplicada", () => {
  const opcion = opcionesDeModalidad(botonMP)[0];
  const filas = [
    { ...filaDeBoton(botonMP, opcion), monto: "1000" },
    { ...filaDeBoton(botonMP, opcion), monto: "1080" },
  ];
  assert.equal(evaluarDivisionPago({ filas, total: 2080 }).hayDuplicados, true);
});

test("una fila de modalidad EFECTIVO cubre los servicios, y no se decide por el nombre", () => {
  const conEfectivo = {
    ...mercadoPago,
    modalidades: componerModalidades([
      { id: 301, nombre: "Billetera", activo: true, orden: 1, tipoContable: "EFECTIVO", recargoPct: 0 },
    ]),
  };
  const boton = botonesDeCobro([conEfectivo])[0];
  const opcion = opcionesDeModalidad(boton)[0];
  const filas = [{ ...filaDeBoton(boton, opcion), monto: "1000" }];
  const r = evaluarDivisionPago({ filas, total: 1000, minEfectivoServicios: 800 });

  // Se llama "Billetera" y aun así cuenta como efectivo: manda el tipo contable.
  assert.equal(r.efectivo, 1000);
  assert.equal(r.cumpleEfectivo, true);
});

test("el evaluador legacy no cambió: filas sin identidad se comportan igual", () => {
  const filas = [
    { medio: "efectivo", monto: "600" },
    { medio: "debito", monto: "400" },
  ];
  const r = evaluarDivisionPago({ filas, total: 1000, minEfectivoServicios: 500 });
  assert.equal(r.puedeCobrar, true);
  assert.equal(r.hayDuplicados, false);
  assert.equal(r.cumpleEfectivo, true);
  assert.deepEqual(r.pagos, [
    { medio: "efectivo", monto: 600 },
    { medio: "debito", monto: 400 },
  ]);
});

test("un medio con modalidades libres se puede volver a elegir en otra fila", () => {
  const filas = [filaDeBoton(botonMP, opcionesDeModalidad(botonMP)[0])];
  const disponibles = botonesDisponiblesParaFila(botones, filas, 1);
  // Mercado Pago sigue disponible porque le queda "Crédito cuotas".
  assert.equal(disponibles.some((b) => b.clave === botonMP.clave), true);

  const filasLlenas = opcionesDeModalidad(botonMP).map((o) => filaDeBoton(botonMP, o));
  const trasUsarlas = botonesDisponiblesParaFila(botones, filasLlenas, 5);
  assert.equal(trasUsarlas.some((b) => b.clave === botonMP.clave), false);
});

test("un medio SIN modalidades ya usado no se ofrece de nuevo", () => {
  const filas = [filaDeBoton(botonBanco)];
  const disponibles = botonesDisponiblesParaFila(botones, filas, 1);
  assert.equal(disponibles.some((b) => b.clave === botonBanco.clave), false);
});

test("el selector de modalidad de una fila no ofrece la que ya está en otra", () => {
  const opciones = opcionesDeModalidad(botonMP);
  const filas = [filaDeBoton(botonMP, opciones[0]), filaDeBoton(botonMP, opciones[1])];
  const paraLaPrimera = modalidadesDisponiblesParaFila(botonMP, filas, 0);
  assert.deepEqual(paraLaPrimera.map((o) => o.modalidadId), [101]);
});

test("agregar fila arma la fila entera, con su modalidad ya elegida", () => {
  const fila = primeraFilaLibre([botonMP], []);
  assert.equal(fila.modalidadId, 101);
  assert.equal(fila.clave, "mod:101");
  // Y cuando no queda nada libre, se dice que no.
  const llenas = opcionesDeModalidad(botonMP).map((o) => filaDeBoton(botonMP, o));
  assert.equal(primeraFilaLibre([botonMP], llenas), null);
});

test("el panel se abre con los dos primeros medios del local", () => {
  const iniciales = filasIniciales(botones);
  assert.equal(iniciales.length, 2);
  assert.deepEqual(iniciales.map((f) => f.nombre), ["Efectivo", "Mercado Pago"]);
  // Y el de Mercado Pago ya trae una modalidad elegida: una fila sin modalidad
  // sería una fila que el servidor va a rechazar.
  assert.equal(iniciales[1].modalidadId, 101);
});

test("el total del pago dividido sale del motor, con las condiciones de las filas", () => {
  const opciones = opcionesDeModalidad(botonMP);
  const filas = [filaDeBoton(botonEfectivo), filaDeBoton(botonMP, opciones[1])];
  const condiciones = condicionesDeFilas(filas, botones);
  const r = preview.__paraCondiciones(condiciones);

  // Manda el recargo MÁS ALTO de los medios usados, sobre la venta completa.
  assert.equal(r.recargoPagoPct, 8);
  assert.equal(r.total, 2160);
  // Y el ganador se sabe cuál es, con nombre: dos condiciones CREDITO no se
  // distinguen por el enum.
  assert.equal(r.recargoPagoModalidadNombre, "Crédito cuotas");
  assert.equal(r.recargoPagoMedioNombre, "Mercado Pago");
});

test("opcionesCobrablesDe distingue un botón simple de uno con modalidades", () => {
  assert.deepEqual(opcionesCobrablesDe(botonBanco).map((o) => o.clave), ["medio:20"]);
  assert.deepEqual(opcionesCobrablesDe(botonMP).map((o) => o.clave), ["mod:101", "mod:102"]);
});
