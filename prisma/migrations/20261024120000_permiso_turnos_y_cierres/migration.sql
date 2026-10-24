-- `posventas.turnos.ver` para el rol DUEÑO_LOCAL que YA EXISTE.
--
-- ── QUÉ ES ────────────────────────────────────────────────────────────────
--
-- La puerta de "Turnos y cierres" y de "Turnos y cierres (anterior)": la
-- entrada del menú, las pantallas y las rutas que solo ellas usan. Decisión de
-- Emanuel (2026-10-24): las ven el dueño y el admin, ningún otro rol ni los
-- operadores por PIN.
--
-- ── POR QUÉ ES UNA MIGRACIÓN ──────────────────────────────────────────────
--
-- `prisma/seed.js` no repisa los permisos de un rol existente, así que
-- agregarlo a `lib/rbac/systemRoles.js` solo alcanza a instalaciones nuevas.
-- Mismo patrón que `20261020120100_permisos_control_stock_dueno_local`.
--
-- ── A QUIÉN ───────────────────────────────────────────────────────────────
--
-- Solo DUEÑO_LOCAL. Admin no hace falta: tiene el comodín y el `WHERE` lo
-- excluye. Los operadores con PIN no tienen rol: heredan los permisos de la
-- cuenta del local, y éste se les resta en la aplicación
-- (`lib/rbac/permisosDelOperador.js`), no acá.
--
-- Concatena con `||`, no reemplaza: los ajustes hechos a mano se conservan. El
-- `NOT (@> ...)` la hace idempotente, y `jsonb_typeof` evita fusionar sobre una
-- fila que no guarde un array. Después manda la pantalla de Roles.

UPDATE "Rol"
   SET "permisos" = "permisos" || '["posventas.turnos.ver"]'::jsonb,
       "updatedAt" = NOW()
 WHERE jsonb_typeof("permisos") = 'array'
   AND NOT ("permisos" @> '["posventas.turnos.ver"]'::jsonb)
   AND NOT ("permisos" @> '["*"]'::jsonb)
   AND "nombre" = 'DUEÑO_LOCAL';
