// EL TERCER NIVEL DE EMPAQUE, DE PUNTA A PUNTA, CONTRA LAS RUTAS REALES Y POSTGRESQL.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/tercerNivelEmpaque.mjs
//
// Cartón → atado → cigarrillo (docs/roadmap/tercer-nivel-empaque.md). Hoy ningún
// producto tiene `sueltos_por_unidad`, así que este camino no lo recorre nadie
// en el uso real: esta prueba es la única que lo ejerce entero. Lo que los
// candados puros no pueden ver —que las rutas, las consultas y los triggers del
// libro hacen lo que las piezas prometen— se mira acá, en la base:
//
//   A. VENTA en un local: 1 suelto descuenta 1 y cobra el precio del suelto que
//      pone el servidor; 1 atado descuenta 20. En el depósito, 1 cartón
//      descuenta 200. Cada venta congela N = 20, y anularlas devuelve el stock
//      EXACTO. El suelto se rechaza en el depósito sin tocar nada.
//   B. TRANSFERENCIA de 1 cartón del depósito al local: el envío descuenta 200
//      y congela N; confirmar suma 200 al local y limpia el tránsito; cancelar
//      otra devuelve 200. Una transferencia vieja, sin N congelado, se lee × 1.
//      Una línea "suelta" no se puede enviar.
//
// ── POR QUÉ UNA BASE DESCARTABLE Y NO UNA TRANSACCIÓN QUE SE REVIERTE ──────
//
// Las rutas usan su propio cliente y abren sus propias transacciones: no hay
// forma de envolverlas en una externa que se revierta. Lo equivalente es lo que
// hacen las demás pruebas de base: una base creada con las migraciones del
// árbol, donde el producto se fabrica, y que se BORRA al terminar pase lo que
// pase. No queda nada, en ninguna base. Nivel ESCRITURA: host local y NODE_ENV
// distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;
const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");
const { abrirTurnoDePrueba, crearOperadorDeCaja } = await import("./fixturePos.mjs");

let pasadas = 0;
const fallas = [];
function ok(titulo, condicion, detalle = "") {
  if (condicion) {
    pasadas += 1;
    console.log(`  ✓ ${titulo}`);
    return;
  }
  const m = `${titulo}${detalle ? ` — ${detalle}` : ""}`;
  fallas.push(m);
  console.log(`  ✗ ${m}`);
}
const igual = (t, o, e) => ok(t, JSON.stringify(o) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtenido ${JSON.stringify(o)}`);
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`);

