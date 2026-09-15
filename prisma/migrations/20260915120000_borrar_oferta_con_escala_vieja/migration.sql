-- BORRA LA ÚNICA OFERTA CARGADA ANTES DEL ARREGLO DE ESCALA.
--
-- ── POR QUÉ SE BORRA UNA FILA DE PRODUCCIÓN ─────────────────────────────────
--
-- Sus referencias congeladas están en escala de BULTO, y desde esta tanda todo
-- el módulo trabaja en la escala en que la ubicación vende. Esa fila guarda
-- `precioNormalReferencia = 25000` y `costoReferencia = 19200` para un producto
-- que en ese local vale $1.250 y cuesta $960 por unidad.
--
-- Dejarla no es "conservar historia": es guardar un dato que dice otra cosa de
-- la que dice el mismo dato cargado hoy. Y tiene una consecuencia concreta: el
-- barrido compara `costoReferencia` contra el costo de HOY, que desde ahora sale
-- en unidad. Esa fila quedaría marcada para revisar comparando 19200 contra 960
-- —bulto contra unidad— y el aviso se dispararía por el motivo equivocado, para
-- siempre.
--
-- ── POR QUÉ SE PUEDE BORRAR SIN PERDER NADA ─────────────────────────────────
--
-- Medido contra producción el 2026-09-15, antes de escribir esto:
--
--   · `Oferta`                          → 1 fila   (id 1, "91100")
--   · `OfertaLinea`                     → 1 fila
--   · `OfertaEvento`                    → 4 filas
--   · `VentaDetalle` con `ofertaId`     → **0 filas**
--
-- Esa última es la que decide: la oferta NUNCA se aplicó a una venta, así que no
-- hay un solo peso cobrado que dependa de ella. Además está FINALIZADA desde el
-- 2026-09-08 —vivió tres minutos y veintiún segundos— y su propio libro de
-- eventos muestra que fue una prueba: arrancó llamándose "9 de oro" y terminó
-- llamándose "91100".
--
-- ── EL BORRADO ES ACOTADO, NO UN "DELETE FROM" ──────────────────────────────
--
-- Se borra POR CONDICIÓN y no por id: una migración que dice `id = 1` funciona
-- en esta base y hace cualquier cosa en otra. La condición nombra exactamente lo
-- que se quiere ir: ofertas creadas antes del arreglo Y ya finalizadas Y sin
-- ninguna línea referenciada por una venta.
--
-- Esa tercera condición es la defensa que importa: si mañana esta migración
-- corriera sobre una base donde la oferta SÍ se aplicó, no borra nada.
--
-- `OfertaLinea` y `OfertaEvento` cuelgan con `ON DELETE CASCADE`, así que se van
-- solas. `VentaDetalle.ofertaId` es `ON DELETE SET NULL`: borrar una oferta nunca
-- borra historial de ventas, y por eso la condición de abajo es la única barrera
-- real.
--
-- ── SI HAY QUE VOLVER ATRÁS ─────────────────────────────────────────────────
--
-- El rollback de código NO devuelve esta fila. La reposición es el dump previo
-- al despliegue, que es por lo que el backup lleva el quinto chequeo: se
-- comprueba que el valor que se va a borrar esté adentro del dump ANTES de
-- borrarlo. Reponerla a mano sería:
--
--   INSERT INTO "Oferta" (id, "grupoId", "localId", nombre, "condicionPago",
--     "inicioEn", "finEn", "publicadaEn", "publicadaPorId", "finalizadaEn",
--     "finalizadaPorId", "creadoPorId", "createdAt", "updatedAt")
--   VALUES (1, <grupo>, 2, '91100', 'SOLO_EFECTIVO',
--     '2026-09-08T16:52:00Z', '2026-09-15T16:52:00Z', '2026-09-08T16:54:16.775Z',
--     1, '2026-09-08T16:56:10.233Z', 1, 1, '2026-09-08T16:52:49.507Z', now());
--
-- y su línea con productoLocalId 2006, precioOferta 22500,
-- precioNormalReferencia 25000, costoReferencia 19200. Los eventos no se
-- reponen: son un libro de cambios y reponerlos sería escribir historia.

DELETE FROM "Oferta" o
WHERE o."createdAt" < TIMESTAMP '2026-09-15 00:00:00'
  AND o."finalizadaEn" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "VentaDetalle" vd
    WHERE vd."ofertaId" = o.id
  );
