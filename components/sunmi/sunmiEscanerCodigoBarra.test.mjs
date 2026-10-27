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
  INTERVALO_LECTURA_MS,
  MENSAJES_SIN_CAMARA,
  MOTIVO_SIN_CAMARA,
  RESOLUCION_CAMARA,
  hayEscanerDisponible,
} from "./SunmiEscanerCodigoBarra.jsx";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PIEZA = "components/sunmi/SunmiEscanerCodigoBarra.jsx";
const sinComentarios = (ruta) =>
  fs
    .readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const src = sinComentarios(PIEZA);
// El lector que la pieza usa. Lo que LEE se prueba con imágenes en su propio
// candado (`lib/sunmi/lectorCodigoBarra.test.mjs`); acá, cómo está cableado.
const LECTOR = sinComentarios("lib/sunmi/lectorCodigoBarra.js");

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
  // `leerCuadro` ya lo devuelve como string; la pieza lo pasa tal cual.
  assert.match(src, /valor = await leerCuadro\(lector,/);
  assert.match(src, /onCodigo\?\.\(valor\)/, "tiene que devolver el código y nada más");
  assert.match(LECTOR, /return valor \? String\(valor\) : null;/);
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
  assert.match(src, /apagar\(\);\s*onCodigo\?\.\(valor\);/, "avisa el código antes de apagar la cámara");
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
  // El lector lo trae el sitio: alcanza con la cámara.
  assert.match(src, /navigator\?\.mediaDevices\?\.getUserMedia/);
});

test("NUNCA el BarcodeDetector nativo: zxing en todos los equipos", () => {
  // En varios Android el nativo existe, no soporta todos los formatos y
  // devuelve vacío sin error: la cámara se veía y no leía nada (producción,
  // Control de stock). Ni la pieza ni el lector pueden volver a tocarlo.
  for (const [nombre, texto] of [["la pieza", src], ["el lector", LECTOR]]) {
    assert.doesNotMatch(texto, /window\.BarcodeDetector/, `${nombre} vuelve a usar el detector nativo`);
  }
  assert.match(src, /lector = await crearLector\(formatos\)/);
  assert.match(src, /from "@\/lib\/sunmi\/lectorCodigoBarra"/);
});

test("la única dependencia de escaneo es barcode-detector, y no viaja en el bundle", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  const todas = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const sospechosa of ["quagga", "zxing", "@zxing/library", "html5-qrcode", "jsqr", "scandit"]) {
    assert.ok(
      !Object.keys(todas).some((d) => d.toLowerCase().includes(sospechosa)),
      `entró ${sospechosa}: el lector ya es barcode-detector`
    );
  }

  // Fijado a una versión exacta y cargado SOLO con `import()` al abrir la
  // cámara: un `import` estático lo metería en el bundle de cada pantalla que
  // use el kit.
  assert.match(pkg.dependencies?.["barcode-detector"] ?? "", /^\d+\.\d+\.\d+$/, "el lector no está fijado a una versión exacta");
  assert.match(LECTOR, /await import\("barcode-detector\/ponyfill"\)/, "el lector no se carga al abrir");
  // Y el núcleo ya cargado al crear el lector: si el .wasm no baja, se avisa en
  // vez de fallar en silencio en cada cuadro.
  assert.match(LECTOR, /await prepareZXingModule\(\{ overrides, fireImmediately: true \}\)/);
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

test("la pantalla completa y la vibración son opciones APAGADAS", () => {
  // Las pantallas que no las piden —Transferencias— siguen con la hoja de
  // siempre.
  assert.match(src, /pantallaCompleta = false/);
  assert.match(src, /vibrar = false/);
  // La pantalla completa es el cajón del kit a todo el ancho, con "Cerrar" abajo.
  assert.match(src, /forma="cajon"[\s\S]{0,200}className="max-w-none"/);
  assert.match(src, /footer=\{\s*<SunmiButton[^>]*>\s*Cerrar\s*<\/SunmiButton>/);
  // Vibra antes de apagar y de avisar, y solo si se pidió.
  assert.match(src, /if \(vibrar\) \{\s*try \{ navigator\.vibrate\?\.\(VIBRACION_LECTURA_MS\); \} catch \{\}\s*\}\s*apagar\(\);/);
});

test("pide la cámara TRASERA a 1280×720 con enfoque continuo, y formatos que el lector soporte", () => {
  assert.match(src, /facingMode: \{ ideal: "environment" \}/, "apuntaría a la cara del operador");
  assert.deepEqual(RESOLUCION_CAMARA, { ancho: 1280, alto: 720 });
  assert.match(src, /width: \{ ideal: RESOLUCION_CAMARA\.ancho \}/);
  assert.match(src, /height: \{ ideal: RESOLUCION_CAMARA\.alto \}/);
  assert.match(src, /modos\.includes\("continuous"\)[\s\S]{0,200}applyConstraints\(\{ advanced: \[\{ focusMode: "continuous" \}\] \}\)/);
  assert.match(src, /await enfocarContinuo\(stream\)/, "el enfoque continuo no se pide");
  assert.ok(FORMATOS_CODIGO.includes("ean_13"), "el formato de góndola tiene que estar");
  assert.ok(FORMATOS_CODIGO.includes("code_128"), "el de etiqueta propia también");
  // Un formato desconocido hace explotar el constructor: se filtran contra los
  // que el lector declara soportar.
  assert.match(LECTOR, /getSupportedFormats\(\)/);
});

test("el video reproduce solo y se lee cuadro a cuadro a su resolución real", () => {
  // Los dos visores —la hoja y la pantalla completa— con los tres atributos.
  const videos = src.match(/<video[\s\S]*?\/>/g) ?? [];
  assert.equal(videos.length, 2);
  for (const v of videos) {
    for (const attr of ["playsInline", "muted", "autoPlay"]) assert.ok(v.includes(attr), `un <video> sin ${attr}`);
  }
  // Recién con el video reproduciéndose y con tamaño.
  assert.match(src, /v\.readyState >= v\.HAVE_CURRENT_DATA && v\.videoWidth > 0/);
  // El canvas toma el tamaño del VIDEO, no el de la pantalla.
  assert.match(src, /lienzo\.width = v\.videoWidth/);
  assert.match(src, /lienzo\.height = v\.videoHeight/);
  assert.doesNotMatch(src, /clientWidth|offsetWidth|getBoundingClientRect/);
  // Uno cada INTERVALO_LECTURA_MS, con requestAnimationFrame.
  assert.equal(INTERVALO_LECTURA_MS, 150);
  assert.match(src, /ahora - ultima >= INTERVALO_LECTURA_MS/);
  // Un cuadro que falla no corta el bucle: el catch no hace return y el
  // siguiente cuadro se pide igual.
  const bucle = src.match(/const mirar = async \(ahora\) => \{([\s\S]*?)\n      \};/)?.[1] ?? "";
  assert.match(bucle, /\} catch \{\s*\}/, "un error de cuadro tiene que tragarse");
  assert.match(bucle, /if \(!detenido && vivoRef\.current\) requestAnimationFrame\(mirar\);\s*$/);
});

test("usa el kit y no dibuja una capa propia", () => {
  assert.match(src, /<SunmiModalLayout/, "una capa a mano se saldría del tema y del apilado");
  assert.match(src, /forma="hoja-o-centrado"/, "la forma responsive que ya existe");
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), "hay un color hex");
  assert.ok(!/style=\{\{/.test(src), "hay un estilo inline");
  assert.ok(!/\[\d+(px|vh|vw)\]/.test(src), "hay una medida arbitraria");
});
