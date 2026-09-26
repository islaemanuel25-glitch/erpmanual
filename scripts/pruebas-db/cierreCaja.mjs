// PRUEBA DE BASE DEL CICLO DE CIERRE DE CAJA: LOS TRES CANDADOS.
//
// Ejerce contra PostgreSQL, con los handlers reales de las rutas, lo que un
// candado de texto no puede ver:
//
//   1. LA CARRERA entre el cierre clásico (`turnos/cerrar`) y el corte de cierre
//      (`cierres/iniciar`). El clásico rechaza el corte en una lectura hecha FUERA
//      de su transacción; si el corte entraba entre esa lectura y la escritura, el
//      turno terminaba CERRADO con un corte vivo y su sobre ofrecido. Se fuerza el
//      orden exacto, sin depender del azar: una transacción de la prueba toma la
//      fila del turno, las dos rutas se encolan detrás en un orden conocido, y
//      recién entonces se suelta.
//   2. LA CORRECCIÓN COMPLETA de una venta según el estado de su turno: abierto
//      corrige; con el corte tomado, cerrado o anulado, rechaza sin tocar nada.
//   3. EL VENCIMIENTO POR TIEMPO: un corte con el plazo pasado que todavía dice
//      PREPARANDO —nadie abrió la bandeja— no se puede cancelar; uno vigente sí.
//      Y un vencido se sigue confirmando con un conteo real.
//
// Siembra sus propios datos con una marca única y los borra al terminar.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/cierreCaja.mjs

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const jwt = (await import("jsonwebtoken")).default;

const { crearProductoVendible } = await import("./fixturePos.mjs");

const rutaCerrar = await import("../../app/api/pos-ventas/turnos/cerrar/route.js");
const rutaIniciar = await import("../../app/api/pos-ventas/cierres/iniciar/route.js");
const rutaConfirmar = await import("../../app/api/pos-ventas/cierres/[token]/confirmar/route.js");
const rutaCancelar = await import("../../app/api/pos-ventas/cierres/[token]/cancelar/route.js");
const rutaCrearVenta = await import("../../app/api/pos-ventas/crear/route.js");
const rutaCorregir = await import("../../app/api/pos-ventas/venta/[id]/corregir/route.js");
const rutaSinConteo = await import("../../app/api/pos-ventas/cierres/[token]/cerrar-sin-conteo/route.js");
const rutaPendientes = await import("../../app/api/pos-ventas/cierres/pendientes/route.js");
const rutaResumen = await import("../../app/api/pos-ventas/turnos/resumen/route.js");
const rutaFinanzasTurno = await import("../../app/api/finanzas/turno/[turnoId]/route.js");

const { ESTADO_TURNO, ESTADO_CIERRE, estadoDelTurno, PERMISO_CERRAR_SIN_CONTEO, ACCION_CERRAR_SIN_CONTEO } =
  await import("../../lib/caja/cierreRelevo.js");
const { CAJA_SIN_CONTEO } = await import("../../lib/caja/vistaTurno.js");
const { COD_TURNO_CERRADO, COD_TURNO_EN_CIERRE } = await import(
  "../../lib/pos-ventas/correccionCompletaServer.js"
);

// ═══════════════════════════════════════════════════════════════════════════
// ARNÉS
// ═══════════════════════════════════════════════════════════════════════════

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

const SECRETO = process.env.AUTH_SECRET;
const PERMISOS = ["pos.usar", "pos.turnos", "ventas.corregir_completa"];
const token = (usuario, localId, grupoId, permisos = PERMISOS) =>
  jwt.sign(
    { id: usuario.id, nombre: usuario.nombre, email: usuario.email, localId, grupoId, permisos },
    SECRETO,
    { expiresIn: "1h" }
  );
const pedidoGet = (url, sesion) => {
  const req = new Request(url, { headers: { cookie: `erpazul_sesion=${sesion}` } });
  // Los handlers leen `req.nextUrl.searchParams`, que el Request nativo no tiene.
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
};

const pedido = (url, sesion, cuerpo) =>
  new Request(url, {
    method: "POST",
    headers: { cookie: `erpazul_sesion=${sesion}`, "content-type": "application/json" },
    body: JSON.stringify(cuerpo ?? {}),
  });
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });
const conToken = (t) => ({ params: Promise.resolve({ token: t }) });
const conId = (id) => ({ params: Promise.resolve({ id: String(id) }) });

