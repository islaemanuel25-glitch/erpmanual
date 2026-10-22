-- LA RECETA PROPUESTA DE COCA-COLA QUE QUEDÓ COMO "SIN FACTURA" SE DESCARTA.
--
-- ── QUÉ PASÓ ──────────────────────────────────────────────────────────────
--
-- En el pedido #259 el lector grande leyó la factura de Coca-Cola sin ver su
-- letra, y el código mandaba a "sin factura" todo papel sin letra leída. Su
-- explicación describe IVA, impuestos internos y "PERCEP. Y OTROS" al pie: es
-- una factura con letra, no un papel en negro. Quedó pendiente en Recetas de
-- facturas y en la recepción como "Cómo viene la sin factura (remito,
-- planilla)", con el botón «Está bien, guardar» a mano. Confirmarla la habría
-- guardado como la receta del papel sin factura de Coca-Cola.
--
-- El código ya no clasifica así (`tipoParaLaReceta`): sin letra, "sin factura"
-- exige que el lector conteste que el papel NO discrimina impuestos. Esto saca
-- la que ya estaba pendiente, que es la orden de Emanuel: no se confirma, se
-- descarta.
--
-- ── QUÉ SE BORRA Y QUÉ NO ─────────────────────────────────────────────────
--
-- Solo una PROPUESTA —una fila que espera que alguien diga "está bien"—: de un
-- proveedor cuyo nombre dice Coca, del tipo "sin factura", y cuya explicación
-- nombra percepciones, que es justo lo que un papel sin factura no puede
-- tener. No toca ninguna receta confirmada (`ExplicacionPorTipo`), ni la
-- propuesta de otro tipo de Coca-Cola, ni la "sin factura" de ningún otro
-- proveedor. Ningún costo depende de una propuesta: perderla solo hace que la
-- próxima factura con la letra a la vista arme la buena.
--
-- Por qué una migración: un paso de datos que corre en producción va como
-- migración (CLAUDE.md). Es idempotente: corrida dos veces no encuentra nada.

DELETE FROM "RecetaPropuestaProveedor" rp
 USING "Proveedor" p
 WHERE rp."proveedorId" = p.id
   AND p.nombre ILIKE '%coca%'
   AND rp."tipoComprobante" = 'SIN_FACTURA'
   AND rp.respuestas ->> 'explicacion' ILIKE '%percep%';
