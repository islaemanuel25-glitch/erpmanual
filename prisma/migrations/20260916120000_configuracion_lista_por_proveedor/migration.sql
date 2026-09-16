-- LA CONFIGURACIÓN DE LISTAS, POR PROVEEDOR.
--
-- Hasta acá el rango de aumento esperado, el recargo comercial y los impuestos
-- adicionales vivían escritos en el código: `RANGO_POR_DEFECTO` en
-- `lib/proveedores/listas/rangoAumento.js` y `CONFIG_ARCOR` en
-- `lib/proveedores/listas/configuraciones/arcor.js`. Valían lo mismo para
-- cualquier proveedor y nadie los podía cambiar desde la aplicación — aunque la
-- pantalla de subir una lista dijera, con esas palabras, que eran "los valores
-- configurados para el proveedor".
--
-- ── ES PURAMENTE ADITIVA ────────────────────────────────────────────────
--
-- Cinco columnas nuevas en `Proveedor` y una en `ImportacionListaProveedor`. No
-- hay DROP, no hay UPDATE, no hay DELETE, no hay INSERT y no hay backfill.
-- Ninguna columna existente se toca y ninguna fila existente cambia.
--
-- Por eso es compatible hacia atrás durante toda la ventana entre migrar y
-- recrear: el código viejo no nombra ninguna de estas columnas, y las seis son
-- nullable, así que un INSERT del código viejo sigue siendo válido.
--
-- ── NULLABLE A PROPÓSITO, Y SIN DEFAULT ─────────────────────────────────
--
-- NULL significa "este proveedor todavía no lo configuró", y eso NO es lo mismo
-- que cualquier número. Poner un DEFAULT acá borraría la diferencia: la pantalla
-- no podría distinguir un proveedor sin configurar de uno configurado con ese
-- valor, y cambiar el default después no movería a nadie. Es el mismo motivo por
-- el que `Proveedor.umbralRevisarPct` es nullable, y está escrito al lado suyo.
--
-- ── POR QUÉ UN BOOLEANO SEPARADO PARA LOS IMPUESTOS ─────────────────────
--
-- `listaImpuestosDefinidos` NO se deriva de `listaImpuestoAdicionalPct`. Un
-- proveedor que no tiene impuestos adicionales carga 0 % A PROPÓSITO, y eso es un
-- hecho distinto de no haber contestado todavía. Sin el booleano, los dos casos
-- se guardarían igual —la columna en NULL o en cero— y la pantalla volvería a
-- preguntar para siempre, o dejaría pasar sin preguntar.
--
-- Es exactamente la lección del campo `total` del módulo de comprobantes que está
-- en el CLAUDE.md: lo que puede faltar se pregunta aparte, con un booleano que no
-- se pueda derivar de los otros datos.
--
-- ── POR QUÉ EL PREFIJO `lista` ──────────────────────────────────────────
--
-- `Proveedor` ya tiene `umbralRevisarPct` y `umbralSospechaBajaPct`, que son del
-- módulo de comprobantes. Dos pares de umbrales sin prefijo se confunden el día
-- que alguien lea el schema apurado, y los dos deciden costos.
--
-- ── CERO FILAS AL APLICARSE ─────────────────────────────────────────────
--
-- Después de esta migración ningún proveedor tiene configuración, y por lo tanto
-- ninguna lista nueva se puede conciliar hasta que alguien la cargue desde la
-- pantalla de subir. Eso es deliberado: es lo que significa no tener valores de
-- fábrica.

ALTER TABLE "Proveedor"
  ADD COLUMN "listaAumentoEsperadoMinPct" DECIMAL(6,3),
  ADD COLUMN "listaAumentoEsperadoMaxPct" DECIMAL(6,3),
  ADD COLUMN "listaRecargoPct"            DECIMAL(6,3),
  ADD COLUMN "listaImpuestoAdicionalPct"  DECIMAL(6,3),
  ADD COLUMN "listaImpuestosDefinidos"    BOOLEAN NOT NULL DEFAULT false;

-- El impuesto adicional CON EL QUE SE CONCILIÓ ESTA LISTA, copiado de la
-- configuración del proveedor al crear la importación. Misma razón que
-- `aumentoEsperadoMinPct`/`MaxPct`, que ya están acá: cambiarle el impuesto al
-- proveedor después no puede reescribir con qué criterio se decidió una lista
-- vieja.
ALTER TABLE "ImportacionListaProveedor"
  ADD COLUMN "impuestoAdicionalPct" DECIMAL(6,3);
