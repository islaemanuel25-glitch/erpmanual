# Modulo: Transferencias

**Última actualización:** 2026-07-26 01:08

## Ubicacion
- UI: `app/modulos/transferencias/page.jsx`, `app/modulos/transferencias/[id]/page.jsx`
- APIs: `app/api/transferencias/`
- Componentes: `components/transferencias/`

## Descripcion
Transferencias formales de mercaderia entre depositos y locales. Incluye workflow completo: envio → recepcion → confirmacion con control de diferencias.

## Funcionalidad principal
- Listado con filtros (estado, local, rango de fechas)
- Detalle expandible con items
- Recepcion: registrar cantidades recibidas y motivos de diferencia
- Confirmacion: actualiza stock de destino en transaccion
- Generacion de PDF (envio y recepcion)
- Calculo de costo total

## Dependencias

### Usa
- Locales (origen, destino)
- Productos (ProductoLocal en detalle)
- Stock (actualiza al confirmar)
- Usuarios (confirmadoPor)

### Usado por
- POS Transferencias (se convierte en Transferencia al enviar)

## APIs

### Expone
- `GET /api/transferencias/listar?estado=&localId=&fechaDesde=&fechaHasta=&page=`
- `GET /api/transferencias/detalle?id=`
- `POST /api/transferencias/guardar-recepcion` — items con recibido y motivos
- `POST /api/transferencias/confirmar-recepcion` — actualiza stock en transaccion
- `GET /api/transferencias/pdf?id=` — PDF de envio
- `GET /api/transferencias/pdf-recepcion?id=` — PDF de recepcion

## Componentes principales
- `TablaTransferencias`: Tabla con filas expandibles
- `FilaTransferencia`: Fila individual con detalle inline
- `TablaDetalleTransferencia`: Detalle de items
- `TransferenciaHeader`: Encabezado del detalle
- `AccionesRecepcion`: Botones de recepcion/confirmacion
- `ColumnSettingsModal`: Configuracion de columnas visibles

## Estado y hooks
- Estado local con `useState`
- Columnas visibles persistidas en localStorage

## Permisos requeridos
- `transferencias.crear`
- `transferencias.recibir`

## Modelo de datos

```prisma
model Transferencia {
  id                Int       @id @default(autoincrement())
  origenId          Int
  destinoId         Int
  estado            String    @default("Pendiente")
  fechaEnvio        DateTime?
  fechaRecepcion    DateTime?
  creadaPor         String?
  tieneDiferencias  Boolean   @default(false)
}

model TransferenciaDetalle {
  id                Int       @id @default(autoincrement())
  transferenciaId   Int
  productoId        Int       // FK a ProductoLocal
  cantidad          Decimal   @db.Decimal(12, 2)
  recibido          Decimal?  @db.Decimal(12, 2)
  precioCosto       Decimal?  @db.Decimal(12, 2)
  unidadEnviada     UnidadMedida?
  motivoPrincipal   String?
  motivoDetalle     String?
  confirmadoPorId   Int?
}
```

## Estados de transferencia

```
Pendiente → Enviada → Recibiendo → Recibida
                                  → (con diferencias)
```

## Cambios recientes
- 2026-07-25: feat(combos): módulo de combos exclusivos por local
- 2026-07-25: feat(combos): módulo de combos exclusivos por local
