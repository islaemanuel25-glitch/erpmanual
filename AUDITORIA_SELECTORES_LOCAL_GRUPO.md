# AUDITORÍA: Selectores de Local/Grupo

**Objetivo:** Eliminar completamente selectores de local/grupo, dejando solo `/inicio` + botón en Header.

**Fecha:** 2025-01-XX

---

## RESUMEN EJECUTIVO

### Componentes/Hooks Buscados (NO ENCONTRADOS como archivos):
- ❌ `PantallaSeleccionLocal` - No existe
- ❌ `SelectorLocalCompacto` - No existe  
- ❌ `useLocalSelector` - No existe
- ❌ `SelectorLocales` (productos) - Mencionado en docs pero archivo no existe
- ❌ `SelectorGrupoActivo` - Mencionado en docs pero archivo no existe

### Endpoints/APIs Encontrados:
- ✅ `/api/locales/opciones` - **EN USO** (2 referencias)

### Patrones Encontrados:
- ✅ `localSeleccionado` (estado local) - **MÚLTIPLES USOS**
- ✅ `useContextoActivo` hook - **MÚLTIPLES USOS**
- ✅ Selectores inline con `SunmiSelectAdv` - **MÚLTIPLES USOS**

---

## 1. REFERENCIAS POR MÓDULO

### 📦 **PRODUCTOS**

#### Archivos:
- `app/modulos/productos/page.jsx`

#### Referencias:
- **Línea 22:** `import useContextoActivo from "@/hooks/useContextoActivo"`
- **Línea 36:** `const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();`
- **Línea 58:** `const localId = contexto?.localId || 0;`
- **Línea 170:** `localId: String(localId),` (en fetchProductos)
- **Línea 200:** `}, [page, filtros, localId]);` (useEffect dependency)
- **Línea 217:** `/api/productos/obtener?id=${idNum}&localId=${localId}`
- **Línea 245:** `}, [nuevo, editarId, localId]);` (useEffect dependency)
- **Línea 258:** `/api/productos/editar/${editing.id}?localId=${localId}`
- **Línea 259:** `/api/productos/crear?localId=${localId}`
- **Línea 344:** `localId: localId || null,` (en export)
- **Línea 389:** `if (!localId) { setImpError("No hay contexto operativo activo"); return; }`
- **Línea 424:** `localId: Number(localId),` (en import preview)
- **Línea 454:** `if (!impPreview || !localId) return;`
- **Línea 474:** `localId: Number(localId),` (en import apply)
- **Línea 523:** `if (needsContexto) { router.push("/inicio"); return null; }`
- **Línea 832:** `localId={localId}` (prop a ModalProducto)

#### Endpoints que requieren localId:
- `GET /api/productos/listar?localId=...`
- `GET /api/productos/obtener?id=...&localId=...`
- `POST /api/productos/crear?localId=...`
- `PUT /api/productos/editar/:id?localId=...`
- `POST /api/productos/export` (body: `{ localId: ... }`)
- `POST /api/productos/import/preview` (body: `{ localId: ... }`)
- `POST /api/productos/import/apply` (body: `{ localId: ... }`)

#### Cómo obtiene localId:
- **Fuente:** `useContextoActivo()` hook → `contexto.localId`
- **Fallback:** `contexto?.localId || 0`
- **NO usa:** localStorage directo, query params, ni selector manual

---

### 🛒 **POS VENTAS**

#### Archivos:
- `app/modulos/pos-ventas/page.jsx`

