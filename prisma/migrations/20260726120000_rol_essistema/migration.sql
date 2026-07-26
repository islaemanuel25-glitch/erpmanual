-- E3: Roles de sistema (Admin, CAJERO, ENCARGADO, DUEÑO_LOCAL).
-- Aditiva y compatible: columna con default false para las filas existentes.

ALTER TABLE "Rol" ADD COLUMN "esSistema" BOOLEAN NOT NULL DEFAULT false;

-- Marcar los roles de sistema que ya puedan existir. CAJERO/ENCARGADO/DUEÑO_LOCAL
-- pueden no existir todavía (los crea el seed idempotente en E4): el UPDATE no
-- afecta filas inexistentes y el seed los creará con esSistema=true.
UPDATE "Rol" SET "esSistema" = true
WHERE "nombre" IN ('Admin', 'CAJERO', 'ENCARGADO', 'DUEÑO_LOCAL');
