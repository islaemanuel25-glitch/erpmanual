-- RANGO DE AUMENTO ESPERADO y multiplicador confirmado.
--
-- El rango es un control de coherencia SEPARADO del recargo: el recargo
-- construye el costo propuesto, el rango compara ese costo contra el que el
-- producto ya tiene. Un rango de 10 a 20 % no se convierte en 15 a 25 % porque
-- el recargo sea 5.
--
-- Se guarda en la importación Y se copia a cada fila, igual que `recargoPct`:
-- cambiar el rango después no puede reescribir con qué criterio se decidió una
-- fila que ya se confirmó.
--
--   aumentoEsperadoMinPct / MaxPct   el rango vigente, configurable por importación
--   multiplicadorConfirmado          por cuánto se multiplicó el precio. 1 salvo que
--                                    el archivo demuestre que cotiza por unidad.
--   cantidadPresentacion             cuántas unidades trae el envase. DATO del
--                                    producto: no multiplica y NO toca factor_pack.
--
-- Aditiva: cinco columnas nullables sobre dos tablas. No borra ni transforma nada.

ALTER TABLE "ImportacionListaProveedor" ADD COLUMN "aumentoEsperadoMinPct" DECIMAL(6,3);
ALTER TABLE "ImportacionListaProveedor" ADD COLUMN "aumentoEsperadoMaxPct" DECIMAL(6,3);

ALTER TABLE "ImportacionListaFila" ADD COLUMN "aumentoEsperadoMinPct" DECIMAL(6,3);
ALTER TABLE "ImportacionListaFila" ADD COLUMN "aumentoEsperadoMaxPct" DECIMAL(6,3);
ALTER TABLE "ImportacionListaFila" ADD COLUMN "multiplicadorConfirmado" INTEGER;
ALTER TABLE "ImportacionListaFila" ADD COLUMN "cantidadPresentacion" INTEGER;