#### Referencias:
- **Línea 37:** `const [localSeleccionado, setLocalSeleccionado] = useState(null);`
- **Línea 80:** `const localActual = localSeleccionado || me?.localId || null;`
- **Línea 102:** `setLocalSeleccionado(data.user.localId);` (si usuario tiene localId)
- **Línea 124:** `const res = await fetch("/api/locales/opciones", {` ⚠️ **ENDPOINT A ELIMINAR**
- **Línea 162:** `if (formaPago !== "fiado" || !clienteSeleccionado || !localActual) {`
- **Línea 170-171:** Fetch con `localId=${localActual}`
- **Línea 187:** `}, [formaPago, clienteSeleccionado, localActual]);`
- **Línea 193:** `if (!clienteSeleccionado || !localActual) {`
- **Línea 203:** `/api/clientes/${clienteSeleccionado.id}/puntos?localId=${localActual}`
- **Línea 379:** `if (id && id !== localSeleccionado) { setLocalSeleccionado(id); }`
- **Línea 390:** `setErrorMsg("Seleccioná un local para elegir cliente.");`
- **Línea 405-406:** Fetch con `localId=${localActual}`
- **Línea 645-684:** **PANTALLA DE SELECCIÓN INLINE** (admin sin local) ⚠️ **A ELIMINAR**
  - Línea 651: "Selecciona el local donde vas a operar"
  - Línea 662: `placeholder="Seleccionar local..."`
  - Línea 700: `value={String(localSeleccionado || "")}`
  - Línea 701: `onChange={handleCambiarLocal}`
- **Línea 698-710:** **SELECTOR INLINE EN HEADER** ⚠️ **A ELIMINAR**
  - Selector `SunmiSelectAdv` para cambiar local (solo admin)

#### Endpoints que requieren localId:
- `GET /api/locales/opciones` ⚠️ **A ELIMINAR**
- `GET /api/clientes/:id?localId=...`
- `GET /api/clientes/:id/cuenta-corriente?localId=...`
- `GET /api/clientes/:id/puntos?localId=...`
- `GET /api/locales/:id` (para política límite crédito)
- `GET /api/pos-ventas/turnos/actual?localId=...`
- `POST /api/pos-ventas/crear` (body: `{ localId: ... }`)
- `POST /api/clientes/:id/puntos` (body: `{ localId: ... }`)

#### Cómo obtiene localId:
- **Fuente 1:** Estado local `localSeleccionado` (para admin padre)
- **Fuente 2:** `me?.localId` (del usuario)
- **Combinación:** `localSeleccionado || me?.localId || null`
- **Carga inicial:** Desde `/api/me` si usuario tiene `localId`
- **Selector manual:** Admin padre puede cambiar con dropdown inline ⚠️

---

### 📊 **STOCK LOCALES**

#### Archivos:
- `app/modulos/stock_locales/page.jsx`
- `components/stock_locales/TablaStock.jsx`
- `components/stock_locales/FiltrosStock.jsx`

#### Referencias:
- **Línea 15:** `const [localSeleccionado, setLocalSeleccionado] = useState(null);`
- **Línea 35:** `const res = await fetch("/api/locales/listar", {` (NO usa opciones)
- **Línea 43:** `const ultimo = localStorage.getItem("ultimoLocal");` ⚠️ **localStorage**
- **Línea 46:** `setLocalSeleccionado(Number(ultimo));` (si existe en localStorage)
- **Línea 49:** `setLocalSeleccionado(primerLocal?.id || json.items[0]?.id || "");`
- **Línea 67-68:** `localStorage.setItem("ultimoLocal", localSeleccionado);` ⚠️ **localStorage**
- **Línea 113-127:** **SELECTOR INLINE** ⚠️ **A ELIMINAR**
  - Label: "Local seleccionado"
  - `SunmiSelectAdv` con lista de locales
  - `onChange` actualiza `localSeleccionado`
- **Línea 133:** `localSeleccionado={localSeleccionado}` (prop a FiltrosStock)
- **Línea 140:** `localSeleccionado={localSeleccionado}` (prop a TablaStock)

#### Endpoints que requieren localId:
- `GET /api/locales/listar` (para obtener lista de locales)
- `GET /api/stock/listar?localId=...` (probablemente, usado en TablaStock)

#### Cómo obtiene localId:
- **Fuente:** Estado local `localSeleccionado`
- **Persistencia:** `localStorage.getItem("ultimoLocal")` ⚠️
- **Inicialización:** Desde localStorage o primer local disponible
- **Selector manual:** Dropdown inline en la página ⚠️

---

### 🎁 **FIDELIDAD**

#### Archivos:
- `app/modulos/fidelidad/page.jsx`

