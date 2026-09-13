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

test("E2 · un local SIN MOVIMIENTO en su período no aparece", () => {
  // El domingo 13 cae en la semana del que corta domingo y NO en la del que
  // corta lunes, que arranca el 14. Así que Casiano se queda sin bloque.
  const bs = bloquesPorLocal({
    transferencias: [
      transferencia(1, 2, "mini el 7", "Recibida", "2026-09-13", 4),
      transferencia(2, 4, "Casiano casas", "Recibida", "2026-09-13", 4),
    ],
    acuerdos: ACUERDOS,
    unidad: UNIDADES.SEMANA,
    hoy: MIERCOLES,
  });

  const pantalla = bs.map((b) => html(React.createElement(BloqueLocal, { bloque: bloqueListo(b), money }))).join("");

  assert.ok(pantalla.includes("mini el 7"), "el local con movimiento tiene que estar");
  assert.ok(!pantalla.includes("Casiano"), "un local sin movimiento en su período NO se dibuja");
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
  const t = comoLaManda(transferencia(7, 2, "mini el 7", "Enviada", "2026-09-14", null), {
    cantidadItems: 3,
    itemsRevisables: 2,
    itemsRevisados: 2,
  });

  const salida = html(React.createElement(FilaTransferenciaLocal, { t, money }));
  assert.ok(salida.includes("3 ítems · 2 de 2 revisados"), "el avance no sale del campo de revisables");
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
  assert.ok(editando.includes("sunmi-border-accent"), "la fila en edición no se distingue");
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

  // Y de la cuenta del local.
  for (const campo of ["paraRecibir", "yaRecibidas"]) {
    assert.ok(new RegExp(`\\b${campo}:`).test(src), `la ruta no manda '${campo}'`);
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
