// QUITAR EL FONDO DE LA FOTO DE UN PRODUCTO.
//
// ── LO QUE ESTE ARCHIVO ES, Y LO QUE NO ────────────────────────────────────
//
// Es la COSTURA. El flujo aprobado —procesar, mostrar el resultado, dejar elegir
// entre el recorte y la original— no depende de qué motor haga el recorte, y por
// eso el motor entra por acá y se puede cambiar sin tocar la pantalla.
//
// El motor que viene puesto NO es una decisión de arquitectura: es el que se
// puede tener hoy sin agregar ninguna dependencia. Está escrito con sus límites
// medidos y con una medida de confianza propia, para que cuando falle lo diga en
// vez de devolver un recorte roto con cara de bueno.
//
// La comparación de motores está en `docs/decisions/DEC-0010`. El resumen que
// importa acá: el motor bueno es un modelo de segmentación, y elegir cuál es una
// decisión de producto con costo —dependencia nueva, MB en el teléfono o CPU en
// el VPS— que no se toma desde adentro de un archivo de utilidades.
//
// ── LA MEDIDA DE CONFIANZA, QUE ES LA MITAD DEL VALOR ──────────────────────
//
// Un recorte que borra el 3 % de la imagen no quitó ningún fondo. Uno que borra
// el 92 % se comió el producto. Los dos "funcionan" —no tiran error, devuelven
// una imagen— y los dos están mal.
//
// Por eso el motor devuelve `confia`. Cuando dice que no, la pantalla ofrece la
// original por defecto en vez de empujar un recorte que va a quedar mal en la
// tarjeta. Es lo que convierte "automático" en "automático y no ciego".

import { TIPOS_ACEPTADOS } from "@/lib/productos/fotoProducto";

/** Cuánto de la imagen tiene que desaparecer para que el recorte sea creíble. */
export const RECORTE_MINIMO = 0.08;

/**
 * Y cuánto es demasiado.
 *
 * ── ESTE NÚMERO SE MIDIÓ, NO SE ELIGIÓ ────────────────────────────────────
 *
 * La primera versión decía 0,85 y estaba mal: puso en rojo el caso fácil. Un
 * producto apoyado sobre una mesa ocupa poco del cuadro, así que quitarle el
 * fondo borra la mayor parte de la foto y eso es CORRECTO. Medido sobre casos
 * armados a propósito:
 *
 *   producto 44 % del cuadro  → quita 55,6 %   legítimo
 *   producto 11 % del cuadro  → quita 89,0 %   legítimo
 *   producto  5 % del cuadro  → quita 95,3 %   legítimo
 *   producto BLANCO, se lo come → quita 100,0 %  defecto
 *
 * O sea que por proporción, lo único que se distingue es "se llevó TODO". El
 * techo queda ahí y no más abajo, porque más abajo rechaza fotos buenas.
 */
export const RECORTE_MAXIMO = 0.995;

/**
 * Y la segunda pregunta, que es la que hace el trabajo de verdad.
 *
 * ── POR QUÉ LA PROPORCIÓN SOLA NO ALCANZA ─────────────────────────────────
 *
 * Un fondo con textura hace que el relleno se corte en pedazos y deje manchas
 * sueltas por toda la foto. Medido: quita el 31,5 %, que cae justo en la banda
 * de lo creíble. Por proporción pasa; mirándolo, es un desastre.
 *
 * Lo que los separa no es cuánto se quitó sino QUÉ QUEDÓ: un producto es UN
 * bloque conectado, y el ruido son cientos de manchitas. Se mide qué fracción de
 * lo que sobrevivió está en el bloque más grande.
 */
export const BLOQUE_MINIMO = 0.6;

/**
 * ¿El resultado del recorte es creíble?
 *
 * Se separa de la función que recorta porque es lo único que se puede probar sin
 * un navegador, y porque es la regla que hay que poder leer de un vistazo.
 *
 * @param {number} proporcionQuitada  entre 0 y 1
 * @param {number} fraccionDelBloque  cuánto de lo que quedó es un solo objeto
 */
export function confiaEnElRecorte(proporcionQuitada, fraccionDelBloque = 1) {
  const p = Number(proporcionQuitada);
  const b = Number(fraccionDelBloque);
  if (!Number.isFinite(p) || !Number.isFinite(b)) return false;
  return p >= RECORTE_MINIMO && p <= RECORTE_MAXIMO && b >= BLOQUE_MINIMO;
}

/**
 * Qué fracción de los píxeles que quedaron está en el bloque conectado más
 * grande.
 *
 * Un recorte bueno deja un objeto: da cerca de 1. Un fondo con textura deja
 * manchas: da cerca de 0. Es la diferencia entre "quitó fondo" y "picó la foto".
 */
