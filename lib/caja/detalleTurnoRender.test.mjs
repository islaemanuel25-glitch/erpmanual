// RENDER REAL del detalle de turno.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/detalleTurnoRender.test.mjs
//
// POR QUÉ EXISTE
//
// `ArqueosDelTurno.jsx` llamaba a `etiquetaRegistro` sin importarlo. Compiló,
// pasó el lint, pasaron 1207 pruebas y se desplegó a producción, donde la
// sección "Retiros y conteos históricos" reventaba con
// `ReferenceError: etiquetaRegistro is not defined` al desplegar la lista.
//
// Ninguna prueba lo detectó porque NINGUNA ejecutaba ese JSX: las que había
// leían el archivo como texto o probaban la función aislada en lib/, donde sí
// existe. Leer el fuente y buscar la palabra no sirve — la palabra estaba, en la
// llamada.
//
// Esta prueba RENDERIZA el componente con react-dom/server. Sin DOM, sin jsdom y
// sin dependencias nuevas: el JSX lo transforma el SWC que Next ya trae, vía
// scripts/alias-loader.mjs.
//
// SI SE BORRA EL IMPORT, ESTA PRUEBA FALLA con el mismo ReferenceError que vio
// el usuario en producción.

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import ArqueosDelTurno, { FilaRegistro } from "@/components/turnos/ArqueosDelTurno";

/** Registro mínimo con la forma que devuelve el endpoint. */
const registro = (extra = {}) => ({
  id: 1,
  tipo: "PARCIAL",
  fechaHora: "2026-08-04T12:00:00.000Z",
  periodoDesde: "2026-08-04T09:00:00.000Z",
  periodoHasta: "2026-08-04T12:00:00.000Z",
  efectivoEsperado: 120000,
  efectivoContado: 120000,
  diferencia: 0,
  desdeAnterior: { texto: "Desde el control anterior entraron $90.000,00 en efectivo." },
  ...extra,
});

const render = (a) => renderToStaticMarkup(createElement(FilaRegistro, { a }));

// ── El camino que llama a etiquetaRegistro se ejecuta de verdad ─────────────

test("1. un registro con retiro real se renderiza como 'retiro de dinero'", () => {
  const html = render(registro({ cajaMovimientoRetiroId: 7, efectivoRetirado: 90000 }));
  assert.match(html, /retiro de dinero/, "no salió la etiqueta de retiro");
  assert.doesNotMatch(html, /conteo hist/, "lo etiquetó como conteo");
});

test("2. un retiro sin movimiento pero con entrega pendiente también es retiro", () => {
  // Un retiro de $0 no genera movimiento, pero sí tiene estado de entrega.
  const html = render(registro({ estadoEntrega: "PENDIENTE_ENTREGA", efectivoRetirado: 0 }));
  assert.match(html, /retiro de dinero/);
});

test("3. un registro histórico se renderiza como 'conteo histórico'", () => {
  const html = render(registro());
  assert.match(html, /conteo histórico/, "no salió la etiqueta de conteo histórico");
  assert.doesNotMatch(html, /retiro de dinero/, "reinterpretó un registro viejo como retiro");
});

test("4. el cierre distingue si además hubo retiro", () => {
  assert.match(render(registro({ tipo: "FINAL" })), /cierre</);
  assert.match(render(registro({ tipo: "FINAL", cajaMovimientoRetiroId: 9 })), /cierre con retiro/);
});

test("5. renderizar NO lanza ReferenceError — el fallo exacto de producción", () => {
  // Si el import de `etiquetaRegistro` vuelve a faltar, esto explota acá y no en
  // la pantalla de un usuario.
  assert.doesNotThrow(() => {
    render(registro({ cajaMovimientoRetiroId: 3 }));
    render(registro());
  });
});

test("6. la fila muestra el resto de los datos del registro", () => {
  // Que la etiqueta esté bien no alcanza: se comprueba que el JSX completo
  // renderiza, no solo la línea del título.
  const html = render(registro({ observacion: "faltan monedas", realizadoPor: "Ana" }));
  assert.match(html, /Esperado/);
  assert.match(html, /Contado/);
  assert.match(html, /120\.000,00/);
  assert.match(html, /Desde el control anterior/);
  assert.match(html, /faltan monedas/);
  assert.match(html, /Lo hizo Ana/);
});

// ── El componente completo también se monta ────────────────────────────────

test("7. el componente entero se monta sin romper", () => {
  // En SSR no corren los efectos, así que queda en el estado de carga. Sirve
  // igual: prueba que el MÓDULO se evalúa completo, con todos sus imports
  // resueltos. Un identificador suelto en el cuerpo del componente lo rompería.
  const html = renderToStaticMarkup(
    createElement(ArqueosDelTurno, { turnoId: 1, movimientos: [], montoInicial: 30000 })
  );
  assert.match(html, /Retiros y conteos/);
  assert.match(html, /Cargando/);
});

test("8. la terminología nueva no volvió atrás", () => {
  const html = render(registro());
  assert.doesNotMatch(html, /[Aa]rqueo/, "reapareció la palabra arqueo en la fila");
});
