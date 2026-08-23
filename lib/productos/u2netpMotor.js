// EL MOTOR u2netp: DE UNA FOTO A UNA MÁSCARA DE PRODUCTO.
//
// ── QUÉ ES u2netp, Y POR QUÉ AHORA SÍ ─────────────────────────────────────
//
// Es la versión chica de U²-Net, una red de segmentación de objeto saliente:
// mira la foto entera y decide, pixel por pixel, qué tan probable es que ese
// pixel sea "el objeto del que trata la foto". No busca bordes ni colores
// parecidos — reconoce la silueta.
//
// Eso es exactamente lo que le faltaba al motor por bordes, que está en
// `motorBordes.js` y sigue ahí como respaldo. Aquél marcaba fondo lo que fuera
// contiguo al borde Y del color del borde, y por eso se comía los productos
// blancos sobre fondo claro, entraba por adentro de las botellas y se perdía con
// los reflejos. Ninguno de esos tres casos es un problema de ajuste: son el
// límite de mirar color en vez de forma.
//
// En `DEC-0010` u2netp había quedado como candidato aprobado técnicamente pero
// NO adoptado, porque el costo —una dependencia y megabytes en el teléfono— no
// se justificaba sin haber visto fallar al motor barato. Ya se lo vio fallar, y
// Emanuel aprobó el cambio: el objetivo es que al subir una foto quede el
// producto solo, y el motor por bordes no llega a eso.
//
// ── LO QUE CUESTA, EN NÚMEROS MEDIDOS ─────────────────────────────────────
//
// Una dependencia nueva: `onnxruntime-web` 1.27.0, licencia MIT. El modelo es
// Apache-2.0, el mismo del repositorio original `xuebinqin/U-2-Net`.
//
// El peso está medido y escrito en `u2netpRecursos.js`: unos 7,7 MB
// comprimidos la primera vez, entre el runtime y el modelo. Después queda
// guardado en la Cache API del navegador y no se vuelve a bajar.
//
// ── EL PREPROCESADO NO SE INVENTA ─────────────────────────────────────────
//
// La red se entrenó con una normalización concreta y usar otra da máscaras
// sutilmente peores, que es la peor forma de estar mal: no falla, sale flojo.
// Los números salen del repositorio original —`RescaleT(320)` y
// `ToTensorLab(flag=0)`— y son los mismos que usa `rembg`.
//
// Un detalle que parece un descuido y no lo es: la imagen se divide por su
// PROPIO máximo y no por 255. Así lo hace la referencia. En una foto normal el
// máximo es 255 y da lo mismo; en una foto oscura, dividir por 255 dejaría todos
// los valores apretados abajo y la red vería algo que no vio nunca al entrenar.

import * as recursos from "@/lib/productos/u2netpRecursos";

/** El lado de la entrada de la red. No es configurable: la red se entrenó así. */
export const LADO_ENTRADA = 320;

/** La normalización de ImageNet con la que se entrenó. */
export const MEDIA = [0.485, 0.456, 0.406];
export const DESVIO = [0.229, 0.224, 0.225];

/**
 * De una imagen de cualquier tamaño al tensor que la red espera.
 *
 * Devuelve NCHW —los tres canales uno detrás del otro, no intercalados— porque
 * es la forma en que la red lee la entrada. Intercalarlos no da error: da una
 * máscara sin sentido, que es peor.
 *
 * @param {{width:number, height:number, data:Uint8ClampedArray}} datos
 * @returns {Float32Array} de 3 * 320 * 320
 */
export function prepararEntrada(datos) {
  const { width: ancho, height: alto, data: px } = datos;
  const L = LADO_ENTRADA;
  const salida = new Float32Array(3 * L * L);
  const porCanal = L * L;

  // El máximo de la imagen, como en la referencia. Se busca sobre los tres
  // canales de color; el alfa no cuenta, que si no una foto con transparencia
  // daría 255 siempre.
  let maximo = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] > maximo) maximo = px[i];
    if (px[i + 1] > maximo) maximo = px[i + 1];
    if (px[i + 2] > maximo) maximo = px[i + 2];
  }
  // Una imagen completamente negra daría división por cero y toda la entrada en
  // NaN — y la red devolvería una máscara vacía sin decir por qué.
  if (maximo === 0) maximo = 1;

  // Vecino más cercano para llegar a 320×320. Se probó que alcanza: la red ya
  // trabaja a esa resolución y el suavizado del remuestreo no cambia la silueta.
  for (let y = 0; y < L; y++) {
    const oy = Math.min(alto - 1, Math.floor((y * alto) / L));
    for (let x = 0; x < L; x++) {
      const ox = Math.min(ancho - 1, Math.floor((x * ancho) / L));
      const o = (oy * ancho + ox) * 4;
      const d = y * L + x;
      salida[d] = (px[o] / maximo - MEDIA[0]) / DESVIO[0];
      salida[porCanal + d] = (px[o + 1] / maximo - MEDIA[1]) / DESVIO[1];
      salida[2 * porCanal + d] = (px[o + 2] / maximo - MEDIA[2]) / DESVIO[2];
    }
  }
  return salida;
}

