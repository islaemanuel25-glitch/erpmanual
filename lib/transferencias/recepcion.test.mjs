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
  calcularDevolucionUnidades,
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
  assert.ok(
    src.includes("stockLocal.update("),
    "el origen (tránsito + devolución) se ajusta dentro de la transacción"
  );
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

test("20d. el faltante SÍ se devuelve automáticamente al origen (regla vigente)", () => {
  // Este test afirmaba lo contrario mientras la devolución era "Etapa B". La
  // regla cambió: lo que no llega vuelve al stock del origen en la misma
  // recepción. Se conserva el número 20d para que quede rastro de la inversión.
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(
    /cantidad:\s*\{\s*increment:\s*devolucionUnidades\s*\}/.test(src),
    "la diferencia tiene que volver a origen.cantidad"
  );
  assert.ok(
    /enTransito:\s*\{\s*decrement:\s*enviadaUnidades\s*\}/.test(src),
    "el tránsito se sigue limpiando por lo ENVIADO"
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 22. DEVOLUCIÓN DE LA DIFERENCIA AL ORIGEN
//
// La mercadería que sale del origen y no llega al destino tiene que volver al
// stock del origen. Antes desaparecía del inventario del grupo: el origen se
// descontaba por lo enviado, el destino se acreditaba por lo recibido y nadie se
// quedaba con la diferencia.
//
// Los tests puros (22.1-22.13) verifican la aritmética; los estructurales
// (22.14-22.31) afirman sobre el fuente de la ruta, porque el movimiento de
// stock depende de Prisma y no se puede ejecutar acá.
// ═════════════════════════════════════════════════════════════════════════════

const planDe = (extra, factorPack = 1) =>
  validarDetalleRecepcion({ detalle: detalleBase(extra), factorPack });

// ── 22.1-22.4. Los cuatro casos de la regla ──────────────────────────────────

test("22.1. recepción completa → devolución 0", () => {
  const plan = planDe({ cantidad: 20, recibido: 20 });
  assert.equal(plan.ok, true);
  assert.equal(plan.devolucionUnidades, 0, "nada que devolver");
  assert.equal(plan.recibidaUnidades, 20);
  assert.equal(plan.enviadaUnidades, 20);
});

test("22.2. recepción parcial 20/18 → devolución 2", () => {
  const plan = planDe({ cantidad: 20, recibido: 18, motivoPrincipal: "Faltante" });
  assert.equal(plan.ok, true);
  assert.equal(plan.devolucionUnidades, 2);
  assert.equal(plan.recibidaUnidades, 18, "el destino recibe SOLO lo corregido");
  assert.equal(plan.enviadaUnidades, 20, "el tránsito baja por lo enviado");
  // El neto del origen: perdió 20 al enviar/vender, recupera 2 → pierde 18.
  assert.equal(plan.enviadaUnidades - plan.devolucionUnidades, plan.recibidaUnidades);
});

test("22.3. recibido 0 → se devuelve TODO lo enviado (0 no es recepción completa)", () => {
  const plan = planDe({ cantidad: 20, recibido: 0, motivoPrincipal: "Faltante" });
  assert.equal(plan.ok, true);
  assert.equal(plan.devolucionUnidades, 20);
  assert.equal(plan.recibidaUnidades, 0, "el destino no gana nada");
});

test("22.4. decimales: 20.500 - 18.250 = 2.250 exacto", () => {
  const plan = planDe({ cantidad: 20.5, recibido: 18.25, motivoPrincipal: "Faltante" });
  assert.equal(plan.ok, true);
  assert.equal(plan.devolucionUnidades, 2.25);
  // La igualdad estricta es el punto: con resta flotante esto puede no dar 2.25.
  assert.equal(aMilesimas(plan.devolucionUnidades), 2250);
});

test("22.4b. la resta se hace en milésimas, no en punto flotante", () => {
  // 3 casos donde la resta directa deja residuo binario.
  for (const [env, rec, esperado] of [
    [0.3, 0.1, 0.2],
    [1.005, 1.004, 0.001],
    [10.1, 9.7, 0.4],
  ]) {
    const dev = calcularDevolucionUnidades({
      enviada: env,
      recibida: rec,
      unidad: "UNIDAD",
      factorPack: 1,
    });
    assert.equal(dev, esperado, `${env} - ${rec} debe dar ${esperado} exacto`);
    assert.equal(aMilesimas(dev) !== null, true, "el resultado cabe en Decimal(12,3)");
  }
});

// ── 22.5-22.7. Todo lo inválido se bloquea ANTES de calcular nada ────────────

test("22.5. recibido > enviado → bloqueado, sin devolución calculada", () => {
  const plan = planDe({ cantidad: 20, recibido: 21 });
  assert.equal(plan.ok, false);
  assert.equal(plan.error, ERRORES_RECEPCION.RECIBIDA_SUPERA_ENVIADA);
  assert.equal(plan.devolucionUnidades, undefined, "no se calcula nada si no valida");
  assert.equal(
    calcularDevolucionUnidades({ enviada: 20, recibida: 21, unidad: "UNIDAD", factorPack: 1 }),
    null,
    "el helper puro tampoco devuelve una diferencia negativa"
  );
});

test("22.6. recibido negativo → bloqueado", () => {
  const plan = planDe({ cantidad: 20, recibido: -1 });
  assert.equal(plan.ok, false);
  assert.equal(plan.error, ERRORES_RECEPCION.RECIBIDA_INVALIDA);
  assert.equal(plan.devolucionUnidades, undefined);
  assert.equal(
    calcularDevolucionUnidades({ enviada: 20, recibida: -1, unidad: "UNIDAD", factorPack: 1 }),
    null
  );
});

test("22.7. NaN, Infinity, strings, boolean, array y objeto → bloqueados", () => {
  for (const malo of [NaN, Infinity, -Infinity, "abc", "1e3", "1.9251", true, false, [], {}, "  "]) {
    const plan = planDe({ cantidad: 20, recibido: malo });
    assert.equal(plan.ok, false, `debería rechazar ${JSON.stringify(String(malo))}`);
    assert.equal(plan.devolucionUnidades, undefined);
    assert.equal(
      calcularDevolucionUnidades({ enviada: 20, recibida: malo, unidad: "UNIDAD", factorPack: 1 }),
      null,
      `el helper puro debería rechazar ${JSON.stringify(String(malo))}`
    );
  }
});

// ── 22.8-22.11. Escalas físicas ──────────────────────────────────────────────

test("22.8. varios detalles: cada uno calcula su propia diferencia", () => {
  const detalles = [
    { cantidad: 20, recibido: 18, motivoPrincipal: "Faltante" },
    { cantidad: 10, recibido: 10 },
    { cantidad: 5, recibido: 0, motivoPrincipal: "Rotura" },
  ];
  const devoluciones = detalles.map((d) => planDe(d).devolucionUnidades);
  assert.deepEqual(devoluciones, [2, 0, 5]);
});

test("22.9. UNIDAD: la devolución conserva la escala física", () => {
  const plan = planDe({ cantidad: 20, recibido: 18, unidadEnviada: "UNIDAD", motivoPrincipal: "F" }, 12);
  assert.equal(plan.devolucionUnidades, 2, "UNIDAD no multiplica por factor_pack");
});

test("22.10. BULTO factor 12: 2 enviados / 1 recibido → 12 unidades físicas", () => {
  const plan = planDe({ cantidad: 2, recibido: 1, unidadEnviada: "BULTO", motivoPrincipal: "F" }, 12);
  assert.equal(plan.enviadaUnidades, 24);
  assert.equal(plan.recibidaUnidades, 12);
  assert.equal(plan.devolucionUnidades, 12, "1 bulto de 12 son 12 unidades, no 1");
  assert.notEqual(plan.devolucionUnidades, 1, "devolver 1 sería confundir bultos con unidades");
});

test("22.10b. BULTO con decimales: (2.5 - 1.25) x 12 = 15 exacto", () => {
  const plan = planDe(
    { cantidad: 2.5, recibido: 1.25, unidadEnviada: "BULTO", motivoPrincipal: "F" },
    12
  );
  assert.equal(plan.devolucionUnidades, 15);
});

test("22.11. fiambre fijo: la devolución al origen va en PIEZAS, no en kg", () => {
  // Depósito cuenta piezas; el destino convierte a kg al recibir. La devolución
  // es la diferencia de PIEZAS: 3 enviadas, 2 recibidas → vuelve 1 pieza.
  const plan = planDe({ cantidad: 3, recibido: 2, unidadEnviada: "UNIDAD", motivoPrincipal: "F" });
  assert.equal(plan.devolucionUnidades, 1, "1 pieza, no los kg de esa pieza");

  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(
    /incrementoLocal\s*=\s*esFijo[\s\S]{0,120}piezasToKg\(recibida/.test(src),
    "el destino sigue convirtiendo a kg"
  );
  assert.ok(
    !/increment:\s*piezasToKg/.test(src),
    "la devolución al origen nunca puede pasar por piezasToKg"
  );
});

// ── 22.12-22.13. Las dos políticas se tratan igual ───────────────────────────

test("22.12. DESCONTAR_Y_TRANSITO: el origen queda con el neto de lo recibido", () => {
  // Manual, 2 bultos de 20: el envío hizo cantidad -= 40 y enTransito += 40.
  const plan = planDe({ cantidad: 2, recibido: 1, unidadEnviada: "BULTO", motivoPrincipal: "F" }, 20);
  const origenInicial = 100;
  const trasEnviar = origenInicial - plan.enviadaUnidades; // 60
  const trasRecibir = trasEnviar + plan.devolucionUnidades; // 80
  assert.equal(trasRecibir, origenInicial - plan.recibidaUnidades);
});

test("22.13. SOLO_TRANSITO: mismo neto, sin devolver dos veces", () => {
  // Venta interna: la Venta ya hizo cantidad -= 20; la transferencia solo sumó
  // tránsito. La recepción devuelve la diferencia UNA vez.
  const plan = planDe({ cantidad: 20, recibido: 18, motivoPrincipal: "Faltante" });
  const origenInicial = 100;
  const trasVender = origenInicial - plan.enviadaUnidades; // 80
  const trasRecibir = trasVender + plan.devolucionUnidades; // 82
  assert.equal(trasRecibir, 82);
  assert.equal(trasRecibir, origenInicial - plan.recibidaUnidades, "pierde solo lo recibido");

  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(
    !src.includes("SOLO_TRANSITO") && !src.includes("DESCONTAR_Y_TRANSITO"),
    "la recepción no ramifica por política: el neto es el mismo en las dos"
  );
  assert.equal(
    (src.match(/increment:\s*devolucionUnidades/g) || []).length,
    1,
    "una sola devolución por detalle"
  );
});

// ── 22.14-22.19. Cómo se aplica el movimiento ────────────────────────────────

test("22.14. cantidad y enTransito se mueven en la MISMA escritura atómica", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(
    /data:\s*\{\s*cantidad:\s*\{\s*increment:\s*devolucionUnidades\s*\},\s*enTransito:\s*\{\s*decrement:\s*enviadaUnidades\s*\},?\s*\}/.test(
      src
    ),
    "partirlo en dos updates deja el stock del origen a medio corregir"
  );
  assert.equal(
    (src.match(/stockLocal\.update\(/g) || []).length,
    1,
    "un solo update sobre el stock del origen"
  );
  assert.ok(
    !src.includes("stockLocal.updateMany"),
    "updateMany no devuelve la fila y no permite auditar el antes/después"
  );
});

test("22.15. la auditoría de la devolución vive DENTRO de la transacción", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(src.includes("tx.auditoriaStock.create"), "se escribe con el cliente transaccional");
  const posTx = src.indexOf("prisma.$transaction");
  const posAud = src.indexOf("auditoriaStock.create");
  assert.ok(posTx > 0 && posAud > posTx, "fuera de la transacción podría sobrevivir a un rollback");
  assert.ok(
    !src.includes(".catch("),
    "la auditoría de la devolución no es best-effort: si falla, se revierte todo"
  );
});

test("22.16. la auditoría se crea solo cuando hay algo que devolver", () => {
  const src = leerSinComentarios(CONFIRMAR);
  const posGuard = src.indexOf("if (devolucionUnidades > 0)");
  const posAud = src.indexOf("auditoriaStock.create");
  assert.ok(posGuard > 0, "debe existir el guard explícito");
  assert.ok(posGuard < posAud, "una recepción completa no genera auditoría de devolución");
});

test("22.16b. la auditoría registra transferencia, detalle, enviado, recibido y devuelto", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(/accion:\s*ACCION_DEVOLUCION/.test(src));
  assert.ok(src.includes('"DIFERENCIA_RECEPCION_TRANSFERENCIA"'));
  for (const campo of [
    "grupoId: grupoOrigenId",
    "localId: transferencia.origenId",
    "productoLocalId: productoOrigen.id",
    "userId: usuarioId",
    "cantidadAnterior:",
    "cantidadNueva:",
  ]) {
    assert.ok(src.includes(campo), `falta ${campo} en la auditoría`);
  }
  for (const dato of ["transferencia #", "detalle #", "enviado ", "recibido ", "devuelto "]) {
    assert.ok(src.includes(dato), `el motivo debe incluir "${dato}"`);
  }
});

test("22.17. sigue habiendo una sola transacción (sin mutaciones parciales)", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.equal((src.match(/prisma\.\$transaction/g) || []).length, 1);
  for (const escritura of [
    "stockLocal.upsert",
    "stockLocal.update(",
    "auditoriaStock.create",
    "transferenciaDetalle.update",
  ]) {
    assert.ok(src.indexOf(escritura) > src.indexOf("prisma.$transaction"), `${escritura} fuera de la transacción`);
  }
});

test("22.18. la barrera de estado sigue siendo la PRIMERA escritura", () => {
  const src = leerSinComentarios(CONFIRMAR);
  const posBarrera = src.indexOf("transferencia.updateMany");
  assert.ok(posBarrera > 0);
  for (const escritura of ["stockLocal.upsert", "stockLocal.update(", "auditoriaStock.create"]) {
    assert.ok(posBarrera < src.indexOf(escritura), `la barrera debe ir antes de ${escritura}`);
  }
  assert.ok(src.includes("ALREADY_CONFIRMED"));
});

test("22.19. toda la validación ocurre antes de abrir la transacción", () => {
  const src = leerSinComentarios(CONFIRMAR);
  const posTx = src.indexOf("prisma.$transaction");
  for (const validacion of [
    "validarDetalleRecepcion",
    "Number(session.id",
    "getGrupoIdDeLocal",
    "GRUPO_ORIGEN_NO_RESUELTO",
  ]) {
    const pos = src.indexOf(validacion);
    assert.ok(pos > 0, `falta ${validacion}`);
    assert.ok(pos < posTx, `${validacion} tiene que resolverse antes de tocar stock`);
  }
});

// ── 22.20-22.26. Invariantes de datos y de flujo ─────────────────────────────

test("22.20. TransferenciaDetalle.cantidad (lo enviado) nunca se reescribe", () => {
  const src = leerSinComentarios(CONFIRMAR);
  const desde = src.indexOf("transferenciaDetalle.update");
  const bloque = src.slice(desde, desde + 400);
  assert.ok(bloque.includes("recibido:"), "el recibido sí se persiste");
  assert.ok(!/\bcantidad:/.test(bloque), "la cantidad enviada es histórica: no se corrige a lo recibido");
});

test("22.21. el recibido validado queda persistido junto al confirmador", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(/recibido:\s*recibida/.test(src), "se guarda el valor validado, no el crudo");
  assert.ok(src.includes("confirmadoPorId: usuarioId"));
  assert.ok(
    !src.includes("confirmadoPorId: session.id || null"),
    "session.id || null dejaba pasar sesiones sin usuario"
  );
  assert.ok(src.includes("USUARIO_SESION_INVALIDO"), "sin usuario válido no se confirma");
});

