# AUDITORÍA CONTEXTO ACTIVO — grupoId / localId

**Objetivo:** Diagnosticar por qué en `app/api/productos/import/*` aparece "Selecciona un grupo activo" aunque el usuario ya haya elegido local.  
**Alcance:** Solo auditoría, logs temporales e informe. Sin implementar fix.

---

## 1) lib/auth.js — getUsuarioSession(req)

### Qué hace

- Lee el token JWT desde la cookie `erpazul_sesion` y lo verifica.
- Extrae del payload: `id`, `rolId`, `localId`, `permisos`, `esDeposito`.
- Calcula `esAdmin = permisos.includes("*")`.
- Lee la cookie **`erpazul_grupo_activo`** (valor numérico).
- Devuelve un objeto con:
  - `id`, `rolId`, `localId`, `permisos`, `esAdmin`, `esDeposito`
  - **`grupoId`**: `esAdmin ? activeGroupId : null` (solo admins; valor de la cookie).
  - **`grupoActivoId`**: mismo que `grupoId` para admins.

### Campos exactos devueltos

| Campo        | Origen                    | Comentario                                      |
|-------------|----------------------------|--------------------------------------------------|
| id          | JWT                        | id del usuario                                   |
| rolId       | JWT                        |                                                  |
| localId     | JWT (user.localId)         | Puede ser null (admin sin local fijo)            |
| permisos   | JWT (rol.permisos)         | Array                                            |
| esAdmin     | derivado (permisos.includes("*")) |                                  |
| esDeposito  | JWT                        | Del local del usuario                            |
| grupoId     | Cookie `erpazul_grupo_activo` **solo si esAdmin** | Si no admin → siempre **null**   |
| grupoActivoId | Igual que grupoId        |                                                  |

**Conclusión:** Para usuarios **no admin**, `session.grupoId` es **siempre null**. Para **admin**, `session.grupoId` solo tiene valor si en algún momento se llamó a `/api/grupo-activo/set` y la cookie sigue presente.

---

## 2) Dónde se setea session.grupoId

- **No se setea en el JWT.** El login (`app/api/login/route.js`) arma el payload con: id, nombre, email, rolId, rolNombre, permisos, **localId**, **esDeposito**. No incluye grupoId.
- **No hay middleware** que inyecte grupoId en la sesión.
- **Se obtiene solo de la cookie** `erpazul_grupo_activo` en `getUsuarioSession`:
  - Esa cookie se escribe **únicamente** en **`POST /api/grupo-activo/set`**.
  - Ese endpoint está restringido a **admins** (`if (!session.esAdmin) return 403`).
  - Quien llama a `grupo-activo/set` es la UI cuando un **admin** elige un **grupo** (p. ej. en un selector de grupo), no cuando elige un local.

### Flujo “elegir local” vs “elegir grupo”

- **Elegir local:** `POST /api/contexto-activo/set` con `{ localId }`.  
  - Guarda en cookie **`erpazul_contexto_activo`** un JSON `{ localId, esDeposito }`.  
  - **No toca** la cookie `erpazul_grupo_activo`.  
  - Por tanto, elegir local **no** setea `session.grupoId`.

- **Elegir grupo (solo admin):** `POST /api/grupo-activo/set` con `{ grupoId }`.  
  - Setea la cookie **`erpazul_grupo_activo`**.  
  - Si el usuario solo eligió local y nunca grupo (o no es admin), `session.grupoId` sigue null.

**Resumen:** `session.grupoId` existe solo cuando hay cookie `erpazul_grupo_activo`, que se setea solo en `grupo-activo/set` (admin). Login, middleware y “elegir local” no lo setean.

---

## 3) hooks/useContextoActivo.js

### Qué hace

- Al montar, hace `GET /api/contexto-activo/get` con credentials.
- Si `data.ok`: guarda en estado `contexto = { localId, nombre, esDeposito }`.
- Si no ok y `data.needsContexto === true`: setea `needsContexto = true`.
- No persiste nada por su cuenta: la persistencia es vía cookie en el backend (contexto-activo/set).

### Qué expone

- `loading`, `contexto` (localId, nombre, esDeposito), `needsContexto`.
- **No expone grupoId.** El hook y el endpoint contexto-activo/get no devuelven grupo.

### Cómo persiste localId y grupoId

- **localId:** Se persiste con la cookie `erpazul_contexto_activo` cuando el usuario llama a `contexto-activo/set` (elegir local). El front guarda en estado lo que devuelve contexto-activo/get.
- **grupoId:** No se persiste en este flujo. Solo se persiste si un admin llama a `grupo-activo/set` (cookie `erpazul_grupo_activo`). El módulo Productos puede no llamar nunca a `grupo-activo/set`; el usuario solo elige local en el header/selector de contexto.

Por tanto, en el flujo “Login → elegir local → import preview”, el front tiene **localId** (contexto) pero el backend en import solo mira **session.grupoId**, que no se llenó.

---

## 4) Flujo: Login → elegir local → llamar import preview

1. **Login**  
   POST /api/login → JWT con localId (si tiene local fijo) o localId null (admin). Cookie `erpazul_sesion`. No se setea `erpazul_grupo_activo`.

