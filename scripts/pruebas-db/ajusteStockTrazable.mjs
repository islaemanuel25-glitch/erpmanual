// LA TRAZABILIDAD DEL LIBRO DE STOCK, CONTRA LAS RUTAS REALES Y POSTGRESQL.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/ajusteStockTrazable.mjs
//
// Lo que ningún candado puede probar, porque vive en la base:
//
//   A. el AJUSTE MANUAL: la auditoría primero, el origen AJUSTE_MANUAL con su id,
//      la causa contra el stock REAL, la obligatoriedad del grupo, el stock
//      negativo EFECTIVO del local, y que un pedido inválido no escriba nada;
//   B. la CONCURRENCIA: una venta que entra entre la lectura y la escritura no
//      se pierde, y la auditoría dice lo mismo que el libro;
//   C. que una declaración NO SE FILTRA a otra transacción de la misma conexión;
//   D. la VENTA del POS por su ruta: el consumo a nombre de su Venta.id;
//   E. la CORRECCIÓN de una venta por su ruta: a nombre de su VentaCorreccion;
//   F. las TRANSACCIONES MIXTAS con las piezas reales: venta interna —VENTA y
//      TRANSFERENCIA_ENVIO— y la cancelación de su remito
//      —TRANSFERENCIA_CANCELACION y ANULACION_VENTA—, cada movimiento con el
//      suyo.
//
// La recepción de una transferencia —"Producto dañado" que vuelve al origen, a
// nombre de TRANSFERENCIA_RECEPCION— la prueba `recepcionTransferencias.mjs`, que
// ya tiene el armado de esa ruta; la compra, `origenDeCosto.mjs`.
//
// Base descartable, borrada al terminar. Nivel ESCRITURA: host local y NODE_ENV
// distinto de production.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const principal = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;
const { aplicarMigraciones } = await import("./lib/libroEnElTiempo.mjs");
const { crearProductoVendible, abrirTurnoDePrueba } = await import("./fixturePos.mjs");

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
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const diferido = () => {
  let resolver;
  const promesa = new Promise((r) => (resolver = r));
  return { promesa, resolver };
};

