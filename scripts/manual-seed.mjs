// Seed de escenario para la PRUEBA MANUAL guiada (DB aislada). Crea, en un mismo
// local con turno ABIERTO, ventas corregibles + casos de bloqueo, y un local
// AJENO con su propia venta (para verificar que el buscador NO cruza locales).
// Imprime IDs + cookies (JWT admin + contexto) para el driver CDP.
// GUARDA: hace TRUNCATE de todas las tablas. Ver scripts/guardaSeedDestructivo.mjs;
// exige servidor local, base en la lista blanca y SEED_DESTRUCTIVO igual al nombre.
// Uso: SEED_DESTRUCTIVO=erpazul_correccion_test AUTH_SECRET=<.env> \
//      DATABASE_URL=postgresql://…/erpazul_correccion_test node scripts/manual-seed.mjs

import { crearClientePrisma, DESTRUCTIVO } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";

const AUTH_SECRET = process.env.AUTH_SECRET;
const prisma = await crearClientePrisma({ nivel: DESTRUCTIVO });

async function truncate() {
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const n = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (n) await prisma.$executeRawUnsafe(`TRUNCATE ${n} RESTART IDENTITY CASCADE`);
}

async function run() {
  await truncate();
  const rol = await prisma.rol.create({ data: { nombre: "Admin", permisos: ["*"] } });
  const g = await prisma.grupo.create({ data: { nombre: "Grupo" } });
  const local = await prisma.local.create({ data: { nombre: "Kiosco Centro", es_deposito: false } });
  const otro = await prisma.local.create({ data: { nombre: "Sucursal Norte", es_deposito: false } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: otro.id } });
  const admin = await prisma.usuario.create({ data: { nombre: "Dueño", email: "d@t.test", passwordHash: "x", rolId: rol.id } });
  const cli1 = await prisma.cliente.create({ data: { grupoId: g.id, localId: local.id, nombre: "Juan Pérez", documento: "20304050" } });
  const cli2 = await prisma.cliente.create({ data: { grupoId: g.id, localId: local.id, nombre: "María López", documento: "27123456" } });
  await prisma.puntosConfigLocal.create({ data: { grupoId: g.id, localId: local.id, activo: true, reglasJson: { puntosPorPeso: 0.01 } } });

  async function prod(localId, nombre, stock, extra = {}) {
    const base = await prisma.productoBase.create({ data: { grupoId: g.id, nombre, unidad_medida: extra.um || "unidad", precio_costo: 20, precio_venta: extra.precio || 100, es_combo: extra.combo || false, modalidad: extra.modalidad || "NORMAL", recargoServicioDefaultPct: extra.recargo ?? null, modoVentaDeposito: extra.mvd || "PESO", pesoReferenciaKg: extra.pref ?? null } });
    const pl = await prisma.productoLocal.create({ data: { localId, baseId: base.id, precio_venta: extra.precio || 100 } });
    if (!extra.combo && extra.modalidad !== "IMPORTE_VARIABLE") await prisma.stockLocal.create({ data: { localId, productoId: pl.id, cantidad: stock } });
    return { baseId: base.id, plId: pl.id, nombre };
  }

  // Productos del LOCAL (mismo local): normal, peso/decimal, combo, servicio.
  const A = await prod(local.id, "Coca Cola 500ml", 50, { precio: 800 });
  const B = await prod(local.id, "Agua Mineral", 40, { precio: 500 });
  const Q = await prod(local.id, "Queso x Kg", 30, { precio: 6000, um: "kg" }); // por peso/decimal
  const C = await prod(local.id, "Combo Merienda", 0, { combo: true, precio: 2500 });
  const Srv = await prod(local.id, "Carga SUBE", 0, { modalidad: "IMPORTE_VARIABLE", recargo: 0 });
  await prisma.comboComponente.create({ data: { comboProductoLocalId: C.plId, comboLocalId: local.id, componenteProductoLocalId: A.plId, componenteLocalId: local.id, cantidad: 2 } });
  await prisma.comboComponente.create({ data: { comboProductoLocalId: C.plId, comboLocalId: local.id, componenteProductoLocalId: B.plId, componenteLocalId: local.id, cantidad: 1 } });

  // Producto del OTRO local (para verificar que el buscador no lo trae).
  const Z = await prod(otro.id, "PRODUCTO SUCURSAL NORTE", 10, { precio: 999 });

  const tAbierto = await prisma.turno.create({ data: { localId: local.id, vendedorId: admin.id, montoInicial: 0 } });
  const tCerrado = await prisma.turno.create({ data: { localId: local.id, vendedorId: admin.id, montoInicial: 0, cierre: new Date() } });

  async function venta({ numero, turnoId, cliente, fiado, total, detalles, fecha }) {
    const v = await prisma.venta.create({ data: { localId: local.id, vendedorId: admin.id, turnoId, numero, clienteId: cliente ?? null, subtotal: total, total, formaPago: fiado ? "fiado" : "efectivo", esFiado: !!fiado, version: 0, fecha: fecha || new Date() } });
    for (const d of detalles) {
      const det = await prisma.ventaDetalle.create({ data: { ventaId: v.id, productoBaseId: d.baseId, nombre: d.nombre, precio: d.precio, precioCosto: 20, cantidad: d.cantidad, subtotal: d.precio * d.cantidad, productoLocalId: d.plId ?? null, cantidadStock: d.cs ?? null } });
      if (d.componentes) for (const c of d.componentes) await prisma.ventaDetalleComponente.create({ data: { ventaDetalleId: det.id, productoBaseId: c.baseId, productoLocalId: c.plId, cantidad: c.cantidad } });
    }
    await prisma.ventaPago.create({ data: { ventaId: v.id, medio: fiado ? "FIADO" : "EFECTIVO", monto: total, neto: total } });
    if (fiado && cliente) await prisma.movimientoCuenta.create({ data: { grupoId: g.id, localId: local.id, clienteId: cliente, tipo: "VENTA", direccion: "DEBITO", monto: total, ventaId: v.id, correccionId: 0 } });
    return v;
  }

  // V1 CORREGIBLE (turno abierto): Coca x2 + Agua x3 + Combo x1. total 800*2+500*3+2500=5600.
  const v1 = await venta({ numero: 101, turnoId: tAbierto.id, cliente: cli1.id, total: 5600, detalles: [
    { baseId: A.baseId, plId: A.plId, nombre: "Coca Cola 500ml", precio: 800, cantidad: 2, cs: 2 },
    { baseId: B.baseId, plId: B.plId, nombre: "Agua Mineral", precio: 500, cantidad: 3, cs: 3 },
    { baseId: C.baseId, plId: null, nombre: "Combo Merienda", precio: 2500, cantidad: 1, cs: null, componentes: [{ baseId: A.baseId, plId: A.plId, cantidad: 2 }, { baseId: B.baseId, plId: B.plId, cantidad: 1 }] },
  ] });
  await prisma.clientePuntoMovimiento.create({ data: { grupoId: g.id, localId: local.id, clienteId: cli1.id, direccion: "CREDITO", tipo: "ACREDITACION", puntos: 56, ventaId: v1.id, correccionId: 0 } });

  // V2 FIADA (turno abierto): Queso 0.5kg. total 3000.
  const v2 = await venta({ numero: 102, turnoId: tAbierto.id, cliente: cli1.id, fiado: true, total: 3000, detalles: [{ baseId: Q.baseId, plId: Q.plId, nombre: "Queso x Kg", precio: 6000, cantidad: 0.5, cs: 0.5 }] });

  // V3 turno CERRADO.
  const v3 = await venta({ numero: 103, turnoId: tCerrado.id, cliente: cli1.id, total: 800, detalles: [{ baseId: A.baseId, plId: A.plId, nombre: "Coca Cola 500ml", precio: 800, cantidad: 1, cs: 1 }] });

  // V4 fuera de ventana (40 días).
  const hace40 = new Date(Date.now() - 40 * 86400000);
  const v4 = await venta({ numero: 104, turnoId: tAbierto.id, total: 800, fecha: hace40, detalles: [{ baseId: A.baseId, plId: A.plId, nombre: "Coca Cola 500ml", precio: 800, cantidad: 1, cs: 1 }] });

  // V5 LEGACY (cs null).
  const v5 = await venta({ numero: 105, turnoId: tAbierto.id, total: 1600, detalles: [{ baseId: A.baseId, plId: null, nombre: "Coca Cola 500ml", precio: 800, cantidad: 2, cs: null }] });

  const token = jwt.sign({ id: admin.id, rolId: rol.id, permisos: ["*"], esDuenoLocal: true }, AUTH_SECRET, { expiresIn: "8h" });
  const contexto = encodeURIComponent(JSON.stringify({ localId: local.id }));

  console.log(JSON.stringify({
    localId: local.id, otroLocalId: otro.id, grupoId: g.id,
    cli1: cli1.id, cli2: cli2.id,
    ventas: { corregible: v1.id, fiada: v2.id, turnoCerrado: v3.id, fueraVentana: v4.id, legacy: v5.id },
    productos: { coca: A.baseId, agua: B.baseId, queso: Q.baseId, combo: C.baseId, servicio: Srv.baseId, ajeno: Z.baseId },
    token, contexto,
  }, null, 2));
  await prisma.$disconnect();
}
run().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
