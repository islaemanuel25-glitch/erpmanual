// ¿EL RECORTE ES CREÍBLE? LA REGLA, SEPARADA DE QUIÉN RECORTA.
//
// ── POR QUÉ VIVE SOLA Y NO ADENTRO DE UN MOTOR ────────────────────────────
//
// Porque la usan los dos. Cuando se agregó u2netp, esta regla estaba escrita
// adentro de `quitarFondo.js` junto con el motor por bordes; dejarla ahí obligaba
// a que el motor nuevo importara del archivo que lo importa a él, o —lo que
// siempre termina pasando— a escribir una parecida al lado.
//
// Es además lo único de todo esto que se puede probar sin un navegador, y por eso
// conviene poder leerlo de un vistazo.
//
// ── LA MEDIDA DE CONFIANZA ES LA MITAD DEL VALOR ──────────────────────────
//
// Un recorte que borra el 3 % de la imagen no quitó ningún fondo. Uno que borra
// el 100 % se comió el producto. Los dos "funcionan" —no tiran error, devuelven
// una imagen— y los dos están mal.
//
// Cuando esto dice que no confía, la pantalla ofrece la original por defecto en
// vez de empujar un recorte que va a quedar mal en la tarjeta. Es lo que
// convierte "automático" en "automático y no ciego".

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
 * Un fondo con textura hace que el motor por bordes se corte en pedazos y deje
 * manchas sueltas por toda la foto. Medido: quita el 31,5 %, que cae justo en la
 * banda de lo creíble. Por proporción pasa; mirándolo, es un desastre.
 *
 * Lo que los separa no es cuánto se quitó sino QUÉ QUEDÓ: un producto es UN
 * bloque conectado, y el ruido son cientos de manchitas.
 *
 * Con u2netp el caso cambia de forma pero no desaparece: una red que no encuentra
 * objeto no devuelve manchas de fondo, devuelve una máscara tibia que al aplicar
 * el umbral deja parches. La pregunta sigue sirviendo igual.
 */
export const BLOQUE_MINIMO = 0.6;

/**
 * ¿El resultado del recorte es creíble?
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
