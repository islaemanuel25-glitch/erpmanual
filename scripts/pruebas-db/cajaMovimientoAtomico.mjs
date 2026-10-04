// CAJA +/− Y EL CORTE O EL CIERRE NO SE CRUZAN — contra PostgreSQL, con los
// handlers reales y las carreras FORZADAS (scripts/pruebas-db/carreraForzada.mjs).
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/cajaMovimientoAtomico.mjs
//
// El caso que la motivó (hallado en #132): `caja-movimientos/crear` validaba el
// turno sin tomar nada e insertaba el movimiento aparte, sin transacción. Un
// corte (`cierres/iniciar`) o un cierre (`turnos/cerrar`) que confirmaba en el
// medio dejaba el movimiento adentro de un turno ya cortado o cerrado, FUERA de
// su efectivo esperado.
//
// La regla que se ejerce: hay solo dos resultados.
//   A. Caja +/− gana: tiene el turno, confirma, y recién después el corte o el
//      cierre siguen —y el corte lo cuenta—.
//   B. el corte o el cierre ganan: Caja +/− espera, relee, se rechaza y no
//      queda ningún CajaMovimiento.
// Nunca "el corte fijó su fotografía y después apareció un movimiento".
//
// Contra el cierre directo se afirman las dos PR juntas: el movimiento confirma
// ANTES de que el cierre pueda seguir (#133), y el cierre, que calcula con el
// turno tomado (#132), lo cuenta en su esperado.
//
// Siembra sus propios datos con una marca única y los borra al terminar.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const { crearProductoVendible } = await import("./fixturePos.mjs");
const { turnoOperativoDeSesion } = await import("./fixtureTurnoOperativo.mjs");
const { retenerTurno, retenerUsuario, esperarEnFila } = await import("./carreraForzada.mjs");
const { firmarTokenOperador, OperadorCookie } = await import("../../lib/operador.js");
const { itemCrearPayload } = await import("../../lib/pos-ventas/payloadVenta.js");
const { calcularEfectivoEsperado } = await import("../../lib/caja/efectivoEsperado.js");
const { whereVentaComercial } = await import("../../lib/ventas/filtroVentaComercial.js");
const { DENOMINACIONES } = await import("../../lib/caja/conteoBilletes.js");

const rutaAbrir = await import("../../app/api/pos-ventas/turnos/abrir/route.js");
const rutaCrear = await import("../../app/api/pos-ventas/crear/route.js");
const rutaMovimiento = await import("../../app/api/pos-ventas/caja-movimientos/crear/route.js");
const rutaIniciar = await import("../../app/api/pos-ventas/cierres/iniciar/route.js");
const rutaConfirmar = await import("../../app/api/pos-ventas/cierres/[token]/confirmar/route.js");
const rutaCerrar = await import("../../app/api/pos-ventas/turnos/cerrar/route.js");

