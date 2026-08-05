// PROCESOS DE CAJA PENDIENTES — pruebas de la forma y de las reglas del aviso.
//
// Lo que se prueba acá es lo que el 2026-08-04 falló en producción: con un
// retiro a medio contar, el cierre se rechazaba bien pero la pantalla no tenía
// con qué explicarlo. El aviso depende de que el rechazo VIAJE con el proceso
// bloqueante, así que eso es lo que se verifica: forma completa, quién puede
// cancelarse y a dónde lleva cada botón.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TIPO_PROCESO,
  TITULO_PROCESO,
  TEXTO_PROCESO,
  ACCION_CONTINUAR,
  ACCION_CANCELAR,
  ACCION_VOLVER,
  CONFIRMAR_CANCELAR,
  EXITO_CANCELAR,
  CAMBIO_YA_TOMADO,
  MOTIVO_CANCELADO_DESDE_AVISO,
  puedeCancelarCierre,
  puedeCancelarRetiro,
  procesoPendienteDeRetiro,
  procesoPendienteDeCierre,
  rutaProceso,
  rutaCancelar,
} from "./procesoPendiente.js";

const RETIRO = {
  token: "tok-retiro",
  estado: "PREPARANDO",
  corteEn: new Date("2026-08-05T02:39:19.092Z"),
  totalCambio: 6000,
  efectivoRetiradoEsperado: 48000,
  iniciadoPorOperadorId: 3,
};

const CIERRE = {
  token: "tok-cierre",
  estado: "PREPARANDO",
  corteEn: new Date("2026-08-05T02:46:20.798Z"),
  totalCambio: 5500,
  efectivoRetiradoEsperado: 218500,
  iniciadoPorOperadorId: 3,
};

// ── Textos ─────────────────────────────────────────────────────────────────

test("1. el título del retiro es el pedido", () => {
  assert.equal(TITULO_PROCESO.RETIRO, "Retiro de recaudación pendiente");
});

test("2. el título del cierre es el pedido", () => {
  assert.equal(TITULO_PROCESO.CIERRE, "Cierre de caja pendiente");
});

test("3. el texto del retiro nombra las dos salidas", () => {
  assert.match(TEXTO_PROCESO.RETIRO, /terminar o cancelar el proceso pendiente/);
  assert.match(TEXTO_PROCESO.RETIRO, /Ya separaste el cambio e iniciaste un retiro/);
});

test("4. el texto del cierre manda a continuarlo", () => {
  assert.match(TEXTO_PROCESO.CIERRE, /Continuá ese cierre/);
});

test("5. las tres acciones tienen nombre", () => {
  assert.equal(ACCION_CONTINUAR.RETIRO, "Continuar retiro");
  assert.equal(ACCION_CONTINUAR.CIERRE, "Continuar cierre");
  assert.equal(ACCION_CANCELAR.RETIRO, "Cancelar retiro");
  assert.equal(ACCION_CANCELAR.CIERRE, "Cancelar cierre");
  assert.equal(ACCION_VOLVER, "Volver al POS");
});

test("6. la confirmación del retiro promete que no sale plata", () => {
  assert.match(CONFIRMAR_CANCELAR.RETIRO, /No se registrará ninguna salida de dinero/);
  assert.match(CONFIRMAR_CANCELAR.RETIRO, /la caja seguirá abierta/);
});

test("7. el éxito del retiro dice que la caja sigue viva", () => {
  assert.equal(EXITO_CANCELAR.RETIRO, "Retiro cancelado. La caja sigue operativa.");
});

test("8. hay un texto para el cambio ya tomado", () => {
  assert.match(CAMBIO_YA_TOMADO, /ya fue tomado por el siguiente operador/);
  assert.match(CAMBIO_YA_TOMADO, /debe terminarse/);
});

test("9. ningún texto del aviso queda vacío", () => {
  for (const t of [
    ...Object.values(TITULO_PROCESO), ...Object.values(TEXTO_PROCESO),
    ...Object.values(ACCION_CONTINUAR), ...Object.values(ACCION_CANCELAR),
    ...Object.values(CONFIRMAR_CANCELAR), ...Object.values(EXITO_CANCELAR),
    ACCION_VOLVER, CAMBIO_YA_TOMADO, MOTIVO_CANCELADO_DESDE_AVISO,
  ]) {
    assert.equal(typeof t, "string");
    assert.ok(t.trim().length > 0);
  }
});