#### Referencias:
- **Línea 19:** `const [localSeleccionado, setLocalSeleccionado] = useState(null);`
- **Línea 54:** `const res = await fetch("/api/locales/listar?soloLocales=true", {`
- **Línea 60:** `const ultimo = localStorage.getItem("ultimoLocal");` ⚠️ **localStorage**
- **Línea 62:** `setLocalSeleccionado(Number(ultimo));` (si existe)
- **Línea 64:** `setLocalSeleccionado(json.items[0].id);` (fallback)
- **Línea 94:** `if (!busqProd.trim() || !localSeleccionado) {`
- **Línea 103:** `/api/productos/listar?localId=${localSeleccionado}&q=...`
- **Línea 132:** `localStorage.setItem("ultimoLocal", String(localSeleccionado));` ⚠️ **localStorage**
- **Línea 140:** `/api/puntos-config?localId=${localSeleccionado}`
- **Línea 183:** `if (!localSeleccionado) return;`
- **Línea 194:** `const res = await fetch(`/api/puntos-config?localId=${localSeleccionado}`, {`
- **Línea 255-265:** **SELECTOR INLINE** ⚠️ **A ELIMINAR**
  - `SunmiSelectAdv` con opción "Seleccionar local…"
  - `onChange` actualiza `localSeleccionado`
- **Línea 268-271:** Mensaje "Seleccioná un local para configurar puntos."

#### Endpoints que requieren localId:
- `GET /api/locales/listar?soloLocales=true`
- `GET /api/productos/listar?localId=...`
- `GET /api/puntos-config?localId=...`
- `PUT /api/puntos-config?localId=...`

#### Cómo obtiene localId:
- **Fuente:** Estado local `localSeleccionado`
- **Persistencia:** `localStorage.getItem("ultimoLocal")` ⚠️
- **Inicialización:** Desde localStorage o primer local disponible
- **Selector manual:** Dropdown inline en la página ⚠️

---

### 👥 **CLIENTES**

#### Archivos:
- `app/modulos/clientes/page.jsx`
- `app/modulos/clientes/[id]/page.jsx`

#### Referencias:
- **Línea 14:** `import useContextoActivo from "@/hooks/useContextoActivo"`
- **Línea 22:** `const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();`
- **Línea 24:** `const localIdFinal = contexto?.localId || null;`
- **Línea 50:** `if (localIdFinal) { cargarClientes(); cargarTags(); }`
- **Línea 81:** `/api/clientes/tags?localId=${localIdFinal}`
- **Línea 98:** `params.set("localId", String(localIdFinal));`
- **Línea 249:** `setImportResult({ error: "Seleccioná un local para importar." });`
- **Línea 496:** Mensaje "Seleccioná un local para importar/exportar."
- **Línea 979:** `if (clienteId && localId && tagsSeleccionados.length >= 0) {`
- **Línea 984:** `body: JSON.stringify({ tagIds: tagsSeleccionados, localId }),`
- **Línea 1234:** `setErrorMsg("Seleccioná un local para ver el historial de ventas.");`
- **Línea 1381:** `setErrorMsg("Seleccioná un local para ver la cuenta corriente.");`

#### En `app/modulos/clientes/[id]/page.jsx`:
- **Línea 31:** `setErrorMsg("Seleccioná un local");`
- **Línea 252:** `setErrorMsg("Seleccioná un local");`
- **Línea 351:** `setErrorMsg("Seleccioná un local para ver los puntos.");`
- **Línea 489:** `setErrorMsg("Seleccioná un local para ver la cuenta corriente.");`

#### Endpoints que requieren localId:
- `GET /api/clientes/listar?localId=...`
- `GET /api/clientes/tags?localId=...`
- `GET /api/clientes/:id?localId=...`
- `GET /api/clientes/:id/cuenta-corriente?localId=...`
- `GET /api/clientes/:id/puntos?localId=...`
- `POST /api/clientes/tags/asignar` (body: `{ localId: ... }`)
- `POST /api/clientes/import/excel` (probablemente requiere localId)

#### Cómo obtiene localId:
- **Fuente:** `useContextoActivo()` hook → `contexto.localId`
- **Fallback:** `contexto?.localId || null`
- **NO usa:** localStorage directo, query params, ni selector manual
- **Validación:** Muestra mensajes de error si no hay localId

