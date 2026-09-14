// LA LISTA DE TRABAJO, DIBUJADA.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/tableroMovil.test.mjs
//
// ── QUÉ AFIRMA ESTE ARCHIVO Y QUÉ NO ───────────────────────────────────────
//
// Los candados de `bloquesPorLocal` prueban la CUENTA. Éstos prueban que lo que
// la cuenta devuelve llega a la pantalla y se ve — que es otro par de preguntas,
// y las tres que Emanuel pidió expresamente viven acá:
//
//   · dos locales con cortes distintos muestran rangos distintos EN LA MISMA
//     pantalla;
//   · un local sin movimiento no aparece;
//   · una relación sin acuerdo se ve MARCADA.
//
// ── LOS BLOQUES NO SE ESCRIBEN A MANO ─────────────────────────────────────
//
// Salen de correr `bloquesPorLocal` sobre transferencias con la forma que manda
// la base. Escribir el bloque a mano sería el defecto que este repo tiene
// anotado como el que más se repite: un fixture plausible que el sistema nunca
// produce, y un candado verde para siempre sobre nada.
//
// Lo único que se agrega a mano es lo que la RUTA calcula por transferencia
// —`recibida`, `importe`, el avance de revisión—, y por eso el último test lee
// el fuente de la ruta y comprueba que esos nombres sean los que manda. Sin ese
// cierre, este archivo probaría una forma inventada.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import BloqueLocal from "./BloqueLocal.jsx";
import CabeceraDeCuenta from "./CabeceraDeCuenta.jsx";
import FilaTransferenciaLocal from "./FilaTransferenciaLocal.jsx";
import FilaCorteDeSemana from "./FilaCorteDeSemana.jsx";
import ChipsDePeriodo from "./ChipsDePeriodo.jsx";

import { bloquesPorLocal, cuentaDelLocal } from "@/lib/transferencias/bloquesPorLocal";
import { destinosDeTransferencia } from "@/lib/transferencias/destinosDeTransferencia";
import { UNIDADES } from "@/lib/transferencias/periodoDePago";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUTA_TABLERO = "app/api/transferencias/tablero/route.js";

const html = (nodo) => renderToStaticMarkup(nodo);
const money = (n) => `$ ${Number(n || 0).toFixed(2)}`;

// 2026-09-16 es MIÉRCOLES. Todo se ancla ahí, igual que en el candado del dominio.
const MIERCOLES = "2026-09-16";

const BASE = {
  id: 1,
  nombre: "COCA COLA 2L",
  unidad_medida: "cajon",
  factor_pack: 8,
  precio_costo: 23333.33,
  pesoEsFijo: false,
};

/** 4 CAJÓN x8 —32 físicas—. `recibido` en la escala de la presentación. */
const linea = (recibido) => ({
  cantidad: 32,
  recibido,
  recibidoUnidadesSueltas: 0,
  unidadEnviada: "UNIDAD",
  precioCosto: 23333.33,
  presentacionEnvio: "CAJON",
  cantidadPresentada: 4,
  sueltasEnviadas: 0,
  factorPresentacion: 8,
  pesoPiezaKg: null,
  producto: { base: BASE },
});

const transferencia = (id, destinoId, nombre, estado, fecha, recibido) => ({
  id,
  estado,
  destinoId,
  destino: { id: destinoId, nombre },
  origen: { id: 1, nombre: "depo", es_deposito: true },
  fechaEnvio: `${fecha}T12:00:00.000Z`,
  createdAt: `${fecha}T12:00:00.000Z`,
  detalle: [linea(recibido)],
});

/**
 * Lo que la RUTA agrega a cada transferencia antes de mandarla.
 *
 * Es una copia deliberada de `resumir` en `app/api/transferencias/tablero/route.js`,
 * y el último test comprueba que siga siendo una copia fiel. Se copia en vez de
 * importarse porque aquélla vive adentro del handler, donde tiene a mano el
 * origen y el detalle completo.
 */
const comoLaManda = (t, extra = {}) => ({
  id: t.id,
  estado: t.estado,
  fechaEnvio: t.fechaEnvio,
  createdAt: t.createdAt,
  recibida: t.estado === "Recibida",
  cantidadItems: t.detalle.length,
  itemsRevisables: t.detalle.length,
  itemsRevisados: 0,
  importe: 93333.32,
  ...extra,
});

