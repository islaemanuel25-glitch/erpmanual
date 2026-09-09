// UNA TRANSFERENCIA CON SNAPSHOT DE PRESENTACIÓN, PARA EL ENTORNO DE CAPTURA.
//
//   node scripts/fixture-captura-cajon.mjs --producto 181 --cajones 6
//
// ── POR QUÉ HACE FALTA UN FIXTURE Y NO ALCANZA EL RESPALDO ───────────────
//
// El snapshot de presentación se empezó a escribir en esta tanda: la migración
// es aditiva y NO rellena históricos, así que en una copia de producción las
// 6388 líneas existentes tienen los cinco campos en null. El caso que las
// capturas E y F tienen que retratar —una línea que salió como 6 CAJÓN x8 y
// quedó persistida con `cantidad = 48` y `unidadEnviada = "UNIDAD"`— no existe
// ahí y no puede existir: lo produce la VENTA INTERNA, y ninguna se hizo con el
// código nuevo todavía.
//
// ── Y POR QUÉ ESTO NO ES FABRICAR DATOS ──────────────────────────────────
//
// Acá no se escribe una fila a mano. Se llaman las DOS funciones de producción
// que crean esa forma:
//
//   · `mapearVentaATransferencia` — la que traduce el consumo físico de una
//     venta interna a ítems, y la que congela la presentación;
//   · `crearTransferencia` — el servicio que persiste la transferencia y aplica
//     la política de stock.
//
// O sea que los números de la fila los calcula el código bajo prueba, no yo. Lo
// único escrito a mano es lo que un operador tipearía: qué producto, cuántos
// cajones, y a qué local.
//
// Corre SOLO contra una copia descartable: `crearClientePrisma` con nivel
// ESCRITURA exige host local y `NODE_ENV` distinto de production, y esta base es
// un contenedor temporal restaurado del respaldo. Nada de esto toca producción.

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

const { mapearVentaATransferencia } = await import("../lib/ventas-internas/mapearVentaATransferencia.js");
const { crearTransferencia } = await import("../lib/transferencias/crearTransferencia.js");
const { SOLO_TRANSITO } = await import("../lib/transferencias/politicasStock.js");

const arg = (n, def) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};

const BASE_ID = Number(arg("producto", "181"));
const CAJONES = Number(arg("cajones", "6"));
const ORIGEN = Number(arg("origen", "1"));
const DESTINO = Number(arg("destino", "4"));

const base = await prisma.productoBase.findUnique({
  where: { id: BASE_ID },
  select: {
    id: true, nombre: true, unidad_medida: true, factor_pack: true,
    modoVentaDeposito: true, pesoReferenciaKg: true,
    modoCompraProveedor: true, pesoEsFijo: true,
  },
});
if (!base) {
  console.error(`ABORTADO: no existe ProductoBase ${BASE_ID} en esta copia.`);
  process.exit(2);
}

const local = await prisma.productoLocal.findUnique({
  where: { localId_baseId: { localId: ORIGEN, baseId: BASE_ID } },
});
if (!local) {
  console.error(`ABORTADO: el producto ${BASE_ID} no está en el catálogo del local ${ORIGEN}.`);
  process.exit(2);
}

const factor = Number(base.factor_pack || 1);
const fisicas = CAJONES * factor;

// ── LA LÍNEA COMERCIAL, TAL COMO LA ARMA EL POS ─────────────────────────
//
// `baseStock` es lo que `pos-ventas/crear` mete en `baseStockMap`: los mismos
// campos y con los mismos nombres. De ahí sale la presentación congelada.
const lineasComerciales = [
  {
    tipo: "NORMAL",
    productoLocalId: local.id,
    productoBaseId: BASE_ID,
    cantidad: CAJONES,
    modoVentaLinea: "NORMAL",
    consumoFisico: { productoLocalId: local.id, cantidadStock: fisicas },
    baseStock: {
      modoVentaDeposito: base.modoVentaDeposito || "PESO",
      pesoReferenciaKg: Number(base.pesoReferenciaKg || 0),
      modoCompraProveedor: base.modoCompraProveedor || null,
      pesoEsFijo: base.pesoEsFijo ?? null,
      factorPack: factor,
      unidad_medida: base.unidad_medida || "unidad",
    },
  },
];

// El consumo consolidado, ya en escala de StockLocal: es lo que el POS descontó.
const plan = mapearVentaATransferencia({
  consumoFisicoConsolidado: [
    { productoLocalId: local.id, productoBaseId: BASE_ID, cantidad: fisicas },
  ],
  lineasComerciales,
  snapshots: new Map([[local.id, local]]),
  esDeposito: true,
});

if (!plan.debeCrearTransferencia) {
  console.error(`ABORTADO: el mapper no generó ítems (${plan.codigo}).`);
  process.exit(2);
}

const item = plan.items[0];
if (!item.presentacion) {
  console.error(
    "ABORTADO: el mapper NO congeló la presentación. Sin snapshot, la captura no " +
      "probaría el caso: es exactamente el defecto que se está corrigiendo."
  );
  process.exit(2);
}

const transferencia = await prisma.$transaction(async (tx) => {
  const { transferencia: t } = await crearTransferencia({
    tx,
    origenId: ORIGEN,
    destinoId: DESTINO,
    creadoPorId: 4,
    politicaStockOrigen: SOLO_TRANSITO,
    items: plan.items,
  });
  // Queda lista para recibir, que es el estado en el que la pantalla se abre.
  await tx.transferencia.update({ where: { id: t.id }, data: { estado: "Enviada" } });
  return t;
});

const fila = await prisma.transferenciaDetalle.findFirst({
  where: { transferenciaId: transferencia.id },
  select: {
    id: true, cantidad: true, unidadEnviada: true,
    presentacionEnvio: true, cantidadPresentada: true, sueltasEnviadas: true,
    factorPresentacion: true, pesoPiezaKg: true,
  },
});

console.log(`Transferencia #${transferencia.id} — ${base.nombre}`);
console.log(`  persistido : cantidad=${fila.cantidad} unidadEnviada=${fila.unidadEnviada}`);
console.log(
  `  snapshot   : ${fila.presentacionEnvio} ${fila.cantidadPresentada} x${fila.factorPresentacion}` +
    ` (sueltas ${fila.sueltasEnviadas})`
);
console.log(`TRANSFERENCIA=${transferencia.id}`);

await prisma.$disconnect();