---

### 🏠 **INICIO (Página de Selección)**

#### Archivos:
- `app/inicio/page.jsx`

#### Referencias:
- **Línea 37:** `const res = await fetch("/api/locales/opciones", {` ⚠️ **ENDPOINT A ELIMINAR**
- **Línea 62-84:** Función `seleccionar(local)` que llama a `/api/contexto-activo/set`
- **Línea 66:** `const res = await fetch("/api/contexto-activo/set", {`
- **Línea 105:** Texto "Seleccioná el local o depósito desde donde vas a operar."
- **Línea 115-142:** **LISTA DE LOCALES PARA SELECCIONAR** ⚠️ **A ELIMINAR**
  - Botones clickeables por cada local
  - Auto-selección si hay 1 sola opción (línea 48-50)

#### Endpoints usados:
- `GET /api/locales/opciones` ⚠️ **A ELIMINAR**
- `POST /api/contexto-activo/set` (body: `{ localId: local.id }`)

#### Funcionalidad:
- **Propósito:** Pantalla de selección de contexto operativo
- **Cuándo se muestra:** Usuario admin sin local fijo asignado
- **Acción:** Al seleccionar, guarda en cookie y redirige a `/modulos/dashboard`
- **Auto-selección:** Si hay 1 solo local, lo selecciona automáticamente

---

### 📦 **POS TRANSFERENCIAS**

#### Archivos:
- `app/modulos/pos-transferencias/page.jsx`

#### Referencias:
- **Línea 193:** `setError("Seleccioná un local destino");`
- **Línea 202:** `setError("Seleccioná grupo, depósito y local destino");`
- **Línea 393:** Texto "Seleccioná el local destino y comenzá la sesión POS."
- **Línea 405:** `placeholder="Seleccionar local destino"`
- **Línea 486:** `placeholder="Seleccionar local"`

#### Nota:
- Este módulo parece tener su propia lógica de selección de local destino (para transferencias)
- No usa `useContextoActivo` ni `localSeleccionado` global
- Probablemente usa estado local específico para "local destino"

---

### 📈 **REPORTES**

#### Archivos:
- `app/modulos/reportes-ventas/page.jsx`

#### Referencias:
- **Línea 13:** `import useContextoActivo from "@/hooks/useContextoActivo"`
- **Línea 26:** `const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();`

#### Nota:
- Usa `useContextoActivo` pero no se revisó en detalle el uso de `localId`

---

### 🏷️ **CATEGORÍAS**

#### Archivos:
- `app/modulos/categorias/page.jsx`

#### Referencias:
- **Línea 19:** `import useContextoActivo from "@/hooks/useContextoActivo"`
- **Línea 27:** `const { loading: loadingCtx, needsContexto } = useContextoActivo();`

#### Nota:
- Usa `useContextoActivo` pero no se revisó en detalle el uso de `localId`

---

### 🏢 **PROVEEDORES**

#### Archivos:
- `app/modulos/proveedores/page.jsx`

#### Referencias:
- **Línea 21:** `import useContextoActivo from "@/hooks/useContextoActivo"`
- **Línea 31:** `const { loading: loadingCtx, needsContexto } = useContextoActivo();`

#### Nota:
- Usa `useContextoActivo` pero no se revisó en detalle el uso de `localId`

---

### 📊 **CLIENTES ANALYTICS**

#### Archivos:
- `app/modulos/clientes/analytics/page.jsx`

#### Referencias:
- **Línea 14:** `import useContextoActivo from "@/hooks/useContextoActivo"`
- **Línea 50:** `const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();`

#### Nota:
- Usa `useContextoActivo` pero no se revisó en detalle el uso de `localId`

---

### 🎨 **HEADER**

#### Archivos:
- `components/Header.jsx`

#### Referencias:
- **Línea 19:** `const [contexto, setContexto] = useState(null);`
- **Línea 20:** `const [contextoSinSeleccionar, setContextoSinSeleccionar] = useState(false);`
- **Línea 46:** `const res = await fetch("/api/contexto-activo/get", {`
- **Línea 107-127:** **BOTÓN DE CONTEXTO ACTIVO** ✅ **MANTENER**
  - Muestra local/depósito actual
  - Click redirige a `/inicio`
