// EL TRINQUETE DE LA HORA: la lista de los que todavía formatean por su cuenta
// SOLO PUEDE ACHICARSE.
//
// ── POR QUÉ UN CONTADOR Y NO UNA PROHIBICIÓN ────────────────────────────────
//
// Son 84 archivos los que formatean fechas en el frontend y migrarlos todos de
// una es una tanda que nadie va a poder revisar. Una prohibición seca dejaría la
// suite en rojo desde el primer minuto y terminaría apagada.
//
// Entonces se hace como el trinquete de hardcodeo: la lista de los que faltan
// está escrita acá, el candado exige que ninguno NUEVO se sume, y cada tanda que
// migra uno lo borra de la lista. El número solo puede bajar.
//
// ── QUÉ DEFIENDE ────────────────────────────────────────────────────────────
//
// Todo el stack corre en UTC y Argentina es UTC−3, así que un `toLocale*` sin
// `timeZone` muestra la hora DEL DISPOSITIVO. Medido con la venta 7726 —guardada
// 14:16:40— el ticket mostraba 14:16 en una Sunmi en UTC y el detalle mostraba
// 11:16. La misma venta, dos horas distintas, y ninguna de las dos pantallas
// avisando de nada.
//
// Y sin `hour12: false` el ICU devuelve "11:16 a. m." — o, en el ticket PDF, un
// "02:16:40" sin sufijo que no se distingue de las dos de la mañana.
//
// Las dos cosas viven en `lib/fechas/formatearFechaHora.js` y en ningún otro
// lado.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { fechaHoraAR, fechaAR, horaAR, diaSemanaAR, fechaHoraSegundosAR } from "./formatearFechaHora.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");

// ── LA LISTA DE LOS QUE FALTAN ──────────────────────────────────────────────
//
// Medida el 2026-08-19, después de migrar el ticket —PDF y térmico—, la
// auditoría, los turnos y el detalle de la venta, que son los que tienen
// consecuencia afuera: el ticket es el único papel que sale de la empresa.
//
// PARA MIGRAR UNO: se cambia el `toLocale*` por el helper y se BORRA de esta
// lista. El candado de abajo comprueba que el archivo ya no formatea por su
// cuenta, así que no se puede borrar de la lista sin haberlo migrado.
const PENDIENTES = [
  "app/api/pos-ventas/turnos/abrir/route.js",
  "app/modulos/clientes/[id]/page.jsx",
  "app/modulos/clientes/page.jsx",
  "app/modulos/compras-proveedor/[id]/page.jsx",
  "app/modulos/notificaciones/page.jsx",
  "app/modulos/pedidos/historial/page.jsx",
  "app/modulos/pedidos/page.jsx",
  "app/modulos/pos-transferencias/page.jsx",
  "app/modulos/pos-ventas/page.jsx",
  "app/modulos/reportes-ventas/page.jsx",
  "app/modulos/transferencias/[id]/page.jsx",
  "app/modulos/transferencias/page.jsx",
  "components/caja/PanelesApertura.jsx",
  "components/caja/PanelesCierre.jsx",
  "components/caja/PanelesRetiro.jsx",
  "components/compras-proveedor/ListadoPedidosProveedor.jsx",
  "components/dashboard/ActividadReciente.jsx",
  "components/dashboard/ModalDetalleVenta.jsx",
  "components/dashboard/UltimasVentas.jsx",
  "components/dashboard/VentaDetalleContent.jsx",
  "components/layout/InicioGreeting.jsx",
  "components/notificaciones/CampanaNotificaciones.jsx",
  "components/pos-ventas/HistorialArqueos.jsx",
  "components/pos-ventas/HistorialDia.jsx",
  "components/pos-ventas/ModalPendientesOffline.jsx",
  "components/pos-ventas/ModalTicketOffline.jsx",
  "components/pos-ventas/TicketPreview.jsx",
  "components/reportes-ventas/EditorVentaCorreccion.jsx",
  "components/reportes-ventas/ReporteVentasPorCliente.jsx",
  "components/reportes-ventas/VentaDetalleAdmin.jsx",
  "components/transferencias/ReporteTransferenciasPorDestino.jsx",
  "components/transferencias/detallePresentacion.jsx",
  "lib/compras-proveedor/comprobante/lector/cuota.js",
  "lib/proveedores/listas/presentacion.js",
  "lib/proveedores/listas/reporteImportacionPDF.js",
  "lib/transferencias/imprimirTicketTransferencia.js",
];

