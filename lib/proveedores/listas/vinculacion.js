// lib/proveedores/listas/vinculacion.js
//
// Lo que queda de la vinculación de una lista que no escribe: quién dio de alta
// un vínculo, cómo se presenta un candidato, y qué vínculo deja una fila al
// aplicarse. Puro: sin Prisma, sin fetch.
//
// La vinculación a mano vive en `vincularConUnaFila.js`. Las reglas de qué fila
// se podía vincular, la búsqueda del catálogo y el conflicto de códigos eran de
// las rutas `filas/[filaId]/vincular` y `productos`, que se borraron
// (2026-10-24) junto con la pantalla que las llamaba.
//
// ── LO QUE ESTÁ EN JUEGO ────────────────────────────────────────────────────
//
// Vincular no es marcar una casilla: crea una fila en ProductoCodigoProveedor
// que va a machear ese código en TODAS las listas futuras de ese proveedor. Un
// vínculo equivocado no se nota hoy —la fila queda linda— sino dentro de tres
// meses, cuando la lista de noviembre le cambie el costo al producto que no era.
// Por eso todo acá es explícito: nada se reasigna solo, nada se elige solo.

/**
 * QUIÉN dio de alta el vínculo. Se persiste con el VÍNCULO, no con la fila:
 * dice si hubo una persona.
 */
export const ORIGEN_ALTA_VINCULO = {
  VINCULACION_MANUAL: "VINCULACION_MANUAL",
  APLICACION_AUTOMATICA: "APLICACION_AUTOMATICA",
};

/**
 * Cómo se presenta un producto candidato.
 *
 * `puedeEditarCosto` viaja para poder advertir ANTES de vincular que este
 * contexto no va a poder aplicarle el costo. Vincular igual es legítimo —el
 * vínculo sirve para el futuro y para otras ubicaciones— pero el usuario tiene
 * que saber que esa fila va a quedar bloqueada.
 */
/**
 * Un producto candidato, listo para mostrar.
 *
 * ── EL COSTO VIAJA SOLO SI SE PUEDE VER ─────────────────────────────────────
 *
 * `costoActual` es lo que permite mostrar la variación de cada candidato, que es
 * la evidencia que delata cuál es el correcto: una caja que hoy vale $21.000 no
 * pasa a $1.050. Sin él la tarjeta muestra el costo resultante sin nada contra
 * qué compararlo.
 *
 * Va condicionado a `puedeVerCosto` y no suelto. Hoy el único endpoint que arma
 * candidatos exige administrador, así que en la práctica siempre se puede; pero
 * esa protección vive entera en la guarda de esa ruta, y el día que alguien la
 * afloje para que un encargado pueda vincular —un cambio razonable y previsible—
 * el costo viajaría de arriba sin que nadie lo decida. Además este módulo YA
 * razona sobre permisos de costo con `puedeEditarCosto`: colgarlo de la misma
 * lógica es seguir el patrón, no inventar uno.
 *
 * Cuando no se puede ver, viaja en `null` en vez de omitirse: así el consumidor
 * distingue "no tenés permiso" de "el producto no tiene costo cargado" mirando
 * `puedeVerCosto`, sin adivinar por la ausencia de la clave.
 */
export function presentarCandidato(p, { puedeEditarCosto = null, puedeVerCosto = false } = {}) {
  // Tres grafías porque el candidato llega de tres lados: `precioCostoActual` de
  // cargarDatosDeConciliacion, `precio_costo` del select crudo de Prisma, y
  // `costoActual` de quien ya lo mapeó. Sin las tres, el costo llega en null y la
  // tarjeta pierde la variación —que es la evidencia que delata cuál candidato
  // es el correcto— sin que nada falle a la vista.
  const costoCrudo = p.costoActual ?? p.precioCostoActual ?? p.precio_costo ?? null;
  return {
    productoBaseId: p.productoBaseId ?? p.id,
    nombre: p.nombre,
    puedeVerCosto: puedeVerCosto === true,
    costoActual:
      puedeVerCosto === true && costoCrudo !== null && costoCrudo !== undefined
        ? Number(costoCrudo)
        : null,
    presentacion: presentacionDe(p),
    factorPack: p.factorPack ?? p.factor_pack ?? null,
    unidadMedida: p.unidadMedida ?? p.unidad_medida ?? null,
    codigoBarra: p.codigoBarra ?? p.codigo_barra ?? null,
    codigoBarraSecundario: p.codigoBarraSecundario ?? p.codigo_barra_secundario ?? null,
    codigosPropios: p.codigosPropios ?? [],
    codigosProveedor: p.codigosProveedor ?? [],
    creadoEnLocalId: p.creadoEnLocalId ?? null,
    esCombo: p.esCombo === true || p.es_combo === true,
    puedeEditarCosto,
    advertencia:
      puedeEditarCosto === false
        ? "Desde esta ubicación no vas a poder aplicarle el costo: lo administra otra."
        : null,
  };
}