const BASE = "http://ci/api/pos-ventas";

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const marca = `ci-cierre-caja-${Date.now()}`;
const creado = { grupoId: null, localId: null, usuarioId: null, rolId: null };

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: PERMISOS } });
  creado.rolId = rol.id;
  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  const local = await prisma.local.create({ data: { nombre: `${marca}-local`, tipo: "local" } });
  creado.localId = local.id;
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  // El gate de operario es de otro circuito: se apaga explícitamente.
  await prisma.configuracionLocal.create({
    data: { localId: local.id, exigirOperador: false, allowNegativeStock: true },
  });
  const usuario = await prisma.usuario.create({
    data: { nombre: `${marca}-cajero`, email: `${marca}@ci.local`, passwordHash: "x", rolId: rol.id, localId: local.id },
  });
  creado.usuarioId = usuario.id;

  const producto = await crearProductoVendible(prisma, {
    grupoId: grupo.id,
    localId: local.id,
    nombre: `${marca}-producto`,
    precioVenta: 1000,
    precioCosto: 600,
    stock: 100,
  });

  // La corrección completa es beta: se habilita SOLO para este usuario, en este
  // proceso. `enBetaCorreccionCompleta` lee la variable en cada pedido.
  process.env.CORRECCION_VENTAS_BETA_USER_IDS = String(usuario.id);

  return {
    grupo,
    local,
    usuario,
    producto,
    sesion: token(usuario, local.id, grupo.id),
    // La misma persona CON el permiso excepcional. La sesión de arriba no lo tiene,
    // y eso es lo que prueba el rechazo por permiso.
    sesionSinConteo: token(usuario, local.id, grupo.id, [...PERMISOS, PERMISO_CERRAR_SIN_CONTEO, "finanzas.ver"]),
  };
}

async function desmontar() {
  if (!creado.grupoId) return;
  const localId = creado.localId;
  const turnos = (await prisma.turno.findMany({ where: { localId }, select: { id: true } })).map((t) => t.id);
  await prisma.auditoriaBitacora.deleteMany({ where: { localId } });
  const ventas = (await prisma.venta.findMany({ where: { localId }, select: { id: true } })).map((v) => v.id);
  await prisma.ventaCorreccion.deleteMany({ where: { ventaId: { in: ventas } } });
  await prisma.ventaDetalleComponente.deleteMany({ where: { ventaDetalle: { venta: { localId } } } });
  await prisma.ventaDetalle.deleteMany({ where: { venta: { localId } } });
  await prisma.ventaPago.deleteMany({ where: { venta: { localId } } });
  await prisma.venta.deleteMany({ where: { localId } });
  await prisma.cambioPendiente.deleteMany({ where: { localId } });
  await prisma.cierrePreparacion.deleteMany({ where: { localId } });
  await prisma.arqueoCaja.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.cajaMovimiento.deleteMany({ where: { turnoId: { in: turnos } } });
  await prisma.turno.deleteMany({ where: { localId } });
  await prisma.stockLocal.deleteMany({ where: { localId } });
  await prisma.productoLocal.deleteMany({ where: { localId } });
  await prisma.productoBase.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.posVentaCounter.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.configuracionLocal.deleteMany({ where: { localId } });
  await prisma.usuario.deleteMany({ where: { id: creado.usuarioId } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: creado.grupoId } });
  await prisma.local.deleteMany({ where: { id: localId } });
  await prisma.grupo.deleteMany({ where: { id: creado.grupoId } });
  await prisma.rol.deleteMany({ where: { id: creado.rolId } });
}

/**
 * Un turno ABIERTO del cajero. Se crea directo porque el candado de "un turno
 * operativo por cajero" es de la apertura, no de lo que se prueba acá; antes de
 * crear uno se cierran a mano los que la prueba dejó vivos.
 */
async function turnoNuevo(f, montoInicial = 10000) {
  await prisma.turno.updateMany({
    where: { localId: f.local.id, vendedorId: f.usuario.id, cierre: null, cierreEnPreparacionEn: null },
    data: { cierre: new Date() },
  });
  return prisma.turno.create({ data: { localId: f.local.id, vendedorId: f.usuario.id, montoInicial } });
}

const estadoDe = async (turnoId) =>
  estadoDelTurno(
    await prisma.turno.findUnique({
      where: { id: turnoId },
      select: { cierre: true, cierreEnPreparacionEn: true, anuladoEn: true },
    })
  );

const cortesVivos = (turnoId) =>
  prisma.cierrePreparacion.count({
    where: { turnoId, estado: { in: [ESTADO_CIERRE.PREPARANDO, ESTADO_CIERRE.VENCIDO] } },
  });

// ── LA CARRERA, FORZADA ────────────────────────────────────────────────────

/** Cuántas conexiones de esta base están esperando un lock ahora mismo. */
async function esperandoLock() {
  const [{ n }] = await prisma.$queryRaw`
    SELECT count(*)::int AS n FROM pg_stat_activity
    WHERE datname = current_database() AND wait_event_type = 'Lock'`;
  return n;
}

