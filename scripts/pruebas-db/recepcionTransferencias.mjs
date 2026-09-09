// PRUEBAS DE BASE DE LA RECEPCIÓN CON DIFERENCIAS POSITIVAS.
//
//   node --import ./scripts/alias-loader.mjs scripts/pruebas-db/recepcionTransferencias.mjs
//
// ── QUÉ HACE ESTO QUE NINGÚN CANDADO PUEDE HACER ───────────────────────────
//
// Los candados de `lib/transferencias/` prueban la aritmética sobre datos
// escritos a mano, y los invariantes estructurales leen el fuente. Ninguno de los
// dos puede contestar lo único que importa acá: qué queda en `StockLocal`
// después de confirmar.
//
// Acá se ejercen los HANDLERS DE LAS RUTAS de verdad, contra Postgres, y se
// cuentan las filas después. Es lo que distingue "la fórmula es correcta" de "el
// inventario quedó bien".
//
// NO se corre contra producción. `clientePrisma.mjs` en nivel ESCRITURA exige
// host local y NODE_ENV distinto de production, y aborta con código 2 si no.

import { crearClientePrisma, ESCRITURA } from "../lib/clientePrisma.mjs";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });

const jwt = (await import("jsonwebtoken")).default;

const { crearProductoVendible } = await import("./fixturePos.mjs");
const { ACCIONES_RECEPCION } = await import("../../lib/transferencias/recepcion.js");

const rutaGuardar = await import("../../app/api/transferencias/guardar-recepcion/route.js");
const rutaConfirmar = await import("../../app/api/transferencias/confirmar-recepcion/route.js");
const rutaLinea = await import("../../app/api/transferencias/linea-recepcion/route.js");
const rutaBuscar = await import("../../app/api/transferencias/buscar-productos-origen/route.js");
const rutaRevisar = await import("../../app/api/transferencias/revisar-producto/route.js");
const rutaDetalle = await import("../../app/api/transferencias/detalle/route.js");

// Las decisiones de la pantalla, ejercidas con lo que el endpoint devuelve de
// verdad. Los tres defectos de integración del 2026-09-09 vivían justo ahí: en
// el cable entre lo que el servidor manda y lo que la pantalla decide.
const { MODO_RECEPCION, siguienteEdicion } = await import("../../lib/transferencias/recepcionUI.js");
const { FILTRO, RESOLUCION, categoriasDelRemito, productosVisibles, resolverEntrada, resumenDeRecepcion } =
  await import("../../lib/transferencias/controlFisico.js");

// ═══════════════════════════════════════════════════════════════════════════
// ARNÉS
// ═══════════════════════════════════════════════════════════════════════════

let pasadas = 0;
const fallas = [];
let seccionActual = "";
const seccion = (t) => { seccionActual = t; console.log(`\n── ${t} ${"─".repeat(Math.max(0, 62 - t.length))}`); };

