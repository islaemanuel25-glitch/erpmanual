-- CAJA POR OPERADOR: la caja abierta se identifica por quién responde por ella.
--
-- La cuenta ERP autentica el acceso; el operador del PIN responde por su cajón.
-- En el mostrador real varios operadores comparten UNA cuenta del local y cada
-- uno tiene su propio cajón físico. El índice que había,
-- "Turno_local_vendedor_abierto_key" sobre (localId, vendedorId), les impedía
-- abrir dos turnos con la misma cuenta y los obligaba a compartir uno solo: sus
-- ventas, sus retiros y su conteo se mezclaban, y un −5.000 y un +5.000 se
-- compensaban en un cajón "sin diferencia".
--
-- Se reemplaza por DOS índices únicos parciales, uno por cada forma de turno:
--
--   CON operador → único (localId, operadorId): el operador A tiene a lo sumo
--                  una caja operativa por local, con la cuenta que sea. Dos
--                  operadores con la misma cuenta, una cada uno.
--   SIN operador → único (localId, vendedorId): la garantía de siempre para los
--                  locales sin operario, Admin y Dueño que operan sin PIN, y
--                  todos los turnos históricos.
--
-- "Operativo" es la misma condición que el índice anterior y que
-- `WHERE_TURNO_OPERATIVO` en lib/caja/cierreRelevo.js: sin cerrar y sin el
-- corte de cierre tomado. Un turno cortado no bloquea —es el relevo— y un
-- anulado ya tiene `cierre`.
--
-- NO ESCRIBE NINGÚN DATO. No hay backfill, no se elige un turno, no se cierra
-- nada y no se reinterpreta la historia: un turno sin operador sigue siendo una
-- caja de cuenta.
--
-- ORDEN, Y POR QUÉ:
--
--   1. La GUARDIA. Si hoy existe un operador con más de una caja operativa en
--      el mismo local —posible con el índice viejo: dos cuentas distintas—, el
--      índice nuevo no se puede crear. En vez de dejar que Postgres falle con un
--      "could not create unique index" que no dice qué turnos son, la guardia
--      aborta nombrándolos. Resolverlo —cerrar uno de los dos— es una decisión
--      de una persona, no de una migración.
--   2. Se crean los índices nuevos.
--   3. Recién entonces se borra el viejo.
--
-- Si algo falla, no queda un tramo sin garantía: el archivo corre entero en una
-- transacción. Medido, no supuesto: con el DROP forzado a fallar, los dos
-- índices nuevos tampoco quedaron. Y aun si no fuera así, el viejo se borra
-- último.
--
-- La sonda de solo lectura que detecta el conflicto ANTES de migrar está en
-- docs/deploy/MIGRACIONES-SIN-APLICAR.md, que /deploy lee en su paso 0: es
-- requisito del despliegue que traiga esta migración.
--
-- Prisma no soporta `WHERE` en @@unique: los dos índices viven solo en SQL,
-- documentados en el modelo Turno de schema.prisma y comprobados con su
-- predicado exacto por scripts/pruebas-db/estructura.mjs.

DO $guardia$
DECLARE
  conflictos text;
BEGIN
  SELECT string_agg(
           format('local %s, operador %s: turnos %s', g."localId", g."operadorId", g.ids),
           '; ' ORDER BY g."localId", g."operadorId")
    INTO conflictos
    FROM (
      SELECT "localId", "operadorId", string_agg(id::text, ', ' ORDER BY id) AS ids
        FROM "Turno"
       WHERE "cierre" IS NULL
         AND "cierreEnPreparacionEn" IS NULL
         AND "operadorId" IS NOT NULL
       GROUP BY "localId", "operadorId"
      HAVING count(*) > 1
    ) g;

  IF conflictos IS NOT NULL THEN
    RAISE EXCEPTION
      'caja_por_operador: hay operadores con más de una caja operativa en el mismo local (%). La migración no elige ni cierra turnos: cerrá los que sobran desde la aplicación y volvé a desplegar.',
      conflictos;
  END IF;

  -- La forma sin operador está cubierta por el índice viejo, que es más
  -- estricto; se comprueba igual para que la guardia no dependa de eso.
  SELECT string_agg(
           format('local %s, cuenta %s: turnos %s', g."localId", g."vendedorId", g.ids),
           '; ' ORDER BY g."localId", g."vendedorId")
    INTO conflictos
    FROM (
      SELECT "localId", "vendedorId", string_agg(id::text, ', ' ORDER BY id) AS ids
        FROM "Turno"
       WHERE "cierre" IS NULL
         AND "cierreEnPreparacionEn" IS NULL
         AND "operadorId" IS NULL
       GROUP BY "localId", "vendedorId"
      HAVING count(*) > 1
    ) g;

  IF conflictos IS NOT NULL THEN
    RAISE EXCEPTION
      'caja_por_operador: hay cuentas con más de una caja operativa sin operador en el mismo local (%). La migración no elige ni cierra turnos.',
      conflictos;
  END IF;
END
$guardia$;

CREATE UNIQUE INDEX "Turno_local_operador_abierto_key"
    ON "Turno" ("localId", "operadorId")
 WHERE "cierre" IS NULL
   AND "cierreEnPreparacionEn" IS NULL
   AND "operadorId" IS NOT NULL;

CREATE UNIQUE INDEX "Turno_local_cuenta_sin_operador_abierto_key"
    ON "Turno" ("localId", "vendedorId")
 WHERE "cierre" IS NULL
   AND "cierreEnPreparacionEn" IS NULL
   AND "operadorId" IS NULL;

DROP INDEX "Turno_local_vendedor_abierto_key";
