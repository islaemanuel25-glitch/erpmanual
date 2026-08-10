# Estado real del sistema — fotografía

> **Commit del relevamiento:** `d20afa98e9edece663fb3dda694d3c99783ab788`
> **Fecha y hora:** 2026-08-10 00:18
> **Rama:** `main`
>
> **Revisado el 2026-08-10** tras la tanda de correcciones: se cerraron cinco
> contradicciones y cinco puntos de deuda, marcados abajo como RESUELTO. El resto
> del documento sigue describiendo el commit del encabezado.
>
> ## En producción
>
> **Commit desplegado:** `84793e18c8d0b49d3e2d4c505c9e8e5b900de5be`
> **Desplegado el:** 2026-08-10 20:01 (hora del VPS, UTC)
>
> Los cinco valores coinciden: `origin/main`, HEAD del VPS, tag de la imagen,
> `APP_BUILD_ID` y `/api/version`. Sin migraciones —el clasificador informó cero
> archivos sobre el HEAD desplegado, y `migrate deploy` confirmó "No pending
> migrations" sobre las 81 existentes—. El corte quedó **por debajo de 5
> segundos**, medido de punta a punta: `up -d` arrancó 20:01:55 y volvió 20:01:59,
> y el primer sondeo posterior encontró el endpoint en 200 al segundo. Next
> informó "Ready in 504ms".
>
> Este despliegue llevó dos commits. El de fondo es `506bc08`: **el ancho que se
> le pide a `SunmiInput` ahora se aplica**. El componente ponía `w-full` siempre y,
> como empata en especificidad con el ancho pedido, ganaba por orden de hoja de
> estilos; medido antes del arreglo, 75 de 77 inputs de una pantalla tenían
> `width: 100%`. Ahora `w-full` lo pone `componerClaseInput` solo cuando nadie
> declaró ancho, así que los 193 usos sin ancho no cambian y los 28 que sí piden
> uno empiezan a recibirlo. Nueve de esos 28 no entraban con el ancho escrito y se
> ensancharon, medidos contra el peor valor real de producción. El segundo commit,
> `84793e1`, es solo documentación.
>
> **Sin migraciones y sin tocar la base.** `erpazul_db` sigue con 9 días de
> `Up (healthy)`: se recreó únicamente `app`, con `--no-deps`.
>
> **Referencia de rollback de esta versión** (la imagen que corría ANTES):
> `ghcr.io/islaemanuel25-glitch/erpmanual:a9b2e68b73b8634846f576c9bc9faaf46b035e10`,
> digest `sha256:679209db13acd1ae535ce749fd3b0a270d6c05d9035d1d03d738d10d494cc843`,
> image ID `sha256:806abc7ce3a560d220a47e0ae21218af199a0ee0a40152c68e306e5578e53a2c`.
>
> Backup previo validado con los cuatro chequeos:
> `/srv/produccion/backups/pre-84793e1_20260810_195518.sql.gz` (1.935.366 bytes,
> 56 tablas).
>
> **Lo que no cerró:** el árbol del VPS tiene **22 archivos sin trackear**
> —`.env.bak-*` y `.env.rollback-*` acumulados por despliegues anteriores, uno de
> ellos el de hoy—. Los trackeados están limpios. La verificación de cierre pide
> `git status --porcelain` vacío y no lo está; es previo y acumulado, no lo
> introdujo este despliegue.
>
> **Lo que no se pudo verificar:** que las pantallas se vean bien EN PRODUCCIÓN.
> Sin sesión, las rutas devuelven 200 y sirven el armazón, pero el contenido lo
> dibuja el cliente después de autenticarse. Y los logs de Next en producción no
> registran por pedido: sus 6 líneas prueban que la aplicación arrancó, no que las
> pantallas funcionen. Las capturas que respaldan el cambio son de la máquina de
> desarrollo, contra una copia de la base, no de producción.
>
> **Ojo:** el commit desplegado es POSTERIOR al del relevamiento. Lo que dice este
> documento sobre deuda y contradicciones vale para el commit del encabezado, con
> las correcciones marcadas como RESUELTO ya en producción.
>
> **ANTES DE CONFIAR EN ESTE DOCUMENTO, CORRÉ:**
>
> ```
> git rev-parse HEAD
> ```
>
> Si el hash **no coincide** con el de arriba, este archivo es **histórico**:
> describe cómo estaba el sistema en ese commit, no cómo está ahora. Sirve como
> referencia y como punto de comparación, no como verdad presente. Cuanto más
> lejos esté HEAD de ese hash, menos vale.
>
> **Esto es una fotografía y envejece.** Lo que no envejece está en
> [PROJECT.md](PROJECT.md).

