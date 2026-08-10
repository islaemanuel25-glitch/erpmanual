# Arquitectura

Mapas transversales: cómo está **construida** un área que atraviesa varios
módulos.

**No confundir con las skills.** La arquitectura explica cómo está armado; la
skill explica cómo **ejecutar** un procedimiento paso a paso. `/deploy` tiene la
secuencia de comandos; [despliegue.md](despliegue.md) tiene por qué está armada
así.

## Los archivos

- [autenticacion-y-contexto.md](autenticacion-y-contexto.md) — quién sos, en qué
  grupo estás, en qué ubicación, y qué podés hacer. Es la cadena de la que cuelga
  todo lo demás, incluida la bitácora.
- [auditoria-bitacora.md](auditoria-bitacora.md) — cómo se interceptan las
  escrituras y qué NO cubre.
- [themes.md](themes.md) — tres capas de tema apiladas y quién gana.
- [despliegue.md](despliegue.md) — por qué el VPS no construye.

## Lo que todavía no tiene mapa

`docs/01-ARQUITECTURA.md` cubre el stack, el patrón BFF y la estructura de
carpetas, pero **tiene números vencidos** — ver
[../business-rules/contradicciones.md](../business-rules/contradicciones.md), C-03.
Se dejó como está por ser histórico; lo vigente está en
[../PROJECT.md](../PROJECT.md).

Falta el mapa transversal de **catálogo y stock** (las tres capas del producto
están descriptas en [../business-rules/deposito-y-local.md](../business-rules/deposito-y-local.md)
pero sin el diagrama de flujo de creación de filas) y el de **precios**.
Anotados en [../roadmap/README.md](../roadmap/README.md).