const bloqueListo = (b) => ({ ...b, transferencias: b.transferencias.map((t) => comoLaManda(t)) });

// mini el 7 corta DOMINGO; Casiano corta LUNES.
const ACUERDOS = [
  { localId: 2, diaDeCorte: 0 },
  { localId: 4, diaDeCorte: 1 },
];

// ── 1 · LO QUE EMANUEL PIDIÓ VERIFICAR ─────────────────────────────────────

test("E1 · dos locales con cortes distintos muestran RANGOS DISTINTOS en la misma pantalla", () => {
  const bs = bloquesPorLocal({
    transferencias: [
      transferencia(1, 2, "mini el 7", "Recibida", "2026-09-14", 4),
      transferencia(2, 4, "Casiano casas", "Recibida", "2026-09-14", 4),
    ],
    acuerdos: ACUERDOS,
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
  });

  const pantalla = bs.map((b) => html(React.createElement(BloqueLocal, { bloque: bloqueListo(b), money }))).join("");

  assert.ok(pantalla.includes("13/09 al 19/09"), "falta el rango del local que corta domingo");
  assert.ok(pantalla.includes("14/09 al 20/09"), "falta el rango del local que corta lunes");
});

// ── EL CRITERIO CAMBIÓ EL 2026-09-13, Y ESTE CANDADO AFIRMABA LO VIEJO ────
//
// Decía "un local sin movimiento NO aparece", que era la decisión 3 del
// roadmap. Emanuel la dio vuelta con el motivo escrito: *"si un local solo
// aparece cuando tiene una transferencia asociada, no hay forma de saber que
// existe. Arrancás viendo un local y no sabés que hay cuatro."*
//
// No se aflojó el candado: se reescribió para afirmar la decisión nueva, que es
// más fuerte —ahora hay que probar que el local SÍ está y además que está en la
// forma corta—. El caso de prueba es el mismo y sigue siendo el bueno: Casiano
// tiene una transferencia, pero NO en su semana.
const LOCALES = [
  { id: 2, nombre: "mini el 7" },
  { id: 4, nombre: "Casiano casas" },
];

test("E2 · un local SIN MOVIMIENTO en su período aparece igual, en cero y en versión corta", () => {
  // El domingo 13 cae en la semana del que corta domingo y NO en la del que
  // corta lunes, que arranca el 14. Así que Casiano no tiene nada QUE MOSTRAR
  // en su período — y aun así tiene que estar en la lista.
  const bs = bloquesPorLocal({
    transferencias: [
      transferencia(1, 2, "mini el 7", "Recibida", "2026-09-13", 4),
      transferencia(2, 4, "Casiano casas", "Recibida", "2026-09-13", 4),
    ],
    acuerdos: ACUERDOS,
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
    locales: LOCALES,
  });

  assert.equal(bs.length, 2, "los dos locales tienen que estar en la lista");

  const casiano = bs.find((b) => b.localId === 4);
  assert.equal(casiano.sinMovimiento, true, "Casiano no tuvo movimiento en SU semana");
  assert.equal(casiano.cantidadTransferencias, 0);
  assert.equal(casiano.aPagar, 0);
  assert.equal(casiano.totalCerrado, true, "sin pendientes, el total de cero está cerrado");

  const pantalla = bs
    .map((b) => html(React.createElement(BloqueLocal, { bloque: bloqueListo(b), money })))
    .join("");
  assert.ok(pantalla.includes("mini el 7"), "el local con movimiento tiene que estar");
  assert.ok(pantalla.includes("Casiano casas"), "el local sin movimiento TAMBIÉN tiene que estar");
  assert.ok(
    pantalla.includes("Sin transferencias en el período"),
    "el local en cero lo dice con una frase, no con un '0 transferencias'"
  );
});

