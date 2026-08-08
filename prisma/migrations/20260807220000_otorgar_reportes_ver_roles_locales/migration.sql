-- Otorga "reportes.ver" a los roles "Deposito" y "Mini".
--
-- POR QUÉ ES UNA MIGRACIÓN Y NO UN SCRIPT
-- Venía de scripts/otorgar-reportes-ver.mjs, un paso de datos que se corría a
-- mano en el VPS. Un paso que toca producción tiene que ir acá: se aplica una
-- sola vez, queda registrado en _prisma_migrations y viaja con el despliegue.
--
-- QUÉ ARREGLA
-- Al hacerse obligatorio el permiso "reportes.ver" para ver reportes de ventas,
-- los roles que ya existían en producción se quedaron sin acceso. "Deposito" y
-- "Mini" son roles PERSONALIZADOS, creados a mano en esa instancia: no están en
-- el seed ni en lib/rbac/systemRoles.js. Los roles de sistema no necesitan este
-- paso —ENCARGADO y DUEÑO_LOCAL ya traen "reportes.ver" por defecto, y Admin
-- tiene el comodín—, así que en una instalación nueva esta migración no
-- encuentra nada que hacer y no pasa nada.
--
-- POR QUÉ NO FALLA SI LOS ROLES NO ESTÁN
-- Es un UPDATE con WHERE: si no hay filas que cumplan, afecta 0 y termina bien.
-- No hay SELECT que exija resultado ni FK que resolver.
--
-- POR QUÉ ES IDEMPOTENTE
-- El `@>` descarta las filas que ya tienen el permiso, así que reaplicarla no
-- duplica la entrada ni reordena el array. `permisos` es jsonb y el `||`
-- concatena arrays.
--
-- QUÉ NO TOCA
-- Ningún otro rol, ningún otro permiso, y ninguna fila cuyo array sea el comodín
-- ["*"]: a esas agregarle "reportes.ver" sería ruido, ya pueden todo.

UPDATE "Rol"
SET "permisos" = "permisos" || '["reportes.ver"]'::jsonb,
    "updatedAt" = NOW()
WHERE "nombre" IN ('Deposito', 'Mini')
  -- Defensa por si alguna fila guardara un objeto en vez de un array: `||` sobre
  -- tipos distintos no falla, fusiona, y dejaría el permiso mal guardado.
  AND jsonb_typeof("permisos") = 'array'
  AND NOT ("permisos" @> '["reportes.ver"]'::jsonb)
  AND NOT ("permisos" @> '["*"]'::jsonb);
