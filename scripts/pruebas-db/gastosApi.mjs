// LAS RUTAS DE GASTOS CONTRA POSTGRESQL.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/gastosApi.mjs
//
// Llama a los handlers reales de `app/api/finanzas/gastos/**` —y a la lista de
// turnos operativos y al detalle del turno de Finanzas— con sesiones firmadas
// como las del login, sobre una base descartable construida con TODAS las
// migraciones del árbol. Lo que se afirma es lo que una pantalla vería: el
// status, el cuerpo, y lo que quedó escrito en la base.
//
// El dominio —`crearGasto`, `registrarPagoGasto`— ya tiene su prueba en
// `gastos.mjs`. Ésta mira lo que agrega la ruta: el alcance, los permisos, los
// filtros y la página hechos en la base, el mapeo de errores, y que la ruta no
// deje al cliente elegir la ubicación ni el movimiento de caja.
//
// Nivel ESCRITURA: host local y NODE_ENV distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");

const DB = "erpazul_gastos_api_prueba";
const urlDe = (db) => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${db}`;
  return u.toString();
};
const sinParametros = (url) => {
  const u = new URL(url);
  u.search = "";
  return u.toString();
};

// Los handlers importan el cliente por defecto de `@/lib/prisma`, que lee
// DATABASE_URL al cargarse: se apunta a la base descartable ANTES.
await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
await principal.$executeRawUnsafe(`CREATE DATABASE "${DB}"`);
aplicarMigraciones(sinParametros(urlDe(DB)));
process.env.DATABASE_URL = urlDe(DB);

const jwt = (await import("jsonwebtoken")).default;
const rutaGastos = await import("../../app/api/finanzas/gastos/route.js");
const rutaGasto = await import("../../app/api/finanzas/gastos/[gastoId]/route.js");
const rutaPagos = await import("../../app/api/finanzas/gastos/[gastoId]/pagos/route.js");
const rutaCategorias = await import("../../app/api/finanzas/gastos/categorias/route.js");
const rutaTurnosOperativos = await import("../../app/api/finanzas/pagos-proveedores/turnos-operativos/route.js");
const rutaTurno = await import("../../app/api/finanzas/turno/[turnoId]/route.js");
const { CATEGORIAS_INICIALES, ERROR_CATEGORIA_FILTRO, ERROR_GASTO_PAGADO, ERROR_MONTO_MAYOR_AL_SALDO_GASTO, ERROR_RANGO_INVERTIDO, PERMISO_REGISTRAR_GASTOS } =
  await import("../../lib/finanzas/gastos.js");
const { ERROR_CATEGORIA_INVALIDA, ERROR_GASTO_NO_ENCONTRADO, ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO, ERROR_ORIGEN_DE_OTRA_UBICACION_GASTO } =
  await import("../../lib/finanzas/gastosServer.js");
const { ERROR_FALTA_TURNO, ERROR_TURNO_DE_OTRA_UBICACION, ERROR_TURNO_NO_OPERATIVO } = await import("../../lib/finanzas/salidaDelPago.js");
const { ERROR_FECHA_FUTURA, ERROR_FECHA_INVALIDA, ERROR_MEDIO_INVALIDO } = await import("../../lib/finanzas/pagosProveedores.js");
const { ERROR_DESTINO_INVALIDO, ERROR_FUERA_DE_ALCANCE } = await import("../../lib/finanzas/alcanceFinanciero.js");
const { CLASE_MOVIMIENTO } = await import("../../lib/finanzas/movimientosDeCaja.js");
const { hoyArgentinaISO } = await import("../../lib/fechas/rangoArgentina.js");
const { sumarDias } = await import("../../lib/transferencias/periodoDePago.js");

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
const seccion = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 68 - t.length))}`);

// ── SESIONES Y PEDIDOS, con la forma del login ─────────────────────────────
const SECRETO = process.env.AUTH_SECRET;
const firmar = (u, permisos) =>
  jwt.sign({ id: u.id, nombre: u.nombre, email: u.email, localId: u.localId, permisos }, SECRETO, { expiresIn: "1h" });
