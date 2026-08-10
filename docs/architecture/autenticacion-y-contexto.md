# Autenticación, contexto activo y permisos

La cadena de la que cuelga todo. Si entendés esto, entendés por qué una consulta
devuelve unos datos y no otros.

Relevado sobre `d20afa98e9edece663fb3dda694d3c99783ab788`.

---

## No hay barrera central

**No existe `middleware.js`.** Verificado con Glob sobre `middleware.js`,
`middleware.ts` y `src/middleware.js`: cero resultados.

Cada uno de los **259 `route.js`** se protege solo. Agregar una ruta nueva y
olvidarse del guard no lo detecta nada: no hay ningún candado que recorra las
rutas verificando que exijan sesión.

**Consecuencia al relevar:** buscar quién valida algo por el nombre del helper
deja afuera a los que lo hacen a través de un envoltorio. Los envoltorios son
`requireAuth`, `requirePerm`, `requireAdmin` (`lib/authorize.js`) y los cuatro
resolvedores de `lib/grupos.js`.

---

## Todo empieza en `getUsuarioSession`

`lib/auth.js:61`. Lee la cookie `erpazul_sesion`, verifica el JWT y devuelve la
sesión. De ella dependen `lib/authorize.js` entero y los cuatro resolvedores de
`lib/grupos.js`.

**Y además siembra la auditoría** (`lib/auth.js:138-147`): llama a `seedAuditoria`
con usuario, operador y local, y registra el volcado con `programarFlush`. Ver
[auditoria-bitacora.md](auditoria-bitacora.md) — esa dependencia tiene una
consecuencia grande.

### Las cuatro cookies

| Cookie | Qué guarda | Dónde se lee |
|---|---|---|
| `erpazul_sesion` | el JWT de sesión | `lib/auth.js` |
| `erpazul_grupo_activo` | grupo elegido — **solo si es admin** | `lib/auth.js:102-103` |
| `erpazul_contexto_activo` | la ubicación activa | `lib/contexto.js:4` |
| `erpazul_operador_activo` | el operario del mostrador | `lib/operador.js:10` |

Hay otras tres operativas (`erpazul_cierre_iniciado`, `erpazul_cierre_relevo`,
`erpazul_layout`), enumeradas con `git grep -oh "erpazul_[a-z_]*"`.

### La cadena de resolución de la ubicación

`lib/auth.js:123-136`, en este orden:

1. `localId` fijo en el JWT (usuario atado a un local).
2. Si no, cookie `erpazul_operador_activo`.
3. Si no, cookie `erpazul_contexto_activo`.

Para el **grupo**: si la sesión no lo trae, se deriva del local consultando
`GrupoLocal` y después `GrupoDeposito` (`lib/grupos.js:189-210`). Un local que no
está en ninguna de las dos tablas da **400 "No se pudo determinar el grupo"**.

---

## Permisos

### Un registro único

`lib/rbac/registry.js` — **59 códigos en 15 grupos, ninguno deprecado**.
Enumerado con `grep -oE 'code: "[^"]+"' | sort -u`. `lib/permisos.js` es un
re-export de una línea.

### Roles de sistema

`lib/rbac/systemRoles.js` y `prisma/seed.js`:

- **Admin** — `permisos: ["*"]`, `esSistema: true`. Es el dueño.
- **CAJERO**, **ENCARGADO**, **DUEÑO_LOCAL** — los tres en
  `ROLES_REQUIEREN_LOCAL`: exigen que el usuario tenga `localId`.

El seed es idempotente y **no pisa** permisos personalizados de un rol que ya
existe (`prisma/seed.js:19-31`).

### Los permisos viajan congelados en el token

El JWT lleva el array de permisos del rol (`app/api/login/route.js:131`) y dura
**8 horas**. Cambiar los permisos de un rol **no afecta a quien ya tiene sesión
abierta**. No hay lista de revocación: `logout` solo borra la cookie del
navegador.

### El menú, y sus tres registries

`lib/menu/registry.js` es el activo, y `hooks/useMenu.js` es el único que arma el
menú visible. Pero conviven:

- `lib/menuConfig.js` — shim que reexporta, marcado como pendiente de remover
  (`:1-6`).
- `lib/menu/registry.schema.js` — registry paralelo **completo**, cuyo propio
  encabezado dice que "aún NO se consume" y que "se va a deprecar" (`:6-9`).

Es el escenario exacto de la regla 1 de `CLAUDE.md`: no se rompe hoy, se rompe el
día que uno cambie.

`lib/menu/canAccess.js:13-19` anota además que `localOnly` y `depositoOnly` siguen
en el registry pero **ya no se evalúan** (Etapa 5.1).

---

## La segunda capa de identidad: el operario

Una persona que atiende el mostrador y **no tiene cuenta propia**. Vive en
`OperadorLocal` / `OperadorEnLocal`, y su identificación es configurable por local.

- `lib/operador.js` — la cookie y su resolución.
- `lib/operador-exencion.js` — quién está exento de identificarse. Tiene candado
  (`lib/operador-exencion.test.mjs`).
- `app/api/operador/login/route.js`.

En el POS se exige con `requireOperadorSegunConfig`. En replay offline la
atribución sale de un **voucher firmado** y, sin voucher, la venta se graba con
`operadorId = null` antes que perderse
(`app/api/pos-ventas/crear/route.js:81-100`). Es deliberado: perder la
identificación es recuperable, perder la venta no.

---

## Riesgos verificados de esta área

1. **`/api/me` es fail-open donde el resto es fail-closed.** Ver
   [../business-rules/contradicciones.md](../business-rules/contradicciones.md),
   C-01.
2. **La vista global rompe `/api/contexto-activo/get`.** `getContextoActivo`
   devuelve `{ global: true }` sin `localId` (`lib/contexto.js:43`); el handler
   solo corta por `needsContexto` (`app/api/contexto-activo/get/route.js:20`) y
   sigue a `findUnique({ where: { id: undefined } })`. Prisma tira y responde
   **500**. Los resolvedores de `lib/grupos.js` sí tratan bien el caso `global`;
   el que no lo contempla es este GET.
3. **`grupo-activo/set` no valida el grupo.** Acepta cualquier número positivo y
   lo guarda en la cookie sin verificar que exista. Después `resolveLocalAndGrupo`
   usa `session.grupoId` sin re-verificar (`lib/grupos.js:82`). Mitigación
   parcial: `contexto-activo/set` **sí** valida que el local pertenezca al grupo
   activo (`:83-98`).
4. **El rate limit del login es por proceso.** `Map` en memoria
   (`app/api/login/route.js:12`). Se pierde al reiniciar el contenedor y no se
   comparte entre instancias. Con una sola instancia, como hoy, funciona.
5. **Cero candados sobre el corazón.** No existe ningún `.test.mjs` de
   `lib/auth.js`, `lib/authorize.js`, `lib/grupos.js` ni `lib/contexto.js`.

**Lo que NO conviene hacer sin margen:** agregar un `middleware.js`.
Arquitectónicamente sería lo correcto, pero se mete en el camino de las 259 rutas
a la vez, y un error ahí saca a todo el mundo del sistema.
