## Última actualización del Proyecto Claude

**Fecha:** 2026-10-10 15:20

## Módulos modificados recientemente

### compras-proveedor
- feat: una explicación confirmada por tipo de papel (A, B, sin factura…): Flash lee con todas y vale la del tipo que trae el papel; un tipo sin confirmada lo lee el grande y deja pendiente la de ESE tipo sin tocar las otras; la pantalla de la explicación tiene una solapa por tipo
- feat: la identidad sale solo del número de comprobante rotulado —nunca del CUIT, del IIBB ni del CAE— y queda vacía si no está a la vista; el CAE se guarda y defiende contra el duplicado
- feat: un renglón CARGO (flete, servicio logístico) no pide producto ni entra al stock, y su costo se reparte entre la mercadería en proporción a su costo final
- Borrado: el código de formato (receta de impuestos, reparto del pie, corrección automática, verificación por fórmula); una lectura de antes de la interpretada pide volver a leerse; un papel sin total no se acepta a mano
- Migración: `20261010180000_explicacion_por_tipo` (pendiente de deploy; mueve datos y tiene DROP)
- Archivos: 64 modificados, 4 nuevos, 18 borrados

### proveedores
- La lista de recetas muestra por proveedor qué tipos tiene explicados y cuáles esperan confirmación, y conserva "cómo cobra la cantidad" (la usa el importador de pedidos)

## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado automáticamente por scripts/update-docs.js*