test("22.22. el destino se acredita SOLO por la cantidad recibida", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(/update:\s*\{\s*cantidad:\s*\{\s*increment:\s*incrementoLocal\s*\}\s*\}/.test(src));
  assert.ok(/incrementoLocal[\s\S]{0,160}recibidaUnidades/.test(src), "incrementoLocal deriva de lo recibido");
  assert.ok(
    !/increment:\s*enviadaUnidades/.test(src),
    "acreditar lo enviado al destino inventaría el faltante en el otro local"
  );
});

test("22.23. el tránsito del origen baja por lo ENVIADO, no por lo recibido", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(/enTransito:\s*\{\s*decrement:\s*enviadaUnidades\s*\}/.test(src));
  assert.ok(
    !/enTransito:\s*\{\s*decrement:\s*recibidaUnidades\s*\}/.test(src),
    "limpiar por lo recibido dejaría tránsito colgado para siempre"
  );
});

test("22.24. la confirmación duplicada no puede devolver dos veces", () => {
  const src = leerSinComentarios(CONFIRMAR);
  // Guard previo + barrera atómica: la segunda confirmación corta antes de mutar.
  assert.ok(src.includes('estado === "Recibida"'));
  assert.ok(/estado:\s*\{\s*in:\s*\["Enviada",\s*"Recibiendo"\]\s*\}/.test(src));
  assert.ok(/if\s*\(lock\.count === 0\)/.test(src));
  const posLock = src.indexOf("lock.count === 0");
  for (const mutacion of ["stockLocal.update(", "stockLocal.upsert", "auditoriaStock.create"]) {
    assert.ok(posLock < src.indexOf(mutacion), `la barrera debe cortar antes de ${mutacion}`);
  }
});