/** Los archivos que hoy formatean hora/día sin pasar por el helper. */
function formateanPorSuCuenta() {
  // `git grep` recorre el repo entero, incluido lo que un `readdirSync` de un
  // nivel se perdería. `-l` da rutas, una por línea.
  const salida = execFileSync(
    "git",
    ["grep", "-l", "-E", "toLocaleTimeString|timeStyle|hour: *\"2-digit\"|weekday:", "--", "app", "components", "lib"],
    { cwd: RAIZ, encoding: "utf8" }
  );
  return salida
    .split("\n")
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean)
    .filter((f) => !f.endsWith(".test.mjs"))
    .filter((f) => !f.startsWith("lib/fechas/"))
    .filter((f) => {
      const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
      return !src.includes("formatearFechaHora");
    });
}

test("NINGÚN ARCHIVO NUEVO formatea la hora por su cuenta", () => {
  const actuales = formateanPorSuCuenta();
  const nuevos = actuales.filter((f) => !PENDIENTES.includes(f));
  assert.deepEqual(
    nuevos,
    [],
    `estos archivos formatean hora sin el helper y no están en la lista:\n  ${nuevos.join("\n  ")}\n` +
      `Usá lib/fechas/formatearFechaHora.js. Sin la zona, la hora sale la del dispositivo; ` +
      `sin hour12:false, sale con "a. m.".`
  );
});

test("y la lista SOLO PUEDE ACHICARSE", () => {
  const actuales = formateanPorSuCuenta();
  assert.ok(
    actuales.length <= PENDIENTES.length,
    `la lista creció: ${actuales.length} archivos formatean por su cuenta y la lista declara ${PENDIENTES.length}`
  );
});

test("y no se puede borrar de la lista sin haber migrado", () => {
  // El par del anterior. Sin esto, la forma barata de poner el candado en verde
  // sería vaciar la lista, que es exactamente lo contrario de migrar.
  const actuales = formateanPorSuCuenta();
  const declaradosQueYaNoFormatean = PENDIENTES.filter((f) => !actuales.includes(f));
  assert.deepEqual(
    declaradosQueYaNoFormatean,
    [],
    `estos están en la lista pero YA no formatean por su cuenta: borralos de PENDIENTES\n  ${declaradosQueYaNoFormatean.join("\n  ")}`
  );
});

// ── EL HELPER, EJERCIDO ─────────────────────────────────────────────────────

test("la misma venta da la MISMA hora, esté el dispositivo donde esté", () => {
  // Éste es el candado que defiende lo del incidente. La venta 7726 se guardó
  // 14:16:40 y en Argentina son las 11:16. Antes el ticket mostraba una hora y
  // el detalle otra según la zona del aparato.
  const venta = new Date("2026-08-19T14:16:40.600Z");
  assert.equal(fechaHoraAR(venta), "19/08/2026 11:16");
  assert.equal(fechaHoraSegundosAR(venta), "19/08/2026 11:16:40");
  assert.equal(horaAR(venta), "11:16");
  assert.equal(fechaAR(venta), "19/08/2026");
});

test("SIEMPRE en 24 horas: nunca 'a. m.' ni 'p. m.'", () => {
  // Una de la tarde es el caso que lo delata: en 12 horas sería "01:00".
  const tarde = new Date("2026-08-19T16:00:00Z"); // 13:00 en Argentina
  assert.equal(horaAR(tarde), "13:00");
  assert.doesNotMatch(fechaHoraAR(tarde), /a\.\s?m\.|p\.\s?m\./i);
  assert.doesNotMatch(fechaHoraSegundosAR(tarde), /a\.\s?m\.|p\.\s?m\./i);
});

test("el DÍA también se corrige, no solo la hora", () => {
  // Una venta de las 22:00 en Argentina es del día SIGUIENTE en UTC. Sin la zona,
  // el listado la muestra en el día equivocado y el cierre del turno no cierra.
  const noche = new Date("2026-08-20T01:30:00Z"); // 22:30 del 19 en Argentina
  assert.equal(fechaAR(noche), "19/08/2026");
  assert.equal(horaAR(noche), "22:30");
  assert.match(diaSemanaAR(noche), /mi[ée]rcoles/i);
});

test("un valor vacío o inválido no inventa una fecha", () => {
  assert.equal(fechaHoraAR(null), "—");
  assert.equal(fechaHoraAR(undefined), "—");
  assert.equal(fechaHoraAR(""), "—");
  assert.equal(fechaHoraAR("cualquier cosa"), "—");
  assert.equal(horaAR(null, { vacio: "-" }), "-");
});
