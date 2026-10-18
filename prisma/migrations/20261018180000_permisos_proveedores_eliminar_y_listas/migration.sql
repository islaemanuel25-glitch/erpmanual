-- `proveedores.eliminar` y `proveedores.listas` para el rol DUEÑO_LOCAL que YA
-- EXISTE.
--
-- ── QUÉ ES ────────────────────────────────────────────────────────────────
--
-- Completa `20261018120000_permisos_proveedores_dueno_local`. Decisión de
-- Emanuel (2026-10-18): sobre sus proveedores el dueño de un local hace TODO lo
-- que hace el admin, y nada sobre los de otro local ni los del depósito. Quedaban
-- dos cosas con `requireAdmin` escrito a mano:
--
--   · `/api/proveedores/eliminar` → ahora pide `proveedores.eliminar`.
--   · las 29 rutas de `/api/proveedores/listas/**` (subir, leer, conciliar,
--     revisar, aplicar y revertir la lista de precios del proveedor) → ahora
--     piden `proveedores.listas`.
--
-- Las dos acotan al local de la sesión con la regla de `lib/visibilidad.js`:
-- sin el comodín, solo un proveedor creado en ese local.
--
-- ── POR QUÉ ES UNA MIGRACIÓN ──────────────────────────────────────────────
--
-- `prisma/seed.js` no repisa los permisos de un rol existente, así que
-- agregarlos a `lib/rbac/systemRoles.js` solo alcanza a instalaciones nuevas.
-- Mismo patrón que la anterior.
--
-- ── A QUIÉN ───────────────────────────────────────────────────────────────
--
-- Solo DUEÑO_LOCAL. Admin no hace falta: tiene el comodín y el `WHERE` lo
-- excluye. ENCARGADO y CAJERO no.
--
-- Concatena con `||`, no reemplaza: los ajustes hechos a mano se conservan. Un
-- UPDATE por permiso, cada uno con su `NOT (@> ...)`: correrla dos veces no
-- cambia nada. `jsonb_typeof` evita fusionar sobre una fila que no guarde un
-- array.

UPDATE "Rol"
   SET "permisos" = "permisos" || '["proveedores.eliminar"]'::jsonb,
       "updatedAt" = NOW()
 WHERE jsonb_typeof("permisos") = 'array'
   AND NOT ("permisos" @> '["proveedores.eliminar"]'::jsonb)
   AND NOT ("permisos" @> '["*"]'::jsonb)
   AND "nombre" = 'DUEÑO_LOCAL';

UPDATE "Rol"
   SET "permisos" = "permisos" || '["proveedores.listas"]'::jsonb,
       "updatedAt" = NOW()
 WHERE jsonb_typeof("permisos") = 'array'
   AND NOT ("permisos" @> '["proveedores.listas"]'::jsonb)
   AND NOT ("permisos" @> '["*"]'::jsonb)
   AND "nombre" = 'DUEÑO_LOCAL';
