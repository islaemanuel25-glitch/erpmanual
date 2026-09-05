-- ═══════════════════════════════════════════════════════════════════════════
-- MEDIOS DE COBRO CONFIGURABLES POR LOCAL
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Aditiva y compatible con la aplicación vieja: crea un tipo y una tabla, y no
-- toca ni una columna existente. La versión anterior del ERP la ignora.
--
-- ── NO SIEMBRA NI UNA FILA, Y ES LA DECISIÓN MÁS IMPORTANTE DE ACÁ ─────────
--
-- El requisito era que después de migrar, sin que nadie configure nada, el POS
-- quede EXACTAMENTE como hoy. La forma obvia sería backfillear los cuatro medios
-- para cada local existente. No se hizo, por dos motivos.
--
-- El primero: un backfill solo cubre los locales que existían el día del
-- despliegue. El local que se cree la semana que viene arrancaría sin medios y
-- el POS saldría sin botones. La compatibilidad no puede depender de haber
-- corrido un UPDATE una vez.
--
-- El segundo: una fila sembrada es indistinguible de una decisión. Si mañana se
-- agrega un medio al default del sistema, los locales backfilleados no lo verían
-- —ya "tienen configuración"— y nadie sabría por qué.
--
-- Entonces la compatibilidad vive en la capa de dominio: un local SIN filas usa
-- los medios por defecto, que son exactamente los cuatro botones de hoy en su
-- orden de hoy. Ver `lib/pos-ventas/mediosCobro.js`. La primera edición desde la
-- pantalla materializa esos defaults como filas, y a partir de ahí manda la
-- configuración del local.
--
-- Vale para los locales viejos, para los nuevos, y para uno creado dentro de
-- cinco años, sin que nadie tenga que acordarse de nada.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Procesador — POR DÓNDE pasa la plata (no es el tipo contable)
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProcesadorCobro') THEN
    CREATE TYPE "ProcesadorCobro" AS ENUM ('MERCADOPAGO', 'BANCO', 'OTRO');
  END IF;
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. La tabla
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MedioCobroLocal" (
  "id"              SERIAL NOT NULL,
  "localId"         INTEGER NOT NULL,
  "nombre"          TEXT NOT NULL,
  "activo"          BOOLEAN NOT NULL DEFAULT true,
  "orden"           INTEGER NOT NULL DEFAULT 0,
  "tipoContable"    "MedioPago" NOT NULL,
  "procesador"      "ProcesadorCobro",
  "comisionPct"     DECIMAL(5,2),
  "integracionJson" JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MedioCobroLocal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MedioCobroLocal_localId_idx" ON "MedioCobroLocal"("localId");
CREATE INDEX IF NOT EXISTS "MedioCobroLocal_localId_activo_orden_idx" ON "MedioCobroLocal"("localId", "activo", "orden");

-- ───────────────────────────────────────────────────────────────────────────
-- 3. UN SOLO MEDIO ACTIVO POR TIPO CONTABLE — el candado de la base
-- ───────────────────────────────────────────────────────────────────────────
--
-- `VentaPago` tiene `@@unique([ventaId, medio])`: como máximo un tender por medio
-- canónico por venta. Dos medios ACTIVOS con el mismo tipoContable —"Débito
-- Banco" y "MP Débito", por ejemplo— se pueden configurar sin problema, pero el
-- día que un cajero parta un pago entre los dos, el segundo tender viola esa
-- restricción y la venta se cae EN LA CAJA, con gente esperando.
--
-- La alternativa era cambiar la clave de `VentaPago`, que es la verdad de 14.226
-- ventas. No se toca: se prohíbe la combinación que la rompería.
--
-- El índice es PARCIAL —solo entre los activos— porque los inactivos SÍ pueden
-- convivir: guardar un medio apagado con su configuración es justamente para qué
-- sirve `activo`. Prisma no sabe expresar un WHERE en un índice único, así que va
-- acá a mano, igual que los otros ocho parciales del esquema.
--
-- Esto es la última línea de defensa, no la primera: la capa de dominio valida
-- antes y devuelve un mensaje que se entiende. Que alguien lea un error de
-- Postgres es haberle fallado.
CREATE UNIQUE INDEX IF NOT EXISTS "MedioCobroLocal_tipo_activo_key"
  ON "MedioCobroLocal"("localId", "tipoContable")
  WHERE "activo";

-- ───────────────────────────────────────────────────────────────────────────
-- 4. La clave foránea
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "MedioCobroLocal" DROP CONSTRAINT IF EXISTS "MedioCobroLocal_localId_fkey";
ALTER TABLE "MedioCobroLocal" ADD CONSTRAINT "MedioCobroLocal_localId_fkey"
  FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
