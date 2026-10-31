-- CADA LÍNEA DE TRANSFERENCIA GUARDA LA PRESENTACIÓN CON LA QUE SE VALORIZÓ.
--
-- `precioCosto` es el costo de la ficha del origen en su escala comercial, y
-- `resolverCostoTransferencia` lo llevaba a la escala del envío leyendo la ficha
-- VIVA. Editar la presentación después de despachar releía el precio viejo con
-- el factor nuevo. Desde ahora se lee de estas columnas, y una línea sin ellas
-- lanza.
--
-- ── ADITIVA PARA LA VERSIÓN QUE ATIENDE ──────────────────────────────────────
--
-- Seis columnas nulables que el código viejo no conoce ni lee. El relleno corre
-- en esta misma migración, antes de que la versión nueva atienda.
--
-- ── EL RELLENO: NINGUNA LÍNEA CAMBIA DE VALOR, SALVO LAS CUATRO DE LA #1 ─────
--
-- 1. Todas las líneas reciben la presentación ACTUAL de su ficha, que es la que
--    hoy les da su valor: el total de cada transferencia queda idéntico.
--
-- 2. Las cuatro líneas de la #1 (11/05/2026, a mini el 7) reciben la
--    presentación con la que salieron. La bitácora empieza el 24/07, así que no
--    la cubre: es la que hace coincidir su precio con el costo por unidad del
--    depósito en el primer dato que existe (el punto cero del Libro de Costos):
--      · ABSOLUT VODKA WILD BERRI: $18.500 por unidad → factor 1 (hoy pack de 6).
--      · 9 DE ORO Agridulce, Azucaradas y Clásicas: $5.760 el pack de 6, $960 la
--        unidad → factor 6 (hoy 20, 28 y 24).
--    La #1 pasa de $100.143,64 a $152.112,50.
--
-- Medido el 2026-10-31 con la bitácora y el Libro de Costos: 112 líneas de 77
-- transferencias más (Paleta sadia, KIMBIES, NUVIA, LA VIRGINIA, entre otras)
-- también tenían otra presentación cuando salieron. No se tocan acá: llevarlas a
-- la de su fecha cambia el total de esas transferencias, y esa decisión es de
-- Emanuel. Si la toma, va en otra migración que solo actualice estas columnas.
--
-- ── VUELTA ATRÁS ─────────────────────────────────────────────────────────────
--
-- Las columnas no se leen en la versión anterior: volver la imagen alcanza.

ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN "valorizacionUnidadMedida"        "UnidadMedida",
  ADD COLUMN "valorizacionFactorPack"          INTEGER,
  ADD COLUMN "valorizacionPesoEsFijo"          BOOLEAN,
  ADD COLUMN "valorizacionPesoReferenciaKg"    DECIMAL(10,3),
  ADD COLUMN "valorizacionModoVentaDeposito"   "ModoVentaDeposito",
  ADD COLUMN "valorizacionModoCompraProveedor" "ModoPedido";

UPDATE "TransferenciaDetalle" d
   SET "valorizacionUnidadMedida"        = b."unidad_medida",
       "valorizacionFactorPack"          = b."factor_pack",
       "valorizacionPesoEsFijo"          = b."pesoEsFijo",
       "valorizacionPesoReferenciaKg"    = b."pesoReferenciaKg",
       "valorizacionModoVentaDeposito"   = b."modoVentaDeposito",
       "valorizacionModoCompraProveedor" = b."modoCompraProveedor"
  FROM "ProductoLocal" pl
  JOIN "ProductoBase" b ON b."id" = pl."baseId"
 WHERE pl."id" = d."productoId";

-- La #1: cada UPDATE nombra la línea, su transferencia y su precio congelado.
UPDATE "TransferenciaDetalle" SET "valorizacionFactorPack" = 1
 WHERE "id" = 7 AND "transferenciaId" = 1 AND "precioCosto" = 18500;
UPDATE "TransferenciaDetalle" SET "valorizacionFactorPack" = 6
 WHERE "id" IN (4, 5, 6) AND "transferenciaId" = 1 AND "precioCosto" = 5760;
