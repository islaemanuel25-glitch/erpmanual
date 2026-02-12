# Modulo: Areas Fisicas

## Ubicacion
- APIs: `app/api/areas-fisicas/`
- No tiene UI propia dedicada (se usa como filtro/selector en otros modulos)

## Descripcion
Ubicaciones fisicas dentro de los locales (ej: "Gondola 1", "Camara fria", "Deposito trasero"). Se usan para categorizar la ubicacion de productos dentro de un local.

## Funcionalidad principal
- Listar areas fisicas activas
- Usado como filtro en modulos de Productos y Stock

## Dependencias

### Usado por
- Productos (area_fisica_id)
- Stock (filtro por area)

## APIs

### Expone
- `GET /api/areas-fisicas/listar`

### Alias
- `GET /api/catalogos/areas-fisicas`

## Estado y hooks
- No tiene estado propio, se carga como catalogo en otros modulos

## Modelo de datos

```prisma
model AreaFisica {
  id          Int     @id @default(autoincrement())
  nombre      String
  descripcion String?
  tipo        String?
  activo      Boolean @default(true)
}
```