test("E2b · el bloque en cero no tiene nada que abrir ni borde de aviso", () => {
  const enCero = {
    localId: 9,
    nombre: "Mini unidas",
    rango: { desde: "2026-09-13", hasta: "2026-09-19" },
    aPagar: 0,
    cantidadTransferencias: 0,
    sinRecibir: 0,
    totalCerrado: true,
    sinMovimiento: true,
    transferencias: [],
  };
  const salida = html(React.createElement(BloqueLocal, { bloque: enCero, money }));

  assert.ok(salida.includes("Mini unidas"), "falta el nombre");
  assert.ok(salida.includes("$ 0.00"), "el importe en cero se muestra igual");
  assert.ok(
    !salida.includes("sunmi-border-warning"),
    "un total de cero está CERRADO: marcarlo en advertencia sería falso"
  );
  assert.ok(!salida.includes("<button"), "no hay nada que abrir, así que no es un botón");
  assert.ok(
    !salida.includes("13/09 al 19/09"),
    "sin movimiento no se muestra el rango: no tiene que competir con los que sí tuvieron"
  );
});

test("E2c · EL DEFECTO QUE ESTO CIERRA · el aviso contaba UNO de cuatro sin configurar", () => {
  // Medido en producción el 2026-09-13: cuatro locales, los cuatro sin acuerdo,
  // y UNO SOLO con movimiento en la semana. El aviso de arriba cuenta los
  // bloques con `sinConfigurar`, así que con la lista armada desde las
  // transferencias informaba "1 local sin corte" — y las otras tres relaciones
  // no estaban en ninguna parte de la pantalla.
  const cuatro = [
    { id: 2, nombre: "mini el 7" },
    { id: 3, nombre: "Minimarket ayala" },
    { id: 4, nombre: "Casiano casas" },
    { id: 5, nombre: "Mini unidas" },
  ];
  const soloUnoConMovimiento = [transferencia(1, 2, "mini el 7", "Enviada", "2026-09-14", null)];

  const viejo = bloquesPorLocal({
    transferencias: soloUnoConMovimiento,
    acuerdos: [],
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
  });
  assert.equal(
    viejo.filter((b) => b.sinConfigurar).length,
    1,
    "así era antes: de cuatro relaciones sin configurar, el aviso veía una"
  );

  const ahora = bloquesPorLocal({
    transferencias: soloUnoConMovimiento,
    acuerdos: [],
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
    locales: cuatro,
  });
  assert.equal(
    ahora.filter((b) => b.sinConfigurar).length,
    4,
    "ahora el aviso cuenta las cuatro, que es la verdad"
  );
});

// ── EL LOCAL DADO DE BAJA ─────────────────────────────────────────────────
//
// Ningún candado cubría `activo = false`, y en producción no hay ninguno, así
// que el caso no ocurre en los datos y tampoco ocurría en las pruebas: la
// definición de un candado verde sobre nada.
//
// La regla que decidió Emanuel el 2026-09-13 tiene dos mitades y las dos están
// acá, porque una sin la otra es un defecto distinto:
//
//   · CON movimiento, aparece. Se le debe plata, y esconderlo sería perder una
//     cuenta a cobrar sin que nadie se entere.
//   · SIN movimiento, no aparece. Es ruido: un local que no opera y encima no
//     movió nada esta semana no tiene por qué ocupar un renglón.
//
// Y si aparece, VA MARCADO: *"no quiero descubrir de casualidad que le estoy
// cobrando a un local dado de baja"*.

test("E2e · un local INACTIVO con movimiento aparece, y MARCADO", () => {
  const bs = bloquesPorLocal({
    transferencias: [transferencia(1, 4, "Casiano casas", "Recibida", "2026-09-15", 4)],
    acuerdos: ACUERDOS,
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
    locales: [
      { id: 2, nombre: "mini el 7", activo: true },
      { id: 4, nombre: "Casiano casas", activo: false },
    ],
  });

  const baja = bs.find((b) => b.localId === 4);
  assert.ok(baja, "un local dado de baja CON movimiento no puede desaparecer: se le debe plata");
  assert.equal(baja.inactivo, true, "el bloque no viene marcado como dado de baja");
  assert.ok(baja.aPagar > 0, "tiene movimiento, así que tiene importe");

  const salida = html(React.createElement(BloqueLocal, { bloque: bloqueListo(baja), money }));
  assert.ok(
    salida.includes("Dado de baja"),
    "se está cobrando a un local dado de baja y la pantalla no lo dice"
  );
});

test("E2f · un local INACTIVO sin movimiento NO aparece", () => {
  const bs = bloquesPorLocal({
    transferencias: [transferencia(1, 2, "mini el 7", "Recibida", "2026-09-15", 4)],
    acuerdos: ACUERDOS,
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
    locales: [
      { id: 2, nombre: "mini el 7", activo: true },
      { id: 4, nombre: "Casiano casas", activo: false },
      { id: 5, nombre: "Mini unidas", activo: true },
    ],
  });

  assert.deepEqual(
    bs.map((b) => b.localId).sort(),
    [2, 5],
    "el inactivo sin movimiento es ruido y no va; los dos activos sí, tengan o no movimiento"
  );
});

