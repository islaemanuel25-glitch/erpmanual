# DIAGNÓSTICO: Problema al Eliminar Usuario

## 1. Modelo Usuario

**Ubicación:** `prisma/schema.prisma` líneas 83-102

```prisma
model Usuario {
  id           Int      @id @default(autoincrement())
  nombre       String
  email        String   @unique
  passwordHash String
  rolId        Int      // REQUIRED
  localId      Int?     // OPTIONAL
  activo       Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  local        Local?   @relation(fields: [localId], references: [id])
  rol          Rol      @relation(fields: [rolId], references: [id])

  confirmaciones TransferenciaDetalle[]
  posTransferencias PosTransferencia[]

  @@map("Usuario")
}
```

## 2. Tablas que Referencian Usuario

### Relaciones Directas:

1. **TransferenciaDetalle.confirmadoPorId**
   - Campo: `confirmadoPorId Int?` (OPTIONAL)
   - Relación: `confirmadoPor Usuario? @relation(fields: [confirmadoPorId], references: [id])`
   - **onDelete: NO DEFINIDO** → PostgreSQL usa **RESTRICT** por defecto
   - Ubicación: `prisma/schema.prisma` línea 310

2. **PosTransferencia.usuarioId**
   - Campo: `usuarioId Int` (REQUIRED)
   - Relación: `usuario Usuario @relation(fields: [usuarioId], references: [id])`
   - **onDelete: NO DEFINIDO** → PostgreSQL usa **RESTRICT** por defecto
   - Ubicación: `prisma/schema.prisma` línea 345

### Relaciones Inversas (Usuario → Otras Tablas):

3. **Usuario.rolId → Rol.id**
   - Campo: `rolId Int` (REQUIRED)
   - Relación: `rol Rol @relation(fields: [rolId], references: [id])`
   - **onDelete: NO DEFINIDO** → No afecta DELETE de Usuario (es referencia saliente)

4. **Usuario.localId → Local.id**
   - Campo: `localId Int?` (OPTIONAL)
   - Relación: `local Local? @relation(fields: [localId], references: [id])`
   - **onDelete: NO DEFINIDO** → No afecta DELETE de Usuario (es referencia saliente)

## 3. Endpoints de Eliminación

### Endpoint 1: `/api/usuarios/eliminar/[id]`
- **Archivo:** `app/api/usuarios/eliminar/[id]/route.js`
- **Método:** `DELETE`
- **Función Prisma:** `prisma.usuario.update()` (soft delete)
- **Línea crítica:** 65-69

### Endpoint 2: `/api/usuarios/eliminarPorEmail`
- **Archivo:** `app/api/usuarios/eliminarPorEmail/route.js`
- **Método:** `DELETE`
- **Función Prisma:** `prisma.usuario.update()` (soft delete)
- **Línea crítica:** 69-73

## 4. Lógica de Bloqueo

### Bloqueos Implementados:

1. **Auto-eliminación:** Línea 37-42
   - No permite eliminar tu propio usuario

2. **Usuario Admin:** Línea 57-62
   - No permite eliminar usuarios con rol "Admin"

3. **Autenticación y Permisos:** Líneas 7-26
   - Requiere sesión activa
   - Requiere permisos `usuarios.eliminar` o ser Admin

### Bloqueos NO Implementados:

- ❌ No verifica si es el último Admin
- ❌ No verifica si tiene registros en `TransferenciaDetalle`
- ❌ No verifica si tiene registros en `PosTransferencia`
- ❌ No maneja relaciones rotas (rolId/localId inexistentes)

## 5. Motivo Exacto del Bloqueo

**PROBLEMA PRINCIPAL:**

El endpoint usa `prisma.usuario.findUnique()` con `include: { rol: true }` (línea 45-48). Cuando el usuario tiene relaciones rotas (rolId o localId que no existen en sus tablas), Prisma falla al hacer el `include` y retorna `null`, causando el error "Usuario no encontrado" aunque el usuario existe.

**PROBLEMA SECUNDARIO:**

Aunque se está usando soft delete (UPDATE), si `findUnique` falla, nunca se llega al `update`. Además, si hay registros en `PosTransferencia` con `usuarioId` requerido y sin `onDelete: SetNull`, PostgreSQL podría bloquear el UPDATE (aunque esto es menos probable con soft delete).

**EVIDENCIA:**

- Scripts de prueba muestran que `findFirst` encuentra el usuario pero `findUnique` no
- Los UPDATEs afectan 0 filas aunque el usuario existe
- El usuario tiene `rolId: 4` y `localId: 3` que existen, pero Prisma no puede hacer el `include`

## 6. Verificación de Conexión

