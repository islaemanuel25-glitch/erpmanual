# Modulo: Bitácora de auditoría

**Última actualización:** 2026-07-24 11:51

## Ubicacion
- UI: `app/modulos/auditoria/page.jsx`
- Componente: `components/auditoria/BitacoraAuditoria.jsx`
- APIs: `app/api/auditoria/` (`listar`, `opciones`)
- Interceptor y contexto: `lib/auditoria/` (`interceptor.js`, `contexto.js`)
- Modelo: `AuditoriaBitacora` (prisma/schema.prisma)

## Descripcion
Bitácora central de escrituras sensibles. Registra, en una única tabla, quién
hizo qué, cuándo, sobre qué entidad y el antes/después de lo que cambió. Se
puebla en un solo punto interceptando las escrituras de Prisma; corre en
paralelo a las islas existentes (AuditoriaStock, PrecioUpdate), que no reemplaza.

## Funcionalidad principal
- Interceptor de Prisma (client extension) con allow-list de acciones: anular
  pedido, cancelar transferencias (normal y POS), recibir compra, editar
  producto, y CRUD de usuarios, roles y operadores.
- Guarda solo los campos que cambiaron (diff), con secretos redactados
  (`passwordHash`, `pinHash`, etc.).
- Escritura best-effort: nunca rompe la operación de negocio; se registra fuera
  de la transacción. Intercepta también las escrituras dentro de `$transaction`.
- Contexto (usuario/operador/local) propagado por AsyncLocalStorage, sembrado en
  los helpers de auth.
- Pantalla de consulta con filtros por fecha, local, usuario, operador y acción.

## Permisos
- `auditoria.ver`: ver la bitácora. El dueño (`*`) lo tiene por defecto. Quien lo
  tiene ve todo, sin scope por local. (Distinto de `reportes.ver`, que gobierna
  el módulo "Auditoría POS".)

## Dependencias
- `lib/prisma.js` (cableado del interceptor sobre el cliente base sin extender)
- `lib/auth.js`, `lib/grupos.js`, `lib/operador.js` (siembra del contexto)
- `lib/authorize.js` (`requirePerm`)

## Cambios recientes
- 2026-07-24: feat(auditoria): bitácora de auditoría central por interceptor de Prisma