const NOMBRE = "erpazul_ajuste_trazable_prueba";
const urlPrueba = (() => {
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = `/${NOMBRE}`;
  return u.toString();
})();

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
  const grupo = await c.grupo.create({ data: { nombre: "Trazabilidad" } });
  await c.configuracionGrupo.create({ data: { grupoId: grupo.id } });
  const deposito = await c.local.create({ data: { nombre: "Depósito", es_deposito: true } });
  const local = await c.local.create({ data: { nombre: "Local" } });
  await c.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await c.grupoLocal.create({ data: { grupoId: grupo.id, localId: local.id } });
  for (const l of [deposito, local]) {
    await c.configuracionLocal.create({ data: { localId: l.id, exigirOperador: false } });
  }
  const rol = await c.rol.create({ data: { nombre: "CI trazable", permisos: ["*"] } });
  const usuario = await c.usuario.create({
    data: { nombre: "CI trazable", email: "ci-trazable@ci.local", passwordHash: "x", rolId: rol.id, localId: local.id },
  });

  // El cliente de la app se construye al importarse: recién ahora.
  process.env.DATABASE_URL = urlPrueba;
  process.env.CORRECCION_VENTAS_BETA_USER_IDS = String(usuario.id);
  const rutaAjuste = await import("../../app/api/stock_locales/ajustar/route.js");
  const rutaVenta = await import("../../app/api/pos-ventas/crear/route.js");
  const rutaCorregir = await import("../../app/api/pos-ventas/venta/[id]/corregir/route.js");
  const { aplicarConsumoStock } = await import("../../lib/combos/ventaConsumo.js");
  const { crearTransferencia } = await import("../../lib/transferencias/crearTransferencia.js");
  const { SOLO_TRANSITO } = await import("../../lib/transferencias/politicasStock.js");
  const { revertirVenta } = await import("../../lib/pos-ventas/reversionVenta.js");
  const { declararOrigenDeStock, ORIGEN_STOCK, SIN_ORIGEN } = await import("../../lib/stock/libro/libroStock.js");
  const { MOTIVO_DIFERENCIA } = await import("../../lib/stock/motivosDeDiferencia.js");

  const sesion = (localId) =>
    jwt.sign(
      { id: usuario.id, nombre: "CI trazable", email: "ci@local", localId, grupoId: grupo.id, permisos: ["*"] },
      process.env.AUTH_SECRET,
      { expiresIn: "1h" }
    );
  const cookie = (localId) => ({ cookie: `erpazul_sesion=${sesion(localId)}`, "content-type": "application/json" });

  let nProducto = 0;
  const producto = async (stock, localId = local.id) =>
    crearProductoVendible(c, { grupoId: grupo.id, localId, nombre: `Producto ${++nProducto}`, stock });

  const ajustar = async (pl, cuerpo, localId = local.id) => {
    const res = await rutaAjuste.POST(
      new Request("http://ci/api/stock_locales/ajustar", {
        method: "POST",
        headers: cookie(localId),
        body: JSON.stringify({ modo: "ajuste", localId, productoLocalId: pl, ...cuerpo }),
      })
    );
    return { status: res.status, cuerpo: await res.json().catch(() => ({})) };
  };
  const stockDe = async (pl, localId = local.id) => {
    const s = await c.stockLocal.findUnique({ where: { localId_productoId: { localId, productoId: pl } } });
    return s ? Number(s.cantidad) : null;
  };
  const auditorias = (pl) => c.auditoriaStock.findMany({ where: { productoLocalId: pl }, orderBy: { id: "asc" } });
  const movimientos = (pl) => c.movimientoStock.findMany({ where: { productoLocalId: pl }, orderBy: { id: "asc" } });
  const ultimo = async (pl) => (await movimientos(pl)).at(-1);
  const n = (d) => (d == null ? null : Number(d));

  /** Un ajuste aceptado deja UNA auditoría y un movimiento que la nombra, con los mismos números. */
  async function ajusteTrazable(titulo, pl, cuerpo, { anterior, nuevo, accion, causa }) {
    const movsAntes = (await movimientos(pl)).length;
    const r = await ajustar(pl, cuerpo);
    ok(`${titulo}: 200`, r.status === 200 && r.cuerpo.ok === true, `${r.status} ${JSON.stringify(r.cuerpo)}`);
    igual(`${titulo}: el stock queda en ${nuevo}`, await stockDe(pl), nuevo);
    const aud = (await auditorias(pl)).at(-1);
    igual(`${titulo}: la auditoría`, [aud?.accion, n(aud?.cantidadAnterior), n(aud?.cantidadNueva), aud?.motivoPrincipal], [accion, anterior, nuevo, causa]);
    const movs = (await movimientos(pl)).slice(movsAntes);
    igual(`${titulo}: un solo movimiento nuevo`, movs.length, 1);
    const m = movs[0];
    igual(`${titulo}: el movimiento es AJUSTE_MANUAL y nombra esa auditoría`, [m?.origen, m?.origenRef], [ORIGEN_STOCK.AJUSTE_MANUAL, String(aud?.id)]);
    igual(`${titulo}: y dice lo mismo que la auditoría`, [n(m?.cantidadAnterior), n(m?.cantidadPosterior)], [n(aud?.cantidadAnterior), n(aud?.cantidadNueva)]);
    return aud;
  }

  /** Un ajuste rechazado no escribe nada: ni stock, ni auditoría, ni libro. */
  async function rechazoLimpio(titulo, pl, cuerpo, status, patron) {
    const [s0, a0, m0] = [await stockDe(pl), (await auditorias(pl)).length, (await movimientos(pl)).length];
    const r = await ajustar(pl, cuerpo);
    ok(`${titulo}: ${status}`, r.status === status && patron.test(r.cuerpo.error ?? ""), `${r.status} ${JSON.stringify(r.cuerpo)}`);
    igual(`${titulo}: no tocó stock, auditoría ni libro`, [await stockDe(pl), (await auditorias(pl)).length, (await movimientos(pl)).length], [s0, a0, m0]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("A. Ajuste manual: la auditoría es el documento del movimiento");
  // ══════════════════════════════════════════════════════════════════════════
  const p1 = await producto(10);
  await ajusteTrazable("restar 2 por Producto dañado", p1.productoLocalId,
    { tipo: "restar", cantidad: 2, motivoPrincipal: MOTIVO_DIFERENCIA.PRODUCTO_DANADO, motivo: "dos botellas rotas" },
    { anterior: 10, nuevo: 8, accion: "AJUSTE_RESTAR", causa: "Producto dañado" });
  igual("el detalle queda en `motivo`, como texto", (await auditorias(p1.productoLocalId)).at(-1).motivo, "dos botellas rotas");
  await ajusteTrazable("sumar 3 por Sobrante", p1.productoLocalId,
    { tipo: "sumar", cantidad: 3, motivoPrincipal: MOTIVO_DIFERENCIA.SOBRANTE },
    { anterior: 8, nuevo: 11, accion: "AJUSTE_SUMAR", causa: "Sobrante" });
  await ajusteTrazable("fijar hacia abajo, 11 → 7, por Faltante", p1.productoLocalId,
    { tipo: "fijar", cantidad: 7, motivoPrincipal: MOTIVO_DIFERENCIA.FALTANTE },
    { anterior: 11, nuevo: 7, accion: "AJUSTE_FIJAR", causa: "Faltante" });
  await ajusteTrazable("fijar hacia arriba, 7 → 12, por Sobrante", p1.productoLocalId,
    { tipo: "fijar", cantidad: 12, motivoPrincipal: MOTIVO_DIFERENCIA.SOBRANTE },
    { anterior: 7, nuevo: 12, accion: "AJUSTE_FIJAR", causa: "Sobrante" });
  await ajusteTrazable("sin causa, con el motivo NO obligatorio", p1.productoLocalId,
    { tipo: "restar", cantidad: 1, motivo: "" },
    { anterior: 12, nuevo: 11, accion: "AJUSTE_RESTAR", causa: null });

  seccion("A.2 La causa contra la dirección REAL");
  await rechazoLimpio("Producto dañado sobre una suba", p1.productoLocalId,
    { tipo: "sumar", cantidad: 1, motivoPrincipal: MOTIVO_DIFERENCIA.PRODUCTO_DANADO }, 409, /stock real es 11/);
  await rechazoLimpio("Sobrante sobre una baja", p1.productoLocalId,
    { tipo: "restar", cantidad: 1, motivoPrincipal: MOTIVO_DIFERENCIA.SOBRANTE }, 409, /stock real es 11/);
  await rechazoLimpio("fijar 13 con Producto dañado: es una suba", p1.productoLocalId,
    { tipo: "fijar", cantidad: 13, motivoPrincipal: MOTIVO_DIFERENCIA.PRODUCTO_DANADO }, 409, /deja en 13/);
  await rechazoLimpio("fijar el mismo número con una causa", p1.productoLocalId,
    { tipo: "fijar", cantidad: 11, motivoPrincipal: MOTIVO_DIFERENCIA.FALTANTE }, 409, /no hay diferencia/);
  await rechazoLimpio("Otro sin detalle", p1.productoLocalId,
    { tipo: "restar", cantidad: 1, motivoPrincipal: MOTIVO_DIFERENCIA.OTRO }, 400, /detalle/);
  await ajusteTrazable("Otro CON detalle", p1.productoLocalId,
    { tipo: "restar", cantidad: 1, motivoPrincipal: MOTIVO_DIFERENCIA.OTRO, motivo: "lo usó el cadete" },
    { anterior: 11, nuevo: 10, accion: "AJUSTE_RESTAR", causa: "Otro" });
  await rechazoLimpio("una causa inventada", p1.productoLocalId,
    { tipo: "restar", cantidad: 1, motivoPrincipal: "MERMA" }, 400, /Causa desconocida/);

  seccion("A.3 Tipo y cantidad se validan ANTES de escribir");
  for (const tipo of [undefined, "agregar", "SUMAR"]) {
    await rechazoLimpio(`tipo ${JSON.stringify(tipo)}`, p1.productoLocalId, { tipo, cantidad: 1 }, 400, /Tipo de ajuste inválido/);
  }
  await rechazoLimpio("restar 0", p1.productoLocalId, { tipo: "restar", cantidad: 0 }, 400, /mayor a 0/);
  await rechazoLimpio("fijar -1", p1.productoLocalId, { tipo: "fijar", cantidad: -1 }, 400, /negativa/);

  // Un producto SIN fila de stock: un pedido inválido no la crea.
  const sinFilaBase = await c.productoBase.create({ data: { grupoId: grupo.id, nombre: "Sin fila", unidad_medida: "unidad", precio_costo: 1, precio_venta: 2 } });
  const sinFila = await c.productoLocal.create({ data: { localId: local.id, baseId: sinFilaBase.id } });
  const r0 = await ajustar(sinFila.id, { tipo: "sumar", cantidad: "abc" });
  igual("cantidad inválida sin fila: 400", r0.status, 400);
  igual("y NO se creó la fila", await stockDe(sinFila.id), null);
  igual("ni quedó un ALTA en el libro", (await movimientos(sinFila.id)).length, 0);
  const r1 = await ajustar(sinFila.id, { tipo: "sumar", cantidad: 1, motivoPrincipal: MOTIVO_DIFERENCIA.PRODUCTO_DANADO });
  igual("una causa que no explica la dirección tampoco la crea", [r1.status, await stockDe(sinFila.id)], [409, null]);
  // Y uno válido la crea adentro de la transacción, con el origen ya declarado.
  const ok5 = await ajustar(sinFila.id, { tipo: "sumar", cantidad: 5, motivoPrincipal: MOTIVO_DIFERENCIA.SOBRANTE });
  igual("sumar 5 sin fila: 200 y queda en 5", [ok5.status, await stockDe(sinFila.id)], [200, 5]);
  const audSin = (await auditorias(sinFila.id)).at(-1);
  const movsSin = await movimientos(sinFila.id);
  igual("el ALTA en cero y el cambio, los dos a nombre de la auditoría",
    movsSin.map((m) => [m.tipo, n(m.cantidadAnterior), n(m.cantidadPosterior), m.origen, m.origenRef]),
    [
      ["ALTA", null, 0, "AJUSTE_MANUAL", String(audSin.id)],
      ["CAMBIO", 0, 5, "AJUSTE_MANUAL", String(audSin.id)],
    ]);

  seccion("A.4 La obligatoriedad es del grupo, y sigue siendo configurable");
  await c.configuracionGrupo.update({ where: { grupoId: grupo.id }, data: { requireMotivoAjusteStock: true } });
  const reglas = await (await rutaAjuste.GET(
    Object.assign(new Request(`http://ci/api/stock_locales/ajustar?localId=${local.id}`, { headers: cookie(local.id) }), {
      nextUrl: new URL(`http://ci/api/stock_locales/ajustar?localId=${local.id}`),
    })
  )).json();
  igual("el GET dice que la causa es obligatoria", reglas.requireMotivoAjusteStock, true);
  await rechazoLimpio("obligatoria y sin causa", p1.productoLocalId, { tipo: "restar", cantidad: 1, motivo: "texto suelto" }, 400, /causa/i);
  await ajusteTrazable("obligatoria y con causa", p1.productoLocalId,
    { tipo: "restar", cantidad: 1, motivoPrincipal: MOTIVO_DIFERENCIA.FALTANTE },
    { anterior: 10, nuevo: 9, accion: "AJUSTE_RESTAR", causa: "Faltante" });
  const sinDif = await ajustar(p1.productoLocalId, { tipo: "fijar", cantidad: 9 });
  igual("obligatoria, pero sin diferencia no hay causa que pedir", sinDif.status, 200);
  await c.configuracionGrupo.update({ where: { grupoId: grupo.id }, data: { requireMotivoAjusteStock: false } });

  seccion("A.5 El stock negativo EFECTIVO: el local manda, como en el POS");
  const pNeg = await producto(2);
  await c.configuracionGrupo.update({ where: { grupoId: grupo.id }, data: { allowNegativeStock: false } });
  await c.configuracionLocal.update({ where: { localId: local.id }, data: { allowNegativeStock: true } });
  await ajustar(pNeg.productoLocalId, { tipo: "restar", cantidad: 5 });
  igual("local permite y grupo no: queda en -3", await stockDe(pNeg.productoLocalId), -3);
  await c.configuracionGrupo.update({ where: { grupoId: grupo.id }, data: { allowNegativeStock: true } });
  await c.configuracionLocal.update({ where: { localId: local.id }, data: { allowNegativeStock: false } });
  await ajustar(pNeg.productoLocalId, { tipo: "fijar", cantidad: 2 });
  await ajustar(pNeg.productoLocalId, { tipo: "restar", cantidad: 5 });
  igual("local no permite y grupo sí: el piso en cero", await stockDe(pNeg.productoLocalId), 0);
  await c.configuracionLocal.update({ where: { localId: local.id }, data: { allowNegativeStock: null } });

  seccion("A.6 Límites: la fila que falta nace a nombre de LIMITES_STOCK");
  const limBase = await c.productoBase.create({ data: { grupoId: grupo.id, nombre: "Límites", unidad_medida: "unidad", precio_costo: 1, precio_venta: 2 } });
  const limPl = await c.productoLocal.create({ data: { localId: local.id, baseId: limBase.id } });
  const rLim = await rutaAjuste.POST(new Request("http://ci/api/stock_locales/ajustar", {
    method: "POST", headers: cookie(local.id),
    body: JSON.stringify({ modo: "limites", localId: local.id, productoLocalId: limPl.id, nuevoMin: 2, nuevoMax: 9 }),
  }));
  igual("límites sobre una fila que no existía: 200", rLim.status, 200);
  igual("su ALTA en cero, a nombre de LIMITES_STOCK y sin referencia, y ningún cambio de cantidad",
    (await movimientos(limPl.id)).map((m) => [m.tipo, n(m.cantidadPosterior), m.origen, m.origenRef]),
    [["ALTA", 0, "LIMITES_STOCK", null]]);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("B. Concurrencia: una venta entre la lectura y la escritura no se pierde");
  // ══════════════════════════════════════════════════════════════════════════
  for (const [titulo, cuerpo, esperado, anteriorAud] of [
    ["restar 3 mientras una venta baja 10 → 9", { tipo: "restar", cantidad: 3 }, 6, 9],
    ["fijar 7 mientras una venta baja 10 → 9", { tipo: "fijar", cantidad: 7, motivoPrincipal: MOTIVO_DIFERENCIA.FALTANTE }, 7, 9],
  ]) {
    const p = await producto(10);
    const tomada = diferido();
    const soltar = diferido();
    // La "venta": toma el mismo bloqueo que toma el POS y descuenta 1, y se
    // queda abierta hasta que el ajuste ya está esperando.
    const venta = c.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "StockLocal" WHERE "localId" = ${local.id} AND "productoId" = ${p.productoLocalId} FOR UPDATE`;
      await tx.stockLocal.update({
        where: { localId_productoId: { localId: local.id, productoId: p.productoLocalId } },
        data: { cantidad: { decrement: 1 } },
      });
      tomada.resolver();
      await soltar.promesa;
    }, { timeout: 20000 });
    await tomada.promesa;
    let terminado = false;
    const ajuste = ajustar(p.productoLocalId, cuerpo).then((r) => ((terminado = true), r));
    await esperar(600);
    ok(`${titulo}: el ajuste ESPERA el bloqueo de la venta`, terminado === false);
    soltar.resolver();
    await venta;
    const r = await ajuste;
    igual(`${titulo}: 200`, r.status, 200);
    igual(`${titulo}: el stock queda en ${esperado}, con la venta incluida`, await stockDe(p.productoLocalId), esperado);
    const aud = (await auditorias(p.productoLocalId)).at(-1);
    const mov = await ultimo(p.productoLocalId);
    igual(`${titulo}: la auditoría parte del ${anteriorAud} real, no del 10 que se vio`, n(aud.cantidadAnterior), anteriorAud);
    igual(`${titulo}: y coincide con el libro`,
      [n(mov.cantidadAnterior), n(mov.cantidadPosterior), mov.origen, mov.origenRef],
      [n(aud.cantidadAnterior), n(aud.cantidadNueva), "AJUSTE_MANUAL", String(aud.id)]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  seccion("C. Una declaración no se filtra a otra transacción");
  // ══════════════════════════════════════════════════════════════════════════
  const pFuga = await producto(50);
  for (let i = 0; i < 5; i++) {
    await ajustar(pFuga.productoLocalId, { tipo: "restar", cantidad: 1 });
    await c.stockLocal.update({
      where: { localId_productoId: { localId: local.id, productoId: pFuga.productoLocalId } },
      data: { cantidad: { increment: 1 } },
    });
  }
  const movsFuga = await movimientos(pFuga.productoLocalId);
  const porOrigen = movsFuga.filter((m) => m.tipo === "CAMBIO").map((m) => m.origen);
  igual("ajustes y escrituras sueltas alternadas: cada una con lo suyo",
    porOrigen, Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? "AJUSTE_MANUAL" : SIN_ORIGEN)));
  igual("las sueltas no heredan la referencia", movsFuga.filter((m) => m.origen === SIN_ORIGEN && m.tipo === "CAMBIO").every((m) => m.origenRef === null), true);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("D. Venta del POS: el consumo a nombre de su Venta.id");
  // ══════════════════════════════════════════════════════════════════════════
  const turno = await abrirTurnoDePrueba(c, { localId: local.id, vendedorId: usuario.id });
  const pVenta = await producto(20);
  const resVenta = await rutaVenta.POST(new Request("http://ci/api/pos-ventas/crear", {
    method: "POST", headers: cookie(local.id),
    body: JSON.stringify({
      clientTxnId: "trazable-1", localId: local.id, turnoId: turno.id, formaPago: "efectivo", totalPantalla: 2000,
      pagos: [{ medio: "EFECTIVO", monto: 2000 }],
      items: [{ productoBaseId: pVenta.baseId, nombre: "Producto", precio: 1000, cantidad: 2, precioCosto: 600, esServicio: false }],
    }),
  }));
  const venta = await resVenta.json().catch(() => ({}));
  ok("la venta se registra", resVenta.status === 200 && venta.ok === true, `${resVenta.status} ${venta.error || ""}`);
  const movVenta = await ultimo(pVenta.productoLocalId);
  igual("el consumo es VENTA y nombra la venta",
    [movVenta?.origen, movVenta?.origenRef, n(movVenta?.cantidadAnterior), n(movVenta?.cantidadPosterior)],
    [ORIGEN_STOCK.VENTA, String(venta.ventaId), 20, 18]);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("E. Corrección de una venta: a nombre de su VentaCorreccion");
  // ══════════════════════════════════════════════════════════════════════════
  const ventaFila = await c.venta.findUnique({ where: { id: venta.ventaId } });
  const resCorr = await rutaCorregir.POST(
    new Request(`http://ci/api/pos-ventas/venta/${venta.ventaId}/corregir`, {
      method: "POST", headers: cookie(local.id),
      body: JSON.stringify({
        motivo: "se cobró uno de más", idempotencyKey: "trazable-corr-1", version: ventaFila.version,
        lineas: [{ productoBaseId: pVenta.baseId, cantidad: 1, precio: 1000 }],
        pagos: [{ medio: "EFECTIVO", monto: 1000 }],
      }),
    }),
    { params: Promise.resolve({ id: String(venta.ventaId) }) }
  );
  const corr = await resCorr.json().catch(() => ({}));
  ok("la corrección se aplica", resCorr.status === 200 && corr.ok !== false, `${resCorr.status} ${corr.error || ""} ${corr.code || ""}`);
  const correccion = await c.ventaCorreccion.findFirst({ where: { ventaId: venta.ventaId, tipo: "COMPLETA" } });
  const movCorr = await ultimo(pVenta.productoLocalId);
  igual("la devolución de la corrección es CORRECCION_VENTA y nombra su registro",
    [movCorr?.origen, movCorr?.origenRef, n(movCorr?.cantidadAnterior), n(movCorr?.cantidadPosterior)],
    [ORIGEN_STOCK.CORRECCION_VENTA, String(correccion?.id), 18, 19]);

  // ══════════════════════════════════════════════════════════════════════════
  seccion("F. Transacciones mixtas: cada tramo con su documento");
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Las piezas son las de la ruta, en su orden: la venta interna declara VENTA,
  // consume, y `crearTransferencia` redeclara para el tránsito.
  const pMixto = await producto(30, deposito.id);
  const ventaMixta = await c.venta.create({
    data: { localId: deposito.id, vendedorId: usuario.id, numero: 9001, subtotal: 3000, total: 3000, costoTotal: 1800, gananciaBruta: 1200, gananciaNeta: 1200, formaPago: "efectivo" },
  });
  const plOrigen = await c.productoLocal.findUnique({ where: { id: pMixto.productoLocalId }, include: { base: true } });
  const { transferencia } = await c.$transaction(async (tx) => {
    await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.VENTA, referencia: String(ventaMixta.id) });
    await aplicarConsumoStock(tx, {
      localId: deposito.id,
      consumoFisicoConsolidado: [{ productoLocalId: pMixto.productoLocalId, cantidad: 3, nombre: "Mixto" }],
      allowNegativeStock: false,
    });
    return crearTransferencia({
      tx, origenId: deposito.id, destinoId: local.id, creadoPorId: usuario.id, ventaId: ventaMixta.id,
      politicaStockOrigen: SOLO_TRANSITO,
      items: [{ baseId: plOrigen.baseId, productoLocalOrigenId: plOrigen.id, cantidad: 3, unidadEnviada: "UNIDAD", factorPack: 1, productoLocalOrigen: plOrigen }],
    });
  });
  const movsMixto = (await movimientos(pMixto.productoLocalId)).filter((m) => m.tipo === "CAMBIO");
  igual("venta interna: el consumo es VENTA y el tránsito TRANSFERENCIA_ENVIO, en la misma transacción",
    movsMixto.map((m) => [m.origen, m.origenRef, n(m.cantidadPosterior), n(m.enTransitoPosterior)]),
    [
      ["VENTA", String(ventaMixta.id), 27, 0],
      ["TRANSFERENCIA_ENVIO", String(transferencia.id), 27, 3],
    ]);
  igual("la transferencia devuelta trae sus detalles, como antes", transferencia.detalle.length, 1);

  // La cancelación de ese remito: libera el tránsito y devuelve lo vendido.
  const ventaCompleta = await c.venta.update({
    where: { id: ventaMixta.id },
    data: {
      detalles: { create: [{ productoBaseId: plOrigen.baseId, nombre: "Mixto", precio: 1000, cantidad: 3, subtotal: 3000, productoLocalId: plOrigen.id, cantidadStock: 3 }] },
    },
    select: {
      id: true, numero: true, total: true, esFiado: true, clienteId: true, localId: true, operadorId: true, turnoId: true, version: true, anuladaEn: true,
      turno: { select: { id: true, cierre: true } },
      pagos: { select: { medio: true, monto: true } },
      detalles: { select: { id: true, nombre: true, productoLocalId: true, cantidadStock: true, componentes: { select: { productoLocalId: true, cantidad: true } } } },
    },
  });
  let registroAnulacion = null;
  await c.$transaction(async (tx) => {
    await declararOrigenDeStock(tx, { origen: ORIGEN_STOCK.TRANSFERENCIA_CANCELACION, referencia: String(transferencia.id) });
    await tx.stockLocal.updateMany({
      where: { localId: deposito.id, productoId: pMixto.productoLocalId },
      data: { enTransito: { decrement: 3 } },
    });
    const r = await revertirVenta(tx, {
      venta: { ...ventaCompleta, transferencia: { id: transferencia.id } },
      grupoId: grupo.id, usuarioId: usuario.id, motivo: "prueba", versionEsperada: ventaCompleta.version,
    });
    registroAnulacion = r.correccionId;
  });
  const movsCancel = (await movimientos(pMixto.productoLocalId)).filter((m) => m.tipo === "CAMBIO").slice(2);
  igual("cancelación: el tránsito es TRANSFERENCIA_CANCELACION y la devolución ANULACION_VENTA",
    movsCancel.map((m) => [m.origen, m.origenRef, n(m.cantidadPosterior), n(m.enTransitoPosterior)]),
    [
      ["TRANSFERENCIA_CANCELACION", String(transferencia.id), 27, 0],
      ["ANULACION_VENTA", String(registroAnulacion), 30, 0],
    ]);
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
