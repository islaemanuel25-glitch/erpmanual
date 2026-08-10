# ERP Azul — la cabeza del proyecto

Documento **breve y estable**: lo que casi no cambia. Si algo de acá cambia, es
porque cambió el proyecto, no porque pasó una semana.

Lo que sí envejece —qué módulos hay hoy, qué está a medias, qué falta— vive en
[CURRENT_STATE.md](CURRENT_STATE.md), que lleva el commit sobre el que se relevó.

Cada afirmación de este documento va etiquetada:

- **[VERIFICADO]** — comprobado leyendo código o corriendo un comando en este repo.
- **[REGLA]** — regla documentada en `CLAUDE.md` o en una skill.
- **[DECISIÓN]** — decisión histórica con evidencia en commits o comentarios.
- **[INFERENCIA]** — deducido de la estructura, no afirmado por nadie.
- **[DUDA]** — no se pudo verificar.

---

## Qué es ERP Azul

Un sistema de gestión para una **cadena chica de comercios minoristas con
depósito central**. Está en producción real, en `https://operix.cloud`, con datos
reales y ventas reales. **[VERIFICADO]** — `docker-compose.prod.yml`,
`.github/workflows/build-imagen.yml`.

No es un producto para vender a terceros: es el sistema de un negocio concreto,
construido por su dueño. Eso explica varias decisiones que en un producto
genérico serían raras — reglas atadas a cómo trabaja este negocio y no a un
estándar. **[INFERENCIA]**

### El problema que resuelve

Un depósito que compra a proveedores y varios locales que venden al público, con
tres cosas que se desincronizan solas si nadie las sostiene: **el catálogo**
(qué producto es cuál, con qué código de barras), **el costo** (qué se pagó y
cuánto hay que cobrar) y **el stock** (qué hay en cada lugar). ERP Azul es el
lugar donde esas tres cosas se mantienen consistentes entre el depósito y los
locales. **[INFERENCIA]** a partir de los módulos que existen.

---

## El concepto central: depósito y local

Es lo primero que hay que entender. Casi toda regla no obvia del sistema sale de
acá.

Una **ubicación** es una fila de `Local`. El campo `es_deposito` decide de qué
tipo es. Un **grupo** (`Grupo`) junta varias ubicaciones; un depósito se ata al
grupo por `GrupoDeposito` y los locales por `GrupoLocal`. **[VERIFICADO]** —
`prisma/schema.prisma`.

Las diferencias que importan:

- **El catálogo baja, no sube.** Lo que crea el depósito se replica a todos los
  locales del grupo. Lo que crea un local existe **solo en ese local**: no sube
  al depósito ni se ve desde los otros. El predicado está en
  `lib/visibilidad.js` (`productoVisibleWhere`), y la replicación en
  `app/api/productos/crear/route.js`, en la rama `if (creador?.es_deposito)`.
  **[VERIFICADO]**
- **Un local sí puede crear productos.** Solo que no se replican. Si leés lo
  contrario en `docs/01-ARQUITECTURA.md`, ese documento está desactualizado — ver
  las contradicciones en [CURRENT_STATE.md](CURRENT_STATE.md). **[VERIFICADO]**
- **El depósito cuenta en bultos y el local en unidades**, y el puente es
  `factor_pack` del producto. **[VERIFICADO]** — el campo existe en
  `ProductoBase`; la conversión vive en `lib/conversiones/`.
- **El dueño del producto manda sobre su costo.** Solo la ubicación que lo creó
  puede editar el precio de costo. **[VERIFICADO]** — `lib/productos/propiedadCosto.js`.

### Las tres capas de un producto

```
ProductoBase    la ficha maestra: nombre, códigos, categoría, proveedor, factor_pack
ProductoLocal   lo que ese producto vale en UNA ubicación: precio_costo, precio_venta
StockLocal      cuánto hay de ese producto en esa ubicación
```

**[VERIFICADO]** — `prisma/schema.prisma`. Un `ProductoLocal` es un *override*
por ubicación; leer un precio sin decir de qué ubicación no significa nada.

---

## Actores

Los roles de sistema declarados son cuatro. **[VERIFICADO]** —
`lib/rbac/systemRoles.js` y `prisma/seed.js`.

- **Admin** — permisos `["*"]`, `esSistema: true`. Ve todo, cambia de grupo
  activo. Es el dueño.
- **DUEÑO_LOCAL**, **ENCARGADO**, **CAJERO** — roles por ubicación. Los tres
  exigen que el usuario tenga `localId` (`ROLES_REQUIEREN_LOCAL`).

