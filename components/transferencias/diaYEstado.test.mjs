// EL DÍA COMO ENCABEZADO, EL ESTADO EN PALABRAS, Y LA RECIBIDA QUE SE ABRE.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/diaYEstado.test.mjs
//
// La segunda vuelta del tablero (V32). Cuatro cosas que afirmar:
//
//   · las transferencias se agrupan por DÍA, del más reciente al más viejo;
//   · la banda del día se pinta ENTERA, sin un bloque del color de la tarjeta
//     en el medio — ése es un defecto que ya ocurrió y por eso tiene candado;
//   · una recibida se puede TOCAR y abre el detalle;
//   · el conteo de diferencias de la cabecera coincide con lo que dicen las
//     líneas.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DiaDeTransferencias from "./DiaDeTransferencias.jsx";
import BloqueLocal from "./BloqueLocal.jsx";
import FilaTransferenciaLocal from "./FilaTransferenciaLocal.jsx";
import { diasDeTransferencias, tituloDelDia } from "@/lib/transferencias/diasDeTransferencias";
import { bloquesPorLocal } from "@/lib/transferencias/bloquesPorLocal";
import { estadoEnPalabras, rotuloDeBloque } from "@/lib/transferencias/rotulosDeTransferencia";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = (n) => renderToStaticMarkup(n);
const money = (n) => `$ ${Number(n || 0).toFixed(2)}`;

/**
 * Una transferencia con la forma que manda `/api/transferencias/tablero`.
 *
 * `lineasConDiferencia` la calcula el servidor con la puerta canónica; acá se
 * pasa ya resuelta, que es como llega. El último test comprueba contra el fuente
 * que la ruta de verdad la manda.
 */
const t = (id, iso, extra = {}) => ({
  id,
  estado: "Recibida",
  fechaEnvio: iso,
  createdAt: iso,
  recibida: true,
  cantidadItems: 22,
  itemsRevisables: 22,
  itemsRevisados: 22,
  lineasConDiferencia: 0,
  importe: 1000,
  ...extra,
});

// ── 1 · EL DÍA ────────────────────────────────────────────────────────────

test("D1 · las transferencias se agrupan por día, del más reciente al más viejo", () => {
  const dias = diasDeTransferencias([
    t(1, "2026-09-10T12:00:00-03:00"),
    t(2, "2026-09-12T09:24:00-03:00"),
    t(3, "2026-09-12T18:00:00-03:00"),
  ]);

  assert.equal(dias.length, 2, "dos días distintos");
  assert.equal(dias[0].clave, "2026-09-12", "el más reciente va primero");
  assert.equal(dias[1].clave, "2026-09-10");
  assert.equal(dias[0].cantidad, 2);
  assert.equal(dias[0].importe, 2000, "el importe del día es la suma de sus transferencias");
  assert.deepEqual(
    dias[0].transferencias.map((x) => x.id),
    [3, 2],
    "dentro del día, la más reciente primero"
  );
});

test("D2 · el día se agrupa por la fecha ARGENTINA, no por la UTC", () => {
  // Un envío de las 22:00 de un sábado es del DOMINGO en UTC. Agrupar por la
  // fecha cruda armaría un día que nadie trabajó, y justo con los envíos de la
  // noche — los que se preparan para la mañana siguiente.
  const dias = diasDeTransferencias([
    t(1, "2026-09-12T22:30:00-03:00"),
    t(2, "2026-09-12T09:00:00-03:00"),
  ]);
  assert.equal(dias.length, 1, "los dos son del mismo día argentino");
  assert.equal(dias[0].clave, "2026-09-12");
});

test("D3 · el título del día es «Sábado 12», con mayúscula y sin cero adelante", () => {
  assert.equal(tituloDelDia("2026-09-12T09:00:00-03:00"), "Sábado 12");
});

