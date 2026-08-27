// CUÁNTO PUEDE APARTARSE EL PRECIO DEL PAPEL DEL COSTO QUE YA TENEMOS.
//
// ── DOS TOLERANCIAS QUE NO SE MEZCLAN ─────────────────────────────────────
//
// Ésta es COMERCIAL: mide cuánto se movió un precio entre la última compra y
// ésta, se expresa en porcentaje y se configura, porque cuánto aumenta un
// proveedor es un hecho del mundo y no del código.
//
// La otra —`coherenciaDeLinea.js`— es ARITMÉTICA: mide redondeo, se expresa en
// centavos y no se configura, porque es una consecuencia de dividir y volver a
// multiplicar.
//
// Están en archivos distintos a propósito. Si fueran un solo número, ensanchar
// el criterio comercial —algo que va a pasar, en cuanto un proveedor aumente
// fuerte— aflojaría en silencio la aritmética, que es lo único que no se afloja.
// Un candado comprueba que ninguna de las dos importe a la otra.
//
// ── LO QUE ESTE MÓDULO NO HACE, Y ES LO MÁS IMPORTANTE ────────────────────
//
// No devuelve NINGÚN número para guardar. Devuelve qué escala explica mejor el
// precio y cuán lejos quedó, y eso se usa para PROPONER y para preguntar.
//
// `precioSistema ÷ precioPapel` no se persiste jamás. Los precios cambian todas
// las semanas y ese cociente cambia con ellos; guardarlo sería congelar el
// aumento de esta factura y aplicárselo a las siguientes. El factor permanente
// son las unidades por presentación del proveedor y las unidades por bulto del
// ERP, que son las que sí se guardan.

/**
 * EL DEFAULT, DEFINIDO UNA SOLA VEZ.
 *
 * 40 % no es una medición: es un punto de partida, y por eso el valor es
 * configurable. Lo que sí está pensado es el orden de magnitud — un aumento
 * grande entre dos compras es de decenas por ciento, y la confusión que este
 * módulo busca distinguir es un factor de bulto, o sea centenares.
 *
 * Cuando haya facturas de varios proveedores para medirlo, el número se ajusta
 * acá y en ningún otro lado. Escribirlo a mano en cada consumidor es lo que hizo
 * que el rango de aumento esperado terminara en cinco lugares distintos con tres
 * copias de `?? 10`.
 */
export const TOLERANCIA_ESCALA_POR_DEFECTO_PCT = 40;

/**
 * Cuánto mejor tiene que explicar la ganadora para que se le crea.
 *
 * En distancia logarítmica, que es simétrica: un precio diez veces más alto y
 * uno diez veces más bajo quedan a la misma distancia. En porcentaje no pasa
 * eso —+900 % contra −90 %— y por eso el porcentaje sirve para MOSTRARLE el
 * número a una persona, no para decidir.
 */
export const MARGEN_EVIDENCIA = 0.5;

const num = (valor) => {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
};

/** La tolerancia que rige, con el default cuando no hay una configurada. */
export function toleranciaEscalaPct(configurada) {
  const n = num(configurada);
  if (n === null || n < 0 || n > 1000) return TOLERANCIA_ESCALA_POR_DEFECTO_PCT;
  return n;
}

/** Cuánto se aparta un precio de una referencia, en porcentaje. Null sin referencia. */
export function desvioPct(precio, referencia) {
  const p = num(precio);
  const r = num(referencia);
  if (p === null || r === null || r <= 0) return null;
  return ((p - r) / r) * 100;
}

/**
 * QUÉ ESCALA EXPLICA EL PRECIO IMPRESO, Y CUÁN LEJOS QUEDÓ CADA UNA.
 *
 * Devuelve las dos diferencias en porcentaje —contra el costo por unidad y
 * contra el costo por bulto—, cuál queda más cerca, y si esa ganadora entra
 * dentro de la tolerancia.
 *
 * `dentroDeTolerancia: false` significa NO INTERPRETAR: ninguna de las dos
 * escalas explica el precio lo bastante bien como para decidir sola, y lo que
 * corresponde es preguntar. No es lo mismo que no tener evidencia —eso es
 * `null`—: acá hay evidencia y dice que no alcanza.
 */
export function evidenciaDeEscala({
  precioPapel,
  costoUnidadErp,
  costoBultoErp,
  toleranciaPct = null,
} = {}) {
  const p = num(precioPapel);
  const porUnidad = num(costoUnidadErp);
  const porBulto = num(costoBultoErp);
  if (p === null || p <= 0) return null;
  if ((porUnidad === null || porUnidad <= 0) && (porBulto === null || porBulto <= 0)) return null;

  const tolerancia = toleranciaEscalaPct(toleranciaPct);
  const pctUnidad = desvioPct(p, porUnidad);
  const pctBulto = desvioPct(p, porBulto);

  // Distancia logarítmica para ELEGIR, porcentaje para MOSTRAR. Ver arriba.
  const separacion = (referencia) => {
    const r = num(referencia);
    if (r === null || r <= 0) return null;
    return Math.abs(Math.log(p / r));
  };
  const dUnidad = separacion(porUnidad);
  const dBulto = separacion(porBulto);

  const comun = { pctContraUnidad: pctUnidad, pctContraBulto: pctBulto, toleranciaPct: tolerancia };

  if (dUnidad === null || dBulto === null) {
    const unica = dUnidad === null ? "BULTO" : "UNIDAD";
    const pct = unica === "BULTO" ? pctBulto : pctUnidad;
    return {
      ...comun,
      masCercana: unica,
      separacion: dUnidad === null ? dBulto : dUnidad,
      // Sin la otra referencia no hay margen que medir: hay una sola candidata y
      // lo único que se puede preguntar es si está lo bastante cerca.
      margen: null,
      desvioDeLaMasCercanaPct: pct,
      dentroDeTolerancia: pct !== null && Math.abs(pct) <= tolerancia,
      distingue: false,
    };
  }

  const gana = dUnidad <= dBulto ? "UNIDAD" : "BULTO";
  const mejor = Math.min(dUnidad, dBulto);
  const peor = Math.max(dUnidad, dBulto);
  const margen = peor - mejor;
  const pctGanadora = gana === "UNIDAD" ? pctUnidad : pctBulto;

  return {
    ...comun,
    masCercana: gana,
    separacion: mejor,
    alternativa: peor,
    margen,
    desvioDeLaMasCercanaPct: pctGanadora,
    // Las DOS condiciones, y hacen falta las dos. `distingue` dice que una
    // explica claramente mejor que la otra; `dentroDeTolerancia` dice que además
    // la ganadora es creíble por sí sola. Dos referencias igual de malas pueden
    // distinguirse entre sí y no servir ninguna.
    distingue: margen >= MARGEN_EVIDENCIA,
    dentroDeTolerancia: pctGanadora !== null && Math.abs(pctGanadora) <= tolerancia,
  };
}

/**
 * ¿Alcanza esta evidencia para interpretar sin preguntar?
 *
 * Una sola función para que la prioridad de `resolverUnidadDelPapel` y la
 * pantalla no puedan opinar distinto.
 */
export function evidenciaAlcanza(evidencia) {
  if (!evidencia) return false;
  return evidencia.distingue === true && evidencia.dentroDeTolerancia === true;
}
