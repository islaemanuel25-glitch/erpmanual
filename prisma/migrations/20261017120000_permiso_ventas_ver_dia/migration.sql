-- `ventas.ver_dia` para los roles que YA EXISTEN.
--
-- ── QUÉ ES ────────────────────────────────────────────────────────────────
--
-- El total y la cantidad de tickets del día en el Panel
-- (`GET /api/dashboard/resumen`). Hasta hoy esa ruta no pedía ningún permiso:
-- cualquier sesión del local, y con ella cualquier operador activo por PIN,
-- veía cuánto vendió el local. Decisión de Emanuel (2026-10-17): un operador no
-- lo ve. Con un operador activo el permiso se le RESTA a la cuenta
-- (`lib/rbac/permisosDelOperador.js`), así que acá no hay nada de operadores:
-- los operadores no tienen rol.
--
-- ── POR QUÉ ES UNA MIGRACIÓN ──────────────────────────────────────────────
--
-- `prisma/seed.js` no repisa los permisos de un rol existente, así que
-- agregarlo a `lib/rbac/systemRoles.js` solo alcanza a instalaciones nuevas. Es
-- el mismo patrón de `20260905150000_permiso_medios_cobro_dueno_local`.
--
-- ── A QUIÉN ───────────────────────────────────────────────────────────────
--
-- 1. ENCARGADO y DUEÑO_LOCAL, que es lo pedido.
-- 2. Además, los roles PERSONALIZADOS que ya tienen `reportes.ver` o
--    `finanzas.ver`. Sin esto, una cuenta con rol propio que hoy ve el total
--    —sin operador activo— lo dejaría de ver por un permiso que no existía:
--    quien ya ve los reportes de ventas o Finanzas ya ve números más finos que
--    éste, así que no se abre nada nuevo.
--
-- CAJERO no: un cajero no ve cuánto vendió el local. Admin no hace falta: tiene
-- el comodín y el `WHERE` lo excluye.
--
-- Concatena con `||`, no reemplaza: los ajustes hechos a mano se conservan. El
-- `NOT (@> ...)` del propio permiso la hace idempotente, y `jsonb_typeof` evita
-- fusionar sobre una fila que no guarde un array. Después manda la pantalla de
-- Roles en los dos sentidos.

UPDATE "Rol"
   SET "permisos" = "permisos" || '["ventas.ver_dia"]'::jsonb,
       "updatedAt" = NOW()
 WHERE jsonb_typeof("permisos") = 'array'
   AND NOT ("permisos" @> '["ventas.ver_dia"]'::jsonb)
   AND NOT ("permisos" @> '["*"]'::jsonb)
   AND (
         "nombre" IN ('ENCARGADO', 'DUEÑO_LOCAL')
      OR (
           "esSistema" = false
           AND (   "permisos" @> '["reportes.ver"]'::jsonb
                OR "permisos" @> '["finanzas.ver"]'::jsonb)
         )
   );
