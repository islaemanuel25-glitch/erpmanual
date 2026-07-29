import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseReturnParams,
  serializeReturnParams,
  buildDetalleUrl,
  buildCorregirUrl,
  buildVolverUrl,
  contextoReconstruible,
} from "./returnParams.js";

const BASE = "/modulos/reportes-ventas";
const CTX = { tab: "venta", page: 2, fechaDesde: "2026-07-01", fechaHasta: "2026-07-28", localId: 1, formaPago: "efectivo" };

// ---------------------------------------------------------------------------
// serialización / parseo válidos
// ---------------------------------------------------------------------------
test("serialización válida (orden estable)", () => {
  assert.equal(serializeReturnParams(CTX),
    "tab=venta&page=2&fechaDesde=2026-07-01&fechaHasta=2026-07-28&localId=1&formaPago=efectivo");
});
test("parseo válido desde URLSearchParams", () => {
  const sp = new URLSearchParams(serializeReturnParams(CTX));
  assert.deepEqual(parseReturnParams(sp), CTX);
});
test("parseo válido desde objeto plano", () => {
  assert.deepEqual(parseReturnParams(CTX), CTX);
});
test("round-trip parse∘serialize es idempotente", () => {
  const once = parseReturnParams(CTX);
  const twice = parseReturnParams(new URLSearchParams(serializeReturnParams(once)));
  assert.deepEqual(twice, once);
});

// ---------------------------------------------------------------------------
// valores desconocidos / inválidos ignorados
// ---------------------------------------------------------------------------
test("claves desconocidas se ignoran", () => {
  assert.deepEqual(parseReturnParams({ ...CTX, foo: "bar", orden: "total_desc", scroll: "999" }), CTX);
});
test("page inválida se descarta", () => {
  assert.equal(parseReturnParams({ ...CTX, page: "abc" }).page, undefined);
  assert.equal(parseReturnParams({ ...CTX, page: "0" }).page, undefined);
  assert.equal(parseReturnParams({ ...CTX, page: "-3" }).page, undefined);
  assert.equal(parseReturnParams({ ...CTX, page: "1.5" }).page, undefined);
});
test("fechas inválidas se descartan (formato y fecha real)", () => {
  assert.equal(parseReturnParams({ fechaDesde: "2026-7-1" }).fechaDesde, undefined);
  assert.equal(parseReturnParams({ fechaDesde: "2026-13-40" }).fechaDesde, undefined);
  assert.equal(parseReturnParams({ fechaDesde: "hoy" }).fechaDesde, undefined);
  assert.equal(parseReturnParams({ fechaDesde: "2026-02-30" }).fechaDesde, undefined);
});
test("localId inválido se descarta", () => {
  assert.equal(parseReturnParams({ ...CTX, localId: "0" }).localId, undefined);
  assert.equal(parseReturnParams({ ...CTX, localId: "x" }).localId, undefined);
  assert.equal(parseReturnParams({ ...CTX, localId: "-1" }).localId, undefined);
});
test("formaPago inválida se descarta; válida se normaliza a minúsculas", () => {
  assert.equal(parseReturnParams({ formaPago: "bitcoin" }).formaPago, undefined);
  assert.equal(parseReturnParams({ formaPago: "javascript:alert(1)" }).formaPago, undefined);
  assert.equal(parseReturnParams({ formaPago: "EFECTIVO" }).formaPago, "efectivo");
});
test("tab inválida se descarta", () => {
  assert.equal(parseReturnParams({ tab: "hackers" }).tab, undefined);
  assert.equal(parseReturnParams({ tab: "../otro" }).tab, undefined);
});

// ---------------------------------------------------------------------------
// seguridad: returnTo arbitrario / rutas / URLs / javascript:
// ---------------------------------------------------------------------------
test("returnTo arbitrario y URLs no pasan", () => {
  const hostil = parseReturnParams({
    returnTo: "https://evil.example/steal",
    url: "javascript:alert(1)",
    redirect: "/admin",
    next: "//evil.com",
  });
  assert.deepEqual(hostil, {});
  assert.equal(serializeReturnParams(hostil), "");
});
test("buildVolverUrl nunca produce URL externa ni javascript:", () => {
  const u = buildVolverUrl({ returnTo: "https://evil.com", tab: "venta", fechaDesde: "2026-07-01", fechaHasta: "2026-07-28" });
  assert.ok(u.startsWith(BASE));
  assert.ok(!u.includes("evil"));
  assert.ok(!u.toLowerCase().includes("javascript:"));
});

// ---------------------------------------------------------------------------
// tab=cliente (no pagina): page se descarta
// ---------------------------------------------------------------------------
test("tab=cliente preserva tab y descarta page", () => {
  const p = parseReturnParams({ tab: "cliente", page: "5", fechaDesde: "2026-07-01", fechaHasta: "2026-07-28", localId: 1 });
  assert.equal(p.tab, "cliente");
  assert.equal(p.page, undefined);
  assert.equal(serializeReturnParams(p), "tab=cliente&fechaDesde=2026-07-01&fechaHasta=2026-07-28&localId=1");
});

// ---------------------------------------------------------------------------
// URLs de detalle / regreso
// ---------------------------------------------------------------------------
test("buildDetalleUrl arma ruta interna con contexto", () => {
  assert.equal(buildDetalleUrl(1285, CTX),
    `${BASE}/1285?tab=venta&page=2&fechaDesde=2026-07-01&fechaHasta=2026-07-28&localId=1&formaPago=efectivo`);
});
test("buildDetalleUrl fail-safe con ventaId inválido", () => {
  assert.equal(buildDetalleUrl("x", CTX), BASE);
  assert.equal(buildDetalleUrl(0, CTX), BASE);
});
test("buildDetalleUrl sin contexto → solo la ruta", () => {
  assert.equal(buildDetalleUrl(1285, {}), `${BASE}/1285`);
});
test("buildCorregirUrl arma la ruta /corregir con contexto", () => {
  assert.equal(buildCorregirUrl(1285, CTX),
    `${BASE}/1285/corregir?tab=venta&page=2&fechaDesde=2026-07-01&fechaHasta=2026-07-28&localId=1&formaPago=efectivo`);
  assert.equal(buildCorregirUrl(1285, {}), `${BASE}/1285/corregir`);
  assert.equal(buildCorregirUrl("x", CTX), BASE);
});
test("buildVolverUrl reconstruye el listado; vacío → base", () => {
  assert.equal(buildVolverUrl(CTX), `${BASE}?tab=venta&page=2&fechaDesde=2026-07-01&fechaHasta=2026-07-28&localId=1&formaPago=efectivo`);
  assert.equal(buildVolverUrl({}), BASE);
});
test("contextoReconstruible exige ambas fechas", () => {
  assert.equal(contextoReconstruible(CTX), true);
  assert.equal(contextoReconstruible({ tab: "venta" }), false);
  assert.equal(contextoReconstruible({ fechaDesde: "2026-07-01" }), false);
});
