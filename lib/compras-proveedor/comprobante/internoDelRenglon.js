// EL IMPUESTO INTERNO SE TRANSCRIBE COMO ESTÁ IMPRESO, Y LA ESCALA LA DECIDE
// LA CUENTA DEL PIE.
//
// ── EL DEFECTO QUE ESTO CIERRA ────────────────────────────────────────────
//
// El prompt pedía `internoUnitario` "por unidad". Dos proveedores reales lo
// imprimen distinto y los dos tienen razón:
//
//   · DYSSA lo imprime POR UNIDAD — 535,47 en un renglón de 36, y 535,47 × 36
//     es lo que da el interno del pie;
//   · TDC lo imprime POR RENGLÓN — 7.372,07 sobre 48 unidades, y 7.372,07 más
//     3.518,46 del otro renglón es lo que da el interno del pie.
//
// Pedirle "por unidad" al modelo le pide que DIVIDA, o sea que devuelva un
// número que no está impreso. Es el mismo agujero del campo derivable que
// `CLAUDE.md` tiene anotado con el total: un valor que el modelo puede calcular
// lo va a calcular, y entonces no se sabe si lo leyó o lo inventó. Con TDC el
// resultado era peor que una diferencia: 7.372,07 tomado como unitario y
// multiplicado por 48 da 353.859,36 de impuesto interno sobre un papel que trae
// 10.890,53.
//
// ── CÓMO SE DECIDE, Y POR QUÉ NO HACE FALTA PREGUNTARLE A NADIE ──────────
//
// El pie ya trae el impuesto interno total, y solo UNA de las dos lecturas lo
// reconcilia:
//
//   suma de (interno × cantidad) = interno del pie  → estaba impreso POR UNIDAD
//   suma de interno              = interno del pie  → estaba impreso POR RENGLÓN
//
// Es una MEDICIÓN contra un número que el papel imprime, no un heurístico. No
// hace falta un campo nuevo en la receta —que además no existiría mientras
// alguien está PROBANDO una explicación sin guardarla— ni una pregunta más al
// lector.
//
// ── QUÉ PASA CUANDO NO SE PUEDE DECIDIR ──────────────────────────────────
//
// Se cae a POR UNIDAD, que es lo que el sistema hizo siempre y lo que sigue
// haciendo DYSSA. Los tres casos en que no se puede decidir:
//
//   · el pie no trae el interno — no hay contra qué medir;
//   · ninguna de las dos reconcilia — el papel no cierra por otra cosa, y
//     forzar una escala taparía ese problema con otro;
//   · las dos reconcilian — pasa cuando todos los renglones con interno tienen
//     cantidad 1, y ahí las dos dan el mismo número, así que da igual.
//
// Módulo puro: sin Prisma, sin red y sin React.

import { aCentavos } from "./impuestos.js";
import { esElInternoDelPie } from "./conceptosDelPie.js";

export const ESCALA_INTERNO = Object.freeze({
  UNIDAD: "UNIDAD",
  RENGLON: "RENGLON",
});

/**
 * ¿ESTE PAPEL TIENE IMPUESTO INTERNO?
 *
 * ── LA DECISIÓN, Y POR QUÉ NO ES UNA CASILLA ─────────────────────────────
 *
 * Se responde desde el ENTENDIMIENTO DEL PAPEL: la explicación en palabras que
 * escribió Emanuel, o el pie, que lo imprime. No desde un tilde que alguien
 * tenga que acordarse de poner en la receta.
 *
 * El diseño es ése: la IA entiende el papel una vez y la cuenta del pie
 * confirma que entendió bien. Una casilla aparte es una tercera fuente que
 * puede contradecir a las otras dos, y cuando se contradice, lo hace en
 * silencio.
 *
 * ── EL DAÑO MEDIDO ───────────────────────────────────────────────────────
 *
 * pyg —TDC— no tiene receta guardada, así que caía en el default con la casilla
 * en false. Con eso, `internoImpreso` ni siquiera entraba al esquema del lector
 * —el modelo no lo devolvía— y el control no sumaba el interno. El comprobante
 * no cerraba por $10.890,56, que es exactamente el IMP. INT. impreso. Y la
 * explicación de Emanuel decía, con todas las letras, que hay una columna de
 * impuesto interno por renglón.
 *
 * ── LAS TRES FUENTES, Y QUE SUMEN ────────────────────────────────────────
 *
 * Alcanza con UNA. La receta sigue valiendo para el proveedor que ya la tiene
 * configurada; la explicación sirve ANTES de leer, que es cuando se arma el
 * esquema del prompt; y el pie sirve DESPUÉS, que es cuando se verifica. Las
 * tres dicen lo mismo sobre el mismo papel y ninguna puede apagar a las otras.
 *
 * @param {object} args
 * @param {object} [args.receta]      la del proveedor, con su `explicacion`.
 * @param {object} [args.pie]         el del papel ya leído.
 * @param {string} [args.explicacion] por si viene suelta y no adentro de la receta.
 */
export function papelTieneInterno({ receta = null, pie = null, explicacion = null } = {}) {
  if (receta?.tieneImpuestoInterno === true) return true;

  const texto = String(explicacion ?? receta?.explicacion ?? "");
  if (texto && mencionaInterno(texto)) return true;

  if (pie) {
    // El pie puede traerlo como campo propio o como uno de los conceptos.
    const campo = pie.interno;
    if (campo !== null && campo !== undefined && campo !== "" && Number(campo) > 0) return true;
    const conceptos = Array.isArray(pie.conceptos) ? pie.conceptos : [];
    if (conceptos.some((c) => esElInternoDelPie(c?.nombre) && Number(c?.importe) > 0)) return true;
  }

  return false;
}

