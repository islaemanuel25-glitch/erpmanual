-- CERRAR SIN CONTEO: LA RESOLUCIÓN ADMINISTRATIVA DE UN CORTE VENCIDO.
--
-- Un corte de cierre que venció sin confirmarse dejaba el turno en preparación
-- para siempre: cancelarlo está prohibido —ya congeló ventas— y confirmarlo exige
-- un conteo que, semanas después, no existe. La única forma de cerrarlo era
-- inventar un contado.
--
-- Esto agrega el estado final CERRADO_SIN_CONTEO y quién, cuándo y por qué lo
-- resolvió. El turno queda cerrado con el esperado congelado y con lo contado y
-- la diferencia en NULL —desconocidos, no cero—; eso ya lo admiten las columnas
-- de `Turno`, que son nulables desde siempre.
--
-- ── ESTRICTAMENTE ADITIVA ─────────────────────────────────────────────────
--
-- Un valor de enum nuevo y tres columnas NULLABLE, sin default y sin backfill.
-- Ninguna fila existente se toca: los cortes vencidos que hay en producción
-- siguen exactamente como están y se resuelven uno por uno, a mano, por la ruta.
--
-- La versión anterior no escribe el valor nuevo ni lee estas columnas. Una fila
-- con CERRADO_SIN_CONTEO solo puede existir después de que alguien use la ruta
-- nueva, que llega con la imagen nueva, así que la ventana entre migrar y
-- recrear no cambia nada.
--
-- El índice parcial "CierrePreparacion_turno_vigente_key" (PREPARANDO,
-- CONFIRMADO) no se toca: un corte cerrado sin conteo deja el turno CERRADO, y
-- un turno cerrado no puede tomar otro corte.

-- AlterEnum
ALTER TYPE "EstadoCierrePreparacion" ADD VALUE 'CERRADO_SIN_CONTEO';

-- AlterTable
ALTER TABLE "CierrePreparacion" ADD COLUMN     "cerradoSinConteoEn" TIMESTAMP(3),
ADD COLUMN     "cerradoSinConteoPorUsuarioId" INTEGER,
ADD COLUMN     "motivoCierreSinConteo" TEXT;