/** Texto corto de la presentación: "Pack x12", "Cajón x6", "Kg", "Unidad". */
export function presentacionDe(p) {
  const u = String(p.unidadMedida ?? p.unidad_medida ?? "").toLowerCase();
  const f = Number(p.factorPack ?? p.factor_pack ?? 0);
  if (u === "kg") return "Kg";
  if (u === "pack") return f > 1 ? `Pack x${f}` : "Pack";
  if (u === "cajon") return f > 1 ? `Cajón x${f}` : "Cajón";
  return f > 1 ? `Unidad (x${f})` : "Unidad";
}

// ── GUARDAR EL MACHEO AL APLICAR ────────────────────────────────────────────
//
// El macheo automático no persiste nada. En la importación #3 el motor vinculó
// 291 filas solo, y `ProductoCodigoProveedor` no ganó ni una: hoy ahí solo entra
// lo que alguien vinculó a mano. Resultado: la lista siguiente del mismo
// proveedor vuelve a adivinar por sufijo lo que ya se resolvió el mes pasado.
//
// ── POR QUÉ AL APLICAR Y NO AL MACHEAR ──────────────────────────────────────
//
// Porque aplicar es la única evidencia de que el vínculo sirvió para actuar: se
// escribió un costo en ESE producto desde ESA fila. Un macheo por sufijo de 4
// dígitos que nadie miró es una suposición, y guardarla haría que la próxima
// lista la dé por buena sin preguntar — convirtiendo una corazonada del motor en
// un hecho del catálogo, que es justo lo que la cascada evita al no machear por
// nombre.
//
// ── QUÉ SE GUARDA Y QUÉ NO ──────────────────────────────────────────────────
//
// Solo lo que la próxima lista tendría que volver a adivinar. Una fila que
// macheó POR CÓDIGO INTERNO ya vino de un vínculo guardado: no hay nada nuevo
// que aprender, y escribir otra fila con el literal del archivo dejaría dos
// vínculos activos para el mismo producto y un "faltante" permanente con el
// código viejo.
//
// Quedan entonces los caminos que el motor resolvió sin un vínculo previo: la
// escalera de sufijos y el código de barras.

/** Los tipos de coincidencia que YA vinieron de un vínculo guardado. */
const YA_VENIA_DE_UN_VINCULO = new Set(["CODIGO_INTERNO", "CODIGO_INTERNO_SIN_CEROS"]);

/**
 * ¿Esta fila APLICADA deja un vínculo que valga la pena guardar?
 *
 * Puro: decide, no escribe. El endpoint es el que inserta, y lo hace de forma
 * que nunca pise un vínculo existente — ver la nota en `aplicar/route.js`.
 *
 * @param fila fila persistida, ya aplicada
 * @returns {{ persistir: boolean, codigoInterno: string|null, motivo: string|null }}
 */
export function vinculoAPersistirAlAplicar(fila) {
  const no = (motivo) => ({ persistir: false, codigoInterno: null, motivo });

  const productoBaseId = Number(fila?.productoBaseId);
  if (!Number.isInteger(productoBaseId) || productoBaseId <= 0) return no("SIN_PRODUCTO");

  // El mismo literal que guarda la vinculación a mano. Tiene que ser el mismo:
  // el índice único es sobre el texto, así que dos formas distintas del mismo
  // código crearían dos vínculos que la próxima lista vería como uno solo
  // duplicado.
  const codigoInterno = String(fila?.codigoNormalizado ?? "").trim();
  if (!codigoInterno) return no("SIN_CODIGO");

  const tipo = String(fila?.tipoCoincidencia ?? "");
  if (YA_VENIA_DE_UN_VINCULO.has(tipo)) return no("YA_TENIA_VINCULO");
  if (!tipo || tipo === "NINGUNA" || tipo === "AMBIGUA") return no("SIN_COINCIDENCIA_UTIL");

  return { persistir: true, codigoInterno, motivo: null };
}
