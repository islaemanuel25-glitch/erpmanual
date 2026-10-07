## Última actualización del Proyecto Claude

**Fecha:** 2026-10-07 00:16

## Módulos modificados recientemente

### integraciones/azul-chat
- feat(azul-chat): capacidad transferencias_eventos (TRANSFERENCIA_RECIBIDA)
- test(azul-chat): transferencias_eventos contra PostgreSQL
- docs(azul-chat): contrato de transferencias_eventos en DEC-0013
- Sin ruta nueva y sin migración: es una capacidad más de
  `POST /api/integraciones/azul-chat/consultar`, con `transferencias.ver`.

### transferencias
- refactor(transferencias): el conteo de líneas con diferencia sale del tablero a lib
- Archivos: 2 modificados (2 total)

## Archivos nuevos desde última sincronización
- lib/transferencias/lineasConDiferencia.js
- lib/integraciones/azul-chat/transferenciasEventos.js
- scripts/pruebas-db/azulChatTransferenciasEventos.mjs


## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado por scripts/update-docs.js y corregido a mano: el script solo vio el
refactor de `transferencias` y dejó afuera la capacidad de
`integraciones/azul-chat`.*
