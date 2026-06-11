# Modulo: POS Transferencias

**Última actualización:** 2026-06-10 21:06

## Ubicacion
- UI: `app/modulos/pos-transferencias/page.jsx`, `app/modulos/pos-transferencias/nueva/page.jsx`
- APIs: `app/api/pos-transferencias/`
- Componentes: `components/pos-transferencias/`

## Descripcion
Pedidos rapidos de mercaderia desde un local hacia un deposito. El sistema sugiere cantidades basandose en stock faltante. Al enviar, se convierte en una Transferencia formal.

## Funcionalidad principal
- Dos modos: Deposito (operador de deposito) y Admin
- Sugerencia automatica de productos faltantes
- Busqueda manual de productos del deposito
- Ajuste de cantidades preparadas
- Envio: convierte POS → Transferencia formal
- Cancelacion de borradores

## Dependencias

### Usa
- Locales (origen deposito, destino local)
- Grupos (para validar misma agrupacion)
- Productos (ProductoLocal del deposito)
- Stock (StockLocal para calcular sugeridos)
- Usuarios (usuarioId creador)

### Genera
- Transferencias (al enviar se crea Transferencia + TransferenciaDetalle)

## APIs

### Consume
- `GET /api/me`
- `GET /api/locales/listar`
- `GET /api/grupos/opciones`

### Expone
- `GET /api/pos-transferencias/nueva?destinoId=&origenId=` — obtiene o crea borrador
- `POST /api/pos-transferencias/crear`
- `GET /api/pos-transferencias/detalle?posId=`
- `GET /api/pos-transferencias/buscarProductos?origenId=&q=`
- `GET /api/pos-transferencias/sugeridos?destinoId=&posId=`
- `POST /api/pos-transferencias/agregarItem`
- `POST /api/pos-transferencias/enviar` — convierte a Transferencia
- `POST /api/pos-transferencias/cancelar`

## Componentes principales
- `Encabezado`: Info de origen/destino
- `BuscadorManual`: Busqueda de productos del deposito
- `FiltrosDeposito`: Filtros por categoria
- `TablaSugeridos`: Tabla de productos sugeridos (faltantes)
- `PreparadosTable`: Tabla de items preparados para enviar
- `ResumenPreparados`: Resumen con totales

## Estado y hooks
- Estado local con `useState`

## Permisos requeridos
- `pos.usar`
- `pos.anular` (para cancelar)

## Modelo de datos

```prisma
model PosTransferencia {
  id          Int       @id @default(autoincrement())
  origenId    Int
  destinoId   Int
  usuarioId   Int
  estado      String    @default("Borrador")
}

model PosTransferenciaDetalle {
  id                    Int       @id @default(autoincrement())
  posTransferenciaId    Int
  productoId            Int       // FK a ProductoLocal
  sugerido              Decimal?  @db.Decimal(12, 2)
  preparado             Decimal?  @db.Decimal(12, 2)
  tipo                  String    @default("sugerido")
  unidadSugerida        ModoPedido @default(BULTO)
  unidadPreparada       ModoPedido?
}
```

## Flujo

```
1. Seleccionar origen (deposito) y destino (local)
2. Sistema calcula sugeridos: stockMax - stockActual del local
3. Operador ajusta cantidades preparadas
4. Puede agregar productos manualmente
5. Enviar → crea Transferencia formal con estado "Enviada"
6. POS se elimina despues del envio
```

## Cambios recientes
- 2026-06-10: fix(fiambre): stock operativo del deposito en PIEZAS para fiambre fijo por pieza
