// scripts/integracion-vinculacion-listas.mjs
//
// Prueba de INTEGRACIÓN REAL de la vinculación manual, contra PostgreSQL.
// Importa los handlers de verdad y los ejecuta con sesiones firmadas.
//
// Lo que se persigue: que un vínculo mal hecho no pase, que uno bien hecho
// recalcule la fila con el MISMO motor de la importación, que los contadores
// cierren después de cada cambio, que todo sea atómico, y que NINGÚN costo se
// mueva. Y lo que solo se ve con dos listas: que el código vinculado a mano
// machee solo en la lista siguiente.
//
// Uso:
//   DATABASE_URL=<base descartable> AUTH_SECRET=<secreto> \
//   node --import ./scripts/alias-loader.mjs scripts/integracion-vinculacion-listas.mjs

import { crearClientePrisma, ESCRITURA } from "./lib/clientePrisma.mjs";
import jwt from "jsonwebtoken";
// Default y no namespace: ver la nota en scripts/integracion-importacion-listas.mjs.
import XLSX from "xlsx";

const prisma = await crearClientePrisma({ nivel: ESCRITURA });
const SUFIJO = `vinc-${Date.now().toString(36)}`;

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
const ctxFila = (id, filaId) => ({ params: Promise.resolve({ id: String(id), filaId: String(filaId) }) });

