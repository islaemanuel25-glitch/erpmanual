// CANDADO: EL LIBRO DE COSTOS NACE INERTE, CAPTURA LO QUE DICE Y NO SE AFLOJA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/libros/libroCostos.test.mjs
//
// El libro vive en SQL y el SQL no puede importar constantes. Estos candados
// atan la migración con `lib/libros/libroCostos.js`, con `schema.prisma` y con
// los dos contratos que ya existían: el origen de `origenDeCosto.js` y la
// escala que lee `costoPorUnidadFisica`.
//
// Y cuidan cómo se ENCIENDE: una sola migración, separada de la instalación,
// que no hace más que llamar a `libro_costo_activar()`. Que capture de verdad,
// que la activación —por esa migración— sea atómica y que la historia no se
// pueda tocar lo prueba contra PostgreSQL `scripts/pruebas-db/libroCostos.mjs`.
//
// Todo lo que lee SQL lo lee SIN COMENTARIOS: la prosa de la migración nombra
// justamente lo que se busca (regla 5 de CLAUDE.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CAMPO_ES_DEPOSITO,
  CAMPOS_BASE,
  CAMPOS_UBICACION,
  ESTADO_LIBRO_COSTOS,
  MIGRACION_ACTIVACION_COSTOS,
  MIGRACION_LIBRO_COSTOS,
  ORIGEN_ACTIVACION_COSTOS,
  SUFIJO_MIGRACION_ACTIVACION,
  TRIGGERS_DE_ACTIVACION,
} from "@/lib/libros/libroCostos";
import { CONFIG_COSTO_ORIGEN, CONFIG_COSTO_ORIGEN_REF, SIN_ORIGEN_COSTO } from "@/lib/precios/origenDeCosto";
import { costoPorUnidadFisica } from "@/lib/conversiones/costoPorUnidadFisica";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) => readFileSync(path.join(RAIZ, ruta), "utf8");
const sinComentariosSql = (t) => t.replace(/--[^\n]*/g, "");

const MIGRACION = sinComentariosSql(leer(`prisma/migrations/${MIGRACION_LIBRO_COSTOS}/migration.sql`));
const SCHEMA = leer("prisma/schema.prisma");

/** El cuerpo de una función de la migración, entre su CREATE y el `$fn$;` que la cierra. */
function cuerpo(nombre) {
  const i = MIGRACION.indexOf(`CREATE FUNCTION "${nombre}"`);
  assert.ok(i >= 0, `la migración no crea ${nombre}`);
  const fin = MIGRACION.indexOf("$fn$;", i);
  return MIGRACION.slice(i, fin);
}

