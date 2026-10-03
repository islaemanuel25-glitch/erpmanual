// UN MISMO COBRO, UNA SOLA VENTA — contra PostgreSQL, por el handler real.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/cobroIdempotente.mjs
//
// La pantalla conserva el `clientTxnId` de un cobro entre reintentos
// (lib/pos-ventas/intentoCobro.js). Acá se prueba la otra mitad: que el
// servidor resuelve cada reintento con UNA sola venta, incluso cuando dos
// pedidos con el mismo id llegan a la vez y uno choca contra el índice único
// —antes ése volvía como "Error de concurrencia"—, y que nada de eso abre una
// puerta a la caja de otro operador (DEC-0012).
//
// Cada caso se mide por la huella completa del local: ventas, pagos, stock,
// movimientos de stock y de caja. Siembra sus datos con una marca y los borra.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const { crearProductoVendible } = await import("./fixturePos.mjs");
const { firmarTokenOperador, OperadorCookie } = await import("../../lib/operador.js");
const { esChoqueDeClientTxnId } = await import("../../lib/pos-ventas/idempotenciaVenta.js");
const { retenerCandadoDelLocal, esperarEnCandadoDelLocal } = await import("./carreraForzada.mjs");

const rutaAbrir = await import("../../app/api/pos-ventas/turnos/abrir/route.js");
const rutaCerrar = await import("../../app/api/pos-ventas/turnos/cerrar/route.js");
const rutaCrearVenta = await import("../../app/api/pos-ventas/crear/route.js");

let pasadas = 0;
const fallas = [];
let seccionActual = "";
const seccion = (t) => { seccionActual = t; console.log(`\n── ${t} ${"─".repeat(Math.max(0, 64 - t.length))}`); };
function ok(t, c, d = "") {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`[${seccionActual}] ${t} — ${d || "falló"}`); console.log(`  ✗ ${t} — ${d || "falló"}`); }
}
const igual = (t, o, e) =>
  ok(t, JSON.stringify(o) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtenido ${JSON.stringify(o)}`);
function requerir(t, c, d = "") {
  ok(t, c, d);
  if (!c) throw new Error(`requisito: ${t} — ${d}`);
}

const SECRETO = process.env.AUTH_SECRET;
const sesionDe = (usuario, localId) =>
  jwt.sign({ id: usuario.id, nombre: usuario.nombre, email: usuario.email, localId, permisos: ["pos.usar"] }, SECRETO, { expiresIn: "1h" });
const cookies = ({ sesion, operador = null }) =>
  [`erpazul_sesion=${sesion}`, operador ? `${OperadorCookie.nombre}=${operador}` : null].filter(Boolean).join("; ");
const pedido = (url, quien, cuerpo) => {
  const req = new Request(url, {
    method: "POST",
    headers: { cookie: cookies(quien), "content-type": "application/json" },
    body: JSON.stringify(cuerpo ?? {}),
  });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
};
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const BASE = "http://ci/api/pos-ventas";

const marca = `ci-cobro-idempotente-${Date.now()}`;
const creado = { grupoId: null, localIds: [], usuarioIds: [], operadorIds: [], rolId: null };

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: ["pos.usar"] } });
  creado.rolId = rol.id;
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  const local = await prisma.local.create({ data: { nombre: `${marca}-local`, tipo: "local" } });
  creado.localIds.push(local.id);
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador: true, allowNegativeStock: true } });
  const cuenta = await prisma.usuario.create({
    data: { nombre: `${marca}-cuenta`, email: `${marca}@ci.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
  });
  creado.usuarioIds.push(cuenta.id);
  const operador = async (sufijo) => {
    const op = await prisma.operadorLocal.create({ data: { nombre: `${marca}-${sufijo}`, pinHash: "x" } });
    creado.operadorIds.push(op.id);
    await prisma.operadorEnLocal.create({ data: { operadorId: op.id, localId: local.id } });
    return op;
  };
  const opA = await operador("a");
  const opB = await operador("b");
  const producto = await crearProductoVendible(prisma, {
    grupoId: grupo.id, localId: local.id, nombre: `${marca}-producto`, precioVenta: 1000, precioCosto: 600, stock: 1000,
  });
  // Un cliente del local y los puntos activos: la venta de la carrera acredita
  // puntos DESPUÉS de su transacción, y eso también tiene que pasar una sola vez.
  const cliente = await prisma.cliente.create({ data: { grupoId: grupo.id, localId: local.id, nombre: `${marca}-cliente` } });
  await prisma.puntosConfigLocal.create({
    data: { grupoId: grupo.id, localId: local.id, activo: true, reglasJson: { puntosPorPeso: 0.01 } },
  });
  const sesion = sesionDe(cuenta, local.id);
  const pin = (op) => firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: local.id });
  return { local, producto, cliente, opA, opB, A: { sesion, operador: pin(opA) }, B: { sesion, operador: pin(opB) } };
}

