// PRUEBA DE BASE DE FINANZAS.
//
// Ejerce los HANDLERS reales contra el PostgreSQL 16 efímero del workflow.
// No mide funciones puras: obliga a Prisma/Postgres a validar los where/select
// que el build y los candados no pueden comprobar.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/finanzas.mjs

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const rutaTablero = await import("../../app/api/finanzas/tablero/route.js");
const rutaTurno = await import("../../app/api/finanzas/turno/[turnoId]/route.js");
const rutaCuentas = await import("../../app/api/finanzas/pagos-proveedores/route.js");
const rutaCuenta = await import("../../app/api/finanzas/pagos-proveedores/[cuentaId]/route.js");
const rutaPagos = await import("../../app/api/finanzas/pagos-proveedores/[cuentaId]/pagos/route.js");
const rutaTurnosOperativos = await import(
  "../../app/api/finanzas/pagos-proveedores/turnos-operativos/route.js"
);
const { crearCuentaPorPagarDesdeCompra, ErrorPagoProveedor } = await import(
  "../../lib/finanzas/pagosProveedoresServer.js"
);
const { PERMISO_REGISTRAR_PAGOS } = await import("../../lib/finanzas/pagosProveedores.js");

let pasadas = 0;
const fallas = [];

function ok(titulo, condicion, detalle = "") {
  if (condicion) {
    pasadas += 1;
    console.log(`  ✓ ${titulo}`);
    return;
  }
  const mensaje = `${titulo}${detalle ? ` — ${detalle}` : ""}`;
  fallas.push(mensaje);
  console.log(`  ✗ ${mensaje}`);
}

const SECRETO = process.env.AUTH_SECRET;
const token = (usuarioId, localId, permisos = ["finanzas.ver"]) =>
  jwt.sign(
    { id: usuarioId, nombre: "CI Finanzas", email: `finanzas-${usuarioId}@ci.local`, localId, permisos },
    SECRETO,
    { expiresIn: "1h" }
  );

const pedido = (url, sesion) =>
  new Request(url, { headers: { cookie: `erpazul_sesion=${sesion}` } });

const leer = async (respuesta) => {
  const r = await respuesta;
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};

const paramsTurno = (turnoId) => ({ params: Promise.resolve({ turnoId: String(turnoId) }) });
const paramsCuenta = (cuentaId) => ({ params: Promise.resolve({ cuentaId: String(cuentaId) }) });

