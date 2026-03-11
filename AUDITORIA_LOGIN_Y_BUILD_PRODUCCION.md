# Auditoría urgente — Login precargado y versión vieja en producción

## Resumen

| Bug | Causa exacta | Origen |
|-----|--------------|--------|
| 1) Email/contraseña precargados | Valores iniciales **hardcodeados** en el estado del formulario de login | Código: `app/login/page.jsx` |
| 2) Frontend viejo cargado | La imagen/contenedor en producción fue construida con una versión antigua del código o se sirve build cacheado | Proceso de deploy / build, no código de la app |

**Conclusión: los dos bugs NO vienen del mismo origen.** Bug 1 es código (defaults en login). Bug 2 es despliegue/build (imagen no actualizada o caché).

---

## Bug 1 — Login con mail y contraseña precargados

### Archivos involucrados

- **app/login/page.jsx** (único archivo que define el formulario de login)

### Causa exacta

En `app/login/page.jsx` líneas 14-15 el estado inicial del formulario está fijado a las credenciales del seed:

```js
const [email, setEmail] = useState("admin@admin.com");
const [password, setPassword] = useState("123456");
```

- No hay lectura de `localStorage`, `sessionStorage` ni cookies para email/password.
- No existe lógica de autologin, demo ni dev en el login (el API `app/api/login/route.js` solo valida y firma JWT; no precarga nada).
- Cualquier dispositivo que cargue `/login` recibe el mismo bundle con esos `useState(...)`, por eso siempre aparecen precargados.

El comentario en el código ("✅ DATOS REALES DEL SEED") indica que se dejaron por conveniencia en dev y no se quitaron para producción.

### Cambio mínimo

Inicializar email y contraseña con string vacío para que el formulario arranque en blanco:

```js
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
```

---

## Bug 2 — Sistema carga versión vieja del frontend

### Archivos involucrados (contexto de build)

- **Dockerfile** — build en dos etapas: `builder` (npm ci, prisma generate, npm run build) y `runner` (copia `.next/standalone`, `.next/static`, `public`, `prisma`).
- **next.config.mjs** — `output: "standalone"` (correcto para el Docker actual).
- **docker-compose.prod.yml** — build `context: .`, sin volúmenes que monten código en el contenedor (se sirve lo que quedó en la imagen).

### Causa exacta

No hay nada en el repo que “fije” una versión vieja del frontend (no hay assets estáticos versionados viejos commiteados, ni scripts que copien un build antiguo). El Dockerfile es estándar: construye con `COPY . .` y `npm run build` dentro de la imagen.

Por tanto, que en producción se vea una **versión vieja** del frontend implica al menos una de estas situaciones:

1. **Imagen no reconstruida**  
   En producción se está usando una imagen Docker construida a partir de un commit anterior. Cada deploy debería construir una nueva imagen desde el código actual (por ejemplo `docker compose build --no-cache app` y luego subir/levantar esa imagen).

2. **Build fuera del repo actual**  
   El build se hace en otro lugar (CI, otra máquina) que no tiene el último código o no se ha disparado el job tras el último commit.

3. **Caché de proxy/CDN**  
   Un reverse proxy o CDN delante de la app puede estar cacheando HTML o respuestas y servir una versión antigua. Next genera chunks con hash en los nombres; si el HTML que se sirve es viejo, ese HTML referencia chunks viejos.

4. **Contenedor viejo sin recrear**  
   Se actualiza la imagen en el registry pero en el servidor no se hace `pull` + `up` del servicio `app`, y sigue corriendo el contenedor anterior.

El arranque del contenedor (`CMD ["node", "server.js"]`) es el esperado para `standalone`; no hay en el Dockerfile ni en el compose nada que fuerce a servir otro build.

### Cambio mínimo (proceso, no código)

- Asegurar que cada deploy construya la imagen desde el commit desplegado, por ejemplo:
  - `docker compose -f docker-compose.prod.yml build --no-cache app`
  - Subir la nueva imagen y levantar el servicio (o `docker compose up -d --build app` en el servidor con el código actual).
- Revisar en proxy/CDN que no se cachee de más la raíz o `/login` (o invalidar caché tras cada deploy).
- Confirmar que el servidor donde corre operix.cloud está usando la imagen recién construida y no una imagen antigua guardada localmente.

---

## Diff final (solo Bug 1 — código)

**Archivo: app/login/page.jsx**

```diff
-  // ✅ DATOS REALES DEL SEED
-  const [email, setEmail] = useState("admin@admin.com");
-  const [password, setPassword] = useState("123456");
+  const [email, setEmail] = useState("");
+  const [password, setPassword] = useState("");
```

No se requieren cambios en `app/api/login/route.js`, ni en Dockerfile, ni en docker-compose para corregir el login precargado. Para ver la versión nueva del frontend, hay que corregir el proceso de build y despliegue como se indica arriba.