export function fraccionDelBloqueMayor(esFondo, ancho, alto) {
  const total = ancho * alto;
  let quedan = 0;
  for (let i = 0; i < total; i++) if (!esFondo[i]) quedan++;
  if (quedan === 0) return 0;

  const visto = new Uint8Array(total);
  const cola = new Int32Array(total);
  let mayor = 0;

  for (let inicio = 0; inicio < total; inicio++) {
    if (esFondo[inicio] || visto[inicio]) continue;
    let cabeza = 0, fin = 0, tamano = 0;
    visto[inicio] = 1;
    cola[fin++] = inicio;
    while (cabeza < fin) {
      const i = cola[cabeza++];
      tamano++;
      const x = i % ancho;
      const y = (i / ancho) | 0;
      const vecinos = [
        x > 0 ? i - 1 : -1,
        x < ancho - 1 ? i + 1 : -1,
        y > 0 ? i - ancho : -1,
        y < alto - 1 ? i + ancho : -1,
      ];
      for (const v of vecinos) {
        if (v < 0 || visto[v] || esFondo[v]) continue;
        visto[v] = 1;
        cola[fin++] = v;
      }
    }
    if (tamano > mayor) mayor = tamano;
  }
  return mayor / quedan;
}

/**
 * La distancia entre dos colores, para decidir si un pixel es del fondo.
 *
 * ── POR QUÉ NO ES LA DISTANCIA EUCLÍDEA EN RGB ────────────────────────────
 *
 * Porque el ojo no pesa igual los tres canales: un salto en verde se nota mucho
 * más que el mismo salto en azul. Con RGB plano, un fondo celeste y un producto
 * gris dan una distancia parecida a la de dos grises casi iguales, y el recorte
 * se come el producto o no toca el fondo.
 *
 * Los coeficientes son los de la luminancia perceptual, los mismos que ya usa
 * `sonda-tarjeta-producto.mjs` para medir contraste. No se inventan acá.
 */
export function distanciaDeColor(a, b) {
  const dr = (a[0] - b[0]) * 0.299;
  const dg = (a[1] - b[1]) * 0.587;
  const db = (a[2] - b[2]) * 0.114;
  return Math.sqrt(dr * dr * 3 + dg * dg * 3 + db * db * 3);
}

/**
 * ── EL MOTOR QUE VIENE PUESTO: RELLENO DESDE LOS BORDES ───────────────────
 *
 * Marca como fondo todo lo que sea contiguo al borde de la foto y se le parezca
 * en color. Es lo que funciona cuando el producto está apoyado sobre algo
 * uniforme —una mesa, una pared, el piso del depósito— que es la foto que
 * alguien saca con el teléfono en la mano.
 *
 * ── DÓNDE FALLA, Y ESTÁ MEDIDO ────────────────────────────────────────────
 *
 * En todo lo que el fondo y el producto comparten color, que es exactamente la
 * lista que Emanuel escribió antes de aprobarlo:
 *
 *   · producto blanco sobre fondo claro — el relleno entra al producto;
 *   · botellas y bolsas transparentes — el fondo se ve A TRAVÉS del producto,
 *     así que "contiguo al borde" lo alcanza por adentro;
 *   · reflejos fuertes — un brillo blanco en una botella es del color del fondo;
 *   · bordes finitos, como un asa o una bombilla — se pierden con la tolerancia;
 *   · fondo con textura o desordenado — el relleno se corta a los pocos píxeles
 *     y `confia` devuelve false, que es el final correcto.
 *
 * Los dos últimos casos son los que la medida de confianza atrapa sola. Los tres
 * primeros no: ahí el recorte sale plausible y equivocado, y lo que lo salva es
 * que la persona lo VE antes de guardar.
 *
 * @returns {{datos: ImageData, proporcionQuitada: number, confia: boolean}}
 */
