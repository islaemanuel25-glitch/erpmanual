// scripts/integracion-aplicacion-listas.mjs
//
// Prueba de INTEGRACIÓN REAL de la selección y la aplicación de costos, contra
// PostgreSQL. Importa los handlers de verdad y los ejecuta con sesiones firmadas.
//
// Es la parte del módulo que escribe dinero, así que lo que se persigue es todo
// lo que puede salir mal escribiendo dinero: que no se aplique lo que no estaba
// seleccionado, que "BU" no se multiplique dos veces, que un override cargado a
// mano no se pise, que una lista no se aplique dos veces, y que las filas que
// dejaron de ser válidas se omitan CON MOTIVO en vez de escribirse igual.
//
// Uso:
//   DATABASE_URL=<base descartable> AUTH_SECRET=<secreto> \
//   node --import ./scripts/alias-loader.mjs scripts/integracion-aplicacion-listas.mjs

import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import XLSX from "xlsx";

const prisma = new PrismaClient();
const SUFIJO = `apl-${Date.now().toString(36)}`;

let ok = 0;
let fallos = 0;
const pendientes = [];

function chequear(nombre, condicion, extra = "") {
  if (condicion) {
    ok++;
    console.log(`  OK    ${nombre}${extra ? " — " + extra : ""}`);
  } else {
    fallos++;
    pendientes.push(nombre);
    console.log(`  FALLA ${nombre}${extra ? " — " + extra : ""}`);
  }
}

let GRUPO_ID = null;

function cookieDe(usuario, localId, permisos = ["*"], grupoId = null) {
  return `erpazul_sesion=${jwt.sign(
    {
      id: usuario.id, email: usuario.email, nombre: usuario.nombre, rolId: usuario.rolId,
      permisos, localId, grupoId: grupoId ?? GRUPO_ID,
    },
    process.env.AUTH_SECRET,
    { expiresIn: 3600 }
  )}`;
}

function pedido(url, cookie, body) {
  const req = new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
}

function pedidoUpload(url, cookie, { bytes, nombre, proveedorId }) {
  const fd = new FormData();
  fd.append("archivo", new File([bytes], nombre, { type: "application/octet-stream" }), nombre);
  fd.append("proveedorId", String(proveedorId));
  const req = new Request(url, { method: "POST", headers: { cookie }, body: fd });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
}

const json = (res) => res.json();
const ctxId = (id) => ({ params: Promise.resolve({ id: String(id) }) });