test("E2g · un local ACTIVO nunca se marca como dado de baja", () => {
  // La contraprueba de la marca: si se dibujara siempre, el candado de arriba
  // pasaría igual y no estaría afirmando nada.
  const bs = bloquesPorLocal({
    transferencias: [transferencia(1, 2, "mini el 7", "Recibida", "2026-09-15", 4)],
    acuerdos: ACUERDOS,
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
    locales: [{ id: 2, nombre: "mini el 7", activo: true }],
  });

  assert.equal(bs[0].inactivo, false);
  const salida = html(React.createElement(BloqueLocal, { bloque: bloqueListo(bs[0]), money }));
  assert.ok(!salida.includes("Dado de baja"), "marcó de baja a un local que opera");
});

test("E2h · UN LOCAL SIN CLIENTE VINCULADO NO APARECE EN EL TABLERO", () => {
  // El criterio que define la pantalla: un local opera por transferencia solo si
  // tiene un cliente con `localVinculadoId` apuntándolo. Sin ese vínculo se le
  // VENDE, y una lista de trabajo de transferencias no tiene nada que decirle.
  //
  // El caso real es el local recién cargado: hasta que no se le vincula su
  // cliente, no tiene que aparecer acá. Hoy no se nota —los cuatro de producción
  // están vinculados— y por eso el candado es lo único que lo cubre.
  const bs = bloquesPorLocal({
    transferencias: [transferencia(1, 2, "mini el 7", "Recibida", "2026-09-15", 4)],
    acuerdos: ACUERDOS,
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
    locales: destinosDeTransferencia(
      [
        { id: 2, nombre: "mini el 7", activo: true, tieneClienteVinculado: true },
        { id: 5, nombre: "Mini unidas", activo: true, tieneClienteVinculado: true },
        { id: 11, nombre: "Local nuevo", activo: true, tieneClienteVinculado: false },
      ],
      { depositoLocalId: 1 }
    ),
  });

  assert.deepEqual(
    bs.map((b) => b.nombre).sort(),
    ["Mini unidas", "mini el 7"],
    "el local sin cliente vinculado no opera por transferencia: no va en esta lista"
  );
  const pantalla = bs
    .map((b) => html(React.createElement(BloqueLocal, { bloque: bloqueListo(b), money })))
    .join("");
  assert.ok(!pantalla.includes("Local nuevo"), "se dibujó un local que no opera por transferencia");
});

test("E2d · el orden es por importe, y los que están en cero van al final", () => {
  const bs = bloquesPorLocal({
    transferencias: [
      // Casiano recibe DOS, así que paga el doble que mini el 7.
      transferencia(1, 4, "Casiano casas", "Recibida", "2026-09-15", 4),
      transferencia(2, 4, "Casiano casas", "Recibida", "2026-09-15", 4),
      transferencia(3, 2, "mini el 7", "Recibida", "2026-09-15", 4),
    ],
    acuerdos: ACUERDOS,
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
    locales: [
      { id: 2, nombre: "mini el 7" },
      { id: 3, nombre: "Minimarket ayala" },
      { id: 4, nombre: "Casiano casas" },
      { id: 5, nombre: "Mini unidas" },
    ],
  });

  assert.deepEqual(
    bs.map((b) => b.nombre),
    ["Casiano casas", "mini el 7", "Mini unidas", "Minimarket ayala"],
    "primero el que más debe; los dos en cero al final y entre ellos por nombre"
  );
  assert.ok(bs[0].aPagar > bs[1].aPagar, "el primero tiene que ser el de mayor importe");
  assert.deepEqual(
    bs.slice(2).map((b) => b.sinMovimiento),
    [true, true],
    "los dos últimos son los que no tuvieron movimiento"
  );
});

