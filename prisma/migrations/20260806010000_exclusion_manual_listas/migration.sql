-- EXCLUSIÓN MANUAL de filas desde la pantalla de revisión.
--
-- Aditiva: una columna booleana con default false. No borra, no transforma y no
-- reescribe ninguna fila. Las importaciones existentes quedan con todas sus
-- filas en `false`, que es exactamente "nadie excluyó nada".

ALTER TABLE "ImportacionListaFila" ADD COLUMN "excluidaManual" BOOLEAN NOT NULL DEFAULT false;
