# ERP Azul - Overview

## Que es

ERP Azul es un sistema de gestion empresarial orientado a cadenas de comercios minoristas con depositos centrales. Permite administrar productos, stock, precios, transferencias entre locales/depositos, usuarios y roles con permisos granulares.

## Para que se usa

- Gestionar un catalogo centralizado de productos por grupo
- Controlar stock por local y deposito con limites min/max
- Realizar transferencias de mercaderia entre depositos y locales
- Actualizar precios masivamente por proveedor o via Excel
- Administrar usuarios con roles y permisos especificos
- Operar multiples locales/depositos bajo un mismo grupo

## Modulos principales

| Modulo | Descripcion |
|--------|-------------|
| Productos | Catalogo centralizado con precios, categorias, proveedores |
| Stock Locales | Inventario por local con ajustes y limites |
| Transferencias | Envios de mercaderia entre depositos y locales |
| POS Transferencias | Pedidos rapidos desde local hacia deposito |
| Actualizacion Precios | Actualizacion masiva por proveedor o Excel |
| Usuarios | ABM de usuarios con asignacion de rol y local |
| Roles | Definicion de roles con permisos granulares |
| Grupos | Agrupacion de locales y depositos |
| Locales | ABM de locales y depositos fisicos |
| Categorias | Clasificacion de productos |
| Proveedores | Gestion de proveedores con dias de pedido |
| Areas Fisicas | Ubicaciones fisicas dentro de locales |

## Usuarios tipo

- **Admin (padre)**: Acceso total (`*`), puede cambiar grupo activo, ve todos los datos
- **Encargado de deposito**: Ve stock del deposito, prepara transferencias, recibe mercaderia
- **Encargado de local**: Ve stock de su local, solicita pedidos POS, recibe transferencias
- **Operador**: Acceso limitado segun permisos del rol asignado

## Flujos principales

### Carga de productos
1. Admin selecciona grupo activo
2. Crea producto en deposito (ProductoBase)
3. Sistema replica a todos los locales del grupo (ProductoLocal + StockLocal)

### Transferencia deposito → local
1. Deposito o admin crea POS Transferencia (borrador)
2. Sistema sugiere cantidades segun stock faltante
3. Operador prepara y ajusta cantidades
4. Se envia → se convierte en Transferencia formal
5. Local recibe, confirma cantidades, reporta diferencias
6. Sistema actualiza stock de ambos lados

### Actualizacion de precios
1. Seleccionar proveedor
2. Cargar productos del proveedor
3. Definir % de aumento global o por producto
4. Previsualizar cambios calculados
5. Aplicar → actualiza precio_costo y precio_venta en DB

### Gestion de stock
1. Ver stock por local con filtros
2. Ajustar cantidades (sumar/restar)
3. Configurar limites min/max
4. Sistema marca faltantes automaticamente
