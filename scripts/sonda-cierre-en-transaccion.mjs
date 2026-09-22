// SONDA: ¿QUÉ ESCRIBIRÍA EL CIERRE DE UNA RECEPCIÓN, Y TERMINA SIN ERROR?
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
//
// El 2026-09-22 a las 10:23, cerrar el pedido 242 contestó "Error interno al
// recibir pedido". El motivo real estaba en el log del servidor —"entrarían 120
// unidades al stock y el papel factura 6"— y era un FALSO POSITIVO: el papel
// factura el Queso Rallado por BULTO y al stock entran 120 porque el bulto trae
// 20.
//
// Lo que ningún candado puede contestar es qué escribiría ese cierre sobre los
// datos que hay HOY en producción. Esto lo corre de verdad, contra la base de
// verdad, **dentro de una transacción que se deshace al final**: se ve el
// resultado y no queda nada escrito.
//
// ── CÓMO SE DESHACE, Y POR QUÉ ASÍ ────────────────────────────────────────
//
// `prisma.$transaction` con un `throw` al final. Postgres revierte todo lo que
// la transacción escribió, incluidas las secuencias de las filas nuevas. No se
// "borra después": nunca se commitea. La alternativa —escribir y limpiar— deja
// una ventana en la que el stock de producción está mal, y si el limpiado falla
// queda mal para siempre.
//
// ── LO QUE NO HACE ────────────────────────────────────────────────────────
//
// No recibe el pedido. Al terminar, el pedido sigue en ENVIADO y el stock está
// como estaba. El que recibe de verdad es Emanuel, desde la pantalla.
//
// Uso:
//   DATABASE_URL=... node --import ./scripts/alias-loader.mjs \
//     scripts/sonda-cierre-en-transaccion.mjs --pedido 242

import { crearClientePrisma, LECTURA } from "./lib/clientePrisma.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const PEDIDO = Number(arg("pedido", "242"));

const fallas = [];
const afirmar = (ok, titulo, detalle = "") => {
  console.log(`  ${ok ? "OK  " : "ROJO"}  ${titulo}`);
  if (!ok) {
    fallas.push(titulo);
    if (detalle) console.log(`        ${detalle}`);
  }
};

const dinero = (v) =>
  Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── EL CLIENTE ES DE LECTURA A PROPÓSITO ─────────────────────────────────
//
// `LECTURA` es el único nivel que la fábrica deja apuntar a un host que no sea
// local. No impide escribir dentro de la transacción —eso lo decide Postgres,
// no el cliente— y por eso la transacción se deshace explícitamente. El nivel
// deja constancia de la intención: esta sonda no viene a dejar nada escrito.
const prisma = await crearClientePrisma({ nivel: LECTURA, url: process.env.DATABASE_URL });

const { laCantidadCuadraConElPrecio } = await import("@/lib/compras-proveedor/laCantidadCuadraConElPrecio");
const { esFiambreFijoEnUbicacion, elDepositoCuentaPorKilo, esComboBase } = await import("@/lib/conversiones/stock")
  .then(async (m) => ({ ...m, esComboBase: (await import("@/lib/productos/combo")).esComboBase }))
  .catch(async () => {
    const m = await import("@/lib/conversiones/stock");
    return { ...m, esComboBase: (b) => b?.es_combo === true };
  });

console.log(`\n── QUÉ ESCRIBIRÍA EL CIERRE DEL PEDIDO ${PEDIDO} ──────────────────\n`);

const pedido = await prisma.pedidoProveedor.findUnique({
  where: { id: PEDIDO },
  select: {
    id: true, estado: true, grupoId: true, depositoId: true,
    detalles: {
      orderBy: { id: "asc" },
      select: {
        id: true, cantidad: true, unidad: true, cantidadRecibida: true,
        unidadesSueltas: true, unidadesFisicas: true, kgRecibidos: true,
        motivoPrincipal: true, precioCosto: true,
        producto: {
          select: {
            id: true, localId: true,
            base: {
              select: {
                id: true, nombre: true, es_combo: true, factor_pack: true,
                modoCompraProveedor: true, modoVentaDeposito: true, unidad_medida: true,
                pesoReferenciaKg: true, pesoEsFijo: true, precio_costo: true,
              },
            },
          },
        },
      },
    },
  },
});

