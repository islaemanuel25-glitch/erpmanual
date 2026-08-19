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
6bis. **El servidor de crear la venta ACEPTA el precio que manda el navegador.**
   Solo valida que sea mayor a cero (`crear/route.js:360-365`) y lo persiste
   (`crear:880`). Es lo más grave de la zona de precios y tiene su plan escrito
   en [el-precio-que-se-cobra.md](el-precio-que-se-cobra.md), junto con las
   cuatro condiciones divergentes de "¿el precio está guardado por bulto?" y los
   dos productos —id 924 y id 1881— que hoy valen tres a uno según qué pantalla
   los mire.
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
18. ~~**`SunmiInput` ignora en silencio el ancho que le pasan.**~~ **RESUELTO
    2026-08-10.** El componente aplicaba `w-full` siempre; `w-full` y `w-[46px]`
    empatan en especificidad, así que decidía el orden de la hoja de estilos y
    ganaba `w-full`. Medido antes del arreglo: 75 de 77 inputs de una pantalla
    tenían `width: 100%`.

    Ahora `w-full` lo pone `componerClaseInput` (`lib/sunmi/claseAncho.js`) SOLO
    cuando quien usa el componente no declaró un ancho propio, con dos exclusiones
    deliberadas: `min-w-`/`max-w-` no son un ancho, y un ancho con variante
    —`sm:w-40`— tampoco alcanza, porque dejaría al input sin ancho por debajo del
    breakpoint. Nueve candados en `lib/sunmi/claseAncho.test.mjs`, verificados
    rompiendo el arreglo de cinco formas distintas.

    **Los tres parches locales se retiraron** en el mismo commit, ahora que la
    causa está resuelta: el stepper de `compras-proveedor/nueva` y los dos inputs
    de `CarritoPedido` vuelven a llevar el ancho en su propio `className`. Las
    capturas del carrito quedaron byte a byte idénticas.

    **Alcance real: 28 sitios que cambian, sobre 225 usos de `SunmiInput`** —los
    otros 193 no piden ancho y conservan `w-full` sin cambio—. Enumerado dos
    veces por métodos distintos: recortando cada elemento `<SunmiInput …/>` de los
    298 `.jsx` de `git ls-files` y extrayendo su `className`, y una pasada
    independiente del auditor. Los dos dieron 225 usos, 32 con clase de ancho, 28
    reales y 4 que ya pedían `w-full`.

    Nueve de esos 28 no entraban con el ancho que pedían, medido contra el peor
    valor real de **producción**: los seis de transferencias (46 px para
    `"4380.005"`, el stock más largo), el código de barra y el SKU de edición
    rápida, y la cantidad del carrito del POS en modo compacto.

19. **`SunmiSelectAdv` tiene exactamente el mismo bug.**
    `components/sunmi/SunmiSelectAdv.jsx:195` aplica `w-full` sobre el `className`
    recibido, igual que hacía `SunmiInput`. Hay **3 sitios** pidiendo un ancho que
    hoy no se aplica, los tres en `components/pos-transferencias/nueva/TablaSugeridos.jsx`:
    línea 55 (`w-[85px]`, cuántas filas mostrar), 118 (`w-[140px]`, filtro de
    categoría) y 140 (`w-[140px]`, filtro de área).

    Lo encontró el auditor relevando el arreglo de `SunmiInput`; **no se tocó**, a
    propósito: es otro componente y merece su propia tanda con sus capturas, para
    poder revertir uno sin el otro. El arreglo es el mismo y `componerClaseInput`
    ya está escrito y probado.

21. **Una cantidad sugerida de transferencia se muestra como flotante crudo.**
    En `/modulos/pos-transferencias/nueva` hay una fila cuyo input de cantidad
    trae `0.16000000000000014` —19 caracteres— en vez de `0.16`. Es el residuo
    clásico de una resta en punto flotante, no un dato cargado por nadie.

    Se vio al capturar la pantalla con datos reales el 2026-08-10. **A 360 px ya
    se cortaba antes del arreglo de anchos**; en escritorio no, porque el input
    estirado medía unos 150 px y ahora mide 76. Ningún ancho razonable entra 19
    caracteres: lo que hay que arreglar es el redondeo del sugerido, no la caja.

20. **Dos importaciones muertas de `SunmiInput`**, sin consecuencia:
    `app/modulos/auditoria-pos-ventas/turnos/page.jsx` y
    `app/modulos/proveedores/listas/nueva/page.jsx` lo importan y no lo usan.
    Sale de comparar los 89 archivos que importan contra los 87 que tienen
    `<SunmiInput`.

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

Y se sumaron dos:

00. **¿El depósito le vende a los locales AL COSTO?** Su lista default es
    `tipoBase = COSTO` con margen 0, así que sin cliente el POS cobra el costo y
    no el precio de venta: 2.021 de 2.047 filas del depósito, y en 1.991 cobra
    menos, 12,9 % menos en promedio. Si es a propósito hay que revisar qué
    muestra la tarjeta ahí; si no, está mal configurada la lista. Medido el
    2026-08-19, detalle en
    [el-precio-que-se-cobra.md](el-precio-que-se-cobra.md).

Y se sumó una el 2026-08-18:

0. **¿El costo puede ser una opción de precio de la tarjeta de producto?**
   Emanuel la dejó afuera de la tanda de la tarjeta editable —"es otra idea y
   además sensible"—. El motivo por el que no es una tercera preferencia del
   local, y las tres cosas que hay que decidir antes de escribir código, están
   en [el-costo-en-la-tarjeta.md](el-costo-en-la-tarjeta.md). En una línea:
   quién ve un costo lo decide `costos.ver`, que es por PERSONA, y un
   interruptor por local lo atravesaría.

Quedan estas tres:

1. **¿`clientes/listar` y `clientes/buscar` deberían exigir permiso?** — **YA SE
   RESOLVIÓ**: exigen `clientes.ver` **o** `pos.usar`. Se deja anotado porque la
   pregunta era si el POS necesitaba el acceso, y la respuesta fue que sí.
2. **¿Se reconecta `ListaPrecio.esDefault` alguna vez?** El control salió de la
   pantalla y el dato quedó en la base. Reconectarlo toca la resolución de precio
   y es una tanda propia. Mientras tanto, la columna guarda valores que nadie lee.

3. ~~**¿El tope del código de barra es 14 o 16?**~~ **RESUELTO 2026-08-10: 16.**
   Los tres códigos de 16 dígitos son etiquetas de bulto GS1 —identificador `01`
   más GTIN-14— y dos de esos productos se venden, así que 14 habría rechazado un
   escaneo real. El tope frena al escribir y no al guardar, en los cinco campos
   donde se carga un código, y **lo guardado no se toca**: verificado en la
   pantalla real que un código de 20 caracteres se muestra entero, no crece al
   teclearle encima y sí se puede acortar.

   Queda pendiente **una decisión distinta**, sobre los datos: qué hacer con los
   93 productos fuera de norma que ya están. La medición del origen —47 nacieron
   el día de la carga inicial, el goteo se apagó el 2026-07-10, dos tercios tienen
   el nombre del producto en la columna del código, y **ninguno tiene otro código
   en el campo secundario**— está en
   [../business-rules/codigos-de-barra.md](../business-rules/codigos-de-barra.md).
   **Ningún dato se tocó.**
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
