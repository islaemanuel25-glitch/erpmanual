# Contradicciones

Lugares donde el repo se contradice a sí mismo. **Ninguna se resolvió eligiendo
una versión en silencio**: acá se registra que hay dos y quién dice qué.

Relevado sobre `d20afa98e9edece663fb3dda694d3c99783ab788`.
**Actualizado el 2026-08-10:** de las doce, **cinco están cerradas** (C-01, C-10 y
las tres del bloque de precios y `esDefault`). Las cerradas quedan escritas con lo
que se hizo, no se borran: el historial de por qué algo es como es vale tanto
como el estado actual.

---

## C-01 — `/api/me` se abría donde el resto se cerraba · **CERRADA (2026-08-10)**

Era la más grave, porque las dos versiones eran código y una declaraba la regla
por escrito.

- `app/api/login/route.js` — caía a `[]`, con el comentario textual: *"Seguridad:
  si permisos no es un array válido… **NO otorgar admin. Fail-closed → sin
  permisos**."*
- `lib/auth.js` — lo mismo.
- **`app/api/me/route.js`** — caía a `["*"]`. Un token con permisos corruptos
  recibía **admin total**.

El backend rechazaba igual cada operación porque valida contra
`getUsuarioSession`, así que no era un agujero de escritura; pero el frontend
arma menú y botones con esa respuesta.

**Cómo se cerró:** no se arregló solo el archivo roto. La decisión estaba escrita
a mano en los tres lugares, y ese era el bug de fondo. Ahora vive una sola vez en
`lib/rbac/permisosSesion.js` —módulo puro— y los tres la importan. Dos candados
estructurales recorren los tres archivos: uno falla si vuelve un fallback a
`["*"]`, el otro si alguien reimplementa la regla en vez de importarla. Commit
`32e0d51`.

---

## C-02 — `docs/01-ARQUITECTURA.md` contra `lib/visibilidad.js`

El documento pone, en la tabla "Depósito vs Local", **"Crea productos: Local →
No"**.

El código dice que sí: `app/api/productos/crear/route.js:271-303` tiene la rama
del local. Lo que el local **no** hace es replicar.

**Manda el código.** Ver [deposito-y-local.md](deposito-y-local.md), RN-01.

---

## C-03 — `docs/01-ARQUITECTURA.md` tiene números vencidos

Todos verificados el 2026-08-10:

| Dice | Es |
|---|---|
| Next.js 16.0.1 | **16.0.10** |
| React 19.2.0 | **19.2.1** |
| "34 componentes" Sunmi | **40 archivos** (37 de UI) |
| "18+ modelos" | **55 modelos** |
| Lista 12 módulos | Hay **27** |

Y su afirmación *"Todas las páginas son use client. No hay Server Components con
data fetching directo"* tiene **una excepción real**: `app/layout.jsx:19` es un
Server Component que consulta la base (`resolverTemaInstitucionalSSR` lee
`ConfiguracionLocal`). Es la única encontrada, y es deliberada — resuelve el tema
en SSR para evitar el flash.

---

## C-04 — `docs/02-AUTH.md` describe un sistema más chico del que existe

- Lista **dos cookies**; el código usa **cuatro**: `erpazul_sesion`,
  `erpazul_grupo_activo`, `erpazul_contexto_activo` (`lib/contexto.js:4`) y
  `erpazul_operador_activo` (`lib/operador.js:10`).
- Lista **9 grupos con ~25 permisos**; `lib/rbac/registry.js` tiene **59 códigos
  en 15 grupos**. Faltan enteras las familias `config_local.*`,
  `ventas.corregir_*`, `costos.ver`, `auditoria.ver` y `usuarios.gestionar_local`.
- Describe el retorno de `getUsuarioSession` **sin** `esDuenoLocal` ni
  `esDeposito`, que hoy existen y gobiernan el bypass de operario.
- Presenta como patrón chequear `session.permisos.includes(...)` a mano; el código
  tiene helpers en `lib/authorize.js` que el documento no menciona.

Es el documento más desactualizado de los siete de `docs/0X-*`.

---

## C-05 — El schema afirma más de lo que el código hace: `EXCLUIDO`