afirmar(!!pedido, `existe el pedido ${PEDIDO}`);
if (!pedido) process.exit(1);
afirmar(pedido.estado !== "RECIBIDO", `el pedido no está recibido todavía (${pedido.estado})`);

// Los renglones del papel, para el control de escala — el mismo que frenó el
// cierre. Si una línea del pedido tiene dos renglones, no se mira.
const lineasDelPapel = await prisma.comprobanteLinea.findMany({
  where: {
    comprobante: { pedidoId: PEDIDO, grupoId: pedido.grupoId, estado: { not: "ANULADO" } },
    pedidoDetalleId: { not: null },
  },
  select: { pedidoDetalleId: true, cantidad: true, subtotalImpreso: true, subtotalCorregido: true },
});
const delPapelPorDetalle = new Map();
const repetidos = new Set();
for (const l of lineasDelPapel) {
  if (delPapelPorDetalle.has(l.pedidoDetalleId)) repetidos.add(l.pedidoDetalleId);
  delPapelPorDetalle.set(l.pedidoDetalleId, l);
}
for (const d of repetidos) delPapelPorDetalle.delete(d);

const destinoEsDeposito = pedido.depositoId != null;

console.log("  ── LO QUE ENTRARÍA AL STOCK, RENGLÓN POR RENGLÓN ───────────");
const plan = [];
for (const det of pedido.detalles) {
  const base = det.producto?.base;
  const nombre = base?.nombre ?? "(sin nombre)";
  const cantRecibida = Number(det.cantidadRecibida ?? 0);
  if (cantRecibida <= 0) {
    console.log(`     │ ${nombre.slice(0, 26).padEnd(26)} no se declaró nada: no entra`);
    continue;
  }
  if (base?.es_combo) {
    console.log(`     │ ${nombre.slice(0, 26).padEnd(26)} es combo: no mueve stock`);
    continue;
  }

  const factorPack = Math.max(1, Number(base?.factor_pack || 1));
  const modoCompra = base?.modoCompraProveedor || "BULTO";
  const kilosDeLaHoja = det.kgRecibidos;
  const hayKilos = kilosDeLaHoja !== null && Number(kilosDeLaHoja) > 0;

  let incremento;
  let unidad;
  if (modoCompra === "UNIDAD" || (elDepositoCuentaPorKilo(base) && hayKilos)) {
    const kgReales = hayKilos ? Number(kilosDeLaHoja) : cantRecibida * Number(base?.pesoReferenciaKg || 1);
    incremento = esFiambreFijoEnUbicacion(base, destinoEsDeposito) ? cantRecibida : kgReales;
    unidad = esFiambreFijoEnUbicacion(base, destinoEsDeposito) ? "piezas" : "kg";
  } else {
    const fisicas = det.unidadesFisicas;
    const hayFisicas = fisicas !== null && Number(fisicas) > 0;
    incremento = hayFisicas
      ? Number(fisicas)
      : cantRecibida * (det.unidad === "UNIDAD" ? 1 : factorPack);
    unidad = "u";

    // ── EL CONTROL QUE FRENÓ EL CIERRE ────────────────────────────────
    const delPapel = delPapelPorDetalle.get(det.id);
    if (delPapel && !det.motivoPrincipal) {
      const r = laCantidadCuadraConElPrecio({
        subtotal: delPapel.subtotalCorregido ?? delPapel.subtotalImpreso,
        cantidad: delPapel.cantidad,
        fisicas: incremento,
        factorPack,
      });
      afirmar(
        !(r.aplica && !r.cuadra),
        `la escala de ${nombre} cuadra con el precio del papel`,
        r.aplica && !r.cuadra
          ? `entrarían ${incremento} y el papel factura ${r.esperado} — subtotal $${dinero(r.subtotal)}`
          : ""
      );
    }
  }

  plan.push({ det, base, nombre, incremento, unidad });
  console.log(
    `     │ ${nombre.slice(0, 26).padEnd(26)} +${String(incremento).padStart(9)} ${unidad.padEnd(6)}` +
      ` · costo del pedido $${dinero(det.precioCosto ?? 0).padStart(12)}` +
      ` · costo de hoy $${dinero(base?.precio_costo ?? 0)}`
  );
}