Los permisos se declaran en un registro único, `lib/rbac/registry.js`: **59
permisos en 15 grupos**, ninguno marcado como deprecado. **[VERIFICADO]**

Hay además un actor que **no** es un usuario del sistema: el **operario**, una
persona que atiende el mostrador y se identifica en el POS sin tener cuenta
propia. Vive en `OperadorLocal` / `OperadorEnLocal` y es configurable por local.
**[VERIFICADO]** — `prisma/schema.prisma`, `app/modulos/operadores/`.

---

## Arquitectura general

**Patrón BFF.** Todas las páginas son cliente; los datos van por `fetch()` a
Route Handlers de Next que hablan con Prisma. **No hay Server Components que
consulten la base directamente.** **[VERIFICADO]** — `docs/01-ARQUITECTURA.md` lo
afirma y la estructura de `app/api/` lo sostiene.

```
UI (React, "use client")  →  app/api/**/route.js  →  Prisma  →  PostgreSQL
```

**No hay `middleware.js`.** La autorización se resuelve dentro de cada handler,
con envoltorios (`requireAdmin`, `resolveScope`, `lib/authorize.js`). Esto
importa al relevar: buscar quién valida algo por el nombre del helper deja
afuera a los que lo hacen a través del envoltorio. **[VERIFICADO]**

**La sesión es un JWT en cookie.** `erpazul_sesion`. El contexto de trabajo son
otras dos cookies: `erpazul_grupo_activo` y `erpazul_contexto_activo` (la
ubicación). **[VERIFICADO]** — enumeradas con `git grep -oh "erpazul_[a-z_]*"`.

**Las escrituras se auditan por interceptor.** `lib/auditoria/` extiende el
cliente Prisma y registra en `AuditoriaBitacora`. La cobertura anterior al
2026-08-09 es **incompleta** y está medida en
[BITACORA-COBERTURA.md](BITACORA-COBERTURA.md). **[VERIFICADO]**

### Stack

| Capa | Qué | Versión instalada |
|---|---|---|
| Framework | Next.js (App Router) | 16.0.10 |
| UI | React | 19.2.1 |
| Estilos | Tailwind CSS | 3.4.18 |
| Base | PostgreSQL | 16 |
| ORM | Prisma | 6.19.0 |
| Auth | JWT + bcrypt | — |

**[VERIFICADO]** — leído de `node_modules/*/package.json` y de
`docker-compose.prod.yml`. **El proyecto es JavaScript, no TypeScript**, y eso
tiene una consecuencia concreta: Next compila sin mirar los argumentos de
Prisma, así que un cliente Prisma desactualizado pasa el build y los candados en
verde y falla recién contra Postgres. **[REGLA]** — `CLAUDE.md` §2.

**Sistema de componentes propio, "Sunmi".** 40 archivos en `components/sunmi/`, de
los cuales 37 son controles de UI (los otros tres son infraestructura de tema). En
las pantallas no se usan `<select>` ni `<input>` nativos. **[VERIFICADO]** /
**[REGLA]**.

### Despliegue

GitHub Actions construye la imagen y la publica en GHCR por **SHA completo**; el
VPS solo descarga. El VPS nunca construye. **[REGLA]** — el procedimiento
ejecutable es la skill `/deploy`; el mapa de cómo está armado está en
[architecture/despliegue.md](architecture/despliegue.md).

---

## Los módulos

Hay **27 módulos** bajo `app/modulos/` y **37 espacios de API** bajo `app/api/`.
**[VERIFICADO]** — enumerados con `git ls-files`. Los grandes, agrupados por
dominio:

- **Catálogo y precios** — `productos`, `categorias`, `combos` (API), listas de
  precios comerciales.
- **Stock y movimientos** — `stock_locales`, `transferencias`,
  `pos-transferencias`, `reportes-stock`.
- **Venta** — `pos-ventas` (el módulo más grande), `turnos`, `ventas`,
  `reportes-ventas`, `auditoria-pos-ventas`, `clientes`, `fidelidad`.
- **Compra** — `proveedores` (incluye las **listas de precios de proveedor**, el
  área más activa del último mes), `compras-proveedor`, `compras`, `pedidos`.
- **Plataforma** — `usuarios`, `roles`, `grupos`, `locales`, `configuracion`,
  `operadores`, `notificaciones`, `auditoria`, `dashboard`, `inicio`.

El detalle por módulo está en [modulos/](modulos/), que se genera solo con
`node scripts/update-docs.js`. La lista completa y cuáles **no** tienen
documentación está en [CURRENT_STATE.md](CURRENT_STATE.md).

