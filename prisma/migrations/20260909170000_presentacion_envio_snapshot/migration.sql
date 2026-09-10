-- ═══════════════════════════════════════════════════════════════════════════
-- EL SNAPSHOT DE CÓMO SALIÓ LA MERCADERÍA DEL ORIGEN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── EL PROBLEMA, MEDIDO CONTRA PRODUCCIÓN ─────────────────────────────────
--
-- `TransferenciaDetalle.unidadEnviada` es del enum `ModoPedido`, que solo tiene
-- BULTO y UNIDAD. No puede decir si un bulto era un pack o un cajón, ni
-- distinguir un kilo de una pieza.
--
-- Y hay algo peor: el camino que crea casi todas estas transferencias —la venta
-- interna del POS— convierte los packs a unidades ANTES de guardar. Lo dice su
-- propio código, en `lib/ventas-internas/mapearVentaATransferencia.js`:
-- "unidadEnviada='UNIDAD' y factorPack=1 SIEMPRE".
--
-- Contado el 2026-09-09 sobre la base de producción:
--
--     productos `pack`  → 4631 líneas, 5 con BULTO
--     productos `cajon` →  234 líneas, 1 con BULTO
--     productos `kg`    →  411 líneas, 0 con BULTO
--
-- O sea que cuando depósito despacha 6 cajones de 8, lo que queda escrito es
-- `cantidad = 48, unidadEnviada = UNIDAD`. La pantalla que mostraba "48 UNIDAD"
-- no estaba fallando: mostraba fielmente el dato. La presentación se perdía al
-- CREAR, no al dibujar.
--
-- ── Y NO ALCANZA CON GUARDAR UNA ETIQUETA ─────────────────────────────────
--
-- La aritmética también lee el catálogo VIVO:
--
--   · `confirmar-recepcion` convierte piezas a kilos con `pesoReferenciaKg` en
--     el momento de confirmar;
--   · la recepción multiplica por `factor_pack` para llegar a unidades físicas.
--
-- Editar cualquiera de los dos DESPUÉS de despachar cambia cuánto stock entra al
-- destino de una transferencia que ya salió. Por eso se congelan los números y
-- no solo el rótulo.
--
-- ── ADITIVA, Y SE PUEDE COMPROBAR LEYENDO ─────────────────────────────────
--
-- Un tipo nuevo y cinco columnas, todas NULABLES. NO hay un solo DROP, ni un
-- UPDATE, ni un DELETE, ni un INSERT, ni backfill.
--
-- **Las 6388 líneas históricas quedan con el snapshot en NULL, y es a
-- propósito.** Rellenarlas dividiendo la cantidad física por el factor actual
-- —48 / 8 = 6 cajones— sería inventar cómo se despachó: nadie registró eso, y
-- con 47 unidades la cuenta ni siquiera da entera. Una fila sin snapshot dice
-- "no se registró", que es la verdad; una rellenada diría "se registró así", que
-- sería falso.
--
-- El código viejo sigue funcionando durante toda la ventana entre migrar y
-- recrear: no nombra ninguna de estas columnas y ninguna es obligatoria.

-- ───────────────────────────────────────────────────────────────────────────
-- A. El tipo. Reúne lo que el dominio ya distingue por separado: `UnidadMedida`
--    (unidad, pack, cajon, kg) y `ModoVentaDeposito` (PIEZA).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PresentacionEnvio') THEN
    CREATE TYPE "PresentacionEnvio" AS ENUM ('UNIDAD', 'PACK', 'CAJON', 'KG', 'PIEZA');
  END IF;
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- B. Los cinco hechos que hacen autosuficiente a la fila
-- ───────────────────────────────────────────────────────────────────────────
--
-- `cantidad` NO se toca: sigue siendo la cantidad FÍSICA, la que mantiene
-- paridad con el descuento de stock del origen. Esto agrega la otra mitad —cómo
-- se contó— sin tocar la primera.

ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN IF NOT EXISTS "presentacionEnvio" "PresentacionEnvio";

-- Cuánto se despachó EN esa presentación. No se deriva de `cantidad`: con un
-- envío mixto no da entero —4 packs de 6 más 5 sueltas son 29 unidades, y 29/6
-- no es 4—.
ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN IF NOT EXISTS "cantidadPresentada" DECIMAL(12,3);

-- Las unidades que viajaron FUERA de los bultos completos. Es lo que permite
-- escribir "4 PACK x6 + 5" en vez de 4,833 packs — el mismo error de exactitud
-- que `recibidoUnidadesSueltas` ya evita del lado de la recepción.
ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN IF NOT EXISTS "sueltasEnviadas" DECIMAL(12,3);

-- El factor CONGELADO. Sin esto, cambiar `factor_pack` de 8 a 12 reescribe
-- cuántas unidades físicas dice haber movido una transferencia vieja.
ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN IF NOT EXISTS "factorPresentacion" INTEGER;

-- El peso de referencia CONGELADO, solo para PIEZA. Sin esto, editar
-- `pesoReferenciaKg` después de despachar cambia cuántos kilos acredita
-- `confirmar-recepcion` al destino.
ALTER TABLE "TransferenciaDetalle"
  ADD COLUMN IF NOT EXISTS "pesoPiezaKg" DECIMAL(12,3);

-- ───────────────────────────────────────────────────────────────────────────
-- LO QUE ESTA MIGRACIÓN NO HACE, DICHO PARA QUE NO HAYA QUE DEDUCIRLO
-- ───────────────────────────────────────────────────────────────────────────
--
-- No toca `cantidad` de ninguna fila: el histórico físico es el que movió stock.
-- No toca `unidadEnviada`, que sigue diciendo lo que dijo.
-- No rellena el snapshot de ninguna transferencia existente.
-- No borra, no renombra y no crea índices: ninguna consulta nueva filtra por
-- estas columnas — se leen siempre junto con la fila que ya se está trayendo.
