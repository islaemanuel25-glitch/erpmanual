-- Umbrales de costo por proveedor, para el módulo de recepción por comprobante.
--
-- ── QUÉ SON ────────────────────────────────────────────────────────────────
--
-- `umbralRevisarPct`      — desde qué diferencia porcentual una línea se marca
--                            y necesita que alguien la acepte.
-- `umbralSospechaBajaPct` — desde qué BAJA se trata como sospecha de mala
--                            lectura en vez de como precio nuevo.
--
-- ── POR QUÉ NULLABLES, Y POR QUÉ NO SE LLENAN CON EL DEFAULT ──────────────
--
-- NULL significa "este proveedor no tiene el suyo y usa el global". Es distinto
-- de "tiene uno que casualmente coincide con el global".
--
-- Si esta migración copiara 5 y 15 en las 43 filas, el default dejaría de
-- existir: cambiarlo después no movería a nadie y habría que tocar 43 filas a
-- mano. Es exactamente el problema que el CLAUDE.md describe con el rango de
-- aumento esperado, que estaba escrito a mano en cinco lugares distintos.
--
-- El default vive en UN solo lugar del código: UMBRALES_COSTO_DEFAULT, en
-- lib/compras-proveedor/fronteraCosto.js.
--
-- ── ES ADITIVA ────────────────────────────────────────────────────────────
--
-- Dos columnas nuevas, nulas, sin default y sin backfill. La versión que está
-- atendiendo durante la ventana del despliegue no las conoce y no las lee: no
-- hay forma de que le molesten.

ALTER TABLE "Proveedor" ADD COLUMN "umbralRevisarPct" DECIMAL(6,3);
ALTER TABLE "Proveedor" ADD COLUMN "umbralSospechaBajaPct" DECIMAL(6,3);