`prisma/schema.prisma`, comentario del enum `EstadoFilaLista` (~línea 2279), dice
que `EXCLUIDO` "del lado JS ya se sacó".

No es exacto: `lib/proveedores/listas/estados.js:51`, `:63` y `:139` lo siguen
exportando y devolviendo si alguien pasa `excluido: true`. Lo que sí es cierto es
que **ningún llamador se lo pasa**: los lectores reales filtran por la columna
`excluidaManual` (`contadores.js:41`, `seleccion.js:65`, `macheo.js:233`,
`panelDecision.js:249`).

La rama existe y está muerta. El comentario afirma que no existe.

---

## C-06 — El schema contra su propia migración: el índice de archivo

`prisma/schema.prisma:2370-2373` dice que el índice parcial de archivo "excluye las
canceladas".

La migración real
(`prisma/migrations/20260806050000_indice_archivo_solo_abiertas/migration.sql:16`)
es **más restrictiva**: solo bloquean `BORRADOR`, `CONCILIADA` y
`PARCIALMENTE_APLICADA`.

El comentario quedó viejo. El código de `importar/route.js:169` sí coincide con la
migración.

---

## C-07 — Los documentos de módulo contra el schema

Todos verificados:

- `docs/modulos/productos.md:11` — "Cada ProductoBase se replica como
  ProductoLocal en cada local del grupo". **Falso desde la Regla A.** Y su bloque
  Prisma omite `creadoEnLocalId`, `es_combo`, `modalidad`, `reglaPrecio` y
  `codigo_barra_propio`.
- `docs/modulos/stock.md:60-68` — declara `cantidad Decimal(12,2)`; es **(12,3)**,
  y no menciona `enTransito`. En `:54` lista solo `stock.ver`, cuando ajustar,
  límites, importar y nuevo exigen `stock.editar`.
- `docs/modulos/transferencias.md:106-128` — declara `creadaPor String?` (es
  `Int?`) y `unidadEnviada UnidadMedida?` (es **`ModoPedido?`**), y las cantidades
  en `(12,2)` cuando son `(12,3)`. El resto del documento sí coincide.
- `docs/modulos/categorias.md:44` — "Autenticación básica (no tiene permiso
  específico)". En el código crear/editar/eliminar exigen **admin** y listar exige
  `productos.ver`.
- `docs/modulos/pos-transferencias.md:96` — "POS se elimina después del envío". El
  código la deja en estado `Enviado` (`enviar/route.js:264-266`).
- `docs/modulos/proveedores.md` — describe **solo el ABM**. No menciona el
  submódulo de listas, que es el área más activa del sistema, con 15 endpoints y
  ~787 tests.

---

## C-08 — `docs/modulos/pos-ventas.md` lista como pendiente lo que ya está hecho

Líneas 509-518, "Estado actual / Próximos pasos": da por pendientes la impresión
de tickets, los turnos y arqueo de caja, y el historial de ventas. **Los tres
están implementados** y son de lo más maduro del módulo.

Además: la línea 40 lista las formas de pago sin **FIADO**, que está en el enum
`MedioPago`; la 41 presenta el 7 % de comisión como fijo cuando es configurable; y
la 493 dice que `buscar-producto` "retorna hasta 10 resultados con stock > 0",
cuando el código devuelve también los sin stock marcándolos con
`disponibleParaVenta` y usa ranking difuso, sin tope de 10.

---

## C-09 — `CLAUDE.md` contra los componentes base

`CLAUDE.md` dice no usar `<select>` ni `<input>` nativos.
`components/sunmi/SunmiSelect.jsx:8` y `SunmiDateRangePicker.jsx:285` usan
`<select>` nativo **por dentro**.

No es una violación: la regla es para las pantallas, y el componente base tiene
que envolver algo. Pero el texto no lo aclara y se lee como contradicción.

---

## C-10 — Dos criterios opuestos para auditar antes de mover · **CERRADA (2026-08-10)**

- **Transferencias**: si no se puede auditar, **no se hace la devolución**.
- **Ajuste de stock**: el stock se movía **aunque la auditoría fallara**; el error
  se tragaba con `.catch(console.error)`, y además la escritura corría fuera de
  transacción, así que sacar el `.catch` no habría alcanzado.