test("E3 · una relación SIN ACUERDO se ve marcada, y no cae al domingo en silencio", () => {
  const bs = bloquesPorLocal({
    // Sin acuerdos: las dos relaciones quedan sin configurar.
    transferencias: [transferencia(1, 9, "Local nuevo", "Recibida", "2026-09-14", 4)],
    acuerdos: [],
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
  });

  assert.equal(bs[0].sinConfigurar, true, "el dominio tiene que marcarla");
  const salida = html(React.createElement(BloqueLocal, { bloque: bloqueListo(bs[0]), money }));
  assert.ok(salida.includes("Sin corte"), "la píldora de 'sin configurar' no se dibujó");
  assert.ok(salida.includes("sunmi-border-warning"), "la marca no lleva el borde de advertencia del kit");

  // Y en la pantalla de configuración, la misma relación con su propia marca.
  const fila = html(
    React.createElement(FilaCorteDeSemana, {
      relacion: {
        localId: 9,
        localNombre: "Local nuevo",
        depositoNombre: "depo",
        diaDeCorte: 0,
        sinConfigurar: true,
        rango: { desde: "2026-09-13", hasta: "2026-09-19" },
      },
    })
  );
  assert.ok(fila.includes("Sin configurar"), "la fila del corte no marca la relación sin acuerdo");
});

// ── 2 · EL BORDE EN WARNING SIGNIFICA QUE EL TOTAL ESTÁ ABIERTO ────────────

test("E4 · con pendientes: borde warning, 'Recibir' y la cuenta en warning", () => {
  const bs = bloquesPorLocal({
    transferencias: [
      transferencia(1, 2, "mini el 7", "Recibida", "2026-09-14", 4),
      transferencia(2, 2, "mini el 7", "Enviada", "2026-09-15", null),
    ],
    acuerdos: ACUERDOS,
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
  });

  const b = bloqueListo(bs[0]);
  assert.equal(b.totalCerrado, false);

  const salida = html(React.createElement(BloqueLocal, { bloque: b, abierto: true, money }));
  assert.ok(salida.includes("border-1.5"), "el bloque abierto no lleva el borde de 1,5");
  assert.ok(salida.includes("sunmi-border-warning"), "el borde no es el de advertencia");
  assert.ok(salida.includes("2 transferencias · 1 sin recibir"), "no dice cuántas faltan");
  assert.ok(salida.includes("Recibir"), "la pendiente no ofrece recibirla");
});

test("E5 · todo recibido: borde neutro, importe en la fila y NUNCA '0 sin recibir'", () => {
  const bs = bloquesPorLocal({
    transferencias: [transferencia(1, 2, "mini el 7", "Recibida", "2026-09-14", 4)],
    acuerdos: ACUERDOS,
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
  });

  const b = bloqueListo(bs[0]);
  assert.equal(b.totalCerrado, true);

  const salida = html(React.createElement(BloqueLocal, { bloque: b, abierto: true, money }));
  assert.ok(!salida.includes("sunmi-border-warning"), "un total cerrado no se marca en advertencia");
  assert.ok(!salida.includes("0 sin recibir"), "un cero al lado del importe se lee como que falta algo");
  assert.ok(!salida.includes("Recibir"), "una transferencia recibida no vuelve a ofrecer recibirla");
  assert.ok(salida.includes("$ 93333.32"), "la fila recibida tiene que mostrar su importe");
});

// ── 3 · LA CUENTA DEL LOCAL ────────────────────────────────────────────────

test("E6 · el aviso de total abierto aparece SOLO con pendientes", () => {
  const conPendiente = cuentaDelLocal({
    transferencias: [
      transferencia(1, 2, "mini el 7", "Recibida", "2026-09-14", 4),
      transferencia(2, 2, "mini el 7", "Recibiendo", "2026-09-15", 2),
    ],
    acuerdos: ACUERDOS,
    localId: 2,
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
  });

  const abierto = html(
    React.createElement(CabeceraDeCuenta, { cuenta: conPendiente, unidad: UNIDADES.SEMANA, money })
  );
  assert.ok(abierto.includes("A pagar esta semana"), "falta el rótulo del período");
  assert.ok(
    abierto.includes("1 transferencia sin recibir · el total todavía no está cerrado"),
    "no avisa que el total está abierto"
  );

  const cerrada = cuentaDelLocal({
    transferencias: [transferencia(1, 2, "mini el 7", "Recibida", "2026-09-14", 4)],
    acuerdos: ACUERDOS,
    localId: 2,
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
  });
  const sinAviso = html(
    React.createElement(CabeceraDeCuenta, { cuenta: cerrada, unidad: UNIDADES.SEMANA, money })
  );
  assert.ok(
    !sinAviso.includes("todavía no está cerrado"),
    "con todo recibido el total SÍ está cerrado: el aviso sería falso"
  );
});

