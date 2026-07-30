// Tests de las reglas de recepción de transferencias (Etapa A urgente).
//
// Cubren los dos defectos corregidos —`recibido = 0` tratado como recepción
// completa por usar truthiness, y `recibido > enviado` sin tope— más la
// eliminación del fallback silencioso `unidadEnviada || "BULTO"`.
//
// Los casos que dependen de Prisma (que la venta no cambie, que la validación
// ocurra antes de tocar stock, el rollback) se verifican sobre el CÓDIGO FUENTE
// de las rutas: son invariantes estructurales, y afirmarlas acá evita que una
// edición futura las rompa en silencio. Las aserciones de fuente se hacen sobre
// el código SIN COMENTARIOS, para no validar contra un texto explicativo.
//
// Correr con: node --test lib/transferencias/recepcion.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ERRORES_RECEPCION,
  aMilesimas,
  resolverRecibido,
  resolverUnidadEnviada,
  aUnidadesFisicas,
  validarMotivoDiferencia,
  validarDetalleRecepcion,
  statusRecepcion,
  mensajeRecepcion,
} from "./recepcion.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..");

const leerSinComentarios = (rel) =>
  fs
    .readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const CONFIRMAR = "app/api/transferencias/confirmar-recepcion/route.js";
const GUARDAR = "app/api/transferencias/guardar-recepcion/route.js";
const DETALLE_API = "app/api/transferencias/detalle/route.js";
const PANTALLA = "app/modulos/transferencias/[id]/page.jsx";

/**
 * Réplica de la hidratación de la pantalla de recepción (page.jsx). La pantalla
 * es React y no se puede montar acá, así que se replica la EXPRESIÓN y además se
 * afirma sobre el fuente que sigue siendo esa (tests 21b/21c).
 */
const hidratarRecibido = (d) =>
  d.cantidadRecibida == null ? d.cantidadEnviada : d.cantidadRecibida;

const detalleBase = (extra = {}) => ({
  cantidad: 20,
  unidadEnviada: "UNIDAD",
  motivoPrincipal: null,
  motivoDetalle: null,
  ...extra,
});

// ── 1-2. Sin registrar recepción → llegó todo ────────────────────────────────

test("1. recibido null → recepción completa", () => {
  const r = resolverRecibido({ recibido: null, enviada: 20 });
  assert.equal(r.ok, true);
  assert.equal(r.recibida, 20);
  assert.equal(r.hayDiferencia, false);
});

test("2. recibido undefined → recepción completa", () => {
  const r = resolverRecibido({ recibido: undefined, enviada: 20 });
  assert.equal(r.ok, true);
  assert.equal(r.recibida, 20);
  assert.equal(r.hayDiferencia, false);
});

// ── 3-5. El cero es un valor legítimo (bug 1) ────────────────────────────────

