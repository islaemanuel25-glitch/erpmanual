// lib/compras-proveedor/comprobante/pantalla.js
//
// LAS DECISIONES DE LA PANTALLA, SEPARADAS DEL DIBUJO.
//
// Están acá y no en el componente para poder ejercerlas sin navegador: son las
// que deciden si se le pregunta algo a quien está recibiendo con el proveedor
// esperando, y con qué palabras se le dice que un número no es confiable.

// ── CUÁNDO SE PREGUNTA SI ES OTRA HOJA ─────────────────────────────────────

/**
 * ¿Hay que preguntar si estas fotos son un comprobante nuevo o más hojas?
 *
 * SE PREGUNTA AL SUBIR, no después. Quien sube tiene el papel en la mano en ese
 * momento y sabe la respuesta sin pensarla; media hora después, frente a dos
 * comprobantes que no cierran, ya no se acuerda.
 *
 * PERO NO SE PREGUNTA CUANDO NO HACE FALTA: una sola foto y ningún comprobante
 * abierto de ese proveedor no tiene ninguna ambigüedad, y preguntar ahí sería un
 * toque de más en cada recepción normal — que es la mayoría.
 *
 * @param {number} cantidadFotos           cuántas se están subiendo ahora
 * @param {Array}  comprobantesAbiertos    los de ESE proveedor que todavía
 *                                         podrían recibir hojas
 */
export function debePreguntarPorAgrupar({ cantidadFotos = 0, comprobantesAbiertos = [] } = {}) {
  const fotos = Number(cantidadFotos) || 0;
  const abiertos = Array.isArray(comprobantesAbiertos) ? comprobantesAbiertos : [];

  if (fotos <= 0) return { preguntar: false, porque: "No hay nada que subir." };

  if (fotos === 1 && abiertos.length === 0) {
    return { preguntar: false, porque: "Una sola foto y ningún comprobante abierto: no hay ambigüedad." };
  }

  if (fotos > 1 && abiertos.length === 0) {
    return {
      preguntar: true,
      porque: "Varias fotos a la vez: pueden ser varias facturas o una sola de varias hojas.",
      opciones: ["UNA_POR_FOTO", "TODAS_UNA_SOLA"],
    };
  }

  // Hay comprobantes abiertos de ese proveedor: la foto nueva podría ser la
  // continuación de cualquiera de ellos.
  return {
    preguntar: true,
    porque:
      abiertos.length === 1
        ? "Hay un comprobante de este proveedor sin cerrar: esta foto podría ser otra hoja."
        : `Hay ${abiertos.length} comprobantes de este proveedor sin cerrar: esta foto podría ser otra hoja.`,
    opciones: fotos > 1 ? ["UNA_POR_FOTO", "TODAS_UNA_SOLA", "SUMAR_A_EXISTENTE"] : ["NUEVO", "SUMAR_A_EXISTENTE"],
    candidatos: abiertos,
  };
}

/**
 * Cuáles pueden recibir hojas nuevas.
 *
 * Los de este proveedor que todavía no cerraron. Uno que YA cerró no recibe
 * hojas: agregarle una lo volvería a poner en duda sin motivo, y si de verdad
 * faltaba una hoja, lo que hay es un comprobante mal armado y no uno incompleto.
 */
export function comprobantesQuePuedenRecibirHojas(comprobantes, proveedorId) {
  return (Array.isArray(comprobantes) ? comprobantes : []).filter(
    (c) =>
      c &&
      Number(c.proveedorId) === Number(proveedorId) &&
      ["PENDIENTE_LECTURA", "MAL_LEIDO", "DIFIERE", "FUERA_DE_RECETA"].includes(c.estado)
  );
}

// ── CÓMO SE DICE CADA ESTADO ───────────────────────────────────────────────
//
// CON PALABRAS DISTINTAS, NO SOLO COLORES DISTINTOS. Dos avisos del mismo color
// se distinguen; dos avisos que dicen lo mismo, no — y quien mira una pantalla
// apurado lee la palabra, no el tono.
//
// La distinción que sostiene todo el módulo es MAL_LEIDO contra DIFIERE:
//
//   · DIFIERE — el PAPEL no cierra. Es información REAL del proveedor: se
//     muestra con la diferencia a la vista y se puede seguir trabajando.
//   · MAL_LEIDO — la LECTURA no cierra. El número puede ser un invento del
//     modelo, y de acá no sale ninguna propuesta de costo.
//
// Si las dos dijeran "no cierra", un invento se leería como un dato del
// proveedor. Por eso una habla del PAPEL y la otra habla de la LECTURA, y
// ninguna de las dos usa la palabra de la otra.