// ── Quién puede cancelarse ─────────────────────────────────────────────────

test("10. un retiro PREPARANDO se puede cancelar", () => {
  assert.equal(puedeCancelarRetiro(RETIRO), true);
});

test("11. un retiro confirmado ya no", () => {
  assert.equal(puedeCancelarRetiro({ ...RETIRO, estado: "CONFIRMADO" }), false);
});

test("12. un retiro cancelado ya no", () => {
  assert.equal(puedeCancelarRetiro({ ...RETIRO, estado: "CANCELADO" }), false);
});

test("13. cambio DISPONIBLE y sin destino: el cierre se cancela", () => {
  assert.equal(puedeCancelarCierre({ estado: "DISPONIBLE", turnoDestinoId: null }), true);
});

test("14. cambio RESERVADO: no se cancela", () => {
  assert.equal(puedeCancelarCierre({ estado: "RESERVADO", turnoDestinoId: null }), false);
});

test("15. cambio RECIBIDO: no se cancela", () => {
  assert.equal(puedeCancelarCierre({ estado: "RECIBIDO", turnoDestinoId: 200 }), false);
});

test("16. DISPONIBLE pero con turno destino: no se cancela", () => {
  // Estado y destino se miran juntos a propósito: una reserva a medio escribir
  // no puede abrir la puerta a deshacer el cierre.
  assert.equal(puedeCancelarCierre({ estado: "DISPONIBLE", turnoDestinoId: 200 }), false);
});

test("17. sin sobre, el helper de cambio dice que no", () => {
  assert.equal(puedeCancelarCierre(null), false);
});

// ── La forma que viaja ─────────────────────────────────────────────────────

test("18. el retiro pendiente lleva tipo, token y puedeCancelar", () => {
  const p = procesoPendienteDeRetiro(RETIRO, { operadorNombre: "Ana" });
  assert.equal(p.tipo, TIPO_PROCESO.RETIRO);
  assert.equal(p.token, "tok-retiro");
  assert.equal(p.puedeCancelar, true);
});

test("19. el retiro pendiente lleva las cuatro cifras que muestra el cartel", () => {
  const p = procesoPendienteDeRetiro(RETIRO, { operadorNombre: "Ana" });
  assert.equal(p.corteEn, RETIRO.corteEn);
  assert.equal(p.totalCambio, 6000);
  assert.equal(p.efectivoRetiradoEsperado, 48000);
  assert.equal(p.operadorNombre, "Ana");
});

test("20. los Decimal de Prisma se normalizan a número", () => {
  // Prisma devuelve Decimal; el cartel formatea con toLocaleString y un objeto
  // se imprimiría como [object Object].
  const p = procesoPendienteDeRetiro({
    ...RETIRO,
    totalCambio: { toString: () => "6000.00" },
    efectivoRetiradoEsperado: { toString: () => "48000.00" },
  });
  assert.equal(typeof p.totalCambio, "number");
  assert.equal(p.totalCambio, 6000);
  assert.equal(p.efectivoRetiradoEsperado, 48000);
});

test("21. sin token no hay proceso: null", () => {
  assert.equal(procesoPendienteDeRetiro({ estado: "PREPARANDO" }), null);
  assert.equal(procesoPendienteDeCierre({ estado: "PREPARANDO" }, null), null);
  assert.equal(procesoPendienteDeRetiro(null), null);
  assert.equal(procesoPendienteDeCierre(null, null), null);
});

test("22. el cierre con cambio DISPONIBLE viaja cancelable y sin motivo", () => {
  const p = procesoPendienteDeCierre(CIERRE, { estado: "DISPONIBLE", turnoDestinoId: null });
  assert.equal(p.tipo, TIPO_PROCESO.CIERRE);
  assert.equal(p.puedeCancelar, true);
  assert.equal(p.motivoNoCancelable, null);
});

test("23. el cierre con cambio RESERVADO viaja bloqueado y CON motivo", () => {
  const p = procesoPendienteDeCierre(CIERRE, { estado: "RESERVADO", turnoDestinoId: null });
  assert.equal(p.puedeCancelar, false);
  assert.equal(p.motivoNoCancelable, CAMBIO_YA_TOMADO);
});

test("24. el cierre con cambio RECIBIDO viaja bloqueado y CON motivo", () => {
  const p = procesoPendienteDeCierre(CIERRE, { estado: "RECIBIDO", turnoDestinoId: 200 });
  assert.equal(p.puedeCancelar, false);
  assert.equal(p.motivoNoCancelable, CAMBIO_YA_TOMADO);
});

