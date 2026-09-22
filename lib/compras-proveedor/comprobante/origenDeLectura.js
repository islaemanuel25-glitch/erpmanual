// QUIÉN PIDIÓ ESTA LECTURA.
//
// ── POR QUÉ HIZO FALTA ────────────────────────────────────────────────────
//
// El comprobante 13 del pedido 242 tenía DIEZ llamadas al lector y nadie podía
// decir por qué: la tabla guarda cuándo, con qué modelo y si salió bien, no
// quién la pidió. Emanuel decía haber tocado "Leer de nuevo" dos o tres veces.
//
// La respuesta se sacó cruzando dos números —`intentosLectura` estaba en
// CUATRO, así que solo cuatro de las diez habían reescrito los renglones; las
// otras seis eran pruebas de la receta, que no tocan nada—. Salió bien, pero es
// una deducción, y la próxima vez puede no haber dos números que cruzar.
//
// ── LA REGLA QUE ESTA LISTA HACE COMPROBABLE ──────────────────────────────
//
// **Una lectura corre cuando una persona la pide.** Tocar "Leer de nuevo",
// subir una foto, o pedir la relectura después de escribir la receta. NUNCA al
// abrir ni al refrescar una pantalla: una lectura borra los renglones del
// comprobante y los crea de nuevo, así que una que arranque sola se lleva
// puesto el control que alguien venía haciendo.
//
// Con el origen guardado, esa regla se comprueba mirando la tabla en vez de
// leyendo el código de las pantallas.

export const ORIGEN_DE_LECTURA = Object.freeze({
  /** Alguien tocó "Leer de nuevo" en la lista de comprobantes. */
  BOTON: "BOTON",
  /** Alguien subió una foto y el pedido nace de esa factura, así que se lee. */
  AL_SUBIR: "AL_SUBIR",
  /** Alguien escribió la receta del proveedor y pidió releer los pendientes. */
  RECETA: "RECETA",
  /** "Probar: ver cómo lo entiende". NO escribe renglones. */
  PRUEBA_DE_RECETA: "PRUEBA_DE_RECETA",
  /** Llegó sin decir quién la pidió: una pantalla vieja, o algo por fuera. */
  SIN_DECLARAR: "SIN_DECLARAR",
});

const CONOCIDOS = new Set(Object.values(ORIGEN_DE_LECTURA));

/**
 * El origen que llegó, si es uno de los conocidos.
 *
 * No se guarda lo que venga: la columna existe para poder contar por origen, y
 * un texto libre la convierte en otra cosa que hay que interpretar. Lo que no
 * se reconoce queda como SIN_DECLARAR, que es la verdad.
 */
export function origenDeLectura(valor) {
  const t = String(valor ?? "").trim().toUpperCase();
  return CONOCIDOS.has(t) ? t : ORIGEN_DE_LECTURA.SIN_DECLARAR;
}

/** Si este origen REESCRIBE los renglones del comprobante. */
export function reescribeLosRenglones(origen) {
  return origenDeLectura(origen) !== ORIGEN_DE_LECTURA.PRUEBA_DE_RECETA;
}

/** Cómo se dice en castellano, para un informe. */
export const TEXTO_DEL_ORIGEN = Object.freeze({
  BOTON: "alguien tocó «Leer de nuevo»",
  AL_SUBIR: "alguien subió la foto y el pedido nace de esa factura",
  RECETA: "se pidió la relectura después de escribir la receta",
  PRUEBA_DE_RECETA: "se probó la receta (no reescribe renglones)",
  SIN_DECLARAR: "no lo declaró quien la pidió",
});
