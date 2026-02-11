# NORMALIZACIÓN DE EMAILS EN MÓDULO DE USUARIOS

## Análisis Completo

### ✅ Endpoints que YA normalizan correctamente:

1. **app/api/usuarios/crear/route.js** - Línea 10
   - ✅ `email = String(body?.email ?? "").trim().toLowerCase()`

2. **app/api/usuarios/editar/[id]/route.js** - Línea 35
   - ✅ `email = String(body.email).trim().toLowerCase()`

3. **app/api/usuarios/eliminarPorEmail/route.js** - Línea 30
   - ✅ `email = String(body?.email || "").trim().toLowerCase()`

### ❌ Lugares que NECESITAN corrección:

---

## 1. app/api/login/route.js

**Línea aproximada:** 25

**Código actual:**
```javascript
const { email, password } = await req.json();

// ============================
// 1) Validación de inputs
// ============================
if (!email?.trim() || !password?.trim()) {
  return NextResponse.json(
    { ok: false, error: "Completa email y contraseña." },
    { status: 400 }
  );
}

// ============================
// 2) Buscar usuario
// ============================
const user = await prisma.usuario.findUnique({
  where: { email },
  include: {
    rol: true,
    local: true,
  },
});
```

**Código corregido:**
```javascript
const { email: emailRaw, password } = await req.json();

// ============================
// 1) Validación y normalización de inputs
// ============================
const email = emailRaw ? String(emailRaw).trim().toLowerCase() : "";

if (!email || !password?.trim()) {
  return NextResponse.json(
    { ok: false, error: "Completa email y contraseña." },
    { status: 400 }
  );
}

// ============================
// 2) Buscar usuario
// ============================
const user = await prisma.usuario.findUnique({
  where: { email },
  include: {
    rol: true,
    local: true,
  },
});
```

---

## 2. prisma/seed.js

**Línea aproximada:** 77-84

**Código actual:**
```javascript
// Prisma model correcto: usuario en singular y PascalCase
await prisma.Usuario.deleteMany({
  where: { email: "admin@admin.com" },
});

await prisma.Usuario.create({
  data: {
    nombre: "Administrador",
    email: "admin@admin.com",
    passwordHash,
    rolId: rolAdmin.id,
    localId: deposito.id,
    activo: true,
  },
});
```

**Código corregido:**
```javascript
// Prisma model correcto: usuario en singular y PascalCase
const adminEmail = "admin@admin.com".trim().toLowerCase();

await prisma.Usuario.deleteMany({
  where: { email: adminEmail },
});

await prisma.Usuario.create({
  data: {
    nombre: "Administrador",
    email: adminEmail,
    passwordHash,
    rolId: rolAdmin.id,
    localId: deposito.id,
    activo: true,
  },
});
```

---

## 3. scripts/fix-admin.js

**Línea aproximada:** 30-31

**Código actual:**
```javascript
// 2) Asignar rol admin a tu usuario
await prisma.usuario.updateMany({
  where: { email: "admin@admin.com" },
  data: {
    rolId: rol.id,
    localId: null, // ✅ ADMIN GLOBAL
  },
});
```

**Código corregido:**
```javascript
// 2) Asignar rol admin a tu usuario
const adminEmail = "admin@admin.com".trim().toLowerCase();

await prisma.usuario.updateMany({
  where: { email: adminEmail },
  data: {
    rolId: rol.id,
    localId: null, // ✅ ADMIN GLOBAL
  },
});
```

---

## 4. SQL para Blindaje en Base de Datos

**Script SQL propuesto (NO ejecutar automáticamente):**

```sql
-- 1) Normalizar todos los emails existentes
UPDATE public."Usuario"
SET email = lower(trim(email));

-- 2) Crear índice único normalizado para prevenir duplicados
CREATE UNIQUE INDEX IF NOT EXISTS usuario_email_norm_unique
ON public."Usuario" (lower(trim(email)));

-- 3) Verificar que no haya duplicados después de la normalización
SELECT 
  lower(trim(email)) as email_normalizado,
  COUNT(*) as cantidad
FROM public."Usuario"
GROUP BY lower(trim(email))
HAVING COUNT(*) > 1;
```

**Nota:** Si el query de verificación retorna filas, significa que hay emails duplicados que deben resolverse manualmente antes de crear el índice único.

---

## Resumen de Cambios

| Archivo | Línea | Estado | Acción |
|---------|-------|--------|--------|
| `app/api/usuarios/crear/route.js` | 10 | ✅ OK | Ya normaliza |
| `app/api/usuarios/editar/[id]/route.js` | 35 | ✅ OK | Ya normaliza |
| `app/api/usuarios/eliminarPorEmail/route.js` | 30 | ✅ OK | Ya normaliza |
| `app/api/login/route.js` | 25 | ❌ CORREGIR | Normalizar antes de buscar |
| `prisma/seed.js` | 84 | ❌ CORREGIR | Normalizar email hardcoded |
| `scripts/fix-admin.js` | 31 | ❌ CORREGIR | Normalizar email hardcoded |

---

## Verificación Post-Corrección

Después de aplicar los cambios, verificar que:

1. ✅ Todos los emails se guarden con `.trim().toLowerCase()`
2. ✅ Todas las búsquedas por email usen email normalizado
3. ✅ No haya lógica que transforme el email después de guardarlo
4. ✅ El índice único en BD previene duplicados normalizados

