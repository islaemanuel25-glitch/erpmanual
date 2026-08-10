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

1. ~~**`/api/me` es fail-open.**~~ **RESUELTO 2026-08-10** — commit `32e0d51`.
2. **`lib/compras-proveedor/` escribe costos en producción sin un solo candado
   propio.** Tres rutas dependen de él.
3. **Cero candados sobre `lib/auth.js`, `lib/authorize.js`, `lib/grupos.js` y
   `lib/contexto.js`** — las piezas que deciden quién entra y a qué ubicación.
4. **`lib/stock/mapItem.js` y `lib/conversiones/stock.js` sin ningún test.**
   Deciden precios unitarios, faltantes y la conversión piezas↔kg del fiambre.
5. **La fórmula de precio por margen está triplicada** (canónica + dos copias en
   combos). El día que cambie, los combos quedan atrás y nada se pone rojo.
6. **`||` contra `??` al leer el override de costo.** Stock Locales y Reporte
   Valorizado pueden mostrar el mismo producto con costo distinto. **Sigue
   abierta:** se unificó el redondeo, no esto.
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
17. ~~**La auditoría del ajuste de stock es best-effort.**~~ **RESUELTO
    2026-08-10** — stock y auditoría van en la misma transacción, con el criterio
    escrito en el encabezado del archivo.
18. **`SunmiInput` ignora en silencio el ancho que le pasan.** El componente aplica
    `w-full` sobre el `className` recibido (`components/sunmi/SunmiInput.jsx:10`),
    así que cualquier `w-[Npx]` que llegue por ahí no tiene ningún efecto: el input
    se estira al ancho del contenedor. **Medido:** 75 de 77 inputs de la pantalla
    de nuevo pedido tenían `width: 100%`.

    Nadie lo nota en escritorio, porque la celda de la tabla ya acota el ancho.
    Aparece en mobile, donde el input se come la fila y empuja el resto fuera de la
    vista — así se rompieron la fila del listado y las dos del carrito.

    **Parches locales puestos hasta hoy: 3**, todos del 2026-08-10 y todos de la
    misma forma —envolver el input en un `div` con el ancho— en
    `app/modulos/compras-proveedor/nueva/page.jsx` (stepper de cantidad) y
    `components/compras-proveedor/CarritoPedido.jsx` (cantidad y costo).

    **Sitios que siguen pidiendo un ancho que no se aplica: 15, en 5 archivos**
    —`compras-proveedor/[id]` (6), `pos-transferencias/nueva/TablaSugeridos` (3),
    `reportes-ventas/EditorVentaCorreccion` (3), `reportes-ventas/LineaEditableCard`
    (2), `pos-transferencias/nueva/PreparadosTable` (1)—. Enumerado recorriendo los
    298 `.jsx` de `git ls-files "*.jsx"` y buscando `w-[Npx]` dentro de cada
    elemento `<SunmiInput …/>`. **El conteo es un piso, no un total:** solo cuenta
    los anchos escritos como literal. `costoInput` en `nueva/page.jsx:1446` pasa el
    suyo por variable (`w = "w-[80px]"`) y ninguna búsqueda por literal lo
    encuentra.

    El arreglo de fondo es hacer que `w-full` ceda ante un ancho explícito, y toca
    **toda** la aplicación de una sola vez: por eso va como tanda propia y con
    capturas, no colgado de un cambio de pantalla.

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

**Cuatro de las seis se resolvieron el 2026-08-10** con las decisiones que tomó
Emanuel en la orden de trabajo: `esDefault` salió de la UI, el descuento por
puntos lo recalcula el servidor, la auditoría del ajuste pasó a bloqueante, el
historial del cliente excluye las internas por defecto y las dos funciones de
redondeo se unificaron en una.

Quedan estas dos:

1. **¿`clientes/listar` y `clientes/buscar` deberían exigir permiso?** — **YA SE
   RESOLVIÓ**: exigen `clientes.ver` **o** `pos.usar`. Se deja anotado porque la
   pregunta era si el POS necesitaba el acceso, y la respuesta fue que sí.
2. **¿Se reconecta `ListaPrecio.esDefault` alguna vez?** El control salió de la
   pantalla y el dato quedó en la base. Reconectarlo toca la resolución de precio
   y es una tanda propia. Mientras tanto, la columna guarda valores que nadie lee.

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
