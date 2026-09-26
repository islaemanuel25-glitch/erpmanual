// LO QUE YA SE DECIDIÓ SOBRE UN PRECIO, Y HASTA CUÁNDO VALE.
//
// ── LA REGLA ───────────────────────────────────────────────────────────────
//
// Una decisión de precio se guarda y NO SE VUELVE A PREGUNTAR mientras el papel
// siga diciendo lo mismo contra lo mismo. Se vuelve a preguntar solo cuando uno
// de los dos números cambia: ahí la comparación es otra y hay que mirarla.
//
// Las dos respuestas son decisiones y las dos callan la pregunta. "Dejo el mío"
// no deja rastro en ningún lado —no escribe ningún costo—, así que si no se
// guardara sería la única que preguntaría para siempre, que es justo el caso
// que más molesta: la diferencia entre lo que factura el proveedor y el costo
// interno ES la ganancia del depósito, o sea que vuelve idéntica cada vez.
//
// ── QUÉ SE COMPARA, Y POR QUÉ LOS DOS LADOS ────────────────────────────────
//
// Los dos números que se le mostraron a quien decidió: el de la factura y el
// propio. Si cambia el de la factura, la decisión era sobre otro número. Si
// cambia el propio —porque alguien tocó el costo por otro lado—, la diferencia
// es otra aunque la factura diga lo mismo. Con un solo lado guardado no se
// podría distinguir un caso del otro.
//
// ── LA TOLERANCIA: LA MISMA QUE YA DECIDE "EL PRECIO CAMBIÓ" ───────────────
//
// Un centavo, y no es una segunda tolerancia: es la de `precioCambio`, que es
// la que hace aparecer la pregunta. Por eso vive acá y aquélla la importa.
//
// El criterio de Emanuel era exacto, "porque estos papeles traen el precio
// impreso y no un cálculo". Medido, la primera mitad es cierta y la segunda no:
// los quince renglones del comprobante 5 tienen el precio de factura en pesos
// redondos y el propio con un decimal a lo sumo, así que del PAPEL no viene
// ningún redondeo que pueda fallar.
//
// Lo que no es exacto es el camino: el número que se compara no es el impreso
// sino el de bulto, y sale de `precioFinal * factorPack` en punto flotante
// binario. 1000,06 por 10 da 10000.599999999999, y guardado en la base vuelve
// como 10000.6: ya no es igual a sí mismo. Medido barriendo dos millones de
// combinaciones de precio con dos decimales por los packs usuales, el 23,9 % no
// vuelve igual. Con comparación exacta, una de cada cuatro decisiones se
// vencería sola en la factura siguiente sin que nada hubiera cambiado, y
// volvería a preguntar exactamente lo que esta tanda vino a sacar.
//
// Un centavo cubre eso —el error está once órdenes de magnitud abajo, y las
// diferencias reales del comprobante 5 van de 480 a 3.960 pesos— y deja pasar
// solo lo que la pantalla ya considera "el mismo precio". Usar una más estricta
// acá crearía dos criterios para la misma pregunta: la tarjeta diría "no
// cambió" y la decisión diría "cambió", y no hay forma de que quien mira sepa a
// cuál creerle.
//
// Módulo puro: sin React y sin Prisma.

import { aCentavos } from "@/lib/compras-proveedor/comprobante/impuestos";

/** Las dos respuestas posibles. Los mismos valores que guarda la base. */
export const DECISION_DE_PRECIO = Object.freeze({
  /** El precio de la factura pasa a ser el costo. */
  ACEPTA_FACTURA: "ACEPTA_FACTURA",
  /** Entra la mercadería sin tocar el costo. */
  DEJA_EL_MIO: "DEJA_EL_MIO",
});

/** Un centavo. Ver el encabezado: es la tolerancia de toda la comparación. */
export const TOLERANCIA_DE_PRECIO = 0.01;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** ¿Son el mismo precio? Sin los dos números no se puede afirmar que sí. */
export function mismoPrecio(a, b) {
  const x = num(a);
  const y = num(b);
  if (x === null || y === null) return false;
  return Math.abs(x - y) <= TOLERANCIA_DE_PRECIO;
}

/** ¿Es una de las dos respuestas conocidas? Un valor viejo o roto no decide. */
export function esDecisionConocida(valor) {
  return (
    valor === DECISION_DE_PRECIO.ACEPTA_FACTURA || valor === DECISION_DE_PRECIO.DEJA_EL_MIO
  );
}

