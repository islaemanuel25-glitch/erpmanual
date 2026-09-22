-- LA RECEPCIÓN SOBREVIVE A UN REFRESCO, Y UNA LECTURA DICE QUIÉN LA PIDIÓ.
--
-- ── TRES COLUMNAS, LAS TRES ADITIVAS ──────────────────────────────────────
--
-- 1. `ComprobanteLinea.unidadElegida` — cuando el papel no deja deducir si el
--    precio es por unidad o por bulto, la pantalla pregunta y alguien elige.
--    Esa elección vivía SOLO en la memoria del navegador: refrescar la borraba
--    y el yogur del pedido 242 volvía a preguntar. Ahora se guarda en el
--    renglón, que es de quien es.
--
-- 2. `LlamadaLector.origen` — qué disparó la llamada. La tabla decía cuándo y
--    con qué modelo, y no quién la pidió, así que no se podía contestar por
--    qué un comprobante tenía diez lecturas. Medido sobre el comprobante 13 del
--    pedido 242: diez llamadas y `intentosLectura` en CUATRO, o sea que seis no
--    reescribieron ningún renglón —eran pruebas de la receta—. Eso se dedujo
--    cruzando dos números; con esta columna se lee.
--
-- 3. `PedidoProveedorDetalle.unidadesFisicas` — cuántas unidades dijo la hoja
--    que entran al stock. El cierre ya la prefiere sobre su propia deducción
--    —sobre la hamburguesa del 242 la deducción daba 3 en vez de 90— pero el
--    número vivía en la memoria del navegador: después de un refresco el cierre
--    volvía a deducir y el defecto volvía con él.
--
-- Las tres son NULLABLE, sin default y sin backfill. Ninguna fila
-- existente se toca y el código viejo no las lee, así que la ventana entre
-- migrar y recrear no cambia nada: las lecturas y la conciliación siguen
-- funcionando igual mientras la versión anterior atiende.
--
-- `origen` es texto y no un enum por el mismo motivo que `LlamadaLector.motivo`:
-- los disparadores los define la pantalla y no queremos una migración cada vez
-- que aparece uno.

ALTER TABLE "ComprobanteLinea" ADD COLUMN "unidadElegida" TEXT;

ALTER TABLE "LlamadaLector" ADD COLUMN "origen" TEXT;

ALTER TABLE "PedidoProveedorDetalle" ADD COLUMN "unidadesFisicas" DECIMAL(12,3);
