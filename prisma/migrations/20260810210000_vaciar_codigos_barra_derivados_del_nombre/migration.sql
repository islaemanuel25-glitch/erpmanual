-- Vaciar el código de barra de 33 productos cuyo código era el nombre del
-- producto volcado en la columna equivocada.
--
-- ── POR QUÉ ES UNA MIGRACIÓN Y NO UN SCRIPT ─────────────────────────────────
--
-- Es un paso de datos que corre en producción. Los scripts sueltos no quedan
-- registrados, se pueden correr dos veces y no viajan con el despliegue. Una
-- migración se aplica una sola vez, queda anotada en _prisma_migrations y llega
-- con la versión que la trajo.
--
-- ── EL CRITERIO ES EL LARGO ─────────────────────────────────────────────────
--
-- Entran los códigos de MÁS DE 8 CARACTERES. Un nombre volcado tiene 12 o 15
-- caracteres; un atajo de tecleo tiene cuatro o cinco. Nadie escribe
-- "medialunassaladas" para buscar un producto.
--
-- El criterio anterior —"el código es el nombre o su comienzo"— estaba mal y se
-- reemplazó: dejaba adentro 14 abreviaturas cortas como `bica`, `chori` o
-- `camel10`, que son exactamente lo que alguien teclea todos los días. Esas
-- pasaron a la lista que se revisa una por una.
--
-- ── QUÉ SE VACÍA, Y QUÉ NO ──────────────────────────────────────────────────
--
-- Solo estos 33 ids, con su código exacto escrito al lado. NO se recalcula el
-- criterio al aplicar: si alguien le cambia el código a alguno entre la medición
-- y el despliegue, esa fila NO se toca. La lista es el contrato.
--
-- Quedan afuera a propósito:
--   * Los 57 restantes con letras: los 43 que no se parecen al nombre más las 14
--     abreviaturas de 8 caracteres o menos.
--   * Los 16 de más de 14 caracteres que no están en esta lista, incluidos los
--     tres GS1 legítimos.
--
-- ── SE VACÍA A NULL, NO A CADENA VACÍA ──────────────────────────────────────
--
-- Hay un unique sobre (grupoId, codigo_barra). Varias cadenas vacías chocarían
-- entre sí; varios NULL no, porque PostgreSQL los trata como distintos. Además
-- NULL es lo que ya tienen los 320 productos sin código.
--
-- ── EL RASTRO ───────────────────────────────────────────────────────────────
--
-- El interceptor de auditoría vive en la aplicación y no ve el SQL de una
-- migración, así que las filas de bitácora se escriben acá a mano, antes del
-- UPDATE, para que registren el valor viejo.
--
-- usuarioId va en NULL porque NO LO HIZO UNA PERSONA: lo hace esta migración al
-- desplegarse. Poner un id de usuario diría que alguien lo ejecutó, y sería
-- falso. El autor está en 'accion' y en 'cambios.autor', con el nombre de la
-- migración.
--
-- ── REPONER ─────────────────────────────────────────────────────────────────
--
-- El estado anterior está en docs/business-rules/codigos-vaciados-2026-08-10.md,
-- con el UPDATE listo para copiar, uno por uno o todos juntos.

WITH objetivo (id, codigo_viejo, nombre) AS (
  VALUES
  (857, 'albondiga', 'Albondigas Caseras x Caja'),
  (292, 'HILO ATAR', 'HILO ATAR'),
  (2099, 'mortadela', 'Mortadela Paladini'),
  (2088, 'salamefox', 'Salame Fox '),
  (2126, 'salametro', 'Salametro'),
  (2272, 'aceiteseda', 'Aceite Seda 10L'),
  (2134, 'doververde', 'Dover Verde'),
  (2331, 'fantalimon', 'Fanta Limon 2l'),
  (2098, 'paletafela', 'Paleta Fela'),
  (2120, 'paletapala', 'Paleta Paladini'),
  (2100, 'salamefela', 'Salame Fela'),
  (2271, 'verduleria', 'verduleria'),
  (2190, 'CARBONCHICO', 'CARBON CHICO'),
  (2083, 'paletasadia', 'Paleta sadia'),
  (427, 'PALO MADERA', 'PALO MADERA'),
  (2191, 'CARBONGRANDE', 'CARBON  GRANDE'),
  (665, 'IODOPOVIDONA', 'IODOPOVIDONA'),
  (1780, 'LOMO DEL RIO', 'LOMO DEL RIO X2'),
  (1393, 'PULVERIZADOR', 'PULVERIZADOR1L'),
  (586, 'TARRITOORINA', 'TARRITO ORINA'),
  (79, 'BARRATREMBLAY', 'BARRA TREMBLAY'),
  (1721, 'pan congelADO', 'pan congelado xkg'),
  (2387, 'pollo trozado', 'pollo trozado'),
  (2397, 'caja bon o bon', 'caja bon o bon'),
  (1647, 'cremoso ramolac', 'CREMOSO RAMOLAC X KG'),
  (1577, 'ESCOBILLON CURVO', 'ESCOBILLON CURVO'),
  (2296, 'Medialunasdulces', 'Medialunas Dulces Congeladas x75'),
  (2295, 'bizcochocongelado', 'Bizcocho Congelado'),
  (2398, 'bocadito fantoche', 'bocadito fantoche'),
  (2297, 'medialunassaladas', 'Medialunas Saladas Congeladas x75'),
  (1296, 'TOALLITAS PAMPERS', 'TOALLITAS PAMPERS X48'),
  (1585, 'ARGENTINA BOMBILLA', 'ARGENTINA BOMBILLA'),
  (1473, 'QUITAESMALTENEPTUS', 'QUITAESMALTE NEPTUS 60CM')
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
           'autor', 'migracion 20260810210000_vaciar_codigos_barra_derivados_del_nombre',
           'motivo', 'el codigo era el nombre del producto volcado; mas de 8 caracteres, nadie lo tipea para buscar',
           'codigo_barra', jsonb_build_object('antes', v.codigo_viejo, 'despues', NULL)
         )
  FROM vigentes v JOIN "ProductoBase" pb ON pb.id = v.id
  RETURNING "entidadId"
)
-- No hace falta referenciar `rastro` para que corra: PostgreSQL ejecuta los CTE
-- que modifican datos exactamente una vez y siempre hasta el final, lea o no la
-- consulta principal su salida.
UPDATE "ProductoBase" pb
SET codigo_barra = NULL, "updatedAt" = now()
FROM vigentes v
WHERE pb.id = v.id
  AND pb.codigo_barra = v.codigo_viejo;
