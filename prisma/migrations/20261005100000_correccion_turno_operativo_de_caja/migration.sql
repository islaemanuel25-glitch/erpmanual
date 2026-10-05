-- CORRECCIÓN DEL TURNO OPERATIVO DE UNA CAJA ABIERTA.
--
-- `20261004200000_turno_operativo` dejó el turno y la fecha operativa de una
-- caja INMUTABLES una vez escritos, con el trigger
-- `Turno_turno_operativo_inmutable`. La regla sigue siendo ésa. Esta migración
-- le agrega UNA excepción, decidida por Emanuel el 2026-10-05: quien abrió
-- eligiendo el turno equivocado lo corrige sin cerrar la caja.
--
-- Corregir es reclasificar LA CAJA ENTERA: no la divide, no crea otra y no
-- toca ventas, movimientos ni arqueos. Cambian solo `turnoOperativoId` y
-- `fechaOperativa`, y solo si TODO esto se cumple:
--
--   · de un valor a otro: la caja ya tenía turno y fecha, y los sigue teniendo.
--     Una caja sin turno no recibe uno (no hay backfill) y una con turno no lo
--     pierde;
--   · la caja está ABIERTA, antes y después de la escritura: sin `cierre`, sin
--     corte en preparación (`cierreEnPreparacionEn`) y sin anular —los mismos
--     tres datos con que `estadoDelTurno` decide el estado—;
--   · ninguna entrega de efectivo de la caja está en una verificación VIGENTE.
--     La verificación quedó atada al turno y la fecha de la caja al verificarse
--     (`verificacion_entrega_del_turno_operativo`); cambiarlos la dejaría
--     apuntando a un turno que la caja ya no tiene.
--
-- La base defiende esas invariantes de estructura. Qué turno era posible en la
-- apertura de esa caja y con qué fecha operativa lo decide el servidor, con la
-- regla del ciclo (`lib/caja/turnoOperativoServer.js`): eso no se repite acá.
-- El par turno + fecha y el turno del mismo local los siguen sosteniendo el
-- CHECK y la FK compuesta de la migración anterior.
--
-- ── QUÉ HACE `migrate deploy` EN PRODUCCIÓN ────────────────────────────────
--
-- Reemplaza el cuerpo de la función `turno_operativo_de_caja_inmutable`. El
-- trigger es el mismo y no se recrea. No toca ninguna tabla ni ningún dato: no
-- toma candados sobre `Turno`.

CREATE OR REPLACE FUNCTION "turno_operativo_de_caja_inmutable"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."turnoOperativoId" IS NOT DISTINCT FROM OLD."turnoOperativoId"
     AND NEW."fechaOperativa" IS NOT DISTINCT FROM OLD."fechaOperativa" THEN
    RETURN NEW;
  END IF;

  -- De un valor a otro, nunca desde NULL ni hacia NULL.
  IF OLD."turnoOperativoId" IS NULL OR OLD."fechaOperativa" IS NULL
     OR NEW."turnoOperativoId" IS NULL OR NEW."fechaOperativa" IS NULL THEN
    RAISE EXCEPTION 'El turno operativo y la fecha operativa de una caja se fijan al abrirla y no cambian (caja %): una caja sin turno no recibe uno y una con turno no lo pierde', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  -- Solo con la caja abierta, antes y después.
  IF OLD."cierre" IS NOT NULL OR OLD."cierreEnPreparacionEn" IS NOT NULL OR OLD."anuladoEn" IS NOT NULL
     OR NEW."cierre" IS NOT NULL OR NEW."cierreEnPreparacionEn" IS NOT NULL OR NEW."anuladoEn" IS NOT NULL THEN
    RAISE EXCEPTION 'El turno operativo de una caja solo se corrige con la caja abierta, y no cambia una vez cerrada, en cierre o anulada (caja %)', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  -- Ni con efectivo de la caja en una verificación vigente.
  IF EXISTS (
    SELECT 1
      FROM "VerificacionEfectivoEntrega" e
      JOIN "CajaMovimiento" m ON m."id" = e."cajaMovimientoId"
     WHERE m."turnoId" = OLD."id" AND e."vigente"
  ) THEN
    RAISE EXCEPTION 'La caja % tiene efectivo en una verificación vigente: su turno operativo no cambia mientras la verificación siga vigente', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