let pasadas = 0;
const fallas = [];
let seccionActual = "";
const seccion = (t) => { seccionActual = t; console.log(`\n── ${t} ${"─".repeat(Math.max(0, 64 - t.length))}`); };
function ok(t, c, d = "") {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`[${seccionActual}] ${t} — ${d || "falló"}`); console.log(`  ✗ ${t} — ${d || "falló"}`); }
}
const igual = (t, o, e) => ok(t, JSON.stringify(o) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtenido ${JSON.stringify(o)}`);
function requerir(t, c, d = "") {
  ok(t, c, d);
  if (!c) throw new Error(`requisito: ${t} — ${d}`);
}

const SECRETO = process.env.AUTH_SECRET;
const BASE = "http://ci/api/pos-ventas";
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const pedido = (url, quien, cuerpo) => {
  const cookie = [`erpazul_sesion=${quien.sesion}`, quien.operador ? `${OperadorCookie.nombre}=${quien.operador}` : null].filter(Boolean).join("; ");
  const req = new Request(url, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(cuerpo ?? {}) });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
};
const conToken = (t) => ({ params: Promise.resolve({ token: t }) });

/** Un desglose de billetes que suma exactamente `monto` (múltiplo de 100). */
function desgloseDe(monto) {
  const d = {};
  let resto = monto;
  for (const { valor } of DENOMINACIONES) {
    const n = Math.floor(resto / valor);
    if (n > 0) { d[valor] = n; resto -= n * valor; }
  }
  if (resto !== 0) throw new Error(`desgloseDe: ${monto} no es múltiplo de 100`);
  return d;
}

const marca = `ci-caja-mov-atomico-${Date.now()}`;
const creado = { grupoId: null, localId: null, usuarioId: null, rolId: null, operadorIds: [] };

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: ["pos.usar"] } });
  creado.rolId = rol.id;
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  const local = await prisma.local.create({ data: { nombre: `${marca}-local`, tipo: "local" } });
  creado.localId = local.id;
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  await prisma.configuracionLocal.create({ data: { localId: local.id, exigirOperador: true, allowNegativeStock: false } });
  const cuenta = await prisma.usuario.create({
    data: { nombre: `${marca}-cuenta`, email: `${marca}@ci.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
  });
  creado.usuarioId = cuenta.id;
  const producto = await crearProductoVendible(prisma, {
    grupoId: grupo.id, localId: local.id, nombre: `${marca}-producto`, precioVenta: 1000, precioCosto: 600, stock: 1000,
  });
  const sesion = jwt.sign({ id: cuenta.id, nombre: cuenta.nombre, email: cuenta.email, localId: local.id, permisos: ["pos.usar"] }, SECRETO, { expiresIn: "1h" });
  return { grupo, local, cuenta, producto, sesion };
}

