import { test } from "node:test";
import assert from "node:assert/strict";
import {
  puedeVerConfigLocal,
  puedeVerSeccion,
  PERMISOS_CONFIG_LOCAL,
  PERMISOS_CONFIG_POS,
  operarioObligatorio,
} from "./acceso.js";

// ---------------------------------------------------------------------------
// puedeVerConfigLocal(perfil) — gating de la sección Configuración (menú/landing)
// ---------------------------------------------------------------------------

test("admin (*) ve Configuración", () => {
  assert.equal(puedeVerConfigLocal({ permisos: ["*"] }), true);
});

test("DUEÑO_LOCAL con cualquier config_local.* ve Configuración", () => {
  assert.equal(puedeVerConfigLocal({ permisos: ["config_local.apariencia"] }), true);
  assert.equal(puedeVerConfigLocal({ permisos: ["config_local.pos"] }), true);
  assert.equal(puedeVerConfigLocal({ permisos: ["config_local.ticket"] }), true);
});

test("permiso de listas de precios también habilita la sección", () => {
  assert.equal(puedeVerConfigLocal({ permisos: ["listas_precios.ver"] }), true);
});

test("CAJERO (sin permisos de config) NO ve Configuración", () => {
  assert.equal(
    puedeVerConfigLocal({ permisos: ["pos.usar", "clientes.crear"] }),
    false
  );
});

test("perfil sin permisos / nulo → false (fail-closed)", () => {
  assert.equal(puedeVerConfigLocal({ permisos: [] }), false);
  assert.equal(puedeVerConfigLocal({}), false);
  assert.equal(puedeVerConfigLocal(null), false);
  assert.equal(puedeVerConfigLocal(undefined), false);
});

test("no confía en permisos que no sean array", () => {
  assert.equal(puedeVerConfigLocal({ permisos: "config_local.pos" }), false);
});

test("la lista de permisos incluye los config_local.* + listas_precios.ver", () => {
  for (const p of [
    "config_local.apariencia",
    "config_local.stock",
    "config_local.pos",
    "config_local.ticket",
    "config_local.fidelidad",
    "config_local.alertas",
    "config_local.medios_cobro",
    "listas_precios.ver",
  ]) {
    assert.ok(PERMISOS_CONFIG_LOCAL.includes(p), `falta ${p}`);
  }
});

// ---------------------------------------------------------------------------
// QUIÉN LLEGA A CONFIGURACIÓN POS
//
// Adentro conviven dos cosas con permisos distintos. Estaba gateado solo por
// `config_local.pos`, así que alguien con permiso para administrar los medios de
// cobro tenía API y no tenía forma de llegar a la pantalla.
// ---------------------------------------------------------------------------

test("solo con config_local.medios_cobro ya se ve la sección Configuración", () => {
  assert.equal(puedeVerConfigLocal({ permisos: ["config_local.medios_cobro"] }), true);
});

test("Configuración POS se abre con CUALQUIERA de los dos permisos", () => {
  assert.deepEqual(PERMISOS_CONFIG_POS, ["config_local.pos", "config_local.medios_cobro"]);

  const seccion = { permisos: PERMISOS_CONFIG_POS };
  assert.equal(puedeVerSeccion({ permisos: ["config_local.pos"] }, seccion), true);
  assert.equal(puedeVerSeccion({ permisos: ["config_local.medios_cobro"] }, seccion), true);
  assert.equal(puedeVerSeccion({ permisos: ["config_local.pos", "config_local.medios_cobro"] }, seccion), true);
});

test("un cajero NO ve Configuración POS", () => {
  assert.equal(puedeVerSeccion({ permisos: ["pos.usar"] }, { permisos: PERMISOS_CONFIG_POS }), false);
});

// ---------------------------------------------------------------------------
// puedeVerSeccion — el filtro de las tarjetas de la landing
// ---------------------------------------------------------------------------

test("admin (*) ve todas las tarjetas, incluidas las adminOnly", () => {
  const admin = { permisos: ["*"] };
  assert.equal(puedeVerSeccion(admin, { adminOnly: true }), true);
  assert.equal(puedeVerSeccion(admin, { permiso: "config_local.stock" }), true);
});

test("una tarjeta adminOnly no la ve nadie más, tenga los permisos que tenga", () => {
  const dueno = { permisos: ["config_local.pos", "config_local.stock"] };
  assert.equal(puedeVerSeccion(dueno, { adminOnly: true }), false);
});

test("una tarjeta con un solo permiso lo exige", () => {
  assert.equal(puedeVerSeccion({ permisos: ["config_local.stock"] }, { permiso: "config_local.stock" }), true);
  assert.equal(puedeVerSeccion({ permisos: ["config_local.pos"] }, { permiso: "config_local.stock" }), false);
});

test("las dos señales se cumplen las dos, no una u otra", () => {
  // Si una tarjeta declarara las dos, `permiso` es obligatorio Y `permisos` pide
  // al menos uno. Vale la pena fijarlo: la confusión contraria dejaría pasar a
  // alguien que solo cumple la mitad.
  const seccion = { permiso: "config_local.pos", permisos: ["config_local.medios_cobro"] };
  assert.equal(puedeVerSeccion({ permisos: ["config_local.pos"] }, seccion), false);
  assert.equal(puedeVerSeccion({ permisos: ["config_local.medios_cobro"] }, seccion), false);
  assert.equal(
    puedeVerSeccion({ permisos: ["config_local.pos", "config_local.medios_cobro"] }, seccion),
    true
  );
});

test("perfil nulo o sin permisos no ve ninguna tarjeta (fail-closed)", () => {
  assert.equal(puedeVerSeccion(null, { permiso: "config_local.pos" }), false);
  assert.equal(puedeVerSeccion({ permisos: [] }, { permiso: "config_local.pos" }), false);
  assert.equal(puedeVerSeccion({ permisos: "config_local.pos" }, { permiso: "config_local.pos" }), false);
});

// ---------------------------------------------------------------------------
// operarioObligatorio(exigirOperador) — semántica CANÓNICA de ConfiguracionLocal
//   null/undefined = OBLIGATORIO (compat histórica; nunca se lee como false)
//   true           = OBLIGATORIO
//   false          = NO obligatorio
// ---------------------------------------------------------------------------

test("operarioObligatorio: null = obligatorio (compat histórica)", () => {
  assert.equal(operarioObligatorio(null), true);
});

test("operarioObligatorio: undefined = obligatorio (sin fila / campo ausente)", () => {
  assert.equal(operarioObligatorio(undefined), true);
});

test("operarioObligatorio: true = obligatorio", () => {
  assert.equal(operarioObligatorio(true), true);
});

test("operarioObligatorio: false = NO obligatorio (único valor que libera)", () => {
  assert.equal(operarioObligatorio(false), false);
});

test("operarioObligatorio: valores raros son fail-safe → obligatorio (nunca null→false)", () => {
  // Solo `false` estricto libera; 0/''/NaN NO deben interpretarse como no-obligatorio.
  assert.equal(operarioObligatorio(0), true);
  assert.equal(operarioObligatorio(""), true);
  assert.equal(operarioObligatorio(NaN), true);
});