/**
 * La salida cruda de la red a una máscara de 0 a 1.
 *
 * La red no devuelve probabilidades calibradas: devuelve valores en un rango que
 * cambia con cada foto. La referencia hace exactamente esto —restar el mínimo y
 * dividir por el recorrido— y sin eso la máscara sale casi toda blanca o casi
 * toda negra según la foto.
 *
 * @param {ArrayLike<number>} cruda
 * @returns {Float32Array}
 */
export function normalizarMascara(cruda) {
  const n = cruda.length;
  const m = new Float32Array(n);
  if (n === 0) return m;

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = cruda[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }

  // Una máscara plana —todo el mismo valor— no se puede estirar sin dividir por
  // cero. Se devuelve en cero, que significa "no encontré ningún objeto", y la
  // medida de confianza se encarga de rechazarla.
  const rango = max - min;
  if (!Number.isFinite(rango) || rango === 0) return m;

  for (let i = 0; i < n; i++) m[i] = (cruda[i] - min) / rango;
  return m;
}

/**
 * Estira la máscara de 320×320 al tamaño de la foto, con interpolación bilineal.
 *
 * ── POR QUÉ BILINEAL Y NO VECINO MÁS CERCANO ──────────────────────────────
 *
 * Acá sí importa. La entrada se achica y ahí el remuestreo no se ve; la máscara
 * se AGRANDA, de 320 a 1200, y con vecino más cercano el contorno del producto
 * sale escalonado en bloques de casi cuatro píxeles. Se nota a simple vista en la
 * tarjeta.
 *
 * @param {Float32Array} mascara  de lado×lado
 * @param {number} lado
 * @param {number} ancho  destino
 * @param {number} alto   destino
 */