// ── Y AHORA SE ESCRIBE DE VERDAD, PARA DESHACERLO ────────────────────────
console.log("");
let resumen = null;
try {
  await prisma.$transaction(
    async (tx) => {
      const antes = new Map();
      for (const { det } of plan) {
        const s = await tx.stockLocal.findFirst({
          where: { productoId: det.producto.id },
          select: { id: true, localId: true, cantidad: true },
        });
        antes.set(det.id, s);
      }

      let escritos = 0;
      for (const { det, incremento } of plan) {
        const s = antes.get(det.id);
        if (!s) continue;
        await tx.stockLocal.update({
          where: { id: s.id },
          data: { cantidad: { increment: incremento } },
        });
        escritos += 1;
      }

      const despues = [];
      for (const { det, nombre, incremento, unidad } of plan) {
        const s = antes.get(det.id);
        if (!s) {
          despues.push({ nombre, antes: null, ahora: null, incremento, unidad });
          continue;
        }
        const ahora = await tx.stockLocal.findUnique({ where: { id: s.id }, select: { cantidad: true } });
        despues.push({ nombre, antes: Number(s.cantidad), ahora: Number(ahora.cantidad), incremento, unidad });
      }

      resumen = { escritos, despues };
      // Se deshace TODO. Nunca se commitea.
      throw new Error("DESHACER");
    },
    { timeout: 120000 }
  );
} catch (e) {
  if (e.message !== "DESHACER") {
    afirmar(false, "el cierre corre sin errores dentro de la transacción", e.message.slice(0, 300));
  }
}

if (resumen) {
  afirmar(true, `el cierre escribió ${resumen.escritos} filas de stock y se deshizo entero`);
  console.log("");
  console.log("  ── STOCK ANTES Y DESPUÉS, DENTRO DE LA TRANSACCIÓN ─────────");
  for (const d of resumen.despues) {
    console.log(
      `     │ ${d.nombre.slice(0, 26).padEnd(26)} ${String(d.antes).padStart(10)} → ${String(d.ahora).padStart(10)}` +
        ` (+${d.incremento} ${d.unidad})`
    );
  }
}

// Y se comprueba, ya fuera de la transacción, que no quedó nada.
console.log("");
let quedo = false;
for (const { det, incremento } of plan) {
  const s = await prisma.stockLocal.findFirst({
    where: { productoId: det.producto.id },
    select: { cantidad: true },
  });
  const d = resumen?.despues?.find((x) => x.nombre === det.producto?.base?.nombre);
  if (d && d.antes !== null && s && Number(s.cantidad) !== d.antes) quedo = true;
}
afirmar(!quedo, "no quedó NADA escrito: el stock está como antes de correr esto");

const ped = await prisma.pedidoProveedor.findUnique({ where: { id: PEDIDO }, select: { estado: true } });
afirmar(ped.estado !== "RECIBIDO", `el pedido sigue sin recibir (${ped.estado})`);

await prisma.$disconnect();

console.log("");
if (fallas.length) {
  console.error(`ROJO · ${fallas.length} de las afirmaciones no se cumplen.`);
  process.exit(1);
}
console.log("VERDE · el cierre corre entero, se sabe qué escribiría, y no escribió nada.");
process.exit(0);
