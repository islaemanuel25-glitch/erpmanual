-- Una fila por llamada al modelo de lectura.
--
-- ── POR QUÉ NO SE DEDUCE DE LO QUE YA HAY ──────────────────────────────────
--
-- Para mostrar cuántas lecturas quedan en el día hay que contar LLAMADAS, no
-- comprobantes leídos. Una lectura que falló gasta cuota igual —el 429 se cuenta
-- contra el tope diario— y un comprobante releído gastó dos llamadas y tiene una
-- sola fila en `ComprobanteProveedor`.
--
-- Contando comprobantes, el número mostraría MÁS lecturas disponibles de las que
-- hay. Y este contador existe justamente para que nadie se entere de que no
-- quedan con el camión del proveedor en la puerta: un número optimista es peor
-- que ninguno.
--
-- ── Y PARA AVERIGUAR LA HORA DEL CORTE ─────────────────────────────────────
--
-- El tope es diario y de 20 por modelo —medido en el cuerpo del 429, que trae
-- `quotaValue: 20`—, pero la HORA a la que repone no se puede saber desde acá
-- sin esperar a que ocurra. Con esta tabla se averigua sola: la primera llamada
-- que sale bien después de una racha de CUOTA_AGOTADA marca el momento.
--
-- Aditiva: tabla nueva. Nada existente la lee ni la escribe.

CREATE TABLE "LlamadaLector" (
    "id" SERIAL NOT NULL,
    "modelo" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "motivo" TEXT,
    "comprobanteId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlamadaLector_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LlamadaLector_creadoEn_modelo_idx" ON "LlamadaLector"("creadoEn", "modelo");