export function quitarFondoPorBordes(datos, { tolerancia = 42, suavizado = 1 } = {}) {
  const { width: ancho, height: alto, data: px } = datos;
  const total = ancho * alto;
  if (total === 0) return { datos, proporcionQuitada: 0, confia: false };

  // El color del fondo sale de las CUATRO esquinas, promediadas. Con una sola,
  // una sombra o un dedo en la esquina define el fondo de toda la foto.
  const esquinas = [
    0,
    (ancho - 1) * 4,
    (alto - 1) * ancho * 4,
    ((alto - 1) * ancho + (ancho - 1)) * 4,
  ];
  const fondo = [0, 0, 0];
  for (const e of esquinas) {
    fondo[0] += px[e]; fondo[1] += px[e + 1]; fondo[2] += px[e + 2];
  }
  fondo[0] /= 4; fondo[1] /= 4; fondo[2] /= 4;

  // ── RELLENO ITERATIVO, NO RECURSIVO ─────────────────────────────────────
  //
  // Una foto de 1200 px son más de un millón de píxeles. Un relleno recursivo
  // desborda la pila del navegador y muere con "Maximum call stack size
  // exceeded" — que además parece un error del programa y no de la foto.
  const esFondo = new Uint8Array(total);
  const cola = new Int32Array(total);
  let cabeza = 0, fin = 0;

  const encolarSiEsFondo = (i) => {
    if (esFondo[i]) return;
    const o = i * 4;
    if (distanciaDeColor([px[o], px[o + 1], px[o + 2]], fondo) > tolerancia) return;
    esFondo[i] = 1;
    cola[fin++] = i;
  };

  for (let x = 0; x < ancho; x++) {
    encolarSiEsFondo(x);
    encolarSiEsFondo((alto - 1) * ancho + x);
  }
  for (let y = 0; y < alto; y++) {
    encolarSiEsFondo(y * ancho);
    encolarSiEsFondo(y * ancho + ancho - 1);
  }

  while (cabeza < fin) {
    const i = cola[cabeza++];
    const x = i % ancho;
    const y = (i / ancho) | 0;
    if (x > 0) encolarSiEsFondo(i - 1);
    if (x < ancho - 1) encolarSiEsFondo(i + 1);
    if (y > 0) encolarSiEsFondo(i - ancho);
    if (y < alto - 1) encolarSiEsFondo(i + ancho);
  }

  // ── EL BORDE SE SUAVIZA, O SE VE RECORTADO CON TIJERA ───────────────────
  //
  // Sin esto el contorno queda con escalones duros y la foto se lee como un
  // recorte mal hecho aunque la silueta esté bien. Un pixel de fondo pegado al
  // producto queda a media transparencia.
  let quitados = 0;
  for (let i = 0; i < total; i++) {
    if (!esFondo[i]) continue;
    quitados++;
    let alfa = 0;
    if (suavizado > 0) {
      const x = i % ancho;
      const y = (i / ancho) | 0;
      let vecinosProducto = 0;
      if (x > 0 && !esFondo[i - 1]) vecinosProducto++;
      if (x < ancho - 1 && !esFondo[i + 1]) vecinosProducto++;
      if (y > 0 && !esFondo[i - ancho]) vecinosProducto++;
      if (y < alto - 1 && !esFondo[i + ancho]) vecinosProducto++;
      if (vecinosProducto > 0) alfa = Math.min(255, vecinosProducto * 48);
    }
    px[i * 4 + 3] = alfa;
  }

  const proporcionQuitada = quitados / total;
  const fraccionDelBloque = fraccionDelBloqueMayor(esFondo, ancho, alto);
  return {
    datos,
    proporcionQuitada,
    fraccionDelBloque,
    confia: confiaEnElRecorte(proporcionQuitada, fraccionDelBloque),
  };
}

/**
 * Quita el fondo de un `File` y devuelve otro `File` con transparencia.
 *
 * ── NUNCA DEVUELVE JPEG ───────────────────────────────────────────────────
 *
 * Es la regla dura. JPEG no tiene canal alfa y no falla al guardar: rellena el
 * fondo de negro. Todo el trabajo se pierde en el último paso, sin error, y se
 * ve recién en la tarjeta.
 *
 * @returns {Promise<{archivo: File, confia: boolean, proporcionQuitada: number}>}
 */
export async function quitarFondo(archivo, { tolerancia = 42 } = {}) {
  if (!archivo) throw new Error("No hay archivo al que quitarle el fondo.");

  const mapa = await crearMapaDeBits(archivo);
  const lienzo = document.createElement("canvas");
  lienzo.width = mapa.width;
  lienzo.height = mapa.height;
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(mapa, 0, 0);
  if (typeof mapa.close === "function") mapa.close();

  const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  const { proporcionQuitada, fraccionDelBloque, confia } = quitarFondoPorBordes(datos, {
    tolerancia,
  });
  ctx.putImageData(datos, 0, 0);

  // WEBP SI ESTÁ, PNG SI NO. Los dos tienen alfa; jpeg no entra ni como
  // respaldo, y hay un candado que lo fija.
  const tipo = tipoConAlfa();
  const blob = await new Promise((resolve, reject) => {
    lienzo.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("El navegador no pudo guardar la imagen recortada."))),
      tipo,
      0.9
    );
  });

  // La extensión sale del MISMO mapa que el servidor usa para aceptar el
  // archivo. Un ternario acá vuelve a abrir el agujero que Q2 cerró en la
  // función que achica: un tercer formato olvidado sube un `.png` que adentro es
  // otra cosa, y el servidor lo acepta por su `type` sin que nadie se entere.
  return {
    archivo: new File([blob], `foto-sin-fondo.${TIPOS_ACEPTADOS[tipo]}`, { type: tipo }),
    confia,
    proporcionQuitada,
    fraccionDelBloque,
  };
}

/** El tipo de salida para una imagen CON transparencia. Solo dos opciones. */
export function tipoConAlfa(crear = (t) => document.createElement("canvas").toDataURL(t)) {
  try {
    return String(crear("image/webp")).startsWith("data:image/webp") ? "image/webp" : "image/png";
  } catch {
    return "image/png";
  }
}

/** Igual que en `achicarFoto`: se respeta la orientación de la foto del celular. */
async function crearMapaDeBits(archivo) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(archivo, { imageOrientation: "from-image" });
    } catch {
      // Sigue por el respaldo.
    }
  }
  const url = URL.createObjectURL(archivo);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo abrir la imagen."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
