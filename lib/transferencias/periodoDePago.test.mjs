// EL PERÍODO DE PAGO, Y QUE EL CORTE NO ESTÉ ESCRITO EN EL CÓDIGO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/transferencias/periodoDePago.test.mjs
//
// El corte de semana es un ACUERDO entre un depósito y un local: acá va de domingo
// a sábado, puede cambiar, y puede ser distinto por local. Lo único que este
// módulo no puede hacer es decidirlo por su cuenta.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DIAS,
  DIA_DE_CORTE_POR_DEFECTO,
  UNIDADES,
  caeEnElPeriodo,
  diaDeLaSemana,
  esDiaDeCorteValido,
  nombreDelDia,
  rangoDelPeriodo,
  rotuloDelRango,
} from "@/lib/transferencias/periodoDePago";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// 2026-09-13 es un DOMINGO. Todo lo de abajo se ancla ahí para que los casos se
// puedan leer sin contar días con los dedos.
const DOMINGO = "2026-09-13";
const MIERCOLES = "2026-09-16";
const SABADO = "2026-09-19";

test("el ancla del archivo es la que digo que es", () => {
  // Si esto falla, todos los casos de abajo están contando otra cosa.
  assert.equal(diaDeLaSemana(DOMINGO), 0, "2026-09-13 tiene que ser domingo");
  assert.equal(diaDeLaSemana(MIERCOLES), 3);
  assert.equal(diaDeLaSemana(SABADO), 6);
});

test("SEMANA que corta DOMINGO: de domingo a sábado, mire desde donde se mire", () => {
  const esperado = { desde: DOMINGO, hasta: SABADO };
  // El mismo período contestado desde tres días distintos de esa semana. Es la
  // afirmación que importa: el rango es del PERÍODO, no del día en que se mira.
  assert.deepEqual(rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: 0, hoy: DOMINGO }), esperado);
  assert.deepEqual(rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: 0, hoy: MIERCOLES }), esperado);
  assert.deepEqual(rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: 0, hoy: SABADO }), esperado);
});

test("SEMANA que corta LUNES: el mismo miércoles cae en OTRO rango", () => {
  // La razón de ser de toda la tabla: dos locales, dos cortes, dos semanas
  // distintas para el mismo día. Si esto diera igual que el de arriba, el
  // acuerdo por relación no serviría para nada.
  const conLunes = rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: 1, hoy: MIERCOLES });
  assert.deepEqual(conLunes, { desde: "2026-09-14", hasta: "2026-09-20" });

  const conDomingo = rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: 0, hoy: MIERCOLES });
  assert.notDeepEqual(conLunes, conDomingo, "los dos cortes dan el mismo rango: el acuerdo no se está mirando");
});

test("y el DOMINGO mismo, con corte lunes, todavía es la semana ANTERIOR", () => {
  // El caso que se escribe mal cuando la cuenta lleva un `if` de "si todavía no
  // pasó el día de corte": el domingo con corte lunes no abre semana nueva.
  assert.deepEqual(rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: 1, hoy: DOMINGO }), {
    desde: "2026-09-07",
    hasta: "2026-09-13",
  });
});

test("los siete cortes dan siete semanas de SIETE días, y ninguna se saltea", () => {
  // Barrido: para cada día de corte, el rango tiene que contener al día mirado y
  // empezar justo en ese día de la semana. Es lo que atrapa un error de signo o
  // un módulo mal escrito, que con un solo caso pasa desapercibido.
  for (const corte of [0, 1, 2, 3, 4, 5, 6]) {
    const r = rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: corte, hoy: MIERCOLES });
    assert.equal(diaDeLaSemana(r.desde), corte, `el corte ${corte} no arranca en su día`);
    assert.ok(r.desde <= MIERCOLES && MIERCOLES <= r.hasta, `el corte ${corte} deja afuera el día mirado`);
    assert.equal(
      (Date.parse(r.hasta) - Date.parse(r.desde)) / 86400000,
      6,
      `el corte ${corte} no da una semana de siete días`
    );
  }
});

