## Última actualización del Proyecto Claude

**Fecha:** 2026-10-06 15:39

## Módulos modificados recientemente

### integraciones/azul-chat
- feat: Azul Chat canjea el código del vínculo por un token de delegación, y mi_alcance
- feat: botón 'Vincular Azul Chat' en el menú de la persona — SIN VERIFICAR en pantalla
- docs: DEC-0013 tanda 4, el canje y la delegación
- Ruta nueva: `POST /api/integraciones/azul-chat/vinculo/canjear` (servidor a servidor).
  El contrato de `consultar` cambia: `delegacion: { token }` en lugar de
  `{ usuarioId, vinculo }`.
- Migración nueva sin aplicar en producción: `20261006150000_delegacion_integracion`
  (ver docs/deploy/MIGRACIONES-SIN-APLICAR.md)

### reportes-ventas
- refactor: el resumen de ventas del reporte general pasa a una pieza compartida
- Archivos: 1 nuevos, 1 modificados (2 total)


## Archivos nuevos desde última sincronización
- app/api/integraciones/azul-chat/vinculo/canjear/route.js
- components/integraciones/ModalVincularAzulChat.jsx
- lib/integraciones/azul-chat/miAlcance.js
- lib/integraciones/vinculos/canje.js
- prisma/migrations/20261006150000_delegacion_integracion/migration.sql

## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado por scripts/update-docs.js y corregido a mano: el script atribuyó el
cambio a `transferencias` porque se tocó un censo de migraciones que vive ahí.*
