-- CERRAR UNA IMPORTACIÓN SIN PERDER LA VUELTA ATRÁS.
--
-- Hasta acá una lista que ya no se iba a trabajar más tenía dos salidas y
-- ninguna servía:
--
--   · CANCELADA — la saca del flujo, pero no se puede revertir. Está bien para
--     una lista que nunca escribió un costo; es una trampa para una que escribió
--     279.
--   · quedarse abierta para siempre, ocupando el archivo y apareciendo como
--     proceso vivo.
--
-- TERMINADA es el cierre de una lista que SÍ trabajó: no acepta confirmar ni
-- aplicar —con esto alcanza— pero SÍ acepta revertir. Esa es toda la diferencia
-- con CANCELADA, y es la razón de que exista.
--
--   terminadaEn            cuándo se cerró. NULO SIGNIFICA QUE NUNCA SE TERMINÓ.
--   terminadaPorUsuarioId  quién la cerró. Misma convención que `canceladaEn` y
--                          `canceladaPorUsuarioId`, que la tabla ya usa.
--
-- ADITIVA: un valor nuevo del enum y dos columnas nullable. El despliegue migra
-- con un contenedor descartable ANTES de recrear la app, así que la imagen vieja
-- tiene que poder seguir corriendo contra este schema — y puede: no lee estas
-- columnas y nunca se va a topar con el estado nuevo, que solo lo escribe la
-- imagen nueva.

ALTER TYPE "EstadoImportacionLista" ADD VALUE IF NOT EXISTS 'TERMINADA';

ALTER TABLE "ImportacionListaProveedor" ADD COLUMN "terminadaEn" TIMESTAMP(3);
ALTER TABLE "ImportacionListaProveedor" ADD COLUMN "terminadaPorUsuarioId" INTEGER;
