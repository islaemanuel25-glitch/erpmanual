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
  for (const esperado of ["atender.js", "autenticacionAplicacion.js", "autorizacion.js", "capacidades.js", "servidor.js", "ventasResumen.js", "miAlcance.js"]) {
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

test("el catálogo es cerrado: ventas_resumen y mi_alcance, congelado y de solo lectura", () => {
  assert.deepEqual(Object.keys(CAPACIDADES), ["ventas_resumen", "mi_alcance"]);
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

test("ventas_resumen pide el MISMO permiso que el reporte del ERP del que sale", () => {
  const ruta = leer("app/api/reportes-ventas/general/route.js");
  const m = ruta.match(/checkPerm\(session,\s*"([^"]+)"\)/);
  assert.ok(m, "el reporte dejó de pedir un permiso con checkPerm");
  assert.deepEqual([...CAPACIDADES.ventas_resumen.permisos], [m[1]]);
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