const conCuerpo = (url, sesion, metodo, cuerpo) =>
  new Request(url, {
    method: metodo,
    headers: { cookie: `erpazul_sesion=${sesion}`, "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });

const marca = `ci-finanzas-${Date.now()}`;
const creado = {
  rolId: null,
  grupoId: null,
  depositoId: null,
  localId: null,
  usuarioDepositoId: null,
  usuarioLocalId: null,
  turnoId: null,
  // Pagos a proveedores
  otroLocalId: null,
  turnoOtroId: null,
  proveedorId: null,
  pedidoIds: [],
};

async function montar() {
  const rol = await prisma.rol.create({
    data: { nombre: `${marca}-rol`, permisos: ["finanzas.ver"] },
  });
  creado.rolId = rol.id;

  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;

  const deposito = await prisma.local.create({
    data: { nombre: `${marca}-deposito`, es_deposito: true },
  });
  const local = await prisma.local.create({ data: { nombre: `${marca}-local` } });
  creado.depositoId = deposito.id;
  creado.localId = local.id;

  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });

  const usuarioDeposito = await prisma.usuario.create({
    data: {
      nombre: "CI Finanzas Depósito",
      email: `${marca}-deposito@ci.local`,
      passwordHash: "x",
      rolId: rol.id,
      localId: deposito.id,
    },
  });
  const usuarioLocal = await prisma.usuario.create({
    data: {
      nombre: "CI Finanzas Local",
      email: `${marca}-local@ci.local`,
      passwordHash: "x",
      rolId: rol.id,
      localId: local.id,
    },
  });
  creado.usuarioDepositoId = usuarioDeposito.id;
  creado.usuarioLocalId = usuarioLocal.id;

  const turno = await prisma.turno.create({
    data: {
      localId: local.id,
      vendedorId: usuarioLocal.id,
      montoInicial: 1000,
      apertura: new Date(),
    },
  });
  creado.turnoId = turno.id;

  // Al menos un movimiento hace que el tablero ejecute también las consultas
  // estructurales de clasificación: ArqueoCaja.cajaMovimientoRetiroId y
  // Turno.retiroCierreMovimientoId.
  await prisma.cajaMovimiento.create({
    data: {
      turnoId: turno.id,
      usuarioId: usuarioLocal.id,
      tipo: "INGRESO",
      monto: 500,
      motivo: `${marca}-movimiento`,
      createdAt: new Date(),
    },
  });

  // ── PAGOS A PROVEEDORES ─────────────────────────────────────────────────
  //
  // Un segundo local del grupo, con su turno, para probar que un local no ve ni
  // paga lo ajeno y que un efectivo no puede salir del cajón de otro.
  const otroLocal = await prisma.local.create({ data: { nombre: `${marca}-otro` } });
  creado.otroLocalId = otroLocal.id;
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: otroLocal.id } });
  const turnoOtro = await prisma.turno.create({
    data: { localId: otroLocal.id, vendedorId: usuarioDeposito.id, montoInicial: 0, apertura: new Date() },
  });
  creado.turnoOtroId = turnoOtro.id;

  const proveedor = await prisma.proveedor.create({ data: { nombre: `${marca}-Arcor` } });
  creado.proveedorId = proveedor.id;
  const nuevoPedido = async () => {
    const p = await prisma.pedidoProveedor.create({
      data: {
        grupoId: grupo.id,
        depositoId: deposito.id,
        proveedorId: proveedor.id,
        estado: "RECIBIDO",
        nroFactura: "0001-00012345",
      },
    });
    creado.pedidoIds.push(p.id);
    return p;
  };
  const pedidoDelLocal = await nuevoPedido();
  const pedidoDelOtro = await nuevoPedido();

  return {
    grupo,
    deposito,
    local,
    otroLocal,
    usuarioDeposito,
    usuarioLocal,
    turno,
    turnoOtro,
    pedidoDelLocal,
    pedidoDelOtro,
  };
}

async function desmontar() {
  // Primero los pagos: apuntan al turno y al movimiento de caja, y el CHECK de
  // la migración no deja desvincular un efectivo.
  if (creado.pedidoIds.length) {
    await prisma.pagoProveedor.deleteMany({
      where: { cuenta: { pedidoProveedorId: { in: creado.pedidoIds } } },
    });
    await prisma.cuentaPorPagarProveedor.deleteMany({
      where: { pedidoProveedorId: { in: creado.pedidoIds } },
    });
    await prisma.pedidoProveedor.deleteMany({ where: { id: { in: creado.pedidoIds } } });
  }
  if (creado.proveedorId) await prisma.proveedor.deleteMany({ where: { id: creado.proveedorId } });
  if (creado.turnoOtroId) {
    await prisma.cajaMovimiento.deleteMany({ where: { turnoId: creado.turnoOtroId } });
    await prisma.turno.deleteMany({ where: { id: creado.turnoOtroId } });
  }
  if (creado.localId) {
    await prisma.arqueoCaja.deleteMany({ where: { localId: creado.localId } });
    await prisma.venta.deleteMany({ where: { localId: creado.localId } });
  }
  if (creado.turnoId) {
    await prisma.cajaMovimiento.deleteMany({ where: { turnoId: creado.turnoId } });
    await prisma.turno.deleteMany({ where: { id: creado.turnoId } });
  }
  const usuarios = [creado.usuarioDepositoId, creado.usuarioLocalId].filter(Boolean);
  if (usuarios.length) await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
  if (creado.grupoId) {
    await prisma.grupoLocal.deleteMany({ where: { grupoId: creado.grupoId } });
    await prisma.grupoDeposito.deleteMany({ where: { grupoId: creado.grupoId } });
  }
  const locales = [creado.depositoId, creado.localId, creado.otroLocalId].filter(Boolean);
  if (locales.length) await prisma.local.deleteMany({ where: { id: { in: locales } } });
  if (creado.grupoId) await prisma.grupo.deleteMany({ where: { id: creado.grupoId } });
  if (creado.rolId) await prisma.rol.deleteMany({ where: { id: creado.rolId } });
}

