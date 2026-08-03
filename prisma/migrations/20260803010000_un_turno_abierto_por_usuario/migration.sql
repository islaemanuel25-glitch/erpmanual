-- Un turno abierto por USUARIO y local, no uno por local.
--
-- POR QUÉ
-- Un local puede tener varios dispositivos y varios cajeros trabajando al mismo
-- tiempo. La regla anterior —un turno abierto por local— dejaba sin poder operar
-- a cajeros que no tenían nada que ver con el turno abierto. Lo que sí no tiene
-- sentido es que UNA persona lleve dos cajas suyas a la vez.
--
-- El índice es PARCIAL: solo alcanza a los turnos abiertos (`cierre IS NULL`).
-- Un usuario puede tener cientos de turnos cerrados en el mismo local; lo único
-- que se impide es que tenga DOS abiertos, incluso ante dos aperturas simultáneas.
--
-- ADITIVA Y SEGURA: no crea ni modifica columnas, no toca datos. Verificado
-- contra producción antes de escribirla: hoy no hay ningún usuario con dos
-- turnos abiertos en el mismo local, y en toda la historia nunca lo hubo (0
-- pares solapados por mismo usuario), así que el índice se crea sin conflicto.
--
-- NOTA: el índice `Turno_fondoOrigenTurnoId_key` de la migración anterior NO se
-- toca. La herencia automática de fondo queda desactivada en la aplicación
-- —mientras no exista CajaFisica no se sabe qué cierre corresponde a qué cajón—,
-- pero la columna y los datos históricos se conservan intactos.

CREATE UNIQUE INDEX "Turno_local_vendedor_abierto_key"
    ON "Turno" ("localId", "vendedorId")
 WHERE "cierre" IS NULL;
