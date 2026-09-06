-- COMISIÓN SIN CONFIGURAR: QUE LA BASE PUEDA DECIR "TODAVÍA NO SE SABE".
--
-- ── QUÉ HACE, Y QUÉ NO ───────────────────────────────────────────────────────
--
-- Las tres comisiones del grupo pasan a admitir NULL y pierden su DEFAULT 7.
-- Ese 7 no era una regla de negocio de nadie: hacía que cada grupo naciera con
-- una comisión que nadie había decidido, y el dominio la daba por buena.
--
-- NO se toca ninguna fila. No hay UPDATE, no hay backfill y no se reinterpreta
-- ningún valor guardado: el grupo que hoy tiene 7 en las tres sigue teniendo 7,
-- y va a seguir resolviendo 7 porque lo tiene ALMACENADO, no porque el código lo
-- invente. Lo único que cambia es que de acá en adelante un grupo nuevo puede
-- quedar sin comisión configurada.
--
-- ── COMPATIBLE HACIA ATRÁS DURANTE LA VENTANA ───────────────────────────────
--
-- Entre migrar y recrear la app, el código VIEJO sigue atendiendo. Puede leer
-- estas columnas sin problema: las filas que existen conservan su número, y la
-- columna nueva tiene DEFAULT, así que sus INSERT siguen funcionando sin
-- nombrarla. Ningún NULL nuevo aparece por esta migración — solo podría
-- aparecer si alguien creara un grupo en esos segundos, y el código viejo
-- resolvería ese caso con su `?? 7`, que es exactamente lo que hacía antes.

ALTER TABLE "ConfiguracionGrupo" ALTER COLUMN "comisionDebito" DROP DEFAULT;
ALTER TABLE "ConfiguracionGrupo" ALTER COLUMN "comisionDebito" DROP NOT NULL;

ALTER TABLE "ConfiguracionGrupo" ALTER COLUMN "comisionCredito" DROP DEFAULT;
ALTER TABLE "ConfiguracionGrupo" ALTER COLUMN "comisionCredito" DROP NOT NULL;

ALTER TABLE "ConfiguracionGrupo" ALTER COLUMN "comisionMercadopago" DROP DEFAULT;
ALTER TABLE "ConfiguracionGrupo" ALTER COLUMN "comisionMercadopago" DROP NOT NULL;

-- LA MARCA DE QUE LOS IMPORTES DE UNA VENTA NO ESTÁN CERRADOS.
--
-- Aditiva y con DEFAULT false, así que todas las ventas históricas quedan
-- marcadas como exactas — que es lo que son: se cobraron con una comisión
-- conocida, la que estuviera configurada o el 7 que el código ponía. No se
-- reinterpreta el pasado.
ALTER TABLE "Venta" ADD COLUMN "comisionPendiente" BOOLEAN NOT NULL DEFAULT false;