test("DÍA y MES no miran el corte", () => {
  assert.deepEqual(rangoDelPeriodo({ unidad: UNIDADES.DIA, diaDeCorte: 4, hoy: MIERCOLES }), {
    desde: MIERCOLES,
    hasta: MIERCOLES,
  });
  assert.deepEqual(rangoDelPeriodo({ unidad: UNIDADES.MES, diaDeCorte: 4, hoy: MIERCOLES }), {
    desde: "2026-09-01",
    hasta: "2026-09-30",
  });
  // Febrero de un año bisiesto, que es donde un "último día" escrito a mano falla.
  assert.deepEqual(rangoDelPeriodo({ unidad: UNIDADES.MES, hoy: "2028-02-10" }), {
    desde: "2028-02-01",
    hasta: "2028-02-29",
  });
});

test("un corte inválido cae al de por defecto en vez de devolver basura", () => {
  // No es una decisión de negocio: es defensa. La decisión —qué mostrar cuando la
  // relación no tiene acuerdo— la toma la pantalla, que además la marca.
  for (const malo of [null, undefined, -1, 7, 3.5, "1"]) {
    assert.equal(esDiaDeCorteValido(malo), false, `${malo} no tendría que ser un corte válido`);
    const r = rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: malo, hoy: MIERCOLES });
    assert.equal(diaDeLaSemana(r.desde), DIA_DE_CORTE_POR_DEFECTO);
  }
});

test("EL LUNES NO ESTÁ ESCRITO EN ESTE MÓDULO", () => {
  // El defecto que esta tanda vino a sacar: el único corte del repo era el lunes,
  // a mano, dentro del calendario del kit. Si vuelve a aparecer un día fijo acá,
  // el acuerdo por relación deja de decidir.
  //
  // ── SE MIRA LA LÓGICA, NO LA TABLA DE NOMBRES ────────────────────────
  //
  // La primera versión de este candado buscaba "lunes" en todo el archivo y se
  // ponía roja por `{ valor: 1, nombre: "Lunes" }`, que es el rótulo que la
  // pantalla de configuración necesita para ofrecer los siete días. Eso es DATO,
  // no un corte decidido: la tabla tiene los siete y no privilegia ninguno.
  //
  // Lo que el candado defiende es que ningún día quede metido en el CÁLCULO. Así
  // que se saca la tabla antes de mirar — y se comprueba aparte que la tabla siga
  // teniendo los siete, porque si alguien la recortara el efecto sería el mismo.
  const crudo = fs.readFileSync(path.join(RAIZ, "lib/transferencias/periodoDePago.js"), "utf8");
  const src = crudo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/export const DIAS[\s\S]*?\]\);/, "");
  assert.ok(!/Monday|lunes|domingo/i.test(src), "volvió un día de la semana escrito en la lógica");
  assert.equal(DIAS.length, 7, "la tabla de días dejó de ofrecer los siete");
  // Y el día de corte tiene que seguir entrando por argumento.
  assert.match(src, /diaDeCorte = DIA_DE_CORTE_POR_DEFECTO/, "el corte dejó de ser un parámetro");
});

test("el rótulo dice el mismo rango que se consultó", () => {
  const r = rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: 0, hoy: MIERCOLES });
  assert.equal(rotuloDelRango(r), "13/09 al 19/09");
  assert.equal(rotuloDelRango({ desde: MIERCOLES, hasta: MIERCOLES }), "16/09", "un solo día no dice «al»");
  assert.equal(rotuloDelRango({}), "—");
});

test("caeEnElPeriodo incluye las DOS puntas", () => {
  const r = { desde: DOMINGO, hasta: SABADO };
  assert.equal(caeEnElPeriodo(DOMINGO, r), true, "el primer día quedó afuera");
  assert.equal(caeEnElPeriodo(SABADO, r), true, "el último día quedó afuera");
  assert.equal(caeEnElPeriodo("2026-09-20", r), false);
  assert.equal(caeEnElPeriodo("2026-09-12", r), false);
});

test("el nombre del día es para la pantalla de configuración", () => {
  assert.equal(nombreDelDia(0), "Domingo");
  assert.equal(nombreDelDia(6), "Sábado");
  assert.equal(nombreDelDia(9), "—");
});
