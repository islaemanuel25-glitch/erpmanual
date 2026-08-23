// CANDADOS DEL MOTOR u2netp.
//
// ── QUÉ SE PUEDE PROBAR ACÁ Y QUÉ NO ──────────────────────────────────────
//
// La inferencia necesita WebAssembly y un navegador: eso lo mide la sonda. Lo
// que se prueba acá es todo lo que la rodea, que es donde este tipo de código se
// rompe en silencio:
//
//   · el preprocesado. Una normalización distinta a la del entrenamiento no
//     falla: devuelve una máscara sutilmente peor, y no hay forma de notarlo
//     mirando el código;
//   · el orden de los canales. NCHW contra NHWC no da error, da una máscara sin
//     sentido;
//   · el escalado de la máscara de vuelta al tamaño de la foto;
//   · el umbral que convierte la máscara en transparencia;
//   · y que los dos archivos que hay que servir estén, sean los que decimos, y
//     se correspondan con la versión de la dependencia.
//
// Ese último es el que no se puede deducir leyendo: el `.wasm` está commiteado y
// tiene que ser el de la misma versión de `onnxruntime-web` del `package.json`.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import {
  DESVIO,
  LADO_ENTRADA,
  MEDIA,
  PISO,
  TECHO,
  alfaDesdeMascara,
  componerAlfa,
  escalarMascara,
  normalizarMascara,
  prepararEntrada,
} from "@/lib/productos/u2netpMotor";
import { RUTA_MODELO, RUTA_WASM, ALMACEN } from "@/lib/productos/u2netpRecursos";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

const MOTOR = leer("lib/productos/u2netpMotor.js");
const RECURSOS = leer("lib/productos/u2netpRecursos.js");
const MANIFIESTO = JSON.parse(
  fs.readFileSync(path.join(RAIZ, "public/modelos/u2netp/MANIFIESTO.json"), "utf8")
);

/** Una imagen lisa de un color. */
function plana(ancho, alto, color) {
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let i = 0; i < ancho * alto; i++) {
    data[i * 4] = color[0];
    data[i * 4 + 1] = color[1];
    data[i * 4 + 2] = color[2];
    data[i * 4 + 3] = 255;
  }
  return { width: ancho, height: alto, data };
}

test("U1. EL PREPROCESADO ARMA EL TENSOR QUE LA RED ESPERA", () => {
  const datos = plana(10, 10, [255, 255, 255]);
  const t = prepararEntrada(datos);

  assert.equal(t.length, 3 * LADO_ENTRADA * LADO_ENTRADA, "el tensor no tiene el tamaño de la red");
  assert.ok(t instanceof Float32Array, "la red pide float32");

  // Blanco puro: la imagen dividida por su máximo da 1 en los tres canales, así
  // que cada canal queda en (1 - media) / desvío. Se comprueba el NÚMERO, no que
  // "haya algo": una normalización cambiada pasa cualquier chequeo de forma.
  const porCanal = LADO_ENTRADA * LADO_ENTRADA;
  for (let c = 0; c < 3; c++) {
    const esperado = (1 - MEDIA[c]) / DESVIO[c];
    assert.ok(
      Math.abs(t[c * porCanal] - esperado) < 1e-5,
      `canal ${c}: ${t[c * porCanal]} en vez de ${esperado}`
    );
  }
});

test("U2. LOS CANALES VAN SEPARADOS (NCHW), no intercalados", () => {
  // ── POR QUÉ ES UN CANDADO PROPIO ────────────────────────────────────────
  //
  // Intercalar los canales —RGBRGBRGB— es el error natural cuando uno viene de
  // un `ImageData`, y no da ningún error: la red recibe un tensor del tamaño
  // correcto lleno de valores plausibles y devuelve una máscara sin sentido.
  // Solo se ve mirando el recorte, y ahí parece que el modelo es malo.
  //
  // Una imagen de un solo color con los tres canales DISTINTOS lo distingue: en
  // NCHW el primer tercio es todo rojo, el segundo todo verde, el tercero todo
  // azul.
  const t = prepararEntrada(plana(8, 8, [200, 100, 50]));
  const porCanal = LADO_ENTRADA * LADO_ENTRADA;

  const r = t[0];
  const g = t[porCanal];
  const b = t[2 * porCanal];
  assert.ok(r !== g && g !== b, "los tres canales dieron lo mismo: no se puede distinguir el orden");

  // Todo el primer tercio tiene que valer lo mismo que su primer elemento.
  assert.equal(t[porCanal - 1], r, "el primer tercio no es un solo canal");
  assert.equal(t[2 * porCanal - 1], g, "el segundo tercio no es un solo canal");
  assert.equal(t[3 * porCanal - 1], b, "el tercer tercio no es un solo canal");
});

