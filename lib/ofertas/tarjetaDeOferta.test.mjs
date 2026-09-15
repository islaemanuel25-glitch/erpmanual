// LO QUE DICE LA TARJETA DE UNA OFERTA, EJERCIDO EN SUS BORDES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/ofertas/tarjetaDeOferta.test.mjs
//
// Los tres bordes que un martes cualquiera no se ven:
//
//   1. la ventana es SEMIABIERTA, así que `finEn` es el día siguiente al último
//      vigente y preguntar por él corre todo un día;
//   2. el día es el CALENDARIO ARGENTINO, y el contenedor corre en UTC: después
//      de las 21:00 "hoy" cambia de respuesta si se compara con el reloj;
//   3. un porcentaje que no se puede calcular no es cero.

import { test } from "node:test";
import assert from "node:assert/strict";

import { ESTADO_OFERTA } from "@/lib/ofertas/estados";
import {
  diaEnQueTermina,
  lineaDeCuando,
  renglonesDeComparacion,
  selloDeOferta,
  terminaHoy,
  terminaManana,
} from "@/lib/ofertas/tarjetaDeOferta";

// Una oferta que termina el JUEVES 17 se guarda con `finEn` el viernes 18 a las
// 00:00 argentinas. Es la forma en que la escribe `finDeLaOferta`.
const FIN_JUEVES_17 = "2026-09-18T03:00:00.000Z"; // viernes 18, 00:00 AR
const MARTES_15_10AM = new Date("2026-09-15T13:00:00.000Z");
const JUEVES_17_10AM = new Date("2026-09-17T13:00:00.000Z");
const MIERCOLES_16_10AM = new Date("2026-09-16T13:00:00.000Z");
// Las 22:00 argentinas del miércoles son las 01:00 UTC del JUEVES. Si el día se
// leyera del reloj del proceso, acá "hoy" pasaría a ser jueves.
const MIERCOLES_16_10PM = new Date("2026-09-17T01:00:00.000Z");

// ── 1 · LA VENTANA SEMIABIERTA ───────────────────────────────────────────

test("T1 · el último día vigente es el ANTERIOR a `finEn`", () => {
  const u = diaEnQueTermina(FIN_JUEVES_17);
  assert.equal(u.toISOString(), "2026-09-18T02:59:59.000Z", "se corrió un día");
  assert.equal(diaEnQueTermina(null), null);
  assert.equal(diaEnQueTermina("cualquier cosa"), null);
});

test("T2 · «termina hoy» es el jueves, no el viernes", () => {
  assert.equal(terminaHoy(FIN_JUEVES_17, JUEVES_17_10AM), true);
  assert.equal(
    terminaHoy(FIN_JUEVES_17, new Date("2026-09-18T13:00:00.000Z")),
    false,
    "el viernes ya no rige: decir que termina hoy es decir que todavía cobra"
  );
  assert.equal(terminaHoy(FIN_JUEVES_17, MARTES_15_10AM), false);
});

test("T3 · «termina mañana» es el miércoles", () => {
  assert.equal(terminaManana(FIN_JUEVES_17, MIERCOLES_16_10AM), true);
  assert.equal(terminaManana(FIN_JUEVES_17, JUEVES_17_10AM), false);
  assert.equal(terminaManana(FIN_JUEVES_17, MARTES_15_10AM), false);
});

// ── 2 · EL DÍA ES EL ARGENTINO, NO EL DEL PROCESO ────────────────────────

test("T4 · a las 22:00 argentinas sigue siendo el mismo día", () => {
  // Es el borde que rompe todo lo que compare con UTC: 22:00 AR del miércoles ya
  // es jueves en el reloj del contenedor. Si el día saliera de ahí, esta oferta
  // pasaría a decir "termina hoy" una noche antes.
  assert.equal(
    terminaManana(FIN_JUEVES_17, MIERCOLES_16_10PM),
    true,
    "a las 22:00 del miércoles la oferta del jueves termina MAÑANA"
  );
  assert.equal(
    terminaHoy(FIN_JUEVES_17, MIERCOLES_16_10PM),
    false,
    "se leyó el día del contenedor: a esa hora UTC ya es jueves"
  );
});

// ── 3 · EL SELLO ─────────────────────────────────────────────────────────

test("T5 · ACTIVA en verde, PROGRAMADA en gris", () => {
  assert.deepEqual(
    selloDeOferta({ estado: ESTADO_OFERTA.ACTIVA, finEn: FIN_JUEVES_17 }, MARTES_15_10AM),
    { texto: "ACTIVA", color: "green" }
  );
  assert.deepEqual(selloDeOferta({ estado: ESTADO_OFERTA.PROGRAMADA }, MARTES_15_10AM), {
    texto: "PROGRAMADA",
    color: "slate",
  });
});

test("T6 · VENCE HOY le gana a ACTIVA, y es lo que la hace visible", () => {
  // Si ACTIVA se preguntara primero, este aviso sería inalcanzable: la oferta
  // que termina hoy TAMBIÉN está activa. Es el mismo orden que `estados.js` ya
  // resolvió poniendo REVISAR antes que ACTIVA.
  const sello = selloDeOferta(
    { estado: ESTADO_OFERTA.ACTIVA, finEn: FIN_JUEVES_17 },
    JUEVES_17_10AM
  );
  assert.deepEqual(sello, { texto: "VENCE HOY", color: "amber" });
});