/**
 * Cómo se nombra el impuesto interno en castellano de factura.
 *
 * Se mira la EXPLICACIÓN, que es texto libre que escribe una persona, así que
 * la lista es de formas reales y no de una gramática: "imp int", "imp. interno",
 * "impuesto interno", "impuestos internos", "II". Se descarta lo que diga
 * percepción o retención, igual que hace `esElInternoDelPie` con el pie: una
 * "percepción de internos" es otra cosa.
 */
const NOMBRA_INTERNO = /\b(?:imp(?:uesto)?s?\.?\s*int(?:erno)?s?|internos?)\b/i;
const ES_PERCEPCION = /percep|retenc/i;

/**
 * Se mira FRASE POR FRASE, y no la explicación entera de una.
 *
 * Un `(?!.*percep)` adelante del patrón NO alcanza: el motor retrocede hasta
 * una posición donde la mirada hacia adelante da bien y encuentra la frase
 * igual. Medido — "trae percepcion de impuestos internos" pasaba el filtro.
 *
 * Partiendo por comas, puntos y renglones, cada frase se juzga sola: nombra el
 * interno Y no habla de una percepción. Así una explicación que menciona las
 * dos cosas —que es lo normal en un papel con percepciones— activa el interno
 * por la frase que corresponde y no por la otra.
 */
function mencionaInterno(texto) {
  return String(texto)
    .split(/[.,;\n]/)
    .some((frase) => NOMBRA_INTERNO.test(frase) && !ES_PERCEPCION.test(frase));
}

/**
 * El interno que trajo la línea, en centavos, sin interpretar la escala.
 *
 * Acepta el nombre nuevo —`internoImpreso`, que es lo que pide el prompt desde
 * esta tanda— y el viejo `internoUnitario`, porque las lecturas ya guardadas lo
 * tienen así y no se reescriben. Nunca los suma: el nuevo manda si vino.
 */
export function internoImpresoCentavos(linea) {
  const nuevo = linea?.internoImpreso;
  if (nuevo !== null && nuevo !== undefined && nuevo !== "") return aCentavos(nuevo);
  return aCentavos(linea?.internoUnitario);
}

/**
 * ¿CÓMO ESTABA IMPRESO EL INTERNO EN ESTE PAPEL?
 *
 * @param {object} args
 * @param {Array} args.lineas
 * @param {object} args.pie     el del papel; se mira `pie.interno`.
 * @param {number} [args.tolerancia] centavos de margen. Un peso, el mismo que
 *        usa el control del total: los papeles redondean por renglón.
 * @returns {{escala: string, medido: boolean, porUnidadCentavos: number,
 *            porRenglonCentavos: number, declaradoCentavos: number|null}}
 *
 * `medido` en false significa "no se pudo decidir y se cayó al default". Viaja
 * para que quien quiera avisarlo pueda, en vez de que la caída sea invisible.
 */
export function escalaDelInterno({ lineas = [], pie = {}, tolerancia = 100 } = {}) {
  let porUnidad = 0;
  let porRenglon = 0;
  for (const l of lineas || []) {
    const imp = internoImpresoCentavos(l);
    if (!imp) continue;
    const cant = Number(l?.cantidad) || 0;
    porUnidad += imp * cant;
    porRenglon += imp;
  }

  const declarado =
    pie?.interno === null || pie?.interno === undefined || pie?.interno === ""
      ? null
      : aCentavos(pie.interno);

  const base = {
    porUnidadCentavos: porUnidad,
    porRenglonCentavos: porRenglon,
    declaradoCentavos: declarado,
  };

  if (declarado === null) return { escala: ESCALA_INTERNO.UNIDAD, medido: false, ...base };

  const cierraPorUnidad = Math.abs(porUnidad - declarado) <= tolerancia;
  const cierraPorRenglon = Math.abs(porRenglon - declarado) <= tolerancia;

  // Las dos, o ninguna: no hay nada que decidir. Ver el encabezado.
  if (cierraPorUnidad === cierraPorRenglon) {
    return { escala: ESCALA_INTERNO.UNIDAD, medido: false, ...base };
  }
  return {
    escala: cierraPorUnidad ? ESCALA_INTERNO.UNIDAD : ESCALA_INTERNO.RENGLON,
    medido: true,
    ...base,
  };
}

/**
 * DEJA CADA LÍNEA CON LAS DOS FORMAS DEL INTERNO, YA RESUELTAS.
 *
 *   · `internoLineaCentavos` — el del renglón entero, EXACTO. Es el que suma el
 *     control del pie, y por eso no puede pasar por un unitario redondeado: con
 *     TDC, 7.372,07 ÷ 48 redondeado y vuelto a multiplicar da 7.371,84, y el
 *     interno del papel dejaría de cerrar por 23 centavos que nadie puso.
 *   · `internoUnitario` — el de una unidad, que es lo que entra en la fórmula
 *     del costo. Acá el redondeo sí es inevitable y es de un centavo.
 *
 * Todo lo demás de la línea queda igual. Devuelve objetos nuevos: no muta.
 */
export function normalizarInternoDeLineas({ lineas = [], pie = {}, tolerancia = 100 } = {}) {
  const deteccion = escalaDelInterno({ lineas, pie, tolerancia });
  const porRenglon = deteccion.escala === ESCALA_INTERNO.RENGLON;

  const normalizadas = (lineas || []).map((l) => {
    const imp = internoImpresoCentavos(l);
    const cant = Number(l?.cantidad) || 0;
    const lineaCentavos = porRenglon ? imp : imp * cant;
    return {
      ...l,
      internoLineaCentavos: lineaCentavos,
      internoUnitario:
        porRenglon && cant > 0 ? Math.round(imp / cant) / 100 : imp / 100,
    };
  });

  return { lineas: normalizadas, deteccion };
}