---

## Dónde está lo que más se toca

Los tres motores que deciden plata. Si te toca cambiar un precio o un costo,
empezá por acá — y leé antes
[business-rules/costos-y-precios.md](business-rules/costos-y-precios.md).
**[VERIFICADO]**

| Qué decide | Archivo |
|---|---|
| Precio de venta desde el costo y el margen | `lib/precios/precioDesdeMargen.js` |
| Redondeo a 100 | `lib/precios/redondeo.js` y `precioDesdeMargen.js` (son **dos** funciones) |
| Propagar un costo nuevo a todas las ubicaciones | `lib/precios/propagarCostoALocales.js` |
| Quién puede editar un costo | `lib/productos/propiedadCosto.js` |
| Costo maestro desde una compra | `lib/compras-proveedor/costoMaestro.js` |
| Qué precio se cobra en la venta | `lib/precios/resolverListaCliente.js` |
| Aplicar una lista de proveedor | `lib/proveedores/listas/aplicacion.js` |

**Leer un precio siempre exige decir de qué ubicación.** El patrón es
`lib/mappers/producto.js` (`pick`, línea 15): el override de `ProductoLocal` si no
es null, si no el de `ProductoBase`. Ojo con `||` contra `??` — hay tres lecturas
del mismo hecho con dos operadores distintos, ver RN-16.

**El área más activa** es el submódulo de listas de precios de proveedor:
`lib/proveedores/listas/` (26 archivos de candados, ~787 tests),
`app/api/proveedores/listas/` y `app/modulos/proveedores/listas/`. **No está
documentada**: `docs/modulos/proveedores.md` describe solo el ABM.

---

## Levantar el proyecto

**[VERIFICADO]** — `package.json`, y las variables enumeradas con
`git grep -oh "process\.env\.[A-Z_]*"`.

```
npm install
npx prisma generate          # después de CUALQUIER cambio en schema.prisma
npx prisma migrate dev       # aplica migraciones en la base local
node prisma/seed.js          # roles de sistema y grupo base; es idempotente
npm run dev
```

Variables mínimas en `.env`: **`DATABASE_URL`** y **`AUTH_SECRET`**. Las demás son
opcionales según lo que se toque (`WEB_PUSH_*` para notificaciones,
`APP_BUILD_ID` solo en la imagen, `CORRECCION_VENTAS_BETA_USER_IDS` para el flag
beta). **No hay `.env.example` en el repo** — hay que pedir los valores.

**PostgreSQL local:** hay un `docker-compose.yml` en la raíz, separado del de
producción. **[VERIFICADO]** que existe; **[DUDA]** cómo se usa exactamente, no
se ejecutó en esta tanda. La base de trabajo habitual para probar es **`erpazul_al`**
—una copia con datos reales— y aparecen varias bases de prueba desechables en los
scripts (`erpazul_term_test`, `erpazul_correccion_test`). El servidor de
desarrollo se levanta en el **puerto 3111** cuando se lo va a medir con el arnés
de capturas.

**Los scripts que tocan la base no heredan la conexión**: piden el cliente a
`scripts/lib/clientePrisma.mjs`, que exige la URL explícita y aborta si falta. Ver
[decisions/DEC-0006](decisions/DEC-0006-fabrica-de-cliente-prisma.md) — es una
regla que no se negocia.

**Correr los candados** — enumerar y ejecutar en un solo paso, porque enumerar mal
es la forma más común de creer que están todos:

```
node --import ./scripts/alias-loader.mjs --test $(git ls-files "*.test.mjs")
```

El `alias-loader` traduce el alias `@/...` de `jsconfig.json`; sin él, todo test
que importe código de `app/` falla. Al 2026-08-10: **2407 tests, 0 fallando**.

Para uno solo o para un área, el mismo comando con la ruta en vez de la
enumeración:

```
node --import ./scripts/alias-loader.mjs --test lib/precios/precioDesdeMargen.test.mjs
node --import ./scripts/alias-loader.mjs --test $(git ls-files "lib/precios/*.test.mjs")
```

Se enumera con `git ls-files` y no con un glob del shell por una razón concreta:
`ls *.test.mjs` en la raíz devuelve **cero** archivos, porque el glob del shell
mira un solo nivel. La skill `/relevar` tiene el alcance medido de cada
herramienta.

---

## Dónde vive cada tipo de conocimiento

