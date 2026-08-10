# Roadmap

**Una idea no es un compromiso.** Acá se separa qué está confirmado de qué se le
ocurrió a alguien, y no se mezcla.

Relevado sobre `d20afa98e9edece663fb3dda694d3c99783ab788` — 2026-08-10.

## Las cinco categorías

- **PENDIENTE CONFIRMADO** — se decidió hacerlo y falta hacerlo.
- **DEUDA TÉCNICA CONFIRMADA** — está mal y se sabe, con evidencia en un archivo.
- **IDEA O PROPUESTA** — apareció en un relevamiento. **Nadie lo aprobó.**
- **BLOQUEADO** — no se puede avanzar por algo externo.
- **REQUIERE DECISIÓN HUMANA** — hay dos caminos defendibles y la elección es de
  negocio, no técnica.

---

## PENDIENTE CONFIRMADO

- **Limpiar las columnas muertas de `ImportacionListaFila`.** El propio schema
  dice que `unidadesConfirmadas` y `factorConfirmado` "se eliminan en una
  migración de limpieza" (`prisma/schema.prisma:2490-2493`).
- **Retirar el permiso `modulos.acceso_sin_operador`.** Es LEGACY y **no tiene
  ningún efecto**; se conserva para no romper roles existentes
  (`lib/rbac/registry.js:102-108`).
- **Deprecar `lib/menu/registry.schema.js` y remover el shim `lib/menuConfig.js`.**
  Los dos lo dicen en su propio encabezado.
- **Confirmar si las escrituras dentro de transacciones interactivas se auditan**,
  y volver a correr la medición de cobertura sobre las escrituras nuevas
  (`docs/BITACORA-COBERTURA.md:74-80`).
- **Migración de datos kg→piezas para fiambre fijo en producción.** El depósito
  cuenta piezas, no kg. La regla está implementada; el paso de datos no se
  aplicó. **[DUDA]** — no se encontró la migración en `prisma/migrations/`;
  verificar antes de darlo por hecho.

---

## DEUDA TÉCNICA CONFIRMADA

Ordenada por lo que puede doler. La evidencia completa está en
[../CURRENT_STATE.md](../CURRENT_STATE.md).

1. **`/api/me` es fail-open donde el resto es fail-closed.** Un token con permisos
   corruptos recibe `["*"]`. Es una línea. `app/api/me/route.js:23-25`.
2. **`lib/compras-proveedor/` escribe costos en producción sin un solo candado
   propio.** Tres rutas dependen de él.
3. **Cero candados sobre `lib/auth.js`, `lib/authorize.js`, `lib/grupos.js` y
   `lib/contexto.js`** — las piezas que deciden quién entra y a qué ubicación.
4. **`lib/stock/mapItem.js` y `lib/conversiones/stock.js` sin ningún test.**
   Deciden precios unitarios, faltantes y la conversión piezas↔kg del fiambre.
5. **La fórmula de precio por margen está triplicada** (canónica + dos copias en
   combos). El día que cambie, los combos quedan atrás y nada se pone rojo.
6. **`||` contra `??` al leer el override de costo.** Stock Locales y Reporte
   Valorizado pueden mostrar el mismo producto con costo distinto.
7. **La vista global rompe `/api/contexto-activo/get` con un 500.**
8. **`grupo-activo/set` no valida que el grupo exista.**
9. **`productos/eliminar` no chequea todas las referencias.** Un producto vendido
   o usado como componente de combo devuelve **500 "Error interno"** en vez del
   mensaje de negocio.
10. **Página de edición de producto duplicada.**
    `app/modulos/productos/editar/[id]/page.jsx` no tiene ningún enlace entrante
    pero sigue siendo una ruta servible, con otro formulario. El propio repo lo
    anota en `components/proveedores/listas/VistaProductosSistema.jsx:37`.
11. **`scripts/update-docs.js` duplica entradas.** `docs/modulos/proveedores.md`
    tiene 99 líneas de changelog para 16 commits únicos.
12. **El rollback de una migración nunca se ejecutó.** Necesita una prueba en una
    base descartable antes de considerarlo confiable.
13. **Los `catch` de fallback por "columna inexistente"** en `productos/crear` y
    `productos/editar` **borran campos del payload y responden 200**. Con un
    cliente Prisma desactualizado, el producto se guarda sin modalidad, fiambre ni
    código secundario, y nadie se entera.
