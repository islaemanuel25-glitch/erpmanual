-- LA TARJETA DE PRODUCTO, CONFIGURABLE POR LOCAL.
--
-- ADITIVA Y NULLABLE, a propósito y no por comodidad: `null` significa apagado,
-- que es exactamente el comportamiento de hoy. Un local que nunca entre a la
-- pantalla de apariencia no ve ningún cambio, y por eso esta migración no lleva
-- backfill: escribir `false` en todas las filas sería lo mismo que null pero
-- convertiría una ausencia en una decisión que nadie tomó.
--
-- Es compatible hacia atrás con la versión que está atendiendo durante la
-- ventana entre migrar y recrear: agrega columnas que el código viejo no mira.
--
-- POR QUÉ COLUMNAS Y NO DENTRO DE `aparienciaJson`, que ya existe en esta misma
-- tabla: su PUT pisa el JSON entero, así que guardar el tema borraría estas
-- preferencias sin aviso; y su GET está abierto sin permiso porque lo lee el
-- layout raíz en cada página. Las otras nueve opciones de configuración de este
-- modelo ya son columnas sueltas.

ALTER TABLE "ConfiguracionLocal" ADD COLUMN "tarjetaPrecioUnitario" BOOLEAN;
ALTER TABLE "ConfiguracionLocal" ADD COLUMN "tarjetaOcultarEquivalencia" BOOLEAN;