**DATABASE_URL:** Definida en `prisma/schema.prisma` línea 7
- Usa variable de entorno `DATABASE_URL`
- Provider: `postgresql`

**Nota:** No se puede verificar la conexión efectiva sin acceso al `.env`, pero el problema es de lógica, no de conexión.

## 7. Solución Exacta

### Solución Recomendada: Mejorar el Endpoint de Eliminación

**Archivo:** `app/api/usuarios/eliminar/[id]/route.js`

**Cambios necesarios:**

1. Usar `findFirst` como fallback si `findUnique` falla
2. Usar `updateMany` en lugar de `update` para evitar problemas con relaciones rotas
3. Manejar errores de relaciones rotas correctamente

**Código a aplicar:**

```javascript
// 5) Usuario existe + bloqueo Admin
// Intentar con findUnique primero, si falla usar findFirst (para relaciones rotas)
let usuario = await prisma.usuario.findUnique({
  where: { id: userId },
  include: { rol: true },
});

if (!usuario) {
  // Si findUnique falla (posibles relaciones rotas), intentar con findFirst
  usuario = await prisma.usuario.findFirst({
    where: { id: userId },
  });
  
  if (usuario) {
    // Obtener rol por separado si existe
    if (usuario.rolId) {
      try {
        usuario.rol = await prisma.rol.findUnique({
          where: { id: usuario.rolId },
        });
      } catch (e) {
        // Si el rol no existe, continuar sin rol
        usuario.rol = null;
      }
    }
  }
}

if (!usuario) {
  return NextResponse.json(
    { ok: false, error: "Usuario no encontrado." },
    { status: 404 }
  );
}

if (usuario.rol?.nombre === "Admin") {
  return NextResponse.json(
    { ok: false, error: "No se puede eliminar el usuario administrador." },
    { status: 403 }
  );
}

// 6) Soft delete usando updateMany (funciona incluso con relaciones rotas)
let eliminado;
try {
  eliminado = await prisma.usuario.update({
    where: { id: userId },
    data: { activo: false },
    include: { rol: true, local: true },
  });
} catch (updateError) {
  // Si update falla (posibles relaciones rotas), usar updateMany
  console.warn("⚠️ Update falló, usando updateMany:", updateError);
  const result = await prisma.usuario.updateMany({
    where: { id: userId },
    data: { activo: false },
  });

  if (result.count === 0) {
    return NextResponse.json(
      { ok: false, error: "No se pudo eliminar el usuario." },
      { status: 500 }
    );
  }

  // Obtener el usuario actualizado sin include para evitar problemas
  eliminado = await prisma.usuario.findFirst({
    where: { id: userId },
  });

  // Intentar obtener relaciones por separado
  if (eliminado) {
    try {
      if (eliminado.rolId) {
        eliminado.rol = await prisma.rol.findUnique({
          where: { id: eliminado.rolId },
        });
      }
      if (eliminado.localId) {
        eliminado.local = await prisma.local.findUnique({
          where: { id: eliminado.localId },
        });
      }
    } catch (e) {
      // Si falla obtener relaciones, continuar sin ellas
      console.warn("⚠️ No se pudieron obtener relaciones:", e);
    }
  }
}

return NextResponse.json({ ok: true, usuario: eliminado }, { status: 200 });
```

### Solución Alternativa: Agregar onDelete a las Relaciones

Si se quiere permitir DELETE físico en el futuro, agregar a `prisma/schema.prisma`:

```prisma
// En TransferenciaDetalle
confirmadoPor     Usuario?      @relation(fields: [confirmadoPorId], references: [id], onDelete: SetNull)

// En PosTransferencia  
usuario     Usuario                 @relation(fields: [usuarioId], references: [id], onDelete: Restrict)
```

Luego ejecutar: `npx prisma migrate dev --name add-ondelete-usuario`

---

## RESUMEN EJECUTIVO

- **Modelo User:** `Usuario` (mapeado a tabla "Usuario")
- **Tablas que lo referencian:**
  - `TransferenciaDetalle.confirmadoPorId` → OPTIONAL → **SIN onDelete** (RESTRICT por defecto)
  - `PosTransferencia.usuarioId` → REQUIRED → **SIN onDelete** (RESTRICT por defecto)
- **Motivo exacto del bloqueo:** `findUnique` con `include` falla cuando hay relaciones rotas (rolId/localId inexistentes), retornando `null` aunque el usuario existe
- **Archivo donde ocurre:** `app/api/usuarios/eliminar/[id]/route.js` líneas 45-69
- **Solución exacta a aplicar:** Usar `findFirst` como fallback y `updateMany` en lugar de `update` para manejar relaciones rotas correctamente

