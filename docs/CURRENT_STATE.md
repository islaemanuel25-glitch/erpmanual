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
> **Commit desplegado:** `f79cdafbabbf0a1e1865854ff27d5de6ff5f5cd8`
> **Desplegado el:** 2026-08-11 10:27 (hora del VPS, UTC)
>
> Los cinco valores coinciden: `origin/main`, HEAD del VPS, tag de la imagen,
> `APP_BUILD_ID` y `/api/version`. Los relojes del corte: la migración terminó de
> aplicarse **10:27:43.712**, el contenedor nuevo se creó **10:27:54.308** y
> arrancó **10:27:56.335**, o sea **un corte de unos 2 segundos** entre recrear y
> estar arriba. Next informó "Ready in 685ms". Cero reinicios.
>
> La ventana entre migrar y recrear —esquema nuevo con código viejo atendiendo—
> duró **13 segundos**, de 10:27:43 a 10:27:56. Se verificó antes de desplegar
> que la migración era compatible hacia atrás con la versión anterior: nada que
> escriba stock cambia, y el único efecto es que la etiqueta de "Albondigas
> Caseras x Caja" pasa de "Pieza" a "Kg" trece segundos antes que el código que
> la justifica.
>
> **Llevó migración de datos**, la primera que se despliega con el procedimiento
> corregido: `20260811030000_albondigas_venta_por_peso`. El conteo subió de 83 a
> **84**, verificado contra `_prisma_migrations` y con `migrate status` diciendo
> "Database schema is up to date!". Tocó exactamente tres filas —857, 2085 y
> 2211— y dejó intacta la 2210, que estaba excluida a propósito. Se cruzaron los
> ids de los dos lados, no los totales.
>
> El clasificador la marcó como NO ADITIVA por el `UPDATE` de datos y frenó el
> despliegue; Emanuel autorizó a mano con `DEPLOY_MIGRACION_AUTORIZADA=1`, y esa
> autorización quedó registrada en `.claude/migraciones-autorizadas.log`.
>
> Referencia de rollback de la versión anterior, las tres fijas:
> image ID `sha256:0078bf7f6bf653342babea8258cf7698809264f1d96d8baaba37027e99adde60`,
> RepoTag `ghcr.io/islaemanuel25-glitch/erpmanual:05834aa3a518115017f012e6473898c3cf7c1448`,
> digest `ghcr.io/islaemanuel25-glitch/erpmanual@sha256:c72db71fa10c637e9cc088c239226d89b42b9e29ae66404286b6f5ca731975f9`.
> Backup previo en el VPS: `/srv/produccion/backups/pre-f79cdaf_20260811_102214.sql.gz`,
> con los cinco chequeos, incluido el que confirma que el `620.000` que la
> migración borró está guardado adentro del dump.
>
> ⚠️ **Un rollback de imagen NO deshace esta migración.** Los datos quedan como
> los dejó; volver atrás el código no repone el `620.000` ni los `pesoEsFijo`.
>
> ### Una fila vieja sin terminar en `_prisma_migrations` — SIN EXPLICAR
>
> Apareció verificando el despliegue del 2026-08-11 y **no es de ese despliegue**:
>
> - `20241202000000_add_venta_campos`, empezada el **2026-03-21 04:13**,
>   `finished_at` en NULL, `rolled_back_at` el **2026-04-27 20:54**,
>   `applied_steps_count` en 0.
>
> Es de la ventana del incidente de React2Shell (ver `docs/incidents/INC-0001`).
> **Su archivo sigue en el árbol** (`prisma/migrations/20241202000000_add_venta_campos`),
> así que hay 84 archivos y 84 filas terminadas, más esta que quedó revertida.
>
> Prisma no la considera pendiente: `migrate status` informa 84 y "Database
> schema is up to date!". Por eso no bloquea nada y por eso pasó desapercibida
> hasta ahora.
>
> **Lo que no se sabe:** si el esquema que esa migración iba a introducir está
> aplicado por otra vía o si falta; por qué se revirtió; y si alguien lo hizo a
> mano. Nadie lo investigó. Se anota acá y no en un incidente porque no hay
> síntoma: es una inconsistencia registrada entre el árbol y la tabla de control,
> que conviene entender antes de que un día importe.
>
> Dónde mirar primero: comparar las columnas que esa migración declara contra las
> que la base tiene hoy. Es lectura y no toca nada.
>
> Llevó cuatro commits: la corrección de las skills `deploy` y `backup` con lo que
> salió del despliegue anterior (`68f0e2a`), y las tres tandas del vaciado de
> códigos de barra, que terminaron en `05834aa`.
>
> ### La migración, y el procedimiento corregido funcionando
>
> `20260810230000_vaciar_codigos_barra_del_deposito` puso en NULL el
> `codigo_barra` de 60 productos creados en el depósito cuyo código era texto. El
> criterio es quién creó el producto, por DEC-0006. El clasificador la marcó NO
> ADITIVA y frenó con código 1; se autorizó con `DEPLOY_MIGRACION_AUTORIZADA=1`.
>
> **Este fue el primer despliegue con el orden corregido, y se notó.** Con
> `APP_IMAGE` actualizado ANTES de bajar la imagen y de migrar, `compose pull app`
> descargó capas de verdad —la vez anterior informaba "Skipped - Image is already
> present locally" porque miraba la imagen vieja— y `migrate deploy` informó **83
> migraciones** contra las 82 que informaba el contenedor antes de empezar. Ese
> conteo, y no el código de salida, es lo que prueba que se aplicó algo.
>
> **Verificado después de aplicar, contra producción y solo lectura:** los
> productos con letras en el código bajaron a **1**; aparecieron **60** filas de
> bitácora de esta migración —89 sumando la anterior—; cero cadenas vacías; y el
> conjunto vaciado es **exactamente** el de la lista: cero ids sin vaciar, cero
> vaciados fuera de ella.
>
> El único que queda con código de texto es `pollo trozado` (id 2387), creado en
> Casiano Casas. La columna `codigo_barra` queda con 89 productos menos de basura
> y un solo caso pendiente de decisión.
>
> ### El tope de 16 caracteres ya está en producción
>
> Vino en `6a4821a`, dentro de este mismo despliegue: los cinco campos donde se
> carga un código frenan a los 16 caracteres al escribir y al pegar, y lo guardado
> largo se sigue mostrando entero. Así que la columna no solo quedó limpia: no
> puede volver a ensuciarse igual.
>
> **Referencia de rollback de esta versión** (la imagen que corría ANTES):
> `ghcr.io/islaemanuel25-glitch/erpmanual:17a014dd3739cbaf005f56d2c075d44fef5bd636`,
> digest `sha256:d6f86f157f49b24e542fac5ab02dc35a2947deb058bbdf9e1685b8a5bbe5378e`,
> image ID `sha256:83686d7b959e535e2f45373bf2bc5ad08c56ae37fcce1e12d2bf073fb7108815`.
>
> **Volver la imagen atrás NO deshace la migración.** Los 60 códigos quedan en
> NULL y la versión anterior los maneja —ya convivía con 323 productos sin
> código—. Para reponer datos: el SQL en
> `docs/business-rules/codigos-vaciados-deposito-2026-08-10.md`, que tiene los 15
> más vendidos señalados arriba de todo, y el dump previo en
> `/srv/produccion/backups/pre-migracion-deposito-05834aa_20260810_234139.sql.gz`
> (1.952.470 bytes, 56 tablas). Ese backup pasó los **cinco** chequeos, incluido
> el quinto: contiene `BARRATREMBLAY` y `cremosocremac`, dos de los códigos que la
> migración iba a borrar.
>
> **Lo que no cerró:** el árbol del VPS tiene **24 archivos sin trackear**
> —`.env.bak-*` y `.env.rollback-*` acumulados por despliegues anteriores—. Los
> trackeados están limpios. La verificación de cierre pide ese listado vacío.
>
> **Lo que no se pudo verificar:** que las pantallas se vean bien EN PRODUCCIÓN.
> Sin sesión las rutas devuelven 200 y sirven el armazón; el contenido lo dibuja el
> cliente después de autenticarse. Los logs de Next no registran por pedido: sus 6
> líneas prueban que arrancó, no que las pantallas funcionen. Y **no se comprobó
> con una venta real** que los 60 productos sin código se sigan encontrando por
> nombre en el POS: eso lo cubren los candados de `lib/productos/codigoVaciado.test.mjs`
> y la medición, no una prueba en producción.
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
