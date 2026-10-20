-- `stock.control.gestionar` y `stock.control.contar` también para ENCARGADO.
--
-- ── QUÉ ES ────────────────────────────────────────────────────────────────
--
-- Decisión de Emanuel (2026-10-20): el encargado también abre, termina y
-- cuenta un control de stock. `20261020120100_permisos_control_stock_dueno_local`
-- se los dio solo al dueño; ésta hace lo mismo para el encargado.
--
-- ── POR QUÉ ES UNA MIGRACIÓN ──────────────────────────────────────────────
--
-- `prisma/seed.js` no repisa los permisos de un rol existente, así que
-- agregarlos a `lib/rbac/systemRoles.js` solo alcanza a instalaciones nuevas.
-- Mismo patrón que `20261017120000_permiso_ventas_ver_dia`.
--
-- No es un relleno de esquema: solo concatena dos códigos al array de un rol.
-- No saca ninguno, no toca otro rol, y el `NOT (@> ...)` la hace idempotente.
-- Admin queda afuera por el comodín. Con un operador activo por PIN, abrir y
-- terminar se le restan a la cuenta en la aplicación
-- (`lib/rbac/permisosDelOperador.js`), no acá.

UPDATE "Rol"
   SET "permisos" = "permisos" || '["stock.control.gestionar"]'::jsonb,
       "updatedAt" = NOW()
 WHERE jsonb_typeof("permisos") = 'array'
   AND NOT ("permisos" @> '["stock.control.gestionar"]'::jsonb)
   AND NOT ("permisos" @> '["*"]'::jsonb)
   AND "nombre" = 'ENCARGADO';

UPDATE "Rol"
   SET "permisos" = "permisos" || '["stock.control.contar"]'::jsonb,
       "updatedAt" = NOW()
 WHERE jsonb_typeof("permisos") = 'array'
   AND NOT ("permisos" @> '["stock.control.contar"]'::jsonb)
   AND NOT ("permisos" @> '["*"]'::jsonb)
   AND "nombre" = 'ENCARGADO';
