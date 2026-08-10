-- Vaciar el código de barra de 29 productos que tienen basura en esa columna y
-- NINGUNA VENTA.
--
-- ── POR QUÉ ES UNA MIGRACIÓN Y NO UN SCRIPT ─────────────────────────────────
--
-- Es un paso de datos que corre en producción. Los scripts sueltos no quedan
-- registrados, se pueden correr dos veces y no viajan con el despliegue. Una
-- migración se aplica una sola vez, queda anotada en _prisma_migrations y llega
-- con la versión que la trajo.
--
-- ── EL CRITERIO ES CERO VENTAS ──────────────────────────────────────────────
--
-- Se probaron dos criterios de forma antes y los dos fallaron:
--
--   1. "El código es el nombre del producto o su comienzo". Dejaba adentro
--      bica, chori y camel10, que son atajos de tecleo: un atajo TAMBIÉN
--      empieza igual que el nombre.
--   2. "Más de 8 caracteres". La fiambrería tiene nombres cortos, así que
--      mortadela (9 caracteres, 82 ventas) y paletafela (10, 80) caían del lado
--      del vaciado mientras picadofino (10, 48) quedaba afuera. A 13 caracteres
--      convivían BARRATREMBLAY con 201 ventas y cascarablanca con 41.
--
-- No hay regla de forma que separe un atajo en uso de una basura heredada. La
-- que sí separa es el uso: si el producto nunca se vendió, nadie tipeó su
-- código para venderlo.
--
-- El motivo es la ASIMETRÍA, no la elegancia. Vaciar un atajo en uso le rompe
-- el trabajo a quien está atendiendo; dejar basura en un campo no le cuesta
-- nada a nadie. Y lo que de verdad importaba —que no entren códigos nuevos— ya
-- está resuelto con el tope de 16 caracteres.
--
-- ── QUÉ SE VACÍA, Y QUÉ NO ──────────────────────────────────────────────────
--
-- Solo estos 29 ids, con su código exacto escrito al lado. NO se recalcula el
-- criterio al aplicar: la lista es el contrato, para que el conjunto no cambie
-- solo entre que se revisa y que se aplica. Si a alguno le cambiaron el código
-- en el medio, esa fila no se toca.
--
-- Quedan afuera los 61 restantes con letras: todos tienen al menos una venta.
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
  (139, 'CORDONES', 'CORDON EL MOÑO X12U'),
  (292, 'HILO ATAR', 'HILO ATAR'),
  (316, 'JAIMITOS', 'Jaimitos X 10u'),
  (427, 'PALO MADERA', 'PALO MADERA'),
  (658, 'PERRO', 'BALANCIN ALIMENTO PERRO 15KG'),
  (665, 'IODOPOVIDONA', 'IODOPOVIDONA'),
  (1296, 'TOALLITAS PAMPERS', 'TOALLITAS PAMPERS X48'),
  (1322, 'cordones', 'cordones negros'),
  (1393, 'PULVERIZADOR', 'PULVERIZADOR1L'),
  (1406, 'BOLSA 50x70', 'BOLSA CONSORCIO YO RECICLO 50x70'),
  (1407, 'BOLSA 60x90', 'BOLSA  CONSORCIO YO RECICLO 60x90'),
  (1457, 'prepizza', 'prepizza cebolla'),
  (1539, 'mixta', 'prepizza mixta'),
  (1577, 'ESCOBILLON CURVO', 'ESCOBILLON CURVO'),
  (1647, 'cremoso ramolac', 'CREMOSO RAMOLAC X KG'),
  (1721, 'pan congelADO', 'pan congelado xkg'),
  (1775, 'pategras', 'pategras por kg'),
  (1779, 'bagetines', 'BAGUETINES DEL RIO x2'),
  (1780, 'LOMO DEL RIO', 'LOMO DEL RIO X2'),
  (1789, '7790895641749-', 'cepita anana 1.5l'),
  (1800, 'BOCADITO CHOC BLANCO', 'GRANIX BOCADITO CHOC. BLANCO 2KG'),
  (1882, 'LIVRA POMELO 1.5 GAS', 'LIVRA POMELO 1.5 CON GAS'),
  (2294, 'skyclasico', 'Skyy Clasico'),
  (2295, 'bizcochocongelado', 'Bizcocho Congelado'),
  (2296, 'Medialunasdulces', 'Medialunas Dulces Congeladas x75'),
  (2297, 'medialunassaladas', 'Medialunas Saladas Congeladas x75'),
  (2318, 'petacagin', 'Petaca Derna Gin'),
  (2329, 'secadortango', 'Secador De Pïso Tango'),
  (2331, 'fantalimon', 'Fanta Limon 2l')
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
           'motivo', 'basura en la columna del codigo y ninguna venta: nadie tipeo ese codigo para vender',
           'codigo_barra', jsonb_build_object('antes', v.codigo_viejo, 'despues', NULL)
         )
  FROM vigentes v JOIN "ProductoBase" pb ON pb.id = v.id
  RETURNING "entidadId"
)
-- No hace falta referenciar rastro para que corra: PostgreSQL ejecuta los CTE
-- que modifican datos exactamente una vez y siempre hasta el final, lea o no la
-- consulta principal su salida.
UPDATE "ProductoBase" pb
SET codigo_barra = NULL, "updatedAt" = now()
FROM vigentes v
WHERE pb.id = v.id
  AND pb.codigo_barra = v.codigo_viejo;