test("D4 · LA BANDA SE PINTA ENTERA: ningún hijo suyo declara fondo propio", () => {
  // El defecto que esto cierra: un contenedor interno con su propio `bg` tapa la
  // franja y deja un rectángulo del color de la tarjeta en el medio. Se lee como
  // un bloque en blanco y ya pasó una vez.
  // Se mide sobre el HTML RENDERIZADO y no sobre el fuente: lo que tapa la
  // franja es un nodo con fondo, exista como esté escrito el archivo.
  const dias = diasDeTransferencias([t(1, "2026-09-12T09:24:00-03:00")]);
  const salida = html(React.createElement(DiaDeTransferencias, { dia: dias[0], money }));

  // En un día hay EXACTAMENTE dos superficies: la banda y la tarjeta de las
  // filas. Cualquier tercera es un hijo que se pintó por su cuenta.
  const soft = salida.match(/sunmi-surface-soft/g) || [];
  const todas = salida.match(/sunmi-surface\b|sunmi-surface-soft|sunmi-card\b|\bbg-\[/g) || [];

  assert.equal(soft.length, 1, "la banda tiene que ser el ÚNICO nodo con el fondo tenue");
  assert.equal(
    todas.length,
    2,
    `un nodo de más declara fondo y va a tapar la franja (encontrados: ${todas.join(", ")})`
  );
  // Y el orden: primero la banda, después la tarjeta.
  assert.ok(
    salida.indexOf("sunmi-surface-soft") < salida.lastIndexOf("sunmi-surface"),
    "la banda tiene que ir antes que la tarjeta"
  );
});

// ── 2 · EL ESTADO EN PALABRAS ─────────────────────────────────────────────

test("D5 · los cuatro textos, cada uno con su tono", () => {
  assert.deepEqual(estadoEnPalabras({ estado: "Enviada" }), {
    texto: "Sin abrir",
    tono: "warning",
  });
  assert.deepEqual(
    estadoEnPalabras({ estado: "Recibiendo", itemsRevisados: 20, itemsRevisables: 77 }),
    { texto: "Contando · 20 de 77", tono: "warning" }
  );
  assert.deepEqual(estadoEnPalabras({ estado: "Recibida", lineasConDiferencia: 0 }), {
    texto: "Recibida sin diferencias",
    tono: "muted",
  });
  assert.deepEqual(estadoEnPalabras({ estado: "Recibida", lineasConDiferencia: 2 }), {
    texto: "Recibida · 2 diferencias",
    tono: "warning",
  });
  // El singular, que es el que se escribe mal.
  assert.equal(
    estadoEnPalabras({ estado: "Recibida", lineasConDiferencia: 1 }).texto,
    "Recibida · 1 diferencia"
  );
});

test("D6 · EL NÚMERO NO APARECE MÁS EN LA LISTA", () => {
  // "#200" es interno: no dice qué día salió ni qué traía. Sigue existiendo en
  // el detalle, que es donde sirve para nombrarla.
  const dias = diasDeTransferencias([t(200, "2026-09-12T09:24:00-03:00")]);
  const salida = html(React.createElement(DiaDeTransferencias, { dia: dias[0], money }));
  assert.ok(!salida.includes("#200"), "la fila sigue titulada con el número interno");
  assert.ok(salida.includes("09:24"), "la fila tiene que decir la hora");
  assert.ok(salida.includes("22 ítems"), "y cuántos ítems trae");
});

// ── 3 · LA RECIBIDA SE PUEDE ABRIR ────────────────────────────────────────

test("D7 · una recibida es TOCABLE ENTERA y ofrece «Ver ›»", () => {
  const dias = diasDeTransferencias([t(1, "2026-09-12T09:24:00-03:00")]);
  const salida = html(React.createElement(DiaDeTransferencias, { dia: dias[0], money }));

  assert.ok(salida.includes("Ver ›"), "la recibida no ofrece abrirse");
  assert.ok(
    /<button[^>]*>(?:(?!<\/button>)[\s\S])*Ver ›/.test(salida),
    "el «Ver ›» tiene que estar ADENTRO del control: la fila entera es el objetivo"
  );
  assert.ok(!salida.includes("Recibir"), "una recibida no vuelve a ofrecer recibirla");
});

test("D8 · una pendiente NO es tocable entera: su acción es «Recibir»", () => {
  // Dos destinos en la misma fila —uno al tocar el botón y otro al tocar al
  // lado— es la ambigüedad que se descubre tocando mal.
  const dias = diasDeTransferencias([
    t(1, "2026-09-12T09:24:00-03:00", { estado: "Enviada", recibida: false, itemsRevisados: 0 }),
  ]);
  const salida = html(React.createElement(DiaDeTransferencias, { dia: dias[0], money }));

  assert.ok(salida.includes("Recibir"), "la pendiente tiene que ofrecer recibirla");
  assert.ok(salida.includes("Sin abrir"), "y decir en qué estado está");
  assert.ok(!salida.includes("Ver ›"), "la pendiente no ofrece «Ver»");
});

test("D9 · la vista del LOCAL tiene el mismo arreglo: su recibida también se abre", () => {
  const recibida = html(
    React.createElement(FilaTransferenciaLocal, { t: t(1, "2026-09-12T09:24:00-03:00"), money })
  );
  assert.ok(recibida.includes("Ver ›"), "en la vista del local la recibida no se puede abrir");
  assert.ok(recibida.includes("Recibida sin diferencias"), "y dice su estado en palabras");

  const pendiente = html(
    React.createElement(FilaTransferenciaLocal, {
      t: t(2, "2026-09-12T09:24:00-03:00", { estado: "Enviada", recibida: false }),
      money,
    })
  );
  assert.ok(pendiente.includes("Recibir"));
  assert.ok(!pendiente.includes("Ver ›"));
});

// ── 4 · EL CONTEO DE LA CABECERA COINCIDE CON LAS LÍNEAS ──────────────────

test("D10 · «3 con diferencias» en la cabecera es lo mismo que dicen las filas", () => {
  const transferencias = [
    t(1, "2026-09-12T09:00:00-03:00", { lineasConDiferencia: 2 }),
    t(2, "2026-09-12T10:00:00-03:00", { lineasConDiferencia: 0 }),
    t(3, "2026-09-11T10:00:00-03:00", { lineasConDiferencia: 1 }),
    t(4, "2026-09-11T11:00:00-03:00", { lineasConDiferencia: 5 }),
    t(5, "2026-09-10T11:00:00-03:00", { estado: "Enviada", recibida: false, lineasConDiferencia: 0 }),
    // ── LA QUE NO SE CUENTA, Y ES EL CASO QUE UNA CAPTURA DESTAPÓ ─────────
    //
    // Está a medio contar y ya tiene una línea que difiere. Su fila dice
    // "Contando · …", no informa diferencias, así que la cabecera TAMPOCO puede
    // contarla: decía "2 con diferencias" con una sola fila mostrándolas.
    t(6, "2026-09-10T12:00:00-03:00", {
      estado: "Recibiendo",
      recibida: false,
      lineasConDiferencia: 4,
      itemsRevisados: 3,
      itemsRevisables: 9,
    }),
  ];

  // Lo que dirían las FILAS, una por una, leyendo el TEXTO que se ve —no el
  // campo—. Tiene que ser el patrón con NÚMERO: "Recibida sin diferencias"
  // también contiene la palabra, y contarla sería contar al revés. Ese error lo
  // cometió la primera versión de este candado y por eso está escrito así.
  const DICE_DIFERENCIAS = /· \d+ diferencias?$/;
  const filasConDiferencia = transferencias.filter((x) =>
    DICE_DIFERENCIAS.test(estadoEnPalabras(x).texto)
  ).length;

  // ── LA CABECERA SE ARMA CON `bloquesPorLocal`, NO A MANO ────────────────
  //
  // La primera versión de este candado escribía `conDiferencias: 3` en el
  // fixture, así que afirmaba que 3 es igual a 3 y no miraba nada. El defecto
  // que se le escapó lo encontró el arnés: la ruta le pasaba a `bloquesPorLocal`
  // las filas CRUDAS de Prisma, sin `lineasConDiferencia`, así que la suma daba
  // cero y la cabecera decía "0 con diferencias" con las filas mostrando "1
  // diferencia" justo abajo.
  //
  // Ahora el conteo sale de la misma función que lo calcula en producción, y el
  // fixture solo aporta lo que la ruta aporta de verdad.
  const [bloque] = bloquesPorLocal({
    transferencias: transferencias.map((x) => ({
      ...x,
      destinoId: 2,
      destino: { id: 2, nombre: "mini el 7" },
      origen: { id: 1, nombre: "depo", es_deposito: true },
      detalle: [],
    })),
    acuerdos: [{ localId: 2, diaDeCorte: 0 }],
    hoy: "2026-09-12",
    locales: [{ id: 2, nombre: "mini el 7", activo: true, tieneClienteVinculado: true }],
  });

  assert.equal(filasConDiferencia, bloque.conDiferencias, "la cabecera y las filas no coinciden");
  assert.equal(bloque.conDiferencias, 3, "el conteo del bloque no sale de las transferencias");
  assert.equal(
    rotuloDeBloque(bloque),
    "6 transferencias · 2 sin recibir · 3 con diferencias"
  );

  const salida = html(React.createElement(BloqueLocal, { bloque, abierto: true, money }));
  assert.ok(salida.includes("6 transferencias · 2 sin recibir · 3 con diferencias"));
  // Y los tres días, cada uno con su banda.
  for (const dia of ["Sábado 12", "Viernes 11", "Jueves 10"]) {
    assert.ok(salida.includes(dia), `falta la banda de ${dia}`);
  }
});

test("D11 · sin diferencias, la cabecera no escribe «0 con diferencias»", () => {
  assert.equal(
    rotuloDeBloque({ cantidadTransferencias: 4, sinRecibir: 0, conDiferencias: 0 }),
    "4 transferencias"
  );
});

// ── 5 · EL CIERRE: LA RUTA MANDA LO QUE ESTO LEE ──────────────────────────

test("D12 · la ruta manda `lineasConDiferencia` y NO lo saca de `tieneDiferencias`", () => {
  const src = fs
    .readFileSync(path.join(RAIZ, "app/api/transferencias/tablero/route.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

  assert.match(src, /lineasConDiferencia:/, "la ruta no manda el conteo de diferencias");
  assert.match(src, /diferenciaDeLinea/, "el conteo no usa la puerta canónica");
  assert.doesNotMatch(
    src,
    /tieneDiferencias/,
    "volvió a usar la columna: es un booleano y miente mientras se cuenta"
  );
  assert.match(src, /conDiferencias:/, "la ruta no manda el conteo del bloque");
});
