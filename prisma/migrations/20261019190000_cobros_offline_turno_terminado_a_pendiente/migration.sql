-- Los cobros offline que quedaron EN REVISIÓN por "turno terminado" vuelven al
-- camino normal.
--
-- ── POR QUÉ ───────────────────────────────────────────────────────────────
--
-- `7b4f742` bloqueaba la venta de una caja cuyo turno operativo había
-- terminado (409 `TURNO_TERMINADO`), y un cobro offline que llegaba con ese
-- rechazo pasaba a `REQUIERE_REVISION` con `revisionMotivo = 'TURNO_TERMINADO'`.
-- Emanuel lo marcó como error: el horario del turno dice a qué turno pertenece
-- una caja, no a qué hora se corta. El bloqueo se sacó, y estos cobros se
-- procesan como los de cualquier caja abierta.
--
-- ── QUÉ HACE ──────────────────────────────────────────────────────────────
--
-- Solo toca cobros en `REQUIERE_REVISION` con ese motivo. Con la caja todavía
-- operativa vuelven a `PENDIENTE`: la cola del POS los manda en la próxima
-- sincronización, como cualquier otro, y mientras tanto la caja no se cierra
-- con ellos sin resolver (igual que con cualquier cobro pendiente). Con la caja
-- ya cerrada, anulada o en corte, la venta no puede entrar sola: quedan en
-- revisión, pero con el motivo que hoy les da la regla normal
-- (`lib/pos-ventas/rechazoVenta.js`, en el orden de `estadoDelTurno`), para que
-- nadie busque un "turno terminado" que ya no existe.
--
-- `ultimoRechazo*` no se toca: es la evidencia de lo que pasó. Correrla dos
-- veces no cambia nada: después de la primera no queda ningún cobro con ese
-- motivo.

UPDATE "CobroOffline" c
SET
  "estado" = CASE
    WHEN t."anuladoEn" IS NULL AND t."cierre" IS NULL AND t."cierreEnPreparacionEn" IS NULL
      THEN 'PENDIENTE'::"EstadoCobroOffline"
    ELSE 'REQUIERE_REVISION'::"EstadoCobroOffline"
  END,
  "revisionMotivo" = CASE
    WHEN t."anuladoEn" IS NOT NULL THEN 'TURNO_ANULADO'
    WHEN t."cierre" IS NOT NULL THEN 'TURNO_CERRADO'
    WHEN t."cierreEnPreparacionEn" IS NOT NULL THEN 'TURNO_EN_CORTE'
    ELSE NULL
  END
FROM "Turno" t
WHERE t."id" = c."turnoId"
  AND c."estado" = 'REQUIERE_REVISION'
  AND c."revisionMotivo" = 'TURNO_TERMINADO';