test("U3. SE DIVIDE POR EL MÁXIMO DE LA IMAGEN, NO POR 255", () => {
  // ── PARECE UN DESCUIDO Y ES LA REFERENCIA ───────────────────────────────
  //
  // El repositorio original divide por el máximo de la propia imagen. En una foto
  // normal el máximo es 255 y da igual; en una foto oscura —la del depósito con
  // poca luz— dividir por 255 dejaría todo apretado abajo y la red vería un
  // rango que no vio nunca al entrenar.
  //
  // Dos imágenes grises, una al 120 y otra al 240, tienen que dar EL MISMO
  // tensor: las dos son "todo el máximo".
  const claro = prepararEntrada(plana(4, 4, [240, 240, 240]));
  const oscuro = prepararEntrada(plana(4, 4, [120, 120, 120]));
  assert.ok(Math.abs(claro[0] - oscuro[0]) < 1e-6, "se está dividiendo por 255 y no por el máximo");

  // Y una imagen NEGRA no puede producir NaN: dividir por cero llenaría el
  // tensor de NaN y la red devolvería una máscara vacía sin decir por qué.
  const negro = prepararEntrada(plana(4, 4, [0, 0, 0]));
  assert.ok(Number.isFinite(negro[0]), "una foto negra produce NaN");
  for (let i = 0; i < 100; i++) assert.ok(Number.isFinite(negro[i]));
});

test("U4. LA MÁSCARA SE ESTIRA DE 0 A 1, y una plana no explota", () => {
  const m = normalizarMascara(new Float32Array([2, 4, 6, 8]));
  assert.equal(m[0], 0);
  assert.equal(m[3], 1);
  assert.ok(Math.abs(m[1] - 1 / 3) < 1e-6);

  // Todo el mismo valor: no hay rango que estirar. Cero, no NaN — y cero
  // significa "no encontré nada", que la confianza rechaza.
  const plana = normalizarMascara(new Float32Array([5, 5, 5, 5]));
  assert.deepEqual([...plana], [0, 0, 0, 0]);

  // Vacía no rompe.
  assert.equal(normalizarMascara(new Float32Array(0)).length, 0);
});

test("U5. EL ESCALADO ES BILINEAL, no escalones", () => {
  // ── POR QUÉ IMPORTA ACÁ Y NO EN LA ENTRADA ──────────────────────────────
  //
  // La entrada se ACHICA a 320 y el remuestreo no se ve. La máscara se AGRANDA,
  // de 320 a 1200: con vecino más cercano el contorno sale en bloques de casi
  // cuatro píxeles y se nota en la tarjeta.
  //
  // Una rampa de 2×2 estirada tiene que dar valores INTERMEDIOS. Con vecino más
  // cercano solo aparecerían los cuatro originales.
  const m = new Float32Array([0, 0, 1, 1]); // arriba 0, abajo 1
  const g = escalarMascara(m, 2, 8, 8);
  assert.equal(g.length, 64);

  const columna = [];
  for (let y = 0; y < 8; y++) columna.push(g[y * 8 + 3]);
  assert.ok(columna[0] < 0.05, `arriba debería ser casi 0 y es ${columna[0]}`);
  assert.ok(columna[7] > 0.95, `abajo debería ser casi 1 y es ${columna[7]}`);

  const intermedios = columna.filter((v) => v > 0.1 && v < 0.9);
  assert.ok(
    intermedios.length >= 2,
    `no hay valores intermedios: el escalado volvió a ser por vecino (${columna.join(", ")})`
  );

  // Y es monótona: si sube y baja, la interpolación está mal indexada.
  for (let i = 1; i < columna.length; i++) {
    assert.ok(columna[i] >= columna[i - 1] - 1e-6, "la rampa no es monótona");
  }
});

