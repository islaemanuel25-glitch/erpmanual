// EL ESTADO DEL TURNO Y EL RELEVO DEL CAMBIO: una sola fuente, leída por id.
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/estadoYRelevoDelTurno.test.mjs
//
// Son los candados que sobrevivieron de `circuitoDinero.test.mjs` cuando el
// 2026-11-01 se borraron las pantallas viejas de turnos —la lista, la ficha y la
// bandeja de cambios pendientes— junto con `lib/caja/circuitoDinero.js` y
// `components/turnos/CircuitoDelDinero.jsx`, que solo ellas usaban. Turnos y
// cajas viven en /modulos/turnos-y-cierres. Lo que queda acá cuida archivos que
// siguen vivos: el estado del turno, el resumen que lee el POS, la auditoría de
// operadores, las escrituras del relevo y el comprobante Z. Se conservan los
// números originales para que se puedan rastrear en el historial.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estadoDelTurno, ESTADO_TURNO } from "@/lib/caja/cierreRelevo";

const fuente = (f) => readFileSync(f, "utf8");
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{?\s*\/\/.*$/gm, "");

// ── Los estados del turno, una sola interpretación ──────────────────────────

test("11. los cuatro estados se derivan de los mismos dos campos", () => {
  assert.equal(estadoDelTurno({ cierre: null, cierreEnPreparacionEn: null }), ESTADO_TURNO.ABIERTO);
  assert.equal(
    estadoDelTurno({ cierre: null, cierreEnPreparacionEn: new Date() }),
    ESTADO_TURNO.CIERRE_EN_PREPARACION
  );
  assert.equal(estadoDelTurno({ cierre: new Date() }), ESTADO_TURNO.CERRADO);
  assert.equal(estadoDelTurno({ cierre: new Date(), anuladoEn: new Date() }), ESTADO_TURNO.ANULADO);
});

test("12. el resumen del turno devuelve el estado, no lo hace deducir", () => {
  const f = "app/api/pos-ventas/turnos/resumen/route.js";
  const s = fuente(f);
  assert.match(s, /estadoDelTurno/, `${f} no usa la fuente única del estado`);
  assert.match(s, /cierreEnPreparacionEn/, `${f} no trae el campo del tercer estado`);
});

test("13. la auditoría de operadores ya no cuenta las cajas cortadas como abiertas", () => {
  const s = fuente("app/api/auditoria-pos-ventas/operadores/route.js");
  assert.match(s, /turnoOperativo\(t\)/);
  assert.doesNotMatch(sinComentarios(s), /t\.cierre === null/);
  assert.match(s, /turnosEnCierre/);
});

// ── El relevo se lee de su fuente, no se adivina ────────────────────────────

test("21. el traspaso NUNCA se deduce por importe ni por fecha", () => {
  const s = sinComentarios(fuente("app/api/pos-ventas/turnos/resumen/route.js"));
  // El vínculo va por los campos de id de CambioPendiente.
  assert.match(s, /where: \{ turnoDestinoId: turnoId \}/);
  // El de origen ya no es `findUnique`: desde que el sobre se publica al cortar,
  // un turno que canceló un corte y volvió a cortar tiene además el sobre
  // CANCELADO del primer intento. Se busca el VIGENTE, y sigue siendo por id.
  assert.match(s, /where: \{ turnoOrigenId: turnoId, estado: \{ not: "CANCELADO" \} \}/);
  // Y no se busca por total ni por rango de fechas.
  assert.doesNotMatch(s, /cambioPendiente\.findFirst\(\{\s*where:\s*\{\s*total:/);
  assert.doesNotMatch(s, /cambioPendiente\.findFirst\(\{\s*where:\s*\{\s*dejadoEn:/);
});

test("22. no se reactivan los campos viejos de fondo en ninguna escritura", () => {
  const VIEJOS = ["fondoSugeridoApertura", "diferenciaFondoApertura", "fondoOrigenTurnoId", "fondoConsumidoEnTurnoId"];
  const ESCRITURAS = [
    "app/api/pos-ventas/cierres/[token]/confirmar/route.js",
    "app/api/pos-ventas/turnos/abrir-con-cambio/route.js",
    "app/api/pos-ventas/turnos/abrir-sin-cambio/route.js",
  ];
  for (const f of ESCRITURAS) {
    const s = sinComentarios(fuente(f));
    for (const campo of VIEJOS) {
      assert.ok(!s.includes(campo), `${f} escribe ${campo}`);
    }
  }
});

// ── Terminología: "cambio", no "fondo" ─────────────────────────────────────
//
// El circuito habla de CAMBIO —los billetes que quedan para dar vuelto— y no de
// "fondo". El nombre interno de la columna sigue siendo `fondoDejadoCierre`, que
// no se toca; lo que cambia es lo que lee la persona.

test("27. el comprobante Z no muestra 'Fondo' a la persona", () => {
  const f = "components/turnos/imprimirZReport.js";
  const codigo = sinComentarios(fuente(f));
  // Los nombres internos (`fondoDejadoCierre` y compañía) sí pueden estar: lo
  // que no puede es un rótulo con "Fondo" seguido de espacio.
  const rotulos = codigo.match(/["'>]\s*Fondo [^"'<]{2,40}/g) || [];
  assert.deepEqual(rotulos, [], `${f} muestra: ${rotulos.join(" | ")}`);
});
