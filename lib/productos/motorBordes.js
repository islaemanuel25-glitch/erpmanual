// EL MOTOR VIEJO: RELLENO DESDE LOS BORDES. AHORA ES EL RESPALDO.
//
// ── QUÉ ERA Y QUÉ ES AHORA ────────────────────────────────────────────────
//
// Fue el motor principal hasta que entró u2netp. No se borró y no es nostalgia:
// no necesita bajar 18 MB ni levantar WebAssembly, así que es lo único que puede
// funcionar cuando el motor bueno no puede. Un navegador sin WebAssembly, una
// red que se cortó a mitad de la descarga, un modelo que no se pudo leer.
//
// **No vuelve a ser el camino principal.** La costura lo llama solo después de
// que u2netp falló, y cuando eso pasa la pantalla lo dice.
//
// El código es el mismo que estaba en `quitarFondo.js`, movido sin cambios; lo
// único que salió de acá es la regla de confianza, que se comparte con el motor
// nuevo y por eso vive en `confianzaDelRecorte.js`.
//
// ── DÓNDE FALLA, Y ESTÁ MEDIDO ────────────────────────────────────────────
//
// Marca como fondo todo lo que sea contiguo al borde de la foto Y se le parezca
// en color. Eso funciona con un producto apoyado sobre algo uniforme, y falla en
// todo lo que comparta color con el fondo:
//
//   · producto blanco sobre fondo claro — el relleno entra al producto;
//   · botellas y bolsas transparentes — el fondo se ve A TRAVÉS del producto,
//     así que "contiguo al borde" lo alcanza por adentro;
//   · reflejos fuertes — un brillo blanco en una botella es del color del fondo;
//   · bordes finitos, como un asa o una bombilla — se pierden con la tolerancia;
//   · fondo con textura — el relleno se corta a los pocos píxeles y deja la foto
//     picada.
//
// Esa lista es exactamente la razón por la que se aprobó cambiar de motor: no
// son problemas de ajuste, son el límite de mirar color en vez de forma.

import {
  confiaEnElRecorte,
  fraccionDelBloqueMayor,
} from "@/lib/productos/confianzaDelRecorte";

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
 * Quita el fondo por relleno desde los bordes. Muta el `ImageData` que recibe.
 *
 * @returns {{datos: ImageData, proporcionQuitada: number, fraccionDelBloque: number, confia: boolean}}
 */
export function quitarFondoPorBordes(datos, { tolerancia = 42, suavizado = 1 } = {}) {
  const { width: ancho, height: alto, data: px } = datos;
  const total = ancho * alto;
  if (total === 0) return { datos, proporcionQuitada: 0, fraccionDelBloque: 0, confia: false };

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