| Si buscás… | Está en |
|---|---|
| Cómo trabajar en este repo, las reglas que no se negocian | `CLAUDE.md` (raíz) |
| Qué es el proyecto y cómo está armado | este archivo |
| Qué hay hoy, qué está a medias, qué falta | [CURRENT_STATE.md](CURRENT_STATE.md) |
| Un módulo concreto | [modulos/](modulos/) — autogenerado |
| Una regla de negocio y dónde está implementada | [business-rules/](business-rules/) |
| Cómo está construida un área transversal | [architecture/](architecture/) |
| Por qué se decidió algo | [decisions/](decisions/) |
| Qué salió mal y qué se aprendió | [incidents/](incidents/) |
| Qué falta hacer | [roadmap/](roadmap/) |
| **Cómo ejecutar** un procedimiento | las skills: `/deploy`, `/backup`, `/capturas`, `/relevar` |
| La API | [apis/](apis/) |

**La diferencia entre `architecture/` y una skill:** la arquitectura explica
**cómo está construido**; la skill explica **cómo ejecutar** un procedimiento
paso a paso. No se duplican.

### Si dos documentos se contradicen, quién gana

En este orden, de mayor a menor autoridad:

1. **El código.** Siempre. Un documento que dice otra cosa está vencido, no tiene
   razón.
2. **`CLAUDE.md`** — para cómo trabajar. Si algo de acá lo contradice, manda
   `CLAUDE.md`: este documento resume sus reglas para orientarte, no las
   reemplaza.
3. **Este documento y `CURRENT_STATE.md`** — relevados el 2026-08-10 sobre
   `d20afa9`, con cada afirmación etiquetada.
4. **`docs/business-rules/`, `architecture/`, `decisions/`, `incidents/`,
   `roadmap/`** — misma tanda, mismo criterio de evidencia.
5. **`docs/modulos/`** — mayormente autogenerado. Cinco archivos tienen errores
   verificados contra el schema.
6. **`docs/00-OVERVIEW.md` … `05-GUIA-ESTILOS-UI.md`** — **anteriores y no
   revisados en esta tanda.** `01-ARQUITECTURA.md` y `02-AUTH.md` tienen errores
   confirmados.
7. **Los `.md` de la raíz del repo** — históricos, no se mantienen.

**La lista completa de contradicciones detectadas, con archivo y línea, está en
[business-rules/contradicciones.md](business-rules/contradicciones.md).** Leerla
antes de confiar en cualquier documento de los niveles 5 a 7.

**Los ~63 archivos `.md` en la raíz del repo** (`AUDITORIA_*`, `MAPEO_*`,
`DIAGNOSTICO_*`, `INFORME_*`) son informes históricos, la mayoría de febrero de
2026. **No son documentación vigente** y no se mantienen: sirven como evidencia
de por qué se hizo algo, no como descripción de cómo funciona hoy.
**[VERIFICADO]** — fechas del último commit de cada uno.

---

## Cómo orientarse antes de trabajar

Para una sesión nueva, en este orden:

1. **Leé `CLAUDE.md`.** Son diez reglas, todas salidas de un error concreto. No
   son estilo: son las cosas que ya salieron mal.
2. **Leé este documento** para el mapa, y **[CURRENT_STATE.md](CURRENT_STATE.md)**
   para el estado. Antes de confiar en el segundo, **comparás su hash contra
   `git rev-parse HEAD`**: si difieren, es histórico.
3. **Antes de afirmar un número, enumerá bien.** `git ls-files` y `git grep`
   recorren el repo entero; `ls`, `fs.readdirSync` y `find -maxdepth` miran un
   nivel. Y ninguno de los dos primeros ve lo ignorado por `.gitignore`. La skill
   `/relevar` tiene el alcance medido de cada herramienta.
4. **Antes de cambiar algo compartido, buscá todos sus lectores en todo el repo**,
   no los del archivo que estás tocando.
5. **Verificá ejecutando, no leyendo.** Que compile no prueba nada. Si tocaste
   `schema.prisma`, corré `prisma generate` antes de probar.
6. **Los candados no se aflojan.** Un test en rojo es información: se entiende
   qué afirma y se reescribe sabiendo qué se cambia. Nunca se ajusta para que
   pase.
7. **Preguntá una sola vez, al final, y solo lo que sea decisión de negocio.**
   Todo lo que el código determina se resuelve leyendo el código.

Y lo más importante para no romper producción: **este sistema está vivo.** Un
cambio en el motor de costos o en el aplicador de listas cambia qué precios se
escriben en una base con datos reales. Si no hay margen para verificarlo, es
mejor decir "no llegué" que dejarlo a medias. **[REGLA]** — `CLAUDE.md` §9.