async function correr(f) {
  const sesionDeposito = token(f.usuarioDeposito.id, f.deposito.id);
  const sesionLocal = token(f.usuarioLocal.id, f.local.id);

  console.log("\n── Depósito: entrada");
  const entradaDeposito = await leer(
    rutaTablero.GET(pedido("http://ci/api/finanzas/tablero?entrada=1", sesionDeposito))
  );
  ok("la entrada del depósito responde 200", entradaDeposito.status === 200, entradaDeposito.error);
  ok("la entrada del depósito es ENTRADA", entradaDeposito.vista === "ENTRADA");
  ok(
    "la lista contiene depósito y local",
    Array.isArray(entradaDeposito.locales) &&
      entradaDeposito.locales.some((l) => l.localId === f.deposito.id) &&
      entradaDeposito.locales.some((l) => l.localId === f.local.id)
  );

  console.log("\n── Depósito: abre un local");
  const desdeDeposito = await leer(
    rutaTablero.GET(
      pedido(`http://ci/api/finanzas/tablero?destino=${f.local.id}`, sesionDeposito)
    )
  );
  ok("el depósito puede abrir el local", desdeDeposito.status === 200 && desdeDeposito.ok === true, desdeDeposito.error);
  ok("la respuesta es UN_LOCAL", desdeDeposito.vista === "UN_LOCAL");
  ok("es el local pedido", desdeDeposito.local?.id === f.local.id);

  console.log("\n── Local: tablero propio");
  const tableroLocal = await leer(
    rutaTablero.GET(pedido("http://ci/api/finanzas/tablero?entrada=1", sesionLocal))
  );
  ok("el tablero del local responde 200", tableroLocal.status === 200 && tableroLocal.ok === true, tableroLocal.error);
  ok("el local recibe UN_LOCAL", tableroLocal.vista === "UN_LOCAL");
  ok("el tablero conserva su local", tableroLocal.local?.id === f.local.id);
  ok("el resumen existe", tableroLocal.resumen && typeof tableroLocal.resumen === "object");
  ok("la actividad existe", Array.isArray(tableroLocal.actividad));

  console.log("\n── Turno: abierto por el local");
  const detalleLocal = await leer(
    rutaTurno.GET(
      pedido(`http://ci/api/finanzas/turno/${f.turno.id}`, sesionLocal),
      paramsTurno(f.turno.id)
    )
  );
  ok("el detalle del turno responde 200", detalleLocal.status === 200 && detalleLocal.ok === true, detalleLocal.error);
  ok("devuelve el turno correcto", detalleLocal.turno?.id === f.turno.id);
  ok("ejerció movimientos de caja", Array.isArray(detalleLocal.movimientos) && detalleLocal.movimientos.length === 1);
  ok("calculó efectivo esperado", detalleLocal.esperado?.efectivoEsperado !== undefined);

  console.log("\n── Turno: abierto por el depósito");
  const detalleDeposito = await leer(
    rutaTurno.GET(
      pedido(`http://ci/api/finanzas/turno/${f.turno.id}`, sesionDeposito),
      paramsTurno(f.turno.id)
    )
  );
  ok(
    "el depósito puede abrir el turno del local de su grupo",
    detalleDeposito.status === 200 && detalleDeposito.ok === true,
    detalleDeposito.error
  );
}

// ── PAGOS A PROVEEDORES ───────────────────────────────────────────────────
//
// La cuenta nace por la capa canónica —la misma que va a llamar "Cerrar
// compra"— y todo lo demás pasa por los handlers reales.

const ESCRITURA_FIN = ["finanzas.ver", PERMISO_REGISTRAR_PAGOS];

async function pagar(cuentaId, sesion, cuerpo) {
  return leer(
    rutaPagos.POST(
      conCuerpo(`http://ci/api/finanzas/pagos-proveedores/${cuentaId}/pagos`, sesion, "POST", cuerpo),
      paramsCuenta(cuentaId)
    )
  );
}

async function abrir(cuentaId, sesion) {
  return leer(
    rutaCuenta.GET(
      pedido(`http://ci/api/finanzas/pagos-proveedores/${cuentaId}`, sesion),
      paramsCuenta(cuentaId)
    )
  );
}

