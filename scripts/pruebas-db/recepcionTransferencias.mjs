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
const token = (usuarioId, localId, grupoId, permisos = ["*"]) =>
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
const leer = async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) });

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
  ok("se confirma la transferencia con la línea agregada", (await confirmar(tf.id)).ok === true);

  const soFanta = await stockDe(origen.id, pFanta.productoLocalId);
  const sdFanta = await stockDestinoDe(pFanta.baseId);
  igualStock("Fanta: origen -6", soFanta.cantidad, 94);
  igualStock("Fanta: el TRÁNSITO del origen no se tocó", soFanta.enTransito, transitoFantaAntes);
  igualStock("Fanta: destino +6", sdFanta.cantidad, 6);
  igualStock("Coca: la línea original se recibió completa", (await stockDestinoDe(pCoca.baseId)).cantidad, 10);

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
    transferenciaId: tSeg.id, productoLocalId: pAjeno.productoLocalId,
  });
  igual("un producto de otro origen se rechaza", conAjeno.status, 404);
  igual("y se dice por qué", conAjeno.codigo, "PRODUCTO_FUERA_DEL_ORIGEN");

  const desdeOrigen = await agregarLinea(
    { transferenciaId: tSeg.id, productoLocalId: pOtro.productoLocalId }, sesionOrigen
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
    transferenciaId: tSeg.id, productoLocalId: pOtro.productoLocalId,
  });
  ok("agregar un producto que YA está en el remito no falla", yaEsta.ok === true, yaEsta.error);
  igual("avisa que ya existía", yaEsta.yaExistia, true);
  igual("no se creó una segunda línea",
    await prisma.transferenciaDetalle.count({ where: { transferenciaId: tSeg.id, productoId: pOtro.productoLocalId } }), 1);

  const pBorrar = await armarProducto({ nombre: `borrar-${n++}` });
  const extra = await agregarLinea({ transferenciaId: tSeg.id, productoLocalId: pBorrar.productoLocalId });
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
  ok("primera confirmación", (await confirmar(tSeg.id)).ok === true);

  const segunda = await confirmar(tSeg.id);
  igual("la SEGUNDA confirmación se rechaza", segunda.status, 400);
  ok("con el mensaje de ya confirmada", /ya fue confirmada/i.test(segunda.error || ""), segunda.error);

  igual("una transferencia Recibida no admite guardar", (await guardar(tSeg.id, [])).status, 400);
  igual("ni agregar líneas",
    (await agregarLinea({ transferenciaId: tSeg.id, productoLocalId: pBorrar.productoLocalId })).status, 400);

  const tCancel = await armarTransferencia([{ producto: pOtro, cantidad: 1 }]);
  await prisma.transferencia.update({ where: { id: tCancel.id }, data: { estado: "Cancelada" } });
  igual("una Cancelada no admite guardar", (await guardar(tCancel.id, [])).status, 400);
  igual("ni agregar líneas",
    (await agregarLinea({ transferenciaId: tCancel.id, productoLocalId: pBorrar.productoLocalId })).status, 400);
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
  seccion("20. La recepción sigue siendo solo de inventario");
  // ═════════════════════════════════════════════════════════════════════════

  igual("no se creó ninguna Venta", await prisma.venta.count({ where: { localId: { in: [origen.id, destino.id] } } }), 0);
  igual("ni ningún VentaPago", await prisma.ventaPago.count({ where: { venta: { localId: { in: [origen.id, destino.id] } } } }), 0);
  igual("ni movimientos de caja", await prisma.cajaMovimiento.count({ where: { localId: { in: [origen.id, destino.id] } } }), 0);
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
