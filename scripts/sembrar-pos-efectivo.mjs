// SEMBRAR LO MÍNIMO PARA RECORRER UN COBRO EN EFECTIVO CON IDENTIDAD.
//
//   docker run --rm --network container:erpazul_db -v …:/app -w /app \
//     -e DATABASE_URL="postgresql://erpazul:…@localhost:5432/erpazul_v15" \
//     -e NODE_ENV=test -e SEED_DESTRUCTIVO=erpazul_v15 \
//     erpazul-test:estable node --import ./scripts/alias-loader.mjs \
//     scripts/sembrar-pos-efectivo.mjs
//
// ── POR QUÉ HACE FALTA ─────────────────────────────────────────────────────
//
// El defecto de `868c04d7` solo aparece cuando el local TIENE medios de cobro
// configurados: sin configuración el panel manda tenders legacy —con el campo
// `medio`— y el modal de efectivo abre como siempre. O sea que una base sin
// configurar no puede reproducirlo, y una captura sobre esa base diría que está
// todo bien.
//
// Siembra entonces: dos medios de cobro para el local —un EFECTIVO y un digital
// con dos modalidades— y un turno abierto, que es lo que el POS exige para
// registrar. Nada más: los productos ya están.
//
// ── IDEMPOTENTE, Y BORRA POR NOMBRE ────────────────────────────────────────
//
// Borra lo que sembró antes por NOMBRE y no por id, porque los ids cambian en
// cada corrida. Imprime al final los números que el arnés necesita.
//
// NO CORRE CONTRA PRODUCCIÓN: pide nivel ESCRITURA a la fábrica, que exige host
// local y `NODE_ENV` distinto de production.

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

const LOCAL_ID = Number(process.env.LOCAL_ID || 6);
const MARCA = "[arnés efectivo]";

async function principal() {
  const local = await prisma.local.findUnique({ where: { id: LOCAL_ID } });
  if (!local) throw new Error(`no existe el local ${LOCAL_ID}`);

  // ── Limpiar lo de la corrida anterior, por nombre ────────────────────────
  const viejos = await prisma.medioCobroLocal.findMany({
    where: { localId: LOCAL_ID, nombre: { contains: MARCA } },
    select: { id: true },
  });
  if (viejos.length > 0) {
    const ids = viejos.map((m) => m.id);
    await prisma.medioCobroModalidadLocal.deleteMany({ where: { medioCobroLocalId: { in: ids } } });
    await prisma.medioCobroLocal.deleteMany({ where: { id: { in: ids } } });
  }

  // ── El efectivo del local, que es el que tiene que abrir el modal ────────
  const efectivo = await prisma.medioCobroLocal.create({
    data: {
      localId: LOCAL_ID,
      nombre: `Efectivo ${MARCA}`,
      activo: true,
      orden: 1,
      tipoContable: "EFECTIVO",
      procesador: null,
    },
  });

  // ── Y un digital con modalidades, para el contraste ──────────────────────
  const digital = await prisma.medioCobroLocal.create({
    data: {
      localId: LOCAL_ID,
      nombre: `Mercado Pago ${MARCA}`,
      activo: true,
      orden: 2,
      tipoContable: "MERCADOPAGO",
      procesador: "MERCADOPAGO",
      modalidades: {
        create: [
          { nombre: "Crédito 1 pago", activo: true, orden: 1, tipoContable: "CREDITO" },
          { nombre: "Crédito 6 cuotas", activo: true, orden: 2, tipoContable: "CREDITO" },
        ],
      },
    },
    include: { modalidades: true },
  });

  // ── Un turno abierto: sin turno el POS no deja registrar ─────────────────
  const usuario = await prisma.usuario.findFirst({ where: { localId: LOCAL_ID } });
  if (!usuario) throw new Error(`no hay usuario del local ${LOCAL_ID}`);

  let turno = await prisma.turno.findFirst({
    where: { localId: LOCAL_ID, cierre: null },
    orderBy: { id: "desc" },
  });
  if (!turno) {
    turno = await prisma.turno.create({
      data: { localId: LOCAL_ID, vendedorId: usuario.id, montoInicial: 10000 },
    });
  }

  // ── STOCK, SIN EL CUAL NO SE PUEDE VENDER ───────────────────────────────
  //
  // Los productos del local ya existen —los dejó la siembra de recepción— pero
  // sin stock: la pantalla contesta "Producto no disponible para la venta" y el
  // carrito queda vacío, así que el botón de cobrar queda deshabilitado y no se
  // puede recorrer nada. Costó una corrida entera descubrirlo.
  const productos = await prisma.productoLocal.findMany({
    where: { localId: LOCAL_ID, activo: true },
    take: 2,
    select: { id: true, baseId: true, precio_venta: true },
  });
  if (productos.length === 0) throw new Error(`el local ${LOCAL_ID} no tiene productos`);

  // OJO: `StockLocal.productoId` referencia **ProductoLocal.id**, no la base.
  for (const p of productos) {
    const existente = await prisma.stockLocal.findFirst({
      where: { localId: LOCAL_ID, productoId: p.id },
    });
    if (existente) {
      await prisma.stockLocal.update({ where: { id: existente.id }, data: { cantidad: 100 } });
    } else {
      await prisma.stockLocal.create({
        data: { localId: LOCAL_ID, productoId: p.id, cantidad: 100 },
      });
    }
  }

  console.log("── sembrado ──");
  console.log(`local            : ${LOCAL_ID} (${local.nombre})`);
  console.log(`usuario          : ${usuario.id} (${usuario.nombre})`);
  console.log(`turno abierto    : ${turno.id}`);
  console.log(`medio EFECTIVO   : ${efectivo.id}`);
  console.log(`medio digital    : ${digital.id} con modalidades ${digital.modalidades.map((m) => m.id).join(", ")}`);
  console.log(`productos con stock: ${productos.map((p) => `${p.id} (base ${p.baseId}, $${p.precio_venta})`).join(" · ")}`);
}

try {
  await principal();
} finally {
  await prisma.$disconnect();
}