test("25. un cierre del flujo viejo, sin sobre, sigue siendo cancelable", () => {
  // Los cortes tomados antes del 2026-08-05 publicaban el sobre recién al
  // confirmar. Quedaron dos así en producción: si el aviso los diera por no
  // cancelables, no habría forma de deshacerlos desde la pantalla.
  const p = procesoPendienteDeCierre({ ...CIERRE, totalCambio: null, efectivoRetiradoEsperado: null }, null);
  assert.equal(p.puedeCancelar, true);
  assert.equal(p.totalCambio, null);
  assert.equal(p.efectivoRetiradoEsperado, null);
});

test("26. el retiro nunca queda bloqueado por un sobre: no publica ninguno", () => {
  assert.equal(procesoPendienteDeRetiro(RETIRO).motivoNoCancelable, null);
});

// ── Navegación ─────────────────────────────────────────────────────────────

test("27. continuar un retiro va a su token, no a /nuevo", () => {
  const r = rutaProceso(TIPO_PROCESO.RETIRO, "tok-retiro");
  assert.equal(r, "/modulos/pos-ventas/retiros/tok-retiro");
  assert.ok(!r.includes("/nuevo"));
});

test("28. continuar un cierre va a su token, no a /iniciar", () => {
  const r = rutaProceso(TIPO_PROCESO.CIERRE, "tok-cierre");
  assert.equal(r, "/modulos/pos-ventas/cierres/tok-cierre");
  assert.ok(!r.includes("/iniciar"));
});

test("29. la marca de pestaña nueva se conserva", () => {
  assert.equal(
    rutaProceso(TIPO_PROCESO.RETIRO, "tok-retiro", true),
    "/modulos/pos-ventas/retiros/tok-retiro?pestana=nueva"
  );
});

test("30. el token se escapa: no se arma la URL a mano", () => {
  assert.equal(
    rutaProceso(TIPO_PROCESO.CIERRE, "a/b c"),
    "/modulos/pos-ventas/cierres/a%2Fb%20c"
  );
});

test("31. sin token no hay ruta", () => {
  assert.equal(rutaProceso(TIPO_PROCESO.RETIRO, null), null);
  assert.equal(rutaCancelar(TIPO_PROCESO.CIERRE, ""), null);
});

test("32. cancelar usa los endpoints que ya existían", () => {
  assert.equal(
    rutaCancelar(TIPO_PROCESO.RETIRO, "tok-retiro"),
    "/api/pos-ventas/retiros/tok-retiro/cancelar"
  );
  assert.equal(
    rutaCancelar(TIPO_PROCESO.CIERRE, "tok-cierre"),
    "/api/pos-ventas/cierres/tok-cierre/cancelar"
  );
});

test("33. el motivo grabado explica de dónde salió la cancelación", () => {
  assert.match(MOTIVO_CANCELADO_DESDE_AVISO, /aviso de proceso pendiente/);
  // Los endpoints de cancelación rechazan un motivo vacío.
  assert.ok(MOTIVO_CANCELADO_DESDE_AVISO.trim().length > 0);
});

// ── Lo que NO debe viajar ──────────────────────────────────────────────────

test("34. el proceso no lleva datos de otro local ni ids internos", () => {
  const p = procesoPendienteDeCierre(CIERRE, { estado: "DISPONIBLE", turnoDestinoId: null }, {
    operadorNombre: "Ana",
  });
  const claves = Object.keys(p).sort();
  assert.deepEqual(claves, [
    "corteEn", "efectivoRetiradoEsperado", "motivoNoCancelable", "operadorNombre",
    "puedeCancelar", "tipo", "token", "totalCambio",
  ]);
  // Ni localId, ni turnoId, ni el id de la fila.
  for (const prohibida of ["localId", "turnoId", "id", "grupoId", "idempotencyKey"]) {
    assert.ok(!(prohibida in p), `no debe viajar ${prohibida}`);
  }
});

test("35. el retiro tampoco expone ids internos", () => {
  const p = procesoPendienteDeRetiro(RETIRO);
  for (const prohibida of ["localId", "turnoId", "id", "iniciadoPorOperadorId", "idempotencyKey"]) {
    assert.ok(!(prohibida in p), `no debe viajar ${prohibida}`);
  }
});