**Cómo se cerró:** el ajuste se alineó con transferencias. La escritura de stock y
su fila de `AuditoriaStock` van ahora en la **misma transacción**, en los dos
modos —ajuste y límites—, y sin `grupoId` la operación se rechaza con 409 en vez
de escribir a ciegas.

**El criterio quedó escrito en el encabezado del archivo**, que era la mitad del
problema: la divergencia duró meses porque nada la explicaba. El razonamiento es
que todos los demás movimientos de stock tienen un documento atrás —remito,
ticket, pedido— y el ajuste manual **no tiene ninguno**: la fila de auditoría es
la única evidencia de que ocurrió. Y el costo también quedó escrito: si la tabla
de auditoría falla, el ajuste deja de funcionar. Es deliberado.

---

## C-11 — La pantalla de fidelidad pide más permiso que su API

- `app/modulos/fidelidad/page.jsx:204-206` exige `permisos.includes("*")`, o sea
  **solo el dueño**.
- `app/api/puntos-config/route.js:44-46` acepta admin **o**
  `config_local.fidelidad`.

Quien tenga esa capability tiene el permiso y **no puede llegar a la pantalla**.

---

## C-12 — Documentos de la raíz que describen código que ya no existe

- `INFORME_PRECIO_STOCK_VS_POS.md:14` describe un helper `roundUp100` en
  `FormProducto.jsx`. **Ese helper ya no existe**: el archivo importa
  `redondearA100Arriba`.
- `AUDITORIA_MODULO_PRODUCTOS.md:184` dice que el alta pone `redondeo_100: false`.
  El código pone `Boolean(body.redondeo_100)` y el **default del schema es
  `true`**.

Son dos de los ~63 informes sueltos de la raíz. No se mantienen y no son
documentación vigente; ver [../PROJECT.md](../PROJECT.md).

---

## C-13 — El historial del cliente estaba clasificado como técnico · **CERRADA (2026-08-10)**

Apareció al arreglar la mezcla de ventas internas: **la ruta estaba en la lista de
TÉCNICOS a propósito**, con su justificación en
`lib/ventas/filtroVentaComercial.js` ("historial" entre las superficies que no
filtran) y un candado que lo afirmaba. El relevamiento la había marcado como
posible accidente porque la justificación no estaba en la ruta, sino en la
clasificación.

O sea que no era un descuido: era una decisión, tomada en otro momento y con otro
criterio.

**Cómo se cerró:** se movió de TÉCNICO a COMERCIAL, y el candado de clasificación
se reescribió sabiendo qué se cambiaba —nunca se aflojó—. El argumento es que es
una pantalla que mira una persona para saber qué le compró un cliente, no una
vista de inspección. La necesidad técnica no se perdió: las internas se piden con
`?incluirInternas=1`, que es explícito y se prende.

Verificado ejecutando contra `erpazul_al`: el cliente 1 tiene 333 ventas, 287
comerciales y 46 internas. La venta interna 4033 **no aparece** por defecto y **sí
aparece** con el parámetro.

---

## C-14 — Un candado puede pasar en verde con el código roto · **lección, no contradicción**

No es una contradicción del repo: es algo que pasó al cerrar C-13 y conviene que
quede escrito.

El candado que verificaba que las seis rutas de clientes pidieran permiso buscaba
la constante `PERMISOS_LEER_CLIENTES` en el archivo. Pasó en verde mientras cinco
de esas rutas estaban **rotas**: se le pasaba a `checkPerm` el scope entero en vez
de `scope.session` —los resolvedores devuelven la sesión anidada—, así que
`session.permisos` era `undefined`, reventaba con TypeError, lo atrapaba el catch
y la ruta respondía **500 en vez de 403**. La pantalla quedaba rota para todos,
incluido quien sí tenía el permiso.

Lo encontró una captura, no el candado. Ahora hay dos candados más: uno prohíbe
`checkPerm(scope,` en las seis rutas y otro recorre **todo** `app/api/clientes/`
buscando esa forma.

**La lección:** un candado que verifica que algo *esté* no verifica que *funcione*.
Cuando lo que se afirma es "esta ruta valida permisos", la forma de la llamada es
parte de la afirmación.