/**
 * LA DECISIÓN QUE SIGUE VALIENDO PARA ESTA LÍNEA, o `null`.
 *
 * Vale cuando los DOS números son los mismos sobre los que se decidió. Se
 * devuelve la decisión entera y no un booleano porque quien la muestra necesita
 * cuál fue y desde cuándo.
 */
export function decisionVigente(fila) {
  const d = fila?.decisionPrecio;
  if (!d || !esDecisionConocida(d.decision)) return null;
  if (!mismoPrecio(d.precioFacturado, fila?.costoFactura)) return null;
  if (!mismoPrecio(d.precioPropio, fila?.costoCatalogo)) return null;
  if (!mismoCatalogoQueAlDecidir(d, fila?.costoMaestroCatalogo)) return null;
  return d;
}

/**
 * ¿EL CATÁLOGO SIGUE EN EL NÚMERO QUE SE MIRÓ AL DECIDIR?
 *
 * No es una comparación comercial sino de concurrencia: "¿es el mismo estado
 * contra el que se decidió?". Por eso no usa la tolerancia de arriba ni la
 * variación del proveedor: igualdad exacta en centavos, que es la escala de
 * `ProductoBase.precio_costo` —Decimal(12,2)— y de la columna donde se guarda
 * lo observado. Los dos lados son el costo maestro crudo, sin conversión, así
 * que no pasan por ninguna cuenta en punto flotante que los aleje.
 *
 * Una decisión sin lo observado —las anteriores a la columna— NO vale: no hay
 * forma de demostrar que se tomó mirando este catálogo, y no se inventa.
 */
export function mismoCatalogoQueAlDecidir(decision, costoMaestroActual) {
  const observado = decision?.costoMaestroObservado;
  if (observado == null || costoMaestroActual == null) return false;
  const a = Number(observado);
  const b = Number(costoMaestroActual);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return aCentavos(a) === aCentavos(b);
}

/**
 * LA DECISIÓN QUE HABÍA Y YA NO APLICA, o `null`.
 *
 * Existe para poder decirlo al preguntar de nuevo: "antes decidiste otra cosa,
 * cuando los números eran estos". Preguntar de cero sobre algo que ya se
 * contestó una vez se lee como que el sistema se olvidó, que es de lo que esta
 * tanda se trata.
 */
export function decisionVencida(fila) {
  const d = fila?.decisionPrecio;
  if (!d || !esDecisionConocida(d.decision)) return null;
  return decisionVigente(fila) ? null : d;
}

/** Qué se movió desde que se decidió: la factura, el costo propio, o los dos. */
export function queCambioDesdeLaDecision(fila) {
  const d = decisionVencida(fila);
  if (!d) return null;
  const facturaCambio = !mismoPrecio(d.precioFacturado, fila?.costoFactura);
  const propioCambio = !mismoPrecio(d.precioPropio, fila?.costoCatalogo);
  if (facturaCambio && propioCambio) return "LOS_DOS";
  if (facturaCambio) return "FACTURA";
  if (propioCambio) return "PROPIO";
  // Los dos números de la fila son los mismos: lo que se movió es el catálogo,
  // o la decisión no guardó contra qué catálogo se tomó.
  return "CATALOGO";
}

/** Qué se decidió, en una línea y en criollo. */
export function textoDeDecision(decision) {
  if (decision === DECISION_DE_PRECIO.ACEPTA_FACTURA) return "Aceptás el precio de la factura";
  if (decision === DECISION_DE_PRECIO.DEJA_EL_MIO) return "Dejás tu precio";
  return "—";
}

/** Por qué se vuelve a preguntar, en una línea y en criollo. */
export function textoDeLoQueCambio(fila) {
  switch (queCambioDesdeLaDecision(fila)) {
    case "FACTURA":
      return "La factura trae otro precio, así que la pregunta es nueva.";
    case "PROPIO":
      return "Tu costo cambió desde entonces, así que la comparación es otra.";
    case "LOS_DOS":
      return "Cambiaron los dos precios, así que la comparación es otra.";
    case "CATALOGO":
      return "El costo del catálogo no es el que viste al decidir, así que hay que confirmarlo de nuevo.";
    default:
      return null;
  }
}
