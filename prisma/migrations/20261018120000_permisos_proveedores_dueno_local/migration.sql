-- `proveedores.ver`, `proveedores.crear` y `proveedores.editar` para el rol
-- DUEÑO_LOCAL que YA EXISTE.
--
-- ── QUÉ ES ────────────────────────────────────────────────────────────────
--
-- Decisión de Emanuel (2026-10-18): cada local tiene sus propios proveedores, y
-- sobre lo propio el dueño del local tiene los mismos poderes que el depósito.
-- Hasta hoy `/api/proveedores/crear` y `/api/proveedores/editar` pedían
-- administrador escrito a mano, y un DUEÑO_LOCAL recibía "Requiere
-- administrador" al dar de alta un proveedor. Las rutas pasan a pedir
-- `proveedores.crear` / `proveedores.editar` y a acotar al local de la sesión:
-- el proveedor nuevo queda en ese local, y solo se edita uno creado ahí.
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
-- excluye. ENCARGADO y CAJERO no: lo pedido es el dueño.
--
-- Concatena con `||`, no reemplaza: los ajustes hechos a mano se conservan. Un
-- UPDATE por permiso, cada uno con su `NOT (@> ...)`, así es idempotente aunque
-- el rol ya tenga alguno tildado a mano (`proveedores.ver` puede estarlo).
-- `jsonb_typeof` evita fusionar sobre una fila que no guarde un array.

UPDATE "Rol"
   SET "permisos" = "permisos" || '["proveedores.ver"]'::jsonb,
       "updatedAt" = NOW()
 WHERE jsonb_typeof("permisos") = 'array'
   AND NOT ("permisos" @> '["proveedores.ver"]'::jsonb)
   AND NOT ("permisos" @> '["*"]'::jsonb)
   AND "nombre" = 'DUEÑO_LOCAL';

UPDATE "Rol"
   SET "permisos" = "permisos" || '["proveedores.crear"]'::jsonb,
       "updatedAt" = NOW()
 WHERE jsonb_typeof("permisos") = 'array'
   AND NOT ("permisos" @> '["proveedores.crear"]'::jsonb)
   AND NOT ("permisos" @> '["*"]'::jsonb)
   AND "nombre" = 'DUEÑO_LOCAL';

UPDATE "Rol"
   SET "permisos" = "permisos" || '["proveedores.editar"]'::jsonb,
       "updatedAt" = NOW()
 WHERE jsonb_typeof("permisos") = 'array'
   AND NOT ("permisos" @> '["proveedores.editar"]'::jsonb)
   AND NOT ("permisos" @> '["*"]'::jsonb)
   AND "nombre" = 'DUEÑO_LOCAL';