async function hastaQueEsperen(n, ms = 15000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if ((await esperandoLock()) >= n) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

/**
 * Toma la fila del turno en una transacción propia, arranca las dos rutas en el
 * orden pedido —cada una recién cuando la anterior ya está esperando el lock— y
 * suelta. Postgres entrega la fila en orden de llegada, así que el orden de la
 * cola es el orden en que escriben.
 *
 * Lo que importa del orden "iniciar primero": el cierre clásico hace su lectura
 * —la que rechaza el corte— ANTES de encolarse, cuando el corte todavía no
 * existe. Es exactamente la ventana de la carrera.
 */
async function carrera(turnoId, primero, segundo) {
  let soltar;
  const suelta = new Promise((r) => { soltar = r; });
  let tomada;
  const lista = new Promise((r) => { tomada = r; });

  const retencion = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Turno" WHERE id = ${turnoId} FOR UPDATE`;
      tomada();
      await suelta;
    },
    { maxWait: 10000, timeout: 60000 }
  );
  await lista;

  const base = await esperandoLock();
  const p1 = primero();
  const encolado1 = await hastaQueEsperen(base + 1);
  const p2 = segundo();
  const encolado2 = await hastaQueEsperen(base + 2);
  soltar();
  await retencion;
  const [r1, r2] = await Promise.all([p1, p2]);
  return { r1, r2, encolados: encolado1 && encolado2 };
}

// ═══════════════════════════════════════════════════════════════════════════