- **Línea 128-141:** **BOTÓN "SIN SELECCIONAR"** ✅ **MANTENER**
  - Muestra si no hay contexto
  - Click redirige a `/inicio`
- **Línea 209-221:** **OPCIÓN MENÚ "Cambiar local"** ✅ **MANTENER**
  - En menú desplegable de usuario
  - Redirige a `/inicio`

#### Funcionalidad:
- **Propósito:** Mostrar contexto activo y permitir cambio
- **Comportamiento:** Carga contexto desde API, muestra botón clickeable
- **Acción:** Click redirige a `/inicio` para seleccionar nuevo contexto

---

## 2. ENDPOINTS API

### `/api/locales/opciones` ⚠️ **A ELIMINAR**

#### Archivo:
- `app/api/locales/opciones/route.js`

#### Usado en:
1. `app/inicio/page.jsx` (línea 37)
2. `app/modulos/pos-ventas/page.jsx` (línea 124)

#### Funcionalidad:
- Retorna lista de locales disponibles para el usuario
- Filtra por grupo activo si es admin
- Retorna solo el local del usuario si no es admin

---

### `/api/contexto-activo/get` ✅ **MANTENER**

#### Archivo:
- `app/api/contexto-activo/get/route.js`

#### Usado en:
- `hooks/useContextoActivo.js` (línea 13)
- `components/Header.jsx` (línea 46)
- `lib/grupos.js` (probablemente)

#### Funcionalidad:
- Retorna contexto activo actual (localId, nombre, esDeposito)
- Lee de cookie `contexto-activo`

---

### `/api/contexto-activo/set` ✅ **MANTENER**

#### Archivo:
- `app/api/contexto-activo/set/route.js`

#### Usado en:
- `app/inicio/page.jsx` (línea 66)

#### Funcionalidad:
- Guarda contexto activo en cookie
- Recibe `{ localId: number }` en body

---

## 3. HOOKS

### `useContextoActivo` ✅ **MANTENER**

#### Archivo:
- `hooks/useContextoActivo.js`

#### Usado en:
1. `app/modulos/productos/page.jsx`
2. `app/modulos/clientes/page.jsx`
3. `app/modulos/reportes-ventas/page.jsx`
4. `app/modulos/clientes/analytics/page.jsx`
5. `app/modulos/categorias/page.jsx`
6. `app/modulos/proveedores/page.jsx`
7. `components/productos/actualizacion-precios/ActualizacionPreciosPage.jsx`

#### Funcionalidad:
- Hook que carga contexto activo desde `/api/contexto-activo/get`
- Retorna: `{ loading, contexto, needsContexto }`
- `contexto`: `{ localId, nombre, esDeposito }` o `null`
- `needsContexto`: `true` si requiere selección

---

## 4. COMPONENTES

### Componentes NO encontrados (mencionados en docs):
- `components/productos/SelectorLocales.jsx` - No existe
- `components/grupos/SelectorGrupoActivo.jsx` - No existe

### Componentes relacionados (mantener):
- `components/Header.jsx` - Muestra contexto y botón para cambiar

---

## 5. LOCALSTORAGE

### Clave: `ultimoLocal` ⚠️ **A ELIMINAR**

#### Usado en:
1. `app/modulos/stock_locales/page.jsx` (líneas 43, 68)
2. `app/modulos/fidelidad/page.jsx` (líneas 60, 132)

#### Funcionalidad:
- Guarda último local seleccionado manualmente
- Se usa para auto-seleccionar al cargar página

---

## 6. PLAN DE ELIMINACIÓN (2 FASES)

### **FASE A: Remover imports/renders/lógica (sin borrar archivos)**

#### A.1. Eliminar selectores inline

**Archivos a modificar:**