14. **13 módulos sin documentación**, listados en
    [../CURRENT_STATE.md](../CURRENT_STATE.md). El más grave es
    `compras-proveedor`.
15. **Documentación desactualizada**: `docs/01-ARQUITECTURA.md`,
    `docs/02-AUTH.md`, y cinco archivos de `docs/modulos/`. Detalle en
    [../business-rules/contradicciones.md](../business-rules/contradicciones.md).
16. **`SOLO_TRANSITO` está implementada y no la llama nadie**
    (`lib/transferencias/politicasStock.js:14`).
17. **La auditoría del ajuste de stock es best-effort**, mientras la de
    transferencias es bloqueante. Dos criterios opuestos para el mismo hecho.

---

## IDEA O PROPUESTA

**Nadie aprobó nada de esto.** Salió de los relevamientos del 2026-08-10.

- Poner un `middleware.js` como barrera central de autenticación. **Explícitamente
  desaconsejado sin margen de verificación**: se mete en el camino de las 259
  rutas a la vez, y un error ahí saca a todo el mundo del sistema.
- Ampliar la lista blanca de la bitácora para cubrir `Venta`, `Turno`,
  `CajaMovimiento` y `StockLocal`. Fácil de escribir, difícil de verificar:
  merece una tanda propia y no colgarse de otro cambio.
- Un candado que recorra los 259 `route.js` verificando que todos exijan sesión.
- Archivar o borrar los ~63 informes sueltos de la raíz del repo.

---

## BLOQUEADO

- **La herencia de fondo de caja está desactivada a propósito** hasta que exista
  el modelo `CajaFisica` (`app/api/pos-ventas/turnos/abrir/route.js:61-65`).
- **`equivalenciaDisplay` es un gancho declarado sin regla de negocio**
  (`lib/proveedores/listas/configuraciones/arcor.js:197`). Es lo que deja las
  filas de unidad "DI" sin poder aplicarse. **Requiere una definición del
  negocio**, no código.
- **`DUEÑO_LOCAL` no puede tener `auditoria.ver`** porque la bitácora no es
  scopeable por local (`lib/rbac/systemRoles.js:82`). Desbloquear esto exige
  scopear la bitácora primero.

---

## REQUIERE DECISIÓN HUMANA

Lo que no se puede resolver leyendo el código.

1. **`ListaPrecio.esDefault`: ¿se saca de la UI o se vuelve a conectar?** Hoy la
   pantalla deja marcar una lista como predeterminada del grupo y **ningún camino
   de venta la lee**. Es un botón que no hace nada.
2. **¿El descuento por puntos debe recalcularse en el servidor?** Hoy es el único
   importe del cobro que se acepta tal como lo manda el cliente. El saldo sí se
   valida; la aritmética `puntos × pesoPorPunto`, no. No se pudo determinar si es
   intencional.
3. **¿La auditoría del ajuste de stock debe ser bloqueante**, como la de
   transferencias, o está bien que el stock se mueva sin rastro si la auditoría
   falla?
4. **¿El historial de ventas de un cliente debe excluir las ventas internas?**
   `app/api/clientes/[id]/ventas/route.js:60` no aplica `whereVentaComercial`, sin
   comentario que lo justifique.
5. **¿`clientes/listar` y `clientes/buscar` deberían exigir permiso?** Hoy solo
   piden sesión: cualquier usuario autenticado lista la agenda de su grupo.
   Podría ser deliberado, porque el POS necesita buscar clientes con `pos.usar` y
   no con `clientes.ver`.
6. **¿Se unifican las dos funciones de redondeo a 100?** Las dos redondean hacia
   arriba pero difieren con centavos.

---

## Qué documentar en la próxima tanda

Por orden de valor:

1. **`compras-proveedor`** — escribe costos en producción, sin doc ni candados.
2. **El submódulo de listas de proveedor** — el área más activa, hoy invisible
   porque `docs/modulos/proveedores.md` solo describe el ABM.
3. **Las reglas del POS de venta** — identificadas y verificadas, sin volcar.
4. **`clientes`, `fidelidad` y `auditoria-pos-ventas`** — los tres sin doc y los
   tres sin candados.
5. **El mapa transversal de catálogo/stock y el de precios**, que
   [../architecture/](../architecture/) todavía no tiene.