test("3. recibido 0 → el destino suma 0, NO el total enviado", () => {
  const plan = validarDetalleRecepcion({
    detalle: detalleBase({ recibido: 0, motivoPrincipal: "Faltante" }),
    factorPack: 1,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.recibida, 0);
  assert.equal(plan.recibidaUnidades, 0, "no debe acreditarse nada al destino");
  assert.equal(plan.enviadaUnidades, 20, "el tránsito igual se limpia por lo enviado");
});

test("3b. REGRESIÓN del bug: la lógica vieja con truthiness daba 20 para recibido=0", () => {
  const enviada = 20;
  const recibidoViejo = 0;
  const viejo = recibidoViejo && Number(recibidoViejo) > 0 ? Number(recibidoViejo) : enviada;
  assert.equal(viejo, 20, "así se comportaba antes: 0 se convertía en recepción total");
  const nuevo = resolverRecibido({ recibido: 0, enviada });
  assert.equal(nuevo.recibida, 0, "ahora 0 significa 0");
});

test("4. recibido 0 → hay diferencia", () => {
  const r = resolverRecibido({ recibido: 0, enviada: 20 });
  assert.equal(r.hayDiferencia, true);
});

test("5. recibido 0 → exige motivo", () => {
  const sinMotivo = validarDetalleRecepcion({
    detalle: detalleBase({ recibido: 0 }),
    factorPack: 1,
  });
  assert.equal(sinMotivo.ok, false);
  assert.equal(sinMotivo.error, ERRORES_RECEPCION.FALTA_MOTIVO);

  const conMotivo = validarDetalleRecepcion({
    detalle: detalleBase({ recibido: 0, motivoPrincipal: "Rotura" }),
    factorPack: 1,
  });
  assert.equal(conMotivo.ok, true);
});

test("5b. motivo 'Otro' sin detalle → rechazado", () => {
  const r = validarDetalleRecepcion({
    detalle: detalleBase({ recibido: 5, motivoPrincipal: "Otro", motivoDetalle: "   " }),
    factorPack: 1,
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, ERRORES_RECEPCION.FALTA_DETALLE_MOTIVO);
});

// ── 6-7. Límites (bug 2) ─────────────────────────────────────────────────────

test("6. recibido negativo → CANTIDAD_RECIBIDA_INVALIDA (400)", () => {
  const r = resolverRecibido({ recibido: -1, enviada: 20 });
  assert.equal(r.ok, false);
  assert.equal(r.error, ERRORES_RECEPCION.RECIBIDA_INVALIDA);
  assert.equal(statusRecepcion(r.error), 400);
});

test("7. recibido > enviado → CANTIDAD_RECIBIDA_SUPERA_ENVIADA (400)", () => {
  const r = resolverRecibido({ recibido: 21, enviada: 20 });
  assert.equal(r.ok, false);
  assert.equal(r.error, ERRORES_RECEPCION.RECIBIDA_SUPERA_ENVIADA);
  assert.equal(statusRecepcion(r.error), 400);
  assert.match(mensajeRecepcion(r.error), /no puede superar la cantidad enviada/i);
});

test("7b. no se recorta al máximo ni se redondea en silencio", () => {
  const r = resolverRecibido({ recibido: 100, enviada: 20 });
  assert.equal(r.ok, false, "debe fallar, no devolver 20");
  assert.equal(r.recibida, undefined);
});

test("7c. valores no numéricos → inválido, no NaN", () => {
  for (const malo of ["abc", "1.9255", {}, [], true, Infinity, NaN, "1e3"]) {
    const r = resolverRecibido({ recibido: malo, enviada: 20 });
    assert.equal(r.ok, false, `debería rechazar ${JSON.stringify(String(malo))}`);
  }
});

// ── 8-10. Recepción normal y parcial ─────────────────────────────────────────

test("8. recibido igual a enviado → recepción normal, sin diferencia", () => {
  const plan = validarDetalleRecepcion({
    detalle: detalleBase({ recibido: 20 }),
    factorPack: 1,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.hayDiferencia, false);
  assert.equal(plan.recibidaUnidades, 20);
});

test("9. recibido < enviado → el destino recibe SOLO esa cantidad", () => {
  const plan = validarDetalleRecepcion({
    detalle: detalleBase({ recibido: 18, motivoPrincipal: "Faltante" }),
    factorPack: 1,
  });
  assert.equal(plan.recibidaUnidades, 18);
  assert.equal(plan.hayDiferencia, true);
});

test("10. recibido < enviado → el tránsito del origen baja por lo ENVIADO", () => {
  const plan = validarDetalleRecepcion({
    detalle: detalleBase({ recibido: 18, motivoPrincipal: "Faltante" }),
    factorPack: 1,
  });
  assert.equal(plan.enviadaUnidades, 20, "la mercadería salió: el tránsito queda en cero");
  assert.notEqual(plan.enviadaUnidades, plan.recibidaUnidades);
});

// ── 11-12. La recepción no toca lo comercial ─────────────────────────────────

test("11. la recepción no modifica Venta ni VentaDetalle", () => {
  const src = leerSinComentarios(CONFIRMAR);
  for (const prohibido of ["venta.update", "ventaDetalle", "venta.create", "ventaPago"]) {
    assert.ok(!src.includes(prohibido), `confirmar-recepcion no debe tocar ${prohibido}`);
  }
});

test("12. la recepción no modifica MovimientoCuenta, caja ni puntos", () => {
  const src = leerSinComentarios(CONFIRMAR);
  for (const prohibido of ["movimientoCuenta", "clientePuntoMovimiento", "turno.update", "caja"]) {
    assert.ok(!src.includes(prohibido), `confirmar-recepcion no debe tocar ${prohibido}`);
  }
});

// ── 13. unidadEnviada ausente ────────────────────────────────────────────────

test("13. unidadEnviada null → UNIDAD_ENVIADA_AUSENTE con status 409", () => {
  for (const vacio of [null, undefined, ""]) {
    const r = resolverUnidadEnviada(vacio);
    assert.equal(r.ok, false);
    assert.equal(r.error, ERRORES_RECEPCION.UNIDAD_AUSENTE);
    assert.equal(statusRecepcion(r.error), 409);
  }
});

test("13b. sin unidadEnviada el plan falla antes de calcular cantidades", () => {
  const plan = validarDetalleRecepcion({
    detalle: detalleBase({ unidadEnviada: null, recibido: 5 }),
    factorPack: 28,
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.error, ERRORES_RECEPCION.UNIDAD_AUSENTE);
  assert.equal(plan.recibidaUnidades, undefined, "no se calcula nada sin unidad");
});

test("13c. ya no existe el fallback silencioso a BULTO", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(
    !/unidadEnviada\s*\|\|\s*["']BULTO["']/.test(src),
    "el default `unidadEnviada || \"BULTO\"` multiplicaba por factor_pack a ciegas"
  );
});

test("13d. la validación corre ANTES de abrir la transacción (no se toca stock)", () => {
  const src = leerSinComentarios(CONFIRMAR);
  const posValidacion = src.indexOf("validarDetalleRecepcion");
  const posTransaccion = src.indexOf("prisma.$transaction");
  assert.ok(posValidacion > 0 && posTransaccion > 0);
  assert.ok(
    posValidacion < posTransaccion,
    "validar después de abrir la transacción dejaría el estado en Confirmando"
  );
});

test("13e. unidad desconocida tampoco pasa", () => {
  const r = resolverUnidadEnviada("CAJON");
  assert.equal(r.ok, false);
  assert.equal(r.error, ERRORES_RECEPCION.UNIDAD_DESCONOCIDA);
});

// ── 14-15. Conversión física, una sola vez ───────────────────────────────────

test("14. unidadEnviada UNIDAD → identidad (no multiplica)", () => {
  assert.equal(aUnidadesFisicas({ cantidad: 20, unidad: "UNIDAD", factorPack: 28 }), 20);
  const plan = validarDetalleRecepcion({
    detalle: detalleBase({ cantidad: 20, recibido: 20, unidadEnviada: "UNIDAD" }),
    factorPack: 28,
  });
  assert.equal(plan.recibidaUnidades, 20, "el mapper ya normalizó: no se vuelve a convertir");
});

test("15. unidadEnviada BULTO → multiplica UNA sola vez", () => {
  assert.equal(aUnidadesFisicas({ cantidad: 2, unidad: "BULTO", factorPack: 20 }), 40);
  const plan = validarDetalleRecepcion({
    detalle: detalleBase({ cantidad: 2, recibido: 2, unidadEnviada: "BULTO" }),
    factorPack: 20,
  });
  assert.equal(plan.recibidaUnidades, 40);
  assert.equal(plan.enviadaUnidades, 40);
  assert.notEqual(plan.recibidaUnidades, 800, "800 sería doble conversión");
});

test("15b. BULTO con factor 1 no multiplica", () => {
  assert.equal(aUnidadesFisicas({ cantidad: 5, unidad: "BULTO", factorPack: 1 }), 5);
});

// ── 16. Precisión decimal ────────────────────────────────────────────────────

test("16. fiambre 1.925 conserva los tres decimales", () => {
  assert.equal(aMilesimas(1.925), 1925);
  const plan = validarDetalleRecepcion({
    detalle: detalleBase({ cantidad: 1.925, recibido: 1.925, unidadEnviada: "UNIDAD" }),
    factorPack: 1,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.recibida, 1.925);
  assert.equal(plan.hayDiferencia, false, "1.925 == 1.925 debe comparar exacto");
});

test("16b. una diferencia de una milésima se detecta", () => {
  const r = resolverRecibido({ recibido: 1.924, enviada: 1.925 });
  assert.equal(r.ok, true);
  assert.equal(r.hayDiferencia, true);
});

test("16c. un cuarto decimal se rechaza (no cabe en Decimal(12,3))", () => {
  const r = resolverRecibido({ recibido: "1.9251", enviada: 20 });
  assert.equal(r.ok, false);
});

test("16d. acepta Decimal de Prisma (objeto con toString)", () => {
  const decimal = { toString: () => "1.925" };
  const r = resolverRecibido({ recibido: decimal, enviada: decimal });
  assert.equal(r.ok, true);
  assert.equal(r.recibida, 1.925);
  assert.equal(r.hayDiferencia, false);
});

// ── 17-20. Invariantes del flujo ─────────────────────────────────────────────

test("17. la doble confirmación sigue bloqueada", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(src.includes('estado === "Recibida"'), "sigue el guard de estado");
  assert.ok(src.includes("ALREADY_CONFIRMED"), "sigue la barrera atómica por updateMany");
  assert.ok(/estado:\s*\{\s*in:\s*\["Enviada",\s*"Recibiendo"\]\s*\}/.test(src));
});

test("18. la transferencia manual (BULTO) sigue funcionando igual", () => {
  const plan = validarDetalleRecepcion({
    detalle: detalleBase({ cantidad: 2, recibido: null, unidadEnviada: "BULTO" }),
    factorPack: 20,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.recibidaUnidades, 40, "2 bultos de 20 → 40 unidades, como antes");
  assert.equal(plan.hayDiferencia, false);
});

test("19. la transferencia de venta interna (UNIDAD, factor 1) sigue funcionando", () => {
  const plan = validarDetalleRecepcion({
    detalle: detalleBase({ cantidad: 10, recibido: null, unidadEnviada: "UNIDAD" }),
    factorPack: 28,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.recibidaUnidades, 10, "el caso real de Venta 1324 / Transferencia 3");
  assert.equal(plan.enviadaUnidades, 10);
});

test("20. todo el movimiento sigue dentro de una transacción única", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.equal(
    (src.match(/prisma\.\$transaction/g) || []).length,
    1,
    "una sola transacción: si un detalle falla, se revierte todo"
  );
  assert.ok(src.includes("stockLocal.upsert"), "el destino se suma dentro de la transacción");
  assert.ok(src.includes("stockLocal.updateMany"), "el tránsito se limpia dentro de la transacción");
});

test("20b. guardar-recepcion valida la cantidad enviada contra la BASE, no contra el request", () => {
  const src = leerSinComentarios(GUARDAR);
  assert.ok(
    !/it\.enviado\s*\?\?\s*it\.cantidad/.test(src),
    "leer la cantidad enviada del request permitía saltear el tope"
  );
  assert.ok(
    src.includes("transferenciaDetalle.findMany"),
    "ahora la cantidad enviada se lee de la base"
  );
  assert.ok(src.includes("validarDetalleRecepcion"));
});

test("20c. guardar-recepcion valida todos los items antes de escribir alguno", () => {
  const src = leerSinComentarios(GUARDAR);
  const posValidacion = src.indexOf("validarDetalleRecepcion");
  const posEscritura = src.indexOf("transferenciaDetalle.update");
  assert.ok(posValidacion > 0 && posEscritura > 0);
  assert.ok(posValidacion < posEscritura);
});

// ── 21. Hidratación de la pantalla: el 0 sobrevive a la recarga ──────────────

test("21. recibido 0 se conserva al recargar la pantalla (no vuelve a ser el enviado)", () => {
  assert.equal(hidratarRecibido({ cantidadEnviada: 20, cantidadRecibida: 0 }), 0);
});

test("21a. sin recepción cargada (null) se propone la cantidad enviada", () => {
  assert.equal(hidratarRecibido({ cantidadEnviada: 20, cantidadRecibida: null }), 20);
  assert.equal(hidratarRecibido({ cantidadEnviada: 20, cantidadRecibida: undefined }), 20);
});

test("21a2. un recibido > 0 se muestra tal cual", () => {
  assert.equal(hidratarRecibido({ cantidadEnviada: 20, cantidadRecibida: 18 }), 18);
  assert.equal(hidratarRecibido({ cantidadEnviada: 1.925, cantidadRecibida: 1.925 }), 1.925);
});

test("21b. la pantalla usa `== null`, no truthiness", () => {
  const src = leerSinComentarios(PANTALLA);
  assert.ok(
    !/cantidadRecibida\s*&&\s*d?\.?cantidadRecibida\s*>\s*0/.test(src),
    "la truthiness hacía que un 0 guardado reapareciera como el total enviado"
  );
  assert.ok(
    /cantidadRecibida\s*==\s*null\s*\?\s*d\.cantidadEnviada\s*:\s*d\.cantidadRecibida/.test(src),
    "debe distinguir explícitamente null de 0"
  );
});

test("21c. la API de detalle preserva el null en vez de colapsarlo a 0", () => {
  const src = leerSinComentarios(DETALLE_API);
  assert.ok(
    /const cantidadRecibida\s*=\s*d\.recibido\s*==\s*null\s*\?\s*null\s*:\s*toNumber\(d\.recibido\)/.test(src),
    "sin esto la pantalla no puede distinguir 'no cargado' de 'no llegó nada'"
  );
  assert.ok(
    !/cantidadRecibida\s*>\s*0\s*\?\s*cantidadRecibida\s*:\s*cantidadEnviada/.test(src),
    "el subtotal ya no puede decidir por truthiness"
  );
  assert.ok(src.includes("itemsRecibidos += cantidadRecibida ?? 0"));
});

test("21d. string \"0\" se interpreta como 0, no como vacío ni como enviado", () => {
  const r = resolverRecibido({ recibido: "0", enviada: 20 });
  assert.equal(r.ok, true);
  assert.equal(r.recibida, 0);
  assert.equal(r.hayDiferencia, true);
});

test('21e. "" NO se transforma en 0 ni en la cantidad enviada: se rechaza', () => {
  const r = resolverRecibido({ recibido: "", enviada: 20 });
  assert.equal(r.ok, false, "vacío significa 'no completado', no 'no llegó nada'");
  assert.equal(r.error, ERRORES_RECEPCION.RECIBIDA_INVALIDA);
  assert.equal(statusRecepcion(r.error), 400);
  assert.notEqual(r.recibida, 0);
  assert.notEqual(r.recibida, 20);
});

test('21f. "   " (solo espacios) tampoco pasa', () => {
  const r = resolverRecibido({ recibido: "   ", enviada: 20 });
  assert.equal(r.ok, false);
});

test("21g. las transferencias ya recibidas no cambian de comportamiento", () => {
  // Fila cerrada: recibido persistido igual al enviado.
  assert.equal(hidratarRecibido({ cantidadEnviada: 20, cantidadRecibida: 20 }), 20);
  const plan = validarDetalleRecepcion({
    detalle: detalleBase({ cantidad: 20, recibido: 20 }),
    factorPack: 1,
  });
  assert.equal(plan.hayDiferencia, false);
  assert.equal(plan.recibidaUnidades, 20);
});

test("20d. el faltante NO se devuelve automáticamente al origen (decisión de Etapa A)", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(
    !/cantidad:\s*\{\s*increment:[^}]*enviadaUnidades\s*-\s*recibidaUnidades/.test(src),
    "la reposición del faltante es Etapa B, todavía no diseñada"
  );
  assert.ok(src.includes("enTransito: { decrement: enviadaUnidades }"));
});
