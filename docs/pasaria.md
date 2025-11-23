# PROTOCOLO DE TRABAJO — ERP AZUL

## 1. Naming interno
### camelCase para TODO en JS:
- precioCosto
- precioVenta
- codigoBarra
- categoriaId
- proveedorId
- areaFisicaId
- fechaVencimiento
- esCombo
- esDeposito
- imagenUrl
- productoLocalId

### snake_case SOLO en SQL (Prisma lo mapea):
- precio_costo
- codigo_barra
- area_fisica_id
- creado_en_local_id

**Regla:** nunca devolver snake_case al frontend.

---

## 2. Formato universal de APIs
Siempre devolver:

{
  "ok": true | false,
  "items": [],
  "item": {},
  "total": 0,
  "totalPages": 1,
  "error": ""
}

**Nunca inventar estructuras nuevas.**

---

## 3. Estructura obligatoria de un módulo CRUD

modulos/<modulo>/
  page.jsx
  nuevo/page.jsx
  editar/[id]/page.jsx

  api/
    listar/route.js
    obtener/route.js
    crear/route.js
    editar/[id]/route.js
    eliminar/[id]/route.js

  components/
    TablaModulo.jsx
    ModalModulo.jsx
    FiltrosModulo.jsx
    ColumnManagerModulo.jsx
    FormModulo.jsx

**Todo módulo sigue esta estructura.**

---

## 4. CRUD obligatorio (resumen)
- /listar → GET
- /obtener?id=X → GET
- /crear → POST
- /editar/[id] → PUT
- /eliminar/[id] → DELETE o soft delete

**Formato de respuesta siempre el estándar.**

---

## 5. Reglas generales DEL ERP
- No mezclar camelCase y snake_case.
- No crear carpetas nuevas.
- No renombrar archivos.
- No inventar rutas.
- No devolver datos distintos a los definidos en Prisma.
- No modificar tablas sin autorización.
- No tocar módulos funcionando.

---

## 6. Qué va en cada archivo

### page.jsx
- listado
- filtros
- tabla
- abrir modal de crear/editar

### ModalModulo.jsx
- modo crear y modo editar
- llama a la API
- valida antes de enviar

### FormModulo.jsx
- inputs del formulario
- estados
- onSubmit(data)

### route.js
- recibe JSON
- usa prisma
- devuelve el formato estándar

---

## 7. Prisma y SQL
Usamos prisma con campos camelCase en JS, snake_case en SQL automáticamente.

Ejemplo:
precio_costo (SQL) → precioCosto (JS)

---

## 8. Regla de ORO
**NO inventar nada que no esté en este protocolo.  
Preguntar antes de crear cualquier cosa nueva.**