test("E7 · el rótulo del importe sigue al chip, no dice siempre 'esta semana'", () => {
  const cuenta = cuentaDelLocal({
    transferencias: [transferencia(1, 2, "mini el 7", "Recibida", "2026-09-16", 4)],
    acuerdos: ACUERDOS,
    localId: 2,
    unidad: UNIDADES.DIA,
    hoy: MIERCOLES,
  });
  const salida = html(React.createElement(CabeceraDeCuenta, { cuenta, unidad: UNIDADES.DIA, money }));
  assert.ok(salida.includes("A pagar hoy"), "con el chip en Día el rótulo tiene que decir hoy");
  assert.ok(!salida.includes("esta semana"), "un importe de un día rotulado 'esta semana' miente");
});

test("E8 · el avance NO cuenta las líneas agregadas en la recepción", () => {
  // La guarda de confirmación pregunta por los ORIGINALES sin revisar, así que
  // una agregada en el denominador haría que el avance nunca llegue al total.
  //
  // ── REESCRITO EL 2026-09-13, NO AFLOJADO ────────────────────────────────
  //
  // Afirmaba el texto viejo —"3 ítems · 2 de 2 revisados"— sobre
  // `subtituloConAvance`, que se fue junto con `subtituloConEstado`: las dos
  // decían lo mismo de dos formas y quedaron sin consumidor. El HECHO que este
  // candado defiende no cambió —el denominador excluye las agregadas— y ahora
  // vive en `estadoEnPalabras`, así que se afirma sobre el texto que se ve hoy.
  const t = comoLaManda(transferencia(7, 2, "mini el 7", "Recibiendo", "2026-09-14", 2), {
    estado: "Recibiendo",
    recibida: false,
    cantidadItems: 3,
    itemsRevisables: 2,
    itemsRevisados: 2,
  });

  const salida = html(React.createElement(FilaTransferenciaLocal, { t, money }));
  assert.ok(
    salida.includes("Contando · 2 de 2"),
    "el denominador no sale de `itemsRevisables`: con las agregadas diría 'de 3'"
  );
  assert.ok(salida.includes("Recibir"), "una pendiente ofrece recibirla");
});

// ── 4 · LA PANTALLA DE CORTE ───────────────────────────────────────────────

test("E9 · la fila del corte: sin editar muestra el día, editando muestra los siete", () => {
  const relacion = {
    localId: 2,
    localNombre: "mini el 7",
    depositoNombre: "depo",
    diaDeCorte: 1,
    sinConfigurar: false,
    rango: { desde: "2026-09-14", hasta: "2026-09-20" },
  };

  const quieto = html(React.createElement(FilaCorteDeSemana, { relacion }));
  assert.ok(quieto.includes("Arranca"), "falta el rótulo del día de arranque");
  assert.ok(quieto.includes("Lun."), "no dice qué día arranca");
  assert.ok(quieto.includes("Cambiar"), "no ofrece cambiarlo");
  assert.ok(quieto.includes("14/09 al 20/09"), "no muestra la semana en curso");
  assert.ok(!quieto.includes("Guardar"), "sin editar no hay nada que guardar");

  const editando = html(
    React.createElement(FilaCorteDeSemana, {
      relacion: { ...relacion, rangoPropuesto: { desde: "2026-09-15", hasta: "2026-09-21" } },
      editando: true,
      diaElegido: 2,
    })
  );
  for (const d of ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]) {
    assert.ok(editando.includes(d), `falta el chip de ${d}`);
  }
  assert.ok(editando.includes("Guardar"), "editando tiene que poder guardar");
  assert.ok(
    editando.includes("15/09 al 21/09"),
    "el pie tiene que mostrar el rango que produce el día TOCADO, no el guardado"
  );
  // La fila en edición se distingue por el borde PUNTEADO y no por un color:
  // en sunmiSand `--pos-accent` y `--pos-warning` son el mismo hexadecimal. El
  // porqué, medido sobre los catorce temas, está en `senalDeEdicion.test.mjs`.
  assert.ok(editando.includes("border-dashed"), "la fila en edición no se distingue");
});