async function desmontar() {
  if (!creado.grupoId) return;
  const localIds = creado.localIds;
  const turnos = (await prisma.turno.findMany({ where: { localId: { in: localIds } }, select: { id: true } })).map((t) => t.id);
  await prisma.auditoriaBitacora.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.ventaDetalleComponente.deleteMany({ where: { ventaDetalle: { venta: { localId: { in: localIds } } } } });
  await prisma.clientePuntoMovimiento.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.ventaDetalle.deleteMany({ where: { venta: { localId: { in: localIds } } } });
  await prisma.ventaPago.deleteMany({ where: { venta: { localId: { in: localIds } } } });
  await prisma.venta.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.cambioPendiente.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.cierrePreparacion.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.arqueoCaja.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.turno.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.stockLocal.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.productoLocal.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.productoBase.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.posVentaCounter.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.puntosConfigLocal.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.cliente.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: { in: localIds } } });
  await prisma.operadorEnLocal.deleteMany({ where: { operadorId: { in: creado.operadorIds } } });
  await prisma.operadorLocal.deleteMany({ where: { id: { in: creado.operadorIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creado.usuarioIds } } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.local.deleteMany({ where: { id: { in: localIds } } });
  await prisma.grupo.deleteMany({ where: { id: creado.grupoId } });
  await prisma.rol.deleteMany({ where: { id: creado.rolId } });
}

async function correr() {
  const f = await montar();
  const abrir = async (quien) => leer(await rutaAbrir.POST(pedido(`${BASE}/turnos/abrir`, quien, { montoInicial: 1000 })));
  /** El pedido que manda la pantalla al cobrar online, con el id del intento. */
  const cobrar = async (quien, turnoId, clientTxnId, { cantidad = 1, clienteId = null } = {}) =>
    leer(await rutaCrearVenta.POST(pedido(`${BASE}/crear`, quien, {
      clientTxnId,
      localId: f.local.id,
      turnoId,
      clienteId,
      formaPago: "EFECTIVO",
      items: [{
        productoBaseId: f.producto.baseId, nombre: "Producto de prueba", precio: 1000, cantidad,
        precioCosto: 600, esServicio: false, importeBaseServicio: null, subtotalFijado: null,
      }],
      pagos: [{ medio: "EFECTIVO", monto: 1000 * cantidad }],
    })));
  /**
   * Todo lo que una venta escribe, en el local entero: dentro de su transacción
   * —venta, líneas, pagos, stock, movimiento del Libro de Stock, comisión,
   * transferencia de una venta interna, contador de número— y después de ella,
   * la acreditación de puntos. Más los movimientos de caja, que una venta no crea.
   */
  const huella = async () => {
    const totales = await prisma.venta.aggregate({
      where: { localId: f.local.id },
      _sum: { comisionBancaria: true },
    });
    const puntos = await prisma.clientePuntoMovimiento.aggregate({
      where: { localId: f.local.id },
      _count: { _all: true },
      _sum: { puntos: true },
    });
    return {
      ventas: await prisma.venta.count({ where: { localId: f.local.id } }),
      detalles: await prisma.ventaDetalle.count({ where: { venta: { localId: f.local.id } } }),
      pagos: await prisma.ventaPago.count({ where: { venta: { localId: f.local.id } } }),
      stock: Number((await prisma.stockLocal.findFirst({
        where: { localId: f.local.id, productoId: f.producto.productoLocalId }, select: { cantidad: true },
      }))?.cantidad ?? NaN),
      movimientosStock: await prisma.movimientoStock.count({ where: { localId: f.local.id } }),
      movimientosCaja: await prisma.cajaMovimiento.count({ where: { turno: { localId: f.local.id } } }),
      comisiones: Number(totales._sum.comisionBancaria ?? 0),
      transferencias: await prisma.transferencia.count({ where: { venta: { localId: f.local.id } } }),
      contador: (await prisma.posVentaCounter.findUnique({ where: { localId: f.local.id } }))?.ultimoNumero ?? null,
      movimientosPuntos: puntos._count._all,
      puntos: Number(puntos._sum.puntos ?? 0),
    };
  };

  /**
   * LA CARRERA, FORZADA. `crear` toma `pg_advisory_xact_lock(localId)` al
   * empezar su transacción, DESPUÉS de la consulta de idempotencia. Esta prueba
   * toma ese mismo candado desde otra sesión, lanza los pedidos y espera —
   * mirando `pg_locks`, no con un tiempo fijo— a que TODOS estén bloqueados ahí.
   * En ese punto todos ya pasaron la consulta temprana sin encontrar la venta,
   * porque mientras el candado está tomado nadie puede crearla. Al soltarlo, el
   * primero la crea y cada uno de los demás choca contra el índice único: no hay
   * otro camino por el que puedan terminar como duplicado.
   */
  async function conCarreraForzada(esperados, lanzar) {
    const candado = await retenerCandadoDelLocal(prisma, f.local.id);
    let pedidos = [];
    let esperando = 0;
    try {
      pedidos = lanzar();
      esperando = await esperarEnCandadoDelLocal(prisma, f.local.id, esperados);
    } finally {
      await candado.soltar();
    }
    return { esperando, respuestas: await Promise.all(pedidos) };
  }

  /** Los choques de `clientTxnId` que el handler registró en su `catch`. */
  async function contandoChoques(fn) {
    const original = console.error;
    let choques = 0;
    console.error = (...args) => {
      if (args[0] === "Error crear venta POS:" && esChoqueDeClientTxnId(args[1])) choques += 1;
      else original(...args);
    };
    try {
      const resultado = await fn();
      return { ...resultado, choques };
    } finally {
      console.error = original;
    }
  }
  const ventasDe = (txn) => prisma.venta.count({ where: { clientTxnId: txn } });

  const abreA = await abrir(f.A);
  requerir("A abre su caja", abreA.ok === true, `${abreA.status} ${abreA.error ?? ""}`);
  const abreB = await abrir(f.B);
  requerir("B abre su caja", abreB.ok === true, `${abreB.status} ${abreB.error ?? ""}`);
  const turnoA = abreA.turno.id;
  const turnoB = abreB.turno.id;

  // ═════════════════════════════════════════════════════════════════════════
  seccion("1. Un cobro, una venta; la respuesta perdida y los reintentos");

  const h0 = await huella();
  const txn1 = `${marca}-cobro-1`;
  const r1 = await cobrar(f.A, turnoA, txn1);
  ok("el cobro crea la venta", r1.ok === true && r1.isDuplicate !== true, `${r1.status} ${r1.error ?? ""}`);
  const h1 = await huella();
  igual("una venta, un pago, un movimiento de stock", [h1.ventas - h0.ventas, h1.pagos - h0.pagos, h1.movimientosStock - h0.movimientosStock], [1, 1, 1]);

  // El servidor creó la venta y la respuesta no llegó: la pantalla reintenta con
  // el MISMO id, varias veces.
  for (let i = 1; i <= 5; i++) {
    const r = await cobrar(f.A, turnoA, txn1);
    ok(`reintento ${i}: la misma venta, como duplicado`, r.ok === true && r.isDuplicate === true && r.ventaId === r1.ventaId,
      `${r.status} ${r.error ?? ""} venta ${r.ventaId}`);
  }
  igual("los reintentos no escribieron nada", await huella(), h1);
  igual("una sola venta con ese id", await ventasDe(txn1), 1);

  const txn2 = `${marca}-cobro-2`;
  const r2 = await cobrar(f.A, turnoA, txn2);
  ok("la venta siguiente, con id nuevo, es otra venta", r2.ok === true && r2.isDuplicate !== true && r2.ventaId !== r1.ventaId,
    `${r2.status} ${r2.error ?? ""}`);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("2. Reintentos simultáneos con el mismo id");

  // Cuatro pedidos con el mismo id, CON cliente y puntos activos, retenidos en
  // el candado de `crear` hasta que están todos ahí (conCarreraForzada).
  const N = 4;
  const antesCarrera = await huella();
  const txnCarrera = `${marca}-carrera`;
  const carrera = await contandoChoques(() =>
    conCarreraForzada(N, () => Array.from({ length: N }, () => cobrar(f.A, turnoA, txnCarrera, { clienteId: f.cliente.id }))));
  requerir(`los ${N} pedidos quedaron bloqueados en el candado de crear, después de la consulta temprana`,
    carrera.esperando === N, `bloqueados: ${carrera.esperando}`);
  const { respuestas } = carrera;
  const creadas = respuestas.filter((r) => r.ok === true && r.isDuplicate !== true);
  const duplicadas = respuestas.filter((r) => r.ok === true && r.isDuplicate === true);
  igual("una crea, las demás reciben la misma venta como duplicado", [creadas.length, duplicadas.length], [1, N - 1]);
  ok("todas apuntan a la misma venta", new Set(respuestas.map((r) => r.ventaId)).size === 1,
    JSON.stringify(respuestas.map((r) => [r.status, r.ventaId, r.error])));
  // La prueba de que se ejerció el camino nuevo: cada duplicado salió de un
  // choque real contra el índice único, registrado por el `catch` del handler.
  igual("cada duplicado salió de un choque real de clientTxnId (P2002)", carrera.choques, N - 1);

  const despuesCarrera = await huella();
  const ventaCarrera = await prisma.venta.findUnique({ where: { clientTxnId: txnCarrera }, select: { numero: true } });
  igual("efectos de UNA venta, dentro y fuera de su transacción", {
    ventas: despuesCarrera.ventas - antesCarrera.ventas,
    detalles: despuesCarrera.detalles - antesCarrera.detalles,
    pagos: despuesCarrera.pagos - antesCarrera.pagos,
    stock: antesCarrera.stock - despuesCarrera.stock,
    movimientosStock: despuesCarrera.movimientosStock - antesCarrera.movimientosStock,
    movimientosCaja: despuesCarrera.movimientosCaja - antesCarrera.movimientosCaja,
    comisiones: despuesCarrera.comisiones - antesCarrera.comisiones,
    transferencias: despuesCarrera.transferencias - antesCarrera.transferencias,
    movimientosPuntos: despuesCarrera.movimientosPuntos - antesCarrera.movimientosPuntos,
    puntos: despuesCarrera.puntos - antesCarrera.puntos,
  }, {
    ventas: 1, detalles: 1, pagos: 1, stock: 1, movimientosStock: 1, movimientosCaja: 0,
    comisiones: 0, transferencias: 0, movimientosPuntos: 1, puntos: 10,
  });
  igual("el número de venta avanzó uno, y el contador quedó en ese número", [ventaCarrera?.numero, despuesCarrera.contador],
    [antesCarrera.contador + 1, antesCarrera.contador + 1]);
  igual("una sola venta con ese id", await ventasDe(txnCarrera), 1);

  // El mismo id hacia DOS cajas a la vez, con la carrera forzada: A en la suya,
  // B en la suya, los dos bloqueados después de la consulta temprana. Uno crea;
  // el otro choca contra el índice, y como la venta ganadora es de OTRA caja,
  // el choque NO se convierte en duplicado: vuelve como conflicto, sin escribir.
  const antesCruce = await huella();
  const txnCruce = `${marca}-cruce`;
  const cruce = await contandoChoques(() =>
    conCarreraForzada(2, () => [cobrar(f.A, turnoA, txnCruce), cobrar(f.B, turnoB, txnCruce)]));
  requerir("los 2 pedidos quedaron bloqueados en el candado", cruce.esperando === 2, `bloqueados: ${cruce.esperando}`);
  const [rA, rB] = cruce.respuestas;
  const ganadora = await prisma.venta.findUnique({ where: { clientTxnId: txnCruce }, select: { id: true, turnoId: true } });
  const perdedora = ganadora?.turnoId === turnoA ? rB : rA;
  ok("el mismo id en dos cajas: una venta, en la caja de quien ganó", (await ventasDe(txnCruce)) === 1 && [turnoA, turnoB].includes(ganadora?.turnoId));
  igual("hubo un choque real de clientTxnId", cruce.choques, 1);
  ok("la otra caja NO recibe la venta ajena: conflicto 409", perdedora.ok !== true && perdedora.status === 409 && perdedora.isDuplicate !== true,
    `${perdedora.status} ${perdedora.error ?? ""} ${perdedora.ventaId ?? ""}`);
  igual("y no escribe nada más que esa venta", (await huella()).ventas - antesCruce.ventas, 1);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("3. Un P2002 de otra restricción no es un reintento");

  // La forma REAL de los dos únicos de Venta, medida acá mismo, en una
  // transacción que se revierte.
  const formas = {};
  const ROLLBACK = new Error("rollback");
  for (const caso of ["clientTxnId", "numero"]) {
    try {
      await prisma.$transaction(async (tx) => {
        const base = { localId: f.local.id, vendedorId: creado.usuarioIds[0], subtotal: 1, total: 1, formaPago: "efectivo" };
        await tx.venta.create({ data: { ...base, numero: 990001, clientTxnId: `${marca}-forma-a` } });
        try {
          await tx.venta.create({
            data: caso === "clientTxnId"
              ? { ...base, numero: 990002, clientTxnId: `${marca}-forma-a` }
              : { ...base, numero: 990001, clientTxnId: `${marca}-forma-b` },
          });
        } catch (e) {
          formas[caso] = e;
        }
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  }
  ok("el choque de clientTxnId se reconoce", formas.clientTxnId?.code === "P2002" && esChoqueDeClientTxnId(formas.clientTxnId),
    JSON.stringify(formas.clientTxnId?.meta));
  ok("el choque del número de venta NO se reconoce como reintento",
    formas.numero?.code === "P2002" && !esChoqueDeClientTxnId(formas.numero), JSON.stringify(formas.numero?.meta));

  // ═════════════════════════════════════════════════════════════════════════
  seccion("4. La idempotencia no abre la caja de otro (DEC-0012)");

  const antesB = await huella();
  const rBconIdDeA = await cobrar(f.B, turnoA, txn1);
  ok("B con el id de una venta de A, hacia la caja de A: recibe esa venta, no escribe",
    rBconIdDeA.isDuplicate === true && rBconIdDeA.ventaId === r1.ventaId, `${rBconIdDeA.status} ${rBconIdDeA.error ?? ""}`);
  const rBnuevaEnA = await cobrar(f.B, turnoA, `${marca}-b-en-a`);
  ok("B con un id nuevo hacia la caja de A: rechazado", rBnuevaEnA.ok !== true && rBnuevaEnA.status === 403,
    `${rBnuevaEnA.status} ${rBnuevaEnA.error ?? ""}`);
  igual("B no escribió nada en ningún lado", await huella(), antesB);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("5. Caja cerrada: rechazo, salvo la venta que YA existe");

  const cierre = await leer(await rutaCerrar.POST(pedido(`${BASE}/turnos/cerrar`, f.A, { turnoId: turnoA, montoRealEfectivo: 1000 })));
  requerir("A cierra su caja", cierre.ok === true, `${cierre.status} ${cierre.error ?? ""}`);
  const antesCerrada = await huella();
  const rNuevaCerrada = await cobrar(f.A, turnoA, `${marca}-en-cerrada`);
  ok("una venta nueva en la caja cerrada: rechazada", rNuevaCerrada.ok !== true && rNuevaCerrada.status === 403,
    `${rNuevaCerrada.status} ${rNuevaCerrada.error ?? ""}`);
  const rReintentoCerrada = await cobrar(f.A, turnoA, txn1);
  ok("el reintento de una venta que ya existe en esa caja: duplicado", rReintentoCerrada.isDuplicate === true && rReintentoCerrada.ventaId === r1.ventaId,
    `${rReintentoCerrada.status} ${rReintentoCerrada.error ?? ""}`);
  igual("la caja cerrada no recibió nada", await huella(), antesCerrada);
}

let fallo = null;
try {
  await correr();
} catch (e) {
  fallo = e;
  if (!String(e.message).startsWith("requisito:")) console.error(e);
} finally {
  await desmontar().catch((e) => console.error("[desmontar]", e));
  await prisma.$disconnect();
}

console.log(`\n${pasadas} afirmaciones en verde, ${fallas.length} en rojo.`);
if (fallas.length || fallo) {
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
