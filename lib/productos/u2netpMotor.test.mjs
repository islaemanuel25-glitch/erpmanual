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
import {
  ALMACEN,
  HUELLA_RECURSOS,
  PREFIJO_ALMACEN,
  RUTA_MODELO,
  RUTA_WASM,
  conRecuperacionDeCache,
} from "@/lib/productos/u2netpRecursos";

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

test("U8. LOS DOS ARCHIVOS ESTÁN, SON LOS QUE DECIMOS, Y LAS TRES VERSIONES COINCIDEN", () => {
  // ── EL DEFECTO QUE ESTO IMPIDE, Y NO SE VE LEYENDO ──────────────────────
  //
  // El `.wasm` está commiteado en vez de copiarse en el build, para que no haya
  // maquinaria que pueda fallar en silencio. El precio es que tiene que
  // corresponderse con la versión de `onnxruntime-web` que se instala de verdad.
  // Si alguien actualiza la dependencia y no vuelve a copiar el archivo, ORT
  // levanta con un runtime de otra versión — y el error que da no nombra nada
  // de esto.
  //
  // ── POR QUÉ NO ALCANZA CON MIRAR EL package.json ────────────────────────
  //
  // Antes acá decía `^1.27.0` y este candado le sacaba el `^` antes de
  // comparar. O sea que aceptaba por bueno un rango: con `^`, un `npm install`
  // en otra máquina —o dentro del Dockerfile— puede resolver 1.27.4 o 1.28.0 sin
  // que cambie una sola línea del repo. El `.wasm` commiteado seguiría siendo el
  // de 1.27.0, y este candado seguiría en VERDE mientras el runtime que corre es
  // otro. El rango era el agujero, y quitarle el `^` para comparar era mirar
  // para otro lado.
  //
  // Por eso ahora se miran TRES cosas y tienen que ser la misma:
  //
  //   1. lo que package.json DECLARA, y además que sea una versión exacta;
  //   2. lo que package-lock.json RESUELVE, que es lo que se instala;
  //   3. lo que el MANIFIESTO dice que es el .wasm que está en public/.
  const paquete = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  const candado = JSON.parse(fs.readFileSync(path.join(RAIZ, "package-lock.json"), "utf8"));
  const declarada = String(paquete.dependencies["onnxruntime-web"] || "");

  // 1. EXACTA, no un rango. Un `^` o un `~` acá vuelven a abrir el agujero.
  assert.match(
    declarada,
    /^\d+\.\d+\.\d+$/,
    `package.json declara "${declarada}": tiene que ser una versión exacta, sin ^ ni ~, ` +
      "porque el .wasm de public/ está commiteado y corresponde a UNA versión concreta"
  );

  // 2. LO QUE EL LOCK RESUELVE DE VERDAD. Es la comprobación que se pone roja
  //    aunque package.json siga diciendo lo correcto: el lock es lo que decide
  //    qué bytes termina instalando `npm ci` en el build.
  const enElLock = candado.packages?.["node_modules/onnxruntime-web"];
  assert.ok(enElLock, "package-lock.json no resuelve onnxruntime-web en ningún lado");
  assert.equal(
    enElLock.version,
    MANIFIESTO.runtime.version,
    `package-lock resuelve onnxruntime-web ${enElLock.version} y el .wasm de public/ es de ` +
      `${MANIFIESTO.runtime.version}: se instalaría un runtime que no es el del binario`
  );

  // 3. Y el rango que el lock guarda para la raíz tampoco puede haberse aflojado
  //    por su cuenta: es de donde sale la resolución de arriba.
  assert.equal(
    candado.packages?.[""]?.dependencies?.["onnxruntime-web"],
    declarada,
    "package.json y package-lock.json declaran rangos distintos: falta correr npm install"
  );

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

  // EL CLON, que es el error clásico de la Cache API: un `Response` se lee UNA
  // vez, así que guardar el original después de leerlo deja la caché con un
  // cuerpo vacío — y no avisa. Se saca ANTES de `leerConAvance`, y se guarda
  // recién cuando alguien confirma que los bytes sirven (ver U14).
  assert.match(RECURSOS, /const clon = res\.clone\(\);/, "se guarda sin clonar: la caché queda vacía");
  assert.match(RECURSOS, /almacen\.put\(ruta, clon\)/, "el clon dejó de ser lo que se guarda");
  const cuerpo = RECURSOS.match(/export async function traerRecurso\([\s\S]*?\n\}/)[0];
  assert.ok(
    cuerpo.indexOf("res.clone()") < cuerpo.indexOf("leerConAvance"),
    "se clona DESPUÉS de leer el cuerpo: la caché queda con un cuerpo vacío"
  );

  // Y guardar es una MEJORA, no un requisito: sin Cache API tiene que bajar
  // igual. Cada uso del caché va en su propio try.
  assert.match(RECURSOS, /typeof caches === "undefined"/);
});

