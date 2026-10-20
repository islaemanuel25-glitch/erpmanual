-- `stock.control.gestionar` y `stock.control.contar` para los roles que YA EXISTEN.
--
-- ── QUÉ ES ────────────────────────────────────────────────────────────────
--
-- Los dos permisos del Control de stock: abrir y terminar un control, y contar
-- y corregir lo propio. Decisión de Emanuel (2026-10-20): los tienen el dueño y
-- el admin.
--
-- ── POR QUÉ ES UNA MIGRACIÓN ──────────────────────────────────────────────
--
-- `prisma/seed.js` no repisa los permisos de un rol existente, así que
-- agregarlos a `lib/rbac/systemRoles.js` solo alcanza a instalaciones nuevas.
-- Mismo patrón que `20261017120000_permiso_ventas_ver_dia`.
--
-- ── A QUIÉN ───────────────────────────────────────────────────────────────
--
-- Solo DUEÑO_LOCAL. Admin no hace falta: tiene el comodín y el `WHERE` lo
-- excluye. Los operadores con PIN no tienen rol: heredan los permisos de la
-- cuenta del local (`lib/rbac/permisosDelOperador.js`), así que acá no hay nada
-- de operadores.
--
-- Concatena con `||`, no reemplaza: los ajustes hechos a mano se conservan. El
-- `NOT (@> ...)` la hace idempotente, y `jsonb_typeof` evita fusionar sobre una
-- fila que no guarde un array. Después manda la pantalla de Roles.

UPDATE "Rol"
   SET "permisos" = "permisos" || '["stock.control.gestionar"]'::jsonb,
       "updatedAt" = NOW()
 WHERE jsonb_typeof("permisos") = 'array'
   AND NOT ("permisos" @> '["stock.control.gestionar"]'::jsonb)
   AND NOT ("permisos" @> '["*"]'::jsonb)
   AND "nombre" = 'DUEÑO_LOCAL';

UPDATE "Rol"
   SET "permisos" = "permisos" || '["stock.control.contar"]'::jsonb,
       "updatedAt" = NOW()
 WHERE jsonb_typeof("permisos") = 'array'
   AND NOT ("permisos" @> '["stock.control.contar"]'::jsonb)
   AND NOT ("permisos" @> '["*"]'::jsonb)
   AND "nombre" = 'DUEÑO_LOCAL';
