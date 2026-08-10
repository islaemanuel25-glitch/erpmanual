-- Vaciar el código de barra de 60 productos creados en el depósito cuyo código
-- es texto y no un código de barras.
--
-- ── POR QUÉ ES OTRA MIGRACIÓN Y NO UNA EDICIÓN DE LA ANTERIOR ───────────────
--
-- 20260810210000 ya está aplicada en producción y registrada en
-- _prisma_migrations con su checksum. Editarla haría que `migrate deploy`
-- falle. Una migración aplicada es historia: no se toca, se agrega otra.
--
-- ── EL CRITERIO ES QUIÉN CREÓ EL PRODUCTO, Y NADA MÁS ───────────────────────
--
-- Decisión de negocio del 2026-08-10, en docs/decisions/DEC-0006: el único
-- local que crea y toca productos es Casiano Casas y lo suyo no se toca; el
-- resto es del depósito y se vacía.
--
-- El creador no se deduce: está guardado en ProductoBase.creadoEnLocalId.
-- Medido sobre los 61 que quedaban con letras: 60 del depósito, 1 de Casiano
-- Casas ('pollo trozado'), y NINGUNO sin creador.
--
-- Hubo un recorte por ventas —dejar afuera los de más de 50— que se probó y se
-- descartó. No queda ni como condición ni como excepción: el criterio es uno
-- solo. Los 15 que más venden están señalados aparte en el respaldo, para
-- poder reponer uno rápido si alguien nota que le falta un atajo.
--
-- ⚠ ESTO NO MIRA LAS VENTAS, Y LOS 60 TIENEN. Los que nunca vendieron ya los
-- vació 20260810210000, así que lo que queda es exactamente lo que se usa:
-- 'xl' con 172 ventas, BARRATREMBLAY con 203, cremosocremac con 204, las tres
-- del mismo día de la medición. Es una decisión tomada a sabiendas.
--
-- ── QUÉ QUEDA AFUERA ────────────────────────────────────────────────────────
--
--   * 'pollo trozado' (id 2387), el único creado por Casiano Casas. Cuando esta
--     migración se aplique va a ser el ÚNICO producto con código de texto.
--   * Los tres códigos GS1 de 16 dígitos, que son etiquetas de bulto legítimas.
--   * El código de nivel ubicación (ProductoLocal.codigo_barra_propio), que es
--     otro campo, de otra tabla, y está VACÍO en las 11.651 filas de producción.
--
-- ── QUÉ SE VACÍA ───────────────────────────────────────────────────────────
--
-- Solo estos 60 ids, con su código exacto escrito al lado. NO se recalcula el
-- criterio al aplicar: la lista es el contrato.
--
-- ── SE VACÍA A NULL, NO A CADENA VACÍA ──────────────────────────────────────
--
-- Hay un unique sobre (grupoId, codigo_barra). Varias cadenas vacías chocarían
-- entre sí; varios NULL no, porque PostgreSQL los trata como distintos.
--
-- ── EL RASTRO ───────────────────────────────────────────────────────────────
--
-- El interceptor de auditoría vive en la aplicación y no ve el SQL de una
-- migración, así que las filas de bitácora se escriben acá a mano, antes del
-- UPDATE, para que registren el valor viejo. usuarioId va en NULL porque no lo
-- hizo una persona; el autor está en 'accion' y en 'cambios.autor'.
--
-- ── REPONER ─────────────────────────────────────────────────────────────────
--
-- docs/business-rules/codigos-vaciados-deposito-2026-08-10.md, con los 15 más
-- vendidos señalados arriba de todo.
WITH objetivo (id, codigo_viejo, nombre) AS (
  VALUES
  (68, 'BENGALA', 'BENGALA X4'),
  (79, 'BARRATREMBLAY', 'BARRA TREMBLAY'),
  (92, 'bica', 'Bicarbonato Paez'),
  (430, 'PAÑO AMARRILLO', 'PAÑO AMARILLO'),
  (448, 'pancho12', 'Pan Pancho Fucci'),
  (455, 'PETACACAFE', 'DERNA PETACA CAFE AL COGNAC XCAJA'),
  (552, 'picadofino', 'Salamin Fox Picado Fino'),
  (586, 'TARRITOORINA', 'TARRITO ORINA'),
  (691, 'maple', 'Maple Huevos x30'),
  (694, 'xl', 'Hamburguesa Casera XL'),
  (763, 'chori', 'Chorigol Casero x Caja 30u'),
  (822, 'SURTIDO PRIME', 'PRIME PRESERVATIVO'),
  (857, 'albondiga', 'Albondigas Caseras x Caja'),
  (967, '7790O36048260', 'VINO UVITA BLANCO DULCE X12'),
  (1416, 'torpedo', 'PAN TORPEDO '),
  (1417, 'pancho24', 'Pancho 24 Als'),
  (1437, 'LOMO PAN', 'PAN ALS LOMO'),
  (1473, 'QUITAESMALTENEPTUS', 'QUITAESMALTE NEPTUS 60CM'),
  (1541, 'picadogrueso', 'Salamin Fox Picado Grueso'),
  (1585, 'ARGENTINA BOMBILLA', 'ARGENTINA BOMBILLA'),
  (1883, 'LIVRA CITRUS 1.5 GAS', 'LIVRA CITRUS 1.5 CON GAS'),
  (1885, 'fanta 237', 'fanta vidrio 237'),
  (1886, 'sprite237', 'Sprite Vidrio 237 '),
  (1951, 'solcabello', 'SOL PAMPEANO CABELLITO'),
  (2023, '361LATA', '361 LATA X24'),
  (2083, 'paletasadia', 'Paleta sadia'),
  (2086, 'cremosocremac', 'Queso Cremoso Cremac'),
  (2088, 'salamefox', 'Salame Fox '),
  (2091, 'pachamama', 'Tabaco Pacha Mama'),
  (2092, 'panlomo', 'Pan Lomito'),
  (2098, 'paletafela', 'Paleta Fela'),
  (2099, 'mortadela', 'Mortadela Paladini'),
  (2100, 'salamefela', 'Salame Fela'),
  (2101, 'cremosoverona', 'Queso Cremoso Verona'),
  (2105, 'papas', 'Papas Congeladas'),
  (2117, 'cascarablanca', 'Queso Cascara Blanca CLP'),
  (2119, 'cascaranegra', 'Queso Cascara Negra CLP'),
  (2120, 'paletapala', 'Paleta Paladini'),
  (2124, 'mozzacremac', 'Mozzarella Cremac'),
  (2125, 'casera', 'Hamburguesa Casera'),
  (2126, 'salametro', 'Salametro'),
  (2130, 'pancholargo', 'Pan Super Pancho'),
  (2134, 'doververde', 'Dover Verde'),
  (2185, 'PRITTY', 'PRITTY 1L'),
  (2190, 'CARBONCHICO', 'CARBON CHICO'),
  (2191, 'CARBONGRANDE', 'CARBON  GRANDE'),
  (2213, 'lahoja', 'Tabaco La Hoja'),
  (2225, 'camel10', 'Camel 10'),
  (2241, 'Solmayorhigienico', 'Sol Mayor Papel Higienico'),
  (2271, 'verduleria', 'verduleria'),
  (2272, 'aceiteseda', 'Aceite Seda 10L'),
  (2298, 'holandaverona', 'Queso Holanda La Verona'),
  (2299, 'sardoverona', 'Queso Sardo La Verona'),
  (2300, 'roque', 'Queso Azukl Vanguard'),
  (2301, 'bondiola', 'Bondiola Piamontesa'),
  (2315, 'arrolladovaca', 'Arrollado de Vaca'),
  (2336, 'solforati', 'Sol Pampeano Forati'),
  (2337, '%', 'azucar impalpable velez 250gr'),
  (2397, 'caja bon o bon', 'caja bon o bon'),
  (2398, 'bocadito fantoche', 'bocadito fantoche')
),
-- Solo las que TODAVÍA tienen exactamente ese código. Si cambió, se saltea.
vigentes AS (
  SELECT o.id, o.codigo_viejo, o.nombre
  FROM objetivo o
  JOIN "ProductoBase" pb ON pb.id = o.id AND pb.codigo_barra = o.codigo_viejo
),
rastro AS (
  INSERT INTO "AuditoriaBitacora"
    ("createdAt", "usuarioId", "operadorId", "localId", "grupoId",
     "accion", "entidad", "entidadId", "entidadNombre", "cambios")
  SELECT now(), NULL, NULL, NULL, pb."grupoId",
         'producto.codigo_barra.vaciar',
         'Producto', v.id::text, v.nombre,
         jsonb_build_object(
           'autor', 'migracion 20260810230000_vaciar_codigos_barra_del_deposito',
           'motivo', 'codigo de texto en un producto creado en el deposito; los de Casiano Casas no se tocan',
           'codigo_barra', jsonb_build_object('antes', v.codigo_viejo, 'despues', NULL)
         )
  FROM vigentes v JOIN "ProductoBase" pb ON pb.id = v.id
  RETURNING "entidadId"
)
UPDATE "ProductoBase" pb
SET codigo_barra = NULL, "updatedAt" = now()
FROM vigentes v
WHERE pb.id = v.id
  AND pb.codigo_barra = v.codigo_viejo;