test("U6. EL UMBRAL DE ALFA: cero de verdad abajo, opaco de verdad arriba", () => {
  // ── LO QUE IMPIDE EL PISO ───────────────────────────────────────────────
  //
  // Dejar un 5 % de alfa en todo el fondo parece inofensivo. Sobre la tarjeta se
  // ve como una neblina gris alrededor del producto, y es peor que un recorte
  // duro porque parece suciedad de la foto.
  assert.equal(alfaDesdeMascara(0), 0);
  assert.equal(alfaDesdeMascara(PISO), 0);
  assert.equal(alfaDesdeMascara(PISO - 0.01), 0);
  assert.equal(alfaDesdeMascara(TECHO), 255);
  assert.equal(alfaDesdeMascara(1), 255);

  // Y en el medio hay medias tintas, que es lo que salva el asa fina y el borde
  // de una bolsa. Sin esto el contorno sale con tijera.
  const medio = alfaDesdeMascara((PISO + TECHO) / 2);
  assert.ok(medio > 100 && medio < 160, `el medio dio ${medio}: la rampa no es una rampa`);

  // Basura no se convierte en opaco.
  assert.equal(alfaDesdeMascara(NaN), 0);
  assert.equal(alfaDesdeMascara(undefined), 0);

  assert.ok(PISO < TECHO, "el piso quedó por encima del techo");
});

test("U7. LA COMPOSICIÓN ESCRIBE ALFA Y CUENTA LO QUE HIZO", () => {
  // Media imagen producto, media fondo.
  const datos = plana(4, 4, [10, 20, 30]);
  const m = new Float32Array(16);
  for (let i = 0; i < 8; i++) m[i] = 1;      // la mitad de arriba, producto
  for (let i = 8; i < 16; i++) m[i] = 0;     // la mitad de abajo, fondo

  const r = componerAlfa(datos, m);
  assert.equal(r.proporcionQuitada, 0.5);
  assert.equal(datos.data[3], 255, "el producto no quedó opaco");
  assert.equal(datos.data[8 * 4 + 3], 0, "el fondo no quedó transparente");
  assert.equal(r.esFondo[0], 0);
  assert.equal(r.esFondo[8], 1);

  // El color NO se toca: solo el alfa. Si se tocara, la foto cambiaría de tono.
  assert.equal(datos.data[0], 10);
  assert.equal(datos.data[1], 20);
  assert.equal(datos.data[2], 30);
});

test("U8. LOS DOS ARCHIVOS ESTÁN, SON LOS QUE DECIMOS, Y VAN CON SU VERSIÓN", () => {
  // ── EL DEFECTO QUE ESTO IMPIDE, Y NO SE VE LEYENDO ──────────────────────
  //
  // El `.wasm` está commiteado en vez de copiarse en el build, para que no haya
  // maquinaria que pueda fallar en silencio. El precio es que tiene que
  // corresponderse con la versión de `onnxruntime-web` del `package.json`. Si
  // alguien actualiza la dependencia y no vuelve a copiar el archivo, ORT levanta
  // con un runtime de otra versión — y el error que da no nombra nada de esto.
  const paquete = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  const declarada = String(paquete.dependencies["onnxruntime-web"] || "").replace(/^[\^~]/, "");
  assert.equal(
    declarada,
    MANIFIESTO.runtime.version,
    "el .wasm de public/ quedó de otra versión que la dependencia: hay que volver a copiarlo"
  );

  for (const clave of ["runtime", "modelo"]) {
    const m = MANIFIESTO[clave];
    const ruta = path.join(RAIZ, "public/modelos/u2netp", m.archivo);
    assert.ok(fs.existsSync(ruta), `falta ${m.archivo}: sin él la pantalla no puede recortar nada`);
    const bytes = fs.readFileSync(ruta);
    assert.equal(bytes.length, m.bytes, `${m.archivo} cambió de tamaño`);
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      m.sha256,
      `${m.archivo} no es el archivo que dice el manifiesto`
    );
  }

  // Y las licencias quedan escritas donde se puedan encontrar.
  assert.equal(MANIFIESTO.modelo.licencia, "Apache-2.0");
  assert.equal(MANIFIESTO.runtime.licencia, "MIT");
});

