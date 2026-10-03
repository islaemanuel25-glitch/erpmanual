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
-- ORDEN, Y POR QUÉ, EN UNA SOLA SENTENCIA:
--
-- Mientras esta migración corre, la app vieja sigue vendiendo, y `Turno` es
-- una tabla caliente: cada venta la lee, y el retiro, el cierre y los pagos
-- toman su fila con FOR UPDATE. Es el mismo problema que resolvió
-- `20260927120000_libro_stock`, y se resuelve igual:
--
--   1. Tope de espera de 3 s, local a la transacción. Si hay una transacción
--      larga sobre `Turno`, la migración falla rápido en vez de quedar
--      esperando —y, mientras espera, encolando detrás de ella todas las
--      consultas del POS a `Turno`—.
--   2. `LOCK TABLE "Turno" IN ACCESS EXCLUSIVE MODE`, PRIMERO. Es el modo que
--      pide el DROP INDEX del final; tomarlo al principio evita pedir un
--      candado más fuerte a mitad de camino, que es como se arma un deadlock
--      con una sesión que llegó en el medio. Frena lecturas y escrituras de
--      `Turno` solo mientras se construyen dos índices sobre una tabla chica.
--   3. La GUARDIA, ya con el candado: nadie puede abrir un turno entre que se
--      pregunta y se crea el índice. Si hoy existe un operador con más de una
--      caja operativa en el mismo local —posible con el índice viejo: dos
--      cuentas distintas—, aborta nombrándolos en vez de dejar un "could not
--      create unique index" que no dice qué turnos son. Resolverlo —cerrar uno
--      de los dos— es una decisión de una persona, no de una migración.
--   4. Se crean los índices nuevos.
--   5. Recién entonces se borra el viejo.
--
-- Es un bloque DO porque un DO es una sola sentencia y PostgreSQL la ejecuta
-- entera o nada, la envuelva Prisma en una transacción o no: no existe un
-- instante sin el índice viejo y sin los nuevos. Si falla —por la guardia o
-- por el tope de espera—, la base queda exactamente como estaba.
--
-- NO HAY RECUPERACIÓN AUTOMÁTICA. Una migración fallida queda registrada como
-- tal y /deploy no tiene autorizado marcarla para reintentar: FRENAR e
-- informar. Por eso el precheck pregunta antes por duplicados y por candados.
-- Probado en scripts/pruebas-db/migracionCajaPorOperador.mjs: con conflicto,
-- con un candado retenido sobre `Turno`, y limpia.
--
-- La sonda de solo lectura que detecta el conflicto ANTES de migrar está en
-- docs/deploy/MIGRACIONES-SIN-APLICAR.md, que /deploy lee en su paso 0: es
-- requisito del despliegue que traiga esta migración.
--
-- Prisma no soporta `WHERE` en @@unique: los dos índices viven solo en SQL,
-- documentados en el modelo Turno de schema.prisma y comprobados con su
-- predicado exacto por scripts/pruebas-db/estructura.mjs.

DO $caja_por_operador$
DECLARE
  conflictos text;
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);

  LOCK TABLE "Turno" IN ACCESS EXCLUSIVE MODE;

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
END
$caja_por_operador$;