export function escalarMascara(mascara, lado, ancho, alto) {
  const salida = new Float32Array(ancho * alto);
  if (ancho === 0 || alto === 0) return salida;

  for (let y = 0; y < alto; y++) {
    // El -0.5 centra las muestras: sin él la máscara queda corrida medio pixel
    // hacia arriba y a la izquierda respecto de la foto.
    const fy = Math.min(lado - 1, Math.max(0, ((y + 0.5) * lado) / alto - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(lado - 1, y0 + 1);
    const ty = fy - y0;

    for (let x = 0; x < ancho; x++) {
      const fx = Math.min(lado - 1, Math.max(0, ((x + 0.5) * lado) / ancho - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(lado - 1, x0 + 1);
      const tx = fx - x0;

      const a = mascara[y0 * lado + x0];
      const b = mascara[y0 * lado + x1];
      const c = mascara[y1 * lado + x0];
      const d = mascara[y1 * lado + x1];
      const arriba = a + (b - a) * tx;
      const abajo = c + (d - c) * tx;
      salida[y * ancho + x] = arriba + (abajo - arriba) * ty;
    }
  }
  return salida;
}

/**
 * Cuánto tiene que valer la máscara para que el pixel se considere producto.
 *
 * No es un corte duro: los valores entre `PISO` y `TECHO` quedan a media
 * transparencia, que es lo que da un contorno sin escalera y lo que salva el
 * pelo, el asa fina y el borde de una bolsa.
 *
 * Debajo de `PISO` se va a cero DE VERDAD. Dejar un 5 % de alfa en todo el fondo
 * parece inofensivo y no lo es: sobre la tarjeta se ve como una neblina gris
 * alrededor del producto.
 */
export const PISO = 0.28;
export const TECHO = 0.62;

// ── SUBIR EL PISO SE PROBÓ Y SE DESCARTÓ, CON NÚMEROS ─────────────────────
//
// La bolsa de borde dentado deja un halo de fondo alrededor de las muescas. La
// reacción natural es subir el piso para recortar más. Medido con 0,45 en vez de
// 0,28, sobre los seis casos de `sonda-u2netp-casos.mjs`:
//
//   bolsa, fondo quitado    82,2 %  →  83,9 %   (+1,7)
//   botella, producto        99,9 %  →  99,7 %   (−0,2)
//
// O sea que no arregla nada y empieza a comer producto. El halo no es del
// umbral: es que la máscara se infiere a 320×320, y unas muescas de siete
// píxeles sobre una imagen de ochenta no se resuelven a esa escala. Con otro
// piso salen igual de rellenas, solo que un poco más chicas.
//
// Queda en 0,28, que es el lado conservador: ante la duda, conservar producto.
// Comerse el producto es el defecto que motivó toda la tanda.

/**
 * Convierte el valor de la máscara en el alfa que va al pixel.
 *
 * @param {number} v entre 0 y 1
 * @returns {number} entre 0 y 255
 */
export function alfaDesdeMascara(v) {
  if (!Number.isFinite(v)) return 0;
  if (v <= PISO) return 0;
  if (v >= TECHO) return 255;
  return Math.round(((v - PISO) / (TECHO - PISO)) * 255);
}

/**
 * Aplica la máscara sobre la imagen y cuenta lo que hizo.
 *
 * Muta el `ImageData` que recibe —igual que el motor por bordes— y devuelve las
 * dos cosas que la costura necesita para decidir si confía: qué proporción se
 * fue, y un mapa de qué pixel quedó afuera para poder medir si lo que queda es
 * un objeto o son manchas.
 *
 * @returns {{proporcionQuitada:number, esFondo:Uint8Array}}
 */
export function componerAlfa(datos, mascara) {
  const { width: ancho, height: alto, data: px } = datos;
  const total = ancho * alto;
  const esFondo = new Uint8Array(total);
  let quitados = 0;

  for (let i = 0; i < total; i++) {
    const alfa = alfaDesdeMascara(mascara[i]);
    px[i * 4 + 3] = alfa;
    // "Fondo" para medir es lo que quedó mayormente transparente. El umbral de
    // 128 es el mismo criterio con el que se mira una máscara en cualquier lado:
    // por encima de la mitad, el pixel se ve.
    if (alfa < 128) {
      esFondo[i] = 1;
      quitados++;
    }
  }

  return { proporcionQuitada: total === 0 ? 0 : quitados / total, esFondo };
}

// ── DE ACÁ PARA ABAJO, LO QUE NECESITA UN NAVEGADOR ───────────────────────
//
// Todo lo de arriba son funciones puras y tienen candados que corren en Node.
// Lo de abajo carga WebAssembly y no se puede probar sin navegador: lo cubre la
// sonda.

let sesionPrometida = null;

/**
 * La sesión de inferencia, creada una sola vez por pestaña.
 *
 * ── POR QUÉ SE GUARDA LA PROMESA Y NO LA SESIÓN ───────────────────────────
 *
 * Porque si se guardara la sesión ya resuelta, dos fotos elegidas rápido una
 * detrás de otra arrancarían DOS cargas del modelo en paralelo —18 MB por
 * duplicado— antes de que la primera termine. Guardando la promesa, la segunda
 * espera a la primera.
 *
 * Si la carga falla, se limpia para que el próximo intento pueda reintentar en
 * vez de quedar pegado al error para siempre.
 */
export function sesion({ alAvanzar = null } = {}) {
  if (!sesionPrometida) {
    sesionPrometida = crearSesion({ alAvanzar }).catch((e) => {
      sesionPrometida = null;
      throw e;
    });
  }
  return sesionPrometida;
}

/** Para los candados y para la sonda: volver al estado de "nunca se cargó". */
export function olvidarSesion() {
  sesionPrometida = null;
}

async function crearSesion({ alAvanzar }) {
  // Import dinámico: sin esto, `onnxruntime-web` entra en el bundle de la
  // pantalla de productos y la carga inicial paga el JS del runtime aunque nadie
  // toque una foto. Así se trae recién cuando alguien elige una.
  const ort = await import("onnxruntime-web/wasm");

  // ── UN SOLO HILO, Y NO ES UNA PREFERENCIA ───────────────────────────────
  //
  // Los hilos de WebAssembly necesitan `SharedArrayBuffer`, que solo existe si
  // la página está aislada entre orígenes (COOP + COEP). Esta aplicación no lo
  // está y ponerla así rompería otras cosas. ORT lo detectaría solo, pero
  // dejarlo explícito evita que un día alguien vea "1 hilo" y crea que hay una
  // mejora fácil esperando.
  ort.env.wasm.numThreads = 1;

  // Los almacenes de versiones anteriores se van acá: cambiar el modelo cambia
  // el nombre del almacén, y sin esto los 18 MB viejos quedarían ocupando lugar
  // en el teléfono para siempre.
  await recursos.limpiarAlmacenesViejos();

  // ── UN CACHÉ CORRUPTO SE CURA, NO SE HEREDA ─────────────────────────────
  //
  // `conRecuperacionDeCache` corre esto una vez; si los bytes salieron del
  // almacén y la sesión no se pudo crear, invalida las dos entradas de ESTA
  // versión, baja de red una sola vez más y vuelve a intentar. Si falla de
  // nuevo, tira — y la cascada de `quitarFondo` cae al motor por bordes.
  //
  // Y lo que se guarda se guarda DESPUÉS de que esta función devolvió sin
  // tirar: nunca se cachean bytes con los que no se pudo crear una sesión.
  //
  // ── CUÁNDO SE CURA EN EL ACTO Y CUÁNDO RECIÉN AL RECARGAR ───────────────
  //
  // No es lo mismo que se corrompa uno u otro, y no se ve leyendo este archivo:
  // hay que ir a `node_modules/onnxruntime-web/lib/wasm/wasm-factory.ts`.
  //
  //   · MODELO corrupto — el runtime ya arrancó bien y lo que falla es
  //     `InferenceSession.create`. El reintento de acá lo resuelve EN LA MISMA
  //     CARGA: se baja el modelo de nuevo y la sesión sale.
  //
  //   · WASM corrupto — ORT pone su bandera `aborted` y NUNCA la vuelve a
  //     bajar (`dispose` tampoco: la deja en true). A partir de ahí, cualquier
  //     llamada en esa página tira "previous call to 'initializeWebAssembly()'
  //     failed" sin volver a mirar `wasmBinary`. O sea que el segundo intento
  //     también falla y esta foto sale por el motor de bordes.
  //
  // Igual sirve, y es la diferencia que importa: en los dos casos las entradas
  // podridas quedan BORRADAS. El caso del wasm se cura en la recarga siguiente,
  // que baja bytes sanos, en vez de quedar pegado al respaldo para siempre. La
  // sonda `sonda-u2netp-cache.mjs` ejerce los dos casos por separado justamente
  // porque se curan en momentos distintos.
  return await recursos.conRecuperacionDeCache({
    traer: ({ sinCache }) => recursos.traerRecursos({ alAvanzar, sinCache }),
    invalidar: () => recursos.invalidarRecursos(),
    crear: async ({ wasm, modelo }) => {
      // El binario del runtime se lo damos NOSOTROS, ya bajado. Sin esto, ORT lo
      // iría a buscar solo a una ruta relativa que en Next no existe, y el error
      // que da —"no available backend found"— no dice nada de rutas.
      ort.env.wasm.wasmBinary = wasm;

      return await ort.InferenceSession.create(modelo, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    },
  });
}

/**
 * La máscara de producto para una imagen, del tamaño de la imagen.
 *
 * ── LOS NOMBRES DE ENTRADA Y SALIDA NO SE ESCRIBEN A MANO ─────────────────
 *
 * Se preguntan a la sesión. u2netp devuelve SIETE salidas —la fina y seis
 * intermedias de la pirámide— y la buena es la primera. Escribir "d0" o
 * "output" de memoria es la clase de cosa que funciona hasta que alguien
 * reexporta el modelo con otro nombre y falla con un mensaje que no ayuda.
 *
 * @returns {Promise<Float32Array>} de ancho*alto, valores de 0 a 1
 */
export async function mascaraDeProducto(datos, { alAvanzar = null } = {}) {
  const ort = await import("onnxruntime-web/wasm");
  const ses = await sesion({ alAvanzar });

  const entrada = prepararEntrada(datos);
  const tensor = new ort.Tensor("float32", entrada, [1, 3, LADO_ENTRADA, LADO_ENTRADA]);

  const nombreEntrada = ses.inputNames[0];
  const nombreSalida = ses.outputNames[0];
  const salida = await ses.run({ [nombreEntrada]: tensor });

  const cruda = salida[nombreSalida]?.data;
  if (!cruda || cruda.length !== LADO_ENTRADA * LADO_ENTRADA) {
    throw new Error(
      `La red devolvió una máscara de ${cruda ? cruda.length : 0} valores y se esperaban ${
        LADO_ENTRADA * LADO_ENTRADA
      }.`
    );
  }

  const normalizada = normalizarMascara(cruda);
  return escalarMascara(normalizada, LADO_ENTRADA, datos.width, datos.height);
}