Etiquetas: **[VERIFICADO]** comprobado ejecutando o leyendo · **[REGLA]**
documentada · **[DECISIÓN]** con evidencia en commits · **[INFERENCIA]** ·
**[DUDA]** no verificable.

---

## Los números, y con qué se contaron

Decir con qué se enumeró es parte del número.

| Qué | Cuánto | Enumerado con |
|---|---|---|
| Módulos de pantalla | 27 | `git ls-files "app/modulos/*"`, primer nivel, sin `.jsx` sueltos |
| Espacios de API | 37 | `git ls-files "app/api/*"`, primer nivel |
| Archivos `route.js` | 259 | `git ls-files "app/api/*/route.js"` |
| Modelos de Prisma | 55 | `grep -c "^model " prisma/schema.prisma` |
| Enums de Prisma | 22 | `grep -c "^enum "` |
| Migraciones | 81 | `ls -d prisma/migrations/*/` |
| Componentes Sunmi | 40 archivos | `git ls-files "components/sunmi/*.jsx"` |
| Archivos de candados | 92 | `git ls-files "*.test.mjs"` |
| Tests que corren | **2470** (0 fallando) | `node --import ./scripts/alias-loader.mjs --test $(git ls-files "*.test.mjs")` |
| Permisos declarados | 59, en 15 grupos, 0 deprecados | `grep -oE 'code: "[^"]+"' lib/rbac/registry.js \| sort -u` |
| Scripts en `scripts/` | 85 `.js`/`.mjs` | `git ls-files "scripts/*.mjs" "scripts/*.js"` |
| Archivos `.md` trackeados | 113 | `git ls-files "*.md"` |

**[VERIFICADO]** todos.

**Sobre los componentes Sunmi:** 40 archivos, de los cuales 38 llevan el prefijo
`Sunmi`. Descontando `SunmiThemeProvider.jsx`, que es infraestructura de tema y
no un control, quedan **37 componentes de UI**. Los dos sin prefijo
—`AparienciaInstitucionalSync.jsx` y `ThemeClientWrapper.jsx`— tampoco son
controles. Los tres números son correctos según qué se pregunte; el que hay que
declarar es la definición.

---

## Módulos, y cuáles no tienen documentación

Los 27 módulos reales. **[VERIFICADO]** — `git ls-files "app/modulos/*"`.

`auditoria` · `auditoria-pos-ventas` · `categorias` · `clientes` · `compras` ·
`compras-proveedor` · `configuracion` · `dashboard` · `fidelidad` · `grupos` ·
`inicio` · `locales` · `notificaciones` · `operadores` · `pedidos` ·
`pos-transferencias` · `pos-ventas` · `productos` · `proveedores` ·
`reportes-stock` · `reportes-ventas` · `roles` · `stock_locales` ·
`transferencias` · `turnos` · `usuarios` · `ventas`

`docs/modulos/` tiene **18 archivos** y se genera con `node scripts/update-docs.js`.
**Trece módulos no tienen documentación de módulo:**

`auditoria-pos-ventas` · `clientes` · `compras` · `compras-proveedor` ·
`configuracion` · `dashboard` · `fidelidad` · `inicio` · `notificaciones` ·
`operadores` · `pedidos` · `reportes-stock` · `ventas`

(`stock_locales` sí está documentado, bajo el nombre `stock`.)

De esos trece, el más grave es **`compras-proveedor`**: es uno de los caminos que
escribe el costo maestro en producción y no tiene ni documentación ni candados
propios. **[VERIFICADO]**