const galleta = (sesion) => (typeof sesion === "string" ? `erpazul_sesion=${sesion}` : sesion.cookie);
const pedir = (url, sesion, metodo = "GET", cuerpo) =>
  new Request(`http://ci${url}`, {
    method: metodo,
    headers: { ...(sesion ? { cookie: galleta(sesion) } : {}), "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
const leer = async (respuesta) => {
  const r = await respuesta;
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};
const conGasto = (id) => ({ params: Promise.resolve({ gastoId: String(id) }) });

const listar = (sesion, qs = "") => leer(rutaGastos.GET(pedir(`/api/finanzas/gastos${qs ? `?${qs}` : ""}`, sesion)));
const crear = (sesion, cuerpo) => leer(rutaGastos.POST(pedir("/api/finanzas/gastos", sesion, "POST", cuerpo)));
const abrir = (sesion, id) => leer(rutaGasto.GET(pedir(`/api/finanzas/gastos/${id}`, sesion), conGasto(id)));
const pagar = (sesion, id, cuerpo) => leer(rutaPagos.POST(pedir(`/api/finanzas/gastos/${id}/pagos`, sesion, "POST", cuerpo), conGasto(id)));
const categorias = (sesion) => leer(rutaCategorias.GET(pedir("/api/finanzas/gastos/categorias", sesion)));

let c = null;
try {
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlDe(DB) });

  // ── LA SIEMBRA ───────────────────────────────────────────────────────────
  //
  // La forma de `gastos.mjs`: un grupo con su depósito y dos locales, cada uno
  // con su turno abierto, y un turno cerrado de Casiano.
  const grupo = await c.grupo.create({ data: { nombre: "Gastos API CI" } });
  const deposito = await c.local.create({ data: { nombre: "Depósito", es_deposito: true } });
  const casiano = await c.local.create({ data: { nombre: "Casiano Casas" } });
  const otro = await c.local.create({ data: { nombre: "Otro local" } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  for (const l of [casiano, otro]) await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: l.id } });
  const rol = await c.rol.create({ data: { nombre: "CI gastos api", permisos: [] } });
  const usuario = (nombre, localId) =>
    c.usuario.create({ data: { nombre, email: `${nombre.replace(/\s/g, "")}@ci.local`, passwordHash: "x", rolId: rol.id, localId } });
  const uCasiano = await usuario("Cajero Casiano", casiano.id);
  const uCasianoCierre = await usuario("Cajero Casiano Cierre", casiano.id);
  const uOtro = await usuario("Cajero Otro", otro.id);
  const uDeposito = await usuario("Depósito", deposito.id);
  const turnoCasiano = await c.turno.create({ data: { localId: casiano.id, vendedorId: uCasiano.id, montoInicial: 500000, apertura: new Date() } });
  const turnoOtro = await c.turno.create({ data: { localId: otro.id, vendedorId: uOtro.id, montoInicial: 0, apertura: new Date() } });
  const turnoCerrado = await c.turno.create({
    data: { localId: casiano.id, vendedorId: uCasianoCierre.id, montoInicial: 0, apertura: new Date(Date.now() - 86400000), cierre: new Date() },
  });

  const ESCRIBE = ["finanzas.ver", PERMISO_REGISTRAR_GASTOS];
  const casianoEscribe = firmar(uCasiano, ESCRIBE);
  const casianoVe = firmar(uCasiano, ["finanzas.ver"]);
  const casianoSinNada = firmar(uCasiano, ["clientes.ver"]);
  const otroEscribe = firmar(uOtro, ESCRIBE);
  const depositoEscribe = firmar(uDeposito, ESCRIBE);
  const casianoSoloGastos = firmar(uCasiano, [PERMISO_REGISTRAR_GASTOS]);
  const adminGlobal = {
    cookie: `erpazul_sesion=${jwt.sign({ id: uDeposito.id, nombre: "Admin", email: "admin@ci.local", localId: null, permisos: ["*"] }, SECRETO, { expiresIn: "1h" })}; erpazul_grupo_activo=${grupo.id}; erpazul_contexto_activo=${encodeURIComponent(JSON.stringify({ global: true }))}`,
  };

  const cats = await c.categoriaGasto.findMany({ orderBy: { orden: "asc" } });
  const cat = (nombre) => cats.find((x) => x.nombre === nombre).id;

  let n = 0;
  const clave = () => `api-${Date.now().toString(36)}-${++n}`;
  const totales = async () => ({
    gastos: await c.gasto.count(),
    pagos: await c.pagoGasto.count(),
    retiros: await c.cajaMovimiento.count({ where: { tipo: "RETIRO" } }),
  });
  const igualTotales = async (antes) => JSON.stringify(await totales()) === JSON.stringify(antes);
  const hoy = hoyArgentinaISO();
  const ayer = sumarDias(hoy, -1);
  const base = (extra = {}) => ({
    categoriaId: cat("Mantenimiento"),
    concepto: "Reparación heladera",
    total: 100000,
    fecha: hoy,
    idempotencyKey: clave(),
    ...extra,
  });

  // ══════════════════════════════════════════════════════════════════════
  seccion("Categorías");
  // ══════════════════════════════════════════════════════════════════════
  let r = await categorias(null);
  ok("sin sesión: 401", r.status === 401 && r.ok === false);
  r = await categorias(casianoSinNada);
  ok("sin finanzas.ver: 403", r.status === 403 && r.ok === false, JSON.stringify(r));
  r = await categorias(casianoVe);
  ok("con finanzas.ver: las siete activas, por su orden", r.status === 200 && JSON.stringify(r.categorias.map((x) => x.nombre)) === JSON.stringify(CATEGORIAS_INICIALES),
    JSON.stringify(r.categorias));

  // Un gasto con "Sueldos" ANTES de darla de baja, para ver después su detalle.
  const conSueldos = await crear(casianoEscribe, base({ categoriaId: cat("Sueldos"), concepto: "Adelanto de sueldo", total: 30000 }));
  // La lista sale de la tabla: una categoría dada de baja deja de ofrecerse y una
  // nueva aparece en su lugar del orden. Con una lista escrita en la ruta, esto
  // no cambiaría.
  await c.categoriaGasto.update({ where: { id: cat("Sueldos") }, data: { activo: false } });
  await c.categoriaGasto.create({ data: { nombre: "Seguros", orden: 35 } });
  r = await categorias(casianoVe);
  ok("una categoría dada de baja no se ofrece y una nueva sí, en su orden: la lista sale de la base",
    JSON.stringify(r.categorias.map((x) => x.nombre)) === JSON.stringify(["Servicios", "Alquiler", "Seguros", "Mantenimiento", "Insumos y limpieza", "Impuestos", "Otros"]),
    JSON.stringify(r.categorias.map((x) => x.nombre)));

  // ══════════════════════════════════════════════════════════════════════
  seccion("Crear un gasto: permisos y ubicación");
  // ══════════════════════════════════════════════════════════════════════
  ok("el gasto con Sueldos se creó antes de la baja", conSueldos.status === 200 && conSueldos.gasto?.categoria?.nombre === "Sueldos", JSON.stringify(conSueldos));
  let antes = await totales();
  r = await crear(null, base());
  ok("sin sesión: 401", r.status === 401);
  r = await crear(casianoVe, base());
  ok("con finanzas.ver solo: 403", r.status === 403 && r.ok === false, r.error);
  r = await crear(casianoSoloGastos, base());
  ok("con el permiso de gastos pero sin finanzas.ver: 403", r.status === 403, r.error);
  r = await crear(casianoEscribe, base({ localId: otro.id }));
  ok("Casiano no crea un gasto a nombre de otro local (403)", r.status === 403 && r.error === ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO, r.error);
  r = await crear(depositoEscribe, base({ localId: casiano.id }));
  ok("el depósito, que VE a Casiano, no crea un gasto a su nombre (403)", r.status === 403 && r.error === ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO, r.error);
  r = await crear(adminGlobal, base());
  ok("un admin en vista global no opera ninguna ubicación: no crea (403)", r.status === 403 && r.error === ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO, r.error);
  r = await crear(casianoEscribe, base({ categoriaId: 999999 }));
  ok("una categoría que no existe: 400", r.status === 400 && r.error === ERROR_CATEGORIA_INVALIDA, r.error);
  r = await crear(casianoEscribe, base({ categoriaId: cat("Sueldos") }));
  ok("una categoría dada de baja: 400", r.status === 400 && r.error === ERROR_CATEGORIA_INVALIDA, r.error);
  r = await crear(casianoEscribe, base({ concepto: "   " }));
  ok("sin concepto: 400", r.status === 400, r.error);
  r = await crear(casianoEscribe, base({ total: 0 }));
  ok("total cero: 400", r.status === 400, r.error);
  r = await crear(casianoEscribe, base({ fecha: "2026-02-30" }));
  ok("un día que no existe: 400, no corrido en silencio", r.status === 400 && r.error === ERROR_FECHA_INVALIDA, r.error);
  r = await crear(casianoEscribe, base({ idempotencyKey: "" }));
  ok("sin clave del intento: 400", r.status === 400, r.error);
  ok("ningún rechazo dejó gasto, pago ni retiro", await igualTotales(antes));

  // ══════════════════════════════════════════════════════════════════════
  seccion("Crear: sin pago, con pago parcial en efectivo, con pago total");
  // ══════════════════════════════════════════════════════════════════════
  const g1 = await crear(casianoEscribe, base({ concepto: "Luz septiembre", categoriaId: cat("Servicios"), total: "85.300,50", beneficiario: "EPEC", comprobanteNumero: "0001-00012345", fecha: "2026-09-30", vencimiento: "2026-10-10" }));
  ok("sin pago: 200, PENDIENTE, sin pago y en la ubicación que se opera",
    g1.status === 200 && g1.pago === null && g1.gasto.estado === "PENDIENTE" && g1.gasto.saldo === 85300.5 && g1.gasto.localId === casiano.id && g1.gasto.local?.nombre === "Casiano Casas",
    JSON.stringify(g1));
  ok("los días viajan como días: el 30 es el 30 y el vencimiento el 10", g1.gasto.fecha === "2026-09-30" && g1.gasto.vencimiento === "2026-10-10");

  const retirosTurno = () => c.cajaMovimiento.count({ where: { turnoId: turnoCasiano.id, tipo: "RETIRO" } });
  const manual = await c.cajaMovimiento.create({ data: { turnoId: turnoCasiano.id, usuarioId: uCasiano.id, tipo: "RETIRO", monto: 1234, motivo: "Cambio" } });
  let retirosAntes = await retirosTurno();
  const g2 = await crear(casianoEscribe, base({
    concepto: "Reparación freezer", total: 100000,
    // `cajaMovimientoId` no se lee: el pago crea su propio RETIRO.
    pagoInicial: { monto: 40000, medio: "EFECTIVO", turnoId: turnoCasiano.id, cajaMovimientoId: manual.id },
  }));
  ok("con pago parcial en efectivo: PARCIAL, $60.000 pendientes", g2.status === 200 && g2.gasto.estado === "PARCIAL" && g2.gasto.saldo === 60000, JSON.stringify(g2));
  ok("y exactamente UN retiro nuevo, del monto del pago", (await retirosTurno()) === retirosAntes + 1 &&
    Number((await c.cajaMovimiento.findUnique({ where: { id: g2.pago.cajaMovimientoId } }))?.monto) === 40000);
  ok("el movimiento no es el que mandó el cliente: lo creó el pago", g2.pago.cajaMovimientoId !== manual.id &&
    (await c.cajaMovimientoDePago.findUnique({ where: { cajaMovimientoId: manual.id } })) === null);
  const dueño2 = await c.cajaMovimientoDePago.findUnique({ where: { cajaMovimientoId: g2.pago.cajaMovimientoId } });
  ok("su movimiento tiene UN dueño: ese pago de gasto", dueño2?.pagoGastoId === g2.pago.id && dueño2.pagoProveedorId === null, JSON.stringify(dueño2));

  const g3 = await crear(casianoEscribe, base({ concepto: "Alquiler octubre", categoriaId: cat("Alquiler"), total: 350000, beneficiario: "Inmobiliaria Sur", pagoInicial: { monto: 350000, medio: "TRANSFERENCIA" } }));
  ok("con pago total por transferencia: PAGADA, sin movimiento de caja", g3.status === 200 && g3.gasto.estado === "PAGADA" && g3.pago.cajaMovimientoId === null && g3.pago.turnoId === null, JSON.stringify(g3));

  // ── El pago inicial que falla no deja nada: ni el gasto ─────────────────
  antes = await totales();
  r = await crear(casianoEscribe, base({ pagoInicial: { monto: 1000, medio: "EFECTIVO", turnoId: turnoOtro.id } }));
  ok("pago inicial desde el turno de otro local: 403 y no queda ni el gasto", r.status === 403 && r.error === ERROR_TURNO_DE_OTRA_UBICACION && (await igualTotales(antes)), r.error);
  r = await crear(casianoEscribe, base({ pagoInicial: { monto: 1000, medio: "EFECTIVO", turnoId: turnoCerrado.id } }));
  ok("pago inicial desde un turno cerrado: 409 y no queda nada", r.status === 409 && r.error === ERROR_TURNO_NO_OPERATIVO && (await igualTotales(antes)), r.error);
  r = await crear(casianoEscribe, base({ pagoInicial: { monto: 1000, medio: "EFECTIVO" } }));
  ok("pago inicial en efectivo sin turno: 400 y no queda nada", r.status === 400 && r.error === ERROR_FALTA_TURNO && (await igualTotales(antes)), r.error);
  r = await crear(casianoEscribe, base({ pagoInicial: { monto: 1000, medio: "TRANSFERENCIA", localOrigenId: deposito.id } }));
  ok("pago inicial con plata del depósito: 403 y no queda nada", r.status === 403 && r.error === ERROR_ORIGEN_DE_OTRA_UBICACION_GASTO && (await igualTotales(antes)), r.error);
  r = await crear(casianoEscribe, base({ total: 1000, pagoInicial: { monto: 2000, medio: "OTRO" } }));
  ok("pago inicial mayor al total: 400 y no queda nada", r.status === 400 && r.error === ERROR_MONTO_MAYOR_AL_SALDO_GASTO && (await igualTotales(antes)), r.error);

  // ── Idempotencia del alta ────────────────────────────────────────────────
  const claveAlta = clave();
  const alta = base({ concepto: "Artículos de limpieza", categoriaId: cat("Insumos y limpieza"), total: 12000, idempotencyKey: claveAlta, pagoInicial: { monto: 12000, medio: "EFECTIVO", turnoId: turnoCasiano.id } });
  const a1 = await crear(casianoEscribe, alta);
  antes = await totales();
  const a2 = await crear(casianoEscribe, alta);
  ok("el mismo alta otra vez: 200, repetido, el MISMO gasto y el MISMO pago", a2.status === 200 && a2.repetido === true && a2.gasto.id === a1.gasto.id && a2.pago?.id === a1.pago.id, JSON.stringify(a2));
  ok("sin gasto, pago ni retiro nuevos", await igualTotales(antes));
  const claveCarrera = clave();
  antes = await totales();
  const carrera = await Promise.all([0, 1].map(() =>
    crear(casianoEscribe, base({ concepto: "Carrera", total: 5000, idempotencyKey: claveCarrera, pagoInicial: { monto: 5000, medio: "EFECTIVO", turnoId: turnoCasiano.id } }))));
  const despues = await totales();
  ok("dos altas simultáneas con la misma clave: las dos contestan 200 con el MISMO gasto",
    carrera.every((x) => x.status === 200) && carrera[0].gasto.id === carrera[1].gasto.id, JSON.stringify(carrera.map((x) => [x.status, x.gasto?.id, x.error])));
  ok("y queda UN gasto, UN pago y UN retiro", despues.gastos === antes.gastos + 1 && despues.pagos === antes.pagos + 1 && despues.retiros === antes.retiros + 1,
    JSON.stringify([antes, despues]));

  // ══════════════════════════════════════════════════════════════════════
  seccion("Pagar un gasto existente");
  // ══════════════════════════════════════════════════════════════════════
  const g4 = (await crear(casianoEscribe, base({ concepto: "Pintura del salón", total: 50000, fecha: ayer }))).gasto;
  const pagoDe = (extra) => ({ monto: 10000, medio: "TRANSFERENCIA", idempotencyKey: clave(), ...extra });
  antes = await totales();
  r = await pagar(null, g4.id, pagoDe());
  ok("sin sesión: 401", r.status === 401);
  r = await pagar(casianoVe, g4.id, pagoDe());
  ok("con finanzas.ver solo: 403", r.status === 403, r.error);
  r = await pagar(casianoEscribe, 999999, pagoDe());
  ok("un gasto que no existe: 404", r.status === 404 && r.error === ERROR_GASTO_NO_ENCONTRADO, r.error);
  r = await pagar(casianoEscribe, "abc", pagoDe());
  ok("un id que no es un id: 404", r.status === 404, r.error);
  const gOtro = (await crear(otroEscribe, base({ concepto: "Gasto del otro local", total: 8000 }))).gasto;
  antes = await totales();
  r = await pagar(casianoEscribe, gOtro.id, pagoDe());
  ok("Casiano no paga un gasto que ni siquiera ve: 403 fuera de alcance", r.status === 403 && r.error === ERROR_FUERA_DE_ALCANCE, r.error);
  r = await pagar(depositoEscribe, g4.id, pagoDe());
  ok("el depósito VE el gasto de Casiano pero no lo paga: 403", r.status === 403 && r.error === ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO, r.error);
  r = await pagar(depositoEscribe, g4.id, pagoDe({ medio: "EFECTIVO", turnoId: turnoCasiano.id }));
  ok("ni en efectivo desde el turno de Casiano", r.status === 403, r.error);
  r = await pagar(adminGlobal, g4.id, pagoDe());
  ok("un admin en vista global tampoco paga: 403", r.status === 403 && r.error === ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO, r.error);
  r = await pagar(casianoEscribe, g4.id, pagoDe({ localOrigenId: deposito.id }));
  ok("operando Casiano, la plata no sale del depósito: 403", r.status === 403 && r.error === ERROR_ORIGEN_DE_OTRA_UBICACION_GASTO, r.error);
  r = await pagar(casianoEscribe, g4.id, pagoDe({ medio: "EFECTIVO" }));
  ok("efectivo sin turno: 400", r.status === 400 && r.error === ERROR_FALTA_TURNO, r.error);
  r = await pagar(casianoEscribe, g4.id, pagoDe({ medio: "EFECTIVO", turnoId: turnoOtro.id }));
  ok("efectivo desde el turno de otro local: 403", r.status === 403 && r.error === ERROR_TURNO_DE_OTRA_UBICACION, r.error);
  r = await pagar(casianoEscribe, g4.id, pagoDe({ medio: "EFECTIVO", turnoId: turnoCerrado.id }));
  ok("efectivo desde un turno cerrado: 409", r.status === 409 && r.error === ERROR_TURNO_NO_OPERATIVO, r.error);
  r = await pagar(casianoEscribe, g4.id, pagoDe({ medio: "CHEQUE" }));
  ok("un medio que no existe: 400", r.status === 400 && r.error === ERROR_MEDIO_INVALIDO, r.error);
  r = await pagar(casianoEscribe, g4.id, pagoDe({ fecha: sumarDias(hoy, 1) }));
  ok("una transferencia con fecha de mañana: 400", r.status === 400 && r.error === ERROR_FECHA_FUTURA, r.error);
  r = await pagar(casianoEscribe, g4.id, pagoDe({ monto: 50000.01 }));
  ok("más que el saldo: 400", r.status === 400 && r.error === ERROR_MONTO_MAYOR_AL_SALDO_GASTO, r.error);
  ok("ningún rechazo dejó pago ni retiro", await igualTotales(antes));

  const p1 = await pagar(casianoEscribe, g4.id, pagoDe({ monto: 20000 }));
  ok("parcial por transferencia, fechado hoy: PARCIAL", p1.status === 200 && p1.gasto.estado === "PARCIAL" && p1.gasto.saldo === 30000 && p1.pago.cajaMovimientoId === null, JSON.stringify(p1));
  const p2 = await pagar(casianoEscribe, g4.id, pagoDe({ monto: 5000, medio: "MERCADO_PAGO", fecha: ayer }));
  ok("Mercado Pago con fecha de ayer: se registra el medio y nada más", p2.status === 200 && p2.pago.medio === "MERCADO_PAGO" && p2.pago.turnoId === null, JSON.stringify(p2));
  retirosAntes = await retirosTurno();
  const p3 = await pagar(casianoEscribe, g4.id, pagoDe({ monto: 25000, medio: "EFECTIVO", turnoId: turnoCasiano.id, cajaMovimientoId: manual.id }));
  ok("el efectivo que completa el saldo: PAGADA", p3.status === 200 && p3.gasto.estado === "PAGADA" && p3.gasto.saldo === 0, JSON.stringify(p3));
  const mov3 = await c.cajaMovimiento.findUnique({ where: { id: p3.pago.cajaMovimientoId }, include: { dePago: true } });
  ok("un RETIRO nuevo, por el monto, del turno, y con el pago como único dueño",
    (await retirosTurno()) === retirosAntes + 1 && mov3?.tipo === "RETIRO" && Number(mov3.monto) === 25000 && mov3.turnoId === turnoCasiano.id &&
    mov3.dePago?.pagoGastoId === p3.pago.id && mov3.id !== manual.id, JSON.stringify(mov3));
  r = await pagar(casianoEscribe, g4.id, pagoDe({ monto: 1 }));
  ok("un gasto pagado no se vuelve a pagar: 400", r.status === 400 && r.error === ERROR_GASTO_PAGADO, r.error);

  // ── Idempotencia y carreras del pago ─────────────────────────────────────
  const g5 = (await crear(casianoEscribe, base({ concepto: "Saldo en carrera", total: 10000 }))).gasto;
  const clavePago = clave();
  const q1 = await pagar(casianoEscribe, g5.id, { monto: 3000, medio: "EFECTIVO", turnoId: turnoCasiano.id, idempotencyKey: clavePago });
  antes = await totales();
  const q2 = await pagar(casianoEscribe, g5.id, { monto: 3000, medio: "EFECTIVO", turnoId: turnoCasiano.id, idempotencyKey: clavePago });
  ok("el mismo pago otra vez: 200, repetido, el MISMO pago y ningún retiro nuevo",
    q2.status === 200 && q2.repetido === true && q2.pago.id === q1.pago.id && (await igualTotales(antes)), JSON.stringify(q2));
  const claveSimultanea = clave();
  antes = await totales();
  const dobles = await Promise.all([0, 1].map(() => pagar(casianoEscribe, g5.id, { monto: 1000, medio: "EFECTIVO", turnoId: turnoCasiano.id, idempotencyKey: claveSimultanea })));
  const trasDobles = await totales();
  ok("dos envíos simultáneos del mismo pago: los dos 200 con el MISMO pago, y UN retiro",
    dobles.every((x) => x.status === 200) && dobles[0].pago.id === dobles[1].pago.id && trasDobles.pagos === antes.pagos + 1 && trasDobles.retiros === antes.retiros + 1,
    JSON.stringify(dobles.map((x) => [x.status, x.pago?.id, x.error])));
  const compiten = await Promise.all([0, 1].map(() => pagar(casianoEscribe, g5.id, { monto: 4000, medio: "TRANSFERENCIA", idempotencyKey: clave() })));
  ok("dos pagos DISTINTOS de $4.000 sobre $6.000 a la vez: pasa uno y el otro supera el saldo (400)",
    compiten.filter((x) => x.status === 200).length === 1 && compiten.find((x) => x.status !== 200)?.status === 400 &&
    compiten.find((x) => x.status !== 200)?.error === ERROR_MONTO_MAYOR_AL_SALDO_GASTO, JSON.stringify(compiten.map((x) => [x.status, x.error])));

  // ══════════════════════════════════════════════════════════════════════
  seccion("El detalle");
  // ══════════════════════════════════════════════════════════════════════
  r = await abrir(null, g4.id);
  ok("sin sesión: 401", r.status === 401);
  r = await abrir(casianoSinNada, g4.id);
  ok("sin finanzas.ver: 403", r.status === 403);
  r = await abrir(casianoVe, 999999);
  ok("uno que no existe: 404", r.status === 404 && r.error === ERROR_GASTO_NO_ENCONTRADO);
  r = await abrir(casianoVe, gOtro.id);
  ok("uno de otro local: 403, no 404", r.status === 403 && r.error === ERROR_FUERA_DE_ALCANCE, r.error);
  const d4 = await abrir(casianoEscribe, g4.id);
  ok("el propio: 200, con total, pagado, saldo y estado derivados",
    d4.status === 200 && d4.gasto.total === 50000 && d4.gasto.pagado === 50000 && d4.gasto.saldo === 0 && d4.gasto.estado === "PAGADA" && d4.gasto.cantidadPagos === 3,
    JSON.stringify(d4.gasto));
  ok("los pagos en el orden en que salió la plata: el de ayer primero, aunque se registró después",
    JSON.stringify(d4.pagos.map((p) => p.id)) === JSON.stringify([p2.pago.id, p1.pago.id, p3.pago.id]), JSON.stringify(d4.pagos.map((p) => [p.id, p.fecha])));
  const efectivo = d4.pagos.find((p) => p.id === p3.pago.id);
  ok("cada pago dice de dónde salió, quién lo cargó, el turno y el movimiento si fue efectivo",
    efectivo.origen?.nombre === "Casiano Casas" && efectivo.usuario?.nombre === "Cajero Casiano" && efectivo.turnoId === turnoCasiano.id &&
    efectivo.cajaMovimientoId === mov3.id && efectivo.rotuloMedio === "Efectivo", JSON.stringify(efectivo));
  ok("el creador del gasto viaja con su nombre", d4.gasto.creadoPor?.nombre === "Cajero Casiano");
  ok("quien opera Casiano con el permiso puede pagarlo", d4.puedePagar === true && d4.puedeEscribir === true && d4.medios.length === 4);
  r = await abrir(casianoVe, g4.id);
  ok("con finanzas.ver solo, lo ve pero la pantalla sabe que no puede pagarlo", r.status === 200 && r.puedePagar === false && r.puedeEscribir === false);
  r = await abrir(depositoEscribe, g4.id);
  ok("el depósito lo ve y no puede pagarlo", r.status === 200 && r.puedePagar === false && r.puedeEscribir === true);
  r = await abrir(casianoVe, conSueldos.gasto.id);
  ok("un gasto viejo sigue mostrando su categoría dada de baja", r.status === 200 && r.gasto.categoria?.nombre === "Sueldos" && r.gasto.categoria.activa === false,
    JSON.stringify(r.gasto?.categoria));

  // ══════════════════════════════════════════════════════════════════════
  seccion("La caja: el pago de un gasto no es un retiro manual");
  // ══════════════════════════════════════════════════════════════════════
  const resTurno = await leer(rutaTurno.GET(pedir(`/api/finanzas/turno/${turnoCasiano.id}`, casianoVe), { params: Promise.resolve({ turnoId: String(turnoCasiano.id) }) }));
  const movs = resTurno?.movimientos ?? resTurno?.turno?.movimientos ?? [];
  const claseDe = (id) => movs.find((m) => m.id === id)?.clase;
  ok("el retiro de un pago de gasto hecho por la ruta es PAGO_GASTO", claseDe(mov3.id) === CLASE_MOVIMIENTO.PAGO_GASTO && claseDe(g2.pago.cajaMovimientoId) === CLASE_MOVIMIENTO.PAGO_GASTO,
    JSON.stringify(movs.map((m) => [m.id, m.clase])));
  ok("y el retiro manual sigue MANUAL", claseDe(manual.id) === CLASE_MOVIMIENTO.MANUAL);
  const pagosConCaja = await c.pagoGasto.count({ where: { cajaMovimientoId: { not: null } } });
  ok("cada pago de gasto con movimiento tiene exactamente una fila de dueño", (await c.cajaMovimientoDePago.count({ where: { pagoGastoId: { not: null } } })) === pagosConCaja);

  // ══════════════════════════════════════════════════════════════════════
  seccion("Turnos para pagar en efectivo");
  // ══════════════════════════════════════════════════════════════════════
  r = await leer(rutaTurnosOperativos.GET(pedir("/api/finanzas/pagos-proveedores/turnos-operativos", casianoSoloGastos)));
  ok("con el permiso de gastos se listan los turnos de la ubicación que se opera",
    r.status === 200 && r.turnos.map((t) => t.id).includes(turnoCasiano.id) && !r.turnos.some((t) => t.id === turnoOtro.id || t.id === turnoCerrado.id), JSON.stringify(r));
  r = await leer(rutaTurnosOperativos.GET(pedir("/api/finanzas/pagos-proveedores/turnos-operativos", casianoVe)));
  ok("sin ningún permiso de registrar, sigue siendo 403", r.status === 403, JSON.stringify(r));

  // ══════════════════════════════════════════════════════════════════════
  seccion("El listado: alcance");
  // ══════════════════════════════════════════════════════════════════════
  const gDeposito = (await crear(depositoEscribe, base({ concepto: "Flete de insumos", total: 9000 }))).gasto;
  const deCasiano = await c.gasto.count({ where: { localId: casiano.id } });
  r = await listar(null);
  ok("sin sesión: 401", r.status === 401);
  r = await listar(casianoSinNada);
  ok("sin finanzas.ver: 403", r.status === 403);
  const todosCasiano = await listar(casianoVe, "estado=TODAS&pageSize=200");
  ok("Casiano ve sus gastos y solo los suyos", todosCasiano.status === 200 && todosCasiano.paginacion.total === deCasiano &&
    todosCasiano.gastos.every((g) => g.localId === casiano.id), JSON.stringify(todosCasiano.paginacion));
  ok("con finanzas.ver solo, la lista no ofrece crear", todosCasiano.puedeCrear === false && todosCasiano.puedeEscribir === false);
  r = await listar(otroEscribe, "estado=TODAS&pageSize=200");
  ok("el otro local ve solo el suyo", r.paginacion.total === 1 && r.gastos[0].id === gOtro.id && r.puedeCrear === true, JSON.stringify(r.paginacion));
  const todosDeposito = await listar(depositoEscribe, "estado=TODAS&pageSize=200");
  ok("el depósito ve los de todo el grupo", todosDeposito.paginacion.total === (await c.gasto.count()) && todosDeposito.variasUbicaciones === true,
    JSON.stringify(todosDeposito.paginacion));
  r = await listar(depositoEscribe, `estado=TODAS&pageSize=200&destino=${casiano.id}`);
  ok("el depósito puede pedir UNA ubicación con destino", r.status === 200 && r.paginacion.total === deCasiano && r.gastos.every((g) => g.localId === casiano.id) && r.filtros.destino === casiano.id);
  r = await listar(casianoVe, `destino=${otro.id}`);
  ok("Casiano pidiendo los de otro local: 403, no una lista vacía", r.status === 403 && r.error === ERROR_FUERA_DE_ALCANCE, r.error);
  r = await listar(casianoVe, "destino=abc");
  ok("un destino que no es un local: 400", r.status === 400 && r.error === ERROR_DESTINO_INVALIDO, r.error);
  r = await listar(adminGlobal, "estado=TODAS&pageSize=200");
  ok("un admin en vista global ve todo el grupo y no se le ofrece crear", r.status === 200 && r.paginacion.total === (await c.gasto.count()) && r.puedeCrear === false,
    JSON.stringify([r.status, r.paginacion, r.error]));

  // ══════════════════════════════════════════════════════════════════════
  seccion("El listado: estado, filtros y búsqueda, en la base");
  // ══════════════════════════════════════════════════════════════════════
  const conEstado = todosCasiano.gastos;
  const pendientesEsperados = conEstado.filter((g) => g.estado !== "PAGADA").length;
  const pagadasEsperadas = conEstado.filter((g) => g.estado === "PAGADA").length;
  ok("hay de los tres estados para mirar", ["PENDIENTE", "PARCIAL", "PAGADA"].every((e) => conEstado.some((g) => g.estado === e)));
  r = await listar(casianoVe);
  ok("sin estado, Pendientes: lo que tiene saldo, parciales incluidos", r.filtros.estado === "PENDIENTES" && r.paginacion.total === pendientesEsperados &&
    r.gastos.every((g) => g.estado !== "PAGADA") && r.gastos.some((g) => g.estado === "PARCIAL"), JSON.stringify(r.paginacion));
  r = await listar(casianoVe, "estado=PAGADAS&pageSize=200");
  ok("Pagadas: solo las saldadas", r.paginacion.total === pagadasEsperadas && r.gastos.every((g) => g.estado === "PAGADA"), JSON.stringify(r.paginacion));
  // Una página de UNO con un filtro de estado: el total tiene que ser el de
  // los que pasan el filtro. Si el estado se filtrara en memoria después de
  // paginar, la página vendría vacía o el total diría otra cosa.
  r = await listar(casianoVe, "estado=PAGADAS&pageSize=1&page=2");
  ok("filtrar por estado y paginar se hace en la base: página 2 de 1 en Pagadas trae una pagada y el total de las pagadas",
    r.paginacion.total === pagadasEsperadas && r.gastos.length === 1 && r.gastos[0].estado === "PAGADA" && r.paginacion.totalPaginas === pagadasEsperadas,
    JSON.stringify([r.paginacion, r.gastos.map((g) => g.estado)]));
  ok("el gasto de la lista trae saldo, estado y días ya resueltos",
    todosCasiano.gastos.find((g) => g.id === g1.gasto.id)?.saldo === 85300.5 && todosCasiano.gastos.find((g) => g.id === g2.gasto.id)?.estado === "PARCIAL" &&
    todosCasiano.gastos.find((g) => g.id === g1.gasto.id)?.fecha === "2026-09-30");

  r = await listar(casianoVe, `estado=TODAS&pageSize=200&categoriaId=${cat("Servicios")}`);
  ok("por categoría", r.paginacion.total === 1 && r.gastos[0].id === g1.gasto.id, JSON.stringify(r.paginacion));
  r = await listar(casianoVe, "categoriaId=abc");
  ok("una categoría mal escrita: 400", r.status === 400 && r.error === ERROR_CATEGORIA_FILTRO, r.error);

  // Los bordes del día: el gasto del 30 entra con "hasta el 30" y queda afuera
  // con "hasta el 29". Con una conversión de zona horaria de por medio, el 30
  // quedaría del lado equivocado de uno de los dos.
  r = await listar(casianoVe, "estado=TODAS&fechaDesde=2026-09-30&fechaHasta=2026-09-30");
  ok("desde y hasta el 30: entra el gasto del 30", r.gastos.some((g) => g.id === g1.gasto.id) && r.gastos.every((g) => g.fecha === "2026-09-30"), JSON.stringify(r.gastos.map((g) => g.fecha)));
  r = await listar(casianoVe, "estado=TODAS&fechaHasta=2026-09-29&pageSize=200");
  ok("hasta el 29: el del 30 queda afuera", !r.gastos.some((g) => g.id === g1.gasto.id) && r.gastos.every((g) => g.fecha <= "2026-09-29"));
  r = await listar(casianoVe, `estado=TODAS&fechaDesde=${ayer}&fechaHasta=${ayer}`);
  ok("el gasto de ayer, en el día de ayer", r.gastos.some((g) => g.id === g4.id) && r.gastos.every((g) => g.fecha === ayer));
  r = await listar(casianoVe, "fechaDesde=2026-10-05&fechaHasta=2026-10-01");
  ok("un rango al revés: 400", r.status === 400 && r.error === ERROR_RANGO_INVERTIDO, r.error);
  r = await listar(casianoVe, "fechaDesde=30/09/2026");
  ok("una fecha mal escrita: 400", r.status === 400 && r.error === ERROR_FECHA_INVALIDA, r.error);

  r = await listar(casianoVe, "estado=TODAS&q=LUZ");
  ok("busca en el concepto, sin distinguir mayúsculas", r.paginacion.total === 1 && r.gastos[0].id === g1.gasto.id);
  r = await listar(casianoVe, "estado=TODAS&q=inmobiliaria");
  ok("busca en el beneficiario", r.paginacion.total === 1 && r.gastos[0].id === g3.gasto.id);
  r = await listar(casianoVe, "estado=TODAS&q=00012345");
  ok("busca en el número de comprobante", r.paginacion.total === 1 && r.gastos[0].id === g1.gasto.id);
  r = await listar(casianoVe, "estado=TODAS&q=zzzz-no-existe");
  ok("sin coincidencias: vacío, con total 0", r.status === 200 && r.gastos.length === 0 && r.paginacion.total === 0);
  r = await listar(casianoVe, "estado=TODAS&q=flete");
  ok("la búsqueda no cruza el alcance: el gasto del depósito no aparece para Casiano", r.paginacion.total === 0 && gDeposito.id > 0);

  // ══════════════════════════════════════════════════════════════════════
  seccion("El listado: paginación");
  // ══════════════════════════════════════════════════════════════════════
  const paginas = [];
  for (let p = 1; p <= Math.ceil(deCasiano / 2) + 1; p++) paginas.push(await listar(casianoVe, `estado=TODAS&pageSize=2&page=${p}`));
  const ids = paginas.flatMap((x) => x.gastos.map((g) => g.id));
  ok("de a dos, las páginas no se pisan y juntas son todos", new Set(ids).size === deCasiano && ids.length === deCasiano, JSON.stringify(ids));
  ok("la última página de más viene vacía, con el mismo total", paginas.at(-1).gastos.length === 0 && paginas.at(-1).paginacion.total === deCasiano);
  const orden = paginas.flatMap((x) => x.gastos);
  ok("de la fecha más nueva a la más vieja, y a igual fecha el último cargado primero",
    orden.every((g, i) => i === 0 || orden[i - 1].fecha > g.fecha || (orden[i - 1].fecha === g.fecha && orden[i - 1].id > g.id)),
    JSON.stringify(orden.map((g) => [g.fecha, g.id])));

  // Y la lista vacía, en una ubicación sin gastos.
  await c.gasto.deleteMany({ where: { localId: otro.id } });
  r = await listar(otroEscribe, "estado=TODAS");
  ok("una ubicación sin gastos: 200, vacía, total 0 y una página", r.status === 200 && r.gastos.length === 0 && r.paginacion.total === 0 && r.paginacion.totalPaginas === 1,
    JSON.stringify(r));

  // ══════════════════════════════════════════════════════════════════════
  seccion("El listado, más amplio: estado resuelto en la base, página por página");
  // ══════════════════════════════════════════════════════════════════════
  // Quince gastos del otro local, de a tres por día en cinco días: uno sin
  // pagar, uno a medias y uno saldado. Se recorre cada pestaña de a cuatro y se
  // compara contra lo que dice `estadoDeCuenta` —la definición del dominio—
  // sobre lo que quedó en la base, no contra una cuenta escrita acá.
  const dias = [0, 1, 2, 3, 4].map((d) => sumarDias("2026-09-20", d));
  const indiceDe = new Map();
  for (let i = 0; i < 15; i++) {
    const g = (await crear(otroEscribe, base({ concepto: `Lote ${i}`, total: 1000 + i, fecha: dias[Math.floor(i / 3)], categoriaId: cat(i % 2 ? "Servicios" : "Otros") }))).gasto;
    indiceDe.set(g.id, i);
    if (i % 3 === 1) await pagar(otroEscribe, g.id, { monto: 500, medio: "TRANSFERENCIA", idempotencyKey: clave() });
    if (i % 3 === 2) await pagar(otroEscribe, g.id, { monto: 1000 + i, medio: "OTRO", idempotencyKey: clave() });
  }
  const { estadoDeCuenta } = await import("../../lib/finanzas/pagosProveedores.js");
  const enLaBase = (await c.gasto.findMany({ where: { localId: otro.id }, select: { id: true, fecha: true, total: true, pagos: { select: { monto: true } } } }))
    .map((g) => ({ id: g.id, fecha: g.fecha.toISOString().slice(0, 10), estado: estadoDeCuenta({ total: g.total, pagos: g.pagos }).estado }));
  const esperado = {
    TODAS: enLaBase,
    PAGADAS: enLaBase.filter((g) => g.estado === "PAGADA"),
    PENDIENTES: enLaBase.filter((g) => g.estado !== "PAGADA"),
  };
  const ordenar = (lista) => [...lista].sort((a, b) => (a.fecha === b.fecha ? b.id - a.id : a.fecha < b.fecha ? 1 : -1)).map((g) => g.id);
  ok("la siembra tiene los tres estados, cinco de cada uno", ["PENDIENTE", "PARCIAL", "PAGADA"].every((e) => enLaBase.filter((g) => g.estado === e).length === 5));
  for (const [estado, lista] of Object.entries(esperado)) {
    const paginasDe = [];
    const primera = await listar(otroEscribe, `estado=${estado}&pageSize=4&page=1`);
    for (let p = 1; p <= primera.paginacion.totalPaginas; p++) paginasDe.push(p === 1 ? primera : await listar(otroEscribe, `estado=${estado}&pageSize=4&page=${p}`));
    const idsDe = paginasDe.flatMap((x) => x.gastos.map((g) => g.id));
    ok(`${estado}: el total y las páginas son las del conjunto filtrado (${lista.length} → ${Math.ceil(lista.length / 4)} páginas)`,
      primera.paginacion.total === lista.length && primera.paginacion.totalPaginas === Math.ceil(lista.length / 4), JSON.stringify(primera.paginacion));
    ok(`${estado}: cada página viene llena salvo la última, sin filas de menos`,
      paginasDe.every((x, i) => x.gastos.length === (i < paginasDe.length - 1 ? 4 : lista.length - 4 * (paginasDe.length - 1))),
      JSON.stringify(paginasDe.map((x) => x.gastos.length)));
    ok(`${estado}: juntas son exactamente el conjunto, en el orden de siempre`, JSON.stringify(idsDe) === JSON.stringify(ordenar(lista)),
      JSON.stringify([idsDe, ordenar(lista)]));
    ok(`${estado}: cada fila trae el estado que le da el dominio`,
      paginasDe.flatMap((x) => x.gastos).every((g) => g.estado === lista.find((e) => e.id === g.id)?.estado));
  }
  // Todos los filtros juntos, en la base: Pendientes, Servicios, tres días y
  // una búsqueda. Contra el mismo cálculo hecho a mano sobre la siembra.
  r = await listar(otroEscribe, `estado=PENDIENTES&categoriaId=${cat("Servicios")}&fechaDesde=${dias[1]}&fechaHasta=${dias[3]}&q=lote&pageSize=2`);
  // Servicios son los de índice impar.
  const combinados = enLaBase.filter((g) => g.estado !== "PAGADA" && g.fecha >= dias[1] && g.fecha <= dias[3] && indiceDe.get(g.id) % 2 === 1);
  ok("estado, categoría, fechas y búsqueda combinados: el total es el del cruce, paginado de a dos",
    r.status === 200 && r.paginacion.total === combinados.length && r.gastos.length === Math.min(2, combinados.length) &&
    r.gastos.every((g) => combinados.some((x) => x.id === g.id)), JSON.stringify([r.paginacion, combinados.map((g) => g.id)]));
} catch (err) {
  fallas.push(`la prueba se cayó: ${err?.stack || err}`);
  console.log(`  ✗ la prueba se cayó: ${err?.stack || err}`);
} finally {
  await c?.$disconnect().catch(() => {});
  await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`).catch(() => {});
  await principal.$disconnect();
}

console.log(`\n${pasadas} afirmaciones en verde, ${fallas.length} en rojo.`);
if (fallas.length) {
  for (const f of fallas) console.log(`  ✗ ${f}`);
  process.exit(1);
}