1. **`app/modulos/pos-ventas/page.jsx`**
   - Remover estado `localSeleccionado` (línea 37)
   - Remover fetch a `/api/locales/opciones` (línea 124)
   - Remover estado `locales` (línea 36)
   - Remover función `handleCambiarLocal` (línea 377)
   - Remover pantalla de selección inline (líneas 645-684)
   - Remover selector en header (líneas 698-710)
   - Cambiar `localActual` para usar solo `me?.localId` o `useContextoActivo`
   - Agregar redirect a `/inicio` si no hay contexto

2. **`app/modulos/stock_locales/page.jsx`**
   - Remover estado `localSeleccionado` (línea 15)
   - Remover selector inline (líneas 113-127)
   - Remover localStorage `ultimoLocal` (líneas 43, 68)
   - Cambiar para usar `useContextoActivo`
   - Agregar redirect a `/inicio` si `needsContexto`

3. **`app/modulos/fidelidad/page.jsx`**
   - Remover estado `localSeleccionado` (línea 19)
   - Remover selector inline (líneas 255-265)
   - Remover localStorage `ultimoLocal` (líneas 60, 132)
   - Cambiar para usar `useContextoActivo`
   - Agregar redirect a `/inicio` si `needsContexto`

#### A.2. Eliminar endpoint `/api/locales/opciones`

**Archivos a modificar:**

1. **`app/inicio/page.jsx`**
   - Cambiar fetch de `/api/locales/opciones` a `/api/locales/listar` o similar
   - O usar endpoint existente que ya filtre por grupo

2. **`app/modulos/pos-ventas/page.jsx`**
   - Remover fetch a `/api/locales/opciones` (línea 124)
   - Ya no necesita cargar lista de locales (se elimina selector)

**Archivo a marcar para borrado (Fase B):**
- `app/api/locales/opciones/route.js`

#### A.3. Actualizar componentes que reciben `localSeleccionado` como prop

**Archivos a modificar:**

1. **`components/stock_locales/FiltrosStock.jsx`**
   - Cambiar prop `localSeleccionado` a usar `useContextoActivo` internamente
   - O recibir `localId` desde contexto

2. **`components/stock_locales/TablaStock.jsx`**
   - Cambiar prop `localSeleccionado` a usar `useContextoActivo` internamente
   - O recibir `localId` desde contexto

#### A.4. Limpiar referencias en documentación

**Archivos a modificar:**

1. **`docs/modulos/productos.md`**
   - Remover mención a `SelectorLocales` (línea 52)

2. **`docs/modulos/grupos.md`**
   - Remover mención a `SelectorGrupoActivo` (línea 51)

3. **`docs/modulos/actualizacion-precios.md`**
   - Remover mención a `SelectorGrupoActivo` (líneas 35, 54)

4. **`docs/INCONSISTENCIAS-SUNMI.md`**
   - Remover mención a `SelectorGrupoActivo` (línea 172)

---

### **FASE B: Borrar archivos huérfanos (solo si no quedan referencias)**

#### Archivos candidatos a borrado:

1. **`app/api/locales/opciones/route.js`** ⚠️
   - **Condición:** Verificar que no se use en ningún otro lugar
   - **Acción:** Borrar después de Fase A.2

#### Archivos que NO se borran (aún en uso):

- `hooks/useContextoActivo.js` ✅ (mantener)
- `app/api/contexto-activo/get/route.js` ✅ (mantener)
- `app/api/contexto-activo/set/route.js` ✅ (mantener)
- `app/inicio/page.jsx` ✅ (mantener, pero simplificar)
- `components/Header.jsx` ✅ (mantener)

---

## 7. CÓMO PRODUCTOS OBTIENE LOCALID (DETALLE)

### Módulo: Productos

**Archivo:** `app/modulos/productos/page.jsx`

**Método actual:**
```javascript
import useContextoActivo from "@/hooks/useContextoActivo";

const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();
const localId = contexto?.localId || 0;
```

**Flujo:**
1. Hook `useContextoActivo` hace fetch a `/api/contexto-activo/get`
2. API lee cookie `contexto-activo` y retorna `{ localId, nombre, esDeposito }`
3. Si no hay contexto, `needsContexto = true` → redirect a `/inicio`
4. `localId` se usa en todos los endpoints de productos