async function correr(f) {
  const { local, sesion, producto } = f;

  const cerrar = (turnoId, contado) =>
    rutaCerrar.POST(pedido(`${BASE}/turnos/cerrar`, sesion, { turnoId, montoRealEfectivo: contado }))
      .then(leer);
  const iniciar = (turnoId) =>
    rutaIniciar.POST(pedido(`${BASE}/cierres/iniciar`, sesion, { turnoId, desgloseCambio: { 2000: 1 } }))
      .then(leer);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("A1. Carrera: el corte entra entre la lectura y la escritura del cierre clásico");
  {
    const t = await turnoNuevo(f);
    const { r1: rIniciar, r2: rCerrar, encolados } = await carrera(
      t.id,
      () => iniciar(t.id),
      () => cerrar(t.id, 10000)
    );
    ok("A1: las dos rutas llegaron a la cola del lock en el orden pedido", encolados);
    ok("A1: gana el corte", rIniciar.ok === true, rIniciar.error);
    ok("A1: el cierre clásico pierde con 409", rCerrar.ok !== true && rCerrar.status === 409,
      `status ${rCerrar.status}, ok ${rCerrar.ok}`);
    ok("A1: y dice que la caja tiene un cierre en preparación", rCerrar.turnoEnPreparacionDeCierre === true,
      rCerrar.error);

    const estado = await estadoDe(t.id);
    const vivos = await cortesVivos(t.id);
    ok("A1: nunca queda un turno CERRADO con un corte vivo",
      !(estado === ESTADO_TURNO.CERRADO && vivos > 0), `estado ${estado}, cortes vivos ${vivos}`);
    igual("A1: el turno queda en preparación de cierre", estado, ESTADO_TURNO.CIERRE_EN_PREPARACION);
    igual("A1: con un solo corte vivo", vivos, 1);
    igual("A1: el cierre clásico no dejó arqueo FINAL",
      await prisma.arqueoCaja.count({ where: { turnoId: t.id, tipo: "FINAL" } }), 0);
    igual("A1: ni movimiento de retiro",
      await prisma.cajaMovimiento.count({ where: { turnoId: t.id, tipo: "RETIRO" } }), 0);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("A2. Carrera al revés: el cierre clásico escribe primero");
  {
    const t = await turnoNuevo(f);
    const { r1: rCerrar, r2: rIniciar, encolados } = await carrera(
      t.id,
      () => cerrar(t.id, 10000),
      () => iniciar(t.id)
    );
    ok("A2: las dos rutas llegaron a la cola del lock en el orden pedido", encolados);
    ok("A2: gana el cierre clásico", rCerrar.ok === true, rCerrar.error);
    ok("A2: el corte pierde con 409", rIniciar.ok !== true && rIniciar.status === 409,
      `status ${rIniciar.status}, ok ${rIniciar.ok}`);
    igual("A2: el turno queda CERRADO", await estadoDe(t.id), ESTADO_TURNO.CERRADO);
    igual("A2: sin ningún corte", await prisma.cierrePreparacion.count({ where: { turnoId: t.id } }), 0);
    igual("A2: ni sobre de cambio", await prisma.cambioPendiente.count({ where: { turnoOrigenId: t.id } }), 0);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("B. Corrección completa según el estado del turno");

  const item = {
    productoBaseId: producto.baseId,
    nombre: "Producto de prueba",
    precio: 1000,
    cantidad: 1,
    precioCosto: 600,
    esServicio: false,
    importeBaseServicio: null,
    subtotalFijado: null,
  };
  let nVenta = 0;
  const vender = async (turnoId) => {
    const r = await leer(
      await rutaCrearVenta.POST(
        pedido(`${BASE}/crear`, sesion, {
          clientTxnId: `${marca}-${(nVenta += 1)}`,
          localId: local.id,
          turnoId,
          items: [item],
          formaPago: "EFECTIVO",
          pagos: [{ medio: "EFECTIVO", monto: 1000 }],
        })
      )
    );
    if (!r.ok) throw new Error(`no se pudo sembrar la venta: ${r.error}`);
    const venta = await prisma.venta.findFirst({ where: { localId: local.id, turnoId }, orderBy: { id: "desc" } });
    return venta;
  };
  // Corregir de 1 a 2 unidades, cobrando $2.000 en efectivo: un cambio que mueve
  // stock y reescribe los pagos, que es justo lo que el corte no puede ver.
  const corregir = async (venta) =>
    leer(
      await rutaCorregir.POST(
        pedido(`${BASE}/venta/${venta.id}/corregir`, sesion, {
          motivo: "Prueba de base del estado del turno",
          idempotencyKey: `${marca}-corr-${venta.id}`,
          version: venta.version ?? 0,
          lineas: [{ productoBaseId: producto.baseId, cantidad: 2, precio: 1000, precioCosto: 600 }],
          pagos: [{ medio: "EFECTIVO", monto: 2000 }],
        }),
        conId(venta.id)
      )
    );
  const stock = async () =>
    Number((await prisma.stockLocal.findFirst({ where: { localId: local.id, productoId: producto.productoLocalId } })).cantidad);
  const pagosDe = async (ventaId) =>
    (await prisma.ventaPago.findMany({ where: { ventaId } })).map((p) => Number(p.monto));

  // ── ABIERTO ──
  {
    const t = await turnoNuevo(f);
    const v = await vender(t.id);
    const antes = await stock();
    const r = await corregir(v);
    ok("B ABIERTO: corrige", r.ok === true, `${r.status} ${r.code ?? ""} ${r.error ?? ""}`);
    igual("B ABIERTO: el stock baja una unidad más", Math.round((antes - (await stock())) * 1000), 1000);
    igual("B ABIERTO: los pagos quedan en $2.000", await pagosDe(v.id), [2000]);
  }

  // ── CIERRE_EN_PREPARACION ──
  let turnoConCorte;
  let tokenCorte;
  {
    const t = await turnoNuevo(f);
    const v = await vender(t.id);
    const rCorte = await iniciar(t.id);
    ok("B EN CIERRE: el corte se toma", rCorte.ok === true, rCorte.error);
    turnoConCorte = t;
    tokenCorte = rCorte.cierre?.token;
    const antes = await stock();
    const r = await corregir(v);
    ok("B EN CIERRE: rechaza con 409", r.status === 409, `${r.status} ${r.error ?? ""}`);
    igual("B EN CIERRE: con el código del corte tomado", r.code, COD_TURNO_EN_CIERRE);
    igual("B EN CIERRE: el stock no se mueve", Math.round((antes - (await stock())) * 1000), 0);
    igual("B EN CIERRE: los pagos no se reescriben", await pagosDe(v.id), [1000]);
    igual("B EN CIERRE: no queda registro de corrección",
      await prisma.ventaCorreccion.count({ where: { ventaId: v.id } }), 0);
  }

  // ── CERRADO: el mismo turno, con el corte confirmado ──
  {
    const rConf = await leer(
      await rutaConfirmar.POST(
        pedido(`${BASE}/cierres/${tokenCorte}/confirmar`, sesion, { desgloseRetiroContado: { 10000: 1 } }),
        conToken(tokenCorte)
      )
    );
    ok("B CERRADO: el corte se confirma", rConf.ok === true, rConf.error);
    const v = await prisma.venta.findFirst({ where: { turnoId: turnoConCorte.id } });
    const r = await corregir(v);
    ok("B CERRADO: rechaza con 409", r.status === 409, `${r.status} ${r.error ?? ""}`);
    igual("B CERRADO: con el código de turno cerrado", r.code, COD_TURNO_CERRADO);
    igual("B CERRADO: los pagos no se reescriben", await pagosDe(v.id), [1000]);
  }

  // ── ANULADO ──
  {
    const t = await turnoNuevo(f);
    const v = await vender(t.id);
    // La anulación técnica no tiene ruta: la escribe el SQL de
    // `scripts/limpieza-turnos-abandonados.sql`, con `cierre` y `anuladoEn`.
    const ahora = new Date();
    await prisma.turno.update({
      where: { id: t.id },
      data: { cierre: ahora, anuladoEn: ahora, anuladoPorId: f.usuario.id, motivoAnulacion: "prueba" },
    });
    const r = await corregir(v);
    ok("B ANULADO: rechaza con 409", r.status === 409, `${r.status} ${r.error ?? ""}`);
    igual("B ANULADO: con el código de turno cerrado", r.code, COD_TURNO_CERRADO);
    igual("B ANULADO: los pagos no se reescriben", await pagosDe(v.id), [1000]);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("C. Vencimiento por tiempo, no por la etiqueta");

  const cancelar = (tok) =>
    rutaCancelar.POST(pedido(`${BASE}/cierres/${tok}/cancelar`, sesion, { motivo: "Prueba de vencimiento" }), conToken(tok))
      .then(leer);
  const vencer = (tok) =>
    // El plazo es de doce horas: acá se corre hacia atrás, sin tocar la etiqueta.
    prisma.cierrePreparacion.update({ where: { token: tok }, data: { venceEn: new Date(Date.now() - 60 * 1000) } });

  // ── Vigente: se cancela, como hasta hoy ──
  {
    const t = await turnoNuevo(f);
    const rCorte = await iniciar(t.id);
    const r = await cancelar(rCorte.cierre.token);
    ok("C vigente: se cancela", r.ok === true, r.error);
    igual("C vigente: el turno vuelve a operar", await estadoDe(t.id), ESTADO_TURNO.ABIERTO);
  }

  // ── Vencido sin marcar: la etiqueta dice PREPARANDO ──
  {
    const t = await turnoNuevo(f);
    const rCorte = await iniciar(t.id);
    const tok = rCorte.cierre.token;
    await vencer(tok);
    const fila = await prisma.cierrePreparacion.findUnique({ where: { token: tok } });
    igual("C vencido sin marcar: la etiqueta sigue diciendo PREPARANDO", fila.estado, ESTADO_CIERRE.PREPARANDO);

    const r = await cancelar(tok);
    ok("C vencido sin marcar: cancelar rechaza con 409", r.status === 409, `${r.status} ${r.error ?? ""}`);
    ok("C vencido sin marcar: y dice que está vencido", /vencido/i.test(r.error ?? ""), r.error);
    const despues = await prisma.cierrePreparacion.findUnique({ where: { token: tok } });
    igual("C vencido sin marcar: el corte no se cancela", despues.estado, ESTADO_CIERRE.PREPARANDO);
    igual("C vencido sin marcar: el turno no vuelve a operar", await estadoDe(t.id), ESTADO_TURNO.CIERRE_EN_PREPARACION);
    igual("C vencido sin marcar: el sobre sigue DISPONIBLE",
      (await prisma.cambioPendiente.findFirst({ where: { cierrePreparacionId: fila.id } }))?.estado, "DISPONIBLE");

    // ── Y se sigue confirmando con un conteo real ──
    const rConf = await leer(
      await rutaConfirmar.POST(
        pedido(`${BASE}/cierres/${tok}/confirmar`, sesion, { desgloseRetiroContado: { 2000: 4 } }),
        conToken(tok)
      )
    );
    ok("C vencido sin marcar: se confirma con un conteo real", rConf.ok === true, rConf.error);
    igual("C vencido sin marcar: el turno queda CERRADO", await estadoDe(t.id), ESTADO_TURNO.CERRADO);
    igual("C vencido sin marcar: con su arqueo FINAL",
      await prisma.arqueoCaja.count({ where: { turnoId: t.id, tipo: "FINAL" } }), 1);
  }

  // ── Vencido y marcado: VENCIDO, como lo deja la bandeja ──
  {
    const t = await turnoNuevo(f);
    const rCorte = await iniciar(t.id);
    const tok = rCorte.cierre.token;
    await vencer(tok);
    await prisma.cierrePreparacion.update({ where: { token: tok }, data: { estado: ESTADO_CIERRE.VENCIDO } });
    const r = await cancelar(tok);
    ok("C VENCIDO: cancelar sigue rechazando", r.status === 409, `${r.status} ${r.error ?? ""}`);
    const rConf = await leer(
      await rutaConfirmar.POST(
        pedido(`${BASE}/cierres/${tok}/confirmar`, sesion, { desgloseRetiroContado: { 2000: 4 } }),
        conToken(tok)
      )
    );
    ok("C VENCIDO: se sigue confirmando con un conteo real", rConf.ok === true, rConf.error);
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("D. Cerrar sin conteo");

  const { sesionSinConteo } = f;
  const sinConteo = (tok, motivo = "El cajero se fue sin contar", ses = sesionSinConteo) =>
    rutaSinConteo.POST(pedido(`${BASE}/cierres/${tok}/cerrar-sin-conteo`, ses, { motivo }), conToken(tok))
      .then(leer);
  const confirmar = (tok) =>
    rutaConfirmar.POST(
      pedido(`${BASE}/cierres/${tok}/confirmar`, sesion, { desgloseRetiroContado: { 2000: 4 } }),
      conToken(tok)
    ).then(leer);
  const bitacoraDe = (turnoId) =>
    prisma.auditoriaBitacora.findMany({ where: { accion: ACCION_CERRAR_SIN_CONTEO, entidadId: String(turnoId) } });

  /** Un turno con una venta y su corte tomado, y opcionalmente ya vencido. */
  const conCorte = async ({ vencido = true } = {}) => {
    const t = await turnoNuevo(f);
    await vender(t.id);
    const rCorte = await iniciar(t.id);
    if (!rCorte.ok) throw new Error(`no se pudo tomar el corte: ${rCorte.error}`);
    const tok = rCorte.cierre.token;
    if (vencido) await vencer(tok);
    const corte = await prisma.cierrePreparacion.findUnique({ where: { token: tok } });
    return { t, tok, corte };
  };

  /** Todo lo que un rechazo NO puede haber tocado. */
  const intacto = async (etiqueta, { t, tok, corte }) => {
    igual(`${etiqueta}: el turno sigue en preparación`, await estadoDe(t.id), ESTADO_TURNO.CIERRE_EN_PREPARACION);
    const despues = await prisma.cierrePreparacion.findUnique({ where: { token: tok } });
    igual(`${etiqueta}: el corte no cambió de estado`, despues.estado, corte.estado);
    igual(`${etiqueta}: sin bitácora`, (await bitacoraDe(t.id)).length, 0);
  };

  // ── 1. Vigente: rechaza ──
  {
    const x = await conCorte({ vencido: false });
    const r = await sinConteo(x.tok);
    ok("D1 vigente: rechaza con 409", r.status === 409, `${r.status} ${r.error ?? ""}`);
    ok("D1 vigente: y dice que todavía no venció", /no venció/.test(r.error ?? ""), r.error);
    await intacto("D1", x);
  }

  // ── 6. Motivo vacío: rechaza ──
  {
    const x = await conCorte();
    const r = await sinConteo(x.tok, "   ");
    igual("D6 motivo vacío: rechaza con 400", r.status, 400);
    await intacto("D6", x);
  }

  // ── 7. Sin permiso: rechaza ──
  {
    const x = await conCorte();
    const r = await sinConteo(x.tok, "sin permiso", sesion);
    igual("D7 sin permiso: rechaza con 403", r.status, 403);
    await intacto("D7", x);
  }

  // ── 2 y 8 a 15. PREPARANDO con el plazo vencido: se cierra, y así ──
  let resuelto;
  {
    const x = await conCorte();
    igual("D2 la etiqueta todavía dice PREPARANDO", x.corte.estado, ESTADO_CIERRE.PREPARANDO);
    const sobreAntes = await prisma.cambioPendiente.findFirst({ where: { cierrePreparacionId: x.corte.id } });
    const movAntes = await prisma.cajaMovimiento.count({ where: { turnoId: x.t.id } });

    const r = await sinConteo(x.tok, "  El cajero se fue sin contar  ");
    ok("D2 PREPARANDO vencido: se cierra sin conteo", r.ok === true && r.repetido === false, `${r.status} ${r.error ?? ""}`);

    const turno = await prisma.turno.findUnique({ where: { id: x.t.id } });
    igual("D8 el turno queda CERRADO", estadoDelTurno(turno), ESTADO_TURNO.CERRADO);
    igual("D9 el esperado es EXACTAMENTE el congelado",
      String(turno.montoEsperadoEfectivo), String(x.corte.efectivoEsperadoCorte));
    igual("D9 la cantidad de ventas es la congelada", turno.cantidadVentas, x.corte.cantidadVentasCorte);
    igual("D10 el contado queda NULL, no 0 ni el esperado", turno.montoRealEfectivo, null);
    igual("D11 la diferencia queda NULL, no 0", turno.diferenciaEfectivo, null);
    igual("D10 el retiro no observado queda NULL", turno.efectivoRetiradoCierre, null);
    igual("D10 sin movimiento de retiro enlazado", turno.retiroCierreMovimientoId, null);
    igual("D9 el cambio separado antes del corte se conserva", String(turno.fondoDejadoCierre), String(x.corte.totalCambio));

    igual("D12 no se creó arqueo FINAL",
      await prisma.arqueoCaja.count({ where: { turnoId: x.t.id, tipo: "FINAL" } }), 0);
    igual("D13 no se creó ningún movimiento de caja",
      await prisma.cajaMovimiento.count({ where: { turnoId: x.t.id } }), movAntes);
    igual("D13 ni de retiro",
      await prisma.cajaMovimiento.count({ where: { turnoId: x.t.id, tipo: "RETIRO" } }), 0);

    const sobreDespues = await prisma.cambioPendiente.findFirst({ where: { cierrePreparacionId: x.corte.id } });
    igual("D14 el sobre de cambio queda intacto",
      JSON.stringify({ ...sobreDespues, updatedAt: null }), JSON.stringify({ ...sobreAntes, updatedAt: null }));

    const corte = await prisma.cierrePreparacion.findUnique({ where: { token: x.tok } });
    igual("D2 el corte queda CERRADO_SIN_CONTEO", corte.estado, ESTADO_CIERRE.CERRADO_SIN_CONTEO);
    ok("D2 con fecha de resolución", corte.cerradoSinConteoEn instanceof Date);
    igual("D2 con quién resolvió", corte.cerradoSinConteoPorUsuarioId, f.usuario.id);
    igual("D2 con el motivo, recortado", corte.motivoCierreSinConteo, "El cajero se fue sin contar");
    igual("D2 sin conteo ni diferencia en el corte", [corte.totalContado, corte.diferencia, corte.arqueoFinalId], [null, null, null]);
    igual("D2 la evidencia del corte no se pisa",
      [String(corte.efectivoEsperadoCorte), corte.ultimaVentaId, String(corte.corteEn)],
      [String(x.corte.efectivoEsperadoCorte), x.corte.ultimaVentaId, String(x.corte.corteEn)]);

    const bit = await bitacoraDe(x.t.id);
    igual("D15 hay UNA fila de bitácora", bit.length, 1);
    const res = bit[0]?.cambios?.[0]?.resolucion ?? {};
    igual("D15 la bitácora dice turno, cierre, local y usuario",
      [res.turnoId, res.cierrePreparacionId, res.localId, bit[0]?.usuarioId],
      [x.t.id, x.corte.id, local.id, f.usuario.id]);
    igual("D15 y el motivo y el esperado congelado",
      [res.motivo, res.esperadoCongelado], ["El cajero se fue sin contar", Number(x.corte.efectivoEsperadoCorte)]);
    igual("D15 y que NO hubo conteo, arqueo ni retiro",
      [res.huboConteo, res.contado, res.diferencia, res.arqueoFinalCreado, res.movimientoRetiroCreado],
      [false, null, null, false, false]);

    // ── 16. Doble llamada: una sola resolución ──
    const r2 = await sinConteo(x.tok, "otro motivo");
    ok("D16 la segunda llamada no vuelve a resolver", r2.ok === true && r2.repetido === true, `${r2.status} ${r2.error ?? ""}`);
    igual("D16 sigue habiendo UNA fila de bitácora", (await bitacoraDe(x.t.id)).length, 1);
    igual("D16 el motivo es el primero",
      (await prisma.cierrePreparacion.findUnique({ where: { token: x.tok } })).motivoCierreSinConteo,
      "El cajero se fue sin contar");

    // Y ya no se confirma ni se cancela.
    const rConf = await confirmar(x.tok);
    ok("D16 ya no se confirma", rConf.status === 409 && /sin conteo/.test(rConf.error ?? ""), `${rConf.status} ${rConf.error ?? ""}`);
    resuelto = x;
  }

  // ── 3. VENCIDO marcado: se cierra ──
  {
    const x = await conCorte();
    await prisma.cierrePreparacion.update({ where: { token: x.tok }, data: { estado: ESTADO_CIERRE.VENCIDO } });
    const r = await sinConteo(x.tok);
    ok("D3 VENCIDO: se cierra sin conteo", r.ok === true, `${r.status} ${r.error ?? ""}`);
    igual("D3 el turno queda CERRADO", await estadoDe(x.t.id), ESTADO_TURNO.CERRADO);
  }

  // ── 4. CONFIRMADO: rechaza ──
  {
    const x = await conCorte({ vencido: false });
    const rConf = await confirmar(x.tok);
    ok("D4 el corte se confirma con su conteo", rConf.ok === true, rConf.error);
    await vencer(x.tok);
    const r = await sinConteo(x.tok);
    ok("D4 CONFIRMADO: rechaza con 409", r.status === 409, `${r.status} ${r.error ?? ""}`);
    igual("D4 el corte sigue CONFIRMADO",
      (await prisma.cierrePreparacion.findUnique({ where: { token: x.tok } })).estado, ESTADO_CIERRE.CONFIRMADO);
    igual("D4 sin bitácora", (await bitacoraDe(x.t.id)).length, 0);
  }

  // ── 5. CANCELADO: rechaza ──
  {
    const x = await conCorte({ vencido: false });
    const rCan = await cancelar(x.tok);
    ok("D5 el corte se cancela", rCan.ok === true, rCan.error);
    await vencer(x.tok);
    const r = await sinConteo(x.tok);
    ok("D5 CANCELADO: rechaza con 409", r.status === 409, `${r.status} ${r.error ?? ""}`);
    igual("D5 el turno sigue ABIERTO", await estadoDe(x.t.id), ESTADO_TURNO.ABIERTO);
    igual("D5 sin bitácora", (await bitacoraDe(x.t.id)).length, 0);
  }

  // ── 17. Carrera contra confirmar, en los dos órdenes ──
  {
    const x = await conCorte();
    const { r1: rSin, r2: rConf, encolados } = await carrera(x.t.id, () => sinConteo(x.tok), () => confirmar(x.tok));
    ok("D17a las dos llegaron a la cola en el orden pedido", encolados);
    ok("D17a gana cerrar sin conteo", rSin.ok === true && rSin.repetido === false, rSin.error);
    ok("D17a confirmar pierde con 409", rConf.status === 409, `${rConf.status} ${rConf.error ?? ""}`);
    igual("D17a queda CERRADO_SIN_CONTEO",
      (await prisma.cierrePreparacion.findUnique({ where: { token: x.tok } })).estado, ESTADO_CIERRE.CERRADO_SIN_CONTEO);
    igual("D17a sin arqueo FINAL", await prisma.arqueoCaja.count({ where: { turnoId: x.t.id, tipo: "FINAL" } }), 0);
    igual("D17a el contado sigue NULL", (await prisma.turno.findUnique({ where: { id: x.t.id } })).montoRealEfectivo, null);
  }
  {
    const x = await conCorte();
    const { r1: rConf, r2: rSin, encolados } = await carrera(x.t.id, () => confirmar(x.tok), () => sinConteo(x.tok));
    ok("D17b las dos llegaron a la cola en el orden pedido", encolados);
    ok("D17b gana confirmar", rConf.ok === true, rConf.error);
    ok("D17b cerrar sin conteo pierde con 409", rSin.status === 409, `${rSin.status} ${rSin.error ?? ""}`);
    igual("D17b queda CONFIRMADO",
      (await prisma.cierrePreparacion.findUnique({ where: { token: x.tok } })).estado, ESTADO_CIERRE.CONFIRMADO);
    igual("D17b con su arqueo FINAL", await prisma.arqueoCaja.count({ where: { turnoId: x.t.id, tipo: "FINAL" } }), 1);
    igual("D17b sin bitácora de sin conteo", (await bitacoraDe(x.t.id)).length, 0);
  }

  // ── 16b. Dos "cerrar sin conteo" a la vez: una sola resolución ──
  {
    const x = await conCorte();
    const { r1, r2, encolados } = await carrera(x.t.id, () => sinConteo(x.tok, "primero"), () => sinConteo(x.tok, "segundo"));
    ok("D16b las dos llegaron a la cola", encolados);
    igual("D16b las dos contestan bien", [r1.ok, r2.ok], [true, true]);
    igual("D16b solo UNA resolvió; la otra lo reconoce", [r1.repetido, r2.repetido].sort(), [false, true]);
    igual("D16b UNA fila de bitácora", (await bitacoraDe(x.t.id)).length, 1);
    igual("D16b el motivo es el de la que ganó",
      (await prisma.cierrePreparacion.findUnique({ where: { token: x.tok } })).motivoCierreSinConteo, "primero");
  }

  // ── 18. El cierre normal con conteo sigue igual ──
  {
    const x = await conCorte({ vencido: false });
    const r = await confirmar(x.tok);
    ok("D18 el cierre con conteo confirma", r.ok === true, r.error);
    const turno = await prisma.turno.findUnique({ where: { id: x.t.id } });
    ok("D18 con contado y diferencia", turno.montoRealEfectivo != null && turno.diferenciaEfectivo != null);
    igual("D18 con su arqueo FINAL", await prisma.arqueoCaja.count({ where: { turnoId: x.t.id, tipo: "FINAL" } }), 1);
  }

  // ── 19. Los lectores: "sin contar", no un cero ──
  {
    const tid = resuelto.t.id;
    const rRes = await leer(await rutaResumen.GET(pedidoGet(`${BASE}/turnos/resumen?turnoId=${tid}`, sesion)));
    ok("D19 el resumen responde", rRes.ok === true, rRes.error);
    igual("D19 el resumen trae el corte resuelto sin conteo", rRes.relevo?.corte?.estado, ESTADO_CIERRE.CERRADO_SIN_CONTEO);

    const rFin = await leer(
      await rutaFinanzasTurno.GET(
        pedidoGet(`http://ci/api/finanzas/turno/${tid}`, sesionSinConteo),
        { params: Promise.resolve({ turnoId: String(tid) }) }
      )
    );
    ok("D19 Finanzas responde", rFin.ok === true, `${rFin.status} ${rFin.error ?? ""}`);
    igual("D19 Finanzas dice 'cerrado sin conteo', no 'turno abierto'", rFin.resultado?.estado, CAJA_SIN_CONTEO);
    igual("D19 sin diferencia inventada", rFin.resultado?.monto, null);

    const rPend = await leer(await rutaPendientes.GET(pedidoGet(`${BASE}/cierres/pendientes`, sesion)));
    ok("D19 el resuelto ya no aparece entre los pendientes",
      rPend.ok === true && !(rPend.items || []).some((i) => i.token === resuelto.tok), rPend.error);
  }

  // ── 20. Resolver uno no toca los demás ──
  {
    const otro = await conCorte();
    const tercero = await conCorte();
    const r = await sinConteo(tercero.tok);
    ok("D20 se resuelve uno", r.ok === true, r.error);
    await intacto("D20 el otro vencido", otro);
  }
}

// ═══════════════════════════════════════════════════════════════════════════

let codigo = 0;
try {
  if (!SECRETO) { console.error("ABORTADO: falta AUTH_SECRET."); process.exit(2); }
  console.log("Montando fixtures…");
  await correr(await montar());
} catch (err) {
  fallas.push(`EXCEPCIÓN: ${err?.stack || err?.message || err}`);
  console.error(err);
} finally {
  await desmontar().catch((e) => console.error("Limpieza incompleta:", e.message));
  await prisma.$disconnect();
}

console.log(`\n${"═".repeat(72)}`);
console.log(`Afirmaciones que pasaron: ${pasadas}`);
console.log(`Afirmaciones que fallaron: ${fallas.length}`);
if (fallas.length > 0) {
  console.log("");
  for (const f of fallas) console.log(`  ✗ ${f}`);
  codigo = 1;
}
process.exit(codigo);