test("U9. EL MODELO SALE DE NUESTRO DOMINIO, NUNCA DE UN TERCERO", () => {
  // ── ES UN REQUISITO, NO UNA PREFERENCIA ─────────────────────────────────
  //
  // La foto no sale del teléfono y el modelo no viene de afuera. Un `wasmPaths`
  // apuntando a un CDN es la forma en que esto se rompe: funciona igual de bien y
  // convierte cada carga en un pedido a un tercero.
  assert.ok(RUTA_MODELO.startsWith("/modelos/"), "el modelo dejó de ser una ruta propia");
  assert.ok(RUTA_WASM.startsWith("/modelos/"), "el runtime dejó de ser una ruta propia");
  for (const [nombre, fuente] of Object.entries({ MOTOR, RECURSOS })) {
    assert.doesNotMatch(
      fuente,
      /https?:\/\/(?!github\.com|developers\.cloudflare)/,
      `${nombre} trae una url externa`
    );
    assert.doesNotMatch(fuente, /cdn|jsdelivr|unpkg/i, `${nombre} nombra un CDN`);
  }
});

test("U10. LAS DOS COSAS SIN LAS QUE ORT NO ARRANCA ACÁ", () => {
  // ── NINGUNA DE LAS DOS ES OPCIONAL, Y LAS DOS FALLAN FEO ────────────────
  //
  // Sin `numThreads = 1`, ORT intenta usar hilos; los hilos piden
  // SharedArrayBuffer, que no existe sin aislamiento entre orígenes.
  //
  // Sin `wasmBinary`, ORT va a buscar el .wasm solo, a una ruta relativa que en
  // Next no existe, y el error que da —"no available backend found"— no nombra
  // ninguna ruta ni ayuda a encontrar el problema.
  assert.match(MOTOR, /env\.wasm\.numThreads\s*=\s*1/, "volvieron los hilos");
  assert.match(MOTOR, /env\.wasm\.wasmBinary\s*=/, "ORT volvió a buscarse el .wasm solo");

  // Y el import es DINÁMICO: si entra arriba, `onnxruntime-web` viaja en el
  // bundle de la pantalla de productos y todos pagan el JS aunque no toquen una
  // foto.
  assert.doesNotMatch(
    MOTOR,
    /^import .*onnxruntime-web/m,
    "el runtime se importa estático: entra en el bundle de la pantalla"
  );
  assert.match(MOTOR, /await import\("onnxruntime-web\/wasm"\)/);
});

test("U11. LOS NOMBRES DE ENTRADA Y SALIDA SE PREGUNTAN, no se escriben", () => {
  // u2netp devuelve SIETE salidas y la buena es la primera. Escribir "d0" de
  // memoria funciona hasta que alguien reexporta el modelo con otro nombre, y
  // ahí falla con un mensaje que no ayuda.
  assert.match(MOTOR, /ses\.inputNames\[0\]/);
  assert.match(MOTOR, /ses\.outputNames\[0\]/);

  // Y el tamaño de la salida se comprueba: una máscara de otro tamaño se
  // escalaría igual y daría un recorte corrido, sin ningún error.
  assert.match(MOTOR, /cruda\.length !== LADO_ENTRADA \* LADO_ENTRADA/);
});

test("U12. LA SEGUNDA VEZ NO SE VUELVE A BAJAR", () => {
  // ── POR QUÉ NO ALCANZA CON LAS CABECERAS ────────────────────────────────
  //
  // Next sirve lo de `public/` con `max-age=0` y un ETag: la segunda visita
  // igual sale a preguntar. Con 18 MB de por medio, eso son dos viajes antes de
  // poder recortar. La Cache API los guarda de nuestro lado.
  assert.match(RECURSOS, /caches\.open/);
  assert.ok(ALMACEN.length > 0, "el almacén no tiene nombre");
  assert.match(ALMACEN, /v\d+$/, "el almacén no lleva versión: no se puede invalidar solo");

  // EL CLON, que es el error clásico de la Cache API: un `Response` se lee UNA
  // vez, así que guardar el original después de leerlo deja la caché con un
  // cuerpo vacío — y no avisa.
  assert.match(RECURSOS, /almacen\.put\([^)]*res\.clone\(\)\)/, "se guarda sin clonar: la caché queda vacía");

  // Y guardar es una MEJORA, no un requisito: sin Cache API tiene que bajar
  // igual. Cada uso del caché va en su propio try.
  assert.match(RECURSOS, /typeof caches === "undefined"/);
});
