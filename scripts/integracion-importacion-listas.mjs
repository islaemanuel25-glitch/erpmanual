// scripts/integracion-importacion-listas.mjs
//
// Prueba de INTEGRACIÓN REAL de la importación de listas de proveedor, contra
// PostgreSQL. No simula: importa los handlers de las rutas de verdad y los
// ejecuta con sesiones firmadas, sobre una base descartable.
//
// Verifica lo que sólo se ve con la base puesta: que las 917 filas entren, que
// los contadores de la cabecera cierren, que un fallo a mitad no deje una
// cabecera huérfana, que el índice único frene el archivo repetido, que una
// importación de otro grupo no se pueda leer, y —lo más importante— que NINGÚN
// producto haya cambiado de costo.
//
// Uso:
//   DATABASE_URL=<base descartable> AUTH_SECRET=<secreto> \
//   ARCOR_FIXTURE=<ruta al xlsx real> \
//   node --import ./scripts/alias-loader.mjs scripts/integracion-importacion-listas.mjs
//
// El Excel real es opcional: sin él corren igual todas las pruebas que usan un
// archivo generado en memoria.

import fs from "node:fs";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";
import XLSX from "xlsx";

const prisma = new PrismaClient();
const SUFIJO = `imp-listas-${Date.now().toString(36)}`;

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

function cookieDe(usuario, localId, permisos = ["*"]) {
  const token = jwt.sign(
    {
      id: usuario.id, email: usuario.email, nombre: usuario.nombre, rolId: usuario.rolId,
      permisos, localId, grupoId: GRUPO_ID,
    },
    process.env.AUTH_SECRET,
    { expiresIn: 3600 }
  );
  return `erpazul_sesion=${token}`;
}

function pedidoGet(url, cookie) {
  const req = new Request(url, { method: "GET", headers: { cookie } });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
}

/** Un POST multipart de verdad, con el archivo adentro. */
function pedidoUpload(url, cookie, { bytes, nombre, mime, proveedorId, extra = {} }) {
  const fd = new FormData();
  if (bytes !== undefined) {
    fd.append("archivo", new File([bytes], nombre, { type: mime }), nombre);
  }
  if (proveedorId !== undefined) fd.append("proveedorId", String(proveedorId));
  for (const [k, v] of Object.entries(extra)) fd.append(k, String(v));

  const req = new Request(url, { method: "POST", headers: { cookie }, body: fd });
  Object.defineProperty(req, "nextUrl", { value: new URL(url), configurable: true });
  return req;
}

const json = (res) => res.json();
const ctxParams = (id) => ({ params: Promise.resolve({ id: String(id) }) });

