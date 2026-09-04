-- Dos permisos para los roles de sistema que YA EXISTEN.
--
-- ── POR QUÉ HACE FALTA, Y NO ALCANZA CON `systemRoles.js` ──────────────────
--
-- `prisma/seed.js` NO repisa los permisos de un rol que ya existe: respeta lo
-- que el administrador haya ajustado a mano. Es la decisión correcta, y tiene
-- una consecuencia: agregar un permiso a la matriz de `lib/rbac/systemRoles.js`
-- solo alcanza a las instalaciones NUEVAS. En una instalación que ya está
-- corriendo, ENCARGADO y DUEÑO_LOCAL se quedan sin el permiso para siempre y
-- nadie se entera hasta que alguien no puede entrar a una pantalla.
--
-- ── POR QUÉ ES UNA MIGRACIÓN Y NO UN SCRIPT ───────────────────────────────
--
-- Es la regla del proyecto: un paso de datos que corre en producción va como
-- migración. Se aplica UNA sola vez, queda registrada en `_prisma_migrations` y
-- viaja con el despliegue. Un script suelto no tiene ninguna de las tres cosas.
--
-- Y es el patrón que este repo ya usó dos veces para exactamente esto:
-- `20260807220000_otorgar_reportes_ver_roles_locales` y
-- `20260811180000_permisos_revisar_y_comprobantes`. No se inventa un mecanismo
-- nuevo; se sigue el que está.
--
-- ── QUÉ SE OTORGA, Y A QUIÉN ──────────────────────────────────────────────
--
-- `proveedores.crear` y `compras.crear`, a DUEÑO_LOCAL y a ENCARGADO.
--
-- CAJERO NO entra: dar de alta un proveedor y armar una compra no son tareas de
-- caja. Admin tampoco hace falta: tiene el comodín.
--
-- Ningún otro rol se toca. Un rol personalizado —"Deposito", "Mini", los que
-- haya— queda exactamente como estaba: el `WHERE` los excluye por nombre.
--
-- ── POR QUÉ NO PISA NINGUNA PERSONALIZACIÓN ───────────────────────────────
--
-- Porque NO reemplaza el array: lo CONCATENA con `||`. Un ENCARGADO que hoy
-- tenga `["algo.personalizado", "compras.ver"]` termina con
-- `["algo.personalizado", "compras.ver", "compras.crear"]`. Nada se pierde y
-- nada se reordena.
--
-- Reemplazarlo por los defaults de `systemRoles.js` habría sido el camino corto
-- y habría borrado, en silencio, cada permiso que un administrador agregó o
-- sacó a mano. Es la diferencia entre otorgar y reinicializar.
--
-- ── POR QUÉ ES IDEMPOTENTE ────────────────────────────────────────────────
--
-- El `NOT (permisos @> …)` descarta las filas que ya lo tienen, así que
-- reaplicarla no duplica el código ni reordena el array. Correrla dos veces
-- deja el mismo resultado que correrla una.
--
-- ── POR QUÉ NO FALLA SI LOS ROLES NO ESTÁN ────────────────────────────────
--
-- Es un UPDATE con WHERE: si no hay filas que cumplan, afecta 0 y termina bien.
-- En una instalación nueva no encuentra nada que hacer, porque el seed ya los
-- creó con el permiso.
--
-- ── Y ES UNA SOLA VEZ: DESPUÉS MANDA EL ADMINISTRADOR ─────────────────────
--
-- Esto es una asignación INICIAL, no una regla permanente. No hay ningún
-- proceso que la vuelva a aplicar al arrancar: el seed no repisa roles
-- existentes —por eso hizo falta esta migración— y `_prisma_migrations` impide
-- que se vuelva a ejecutar. Si mañana el administrador le saca `compras.crear`
-- a ENCARGADO desde la pantalla de Roles, se lo saca de verdad y nada se lo
-- devuelve.
--
-- ── LAS DOS DEFENSAS DEL `WHERE`, QUE NO SON ADORNO ───────────────────────
--
-- `jsonb_typeof = 'array'` — si alguna fila guardara un objeto en vez de un
-- array, `||` no falla: fusiona, y dejaría el permiso mal guardado.
--
-- `NOT (permisos @> '["*"]')` — a un rol con el comodín agregarle un permiso
-- concreto es ruido: ya puede todo.
--
-- Las dos vienen de `20260807220000`, que es la versión más completa de este
-- mismo patrón en el repo.

UPDATE "Rol"
   SET "permisos" = "permisos" || '["proveedores.crear"]'::jsonb,
       "updatedAt" = NOW()
 WHERE "nombre" IN ('DUEÑO_LOCAL', 'ENCARGADO')
   AND jsonb_typeof("permisos") = 'array'
   AND NOT ("permisos" @> '["proveedores.crear"]'::jsonb)
   AND NOT ("permisos" @> '["*"]'::jsonb);

UPDATE "Rol"
   SET "permisos" = "permisos" || '["compras.crear"]'::jsonb,
       "updatedAt" = NOW()
 WHERE "nombre" IN ('DUEÑO_LOCAL', 'ENCARGADO')
   AND jsonb_typeof("permisos") = 'array'
   AND NOT ("permisos" @> '["compras.crear"]'::jsonb)
   AND NOT ("permisos" @> '["*"]'::jsonb);