export const VOCABULARIO = Object.freeze({
  PENDIENTE_LECTURA: {
    titulo: "Sin leer",
    detalle: "Todavía no se leyó. Tocá «Leer» cuando esté completo.",
    tono: "neutro",
    proponeCostos: false,
  },
  CARGADO: {
    titulo: "Leído",
    detalle: "Se leyó y la cuenta cierra. Falta conciliarlo contra el pedido.",
    tono: "info",
    proponeCostos: true,
  },
  CIERRA: {
    titulo: "Verificado",
    detalle: "La suma de las líneas da el total impreso.",
    tono: "ok",
    proponeCostos: true,
  },
  DIFIERE: {
    // Habla del PAPEL. Nunca de la lectura.
    titulo: "El papel no cierra",
    detalle:
      "Los números están bien leídos, pero la factura no suma. Es una diferencia del " +
      "proveedor: revisala con la diferencia a la vista.",
    tono: "aviso",
    proponeCostos: true,
  },
  MAL_LEIDO: {
    // Habla de la LECTURA. Nunca del papel.
    titulo: "No se pudo leer bien",
    detalle:
      "La lectura no es confiable: algún número puede estar mal interpretado. NO se " +
      "propone ningún costo desde acá. Probá leerlo de nuevo, sacá otra foto más nítida, " +
      "o cargalo a mano.",
    tono: "peligro",
    proponeCostos: false,
  },
  FUERA_DE_RECETA: {
    titulo: "No vino como los de este proveedor",
    detalle:
      "Los impuestos no coinciden con la receta cargada para este proveedor. Puede ser " +
      "un comprobante distinto, o que haya que revisar la receta.",
    tono: "aviso",
    proponeCostos: false,
  },
  ANULADO: {
    titulo: "Anulado",
    detalle: "Se anuló a mano. Su número quedó libre para volver a subirlo.",
    tono: "neutro",
    proponeCostos: false,
  },
});

const SIN_VOCABULARIO = Object.freeze({
  titulo: "Estado desconocido",
  detalle: "Este comprobante quedó en un estado que la pantalla no sabe explicar. Avisá.",
  tono: "neutro",
  proponeCostos: false,
});

/** Cómo se dice un estado. Nunca devuelve el código crudo en pantalla. */
export function comoSeDice(estado) {
  return VOCABULARIO[estado] || SIN_VOCABULARIO;
}

// ── UNIR DOS COMPROBANTES, QUE ES LA SALIDA DE EMERGENCIA ──────────────────

export const MOTIVO_NO_UNIR = Object.freeze({
  MENOS_DE_DOS: "Hay que elegir al menos dos comprobantes para unir.",
  DISTINTO_PROVEEDOR: "Son de proveedores distintos: unirlos mezclaría dos facturas de verdad.",
  ALGUNO_ANULADO: "Alguno está anulado. Desanulalo primero, o subí las fotos de nuevo.",
  ALGUNO_YA_CONFIRMADO:
    "Alguno ya fue confirmado en una recepción. Unirlo cambiaría un comprobante que " +
    "alguien ya dio por bueno.",
  SIN_FOTOS: "Alguno ya no tiene fotos: la ventana de siete días venció y no hay qué unir.",
});

/**
 * ¿Se pueden unir estos comprobantes en uno solo?
 *
 * Existe porque ALGUIEN SE VA A EQUIVOCAR IGUAL al subir, y sin esto la única
 * salida sería borrar y volver a fotografiar el papel — que a veces ya no está.
 *
 * Es una salida de emergencia, no el camino normal: el camino normal es
 * contestar la pregunta al subir, cuando quien la contesta tiene el papel en la
 * mano.
 */
export function puedenUnirse(comprobantes) {
  const lista = (Array.isArray(comprobantes) ? comprobantes : []).filter(Boolean);
  if (lista.length < 2) return { ok: false, motivo: MOTIVO_NO_UNIR.MENOS_DE_DOS };

  const proveedores = new Set(lista.map((c) => Number(c.proveedorId)));
  if (proveedores.size > 1) return { ok: false, motivo: MOTIVO_NO_UNIR.DISTINTO_PROVEEDOR };

  if (lista.some((c) => c.estado === "ANULADO")) {
    return { ok: false, motivo: MOTIVO_NO_UNIR.ALGUNO_ANULADO };
  }
  if (lista.some((c) => c.confirmadoEn)) {
    return { ok: false, motivo: MOTIVO_NO_UNIR.ALGUNO_YA_CONFIRMADO };
  }
  if (lista.some((c) => !contarFotos(c))) {
    return { ok: false, motivo: MOTIVO_NO_UNIR.SIN_FOTOS };
  }

  // El que se queda es el MÁS VIEJO: es el que probablemente tenga el
  // encabezado, y el orden de las páginas importa para leerlas.
  const ordenados = [...lista].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return {
    ok: true,
    destino: ordenados[0],
    absorbidos: ordenados.slice(1),
    fotosResultantes: ordenados.reduce((n, c) => n + contarFotos(c), 0),
  };
}

export function contarFotos(comprobante) {
  const a = comprobante?.archivos;
  return Array.isArray(a) ? a.filter((x) => x && x.ubicacion).length : 0;
}

/**
 * El resumen que se muestra arriba de la lista.
 *
 * Incluye cuántos quedaron mal leídos, que es el número que Emanuel quiere ver
 * acumularse con facturas reales. Que esté a la vista desde el primer día es lo
 * que hace que después de veinte no haya que preparar nada.
 */
export function resumenDeLista(comprobantes) {
  const lista = Array.isArray(comprobantes) ? comprobantes : [];
  const porEstado = {};
  for (const c of lista) porEstado[c?.estado] = (porEstado[c?.estado] || 0) + 1;

  const leidos = lista.filter((c) => c?.leidoEn);
  const cerraron = lista.filter((c) => c?.cerroEnIntento != null);
  return {
    total: lista.length,
    porEstado,
    sinLeer: porEstado.PENDIENTE_LECTURA || 0,
    malLeidos: porEstado.MAL_LEIDO || 0,
    // De los que se leyeron, cuántos cerraron a la PRIMERA. Es la medida del
    // acierto del lector, y sale sola de las facturas reales.
    leidos: leidos.length,
    cerraronALaPrimera: cerraron.filter((c) => c.cerroEnIntento === 1).length,
    conRespaldo: lista.filter((c) => c?.usoRespaldo).length,
  };
}
