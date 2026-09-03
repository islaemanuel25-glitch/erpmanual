-- QUÉ UBICACIÓN USA A QUÉ PROVEEDOR, DICHO EXPLÍCITAMENTE.
--
-- Una tabla nueva y nada más. No se toca `Proveedor`, no se toca `ProductoBase`
-- y no se toca ninguna columna existente.
--
-- ── ES ADITIVA Y COMPATIBLE HACIA ATRÁS ──────────────────────────────────────
--
-- La versión anterior de la aplicación —la que sigue atendiendo durante la
-- ventana entre migrar y recrear— no conoce esta tabla y no la consulta nunca.
-- Su predicado de visibilidad de proveedores mira `ProductoBase` y
-- `Proveedor.creadoEnLocalId`, que quedan exactamente como estaban. O sea que
-- durante la ventana el comportamiento es el de hoy, sin excepción.
--
-- ── NO SE RELLENA NADA, Y ESO ES LA DECISIÓN ─────────────────────────────────
--
-- La tabla arranca VACÍA. Ni un solo proveedor existente se asocia a ninguna
-- ubicación, y no es un olvido: el predicado nuevo SUMA con un OR, así que un
-- proveedor sin filas acá se sigue viendo por la Regla B —donde se creó el
-- producto que lo usa— igual que antes.
--
-- Rellenarla a partir de `creadoEnLocalId` habría sido inventar el dato que esta
-- tabla existe para registrar: "se dio de alta acá" y "esta ubicación lo usa"
-- son dos hechos distintos, y de los proveedores viejos solo consta el primero.
-- Un backfill los habría vuelto indistinguibles para siempre.
--
-- ── LA UNICIDAD ES DE LA BASE, NO DE LA APLICACIÓN ───────────────────────────
--
-- `proveedor_unico_por_ubicacion` sobre (grupoId, localId, proveedorId) es lo
-- que hace imposible asociar dos veces el mismo proveedor al mismo lugar, aunque
-- dos pedidos simultáneos pasen los dos por la validación de la aplicación. La
-- ruta captura el choque y contesta idempotente.

CREATE TABLE IF NOT EXISTS "ProveedorLocal" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProveedorLocal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "proveedor_unico_por_ubicacion"
    ON "ProveedorLocal"("grupoId", "localId", "proveedorId");

CREATE INDEX IF NOT EXISTS "ProveedorLocal_grupoId_localId_activo_idx"
    ON "ProveedorLocal"("grupoId", "localId", "activo");

CREATE INDEX IF NOT EXISTS "ProveedorLocal_proveedorId_idx"
    ON "ProveedorLocal"("proveedorId");

ALTER TABLE "ProveedorLocal"
    ADD CONSTRAINT "ProveedorLocal_grupoId_fkey"
    FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProveedorLocal"
    ADD CONSTRAINT "ProveedorLocal_localId_fkey"
    FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProveedorLocal"
    ADD CONSTRAINT "ProveedorLocal_proveedorId_fkey"
    FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
