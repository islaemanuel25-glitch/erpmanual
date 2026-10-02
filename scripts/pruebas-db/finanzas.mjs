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
const { crearCuentaPorPagarDesdeCompra, registrarPagoProveedor, ErrorPagoProveedor } = await import(
  "../../lib/finanzas/pagosProveedoresServer.js"
);
const { PERMISO_REGISTRAR_PAGOS } = await import("../../lib/finanzas/pagosProveedores.js");
const rutaRecibir = await import("../../app/api/compras-proveedor/recibir/[id]/route.js");
// La semana se siembra por la ÚNICA puerta que escribe vigencias; las filas se
// van con el local, por la cascada.
const { programarSemanaOperativa, vigenciasDeUbicaciones } = await import(
  "../../lib/semanaOperativa/semanaOperativaServer.js"
);
const { semanaQueContiene } = await import("../../lib/semanaOperativa/semanaOperativa.js");
const { rangoDelPeriodo, sumarDias, diaDeLaSemana } = await import("../../lib/transferencias/periodoDePago.js");
const { hoyArgentinaISO } = await import("../../lib/fechas/rangoArgentina.js");
const rutaObtener = await import("../../app/api/compras-proveedor/obtener/route.js");

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
  // Cierre de compra
  baseId: null,
  turnoDepositoId: null,
  // Gastos económicos (para el Resultado del período)
  categoriaGastoId: null,
  gastoIds: [],
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

  // ── CIERRE DE COMPRA ────────────────────────────────────────────────────
  //
  // Un producto del depósito, para que un pedido tenga algo que entre al
  // stock, y un turno abierto del depósito para pagar en efectivo desde su
  // cajón. El costo del pedido es el mismo del catálogo: acá no se prueba la
  // frontera de costos, que tiene sus propios candados.
  const base = await prisma.productoBase.create({
    data: {
      grupoId: grupo.id,
      nombre: `${marca}-producto`,
      unidad_medida: "unidad",
      precio_costo: 240000,
      precio_venta: 300000,
    },
  });
  creado.baseId = base.id;
  const plDeposito = await prisma.productoLocal.create({
    data: { localId: deposito.id, baseId: base.id, precio_costo: 240000, precio_venta: 300000 },
  });
  const turnoDeposito = await prisma.turno.create({
    data: { localId: deposito.id, vendedorId: usuarioDeposito.id, montoInicial: 0, apertura: new Date() },
  });
  creado.turnoDepositoId = turnoDeposito.id;

  // ── GASTOS ECONÓMICOS DEL PERÍODO EN CURSO ──────────────────────────────
  //
  // Fecha económica = HOY, que cae en el período por defecto (Día, en curso).
  // Tres estados de pago; el total económico suma los tres COMPLETOS. Un gasto
  // de OTRO local no tiene que contar en el resultado de `local`.
  const hoyGasto = new Date();
  const categoriaGasto = await prisma.categoriaGasto.create({ data: { nombre: `${marca}-cat`, orden: 1 } });
  creado.categoriaGastoId = categoriaGasto.id;
  const crearGastoCrudo = async (concepto, total, pagos = [], localDelGasto = local.id) => {
    const g = await prisma.gasto.create({
      data: {
        grupoId: grupo.id,
        localId: localDelGasto,
        categoriaId: categoriaGasto.id,
        concepto: `${marca}-${concepto}`,
        total,
        fecha: hoyGasto,
        creadoPorId: usuarioLocal.id,
        idempotencyKey: `${marca}-${concepto}`,
      },
    });
    creado.gastoIds.push(g.id);
    for (const [i, monto] of pagos.entries()) {
      // Medio no-efectivo: registra el pago sin tocar caja (no hace falta cajón).
      await prisma.pagoGasto.create({
        data: {
          gastoId: g.id,
          monto,
          fecha: hoyGasto,
          medio: "TRANSFERENCIA",
          localOrigenId: localDelGasto,
          usuarioId: usuarioLocal.id,
          idempotencyKey: `${marca}-${concepto}-pago-${i}`,
        },
      });
    }
    return g;
  };
  await crearGastoCrudo("gasto-impago", 100); // impago → cuenta 100
  await crearGastoCrudo("gasto-parcial", 200, [50]); // parcial (pagó 50) → cuenta 200
  await crearGastoCrudo("gasto-pagado", 300, [300]); // pagado → cuenta 300
  await crearGastoCrudo("gasto-ajeno", 999, [], otroLocal.id); // de OTRO local → NO cuenta

  return {
    base,
    plDeposito,
    turnoDeposito,
    proveedor,
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
    await prisma.comprobanteProveedor.deleteMany({ where: { pedidoId: { in: creado.pedidoIds } } });
    await prisma.pedidoProveedor.deleteMany({ where: { id: { in: creado.pedidoIds } } });
  }
  if (creado.baseId) {
    const pls = await prisma.productoLocal.findMany({ where: { baseId: creado.baseId }, select: { id: true } });
    const idsPl = pls.map((p) => p.id);
    if (idsPl.length) await prisma.stockLocal.deleteMany({ where: { productoId: { in: idsPl } } });
    await prisma.productoLocal.deleteMany({ where: { baseId: creado.baseId } });
    await prisma.productoBase.deleteMany({ where: { id: creado.baseId } });
  }
  if (creado.turnoDepositoId) {
    await prisma.cajaMovimiento.deleteMany({ where: { turnoId: creado.turnoDepositoId } });
    await prisma.turno.deleteMany({ where: { id: creado.turnoDepositoId } });
  }
  if (creado.proveedorId) await prisma.proveedor.deleteMany({ where: { id: creado.proveedorId } });
  if (creado.turnoOtroId) {
    await prisma.cajaMovimiento.deleteMany({ where: { turnoId: creado.turnoOtroId } });
    await prisma.turno.deleteMany({ where: { id: creado.turnoOtroId } });
  }
  if (creado.gastoIds.length) {
    await prisma.pagoGasto.deleteMany({ where: { gastoId: { in: creado.gastoIds } } });
    await prisma.gasto.deleteMany({ where: { id: { in: creado.gastoIds } } });
  }
  if (creado.categoriaGastoId) {
    await prisma.categoriaGasto.deleteMany({ where: { id: creado.categoriaGastoId } });
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

  // ── EL RESULTADO DEL PERÍODO · margen − gastos − comisiones ──────────────
  console.log("\n── Resultado del período: gastos económicos");
  const resumen = tableroLocal.resumen || {};
  // Los tres estados cuentan COMPLETOS: 100 + 200 + 300 = 600. El gasto de otro
  // local (999) NO entra.
  ok("gastos del período suman 600 (impago + parcial + pagado, sin el de otro local)", resumen.gastos === 600,
    JSON.stringify({ gastos: resumen.gastos }));
  ok("resultado = margen bruto − gastos − comisiones", Math.round((resumen.resultado) * 100) ===
    Math.round((resumen.margenBruto - resumen.gastos - resumen.comisionesDeCobro) * 100),
    JSON.stringify({ resultado: resumen.resultado, margen: resumen.margenBruto, gastos: resumen.gastos, comis: resumen.comisionesDeCobro }));
  ok("'Ver gastos' abre el módulo en la pestaña Todos y el período", typeof resumen.verGastos === "string" &&
    /\/modulos\/finanzas\/gastos\?/.test(resumen.verGastos) && /estado=TODAS/.test(resumen.verGastos),
    resumen.verGastos);
  ok("gastos y resultado ya no figuran como 'no disponible'",
    !(resumen.noDisponible || []).some((m) => m.clave === "gastosOperativos" || m.clave === "resultadoReal"),
    JSON.stringify((resumen.noDisponible || []).map((m) => m.clave)));

  // §18 · el conjunto que suma el Resumen coincide con el de la lista TODAS.
  const { totalEconomicoDeGastos, listarGastos } = await import("../../lib/finanzas/gastosServer.js");
  const rangoGastos = { desde: tableroLocal.periodo.rango.desde, hasta: tableroLocal.periodo.rango.hasta };
  const sumaDominio = await totalEconomicoDeGastos(prisma, { grupoId: f.grupo.id, localIds: [f.local.id], rango: rangoGastos });
  ok("totalEconomicoDeGastos coincide con el resumen", sumaDominio.total === resumen.gastos,
    JSON.stringify({ dominio: sumaDominio.total, resumen: resumen.gastos }));
  const listaTodas = await listarGastos(prisma, {
    grupoId: f.grupo.id,
    localIds: [f.local.id],
    filtros: { estado: "TODAS", fechaDesde: rangoGastos.desde, fechaHasta: rangoGastos.hasta, page: 1, pageSize: 100, skip: 0, take: 100 },
  });
  const sumaLista = listaTodas.gastos.reduce((a, g) => a + Math.round(Number(g.total) * 100), 0);
  ok("la lista 'Todos' del mismo período suma exactamente lo mismo", sumaLista === Math.round(resumen.gastos * 100),
    JSON.stringify({ lista: sumaLista, resumen: Math.round(resumen.gastos * 100) }));

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

// ── LA SEMANA DE FINANZAS ES LA SEMANA OPERATIVA DE LA UBICACIÓN ──────────
//
// Por el handler real: la ruta lee las vigencias de PostgreSQL y el rango que
// devuelve tiene que ser exactamente el que contesta la fuente canónica con esas
// mismas filas, para el local consultado y no para otro.

const periodoDe = async (sesion, destino, unidad, desplazamiento = 0) =>
  leer(
    rutaTablero.GET(
      pedido(`http://ci/api/finanzas/tablero?destino=${destino}&unidad=${unidad}&desplazamiento=${desplazamiento}`, sesion)
    )
  );

async function correrSemana(f) {
  const sesionDeposito = token(f.usuarioDeposito.id, f.deposito.id);
  const hoy = hoyArgentinaISO();

  console.log("\n── Semana: ubicación SIN CONFIGURAR");
  const sinConfig = await periodoDe(sesionDeposito, f.local.id, "SEMANA");
  ok("responde 200", sinConfig.status === 200 && sinConfig.ok === true, sinConfig.error);
  ok("queda marcada sinConfigurar, con el domingo de la fuente canónica", sinConfig.local?.sinConfigurar === true && sinConfig.local?.diaDeCorte === 0,
    JSON.stringify(sinConfig.local));
  const canonicaSin = semanaQueContiene({ vigencias: [], fecha: hoy });
  ok("el rango es el de la fuente canónica sin vigencias", sinConfig.periodo?.rango?.desde === canonicaSin.desde && sinConfig.periodo?.rango?.hasta === canonicaSin.hasta,
    JSON.stringify(sinConfig.periodo?.rango));

  console.log("\n── Semana: el local corta MIÉRCOLES");
  await prisma.$transaction((tx) => programarSemanaOperativa(tx, { localId: f.local.id, diaDeCorte: 3, usuarioId: f.usuarioDeposito.id }));
  const miercoles = await periodoDe(sesionDeposito, f.local.id, "SEMANA");
  ok("ya no está sinConfigurar, y corta miércoles", miercoles.local?.sinConfigurar === false && miercoles.local?.diaDeCorte === 3, JSON.stringify(miercoles.local));
  ok("su semana arranca un miércoles", diaDeLaSemana(miercoles.periodo?.rango?.desde) === 3, JSON.stringify(miercoles.periodo?.rango));
  const canonicaMie = semanaQueContiene({ vigencias: [{ diaDeCorte: 3, vigenteDesde: null }], fecha: hoy });
  ok("es exactamente la semana canónica del local", miercoles.periodo?.rango?.desde === canonicaMie.desde && miercoles.periodo?.rango?.hasta === canonicaMie.hasta);
  ok("la descripción viaja con el mismo rango", JSON.stringify(miercoles.periodo?.descripcion?.rango) === JSON.stringify(miercoles.periodo?.rango));

  console.log("\n── Semana: dos ubicaciones, el mismo día, semanas distintas");
  const delDeposito = await periodoDe(sesionDeposito, f.deposito.id, "SEMANA");
  ok("el depósito, sin configurar, sigue en domingo", delDeposito.status === 200 && delDeposito.local?.sinConfigurar === true && diaDeLaSemana(delDeposito.periodo?.rango?.desde) === 0,
    `${delDeposito.status} ${delDeposito.error} ${JSON.stringify(delDeposito.periodo?.rango)}`);
  ok("y su semana no es la del local", delDeposito.periodo?.rango?.desde !== miercoles.periodo?.rango?.desde);

  console.log("\n── Semana: DIA y MES no cambian con la semana del local");
  for (const unidad of ["DIA", "MES"]) {
    for (const desplazamiento of [0, -1]) {
      const r = await periodoDe(sesionDeposito, f.local.id, unidad, desplazamiento);
      let esperado = rangoDelPeriodo({ unidad, hoy });
      for (let i = 0; i < -desplazamiento; i++) esperado = rangoDelPeriodo({ unidad, hoy: sumarDias(esperado.desde, -1) });
      ok(`${unidad} ${desplazamiento}: el mismo rango de siempre`, JSON.stringify(r.periodo?.rango) === JSON.stringify(esperado),
        `${JSON.stringify(r.periodo?.rango)} ≠ ${JSON.stringify(esperado)}`);
    }
  }

  console.log("\n── Semana: un cambio de corte en el pasado, con su semana larga");
  // El cambio se programó hace un mes —`hoy` inyectado en la puerta canónica— y
  // rige desde un miércoles de hace tres semanas: pasa a viernes, así que del
  // miércoles D al jueves D+8 es UNA semana de nueve días.
  const inicioActual = canonicaMie.desde;
  const D = sumarDias(inicioActual, -21);
  await prisma.$transaction((tx) =>
    programarSemanaOperativa(tx, { localId: f.local.id, diaDeCorte: 5, desde: D, hoy: sumarDias(D, -10), usuarioId: f.usuarioDeposito.id })
  );
  const vigencias = (await vigenciasDeUbicaciones(prisma, [f.local.id])).get(f.local.id) || [];
  ok("el local tiene las dos vigencias", vigencias.length === 2, JSON.stringify(vigencias));

  // Hacia atrás, semana por semana: cada rango de la ruta es el que la fuente
  // canónica dice que contiene el día anterior al inicio del que le sigue.
  let esperado = semanaQueContiene({ vigencias, fecha: hoy });
  let vioLaLarga = false;
  for (let desplazamiento = 0; desplazamiento >= -6; desplazamiento--) {
    const r = await periodoDe(sesionDeposito, f.local.id, "SEMANA", desplazamiento);
    ok(`semana ${desplazamiento}: es la canónica ${esperado.desde} → ${esperado.hasta}`,
      r.periodo?.rango?.desde === esperado.desde && r.periodo?.rango?.hasta === esperado.hasta,
      JSON.stringify(r.periodo?.rango));
    if (esperado.transicion) {
      vioLaLarga = true;
      ok("la semana larga mide nueve días, del miércoles D al jueves D+8", esperado.desde === D && esperado.hasta === sumarDias(D, 8));
    }
    esperado = semanaQueContiene({ vigencias, fecha: sumarDias(esperado.desde, -1) });
  }
  ok("el recorrido pasó por la semana larga", vioLaLarga);
}

// ── PAGOS A PROVEEDORES ───────────────────────────────────────────────────
//
// La cuenta nace por la capa canónica —la misma que va a llamar "Cerrar
// compra"— y todo lo demás pasa por los handlers reales.

const ESCRITURA_FIN = ["finanzas.ver", PERMISO_REGISTRAR_PAGOS];

// Cada envío es un intento nuevo salvo que el caso traiga su clave: así los
// casos de arriba no dependen de la idempotencia y los de reintento la nombran.
let intento = 0;
async function pagar(cuentaId, sesion, datos) {
  intento += 1;
  const cuerpo = { idempotencyKey: `${marca}-intento-${intento}`, ...datos };
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

// El detalle entero del turno y el resumen del tablero del local: los dos
// lugares donde `clasificarMovimientos` decide si un retiro es manual.
const detalleDelTurno = (turnoId, sesion) =>
  leer(rutaTurno.GET(pedido(`http://ci/api/finanzas/turno/${turnoId}`, sesion), paramsTurno(turnoId)));
const tableroDelLocal = (sesion) =>
  leer(rutaTablero.GET(pedido("http://ci/api/finanzas/tablero?entrada=1", sesion)));

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
  // EFECTIVO CRUZADO: el turno es la caja de OTRA ubicación. Es 403 —como un
  // origen ajeno— y no 409, que queda para un cajón propio que ya cerró.
  const movsOtroAntesCruce = await movimientosDe(f.turnoOtro.id);
  const turnoAjeno = await pagar(cuentaA.id, localEscribe, {
    monto: 100000,
    medio: "EFECTIVO",
    turnoId: f.turnoOtro.id,
  });
  ok("efectivo desde el turno de otra ubicación → 403", turnoAjeno.status === 403, `${turnoAjeno.status} ${turnoAjeno.error}`);
  ok("y cero retiro en ese turno", (await movimientosDe(f.turnoOtro.id)) === movsOtroAntesCruce);

  const esperadoAntes = await esperadoDelTurno(f.turno.id, localEscribe);
  const detalleAntesEf = await detalleDelTurno(f.turno.id, localEscribe);
  const tableroAntesEf = await tableroDelLocal(localEscribe);
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

  // ── EL RETIRO DEL PAGO ES UN PAGO, NO UN RETIRO MANUAL ──────────────────
  //
  // Las dos rutas preguntan por `PagoProveedor.cajaMovimientoId` con la forma
  // exacta que usan en producción. El motivo no interviene: lo que se afirma es
  // la clase que sale del vínculo.
  const detalleDespuesEf = await detalleDelTurno(f.turno.id, localEscribe);
  const tableroDespuesEf = await tableroDelLocal(localEscribe);
  const movEnDetalle = (detalleDespuesEf.movimientos || []).find((m) => m.id === mov?.id);
  ok(
    "el detalle del turno lo clasifica PAGO_PROVEEDOR",
    movEnDetalle?.clase === "PAGO_PROVEEDOR",
    `clase ${movEnDetalle?.clase}`
  );
  ok(
    "el turno no lo suma a los retiros manuales",
    Math.round(detalleDespuesEf.caja?.retiros * 100) === Math.round(detalleAntesEf.caja?.retiros * 100),
    `${detalleAntesEf.caja?.retiros} → ${detalleDespuesEf.caja?.retiros}`
  );
  ok(
    "pero el esperado del turno lo resta una sola vez",
    Math.round((detalleDespuesEf.esperado?.retiros - detalleAntesEf.esperado?.retiros) * 100) === 10000000,
    `${detalleAntesEf.esperado?.retiros} → ${detalleDespuesEf.esperado?.retiros}`
  );
  ok(
    "el resumen del tablero no lo suma a los retiros manuales",
    tableroDespuesEf.status === 200 &&
      Math.round(tableroDespuesEf.resumen?.caja?.retiros * 100) ===
        Math.round(tableroAntesEf.resumen?.caja?.retiros * 100),
    `${tableroDespuesEf.status} ${tableroAntesEf.resumen?.caja?.retiros} → ${tableroDespuesEf.resumen?.caja?.retiros}`
  );

  // ── CADA UBICACIÓN PAGA SUS DEUDAS ─────────────────────────────────────
  //
  // Esta sección afirmaba lo contrario —"el depósito puede pagar la cuenta del
  // local"— y es la regla que se corrigió: ninguna ubicación paga deudas de
  // otra, ni con su plata ni con la plata de la otra.
  console.log("\n── Pagos: el depósito NO paga lo de Casiano");
  const cruce = async (titulo, sesion, datos, esperado = 403) => {
    const pagosAntes = await prisma.pagoProveedor.count({ where: { cuentaId: cuentaA.id } });
    const movsDep = await movimientosDe(f.turnoDeposito.id);
    const movsLoc = await movimientosDe(f.turno.id);
    const r = await pagar(cuentaA.id, sesion, datos);
    ok(`${titulo} → ${esperado}`, r.status === esperado, `${r.status} ${r.error}`);
    ok(`${titulo}: ningún pago nuevo`, (await prisma.pagoProveedor.count({ where: { cuentaId: cuentaA.id } })) === pagosAntes);
    ok(
      `${titulo}: ningún retiro`,
      (await movimientosDe(f.turnoDeposito.id)) === movsDep && (await movimientosDe(f.turno.id)) === movsLoc
    );
    const cuentaDespues = await abrir(cuentaA.id, localEscribe);
    ok(`${titulo}: el saldo no se movió`, cuentaDespues.cuenta?.saldo === 85300);
  };
  await cruce("depósito con fondos del depósito", depositoEscribe, {
    monto: 85300,
    medio: "TRANSFERENCIA",
    localOrigenId: f.deposito.id,
  });
  await cruce("depósito con fondos de Casiano (no opera Casiano)", depositoEscribe, {
    monto: 85300,
    medio: "TRANSFERENCIA",
    localOrigenId: f.local.id,
  });
  await cruce("depósito sin decir el origen", depositoEscribe, { monto: 85300, medio: "OTRO" });
  await cruce("depósito en efectivo desde su turno", depositoEscribe, {
    monto: 85300,
    medio: "EFECTIVO",
    turnoId: f.turnoDeposito.id,
  });
  await cruce("depósito en efectivo desde el turno de Casiano", depositoEscribe, {
    monto: 85300,
    medio: "EFECTIVO",
    turnoId: f.turno.id,
  });
  // Admin en vista global: ve todo y no opera ninguna ubicación.
  const adminGlobal =
    jwt.sign(
      { id: f.usuarioDeposito.id, nombre: "CI admin", email: "admin-global@ci.local", localId: null, permisos: ["*"] },
      SECRETO,
      { expiresIn: "1h" }
    );
  const cookiesGlobal = `erpazul_sesion=${adminGlobal}; erpazul_grupo_activo=${f.grupo.id}; erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ global: true }))}`;
  const pedidoGlobal = (url, metodo = "GET", cuerpo) =>
    new Request(url, {
      method: metodo,
      headers: { cookie: cookiesGlobal, "content-type": "application/json" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  const vistaGlobal = await leer(rutaCuenta.GET(pedidoGlobal(`http://ci/api/finanzas/pagos-proveedores/${cuentaA.id}`), paramsCuenta(cuentaA.id)));
  ok("admin global VE la cuenta de Casiano", vistaGlobal.status === 200 && vistaGlobal.ok, vistaGlobal.error);
  ok("pero la pantalla sabe que no puede pagarla", vistaGlobal.puedePagar === false && vistaGlobal.puedeEscribir === true);
  const pagosAntesGlobal = await prisma.pagoProveedor.count({ where: { cuentaId: cuentaA.id } });
  const pagoGlobal = await leer(
    rutaPagos.POST(
      pedidoGlobal(`http://ci/api/finanzas/pagos-proveedores/${cuentaA.id}/pagos`, "POST", {
        monto: 85300,
        medio: "TRANSFERENCIA",
        localOrigenId: f.local.id,
        idempotencyKey: `${marca}-admin-global`,
      }),
      paramsCuenta(cuentaA.id)
    )
  );
  ok("admin global sin operar Casiano → 403", pagoGlobal.status === 403, `${pagoGlobal.status} ${pagoGlobal.error}`);
  ok("admin global: ningún pago", (await prisma.pagoProveedor.count({ where: { cuentaId: cuentaA.id } })) === pagosAntesGlobal);
  const vistaDeposito = await abrir(cuentaA.id, depositoEscribe);
  ok("el depósito VE la cuenta de Casiano, sin botón de pagar", vistaDeposito.status === 200 && vistaDeposito.puedePagar === false);

  console.log("\n── Pagos: Casiano paga lo de Casiano");
  const p3 = await pagar(cuentaA.id, localEscribe, { monto: 85300, medio: "TRANSFERENCIA" });
  ok("Casiano paga su deuda", p3.status === 200 && p3.ok, p3.error);
  ok("pago final → saldo $0", p3.cuenta?.saldo === 0);
  ok("pago final → PAGADA", p3.cuenta?.estado === "PAGADA");
  ok("el dinero salió de Casiano", p3.pago?.origen?.id === f.local.id);
  ok("el gasto es de Casiano", p3.cuenta?.localGasto?.id === f.local.id);
  const saldada = await pagar(cuentaA.id, localEscribe, { monto: 1, medio: "TRANSFERENCIA" });
  ok("una cuenta pagada no admite más pagos", saldada.status === 400, `${saldada.status} ${saldada.error}`);

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
    "el historial dice de dónde salió cada pago, y todos salieron de Casiano",
    final.pagos?.length > 0 && final.pagos.every((p) => p.origen?.id === f.local.id)
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

  console.log("\n── Pagos: idempotencia del intento");
  // Una cuenta propia para estos casos, así los números de arriba no se mueven.
  const pedidoReintento = await prisma.pedidoProveedor.create({
    data: {
      grupoId: f.grupo.id,
      depositoId: f.deposito.id,
      proveedorId: creado.proveedorId,
      estado: "RECIBIDO",
    },
  });
  creado.pedidoIds.push(pedidoReintento.id);
  const { cuenta: cuentaR } = await prisma.$transaction((tx) =>
    crearCuentaPorPagarDesdeCompra(tx, {
      pedidoProveedorId: pedidoReintento.id,
      localGastoId: f.local.id,
      total: 1000,
      usuarioId: f.usuarioDeposito.id,
    })
  );
  const pagosDe = (cuentaId) => prisma.pagoProveedor.count({ where: { cuentaId } });

  const sinClave = await pagar(cuentaR.id, localEscribe, {
    monto: 10,
    medio: "TRANSFERENCIA",
    idempotencyKey: undefined,
  });
  ok("un pago sin clave de intento se rechaza", sinClave.status === 400, sinClave.error);

  const tr = { monto: 100, medio: "TRANSFERENCIA", idempotencyKey: `${marca}-reintento-tr` };
  const tr1 = await pagar(cuentaR.id, localEscribe, tr);
  const tr2 = await pagar(cuentaR.id, localEscribe, tr);
  ok("el primer envío de la transferencia registra", tr1.status === 200 && tr1.repetido === false, tr1.error);
  ok("el reintento contesta 200 y repetido", tr2.status === 200 && tr2.repetido === true, tr2.error);
  ok("el reintento devuelve EL MISMO pago", tr2.pago?.id === tr1.pago?.id);
  ok("retry de transferencia → un solo PagoProveedor", (await pagosDe(cuentaR.id)) === 1);
  ok("y el saldo bajó una sola vez", tr2.cuenta?.saldo === 900);

  const ef = {
    monto: 200,
    medio: "EFECTIVO",
    turnoId: f.turno.id,
    idempotencyKey: `${marca}-reintento-ef`,
  };
  const movsAntesR = await movimientosDe(f.turno.id);
  // Los dos a la vez, que es el doble clic de verdad: el lock de la cuenta los
  // pone en fila y el segundo encuentra al primero.
  const [ef1, ef2] = await Promise.all([
    pagar(cuentaR.id, localEscribe, ef),
    pagar(cuentaR.id, localEscribe, ef),
  ]);
  const ef3 = await pagar(cuentaR.id, localEscribe, ef);
  ok(
    "los dos envíos simultáneos del efectivo contestan 200",
    ef1.status === 200 && ef2.status === 200,
    `${ef1.status} ${ef1.error || ""} / ${ef2.status} ${ef2.error || ""}`
  );
  ok(
    "uno solo de los dos registró; el otro es repetido",
    [ef1.repetido, ef2.repetido].filter((x) => x === true).length === 1
  );
  ok("los tres envíos devuelven el mismo pago", ef1.pago?.id === ef2.pago?.id && ef2.pago?.id === ef3.pago?.id);
  ok("retry de efectivo → un solo PagoProveedor más", (await pagosDe(cuentaR.id)) === 2);
  ok("retry de efectivo → un solo CajaMovimiento", (await movimientosDe(f.turno.id)) === movsAntesR + 1);
  ok("el saldo bajó una sola vez por el efectivo", ef3.cuenta?.saldo === 700);

  const otra1 = await pagar(cuentaR.id, localEscribe, {
    monto: 300,
    medio: "OTRO",
    idempotencyKey: `${marca}-clave-a`,
  });
  const otra2 = await pagar(cuentaR.id, localEscribe, {
    monto: 300,
    medio: "OTRO",
    idempotencyKey: `${marca}-clave-b`,
  });
  ok(
    "dos claves distintas son dos pagos válidos",
    otra1.status === 200 && otra2.status === 200 && otra1.pago?.id !== otra2.pago?.id,
    `${otra1.error || ""} ${otra2.error || ""}`
  );
  ok("con el saldo que alcanza", otra2.cuenta?.saldo === 100 && (await pagosDe(cuentaR.id)) === 4);
  const otra3 = await pagar(cuentaR.id, localEscribe, {
    monto: 300,
    medio: "OTRO",
    idempotencyKey: `${marca}-clave-c`,
  });
  ok("una tercera clave ya no entra si no alcanza el saldo", otra3.status === 400, otra3.error);

  // El reintento del pago que SALDÓ la cuenta. Es el caso que el UNIQUE solo no
  // cubre: sin la relectura por clave, el segundo envío chocaría antes con
  // "esta cuenta ya está pagada" y quien reintenta creería que falló.
  const queSalda = { monto: 100, medio: "TRANSFERENCIA", idempotencyKey: `${marca}-salda` };
  const salda1 = await pagar(cuentaR.id, localEscribe, queSalda);
  const salda2 = await pagar(cuentaR.id, localEscribe, queSalda);
  ok("el pago que salda registra", salda1.status === 200 && salda1.cuenta?.estado === "PAGADA", salda1.error);
  ok(
    "su reintento devuelve ese pago, no 'ya está pagada'",
    salda2.status === 200 && salda2.repetido === true && salda2.pago?.id === salda1.pago?.id,
    `${salda2.status} ${salda2.error || ""}`
  );

  console.log("\n── Pagos: Admin por *");
  const pagadas = await leer(
    rutaCuentas.GET(pedido("http://ci/api/finanzas/pagos-proveedores?estado=PAGADAS", admin))
  );
  ok("admin lee la lista", pagadas.status === 200 && pagadas.ok, pagadas.error);
  ok("admin ve la cuenta pagada", pagadas.cuentas?.some((c) => c.id === cuentaA.id));
  // Admin operando el DEPÓSITO no paga la cuenta del otro local: `*` le da el
  // permiso, no la ubicación. Esta prueba afirmaba antes lo contrario.
  const pagosBAntes = await prisma.pagoProveedor.count({ where: { cuentaId: cuentaB.id } });
  const pAdminCruzado = await pagar(cuentaB.id, admin, {
    monto: 500,
    medio: "MERCADO_PAGO",
    localOrigenId: f.deposito.id,
  });
  ok("admin operando el depósito no paga la deuda de otro local → 403", pAdminCruzado.status === 403, pAdminCruzado.error);
  ok("admin cruzado: ningún pago", (await prisma.pagoProveedor.count({ where: { cuentaId: cuentaB.id } })) === pagosBAntes);
  // Operando la ubicación que debe, paga, y la plata sale de ahí.
  const adminEnElOtro = token(f.usuarioDeposito.id, f.otroLocal.id, ["*"]);
  const pAdmin = await pagar(cuentaB.id, adminEnElOtro, { monto: 500, medio: "MERCADO_PAGO" });
  ok("admin operando la ubicación que debe registra el pago", pAdmin.status === 200 && pAdmin.cuenta?.saldo === 500, pAdmin.error);
  ok("y la plata sale de esa ubicación", pAdmin.pago?.origen?.id === f.otroLocal.id);

  console.log("\n── Pagos: la regla vive en la función canónica");
  // Directo contra `registrarPagoProveedor`, sin la ruta adelante: la última
  // defensa tiene que rechazar sola, y sin dejar nada escrito.
  const pedidoDep = await prisma.pedidoProveedor.create({
    data: { grupoId: f.grupo.id, depositoId: f.deposito.id, proveedorId: creado.proveedorId, estado: "RECIBIDO" },
  });
  creado.pedidoIds.push(pedidoDep.id);
  const { cuenta: cuentaDep } = await prisma.$transaction((tx) =>
    crearCuentaPorPagarDesdeCompra(tx, {
      pedidoProveedorId: pedidoDep.id,
      localGastoId: f.deposito.id,
      total: 1000,
      usuarioId: f.usuarioDeposito.id,
    })
  );
  const directo = async (titulo, args) => {
    const movs = (await movimientosDe(f.turno.id)) + (await movimientosDe(f.turnoDeposito.id));
    let error = null;
    try {
      await prisma.$transaction((tx) =>
        registrarPagoProveedor(tx, {
          cuentaId: cuentaDep.id,
          monto: 100,
          medio: "TRANSFERENCIA",
          usuarioId: f.usuarioLocal.id,
          idempotencyKey: `${marca}-directo-${titulo}`,
          ...args,
        })
      );
    } catch (e) {
      error = e;
    }
    ok(`${titulo} → 403`, error instanceof ErrorPagoProveedor && error.status === 403, String(error?.message));
    ok(`${titulo}: ningún pago`, (await prisma.pagoProveedor.count({ where: { cuentaId: cuentaDep.id } })) === 0);
    ok(
      `${titulo}: ningún retiro`,
      (await movimientosDe(f.turno.id)) + (await movimientosDe(f.turnoDeposito.id)) === movs
    );
  };
  await directo("un local paga la deuda del depósito con su plata", {
    localOrigenId: f.local.id,
    localOperativoId: f.local.id,
  });
  await directo("el depósito paga su deuda con plata de un local", {
    localOrigenId: f.local.id,
    localOperativoId: f.deposito.id,
  });
  await directo("plata del depósito registrada por quien opera un local", {
    localOrigenId: f.deposito.id,
    localOperativoId: f.local.id,
  });
  await directo("efectivo del depósito con el turno de un local", {
    medio: "EFECTIVO",
    turnoId: f.turno.id,
    localOrigenId: f.deposito.id,
    localOperativoId: f.deposito.id,
  });
  const localContraDeposito = await pagar(cuentaDep.id, localEscribe, { monto: 100, medio: "TRANSFERENCIA" });
  ok("por la ruta: un local no paga la deuda del depósito → 403", localContraDeposito.status === 403, localContraDeposito.error);
}

// ── CIERRE DE COMPRA CON PAGO AL PROVEEDOR ─────────────────────────────────
//
// Por el handler REAL de `recibir/[id]`: la mercadería, la compra, la cuenta y
// el pago inicial en una sola transacción.

const COMPRAS = ["compras.ver", "compras.crear"];

async function pedidoParaCerrar(f, { owner, totales = [], cantidad = 2 }) {
  const pedido = await prisma.pedidoProveedor.create({
    data: {
      grupoId: f.grupo.id,
      depositoId: f.deposito.id,
      creadoEnLocalId: owner,
      proveedorId: f.proveedor.id,
      estado: "ENVIADO",
      detalles: {
        create: [{ productoLocalId: f.plDeposito.id, cantidad, unidad: "UNIDAD", precioCosto: 240000 }],
      },
    },
    include: { detalles: { select: { id: true } } },
  });
  creado.pedidoIds.push(pedido.id);
  for (const t of totales) {
    await prisma.comprobanteProveedor.create({
      data: {
        grupoId: f.grupo.id,
        proveedorId: f.proveedor.id,
        pedidoId: pedido.id,
        localOperativoId: owner,
        estado: t == null ? "SIN_TOTAL" : "CARGADO",
        totalLeido: t,
      },
    });
  }
  return { pedidoId: pedido.id, detId: pedido.detalles[0].id, cantidad };
}

async function cerrar(sesion, p, pagoAlProveedor) {
  return leer(
    rutaRecibir.POST(
      conCuerpo(`http://ci/api/compras-proveedor/recibir/${p.pedidoId}`, sesion, "POST", {
        recibidos: { [p.detId]: p.cantidad },
        fisicas: { [p.detId]: p.cantidad },
        pagoAlProveedor,
      }),
      { params: Promise.resolve({ id: String(p.pedidoId) }) }
    )
  );
}

async function stockDe(localId, baseId) {
  const pl = await prisma.productoLocal.findUnique({
    where: { localId_baseId: { localId, baseId } },
    select: { id: true },
  });
  if (!pl) return 0;
  const s = await prisma.stockLocal.findUnique({
    where: { localId_productoId: { localId, productoId: pl.id } },
    select: { cantidad: true },
  });
  return Number(s?.cantidad || 0);
}

async function estadoDelCierre(pedidoId) {
  const [pedido, cuenta] = await Promise.all([
    prisma.pedidoProveedor.findUnique({ where: { id: pedidoId }, select: { estado: true, totalReal: true, totalFactura: true } }),
    prisma.cuentaPorPagarProveedor.findUnique({
      where: { pedidoProveedorId: pedidoId },
      select: { id: true, total: true, localGastoId: true, pagos: { select: { id: true, monto: true, localOrigenId: true, cajaMovimientoId: true } } },
    }),
  ]);
  return { pedido, cuenta };
}

async function correrCierre(f) {
  const deposito = token(f.usuarioDeposito.id, f.deposito.id, [...COMPRAS, PERMISO_REGISTRAR_PAGOS]);
  const localConPago = token(f.usuarioLocal.id, f.local.id, [...COMPRAS, PERMISO_REGISTRAR_PAGOS]);
  const localSinPago = token(f.usuarioLocal.id, f.local.id, COMPRAS);
  const baseId = f.base.id;

  console.log("\n── Cierre: 1 · factura $485.300, PENDIENTE");
  const p1 = await pedidoParaCerrar(f, { owner: f.deposito.id, totales: [485300] });
  const stockAntes1 = await stockDe(f.deposito.id, baseId);
  const r1 = await cerrar(deposito, p1, { estado: "PENDIENTE", vencimientoProveedor: "2026-10-15" });
  const e1 = await estadoDelCierre(p1.pedidoId);
  ok("el cierre responde 200", r1.status === 200 && r1.ok, r1.error);
  ok("la compra queda RECIBIDA", e1.pedido.estado === "RECIBIDO");
  ok("entró la mercadería", (await stockDe(f.deposito.id, baseId)) === stockAntes1 + 2);
  ok("la cuenta es de $485.300", Number(e1.cuenta?.total) === 485300);
  ok("sin pagos", e1.cuenta?.pagos.length === 0);
  ok("saldo $485.300 y PENDIENTE", r1.cuentaPorPagar?.saldo === 485300 && r1.cuentaPorPagar?.estado === "PENDIENTE");
  ok("el gasto es de la ubicación dueña del pedido", e1.cuenta?.localGastoId === f.deposito.id);
  ok("totalReal de la compra es la deuda", Number(e1.pedido.totalReal) === 485300);
  ok("el vencimiento del proveedor viajó", r1.cuentaPorPagar?.vencimientoProveedor === "2026-10-15");

  console.log("\n── Cierre: 2 · PARCIAL $300.000 por transferencia");
  const p2 = await pedidoParaCerrar(f, { owner: f.deposito.id, totales: [485300] });
  const r2 = await cerrar(deposito, p2, {
    estado: "PARCIAL",
    pago: { monto: "300000", medio: "TRANSFERENCIA", localOrigenId: f.deposito.id },
  });
  ok("el cierre parcial responde 200", r2.status === 200 && r2.ok, r2.error);
  ok("cuenta $485.300, saldo $185.300, PARCIAL",
    r2.cuentaPorPagar?.total === 485300 && r2.cuentaPorPagar?.saldo === 185300 && r2.cuentaPorPagar?.estado === "PARCIAL");
  const e2 = await estadoDelCierre(p2.pedidoId);
  ok("un pago de $300.000", e2.cuenta?.pagos.length === 1 && Number(e2.cuenta.pagos[0].monto) === 300000);

  console.log("\n── Cierre: 3 · PAGADA");
  const p3 = await pedidoParaCerrar(f, { owner: f.deposito.id, totales: [485300] });
  const r3 = await cerrar(deposito, p3, {
    estado: "PAGADA",
    pago: { medio: "MERCADO_PAGO", localOrigenId: f.deposito.id },
  });
  ok("el cierre pagado responde 200", r3.status === 200 && r3.ok, r3.error);
  ok("pago $485.300, saldo $0, PAGADA",
    r3.cuentaPorPagar?.pagado === 485300 && r3.cuentaPorPagar?.saldo === 0 && r3.cuentaPorPagar?.estado === "PAGADA");

  console.log("\n── Cierre: 4 · productos $480.000, factura $511.968,28");
  const p4 = await pedidoParaCerrar(f, { owner: f.deposito.id, totales: [511968.28] });
  const r4 = await cerrar(deposito, p4, { estado: "PENDIENTE" });
  const e4 = await estadoDelCierre(p4.pedidoId);
  ok("el control interno sigue siendo $480.000", Number(e4.pedido.totalFactura) === 480000, String(e4.pedido.totalFactura));
  ok("la deuda es EXACTA la factura: $511.968,28", Number(e4.cuenta?.total) === 511968.28 && r4.cuentaPorPagar?.total === 511968.28);

  console.log("\n── Cierre: 5 · varias facturas");
  const p5 = await pedidoParaCerrar(f, { owner: f.deposito.id, totales: [300000.1, 211968.18] });
  const r5 = await cerrar(deposito, p5, { estado: "PENDIENTE" });
  ok("la deuda es la suma de las facturas", r5.cuentaPorPagar?.total === 511968.28, JSON.stringify(r5.cuentaPorPagar));

  console.log("\n── Cierre: 6 · una factura sin total impreso");
  const p6 = await pedidoParaCerrar(f, { owner: f.deposito.id, totales: [300000, null] });
  const stockAntes6 = await stockDe(f.deposito.id, baseId);
  const sinTotal = await cerrar(deposito, p6, { estado: "PENDIENTE" });
  ok("sin total confirmado no cierra", sinTotal.status === 400 && sinTotal.pideTotal === true, sinTotal.error);
  const escritoSinConfirmar = await cerrar(deposito, p6, { estado: "PENDIENTE", totalAPagar: "511.968,28" });
  ok("escrito pero sin confirmar tampoco", escritoSinConfirmar.status === 400);
  ok("y no quedó nada a medias",
    (await estadoDelCierre(p6.pedidoId)).pedido.estado === "ENVIADO" && (await stockDe(f.deposito.id, baseId)) === stockAntes6);
  const conTotal = await cerrar(deposito, p6, {
    estado: "PENDIENTE",
    totalAPagar: "511.968,28",
    totalConfirmado: true,
  });
  const e6 = await estadoDelCierre(p6.pedidoId);
  ok("confirmado, cierra", conTotal.status === 200 && conTotal.ok, conTotal.error);
  ok("con la deuda confirmada, no la suma de las que traían total",
    Number(e6.cuenta?.total) === 511968.28 && Number(e6.pedido.totalReal) === 511968.28);

  // Afirmaba antes "gasto del local, dinero del depósito". Esa es la regla que
  // se corrigió: la compra del local la paga el local, con su plata.
  console.log("\n── Cierre: 7 · la compra del local la paga el local");
  const p7 = await pedidoParaCerrar(f, { owner: f.local.id, totales: [50000] });
  const r7 = await cerrar(localConPago, p7, { estado: "PENDIENTE" });
  ok("el local cierra su compra", r7.status === 200 && r7.ok, r7.error);
  ok("entró al stock del local", (await stockDe(f.local.id, baseId)) === 2);
  const pAjeno = await pedidoParaCerrar(f, { owner: f.local.id, totales: [1000] });
  const stockAntesAjeno = await stockDe(f.local.id, baseId);
  const origenAjenoAlCerrar = await cerrar(localConPago, pAjeno, {
    estado: "PAGADA",
    pago: { medio: "TRANSFERENCIA", localOrigenId: f.deposito.id },
  });
  const eAjeno = await estadoDelCierre(pAjeno.pedidoId);
  ok("al cerrar, un local no puede pagar con plata del depósito → 403", origenAjenoAlCerrar.status === 403, origenAjenoAlCerrar.error);
  ok("y no se cerró nada", eAjeno.pedido.estado === "ENVIADO" && eAjeno.cuenta === null && (await stockDe(f.local.id, baseId)) === stockAntesAjeno);
  const depositoIntenta = await pagar(r7.cuentaPorPagar.id, token(f.usuarioDeposito.id, f.deposito.id, ESCRITURA_FIN), {
    monto: 50000,
    medio: "TRANSFERENCIA",
    localOrigenId: f.deposito.id,
  });
  ok("el depósito NO la paga desde Finanzas → 403", depositoIntenta.status === 403, depositoIntenta.error);
  ok("sin pago", (await estadoDelCierre(p7.pedidoId)).cuenta?.pagos.length === 0);
  const localPaga = await pagar(r7.cuentaPorPagar.id, token(f.usuarioLocal.id, f.local.id, ESCRITURA_FIN), {
    monto: 50000,
    medio: "TRANSFERENCIA",
  });
  const e7 = await estadoDelCierre(p7.pedidoId);
  ok("el local la paga desde Finanzas", localPaga.status === 200, localPaga.error);
  ok("localGastoId = el local", e7.cuenta?.localGastoId === f.local.id);
  ok("localOrigenId = el local", e7.cuenta?.pagos[0]?.localOrigenId === f.local.id);

  console.log("\n── Cierre: 8 y 10 · efectivo, con doble envío y reintento");
  const p8 = await pedidoParaCerrar(f, { owner: f.deposito.id, totales: [485300] });
  const stockAntes8 = await stockDe(f.deposito.id, baseId);
  const movsAntes8 = await movimientosDe(f.turnoDeposito.id);
  const pagadaEfectivo = {
    estado: "PAGADA",
    pago: { medio: "EFECTIVO", localOrigenId: f.deposito.id, turnoId: f.turnoDeposito.id },
  };
  const [a8, b8] = await Promise.all([cerrar(deposito, p8, pagadaEfectivo), cerrar(deposito, p8, pagadaEfectivo)]);
  const c8 = await cerrar(deposito, p8, pagadaEfectivo);
  const e8 = await estadoDelCierre(p8.pedidoId);
  ok("los dos envíos simultáneos contestan 200", a8.status === 200 && b8.status === 200, `${a8.error || ""} ${b8.error || ""}`);
  ok("uno solo cerró; el otro es repetido", [a8.repetido, b8.repetido].filter(Boolean).length === 1);
  ok("el reintento contesta repetido", c8.status === 200 && c8.repetido === true);
  ok("no duplica stock", (await stockDe(f.deposito.id, baseId)) === stockAntes8 + 2);
  ok("no duplica cuenta", (await prisma.cuentaPorPagarProveedor.count({ where: { pedidoProveedorId: p8.pedidoId } })) === 1);
  ok("un solo PagoProveedor", e8.cuenta?.pagos.length === 1);
  ok("un solo CajaMovimiento RETIRO", (await movimientosDe(f.turnoDeposito.id)) === movsAntes8 + 1);
  const mov8 = await prisma.cajaMovimiento.findUnique({ where: { id: e8.cuenta.pagos[0].cajaMovimientoId } });
  ok("el retiro es por el mismo monto y está vinculado", mov8?.tipo === "RETIRO" && Number(mov8.monto) === 485300);
  ok("todos devuelven la misma cuenta", a8.cuentaPorPagar?.id === c8.cuentaPorPagar?.id && b8.cuentaPorPagar?.id === c8.cuentaPorPagar?.id);

  // El depósito cierra SU compra intentando pagarla con la caja de un local.
  // Con el turno ajeno lo detecta `registrarPagoProveedor` adentro de la
  // transacción, después de que el stock ya se escribió: es el caso que prueba
  // el rollback. Con el origen ajeno lo frena la ruta antes de escribir nada.
  console.log("\n── Cierre: 9 · el depósito intenta pagar su compra con la caja de un local");
  const rollbackCompleto = async (titulo, pagoAlProveedor) => {
    const p = await pedidoParaCerrar(f, { owner: f.deposito.id, totales: [485300] });
    const stockAntes = await stockDe(f.deposito.id, baseId);
    const movsAntes = (await movimientosDe(f.turnoOtro.id)) + (await movimientosDe(f.turnoDeposito.id));
    const r = await cerrar(deposito, p, pagoAlProveedor);
    const e = await estadoDelCierre(p.pedidoId);
    ok(`${titulo} → 403`, r.status === 403, `${r.status} ${r.error}`);
    ok(`${titulo}: la compra sigue ENVIADA`, e.pedido.estado === "ENVIADO");
    ok(`${titulo}: sin cuenta`, e.cuenta === null);
    ok(`${titulo}: el stock no se movió`, (await stockDe(f.deposito.id, baseId)) === stockAntes);
    ok(
      `${titulo}: ningún retiro`,
      (await movimientosDe(f.turnoOtro.id)) + (await movimientosDe(f.turnoDeposito.id)) === movsAntes
    );
  };
  await rollbackCompleto("con el turno del otro local", {
    estado: "PAGADA",
    pago: { medio: "EFECTIVO", localOrigenId: f.deposito.id, turnoId: f.turnoOtro.id },
  });
  await rollbackCompleto("con fondos del otro local", {
    estado: "PAGADA",
    pago: { medio: "TRANSFERENCIA", localOrigenId: f.otroLocal.id },
  });
  await rollbackCompleto("con fondos y turno del otro local", {
    estado: "PARCIAL",
    pago: { monto: 1000, medio: "EFECTIVO", localOrigenId: f.otroLocal.id, turnoId: f.turnoOtro.id },
  });

  // Y la regla en la capa canónica, sin la ruta adelante: quien no opera la
  // ubicación del gasto no deja pago inicial, y la cuenta tampoco queda.
  const pDirecto = await pedidoParaCerrar(f, { owner: f.deposito.id, totales: [1000] });
  let errDirecto = null;
  try {
    await prisma.$transaction((tx) =>
      crearCuentaPorPagarDesdeCompra(tx, {
        pedidoProveedorId: pDirecto.pedidoId,
        localGastoId: f.deposito.id,
        total: 1000,
        usuarioId: f.usuarioLocal.id,
        pagoInicial: { monto: 1000, medio: "TRANSFERENCIA", localOrigenId: f.deposito.id },
        localOperativoId: f.local.id,
      })
    );
  } catch (e) {
    errDirecto = e;
  }
  ok("pago inicial registrado por quien no opera la ubicación → 403", errDirecto?.status === 403, String(errDirecto?.message));
  ok("y la cuenta no quedó", (await estadoDelCierre(pDirecto.pedidoId)).cuenta === null);

  console.log("\n── Cierre: 11 y 12 · permisos");
  const p11 = await pedidoParaCerrar(f, { owner: f.local.id, totales: [1000] });
  const r11 = await cerrar(localSinPago, p11, { estado: "PENDIENTE" });
  ok("PENDIENTE sin permiso financiero cierra", r11.status === 200 && r11.ok, r11.error);
  const p12 = await pedidoParaCerrar(f, { owner: f.local.id, totales: [1000] });
  const stockAntes12 = await stockDe(f.local.id, baseId);
  for (const estado of ["PARCIAL", "PAGADA"]) {
    const r12 = await cerrar(localSinPago, p12, {
      estado,
      pago: { monto: estado === "PARCIAL" ? 500 : undefined, medio: "TRANSFERENCIA", localOrigenId: f.local.id },
    });
    ok(`${estado} sin permiso financiero → 403`, r12.status === 403, `${r12.status} ${r12.error}`);
  }
  const e12 = await estadoDelCierre(p12.pedidoId);
  ok("y no se cerró nada", e12.pedido.estado === "ENVIADO" && e12.cuenta === null && (await stockDe(f.local.id, baseId)) === stockAntes12);

  console.log("\n── Cierre: la pantalla de recibido lee la cuenta");
  const leido = await leer(
    rutaObtener.GET(pedido(`http://ci/api/compras-proveedor/obtener?id=${p2.pedidoId}`, deposito))
  );
  ok("obtener trae la cuenta resuelta", leido.cuentaPorPagar?.saldo === 185300 && leido.cuentaPorPagar?.estado === "PARCIAL", leido.error);
}

let fixture;
try {
  fixture = await montar();
  await correr(fixture);
  await correrSemana(fixture);
  await correrPagos(fixture);
  await correrCierre(fixture);
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
