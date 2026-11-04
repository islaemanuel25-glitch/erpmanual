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
//   C. COMPRA de 1 cartón: recibirla suma 200 al depósito.
//   D. PEDIDOS SUGERIDOS: faltan 400 sueltos, se sugieren 2 cartones (no 40).
//   E. AJUSTE y LÍMITES en "unidades + sueltos": fijar 9 atados y 15 sueltos
//      deja 195; el mínimo y el máximo se guardan en sueltos.
//   F. CONTEO de un control en "unidades + sueltos": contar 9 atados y 15
//      sueltos sobre 200 da 5 sueltos de diferencia, valorizados a $60 cada uno
//      (el costo del suelto), no a $1.200.
//   G. CÓMO SE ESCRIBE el stock por el listado real: "1 cartón" en el
//      depósito, "9 atados y 15 sueltos" en el local.
//   H. EL POS: el buscador del local devuelve el atado y su gemelo " · suelto"
//      con el precio del cigarrillo; el del depósito, uno solo. Vender el
//      suelto con el carrito y el payload reales descuenta 1 y cobra $100.
//      Escanear el código agrega el atado. Sin `conSueltos` y sin el dato, uno.
//
// Las contrapruebas de C a F son un pack igual SIN sueltos: rechaza la forma
// nueva, acepta la cantidad como hoy, y su diferencia vale $1.200 por unidad.
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

  // ── Un producto SIN sueltos, para las contrapruebas de abajo: el mismo
  // cartón de 10, sin tercer nivel. Lo que acepta tiene que ser lo de hoy.
  const baseSin = await c.productoBase.create({
    data: {
      grupoId: grupo.id, nombre: "Pack sin sueltos", unidad_medida: "pack", factor_pack: FACTOR,
      modo_envio: "MIXTO", precio_costo: 12000, precio_venta: 15000, redondeo_100: false, activo: true,
    },
  });
  const plSin = await c.productoLocal.create({ data: { localId: local.id, baseId: baseSin.id, nombre: baseSin.nombre, activo: true } });
  await c.stockLocal.create({ data: { localId: local.id, productoId: plSin.id, cantidad: 200 } });

  // ══════════════════════════════════════════════════════════════════════════
  seccion("C. Compra a proveedor de 1 cartón (lo que quedó sin verificar en la tanda 5)");
  // ══════════════════════════════════════════════════════════════════════════
  const rutaRecibir = await import("../../app/api/compras-proveedor/recibir/[id]/route.js");
  const proveedor = await c.proveedor.create({ data: { nombre: "Proveedor de prueba" } });
  const pedidoCompra = await c.pedidoProveedor.create({
    data: {
      grupoId: grupo.id, depositoId: deposito.id, creadoEnLocalId: deposito.id, proveedorId: proveedor.id, estado: "ENVIADO",
      detalles: { create: [{ productoLocalId: plDeposito.id, cantidad: 1, unidad: "BULTO", precioCosto: 12000 }] },
    },
    include: { detalles: { select: { id: true } } },
  });
  const detCompra = pedidoCompra.detalles[0].id;
  const [antesCompra] = await stock(deposito.id, plDeposito.id);
  const rCompra = await leer(await rutaRecibir.POST(
    new Request(`http://ci/api/compras-proveedor/recibir/${pedidoCompra.id}`, {
      method: "POST", headers: cabeceras(deposito.id),
      body: JSON.stringify({
        recibidos: { [detCompra]: 1 },
        costosExcluidos: [detCompra],
        pagoAlProveedor: { estado: "PENDIENTE", totalAPagar: "12000", totalConfirmado: true },
      }),
    }),
    { params: Promise.resolve({ id: String(pedidoCompra.id) }) }
  ));
  ok("recibir la compra", rCompra.status === 200 && rCompra.ok === true, `${rCompra.status} ${rCompra.error || ""}`);
  const [despuesCompra] = await stock(deposito.id, plDeposito.id);
  igual("recibir 1 cartón suma 200 al depósito", despuesCompra - antesCompra, 200);
  const congeladoCompra = await c.pedidoProveedorDetalle.findUnique({ where: { id: detCompra }, select: { stockIngresado: true } });
  igual("y stockIngresado dice lo que sumó", n(congeladoCompra.stockIngresado), 200);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("D. Pedidos sugeridos con sueltos");
  // ══════════════════════════════════════════════════════════════════════════
  const rutaSugeridos = await import("../../app/api/pos-transferencias/sugeridos/route.js");
  // El local tiene 300 sueltos (15 atados) y un máximo de 700 (35 atados):
  // faltan 400 sueltos, que son 2 cartones de 200. Sin sueltos serían 40.
  await c.stockLocal.update({ where: { localId_productoId: { localId: local.id, productoId: plLocal.id } }, data: { stockMax: 700 } });
  igual("el local tiene 300 sueltos", (await stock(local.id, plLocal.id))[0], 300);
  const sug = await leer(await rutaSugeridos.GET(new Request(`http://ci/api/pos-transferencias/sugeridos?destinoId=${local.id}&posId=999999`, {
    method: "GET", headers: cabeceras(local.id),
  })));
  const itemSug = (sug.items || []).find((i) => i.baseId === base.id);
  igual("faltan 400 sueltos: sugiere 2 cartones, no 40", [itemSug?.sugeridoCantidad, itemSug?.sugeridoUnidad], [2, "BULTO"]);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("E. Ajuste y límites cargados en unidades + sueltos");
  // ══════════════════════════════════════════════════════════════════════════
  const rutaAjustar = await import("../../app/api/stock_locales/ajustar/route.js");
  const { MOTIVO_DIFERENCIA } = await import("../../lib/stock/motivosDeDiferencia.js");
  const ajustar = async (productoLocalId, cuerpo) =>
    leer(await rutaAjustar.POST(new Request("http://ci/api/stock_locales/ajustar", {
      method: "POST", headers: cabeceras(local.id),
      body: JSON.stringify({ modo: "ajuste", localId: local.id, productoLocalId, ...cuerpo }),
    })));

  const aj = await ajustar(plLocal.id, { tipo: "fijar", unidades: 9, sueltos: 15, motivoPrincipal: MOTIVO_DIFERENCIA.FALTANTE });
  ok("ajustar a 9 atados y 15 sueltos", aj.status === 200 && aj.ok === true, `${aj.status} ${aj.error || ""}`);
  igual("deja 195 sueltos", (await stock(local.id, plLocal.id))[0], 195);

  const lim = await leer(await rutaAjustar.POST(new Request("http://ci/api/stock_locales/ajustar", {
    method: "POST", headers: cabeceras(local.id),
    body: JSON.stringify({ modo: "limites", localId: local.id, productoLocalId: plLocal.id, motivo: "prueba", nuevoMin: { unidades: 2, sueltos: 0 }, nuevoMax: { unidades: 30, sueltos: 5 } }),
  })));
  ok("fijar límites en unidades + sueltos", lim.status === 200 && lim.ok === true, `${lim.status} ${lim.error || ""}`);
  const filaLim = await c.stockLocal.findUnique({ where: { localId_productoId: { localId: local.id, productoId: plLocal.id } } });
  igual("mínimo 2 atados = 40, máximo 30 atados y 5 = 605", [n(filaLim.stockMin), n(filaLim.stockMax)], [40, 605]);

  // Contraprueba: el producto SIN sueltos no acepta la forma nueva, y sigue
  // aceptando la cantidad como hoy.
  const ajSin = await ajustar(plSin.id, { tipo: "fijar", unidades: 9, sueltos: 15, motivoPrincipal: MOTIVO_DIFERENCIA.FALTANTE });
  igual("sin sueltos, \"unidades + sueltos\" se rechaza", ajSin.status, 400);
  igual("y no tocó el stock", (await stock(local.id, plSin.id))[0], 200);
  const ajSinHoy = await ajustar(plSin.id, { tipo: "restar", cantidad: 5, motivoPrincipal: MOTIVO_DIFERENCIA.FALTANTE });
  ok("sin sueltos, la cantidad de siempre se acepta", ajSinHoy.status === 200, `${ajSinHoy.status} ${ajSinHoy.error || ""}`);
  igual("y resta 5, como siempre", (await stock(local.id, plSin.id))[0], 195);
  await ajustar(plSin.id, { tipo: "sumar", cantidad: 5, motivoPrincipal: MOTIVO_DIFERENCIA.SOBRANTE });

  // ══════════════════════════════════════════════════════════════════════════
  seccion("F. Conteo en unidades + sueltos, valorizado al costo del suelto");
  // ══════════════════════════════════════════════════════════════════════════
  const rutaAbrir = await import("../../app/api/stock_locales/control/abrir/route.js");
  const rutaConteos = await import("../../app/api/stock_locales/control/conteos/route.js");
  const rutaDiferencias = await import("../../app/api/stock_locales/control/diferencias/route.js");
  // Empezar y leer el control lo hace la cuenta sin PIN; contar, con el PIN de
  // un operador. Es la regla del control, no de esta prueba.
  const pedirControl = async (ruta, metodo, url, body, { conPin = true } = {}) => {
    const req = new Request(url, { method: metodo, headers: cabeceras(local.id, conPin ? opLocal : null), ...(body ? { body: JSON.stringify(body) } : {}) });
    Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
    return leer(await ruta[metodo](req));
  };
  const B = "http://ci/api/stock_locales/control";

  // El sistema dice 200 (10 atados): se suman 5 a los 195.
  await ajustar(plLocal.id, { tipo: "sumar", cantidad: 5, motivoPrincipal: MOTIVO_DIFERENCIA.SOBRANTE });
  igual("el sistema dice 200", (await stock(local.id, plLocal.id))[0], 200);

  const abierto = await pedirControl(rutaAbrir, "POST", `${B}/abrir`, undefined, { conPin: false });
  ok("abrir el control", abierto.status === 200, `${abierto.status} ${abierto.error || ""}`);
  const conteo = await pedirControl(rutaConteos, "PUT", `${B}/conteos`, { productoLocalId: plLocal.id, unidades: 9, sueltos: 15 });
  ok("contar 9 atados y 15 sueltos", conteo.status === 200 && conteo.ok === true, `${conteo.status} ${conteo.error || ""}`);
  igual("el stock pasa a lo contado: 195", (await stock(local.id, plLocal.id))[0], 195);

  // Contraprueba: el mismo pack sin sueltos, contado en 195 sobre 200, vale
  // 1.200 por unidad. Lo que cambia la plata es el dato, nada más.
  const conteoSin = await pedirControl(rutaConteos, "PUT", `${B}/conteos`, { productoLocalId: plSin.id, total: 195 });
  ok("contar el pack sin sueltos con el total de siempre", conteoSin.status === 200, `${conteoSin.status} ${conteoSin.error || ""}`);
  const conteoSinNuevo = await pedirControl(rutaConteos, "PUT", `${B}/conteos`, { productoLocalId: plSin.id, unidades: 9, sueltos: 15 });
  igual("y el sin sueltos rechaza la forma nueva", conteoSinNuevo.status, 400);

  const dif = await pedirControl(rutaDiferencias, "GET", `${B}/diferencias`, undefined, { conPin: false });
  ok("leer las diferencias", dif.status === 200, `${dif.status} ${dif.error || ""}`);
  const fila = (dif.filas || []).find((f) => f.productoLocalId === plLocal.id);
  igual("con sueltos: diferencia de 5 sueltos, a $60 cada uno, $300", [fila?.diferencia, fila?.costoUnitario, fila?.importe], [-5, 60, -300]);
  const filaSin = (dif.filas || []).find((f) => f.productoLocalId === plSin.id);
  igual("sin sueltos: la misma diferencia vale $1.200 cada una", [filaSin?.diferencia, filaSin?.costoUnitario, filaSin?.importe], [-5, 1200, -6000]);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("G. Cómo se escribe el stock, por el listado real");
  // ══════════════════════════════════════════════════════════════════════════
  // La ficha con sus nombres, como la va a cargar la tanda 9.
  await c.productoBase.update({ where: { id: base.id }, data: { nombre_bulto: "cartón" } });
  const rutaListar = await import("../../app/api/stock_locales/listar/route.js");
  const { presentacionCantidadStock } = await import("../../lib/stock/presentacion.js");
  const listar = async (localId, q) => {
    const url = `http://ci/api/stock_locales/listar?localId=${localId}&q=${encodeURIComponent(q)}`;
    const req = new Request(url, { method: "GET", headers: cabeceras(localId) });
    Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
    return leer(await rutaListar.GET(req));
  };
  const itemDe = (r, baseId) => (r.items || []).find((i) => i.baseId === baseId);

  // Se fijan los números del caso: 200 en el depósito, 195 en el local.
  const filaDep = await c.stockLocal.findUnique({ where: { localId_productoId: { localId: deposito.id, productoId: plDeposito.id } } });
  await c.stockLocal.update({ where: { id: filaDep.id }, data: { cantidad: 200, enTransito: 0 } });

  const enDeposito = itemDe(await listar(deposito.id, "Cigarrillos"), base.id);
  igual("el listado trae los sueltos y los nombres de la ficha", [enDeposito?.sueltosPorUnidad, enDeposito?.nombreUnidad, enDeposito?.nombreBulto], [SUELTOS, "atado", "cartón"]);
  igual("200 en el depósito se escribe \"1 cartón\"", presentacionCantidadStock(enDeposito, true).texto, "1 cartón");
  const enLocal = itemDe(await listar(local.id, "Cigarrillos"), base.id);
  igual("195 en el local se escribe \"9 atados y 15 sueltos\"", presentacionCantidadStock(enLocal, false).texto, "9 atados y 15 sueltos");

  // Contraprueba: el pack sin sueltos, por el mismo listado, se escribe como hoy.
  const sinEnLocal = itemDe(await listar(local.id, "Pack sin"), baseSin.id);
  igual("el pack sin sueltos, como hoy", presentacionCantidadStock(sinEnLocal, false).texto, "195 uds");

  // ══════════════════════════════════════════════════════════════════════════
  seccion("H. El POS: el suelto como un resultado más del buscador");
  // ══════════════════════════════════════════════════════════════════════════
  // El buscador real del POS pide `conSueltos=1`; la línea del carrito la arma
  // el reducer real con el resultado que eligió el cajero, y lo que se manda es
  // `itemsCrearPayload`, lo mismo que manda la pantalla.
  await c.productoBase.update({ where: { id: base.id }, data: { codigo_barra: "7790000000017" } });
  const rutaBuscar = await import("../../app/api/pos-ventas/buscar-producto/route.js");
  const { posVentaReducer, ActionTypes, initialState } = await import("../../app/modulos/pos-ventas/reducer/posVentaReducer.js");
  const { itemsCrearPayload } = await import("../../lib/pos-ventas/payloadVenta.js");
  const buscar = async (localId, q, { conSueltos = true } = {}) => {
    const url = `http://ci/api/pos-ventas/buscar-producto?localId=${localId}&q=${encodeURIComponent(q)}${conSueltos ? "&conSueltos=1" : ""}`;
    return leer(await rutaBuscar.GET(new Request(url, { method: "GET", headers: cabeceras(localId) })));
  };
  const nombres = (r, baseId) => (r.items || []).filter((i) => i.productoBaseId === baseId).map((i) => i.nombre);

  const enElLocal = await buscar(local.id, "Cigarrillos");
  igual("en el local, dos resultados: el atado y el suelto",
    nombres(enElLocal, base.id), ["Cigarrillos de prueba", "Cigarrillos de prueba · suelto"]);
  const gemelo = (enElLocal.items || []).find((i) => i.esSuelto === true);
  igual("el suelto trae el precio del cigarrillo y el mismo stock", [gemelo?.precioVenta, gemelo?.stock], [100, 195]);
  igual("en el depósito, uno solo", nombres(await buscar(deposito.id, "Cigarrillos"), base.id), ["Cigarrillos de prueba"]);

  // Vender el resultado suelto: el carrito real, el payload real, la ruta real.
  const carrito = posVentaReducer(initialState, { type: ActionTypes.ADD_ITEM, payload: { producto: gemelo } }).carrito;
  igual("la línea del carrito va en modo SUELTO, se llama \" · suelto\" y cobra 100",
    [carrito[0]?.modoVentaLinea, carrito[0]?.nombre, carrito[0]?.precio], ["SUELTO", "Cigarrillos de prueba · suelto", 100]);
  const vPos = await leer(await rutaVenta.POST(new Request("http://ci/api/pos-ventas/crear", {
    method: "POST",
    headers: cabeceras(local.id, opLocal),
    body: JSON.stringify({
      clientTxnId: `tercer-nivel-pos-${++nVenta}`, localId: local.id, turnoId: turnoLocal.id, formaPago: "efectivo", totalPantalla: 100,
      pagos: [{ medio: "EFECTIVO", monto: 100 }],
      items: itemsCrearPayload(carrito),
    }),
  })));
  ok("vender el resultado suelto: la venta se registra", vPos.status === 200 && vPos.ok === true, `${vPos.status} ${vPos.error || ""}`);
  igual("descuenta 1", await stock(local.id, plLocal.id), [194, 0]);
  const dPos = await detalleDe(vPos.ventaId);
  igual("y cobra el precio del suelto", [n(dPos?.precio), n(dPos?.cantidadStock)], [100, 1]);

  // Escanear el código agrega el atado, nunca el suelto.
  const escaneo = await buscar(local.id, "7790000000017");
  igual("escanear el código devuelve solo el atado", nombres(escaneo, base.id), ["Cigarrillos de prueba"]);
  const lineaEscaneada = posVentaReducer(initialState, { type: ActionTypes.ADD_ITEM, payload: { producto: escaneo.items?.[0] } }).carrito[0];
  igual("y la línea que agrega es la de siempre", lineaEscaneada?.modoVentaLinea, "NORMAL");

  // Contrapruebas: sin `conSueltos` (ofertas, combos, consumo, corrección) y el
  // pack sin sueltos dan un solo resultado, como hoy.
  igual("sin conSueltos, uno solo", nombres(await buscar(local.id, "Cigarrillos", { conSueltos: false }), base.id), ["Cigarrillos de prueba"]);
  igual("el pack sin sueltos, uno solo", nombres(await buscar(local.id, "Pack sin"), baseSin.id), ["Pack sin sueltos"]);
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