**Endpoints que requieren localId:**
- `GET /api/productos/listar?localId=...`
- `GET /api/productos/obtener?id=...&localId=...`
- `POST /api/productos/crear?localId=...`
- `PUT /api/productos/editar/:id?localId=...`
- `POST /api/productos/export` (body)
- `POST /api/productos/import/preview` (body)
- `POST /api/productos/import/apply` (body)

**NO usa:**
- ❌ localStorage directo
- ❌ Query params
- ❌ Selector manual inline

**✅ Ya está correcto:** Productos usa `useContextoActivo` y no tiene selector manual.

---

## 8. RESUMEN DE CAMBIOS POR MÓDULO

| Módulo | Selector Manual | localStorage | useContextoActivo | Cambios Necesarios |
|--------|------------------|--------------|-------------------|-------------------|
| **Productos** | ❌ No | ❌ No | ✅ Sí | ✅ Ya correcto |
| **POS Ventas** | ✅ Sí (inline) | ❌ No | ❌ No | ⚠️ Cambiar a `useContextoActivo` |
| **Stock Locales** | ✅ Sí (inline) | ✅ Sí | ❌ No | ⚠️ Cambiar a `useContextoActivo` |
| **Fidelidad** | ✅ Sí (inline) | ✅ Sí | ❌ No | ⚠️ Cambiar a `useContextoActivo` |
| **Clientes** | ❌ No | ❌ No | ✅ Sí | ✅ Ya correcto |
| **Inicio** | ✅ Sí (pantalla) | ❌ No | ❌ No | ⚠️ Mantener pero simplificar |
| **Reportes** | ❌ No | ❌ No | ✅ Sí | ✅ Ya correcto |
| **Categorías** | ❌ No | ❌ No | ✅ Sí | ✅ Ya correcto |
| **Proveedores** | ❌ No | ❌ No | ✅ Sí | ✅ Ya correcto |

---

## 9. CHECKLIST DE ELIMINACIÓN

### Fase A (Remover lógica):

- [ ] Remover selector inline en `app/modulos/pos-ventas/page.jsx`
- [ ] Remover selector inline en `app/modulos/stock_locales/page.jsx`
- [ ] Remover selector inline en `app/modulos/fidelidad/page.jsx`
- [ ] Remover fetch a `/api/locales/opciones` en `app/inicio/page.jsx`
- [ ] Remover fetch a `/api/locales/opciones` en `app/modulos/pos-ventas/page.jsx`
- [ ] Remover localStorage `ultimoLocal` en `app/modulos/stock_locales/page.jsx`
- [ ] Remover localStorage `ultimoLocal` en `app/modulos/fidelidad/page.jsx`
- [ ] Actualizar `components/stock_locales/FiltrosStock.jsx` para usar contexto
- [ ] Actualizar `components/stock_locales/TablaStock.jsx` para usar contexto
- [ ] Actualizar `app/modulos/pos-ventas/page.jsx` para usar `useContextoActivo`
- [ ] Actualizar `app/modulos/stock_locales/page.jsx` para usar `useContextoActivo`
- [ ] Actualizar `app/modulos/fidelidad/page.jsx` para usar `useContextoActivo`
- [ ] Limpiar referencias en documentación

### Fase B (Borrar archivos):

- [ ] Verificar que `/api/locales/opciones` no se use en ningún lugar
- [ ] Borrar `app/api/locales/opciones/route.js`

---

## 10. NOTAS ADICIONALES

### Patrón recomendado post-eliminación:

```javascript
import useContextoActivo from "@/hooks/useContextoActivo";

const { loading: loadingCtx, contexto, needsContexto } = useContextoActivo();

if (loadingCtx) return <Loading />;
if (needsContexto) {
  router.push("/inicio");
  return null;
}

const localId = contexto?.localId || null;
```

### Endpoints que seguirán requiriendo localId:

Todos los endpoints de productos, clientes, stock, etc. seguirán requiriendo `localId` como query param o en body. La diferencia es que ahora se obtiene únicamente desde `useContextoActivo` (que lee de cookie), no desde selectores manuales.

---

**FIN DEL REPORTE**

