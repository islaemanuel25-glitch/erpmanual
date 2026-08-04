-- CIERRE CON CAMBIO SEPARADO ANTES DEL CORTE
--
-- Invierte el orden físico del cierre: hasta ahora se contaba todo el cajón y
-- recién al final se elegía qué quedaba como cambio. Ahora el cambio se separa
-- y se cuenta ANTES de cortar, el sobre se publica en el mismo acto, y después
-- del corte se cuenta únicamente el dinero que se retira.
--
-- ES ADITIVA Y SIN BACKFILL. Las cuatro columnas nacen NULL:
--
--   · en los cortes ya CONFIRMADOS, NULL significa "se cerró con el orden
--     anterior". No se rellenan: inventar un `efectivoRetiradoEsperado` para un
--     cierre que nunca lo tuvo sería fabricar un dato que nadie congeló;
--   · en un corte PREPARANDO tomado con el código viejo, NULL es la señal que
--     usa la confirmación para seguir por el camino de compatibilidad
--     (`calcularCierreDesdeConteo`).
--
-- NINGUNA columna existente cambia de tipo ni de significado. En particular
-- `totalContado` y `desgloseContado` siguen siendo el cajón COMPLETO: con el
-- orden nuevo se derivan como retiro contado + cambio separado, en vez de
-- contarse de una sola vez.

-- El retiro esperado, congelado junto con el esperado del corte.
ALTER TABLE "CierrePreparacion" ADD COLUMN "efectivoRetiradoEsperado" DECIMAL(12,2);

-- El conteo del retiro: la única pila que se cuenta después del corte.
ALTER TABLE "CierrePreparacion" ADD COLUMN "desgloseRetiroContado" JSONB;
ALTER TABLE "CierrePreparacion" ADD COLUMN "totalRetiroContado" DECIMAL(12,2);

-- El hallazgo del arqueo, persistido en vez de recalculado en cada lectura.
ALTER TABLE "CierrePreparacion" ADD COLUMN "diferencia" DECIMAL(12,2);