const movimientosDe = (turnoId) => prisma.cajaMovimiento.count({ where: { turnoId } });

async function esperadoDelTurno(turnoId, sesion) {
  const r = await leer(
    rutaTurno.GET(pedido(`http://ci/api/finanzas/turno/${turnoId}`, sesion), paramsTurno(turnoId))
  );
  return r.esperado?.efectivoEsperado;
}

async function correrPagos(f) {
  const localEscribe = token(f.usuarioLocal.id, f.local.id, ESCRITURA_FIN);
  const localSoloVe = token(f.usuarioLocal.id, f.local.id, ["finanzas.ver"]);
  const depositoEscribe = token(f.usuarioDeposito.id, f.deposito.id, ESCRITURA_FIN);
  const admin = token(f.usuarioDeposito.id, f.deposito.id, ["*"]);

  console.log("\n── Pagos: la cuenta nace por la capa canónica");
  const { cuenta: cuentaA } = await prisma.$transaction((tx) =>
    crearCuentaPorPagarDesdeCompra(tx, {
      pedidoProveedorId: f.pedidoDelLocal.id,
      localGastoId: f.local.id,
      total: 485300,
      vencimientoProveedor: "2026-10-15",
      fechaPrevistaPago: null,
      usuarioId: f.usuarioDeposito.id,
    })
  );
  ok("compra $485.300 sin pagos → saldo $485.300", cuentaA.saldo === 485300, JSON.stringify(cuentaA));
  ok("sin pagos está PENDIENTE", cuentaA.estado === "PENDIENTE");
  ok("el vencimiento vuelve como el mismo día", cuentaA.vencimientoProveedor === "2026-10-15");
  ok("sin fecha prevista es null", cuentaA.fechaPrevistaPago === null);

  const { cuenta: cuentaB } = await prisma.$transaction((tx) =>
    crearCuentaPorPagarDesdeCompra(tx, {
      pedidoProveedorId: f.pedidoDelOtro.id,
      localGastoId: f.otroLocal.id,
      total: 1000,
      usuarioId: f.usuarioDeposito.id,
    })
  );

  let duplicada = null;
  try {
    await prisma.$transaction((tx) =>
      crearCuentaPorPagarDesdeCompra(tx, {
        pedidoProveedorId: f.pedidoDelLocal.id,
        localGastoId: f.local.id,
        total: 1,
        usuarioId: f.usuarioDeposito.id,
      })
    );
  } catch (e) {
    duplicada = e;
  }
  ok(
    "una compra no genera dos cuentas",
    duplicada instanceof ErrorPagoProveedor && duplicada.status === 409,
    String(duplicada?.message)
  );

  console.log("\n── Pagos: alcance del local");
  const listaLocal = await leer(
    rutaCuentas.GET(pedido("http://ci/api/finanzas/pagos-proveedores?estado=TODAS", localEscribe))
  );
  ok("la lista del local responde 200", listaLocal.status === 200 && listaLocal.ok, listaLocal.error);
  ok("el local ve su cuenta", listaLocal.cuentas?.some((c) => c.id === cuentaA.id));
  ok("el local NO ve la cuenta de otro local", !listaLocal.cuentas?.some((c) => c.id === cuentaB.id));
  const ajenaLeida = await abrir(cuentaB.id, localEscribe);
  ok("el local no puede leer la deuda de otro local", ajenaLeida.status === 403, `status ${ajenaLeida.status}`);
  const ajenaPagada = await pagar(cuentaB.id, localEscribe, { monto: 10, medio: "TRANSFERENCIA" });
  ok("el local no puede pagar la deuda de otro local", ajenaPagada.status === 403, `status ${ajenaPagada.status}`);

  console.log("\n── Pagos: finanzas.ver lee pero no escribe");
  const soloVe = await abrir(cuentaA.id, localSoloVe);
  ok("finanzas.ver abre la cuenta", soloVe.status === 200 && soloVe.ok, soloVe.error);
  ok("y la pantalla sabe que no puede escribir", soloVe.puedeEscribir === false);
  const soloVePaga = await pagar(cuentaA.id, localSoloVe, { monto: 10, medio: "TRANSFERENCIA" });
  ok("finanzas.ver NO registra pagos", soloVePaga.status === 403, `status ${soloVePaga.status}`);
  const soloVeFecha = await leer(
    rutaCuenta.PATCH(
      conCuerpo(`http://ci/api/finanzas/pagos-proveedores/${cuentaA.id}`, localSoloVe, "PATCH", {
        fechaPrevistaPago: "2026-11-01",
      }),
      paramsCuenta(cuentaA.id)
    )
  );
  ok("finanzas.ver NO mueve la fecha prevista", soloVeFecha.status === 403, `status ${soloVeFecha.status}`);

  console.log("\n── Pagos: validaciones");
  for (const monto of [0, -5, "abc"]) {
    const r = await pagar(cuentaA.id, localEscribe, { monto, medio: "TRANSFERENCIA" });
    ok(`monto ${JSON.stringify(monto)} se rechaza`, r.status === 400, `status ${r.status} ${r.error}`);
  }
  const deMas = await pagar(cuentaA.id, localEscribe, { monto: 485300.01, medio: "TRANSFERENCIA" });
  ok("un pago mayor al saldo se rechaza", deMas.status === 400, `status ${deMas.status} ${deMas.error}`);
  const origenAjeno = await pagar(cuentaA.id, localEscribe, {
    monto: 10,
    medio: "TRANSFERENCIA",
    localOrigenId: f.deposito.id,
  });
  ok("un local no puede pagar con plata de otra ubicación", origenAjeno.status === 403);

  console.log("\n── Pagos: transferencia $300.000");
  const movsAntes = await movimientosDe(f.turno.id);
  const p1 = await pagar(cuentaA.id, localEscribe, { monto: 300000, medio: "TRANSFERENCIA" });
  ok("el pago parcial responde 200", p1.status === 200 && p1.ok, p1.error);
  ok("saldo $185.300", p1.cuenta?.saldo === 185300, JSON.stringify(p1.cuenta));
  ok("queda PARCIAL", p1.cuenta?.estado === "PARCIAL");
  ok("transferencia NO crea CajaMovimiento", (await movimientosDe(f.turno.id)) === movsAntes);
  ok("transferencia no tiene turno ni movimiento", p1.pago?.turnoId === null && p1.pago?.cajaMovimientoId === null);

  const lectura = await abrir(cuentaA.id, localEscribe);
  ok("la lectura posterior da saldo $185.300", lectura.cuenta?.saldo === 185300);
  ok("el historial tiene el pago", lectura.pagos?.length === 1);

  console.log("\n── Pagos: efectivo $100.000 desde el turno del local");
  const sinTurno = await pagar(cuentaA.id, localEscribe, { monto: 100000, medio: "EFECTIVO" });
  ok("efectivo sin turno se rechaza", sinTurno.status === 400, sinTurno.error);
  const turnoAjeno = await pagar(cuentaA.id, localEscribe, {
    monto: 100000,
    medio: "EFECTIVO",
    turnoId: f.turnoOtro.id,
  });
  ok("efectivo desde el turno de otra ubicación se rechaza", turnoAjeno.status === 409, turnoAjeno.error);

  const esperadoAntes = await esperadoDelTurno(f.turno.id, localEscribe);
  const movsAntesEf = await movimientosDe(f.turno.id);
  const p2 = await pagar(cuentaA.id, localEscribe, {
    monto: 100000,
    medio: "EFECTIVO",
    turnoId: f.turno.id,
  });
  ok("el pago en efectivo responde 200", p2.status === 200 && p2.ok, p2.error);
  ok("segundo pago → saldo $85.300", p2.cuenta?.saldo === 85300);
  ok("efectivo crea exactamente UN movimiento", (await movimientosDe(f.turno.id)) === movsAntesEf + 1);
  const mov = p2.pago?.cajaMovimientoId
    ? await prisma.cajaMovimiento.findUnique({ where: { id: p2.pago.cajaMovimientoId } })
    : null;
  ok("el movimiento es un RETIRO por el mismo importe", mov?.tipo === "RETIRO" && Number(mov?.monto) === 100000);
  ok("pago y movimiento quedan vinculados por id", mov?.turnoId === f.turno.id && p2.pago?.turnoId === f.turno.id);
  const esperadoDespues = await esperadoDelTurno(f.turno.id, localEscribe);
  ok(
    "el efectivo esperado baja exactamente una vez",
    Math.round((esperadoAntes - esperadoDespues) * 100) === 10000000,
    `${esperadoAntes} → ${esperadoDespues}`
  );

  console.log("\n── Pagos: el depósito paga lo de Casiano por transferencia");
  const p3 = await pagar(cuentaA.id, depositoEscribe, {
    monto: 85300,
    medio: "TRANSFERENCIA",
    localOrigenId: f.deposito.id,
  });
  ok("el depósito puede pagar la cuenta del local", p3.status === 200 && p3.ok, p3.error);
  ok("pago final → saldo $0", p3.cuenta?.saldo === 0);
  ok("pago final → PAGADA", p3.cuenta?.estado === "PAGADA");
  ok("el dinero salió del depósito", p3.pago?.origen?.id === f.deposito.id);
  ok("el gasto sigue siendo del local", p3.cuenta?.localGasto?.id === f.local.id);
  const saldada = await pagar(cuentaA.id, depositoEscribe, {
    monto: 1,
    medio: "TRANSFERENCIA",
    localOrigenId: f.deposito.id,
  });
  ok("una cuenta pagada no admite más pagos", saldada.status === 400);

  console.log("\n── Pagos: las dos fechas son independientes");
  const conFecha = await leer(
    rutaCuenta.PATCH(
      conCuerpo(`http://ci/api/finanzas/pagos-proveedores/${cuentaA.id}`, localEscribe, "PATCH", {
        fechaPrevistaPago: "2026-11-01",
        vencimientoProveedor: "2030-01-01",
      }),
      paramsCuenta(cuentaA.id)
    )
  );
  ok("la fecha prevista se guarda", conFecha.cuenta?.fechaPrevistaPago === "2026-11-01", conFecha.error);
  ok("el vencimiento del proveedor no se toca", conFecha.cuenta?.vencimientoProveedor === "2026-10-15");

  console.log("\n── Pagos: lecturas del historial y de la lista");
  const final = await abrir(cuentaA.id, depositoEscribe);
  ok("el depósito ve los tres pagos", final.pagos?.length === 3);
  ok(
    "el historial dice de dónde salió cada pago",
    final.pagos?.every((p) => p.origen?.id) &&
      final.pagos.some((p) => p.origen.id === f.deposito.id) &&
      final.pagos.some((p) => p.origen.id === f.local.id)
  );
  const pendientes = await leer(
    rutaCuentas.GET(pedido("http://ci/api/finanzas/pagos-proveedores", depositoEscribe))
  );
  ok("la cuenta pagada no está en Pendientes", !pendientes.cuentas?.some((c) => c.id === cuentaA.id));
  ok("la del otro local sí, para el depósito", pendientes.cuentas?.some((c) => c.id === cuentaB.id));

  const turnosLocal = await leer(
    rutaTurnosOperativos.GET(
      pedido(`http://ci/api/finanzas/pagos-proveedores/turnos-operativos`, localEscribe)
    )
  );
  ok("el local ve su turno abierto para pagar en efectivo", turnosLocal.turnos?.some((t) => t.id === f.turno.id), turnosLocal.error);

  console.log("\n── Pagos: Admin por *");
  const pagadas = await leer(
    rutaCuentas.GET(pedido("http://ci/api/finanzas/pagos-proveedores?estado=PAGADAS", admin))
  );
  ok("admin lee la lista", pagadas.status === 200 && pagadas.ok, pagadas.error);
  ok("admin ve la cuenta pagada", pagadas.cuentas?.some((c) => c.id === cuentaA.id));
  const pAdmin = await pagar(cuentaB.id, admin, {
    monto: 500,
    medio: "MERCADO_PAGO",
    localOrigenId: f.deposito.id,
  });
  ok("admin registra un pago", pAdmin.status === 200 && pAdmin.cuenta?.saldo === 500, pAdmin.error);
}

let fixture;
try {
  fixture = await montar();
  await correr(fixture);
  await correrPagos(fixture);
} finally {
  await desmontar();
  await prisma.$disconnect();
}

console.log(`\n${pasadas} comprobaciones pasaron.`);
if (fallas.length) {
  console.error("\nFallaron:");
  for (const f of fallas) console.error(`- ${f}`);
  process.exit(1);
}