test("E10 · los cuatro chips de período, uno solo activo", () => {
  const salida = html(React.createElement(ChipsDePeriodo, { valor: UNIDADES.SEMANA }));
  for (const t of ["Día", "Semana", "Mes", "Otro"]) {
    assert.ok(salida.includes(`>${t}<`), `falta el chip ${t}`);
  }
  const activos = salida.match(/aria-pressed="true"/g) || [];
  assert.equal(activos.length, 1, "tiene que haber exactamente un chip activo");
  assert.ok(salida.includes("flex-1 basis-0"), "los chips no se reparten el ancho por igual");
});

// ── 5 · EL CIERRE: LA RUTA MANDA LO QUE ESTAS PANTALLAS LEEN ───────────────

test("E11 · la ruta manda TODOS los campos que estos componentes leen", () => {
  const src = fs
    .readFileSync(path.join(RAIZ, RUTA_TABLERO), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  // De cada bloque.
  for (const campo of [
    "localId",
    "nombre",
    "sinConfigurar",
    "rango",
    "aPagar",
    "cantidadTransferencias",
    "sinRecibir",
    "totalCerrado",
    "transferencias",
  ]) {
    assert.ok(new RegExp(`\\b${campo}:`).test(src), `la ruta no manda '${campo}' en el bloque`);
  }

  // De cada transferencia. `recibida` es el que decide si se dibuja "Recibir" o
  // el importe: sin él, TODA fila se vería como pendiente.
  for (const campo of [
    "recibida",
    "cantidadItems",
    "itemsRevisables",
    "itemsRevisados",
    "importe",
  ]) {
    assert.ok(new RegExp(`\\b${campo}:`).test(src), `la ruta no manda '${campo}' por transferencia`);
  }

  // ── Y DE LA CUENTA DEL LOCAL, QUE YA NO ES UNA FORMA APARTE ────────────
  //
  // Hasta la V40 acá se exigían `paraRecibir` y `yaRecibidas`: la vista del
  // local era una SEGUNDA implementación de la misma pregunta, con su propia
  // forma de respuesta, y se había quedado mostrando el período EN CURSO — el
  // defecto que abrió esta línea de trabajo, del lado del que cobra.
  //
  // Ahora el local entra por el modo de un local y ve la misma pantalla que el
  // depósito. Lo que se afirma es que esos dos campos NO VOLVIERON: si vuelven,
  // volvió la pantalla paralela.
  for (const campo of ["paraRecibir", "yaRecibidas"]) {
    assert.ok(
      !new RegExp(`\\b${campo}:`).test(src),
      `volvió '${campo}': era la forma de la vista paralela del local`
    );
  }
  // Y lo que sí tiene que mandar, que es lo que la pantalla unificada lee.
  for (const campo of ["periodo:", "descripcion:", "puedeAvanzar", "puedeRetroceder"]) {
    assert.ok(new RegExp(campo).test(src), `la ruta no manda '${campo}'`);
  }
});

test("E12 · CONTRAPRUEBA · los componentes leen los campos, no los adivinan", () => {
  // Si un bloque llega sin `sinConfigurar`, la píldora NO se dibuja: eso prueba
  // que la marca sale del dato y no de una condición escrita al lado.
  const sinLaMarca = html(
    React.createElement(BloqueLocal, {
      bloque: {
        localId: 1,
        nombre: "mini el 7",
        rango: { desde: "2026-09-13", hasta: "2026-09-19" },
        aPagar: 0,
        cantidadTransferencias: 1,
        sinRecibir: 0,
        totalCerrado: true,
        transferencias: [],
      },
      money,
    })
  );
  assert.ok(!sinLaMarca.includes("Sin corte"), "dibuja la marca sin que el dato la pida");

  // Y una fila sin `recibida` se dibuja como PENDIENTE, que es el lado seguro:
  // ofrecer recibir algo ya recibido se ve y se corrige; esconder el botón de lo
  // que falta recibir deja trabajo invisible.
  const sinEstado = html(
    React.createElement(FilaTransferenciaLocal, {
      t: { id: 1, cantidadItems: 1, itemsRevisables: 1, itemsRevisados: 0 },
      money,
    })
  );
  assert.ok(sinEstado.includes("Recibir"), "sin el dato, la fila tiene que quedar del lado seguro");
});