---

## Áreas activas

Medido por fecha del último commit que tocó el código de cada módulo.
**[VERIFICADO]**

- **Listas de precios de proveedor** (`lib/proveedores/listas/`) — el área más
  activa del último mes por lejos. 26 archivos de candados, ~787 tests. Todo el
  trabajo de agosto de 2026 pasó por acá.
- **Auditoría / bitácora** — tocada el 2026-08-09.
- **Productos y precios** — 2026-08-07/08.
- **Turnos y caja** — 2026-08-04/07.

Quieto desde julio o antes: `areas-fisicas`, `categorias`, `grupos`, `locales`,
`roles`, `usuarios`, `stock`.

---

## Infraestructura

**[VERIFICADO]** — `docker-compose.prod.yml`, `.github/workflows/build-imagen.yml`,
`next.config.mjs`.

- Producción en `https://operix.cloud`, VPS propio, dos contenedores:
  `erpazul_app` y `erpazul_db` (PostgreSQL 16).
- La imagen la construye **GitHub Actions** y se publica en
  `ghcr.io/islaemanuel25-glitch/erpmanual:<SHA_COMPLETO>`, solo `linux/amd64`.
  El VPS solo descarga. `pull_policy: missing`.
- `output: "standalone"` en Next.
- El servicio `db` fue creado **fuera de Compose** y tiene un pendiente conocido
  de interpolación de `POSTGRES_PASSWORD`: **no se lo puede recrear**. Todo
  despliegue va con `--no-deps app`. **[REGLA]** — skill `/deploy`.
- Backups: tres destinos efectivos (VPS, notebook, repo cifrado). Un cuarto
  —disco `BACKUP-ERP`— está previsto en el código y **no existe**: cada corrida
  registra `NO CONECTADO`. **[VERIFICADO]** — skill `/backup`.

---

## Deuda técnica, con evidencia

Solo lo que se puede señalar en un archivo. Ordenado por lo que puede doler.

### 1. `/api/me` se abría donde el resto se cerraba — **RESUELTO 2026-08-10**

Devolvía `["*"]` ante un token con permisos corruptos, mientras `login` y
`getUsuarioSession` caían a `[]` y lo declaraban por escrito.

La regla vive ahora una sola vez en `lib/rbac/permisosSesion.js` y la importan los
tres. Commit `32e0d51`. Ver contradicción C-01.

### 2. `lib/compras-proveedor/` escribe costos y no tiene candados — **[VERIFICADO]**

`costoMaestro.js` y `calculoPedido.js` no tienen `.test.mjs` propio. Los llaman
tres rutas que escriben en producción: `compras-proveedor/crear`,
`compras-proveedor/editar-item/[id]` y `compras-proveedor/recibir/[id]`. La única
cobertura es indirecta: `lib/precios/margenNoSeDeforma.test.mjs`, que los lee
como texto para verificar que deleguen la fórmula.

Contraste: el módulo de listas, que hace lo mismo, tiene ~787 tests.

### 3. Cero candados sobre el corazón de la plataforma — **[VERIFICADO]**

No existe ningún `.test.mjs` de `lib/auth.js`, `lib/authorize.js`,
`lib/grupos.js`, `lib/contexto.js` ni del interceptor de auditoría. Son las
piezas que deciden quién entra y a qué ubicación.

### 4. La bitácora no cubre el dinero — **[VERIFICADO]**

La lista blanca de `lib/auditoria/interceptor.js:49-59` son nueve modelos:
`PedidoProveedor` (solo `update`), `Transferencia`, `PosTransferencia` (solo
borrados), `ProductoBase` (solo `update`), `ProductoLocal`, `Usuario`, `Rol`,
`OperadorLocal`, `OperadorEnLocal`.

**No están `Venta`, `Turno`, `CajaMovimiento`, `StockLocal` ni `Cliente`.** La
tabla sirve para rastrear productos y usuarios, no para reconstruir la operación.

Y lo anterior al 2026-08-09 está incompleto además por otra razón, medida y
documentada en [BITACORA-COBERTURA.md](BITACORA-COBERTURA.md): 451 escrituras sin
rastro sobre 811.