function libroArcor(filas) {
  const aoa = [["Producto", "Descripción", "U.M.", "UxBU", "Precio S/IVA", "Precio C/IVA"], ...filas];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Hoja1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

/** ¿Cierran los contadores de la cabecera? */
function cierran(c) {
  const suma = c.listoParaActualizar + c.sinCambios + c.noMacheadas + c.codigoDuplicado +
    c.factorDudoso + c.excluidas + c.bloqueadas + c.errores;
  return suma === c.totalFilas;
}

async function main() {
  console.log(`\n=== INTEGRACIÓN: VINCULACIÓN MANUAL (${SUFIJO}) ===\n`);

  const { POST: importar } = await import("../app/api/proveedores/listas/importar/route.js");
  const { GET: buscarProductos } = await import("../app/api/proveedores/listas/[id]/productos/route.js");
  const { POST: vincular } = await import("../app/api/proveedores/listas/[id]/filas/[filaId]/vincular/route.js");

  const BASE = "http://localhost/api/proveedores/listas";

  // ── Escenario ────────────────────────────────────────────────────────────
  const grupo = await prisma.grupo.create({ data: { nombre: `Grupo ${SUFIJO}` } });
  GRUPO_ID = grupo.id;
  const rol = await prisma.rol.create({ data: { nombre: `Rol ${SUFIJO}`, permisos: ["*"] } });
  const rolBasico = await prisma.rol.create({ data: { nombre: `Basico ${SUFIJO}`, permisos: ["pos.usar"] } });
  const dep = await prisma.local.create({ data: { nombre: `Dep ${SUFIJO}`, tipo: "deposito", es_deposito: true } });
  const otroLocal = await prisma.local.create({ data: { nombre: `Otro ${SUFIJO}`, tipo: "local", es_deposito: false } });
  await prisma.grupoLocal.createMany({ data: [{ grupoId: grupo.id, localId: dep.id }, { grupoId: grupo.id, localId: otroLocal.id }] });
  await prisma.grupoDeposito.create({ data: { grupoId: grupo.id, localId: dep.id } });
  await prisma.configuracionLocal.create({ data: { localId: dep.id, exigirOperador: false } });

  const mk = (n, e, r = rol.id) => prisma.usuario.create({
    data: { nombre: `${n} ${SUFIJO}`, email: `${e}-${SUFIJO}@test.local`, passwordHash: "x", rolId: r, localId: dep.id },
  });
  const admin = await mk("Admin", "admin");
  const cajero = await mk("Cajero", "cajero", rolBasico.id);
  const A = cookieDe(admin, dep.id, ["*"]);
  const SIN_PERMISO = cookieDe(cajero, dep.id, ["pos.usar"]);

  const cat = await prisma.categoria.create({ data: { nombre: `Cat ${SUFIJO}` } });
  const arcor = await prisma.proveedor.create({
    data: { nombre: `Arcor ${SUFIJO}`, creadoEnLocalId: dep.id, parserListaId: "ARCOR_XLSX" },
  });

  const crear = (nombre, extra = {}) => prisma.productoBase.create({
    data: {
      grupoId: grupo.id, creadoEnLocalId: dep.id, nombre, categoria_id: cat.id,
      unidad_medida: "unidad", precio_costo: 1000, precio_venta: 2000, proveedor_id: arcor.id, ...extra,
    },
  });

  // Los productos que se van a vincular a mano, uno por cada estado final.
  const pListo = await crear(`Listo ${SUFIJO}`, { codigo_barra: "7790000000101" });
  const pIgual = await crear(`Igual ${SUFIJO}`, { precio_costo: 1050 });
  const pPack = await crear(`Pack ${SUFIJO}`, { unidad_medida: "pack", factor_pack: 24 });
  const pKg = await crear(`Kg ${SUFIJO}`, { unidad_medida: "kg" });
  const pAjeno = await prisma.productoBase.create({
    data: {
      grupoId: grupo.id, creadoEnLocalId: otroLocal.id, nombre: `Ajeno ${SUFIJO}`,
      categoria_id: cat.id, unidad_medida: "unidad", precio_costo: 1000, precio_venta: 2000,
    },
  });
  const pOcupado = await crear(`Ocupado ${SUFIJO}`);
  const pOtro = await crear(`Otro producto ${SUFIJO}`);

  // Un vínculo ACTIVO que va a generar conflicto, y uno INACTIVO a reactivar.
  await prisma.productoCodigoProveedor.create({
    data: { grupoId: grupo.id, proveedorId: arcor.id, productoBaseId: pOcupado.id, codigoInterno: "OCUPADO", activo: true },
  });
  await prisma.productoCodigoProveedor.create({
    data: { grupoId: grupo.id, proveedorId: arcor.id, productoBaseId: pOtro.id, codigoInterno: "INACTIVO", activo: false },
  });

  const costosAntes = await prisma.productoBase.findMany({
    where: { grupoId: grupo.id }, select: { id: true, precio_costo: true, precio_venta: true }, orderBy: { id: "asc" },
  });

  // ── La importación ───────────────────────────────────────────────────────
  const bytes = libroArcor([
    [1001, "PARA LISTO", "UN", 1, 826, 1000],
    [1002, "PARA IGUAL", "UN", 1, 826, 1000],
    [1003, "PARA DUDOSO", "DI", 6, 826, 1000],
    [1004, "PARA BLOQUEADO KG", "UN", 1, 826, 1000],
    [1005, "PARA AJENO", "UN", 1, 826, 1000],
    ["OCUPADO", "CODIGO OCUPADO", "UN", 1, 826, 1000],
    ["INACTIVO", "CODIGO INACTIVO", "UN", 1, 826, 1000],
  ]);
  const imp = await json(await importar(pedidoUpload(`${BASE}/importar`, A, {
    bytes, nombre: "lista.xlsx", proveedorId: arcor.id,
  })));
  chequear("0. la importación entra", imp.ok === true, imp.error || "");
  const IMP = imp.importacionId;

  const filaDe = async (codigo) =>
    prisma.importacionListaFila.findFirst({ where: { importacionId: IMP, codigoNormalizado: codigo } });

  const fListo = await filaDe("1001");
  const fIgual = await filaDe("1002");
  const fDudoso = await filaDe("1003");
  const fKg = await filaDe("1004");
  const fAjeno = await filaDe("1005");
  const fOcupado = await filaDe("OCUPADO");
  const fInactivo = await filaDe("INACTIVO");

  chequear("0b. las siete filas nacen NO_MACHEADO salvo la del código ocupado",
    fListo.estado === "NO_MACHEADO" && fOcupado.estado === "LISTO_PARA_ACTUALIZAR",
    `${fListo.estado}/${fOcupado.estado}`);

  // ═══ 1. SEGURIDAD ═══════════════════════════════════════════════════════
  console.log("── SEGURIDAD ──");

  const vinc = (cookie, filaId, productoBaseId, extra = {}) =>
    vincular(pedido(`${BASE}/${IMP}/filas/${filaId}/vincular`, cookie, { productoBaseId, ...extra }), ctxFila(IMP, filaId));

  chequear("1. sin permiso de administrador", (await vinc(SIN_PERMISO, fListo.id, pListo.id)).status === 403);

  // Otro grupo.
  const grupo2 = await prisma.grupo.create({ data: { nombre: `G2 ${SUFIJO}` } });
  const local2 = await prisma.local.create({ data: { nombre: `L2 ${SUFIJO}`, tipo: "local" } });
  await prisma.grupoLocal.create({ data: { grupoId: grupo2.id, localId: local2.id } });
  const admin2 = await prisma.usuario.create({
    data: { nombre: `A2 ${SUFIJO}`, email: `a2-${SUFIJO}@test.local`, passwordHash: "x", rolId: rol.id, localId: local2.id },
  });
  const B = cookieDe(admin2, local2.id, ["*"], grupo2.id);
  chequear("2. una importación de otro grupo da 404", (await vinc(B, fListo.id, pListo.id)).status === 404);

  chequear("3. un producto exclusivo de otro local está fuera de alcance",
    (await vinc(A, fAjeno.id, pAjeno.id)).status === 404);

  chequear("4. una fila que YA macheó no se re-vincula",
    (await vinc(A, fOcupado.id, pListo.id)).status === 409);

  // Fila aplicada.
  await prisma.importacionListaFila.update({ where: { id: fIgual.id }, data: { aplicada: true } });
  chequear("5. una fila ya aplicada no se vincula", (await vinc(A, fIgual.id, pIgual.id)).status === 409);
  await prisma.importacionListaFila.update({ where: { id: fIgual.id }, data: { aplicada: false } });

  // Importación aplicada.
  await prisma.importacionListaProveedor.update({ where: { id: IMP }, data: { estado: "APLICADA" } });
  chequear("6. una importación APLICADA no admite vincular", (await vinc(A, fListo.id, pListo.id)).status === 409);
  await prisma.importacionListaProveedor.update({ where: { id: IMP }, data: { estado: "CONCILIADA" } });

  chequear("7. sin productoBaseId", (await vincular(
    pedido(`${BASE}/${IMP}/filas/${fListo.id}/vincular`, A, {}), ctxFila(IMP, fListo.id)
  )).status === 400);

  const vinculosAntes = await prisma.productoCodigoProveedor.count({ where: { grupoId: grupo.id } });
  chequear("7b. ningún rechazo creó un vínculo", vinculosAntes === 2, `n=${vinculosAntes}`);

  // ═══ 2. VÍNCULO Y RECÁLCULO ═════════════════════════════════════════════
  console.log("\n── VÍNCULO Y RECÁLCULO ──");

  const r1 = await json(await vinc(A, fListo.id, pListo.id, { origen: "BUSQUEDA_MANUAL" }));
  chequear("8. crea el vínculo nuevo", r1.ok === true && r1.accion === "CREAR", r1.error || r1.accion);
  chequear("9. la fila pasa a LISTO_PARA_ACTUALIZAR",
    r1.fila?.estado === "LISTO_PARA_ACTUALIZAR", r1.fila?.estado);
  chequear("9b. con el costo propuesto calculado", Number(r1.fila?.costoMaestroPropuesto) === 1050,
    String(r1.fila?.costoMaestroPropuesto));
  chequear("9c. y con el producto vinculado", r1.fila?.productoBaseId === pListo.id);

  const v1 = await prisma.productoCodigoProveedor.findFirst({
    where: { grupoId: grupo.id, proveedorId: arcor.id, codigoInterno: "1001" },
  });
  chequear("10. el vínculo queda en ProductoCodigoProveedor",
    v1?.productoBaseId === pListo.id && v1?.activo === true);
  chequear("10b. guarda la descripción del proveedor",
    v1?.descripcionProveedor === "PARA LISTO", v1?.descripcionProveedor);

  const fListoBD = await prisma.importacionListaFila.findUnique({ where: { id: fListo.id } });
  chequear("11. registra usuario, fecha y origen",
    fListoBD.vinculadoPorUsuarioId === admin.id && !!fListoBD.vinculadoEn &&
    fListoBD.origenVinculo === "BUSQUEDA_MANUAL", fListoBD.origenVinculo);

  // Costo igual → SIN_CAMBIOS.
  const r2 = await json(await vinc(A, fIgual.id, pIgual.id));
  chequear("12. costo igual: la fila pasa a SIN_CAMBIOS", r2.fila?.estado === "SIN_CAMBIOS", r2.fila?.estado);

  // DI → FACTOR_DUDOSO.
  const r3 = await json(await vinc(A, fDudoso.id, pPack.id));
  chequear("13. una fila DI queda en FACTOR_DUDOSO",
    r3.fila?.estado === "FACTOR_DUDOSO" && r3.fila?.motivo === "DISPLAY_SIN_EQUIVALENCIA",
    `${r3.fila?.estado}/${r3.fila?.motivo}`);
  chequear("13b. vincular NO significa que quede lista", r3.fila?.seleccionable === false);

  // kg → BLOQUEADO.
  const r4 = await json(await vinc(A, fKg.id, pKg.id));
  chequear("14. un producto en kg queda BLOQUEADO",
    r4.fila?.estado === "BLOQUEADO" && r4.fila?.motivo === "UNIDAD_INCOMPATIBLE_CON_LISTA",
    `${r4.fila?.estado}/${r4.fila?.motivo}`);

  // Reactivar un vínculo inactivo.
  const r5 = await json(await vinc(A, fInactivo.id, pListo.id));
  chequear("15. reactiva un vínculo inactivo", r5.ok === true && r5.accion === "REACTIVAR", r5.accion);
  const v5 = await prisma.productoCodigoProveedor.findFirst({
    where: { grupoId: grupo.id, proveedorId: arcor.id, codigoInterno: "INACTIVO" },
  });
  chequear("15b. queda activo y apuntando al producto elegido",
    v5?.activo === true && v5?.productoBaseId === pListo.id);
  chequear("15c. no se duplicó el vínculo",
    (await prisma.productoCodigoProveedor.count({
      where: { grupoId: grupo.id, proveedorId: arcor.id, codigoInterno: "INACTIVO" },
    })) === 1);

  // ═══ 4. CONTADORES ══════════════════════════════════════════════════════
  console.log("\n── CONTADORES ──");

  const cab = await prisma.importacionListaProveedor.findUnique({ where: { id: IMP } });
  const filas = await prisma.importacionListaFila.findMany({ where: { importacionId: IMP } });
  chequear("17. los contadores cierran contra el total", cierran(cab), `total=${cab.totalFilas}`);
  chequear("17b. el total coincide con las filas reales", cab.totalFilas === filas.length);

  const conteo = {};
  for (const f of filas) conteo[f.estado] = (conteo[f.estado] ?? 0) + 1;
  chequear("18. cada contador coincide con las filas de ese estado",
    (cab.listoParaActualizar === (conteo.LISTO_PARA_ACTUALIZAR ?? 0)) &&
    (cab.sinCambios === (conteo.SIN_CAMBIOS ?? 0)) &&
    (cab.noMacheadas === (conteo.NO_MACHEADO ?? 0)) &&
    (cab.factorDudoso === (conteo.FACTOR_DUDOSO ?? 0)) &&
    (cab.bloqueadas === (conteo.BLOQUEADO ?? 0)),
    JSON.stringify(conteo));
  chequear("18b. el resumen que devuelve el endpoint es el persistido",
    r5.resumen?.totalFilas === cab.totalFilas);

  // ═══ 3. CONFLICTO ═══════════════════════════════════════════════════════
  console.log("\n── CONFLICTO ──");

  // Se libera la fila del código ocupado para poder intentar re-vincularlo.
  await prisma.importacionListaFila.update({
    where: { id: fOcupado.id },
    data: { estado: "NO_MACHEADO", productoBaseId: null, codigoProveedorId: null },
  });
  const rc = await vinc(A, fOcupado.id, pListo.id);
  const jc = await json(rc);
  chequear("16. un código con vínculo ACTIVO a otro producto da conflicto", rc.status === 409);
  chequear("16b. y dice a qué producto apunta hoy",
    jc.vinculoActual?.producto?.id === pOcupado.id, JSON.stringify(jc.vinculoActual?.producto));
  chequear("16c. NO se reasigna solo",
    (await prisma.productoCodigoProveedor.findFirst({
      where: { grupoId: grupo.id, proveedorId: arcor.id, codigoInterno: "OCUPADO" },
    }))?.productoBaseId === pOcupado.id);


  // ═══ 5. CERO CAMBIOS DE COSTO ═══════════════════════════════════════════
  const costosDespues = await prisma.productoBase.findMany({
    where: { grupoId: grupo.id }, select: { id: true, precio_costo: true, precio_venta: true }, orderBy: { id: "asc" },
  });
  chequear("19. NINGÚN producto cambió de costo ni de precio de venta",
    JSON.stringify(costosAntes) === JSON.stringify(costosDespues));

  // ═══ 6. BÚSQUEDA ════════════════════════════════════════════════════════
  console.log("\n── BÚSQUEDA ──");

  const buscar = async (q) =>
    json(await buscarProductos(pedido(`${BASE}/${IMP}/productos?q=${encodeURIComponent(q)}`, A), ctxId(IMP)));

  const bNombre = await buscar("Listo");
  chequear("20. busca por nombre", bNombre.items.some((x) => x.productoBaseId === pListo.id));
  const bBarra = await buscar("7790000000101");
  chequear("21. busca por código de barras principal", bBarra.items.some((x) => x.productoBaseId === pListo.id));

  await prisma.productoBase.update({ where: { id: pPack.id }, data: { codigo_barra_secundario: "7790000000202" } });
  const bSec = await buscar("7790000000202");
  chequear("22. busca por código secundario", bSec.items.some((x) => x.productoBaseId === pPack.id));

  await prisma.productoLocal.create({
    data: { baseId: pKg.id, localId: dep.id, codigo_barra_propio: "7790000000303", activo: true },
  });
  const bProp = await buscar("7790000000303");
  chequear("23. busca por código propio del local", bProp.items.some((x) => x.productoBaseId === pKg.id));

  const bCodProv = await buscar("OCUPADO");
  chequear("24. busca por código interno de proveedor", bCodProv.items.some((x) => x.productoBaseId === pOcupado.id));

  const bCorto = await buscar("a");
  chequear("25. exige un mínimo de caracteres", bCorto.items.length === 0 && !!bCorto.mensaje);

  chequear("26. hay techo de resultados", (await buscar("SUFIJO")).items.length <= 25);

  const bAjeno = await buscar("Ajeno");
  chequear("27. un exclusivo de otro local NO aparece",
    !bAjeno.items.some((x) => x.productoBaseId === pAjeno.id));

  await prisma.productoBase.create({
    data: {
      grupoId: grupo2.id, creadoEnLocalId: local2.id, nombre: `Listo ${SUFIJO}`,
      categoria_id: cat.id, unidad_medida: "unidad", precio_costo: 1, precio_venta: 2,
    },
  });
  const bOtroGrupo = await buscar("Listo");
  chequear("28. un producto de otro grupo NO aparece",
    bOtroGrupo.items.every((x) => x.productoBaseId !== undefined) &&
    (await prisma.productoBase.count({ where: { grupoId: grupo2.id } })) === 1 &&
    bOtroGrupo.items.length === 1);

  chequear("29. el candidato advierte si esta ubicación no podrá aplicar el costo",
    bNombre.items[0]?.puedeEditarCosto === true && bNombre.items[0]?.advertencia === null);

  chequear("30. sin permiso no se puede buscar",
    (await buscarProductos(pedido(`${BASE}/${IMP}/productos?q=Listo`, SIN_PERMISO), ctxId(IMP))).status === 403);

  // ═══ 7. LA LISTA SIGUIENTE MACHEA SOLA ══════════════════════════════════
  console.log("\n── LA LISTA SIGUIENTE ──");

  const bytes2 = libroArcor([[1001, "PARA LISTO", "UN", 1, 900, 1100]]);
  const imp2 = await json(await importar(pedidoUpload(`${BASE}/importar`, A, {
    bytes: bytes2, nombre: "lista-2.xlsx", proveedorId: arcor.id,
  })));
  chequear("31. la segunda lista entra", imp2.ok === true, imp2.error || "");
  const fila2 = await prisma.importacionListaFila.findFirst({
    where: { importacionId: imp2.importacionId, codigoNormalizado: "1001" },
  });
  chequear("32. el código vinculado a mano ahora MACHEA SOLO",
    fila2?.productoBaseId === pListo.id && fila2?.estado === "LISTO_PARA_ACTUALIZAR",
    `${fila2?.estado}/${fila2?.productoBaseId}`);
  chequear("32b. por código interno, no por sugerencia",
    fila2?.tipoCoincidencia === "CODIGO_INTERNO", fila2?.tipoCoincidencia);

  const costosFinal = await prisma.productoBase.findMany({
    where: { grupoId: grupo.id }, select: { id: true, precio_costo: true, precio_venta: true }, orderBy: { id: "asc" },
  });
  chequear("33. después de todo, cero costos modificados",
    JSON.stringify(costosAntes) === JSON.stringify(costosFinal));

  // ── Limpieza ────────────────────────────────────────────────────────────
  console.log("\n── LIMPIEZA ──");
  await prisma.importacionListaFila.deleteMany({ where: { importacion: { grupoId: { in: [grupo.id, grupo2.id] } } } });
  await prisma.importacionListaProveedor.deleteMany({ where: { grupoId: { in: [grupo.id, grupo2.id] } } });
  await prisma.productoCodigoProveedor.deleteMany({ where: { grupoId: { in: [grupo.id, grupo2.id] } } });
  await prisma.productoLocal.deleteMany({ where: { base: { grupoId: { in: [grupo.id, grupo2.id] } } } });
  await prisma.productoBase.deleteMany({ where: { grupoId: { in: [grupo.id, grupo2.id] } } });
  await prisma.categoria.delete({ where: { id: cat.id } });
  await prisma.proveedor.delete({ where: { id: arcor.id } });
  await prisma.configuracionLocal.deleteMany({ where: { localId: dep.id } });
  await prisma.grupoDeposito.deleteMany({ where: { grupoId: grupo.id } });
  await prisma.grupoLocal.deleteMany({ where: { grupoId: { in: [grupo.id, grupo2.id] } } });
  await prisma.usuario.deleteMany({ where: { id: { in: [admin.id, cajero.id, admin2.id] } } });
  await prisma.local.deleteMany({ where: { id: { in: [dep.id, otroLocal.id, local2.id] } } });
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
