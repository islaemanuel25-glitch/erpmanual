-- POR QUÉ ESE PRECIO TERMINÓ SIENDO ÉSE.
--
-- ── QUÉ SE GUARDA Y POR QUÉ NO SE PUEDE DERIVAR ─────────────────────────────
--
-- `precioOferta` es lo que se cobra. Lo que NO se puede reconstruir después es
-- cómo se llegó a ese número: si la persona escribió $3.400 a propósito, o
-- escribió un margen que daba $3.343,33 y el redondeo lo subió.
--
-- Son dos hechos distintos y ninguno se deduce del otro. Un $3.400 redondo NO
-- prueba que hubo redondeo —se puede tipear— y un precio con decimales tampoco
-- prueba que no lo hubo, porque el redondeo puede estar apagado.
--
-- Es la misma regla que el resto del modelo: un hecho, una columna.
--
--   redondeoAplicado      el interruptor tal como estaba al guardar.
--   precioSinRedondear    el precio exacto ANTES de subir al siguiente 100.
--
-- ── ADITIVA, Y LAS DOS ACEPTAN NULL ─────────────────────────────────────────
--
-- Las líneas que ya existen no tienen esta información y no se puede inventar:
-- `NULL` significa "se cargó antes de que esto se registrara", que es distinto
-- de "no se redondeó". Un DEFAULT false diría que esas líneas no se redondearon,
-- y eso no se sabe.
--
-- Hoy no hay ninguna fila: `OfertaLinea` quedó en 0 después de la migración del
-- 2026-09-15 que borró la oferta con las referencias en escala de bulto. Las
-- columnas aceptan NULL igual, porque el modelo tiene que ser correcto por sí
-- mismo y no por lo que hoy haya en la base.
--
-- ── COMPATIBLE HACIA ATRÁS DURANTE LA VENTANA ───────────────────────────────
--
-- Agrega dos columnas opcionales. La versión anterior sigue leyendo y
-- escribiendo `OfertaLinea` sin enterarse: no las selecciona ni las necesita.

ALTER TABLE "OfertaLinea"
  ADD COLUMN "redondeoAplicado" BOOLEAN,
  ADD COLUMN "precioSinRedondear" DECIMAL(12,2);
