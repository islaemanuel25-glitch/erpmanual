// Seed de la PRUEBA MANUAL en TELÉFONO REAL (solo DB aislada). Crea 2 usuarios
// con login real (bcrypt), un local de prueba + local ajeno, y los escenarios
// MOBILE-01..12. Imprime el mapeo (ventaId/numero) para el checklist.
// GUARDA: hace TRUNCATE de todas las tablas. Ver scripts/guardaSeedDestructivo.mjs;
// exige servidor local, base en la lista blanca y SEED_DESTRUCTIVO igual al nombre.
// Uso: SEED_DESTRUCTIVO=erpazul_correccion_test \
//      DATABASE_URL=postgresql://…/erpazul_correccion_test node scripts/mobile-seed.mjs

import { crearClientePrisma, DESTRUCTIVO } from "./lib/clientePrisma.mjs";
import bcrypt from "bcrypt";

const prisma = await crearClientePrisma({ nivel: DESTRUCTIVO });

const PERMS_TESTER = ["reportes.ver", "ventas.corregir_simple", "ventas.corregir_completa", "pos.usar"];
const PERMS_SINCORR = ["reportes.ver", "pos.usar"]; // ve el ticket pero NO puede corregir
const PASS = "OperixTest-2026!";

async function truncate() {
  const rows = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`);
  const n = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (n) await prisma.$executeRawUnsafe(`TRUNCATE ${n} RESTART IDENTITY CASCADE`);
}

async function run() {
  await truncate();
  const hash = await bcrypt.hash(PASS, 10);
  const g = await prisma.grupo.create({ data: { nombre: "Grupo Prueba" } });
  const local = await prisma.local.create({ data: { nombre: "Kiosco Prueba", es_deposito: false } });
  const otro = await prisma.local.create({ data: { nombre: "Sucursal Ajena", es_deposito: false } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: local.id } });
  await prisma.grupoLocal.create({ data: { grupoId: g.id, localId: otro.id } });

  const rolTester = await prisma.rol.create({ data: { nombre: "TesterMobile", permisos: PERMS_TESTER, esSistema: false } });
  const rolSin = await prisma.rol.create({ data: { nombre: "SinCorreccion", permisos: PERMS_SINCORR, esSistema: false } });
  const uTester = await prisma.usuario.create({ data: { nombre: "Tester Mobile", email: "tester.mobile@operix.local", passwordHash: hash, rolId: rolTester.id, localId: local.id, activo: true } });
  const uSin = await prisma.usuario.create({ data: { nombre: "Sin Permiso", email: "nopermiso.mobile@operix.local", passwordHash: hash, rolId: rolSin.id, localId: local.id, activo: true } });

  const cliJuan = await prisma.cliente.create({ data: { grupoId: g.id, localId: local.id, nombre: "Juan Pérez", documento: "20304050" } });
  const cliMaria = await prisma.cliente.create({ data: { grupoId: g.id, localId: local.id, nombre: "María López", documento: "27123456" } });
  await prisma.puntosConfigLocal.create({ data: { grupoId: g.id, localId: local.id, activo: true, reglasJson: { puntosPorPeso: 0.01 } } });

  async function prod(localId, nombre, precio, stock, extra = {}) {
    const base = await prisma.productoBase.create({ data: { grupoId: g.id, nombre, unidad_medida: extra.um || "unidad", precio_costo: 20, precio_venta: precio, es_combo: extra.combo || false, modalidad: extra.modalidad || "NORMAL", recargoServicioDefaultPct: extra.modalidad === "IMPORTE_VARIABLE" ? 0 : null } });
    const pl = await prisma.productoLocal.create({ data: { localId, baseId: base.id, precio_venta: precio } });
    if (!extra.combo && extra.modalidad !== "IMPORTE_VARIABLE") await prisma.stockLocal.create({ data: { localId, productoId: pl.id, cantidad: stock } });
    return { baseId: base.id, plId: pl.id, nombre, precio };
  }

  const Coca = await prod(local.id, "Coca Cola 500ml", 800, 300);
  const Agua = await prod(local.id, "Agua Mineral", 500, 300);
  const Queso = await prod(local.id, "Queso x Kg", 6000, 100, { um: "kg" });
  const Combo = await prod(local.id, "Combo Merienda", 2500, 0, { combo: true });
  const SUBE = await prod(local.id, "Carga SUBE", 0, 0, { modalidad: "IMPORTE_VARIABLE" });
  const Repa = await prod(local.id, "Reparación", 20000, 100);
  const Ajeno = await prod(otro.id, "PROD AJENO (otra sucursal)", 999, 50);
  await prisma.comboComponente.create({ data: { comboProductoLocalId: Combo.plId, comboLocalId: local.id, componenteProductoLocalId: Coca.plId, componenteLocalId: local.id, cantidad: 2 } });
  await prisma.comboComponente.create({ data: { comboProductoLocalId: Combo.plId, comboLocalId: local.id, componenteProductoLocalId: Agua.plId, componenteLocalId: local.id, cantidad: 1 } });

  // 18 productos para el test de scroll.
  const P = [];
  for (let i = 1; i <= 18; i++) P.push(await prod(local.id, `Producto ${String(i).padStart(2, "0")}`, 100 * i, 80));

  const tAbierto = await prisma.turno.create({ data: { localId: local.id, vendedorId: uTester.id, montoInicial: 0 } });
  const tCerrado = await prisma.turno.create({ data: { localId: local.id, vendedorId: uTester.id, montoInicial: 0, cierre: new Date() } });

  let num = 0;
  async function venta({ turnoId, cliente = null, fiado = false, fecha, detalles }) {
    num++;
    const total = detalles.reduce((a, d) => a + d.precio * d.cantidad, 0);
    const v = await prisma.venta.create({ data: { localId: local.id, vendedorId: uTester.id, turnoId, numero: 100 + num, clienteId: cliente, subtotal: total, total, formaPago: fiado ? "fiado" : "efectivo", esFiado: fiado, version: 0, fecha: fecha || new Date() } });
    for (const d of detalles) {
      const det = await prisma.ventaDetalle.create({ data: { ventaId: v.id, productoBaseId: d.baseId, nombre: d.nombre, precio: d.precio, precioCosto: 20, cantidad: d.cantidad, subtotal: d.precio * d.cantidad, productoLocalId: d.legacy ? null : (d.plId ?? null), cantidadStock: d.legacy ? null : (d.cs ?? d.cantidad) } });
      if (d.componentes) for (const c of d.componentes) await prisma.ventaDetalleComponente.create({ data: { ventaDetalleId: det.id, productoBaseId: c.baseId, productoLocalId: c.plId, cantidad: c.cantidad } });
    }
    await prisma.ventaPago.create({ data: { ventaId: v.id, medio: fiado ? "FIADO" : "EFECTIVO", monto: total, neto: total } });
    if (fiado && cliente) await prisma.movimientoCuenta.create({ data: { grupoId: g.id, localId: local.id, clienteId: cliente, tipo: "VENTA", direccion: "DEBITO", monto: total, ventaId: v.id, correccionId: 0 } });
    return { id: v.id, numero: v.numero, total };
  }
  const L = (p, cantidad, cs) => ({ baseId: p.baseId, plId: p.plId, nombre: p.nombre, precio: p.precio, cantidad, cs: cs ?? cantidad });
  const comboL = { baseId: Combo.baseId, plId: null, nombre: "Combo Merienda", precio: 2500, cantidad: 1, cs: null, componentes: [{ baseId: Coca.baseId, plId: Coca.plId, cantidad: 2 }, { baseId: Agua.baseId, plId: Agua.plId, cantidad: 1 }] };

  const M = {};
  // MOBILE-01 fullscreen + botón atrás (cliente Juan, con puntos suficientes)
  M["MOBILE-01"] = await venta({ turnoId: tAbierto.id, cliente: cliJuan.id, detalles: [L(Coca, 2), L(Agua, 3), comboL] });
  await prisma.clientePuntoMovimiento.create({ data: { grupoId: g.id, localId: local.id, clienteId: cliJuan.id, direccion: "CREDITO", tipo: "ACREDITACION", puntos: 56, ventaId: M["MOBILE-01"].id, correccionId: 0 } });
  // MOBILE-02 teclado (incluye línea decimal: Queso 0.5)
  M["MOBILE-02"] = await venta({ turnoId: tAbierto.id, detalles: [L(Coca, 2), L(Queso, 0.5)] });
  // MOBILE-03 scroll 18 líneas
  M["MOBILE-03"] = await venta({ turnoId: tAbierto.id, detalles: P.map((p) => L(p, 1)) });
  // MOBILE-04 agregar productos (normal/peso/combo/servicio ya existen en el local)
  M["MOBILE-04"] = await venta({ turnoId: tAbierto.id, detalles: [L(Coca, 2), comboL] });
  // MOBILE-05 pago mixto (total 13.200 → 8.000 + 5.200)
  M["MOBILE-05"] = await venta({ turnoId: tAbierto.id, detalles: [L(Coca, 9), L(Agua, 12)] });
  // MOBILE-06 diferencia a devolver (100.000 → 80.000)
  M["MOBILE-06"] = await venta({ turnoId: tAbierto.id, detalles: [L(Repa, 5)] });
  // MOBILE-07 fiada (traslado de deuda / simple no cambia cliente)
  M["MOBILE-07"] = await venta({ turnoId: tAbierto.id, cliente: cliJuan.id, fiado: true, detalles: [L(Coca, 2)] });
  // MOBILE-08 puntos FAIL-CLOSED (María saldo 0)
  M["MOBILE-08"] = await venta({ turnoId: tAbierto.id, cliente: cliMaria.id, detalles: [L(Coca, 3)] });
  await prisma.clientePuntoMovimiento.create({ data: { grupoId: g.id, localId: local.id, clienteId: cliMaria.id, direccion: "CREDITO", tipo: "ACREDITACION", puntos: 24, ventaId: M["MOBILE-08"].id, correccionId: 0 } });
  await prisma.clientePuntoMovimiento.create({ data: { grupoId: g.id, localId: local.id, clienteId: cliMaria.id, direccion: "DEBITO", tipo: "CANJE", puntos: 24, ventaId: null, correccionId: 0 } });
  // MOBILE-09 reimprimir/PDF/compartir
  M["MOBILE-09"] = await venta({ turnoId: tAbierto.id, cliente: cliJuan.id, detalles: [L(Coca, 2), L(Agua, 2)] });
  // MOBILE-10 rendimiento
  M["MOBILE-10"] = await venta({ turnoId: tAbierto.id, detalles: [L(Coca, 4)] });
  // MOBILE-11 conectividad/idempotencia
  M["MOBILE-11"] = await venta({ turnoId: tAbierto.id, detalles: [L(Coca, 2), L(Agua, 1)] });
  // MOBILE-12 bloqueos: turno cerrado / fuera de ventana / legacy
  M["MOBILE-12a-turnoCerrado"] = await venta({ turnoId: tCerrado.id, detalles: [L(Coca, 1)] });
  M["MOBILE-12b-fueraVentana"] = await venta({ turnoId: tAbierto.id, fecha: new Date(Date.now() - 40 * 86400000), detalles: [L(Coca, 1)] });
  M["MOBILE-12c-legacy"] = await venta({ turnoId: tAbierto.id, detalles: [{ baseId: Coca.baseId, plId: null, nombre: "Coca Cola 500ml", precio: 800, cantidad: 2, legacy: true }] });

  console.log(JSON.stringify({
    localId: local.id, otroLocalId: otro.id, grupoId: g.id,
    usuarios: { tester: "tester.mobile@operix.local", sinPermiso: "nopermiso.mobile@operix.local", password: PASS },
    clientes: { juan: cliJuan.id, maria: cliMaria.id },
    escenarios: M,
  }, null, 2));
  await prisma.$disconnect();
}
run().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
