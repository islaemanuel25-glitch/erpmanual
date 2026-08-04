-- UN SOBRE DE CAMBIO **VIGENTE** POR TURNO, no uno solo para siempre.
--
-- POR QUÉ CAMBIA AHORA
--
-- Hasta la migración anterior el sobre se creaba recién al CONFIRMAR el cierre,
-- y como un turno se confirma una sola vez, un `UNIQUE` total sobre
-- `turnoOrigenId` alcanzaba.
--
-- Desde que el cambio se separa antes del corte, el sobre se publica AL CORTAR.
-- Eso abre un caso que antes no existía: tomar el corte, cancelarlo —lo que deja
-- el sobre en CANCELADO— y volver a cortar. Con la unicidad total, el segundo
-- corte chocaba contra el sobre cancelado del primero y el turno quedaba
-- imposible de cerrar. Reproducido en scripts/integracion-cierre-relevo.mjs.
--
-- Borrar el sobre cancelado en lugar de excluirlo habría hecho desaparecer la
-- evidencia de que un cambio se publicó y se retiró de circulación, que es
-- justamente lo que hay que poder auditar después de una cancelación.
--
-- Mismo patrón que "CierrePreparacion_turno_vigente_key" y
-- "RetiroPreparacion_turno_vigente_key": Prisma no expresa `WHERE` en @@unique,
-- así que la unicidad real vive únicamente acá.
--
-- ES SEGURA SOBRE DATOS EXISTENTES: el índice nuevo es MÁS PERMISIVO que el que
-- reemplaza. Todo conjunto de filas que cumplía el UNIQUE total cumple también
-- el parcial, así que no puede fallar por datos previos.

DROP INDEX IF EXISTS "CambioPendiente_turnoOrigenId_key";

CREATE UNIQUE INDEX "CambioPendiente_turnoOrigen_vigente_key"
    ON "CambioPendiente" ("turnoOrigenId")
    WHERE "estado" <> 'CANCELADO';

-- El índice común que sostiene las búsquedas por turno de origen, que antes
-- venía gratis con el UNIQUE.
CREATE INDEX "CambioPendiente_turnoOrigenId_idx" ON "CambioPendiente"("turnoOrigenId");
