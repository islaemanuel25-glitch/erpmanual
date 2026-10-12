// Candados de la FRONTERA de Azul Chat: lo que el módulo no puede tocar.
//
// Miran el código fuente SIN COMENTARIOS: los comentarios de este módulo
// nombran a propósito `erpazul_sesion`, `AUTH_SECRET` y compañía para explicar
// por qué no se usan, y un candado que los leyera como código daría rojo por
// prosa —o, peor, verde por prosa—.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/frontera.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { CAPACIDADES, capacidadDelCatalogo } from "./capacidades.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DIR = "lib/integraciones/azul-chat";

const sinComentarios = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const leer = (rel) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

/** Los archivos del módulo, trackeados o no: un archivo nuevo sin commitear también cuenta. */
function archivosDelModulo() {
  const salida = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", `${DIR}/*.js`], { cwd: RAIZ, encoding: "utf8" });
  return salida.split("\n").map((s) => s.trim()).filter((s) => s && fs.existsSync(path.join(RAIZ, s)));
}

test("el módulo tiene los archivos que este candado espera mirar", () => {
  const nombres = archivosDelModulo().map((f) => path.basename(f)).sort();
  for (const esperado of [
    "atender.js", "autenticacionAplicacion.js", "autorizacion.js", "capacidades.js", "servidor.js", "ventasResumen.js", "miAlcance.js",
    "transferenciasEventos.js", "cursorDeEventos.js", "pedidosEventos.js", "enviosEventos.js", "cancelacionesEventos.js",
    "cajasResumen.js", "cajasResumenServer.js", "stockConsulta.js", "stockConsultaServer.js", "pedidosPendientes.js",
  ]) {
    assert.ok(nombres.includes(esperado), `falta ${esperado}: ${nombres.join(", ")}`);
  }
});

// Las capacidades que NO piden permiso propio, cada una con su motivo. Es una
// lista y no un `if`: agregar otra es una decisión que tiene que leerse acá.
const SIN_PERMISO_PROPIO = Object.freeze({
  mi_alcance: {
    motivo: "devuelve el nombre y el alcance territorial de la persona, que el ERP le muestra a cualquiera con sesión",
    // Las rutas del ERP que muestran lo mismo sin pedir permiso.
    equivalentes: ["app/api/contexto-activo/get/route.js", "app/api/grupos/opciones/route.js"],
  },
});

test("el catálogo es cerrado: ventas_resumen, mi_alcance, las cuatro de eventos, cajas_resumen, stock_consulta y pedidos_pendientes, congelado y de solo lectura", () => {
  // transferencias_eventos entró el 2026-10-07 (Tanda 1 de TRANSFERENCIA_RECIBIDA).
  // pedidos_eventos, envios_eventos y cancelaciones_eventos, el 2026-10-11 (Tanda 4A).
  // cajas_resumen, el 2026-10-11 (Tanda 7A). stock_consulta, el 2026-10-12 (Tanda 8A).
  // pedidos_pendientes, el 2026-10-12 (Tanda 9A).
  assert.deepEqual(Object.keys(CAPACIDADES), [
    "ventas_resumen", "mi_alcance", "transferencias_eventos", "pedidos_eventos", "envios_eventos", "cancelaciones_eventos", "cajas_resumen",
    "stock_consulta", "pedidos_pendientes",
  ]);
  assert.ok(Object.isFrozen(CAPACIDADES));
  for (const [nombre, cap] of Object.entries(CAPACIDADES)) {
    assert.equal(cap.soloLectura, true, `${nombre}: V1 es solo lectura`);
    assert.ok(Object.isFrozen(cap) && Object.isFrozen(cap.permisos) && Object.isFrozen(cap.parametros), nombre);
    assert.equal(typeof cap.pideLocal, "boolean", `${nombre}: declara si es sobre un local`);
    assert.ok(!cap.permisos.includes("*"), `${nombre}: nunca el comodín`);
    if (Object.prototype.hasOwnProperty.call(SIN_PERMISO_PROPIO, nombre)) {
      assert.deepEqual([...cap.permisos], [], `${nombre} está exenta: no declara permisos`);
      assert.equal(cap.pideLocal, false, `${nombre}: una capacidad sin permiso no puede ser sobre un local elegido`);
    } else {
      assert.ok(cap.permisos.length > 0, `${nombre}: pide un permiso concreto`);
    }
  }
  assert.throws(() => {
    "use strict";
    CAPACIDADES.ejecutar_sql = { permisos: [] };
  });
  assert.equal(capacidadDelCatalogo("ejecutar_sql"), null);
});

test("la exención de mi_alcance es cierta: las rutas del ERP que muestran lo mismo no piden permiso", () => {
  for (const [nombre, { equivalentes }] of Object.entries(SIN_PERMISO_PROPIO)) {
    for (const ruta of equivalentes) {
      const src = leer(ruta);
      assert.match(src, /getUsuarioSession\(req\)/, `${ruta}: dejó de pedir sesión`);
      assert.ok(!/checkPerm|requirePerm|requireAdmin|permisos\.includes/.test(src), `${ruta} ahora pide un permiso: la exención de ${nombre} dejó de ser cierta`);
    }
  }
});

