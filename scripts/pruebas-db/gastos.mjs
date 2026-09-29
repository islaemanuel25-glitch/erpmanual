// LOS GASTOS CONTRA POSTGRESQL.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/gastos.mjs
//
// Ejerce las dos puertas reales —`crearGasto` y `registrarPagoGasto`, de
// `lib/finanzas/gastosServer.js`— sobre una base descartable construida con
// TODAS las migraciones del árbol, y la clasificación del RETIRO por la ruta
// real del tablero de Finanzas. Lo que no se puede afirmar sin base: la
// transacción, el RETIRO y su vínculo, la idempotencia bajo carrera, los locks,
// los CHECK y los UNIQUE.
//
// Los estados raros —un turno cerrado, uno anulado, una falla a mitad de la
// transacción— se preparan sobre esa base descartable, que se borra al
// terminar. Nivel ESCRITURA: host local y NODE_ENV distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");

const DB = "erpazul_gastos_prueba";
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

// Los módulos de servidor importan el cliente por defecto de `@/lib/prisma`,
// que lee DATABASE_URL al cargarse: se apunta a la base descartable ANTES.
await principal.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
await principal.$executeRawUnsafe(`CREATE DATABASE "${DB}"`);
aplicarMigraciones(sinParametros(urlDe(DB)));
process.env.DATABASE_URL = urlDe(DB);

const jwt = (await import("jsonwebtoken")).default;
const {
  crearGasto,
  registrarPagoGasto,
  gastoYaRegistrado,
  categoriasDeGasto,
  ErrorGasto,
  ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO,
  ERROR_ORIGEN_DE_OTRA_UBICACION_GASTO,
  ERROR_CATEGORIA_INVALIDA,
} = await import("../../lib/finanzas/gastosServer.js");
const { ERROR_FALTA_TURNO, ERROR_TURNO_DE_OTRA_UBICACION, ERROR_TURNO_NO_OPERATIVO, ERROR_TURNO_SIN_EFECTIVO } =
  await import("../../lib/finanzas/salidaDelPago.js");
const { ERROR_GASTO_PAGADO, ERROR_MONTO_MAYOR_AL_SALDO_GASTO, CATEGORIAS_INICIALES, PERMISO_REGISTRAR_GASTOS } =
  await import("../../lib/finanzas/gastos.js");
const { ERROR_MONTO_INVALIDO } = await import("../../lib/finanzas/pagosProveedores.js");
const { CLASE_MOVIMIENTO } = await import("../../lib/finanzas/movimientosDeCaja.js");
const rutaTablero = await import("../../app/api/finanzas/tablero/route.js");
const rutaTurno = await import("../../app/api/finanzas/turno/[turnoId]/route.js");

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

/** Corre `fn` y devuelve el error (su mensaje y status), o null si no falló. */
async function error(fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    return { mensaje: e?.message ?? String(e), status: e?.status ?? null, esDeGasto: e instanceof ErrorGasto, code: e?.code };
  }
}