2. **Elegir local (si hace falta)**  
   Usuario elige local en el selector de contexto → POST /api/contexto-activo/set con `localId` → se setea cookie `erpazul_contexto_activo`. No se toca `erpazul_grupo_activo`.

3. **Productos → Import → Preview**  
   Front envía POST /api/productos/import/preview con body `{ localId, modo, productos }` (localId viene de `contexto.localId`).  
   En el backend:
   - `getUsuarioSession(req)` → para no-admin, `session.grupoId` es **null**; para admin que no eligió grupo, también **null**.
   - Código hace `grupoId = Number(session.grupoId)` → 0.
   - Respuesta 400: "Selecciona un grupo activo".

**Conclusión:** En este flujo, **grupoId se “pierde”** porque nunca se exige ni se setea la cookie de grupo al “elegir local”. El backend de import **solo** usa `session.grupoId` y no deriva grupo desde el `localId` del body.

---

## 5) Verificación: ¿session.grupoId existe o solo localId?

- **session.grupoId** existe en el objeto solo para **admin** y solo si en algún momento se llamó a `grupo-activo/set`. En el flujo típico “entré, elegí local, fui a importar”, **no** existe (es null/undefined).
- **localId** sí está disponible:
  - En **session**: si el usuario tiene local fijo (JWT) o si no es admin, `session.localId` puede venir del JWT.
  - En **contexto**: si eligió local, la cookie `erpazul_contexto_activo` tiene ese localId; el front lo manda en el body del import como `localId`.
- En **import/preview** y **import/apply** el body incluye **localId**. Ese localId podría usarse para obtener el grupo con `getGrupoIdDeLocal(localId)`.

Comparación con otros endpoints:

- **productos/precios/preview** y **productos/precios/apply**: usan `session.grupoId` y, si no hay, **obtienen grupo desde `localId` del body** con `getGrupoIdDeLocal(localId)`.
- **clientes/import/excel**: mismo patrón: `session.grupoId` y fallback con `getGrupoIdDeLocal(localId)`.
- **productos/import/preview** y **productos/import/apply**: **solo** usan `session.grupoId`; no hay fallback.

---

## 6) Logs temporales agregados

- **lib/auth.js**  
  Antes del `return` del objeto sesión (solo en desarrollo):
  ```js
  if (process.env.NODE_ENV !== "production") {
    console.log("SESSION:", session);
  }
  ```
  Así se ve en servidor qué devuelve `getUsuarioSession` (incluido grupoId null).

- **app/api/productos/import/preview/route.js**  
  Justo después de `getUsuarioSession(req)` y antes de validar grupoId:
  ```js
  console.log("SESSION:", session);
  ```
  Así se ve en consola del servidor la sesión en el momento del preview (y se confirma que grupoId viene null cuando el usuario solo eligió local).

---

## 7) Dónde se pierde grupoId

- **No se “pierde” en el sentido de que se borre:** nunca se setea en el flujo “elegir local”.
- **Se “pierde” en el sentido de que el endpoint asume que ya está:** import/preview e import/apply asumen que `session.grupoId` está lleno. Para usuarios no admin y para admins que solo eligieron local, ese valor es null.
- **Punto concreto:** en `app/api/productos/import/preview/route.js` y `app/api/productos/import/apply/route.js`, la línea que toma `grupoId` solo de la sesión:
  - `const grupoId = Number(session.grupoId);`
  - Si no hay cookie de grupo activo (o no es admin), grupoId es 0 y se responde "Selecciona un grupo activo" aunque el body tenga `localId` válido.

---

## 8) Si debe obtenerse desde localId con getGrupoIdDeLocal

**Sí.** Es coherente con el resto del producto:

- El body del import ya lleva **localId** (el local del contexto elegido).
- Ese local pertenece a un grupo (GrupoLocal o GrupoDeposito).
- **getGrupoIdDeLocal(localId)** devuelve ese grupo.
- Otros endpoints de productos y de clientes ya usan este fallback cuando `session.grupoId` no está.

Por tanto, en import es correcto usar **session.grupoId** cuando exista y, cuando no, obtener **grupoId** desde el **localId** del request (body o sesión) con **getGrupoIdDeLocal(localId)**.

---

## 9) Propuesta mínima de fix (no implementada)

- En **app/api/productos/import/preview/route.js** y **app/api/productos/import/apply/route.js**:
  1. Tras validar sesión, leer **localId** del body (y, si se desea, de sesión como respaldo).
  2. Calcular **grupoId** así:
     - Si `session.grupoId` es válido (número > 0), usarlo.
     - Si no, si hay **localId** (body o session), llamar a `getGrupoIdDeLocal(localId)` y usar ese valor.
  3. Si después de eso grupoId sigue faltando, entonces devolver 400 "Selecciona un grupo activo" (o “Selecciona un local de trabajo” si el problema es que falta localId).
- Opcional: mantener la misma lógica que en **productos/precios/preview** y **clientes/import/excel** para no duplicar criterios (session primero, luego localId).
- **No** hace falta tocar login, contexto-activo ni grupo-activo para este fix; solo las dos rutas de import de productos.

---

*Fin del informe. Logs temporales añadidos; fix no implementado.*
