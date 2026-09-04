// Candados de los permisos de los roles que YA EXISTEN.
//
// Lo que defienden: que agregar un permiso a la matriz de `systemRoles.js` NO
// alcanza. `prisma/seed.js` no repisa los permisos de un rol que ya existe —y
// hace bien, respeta lo que el administrador ajustó— así que en una instalación
// que ya corre, ENCARGADO y DUEÑO_LOCAL se quedarían sin el permiso para
// siempre, y nadie se entera hasta que alguien no puede entrar a una pantalla.
//
// La evolución va por migración de datos, OTORGANDO sin pisar: concatena en vez
// de reemplazar. Reemplazar el array por los defaults habría sido el camino
// corto y habría borrado en silencio cada personalización.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_PERMISOS_SISTEMA,
  ENCARGADO,
  DUENO_LOCAL,
  CAJERO,
} from "./systemRoles.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const leer = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (t) => t.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const MIGRACION =
  "prisma/migrations/20260903040000_permisos_proveedores_y_compras_roles_existentes/migration.sql";

test("A8. ENCARGADO COMPRA, Y DUEÑO_LOCAL LO HEREDA SIN DUPLICAR", () => {
  assert.ok(DEFAULT_PERMISOS_SISTEMA[ENCARGADO].includes("compras.crear"));
  assert.ok(DEFAULT_PERMISOS_SISTEMA[ENCARGADO].includes("proveedores.crear"));
  assert.ok(DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL].includes("compras.crear"));
  assert.ok(DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL].includes("proveedores.crear"));
  assert.ok(!DEFAULT_PERMISOS_SISTEMA[CAJERO].includes("compras.crear"));
  assert.ok(!DEFAULT_PERMISOS_SISTEMA[CAJERO].includes("proveedores.crear"));

  // Ninguno de los dos aparece dos veces en la lista del dueño: se heredan.
  for (const code of ["compras.crear", "proveedores.crear"]) {
    const veces = DEFAULT_PERMISOS_SISTEMA[DUENO_LOCAL].filter((p) => p === code).length;
    assert.equal(veces, 1, `${code} aparece ${veces} veces en DUEÑO_LOCAL`);
  }
  const fuente = sinComentarios(leer("lib/rbac/systemRoles.js"));
  assert.equal((fuente.match(/"compras\.crear"/g) || []).length, 1);
  assert.equal((fuente.match(/"proveedores\.crear"/g) || []).length, 1);
});

test("A9. LA MIGRACIÓN OTORGA SIN PISAR: concatena, no reemplaza", () => {
  const sql = leer(MIGRACION);
  // Concatena. Reemplazar el array borraría en silencio cada permiso que un
  // administrador agregó o sacó a mano.
  assert.match(sql, /SET "permisos" = "permisos" \|\| '\["proveedores\.crear"\]'::jsonb/);
  assert.match(sql, /SET "permisos" = "permisos" \|\| '\["compras\.crear"\]'::jsonb/);
  assert.doesNotMatch(
    sql,
    /SET "permisos" = '\[/,
    "la migración reemplaza el array entero: eso borra las personalizaciones"
  );
  // Idempotente: el `NOT (@>)` descarta a los que ya lo tienen.
  assert.match(sql, /NOT \("permisos" @> '\["proveedores\.crear"\]'::jsonb\)/);
  assert.match(sql, /NOT \("permisos" @> '\["compras\.crear"\]'::jsonb\)/);
  // Acotada a los dos roles, y a ningún otro.
  const alcances = sql.match(/WHERE "nombre" IN \(([^)]*)\)/g) || [];
  assert.equal(alcances.length, 2, "la migración dejó de acotar por nombre de rol");
  for (const a of alcances) {
    assert.match(a, /'DUEÑO_LOCAL'/);
    assert.match(a, /'ENCARGADO'/);
    assert.doesNotMatch(a, /'CAJERO'/, "CAJERO no recibe estos permisos");
  }
  // Las dos defensas del patrón más completo del repo (20260807220000).
  assert.match(sql, /jsonb_typeof\("permisos"\) = 'array'/);
  assert.match(sql, /NOT \("permisos" @> '\["\*"\]'::jsonb\)/);
});

test("A10. NO HAY NINGÚN MECANISMO QUE LOS VUELVA A PONER AL ARRANCAR", () => {
  // Es lo que garantiza que el administrador pueda sacarlos después. El seed no
  // repisa los permisos de un rol que ya existe —esa es la política del repo, y
  // es justamente lo que hizo falta la migración— y la migración corre una sola
  // vez por `_prisma_migrations`.
  const seed = leer("prisma/seed.js");
  assert.match(
    seed,
    /update:\s*\{\s*\}/,
    "el seed dejó de respetar los permisos de un rol existente: ahora los repisaría en cada corrida"
  );
});

test("A11. CONTRAPRUEBA de A9: el analizador ve un reemplazo si volviera", () => {
  const reemplazo = `UPDATE "Rol" SET "permisos" = '["compras.crear"]'::jsonb WHERE 1=1;`;
  assert.match(reemplazo, /SET "permisos" = '\[/);
  // Y ve la concatenación correcta, así que el match de A9 no pasa por vacío.
  const concat = `SET "permisos" = "permisos" || '["compras.crear"]'::jsonb`;
  assert.match(concat, /SET "permisos" = "permisos" \|\| '\["compras\.crear"\]'::jsonb/);
});
