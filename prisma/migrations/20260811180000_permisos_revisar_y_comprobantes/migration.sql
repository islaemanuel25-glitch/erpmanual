-- Dos permisos nuevos, y su asignación a los roles que YA existen.
--
-- ── POR QUÉ SON DOS Y NO SE REUSAN LOS DE ANTES ────────────────────────────
--
-- `compras.revisar` — revisar lo recibido. Va separado de `compras.recibir`
-- porque si fueran el mismo, el que carga la mercadería podría darse el visto
-- bueno a sí mismo y la segunda revisión dejaría de ser un control.
--
-- `comprobantes.ver` — ver las fotos de las facturas. Va separado de
-- `costos.ver` porque que alguien pueda ver márgenes no tiene por qué darle las
-- facturas del proveedor. Hoy los tienen los mismos, pero coinciden por
-- casualidad y esa casualidad se rompe el día que alguien reparta permisos sin
-- saber que estaban atados.
--
-- ── POR QUÉ LA ASIGNACIÓN VA EN LA MISMA MIGRACIÓN ─────────────────────────
--
-- Un permiso creado y sin asignar deja la pantalla cerrada para todos, y para
-- cuando alguien nota que no puede entrar, nadie se acuerda de por qué. Crear y
-- asignar son un solo paso.
--
-- ── A QUIÉN SE LE DAN ──────────────────────────────────────────────────────
--
-- A DUEÑO_LOCAL y a ENCARGADO. Admin no hace falta: tiene el comodín.
--
-- La separación entre quien recibe y quien revisa la hace el TILDE del permiso,
-- no una lista escrita en el código: si mañana hay que sacárselo a alguien, se
-- destilda. Una versión anterior de esta migración excluía a ENCARGADO para
-- forzar que fueran personas distintas; se sacó porque en el depósito hoy
-- trabaja una sola persona y esa regla no protegía a nadie.
--
-- ── ES IDEMPOTENTE ─────────────────────────────────────────────────────────
--
-- Solo agrega el permiso a los roles que NO lo tienen. Correrla dos veces no
-- duplica nada, y un rol al que alguien ya se lo dio a mano queda igual.

UPDATE "Rol"
   SET "permisos" = "permisos" || '["compras.revisar"]'::jsonb
 WHERE "nombre" IN ('DUEÑO_LOCAL', 'ENCARGADO')
   AND NOT ("permisos" @> '["compras.revisar"]'::jsonb);

UPDATE "Rol"
   SET "permisos" = "permisos" || '["comprobantes.ver"]'::jsonb
 WHERE "nombre" IN ('DUEÑO_LOCAL', 'ENCARGADO')
   AND NOT ("permisos" @> '["comprobantes.ver"]'::jsonb);