async function desmontar() {
  if (!creado.localId) return;
  const localId = creado.localId;
  const turnos = (await prisma.turno.findMany({ where: { localId }, select: { id: true } })).map((t) => t.id);
  await prisma.cobroOffline.deleteMany({ where: { localId } });
  await prisma.auditoriaBitacora.deleteMany({ where: { localId } });
  await prisma.clientePuntoMovimiento.deleteMany({ where: { localId } });
  await prisma.ventaDetalleComponente.deleteMany({ where: { ventaDetalle: { venta: { localId } } } });
  await prisma.ventaDetalle.deleteMany({ where: { venta: { localId } } });
  await prisma.ventaPago.deleteMany({ where: { venta: { localId } } });
  await prisma.venta.deleteMany({ where: { localId } });
  await prisma.cambioPendiente.deleteMany({ where: { localId } });
  await prisma.cierrePreparacion.deleteMany({ where: { localId } });
  await prisma.retiroPreparacion.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.arqueoCaja.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.turno.updateMany({ where: { localId }, data: { retiroCierreMovimientoId: null } });
  await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.turno.deleteMany({ where: { localId } });
  // MovimientoStock no se borra: el libro de stock lo prohíbe.
  await prisma.stockLocal.deleteMany({ where: { localId } });
  await prisma.productoLocal.deleteMany({ where: { localId } });
  await prisma.productoBase.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.posVentaCounter.deleteMany({ where: { localId } });
  await prisma.configuracionLocal.deleteMany({ where: { localId } });
  await prisma.operadorEnLocal.deleteMany({ where: { operadorId: { in: creado.operadorIds } } });
  await prisma.operadorLocal.deleteMany({ where: { id: { in: creado.operadorIds } } });
  await prisma.usuario.deleteMany({ where: { id: creado.usuarioId } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.local.deleteMany({ where: { id: localId } });
  await prisma.grupo.deleteMany({ where: { id: creado.grupoId } });
  await prisma.rol.deleteMany({ where: { id: creado.rolId } });
}

async function correr() {
  const f = await montar();
  let n = 0;

  async function nuevaCaja() {
    const op = await prisma.operadorLocal.create({ data: { nombre: `${marca}-op${(n += 1)}`, pinHash: "x" } });
    creado.operadorIds.push(op.id);
    await prisma.operadorEnLocal.create({ data: { operadorId: op.id, localId: f.local.id } });
    const quien = { sesion: f.sesion, operador: firmarTokenOperador({ operadorId: op.id, nombre: op.nombre, localId: f.local.id }) };
    const r = await leer(await rutaAbrir.POST(pedido(`${BASE}/turnos/abrir`, quien, { montoInicial: 1000, turnoOperativoId: await turnoOperativoDeSesion(prisma, quien) })));
    requerir("abre la caja con $1.000", r.ok === true, `${r.status} ${r.error ?? ""}`);
    return { op, quien, turnoId: r.turno.id };
  }
  const mover = async (caja, tipo, monto) =>
    leer(await rutaMovimiento.POST(pedido(`${BASE}/caja-movimientos/crear`, caja.quien, { turnoId: caja.turnoId, tipo, monto, motivo: `${tipo} de prueba` })));
  const iniciar = async (caja) => leer(await rutaIniciar.POST(pedido(`${BASE}/cierres/iniciar`, caja.quien, { turnoId: caja.turnoId, desgloseCambio: {} })));
  const confirmar = async (caja, token, monto) =>
    leer(await rutaConfirmar.POST(pedido(`${BASE}/cierres/${token}/confirmar`, caja.quien, { desgloseRetiroContado: desgloseDe(monto) }), conToken(token)));
  const cerrar = async (caja, contado) =>
    leer(await rutaCerrar.POST(pedido(`${BASE}/turnos/cerrar`, caja.quien, { turnoId: caja.turnoId, montoRealEfectivo: contado })));
  const vender = async (caja, id) => leer(await rutaCrear.POST(pedido(`${BASE}/crear`, caja.quien, {
    clientTxnId: id, localId: f.local.id, clienteId: null, turnoId: caja.turnoId, formaPago: "efectivo",
    esFiado: false, descuento: 0, descuentoPorPuntos: 0, puntosCanje: 0,
    items: [itemCrearPayload({ productoBaseId: f.producto.baseId, nombre: "P", precio: 1000, cantidad: 1, precioCosto: 600 })],
  })));

  /** Los movimientos manuales del turno: todos menos el retiro del propio cierre. */
  async function manuales(turnoId) {
    const t = await prisma.turno.findUnique({ where: { id: turnoId }, select: { retiroCierreMovimientoId: true } });
    return prisma.cajaMovimiento.findMany({
      where: { turnoId, ...(t.retiroCierreMovimientoId ? { id: { not: t.retiroCierreMovimientoId } } : {}) },
      select: { id: true, tipo: true, monto: true },
      orderBy: { id: "asc" },
    });
  }
  /** El esperado que corresponde a lo que HOY hay en el turno, con la fórmula canónica. */
  async function esperadoReal(turnoId) {
    const t = await prisma.turno.findUnique({ where: { id: turnoId }, select: { montoInicial: true } });
    const ventas = await prisma.venta.findMany({
      where: whereVentaComercial({ turnoId }),
      select: { total: true, formaPago: true, esFiado: true, pagos: { select: { medio: true, monto: true } } },
    });
    return calcularEfectivoEsperado({ montoInicial: t.montoInicial, ventas, movimientos: await manuales(turnoId) }).efectivoEsperado;
  }
  const corteDe = (turnoId) => prisma.cierrePreparacion.findFirst({ where: { turnoId }, orderBy: { id: "desc" } });

  /** Corre dos acciones y anota en qué orden RESPONDIERON. */
  function conOrden(orden, etiqueta, p) {
    return p.then((r) => { orden.push(etiqueta); return r; });
  }

  // ── 1. CAJA +/− GANA CONTRA EL CORTE ──────────────────────────────────────
  // Caja +/− toma el turno y queda detenido ANTES de confirmar (la fila del
  // usuario retenida frena la clave foránea del insert). El corte llega y tiene
  // que esperarlo en el turno. Al soltar: el movimiento confirma, el corte sigue
  // y lo cuenta.
  for (const [tipo, monto, esperado] of [["INGRESO", 500, 1500], ["RETIRO", 300, 700]]) {
    seccion(`1. Caja +/− gana contra el corte — ${tipo}`);
    const caja = await nuevaCaja();
    const orden = [];
    const r = await retenerUsuario(prisma, f.cuenta.id);
    let pMov, pCorte;
    try {
      pMov = conOrden(orden, "movimiento", mover(caja, tipo, monto));
      requerir("Caja +/− queda detenido antes de confirmar", (await esperarEnFila(prisma, 1)) >= 1);
      pCorte = conOrden(orden, "corte", iniciar(caja));
      requerir("el corte queda esperando", (await esperarEnFila(prisma, 2)) >= 2);
    } finally {
      await r.soltar();
    }
    const [mov, corte] = await Promise.all([pMov, pCorte]);
    igual("el movimiento responde 200", mov.status, 200);
    igual("el corte responde 200", corte.status, 200);
    igual("el movimiento confirma ANTES que el corte", orden, ["movimiento", "corte"]);
    const movs = await manuales(caja.turnoId);
    igual("el movimiento existe, uno solo", movs.map((m) => [m.tipo, Number(m.monto)]), [[tipo, monto]]);
    const c = await corteDe(caja.turnoId);
    igual("el corte lo incluye: es su último movimiento", c.ultimoMovimientoId, movs[0]?.id);
    igual(`el esperado del corte lo cuenta ($${esperado})`, Number(c.efectivoEsperadoCorte), esperado);
    igual("el esperado del corte es el de la fórmula sobre lo que hay", Number(c.efectivoEsperadoCorte), await esperadoReal(caja.turnoId));
    const fin = await confirmar(caja, c.token, esperado);
    igual("se confirma contando lo esperado", fin.status, 200);
    const t = await prisma.turno.findUnique({ where: { id: caja.turnoId } });
    igual("el cierre: esperado y diferencia 0", [Number(t.montoEsperadoEfectivo), Number(t.diferenciaEfectivo)], [esperado, 0]);
  }

  // ── 2. EL CORTE GANA ─────────────────────────────────────────────────────
  // El turno retenido desde afuera pone en fila primero al corte y después a
  // Caja +/−, que ya pasó la validación de afuera —el turno todavía estaba
  // operativo—. Al soltar: el corte confirma; Caja +/− relee y se rechaza.
  for (const [tipo, monto] of [["INGRESO", 500], ["RETIRO", 300]]) {
    seccion(`2. El corte gana — ${tipo}`);
    const caja = await nuevaCaja();
    const r = await retenerTurno(prisma, caja.turnoId);
    let pMov, pCorte;
    try {
      pCorte = iniciar(caja);
      requerir("el corte queda en fila", (await esperarEnFila(prisma, 1)) >= 1);
      pMov = mover(caja, tipo, monto);
      requerir("Caja +/− pasa la validación de afuera y queda en fila", (await esperarEnFila(prisma, 2)) >= 2);
    } finally {
      await r.soltar();
    }
    const [corte, mov] = await Promise.all([pCorte, pMov]);
    igual("el corte responde 200", corte.status, 200);
    igual("Caja +/− se rechaza: turno en preparación de cierre", [mov.status, mov.turnoEnPreparacionDeCierre], [409, true]);
    igual("no existe ningún CajaMovimiento", (await manuales(caja.turnoId)).length, 0);
    const c = await corteDe(caja.turnoId);
    igual("la fotografía del corte no cambia: esperado $1.000, sin movimientos", [Number(c.efectivoEsperadoCorte), c.ultimoMovimientoId], [1000, null]);
    igual("el esperado del corte sigue siendo el de lo que hay", Number(c.efectivoEsperadoCorte), await esperadoReal(caja.turnoId));
  }

  // ── 3. EL CIERRE DIRECTO GANA ────────────────────────────────────────────
  for (const [tipo, monto] of [["INGRESO", 500], ["RETIRO", 300]]) {
    seccion(`3. El cierre directo gana — ${tipo}`);
    const caja = await nuevaCaja();
    const r = await retenerTurno(prisma, caja.turnoId);
    let pMov, pCerrar;
    try {
      pCerrar = cerrar(caja, 1000);
      requerir("el cierre queda en fila", (await esperarEnFila(prisma, 1)) >= 1);
      pMov = mover(caja, tipo, monto);
      requerir("Caja +/− pasa la validación de afuera y queda en fila", (await esperarEnFila(prisma, 2)) >= 2);
    } finally {
      await r.soltar();
    }
    const [cierre, mov] = await Promise.all([pCerrar, pMov]);
    igual("el cierre responde 200", cierre.status, 200);
    igual("Caja +/− se rechaza: turno cerrado", [mov.status, mov.error], [400, "El turno ya esta cerrado"]);
    igual("no existe ningún CajaMovimiento manual", (await manuales(caja.turnoId)).length, 0);
    const t = await prisma.turno.findUnique({ where: { id: caja.turnoId } });
    igual("el cierre: esperado $1.000 y diferencia 0", [Number(t.montoEsperadoEfectivo), Number(t.diferenciaEfectivo)], [1000, 0]);
  }

  // ── 4. CAJA +/− GANA CONTRA EL CIERRE DIRECTO ────────────────────────────
  // El movimiento confirma antes de que el cierre pueda seguir, y el cierre lo
  // cuenta: se cierra contando exactamente lo esperado y la diferencia es 0.
  for (const [tipo, monto, esperado] of [["INGRESO", 500, 1500], ["RETIRO", 300, 700]]) {
    seccion(`4. Caja +/− gana contra el cierre directo — ${tipo}`);
    const caja = await nuevaCaja();
    const orden = [];
    const r = await retenerUsuario(prisma, f.cuenta.id);
    let pMov, pCerrar;
    try {
      pMov = conOrden(orden, "movimiento", mover(caja, tipo, monto));
      requerir("Caja +/− queda detenido antes de confirmar", (await esperarEnFila(prisma, 1)) >= 1);
      pCerrar = conOrden(orden, "cierre", cerrar(caja, esperado));
      requerir("el cierre queda esperando", (await esperarEnFila(prisma, 2)) >= 2);
    } finally {
      await r.soltar();
    }
    const [mov, cierre] = await Promise.all([pMov, pCerrar]);
    igual("el movimiento responde 200", mov.status, 200);
    igual("el cierre responde 200", cierre.status, 200);
    igual("el movimiento confirma ANTES que el cierre", orden, ["movimiento", "cierre"]);
    igual("el movimiento existe, uno solo", (await manuales(caja.turnoId)).map((m) => [m.tipo, Number(m.monto)]), [[tipo, monto]]);
    const t = await prisma.turno.findUnique({ where: { id: caja.turnoId }, select: { montoEsperadoEfectivo: true, diferenciaEfectivo: true } });
    igual(`el cierre lo cuenta: esperado $${esperado} y diferencia 0`, [Number(t.montoEsperadoEfectivo), Number(t.diferenciaEfectivo)], [esperado, 0]);
    igual("el esperado del cierre es el de la fórmula sobre lo que hay", Number(t.montoEsperadoEfectivo), await esperadoReal(caja.turnoId));
    const arqueos = await prisma.arqueoCaja.findMany({ where: { turnoId: caja.turnoId, tipo: "FINAL" } });
    igual("un solo arqueo FINAL, con el mismo esperado y diferencia 0", arqueos.map((a) => [Number(a.efectivoEsperado), Number(a.diferencia)]), [[esperado, 0]]);
  }

  // ── 5. DOS MOVIMIENTOS ALREDEDOR DEL CORTE ───────────────────────────────
  seccion("5. Movimiento A gana, el corte toma la frontera, B pierde");
  {
    const caja = await nuevaCaja();
    const r = await retenerTurno(prisma, caja.turnoId);
    let pA, pCorte, pB;
    try {
      pA = mover(caja, "INGRESO", 200);
      requerir("A queda en fila", (await esperarEnFila(prisma, 1)) >= 1);
      pCorte = iniciar(caja);
      requerir("el corte queda en fila detrás de A", (await esperarEnFila(prisma, 2)) >= 2);
      pB = mover(caja, "INGRESO", 400);
      requerir("B queda en fila detrás del corte", (await esperarEnFila(prisma, 3)) >= 3);
    } finally {
      await r.soltar();
    }
    const [a, corte, b] = await Promise.all([pA, pCorte, pB]);
    igual("A 200, corte 200, B 409", [a.status, corte.status, b.status], [200, 200, 409]);
    const movs = await manuales(caja.turnoId);
    igual("existe A y no existe B, sin duplicados", movs.map((m) => Number(m.monto)), [200]);
    const c = await corteDe(caja.turnoId);
    igual("el corte incluye A y no B: esperado $1.200, último movimiento A", [Number(c.efectivoEsperadoCorte), c.ultimoMovimientoId], [1200, a.item?.id]);
    igual("el esperado del corte es el de lo que hay", Number(c.efectivoEsperadoCorte), await esperadoReal(caja.turnoId));
  }

  // ── 6. DOBLE PEDIDO ──────────────────────────────────────────────────────
  // Caja +/− no tiene idempotencia y esta PR no la inventa: dos pedidos son dos
  // movimientos. Lo que se afirma es que serializarlos no los traba ni los pierde.
  seccion("6. Dos Caja +/− a la vez sobre el mismo turno");
  {
    const caja = await nuevaCaja();
    const r = await retenerTurno(prisma, caja.turnoId);
    let p1, p2;
    try {
      p1 = mover(caja, "INGRESO", 100);
      p2 = mover(caja, "INGRESO", 100);
      requerir("los dos quedan en fila", (await esperarEnFila(prisma, 2)) >= 2);
    } finally {
      await r.soltar();
    }
    const res = await Promise.all([p1, p2]);
    igual("los dos responden 200", res.map((x) => x.status), [200, 200]);
    const movs = await manuales(caja.turnoId);
    igual("dos movimientos distintos, ni uno más ni uno menos", [movs.length, new Set(movs.map((m) => m.id)).size], [2, 2]);
    const libres = await Promise.all([mover(caja, "RETIRO", 100), mover(caja, "INGRESO", 100)]);
    igual("sin retener nada, también 200 los dos", libres.map((x) => x.status), [200, 200]);
  }

  // ── 7. RONDAS: Caja +/−, ventas y corte o cierre a la vez ────────────────
  seccion("7. Rondas: movimientos, ventas y corte o cierre, todo a la vez");
  {
    let incoherentes = 0;
    let cincoXX = 0;
    let rechazados = 0;
    for (let ronda = 0; ronda < 6; ronda += 1) {
      const caja = await nuevaCaja();
      const conCierre = ronda % 2 === 1;
      const pedidos = [
        mover(caja, "INGRESO", 100),
        mover(caja, "RETIRO", 100),
        mover(caja, "INGRESO", 200),
        vender(caja, `${marca}-r${ronda}-v1`),
        vender(caja, `${marca}-r${ronda}-v2`),
        conCierre ? cerrar(caja, 1000) : iniciar(caja),
        mover(caja, "INGRESO", 300),
      ];
      const res = await Promise.all(pedidos);
      cincoXX += res.filter((x) => x.status >= 500).length;
      const movsOk = [0, 1, 2, 6].filter((i) => res[i].status === 200).length;
      rechazados += [0, 1, 2, 6].length - movsOk;
      const movs = await manuales(caja.turnoId);
      if (movs.length !== movsOk) incoherentes += 1;
      if (!conCierre) {
        const c = await corteDe(caja.turnoId);
        if (c && Number(c.efectivoEsperadoCorte) !== (await esperadoReal(caja.turnoId))) incoherentes += 1;
      }
    }
    igual("ninguna respuesta 5xx (sin deadlock ni timeout)", cincoXX, 0);
    igual("cada movimiento que existe respondió 200, y cada corte cuenta todo lo que hay", incoherentes, 0);
    console.log(`    (movimientos rechazados por llegar después del corte o cierre: ${rechazados})`);
  }
}

try {
  await correr();
} catch (e) {
  fallas.push(`[${seccionActual}] excepción: ${e.message}`);
  console.error(e);
} finally {
  await desmontar().catch((e) => console.error("desmontar:", e.message));
  await prisma.$disconnect();
}

// La primera línea es la que lee contrapruebasRevision.mjs para saber que corrió.
console.log(`\nAfirmaciones que pasaron: ${pasadas}`);
console.log(`${pasadas} en verde, ${fallas.length} en rojo`);
if (fallas.length) {
  for (const x of fallas) console.log(`  ✗ ${x}`);
  process.exit(1);
}
