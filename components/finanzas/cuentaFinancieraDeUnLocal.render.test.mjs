// CANDADO DE RENDER: EL CONTENEDOR REAL DEL RESUMEN DE UN LOCAL.
//
//   node --import ./scripts/alias-loader.mjs --test components/finanzas/cuentaFinancieraDeUnLocal.render.test.mjs
//
// Dibuja `CuentaFinancieraDeUnLocal` —la pieza que ven el local y el depósito—
// con `renderToStaticMarkup` y afirma lo que no se puede ver desde un helper:
// que la Actividad de celular muestra tres hechos y la puerta al resto, que la
// de escritorio conserva la lista completa de siempre, y que los períodos, el
// "Otro" apagado, la carga y el error siguen como estaban.
//
// La actividad sale del MISMO `actividadPorDia` que usa la ruta, con
// movimientos clasificados por `clasificarMovimientos`: el orden de los hechos
// es el canónico del servidor, no uno escrito acá.
//
// ── LO QUE ESTE HARNESS NO PUEDE: EL TOQUE ───────────────────────────────
//
// El repo no tiene un DOM de prueba (ni jsdom ni Testing Library), y agregar
// uno es una dependencia nueva. Así que el toque en "Ver toda la actividad" no
// se ejerce acá. Lo que sí se afirma es todo lo que lo rodea: que el control es
// un botón de verdad, y que lo que dibuja al tocarlo —`ActividadCompleta`— es
// exactamente la lista de escritorio, que este candado compara nodo por nodo.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CuentaFinancieraDeUnLocal, { HECHOS_EN_EL_RESUMEN } from "@/components/finanzas/CuentaFinancieraDeUnLocal.jsx";
import DiaDeActividad from "@/components/finanzas/DiaDeActividad.jsx";
import { actividadPorDia } from "@/lib/finanzas/actividadFinanciera";
import { clasificarMovimientos } from "@/lib/finanzas/movimientosDeCaja";
import { UNIDADES } from "@/lib/transferencias/periodoDePago";
import { recortarActividad } from "@/lib/finanzas/presentacionResumen";
import { DESCRIPCION_DIA, DESCRIPCION_SEMANA, casoLleno } from "@/components/finanzas/casosDelResumen.mjs";

// ── HERRAMIENTAS ──────────────────────────────────────────────────────────

const nada = () => {};

/** La actividad como la arma la ruta: movimientos clasificados, agrupados por día. */
function actividad(movimientos) {
  return actividadPorDia({ movimientos: clasificarMovimientos(movimientos, { idsDeRecaudacion: new Set() }) });
}

/** Un retiro de caja con su motivo, en un instante dado (UTC). */
const retiro = (id, motivo, createdAt) => ({ id, tipo: "RETIRO", monto: "1000.00", motivo, createdAt, turnoId: 10 });

/** Cinco hechos en dos días: tres el 1 de octubre y dos el 30 de septiembre. */
const CINCO_HECHOS = [
  retiro(1, "M-1", "2026-10-01T15:00:00Z"),
  retiro(2, "M-2", "2026-10-01T14:00:00Z"),
  retiro(3, "M-3", "2026-10-01T13:00:00Z"),
  retiro(4, "M-4", "2026-09-30T15:00:00Z"),
  retiro(5, "M-5", "2026-09-30T14:00:00Z"),
];

function pantalla({ unidad = UNIDADES.DIA, descripcion = DESCRIPCION_DIA, movimientos = CINCO_HECHOS, ...resto } = {}) {
  return renderToStaticMarkup(
    React.createElement(CuentaFinancieraDeUnLocal, {
      datos: {
        periodo: { descripcion },
        puedeAvanzar: false,
        puedeRetroceder: true,
        resumen: casoLleno(),
        actividad: actividad(movimientos),
      },
      unidad,
      onCambiarUnidad: nada,
      onAtras: nada,
      onAdelante: nada,
      onAbrirTurno: nada,
      ...resto,
    }),
  );
}

/** El contenido del `<div>` que lleva `atributo`, contando los `<div>` anidados. */
function interiorDe(html, atributo) {
  const i = html.indexOf(atributo);
  if (i < 0) return null;
  const finAbre = html.indexOf(">", i) + 1;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = finAbre;
  let profundidad = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    profundidad += m[0] === "</div>" ? -1 : 1;
    if (profundidad === 0) return html.slice(finAbre, m.index);
  }
  return null;
}

/** El `<button>` cuyo texto es `texto`, con sus atributos. */
const botonDe = (html, texto) => html.match(new RegExp(`<button[^>]*>${texto}</button>`))?.[0] ?? null;

// ══════════════════════════════════════════════════════════════════════════
// 1 · ACTIVIDAD
// ══════════════════════════════════════════════════════════════════════════

test("T1 · celular: los tres primeros hechos, en el orden canónico, y la puerta al resto", () => {
  const cel = interiorDe(pantalla(), 'data-actividad="celular"');
  assert.equal(HECHOS_EN_EL_RESUMEN, 3);
  for (const m of ["M-1", "M-2", "M-3"]) assert.ok(cel.includes(`Motivo: ${m}`), `falta ${m}`);
  for (const m of ["M-4", "M-5"]) assert.ok(!cel.includes(`Motivo: ${m}`), `${m} no debería estar en el recorte`);
  // La puerta es un botón de verdad —semántica de acción—, no un enlace.
  assert.match(cel, /<button type="button"[^>]*>Ver toda la actividad ›<\/button>/);
});