/** Los campos de un modelo de schema.prisma. */
function camposDelModelo(modelo) {
  const m = new RegExp(`\\nmodel ${modelo} \\{([\\s\\S]*?)\\n\\}`).exec(SCHEMA);
  assert.ok(m, `schema.prisma no tiene el modelo ${modelo}`);
  return m[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter((l) => l && !l.startsWith("@@"))
    .map((l) => l.split(/\s+/)[0]);
}

/** Los nombres entre comillas dobles de un `UPDATE OF … OR DELETE`. */
const columnasDelUpdateOf = (sql) =>
  [...(/UPDATE OF ([\s\S]*?)(?:\sOR DELETE|\sON\s)/.exec(sql)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1]);

/** Los nombres entre comillas simples de un `tgname IN (…)`. */
const triggersDelIn = (sql) =>
  [...(/tgname IN \(([\s\S]*?)\)/.exec(sql)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((x) => x[1]);

const MIGRACIONES_SQL = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "prisma/migrations"], {
  cwd: RAIZ,
  encoding: "utf8",
})
  .split("\n")
  .filter((p) => p.endsWith("/migration.sql"));
const RUTA_ACTIVACION = `prisma/migrations/${MIGRACION_ACTIVACION_COSTOS}/migration.sql`;
const RUTA_INSTALACION = `prisma/migrations/${MIGRACION_LIBRO_COSTOS}/migration.sql`;
const sha256 = (ruta) => createHash("sha256").update(readFileSync(path.join(RAIZ, ruta))).digest("hex");

test("1. UNA SOLA MIGRACIÓN ACTIVA EL LIBRO, Y ES LA SUYA, SEPARADA DE LA INSTALACIÓN", () => {
  // Hasta el 2026-09-29 este candado exigía que NINGUNA migración activara el
  // libro: la instalación tenía que desplegarse inerte. Se reescribe con la
  // activación, que es una migración propia y posterior. Lo que sigue
  // defendiendo es lo mismo: que el libro no se encienda por otro camino.
  assert.ok(MIGRACIONES_SQL.length > 30, "la enumeración de migraciones vino vacía");

  const activadoras = MIGRACIONES_SQL.filter((p) =>
    /\b(SELECT|PERFORM)\s+"?libro_costo_activar"?\s*\(/.test(sinComentariosSql(leer(p)))
  );
  assert.deepEqual(activadoras, [RUTA_ACTIVACION], "libro_costo_activar() se llama desde otra migración que la de activación");
  assert.deepEqual(
    MIGRACIONES_SQL.filter((p) => p.includes(SUFIJO_MIGRACION_ACTIVACION)),
    [RUTA_ACTIVACION],
    "hay más de una migración de activación, o la que hay no se llama como libroCostos.js"
  );
  assert.ok(MIGRACION_ACTIVACION_COSTOS.endsWith(SUFIJO_MIGRACION_ACTIVACION), "libro_costo_estado() no la encontraría por su sufijo");
  // Prisma aplica por orden de nombre: la activación tiene que ir DESPUÉS de lo
  // que crea la función.
  assert.ok(MIGRACION_ACTIVACION_COSTOS > MIGRACION_LIBRO_COSTOS, "la activación se aplicaría antes que la instalación");
});

test("1.b LA ACTIVACIÓN ES LA FUNCIÓN CANÓNICA Y NADA MÁS", () => {
  // Ni triggers, ni INSERT, ni un punto cero escrito al lado: todo eso es de
  // `libro_costo_activar()`. Una segunda implementación en la migración se
  // desalinearía de la función —y de `libro_costo_estado()`— el día que una cambie.
  const sentencias = sinComentariosSql(leer(RUTA_ACTIVACION)).replace(/\s+/g, " ").trim();
  assert.equal(sentencias, `SELECT "libro_costo_activar"();`);
});

test("1.c LA INSTALACIÓN SIGUE SIENDO EXACTAMENTE LA QUE SE MERGEÓ EN #107", () => {
  // Producción la tiene aplicada: si cambia un byte, Prisma la vería como una
  // migración aplicada modificada, y la activación se apoyaría en una función
  // distinta de la que se probó. Cambiar este hash obliga a una migración nueva.
  assert.equal(sha256(RUTA_INSTALACION), "99efddd30ed1b927354ca37cdbc167b390ec97432385f5a6fa42142f1843c461");
});

test("1.d NINGUNA OTRA MIGRACIÓN ARMA LA ACTIVACIÓN A MANO", () => {
  // Los triggers de captura y las escrituras al libro solo existen dentro de la
  // función, que vive en la instalación.
  for (const p of MIGRACIONES_SQL.filter((x) => x !== RUTA_INSTALACION)) {
    const sql = sinComentariosSql(leer(p));
    for (const t of TRIGGERS_DE_ACTIVACION) assert.ok(!sql.includes(`"${t}"`), `${p} nombra el trigger ${t}`);
    for (const tabla of ["CostoBaseVersion", "CostoUbicacionVersion", "LibroCostoActivacion"]) {
      assert.ok(!sql.includes(`"${tabla}"`), `${p} toca "${tabla}"`);
    }
  }
});

test("2. LOS TRIGGERS DE CAPTURA SOLO LOS CREA LA ACTIVACIÓN", () => {
  // Si uno se creara suelto en la migración, el libro empezaría a capturar sin
  // punto cero: historia sin estado inicial.
  const activar = cuerpo("libro_costo_activar");
  for (const t of TRIGGERS_DE_ACTIVACION) {
    const creaciones = MIGRACION.split(`CREATE TRIGGER "${t}"`).length - 1;
    assert.equal(creaciones, 1, `${t} se crea ${creaciones} veces`);
    assert.ok(activar.includes(`CREATE TRIGGER "${t}"`), `${t} se crea fuera de libro_costo_activar`);
  }
  // Y la activación y el estado miran la misma lista.
  assert.deepEqual(triggersDelIn(activar), [...TRIGGERS_DE_ACTIVACION]);
  assert.deepEqual(triggersDelIn(cuerpo("libro_costo_estado")), [...TRIGGERS_DE_ACTIVACION]);
});

test("3. LA ACTIVACIÓN: TOPE DE 3 s, CANDADO ANTES DE TODO, Y LUEGO LOS TRIGGERS Y EL PUNTO CERO", () => {
  const activar = cuerpo("libro_costo_activar");
  const tope = activar.indexOf("set_config('lock_timeout', '3s', true)");
  const candado = activar.indexOf(`LOCK TABLE "ProductoBase", "ProductoLocal", "Local" IN SHARE ROW EXCLUSIVE MODE`);
  const primerTrigger = activar.indexOf("CREATE TRIGGER");
  const puntoCero = activar.indexOf(`INSERT INTO "CostoBaseVersion"`);
  const fila = activar.indexOf(`INSERT INTO "LibroCostoActivacion"`);
  assert.ok(tope >= 0 && candado > tope, "el tope de espera tiene que ir antes del candado");
  assert.ok(primerTrigger > candado, "los triggers tienen que crearse con el candado ya tomado");
  assert.ok(puntoCero > primerTrigger, "el punto cero se copia con los triggers ya puestos: sin hueco");
  assert.ok(fila > puntoCero, "la fila de activación va al final, cuando el punto cero ya está");
  assert.match(activar, /LIBRO_COSTO_YA_ACTIVADO/);
  assert.match(activar, /LIBRO_COSTO_HUELLA_DISTINTA/);
  assert.ok(activar.includes(`'${ORIGEN_ACTIVACION_COSTOS}'`), "el origen del punto cero no es el de libroCostos.js");
});

test("4. LOS CAMPOS DE LA BASE: los mismos en el trigger, en la función, en JS y en el schema", () => {
  const trigger = /CREATE TRIGGER "ProductoBase_costo_version"([\s\S]*?)EXECUTE FUNCTION/.exec(MIGRACION)[1];
  assert.deepEqual(columnasDelUpdateOf(trigger), ["id", ...CAMPOS_BASE]);
  const detectados = [...cuerpo("libro_costo_base_registrar").matchAll(/v_campos \|\| '([^']+)'::text/g)].map((x) => x[1]);
  assert.deepEqual(detectados, [...CAMPOS_BASE]);
  // Nombres REALES: una columna escrita de memoria compila y falla recién contra
  // la base (regla 2 de CLAUDE.md).
  const reales = camposDelModelo("ProductoBase");
  for (const c of CAMPOS_BASE) assert.ok(reales.includes(c), `ProductoBase no tiene ${c}`);
});

test("5. LOS CAMPOS DE LA UBICACIÓN, Y EL DEPÓSITO", () => {
  const trigger = /CREATE TRIGGER "ProductoLocal_costo_version"([\s\S]*?)EXECUTE FUNCTION/.exec(MIGRACION)[1];
  assert.deepEqual(columnasDelUpdateOf(trigger), ["id", "localId", "baseId", ...CAMPOS_UBICACION]);
  const reales = camposDelModelo("ProductoLocal");
  for (const c of ["localId", "baseId", ...CAMPOS_UBICACION]) assert.ok(reales.includes(c), `ProductoLocal no tiene ${c}`);
  assert.ok(camposDelModelo("Local").includes("es_deposito"));
  assert.ok(cuerpo("libro_costo_local_registrar").includes(`ARRAY['${CAMPO_ES_DEPOSITO}']`));
  assert.match(MIGRACION, /AFTER UPDATE OF "es_deposito" ON "Local"/);
});

test("6. EL ORIGEN ES EL DE origenDeCosto.js, NO OTRO", () => {
  // Un solo sistema de origen: el trigger lee lo que `declararOrigenDeCosto`
  // escribe. Si una mitad cambia el nombre, el origen se pierde en silencio.
  assert.ok(cuerpo("libro_costo_origen").includes(`current_setting('${CONFIG_COSTO_ORIGEN}', true)`));
  assert.ok(cuerpo("libro_costo_origen").includes(`'${SIN_ORIGEN_COSTO}'`));
  assert.ok(cuerpo("libro_costo_origen_ref").includes(`current_setting('${CONFIG_COSTO_ORIGEN_REF}', true)`));
});

test("7. LA HISTORIA NO SE TOCA: inmutable desde la migración, sin TRUNCATE desde la activación", () => {
  for (const tabla of ["CostoBaseVersion", "CostoUbicacionVersion", "LibroCostoActivacion"]) {
    assert.match(MIGRACION, new RegExp(`CREATE TRIGGER "${tabla}_inmutable"\\s+BEFORE UPDATE OR DELETE ON "${tabla}"`));
    assert.match(MIGRACION, new RegExp(`CREATE TRIGGER "${tabla}_solo_su_captura"\\s+BEFORE INSERT ON "${tabla}"`));
    assert.match(cuerpo("libro_costo_activar"), new RegExp(`CREATE TRIGGER "${tabla}_sin_truncate"\\s+BEFORE TRUNCATE ON "${tabla}"`));
  }
});

test("8. SIN CLAVES FORÁNEAS: la historia sobrevive a lo que describe", () => {
  for (const modelo of ["CostoBaseVersion", "CostoUbicacionVersion", "LibroCostoActivacion"]) {
    const bloque = new RegExp(`\\nmodel ${modelo} \\{([\\s\\S]*?)\\n\\}`).exec(SCHEMA)[1];
    assert.doesNotMatch(bloque.replace(/\/\/[^\n]*/g, ""), /@relation/, `${modelo} tiene una relación`);
  }
  assert.doesNotMatch(MIGRACION, /REFERENCES/);
});

test("9. UNA VERSIÓN DEL LIBRO ES UN PRODUCTO PARA costoPorUnidadFisica, SIN ADAPTADOR", () => {
  // Las columnas de CostoBaseVersion son los nombres que la función canónica
  // lee. Así el Stock Diario va a valorizar con la MISMA función que el POS y no
  // con una conversión escrita al lado.
  const columnas = camposDelModelo("CostoBaseVersion");
  for (const c of ["precioCosto", "unidadMedida", "factorPack", "pesoReferenciaKg", "pesoEsFijo", "modoCompraProveedor", "modoVentaDeposito", "esCombo"]) {
    assert.ok(columnas.includes(c), `CostoBaseVersion no tiene ${c}`);
  }
  const maniComoVersion = {
    precioCosto: "4500.00", unidadMedida: "kg", factorPack: 2, pesoReferenciaKg: "2.000", pesoEsFijo: true,
    modoCompraProveedor: "UNIDAD", modoVentaDeposito: "PIEZA", esCombo: false,
  };
  const deposito = costoPorUnidadFisica({ costoBase: maniComoVersion.precioCosto, producto: maniComoVersion, esDeposito: true });
  const local = costoPorUnidadFisica({ costoBase: maniComoVersion.precioCosto, producto: maniComoVersion, esDeposito: false });
  assert.equal(deposito.unidadFisica, "PIEZA");
  assert.equal(deposito.costoPorUnidadFisica, 9000, "la pieza de 2 kg a $4.500/kg");
  assert.equal(local.costoPorUnidadFisica, 4500, "el factor 2 no divide el costo por kilo");
  const packComoVersion = { precioCosto: "12000.00", unidadMedida: "pack", factorPack: 6, esCombo: false };
  assert.equal(costoPorUnidadFisica({ costoBase: packComoVersion.precioCosto, producto: packComoVersion, esDeposito: true }).costoPorUnidadFisica, 2000);
  assert.equal(
    costoPorUnidadFisica({ costoBase: "100.00", producto: { unidadMedida: "unidad", esCombo: true }, esDeposito: true }).estado,
    "NO_APLICA"
  );
});

test("10. NO SE MEZCLA CON EL LIBRO DE STOCK", () => {
  // El diagnóstico de recuperación del libro de stock inventaría triggers por
  // `%libro%` y funciones por `libro_stock%`. Un objeto de este libro con esos
  // nombres ensuciaría ese inventario en producción.
  const triggers = [...MIGRACION.matchAll(/CREATE TRIGGER "([^"]+)"/g)].map((x) => x[1]);
  assert.ok(triggers.length >= 12);
  for (const t of triggers) assert.doesNotMatch(t, /libro/, `el trigger ${t} tiene "libro" en minúscula`);
  const funciones = [...MIGRACION.matchAll(/CREATE FUNCTION "([^"]+)"/g)].map((x) => x[1]);
  for (const f of funciones) assert.match(f, /^libro_costo_/, `la función ${f} no es del libro de costos`);
});

test("11. LOS ESTADOS DE JS SON LOS QUE DEVUELVE EL SQL", () => {
  const estado = cuerpo("libro_costo_estado");
  for (const e of Object.values(ESTADO_LIBRO_COSTOS)) assert.ok(estado.includes(`estado := '${e}'`), `el SQL no devuelve ${e}`);
  assert.ok(estado.includes(SUFIJO_MIGRACION_ACTIVACION.replaceAll("_", "\\_")), "el estado no busca la migración de activación por su sufijo");
});
