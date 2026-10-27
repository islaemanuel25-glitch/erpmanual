// EL ESCÁNER ES UNA PIEZA DEL KIT, Y NO SABE NADA DE RECEPCIÓN.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/sunmiEscanerCodigoBarra.test.mjs
//
// No se puede abrir una cámara en un test, así que lo que se afirma acá es lo
// que sí se puede afirmar sin una: su contrato —qué devuelve y qué no sabe—, que
// la cámara se libera por los tres caminos, y que el fallback existe.
//
// Lo que un candado NO puede contestar queda dicho: si `BarcodeDetector` decodifica
// bien un EAN-13 impreso, eso se ve con un teléfono y un producto en la mano.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FORMATOS_CODIGO,
  MENSAJES_SIN_CAMARA,
  MOTIVO_SIN_CAMARA,
  hayEscanerDisponible,
} from "./SunmiEscanerCodigoBarra.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PIEZA = "components/sunmi/SunmiEscanerCodigoBarra.jsx";
const src = fs
  .readFileSync(path.join(RAIZ, PIEZA), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("no sabe nada de transferencias, productos, stock ni rutas", () => {
  // Es lo que lo hace una pieza del kit y no un pedazo de recepción mudado de
  // lugar. Si supiera de transferencias, la próxima pantalla que quiera escanear
  // tendría que arrastrarlas.
  for (const palabra of [
    "transferencia",
    "producto",
    "stock",
    "recepcion",
    "recepción",
    "/api/",
    "fetch(",
    "prisma",
  ]) {
    assert.ok(
      !src.toLowerCase().includes(palabra.toLowerCase()),
      `el escáner nombra "${palabra}": dejó de ser genérico`
    );
  }
});

test("devuelve SOLO el string leído", () => {
  assert.match(src, /onCodigo\?\.\(String\(valor\)\)/, "tiene que devolver el código y nada más");
  // No devuelve el evento del detector ni el objeto entero: eso ataría al
  // consumidor a la forma de `BarcodeDetector`.
  assert.ok(!/onCodigo\?\.\(encontrados/.test(src));
});

test("la cámara se libera por los TRES caminos", () => {
  // Un MediaStream abierto deja el LED prendido y en algunos Android impide que
  // otra pantalla use la cámara hasta reiniciar la app.
  assert.match(src, /pista\.stop\(\)/, "no se detienen las pistas");

  // 1 · al cerrar el modal.
  assert.match(src, /if \(!abierto\) \{\s*apagar\(\);/, "cerrar no apaga la cámara");
  // 2 · en el cleanup del efecto.
  assert.match(src, /return \(\) => \{\s*detenido = true;\s*apagar\(\);/, "el cleanup no apaga");
  // 3 · al desmontar.
  assert.match(src, /useEffect\(\(\) => apagar, \[apagar\]\)/, "el desmontaje no apaga");

  // Y el stream vive en un ref: si viviera en el estado, el cleanup podría
  // correr con el valor viejo y dejar una cámara prendida.
  assert.match(src, /streamRef = useRef\(null\)/);

  // Y si el modal se cierra mientras se pedía el permiso, ese stream tampoco
  // queda vivo.
  assert.match(src, /if \(detenido \|\| !vivoRef\.current\)[\s\S]{0,200}pista\.stop\(\)/);
});

test("apaga ANTES de avisar el código", () => {
  // El consumidor va a cerrar el modal y navegar; no puede quedar una cámara
  // viva detrás de la pantalla siguiente.
  const posApagar = src.indexOf("apagar();\n              onCodigo");
  assert.ok(posApagar > 0, "avisa el código antes de apagar la cámara");
});

test("el fallback distingue los cuatro motivos y NO rompe nada", () => {
  // El cuarto —el equipo no tiene cámara— caía en "fallo", que dice "no
  // respondió" e invita a reintentar algo que no va a aparecer.
  assert.deepEqual(Object.values(MOTIVO_SIN_CAMARA).sort(), ["fallo", "noHayCamara", "noSoportado", "sinPermiso"]);
  assert.match(src, /e\?\.name === "NotFoundError"/, "sin cámara se confunde con una que falló");
  for (const motivo of Object.values(MOTIVO_SIN_CAMARA)) {
    const msg = MENSAJES_SIN_CAMARA[motivo];
    assert.ok(msg, `falta el mensaje de ${motivo}`);
    // Los tres tienen que decir qué hacer en lugar de escanear.
    assert.match(msg, /Escribí el código o usá el lector/, `${motivo} no ofrece la salida`);
  }
  // Sin permiso se distingue de "no soportado": son problemas distintos y el
  // primero se puede resolver.
  assert.match(src, /e\?\.name === "NotAllowedError"/);
});

test("`hayEscanerDisponible` se puede preguntar antes de ofrecer el botón", () => {
  // En Node no hay window: tiene que contestar false y no explotar.
  assert.equal(hayEscanerDisponible(), false);
  // Y mira las DOS cosas: el detector y el acceso a la cámara.
  assert.match(src, /typeof window\.BarcodeDetector !== "function"/);
  assert.match(src, /navigator\?\.mediaDevices\?\.getUserMedia/);
});

test("la única dependencia de escaneo es el respaldo, y no viaja en el bundle", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  const todas = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const sospechosa of ["quagga", "zxing", "@zxing/library", "html5-qrcode", "jsqr", "scandit"]) {
    assert.ok(
      !Object.keys(todas).some((d) => d.toLowerCase().includes(sospechosa)),
      `entró ${sospechosa}: son cientos de kB para algo que el navegador ya hace`
    );
  }
  // La lectura la hace el navegador cuando puede.
  assert.match(src, /window\.BarcodeDetector/);

  // `barcode-detector` es el respaldo de iPhone/Safari, decidido así, fijado a
  // una versión exacta y cargado SOLO con `import()` al abrir la cámara: un
  // `import` estático lo metería en el bundle de cada pantalla que use el kit.
  assert.match(pkg.dependencies?.["barcode-detector"] ?? "", /^\d+\.\d+\.\d+$/, "el respaldo no está fijado a una versión exacta");
  assert.match(src, /await import\("barcode-detector\/ponyfill"\)/, "el respaldo no se carga al abrir");
  let estaticos = "";
  try {
    estaticos = execFileSync(
      "git",
      ["grep", "--untracked", "-lE", "^import[^(]*[\"']barcode-detector", "--", "*.js", "*.jsx", "*.mjs"],
      { cwd: RAIZ, encoding: "utf8" }
    );
  } catch (e) {
    // `git grep` sale con 1 cuando no encuentra nada, que es lo esperado.
    if (e.status !== 1) throw e;
  }
  assert.equal(estaticos.trim(), "", `import estático del respaldo en: ${estaticos}`);
});

test("el respaldo y la pantalla completa son opciones APAGADAS", () => {
  // Las pantallas que no lo piden quedan como estaban: sin respaldo no se
  // ofrece el botón donde no hay detector, y la hoja de siempre.
  assert.match(src, /conRespaldo = false/);
  assert.match(src, /pantallaCompleta = false/);
  assert.match(src, /vibrar = false/);
  assert.match(src, /if \(!conRespaldo\) return null;/, "sin pedirlo, el respaldo se carga igual");
  // La pantalla completa es el cajón del kit a todo el ancho, con "Cerrar" abajo.
  assert.match(src, /forma="cajon"[\s\S]{0,200}className="max-w-none"/);
  assert.match(src, /footer=\{\s*<SunmiButton[^>]*>\s*Cerrar\s*<\/SunmiButton>/);
  // Vibra antes de apagar y de avisar, y solo si se pidió.
  assert.match(src, /if \(vibrar\) \{\s*try \{ navigator\.vibrate\?\.\(VIBRACION_LECTURA_MS\); \} catch \{\}\s*\}\s*apagar\(\);/);
});

test("pide la cámara TRASERA y formatos que el navegador soporte", () => {
  assert.match(src, /facingMode: \{ ideal: "environment" \}/, "apuntaría a la cara del operador");
  assert.ok(FORMATOS_CODIGO.includes("ean_13"), "el formato de góndola tiene que estar");
  assert.ok(FORMATOS_CODIGO.includes("code_128"), "el de etiqueta propia también");
  // Un formato desconocido hace explotar el constructor: se filtran contra los
  // que el navegador declara soportar.
  assert.match(src, /getSupportedFormats\?\.\(\)/);
});

test("usa el kit y no dibuja una capa propia", () => {
  assert.match(src, /<SunmiModalLayout/, "una capa a mano se saldría del tema y del apilado");
  assert.match(src, /forma="hoja-o-centrado"/, "la forma responsive que ya existe");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), "hay un color hex");
  assert.ok(!/style=\{\{/.test(src), "hay un estilo inline");
  assert.ok(!/\[\d+(px|vh|vw)\]/.test(src), "hay una medida arbitraria");
});
