## Última actualización del Proyecto Claude

**Fecha:** 2026-10-08 12:04

## Módulos modificados recientemente

### compras-proveedor (comprobantes, recetas y recepción)
- fix: la boleta de DYSSA cierra y el costo lleva todo lo que cobra
- Migración `20261008120000_receta_dyssa_iva_por_renglon`: la receta de
  'Dyssa' con tres percepciones (IVA RG 5329 por grupo de alícuota e IIBB).
  Pendiente de deploy; anotada en `docs/deploy/MIGRACIONES-SIN-APLICAR.md`.

## Archivos nuevos desde última sincronización
- lib/compras-proveedor/comprobante/boletaDyssaCierra.test.mjs
- lib/compras-proveedor/comprobante/boletaDyssa.fixture.json
- prisma/migrations/20261008120000_receta_dyssa_iva_por_renglon/migration.sql

## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado por scripts/update-docs.js y corregido a mano: el script no detectó
el módulo y dejó la lista vacía.*
