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
// ── LA PREGUNTA AL SUBIR SE BORRÓ, Y ESTE HUECO EXPLICA POR QUÉ ──────────
//
// Acá vivía `debePreguntarPorAgrupar`, que decidía cuándo mostrar el modal
// «¿es una factura nueva o una hoja de la anterior?». Ya no se pregunta: lo
// contesta el papel. Una foto con total impreso cierra su factura y una sin
// total es una hoja intermedia — la regla entera está en `agruparHojas.js`,
// con sus candados.
//
// Se borró en vez de dejarse sin usar. Una función que nadie llama se lee como
// cubierta y no cubre nada, y sus cinco candados habrían quedado en verde
// afirmando el comportamiento de un modal que ya no se dibuja.

export function comprobantesQuePuedenRecibirHojas(comprobantes, proveedorId) {
  return (Array.isArray(comprobantes) ? comprobantes : []).filter(
    (c) =>
      c &&
      Number(c.proveedorId) === Number(proveedorId) &&
      // SIN_TOTAL también recibe hojas, y es de los que más lo necesitan: la
      // primera planilla real llegó recortada —se veía el borde de otra sección
      // cortado— y el total podía estar justamente en la parte que faltaba.
      ["PENDIENTE_LECTURA", "MAL_LEIDO", "SIN_TOTAL", "DIFIERE", "FUERA_DE_RECETA"].includes(
        c.estado
      )
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
    // ⚠️ HOY NADIE ESCRIBE ESTE ESTADO, Y NO ES UN OLVIDO.
    //
    // Verificado el 2026-08-11: ningún código pone DIFIERE, CIERRA ni
    // FUERA_DE_RECETA en un comprobante. Es la misma situación que
    // ESTADO_LINEA.EXCLUIDO, que estaba en el enum y nada lo escribía.
    //
    // El motivo es de fondo: CON LECTURA AUTOMÁTICA NO SE PUEDEN DISTINGUIR
    // "el papel no suma" de "el modelo leyó mal". Las dos se ven igual —la
    // cuenta no cierra— y atribuirle una al proveedor sería inventar una
    // explicación. Por eso todo lo que no cierra cae en MAL_LEIDO, que es la
    // afirmación honesta: no se puede confiar en estos números.
    //
    // DIFIERE empieza a tener sentido CUANDO EXISTA LA CARGA A MANO. Ahí sí se
    // distingue: si una persona transcribió los números y la cuenta no cierra,
    // el que no cierra es el papel, porque la lectura no está en duda.
    //
    // NO LLENARLO ANTES POR VERLO VACÍO. Escribirlo desde la lectura automática
    // haría que un invento del modelo se leyera como un dato del proveedor, que
    // es exactamente lo que todo este módulo existe para impedir.
    //
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
  SIN_TOTAL: {
    // Habla del PAPEL, y no acusa a nadie. Es el tercer caso: no falló la
    // lectura ni falló el proveedor — el papel es de otra clase.
    //
    // Emanuel recibe remitos y planillas de pedido además de facturas, así que
    // esto va a aparecer seguido. El tono es de aviso y no de peligro: no hay
    // nada roto que arreglar.
    titulo: "No trae total",
    // ── UNA LÍNEA, NO UN PÁRRAFO ────────────────────────────────────────
    //
    // Decía cuatro renglones y se dibujaba DOS VECES —una en la tarjeta del
    // comprobante y otra en el encabezado de la conciliación—, palabra por
    // palabra. Lo que hay que saber antes de empezar a controlar es una sola
    // cosa: que no hubo total contra el cual verificar, así que el control del
    // conjunto lo hace la persona, renglón por renglón.
    detalle: "No se pudo verificar contra un total: controlá el papel renglón por renglón.",
    tono: "aviso",
    // ── Y SÍ PROPONE COSTOS, QUE ES UN CAMBIO DE CRITERIO ────────────────
    //
    // Estaba en `false`: sin total impreso no se proponía ningún costo. Eso
    // dejaba inutilizable un papel entero por lo que le falta al PIE, no a los
    // renglones — y con un proveedor cuya planilla nunca trae total, significaba
    // no poder recibir por esta vía nunca.
    //
    // Lo que se perdió al no haber total es el control del CONJUNTO: que la
    // suma de las líneas dé lo que el papel dice que da. Lo que NO se perdió es
    // el control de cada renglón: si una línea trae cantidad y precio unitario
    // y su propia cuenta cierra, ese costo está tan verificado como el de un
    // comprobante que cerró.
    //
    // Medido sobre el papel real que lo destapó —el comprobante 5, la planilla
    // de Mauro sobre el pedido 232—: 15 de 15 líneas tienen subtotal impreso y
    // en las 15 `cantidad × netoUnitario` coincide con ese subtotal dentro del
    // centavo. O sea que la aritmética de renglón cierra en todas.
    //
    // La verificación contra el pie NO se toca y no se inventa un total sumando
    // las líneas: ese candado existe porque un total derivado de las líneas se
    // compara contra sí mismo y cierra siempre. Lo que cambia es qué se puede
    // hacer sin él, no cómo se calcula.
    proponeCostos: true,
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

/**
 * LO MISMO, EN DOS PALABRAS, PARA LA FILA DE UNA FACTURA.
 *
 * ── POR QUÉ HACE FALTA UNA VERSIÓN CORTA Y NO ES UNA SEGUNDA TABLA ────────
 *
 * En la lista de facturas de un pedido hay cuatro o cinco filas, cada una con
 * su estado a la derecha. «No se pudo leer bien» ocupa la fila entera y empuja
 * los productos a otro renglón; con cinco facturas la tarjeta pasa a ser una
 * pantalla.
 *
 * El TONO sale de `VOCABULARIO`, no de una tabla nueva: si mañana alguien
 * cambia ahí de qué color es un estado, esto lo sigue. Lo único propio es el
 * texto corto, y cada uno apunta al largo, que se lee al abrir la factura.
 */
export const CHIP = Object.freeze({
  CIERRA: "✓ cierra",
  CARGADO: "✓ cierra",
  DIFIERE: "no cierra",
  MAL_LEIDO: "no cierra",
  FUERA_DE_RECETA: "no cierra",
  // ── "SIN TOTAL" NO ES "NO CIERRA", Y ESO NO ES UN DETALLE ──────────────
  //
  // Un remito no trae total: no hay contra qué verificar, y decir que "no
  // cierra" afirmaría que la cuenta da mal cuando no hay cuenta que hacer. Son
  // 2 de los 5 comprobantes de producción, así que el caso es frecuente. El
  // estado ya se separó de MAL_LEIDO por esta misma razón; volver a juntarlos
  // en la pantalla sería deshacerlo donde se ve.
  SIN_TOTAL: "sin total",
  PENDIENTE_LECTURA: "sin leer",
  ANULADO: "anulado",
});

export function chipDeFactura(estado, { leyendo = false } = {}) {
  if (leyendo) return { texto: "Leyendo…", tono: "neutro" };
  return { texto: CHIP[estado] || "sin leer", tono: comoSeDice(estado).tono };
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
    // APARTE de los mal leídos, y no sumado a ellos: mezclarlos haría que el
    // número del acierto del lector cargara con papeles que se leyeron
    // perfectamente y que solo no traían total.
    sinTotal: porEstado.SIN_TOTAL || 0,
    // De los que se leyeron, cuántos cerraron a la PRIMERA. Es la medida del
    // acierto del lector, y sale sola de las facturas reales.
    leidos: leidos.length,
    cerraronALaPrimera: cerraron.filter((c) => c.cerroEnIntento === 1).length,
    conRespaldo: lista.filter((c) => c?.usoRespaldo).length,
  };
}