function ok(t, c, d = "") {
  if (c) { pasadas += 1; console.log(`  ✓ ${t}`); }
  else { fallas.push(`[${seccionActual}] ${t}${d ? ` — ${d}` : ""}`); console.log(`  ✗ ${t}${d ? ` — ${d}` : ""}`); }
}
const igual = (t, o, e) =>
  ok(t, JSON.stringify(o) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtenido ${JSON.stringify(o)}`);

/** El stock se compara en centésimas de milésima… en milésimas enteras, como el resto del repo. */
const igualStock = (t, o, e) => {
  const a = Math.round(Number(o) * 1000);
  const b = Math.round(Number(e) * 1000);
  ok(t, a === b, a === b ? "" : `esperado ${e}, obtenido ${o}`);
};

const SECRETO = process.env.AUTH_SECRET;

/**
 * EL TOKEN DE ESTAS PRUEBAS NO ES ADMIN, Y ESO ES EL PUNTO.
 *
 * `esAdminPorPermisos` es `permisos.includes("*")`, y un admin SALTEA la
 * comprobación de destino a propósito —la regla existente lo permite—. Con un
 * token de `["*"]`, las afirmaciones de que el ORIGEN no puede tocar la
 * recepción daban 200 y parecían un agujero del producto: eran del fixture.
 *
 * Por eso el default es el permiso mínimo del flujo. Un admin se pide
 * explícitamente cuando se lo quiera medir.
 */
const token = (usuarioId, localId, grupoId, permisos = ["transferencias.recibir", "transferencias.ver"]) =>
  jwt.sign(
    { id: usuarioId, nombre: "CI", email: `ci${usuarioId}@l`, localId, grupoId, permisos },
    SECRETO,
    { expiresIn: "1h" }
  );

const pedido = (url, { metodo = "GET", cuerpo, sesion } = {}) =>
  new Request(url, {
    method: metodo,
    headers: { cookie: `erpazul_sesion=${sesion}`, "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
/**
 * Lee la respuesta de un handler. ACEPTA LA PROMESA, y eso no es comodidad.
 *
 * Sin el `await` de adentro, `leer(ruta.POST(...))` recibe la Promesa y llama
 * `.json()` sobre ella: el script muere con "r.json is not a function" en la
 * primera afirmación, y el rojo no dice nada del producto. Ya pasó una vez en
 * `modalidadesCobro.mjs` y volvió a pasar acá, que es la señal de que el
 * problema no era el olvido sino que la función permitía olvidarse.
 *
 * Resolviendo la promesa ACÁ, las dos formas —`leer(await x)` y `leer(x)`—
 * quedan bien, y el que escriba la próxima llamada no tiene que acordarse.
 */
const leer = async (respuesta) => {
  const r = await respuesta;
  return { status: r.status, ...(await r.json().catch(() => ({}))) };
};

// ═══════════════════════════════════════════════════════════════════════════
// CÓMO SE PRUEBA UNA CARRERA SIN SORTEARLA
//
// Un `Promise.all` de dos pedidos no prueba nada: el sistema operativo decide el
// orden, y una versión ROTA pasa cada vez que las dos operaciones no llegan a
// solaparse. Una prueba que a veces pasa es peor que no tenerla, porque el verde
// se lee igual.
//
// Acá el orden lo fija PostgreSQL y no el azar. Una transacción interactiva toma
// la fila y NO la suelta; recién entonces se dispara el pedido que va a chocar.
// Ese pedido se queda esperando el lock —eso se COMPRUEBA, no se supone— y solo
// después se libera la barrera. El resultado es el mismo en todas las corridas.
//
// `esperarBloqueo` es lo que convierte esto en determinista: si el pedido NUNCA
// llega a bloquearse, la prueba FALLA. No se degrada a "bueno, igual dio bien":
// una prueba que no pudo montar su condición no probó nada.
// ═══════════════════════════════════════════════════════════════════════════

/** Cuántas conexiones de esta base están esperando un lock ahora mismo. */
const bloqueadas = async () => {
  const filas = await prisma.$queryRaw`
    SELECT count(*)::int AS n
      FROM pg_stat_activity
     WHERE datname = current_database()
       AND state = 'active'
       AND wait_event_type = 'Lock'`;
  return Number(filas?.[0]?.n || 0);
};

/** Espera a que ALGUIEN quede esperando un lock. Devuelve false si nunca pasa. */
async function esperarBloqueo(msMax = 10000) {
  const hasta = Date.now() + msMax;
  while (Date.now() < hasta) {
    if ((await bloqueadas()) > 0) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

/**
 * Abre una transacción que toma algo y se queda quieta hasta que se la suelta.
 *
 * Devuelve `{ tomado, soltar, fin }`: `tomado` ya está resuelto cuando la fila
 * quedó tomada —así el pedido que va a chocar se dispara DESPUÉS, sin sleeps—,
 * `soltar()` confirma la transacción y `fin` es su resultado.
 */
function barrera(tomar) {
  let soltar;
  const puerta = new Promise((r) => { soltar = r; });
  let avisar;
  const tomado = new Promise((r) => { avisar = r; });

  const fin = prisma.$transaction(
    async (tx) => {
      let r;
      try {
        r = await tomar(tx);
      } catch (e) {
        // Sin esto, un fallo al tomar dejaría `tomado` sin resolver y la prueba
        // colgada para siempre en vez de fallar.
        avisar({ error: e });
        throw e;
      }
      avisar(r);
      await puerta;
      return r;
    },
    { timeout: 60000, maxWait: 60000 }
  );

  return { tomado, soltar, fin: fin.catch((e) => ({ error: e })) };
}

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

const marca = `ci-recepcion-${Date.now()}`;
const creado = { grupoId: null, origenId: null, destinoId: null, ajenoId: null, usuarioId: null, rolId: null };

async function montar() {
  const rol = await prisma.rol.create({ data: { nombre: `${marca}-rol`, permisos: ["*"] } });
  creado.rolId = rol.id;

  const grupo = await prisma.grupo.create({ data: { nombre: `${marca}-grupo` } });
  creado.grupoId = grupo.id;
  // `allowNegativeStock: true` a propósito: lo que se mide acá es la ARITMÉTICA
  // del excedente. La política de stock negativo tiene su propia sección abajo,
  // con el flag apagado, y así una cosa no tapa a la otra.
  await prisma.configuracionGrupo.create({
    data: { grupoId: grupo.id, allowNegativeStock: true },
  });

  const origen = await prisma.local.create({ data: { nombre: `${marca}-origen`, es_deposito: true } });
  const destino = await prisma.local.create({ data: { nombre: `${marca}-destino` } });
  // Un tercer local, de OTRO grupo, para el producto que no pertenece al origen.
  const grupoAjeno = await prisma.grupo.create({ data: { nombre: `${marca}-ajeno` } });
  const ajeno = await prisma.local.create({ data: { nombre: `${marca}-ajeno-local` } });
  creado.origenId = origen.id; creado.destinoId = destino.id; creado.ajenoId = ajeno.id;
  creado.grupoAjenoId = grupoAjeno.id;

  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: origen.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: destino.id } });
  await prisma.grupoLocal.create({ data: { grupoId: grupoAjeno.id, localId: ajeno.id } });

  const usuario = await prisma.usuario.create({
    data: { nombre: "CI", email: `${marca}@l`, passwordHash: "x", rolId: rol.id, localId: destino.id },
  });
  creado.usuarioId = usuario.id;

  return { grupo, origen, destino, ajeno, usuario };
}

async function desmontar() {
  if (!creado.grupoId) return;
  const locales = [creado.origenId, creado.destinoId, creado.ajenoId].filter(Boolean);
  const grupos = [creado.grupoId, creado.grupoAjenoId].filter(Boolean);
  await prisma.auditoriaStock.deleteMany({ where: { localId: { in: locales } } });
  await prisma.transferenciaDetalle.deleteMany({ where: { transferencia: { origenId: { in: locales } } } });
  await prisma.transferencia.deleteMany({ where: { origenId: { in: locales } } });
  await prisma.stockLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.productoLocal.deleteMany({ where: { localId: { in: locales } } });
  await prisma.productoBase.deleteMany({ where: { grupoId: { in: grupos } } });
  await prisma.usuario.deleteMany({ where: { id: creado.usuarioId } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: { in: grupos } } });
  await prisma.configuracionGrupo.deleteMany({ where: { grupoId: { in: grupos } } });
  await prisma.local.deleteMany({ where: { id: { in: locales } } });
  await prisma.grupo.deleteMany({ where: { id: { in: grupos } } });
  await prisma.rol.deleteMany({ where: { id: creado.rolId } });
  // Las categorías de la sección K no cuelgan de un grupo —`Categoria` no tiene
  // `grupoId`— así que se borran por la marca de la corrida. Va al final: los
  // `ProductoBase` que las referencian ya se fueron.
  await prisma.categoria.deleteMany({ where: { nombre: { startsWith: marca } } });
}

// ═══════════════════════════════════════════════════════════════════════════

async function correr(f) {
  const { grupo, origen, destino, ajeno, usuario } = f;
  const sesion = token(usuario.id, destino.id, grupo.id);
  const sesionOrigen = token(usuario.id, origen.id, grupo.id);

  let n = 0;
  /** Un producto en el ORIGEN, con su stock, y su espejo en el destino. */
  const armarProducto = async ({ nombre, factorPack = 1, stockOrigen = 100 }) => {
    const p = await crearProductoVendible(prisma, {
      grupoId: grupo.id, localId: origen.id, nombre: `${marca}-${nombre}`, stock: stockOrigen,
    });
    if (factorPack > 1) {
      await prisma.productoBase.update({ where: { id: p.baseId }, data: { factor_pack: factorPack } });
    }
    return p;
  };

  /** Una transferencia ENVIADA, con su tránsito ya cargado como lo deja el envío. */
  const armarTransferencia = async (lineas) => {
    const t = await prisma.transferencia.create({
      data: { origenId: origen.id, destinoId: destino.id, estado: "Enviada", creadaPor: usuario.id },
    });
    for (const l of lineas) {
      await prisma.transferenciaDetalle.create({
        data: {
          transferenciaId: t.id, productoId: l.producto.productoLocalId,
          cantidad: l.cantidad, unidadEnviada: l.unidad || "UNIDAD",
        },
      });
      // El envío ya descontó del origen y cargó el tránsito: se reproduce ese
      // estado para que la recepción parta de donde parte en producción.
      const fisicas = (l.unidad === "BULTO" ? l.factorPack || 1 : 1) * l.cantidad;
      await prisma.stockLocal.update({
        where: { localId_productoId: { localId: origen.id, productoId: l.producto.productoLocalId } },
        data: { cantidad: { decrement: fisicas }, enTransito: { increment: fisicas } },
      });
    }
    return t;
  };

  const stockDe = async (localId, productoLocalId) => {
    const s = await prisma.stockLocal.findUnique({
      where: { localId_productoId: { localId, productoId: productoLocalId } },
    });
    return { cantidad: Number(s?.cantidad || 0), enTransito: Number(s?.enTransito || 0) };
  };
  const stockDestinoDe = async (baseId) => {
    const pl = await prisma.productoLocal.findUnique({
      where: { localId_baseId: { localId: destino.id, baseId } },
    });
    if (!pl) return { cantidad: 0, enTransito: 0 };
    return stockDe(destino.id, pl.id);
  };

  const guardar = (transferenciaId, items, ses = sesion) =>
    leer(rutaGuardar.POST(pedido("http://ci/api/transferencias/guardar-recepcion", {
      metodo: "POST", sesion: ses, cuerpo: { transferenciaId, items },
    })));
  const confirmar = (transferenciaId, ses = sesion) =>
    leer(rutaConfirmar.POST(pedido("http://ci/api/transferencias/confirmar-recepcion", {
      metodo: "POST", sesion: ses, cuerpo: { transferenciaId },
    })));
  const agregarLinea = (cuerpo, ses = sesion) =>
    leer(rutaLinea.POST(pedido("http://ci/api/transferencias/linea-recepcion", {
      metodo: "POST", sesion: ses, cuerpo,
    })));
  const borrarLinea = (cuerpo, ses = sesion) =>
    leer(rutaLinea.DELETE(pedido("http://ci/api/transferencias/linea-recepcion", {
      metodo: "DELETE", sesion: ses, cuerpo,
    })));
  /** Cerrar el control físico de UN producto. Persiste cantidad, sueltas y marca. */
  const revisar = (cuerpo, ses = sesion) =>
    leer(rutaRevisar.POST(pedido("http://ci/api/transferencias/revisar-producto", {
      metodo: "POST", sesion: ses, cuerpo,
    })));

  /**
   * Marca revisadas TODAS las líneas del remito de una transferencia.
   *
   * Existe porque desde esta tanda confirmar exige el control físico terminado, y
   * las secciones que miden OTRA cosa —la aritmética, los estados, la
   * concurrencia— no tienen por qué repetir el checklist en cada una. Lo que
   * prueba la guarda es su propia sección.
   */
  const revisarTodo = async (transferenciaId) => {
    const dets = await prisma.transferenciaDetalle.findMany({
      where: { transferenciaId, agregadoEnRecepcion: false },
      select: { id: true, recibido: true, cantidad: true, motivoPrincipal: true },
    });
    for (const d of dets) {
      const rec = d.recibido == null ? d.cantidad : d.recibido;
      await revisar({
        transferenciaId,
        detalleId: d.id,
        recibido: rec,
        motivoPrincipal: d.motivoPrincipal || (Number(rec) !== Number(d.cantidad) ? "Faltante" : null),
      });
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  seccion("1-3. Los tres casos de una línea normal, contra el stock real");
  // ═════════════════════════════════════════════════════════════════════════

  for (const [titulo, enviado, recibido, esperadoOrigen, esperadoDestino] of [
    ["10 / 10", 10, 10, 90, 10],
    ["10 / 8", 10, 8, 92, 8],
    ["10 / 15", 10, 15, 85, 15],
  ]) {
    const p = await armarProducto({ nombre: `normal-${n++}` });
    const t = await armarTransferencia([{ producto: p, cantidad: enviado }]);
    const det = await prisma.transferenciaDetalle.findFirst({ where: { transferenciaId: t.id } });

    const g = await guardar(t.id, [{ id: det.id, recibido, motivoPrincipal: "Diferencia" }]);
    ok(`${titulo}: se guarda la recepción`, g.ok === true, g.error);

    // Desde el control físico, confirmar exige el checklist terminado. Estas
    // secciones miden la ARITMÉTICA, así que se revisa y se sigue; la guarda
    // tiene su propia sección más abajo.
    await revisarTodo(t.id);
    const c = await confirmar(t.id);
    ok(`${titulo}: se confirma`, c.ok === true, c.error);

    const so = await stockDe(origen.id, p.productoLocalId);
    const sd = await stockDestinoDe(p.baseId);
    igualStock(`${titulo}: origen queda en ${esperadoOrigen}`, so.cantidad, esperadoOrigen);
    igualStock(`${titulo}: el tránsito del origen queda en 0`, so.enTransito, 0);
    igualStock(`${titulo}: destino queda en ${esperadoDestino}`, sd.cantidad, esperadoDestino);

    const guardado = await prisma.transferenciaDetalle.findUnique({ where: { id: det.id } });
    igualStock(`${titulo}: el ENVIADO no se reescribió`, guardado.cantidad, enviado);
    igualStock(`${titulo}: y el recibido quedó como se cargó`, guardado.recibido, recibido);

    const cab = await prisma.transferencia.findUnique({ where: { id: t.id } });
    igual(`${titulo}: tieneDiferencias`, cab.tieneDiferencias, enviado !== recibido);
    igual(`${titulo}: estado`, cab.estado, "Recibida");
  }

  // ═════════════════════════════════════════════════════════════════════════
  seccion("4. BULTO x20: 2 enviados / 3 recibidos");
  // ═════════════════════════════════════════════════════════════════════════

  const pb = await armarProducto({ nombre: `bulto-${n++}`, factorPack: 20 });
  const tb = await armarTransferencia([{ producto: pb, cantidad: 2, unidad: "BULTO", factorPack: 20 }]);
  const detb = await prisma.transferenciaDetalle.findFirst({ where: { transferenciaId: tb.id } });
  await guardar(tb.id, [{ id: detb.id, recibido: 3, motivoPrincipal: "Sobrante" }]);
  await revisarTodo(tb.id);
  ok("BULTO: se confirma", (await confirmar(tb.id)).ok === true);

  const sob = await stockDe(origen.id, pb.productoLocalId);
  const sdb = await stockDestinoDe(pb.baseId);
  igualStock("BULTO: enviado físico 40, recibido físico 60 → origen 100-40-20 = 40", sob.cantidad, 40);
  igualStock("BULTO: tránsito en 0", sob.enTransito, 0);
  igualStock("BULTO: destino +60", sdb.cantidad, 60);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("5-6. Producto agregado durante la recepción");
  // ═════════════════════════════════════════════════════════════════════════

  const pCoca = await armarProducto({ nombre: `coca-${n++}` });
  const pFanta = await armarProducto({ nombre: `fanta-${n++}` });
  const tf = await armarTransferencia([{ producto: pCoca, cantidad: 10 }]);
  const transitoFantaAntes = (await stockDe(origen.id, pFanta.productoLocalId)).enTransito;

  const alta = await agregarLinea({
    transferenciaId: tf.id, productoLocalId: pFanta.productoLocalId, recibido: 6,
    unidadEnviada: "UNIDAD",
  });
  ok("se puede agregar un producto que no estaba en el remito", alta.ok === true, alta.error);
  igual("y no venía de antes", alta.yaExistia, false);

  const detFanta = await prisma.transferenciaDetalle.findUnique({ where: { id: alta.detalleId } });
  igual("la línea queda marcada como agregada en recepción", detFanta.agregadoEnRecepcion, true);
  igual("con su autor", detFanta.agregadoEnRecepcionPorId, usuario.id);
  ok("y su fecha", detFanta.agregadoEnRecepcionAt != null);
  igualStock("su cantidad ENVIADA es 0: nunca se envió", detFanta.cantidad, 0);

  // Agregar la línea NO movió stock.
  igualStock("agregar la línea no movió el stock del origen",
    (await stockDe(origen.id, pFanta.productoLocalId)).cantidad, 100);

  await guardar(tf.id, [{ id: detFanta.id, recibido: 6, motivoPrincipal: "Sobrante" }]);
  await revisarTodo(tf.id);
  ok("se confirma la transferencia con la línea agregada", (await confirmar(tf.id)).ok === true);

  const soFanta = await stockDe(origen.id, pFanta.productoLocalId);
  const sdFanta = await stockDestinoDe(pFanta.baseId);
  igualStock("Fanta: origen -6", soFanta.cantidad, 94);
  igualStock("Fanta: el TRÁNSITO del origen no se tocó", soFanta.enTransito, transitoFantaAntes);
  igualStock("Fanta: destino +6", sdFanta.cantidad, 6);
  igualStock("Coca: la línea original se recibió completa", (await stockDestinoDe(pCoca.baseId)).cantidad, 10);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("EL FLUJO DEL PEDIDO: 10/15 con Sobrante + Fanta agregada SIN motivo");
  // ═════════════════════════════════════════════════════════════════════════
  //
  // ── POR QUÉ ESTA SECCIÓN EXISTE ─────────────────────────────────────────
  //
  // La de arriba guarda un "Sobrante" a mano en la línea agregada, así que pasa
  // por el camino en el que el motivo SÍ está. El defecto vivía justo al lado:
  // `linea-recepcion` crea la línea sin motivo —no hay ninguno que sea un dato
  // real— y confirmar la rechazaba con FALTA_MOTIVO_DIFERENCIA. O sea que el
  // sistema creaba una línea que él mismo no podía confirmar.
  //
  // Acá se ejerce el flujo tal cual ocurre: se agrega, NO se le guarda motivo, y
  // se confirma. Contra las rutas de verdad y contra Postgres, que es lo único
  // que contesta si el inventario quedó bien.

  const pA = await armarProducto({ nombre: `prodA-${n++}` });
  const pFantaB = await armarProducto({ nombre: `fantaB-${n++}`, factorPack: 6, stockOrigen: 100 });
  const tFlujo = await armarTransferencia([{ producto: pA, cantidad: 10 }]);
  const detRemito = await prisma.transferenciaDetalle.findFirst({ where: { transferenciaId: tFlujo.id } });

  // 1 · la línea del remito: 10 enviadas, 15 recibidas, con su Sobrante.
  const guardadoA = await guardar(tFlujo.id, [
    { id: detRemito.id, recibido: 15, motivoPrincipal: "Sobrante" },
  ]);
  ok("la línea del remito guarda 15 con Sobrante", guardadoA.ok === true, guardadoA.error);

  // 2 · Fanta, agregada, 2 BULTO de 6. La ruta NO le escribe motivo.
  const altaFanta = await agregarLinea({
    transferenciaId: tFlujo.id, productoLocalId: pFantaB.productoLocalId,
    recibido: 2, unidadEnviada: "BULTO",
  });
  ok("se agrega Fanta en BULTO", altaFanta.ok === true, altaFanta.error);
  const detFantaB = await prisma.transferenciaDetalle.findUnique({ where: { id: altaFanta.detalleId } });
  igual("y nace SIN motivo, que es como la crea la ruta", detFantaB.motivoPrincipal, null);
  igual("marcada como agregada", detFantaB.agregadoEnRecepcion, true);

  const origenAntesA = await stockDe(origen.id, pA.productoLocalId);
  const origenAntesFanta = await stockDe(origen.id, pFantaB.productoLocalId);
  const transitoFantaB = origenAntesFanta.enTransito;

  // 3 · CONFIRMAR, sin haberle puesto ningún motivo a Fanta.
  await revisarTodo(tFlujo.id);
  const conf = await confirmar(tFlujo.id);
  ok("CONFIRMA sin pedirle motivo a la línea agregada", conf.ok === true, JSON.stringify(conf));
  ok("y no falla por falta de motivo", conf.codigo !== "FALTA_MOTIVO_DIFERENCIA", conf.codigo || "");

  // 4 · el inventario, que es lo que importa.
  const trasA = await stockDe(origen.id, pA.productoLocalId);
  igualStock("Producto A: el origen pierde los 5 de más", trasA.cantidad, origenAntesA.cantidad - 5);
  igualStock("y su tránsito queda en 0", trasA.enTransito, 0);
  igualStock("el destino recibe 15", (await stockDestinoDe(pA.baseId)).cantidad, 15);

  const trasFanta = await stockDe(origen.id, pFantaB.productoLocalId);
  igualStock("Fanta: el origen pierde 12 unidades (2 bultos de 6)",
    trasFanta.cantidad, origenAntesFanta.cantidad - 12);
  igualStock("Fanta: el tránsito NO se tocó: nunca se envió", trasFanta.enTransito, transitoFantaB);
  igualStock("Fanta: el destino recibe 12, no 2", (await stockDestinoDe(pFantaB.baseId)).cantidad, 12);

  // 5 · la auditoría distingue las dos.
  const audA = await prisma.auditoriaStock.findFirst({ where: { transferenciaDetalleId: detRemito.id } });
  igual("Producto A se audita como EXCEDENTE", audA?.accion, ACCIONES_RECEPCION.EXCEDENTE);
  const audFanta = await prisma.auditoriaStock.findFirst({ where: { transferenciaDetalleId: detFantaB.id } });
  igual("Fanta se audita como AGREGADO", audFanta?.accion, ACCIONES_RECEPCION.AGREGADO);

  // 6 · y el motivo sigue sin inventarse en la base.
  const detFantaFinal = await prisma.transferenciaDetalle.findUnique({ where: { id: detFantaB.id } });
  igual("no se le escribió un motivo falso", detFantaFinal.motivoPrincipal, null);

  // 7 · EL CONTRASTE: una línea DEL REMITO con diferencia y sin motivo NO pasa.
  const tSinMotivo = await armarTransferencia([{ producto: pA, cantidad: 4 }]);
  const detSinMotivo = await prisma.transferenciaDetalle.findFirst({ where: { transferenciaId: tSinMotivo.id } });
  const guardarSinMotivo = await guardar(tSinMotivo.id, [{ id: detSinMotivo.id, recibido: 9 }]);
  ok("una línea del REMITO sin motivo sigue rechazándose", guardarSinMotivo.ok !== true,
    JSON.stringify(guardarSinMotivo));
  igual("con el código de siempre", guardarSinMotivo.codigo, "FALTA_MOTIVO_DIFERENCIA");

  // ═════════════════════════════════════════════════════════════════════════
  seccion("Auditoría: las tres acciones quedan distinguidas");
  // ═════════════════════════════════════════════════════════════════════════

  const auditFanta = await prisma.auditoriaStock.findFirst({
    where: { transferenciaDetalleId: detFanta.id },
  });
  ok("la línea agregada dejó auditoría", auditFanta != null);
  igual("con la acción de producto agregado", auditFanta?.accion, ACCIONES_RECEPCION.AGREGADO);
  igual("vinculada estructuralmente a la transferencia", auditFanta?.transferenciaId, tf.id);
  igual("y al detalle", auditFanta?.transferenciaDetalleId, detFanta.id);
  igual("con el usuario", auditFanta?.userId, usuario.id);
  igualStock("y el antes/después del stock", auditFanta?.cantidadAnterior, 100);
  igualStock("y el después", auditFanta?.cantidadNueva, 94);

  const acciones = await prisma.auditoriaStock.groupBy({
    by: ["accion"],
    where: { localId: origen.id },
    _count: true,
  });
  const porAccion = Object.fromEntries(acciones.map((a) => [a.accion, a._count]));
  ok("hay auditoría de FALTANTE", (porAccion[ACCIONES_RECEPCION.FALTANTE] || 0) >= 1, JSON.stringify(porAccion));
  ok("hay auditoría de EXCEDENTE", (porAccion[ACCIONES_RECEPCION.EXCEDENTE] || 0) >= 1, JSON.stringify(porAccion));
  ok("hay auditoría de AGREGADO", (porAccion[ACCIONES_RECEPCION.AGREGADO] || 0) >= 1, JSON.stringify(porAccion));

  // ═════════════════════════════════════════════════════════════════════════
  seccion("10-11. Seguridad: producto ajeno y local que no es destino");
  // ═════════════════════════════════════════════════════════════════════════

  const pAjeno = await crearProductoVendible(prisma, {
    grupoId: creado.grupoAjenoId, localId: ajeno.id, nombre: `${marca}-ajeno-prod`,
  });
  const pOtro = await armarProducto({ nombre: `otro-${n++}` });
  const tSeg = await armarTransferencia([{ producto: pOtro, cantidad: 5 }]);

  const conAjeno = await agregarLinea({
    transferenciaId: tSeg.id, productoLocalId: pAjeno.productoLocalId, unidadEnviada: "UNIDAD",
  });
  igual("un producto de otro origen se rechaza", conAjeno.status, 404);
  igual("y se dice por qué", conAjeno.codigo, "PRODUCTO_FUERA_DEL_ORIGEN");

  const desdeOrigen = await agregarLinea(
    { transferenciaId: tSeg.id, productoLocalId: pOtro.productoLocalId, unidadEnviada: "UNIDAD" },
    sesionOrigen
  );
  igual("el local ORIGEN no puede tocar la recepción", desdeOrigen.status, 403);

  const guardarDesdeOrigen = await guardar(tSeg.id, [], sesionOrigen);
  igual("tampoco guardar", guardarDesdeOrigen.status, 403);
  igual("ni confirmar", (await confirmar(tSeg.id, sesionOrigen)).status, 403);

  const buscarDesdeOrigen = await leer(
    rutaBuscar.GET(pedido(`http://ci/api/transferencias/buscar-productos-origen?transferenciaId=${tSeg.id}`, { sesion: sesionOrigen }))
  );
  igual("ni buscar en el catálogo del origen", buscarDesdeOrigen.status, 403);

  const buscarOk = await leer(
    rutaBuscar.GET(pedido(`http://ci/api/transferencias/buscar-productos-origen?transferenciaId=${tSeg.id}&q=${encodeURIComponent(marca)}`, { sesion }))
  );
  ok("el DESTINO sí puede buscar en el catálogo del origen", buscarOk.ok === true, buscarOk.error);
  igual("y el origen sale de la transferencia, no del pedido", buscarOk.origenId, origen.id);
  ok("con resultados del catálogo del origen", (buscarOk.items || []).length > 0);
  ok("y ninguno del local ajeno",
    !(buscarOk.items || []).some((i) => i.productoLocalId === pAjeno.productoLocalId));

  // ═════════════════════════════════════════════════════════════════════════
  seccion("18 y 16-17. Duplicados y borrado de líneas");
  // ═════════════════════════════════════════════════════════════════════════

  const yaEsta = await agregarLinea({
    transferenciaId: tSeg.id, productoLocalId: pOtro.productoLocalId, unidadEnviada: "UNIDAD",
  });
  ok("agregar un producto que YA está en el remito no falla", yaEsta.ok === true, yaEsta.error);
  igual("avisa que ya existía", yaEsta.yaExistia, true);
  igual("no se creó una segunda línea",
    await prisma.transferenciaDetalle.count({ where: { transferenciaId: tSeg.id, productoId: pOtro.productoLocalId } }), 1);

  const pBorrar = await armarProducto({ nombre: `borrar-${n++}` });
  const extra = await agregarLinea({
    transferenciaId: tSeg.id, productoLocalId: pBorrar.productoLocalId, unidadEnviada: "UNIDAD",
  });
  ok("se agrega una línea extra", extra.ok === true, extra.error);

  const stockAntesDeBorrar = await stockDe(origen.id, pBorrar.productoLocalId);
  const borrada = await borrarLinea({ transferenciaId: tSeg.id, detalleId: extra.detalleId });
  ok("una línea agregada se puede eliminar antes de confirmar", borrada.ok === true, borrada.error);
  igual("y desaparece", await prisma.transferenciaDetalle.count({ where: { id: extra.detalleId } }), 0);
  const stockTrasBorrar = await stockDe(origen.id, pBorrar.productoLocalId);
  igualStock("borrarla no movió stock", stockTrasBorrar.cantidad, stockAntesDeBorrar.cantidad);
  igualStock("ni el tránsito", stockTrasBorrar.enTransito, stockAntesDeBorrar.enTransito);

  const detOriginal = await prisma.transferenciaDetalle.findFirst({
    where: { transferenciaId: tSeg.id, agregadoEnRecepcion: false },
  });
  const borrarOriginal = await borrarLinea({ transferenciaId: tSeg.id, detalleId: detOriginal.id });
  igual("una línea del REMITO no se puede eliminar", borrarOriginal.status, 409);
  igual("y se dice por qué", borrarOriginal.codigo, "LINEA_DEL_REMITO_NO_SE_BORRA");
  igual("la línea sigue ahí", await prisma.transferenciaDetalle.count({ where: { id: detOriginal.id } }), 1);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("12-14. Estados y doble confirmación");
  // ═════════════════════════════════════════════════════════════════════════

  await guardar(tSeg.id, [{ id: detOriginal.id, recibido: 5 }]);
  await revisarTodo(tSeg.id);
  ok("primera confirmación", (await confirmar(tSeg.id)).ok === true);

  const segunda = await confirmar(tSeg.id);
  igual("la SEGUNDA confirmación se rechaza", segunda.status, 400);
  ok("con el mensaje de ya confirmada", /ya fue confirmada/i.test(segunda.error || ""), segunda.error);

  igual("una transferencia Recibida no admite guardar", (await guardar(tSeg.id, [])).status, 400);
  igual("ni agregar líneas",
    (await agregarLinea({
      transferenciaId: tSeg.id, productoLocalId: pBorrar.productoLocalId, unidadEnviada: "UNIDAD",
    })).status, 400);

  const tCancel = await armarTransferencia([{ producto: pOtro, cantidad: 1 }]);
  await prisma.transferencia.update({ where: { id: tCancel.id }, data: { estado: "Cancelada" } });
  igual("una Cancelada no admite guardar", (await guardar(tCancel.id, [])).status, 400);
  igual("ni agregar líneas",
    (await agregarLinea({
      transferenciaId: tCancel.id, productoLocalId: pBorrar.productoLocalId, unidadEnviada: "UNIDAD",
    })).status, 400);
  igual("ni confirmar", (await confirmar(tCancel.id)).status, 400);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("15. Una línea que falla revierte TODA la recepción");
  // ═════════════════════════════════════════════════════════════════════════

  const pBuena = await armarProducto({ nombre: `buena-${n++}` });
  const pRota = await armarProducto({ nombre: `rota-${n++}` });
  const tRoll = await armarTransferencia([
    { producto: pBuena, cantidad: 4 },
    { producto: pRota, cantidad: 4 },
  ]);
  const antesBuena = await stockDe(origen.id, pBuena.productoLocalId);
  const antesDestinoBuena = await stockDestinoDe(pBuena.baseId);

  // Se rompe la SEGUNDA línea borrando su fila de stock en el origen: la ruta
  // aborta con STOCK_ORIGEN_NO_ENCONTRADO desde adentro de la transacción, que
  // es un fallo real del flujo y no una condición fabricada con un flag.
  await prisma.stockLocal.deleteMany({
    where: { localId: origen.id, productoId: pRota.productoLocalId },
  });

  await revisarTodo(tRoll.id);
  const roto = await confirmar(tRoll.id);
  ok("la confirmación falla", roto.ok !== true, JSON.stringify(roto));
  igual("con el código del origen faltante", roto.codigo, "STOCK_ORIGEN_NO_ENCONTRADO");

  const trasRoll = await stockDe(origen.id, pBuena.productoLocalId);
  const trasRollDestino = await stockDestinoDe(pBuena.baseId);
  igualStock("la línea BUENA no acreditó al destino", trasRollDestino.cantidad, antesDestinoBuena.cantidad);
  igualStock("ni ajustó el origen", trasRoll.cantidad, antesBuena.cantidad);
  igualStock("ni limpió su tránsito", trasRoll.enTransito, antesBuena.enTransito);
  const cabRoll = await prisma.transferencia.findUnique({ where: { id: tRoll.id } });
  ok("y la transferencia no quedó a medio confirmar",
    cabRoll.estado !== "Recibida" && cabRoll.estado !== "Confirmando", cabRoll.estado);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("Política de stock negativo: la vigente, no una nueva");
  // ═════════════════════════════════════════════════════════════════════════

  await prisma.configuracionGrupo.update({
    where: { grupoId: grupo.id }, data: { allowNegativeStock: false },
  });

  const pSinStock = await armarProducto({ nombre: `sinstock-${n++}`, stockOrigen: 10 });
  const tNeg = await armarTransferencia([{ producto: pSinStock, cantidad: 10 }]);
  const detNeg = await prisma.transferenciaDetalle.findFirst({ where: { transferenciaId: tNeg.id } });
  // El origen quedó en 0 tras enviar: recibir 15 exige descontarle 5 que no tiene.
  await guardar(tNeg.id, [{ id: detNeg.id, recibido: 15, motivoPrincipal: "Sobrante" }]);

  await revisarTodo(tNeg.id);
  const negado = await confirmar(tNeg.id);
  igual("sin permitir negativos, el excedente se rechaza", negado.status, 400);
  igual("con el MISMO código que usa el envío", negado.codigo, "STOCK_INSUFICIENTE");
  ok("y se dice qué producto y cuánto falta", Array.isArray(negado.faltantes) && negado.faltantes.length === 1,
    JSON.stringify(negado.faltantes));
  igualStock("y no se movió nada", (await stockDe(origen.id, pSinStock.productoLocalId)).cantidad, 0);
  igual("la transferencia sigue recibible",
    (await prisma.transferencia.findUnique({ where: { id: tNeg.id } })).estado, "Recibiendo");

  await prisma.configuracionGrupo.update({
    where: { grupoId: grupo.id }, data: { allowNegativeStock: true },
  });
  const permitido = await confirmar(tNeg.id);
  ok("con la política que SÍ los permite, la misma recepción entra", permitido.ok === true, permitido.error);
  igualStock("y el origen queda en -5", (await stockDe(origen.id, pSinStock.productoLocalId)).cantidad, -5);
  igualStock("con el destino en 15", (await stockDestinoDe(pSinStock.baseId)).cantidad, 15);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("Unidad obligatoria en una línea agregada (nada de adivinar)");
  // ═════════════════════════════════════════════════════════════════════════

  const pPack = await armarProducto({ nombre: `pack-${n++}`, factorPack: 20, stockOrigen: 200 });
  const tUni = await armarTransferencia([{ producto: pOtro, cantidad: 1 }]);

  const sinUnidad = await agregarLinea({
    transferenciaId: tUni.id, productoLocalId: pPack.productoLocalId, recibido: 3,
  });
  igual("agregar sin unidad se rechaza", sinUnidad.status, 400);
  igual("con el código de unidad ausente", sinUnidad.codigo, "UNIDAD_ENVIADA_AUSENTE");
  igual("y NO se creó ninguna línea",
    await prisma.transferenciaDetalle.count({
      where: { transferenciaId: tUni.id, productoId: pPack.productoLocalId },
    }), 0);

  const unidadRara = await agregarLinea({
    transferenciaId: tUni.id, productoLocalId: pPack.productoLocalId,
    recibido: 3, unidadEnviada: "CAJON",
  });
  igual("una unidad desconocida también", unidadRara.status, 400);
  igual("con su propio código", unidadRara.codigo, "UNIDAD_ENVIADA_DESCONOCIDA");

  // Y el número que explica por qué esto no es un detalle de forma: con factor 20,
  // haber supuesto UNIDAD en vez de BULTO son 57 unidades de diferencia sobre el
  // stock del ORIGEN, que es de donde sale una línea agregada.
  const enBultos = await agregarLinea({
    transferenciaId: tUni.id, productoLocalId: pPack.productoLocalId,
    recibido: 3, unidadEnviada: "BULTO",
  });
  ok("con la unidad explícita sí entra", enBultos.ok === true, enBultos.error);

  const origenPackAntes = await stockDe(origen.id, pPack.productoLocalId);
  const detUni = await prisma.transferenciaDetalle.findFirst({
    where: { transferenciaId: tUni.id, agregadoEnRecepcion: false },
  });
  await guardar(tUni.id, [
    { id: detUni.id, recibido: 1 },
    { id: enBultos.detalleId, recibido: 3, motivoPrincipal: "Sobrante" },
  ]);
  await revisarTodo(tUni.id);
  const confUni = await confirmar(tUni.id);
  ok("y la recepción confirma", confUni.ok === true, JSON.stringify(confUni));

  const origenPackDespues = await stockDe(origen.id, pPack.productoLocalId);
  igualStock("el origen perdió 60 unidades, no 3",
    origenPackAntes.cantidad - origenPackDespues.cantidad, 60);
  igualStock("y el destino recibió 60", (await stockDestinoDe(pPack.baseId)).cantidad, 60);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("Carrera: la fila de Transferencia es el mutex (sin sorteo)");
  // ═════════════════════════════════════════════════════════════════════════

  const pMutex = await armarProducto({ nombre: `mutex-${n++}`, stockOrigen: 100 });
  const tMutex = await armarTransferencia([{ producto: pMutex, cantidad: 10 }]);
  const detMutex = await prisma.transferenciaDetalle.findFirst({ where: { transferenciaId: tMutex.id } });
  await guardar(tMutex.id, [{ id: detMutex.id, recibido: 10 }]);

  const mutexAntes = await stockDe(origen.id, pMutex.productoLocalId);
  const mutexDestinoAntes = await stockDestinoDe(pMutex.baseId);

  // Una transacción toma la fila con el MISMO updateMany condicional que usa la
  // ruta. Es la confirmación "que llegó primero".
  const bMutex = barrera((tx) =>
    tx.transferencia.updateMany({
      where: { id: tMutex.id, estado: { in: ["Enviada", "Recibiendo"] } },
      data: { estado: "Confirmando" },
    })
  );
  const tomadaMutex = await bMutex.tomado;
  igual("la primera confirmación toma la fila", tomadaMutex?.count, 1);

  // Recién ahora se dispara la segunda. La fila ya está tomada: su updateMany
  // BLOQUEA. Eso se comprueba antes de seguir.
  const segundaConfirmacion = confirmar(tMutex.id);
  ok("la segunda confirmación queda esperando el lock", await esperarBloqueo(),
    "nunca se bloqueó: la prueba no llegó a montar la carrera");

  bMutex.soltar();
  await bMutex.fin;

  const perdio = await segundaConfirmacion;
  ok("y pierde la carrera", perdio.ok !== true, JSON.stringify(perdio));
  igual("con el código del conflicto", perdio.codigo, "RECEPCION_TOMADA");
  igual("y su status", perdio.status, 409);

  const mutexDespues = await stockDe(origen.id, pMutex.productoLocalId);
  igualStock("la perdedora no movió el origen", mutexDespues.cantidad, mutexAntes.cantidad);
  igualStock("ni su tránsito", mutexDespues.enTransito, mutexAntes.enTransito);
  igualStock("ni acreditó al destino",
    (await stockDestinoDe(pMutex.baseId)).cantidad, mutexDestinoAntes.cantidad);
  igual("y el detalle no quedó marcado como confirmado",
    (await prisma.transferenciaDetalle.findUnique({ where: { id: detMutex.id } })).confirmadoPorId, null);

  // ── Y BORRAR TAMPOCO SE CUELA: ES EL CASO QUE DESTRUÍA DATOS ──────────────
  //
  // Sin el lock, un DELETE validado en "Recibiendo" podía ejecutarse después de
  // que la confirmación ya hubiera movido el stock de esa línea: quedaba un
  // ajuste de inventario sin la línea que lo explica.
  await prisma.transferencia.update({ where: { id: tMutex.id }, data: { estado: "Recibiendo" } });
  const extraMutex = await agregarLinea({
    transferenciaId: tMutex.id, productoLocalId: pMutex.productoLocalId, unidadEnviada: "UNIDAD",
  });
  // El producto ya está en el remito, así que se usa otro para poder borrar.
  const pBorrable = await armarProducto({ nombre: `borrable-${n++}` });
  const extraBorrable = await agregarLinea({
    transferenciaId: tMutex.id, productoLocalId: pBorrable.productoLocalId,
    recibido: 2, unidadEnviada: "UNIDAD",
  });
  ok("hay una línea agregada para borrar", extraBorrable.ok === true, extraBorrable.error);
  igual("y el producto del remito no se duplicó", extraMutex.yaExistia, true);

  const bBorrado = barrera((tx) =>
    tx.transferencia.updateMany({
      where: { id: tMutex.id, estado: { in: ["Enviada", "Recibiendo"] } },
      data: { estado: "Confirmando" },
    })
  );
  igual("la confirmación toma la fila otra vez", (await bBorrado.tomado)?.count, 1);

  const borradoTardio = borrarLinea({ transferenciaId: tMutex.id, detalleId: extraBorrable.detalleId });
  ok("el borrado queda esperando el lock", await esperarBloqueo(),
    "nunca se bloqueó: la prueba no llegó a montar la carrera");

  bBorrado.soltar();
  await bBorrado.fin;

  const borradoPerdido = await borradoTardio;
  ok("el borrado pierde", borradoPerdido.ok !== true, JSON.stringify(borradoPerdido));
  igual("con el mismo código de conflicto", borradoPerdido.codigo, "RECEPCION_TOMADA");
  igual("y la línea sigue existiendo",
    await prisma.transferenciaDetalle.count({ where: { id: extraBorrable.detalleId } }), 1);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("Carrera entre DOS transferencias por el mismo stock de origen");
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Acá el lock de `Transferencia` NO sirve: A y B no comparten esa fila. Lo que
  // tiene que sostener el invariante es el update condicional del origen.

  await prisma.configuracionGrupo.update({
    where: { grupoId: grupo.id }, data: { allowNegativeStock: false },
  });

  // Stock 12, dos transferencias que envían 1 cada una → quedan 10 disponibles y
  // 2 en tránsito. Cada una recibe 9: excedente 8. Las dos juntas necesitan 16.
  const pDisputado = await armarProducto({ nombre: `disputado-${n++}`, stockOrigen: 12 });
  const tA = await armarTransferencia([{ producto: pDisputado, cantidad: 1 }]);
  const tB = await armarTransferencia([{ producto: pDisputado, cantidad: 1 }]);
  const detA = await prisma.transferenciaDetalle.findFirst({ where: { transferenciaId: tA.id } });
  const detB = await prisma.transferenciaDetalle.findFirst({ where: { transferenciaId: tB.id } });
  await guardar(tA.id, [{ id: detA.id, recibido: 9, motivoPrincipal: "Sobrante" }]);
  await guardar(tB.id, [{ id: detB.id, recibido: 9, motivoPrincipal: "Sobrante" }]);
  // El control físico terminado, en las dos. Lo que esta sección mide es la
  // carrera por el STOCK, y sin esto la guarda de revisión cortaría antes —lo
  // que además prueba que corre primero, pero acá taparía lo que se quiere ver.
  await revisarTodo(tA.id);
  await revisarTodo(tB.id);

  igualStock("el origen arranca con 10 disponibles",
    (await stockDe(origen.id, pDisputado.productoLocalId)).cantidad, 10);

  // ── EL ORDEN, FIJADO A MANO ──────────────────────────────────────────────
  //
  // 1. Una transacción toma la FILA DE STOCK sin cambiar el número: sigue en 10.
  //    Los SELECT no se bloquean, así que el chequeo previo de B va a leer 10 y
  //    pasar — que es exactamente lo que hacía falta reproducir.
  // 2. Se dispara B, que se queda esperando en su update condicional.
  // 3. Ahí recién la barrera descuenta los 8 de A y confirma.
  // 4. B despierta, reevalúa su WHERE contra la fila NUEVA y ve 2. No alcanza.
  //
  // Sin la guardia, el paso 4 no existiría: B escribiría sobre el valor viejo y
  // el origen terminaría en -6.
  let descontarA;
  const bStock = barrera(async (tx) => {
    const tomado = await tx.stockLocal.updateMany({
      where: { localId: origen.id, productoId: pDisputado.productoLocalId },
      data: { cantidad: { increment: 0 } },
    });
    // La segunda escritura se hace cuando la prueba lo pide, ya con B esperando.
    descontarA = () =>
      tx.stockLocal.updateMany({
        where: { localId: origen.id, productoId: pDisputado.productoLocalId, cantidad: { gte: 8 } },
        data: { cantidad: { decrement: 8 }, enTransito: { decrement: 1 } },
      });
    return tomado;
  });
  igual("la barrera toma la fila de stock", (await bStock.tomado)?.count, 1);

  const confirmarB = confirmar(tB.id);
  ok("B queda esperando el lock del stock", await esperarBloqueo(),
    "nunca se bloqueó: la prueba no llegó a montar la carrera");

  const aDescontó = await descontarA();
  igual("A descuenta sus 8 (10 → 2)", aDescontó.count, 1);
  bStock.soltar();
  await bStock.fin;

  const bPerdio = await confirmarB;
  ok("B se rechaza", bPerdio.ok !== true, JSON.stringify(bPerdio));
  igual("con el código de la política vigente", bPerdio.codigo, "STOCK_INSUFICIENTE");
  // Y ésta es LA afirmación que separa el arreglo del bug: el chequeo previo de B
  // leyó 10 y lo dejó pasar —por eso no trae la lista `faltantes`, que solo arma
  // ese camino—. Lo frenó la guardia de adentro de la transacción.
  ok("y lo frenó la guardia de ADENTRO, no el chequeo previo",
    bPerdio.faltantes === undefined, JSON.stringify(bPerdio.faltantes));

  const trasDisputa = await stockDe(origen.id, pDisputado.productoLocalId);
  igualStock("el origen quedó en 2, no en -6", trasDisputa.cantidad, 2);
  ok("y nunca fue negativo", trasDisputa.cantidad >= 0, String(trasDisputa.cantidad));
  igualStock("B no acreditó nada al destino", (await stockDestinoDe(pDisputado.baseId)).cantidad, 0);
  ok("y B sigue siendo recibible",
    (await prisma.transferencia.findUnique({ where: { id: tB.id } })).estado === "Recibiendo");

  // El caso secuencial, que es el que ya cubría el chequeo previo: con el stock
  // en 2, el rechazo llega antes de abrir la transacción y SÍ trae los faltantes.
  const bSecuencial = await confirmar(tB.id);
  igual("en secuencia el rechazo es el mismo", bSecuencial.codigo, "STOCK_INSUFICIENTE");
  ok("pero ahí sí se dice qué falta", Array.isArray(bSecuencial.faltantes) && bSecuencial.faltantes.length === 1,
    JSON.stringify(bSecuencial.faltantes));

  await prisma.configuracionGrupo.update({
    where: { grupoId: grupo.id }, data: { allowNegativeStock: true },
  });

  // ═════════════════════════════════════════════════════════════════════════
  seccion("A-C. Pack completo, pack INCOMPLETO y excedente, contra el stock real");
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Es lo único que contesta si el pack incompleto quedó exacto. La aritmética
  // ya se probó como función pura; acá se mira qué número quedó escrito en el
  // `Decimal(12,3)` de `StockLocal`, que es donde `5.833 × 6 = 34.998` haría
  // daño de verdad.

  /** Arma una transferencia de 6 PACK x6 y devuelve su detalle y el estado previo. */
  const armarPack = async (nombre) => {
    const p = await armarProducto({ nombre: `${nombre}-${n++}`, factorPack: 6, stockOrigen: 200 });
    const t = await armarTransferencia([
      { producto: p, cantidad: 6, unidad: "BULTO", factorPack: 6 },
    ]);
    const det = await prisma.transferenciaDetalle.findFirst({ where: { transferenciaId: t.id } });
    return { p, t, det, antes: await stockDe(origen.id, p.productoLocalId) };
  };

  // ── A · 6 PACK x6 enviados, 6 recibidos ─────────────────────────────────
  const A = await armarPack("packA");
  const revA = await revisar({ transferenciaId: A.t.id, detalleId: A.det.id, recibido: 6 });
  ok("A · se marca revisado sin diferencia", revA.ok === true, revA.error);
  igual("A · queda 0 pendientes", revA.pendientes, 0);
  const confA = await confirmar(A.t.id);
  ok("A · confirma", confA.ok === true, JSON.stringify(confA));

  const packTrasA = await stockDe(origen.id, A.p.productoLocalId);
  igualStock("A · destino +36", (await stockDestinoDe(A.p.baseId)).cantidad, 36);
  igualStock("A · tránsito del origen en 0", packTrasA.enTransito, A.antes.enTransito - 36);
  igualStock("A · el origen no se ajusta", packTrasA.cantidad, A.antes.cantidad);

  // ── B · 5 PACK x6 + 5 sueltas = 35 EXACTAS ──────────────────────────────
  const B = await armarPack("packB");
  const revB = await revisar({
    transferenciaId: B.t.id, detalleId: B.det.id,
    recibido: 5, recibidoUnidadesSueltas: 5, motivoPrincipal: "Faltante",
  });
  ok("B · se marca revisado el pack incompleto", revB.ok === true, revB.error);

  const packDetB = await prisma.transferenciaDetalle.findUnique({ where: { id: B.det.id } });
  igualStock("B · se guardaron 5 packs", packDetB.recibido, 5);
  igualStock("B · y 5 unidades sueltas", packDetB.recibidoUnidadesSueltas, 5);
  ok("B · NO se guardó 5.833", Math.round(Number(packDetB.recibido) * 1000) !== 5833,
    String(packDetB.recibido));

  const confB = await confirmar(B.t.id);
  ok("B · confirma", confB.ok === true, JSON.stringify(confB));

  const trasB = await stockDe(origen.id, B.p.productoLocalId);
  const destinoB = await stockDestinoDe(B.p.baseId);
  igualStock("B · destino +35 EXACTAS, no 34.998", destinoB.cantidad, 35);
  ok("B · y el destino no tiene milésimas de más",
    Math.round(Number(destinoB.cantidad) * 1000) === 35000, String(destinoB.cantidad));
  igualStock("B · tránsito -36: salieron 36", trasB.enTransito, B.antes.enTransito - 36);
  igualStock("B · el origen recupera 1", trasB.cantidad, B.antes.cantidad + 1);

  const audB = await prisma.auditoriaStock.findFirst({ where: { transferenciaDetalleId: B.det.id } });
  igual("B · se audita como faltante", audB?.accion, ACCIONES_RECEPCION.FALTANTE);

  // ── C · 6 PACK x6 + 1 suelta = 37 ───────────────────────────────────────
  const C = await armarPack("packC");
  const revC = await revisar({
    transferenciaId: C.t.id, detalleId: C.det.id,
    recibido: 6, recibidoUnidadesSueltas: 1, motivoPrincipal: "Sobrante",
  });
  ok("C · se marca revisado el excedente", revC.ok === true, revC.error);
  const confC = await confirmar(C.t.id);
  ok("C · confirma", confC.ok === true, JSON.stringify(confC));

  const trasC = await stockDe(origen.id, C.p.productoLocalId);
  igualStock("C · destino +37", (await stockDestinoDe(C.p.baseId)).cantidad, 37);
  igualStock("C · tránsito -36", trasC.enTransito, C.antes.enTransito - 36);
  igualStock("C · el origen pierde 1 más", trasC.cantidad, C.antes.cantidad - 1);

  const audC = await prisma.auditoriaStock.findFirst({ where: { transferenciaDetalleId: C.det.id } });
  igual("C · se audita como excedente", audC?.accion, ACCIONES_RECEPCION.EXCEDENTE);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("D-E. Confirmar exige el control físico terminado");
  // ═════════════════════════════════════════════════════════════════════════
  //
  // El stock se mueve al confirmar. Confirmar con productos del remito sin
  // revisar sería cerrar un conteo que nadie terminó, así que la guarda vive en
  // el SERVIDOR: bloquear el botón no alcanza — una pestaña vieja lo saltea.

  const pD1 = await armarProducto({ nombre: `sinrev1-${n++}` });
  const pD2 = await armarProducto({ nombre: `sinrev2-${n++}` });
  const tD = await armarTransferencia([
    { producto: pD1, cantidad: 4 },
    { producto: pD2, cantidad: 7 },
  ]);
  const detsD = await prisma.transferenciaDetalle.findMany({
    where: { transferenciaId: tD.id }, orderBy: { id: "asc" },
  });
  const antesD1 = await stockDe(origen.id, pD1.productoLocalId);
  const antesD2 = await stockDe(origen.id, pD2.productoLocalId);

  // Solo UNO revisado.
  ok("D · se revisa el primero", (await revisar({
    transferenciaId: tD.id, detalleId: detsD[0].id, recibido: 4,
  })).ok === true);

  const negadoD = await confirmar(tD.id);
  ok("D · NO confirma con un producto sin revisar", negadoD.ok !== true, JSON.stringify(negadoD));
  igual("D · con el código explícito", negadoD.codigo, "PRODUCTOS_SIN_REVISAR");
  igual("D · y dice cuántos faltan", negadoD.pendientes, 1);
  ok("D · y nombra alguno", Array.isArray(negadoD.ejemplos) && negadoD.ejemplos.length === 1,
    JSON.stringify(negadoD.ejemplos));

  // CERO movimiento de stock.
  igualStock("D · el origen del primero no se movió",
    (await stockDe(origen.id, pD1.productoLocalId)).cantidad, antesD1.cantidad);
  igualStock("D · ni su tránsito",
    (await stockDe(origen.id, pD1.productoLocalId)).enTransito, antesD1.enTransito);
  igualStock("D · ni el del segundo",
    (await stockDe(origen.id, pD2.productoLocalId)).cantidad, antesD2.cantidad);
  igualStock("D · el destino no recibió nada", (await stockDestinoDe(pD1.baseId)).cantidad, 0);
  ok("D · y la transferencia sigue recibible",
    (await prisma.transferencia.findUnique({ where: { id: tD.id } })).estado === "Recibiendo");

  // ── E · con el segundo revisado, confirma ───────────────────────────────
  const revE = await revisar({ transferenciaId: tD.id, detalleId: detsD[1].id, recibido: 7 });
  ok("E · se revisa el segundo", revE.ok === true, revE.error);
  igual("E · y ya no quedan pendientes", revE.pendientes, 0);
  const confE = await confirmar(tD.id);
  ok("E · ahora SÍ confirma", confE.ok === true, JSON.stringify(confE));
  igualStock("E · el destino recibe los dos", (await stockDestinoDe(pD1.baseId)).cantidad, 4);

  // ── LA REVISIÓN SOBREVIVE A RECARGAR ────────────────────────────────────
  //
  // Es lo que separa un checklist real de un estado de React: se lee de la base,
  // que es lo que ve un navegador que se acaba de abrir.
  const detE = await prisma.transferenciaDetalle.findUnique({ where: { id: detsD[1].id } });
  igual("E · la marca quedó persistida", detE.revisadoEnRecepcion, true);
  igual("E · con su autor", detE.revisadoEnRecepcionPorId, usuario.id);
  ok("E · y su fecha del servidor", detE.revisadoEnRecepcionAt != null);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("F. Un producto no declarado, en PACK");
  // ═════════════════════════════════════════════════════════════════════════

  const pF = await armarProducto({ nombre: `nodecl-${n++}`, factorPack: 6, stockOrigen: 200 });
  const pFbase = await armarProducto({ nombre: `base-${n++}` });
  const tF = await armarTransferencia([{ producto: pFbase, cantidad: 3 }]);
  const detFbase = await prisma.transferenciaDetalle.findFirst({ where: { transferenciaId: tF.id } });
  const antesF = await stockDe(origen.id, pF.productoLocalId);

  const altaF = await agregarLinea({
    transferenciaId: tF.id, productoLocalId: pF.productoLocalId,
    recibido: 2, unidadEnviada: "BULTO",
  });
  ok("F · se agrega 2 PACK x6", altaF.ok === true, altaF.error);

  const detF = await prisma.transferenciaDetalle.findUnique({ where: { id: altaF.detalleId } });
  igual("F · nace SIN motivo", detF.motivoPrincipal, null);
  igual("F · y marcada como agregada", detF.agregadoEnRecepcion, true);

  // NO cuenta como pendiente del remito: revisando solo el original alcanza.
  const revF = await revisar({ transferenciaId: tF.id, detalleId: detFbase.id, recibido: 3 });
  igual("F · el agregado NO cuenta como pendiente del remito", revF.pendientes, 0);

  const confF = await confirmar(tF.id);
  ok("F · confirma sin revisar el agregado", confF.ok === true, JSON.stringify(confF));

  const trasF = await stockDe(origen.id, pF.productoLocalId);
  igualStock("F · destino +12 (2 packs de 6)", (await stockDestinoDe(pF.baseId)).cantidad, 12);
  igualStock("F · el origen pierde 12", trasF.cantidad, antesF.cantidad - 12);
  igualStock("F · su tránsito NO se toca: nunca se envió", trasF.enTransito, antesF.enTransito);

  const audF = await prisma.auditoriaStock.findFirst({ where: { transferenciaDetalleId: detF.id } });
  igual("F · se audita como agregado", audF?.accion, ACCIONES_RECEPCION.AGREGADO);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("G. El JSON de recepción no lleva stock ni costo");
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Quien recibe mercadería no necesita saber cuánto hay ni cuánto cuesta, y no
  // alcanza con no dibujarlo: mientras viaje en la respuesta está a un `fetch` de
  // cualquiera con `transferencias.recibir`, que no es el permiso de ver costos.

  const tG = await armarTransferencia([{ producto: pFbase, cantidad: 1 }]);
  const buscado = await leer(rutaBuscar.GET(pedido(
    `http://ci/api/transferencias/buscar-productos-origen?transferenciaId=${tG.id}&q=${encodeURIComponent(marca)}`,
    { sesion }
  )));
  ok("G · la búsqueda contesta", buscado.ok === true, buscado.error);
  ok("G · y trae resultados", Array.isArray(buscado.items) && buscado.items.length > 0,
    String(buscado.items?.length));

  const claves = new Set();
  for (const it of buscado.items || []) for (const k of Object.keys(it)) claves.add(k);
  ok("G · NO existe la clave stockActual", !claves.has("stockActual"), [...claves].join(", "));
  ok("G · NO existe la clave precioCosto", !claves.has("precioCosto"), [...claves].join(", "));
  ok("G · sí lo necesario para identificar", claves.has("productoLocalId") && claves.has("nombre") &&
    claves.has("codigoBarra") && claves.has("factorPack"), [...claves].join(", "));

  // ═════════════════════════════════════════════════════════════════════════
  seccion("H. Desmarcar NO puede reescribir el conteo");
  // ═════════════════════════════════════════════════════════════════════════
  //
  // El defecto que más caro salía de los siete, y el único que ninguna pieza
  // podía ver por separado: desmarcar pasaba por el MISMO validador que marcar,
  // con un cuerpo que no traía cantidades. El validador hace lo correcto en su
  // lugar —sin recepción cargada, proponer lo enviado— y ahí hacía un desastre:
  // un conteo terminado de 5 bultos y 5 sueltas volvía a 6 bultos y 0 sueltas.
  //
  // O sea: 35 unidades contadas a mano se convertían en 36 por tocar un botón
  // que dice "desmarcar", y la pantalla mostraba la línea sin diferencia.
  //
  // Se lee la BASE, no la respuesta del endpoint. Un endpoint puede contestar
  // bien y haber escrito mal.

  const pH = await armarProducto({ nombre: "desmarcar", factorPack: 6, stockOrigen: 100 });
  const tH = await armarTransferencia([{ producto: pH, cantidad: 6, unidad: "BULTO", factorPack: 6 }]);
  const detH = await prisma.transferenciaDetalle.findFirst({ where: { transferenciaId: tH.id } });

  const marcarH = await revisar({
    transferenciaId: tH.id, detalleId: detH.id,
    recibido: 5, recibidoUnidadesSueltas: 5, motivoPrincipal: "Faltante", revisado: true,
  });
  ok("H · se cierra el control con 5 bultos y 5 sueltas", marcarH.ok === true, marcarH.error);

  const trasMarcar = await prisma.transferenciaDetalle.findUnique({ where: { id: detH.id } });
  igual("H · queda recibido 5", Number(trasMarcar.recibido), 5);
  igual("H · queda 5 sueltas", Number(trasMarcar.recibidoUnidadesSueltas), 5);
  igual("H · queda revisado", trasMarcar.revisadoEnRecepcion, true);
  ok("H · con autor", Number(trasMarcar.revisadoEnRecepcionPorId) === usuario.id,
    String(trasMarcar.revisadoEnRecepcionPorId));
  ok("H · y con fecha", trasMarcar.revisadoEnRecepcionAt instanceof Date,
    String(trasMarcar.revisadoEnRecepcionAt));

  const desmarcarH = await revisar({ transferenciaId: tH.id, detalleId: detH.id, revisado: false });
  ok("H · se desmarca", desmarcarH.ok === true, desmarcarH.error);

  const trasDesmarcar = await prisma.transferenciaDetalle.findUnique({ where: { id: detH.id } });
  igual("H · el recibido SIGUE en 5", Number(trasDesmarcar.recibido), 5);
  igual("H · las sueltas SIGUEN en 5", Number(trasDesmarcar.recibidoUnidadesSueltas), 5);
  igual("H · el motivo SIGUE siendo Faltante", trasDesmarcar.motivoPrincipal, "Faltante");
  igual("H · la marca queda en false", trasDesmarcar.revisadoEnRecepcion, false);
  igual("H · el autor se borra", trasDesmarcar.revisadoEnRecepcionPorId, null);
  igual("H · la fecha se borra", trasDesmarcar.revisadoEnRecepcionAt, null);

  // Y volver a marcar SIN mandar cantidades tampoco puede inventarlas: es el
  // mismo defecto por la otra puerta, la del cuerpo parcial.
  const reMarcarH = await revisar({ transferenciaId: tH.id, detalleId: detH.id, revisado: true });
  ok("H · se vuelve a marcar sin mandar cantidades", reMarcarH.ok === true, reMarcarH.error);
  const trasReMarcar = await prisma.transferenciaDetalle.findUnique({ where: { id: detH.id } });
  igual("H · y el recibido sigue en 5, no en 6", Number(trasReMarcar.recibido), 5);
  igual("H · y las sueltas siguen en 5, no en 0", Number(trasReMarcar.recibidoUnidadesSueltas), 5);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("I. El detalle recargado entiende el pack incompleto");
  // ═════════════════════════════════════════════════════════════════════════
  //
  // El stock ya se movía bien —lo prueban las secciones de arriba—, pero la
  // pantalla del histórico restaba CANTIDADES DE PRESENTACIÓN: 6 bultos contra
  // 6 bultos daba "sin diferencia" aunque hubiera llegado una unidad de más, y
  // 5 contra 6 daba "faltan 6" cuando faltaba 1. El documento contradecía al
  // stock que él mismo había movido.
  //
  // Se confirma de verdad y se recarga el detalle por su endpoint, que es el
  // camino que recorre la pantalla.

  // La ruta contesta `{ ok, item }` y todo lo interesante vive adentro de
  // `item`. Se desenvuelve acá, una vez, para que las afirmaciones digan qué
  // miden y no cómo viaja.
  const detalleDe = async (transferenciaId) => {
    const r = await leer(rutaDetalle.GET(pedido(
      `http://ci/api/transferencias/detalle?id=${transferenciaId}`, { sesion }
    )));
    return { ok: r.ok, error: r.error, ...(r.item || {}) };
  };

  // I.1 — 6 bultos de 6 más 1 suelta: 37 físicas contra 36. Sobra 1.
  const pI1 = await armarProducto({ nombre: "sobra-una", factorPack: 6, stockOrigen: 100 });
  const tI1 = await armarTransferencia([{ producto: pI1, cantidad: 6, unidad: "BULTO", factorPack: 6 }]);
  const detI1 = await prisma.transferenciaDetalle.findFirst({ where: { transferenciaId: tI1.id } });
  const rI1 = await revisar({
    transferenciaId: tI1.id, detalleId: detI1.id,
    recibido: 6, recibidoUnidadesSueltas: 1, motivoPrincipal: "Sobrante", revisado: true,
  });
  ok("I.1 · se cierra el control con 6 bultos y 1 suelta", rI1.ok === true, rI1.error);
  const cI1 = await confirmar(tI1.id);
  ok("I.1 · se confirma", cI1.ok === true, cI1.error);

  const dI1 = await detalleDe(tI1.id);
  ok("I.1 · el detalle contesta", dI1.ok === true, dI1.error);
  igual("I.1 · enviadas 36 unidades físicas", dI1.resumen?.itemsEnviados, 36);
  igual("I.1 · recibidas 37 unidades físicas", dI1.resumen?.itemsRecibidos, 37);
  igual("I.1 · la diferencia del documento es +1", dI1.resumen?.diferenciaTotal, 1);
  ok("I.1 · y el documento queda marcado con diferencias", dI1.tieneDiferencias === true,
    String(dI1.tieneDiferencias));
  // El ajuste informativo del origen también: entró una unidad de más, así que
  // al origen se le descuenta 1, no 0.
  igual("I.1 · al origen se le descuenta 1", dI1.items?.[0]?.excedenteOrigen, 1);
  igual("I.1 · y no se le devuelve nada", dI1.items?.[0]?.devolucionOrigen, 0);

  // I.2 — 5 bultos de 6 más 5 sueltas: 35 físicas contra 36. Falta 1, NO 6.
  const pI2 = await armarProducto({ nombre: "falta-una", factorPack: 6, stockOrigen: 100 });
  const tI2 = await armarTransferencia([{ producto: pI2, cantidad: 6, unidad: "BULTO", factorPack: 6 }]);
  const detI2 = await prisma.transferenciaDetalle.findFirst({ where: { transferenciaId: tI2.id } });
  const rI2 = await revisar({
    transferenciaId: tI2.id, detalleId: detI2.id,
    recibido: 5, recibidoUnidadesSueltas: 5, motivoPrincipal: "Faltante", revisado: true,
  });
  ok("I.2 · se cierra el control con 5 bultos y 5 sueltas", rI2.ok === true, rI2.error);
  const cI2 = await confirmar(tI2.id);
  ok("I.2 · se confirma", cI2.ok === true, cI2.error);

  const dI2 = await detalleDe(tI2.id);
  ok("I.2 · el detalle contesta", dI2.ok === true, dI2.error);
  igual("I.2 · enviadas 36 unidades físicas", dI2.resumen?.itemsEnviados, 36);
  igual("I.2 · recibidas 35 unidades físicas", dI2.resumen?.itemsRecibidos, 35);
  igual("I.2 · falta 1, no 6", dI2.resumen?.diferenciaTotal, -1);
  igual("I.2 · al origen se le devuelve 1, no 6", dI2.items?.[0]?.devolucionOrigen, 1);
  igual("I.2 · y no se le descuenta nada", dI2.items?.[0]?.excedenteOrigen, 0);

  // Y el stock confirma que el documento por fin dice lo mismo que él: el
  // destino recibió 35 y al origen volvió 1 de las 36 que había mandado.
  const sI2o = await stockDe(origen.id, pI2.productoLocalId);
  const sI2d = await stockDestinoDe(pI2.baseId);
  igualStock("I.2 · el destino queda con 35", sI2d.cantidad, 35);
  igualStock("I.2 · el origen recupera 1", sI2o.cantidad, 100 - 36 + 1);
  igualStock("I.2 · sin tránsito colgado", sI2o.enTransito, 0);

  // I.3 — 5 bultos de 6 más 6 sueltas: 36 contra 36. NO hay diferencia, aunque
  // las cantidades de presentación difieran (5 contra 6).
  const pI3 = await armarProducto({ nombre: "igual-distinto", factorPack: 6, stockOrigen: 100 });
  const tI3 = await armarTransferencia([{ producto: pI3, cantidad: 6, unidad: "BULTO", factorPack: 6 }]);
  const detI3 = await prisma.transferenciaDetalle.findFirst({ where: { transferenciaId: tI3.id } });
  const rI3 = await revisar({
    transferenciaId: tI3.id, detalleId: detI3.id,
    recibido: 5, recibidoUnidadesSueltas: 6, revisado: true,
  });
  ok("I.3 · se cierra sin exigir motivo, porque no hay diferencia física", rI3.ok === true, rI3.error);
  const cI3 = await confirmar(tI3.id);
  ok("I.3 · se confirma", cI3.ok === true, cI3.error);
  const dI3 = await detalleDe(tI3.id);
  igual("I.3 · 36 contra 36: diferencia 0", dI3.resumen?.diferenciaTotal, 0);
  igual("I.3 · y no hay ajuste al origen", dI3.items?.[0]?.ajusteOrigen, 0);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("J. El dirty fantasma, con datos reales y llegando a Confirmar");
  // ═════════════════════════════════════════════════════════════════════════
  //
  // El defecto no vivía en ninguna pieza: vivía en el cable. `filaDeServidor`
  // PROPONE lo enviado cuando no hay recepción cargada —correcto—, y
  // `reconciliarEditItems` conserva lo que el operador escribió —correcto—. La
  // recarga posterior a una revisión las juntaba, comparaba la propuesta vieja
  // (6) contra lo recién guardado (5), y encendía `dirty`.
  //
  // Con el botón "Guardar cambios" retirado del control físico a propósito, eso
  // dejaba a Confirmar diciendo "Tenés cambios sin guardar. Guardalos antes de
  // confirmar." sin ningún botón capaz de resolverlo. El remito quedaba trabado.
  //
  // Por eso esta prueba NO se conforma con llamar al helper con datos escritos a
  // mano: usa lo que devuelve el endpoint de detalle DESPUÉS de una revisión
  // real, y termina llamando a confirmar de verdad.

  const pJ1 = await armarProducto({ nombre: "fantasma-pack", factorPack: 6, stockOrigen: 100 });
  const pJ2 = await armarProducto({ nombre: "fantasma-simple", stockOrigen: 100 });
  const tJ = await armarTransferencia([
    { producto: pJ1, cantidad: 6, unidad: "BULTO", factorPack: 6 },
    { producto: pJ2, cantidad: 4 },
  ]);

  // 1 — La pantalla abre. El editor por lotes propone lo enviado, que es 6.
  const dJ0 = await detalleDe(tJ.id);
  ok("J · el detalle abre", dJ0.ok === true, dJ0.error);
  const alAbrirJ = siguienteEdicion({
    modo: MODO_RECEPCION.CONTROL_FISICO,
    preservar: false,
    items: dJ0.items,
  });
  const propuestaJ = alAbrirJ.editItems.find((e) => e.enviado === 6);
  igual("J · sin contar, la propuesta es lo enviado", Number(propuestaJ?.recibido), 6);
  igual("J · y al abrir no hay nada pendiente", alAbrirJ.dirty, false);

  // 2 — El operador cuenta 5 packs + 5 sueltas y marca revisado. De verdad.
  const detJ1 = await prisma.transferenciaDetalle.findFirst({
    where: { transferenciaId: tJ.id, productoId: pJ1.productoLocalId },
  });
  const revJ = await revisar({
    transferenciaId: tJ.id, detalleId: detJ1.id,
    recibido: 5, recibidoUnidadesSueltas: 5, motivoPrincipal: "Faltante", revisado: true,
  });
  ok("J · se cierra el control con 5 packs y 5 sueltas", revJ.ok === true, revJ.error);

  // 3 — La pantalla recarga. Esta es la juntura exacta donde nacía el fantasma.
  const dJ1 = await detalleDe(tJ.id);
  ok("J · el detalle recarga", dJ1.ok === true, dJ1.error);
  const trasRevisarJ = siguienteEdicion({
    modo: MODO_RECEPCION.CONTROL_FISICO,
    preservar: true,
    items: dJ1.items,
    previos: alAbrirJ.editItems,
  });
  igual("J · NO queda dirty fantasma", trasRevisarJ.dirty, false);
  igual(
    "J · y editItems refleja lo guardado, no la propuesta vieja",
    Number(trasRevisarJ.editItems.find((e) => e.id === detJ1.id)?.recibido),
    5
  );

  // 3.bis — LA CONTRAPRUEBA, EN LA MISMA CORRIDA. Si el escenario no generara
  // ninguna diferencia, el `false` de arriba no probaría nada: probaría que no
  // había nada que apagar. Genera una, de 6 contra 5, y lo que la apaga es el
  // modo.
  const enLotesJ = siguienteEdicion({
    modo: MODO_RECEPCION.EDITOR_LOTES,
    preservar: true,
    items: dJ1.items,
    previos: alAbrirJ.editItems,
  });
  igual("J · el escenario SÍ genera el fantasma en el editor por lotes", enLotesJ.dirty, true);

  // 4 — Se completa el resto del checklist y Confirmar LLEGA AL ENDPOINT.
  const detJ2 = await prisma.transferenciaDetalle.findFirst({
    where: { transferenciaId: tJ.id, productoId: pJ2.productoLocalId },
  });
  const revJ2 = await revisar({
    transferenciaId: tJ.id, detalleId: detJ2.id, recibido: 4, revisado: true,
  });
  ok("J · se revisa el segundo producto", revJ2.ok === true, revJ2.error);

  const confJ = await confirmar(tJ.id);
  ok("J · CONFIRMAR llega y responde ok", confJ.ok === true, confJ.error);

  const trasConfirmarJ = await prisma.transferencia.findUnique({ where: { id: tJ.id } });
  igual("J · la transferencia queda Recibida", trasConfirmarJ.estado, "Recibida");

  // Y el stock quedó como corresponde: 35 físicas del pack incompleto.
  const sJ1 = await stockDestinoDe(pJ1.baseId);
  igualStock("J · el destino recibió 35, no 36", sJ1.cantidad, 35);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("K. La card de no declarados y su filtro dicen lo mismo");
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Con datos reales del endpoint, porque el defecto dependía de que la
  // categoría del extra NO estuviera entre las del remito — y de dónde sale la
  // categoría de cada línea lo decide el DTO, no la pantalla.

  const catGolosinas = await prisma.categoria.create({ data: { nombre: `${marca}-Golosinas` } });
  const catLimpieza = await prisma.categoria.create({ data: { nombre: `${marca}-Limpieza` } });

  const pK1 = await armarProducto({ nombre: "k-golosina", stockOrigen: 50 });
  const pK2 = await armarProducto({ nombre: "k-limpieza", stockOrigen: 50 });
  // La columna es `categoria_id` en `ProductoBase`. Se escribe con el nombre que
  // tiene en el esquema y no con el que uno supone: `categoriaId` no existe y
  // Prisma lo rechaza con un "Unknown argument" que apunta a otro lado.
  // El código de barras se pone acá porque el fixture del POS no lo trae, y la
  // sección L lo necesita: sin código, "escanear" no es un escenario, es un
  // campo vacío. Con `null` la prueba habría pasado por el camino equivocado.
  const CODIGO_K1 = "7790001234567";
  await prisma.productoBase.update({
    where: { id: pK1.baseId },
    data: { categoria_id: catGolosinas.id, codigo_barra: CODIGO_K1 },
  });
  await prisma.productoBase.update({
    where: { id: pK2.baseId }, data: { categoria_id: catLimpieza.id },
  });

  const tK = await armarTransferencia([{ producto: pK1, cantidad: 5 }]);
  const agK = await agregarLinea({
    transferenciaId: tK.id, productoLocalId: pK2.productoLocalId,
    unidadEnviada: "UNIDAD", recibido: 2,
  });
  ok("K · se informa el producto no declarado", agK.ok === true, agK.error);

  const dK = await detalleDe(tK.id);
  ok("K · el detalle contesta", dK.ok === true, dK.error);

  const catsK = categoriasDelRemito(dK.items);
  ok(
    "K · las categorías del remito NO incluyen la del extra",
    !catsK.some((c) => c.nombre === catLimpieza.nombre),
    catsK.map((c) => c.nombre).join(", ")
  );
  const idGolosinasK = catsK[0]?.id;
  ok("K · y sí la del remito", catsK.length === 1, catsK.map((c) => c.nombre).join(", "));

  const resumenK = resumenDeRecepcion(dK.items);
  igual("K · la card dice 1 no declarado", resumenK.noDeclarados, 1);

  const visiblesK = productosVisibles(dK.items, {
    filtro: FILTRO.NO_DECLARADOS,
    categoriaId: idGolosinasK,
  });
  igual("K · y con el chip del remito activo la lista muestra 1, no 0", visiblesK.length, 1);
  ok(
    "K · y es el extra de la otra categoría",
    String(visiblesK[0]?.nombre || "").includes("k-limpieza") &&
      visiblesK[0]?.categoria?.nombre === catLimpieza.nombre,
    `${visiblesK[0]?.nombre} / ${visiblesK[0]?.categoria?.nombre}`
  );

  // ═════════════════════════════════════════════════════════════════════════
  seccion("L. Enter con datos reales: código, un nombre, varios nombres, ninguno");
  // ═════════════════════════════════════════════════════════════════════════

  const dL = await detalleDe(tK.id);
  const lineaK1 = dL.items.find((d) => !d.agregadoEnRecepcion);
  igual("L · el DTO trae el código de barras", lineaK1.codigoBarra, CODIGO_K1);

  const porCodigoL = resolverEntrada(dL.items, lineaK1.codigoBarra);
  igual("L · un código exacto abre el producto", porCodigoL.tipo, RESOLUCION.ABRIR);
  igual("L · y se marca como código, así el campo se limpia", porCodigoL.porCodigo, true);

  // Un solo producto del remito coincide por nombre: se abre.
  const unicoL = resolverEntrada(dL.items, "k-golosina");
  igual("L · una sola coincidencia por nombre abre", unicoL.tipo, RESOLUCION.ABRIR);
  igual("L · y NO se marca como código: el texto buscado no se borra", unicoL.porCodigo, false);

  // Varios: el prefijo que comparten los dos productos del fixture.
  const variosL = resolverEntrada(dL.items, marca);
  igual("L · con varias coincidencias queda la lista", variosL.tipo, RESOLUCION.LISTA);
  ok("L · y son las dos", variosL.resultados.length === 2, String(variosL.resultados.length));

  const ningunoL = resolverEntrada(dL.items, "xyz-que-no-existe");
  igual("L · sin coincidencias, recién ahí no figura", ningunoL.tipo, RESOLUCION.NO_FIGURA);

  // Y la cámara no cae por nombre.
  const camaraL = resolverEntrada(dL.items, "k-golosina", { soloCodigo: true });
  igual("L · la cámara no resuelve por nombre", camaraL.tipo, RESOLUCION.NO_FIGURA);

  // ═════════════════════════════════════════════════════════════════════════
  seccion("20. La recepción sigue siendo solo de inventario");
  // ═════════════════════════════════════════════════════════════════════════

  igual("no se creó ninguna Venta", await prisma.venta.count({ where: { localId: { in: [origen.id, destino.id] } } }), 0);
  igual("ni ningún VentaPago", await prisma.ventaPago.count({ where: { venta: { localId: { in: [origen.id, destino.id] } } } }), 0);
  // `CajaMovimiento` no tiene `localId`: cuelga del TURNO. Se pregunta por ahí,
  // que es donde vive la relación, en vez de inventarle una columna.
  igual("ni movimientos de caja",
    await prisma.cajaMovimiento.count({ where: { turno: { localId: { in: [origen.id, destino.id] } } } }), 0);
  igual("ni turnos", await prisma.turno.count({ where: { localId: { in: [origen.id, destino.id] } } }), 0);
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