test("T2 · celular: el recorte es exactamente el de `recortarActividad`, dibujado con la pieza de siempre", () => {
  const act = actividad(CINCO_HECHOS);
  const cel = interiorDe(pantalla(), 'data-actividad="celular"');
  const esperado = recortarActividad(act, HECHOS_EN_EL_RESUMEN)
    .dias.map((dia) => renderToStaticMarkup(React.createElement(DiaDeActividad, { dia, onAbrirTurno: nada })))
    .join("");
  assert.ok(cel.startsWith(esperado), "el celular no dibuja el recorte canónico");
});

test("T3 · escritorio: la lista COMPLETA de antes, nodo por nodo, y sin 'Ver toda'", () => {
  const act = actividad(CINCO_HECHOS);
  const esc = interiorDe(pantalla(), 'data-actividad="escritorio"');
  // Lo mismo que dibujaba la base: un `DiaDeActividad` por día, todos los hechos.
  const esperado = act
    .map((dia) => renderToStaticMarkup(React.createElement(DiaDeActividad, { dia, onAbrirTurno: nada })))
    .join("");
  assert.equal(esc, esperado);
  assert.ok(!esc.includes("Ver toda la actividad"));
});

test("T4 · con tres hechos o menos, celular los muestra todos y no ofrece 'Ver toda'", () => {
  const cel = interiorDe(pantalla({ movimientos: CINCO_HECHOS.slice(0, 3) }), 'data-actividad="celular"');
  for (const m of ["M-1", "M-2", "M-3"]) assert.ok(cel.includes(`Motivo: ${m}`));
  assert.ok(!cel.includes("Ver toda la actividad"));
});

test("T5 · período sin actividad: el mismo mensaje en las dos presentaciones", () => {
  const html = pantalla({ movimientos: [] });
  for (const lado of ["celular", "escritorio"]) {
    assert.ok(
      interiorDe(html, `data-actividad="${lado}"`).includes("No hubo turnos ni movimientos de caja en este período."),
      `${lado} perdió el mensaje del período vacío`,
    );
  }
});

test("T6 · la actividad usa el mismo breakpoint que el Resumen", () => {
  const html = pantalla();
  const etiqueta = (lado) => html.match(new RegExp(`<div data-actividad="${lado}"[^>]*>`))[0];
  const clases = (lado) => new Set(etiqueta(lado).match(/class="([^"]*)"/)[1].split(" "));
  assert.ok(clases("celular").has("md:hidden"));
  assert.ok(clases("escritorio").has("hidden") && clases("escritorio").has("md:block"));
});

// ══════════════════════════════════════════════════════════════════════════
// 2 · PERÍODOS: SEMANA, MES Y "OTRO"
// ══════════════════════════════════════════════════════════════════════════

for (const [unidad, texto] of [
  [UNIDADES.SEMANA, "Semana"],
  [UNIDADES.MES, "Mes"],
]) {
  test(`P1 · ${texto}: el chip queda elegido y celular conserva la arquitectura nueva`, () => {
    const html = pantalla({ unidad, descripcion: DESCRIPCION_SEMANA });
    assert.match(botonDe(html, texto) ?? "", /aria-pressed="true"/, `${texto} no quedó elegido`);
    assert.match(botonDe(html, "Día") ?? "", /aria-pressed="false"/);
    // El navegador dice el período; el celular no lo repite y conserva su orden.
    assert.ok(html.includes(DESCRIPCION_SEMANA.titulo));
    const cel = interiorDe(html, 'data-resumen="celular"');
    assert.ok(cel.includes("CÓMO SE FORMA") && cel.includes("Resultado del período"));
    assert.ok(!cel.includes(DESCRIPCION_SEMANA.titulo));
  });
}

test("P2 · 'Otro' conserva su disponibilidad actual: dibujado y deshabilitado", () => {
  for (const unidad of [UNIDADES.DIA, UNIDADES.SEMANA, UNIDADES.MES]) {
    const otro = botonDe(pantalla({ unidad }), "Otro");
    assert.ok(otro, "desapareció el chip Otro");
    assert.match(otro, /\bdisabled=""/, "Otro dejó de estar deshabilitado");
    assert.match(otro, /aria-pressed="false"/);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 3 · CARGA Y ERROR, CON LAS PIEZAS DE SIEMPRE
// ══════════════════════════════════════════════════════════════════════════

test("L1 · cargando: el loader del kit y ningún resumen a medias", () => {
  const html = pantalla({ cargando: true });
  assert.ok(html.includes("animate-spin"), "no se dibujó SunmiLoader");
  assert.ok(!html.includes('data-resumen="celular"') && !html.includes('data-actividad="celular"'));
});

test("L2 · error: la tarjeta danger del ERP y ningún resumen", () => {
  const html = pantalla({ error: "No se pudo cargar el resumen." });
  const tarjeta = html.match(/<div[^>]*>No se pudo cargar el resumen\.<\/div>/)?.[0];
  assert.ok(tarjeta, "no se dibujó el error");
  const clases = new Set(tarjeta.match(/class="([^"]*)"/)[1].split(" "));
  assert.ok(clases.has("sunmi-border-danger") && clases.has("sunmi-text-danger"));
  assert.ok(!html.includes('data-resumen="celular"'));
});