test("U13. EL NOMBRE DEL ALMACÉN ES EL CONTENIDO, no un v1 escrito a mano", () => {
  // ── EL DEFECTO QUE ESTO IMPIDE, Y ES EL QUE HABÍA ───────────────────────
  //
  // Antes el almacén se llamaba `u2netp-v1` y el comentario de al lado prometía
  // que "cuando cambie el modelo o el runtime, el almacén viejo deja de usarse
  // solo". Era falso: `v1` no está atado a nada. Cambiar el `.onnx` y no
  // acordarse de tocar esa línea deja a CADA TELÉFONO que ya recortó una foto
  // leyendo los bytes viejos, en silencio y para siempre. El modelo nuevo se
  // despliega, la Cache API contesta antes que la red, y nadie se entera.
  //
  // Un candado que solo mirara `/v\d+$/` —el que había— no lo atrapaba: `v1`
  // pasa por más que el modelo haya cambiado tres veces.
  //
  // Acá la huella se RECALCULA desde el manifiesto. Si cambia la versión del
  // runtime, el sha del wasm o el sha del modelo, este candado se pone rojo
  // hasta que el nombre del almacén también cambie.
  const canonico = [
    "u2netp",
    MANIFIESTO.runtime.paquete,
    MANIFIESTO.runtime.version,
    MANIFIESTO.runtime.sha256,
    MANIFIESTO.modelo.nombre,
    MANIFIESTO.modelo.sha256,
  ].join("|");
  const esperada = crypto.createHash("sha256").update(canonico).digest("hex").slice(0, 16);

  assert.equal(
    HUELLA_RECURSOS,
    esperada,
    `cambió alguno de los recursos y la huella del caché no: poné HUELLA_RECURSOS = "${esperada}" ` +
      "en lib/productos/u2netpRecursos.js, o los teléfonos que ya bajaron el modelo viejo lo van a seguir usando"
  );
  assert.equal(ALMACEN, `${PREFIJO_ALMACEN}${esperada}`, "el almacén dejó de llevar la huella");

  // Y el manifiesto declara lo mismo, que es de donde lo lee quien audita.
  assert.equal(MANIFIESTO.cache.huella, esperada, "el manifiesto quedó con una huella vieja");
  assert.equal(MANIFIESTO.cache.almacen, ALMACEN, "el manifiesto nombra otro almacén");

  // La huella tiene que depender DE VERDAD de los tres datos. Si alguien la
  // calculara sobre una cadena fija, lo de arriba pasaría igual: acá se cambia
  // cada uno y se exige que el resultado cambie.
  for (const cambiado of [
    ["runtime.version", ["u2netp", MANIFIESTO.runtime.paquete, "9.9.9", MANIFIESTO.runtime.sha256, MANIFIESTO.modelo.nombre, MANIFIESTO.modelo.sha256]],
    ["sha del wasm", ["u2netp", MANIFIESTO.runtime.paquete, MANIFIESTO.runtime.version, "0".repeat(64), MANIFIESTO.modelo.nombre, MANIFIESTO.modelo.sha256]],
    ["sha del modelo", ["u2netp", MANIFIESTO.runtime.paquete, MANIFIESTO.runtime.version, MANIFIESTO.runtime.sha256, MANIFIESTO.modelo.nombre, "0".repeat(64)]],
  ]) {
    const otra = crypto.createHash("sha256").update(cambiado[1].join("|")).digest("hex").slice(0, 16);
    assert.notEqual(otra, esperada, `la huella no depende de ${cambiado[0]}`);
  }
});