test("mi_alcance usa la regla de alcance de la puerta, no una copia", () => {
  const src = leer(`${DIR}/miAlcance.js`);
  assert.match(src, /import \{[^}]*localEnAlcance[^}]*\} from "\.\/autorizacion\.js"/);
  assert.match(src, /localEnAlcance\(autorizacion\.alcance, localId, grupoId\)/);
  // Nada del rol ni del comodín: el alcance llega decidido en la autorización.
  for (const copia of [/esAdmin/, /permisos/, /"\*"/, /rol\b/, /localFijo/]) assert.ok(!copia.test(src), `miAlcance reescribe ${copia}`);
  // La regla vive una vez: solo autorizacion.js decide los modos.
  const decideModos = archivosDelModulo().filter((f) => /modo:\s*"GLOBAL"\s*\}/.test(leer(f)) && /esAdmin/.test(leer(f)));
  assert.deepEqual(decideModos.map((f) => path.basename(f)), ["autorizacion.js"]);
});

test("las capacidades que anuncia mi_alcance salen de UNA regla de permiso, la de la puerta, y del catálogo", () => {
  const autz = leer(`${DIR}/autorizacion.js`);
  // La regla de permiso de la integración se escribe una vez: un solo `checkPerm` en el módulo, dentro de `capacidadPermitida`.
  const conCheckPerm = archivosDelModulo().filter((f) => /checkPerm\(/.test(leer(f)));
  assert.deepEqual(conCheckPerm.map((f) => path.basename(f)), ["autorizacion.js"], "checkPerm fuera de autorizacion.js");
  assert.equal((autz.match(/checkPerm\(/g) || []).length, 1, "un solo checkPerm: el de capacidadPermitida");
  assert.match(autz, /export function capacidadPermitida\(capacidad, sesionActual\) \{\s*return capacidad\.permisos\.length === 0 \|\| checkPerm\(sesionActual, capacidad\.permisos\)\.ok;/);
  // La puerta y el anuncio usan esa misma función.
  assert.match(autz, /if \(!capacidadPermitida\(capacidad, sesionActual\)\) \{\s*return rechazo\(403, "SIN_PERMISO"/);
  assert.match(autz, /capacidad\.pideLocal === true && capacidadPermitida\(capacidad, sesionActual\)/);
  // El anuncio recorre EL catálogo: el de capacidades.js, por defecto, no una lista propia.
  assert.match(autz, /export function capacidadesSobreUnLocal\(sesionActual, catalogo = CAPACIDADES\)/);
  assert.match(autz, /capacidadesSobreUnLocal: capacidadesSobreUnLocal\(sesionActual\)/, "la puerta la llama con el catálogo real");
  assert.doesNotMatch(autz, /"transferencias_eventos"|"ventas_resumen"/, "la autorización no nombra capacidades: las recorre");
  // mi_alcance no calcula nada de esto: lo recibe decidido.
  const alcance = leer(`${DIR}/miAlcance.js`);
  assert.doesNotMatch(alcance, /capacidades\.js|checkPerm|capacidadPermitida|CAPACIDADES|"transferencias_eventos"/);
  assert.match(alcance, /capacidades: autorizacion\.capacidadesSobreUnLocal \?\? \[\]/);
  // Solo una capacidad que NO es sobre un local puede anunciar: hoy, mi_alcance.
  const anuncian = Object.entries(CAPACIDADES).filter(([, c]) => c.anunciaCapacidades === true).map(([n]) => n);
  assert.deepEqual(anuncian, ["mi_alcance"]);
  for (const n of anuncian) assert.equal(CAPACIDADES[n].pideLocal, false, `${n} anuncia y es sobre un local`);
});

test("ventas_resumen pide el MISMO permiso que el reporte del ERP del que sale", () => {
  const ruta = leer("app/api/reportes-ventas/general/route.js");
  const m = ruta.match(/checkPerm\(session,\s*"([^"]+)"\)/);
  assert.ok(m, "el reporte dejó de pedir un permiso con checkPerm");
  assert.deepEqual([...CAPACIDADES.ventas_resumen.permisos], [m[1]]);
});

test("transferencias_eventos pide el MISMO permiso que las rutas del ERP que muestran transferencias", () => {
  // Las cuatro pantallas de lectura. Si alguna cambia de permiso, la capacidad
  // tiene que acompañarla: la integración no ve más que la persona en su ERP.
  for (const ruta of [
    "app/api/transferencias/listar/route.js",
    "app/api/transferencias/detalle/route.js",
    "app/api/transferencias/tablero/route.js",
    "app/api/transferencias/por-destino/route.js",
  ]) {
    const m = leer(ruta).match(/checkPerm\(session,\s*"([^"]+)"\)/);
    assert.ok(m, `${ruta} dejó de pedir un permiso con checkPerm`);
    assert.deepEqual([...CAPACIDADES.transferencias_eventos.permisos], [m[1]], ruta);
  }
  assert.equal(CAPACIDADES.transferencias_eventos.pideLocal, true, "es sobre UN local, con el chequeo territorial de la puerta");
  assert.deepEqual([...CAPACIDADES.transferencias_eventos.parametros], ["desde", "limite"]);
});

// Tanda 4A. Cada capacidad nueva pide el permiso de LECTURA de la pantalla donde
// la persona ve ese dato en su ERP. Las rutas se leen: si una cambia de permiso,
// la capacidad tiene que acompañarla.
const PERMISO_POR_PANTALLA = Object.freeze({
  // Donde el local ve SUS pedidos. Escriben el chequeo a mano, no con checkPerm.
  pedidos_eventos: { rutas: ["app/api/pedidos/historial/route.js", "app/api/pedidos/carrito/route.js"], patron: /permisos\.includes\("([a-z_.]+)"\)\)\s*\{\s*return NextResponse\.json\(\s*\{ ok: false, error: "Sin permiso para ver pedidos" \}/ },
  // Las pantallas de Transferencias, las mismas que transferencias_eventos.
  envios_eventos: { rutas: ["app/api/transferencias/listar/route.js", "app/api/transferencias/detalle/route.js", "app/api/transferencias/por-destino/route.js"], patron: /checkPerm\(session,\s*"([^"]+)"\)/ },
  cancelaciones_eventos: { rutas: ["app/api/transferencias/detalle/route.js", "app/api/transferencias/listar/route.js"], patron: /checkPerm\(session,\s*"([^"]+)"\)/ },
});

test("4A. pedidos, envíos y cancelaciones piden el MISMO permiso que las pantallas del ERP que los muestran", () => {
  for (const [capacidad, { rutas, patron }] of Object.entries(PERMISO_POR_PANTALLA)) {
    for (const ruta of rutas) {
      const m = leer(ruta).match(patron);
      assert.ok(m, `${ruta} dejó de pedir su permiso de lectura de la forma esperada`);
      assert.deepEqual([...CAPACIDADES[capacidad].permisos], [m[1]], `${capacidad} / ${ruta}`);
    }
    assert.equal(CAPACIDADES[capacidad].pideLocal, true, `${capacidad}: es sobre UN local`);
    assert.deepEqual([...CAPACIDADES[capacidad].parametros], ["desde", "limite"], capacidad);
  }
});

// Tanda 9A. `pedidos_pendientes` se ve en las mismas pantallas que
// `pedidos_eventos` —el carrito avisa del pedido pendiente—, así que pide el
// mismo permiso, leído de las rutas con el mismo patrón.
test("9A. pedidos_pendientes pide pedidos.ver, el permiso de historial y carrito; sobre un local y sin parámetros", () => {
  const { rutas, patron } = PERMISO_POR_PANTALLA.pedidos_eventos;
  for (const ruta of rutas) {
    const m = leer(ruta).match(patron);
    assert.ok(m, `${ruta} dejó de pedir su permiso de lectura de la forma esperada`);
    assert.deepEqual([...CAPACIDADES.pedidos_pendientes.permisos], [m[1]], ruta);
  }
  assert.equal(CAPACIDADES.pedidos_pendientes.pideLocal, true);
  assert.deepEqual([...CAPACIDADES.pedidos_pendientes.parametros], []);
});

test("4A. CONTRAPRUEBA: el patrón de pedidos atrapa otro permiso y no lee un comentario", () => {
  const { patron } = PERMISO_POR_PANTALLA.pedidos_eventos;
  const real = leer("app/api/pedidos/historial/route.js");
  assert.equal(real.match(patron)[1], "pedidos.ver");
  assert.equal(real.replace('includes("pedidos.ver")', 'includes("pedidos.otro")').match(patron)[1], "pedidos.otro");
  assert.equal(sinComentarios(`// if (!permisos.includes("pedidos.ver")) { return NextResponse.json({ ok: false, error: "Sin permiso para ver pedidos" }`).match(patron), null);
});

// Tanda 7A. Las pantallas que muestran cajas piden permisos distintos; la
// capacidad toma el de Tesorería, que es el más restrictivo —ningún rol del
// sistema lo trae— y además la lectura de la que salen estas cajas.
const PATRON_TESORERIA = /const perm = checkPerm\(session, PERMISO_VER_TESORERIA\);\s*if \(!perm\.ok\)/;

test("7A. cajas_resumen pide el permiso de la pantalla de Tesorería, el más restrictivo de las que muestran cajas", async () => {
  const ruta = leer("app/api/finanzas/tesoreria/route.js");
  assert.match(ruta, PATRON_TESORERIA, "Tesorería dejó de pedir PERMISO_VER_TESORERIA de la forma esperada");
  const { PERMISO_VER_TESORERIA } = await import("../../tesoreria/permisos.js");
  assert.deepEqual([...CAPACIDADES.cajas_resumen.permisos], [PERMISO_VER_TESORERIA]);
  // Las otras pantallas de cajas piden permisos que SÍ traen roles del sistema
  // (o el mismo Admin): tesoreria.ver no está en ninguno, así que es el más
  // restrictivo. Si algún rol lo recibe, esta elección hay que volver a mirarla.
  const { DEFAULT_PERMISOS_SISTEMA } = await import("../../rbac/systemRoles.js");
  const roles = Object.entries(DEFAULT_PERMISOS_SISTEMA).filter(([, permisos]) => permisos.includes(PERMISO_VER_TESORERIA)).map(([rol]) => rol);
  assert.deepEqual(roles, [], "un rol del sistema trae tesoreria.ver");
  assert.match(leer("lib/auditoria-pos-ventas/scope.js"), /requirePerm\(req, "reportes\.ver"\)/, "la Auditoría de cajas cambió de permiso");
  assert.ok(Object.values(DEFAULT_PERMISOS_SISTEMA).some((p) => p.includes("reportes.ver")), "reportes.ver es de roles del sistema: menos restrictivo");
  assert.equal(CAPACIDADES.cajas_resumen.pideLocal, true);
  assert.deepEqual([...CAPACIDADES.cajas_resumen.parametros], ["periodo", "turnoOperativo"]);
});

test("7A. CONTRAPRUEBA: el patrón de Tesorería no lee un comentario ni otro permiso", () => {
  const real = leer("app/api/finanzas/tesoreria/route.js");
  assert.doesNotMatch(real.replace("PERMISO_VER_TESORERIA);", "PERMISO_VERIFICAR_EFECTIVO);"), PATRON_TESORERIA);
  assert.doesNotMatch(sinComentarios("// const perm = checkPerm(session, PERMISO_VER_TESORERIA);\n if (!perm.ok)"), PATRON_TESORERIA);
});

// Tanda 8A. `stock_consulta` pide el permiso de la pantalla Stock Locales: su
// listado (de donde salen la existencia y el mínimo de cada fila) y su resumen
// (la card "Bajo mínimo") piden `stock.ver`.
const patronStockVer = () => /const perm = checkPerm\(session, "stock\.ver"\);\s*if \(!perm\.ok\)/;

test("8A. stock_consulta pide stock.ver, el permiso del listado y del resumen de Stock Locales", () => {
  for (const ruta of ["app/api/stock_locales/listar/route.js", "app/api/stock_locales/resumen/route.js"]) {
    assert.match(leer(ruta), patronStockVer(), `${ruta} dejó de pedir stock.ver de la forma esperada`);
  }
  assert.match(leer("app/modulos/stock_locales/page.jsx"), /permisosSt\.includes\("stock\.ver"\)/, "la pantalla cambió de permiso");
  assert.deepEqual([...CAPACIDADES.stock_consulta.permisos], ["stock.ver"]);
  assert.equal(CAPACIDADES.stock_consulta.pideLocal, true);
  assert.deepEqual([...CAPACIDADES.stock_consulta.parametros], ["modo", "texto"]);
});

test("8A. CONTRAPRUEBA: el patrón de stock.ver no lee otro permiso ni un comentario", () => {
  const real = leer("app/api/stock_locales/listar/route.js");
  assert.doesNotMatch(real.replace('checkPerm(session, "stock.ver")', 'checkPerm(session, "stock.editar")'), patronStockVer());
  assert.doesNotMatch(sinComentarios('// const perm = checkPerm(session, "stock.ver");\n if (!perm.ok)'), patronStockVer());
});

// Tanda 8A. Ningún número nuevo: la búsqueda es el buscador de productos del
// ERP, la fila de stock la arma el mismo `mapItem` del listado y la cantidad se
// lee con la misma presentación que la tabla y la tarjeta móvil.
const PIEZAS_DE_STOCK = Object.freeze({
  buscarCatalogoLocal: ["app/api/pos-transferencias/buscarProductos/route.js", "app/api/transferencias/buscar-productos-origen/route.js"],
  whereCatalogoLocal: [],
  mapStockItemLocal: ["app/api/stock_locales/listar/route.js"],
  mapStockItemDeposito: ["app/api/stock_locales/listar/route.js"],
  presentacionCantidadStock: ["components/stock_locales/TablaStock.jsx", "components/stock_locales/TarjetaStockMovil.jsx"],
  getUnidadLocal: ["components/stock_locales/TablaStock.jsx"],
  getUnidadDeposito: ["components/stock_locales/TablaStock.jsx", "components/stock_locales/TarjetaStockMovil.jsx"],
});

/** Lo que `stock_consulta` NO puede escribir al lado: copias de las piezas de arriba. */
const COPIAS_DE_STOCK = Object.freeze([
  /rankearLiteral|resolverContraCatalogo|codigosDeProductoLocal|orCodigoBarraProductoLocal/, // el buscador
  /productoVisibleWhere/, // el universo
  /fromUnidades|textoDeBultos|formatCantidad|esPackDeposito/, // la presentación
  /cantidad\s*<\s*\w*\.?stockMin|limitesConfiguradosAt\s*!=\s*null/, // la condición de faltante
  /precio|costo|margen|valoriz/i, // nada de dinero
]);

function revisarPiezasDeStock(fuentes) {
  const capacidad = fuentes.join("\n");
  const faltan = Object.keys(PIEZAS_DE_STOCK).filter((p) => !new RegExp(`\\b${p}\\(`).test(capacidad));
  const copias = COPIAS_DE_STOCK.filter((p) => p.test(capacidad)).map(String);
  return { faltan, copias };
}

test("8A. stock_consulta usa las piezas de la pantalla de stock y del buscador, sin copias", () => {
  const fuentes = [leer(`${DIR}/stockConsulta.js`), leer(`${DIR}/stockConsultaServer.js`)];
  assert.deepEqual(revisarPiezasDeStock(fuentes), { faltan: [], copias: [] });
  // Y las pantallas siguen usando las mismas: si una dejara su pieza, esta
  // capacidad dejaría de decir lo que la pantalla muestra sin que nada fallara.
  for (const [pieza, usuarios] of Object.entries(PIEZAS_DE_STOCK)) {
    for (const u of usuarios) assert.match(leer(u), new RegExp(`\\b${pieza}\\(`), `${u} dejó de usar ${pieza}`);
  }
  // La condición de faltante es UNA: la de `mapItem` es la de la card del resumen
  // (`estadosDeStock.test.mjs` las compara). Acá se lee el `faltante` de mapItem.
  assert.match(fuentes[1], /\.filter\(\(\{ item \}\) => item\.faltante\)/);
});

test("8A. CONTRAPRUEBA: el candado de piezas ve una búsqueda o una presentación escritas al lado", () => {
  const real = [leer(`${DIR}/stockConsulta.js`), leer(`${DIR}/stockConsultaServer.js`)];
  const sinBuscador = real.map((s) => s.replace(/buscarCatalogoLocal\(/g, "rankearLiteral("));
  const r1 = revisarPiezasDeStock(sinBuscador);
  assert.ok(r1.faltan.includes("buscarCatalogoLocal") && r1.copias.length > 0, JSON.stringify(r1));
  const conCopia = [...real, "const t = `${fromUnidades({ unidades, factorPack }).bultos} bultos`;"];
  assert.ok(revisarPiezasDeStock(conCopia).copias.length > 0);
  const conPrecio = [...real, "const x = item.precioVenta;"];
  assert.ok(revisarPiezasDeStock(conPrecio).copias.length > 0);
});

test("cada capacidad tiene un ejecutor en el servidor, y no hay ejecutores de más", () => {
  const src = leer(`${DIR}/servidor.js`);
  const bloque = src.split(/export const ejecutoresErp = Object\.freeze\(\{/)[1]?.split(/\n\}\);/)[0];
  assert.ok(bloque, "no se encontró ejecutoresErp");
  const claves = [...bloque.matchAll(/^\s{2}([a-z_]+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(claves, Object.keys(CAPACIDADES).sort());
});

test("ningún archivo del módulo usa la sesión, las cookies ni el contexto del ERP", () => {
  const prohibidos = [
    /getUsuarioSession/, /getCookieValue/, /getTokenFromRequest/, /verificarToken/, /firmarToken/,
    /jsonwebtoken/, /erpazul_/, /getContextoActivo/, /resolveVistaOperativa/, /resolveLocalAndGrupo/,
    /resolveScope/, /@\/lib\/auth"/, /@\/lib\/contexto"/, /headers\.get\(\s*["']cookie/i, /["']authorization["']/i,
  ];
  for (const f of archivosDelModulo()) {
    const src = leer(f);
    for (const p of prohibidos) assert.ok(!p.test(src), `${f} usa ${p}`);
  }
});

test("AUTH_SECRET aparece solo para rechazarlo, y solo en la autenticación de la aplicación", () => {
  for (const f of archivosDelModulo()) {
    const src = leer(f);
    if (path.basename(f) === "autenticacionAplicacion.js") {
      // Una sola lectura, y es para comparar y apagar la integración.
      assert.equal((src.match(/AUTH_SECRET/g) || []).length, 2, f);
      assert.match(src, /String\(secreto\) === String\(entorno\.AUTH_SECRET\)/);
    } else {
      assert.ok(!src.includes("AUTH_SECRET"), `${f} menciona AUTH_SECRET`);
    }
  }
});

test("solo lectura: ningún archivo del módulo escribe ni consulta crudo", () => {
  // Sobre un cliente de base (`prisma.x.update(`, `db.x.create(`): el `.update(`
  // del HMAC no es una escritura.
  const escritura = /\b(prisma|db|tx)\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\$queryRaw|\$transaction/;
  for (const f of archivosDelModulo()) {
    assert.ok(!escritura.test(leer(f)), `${f} escribe o consulta crudo`);
  }
});

test("las consultas del servidor son las declaradas, sobre modelos fijos", () => {
  const servidor = leer(`${DIR}/servidor.js`);
  const servicio = leer(`${DIR}/ventasResumen.js`);
  const alcance = leer(`${DIR}/miAlcance.js`);
  // Desde el canje son dos: la delegación por el hash de su token (con su
  // vínculo) y el usuario. Las dos son `findUnique` por clave única.
  assert.deepEqual([...servidor.matchAll(/prisma\.(\w+)\.(\w+)\(/g)].map((m) => `${m[1]}.${m[2]}`), [
    "delegacionIntegracion.findUnique",
    "usuario.findUnique",
  ]);
  assert.match(servidor, /delegacionIntegracion\.findUnique\(\{\s*where: \{ tokenHash \}/);
  assert.deepEqual([...servicio.matchAll(/db\.(\w+)\./g)].map((m) => m[1]).sort(), ["local", "venta"]);
  // mi_alcance: el nombre de la persona, las filas de grupo y los locales. Solo leer.
  assert.deepEqual([...alcance.matchAll(/db\.(\w+)\.(\w+)\(/g)].map((m) => `${m[1]}.${m[2]}`).sort(), [
    "grupoDeposito.findMany",
    "grupoLocal.findMany",
    "local.findMany",
    "usuario.findUnique",
  ]);
  // Las capacidades de eventos: el nombre del local lo lee UNA vez el cursor
  // compartido (Tanda 4A: salió de transferenciasEventos.js sin cambiar), y
  // cada capacidad lee su tabla, fija. Solo leer.
  const consultasDe = (archivo) => [...leer(`${DIR}/${archivo}`).matchAll(/db\.(\w+)\.(\w+)\(/g)].map((m) => `${m[1]}.${m[2]}`).sort();
  assert.deepEqual(consultasDe("cursorDeEventos.js"), ["local.findUnique"]);
  assert.deepEqual(consultasDe("transferenciasEventos.js"), ["transferencia.findMany"]);
  assert.deepEqual(consultasDe("pedidosEventos.js"), ["posTransferencia.findMany"]);
  assert.deepEqual(consultasDe("enviosEventos.js"), ["transferencia.findMany"]);
  assert.deepEqual(consultasDe("cancelacionesEventos.js"), ["transferencia.findMany"]);
  for (const archivo of ["transferenciasEventos.js", "pedidosEventos.js", "enviosEventos.js", "cancelacionesEventos.js"]) {
    assert.match(leer(`${DIR}/${archivo}`), /localDeLaAutorizacion\(db, autorizacion\)|ejecutarEventos\(\{\s*autorizacion,/, `${archivo}: el local sale de la autorización`);
  }
  // cajas_resumen (Tanda 7A): el armado no consulta; el servidor lee el local,
  // los turnos operativos del local y lo que Tesorería no mira, sobre ids que
  // ya trajo la lectura. La lectura misma la hacen las funciones de Tesorería.
  assert.deepEqual(consultasDe("cajasResumen.js"), []);
  assert.deepEqual(consultasDe("cajasResumenServer.js"), [
    "arqueoCaja.findMany", "cajaMovimiento.findMany", "local.findUnique", "turno.findMany", "turnoOperativo.findMany", "venta.findMany",
  ]);
  assert.match(leer(`${DIR}/cajasResumenServer.js`), /where: \{ id: autorizacion\.localId \}/, "cajas_resumen: el local sale de la autorización");
  // stock_consulta (Tanda 8A): el armado no consulta; el servidor lee el local
  // y las filas de stock del local. La búsqueda la hace `buscarCatalogoLocal`.
  assert.deepEqual(consultasDe("stockConsulta.js"), []);
  assert.deepEqual(consultasDe("stockConsultaServer.js"), ["local.findUnique", "productoLocal.findMany", "productoLocal.findMany"]);
  assert.match(leer(`${DIR}/stockConsultaServer.js`), /where: \{ id: autorizacion\.localId \}/, "stock_consulta: el local sale de la autorización");
  // pedidos_pendientes (Tanda 9A): el local lo lee `localDeLaAutorizacion`, y
  // la capacidad lee sus pedidos, sin los cancelados.
  assert.deepEqual(consultasDe("pedidosPendientes.js"), ["posTransferencia.findMany"]);
  assert.match(leer(`${DIR}/pedidosPendientes.js`), /localDeLaAutorizacion\(db, autorizacion\)/, "pedidos_pendientes: el local sale de la autorización");
  assert.match(leer(`${DIR}/pedidosPendientes.js`), /where: sinCancelados\(\{ destinoId: local\.id, estado: ESTADO_PEDIDO\.SOLICITADO \}\)/);
  // Nada elige el modelo con una clave dinámica: `prisma[algo]` o `db[algo]`.
  for (const f of archivosDelModulo()) assert.ok(!/\b(prisma|db)\[/.test(leer(f)), f);
});

test("ventas_resumen usa la pieza compartida con el reporte, no una copia", () => {
  const servicio = leer(`${DIR}/ventasResumen.js`);
  const ruta = leer("app/api/reportes-ventas/general/route.js");
  for (const pieza of ["whereVentasDelPeriodo", "SELECT_RESUMEN_VENTA", "resumirVentas", "desglosarPorMedio"]) {
    assert.ok(servicio.includes(pieza), `el servicio no usa ${pieza}`);
    assert.ok(ruta.includes(pieza), `el reporte no usa ${pieza}`);
  }
  // Ni el filtro ni la suma escritos al lado.
  for (const copia of [/whereVentaComercial\(/, /tendersParaAgregar\(/, /getRangoArgentina\(/, /anuladaEn/, /transferencia:/]) {
    assert.ok(!copia.test(servicio), `el servicio reescribe ${copia}`);
  }
});

test("transferencias_eventos usa las piezas compartidas con Transferencias, no copias", () => {
  const eventos = leer(`${DIR}/transferenciasEventos.js`);
  // El estado, el select y el conteo de diferencias salen de donde los define
  // el módulo de Transferencias. Una copia sería otra definición esperando a
  // divergir (regla 1).
  for (const pieza of ["ESTADO_RECIBIDA", "SELECT_TRANSFERENCIA_DE_LA_CUENTA", "contarLineasConDiferencia"]) {
    assert.ok(eventos.includes(pieza), `transferenciasEventos no usa ${pieza}`);
  }
  for (const copia of [/"Recibida"/, /diferenciaDeLinea\(/, /fisicas(Enviadas|Recibidas)De\(/, /tieneDiferencias:\s*contarLineas/, /0\.0005/]) {
    assert.ok(!copia.test(eventos), `transferenciasEventos reescribe ${copia}`);
  }
  // Es un evento del local que RECIBIÓ: filtra por destino y nunca por origen.
  assert.match(eventos, /destinoId:\s*localId/);
  assert.doesNotMatch(eventos, /origenId/);
});

test("el margen de 60 s de transferencias_eventos sigue en pie, y su supuesto también", () => {
  const eventos = leer(`${DIR}/transferenciasEventos.js`);
  // 1 · el margen existe, vale 60 s y la consulta lo aplica como cota superior.
  assert.match(eventos, /export const MARGEN_DE_VISIBILIDAD_MS = 60 \* 1000;/);
  assert.match(eventos, /return new Date\(ahora - MARGEN_DE_VISIBILIDAD_MS\)/);
  assert.match(eventos, /fechaRecepcion: \{ not: null, lte: hasta \}/);
  assert.match(eventos, /where: whereEventos\(\{ localId: local\.id, desde, hasta \}\)/);
  // 2 · el SUPUESTO del margen: la transacción que escribe `fechaRecepcion`
  //     termina en segundos. Hoy usa el timeout por defecto de Prisma (5 s). Si
  //     alguien le pone un timeout, o el cliente uno global, el margen puede
  //     quedar corto sin que nada lo avise: este candado lo avisa.
  const confirmar = leer("app/api/transferencias/confirmar-recepcion/route.js");
  assert.equal((confirmar.match(/\$transaction\(/g) || []).length, 1, "confirmar-recepcion tiene una sola transacción");
  assert.doesNotMatch(confirmar, /\btimeout\s*:|\bmaxWait\s*:/, "confirmar-recepcion fijó un timeout de transacción: revisar MARGEN_DE_VISIBILIDAD_MS");
  assert.doesNotMatch(leer("lib/prisma.js"), /transactionOptions|\btimeout\s*:/, "el cliente fijó un timeout global: revisar MARGEN_DE_VISIBILIDAD_MS");
  // 3 · `fechaRecepcion` la escribe solo confirmar-recepcion (el hecho tiene un solo autor).
  const escriben = execFileSync("git", ["grep", "-l", "--untracked", "-E", "fechaRecepcion:\\s*new Date", "--", "app", "lib"], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.endsWith(".test.mjs"));
  assert.deepEqual(escriben, ["app/api/transferencias/confirmar-recepcion/route.js"]);
});

// ── Tanda 4A: los márgenes de pedidos, envíos y cancelaciones ─────────────
//
// Cada capacidad nueva publica una fecha que escribe OTRA ruta del ERP. El
// margen de 60 s solo alcanza si esa escritura se hace visible antes: estos
// candados fijan quién escribe cada columna y cuánto puede tardar su
// transacción. Un escritor nuevo, o un timeout más largo, los pone en rojo.

/** Los archivos de app/ y lib/ (sin tests) cuyo código escribe ese patrón, trackeados o no. */
const quienesEscriben = (patron) =>
  execFileSync("git", ["grep", "-l", "--untracked", "-E", patron, "--", "app", "lib"], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.endsWith(".test.mjs"))
    .filter((f) => new RegExp(patron).test(leer(f)));

const EVENTOS_4A = Object.freeze({
  "pedidosEventos.js": { columna: "solicitadoAt" },
  "enviosEventos.js": { columna: "fechaEnvio" },
  "cancelacionesEventos.js": { columna: "canceladaEn" },
});

test("4A. cada capacidad nueva: su columna no nula con la cota del margen, del local destino y nunca del origen", () => {
  const cursor = leer(`${DIR}/cursorDeEventos.js`);
  assert.match(cursor, /return new Date\(ahora - margenMs\)/);
  assert.match(cursor, /where: whereEventos\(\{ localId: local\.id, desde, hasta \}\)/);
  for (const [archivo, { columna }] of Object.entries(EVENTOS_4A)) {
    const src = leer(`${DIR}/${archivo}`);
    assert.match(src, /export const MARGEN_DE_VISIBILIDAD_MS = 60 \* 1000;/, archivo);
    assert.match(src, /margenMs: MARGEN_DE_VISIBILIDAD_MS/, archivo);
    assert.match(src, new RegExp(`destinoId: localId, ${columna}: \\{ not: null, lte: hasta \\}`), archivo);
    assert.match(src, new RegExp(`despuesDe\\("${columna}", desde\\)`), archivo);
    assert.match(src, new RegExp(`ordenPor\\("${columna}"\\)`), archivo);
    assert.doesNotMatch(src, /origenId/, `${archivo}: el evento es del destino`);
    // Nada de productos, precios, ventas ni usuarios en lo que se lee.
    assert.doesNotMatch(src, /precio|producto|venta|usuario|solicitadoPor|creadaPor|canceladaPor|motivo/i, archivo);
  }
});

test("4A. PEDIDO_SOLICITADO: solicitadoAt la escribe solo `solicitar`, en un update fuera de una transacción interactiva", () => {
  assert.deepEqual(quienesEscriben("solicitadoAt:\\s*new Date"), ["app/api/pos-transferencias/solicitar/route.js"]);
  assert.doesNotMatch(leer("app/api/pos-transferencias/solicitar/route.js"), /\$transaction\(/, "solicitar abrió una transacción: revisar el margen de pedidos_eventos");
});

/** Lo que hace corto el margen de una transacción escritora: más de una, o un timeout propio. */
function problemasDeTransaccion(texto, nombre) {
  const p = [];
  if ((texto.match(/\$transaction\(/g) || []).length !== 1) p.push(`${nombre}: no tiene exactamente una transacción`);
  if (/\btimeout\s*:|\bmaxWait\s*:|LIMITES_TRANSACCION/.test(texto)) p.push(`${nombre}: fijó un timeout propio`);
  return p;
}

/** El envío: los dos llamadores de crearTransferencia y el timeout de la venta interna contra el margen. */
function problemasDelEnvio({ enviar, ventas, timeoutVentas, margen }) {
  const p = problemasDeTransaccion(enviar, "enviar");
  if (!/\}, LIMITES_TRANSACCION_DEL_LOCAL\);/.test(ventas)) p.push("pos-ventas/crear dejó de usar LIMITES_TRANSACCION_DEL_LOCAL");
  if (!(2 * timeoutVentas <= margen)) p.push(`timeout ${timeoutVentas} ms: el margen tiene que ser al menos el doble`);
  return p;
}

test("4A. TRANSFERENCIA_ENVIADA: fechaEnvio la escribe solo crearTransferencia, y sus transacciones tardan a lo sumo la mitad del margen", async () => {
  assert.deepEqual(quienesEscriben("fechaEnvio:\\s*new Date"), ["lib/transferencias/crearTransferencia.js"]);
  const llamadores = quienesEscriben("\\bcrearTransferencia\\(\\{").filter((f) => f !== "lib/transferencias/crearTransferencia.js");
  assert.deepEqual(llamadores, ["app/api/pos-transferencias/enviar/route.js", "app/api/pos-ventas/crear/route.js"], "otro llamador de crearTransferencia: revisar el margen de envios_eventos");
  const { LIMITES_TRANSACCION_DEL_LOCAL } = await import("../../pos-ventas/candadoDelLocal.js");
  const { MARGEN_DE_VISIBILIDAD_MS } = await import("./enviosEventos.js");
  assert.deepEqual(
    problemasDelEnvio({
      enviar: leer("app/api/pos-transferencias/enviar/route.js"),
      ventas: leer("app/api/pos-ventas/crear/route.js"),
      timeoutVentas: LIMITES_TRANSACCION_DEL_LOCAL.timeout,
      margen: MARGEN_DE_VISIBILIDAD_MS,
    }),
    []
  );
  assert.doesNotMatch(leer("lib/prisma.js"), /transactionOptions|\btimeout\s*:/, "el cliente fijó un timeout global");
});

test("4A. TRANSFERENCIA_CANCELADA: canceladaEn la escribe solo `transferencias/cancelar`, en su única transacción y con el timeout por defecto", () => {
  assert.deepEqual(quienesEscriben("canceladaEn:\\s*new Date"), ["app/api/transferencias/cancelar/route.js"]);
  const cancelar = leer("app/api/transferencias/cancelar/route.js");
  assert.deepEqual(problemasDeTransaccion(cancelar, "cancelar"), []);
  // En el MISMO update que pone el estado terminal.
  assert.match(cancelar, /estado: "Cancelada",\s*canceladaEn: new Date\(\),/);
});

test("4A. CONTRAPRUEBA: un escritor de más, un timeout largo o una segunda transacción ponen rojos los candados de márgenes", async () => {
  // Un escritor de más, de verdad: un archivo nuevo SIN COMMITEAR que escribe
  // fechaEnvio. `quienesEscriben` lo tiene que ver (--untracked).
  // Fuera del directorio del módulo, para que ningún otro candado lo cuente.
  const intruso = path.join(RAIZ, "lib/integraciones/__contraprueba_escritor_4a.js");
  fs.writeFileSync(intruso, "export const x = (tx) => tx.transferencia.update({ where: { id: 1 }, data: { fechaEnvio: new Date() } });\n");
  try {
    assert.ok(quienesEscriben("fechaEnvio:\\s*new Date").includes("lib/integraciones/__contraprueba_escritor_4a.js"));
  } finally {
    fs.rmSync(intruso, { force: true });
  }
  // Y en un comentario no cuenta.
  assert.ok(!/fechaEnvio:\s*new Date/.test(sinComentarios("// fechaEnvio: new Date()")));

  const enviar = leer("app/api/pos-transferencias/enviar/route.js");
  const ventas = leer("app/api/pos-ventas/crear/route.js");
  const base = { enviar, ventas, timeoutVentas: 30_000, margen: 60_000 };
  assert.deepEqual(problemasDelEnvio(base), []);
  assert.notDeepEqual(problemasDelEnvio({ ...base, timeoutVentas: 31_000 }), [], "timeout más largo que la mitad del margen");
  assert.notDeepEqual(problemasDelEnvio({ ...base, enviar: enviar.replace("$transaction(async (tx) => {", "$transaction(async (tx) => { // ") + "\n}, { timeout: 20000 });" }), [], "enviar con timeout");
  assert.notDeepEqual(problemasDelEnvio({ ...base, ventas: ventas.replace("}, LIMITES_TRANSACCION_DEL_LOCAL);", "}, { timeout: 120000 });") }), [], "la venta sin sus límites");
  const cancelar = leer("app/api/transferencias/cancelar/route.js");
  assert.notDeepEqual(problemasDeTransaccion(`${cancelar}\nawait prisma.$transaction(async () => {});`, "cancelar"), [], "una segunda transacción");
});

test("los registros de error no llevan cabeceras, cuerpo ni secreto", () => {
  for (const f of archivosDelModulo()) {
    const src = leer(f);
    for (const linea of src.split("\n").filter((l) => /console\./.test(l))) {
      assert.ok(!/headers|cuerpo|secreto|firma|entorno/.test(linea), `${f}: ${linea.trim()}`);
    }
  }
});

test("13. la prueba de base no necesita producción: base propia, ESCRITURA local, borrada al terminar", () => {
  const src = leer("scripts/pruebas-db/azulChatVentasResumen.mjs");
  assert.match(src, /crearClientePrisma\(\{ nivel: ESCRITURA \}\)/);
  assert.match(src, /CREATE DATABASE "\$\{NOMBRE\}"/);
  assert.match(src, /DROP DATABASE IF EXISTS "\$\{NOMBRE\}" WITH \(FORCE\)/);
  assert.ok(!/TRUNCATE|migrate deploy|DESTRUCTIVO|srv1431538/i.test(src));
});