test("T7 · una que REVISAR y además vence hoy avisa que vence", () => {
  assert.equal(
    selloDeOferta({ estado: ESTADO_OFERTA.REVISAR, finEn: FIN_JUEVES_17 }, JUEVES_17_10AM).texto,
    "VENCE HOY"
  );
  // Y si no vence hoy, sigue diciendo REVISAR: en ámbar, no en verde. Pintarla
  // de verde diría que no hay nada que mirar.
  const otro = selloDeOferta({ estado: ESTADO_OFERTA.REVISAR, finEn: FIN_JUEVES_17 }, MARTES_15_10AM);
  assert.deepEqual(otro, { texto: "REVISAR", color: "amber" });
});

test("T8 · una PROGRAMADA no dice «vence hoy» aunque las fechas se crucen", () => {
  // `terminaHoy` mira solo el fin. Sin el filtro por estado, una oferta que
  // empieza mañana y termina hoy —un dato roto— saldría como urgente.
  assert.equal(
    selloDeOferta({ estado: ESTADO_OFERTA.PROGRAMADA, finEn: FIN_JUEVES_17 }, JUEVES_17_10AM).texto,
    "PROGRAMADA"
  );
  assert.equal(selloDeOferta({ estado: "CUALQUIERA" }), null);
  assert.equal(selloDeOferta({}), null);
});

// ── 4 · LA LÍNEA DE CUÁNDO ───────────────────────────────────────────────

test("T9 · cada estado dice lo que hace falta saber de él", () => {
  const c = (estado, ahora = MARTES_15_10AM, extra = {}) =>
    lineaDeCuando({ estado, finEn: FIN_JUEVES_17, inicioEn: "2026-09-19T03:00:00.000Z", ...extra }, ahora);

  assert.equal(c(ESTADO_OFERTA.ACTIVA), "Termina el jueves 17 de septiembre");
  assert.equal(c(ESTADO_OFERTA.ACTIVA, JUEVES_17_10AM), "Termina hoy");
  assert.equal(c(ESTADO_OFERTA.ACTIVA, MIERCOLES_16_10AM), "Termina mañana");
  // El 19 de septiembre de 2026 es SÁBADO. La primera versión de este candado
  // decía "viernes 19" copiando el ejemplo del diseño, que es ilustrativo: el
  // rojo fue de la expectativa, no del código.
  assert.equal(c(ESTADO_OFERTA.PROGRAMADA), "Arranca el sábado 19 de septiembre");
  assert.equal(c(ESTADO_OFERTA.VENCIDA), "Terminó el jueves 17 de septiembre");
  assert.equal(c(ESTADO_OFERTA.BORRADOR), "Sin publicar");
  assert.equal(c(ESTADO_OFERTA.FINALIZADA), "Terminada a mano");
});

test("T10 · lo de efectivo se agrega, no reemplaza", () => {
  assert.equal(
    lineaDeCuando(
      { estado: ESTADO_OFERTA.ACTIVA, finEn: FIN_JUEVES_17, soloEfectivo: true },
      JUEVES_17_10AM
    ),
    "Termina hoy · Solo efectivo"
  );
  assert.equal(
    lineaDeCuando({ estado: ESTADO_OFERTA.PROGRAMADA, inicioEn: "2026-09-19T03:00:00.000Z", soloEfectivo: true }),
    "Arranca el sábado 19 de septiembre · Solo efectivo"
  );
});

test("T11 · sin fechas no se inventa una", () => {
  assert.equal(lineaDeCuando({ estado: ESTADO_OFERTA.ACTIVA, finEn: null }), "Sin fecha de fin");
  assert.equal(lineaDeCuando({ estado: ESTADO_OFERTA.PROGRAMADA, inicioEn: null }), "Sin fecha de inicio");
});

// ── 5 · LOS DOS RENGLONES DE LA IZQUIERDA ────────────────────────────────

const money = (n) => `$ ${Number(n).toLocaleString("es-AR")}`;

test("T12 · «Normal $ 3.700» y «11 % menos»", () => {
  const r = renglonesDeComparacion({ precioNormal: 3700, precioOferta: 3300, money });
  assert.equal(r.normal, "Normal $ 3.700");
  assert.equal(r.descuento, "11 % menos", "10,81 % redondea a 11");
});

test("T13 · un descuento que no se puede calcular es null, NO cero", () => {
  // Devolver "0 % menos" afirmaría que la oferta no baja nada, que es una
  // afirmación y no una ausencia. Es el mismo agujero que `formato.js` tiene
  // anotado: `Number(null)` es 0 y un cero se lee como un dato.
  assert.equal(renglonesDeComparacion({ precioNormal: null, precioOferta: 3300, money }).descuento, null);
  assert.equal(renglonesDeComparacion({ precioNormal: null, precioOferta: 3300, money }).normal, null);
  assert.equal(renglonesDeComparacion({ precioNormal: 3700, precioOferta: null, money }).descuento, null);
  assert.equal(renglonesDeComparacion({}).descuento, null);
});

test("T14 · un precio que NO baja del normal no dice «menos»", () => {
  // Es un dato roto —no debería poder publicarse— pero si llega, decir
  // "-8 % menos" o "0 % menos" sería peor que no decir nada.
  assert.equal(renglonesDeComparacion({ precioNormal: 3300, precioOferta: 3700, money }).descuento, null);
  assert.equal(renglonesDeComparacion({ precioNormal: 3300, precioOferta: 3300, money }).descuento, null);
  assert.equal(
    renglonesDeComparacion({ precioNormal: 3300, precioOferta: 3700, money }).normal,
    "Normal $ 3.300",
    "el precio normal sigue siendo un hecho aunque el descuento no se pueda decir"
  );
});
