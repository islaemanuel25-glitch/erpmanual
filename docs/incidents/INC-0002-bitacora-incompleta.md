# INC-0002 — La bitácora anterior al 2026-08-09 está incompleta

**Estado:** Mitigado — la causa está corregida, lo perdido no se recupera.

## Qué pasó

El interceptor de auditoría de Prisma bufferea las escrituras en un
`AsyncLocalStorage` y las vuelca al terminar el pedido. La referencia al cliente
base no estaba anclada en `globalThis`, y con Turbopack eso hace que el módulo se
cargue dos veces: **el contexto que sembraba un lado no lo veía el que volcaba por
el otro**.

Resultado: escrituras que ocurrieron y no dejaron ninguna fila en
`AuditoriaBitacora`.

## Detección

No lo detectó una alarma: apareció midiendo. Se contó, contra producción y en solo
lectura, cuántas escrituras reales hubo en 30 días contra cuántas entradas hay en
la bitácora, para cada uno de los nueve modelos de la lista blanca.

El primer número que salió —99,6 % de cobertura a nivel entidad— **escondía el
problema**: contaba entidades tocadas, no eventos. A nivel evento el resultado fue
**451 escrituras sin rastro sobre 811**.

De esas 451, **186 están repartidas en 19 días distintos**: no son una tanda
masiva puntual, son actividad diaria común que no quedó registrada.

## Resolución

- La referencia al cliente base se ancló en `globalThis` (commit `515a897`).
- Se abrió el contexto de auditoría en las rutas que escribían con `requireAdmin`
  sin abrirlo.
- Se escribió `docs/BITACORA-COBERTURA.md` con la medición y sus cinco límites,
  para que nadie lea la tabla dentro de un año como si fuera completa.

## Lección

Dos, y las dos cambiaron cómo se trabaja:

1. **Una métrica agregada puede esconder exactamente lo que se está buscando.**
   99,6 % por entidad y 55 % por evento son la misma base de datos. Elegir la
   unidad de medida es parte de la medición.
2. **La ausencia de una fila no prueba nada** sobre ese período. Eso quedó escrito
   en el documento de cobertura, que es lo único que evita que la tabla se lea mal
   más adelante.

Y un gotcha de desarrollo que costó dos mediciones: **editar el interceptor no
tiene efecto hasta reiniciar el servidor**, porque el cliente extendido queda
cacheado y congela la clausura vieja. Dos corridas se midieron con código viejo y
llevaron a una conclusión equivocada, que hubo que corregir.

## Evidencia

- `docs/BITACORA-COBERTURA.md` — la medición completa con sus límites.
- Commit `515a897` *fix(auditoria): la referencia al cliente base va anclada en
  globalThis*.
- Commit `ac0eef4` *docs: la bitacora anterior al arreglo esta incompleta, y
  cuanto falta*.
- `lib/auditoria/interceptor.js:36-43` y `lib/auditoria/contexto.js:16-20` — el
  anclaje, con el motivo comentado al lado.

## Lo que sigue abierto

- La lista blanca cubre **nueve modelos y ninguno es de dinero**: no están
  `Venta`, `Turno`, `CajaMovimiento`, `StockLocal` ni `Cliente`. Ver
  `docs/architecture/auditoria-bitacora.md`.
- **48 de los 259 `route.js`** no mencionan ningún helper de sesión, y sin eso el
  volcado no se programa. No se abrió una por una para saber cuáles escriben en la
  base.
- Queda anotado en el propio documento de cobertura confirmar si las escrituras
  dentro de transacciones interactivas se registran.
