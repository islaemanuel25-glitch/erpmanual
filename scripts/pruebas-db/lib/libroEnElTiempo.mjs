// scripts/pruebas-db/lib/libroEnElTiempo.mjs
//
// UN LIBRO DE STOCK CON DÍAS DISTINTOS, EN UNA BASE DESCARTABLE. Lo comparten las
// pruebas de base del Stock Diario: la del motor (`stockDiario.mjs`) y la de la
// API (`stockDiarioApi.mjs`).
//
// El libro estampa el reloj del momento, así que una prueba que corre en un
// minuto escribe todo en el mismo día. Las escrituras se hacen DE VERDAD sobre
// StockLocal —el trigger decide el tipo, los saldos, la identidad congelada y la
// cadena— y después, en la base descartable, se REUBICAN en el tiempo: se
// reescribe `instante` y `dia` de cada movimiento con el momento del guion,
// calculando el día con `libro_stock_dia`, la misma función que usa el trigger.
//
// Solo para bases descartables: escribe el libro, que en cualquier otra base es
// inmutable. No construye ningún cliente: cada prueba trae el suyo, de la fábrica.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DIR_MIGRACIONES = path.join(RAIZ, "prisma", "migrations");

export const MIGRACION_LIBRO = "20260927120000_libro_stock";

export const MIGRACIONES = fs
  .readdirSync(DIR_MIGRACIONES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

/** Aplica los migration.sql del repo en orden, cada uno en su transacción, como Prisma. */
export function aplicarMigraciones(url, { hasta = null, solo = null } = {}) {
  const lista = solo ?? MIGRACIONES.filter((m) => hasta === null || m < hasta);
  for (const m of lista) {
    execFileSync("psql", [url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-1", "-f", path.join(DIR_MIGRACIONES, m, "migration.sql")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  return lista.length;
}

/** Las migraciones del libro en adelante: se aplican DESPUÉS de sembrar, así el punto cero tiene filas. */
export const aplicarLibroEnAdelante = (url) => aplicarMigraciones(url, { solo: MIGRACIONES.filter((m) => m >= MIGRACION_LIBRO) });

// Un momento del guion en hora ARGENTINA, pasado a UTC por PostgreSQL con la zona
// explícita: Node no convierte ninguna hora en estas pruebas.
export const AR = (texto) => `(timestamp '${texto}' AT TIME ZONE 'America/Argentina/Cordoba') AT TIME ZONE 'UTC'`;

/** La primera fila de una consulta. */
export async function uno(c, sql) {
  const filas = await c.$queryRawUnsafe(sql);
  return filas[0];
}

/**
 * El guion: cada paso escribe de verdad y anota qué ids del libro produjo y en
 * qué momento argentino tienen que quedar. `reubicar` los mueve al final.
 */
export function guion(c) {
  const pasos = [];
  const maximo = async () => {
    const [r] = await c.$queryRaw`
      SELECT coalesce((SELECT max("id") FROM "MovimientoStock"), 0)::int AS "m",
             coalesce((SELECT max("id") FROM "ReinterpretacionDeStock"), 0)::int AS "r"`;
    return r;
  };
  return {
    /** El punto cero: todo lo que el libro ya tiene al empezar el guion. */
    async puntoCero(momento) {
      pasos.push({ momento, antes: { m: 0, r: 0 }, despues: await maximo() });
    },
    async paso(momento, fn) {
      const antes = await maximo();
      await fn();
      const despues = await maximo();
      pasos.push({ momento, antes, despues });
      return despues.m - antes.m;
    },
    async reubicar() {
      await c.$executeRawUnsafe(`ALTER TABLE "MovimientoStock" DISABLE TRIGGER "MovimientoStock_inmutable"`);
      await c.$executeRawUnsafe(`ALTER TABLE "ReinterpretacionDeStock" DISABLE TRIGGER "ReinterpretacionDeStock_inmutable"`);
      for (const p of pasos) {
        const t = AR(p.momento);
        await c.$executeRawUnsafe(
          `UPDATE "MovimientoStock" SET "instante" = (${t})::timestamp(3), "dia" = "libro_stock_dia"((${t})::timestamp(3)) WHERE "id" > ${p.antes.m} AND "id" <= ${p.despues.m}`
        );
        await c.$executeRawUnsafe(
          `UPDATE "ReinterpretacionDeStock" SET "instante" = (${t})::timestamp(3), "dia" = "libro_stock_dia"((${t})::timestamp(3)) WHERE "id" > ${p.antes.r} AND "id" <= ${p.despues.r}`
        );
      }
      await c.$executeRawUnsafe(`ALTER TABLE "MovimientoStock" ENABLE TRIGGER "MovimientoStock_inmutable"`);
      await c.$executeRawUnsafe(`ALTER TABLE "ReinterpretacionDeStock" ENABLE TRIGGER "ReinterpretacionDeStock_inmutable"`);
    },
  };
}