### 5. El volcado de la bitácora depende de que el endpoint pida la sesión — **[VERIFICADO]**

`programarFlush` se llama desde **un solo lugar**: `lib/auth.js:147`, dentro de
`getUsuarioSession`. Un endpoint que escriba sin pasar por `getUsuarioSession`,
`requireAuth`, `requirePerm`, `requireAdmin` ni los resolvedores de `grupos.js`
llena el buffer y nunca lo vuelca.

De los 259 `route.js`, **211 mencionan alguno de esos ocho nombres**. Quedan
**48 que no mencionan ninguno**. **[DUDA]** — no se abrió una por una para saber
cuáles de esas 48 escriben en la base. Es la primera medición pendiente.

### 6. La superficie que escribe el costo maestro es grande — **[VERIFICADO, con método]**

Enumerado con un patrón que busca `productoBase|productoLocal . update|create…`
con `precio_costo` en el bloque `data`, más los que se encontraron leyendo:

`app/api/productos/crear` · `productos/editar/[id]` · `productos/import/apply` ·
`productos/precios/apply` · `productos/promover-a-deposito` ·
`compras-proveedor/recibir/[id]` · `stock_locales/nuevo` · `stock_locales/listar` ·
`transferencias/confirmar-recepcion` · `grupos/[id]/sync-productos` ·
`lib/combos/service.js` · `lib/precios/propagarCostoALocales.js` ·
`lib/compras-proveedor/costoMaestro.js` · `proveedores/listas/[id]/aplicar` ·
`proveedores/listas/[id]/revertir`.

**Ese número es un piso, no un techo.** El patrón no ve las escrituras donde el
objeto `data` se arma en una variable aparte. Cualquier cambio en la regla de
propiedad del costo tiene que revisar todos, no los tres que primero aparecen.

### 6.bis El redondeo a 100 estaba duplicado — **RESUELTO 2026-08-10**

Había dos funciones hacia arriba que diferían con centavos, y **el POS usaba la
defectuosa**: un valor con residuo binario saltaba de múltiplo y cobraba cien
pesos de más. Quedó una sola, `redondear100` en `lib/precios/redondeo.js`, con
diez llamadores y candado sobre el caso de los centavos.

### 6.ter El descuento por puntos entraba crudo del cliente — **RESUELTO 2026-08-10**

Era el único importe del cobro que el servidor aceptaba sin recalcular. Ahora lee
`pesoPorPunto` de la configuración y rechaza el cobro si no coincide.

### 6.quater La agenda de clientes era pública — **RESUELTO 2026-08-10**

**Seis** rutas de lectura de clientes no pedían ningún permiso —no dos, como decía
el relevamiento: además de `listar` y `buscar` estaban `[id]`, `[id]/ventas`,
`analytics/ranking` y `analytics/inactivos`—. Ahora exigen `clientes.ver` **o**
`pos.usar`, para no romper la búsqueda desde el POS.

### 7. Tres registries de menú conviviendo — **[VERIFICADO]**

`lib/menu/registry.js` es el activo. `lib/menuConfig.js` es un shim que
reexporta. `lib/menu/registry.schema.js` es un registry paralelo completo cuyo
propio encabezado dice que "aún NO se consume" y que "se va a deprecar". Es el
escenario exacto de la regla 1 de `CLAUDE.md`: no se rompe hoy, se rompe el día
que uno cambie.

### 8. El generador de documentación duplica entradas — **[VERIFICADO]**

`docs/modulos/proveedores.md` tiene **99 líneas** de "Cambios recientes" que
corresponden a **16 commits únicos**. `scripts/update-docs.js` reescribe la
sección acumulando en vez de reemplazar.

### 9. Los permisos viajan congelados en el token — **[VERIFICADO]**

El JWT lleva el array de permisos del rol y dura 8 horas
(`app/api/login/route.js:131`). Cambiar los permisos de un rol **no afecta a
quien ya tiene sesión abierta**. No hay lista de revocación; `logout` solo borra
la cookie.

### 10. No hay barrera central — **[VERIFICADO]**

