import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessMenuItem, getAccessReason } from "./canAccess.js";

// ---------------------------------------------------------------------------
// Regresión del gate de configuración: scope:"config" YA NO es admin-only por sí
// mismo. Debe regir el RBAC (permiso/requiredAnyPerms). Los items adminOnly
// siguen siendo admin-only. Un item de config SIN señal RBAC queda admin-only
// (red de seguridad).
//
// Se usan items sintéticos (sin requiredModule) para aislar la lógica de gate de
// la capa comercial. grupoConfig no interviene sin requiredModule/Feature.
// ---------------------------------------------------------------------------

const CFG = null; // usa capacidades comerciales por defecto; sin requiredModule no aplica

test("config con permiso: no-admin CON el permiso lo ve", () => {
  const item = { scope: "config", permiso: "config_local.pos" };
  const user = { esAdmin: false, permisos: ["config_local.pos"] };
  assert.equal(canAccessMenuItem(user, CFG, item, []).visible, true);
});

test("config con permiso: no-admin SIN el permiso NO lo ve (sin-permiso, no config-admin-only)", () => {
  const item = { scope: "config", permiso: "config_local.pos" };
  const user = { esAdmin: false, permisos: ["config_local.stock"] };
  const r = canAccessMenuItem(user, CFG, item, []);
  assert.equal(r.visible, false);
  assert.equal(r.reason, "sin-permiso:config_local.pos");
});

test("config con requiredAnyPerms: no-admin con AL MENOS uno lo ve", () => {
  const grupo = {
    scope: "config",
    requiredAnyPerms: ["config_local.apariencia", "config_local.stock", "listas_precios.ver"],
  };
  const dueno = { esAdmin: false, permisos: ["config_local.stock"] };
  assert.equal(canAccessMenuItem(dueno, CFG, grupo, []).visible, true);

  const cajero = { esAdmin: false, permisos: ["pos.usar"] };
  const r = canAccessMenuItem(cajero, CFG, grupo, []);
  assert.equal(r.visible, false);
  assert.equal(r.reason, "sin-any-perms");
});

test("config adminOnly (p. ej. Mantenimiento): no-admin NUNCA lo ve", () => {
  const item = { scope: "config", adminOnly: true };
  // Aunque tuviera permisos de config, adminOnly corta antes.
  const user = { esAdmin: false, permisos: ["config_local.pos", "config_local.stock"] };
  const r = canAccessMenuItem(user, CFG, item, []);
  assert.equal(r.visible, false);
  assert.equal(r.reason, "admin-only");
});

test("config SIN señal RBAC: no-admin queda admin-only (red de seguridad)", () => {
  const item = { scope: "config" }; // sin permiso ni requiredAnyPerms
  const user = { esAdmin: false, permisos: ["config_local.pos"] };
  const r = canAccessMenuItem(user, CFG, item, []);
  assert.equal(r.visible, false);
  assert.equal(r.reason, "config-admin-only");
});

test("admin ve cualquier item de config (incl. adminOnly)", () => {
  const user = { esAdmin: true, permisos: ["*"] };
  assert.equal(getAccessReason(user, CFG, { scope: "config", permiso: "config_local.pos" }, []), null);
  assert.equal(getAccessReason(user, CFG, { scope: "config", adminOnly: true }, []), null);
  assert.equal(getAccessReason(user, CFG, { scope: "config" }, []), null);
});
