// lib/transferencias/presentacionEnvio.js
//
// CÓMO SALIÓ LA MERCADERÍA DEL ORIGEN, Y CÓMO SE LEE ESO DESPUÉS.
//
// ── DOS FUENTES, Y NO SE MEZCLAN ──────────────────────────────────────────
//
// Una línea de transferencia puede contestar la pregunta de dos maneras:
//
//   · REGISTRADA — la línea trae su snapshot. Se despachó después de que el
//     sistema aprendiera a guardarlo, así que dice la verdad de aquel día
//     aunque el catálogo haya cambiado diez veces desde entonces.
//
//   · RECONSTRUIDA — la línea es anterior y no tiene snapshot. Se deduce del
//     catálogo de HOY, que es lo único que hay.
//
// La diferencia se expone en `registrado` y NO es cosmética: una reconstruida
// puede cambiar mañana si alguien edita el producto, y eso hay que poder saberlo
// antes de usarla para explicarle una diferencia a alguien.
//
// **Lo que no se hace es rellenar el hueco.** Dividir 48 unidades por el factor
// actual da "6 cajones" y suena bien, pero nadie registró eso: con 47 unidades
// la cuenta ni siquiera da entera, y el número saldría de un catálogo que pudo
// cambiar. Una fila sin snapshot dice "no se registró"; una rellenada diría "se
// registró así", que sería falso.
//
// ── POR QUÉ EL FACTOR TAMBIÉN SE CONGELA ─────────────────────────────────
//
// Porque de él sale la ARITMÉTICA, no solo el rótulo. La recepción multiplica
// por el factor para llegar a unidades físicas y `confirmar-recepcion` convierte
// piezas a kilos con el peso de referencia. Leerlos vivos significa que editar el
// producto después de despachar cambia cuánto stock entra al destino de una
// transferencia que ya salió.

import { PRESENTACION, agrupa, presentacionDeProducto } from "@/lib/productos/presentacionDeProducto";

export { PRESENTACION, agrupa };

/**
 * EL DESCRIPTOR DE UNA LÍNEA: qué presentación, con qué números.
 *
 * @param {object} linea Una línea de `TransferenciaDetalle` o su DTO. Se leen:
 *   presentacionEnvio, cantidadPresentada, sueltasEnviadas, factorPresentacion,
 *   pesoPiezaKg  → el snapshot;
 *   unidadEnviada, cantidad / cantidadEnviada  → lo que siempre estuvo;
 *   producto de catálogo (unidadMedida, factorPack, modoVentaDeposito,
 *   pesoReferenciaKg) → solo para reconstruir cuando no hay snapshot.
 *
 * @returns {{
 *   presentacion: string, cantidad: number, sueltas: number,
 *   factor: number|null, pesoPiezaKg: number|null, registrado: boolean
 * }}
 */
export function descriptorDeEnvio(linea = {}) {
  const cantidadFisica = Number(linea.cantidadEnviada ?? linea.cantidad ?? 0) || 0;

  // ── CAMINO 1: LA LÍNEA LO TRAE REGISTRADO ───────────────────────────────
  if (linea.presentacionEnvio) {
    const factor = linea.factorPresentacion == null ? null : Number(linea.factorPresentacion);
    const peso = linea.pesoPiezaKg == null ? null : Number(linea.pesoPiezaKg);
    return {
      presentacion: String(linea.presentacionEnvio),
      // `cantidadPresentada` es el dato; la física es el respaldo por si una
      // fila quedara a medias, que hoy no puede pasar porque se escriben juntas.
      cantidad: Number(linea.cantidadPresentada ?? cantidadFisica) || 0,
      sueltas: Number(linea.sueltasEnviadas ?? 0) || 0,
      factor: Number.isFinite(factor) && factor > 1 ? factor : null,
      pesoPiezaKg: Number.isFinite(peso) && peso > 0 ? peso : null,
      registrado: true,
    };
  }

  // ── CAMINO 2: RECONSTRUCCIÓN, MARCADA COMO TAL ──────────────────────────
  //
  // Se conserva EXACTAMENTE el comportamiento que había: la cantidad que se
  // muestra es la física, y `unidadEnviada` decide si se contó en bultos. Lo
  // único que se agrega es distinguir cajón de pack y kg de unidad, que es
  // información del producto y no una reinterpretación de la cantidad.
  const { presentacion, factor, pesoPiezaKg } = presentacionDeProducto({
    unidadMedida: linea.unidadMedida,
    factorPack: linea.factorPack,
    modoVentaDeposito: linea.modoVentaDeposito,
    pesoReferenciaKg: linea.pesoReferenciaKg,
    contadoEn: linea.unidadEnviada || null,
  });

  return {
    presentacion,
    cantidad: cantidadFisica,
    sueltas: 0,
    factor,
    pesoPiezaKg,
    registrado: false,
  };
}