No existe `middleware.js`. Cada uno de los 259 handlers se protege solo, y no hay
ningún candado que recorra las rutas verificando que todas exijan sesión.

### 11. El rate limit del login es por proceso — **[VERIFICADO]**

`app/api/login/route.js:12` usa un `Map` en memoria. Se pierde al reiniciar el
contenedor y no se comparte entre instancias. Con una sola instancia, como hoy,
funciona.

### 12. El rollback de una migración nunca se ejecutó — **[VERIFICADO]**

Documentado en `docs/RELEASE-CHECKLIST.md` §3 y marcado como no probado en la
skill `/deploy`. Nadie corrió los cuatro pasos, ni en producción ni en una copia.

### 13. Columnas muertas declaradas en el schema — **[VERIFICADO]**

`ImportacionListaFila.unidadesConfirmadas` y `.factorConfirmado`
(`prisma/schema.prisma:2490-2493`) están marcadas en el propio schema como "se
eliminan en una migración de limpieza". Sigue pendiente.

### 14. `EstadoFilaLista.EXCLUIDO` es una rama muerta — **[VERIFICADO]**

El valor existe en el enum y en `lib/proveedores/listas/estados.js:51`, pero
ningún llamador le pasa `excluido: true`: los lectores reales filtran por la
columna `excluidaManual`. El comentario del schema afirma que "del lado JS ya se
sacó", y eso no es exacto — la rama existe, solo que nadie la alcanza.

---

## Trabajos en curso y sin verificar

- **8 commits** llevan `SIN VERIFICAR` en el título. **[VERIFICADO]** —
  `git log --all -i --grep="SIN VERIFICAR"`. Es la convención del repo para lo
  que se commiteó sin probar; hay que mirarlos antes de dar por hecho lo que
  tocan.
- **`equivalenciaDisplay`** en `lib/proveedores/listas/configuraciones/arcor.js:197`
  es un gancho declarado y sin regla de negocio: es lo que deja las filas de
  unidad "DI" sin poder aplicarse. **[VERIFICADO]**
- **La rama `main` está 3 commits adelante de `origin/main`** al momento del
  relevamiento. **[VERIFICADO]**

---

## Limitaciones verificadas del entorno

- **El proyecto es JavaScript.** Un cliente Prisma desactualizado pasa el build y
  los candados en verde, y falla recién contra Postgres. Después de tocar
  `schema.prisma`, `prisma generate`. **[REGLA]**
- **Editar el interceptor de Prisma no tiene efecto hasta reiniciar el servidor
  de desarrollo**: el cliente extendido queda cacheado y congela el código viejo
  en su clausura. **[VERIFICADO]**
- **Un 404 de `curl` contra un dev server a medio recargar no distingue "no
  existe la ruta" de "no llegaste bien".** **[VERIFICADO]**
- **En Git Bash, `claude -p "/skill"` a secas se convierte en una ruta de
  Windows.** Hay que usar `MSYS_NO_PATHCONV=1` o poner texto después.
  **[VERIFICADO]**
- **`/api/login` limita a 10 intentos cada 15 minutos por IP**, y una corrida del
  arnés de capturas por tandas los consume. **[VERIFICADO]**
- **No se pueden fabricar datos para probar.** En `erpazul_al` no hay ninguna fila
  en `ERROR` ni en `BLOQUEADO`: esos casos no tienen captura y eso es
  información, no una tarea pendiente. **[REGLA]**

---

## Lo que este relevamiento NO cubrió

Para que nadie lo lea como completo:

- No se abrieron las **48 rutas** que no mencionan ningún helper de sesión.
- No se verificó el `onDelete` de las relaciones de `Proveedor`: borrar un
  proveedor solo cuenta `ProductoBase` (`app/api/proveedores/eliminar/route.js:29`),
  y hay relaciones a `PedidoProveedor`, `ProductoCodigoProveedor` e
  `ImportacionListaProveedor`. **[DUDA]**
- No se relevaron en profundidad `dashboard`, `inicio`, `configuracion`,
  `notificaciones` ni `fidelidad`.
- No se corrió nada contra producción.