test("U14. UN CACHÉ CORRUPTO SE CURA, Y NO SE VUELVE UN LOOP", async (t) => {
  // ── LA CONTRAPRUEBA DEL PUNTO 3, Y POR QUÉ NO SE PUEDE LEER ─────────────
  //
  // El defecto era: `traerConCache` guardaba el `Response` apenas lo bajaba, sin
  // haber visto todavía si ORT podía crear una sesión con esos bytes. Una
  // descarga cortada quedaba guardada como buena, y a partir de ahí ese teléfono
  // recortaba por bordes en cada foto, para siempre, sin un error visible.
  //
  // `conRecuperacionDeCache` recibe sus tres pasos por parámetro justamente para
  // poder ejercer esto sin navegador. Cada caso cuenta las llamadas: lo que hay
  // que probar no es solo que se recupere, sino que NO reintente de más.

  /** Un juego de recursos de mentira, con su `guardar` contado. */
  const juego = (desdeCache) => ({ desdeCache, guardados: 0, guardar: async function () { this.guardados++; return true; } });

  await t.test("bytes podridos EN EL CACHÉ: invalida, rebaja una vez, y sale", async () => {
    const traidos = [];
    let invalidaciones = 0;
    let intentos = 0;

    const sesion = await conRecuperacionDeCache({
      traer: async ({ sinCache }) => {
        const j = juego(!sinCache); // la primera viene del caché, la segunda de red
        traidos.push({ sinCache, j });
        return j;
      },
      invalidar: async () => { invalidaciones++; },
      crear: async (recursos) => {
        intentos++;
        if (recursos.desdeCache) throw new Error("Failed to load model: invalid protobuf");
        return "sesión viva";
      },
    });

    assert.equal(sesion, "sesión viva", "no se recuperó del caché corrupto");
    assert.equal(intentos, 2, `se intentó crear la sesión ${intentos} veces y tenían que ser 2`);
    assert.equal(invalidaciones, 1, "no se invalidó exactamente una vez");
    assert.deepEqual(traidos.map((x) => x.sinCache), [false, true], "el reintento no saltó el caché");
    // Lo que se guarda es lo BUENO, y solo eso.
    assert.equal(traidos[0].j.guardados, 0, "guardó los bytes podridos");
    assert.equal(traidos[1].j.guardados, 1, "no guardó los bytes sanos: la próxima vez los rebaja");
  });

  await t.test("si falla las DOS veces, tira — y no hay una tercera", async () => {
    let intentos = 0;
    let invalidaciones = 0;
    const juegos = [];

    await assert.rejects(
      conRecuperacionDeCache({
        traer: async ({ sinCache }) => { const j = juego(!sinCache); juegos.push(j); return j; },
        invalidar: async () => { invalidaciones++; },
        crear: async () => { intentos++; throw new Error("no available backend found"); },
      }),
      /no available backend found/,
      "se tragó el error en vez de dejar que la cascada caiga a bordes"
    );

    assert.equal(intentos, 2, `hubo ${intentos} intentos: el reintento tiene que ser UNO solo`);
    assert.equal(invalidaciones, 1);
    // Y NADA quedó guardado: si se guardaran los bytes del segundo intento, el
    // teléfono arrancaría la próxima vez leyendo basura del almacén otra vez.
    assert.deepEqual(juegos.map((j) => j.guardados), [0, 0], "guardó bytes con los que no se pudo crear la sesión");
  });

  await t.test("bytes de RED que no sirven: NO se reintenta y NO se borra nada", async () => {
    // ── ES LA CONDICIÓN QUE HACE QUE ESTO TERMINE ─────────────────────────
    //
    // Si los bytes vinieron de la red y la sesión igual falló, el caché no tiene
    // la culpa: volver a bajarlos daría exactamente lo mismo. Sin esta
    // condición, cada intento traería de red y volvería a fallar — un loop.
    let intentos = 0;
    let invalidaciones = 0;
    const juegos = [];

    await assert.rejects(
      conRecuperacionDeCache({
        traer: async () => { const j = juego(false); juegos.push(j); return j; },
        invalidar: async () => { invalidaciones++; },
        crear: async () => { intentos++; throw new Error("modelo roto en el servidor"); },
      }),
      /modelo roto en el servidor/
    );

    assert.equal(intentos, 1, `reintentó ${intentos} veces bytes que no venían del caché`);
    assert.equal(invalidaciones, 0, "borró el caché por un problema que no era del caché");
    assert.equal(juegos[0].guardados, 0, "guardó bytes con los que no se pudo crear la sesión");
  });

  await t.test("camino feliz: se guarda DESPUÉS de crear la sesión, no antes", async () => {
    const orden = [];
    const j = { desdeCache: false, guardar: async () => { orden.push("guardar"); return true; } };
    const r = await conRecuperacionDeCache({
      traer: async () => j,
      invalidar: async () => { orden.push("invalidar"); },
      crear: async () => { orden.push("crear"); return "ok"; },
    });
    assert.equal(r, "ok");
    assert.deepEqual(orden, ["crear", "guardar"], "sigue guardando antes de saber si los bytes sirven");
  });
});