test("22.25. origen inexistente aborta la recepción entera", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(src.includes("STOCK_ORIGEN_NO_ENCONTRADO"));
  assert.ok(
    !/if\s*\(productoOrigen\)\s*\{/.test(src),
    "el salteo silencioso perdía la devolución sin avisar"
  );
  assert.ok(/if\s*\(!productoOrigen\)/.test(src), "ahora falta de producto en origen es error");
  assert.ok(/if\s*\(!stockOrigen\)/.test(src), "y falta de fila de stock también");
  assert.ok(
    !/stockLocal\.create[\s\S]{0,200}origenId/.test(src),
    "no se crea la fila del origen durante la recepción"
  );
});

test("22.26. los abortos se lanzan (no se responde desde adentro de la transacción)", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(src.includes("class ErrorRecepcion"), "error tipado para abortar la transacción");
  assert.ok(/throw new ErrorRecepcion\(/.test(src));
  const posTx = src.indexOf("prisma.$transaction");
  // Hasta el return de éxito: eso es exactamente el cuerpo de la transacción.
  const finTx = src.indexOf("return NextResponse.json({ ok: true })");
  assert.ok(posTx > 0 && finTx > posTx, "no se pudo delimitar el cuerpo de la transacción");
  const cuerpo = src.slice(posTx, finTx);
  assert.ok(
    !cuerpo.includes("NextResponse.json"),
    "devolver una respuesta desde adentro dejaría la transacción sin cerrar"
  );
});