let c = null;
try {
  c = await crearClientePrisma({ nivel: ESCRITURA, url: urlDe(DB) });

  // ── LA SIEMBRA ─────────────────────────────────────────────────────────
  //
  // Un grupo con su depósito y dos locales —"Casiano" y "Otro"—, cada uno con su
  // turno abierto. La forma es la de `scripts/pruebas-db/finanzas.mjs`.
  const grupo = await c.grupo.create({ data: { nombre: "Gastos CI" } });
  const deposito = await c.local.create({ data: { nombre: "Depósito", es_deposito: true } });
  const casiano = await c.local.create({ data: { nombre: "Casiano Casas" } });
  const otro = await c.local.create({ data: { nombre: "Otro local" } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  for (const l of [casiano, otro]) await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: l.id } });
  const rol = await c.rol.create({ data: { nombre: "CI gastos", permisos: ["finanzas.ver", PERMISO_REGISTRAR_GASTOS] } });
  const usuario = async (nombre, localId) =>
    c.usuario.create({ data: { nombre, email: `${nombre.replace(/\s/g, "")}@ci.local`, passwordHash: "x", rolId: rol.id, localId } });
  const uCasiano = await usuario("Cajero Casiano", casiano.id);
  const uCasiano2 = await usuario("Cajero Casiano 2", casiano.id);
  const uCasiano3 = await usuario("Cajero Casiano 3", casiano.id);
  const uOtro = await usuario("Cajero Otro", otro.id);
  const uDeposito = await usuario("Depósito", deposito.id);
  const turnoCasiano = await c.turno.create({ data: { localId: casiano.id, vendedorId: uCasiano.id, montoInicial: 200000, apertura: new Date() } });
  const turnoOtro = await c.turno.create({ data: { localId: otro.id, vendedorId: uOtro.id, montoInicial: 0, apertura: new Date() } });
  const turnoCerrado = await c.turno.create({
    data: { localId: casiano.id, vendedorId: uCasiano2.id, montoInicial: 0, apertura: new Date(Date.now() - 86400000), cierre: new Date() },
  });
  const turnoAnulado = await c.turno.create({
    data: { localId: casiano.id, vendedorId: uCasiano3.id, montoInicial: 0, apertura: new Date(), anuladoEn: new Date(), cierre: new Date() },
  });

  // Las sesiones con la forma de `getUsuarioSession`: id, esAdmin, permisos.
  const PERMISOS = ["finanzas.ver", PERMISO_REGISTRAR_GASTOS];
  const sesion = (u, permisos = PERMISOS) => ({ id: u.id, esAdmin: false, permisos, localId: u.localId });
  const sCasiano = sesion(uCasiano);
  const sDeposito = sesion(uDeposito);
  const sSoloVer = sesion(uCasiano, ["finanzas.ver"]);

  const categorias = await categoriasDeGasto(c);
  const mantenimiento = categorias.find((x) => x.nombre === "Mantenimiento");
  const servicios = categorias.find((x) => x.nombre === "Servicios");

  const tx = (fn) => c.$transaction(fn);
  let n = 0;
  const clave = () => `ci-${Date.now().toString(36)}-${++n}`;
  const retirosDe = (turnoId) => c.cajaMovimiento.count({ where: { turnoId, tipo: "RETIRO" } });
  const totales = async () => ({
    gastos: await c.gasto.count(),
    pagos: await c.pagoGasto.count(),
    retiros: await c.cajaMovimiento.count({ where: { tipo: "RETIRO" } }),
  });
  const base = (extra = {}) => ({
    session: sCasiano,
    grupoId: grupo.id,
    localId: casiano.id,
    localOperativoId: casiano.id,
    categoriaId: mantenimiento.id,
    concepto: "Reparación heladera",
    total: 100000,
    fecha: "2026-09-29",
    idempotencyKey: clave(),
    ...extra,
  });

  // ══════════════════════════════════════════════════════════════════════
  seccion("Las categorías iniciales");
  // ══════════════════════════════════════════════════════════════════════
  ok("las siete, activas, en el orden de la migración", JSON.stringify(categorias.map((x) => x.nombre)) === JSON.stringify(CATEGORIAS_INICIALES),
    JSON.stringify(categorias));
  ok("el nombre es único en la base",
    (await error(() => c.categoriaGasto.create({ data: { nombre: "Alquiler" } })))?.code === "P2002");

  // ══════════════════════════════════════════════════════════════════════
  seccion("Un gasto pendiente (22, 1, 7)");
  // ══════════════════════════════════════════════════════════════════════
  const antes0 = await totales();
  const r0 = await tx((t) => crearGasto(t, base({ concepto: "Luz de septiembre", categoriaId: servicios.id, total: "85.300,50", beneficiario: " EPEC ", comprobanteNumero: "0001-123", comprobanteFecha: "2026-09-20", vencimiento: "2026-10-10", fecha: "2026-09-30" })));
  const g0 = r0.gasto;
  ok("nace sin pago y sin retiro", r0.pago === null && JSON.stringify(await totales()) === JSON.stringify({ ...antes0, gastos: antes0.gastos + 1 }));
  ok("pertenece a su ubicación y a su grupo", g0.localId === casiano.id && g0.grupoId === grupo.id);
  ok("el estado es derivado: PENDIENTE, saldo = total", g0.estado === "PENDIENTE" && g0.total === 85300.5 && g0.pagado === 0 && g0.saldo === 85300.5, JSON.stringify(g0));
  ok("las fechas son días: el del gasto, el del comprobante y el vencimiento",
    g0.fecha === "2026-09-30" && g0.comprobanteFecha === "2026-09-20" && g0.vencimiento === "2026-10-10" && g0.fechaPrevistaPago === null);
  ok("los textos se recortan", g0.beneficiario === "EPEC" && g0.categoria.nombre === "Servicios");
  const fila0 = await c.gasto.findUnique({ where: { id: g0.id } });
  ok("en la base no hay saldo ni estado guardados: solo el total", !("saldo" in fila0) && !("estado" in fila0) && Number(fila0.total) === 85300.5);

  // ══════════════════════════════════════════════════════════════════════
  seccion("Pagos parciales, no efectivo (6, 7, 8, 16, 5, 4)");
  // ══════════════════════════════════════════════════════════════════════
  const retirosAntes = await c.cajaMovimiento.count();
  const p1 = await tx((t) => registrarPagoGasto(t, { session: sCasiano, gastoId: g0.id, monto: 30000, medio: "TRANSFERENCIA", localOrigenId: casiano.id, localOperativoId: casiano.id, idempotencyKey: clave() }));
  ok("transferencia parcial: PARCIAL con el saldo que falta", p1.gasto.estado === "PARCIAL" && p1.gasto.pagado === 30000 && p1.gasto.saldo === 55300.5, JSON.stringify(p1.gasto));
  ok("la transferencia NO crea retiro ni lleva turno", p1.pago.turnoId === null && p1.pago.cajaMovimientoId === null && (await c.cajaMovimiento.count()) === retirosAntes);
  const p2 = await tx((t) => registrarPagoGasto(t, { session: sCasiano, gastoId: g0.id, monto: 300.5, medio: "MERCADO_PAGO", fecha: "2026-09-28", localOrigenId: casiano.id, localOperativoId: casiano.id, idempotencyKey: clave() }));
  ok("Mercado Pago con fecha de ayer: se guarda ese día, sin retiro", p2.pago.medio === "MERCADO_PAGO" && p2.pago.cajaMovimientoId === null && (await c.cajaMovimiento.count()) === retirosAntes);
  let e = await error(() => tx((t) => registrarPagoGasto(t, { session: sCasiano, gastoId: g0.id, monto: 55000.01, medio: "OTRO", localOrigenId: casiano.id, localOperativoId: casiano.id, idempotencyKey: clave() })));
  ok("pagar más que el saldo se rechaza", e?.mensaje === ERROR_MONTO_MAYOR_AL_SALDO_GASTO, JSON.stringify(e));
  e = await error(() => tx((t) => registrarPagoGasto(t, { session: sCasiano, gastoId: g0.id, monto: 0, medio: "OTRO", localOrigenId: casiano.id, localOperativoId: casiano.id, idempotencyKey: clave() })));
  ok("un importe cero se rechaza", e?.mensaje === ERROR_MONTO_INVALIDO, JSON.stringify(e));
  e = await error(() => tx((t) => registrarPagoGasto(t, { session: sCasiano, gastoId: g0.id, monto: 1, medio: "TRANSFERENCIA", turnoId: turnoCasiano.id, localOrigenId: casiano.id, localOperativoId: casiano.id, idempotencyKey: clave() })));
  ok("un turno en un pago que no es efectivo se rechaza", e?.mensaje === ERROR_TURNO_SIN_EFECTIVO, JSON.stringify(e));
  const p3 = await tx((t) => registrarPagoGasto(t, { session: sCasiano, gastoId: g0.id, monto: 55000, medio: "OTRO", localOrigenId: casiano.id, localOperativoId: casiano.id, idempotencyKey: clave() }));
  ok("el pago que completa deja saldo 0 y PAGADA", p3.gasto.saldo === 0 && p3.gasto.estado === "PAGADA", JSON.stringify(p3.gasto));
  e = await error(() => tx((t) => registrarPagoGasto(t, { session: sCasiano, gastoId: g0.id, monto: 1, medio: "OTRO", localOrigenId: casiano.id, localOperativoId: casiano.id, idempotencyKey: clave() })));
  ok("un gasto pagado no se vuelve a pagar", e?.mensaje === ERROR_GASTO_PAGADO, JSON.stringify(e));
  ok("la base no acepta un importe no positivo aunque se saltee la función",
    /PagoGasto_monto_positivo/.test((await error(() => c.$executeRawUnsafe(
      `INSERT INTO "PagoGasto" ("gastoId","monto","medio","localOrigenId","usuarioId","idempotencyKey") VALUES ($1, 0, 'OTRO', $2, $3, 'x')`, g0.id, casiano.id, uCasiano.id)))?.mensaje ?? ""));
  ok("ni un gasto de total cero, ni sin concepto",
    /Gasto_total_positivo/.test((await error(() => c.$executeRawUnsafe(
      `INSERT INTO "Gasto" ("grupoId","localId","categoriaId","concepto","total","fecha","creadoPorId","idempotencyKey","updatedAt") VALUES ($1,$2,$3,'x',0,current_date,$4,'z',now())`, grupo.id, casiano.id, servicios.id, uCasiano.id)))?.mensaje ?? "") &&
    /Gasto_concepto_no_vacio/.test((await error(() => c.$executeRawUnsafe(
      `INSERT INTO "Gasto" ("grupoId","localId","categoriaId","concepto","total","fecha","creadoPorId","idempotencyKey","updatedAt") VALUES ($1,$2,$3,'   ',1,current_date,$4,'z2',now())`, grupo.id, casiano.id, servicios.id, uCasiano.id)))?.mensaje ?? ""));

  // ══════════════════════════════════════════════════════════════════════
  seccion("Pago en efectivo (10, 11, 12, 13, 14)");
  // ══════════════════════════════════════════════════════════════════════
  const g1 = (await tx((t) => crearGasto(t, base({ concepto: "Bolsas y limpieza", total: 20000 })))).gasto;
  const pagarEfectivo = (extra) => tx((t) => registrarPagoGasto(t, {
    session: sCasiano, gastoId: g1.id, monto: 5000, medio: "EFECTIVO", localOrigenId: casiano.id, localOperativoId: casiano.id, idempotencyKey: clave(), ...extra,
  }));
  const antes1 = await totales();
  e = await error(() => pagarEfectivo({ turnoId: null }));
  ok("efectivo sin turno se rechaza", e?.mensaje === ERROR_FALTA_TURNO, JSON.stringify(e));
  e = await error(() => pagarEfectivo({ turnoId: turnoOtro.id }));
  ok("efectivo desde el turno de OTRO local se rechaza (403)", e?.mensaje === ERROR_TURNO_DE_OTRA_UBICACION && e.status === 403, JSON.stringify(e));
  e = await error(() => pagarEfectivo({ turnoId: turnoCerrado.id }));
  ok("efectivo desde un turno cerrado se rechaza (409)", e?.mensaje === ERROR_TURNO_NO_OPERATIVO && e.status === 409, JSON.stringify(e));
  e = await error(() => pagarEfectivo({ turnoId: turnoAnulado.id }));
  ok("efectivo desde un turno anulado se rechaza", e?.mensaje === ERROR_TURNO_NO_OPERATIVO, JSON.stringify(e));
  ok("ningún rechazo dejó pago ni retiro", JSON.stringify(await totales()) === JSON.stringify(antes1));

  const retirosTurnoAntes = await retirosDe(turnoCasiano.id);
  const pe = await pagarEfectivo({ turnoId: turnoCasiano.id });
  const mov = await c.cajaMovimiento.findUnique({ where: { id: pe.pago.cajaMovimientoId }, include: { pagoGasto: true, pagoProveedor: true } });
  ok("efectivo crea exactamente UN retiro en ese turno", (await retirosDe(turnoCasiano.id)) === retirosTurnoAntes + 1);
  ok("el retiro es RETIRO, por el mismo monto, del turno y del usuario",
    mov?.tipo === "RETIRO" && Number(mov.monto) === 5000 && mov.turnoId === turnoCasiano.id && mov.usuarioId === uCasiano.id, JSON.stringify(mov));
  ok("y queda vinculado al PagoGasto (y a ningún pago a proveedor)",
    mov?.pagoGasto?.id === pe.pago.id && mov.pagoProveedor === null && pe.pago.turnoId === turnoCasiano.id);
  ok("la fecha del pago es la del retiro", new Date(pe.pago.fecha).getTime() === new Date(mov.createdAt).getTime());
  ok("el motivo es para leer: dice qué gasto", /^Pago de gasto: Bolsas y limpieza \(gasto #\d+\)$/.test(mov.motivo), mov.motivo);
  ok("la base no deja que un mismo movimiento sea de dos pagos de gasto",
    (await error(() => c.$executeRawUnsafe(
      `INSERT INTO "PagoGasto" ("gastoId","monto","medio","localOrigenId","usuarioId","turnoId","cajaMovimientoId","idempotencyKey") VALUES ($1, 1, 'EFECTIVO', $2, $3, $4, $5, 'otro')`,
      g1.id, casiano.id, uCasiano.id, turnoCasiano.id, mov.id)))?.mensaje?.includes("cajaMovimientoId") === true);
  ok("ni un efectivo sin retiro, ni un retiro en una transferencia (CHECK)",
    /PagoGasto_efectivo_con_caja/.test((await error(() => c.$executeRawUnsafe(
      `INSERT INTO "PagoGasto" ("gastoId","monto","medio","localOrigenId","usuarioId","idempotencyKey") VALUES ($1, 1, 'EFECTIVO', $2, $3, 'sin-caja')`, g1.id, casiano.id, uCasiano.id)))?.mensaje ?? "") &&
    /PagoGasto_efectivo_con_caja/.test((await error(() => c.$executeRawUnsafe(
      `INSERT INTO "PagoGasto" ("gastoId","monto","medio","localOrigenId","usuarioId","turnoId","idempotencyKey") VALUES ($1, 1, 'TRANSFERENCIA', $2, $3, $4, 'con-turno')`, g1.id, casiano.id, uCasiano.id, turnoCasiano.id)))?.mensaje ?? ""));

  // ══════════════════════════════════════════════════════════════════════
  seccion("La ubicación: cada una paga lo suyo (2, 3)");
  // ══════════════════════════════════════════════════════════════════════
  const antes2 = await totales();
  e = await error(() => tx((t) => registrarPagoGasto(t, { session: sDeposito, gastoId: g1.id, monto: 1000, medio: "TRANSFERENCIA", localOrigenId: casiano.id, localOperativoId: deposito.id, idempotencyKey: clave() })));
  ok("el depósito, que VE el gasto de Casiano, no lo paga (403)", e?.mensaje === ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO && e.status === 403, JSON.stringify(e));
  e = await error(() => tx((t) => registrarPagoGasto(t, { session: sDeposito, gastoId: g1.id, monto: 1000, medio: "TRANSFERENCIA", localOrigenId: deposito.id, localOperativoId: deposito.id, idempotencyKey: clave() })));
  ok("ni con plata del depósito", e?.status === 403, JSON.stringify(e));
  e = await error(() => tx((t) => registrarPagoGasto(t, { session: sCasiano, gastoId: g1.id, monto: 1000, medio: "TRANSFERENCIA", localOrigenId: otro.id, localOperativoId: casiano.id, idempotencyKey: clave() })));
  ok("operando Casiano, la plata no sale de otro local", e?.mensaje === ERROR_ORIGEN_DE_OTRA_UBICACION_GASTO && e.status === 403, JSON.stringify(e));
  e = await error(() => tx((t) => registrarPagoGasto(t, { session: { id: 999999, esAdmin: true, permisos: ["*"] }, gastoId: g1.id, monto: 1000, medio: "TRANSFERENCIA", localOrigenId: casiano.id, localOperativoId: null, idempotencyKey: clave() })));
  ok("un admin en vista global (sin ubicación operativa) tampoco paga", e?.status === 403, JSON.stringify(e));
  e = await error(() => tx((t) => crearGasto(t, base({ session: sDeposito, localOperativoId: deposito.id }))));
  ok("el depósito no crea un gasto a nombre de Casiano", e?.mensaje === ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO && e.status === 403, JSON.stringify(e));
  e = await error(() => tx((t) => crearGasto(t, base({ localId: otro.id, localOperativoId: otro.id, grupoId: grupo.id + 999 }))));
  ok("una ubicación de otro grupo se rechaza", e?.status === 403, JSON.stringify(e));
  e = await error(() => tx((t) => crearGasto(t, base({ session: sSoloVer }))));
  ok("con finanzas.ver solo, no se escribe (403)", e?.status === 403 && e.esDeGasto, JSON.stringify(e));
  e = await error(() => tx((t) => registrarPagoGasto(t, { session: null, gastoId: g1.id, monto: 1, medio: "OTRO", localOrigenId: casiano.id, localOperativoId: casiano.id, idempotencyKey: clave() })));
  ok("sin sesión, no se escribe (401)", e?.status === 401, JSON.stringify(e));
  e = await error(() => tx((t) => crearGasto(t, base({ categoriaId: 999999 }))));
  ok("una categoría que no existe se rechaza", e?.mensaje === ERROR_CATEGORIA_INVALIDA, JSON.stringify(e));
  ok("ningún rechazo dejó gasto, pago ni retiro", JSON.stringify(await totales()) === JSON.stringify(antes2));

  // ══════════════════════════════════════════════════════════════════════
  seccion("Nacer con pago inicial (23, 24, 25, 13, 14)");
  // ══════════════════════════════════════════════════════════════════════
  const retirosCasiano = await retirosDe(turnoCasiano.id);
  const rp = await tx((t) => crearGasto(t, base({ pagoInicial: { monto: 40000, medio: "EFECTIVO", turnoId: turnoCasiano.id } })));
  ok("reparación $100.000 con $40.000 en efectivo: PARCIAL, $60.000 pendientes",
    rp.gasto.total === 100000 && rp.gasto.pagado === 40000 && rp.gasto.saldo === 60000 && rp.gasto.estado === "PARCIAL", JSON.stringify(rp.gasto));
  const movP = await c.cajaMovimiento.findUnique({ where: { id: rp.pago.cajaMovimientoId } });
  ok("y exactamente UN retiro de $40.000, vinculado", (await retirosDe(turnoCasiano.id)) === retirosCasiano + 1 && Number(movP?.monto) === 40000);
  ok("la clave del pago inicial se deriva del gasto", (await c.pagoGasto.findUnique({ where: { id: rp.pago.id } })).idempotencyKey === `gasto-${rp.gasto.id}-pago-inicial`);
  const rt = await tx((t) => crearGasto(t, base({ concepto: "Alquiler octubre", total: 350000, pagoInicial: { monto: 350000, medio: "TRANSFERENCIA" } })));
  ok("nacer totalmente pagado: saldo 0, PAGADA, sin retiro", rt.gasto.saldo === 0 && rt.gasto.estado === "PAGADA" && rt.pago.cajaMovimientoId === null);

  // Atomicidad: el pago inicial en efectivo falla DESPUÉS de crear el retiro.
  // Se prepara la falla con un trigger en la base descartable: el retiro ya
  // está insertado cuando el INSERT del pago aborta la transacción.
  await c.$executeRawUnsafe(`CREATE FUNCTION prueba_falla_pago_gasto() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN IF NEW.nota = 'romper' THEN RAISE EXCEPTION 'FALLA INYECTADA DESPUÉS DEL RETIRO'; END IF; RETURN NEW; END $f$`);
  await c.$executeRawUnsafe(`CREATE TRIGGER prueba_falla_pago_gasto BEFORE INSERT ON "PagoGasto" FOR EACH ROW EXECUTE FUNCTION prueba_falla_pago_gasto()`);
  const antes3 = await totales();
  const claveRota = clave();
  e = await error(() => tx((t) => crearGasto(t, base({ idempotencyKey: claveRota, pagoInicial: { monto: 1000, medio: "EFECTIVO", turnoId: turnoCasiano.id, nota: "romper" } }))));
  ok("la falla a mitad de camino llega como error", /FALLA INYECTADA/.test(e?.mensaje ?? ""), JSON.stringify(e));
  ok("y no deja ni gasto, ni pago, ni retiro huérfano (15, 25)", JSON.stringify(await totales()) === JSON.stringify(antes3), JSON.stringify([antes3, await totales()]));
  await c.$executeRawUnsafe(`DROP TRIGGER prueba_falla_pago_gasto ON "PagoGasto"`);
  await c.$executeRawUnsafe(`DROP FUNCTION prueba_falla_pago_gasto()`);
  const reintento = await tx((t) => crearGasto(t, base({ idempotencyKey: claveRota, pagoInicial: { monto: 1000, medio: "EFECTIVO", turnoId: turnoCasiano.id } })));
  ok("el reintento con la misma clave, ya sin falla, crea el gasto y su pago", reintento.repetido === false && reintento.pago?.monto === 1000);

  // ══════════════════════════════════════════════════════════════════════
  seccion("Idempotencia (9)");
  // ══════════════════════════════════════════════════════════════════════
  const antes4 = await totales();
  const r2 = await tx((t) => crearGasto(t, base({ idempotencyKey: claveRota, pagoInicial: { monto: 1000, medio: "EFECTIVO", turnoId: turnoCasiano.id } })));
  ok("el mismo intento de alta devuelve el gasto y el pago de antes", r2.repetido === true && r2.gasto.id === reintento.gasto.id && r2.pago?.id === reintento.pago.id);
  ok("sin crear gasto, pago ni retiro nuevos", JSON.stringify(await totales()) === JSON.stringify(antes4));
  const claveDePago = clave();
  const primero = await tx((t) => registrarPagoGasto(t, { session: sCasiano, gastoId: rp.gasto.id, monto: 10000, medio: "EFECTIVO", turnoId: turnoCasiano.id, localOrigenId: casiano.id, localOperativoId: casiano.id, idempotencyKey: claveDePago }));
  const antes5 = await totales();
  const segundo = await tx((t) => registrarPagoGasto(t, { session: sCasiano, gastoId: rp.gasto.id, monto: 10000, medio: "EFECTIVO", turnoId: turnoCasiano.id, localOrigenId: casiano.id, localOperativoId: casiano.id, idempotencyKey: claveDePago }));
  ok("el mismo intento de pago devuelve el pago de antes, sin otro retiro", segundo.repetido && segundo.pago.id === primero.pago.id && JSON.stringify(await totales()) === JSON.stringify(antes5));

  // Dos envíos simultáneos del MISMO alta con pago en efectivo.
  const claveCarrera = clave();
  const antes6 = await totales();
  const carrera = await Promise.all([0, 1].map(() =>
    tx((t) => crearGasto(t, base({ concepto: "Carrera", total: 5000, idempotencyKey: claveCarrera, pagoInicial: { monto: 5000, medio: "EFECTIVO", turnoId: turnoCasiano.id } })))
      .catch(async (err) => (err?.code === "P2002" ? gastoYaRegistrado(c, { localId: casiano.id, idempotencyKey: claveCarrera }) : Promise.reject(err)))
  ));
  const despues6 = await totales();
  ok("dos envíos simultáneos: los dos devuelven el MISMO gasto", carrera[0].gasto.id === carrera[1].gasto.id, JSON.stringify(carrera.map((x) => x.gasto.id)));
  ok("y queda UN gasto, UN pago y UN retiro", despues6.gastos === antes6.gastos + 1 && despues6.pagos === antes6.pagos + 1 && despues6.retiros === antes6.retiros + 1,
    JSON.stringify([antes6, despues6]));

  // Dos pagos DISTINTOS a la vez sobre el mismo saldo: el lock deja pasar uno.
  const g7 = (await tx((t) => crearGasto(t, base({ concepto: "Saldo en carrera", total: 10000 })))).gasto;
  const dos = await Promise.allSettled([0, 1].map(() =>
    tx((t) => registrarPagoGasto(t, { session: sCasiano, gastoId: g7.id, monto: 8000, medio: "TRANSFERENCIA", localOrigenId: casiano.id, localOperativoId: casiano.id, idempotencyKey: clave() }))));
  ok("dos pagos de $8.000 sobre $10.000 a la vez: pasa uno, el otro supera el saldo",
    dos.filter((x) => x.status === "fulfilled").length === 1 && dos.find((x) => x.status === "rejected")?.reason?.message === ERROR_MONTO_MAYOR_AL_SALDO_GASTO);

  // ══════════════════════════════════════════════════════════════════════
  seccion("Finanzas clasifica el retiro por el vínculo (17, 18, 21)");
  // ══════════════════════════════════════════════════════════════════════
  // Un retiro manual con el MISMO texto que escribiría un pago de gasto: sin el
  // vínculo, tiene que seguir siendo manual.
  const impostor = await c.cajaMovimiento.create({ data: { turnoId: turnoCasiano.id, usuarioId: uCasiano.id, tipo: "RETIRO", monto: 777, motivo: movP.motivo } });
  const token = jwt.sign({ id: uCasiano.id, nombre: "CI", email: "gastos@ci.local", localId: casiano.id, permisos: ["finanzas.ver"] }, process.env.AUTH_SECRET, { expiresIn: "1h" });
  const resTurno = await rutaTurno.GET(
    new Request(`http://ci/api/finanzas/turno/${turnoCasiano.id}`, { headers: { cookie: `erpazul_sesion=${token}` } }),
    { params: Promise.resolve({ turnoId: String(turnoCasiano.id) }) }
  );
  const cuerpoTurno = await resTurno.json();
  const movimientos = cuerpoTurno?.movimientos ?? cuerpoTurno?.turno?.movimientos ?? [];
  const claseDe = (id) => movimientos.find((m) => m.id === id)?.clase;
  ok("la ruta del turno contesta 200", resTurno.status === 200, JSON.stringify(cuerpoTurno).slice(0, 300));
  ok("el retiro de un PagoGasto es PAGO_GASTO", claseDe(movP.id) === CLASE_MOVIMIENTO.PAGO_GASTO && claseDe(mov.id) === CLASE_MOVIMIENTO.PAGO_GASTO, JSON.stringify(movimientos.map((m) => [m.id, m.clase])));
  ok("el retiro con el mismo texto pero sin vínculo sigue MANUAL", claseDe(impostor.id) === CLASE_MOVIMIENTO.MANUAL);

  const resTablero = await rutaTablero.GET(
    new Request(`http://ci/api/finanzas/tablero?periodo=DIA`, { headers: { cookie: `erpazul_sesion=${token}` } })
  );
  const tablero = await resTablero.json();
  ok("el tablero contesta 200", resTablero.status === 200, JSON.stringify(tablero).slice(0, 300));
  ok("en el resumen, los retiros manuales son SOLO el impostor: ningún pago de gasto se cuenta como retiro manual",
    tablero?.resumen?.caja?.retiros === 777 && tablero?.resumen?.caja?.cantidadRetiros === 1, JSON.stringify(tablero?.resumen?.caja));
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