/** Un .xlsx generado en memoria con el formato A de Arcor. */
function libroArcor(filas) {
  const aoa = [["Producto", "Descripción", "U.M.", "UxBU", "Precio S/IVA", "Precio C/IVA"], ...filas];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Hoja1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

async function main() {
  console.log(`\n=== INTEGRACIÓN: IMPORTACIÓN DE LISTAS (${SUFIJO}) ===\n`);

  const { POST: importar } = await import("../app/api/proveedores/listas/importar/route.js");
  const { GET: historial } = await import("../app/api/proveedores/listas/route.js");
  const { GET: detalle } = await import("../app/api/proveedores/listas/[id]/route.js");

  const BASE = "http://localhost/api/proveedores/listas";

  // ── Escenario ────────────────────────────────────────────────────────────
  const grupo = await prisma.grupo.create({ data: { nombre: `Grupo ${SUFIJO}` } });
  GRUPO_ID = grupo.id;
  const rol = await prisma.rol.create({ data: { nombre: `Rol ${SUFIJO}`, permisos: ["*"] } });
  const deposito = await prisma.local.create({
    data: { nombre: `Deposito ${SUFIJO}`, tipo: "deposito", es_deposito: true },
  });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: deposito.id } });
  await prisma.configuracionLocal.create({ data: { localId: deposito.id, exigirOperador: false } });

  const admin = await prisma.usuario.create({
    data: { nombre: `Admin ${SUFIJO}`, email: `admin-${SUFIJO}@test.local`, passwordHash: "x", rolId: rol.id, localId: deposito.id },
  });
  const rolBasico = await prisma.rol.create({
    data: { nombre: `Basico ${SUFIJO}`, permisos: ["pos.usar"] },
  });
  const cajero = await prisma.usuario.create({
    data: { nombre: `Cajero ${SUFIJO}`, email: `cajero-${SUFIJO}@test.local`, passwordHash: "x", rolId: rolBasico.id, localId: deposito.id },
  });

  const A = cookieDe(admin, deposito.id, ["*"]);
  const SIN_PERMISO = cookieDe(cajero, deposito.id, ["pos.usar"]);

  const cat = await prisma.categoria.create({ data: { nombre: `Cat ${SUFIJO}` } });

  // El proveedor CON parser configurado, y otro SIN configurar.
  const provArcor = await prisma.proveedor.create({
    data: { nombre: `Arcor ${SUFIJO}`, creadoEnLocalId: deposito.id, parserListaId: "ARCOR_XLSX" },
  });
  const provSinParser = await prisma.proveedor.create({
    data: { nombre: `Otro ${SUFIJO}`, creadoEnLocalId: deposito.id, parserListaId: null },
  });

  // Productos: uno suelto, uno pack con factor, uno en kg.
  const crearProducto = async (nombre, extra) =>
    prisma.productoBase.create({
      data: {
        grupoId: grupo.id, creadoEnLocalId: deposito.id, nombre, categoria_id: cat.id,
        unidad_medida: "unidad", precio_costo: 1000, precio_venta: 2000,
        proveedor_id: provArcor.id, ...extra,
      },
    });
  const pSuelto = await crearProducto(`Suelto ${SUFIJO}`, { codigo_barra: `990${Date.now()}`.slice(0, 13) });
  const pPack = await crearProducto(`Pack ${SUFIJO}`, { unidad_medida: "pack", factor_pack: 12 });
  const pKg = await crearProducto(`Kg ${SUFIJO}`, { unidad_medida: "kg" });

  const vinc = async (base, codigo, activo = true) =>
    prisma.productoCodigoProveedor.create({
      data: { grupoId: grupo.id, productoBaseId: base.id, proveedorId: provArcor.id, codigoInterno: codigo, activo },
    });
  await vinc(pSuelto, "1001");
  await vinc(pPack, "1002");
  await vinc(pKg, "1003");
  await vinc(pSuelto, "1099-INACTIVO", false);

  // Vinculados a propósito, para que las filas lleguen HASTA la regla que se
  // quiere probar. Sin vínculo, cualquier fila muere antes en NO_MACHEADO —que
  // tiene más prioridad que el precio y que la unidad— y la prueba no probaría
  // nada de lo que dice probar.
  const pCasiCero = await crearProducto(`CasiCero ${SUFIJO}`, {});
  await vinc(pCasiCero, "HELIMPFEB");
  const pDisplay = await crearProducto(`Display ${SUFIJO}`, { unidad_medida: "pack", factor_pack: 6 });
  await vinc(pDisplay, "1005");
  const pBulto = await crearProducto(`Bulto ${SUFIJO}`, { unidad_medida: "cajon", factor_pack: 24 });
  await vinc(pBulto, "1006");
  // Un vínculo activo que NO va a venir en el archivo: tiene que salir faltante.
  const pAusente = await crearProducto(`Ausente ${SUFIJO}`, {});
  await vinc(pAusente, "1004");

  const costosAntes = await prisma.productoBase.findMany({
    where: { grupoId: grupo.id },
    select: { id: true, precio_costo: true, precio_venta: true },
    orderBy: { id: "asc" },
  });

  // ═══ 1. IMPORTACIÓN VÁLIDA ══════════════════════════════════════════════
  console.log("── IMPORTACIÓN VÁLIDA ──");

  const bytesOk = libroArcor([
    ["03- CATEGORIA DE PRUEBA"],
    [1001, "SUELTO", "UN", 1, 826.446281, 1000],
    [1002, "PACK", "UN", 12, 826.446281, 1000],
    [1003, "EN KILOS", "UN", 1, 826.446281, 1000],
    [9999, "SIN VINCULO", "UN", 1, 826.446281, 1000],
    ["HELIMPFEB", "IMPULSIVO", "UN", 1, 0, 0.0000000001],
    [1005, "DISPLAY", "DI", 6, 826.446281, 1000],
    [1006, "BULTO", "BU", 1, 8264.46281, 10000],
  ]);

  const r1 = await importar(pedidoUpload(`${BASE}/importar`, A, {
    bytes: bytesOk, nombre: "lista.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    proveedorId: provArcor.id,
  }));
  const j1 = await json(r1);
  chequear("1. la importación responde ok", j1.ok === true, j1.error || "");
  chequear("1b. devuelve un identificador", Number.isInteger(j1.importacionId));
  const IMP = j1.importacionId;

  const cab = await prisma.importacionListaProveedor.findUnique({ where: { id: IMP } });
  chequear("2. la cabecera queda CONCILIADA", cab?.estado === "CONCILIADA", cab?.estado);
  chequear("2b. con fecha de conciliación", !!cab?.conciliadaEn);
  chequear("2c. sin fecha de aplicación", cab?.aplicadaEn === null);
  chequear("2d. guarda parser y versión", cab?.parser === "ARCOR_XLSX" && !!cab?.parserVersion);
  chequear("2e. guarda usuario, local y grupo",
    cab?.usuarioId === admin.id && cab?.localOperativoId === deposito.id && cab?.grupoId === grupo.id);
  chequear("2f. guarda nombre, tamaño y hash del archivo",
    cab?.archivoNombre === "lista.xlsx" && cab?.archivoTamano === bytesOk.length && cab?.archivoHash?.length === 64);
  chequear("2g. la ubicación del binario queda null, documentado", cab?.archivoUbicacion === null);
  chequear("2h. guarda la configuración comercial",
    Number(cab?.recargoPct) === 5 && Number(cab?.umbralVariacionPct) === 30);
  chequear("2i. el modo de precio de venta nace en NO_TOCAR", cab?.modoPrecioVenta === "NO_TOCAR");

  const filas = await prisma.importacionListaFila.findMany({
    where: { importacionId: IMP }, orderBy: { filaExcel: "asc" },
  });
  chequear("3. se guardan TODAS las filas, no solo las aplicables", filas.length === 7, `n=${filas.length}`);
  chequear("3b. las categorías NO se guardan como filas de producto",
    filas.every((f) => !String(f.descripcionProveedor).includes("CATEGORIA")));
  chequear("3c. la categoría sí se hereda en los productos",
    filas[0]?.categoriaCruda === "03- CATEGORIA DE PRUEBA", filas[0]?.categoriaCruda);

  const porCodigo = new Map(filas.map((f) => [f.codigoNormalizado, f]));
  chequear("4. el producto suelto queda listo, con el 5% aplicado",
    porCodigo.get("1001")?.estado === "LISTO_PARA_ACTUALIZAR" &&
    Number(porCodigo.get("1001").costoMaestroPropuesto) === 1050,
    String(porCodigo.get("1001")?.costoMaestroPropuesto));
  chequear("5. el pack multiplica por el factor",
    Number(porCodigo.get("1002")?.costoMaestroPropuesto) === 12600,
    String(porCodigo.get("1002")?.costoMaestroPropuesto));
  chequear("6. el producto en kg queda BLOQUEADO",
    porCodigo.get("1003")?.estado === "BLOQUEADO" &&
    porCodigo.get("1003")?.motivo === "UNIDAD_INCOMPATIBLE_CON_LISTA");
  chequear("7. el código sin vínculo queda NO_MACHEADO",
    porCodigo.get("9999")?.estado === "NO_MACHEADO");
  chequear("8. HELIMPFEB con precio casi cero queda BLOQUEADO",
    porCodigo.get("HELIMPFEB")?.estado === "BLOQUEADO" &&
    porCodigo.get("HELIMPFEB")?.motivo === "PRECIO_NO_CREIBLE",
    porCodigo.get("HELIMPFEB")?.motivo);
  chequear("9. la fila DI queda FACTOR_DUDOSO",
    porCodigo.get("1005")?.estado === "FACTOR_DUDOSO" &&
    porCodigo.get("1005")?.motivo === "DISPLAY_SIN_EQUIVALENCIA",
    `${porCodigo.get("1005")?.estado}/${porCodigo.get("1005")?.motivo}`);
  chequear("9b. la fila DI conserva el cálculo comercial aunque no se aplique",
    Number(porCodigo.get("1005")?.precioConRecargo) === 1050 &&
    porCodigo.get("1005")?.costoMaestroPropuesto === null);
  chequear("9c. la fila BU NO multiplica por el factor del ERP",
    Number(porCodigo.get("1006")?.costoMaestroPropuesto) === 10500 &&
    porCodigo.get("1006")?.estado === "LISTO_PARA_ACTUALIZAR",
    String(porCodigo.get("1006")?.costoMaestroPropuesto));

  chequear("10. solo lo LISTO queda seleccionado",
    filas.every((f) => f.seleccionada === (f.estado === "LISTO_PARA_ACTUALIZAR")));
  chequear("10b. ninguna fila nace aplicada",
    filas.every((f) => f.aplicada === false && f.costoAplicado === null));

  const suma = cab.listoParaActualizar + cab.sinCambios + cab.noMacheadas + cab.codigoDuplicado +
    cab.factorDudoso + cab.excluidas + cab.bloqueadas + cab.errores;
  chequear("11. los contadores de la cabecera cierran contra el total",
    suma === cab.totalFilas && cab.totalFilas === filas.length, `${suma} vs ${cab.totalFilas}`);
  chequear("11b. cuenta los faltantes", cab.faltantes === 1, `faltantes=${cab.faltantes}`);

  chequear("12. los decimales del precio se conservan",
    Number(porCodigo.get("1001")?.precioSinIva) === 826.446281,
    String(porCodigo.get("1001")?.precioSinIva));

  // ── NINGÚN PRODUCTO CAMBIÓ ──────────────────────────────────────────────
  const costosDespues = await prisma.productoBase.findMany({
    where: { grupoId: grupo.id },
    select: { id: true, precio_costo: true, precio_venta: true },
    orderBy: { id: "asc" },
  });
  chequear("13. NINGÚN producto cambió de costo ni de precio de venta",
    JSON.stringify(costosAntes) === JSON.stringify(costosDespues));

  // ═══ 2. DUPLICADOS ══════════════════════════════════════════════════════
  console.log("\n── DUPLICADOS ──");

  const r2 = await importar(pedidoUpload(`${BASE}/importar`, A, {
    bytes: bytesOk, nombre: "otro-nombre.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    proveedorId: provArcor.id,
  }));
  const j2 = await json(r2);
  chequear("14. el mismo archivo con OTRO nombre se rechaza por hash", r2.status === 409, `status=${r2.status}`);
  chequear("14b. y devuelve la importación existente", j2.importacionExistente?.id === IMP);
  chequear("14c. no se creó una segunda importación",
    (await prisma.importacionListaProveedor.count({ where: { grupoId: grupo.id } })) === 1);

  const hashEsperado = createHash("sha256").update(bytesOk).digest("hex");
  chequear("15. el hash guardado es el SHA-256 real del contenido", cab.archivoHash === hashEsperado);

  // Carrera: dos subidas simultáneas del MISMO archivo nuevo.
  const bytesCarrera = libroArcor([[2001, "CARRERA", "UN", 1, 100, 121]]);
  const [c1, c2] = await Promise.all([
    importar(pedidoUpload(`${BASE}/importar`, A, {
      bytes: bytesCarrera, nombre: "c.xlsx", mime: "application/octet-stream", proveedorId: provArcor.id,
    })),
    importar(pedidoUpload(`${BASE}/importar`, A, {
      bytes: bytesCarrera, nombre: "c.xlsx", mime: "application/octet-stream", proveedorId: provArcor.id,
    })),
  ]);
  const codigos = [c1.status, c2.status].sort();
  chequear("16. dos subidas simultáneas: una entra y la otra choca contra el índice único",
    codigos[0] === 200 && codigos[1] === 409, JSON.stringify(codigos));
  const hashCarrera = createHash("sha256").update(bytesCarrera).digest("hex");
  chequear("16b. quedó UNA sola importación de ese archivo",
    (await prisma.importacionListaProveedor.count({
      where: { grupoId: grupo.id, proveedorId: provArcor.id, archivoHash: hashCarrera },
    })) === 1);

  // ═══ 2b. IMPORTACIÓN DESCARTADA ═════════════════════════════════════════
  //
  // El índice único no mira el estado: una importación DESCARTADA sigue
  // ocupando el hash. Documentado en la ruta; acá se prueba la conducta real.
  console.log("\n── ARCHIVO DE UNA IMPORTACIÓN DESCARTADA ──");

  await prisma.importacionListaProveedor.update({
    where: { id: IMP },
    data: { estado: "DESCARTADA" },
  });

  const rDesc = await importar(pedidoUpload(`${BASE}/importar`, A, {
    bytes: bytesOk, nombre: "lista.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    proveedorId: provArcor.id,
  }));
  const jDesc = await json(rDesc);
  chequear("16c. el mismo archivo sigue bloqueado aunque la anterior esté DESCARTADA",
    rDesc.status === 409, `status=${rDesc.status}`);
  chequear("16d. el 409 devuelve el id de la importación existente",
    jDesc.importacionExistente?.id === IMP);
  chequear("16e. y su estado, que es DESCARTADA",
    jDesc.importacionExistente?.estado === "DESCARTADA", jDesc.importacionExistente?.estado);
  chequear("16f. no se creó ninguna importación nueva",
    (await prisma.importacionListaProveedor.count({ where: { grupoId: grupo.id } })) === 2);

  await prisma.importacionListaProveedor.update({
    where: { id: IMP },
    data: { estado: "CONCILIADA" },
  });

  // ═══ 3. RECHAZOS ════════════════════════════════════════════════════════
  console.log("\n── RECHAZOS ──");

  const subir = (over) => importar(pedidoUpload(`${BASE}/importar`, over.cookie ?? A, {
    bytes: over.bytes ?? libroArcor([[3001, "X", "UN", 1, 100, 121]]),
    nombre: over.nombre ?? "x.xlsx",
    mime: over.mime ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    proveedorId: over.proveedorId ?? provArcor.id,
  }));

  chequear("17. usuario sin permiso de administrador", (await subir({ cookie: SIN_PERMISO })).status === 403);
  chequear("18. archivo vacío", (await subir({ bytes: Buffer.alloc(0) })).status === 400);
  chequear("19. extensión inválida", (await subir({ nombre: "lista.csv" })).status === 400);
  chequear("20. MIME dudoso", (await subir({ mime: "application/x-msdownload" })).status === 400);
  chequear("21. proveedor inexistente", (await subir({ proveedorId: 999999 })).status === 404);
  chequear("22. proveedor sin parser configurado", (await subir({ proveedorId: provSinParser.id })).status === 400);
  chequear("23. archivo que no es una planilla",
    (await subir({ bytes: Buffer.from("no soy un xlsx") })).status === 400);

  const bytesMalFormato = (() => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Cliente", "Saldo"], ["A", 1]]), "H");
    return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  })();
  const rMal = await subir({ bytes: bytesMalFormato });
  chequear("24. planilla con otros encabezados: parser con error", rMal.status === 400);
  chequear("24b. y no deja cabecera huérfana",
    (await prisma.importacionListaProveedor.count({ where: { grupoId: grupo.id } })) === 2);

  const sinProveedor = await importar(pedidoUpload(`${BASE}/importar`, A, {
    bytes: libroArcor([[4001, "X", "UN", 1, 100, 121]]), nombre: "x.xlsx",
    mime: "application/octet-stream",
  }));
  chequear("25. sin proveedorId", sinProveedor.status === 400);

  // ═══ 4. LECTURA ═════════════════════════════════════════════════════════
  console.log("\n── LECTURA ──");

  const d1 = await json(await detalle(pedidoGet(`${BASE}/${IMP}`, A), ctxParams(IMP)));
  chequear("26. devuelve cabecera, filas y paginación",
    d1.ok === true && !!d1.importacion && Array.isArray(d1.filas) && !!d1.paginacion);
  chequear("26b. la cabecera trae el proveedor y el usuario",
    d1.importacion.proveedor?.id === provArcor.id && d1.importacion.usuario?.id === admin.id);

  const d2 = await json(await detalle(pedidoGet(`${BASE}/${IMP}?pageSize=2&page=1`, A), ctxParams(IMP)));
  chequear("27. paginación real", d2.filas.length === 2 && d2.paginacion.total === 7);
  const d2b = await json(await detalle(pedidoGet(`${BASE}/${IMP}?pageSize=2&page=2`, A), ctxParams(IMP)));
  chequear("27b. la segunda página trae otras filas", d2b.filas[0].id !== d2.filas[0].id);

  const d3 = await json(await detalle(pedidoGet(`${BASE}/${IMP}?pageSize=9999`, A), ctxParams(IMP)));
  chequear("28. pageSize tiene techo", d3.paginacion.pageSize <= d3.paginacion.pageSizeMax);

  const d4 = await json(await detalle(pedidoGet(`${BASE}/${IMP}?estado=BLOQUEADO`, A), ctxParams(IMP)));
  chequear("29. filtro por estado", d4.filas.length > 0 && d4.filas.every((f) => f.estado === "BLOQUEADO"));

  const d4b = await detalle(pedidoGet(`${BASE}/${IMP}?estado=INVENTADO`, A), ctxParams(IMP));
  chequear("29b. un estado inválido se rechaza", d4b.status === 400);

  const d5 = await json(await detalle(pedidoGet(`${BASE}/${IMP}?q=SUELTO`, A), ctxParams(IMP)));
  chequear("30. búsqueda por descripción", d5.filas.length === 1 && d5.filas[0].codigoNormalizado === "1001");
  const d5b = await json(await detalle(pedidoGet(`${BASE}/${IMP}?q=1002`, A), ctxParams(IMP)));
  chequear("30b. búsqueda por código", d5b.filas.length === 1);

  const d6 = await json(await detalle(pedidoGet(`${BASE}/${IMP}`, A), ctxParams(IMP)));
  const orden = d6.filas.map((f) => f.filaExcel);
  chequear("31. orden por fila del Excel", JSON.stringify(orden) === JSON.stringify([...orden].sort((a, b) => a - b)));

  chequear("32. sin permiso no se puede leer",
    (await detalle(pedidoGet(`${BASE}/${IMP}`, SIN_PERMISO), ctxParams(IMP))).status === 403);

  // Otro grupo: la importación no existe para él.
  const grupo2 = await prisma.grupo.create({ data: { nombre: `Grupo2 ${SUFIJO}` } });
  const local2 = await prisma.local.create({ data: { nombre: `Local2 ${SUFIJO}`, tipo: "local" } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo2.id, localId: local2.id } });
  const admin2 = await prisma.usuario.create({
    data: { nombre: `Admin2 ${SUFIJO}`, email: `admin2-${SUFIJO}@test.local`, passwordHash: "x", rolId: rol.id, localId: local2.id },
  });
  const tokenOtroGrupo = jwt.sign(
    { id: admin2.id, email: admin2.email, nombre: admin2.nombre, rolId: rol.id, permisos: ["*"], localId: local2.id, grupoId: grupo2.id },
    process.env.AUTH_SECRET, { expiresIn: 3600 }
  );
  const B = `erpazul_sesion=${tokenOtroGrupo}`;
  chequear("33. una importación de otro grupo da 404, no 403",
    (await detalle(pedidoGet(`${BASE}/${IMP}`, B), ctxParams(IMP))).status === 404);

  // ═══ 5. HISTORIAL ═══════════════════════════════════════════════════════
  console.log("\n── HISTORIAL ──");

  const h1 = await json(await historial(pedidoGet(BASE, A)));
  chequear("34. el historial lista las importaciones del grupo",
    h1.ok === true && h1.items.length === 2, `n=${h1.items?.length}`);
  chequear("34b. con contadores por estado",
    typeof h1.items[0].listoParaActualizar === "number" && typeof h1.items[0].bloqueadas === "number");
  chequear("34c. con proveedor y usuario", !!h1.items[0].proveedor?.nombre && !!h1.items[0].usuario?.nombre);
  chequear("35. orden descendente por fecha",
    new Date(h1.items[0].createdAt) >= new Date(h1.items[1].createdAt));

  const h2 = await json(await historial(pedidoGet(`${BASE}?pageSize=1`, A)));
  chequear("36. paginación real en base", h2.items.length === 1 && h2.paginacion.total === 2);

  const h3 = await json(await historial(pedidoGet(BASE, B)));
  chequear("37. el historial está limitado al grupo activo", h3.items.length === 0);

  chequear("38. sin permiso no hay historial", (await historial(pedidoGet(BASE, SIN_PERMISO))).status === 403);

  // ═══ 5b. CATÁLOGO DE SUGERENCIAS POR CÓDIGO DE BARRAS ═══════════════════
  //
  // La sugerencia existe para el producto que NO tiene vínculo con el proveedor.
  // Si el catálogo se derivara de los vínculos, no encontraría nunca nada.
  console.log("\n── SUGERENCIAS POR CÓDIGO DE BARRAS ──");

  const { cargarDatosDeConciliacion } = await import("../lib/proveedores/listas/cargaErp.js");

  // Un local hermano dentro del MISMO grupo, para probar el alcance.
  const localHermano = await prisma.local.create({
    data: { nombre: `Hermano ${SUFIJO}`, tipo: "local", es_deposito: false },
  });
  await prisma.grupoLocal.create({ data: { grupoId: grupo.id, localId: localHermano.id } });

  // Sin vínculo con Arcor, cada uno con una fuente distinta de código de barras.
  const bGlobal = await crearProducto(`SoloGlobal ${SUFIJO}`, { codigo_barra: "7001111111111" });
  const bSecundario = await crearProducto(`SoloSecundario ${SUFIJO}`, {
    codigo_barra_secundario: "7002222222222",
  });
  const bPropio = await crearProducto(`SoloPropio ${SUFIJO}`, {});
  await prisma.productoLocal.create({
    data: { baseId: bPropio.id, localId: deposito.id, codigo_barra_propio: "7003333333333", activo: true },
  });
  // Propio de OTRO local del mismo grupo: no debe verse desde el depósito.
  const bPropioAjeno = await crearProducto(`PropioAjeno ${SUFIJO}`, {});
  await prisma.productoLocal.create({
    data: { baseId: bPropioAjeno.id, localId: localHermano.id, codigo_barra_propio: "7004444444444", activo: true },
  });
  // Exclusivo de otro local: fuera del alcance del depósito.
  const bExclusivoAjeno = await prisma.productoBase.create({
    data: {
      grupoId: grupo.id, creadoEnLocalId: localHermano.id, nombre: `ExclusivoAjeno ${SUFIJO}`,
      categoria_id: cat.id, unidad_medida: "unidad", precio_costo: 100, precio_venta: 200,
      codigo_barra: "7005555555555",
    },
  });
  // Otro GRUPO con el mismo código de barras.
  const catOtro = await prisma.categoria.create({ data: { nombre: `CatOtro ${SUFIJO}` } });
  await prisma.productoBase.create({
    data: {
      grupoId: grupo2.id, creadoEnLocalId: local2.id, nombre: `OtroGrupo ${SUFIJO}`,
      categoria_id: catOtro.id, unidad_medida: "unidad", precio_costo: 100, precio_venta: 200,
      codigo_barra: "7001111111111",
    },
  });
  // Dos productos VISIBLES con el mismo código: ambigüedad.
  const bDup1 = await crearProducto(`Dup1 ${SUFIJO}`, { codigo_barra_secundario: "7006666666666" });
  const bDup2 = await crearProducto(`Dup2 ${SUFIJO}`, { codigo_barra_secundario: "7006666666666" });

  const cargaDep = await cargarDatosDeConciliacion({
    grupoId: grupo.id, proveedorId: provArcor.id, localId: deposito.id,
  });
  const idsCatalogo = new Set(cargaDep.productos.map((p) => p.productoBaseId));
  const barras = new Map();
  for (const p of cargaDep.productos) {
    for (const b of p.codigosBarra) {
      if (!barras.has(b)) barras.set(b, []);
      barras.get(b).push(p.productoBaseId);
    }
  }

  chequear("39. el catálogo de sugerencias es MÁS AMPLIO que el de vínculos",
    cargaDep.diagnostico.productosSoloSugeribles > 0,
    `vinculados=${cargaDep.diagnostico.productosVinculados} catalogo=${cargaDep.diagnostico.productosEnCatalogo}`);

  chequear("40. producto SIN vínculo con código de barras GLOBAL: está en el catálogo",
    idsCatalogo.has(bGlobal.id) && (barras.get("7001111111111") ?? []).includes(bGlobal.id));
  chequear("41. producto SIN vínculo con código SECUNDARIO: está en el catálogo",
    idsCatalogo.has(bSecundario.id) && (barras.get("7002222222222") ?? []).includes(bSecundario.id));
  chequear("42. producto con código PROPIO de esta ubicación: está en el catálogo",
    idsCatalogo.has(bPropio.id) && (barras.get("7003333333333") ?? []).includes(bPropio.id));

  chequear("43. el código propio de OTRO local NO entra en este contexto",
    !(barras.get("7004444444444") ?? []).length,
    `encontrado=${JSON.stringify(barras.get("7004444444444") ?? [])}`);
  chequear("44. un producto exclusivo de otro local NO entra",
    !idsCatalogo.has(bExclusivoAjeno.id));
  chequear("45. un producto de OTRO GRUPO con el mismo código NO entra",
    (barras.get("7001111111111") ?? []).length === 1);
  chequear("46. dos productos visibles con el mismo código: los dos candidatos, sin elegir",
    (barras.get("7006666666666") ?? []).sort().join(",") === [bDup1.id, bDup2.id].sort().join(","));

  chequear("47. ningún vinculado quedó fuera del catálogo por el filtro de visibilidad",
    cargaDep.diagnostico.vinculadosNoVisibles === 0);

  // La sugerencia, de punta a punta: un archivo con un código sin vínculo pero
  // con el código de barras del producto.
  const bytesSug = libroArcor([[7777, "SUGERIBLE", "UN", 1, 100, 121]]);
  const wbSug = XLSX.utils.book_new();
  const hojaSug = XLSX.utils.aoa_to_sheet([
    ["Producto", "Descripción", "U.M.", "UxBU", "Precio C/IVA", "Cod de barra"],
    [7777, "SUGERIBLE", "UN", 1, 121, "7001111111111"],
  ]);
  XLSX.utils.book_append_sheet(wbSug, hojaSug, "Hoja1");
  const rSug = await importar(pedidoUpload(`${BASE}/importar`, A, {
    bytes: Buffer.from(XLSX.write(wbSug, { type: "buffer", bookType: "xlsx" })),
    nombre: "sugerencia.xlsx", mime: "application/octet-stream", proveedorId: provArcor.id,
  }));
  const jSug = await json(rSug);
  chequear("48. la importación con código de barras entra", jSug.ok === true, jSug.error || "");
  if (jSug.ok) {
    const filaSug = await prisma.importacionListaFila.findFirst({
      where: { importacionId: jSug.importacionId, codigoNormalizado: "7777" },
    });
    chequear("49. la fila queda NO_MACHEADA con sugerencia, no macheada",
      filaSug?.estado === "NO_MACHEADO" && filaSug?.productoBaseId === null,
      `${filaSug?.estado}/${filaSug?.productoBaseId}`);
    chequear("50. la sugerencia apunta al producto sin vínculo",
      filaSug?.sugerenciaProductoBaseId === bGlobal.id,
      `sug=${filaSug?.sugerenciaProductoBaseId} esperado=${bGlobal.id}`);
    chequear("50b. y guarda el código de barras que la produjo",
      filaSug?.sugerenciaCodigoBarra === "7001111111111");
    chequear("50c. la sugerencia NO es aplicable", filaSug?.seleccionable === false);
    chequear("50d. no se creó ningún vínculo nuevo",
      (await prisma.productoCodigoProveedor.count({
        where: { grupoId: grupo.id, proveedorId: provArcor.id, codigoInterno: "7777" },
      })) === 0);
  }

  // ── Consultas constantes ────────────────────────────────────────────────
  //
  // Se cuentan las consultas reales con el middleware de eventos de Prisma:
  // la carga tiene que costar lo mismo con 1 fila que con 917.
  chequear("51. la carga en bloque declara 3 consultas fijas",
    cargaDep.diagnostico.consultas === 3);

  const cargaOtroLocal = await cargarDatosDeConciliacion({
    grupoId: grupo.id, proveedorId: provArcor.id, localId: localHermano.id,
  });
  const barrasHermano = new Set(cargaOtroLocal.productos.flatMap((p) => p.codigosBarra));
  chequear("52. desde el local hermano SÍ se ve su propio código propio",
    barrasHermano.has("7004444444444"));
  chequear("52b. y NO se ve el código propio del depósito",
    !barrasHermano.has("7003333333333"));

  // ═══ 6. ARCHIVO REAL ════════════════════════════════════════════════════
  const RUTA = process.env.ARCOR_FIXTURE ?? "";
  if (RUTA && fs.existsSync(RUTA)) {
    console.log("\n── ARCHIVO REAL DE AGOSTO ──");
    // Foto FRESCA justo antes del archivo real: entre la foto inicial y este
    // punto se crearon los productos de las pruebas de sugerencia, así que
    // comparar contra aquélla mediría un cambio de catálogo, no de costos.
    const costosPrevios = await prisma.productoBase.findMany({
      where: { grupoId: grupo.id },
      select: { id: true, precio_costo: true, precio_venta: true },
      orderBy: { id: "asc" },
    });
    const bytesReales = fs.readFileSync(RUTA);
    const t0 = Date.now();
    const rr = await importar(pedidoUpload(`${BASE}/importar`, A, {
      bytes: bytesReales, nombre: "lista de precios agosto 2026.xls.xlsx",
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      proveedorId: provArcor.id,
    }));
    const jr = await json(rr);
    const ms = Date.now() - t0;
    chequear("53. el archivo real se importa", jr.ok === true, jr.error || `${ms} ms`);

    if (jr.ok) {
      const cabR = await prisma.importacionListaProveedor.findUnique({ where: { id: jr.importacionId } });
      const nFilas = await prisma.importacionListaFila.count({ where: { importacionId: jr.importacionId } });
      chequear("54. 917 filas persistidas", nFilas === 917, `n=${nFilas}`);
      chequear("55. las 77 categorías NO se persisten como filas",
        jr.resumen.categoriasEnArchivo === 77 && nFilas === 917, `cat=${jr.resumen.categoriasEnArchivo}`);

      const porUnidad = await prisma.importacionListaFila.groupBy({
        by: ["unidadProveedor"], where: { importacionId: jr.importacionId }, _count: true,
      });
      const u = Object.fromEntries(porUnidad.map((x) => [x.unidadProveedor, x._count]));
      chequear("56. 651 UN, 230 DI, 36 BU", u.UN === 651 && u.DI === 230 && u.BU === 36, JSON.stringify(u));

      const heli = await prisma.importacionListaFila.findFirst({
        where: { importacionId: jr.importacionId, codigoNormalizado: "HELIMPFEB" },
      });
      chequear("57. HELIMPFEB queda bloqueado o no macheado, nunca aplicable",
        heli && heli.seleccionable === false, `${heli?.estado}/${heli?.motivo}`);

      const diNoAplicables = await prisma.importacionListaFila.count({
        where: { importacionId: jr.importacionId, unidadProveedor: "DI", seleccionable: true },
      });
      chequear("58. ninguna fila DI queda aplicable", diNoAplicables === 0, `n=${diNoAplicables}`);

      const sumaR = cabR.listoParaActualizar + cabR.sinCambios + cabR.noMacheadas + cabR.codigoDuplicado +
        cabR.factorDudoso + cabR.excluidas + cabR.bloqueadas + cabR.errores;
      chequear("59. el resumen es igual a la suma de estados", sumaR === cabR.totalFilas, `${sumaR} vs ${cabR.totalFilas}`);

      const costosFinal = await prisma.productoBase.findMany({
        where: { grupoId: grupo.id }, select: { id: true, precio_costo: true, precio_venta: true },
        orderBy: { id: "asc" },
      });
      chequear("60. cero productos modificados por el archivo real",
        JSON.stringify(costosPrevios) === JSON.stringify(costosFinal));

      console.log(`  (importación del archivo real: ${ms} ms)`);
    }
  } else {
    console.log("\n  (sin ARCOR_FIXTURE: se omiten las comprobaciones del archivo real)");
  }

  // ── Limpieza ────────────────────────────────────────────────────────────
  console.log("\n── LIMPIEZA ──");
  await prisma.importacionListaFila.deleteMany({ where: { importacion: { grupoId: { in: [grupo.id, grupo2.id] } } } });
  await prisma.importacionListaProveedor.deleteMany({ where: { grupoId: { in: [grupo.id, grupo2.id] } } });
  await prisma.productoCodigoProveedor.deleteMany({ where: { grupoId: grupo.id } });
  await prisma.productoLocal.deleteMany({ where: { base: { grupoId: grupo.id } } });
  await prisma.productoLocal.deleteMany({ where: { base: { grupoId: { in: [grupo.id, grupo2.id] } } } });
  await prisma.productoBase.deleteMany({ where: { grupoId: { in: [grupo.id, grupo2.id] } } });
  await prisma.categoria.deleteMany({ where: { id: { in: [cat.id, catOtro.id] } } });
  await prisma.proveedor.deleteMany({ where: { id: { in: [provArcor.id, provSinParser.id] } } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: deposito.id } });
  await prisma.grupoDeposito.deleteMany({ where: { grupoId: grupo.id } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: { in: [grupo.id, grupo2.id] } } });
  await prisma.usuario.deleteMany({ where: { id: { in: [admin.id, cajero.id, admin2.id] } } });
  await prisma.local.deleteMany({ where: { id: { in: [deposito.id, local2.id, localHermano.id] } } });
  await prisma.rol.deleteMany({ where: { id: { in: [rol.id, rolBasico.id] } } });
  await prisma.grupo.deleteMany({ where: { id: { in: [grupo.id, grupo2.id] } } });
  console.log("  escenario borrado");

  console.log(`\n=== ${ok} OK · ${fallos} FALLAS ===`);
  if (fallos) {
    console.log("\nPendientes:");
    for (const p of pendientes) console.log(`  · ${p}`);
  }
  process.exitCode = fallos ? 1 : 0;
}

main()
  .catch((e) => {
    console.error("\nERROR FATAL:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