const NOMBRE = "erpazul_tercer_nivel_prueba";
const urlPrueba = (() => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${NOMBRE}`;
  return u.toString();
})();

// El cartón: 10 atados de 20 cigarrillos. $12.000 de costo el cartón, el atado
// se vende a $1.500 y el cigarrillo suelto, en el local, a $100.
const FACTOR = 10;
const SUELTOS = 20;

let c = null;
try {
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`);
  await principal.$executeRawUnsafe(`CREATE DATABASE "${NOMBRE}"`);
  const urlPsql = (() => {
    const u = new URL(urlPrueba);
    u.search = "";
    return u.toString();
  })();
  aplicarMigraciones(urlPsql);
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlPrueba });

  // ── Siembra ─────────────────────────────────────────────────────────────
  const grupo = await c.grupo.create({ data: { nombre: "Tercer nivel" } });
  await c.configuracionGrupo.create({ data: { grupoId: grupo.id } });
  const deposito = await c.local.create({ data: { nombre: "Depósito", es_deposito: true } });
  const local = await c.local.create({ data: { nombre: "Local" } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  for (const l of [deposito, local]) {
    await c.configuracionLocal.create({ data: { localId: l.id, exigirOperador: false } });
  }
  const rol = await c.rol.create({ data: { nombre: "CI tercer nivel", permisos: ["*"] } });
  const usuario = await c.usuario.create({
    data: { nombre: "CI tercer nivel", email: "ci-tercer-nivel@ci.local", passwordHash: "x", rolId: rol.id, localId: local.id },
  });

  // El producto de tres niveles, con la forma que la ficha le va a dar en la
  // tanda 9: `sueltos_por_unidad` y `nombre_unidad` en la ficha, el precio del
  // suelto en la ubicación que lo vende.
  const base = await c.productoBase.create({
    data: {
      grupoId: grupo.id, nombre: "Cigarrillos de prueba", unidad_medida: "pack", factor_pack: FACTOR,
      modo_envio: "MIXTO", sueltos_por_unidad: SUELTOS, nombre_unidad: "atado",
      precio_costo: 12000, precio_venta: 15000, redondeo_100: false, activo: true,
    },
  });
  const plLocal = await c.productoLocal.create({
    data: { localId: local.id, baseId: base.id, nombre: base.nombre, activo: true, precio_venta: 15000, precio_venta_suelto: 100 },
  });
  const plDeposito = await c.productoLocal.create({
    data: { localId: deposito.id, baseId: base.id, nombre: base.nombre, activo: true, precio_venta: 15000 },
  });
  // El stock en SUELTOS: 5 atados en el local, 2 cartones en el depósito.
  await c.stockLocal.create({ data: { localId: local.id, productoId: plLocal.id, cantidad: 5 * SUELTOS } });
  await c.stockLocal.create({ data: { localId: deposito.id, productoId: plDeposito.id, cantidad: 2 * FACTOR * SUELTOS } });

  // El cliente de la app se construye al importarse: recién ahora.
  process.env.DATABASE_URL = urlPrueba;
  const rutaVenta = await import("../../app/api/pos-ventas/crear/route.js");
  const rutaAnular = await import("../../app/api/pos-ventas/venta/[id]/anular/route.js");
  const rutaRevisar = await import("../../app/api/transferencias/revisar-producto/route.js");
  const rutaConfirmar = await import("../../app/api/transferencias/confirmar-recepcion/route.js");
  const rutaCancelar = await import("../../app/api/transferencias/cancelar/route.js");
  const { crearTransferencia, DESCONTAR_Y_TRANSITO } = await import("../../lib/transferencias/crearTransferencia.js");
  const { firmarTokenOperador, OperadorCookie } = await import("../../lib/operador.js");

  const sesion = (localId) =>
    jwt.sign(
      { id: usuario.id, nombre: "CI tercer nivel", email: "ci@local", localId, grupoId: grupo.id, permisos: ["*"] },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    );
  const cabeceras = (localId, operador = null) => {
    const partes = [`erpazul_sesion=${sesion(localId)}`];
    if (operador) partes.push(`${OperadorCookie.nombre}=${firmarTokenOperador({ operadorId: operador.id, nombre: operador.nombre, localId })}`);
    return { cookie: partes.join("; "), "content-type": "application/json" };
  };
  const leer = async (res) => ({ status: res.status, ...(await res.json().catch(() => ({}))) });

  const stock = async (localId, productoId) => {
    const s = await c.stockLocal.findUnique({ where: { localId_productoId: { localId, productoId } } });
    return s ? [Number(s.cantidad), Number(s.enTransito)] : null;
  };

  // Una caja con operador en cada ubicación: toda venta lleva el PIN.
  const opLocal = await crearOperadorDeCaja(c, { localId: local.id, nombre: "Operador local" });
  const opDeposito = await crearOperadorDeCaja(c, { localId: deposito.id, nombre: "Operador depósito" });
  const turnoLocal = await abrirTurnoDePrueba(c, { localId: local.id, vendedorId: usuario.id, operadorId: opLocal.id });
  const turnoDeposito = await abrirTurnoDePrueba(c, { localId: deposito.id, vendedorId: usuario.id, operadorId: opDeposito.id });

  let nVenta = 0;
  const vender = async ({ localId, turno, operador, item, total }) =>
    leer(await rutaVenta.POST(new Request("http://ci/api/pos-ventas/crear", {
      method: "POST",
      headers: cabeceras(localId, operador),
      body: JSON.stringify({
        clientTxnId: `tercer-nivel-${++nVenta}`, localId, turnoId: turno.id, formaPago: "efectivo", totalPantalla: total,
        pagos: [{ medio: "EFECTIVO", monto: total }],
        items: [{ productoBaseId: base.id, nombre: base.nombre, esServicio: false, ...item }],
      }),
    })));
  const anular = async (ventaId, localId) => {
    const venta = await c.venta.findUnique({ where: { id: ventaId }, select: { version: true } });
    return leer(await rutaAnular.POST(
      new Request(`http://ci/api/pos-ventas/venta/${ventaId}/anular`, {
        method: "POST", headers: cabeceras(localId),
        body: JSON.stringify({ motivo: "Prueba de CI del tercer nivel de empaque", version: venta.version }),
      }),
      { params: Promise.resolve({ id: String(ventaId) }) }
    ));
  };
  const detalleDe = (ventaId) =>
    c.ventaDetalle.findFirst({ where: { ventaId }, select: { precio: true, precioCosto: true, cantidad: true, cantidadStock: true, sueltosPorUnidadCongelado: true } });
  const n = (d) => (d == null ? null : Number(d));

  // ══════════════════════════════════════════════════════════════════════════
  seccion("A. Venta en las tres escalas, y su anulación");
  // ══════════════════════════════════════════════════════════════════════════
  igual("el local arranca con 5 atados (100 sueltos)", await stock(local.id, plLocal.id), [100, 0]);

  // El navegador manda un precio y un costo cualquiera: los pone el servidor.
  const vSuelto = await vender({
    localId: local.id, turno: turnoLocal, operador: opLocal, total: 100,
    item: { modoVentaLinea: "SUELTO", cantidad: 1, precio: 1, precioCosto: 9999 },
  });
  ok("1 suelto: la venta se registra", vSuelto.status === 200 && vSuelto.ok === true, `${vSuelto.status} ${vSuelto.error || ""}`);
  igual("1 suelto descuenta 1", await stock(local.id, plLocal.id), [99, 0]);
  const dSuelto = await detalleDe(vSuelto.ventaId);
  igual("cobra el precio del suelto de la ubicación y cuesta el atado ÷ 20, no lo que mandó el navegador",
    [n(dSuelto?.precio), n(dSuelto?.precioCosto)], [100, 60]);
  igual("congela N = 20 y descontó 1", [n(dSuelto?.cantidadStock), dSuelto?.sueltosPorUnidadCongelado], [1, 20]);

  const vAtado = await vender({
    localId: local.id, turno: turnoLocal, operador: opLocal, total: 1500,
    item: { modoVentaLinea: "NORMAL", cantidad: 1, precio: 1500, precioCosto: 1200 },
  });
  ok("1 atado: la venta se registra", vAtado.status === 200 && vAtado.ok === true, `${vAtado.status} ${vAtado.error || ""}`);
  igual("1 atado descuenta 20", await stock(local.id, plLocal.id), [79, 0]);
  const dAtado = await detalleDe(vAtado.ventaId);
  igual("congela N = 20 y descontó 20", [n(dAtado?.cantidadStock), dAtado?.sueltosPorUnidadCongelado], [20, 20]);

  igual("el depósito arranca con 2 cartones (400 sueltos)", await stock(deposito.id, plDeposito.id), [400, 0]);
  const vCarton = await vender({
    localId: deposito.id, turno: turnoDeposito, operador: opDeposito, total: 12000,
    item: { modoVentaLinea: "NORMAL", cantidad: 1, precio: 12000, precioCosto: 12000 },
  });
  ok("1 cartón en el depósito: la venta se registra", vCarton.status === 200 && vCarton.ok === true, `${vCarton.status} ${vCarton.error || ""}`);
  igual("1 cartón descuenta 200", await stock(deposito.id, plDeposito.id), [200, 0]);

  const vSueltoDeposito = await vender({
    localId: deposito.id, turno: turnoDeposito, operador: opDeposito, total: 100,
    item: { modoVentaLinea: "SUELTO", cantidad: 1, precio: 100, precioCosto: 60 },
  });
  igual("el depósito no vende sueltos: 400 con su código", [vSueltoDeposito.status, vSueltoDeposito.code], [400, "SUELTO_EN_DEPOSITO"]);
  igual("y no tocó el stock", await stock(deposito.id, plDeposito.id), [200, 0]);

  for (const [titulo, v, localId] of [["el suelto", vSuelto, local.id], ["el atado", vAtado, local.id], ["el cartón", vCarton, deposito.id]]) {
    const r = await anular(v.ventaId, localId);
    ok(`anular ${titulo}`, r.status === 200 && r.ok === true, `${r.status} ${r.error || ""}`);
  }
  igual("anuladas las dos del local, vuelve EXACTO a 100", await stock(local.id, plLocal.id), [100, 0]);
  igual("anulado el cartón, el depósito vuelve EXACTO a 400", await stock(deposito.id, plDeposito.id), [400, 0]);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("B. Transferencia de 1 cartón: crear, confirmar y cancelar");
  // ══════════════════════════════════════════════════════════════════════════
  const origen = await c.productoLocal.findUnique({ where: { id: plDeposito.id }, include: { base: true } });
  const enviar = (items) =>
    c.$transaction(async (tx) => (await crearTransferencia({
      tx, origenId: deposito.id, destinoId: local.id, creadoPorId: usuario.id,
      politicaStockOrigen: DESCONTAR_Y_TRANSITO,
      items: items.map((i) => ({ baseId: base.id, productoLocalOrigenId: plDeposito.id, productoLocalOrigen: origen, factorPack: FACTOR, ...i })),
    })).transferencia);
  const recibir = async (t) => {
    const dets = await c.transferenciaDetalle.findMany({ where: { transferenciaId: t.id }, orderBy: { id: "asc" } });
    for (const d of dets) {
      const r = await leer(await rutaRevisar.POST(new Request("http://ci/api/transferencias/revisar-producto", {
        method: "POST", headers: cabeceras(local.id),
        body: JSON.stringify({ transferenciaId: t.id, detalleId: d.id, recibido: Number(d.cantidad) }),
      })));
      if (r.status !== 200) return r;
    }
    return leer(await rutaConfirmar.POST(new Request("http://ci/api/transferencias/confirmar-recepcion", {
      method: "POST", headers: cabeceras(local.id), body: JSON.stringify({ transferenciaId: t.id }),
    })));
  };
  const cancelar = async (t) =>
    leer(await rutaCancelar.POST(new Request("http://ci/api/transferencias/cancelar", {
      method: "POST", headers: cabeceras(deposito.id),
      body: JSON.stringify({ transferenciaId: t.id, motivo: "Prueba de CI: el remito salió por error" }),
    })));
  const detalleTransferencia = (t) =>
    c.transferenciaDetalle.findFirst({ where: { transferenciaId: t.id }, select: { id: true, cantidad: true, unidadEnviada: true, sueltosPorUnidadCongelado: true } });

  const t1 = await enviar([{ cantidad: 1, unidadEnviada: "BULTO" }]);
  igual("enviar 1 cartón descuenta 200 y los pone en tránsito", await stock(deposito.id, plDeposito.id), [200, 200]);
  const d1 = await detalleTransferencia(t1);
  igual("la línea viaja como 1 BULTO con N = 20 congelado", [n(d1.cantidad), d1.unidadEnviada, d1.sueltosPorUnidadCongelado], [1, "BULTO", 20]);
  const r1 = await recibir(t1);
  ok("confirmar la recepción", r1.status === 200 && r1.ok === true, `${r1.status} ${r1.error || ""}`);
  igual("el local suma 200 (10 atados)", await stock(local.id, plLocal.id), [300, 0]);
  igual("y el tránsito del depósito queda en cero", await stock(deposito.id, plDeposito.id), [200, 0]);

  const t2 = await enviar([{ cantidad: 1, unidadEnviada: "BULTO" }]);
  igual("otra de 1 cartón: el depósito queda en 0 con 200 en tránsito", await stock(deposito.id, plDeposito.id), [0, 200]);
  const r2 = await cancelar(t2);
  ok("cancelarla", r2.status === 200 && r2.ok === true, `${r2.status} ${r2.error || ""}`);
  igual("cancelada, el depósito vuelve EXACTO a 200 sin tránsito", await stock(deposito.id, plDeposito.id), [200, 0]);

  // Una unidad suelta (1 atado) también viaja: son 20 sueltos.
  const t3 = await enviar([{ cantidad: 1, unidadEnviada: "UNIDAD" }]);
  igual("1 atado enviado descuenta 20", await stock(deposito.id, plDeposito.id), [180, 20]);
  const r3 = await cancelar(t3);
  ok("cancelar el atado", r3.status === 200, `${r3.status} ${r3.error || ""}`);
  igual("y vuelve a 200", await stock(deposito.id, plDeposito.id), [200, 0]);

  // ── CONTRAPRUEBAS ────────────────────────────────────────────────────────
  // 1. Una transferencia vieja, de antes de la columna: sin N congelado se lee
  //    × 1. Se fabrica borrándole el N a una línea recién enviada; el envío
  //    descontó 200 y la cancelación devuelve 10 (1 bulto × 10 × 1). Que el
  //    número cambie con la columna es lo que prueba que la cancelación lee el
  //    N CONGELADO y no el de la ficha.
  const t4 = await enviar([{ cantidad: 1, unidadEnviada: "BULTO" }]);
  const d4 = await detalleTransferencia(t4);
  await c.transferenciaDetalle.update({ where: { id: d4.id }, data: { sueltosPorUnidadCongelado: null } });
  const r4 = await cancelar(t4);
  ok("cancelar la línea sin N", r4.status === 200, `${r4.status} ${r4.error || ""}`);
  igual("sin N congelado devuelve 10, no 200: se leyó × 1", await stock(deposito.id, plDeposito.id), [10, 190]);

  // 2. Una línea suelta no se manda.
  let rechazo = null;
  try { await enviar([{ cantidad: 1, unidadEnviada: "SUELTO" }]); } catch (e) { rechazo = e.code; }
  igual("enviar un suelto se rechaza antes de escribir", rechazo, "UNIDAD_ENVIADA_INVALIDA");
} catch (e) {
  fallas.push(`la prueba se cayó: ${e?.stack || e}`);
  console.log(`  ✗ la prueba se cayó: ${e?.stack || e}`);
} finally {
  await c?.$disconnect().catch(() => {});
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${NOMBRE}" WITH (FORCE)`).catch(() => {});
  await principal.$disconnect();
}

console.log(`\n${pasadas} afirmaciones en verde, ${fallas.length} en rojo.`);
if (fallas.length) {
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