/**
 * Cuántas unidades físicas representa un descriptor.
 *
 * Es la misma cuenta que hace el stock —multiplicar UNA vez y sumar las
 * sueltas—, escrita acá una sola vez para que la pantalla y el servidor no
 * puedan discrepar. Para KG y PIEZA no hay conversión: la cantidad ES la escala.
 */
export function unidadesFisicasDelDescriptor(d = {}) {
  if (!agrupa(d.presentacion)) return Number(d.cantidad) || 0;
  const f = Number(d.factor);
  if (!Number.isFinite(f) || f <= 1) return Number(d.cantidad) || 0;
  return (Number(d.cantidad) || 0) * f + (Number(d.sueltas) || 0);
}

/** El número, con coma decimal y sin ceros de relleno. */
function fmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

/**
 * EL RÓTULO QUE VE EL OPERADOR: "6 CAJÓN x8", "3,250 KG", "2 PIEZA".
 *
 * La presentación registrada es la PRINCIPAL. Las unidades físicas son
 * secundarias y se piden aparte —`rotuloFisicoDeEnvio`— porque para KG y PIEZA
 * decir "unidades" sería falso.
 */
export function rotuloDeEnvio(d = {}) {
  const cant = fmt(d.cantidad);
  switch (d.presentacion) {
    case PRESENTACION.PACK:
      return d.factor ? `${cant} PACK x${d.factor}` : `${cant} PACK`;
    case PRESENTACION.CAJON:
      return d.factor ? `${cant} CAJÓN x${d.factor}` : `${cant} CAJÓN`;
    case PRESENTACION.KG:
      return `${cant} KG`;
    case PRESENTACION.PIEZA:
      return `${cant} PIEZA`;
    default:
      return `${cant} UNIDAD`;
  }
}

/** Solo el nombre de la presentación, sin cantidad: "CAJÓN x8", "KG". */
export function nombreDePresentacion(d = {}) {
  switch (d.presentacion) {
    case PRESENTACION.PACK:
      return d.factor ? `PACK x${d.factor}` : "PACK";
    case PRESENTACION.CAJON:
      return d.factor ? `CAJÓN x${d.factor}` : "CAJÓN";
    case PRESENTACION.KG:
      return "KG";
    case PRESENTACION.PIEZA:
      return "PIEZA";
    default:
      return "UNIDAD";
  }
}

/**
 * La línea secundaria: "48 unidades físicas".
 *
 * Devuelve `null` cuando no aporta nada o cuando sería MENTIRA: en KG y en
 * PIEZA la cantidad ya está en la escala del dominio y llamarla "unidades" es el
 * defecto que esta tanda vino a sacar.
 */
export function rotuloFisicoDeEnvio(d = {}) {
  if (!agrupa(d.presentacion)) return null;
  if (!d.factor) return null;
  const total = unidadesFisicasDelDescriptor(d);
  return `${fmt(total)} ${total === 1 ? "unidad física" : "unidades físicas"}`;
}

/**
 * Cómo se nombra una DIFERENCIA en esta presentación.
 *
 * En KG se expresa en kilos —"0,150 KG"— y en PIEZA en piezas. En los agrupados
 * la diferencia vive en unidades físicas, que es donde el pack incompleto tiene
 * sentido: faltar "medio cajón" no significa nada, faltar 1 unidad sí.
 */
export function unidadDeDiferencia(d = {}) {
  switch (d.presentacion) {
    case PRESENTACION.KG:
      return "KG";
    case PRESENTACION.PIEZA:
      return "PIEZA";
    default:
      return "unidades";
  }
}
