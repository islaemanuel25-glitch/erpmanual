-- CÓMO SE LEE LA LISTA DE CADA PROVEEDOR.
--
-- Hasta acá el módulo sabía leer UN formato: el Excel de Arcor, con su parser
-- escrito a mano en `lib/proveedores/listas/parsers/arcor.js`. Cualquier otro
-- proveedor no podía importar nada.
--
-- El sistema se va a vender y cada cliente sube las listas de SUS proveedores, así
-- que la forma de leer un archivo no puede seguir siendo código: pasa a ser un
-- dato del proveedor, que el usuario confirma una vez desde la pantalla y que
-- desde la segunda lista se aplica solo.
--
-- ── ES PURAMENTE ADITIVA ────────────────────────────────────────────────
--
-- Dos columnas en `Proveedor`, tres en `ImportacionListaProveedor` y una en
-- `ImportacionListaFila`. No hay DROP, no hay UPDATE, no hay DELETE, no hay
-- INSERT y no hay backfill. Ninguna columna existente se toca y ninguna fila
-- existente cambia.
--
-- Las seis son nullable, así que un INSERT del código viejo sigue siendo válido
-- durante toda la ventana entre migrar y recrear. Arcor sigue andando sin
-- ninguna de ellas: su receta es su parser.
--
-- ── POR QUÉ LA RECETA ES JSON Y NO SEIS COLUMNAS ────────────────────────
--
-- Porque lo que se guarda es un MAPA de nombre de campo a posición de columna, y
-- cuántas columnas tiene un archivo no se sabe de antemano: una lista trae una
-- de precio y otra trae cinco. Seis columnas fijas obligarían a una migración por
-- cada formato nuevo, que es exactamente lo que esta tanda existe para evitar.
--
-- El contenido lo valida `recetaDeLista.js` al leerlo, no la base: un JSON que no
-- cumple el contrato se trata como "sin receta" y se vuelve a pedir confirmación,
-- que es lo mismo que pasa cuando el archivo cambió de forma.
--
-- ── Y POR QUÉ LA HUELLA VA APARTE DEL JSON ──────────────────────────────
--
-- `listaRecetaHuella` es la firma de la ESTRUCTURA del archivo con el que se
-- confirmó la receta: qué encabezados tenía y en qué orden. Si el proveedor
-- manda el mes que viene un archivo con otra forma, la huella no coincide y la
-- pantalla vuelve a pedir confirmación en vez de leer con un mapa que ya no
-- corresponde.
--
-- Va en su propia columna y no adentro del JSON porque es un hecho distinto: uno
-- dice CÓMO leer, el otro dice PARA QUÉ ARCHIVO vale ese cómo. Mezclarlos haría
-- que comparar la huella obligue a parsear el mapa entero.
--
-- ── LO DE LA IMPORTACIÓN: QUÉ SE DECIDIÓ PARA ESTA LISTA ────────────────
--
-- La columna de precio y el tratamiento del descuento se deciden UNA VEZ PARA
-- TODA LA LISTA —probando cada opción contra los productos que tienen costo y
-- quedándose con la que cae en el rango en la gran mayoría—. Esa decisión se
-- guarda para poder explicar meses después por qué una lista se leyó con el neto
-- y otra con el final.
--
-- `descuentoPct` en la fila es el descuento QUE TRAÍA ESA FILA, tal como lo
-- informó el archivo. No es el que se aplicó: si se aplicó o no lo dice la
-- decisión de la cabecera. Dos hechos, dos lugares.

ALTER TABLE "Proveedor"
  ADD COLUMN "listaRecetaLectura" JSONB,
  ADD COLUMN "listaRecetaHuella"  TEXT;

ALTER TABLE "ImportacionListaProveedor"
  ADD COLUMN "columnaPrecioElegida" TEXT,
  ADD COLUMN "descuentoAplicado"    BOOLEAN,
  ADD COLUMN "decisionDeLectura"    JSONB;

ALTER TABLE "ImportacionListaFila"
  ADD COLUMN "descuentoPct" DECIMAL(6,3);