function libroArcor(filas) {
  const aoa = [["Producto", "Descripción", "U.M.", "UxBU", "Precio S/IVA", "Precio C/IVA"], ...filas];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Hoja1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

async function main() {
  console.log(`\n=== INTEGRACIÓN: APLICACIÓN DE COSTOS (${SUFIJO}) ===\n`);

  const { POST: importar } = await import("../app/api/proveedores/listas/importar/route.js");
  const { GET: detalle } = await import("../app/api/proveedores/listas/[id]/route.js");
  const { POST: seleccion } = await import("../app/api/proveedores/listas/[id]/seleccion/route.js");
  const { POST: aplicar } = await import("../app/api/proveedores/listas/[id]/aplicar/route.js");

  const BASE = "http://localhost/api/proveedores/listas";

  // ── Escenario ────────────────────────────────────────────────────────────
  const grupo = await prisma.grupo.create({ data: { nombre: `Grupo ${SUFIJO}` } });
  GRUPO_ID = grupo.id;
  const rol = await prisma.rol.create({ data: { nombre: `Rol ${SUFIJO}`, permisos: ["*"] } });
  const rolBasico = await prisma.rol.create({ data: { nombre: `Basico ${SUFIJO}`, permisos: ["pos.usar"] } });
  const dep = await prisma.local.create({ data: { nombre: `Dep ${SUFIJO}`, tipo: "deposito", es_deposito: true } });
  const local2 = await prisma.local.create({ data: { nombre: `Local ${SUFIJO}`, tipo: "local", es_deposito: false } });
  await prisma.grupoLocal.createMany({
    data: [{ grupoId: grupo.id, localId: dep.id }, { grupoId: grupo.id, localId: local2.id }],
  });
  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: dep.id } });
  await prisma.configuracionLocal.create({ data: { localId: dep.id, exigirOperador: false } });
  await prisma.configuracionLocal.create({ data: { localId: local2.id, exigirOperador: false } });

  const mk = (n, e, r = rol.id) => prisma.usuario.create({
    data: { nombre: `${n} ${SUFIJO}`, email: `${e}-${SUFIJO}@test.local`, passwordHash: "x", rolId: r, localId: dep.id },
  });
  const admin = await mk("Admin", "admin");
  const cajero = await mk("Cajero", "cajero", rolBasico.id);
  const A = cookieDe(admin, dep.id, ["*"]);
  const SIN_PERMISO = cookieDe(cajero, dep.id, ["pos.usar"]);
  const OTRA_UBICACION = cookieDe(admin, local2.id, ["*"]);

  const cat = await prisma.categoria.create({ data: { nombre: `Cat ${SUFIJO}` } });
  const arcor = await prisma.proveedor.create({
    data: { nombre: `Arcor ${SUFIJO}`, creadoEnLocalId: dep.id, parserListaId: "ARCOR_XLSX" },
  });

  const crear = async (nombre, extra = {}, codigoProveedor = null) => {
    const p = await prisma.productoBase.create({
      data: {
        grupoId: grupo.id, creadoEnLocalId: dep.id, nombre, categoria_id: cat.id,
        unidad_medida: "unidad", precio_costo: 1000, precio_venta: 1300, margen: 30, redondeo_100: false,
        proveedor_id: arcor.id, ...extra,
      },
    });
    if (codigoProveedor) {
      await prisma.productoCodigoProveedor.create({
        data: { grupoId: grupo.id, proveedorId: arcor.id, productoBaseId: p.id, codigoInterno: codigoProveedor, activo: true },
      });
    }
    return p;
  };

  // UN sobre unidad suelta: 100 × 1,05 = 105.
  const pUN = await crear(`UN ${SUFIJO}`, { precio_costo: 50, precio_venta: 65 }, "2001");
  // UN sobre pack de 12: 100 × 1,05 × 12 = 1260.
  const pPack = await crear(`Pack ${SUFIJO}`, { unidad_medida: "pack", factor_pack: 12, precio_costo: 1000, precio_venta: 1300 }, "2002");
  // BU sobre pack de 12: 1200 × 1,05 = 1260, SIN multiplicar por 12.
  const pBu = await crear(`Bulto ${SUFIJO}`, { unidad_medida: "pack", factor_pack: 6, precio_costo: 900, precio_venta: 1170 }, "2003");
  // DI: nunca aplicable.
  const pDi = await crear(`Display ${SUFIJO}`, { unidad_medida: "pack", factor_pack: 10 }, "2004");
  // kg: bloqueado.
  const pKg = await crear(`Kg ${SUFIJO}`, { unidad_medida: "kg" }, "2005");
  // Fiambre: bloqueado.
  const pFiambre = await crear(`Fiambre ${SUFIJO}`, { modoCompraProveedor: "UNIDAD" }, "2006");
  // Precio casi cero.
  const pBarato = await crear(`Barato ${SUFIJO}`, {}, "2007");
  // Sin margen: la venta NO se recalcula.
  const pSinMargen = await crear(`Sin margen ${SUFIJO}`, { margen: null, precio_costo: 50, precio_venta: 999 }, "2008");
  // Con redondeo comercial: 105 × 1,30 = 136,5 → 200, nunca 100.
  const pRedondeo = await crear(`Redondeo ${SUFIJO}`, { redondeo_100: true, precio_costo: 50, precio_venta: 100 }, "2010");
  // El que se queda sin seleccionar: no se puede mover ni un centavo.
  const pNoSelecc = await crear(`No seleccionado ${SUFIJO}`, { precio_costo: 50, precio_venta: 65 }, "2009");

  // Overrides por ubicación: uno que arrastra el maestro y otro cargado a mano.
  const ovArrastra = await prisma.productoLocal.create({
    data: { localId: local2.id, baseId: pUN.id, precio_costo: 50, precio_venta: 65 },
  });
  const ovManual = await prisma.productoLocal.create({
    data: { localId: local2.id, baseId: pPack.id, precio_costo: 777, precio_venta: 888 },
  });

  const bytes = libroArcor([
    [2001, "UNIDAD SUELTA", "UN", 1, 82, 100],
    [2002, "PACK DE 12", "UN", 12, 82, 100],
    [2003, "BULTO ENTERO", "BU", 1, 990, 1200],
    [2004, "DISPLAY", "DI", 6, 82, 100],
    [2005, "POR KILO", "UN", 1, 82, 100],
    [2006, "FIAMBRE", "UN", 1, 82, 100],
    [2007, "CASI CERO", "UN", 1, 0.4, 0.5],
    [2008, "SIN MARGEN", "UN", 1, 82, 100],
    [2009, "NO SELECCIONADO", "UN", 1, 82, 100],
    [2010, "CON REDONDEO", "UN", 1, 82, 100],
  ]);

  const imp = await json(await importar(pedidoUpload(`${BASE}/importar`, A, {
    bytes, nombre: "aplicar.xlsx", proveedorId: arcor.id,
  })));
  chequear("1. la importación entra", imp.ok === true, imp.error || "");
  const IMP = imp.importacionId;

  const filaDe = (codigo) =>
    prisma.importacionListaFila.findFirst({ where: { importacionId: IMP, codigoNormalizado: codigo } });

  const fUN = await filaDe("2001");
  const fPack = await filaDe("2002");
  const fBu = await filaDe("2003");
  const fDi = await filaDe("2004");
  const fKg = await filaDe("2005");
  const fFiambre = await filaDe("2006");
  const fBarato = await filaDe("2007");
  const fSinMargen = await filaDe("2008");
  const fNoSelecc = await filaDe("2009");
  const fRedondeo = await filaDe("2010");

  chequear("2. UN queda LISTO_PARA_ACTUALIZAR", fUN.estado === "LISTO_PARA_ACTUALIZAR", fUN.estado);
  chequear("3. el pack de 12 queda LISTO", fPack.estado === "LISTO_PARA_ACTUALIZAR", fPack.estado);
  chequear("4. BU queda LISTO", fBu.estado === "LISTO_PARA_ACTUALIZAR", fBu.estado);
  chequear("5. DI NO queda listo", fDi.estado !== "LISTO_PARA_ACTUALIZAR", fDi.estado);
  chequear("6. kg queda BLOQUEADO", fKg.estado === "BLOQUEADO", fKg.estado);
  chequear("7. fiambre queda BLOQUEADO", fFiambre.estado === "BLOQUEADO", fFiambre.estado);
  chequear("8. el precio casi cero queda BLOQUEADO", fBarato.estado === "BLOQUEADO", fBarato.estado);

  chequear("9. BU propone el bulto sin volver a multiplicar",
    num(fBu.costoMaestroPropuesto) === 1260, String(num(fBu.costoMaestroPropuesto)));
  chequear("10. el pack de 12 sí multiplica por el factor",
    num(fPack.costoMaestroPropuesto) === 1260, String(num(fPack.costoMaestroPropuesto)));
  chequear("11. la unidad suelta no multiplica",
    num(fUN.costoMaestroPropuesto) === 105, String(num(fUN.costoMaestroPropuesto)));

  // ── Selección ────────────────────────────────────────────────────────────
  const selDi = await json(await seleccion(pedido(`${BASE}/${IMP}/seleccion`, A, {
    accion: "MARCAR", ids: [fDi.id],
  }), ctxId(IMP)));
  chequear("12. el backend rechaza seleccionar una fila DI", selDi.ok === false, selDi.error || "");

  const selKg = await json(await seleccion(pedido(`${BASE}/${IMP}/seleccion`, A, {
    accion: "MARCAR", ids: [fKg.id],
  }), ctxId(IMP)));
  chequear("13. el backend rechaza seleccionar una fila kg", selKg.ok === false);

  const selSinPermiso = await seleccion(pedido(`${BASE}/${IMP}/seleccion`, SIN_PERMISO, {
    accion: "TODOS",
  }), ctxId(IMP));
  chequear("14. sin permiso no se puede seleccionar", selSinPermiso.status === 403, String(selSinPermiso.status));

  const selTodos = await json(await seleccion(pedido(`${BASE}/${IMP}/seleccion`, A, { accion: "TODOS" }), ctxId(IMP)));
  chequear("15. 'todos' marca solo los listos",
    selTodos.ok === true && selTodos.resumen.seleccionadas === selTodos.resumen.seleccionables,
    `${selTodos.resumen?.seleccionadas}/${selTodos.resumen?.seleccionables}`);
  chequear("16. los seleccionables son exactamente los 6 listos",
    selTodos.resumen.seleccionables === 6, String(selTodos.resumen?.seleccionables));

  // Se desmarca el que tiene que quedar afuera.
  const selQuitar = await json(await seleccion(pedido(`${BASE}/${IMP}/seleccion`, A, {
    accion: "DESMARCAR", ids: [fNoSelecc.id],
  }), ctxId(IMP)));
  chequear("17. desmarcar deja 5 seleccionadas", selQuitar.resumen.seleccionadas === 5,
    String(selQuitar.resumen?.seleccionadas));

  const ninguno = await json(await seleccion(pedido(`${BASE}/${IMP}/seleccion`, A, { accion: "NINGUNO" }), ctxId(IMP)));
  chequear("18. 'ninguno' deja la selección en cero", ninguno.resumen.seleccionadas === 0);

  // Se rearma la selección real de la prueba.
  await seleccion(pedido(`${BASE}/${IMP}/seleccion`, A, {
    accion: "MARCAR", ids: [fUN.id, fPack.id, fBu.id, fSinMargen.id, fRedondeo.id],
  }), ctxId(IMP));

  const det = await json(await detalle(pedido(`${BASE}/${IMP}`, A), ctxId(IMP)));
  chequear("19. el detalle informa el resumen de selección", det.seleccion?.seleccionadas === 5,
    String(det.seleccion?.seleccionadas));

  // ── Aplicación desde otra ubicación ──────────────────────────────────────
  const otraUb = await aplicar(pedido(`${BASE}/${IMP}/aplicar`, OTRA_UBICACION, {
    modoPrecioVenta: "RECALCULAR_POR_MARGEN",
  }), ctxId(IMP));
  chequear("20. no se puede aplicar desde otra ubicación", otraUb.status === 409, String(otraUb.status));

  const sinPermisoAplicar = await aplicar(pedido(`${BASE}/${IMP}/aplicar`, SIN_PERMISO, {}), ctxId(IMP));
  chequear("21. sin permiso no se puede aplicar", sinPermisoAplicar.status === 403, String(sinPermisoAplicar.status));

  const modoMalo = await aplicar(pedido(`${BASE}/${IMP}/aplicar`, A, { modoPrecioVenta: "REGALAR_TODO" }), ctxId(IMP));
  chequear("22. un modo de venta inventado se rechaza", modoMalo.status === 400, String(modoMalo.status));

  // ── La aplicación de verdad ──────────────────────────────────────────────
  const antesNoSelecc = await prisma.productoBase.findUnique({ where: { id: pNoSelecc.id } });
  const antesDi = await prisma.productoBase.findUnique({ where: { id: pDi.id } });

  const t0 = Date.now();
  const res = await json(await aplicar(pedido(`${BASE}/${IMP}/aplicar`, A, {
    modoPrecioVenta: "RECALCULAR_POR_MARGEN",
  }), ctxId(IMP)));
  const ms = Date.now() - t0;
  chequear("23. la aplicación responde ok", res.ok === true, res.error || "");
  chequear("24. se aplicaron las 5 seleccionadas", res.resumen?.aplicadas === 5, String(res.resumen?.aplicadas));
  console.log(`        (la transacción tardó ${ms} ms para 5 filas)`);

  const dUN = await prisma.productoBase.findUnique({ where: { id: pUN.id } });
  const dPack = await prisma.productoBase.findUnique({ where: { id: pPack.id } });
  const dBu = await prisma.productoBase.findUnique({ where: { id: pBu.id } });
  const dSinMargen = await prisma.productoBase.findUnique({ where: { id: pSinMargen.id } });

  chequear("25. UN escribió el costo con el 5 % de recargo", num(dUN.precio_costo) === 105, String(num(dUN.precio_costo)));
  chequear("26. el pack multiplicó por 12", num(dPack.precio_costo) === 1260, String(num(dPack.precio_costo)));
  chequear("27. BU NO se multiplicó por el factor", num(dBu.precio_costo) === 1260, String(num(dBu.precio_costo)));

  chequear("28. la venta se recalculó por margen en UN", num(dUN.precio_venta) === 136.5, String(num(dUN.precio_venta)));
  const dRedondeo = await prisma.productoBase.findUnique({ where: { id: pRedondeo.id } });
  chequear("28b. con redondeo a 100 la venta sube, nunca baja", num(dRedondeo.precio_venta) === 200, String(num(dRedondeo.precio_venta)));
  chequear("29. la venta se recalculó en el pack", num(dPack.precio_venta) === 1638, String(num(dPack.precio_venta)));
  chequear("30. sin margen la venta NO se toca", num(dSinMargen.precio_venta) === 999, String(num(dSinMargen.precio_venta)));
  chequear("31. sin margen el costo SÍ se actualiza", num(dSinMargen.precio_costo) === 105, String(num(dSinMargen.precio_costo)));

  // ── Overrides ────────────────────────────────────────────────────────────
  const dOvArrastra = await prisma.productoLocal.findUnique({ where: { id: ovArrastra.id } });
  const dOvManual = await prisma.productoLocal.findUnique({ where: { id: ovManual.id } });
  chequear("32. el override que arrastraba el maestro se actualizó",
    num(dOvArrastra.precio_costo) === 105, String(num(dOvArrastra.precio_costo)));
  chequear("33. el override cargado a mano NO se pisó",
    num(dOvManual.precio_costo) === 777, String(num(dOvManual.precio_costo)));
  chequear("34. tampoco se le tocó la venta al override manual",
    num(dOvManual.precio_venta) === 888, String(num(dOvManual.precio_venta)));

  // ── Lo que NO estaba seleccionado ────────────────────────────────────────
  const dNoSelecc = await prisma.productoBase.findUnique({ where: { id: pNoSelecc.id } });
  const dDi = await prisma.productoBase.findUnique({ where: { id: pDi.id } });
  chequear("35. el producto no seleccionado no se movió",
    num(dNoSelecc.precio_costo) === num(antesNoSelecc.precio_costo) &&
    num(dNoSelecc.precio_venta) === num(antesNoSelecc.precio_venta));
  chequear("36. el producto de la fila DI no se movió",
    num(dDi.precio_costo) === num(antesDi.precio_costo));

  const dKg = await prisma.productoBase.findUnique({ where: { id: pKg.id } });
  chequear("37. el producto por kilo no se movió", num(dKg.precio_costo) === 1000, String(num(dKg.precio_costo)));

  // ── Historial ────────────────────────────────────────────────────────────
  const hUN = await prisma.importacionListaFila.findUnique({ where: { id: fUN.id } });
  chequear("38. la fila guarda el costo anterior", num(hUN.costoPrevioAplicacion) === 50, String(num(hUN.costoPrevioAplicacion)));
  chequear("39. la fila guarda el costo nuevo", num(hUN.costoAplicado) === 105, String(num(hUN.costoAplicado)));
  chequear("40. la fila guarda la venta anterior", num(hUN.ventaAnterior) === 65, String(num(hUN.ventaAnterior)));
  chequear("41. la fila guarda la venta nueva", num(hUN.ventaNueva) === 136.5, String(num(hUN.ventaNueva)));
  chequear("42. la fila guarda el usuario", hUN.aplicadaPorUsuarioId === admin.id, String(hUN.aplicadaPorUsuarioId));
  chequear("43. la fila guarda la fecha", hUN.aplicadaEn instanceof Date);
  chequear("44. la fila queda marcada como aplicada", hUN.aplicada === true);
  chequear("45. el resultado dice APLICADA", hUN.resultadoAplicacion === "APLICADA", hUN.resultadoAplicacion);

  const hNoSelecc = await prisma.importacionListaFila.findUnique({ where: { id: fNoSelecc.id } });
  chequear("46. la fila no seleccionada NO tiene resultado", hNoSelecc.resultadoAplicacion === null);
  chequear("47. la fila no seleccionada NO quedó aplicada", hNoSelecc.aplicada === false);

  const cab = await prisma.importacionListaProveedor.findUnique({ where: { id: IMP } });
  chequear("48. la cabecera pasó a APLICADA", cab.estado === "APLICADA", cab.estado);
  chequear("49. la cabecera cuenta las aplicadas", cab.aplicadas === 5, String(cab.aplicadas));
  chequear("50. la cabecera guarda el usuario", cab.aplicadaPorUsuarioId === admin.id);
  chequear("51. la cabecera guarda el modo de venta",
    cab.modoPrecioVenta === "RECALCULAR_POR_MARGEN", cab.modoPrecioVenta);

  // ── Idempotencia ─────────────────────────────────────────────────────────
  const costosTrasPrimera = await prisma.productoBase.findMany({
    where: { grupoId: grupo.id }, select: { id: true, precio_costo: true, precio_venta: true }, orderBy: { id: "asc" },
  });

  const segunda = await json(await aplicar(pedido(`${BASE}/${IMP}/aplicar`, A, {
    modoPrecioVenta: "RECALCULAR_POR_MARGEN",
  }), ctxId(IMP)));
  chequear("52. la segunda aplicación responde ok sin error", segunda.ok === true, segunda.error || "");
  chequear("53. la segunda aplicación avisa que ya estaba aplicada", segunda.yaAplicada === true);
  chequear("54. la segunda aplicación devuelve el resultado anterior",
    Array.isArray(segunda.detalle) && segunda.detalle.length > 0, String(segunda.detalle?.length));

  const costosTrasSegunda = await prisma.productoBase.findMany({
    where: { grupoId: grupo.id }, select: { id: true, precio_costo: true, precio_venta: true }, orderBy: { id: "asc" },
  });
  chequear("55. la segunda aplicación NO tocó ningún costo",
    JSON.stringify(costosTrasPrimera) === JSON.stringify(costosTrasSegunda));

  // Un tercer intento, para que "reintento" no sea una sola vez.
  await aplicar(pedido(`${BASE}/${IMP}/aplicar`, A, {}), ctxId(IMP));
  const costosTrasTercera = await prisma.productoBase.findMany({
    where: { grupoId: grupo.id }, select: { id: true, precio_costo: true, precio_venta: true }, orderBy: { id: "asc" },
  });
  chequear("56. reintentar una tercera vez tampoco mueve nada",
    JSON.stringify(costosTrasPrimera) === JSON.stringify(costosTrasTercera));

  const selTrasAplicar = await json(await seleccion(pedido(`${BASE}/${IMP}/seleccion`, A, { accion: "TODOS" }), ctxId(IMP)));
  chequear("57. sobre una importación aplicada no queda nada seleccionable",
    selTrasAplicar.resumen.seleccionables === 0, String(selTrasAplicar.resumen?.seleccionables));

  // ── Segunda importación: filas que cambiaron desde la conciliación ───────
  console.log("\n  — filas que dejan de ser válidas —");

  const pCambia = await crear(`Cambia ${SUFIJO}`, { precio_costo: 200, precio_venta: 260 }, "3001");
  const pPierde = await crear(`Pierde ${SUFIJO}`, { precio_costo: 200, precio_venta: 260 }, "3002");
  const pMuta = await crear(`Muta ${SUFIJO}`, { unidad_medida: "pack", factor_pack: 12, precio_costo: 200 }, "3003");
  const pEstable = await crear(`Estable ${SUFIJO}`, { precio_costo: 200, precio_venta: 260 }, "3004");

  const bytes2 = libroArcor([
    [3001, "CAMBIA EL COSTO", "UN", 1, 82, 100],
    [3002, "PIERDE PROPIEDAD", "UN", 1, 82, 100],
    [3003, "MUTA A FIAMBRE", "UN", 12, 82, 100],
    [3004, "ESTABLE", "UN", 1, 82, 100],
  ]);
  const imp2 = await json(await importar(pedidoUpload(`${BASE}/importar`, A, {
    bytes: bytes2, nombre: "cambios.xlsx", proveedorId: arcor.id,
  })));
  const IMP2 = imp2.importacionId;
  chequear("58. la segunda importación entra", imp2.ok === true, imp2.error || "");

  await seleccion(pedido(`${BASE}/${IMP2}/seleccion`, A, { accion: "TODOS" }), ctxId(IMP2));

  // Ahora se rompe el mundo DESPUÉS de conciliar.
  await prisma.productoBase.update({ where: { id: pCambia.id }, data: { precio_costo: 333 } });
  await prisma.productoBase.update({ where: { id: pPierde.id }, data: { creadoEnLocalId: local2.id } });
  await prisma.productoBase.update({ where: { id: pMuta.id }, data: { modoCompraProveedor: "UNIDAD" } });

  const res2 = await json(await aplicar(pedido(`${BASE}/${IMP2}/aplicar`, A, {
    modoPrecioVenta: "MANTENER_VENTA",
  }), ctxId(IMP2)));
  chequear("59. la segunda corrida responde ok", res2.ok === true, res2.error || "");
  chequear("60. solo se aplicó la fila estable", res2.resumen?.aplicadas === 1, String(res2.resumen?.aplicadas));
  chequear("61. se omitieron las otras tres", res2.resumen?.omitidas === 3, String(res2.resumen?.omitidas));

  const porCodigo = Object.fromEntries(res2.detalle.map((d) => [d.codigo, d]));
  chequear("62. el costo que cambió se omite con su motivo",
    porCodigo["3001"]?.motivo === "COSTO_CAMBIO_DESDE_CONCILIACION", porCodigo["3001"]?.motivo);
  chequear("63. la propiedad perdida se omite con su motivo",
    porCodigo["3002"]?.motivo === "PROPIEDAD_PERDIDA", porCodigo["3002"]?.motivo);
  chequear("64. el producto que mutó a fiambre se omite",
    porCodigo["3003"]?.motivo === "UNIDAD_INCOMPATIBLE", porCodigo["3003"]?.motivo);

  const dCambia = await prisma.productoBase.findUnique({ where: { id: pCambia.id } });
  const dPierde = await prisma.productoBase.findUnique({ where: { id: pPierde.id } });
  const dMuta = await prisma.productoBase.findUnique({ where: { id: pMuta.id } });
  const dEstable = await prisma.productoBase.findUnique({ where: { id: pEstable.id } });
  chequear("65. el costo que había cambiado NO se pisó", num(dCambia.precio_costo) === 333, String(num(dCambia.precio_costo)));
  chequear("66. el producto sin propiedad NO se tocó", num(dPierde.precio_costo) === 200);
  chequear("67. el producto que mutó NO se tocó", num(dMuta.precio_costo) === 200);
  chequear("68. la fila estable SÍ se aplicó", num(dEstable.precio_costo) === 105, String(num(dEstable.precio_costo)));
  chequear("69. con MANTENER_VENTA la venta no se movió",
    num(dEstable.precio_venta) === 260, String(num(dEstable.precio_venta)));

  const hOmitida = await prisma.importacionListaFila.findFirst({
    where: { importacionId: IMP2, codigoNormalizado: "3001" },
  });
  chequear("70. la fila omitida guarda el motivo",
    hOmitida.resultadoAplicacion === "OMITIDA" && hOmitida.motivoAplicacion === "COSTO_CAMBIO_DESDE_CONCILIACION");
  chequear("71. la fila omitida NO queda marcada como aplicada", hOmitida.aplicada === false);

  const cab2 = await prisma.importacionListaProveedor.findUnique({ where: { id: IMP2 } });
  chequear("72. la cabecera cuenta 1 aplicada y 3 omitidas",
    cab2.aplicadas === 1 && cab2.omitidas === 3, `${cab2.aplicadas}/${cab2.omitidas}`);

  // ── Rollback ante error técnico ──────────────────────────────────────────
  //
  // Se provoca un error REAL de escritura, no simulado: la segunda fila propone
  // un costo que entra en Decimal(12,2) pero cuya venta recalculada (costo × 1,30)
  // se desborda. El costo de la PRIMERA fila ya se escribió cuando explota la
  // segunda: si el rollback funciona, tiene que volver a su valor original.
  console.log("\n  — rollback ante error técnico —");

  const pRb1 = await crear(`Rollback1 ${SUFIJO}`, { precio_costo: 200, precio_venta: 260 }, "5001");
  // Costo anterior alto a propósito: con 200 la variación porcentual de la fila
  // no entraría en Decimal(12,4) y fallaría la IMPORTACIÓN, antes de llegar a la
  // escritura que se quiere provocar.
  const pRb2 = await crear(`Rollback2 ${SUFIJO}`, { precio_costo: 20000000, precio_venta: 26000000 }, "5002");

  // 8.571.428.571,43 × 1,05 = 9.000.000.000 → entra en Decimal(12,2).
  // 9.000.000.000 × 1,30 = 11.700.000.000 → NO entra: la venta desborda.
  const bytes4 = libroArcor([
    [5001, "NORMAL", "UN", 1, 82, 100],
    [5002, "DESBORDA LA VENTA", "UN", 1, 1, 8571428571.43],
  ]);
  const imp4 = await json(await importar(pedidoUpload(`${BASE}/importar`, A, {
    bytes: bytes4, nombre: "rollback.xlsx", proveedorId: arcor.id,
  })));
  const IMP4 = imp4.importacionId;
  chequear("73. la importación del rollback entra", imp4.ok === true, imp4.error || "");

  const selRb = await json(await seleccion(pedido(`${BASE}/${IMP4}/seleccion`, A, { accion: "TODOS" }), ctxId(IMP4)));
  chequear("74. las dos filas del rollback quedan seleccionadas",
    selRb.resumen?.seleccionadas === 2, String(selRb.resumen?.seleccionadas));

  const res4 = await aplicar(pedido(`${BASE}/${IMP4}/aplicar`, A, {
    modoPrecioVenta: "RECALCULAR_POR_MARGEN",
  }), ctxId(IMP4));
  const j4 = await res4.json();

  const dRb1 = await prisma.productoBase.findUnique({ where: { id: pRb1.id } });
  const dRb2 = await prisma.productoBase.findUnique({ where: { id: pRb2.id } });
  const cab4 = await prisma.importacionListaProveedor.findUnique({ where: { id: IMP4 } });
  const filasRb = await prisma.importacionListaFila.findMany({ where: { importacionId: IMP4 } });

  chequear("75. el error técnico devuelve 500", res4.status === 500, String(res4.status));
  chequear("76. el mensaje dice que no se modificó ningún costo",
    typeof j4.error === "string" && /no se modificó/i.test(j4.error), j4.error || "");
  chequear("77. ROLLBACK: el costo ya escrito de la primera fila volvió atrás",
    num(dRb1.precio_costo) === 200, String(num(dRb1.precio_costo)));
  chequear("78. ROLLBACK: la venta de la primera fila volvió atrás",
    num(dRb1.precio_venta) === 260, String(num(dRb1.precio_venta)));
  chequear("79. ROLLBACK: el segundo producto quedó intacto",
    num(dRb2.precio_costo) === 20000000, String(num(dRb2.precio_costo)));
  chequear("80. ROLLBACK: la cabecera NO quedó aplicada",
    cab4.estado === "CONCILIADA", cab4.estado);
  chequear("81. ROLLBACK: ninguna fila quedó marcada como aplicada",
    filasRb.every((f) => f.aplicada === false));
  chequear("82. ROLLBACK: ninguna fila guardó resultado",
    filasRb.every((f) => f.resultadoAplicacion === null));

  // Después del fallo, la importación se puede volver a intentar: el rollback la
  // dejó exactamente como estaba.
  const reintento = await aplicar(pedido(`${BASE}/${IMP4}/aplicar`, A, {
    modoPrecioVenta: "MANTENER_VENTA",
  }), ctxId(IMP4));
  const jReintento = await reintento.json();
  chequear("83. tras el rollback se puede reintentar con otro modo",
    jReintento.ok === true, jReintento.error || "");
  const dRb1b = await prisma.productoBase.findUnique({ where: { id: pRb1.id } });
  chequear("84. el reintento con MANTENER_VENTA sí aplica el costo",
    num(dRb1b.precio_costo) === 105, String(num(dRb1b.precio_costo)));
  chequear("85. el reintento no tocó la venta",
    num(dRb1b.precio_venta) === 260, String(num(dRb1b.precio_venta)));

  // ── Limpieza ─────────────────────────────────────────────────────────────
  await prisma.importacionListaFila.deleteMany({ where: { importacion: { grupoId: grupo.id } } });
  await prisma.importacionListaProveedor.deleteMany({ where: { grupoId: grupo.id } });
  await prisma.productoCodigoProveedor.deleteMany({ where: { grupoId: grupo.id } });
  await prisma.productoLocal.deleteMany({ where: { base: { grupoId: grupo.id } } });
  await prisma.productoBase.deleteMany({ where: { grupoId: grupo.id } });
  await prisma.proveedor.deleteMany({ where: { id: arcor.id } });
  await prisma.categoria.deleteMany({ where: { id: cat.id } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: { in: [dep.id, local2.id] } } });
  await prisma.usuario.deleteMany({ where: { id: { in: [admin.id, cajero.id] } } });
  await prisma.grupoDeposito.deleteMany({ where: { grupoId: grupo.id } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: grupo.id } });
  await prisma.local.deleteMany({ where: { id: { in: [dep.id, local2.id] } } });
  await prisma.rol.deleteMany({ where: { id: { in: [rol.id, rolBasico.id] } } });
  await prisma.grupo.deleteMany({ where: { id: grupo.id } });

  console.log(`\n=== ${ok} OK · ${fallos} FALLAS ===`);
  if (fallos) {
    console.log("\nPendientes:");
    for (const p of pendientes) console.log("  · " + p);
  }
  await prisma.$disconnect();
  process.exit(fallos ? 1 : 0);
}

main().catch(async (e) => {
  console.error("\nERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