// ── 22.27-22.31. Sin regresiones ─────────────────────────────────────────────

test("22.27. venta interna sin diferencia: no cambia nada respecto de hoy", () => {
  // Transferencia 3 real (venta 1324): 10 enviadas, 10 recibidas.
  const plan = planDe({ cantidad: 10, recibido: 10, unidadEnviada: "UNIDAD" }, 28);
  assert.equal(plan.devolucionUnidades, 0);
  assert.equal(plan.recibidaUnidades, 10);
  assert.equal(plan.enviadaUnidades, 10);
  assert.equal(plan.hayDiferencia, false);
});

test("22.28. transferencia manual sin diferencia: no cambia nada respecto de hoy", () => {
  const plan = planDe({ cantidad: 2, recibido: null, unidadEnviada: "BULTO" }, 20);
  assert.equal(plan.devolucionUnidades, 0, "sin recepción cargada llegó todo: nada vuelve");
  assert.equal(plan.recibidaUnidades, 40);
});

test("22.29. recibido 0 sigue sin interpretarse como recepción completa", () => {
  const plan = planDe({ cantidad: 20, recibido: 0, motivoPrincipal: "Faltante" });
  assert.equal(plan.recibida, 0);
  assert.equal(plan.recibidaUnidades, 0);
  assert.equal(plan.devolucionUnidades, 20, "vuelve todo, no se acredita nada al destino");
  assert.notEqual(plan.devolucionUnidades, 0);
});

test("22.30. el estado final sigue siendo Recibida (no hay CON_DIFERENCIA)", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(/estado:\s*"Recibida"/.test(src));
  assert.ok(!src.includes("CON_DIFERENCIA"), "un estado nuevo rompería filtros y badges");
});

test("22.31. tieneDiferencias se sigue marcando en la cabecera", () => {
  const src = leerSinComentarios(CONFIRMAR);
  assert.ok(/if\s*\(plan\.hayDiferencia\)\s*tieneDiferencias = true/.test(src));
  assert.ok(/tieneDiferencias,/.test(src), "se persiste en la cabecera");

  const conDif = planDe({ cantidad: 20, recibido: 18, motivoPrincipal: "Faltante" });
  const sinDif = planDe({ cantidad: 20, recibido: 20 });
  assert.equal(conDif.hayDiferencia, true);
  assert.equal(sinDif.hayDiferencia, false);
});
