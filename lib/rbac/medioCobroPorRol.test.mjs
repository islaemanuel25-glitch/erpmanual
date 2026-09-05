// CANDADO: QUIÉN ARRANCA PUDIENDO CONFIGURAR LOS MEDIOS DE COBRO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/rbac/medioCobroPorRol.test.mjs
//
// ── LO QUE ESTO CUIDA ──────────────────────────────────────────────────────
//
// Que la asignación inicial del rollout sea una ASIGNACIÓN y no una regla. El
// permiso arranca en DUEÑO_LOCAL y no en ENCARGADO, y eso es una decisión de
// producto que el administrador puede cambiar en los dos sentidos desde la
// pantalla de Roles.
//
// Lo que NO puede pasar es que el nombre del rol se filtre al código. Un
// `if (rol === "DUEÑO_LOCAL")` en cualquier lado convertiría una configuración
// en una regla escrita en piedra, y el día que alguien le saque el permiso desde
// Roles se lo sacaría de mentira: la pantalla diría una cosa y el código haría
// otra.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import {
  DEFAULT_PERMISOS_SISTEMA,
  DUENO_LOCAL,
  ENCARGADO,
  CAJERO,
} from "@/lib/rbac/systemRoles.js";
import { PERMISOS_CONFIG_POS } from "@/lib/config/acceso.js";

const PERMISO = "config_local.medios_cobro";

test("una instalación nueva le da los medios de cobro al DUEÑO_LOCAL", () => {
  assert.ok(DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL].includes(PERMISO));
});

test("y NO al ENCARGADO ni al CAJERO", () => {
  // Ojo con dónde se agrega: `DUENO_LOCAL_PERMISOS` hace spread de
  // `ENCARGADO_PERMISOS`, así que ponerlo en la lista del encargado se lo daría
  // a los dos sin que se note al leer el diff.
  assert.equal(DEFAULT_PERMISOS_SISTEMA[ENCARGADO].includes(PERMISO), false);
  assert.equal(DEFAULT_PERMISOS_SISTEMA[CAJERO].includes(PERMISO), false);
});

test("el ENCARGADO igual entra a Configuración POS si tiene las reglas", () => {
  // No queda afuera del módulo: queda afuera de una sección. Es la diferencia
  // entre no ver Cobros y no poder entrar a ninguna parte.
  assert.ok(PERMISOS_CONFIG_POS.includes("config_local.pos"));
  assert.ok(PERMISOS_CONFIG_POS.includes(PERMISO));
});

test("la migración de rollout existe y otorga SOLO a DUEÑO_LOCAL", async () => {
  const { readFileSync } = await import("node:fs");
  const sql = readFileSync(
    "prisma/migrations/20260906010000_permiso_medios_cobro_dueno_local/migration.sql",
    "utf8"
  );
  // Sin los comentarios: acá se mira lo que Postgres ejecuta, no la prosa. Un
  // candado que busca texto encuentra los comentarios, y este archivo tiene
  // sesenta líneas de comentario que nombran a ENCARGADO para explicar por qué
  // NO entra.
  const ejecutable = sql.replace(/--[^\n]*/g, "");

  assert.match(ejecutable, /UPDATE "Rol"/);
  assert.match(ejecutable, /config_local\.medios_cobro/);
  assert.match(ejecutable, /'DUEÑO_LOCAL'/);
  assert.equal(/ENCARGADO/.test(ejecutable), false, "el encargado no debe recibirlo todavía");
  assert.equal(/CAJERO/.test(ejecutable), false);

  // OTORGA, no reemplaza: si esto pasara a ser un `SET "permisos" = '[...]'`
  // borraría en silencio cada ajuste que un administrador hizo a mano.
  assert.match(ejecutable, /"permisos" \|\|/);
  // Y las dos defensas del patrón que el repo ya usó tres veces.
  assert.match(ejecutable, /jsonb_typeof\("permisos"\) = 'array'/);
  assert.match(ejecutable, /NOT \("permisos" @> '\["\*"\]'::jsonb\)/);
});

test("NINGÚN archivo de la aplicación decide por el NOMBRE del rol", () => {
  // Es lo que mantiene los permisos configurables. El código pregunta por el
  // permiso; el nombre del rol solo vive en el seed, en la matriz de sistema y
  // en la migración de rollout, que son los tres lugares donde corresponde.
  // `git grep` sale con 1 cuando NO encuentra nada, que acá es el caso bueno.
  // Sin atajarlo, `execFileSync` tira y el candado se rompe justo cuando pasa.
  let salida = "";
  try {
    salida = execFileSync(
      "git",
      ["grep", "-l", "-E", "DUEÑO_LOCAL|DUENO_LOCAL", "--", "app", "components", "hooks"],
      { encoding: "utf8" }
    ).trim();
  } catch (err) {
    if (err.status !== 1) throw err;
  }

  assert.equal(salida, "", `estos archivos deciden por el nombre del rol:\n${salida}`);
});