test("U15. LAS LICENCIAS DE LO QUE MANDAMOS AL NAVEGADOR ESTÁN, Y SON LAS DE UPSTREAM", () => {
  // ── POR QUÉ NO ALCANZA CON EL NOMBRE DE LA LICENCIA ─────────────────────
  //
  // El manifiesto decía `"licencia": "Apache-2.0"` y `"licencia": "MIT"`, y eso
  // no cumple ninguna de las dos. Los binarios se DISTRIBUYEN: cada navegador
  // que abre la ficha de un producto se baja el modelo y el runtime. Apache-2.0
  // pide en su punto 4 que la copia de la licencia acompañe a la obra; MIT pide
  // que el aviso de copyright viaje con el software. Un nombre suelto en un JSON
  // no es ninguna de las dos cosas.
  //
  // Los textos están al lado de los binarios, en `public/modelos/u2netp/`, así
  // que se sirven desde el mismo lugar del que sale lo que licencian.
  for (const clave of ["runtime", "modelo"]) {
    const m = MANIFIESTO[clave];
    assert.ok(m.licenciaArchivo, `${clave} no dice en qué archivo está su licencia`);

    const ruta = path.join(RAIZ, "public/modelos/u2netp", m.licenciaArchivo);
    assert.ok(
      fs.existsSync(ruta),
      `falta ${m.licenciaArchivo}: estamos distribuyendo ${m.archivo} sin su licencia`
    );

    // Y ES LA COPIA EXACTA, no un resumen ni algo reescrito. El sha del texto
    // upstream está en el manifiesto; si alguien lo edita, esto se pone rojo.
    const bytes = fs.readFileSync(ruta);
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      m.licenciaSha256,
      `${m.licenciaArchivo} no es el texto que se bajó de upstream`
    );

    // La procedencia queda anotada: de dónde salió y de qué commit.
    assert.match(m.licenciaOrigen, /^https:\/\/github\.com\//, `${clave} no dice de dónde salió la licencia`);
    assert.match(m.licenciaCommit, /^[0-9a-f]{40}$/, `${clave} no fija el commit de la licencia`);
    assert.ok(m.atribucion && m.atribucion.length > 10, `${clave} no tiene atribución`);
  }

  // Y que el texto sea el de la licencia que se declara, no el otro.
  const apache = fs.readFileSync(
    path.join(RAIZ, "public/modelos/u2netp", MANIFIESTO.modelo.licenciaArchivo),
    "utf8"
  );
  const mit = fs.readFileSync(
    path.join(RAIZ, "public/modelos/u2netp", MANIFIESTO.runtime.licenciaArchivo),
    "utf8"
  );
  assert.match(apache, /Apache License\s*\n\s*Version 2\.0, January 2004/, "el texto del modelo no es Apache-2.0");
  assert.match(mit, /^MIT License/, "el texto del runtime no es MIT");
  assert.match(mit, /Copyright \(c\) Microsoft Corporation/, "al MIT le falta el aviso de copyright");
});
