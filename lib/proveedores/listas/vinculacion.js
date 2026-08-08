// lib/proveedores/listas/vinculacion.js
//
// VINCULAR A MANO una fila que no macheó.
//
// Puro: sin Prisma, sin fetch. Decide QUÉ se puede vincular y qué no, y arma la
// forma de los conflictos. Que sea puro permite probar las reglas de seguridad
// —que son la mitad de esta etapa— sin base de datos.
//
// ── LO QUE ESTÁ EN JUEGO ────────────────────────────────────────────────────
//
// Vincular no es marcar una casilla: crea una fila en ProductoCodigoProveedor
// que va a machear ese código en TODAS las listas futuras de ese proveedor. Un
// vínculo equivocado no se nota hoy —la fila queda linda— sino dentro de tres
// meses, cuando la lista de noviembre le cambie el costo al producto que no era.
// Por eso todo acá es explícito: nada se reasigna solo, nada se elige solo.

import { ESTADO_LINEA } from "./estados.js";
import { esImportacionAbierta } from "./persistencia.js";

/** De dónde salió la decisión de vincular. Se persiste con la fila. */
export const ORIGEN_VINCULO = {
  SUGERENCIA_CODIGO_BARRAS: "SUGERENCIA_CODIGO_BARRAS",
  BUSQUEDA_MANUAL: "BUSQUEDA_MANUAL",
};

export const MOTIVO_RECHAZO = {
  IMPORTACION_NO_CONCILIADA: "IMPORTACION_NO_CONCILIADA",
  FILA_YA_MACHEADA: "FILA_YA_MACHEADA",
  FILA_APLICADA: "FILA_APLICADA",
  FILA_NO_VINCULABLE: "FILA_NO_VINCULABLE",
  CODIGO_INVALIDO: "CODIGO_INVALIDO",
  PRODUCTO_FUERA_DE_ALCANCE: "PRODUCTO_FUERA_DE_ALCANCE",
  CODIGO_YA_VINCULADO: "CODIGO_YA_VINCULADO",
};

export const TEXTO_RECHAZO = {
  IMPORTACION_NO_CONCILIADA:
    "Solo se pueden vincular filas de una importación conciliada y sin aplicar.",
  FILA_YA_MACHEADA: "Esta fila ya tiene un producto vinculado.",
  FILA_APLICADA: "Esta fila ya se aplicó: no se puede cambiar su vínculo.",
  FILA_NO_VINCULABLE: "Solo se pueden vincular las filas sin vincular.",
  CODIGO_INVALIDO: "La fila no tiene un código de proveedor utilizable.",
  PRODUCTO_FUERA_DE_ALCANCE: "El producto no existe o no pertenece a tu alcance.",
  CODIGO_YA_VINCULADO:
    "Este código ya está vinculado a otro producto. Revisá el vínculo existente antes de cambiarlo.",
};

/**
 * ¿Esta fila se puede vincular?
 *
 * Solo NO_MACHEADO, con código utilizable, en una importación CONCILIADA y sin
 * aplicar. Una fila que ya tiene producto NO se re-vincula desde acá: cambiar un
 * vínculo existente es otra operación, con otras consecuencias, y hacerla pasar
 * por "vincular" la volvería silenciosa.
 */
export function filaVinculable(fila, importacion) {
  if (!importacion) {
    return { ok: false, motivo: MOTIVO_RECHAZO.IMPORTACION_NO_CONCILIADA };
  }
  // Sigue habilitado mientras la importación esté abierta. Una fila ya
  // aplicada se rechaza más abajo, una por una.
  if (!esImportacionAbierta(importacion.estado)) {
    return { ok: false, motivo: MOTIVO_RECHAZO.IMPORTACION_NO_CONCILIADA };
  }
  if (!fila) return { ok: false, motivo: MOTIVO_RECHAZO.FILA_NO_VINCULABLE };
  if (fila.aplicada === true) return { ok: false, motivo: MOTIVO_RECHAZO.FILA_APLICADA };
  // Una fila POR REVISAR ya tiene producto, y aun así se puede reasignar: el
  // motor la dejó dudosa justamente porque no está seguro, y la alternativa a
  // confirmar el producto propuesto es elegir otro. Las que machearon limpio no
  // se tocan: para eso están los estados.
  const porRevisar = fila.estado === ESTADO_LINEA.FACTOR_DUDOSO;
  if (fila.productoBaseId != null && !porRevisar) {
    return { ok: false, motivo: MOTIVO_RECHAZO.FILA_YA_MACHEADA };
  }
  if (fila.estado !== ESTADO_LINEA.NO_MACHEADO && !porRevisar) {
    return { ok: false, motivo: MOTIVO_RECHAZO.FILA_NO_VINCULABLE };
  }
  const codigo = String(fila.codigoNormalizado ?? "").trim();
  if (!codigo) return { ok: false, motivo: MOTIVO_RECHAZO.CODIGO_INVALIDO };

  return { ok: true, motivo: null, codigoNormalizado: codigo };
}

/**
 * Qué hacer con un vínculo que ya existe para este código.
 *
 * Tres casos y tres respuestas distintas:
 *   · no existe            → CREAR
 *   · existe INACTIVO      → REACTIVAR, apuntándolo al producto elegido
 *   · existe ACTIVO
 *       · al mismo producto → YA_VINCULADO (nada que hacer, no es error)
 *       · a otro producto   → CONFLICTO. No se reasigna solo: el usuario tiene
 *                             que ver a qué producto apunta hoy y decidir.
 */
export function decidirVinculo(existente, productoBaseId) {
  const destino = Number(productoBaseId);
  if (!existente) return { accion: "CREAR" };
  if (existente.activo === false) return { accion: "REACTIVAR", vinculoId: existente.id };
  if (Number(existente.productoBaseId) === destino) {
    return { accion: "YA_VINCULADO", vinculoId: existente.id };
  }
  return {
    accion: "CONFLICTO",
    vinculoId: existente.id,
    productoBaseIdActual: Number(existente.productoBaseId),
    motivo: MOTIVO_RECHAZO.CODIGO_YA_VINCULADO,
  };
}

/** ¿El origen declarado es uno de los dos que admitimos? */
export function origenValido(origen) {
  return Object.prototype.hasOwnProperty.call(ORIGEN_VINCULO, origen);
}

/**
 * El origen a persistir.
 *
 * Si el cliente dice "vine de la sugerencia" pero la fila no tiene ninguna, se
 * guarda BUSQUEDA_MANUAL: el origen es un dato de auditoría y no puede depender
 * de lo que afirme el navegador.
 */
export function resolverOrigen(origenPedido, fila, productoBaseId) {
  const dice = origenValido(origenPedido) ? origenPedido : ORIGEN_VINCULO.BUSQUEDA_MANUAL;
  if (dice !== ORIGEN_VINCULO.SUGERENCIA_CODIGO_BARRAS) return ORIGEN_VINCULO.BUSQUEDA_MANUAL;
  const coincide =
    fila?.sugerenciaProductoBaseId != null &&
    Number(fila.sugerenciaProductoBaseId) === Number(productoBaseId);
  return coincide ? ORIGEN_VINCULO.SUGERENCIA_CODIGO_BARRAS : ORIGEN_VINCULO.BUSQUEDA_MANUAL;
}

// ── Búsqueda de productos ───────────────────────────────────────────────────

/** Mínimo de caracteres para buscar. Con menos, media base entra en el resultado. */
export const MIN_BUSQUEDA = 2;
/** Techo de resultados. Una lista de mil candidatos no ayuda a elegir. */
export const MAX_RESULTADOS = 25;

export function consultaValida(q) {
  return String(q ?? "").trim().length >= MIN_BUSQUEDA;
}

/**
 * Ordena los candidatos: primero lo exacto, después lo que empieza igual, y al
 * final lo que solo contiene el término. Dentro de cada grupo, alfabético.
 *
 * Ordenar en memoria y no en SQL es a propósito: son como mucho 25 filas ya
 * traídas, y expresar "exacto primero" en Prisma obligaría a varias consultas.
 */
export function ordenarCandidatos(items, q) {
  const t = String(q ?? "").trim().toUpperCase();
  const rango = (p) => {
    const campos = [p.codigoBarra, p.codigoBarraSecundario, ...(p.codigosPropios ?? []), ...(p.codigosProveedor ?? [])]
      .filter(Boolean)
      .map((x) => String(x).toUpperCase());
    if (campos.includes(t)) return 0; // código exacto
    const nombre = String(p.nombre ?? "").toUpperCase();
    if (nombre === t) return 1;
    if (campos.some((c) => c.startsWith(t))) return 2;
    if (nombre.startsWith(t)) return 3;
    return 4;
  };
  return [...items].sort((a, b) => {
    const ra = rango(a);
    const rb = rango(b);
    if (ra !== rb) return ra - rb;
    return String(a.nombre ?? "").localeCompare(String(b.nombre ?? ""), "es");
  });
}

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
  const costoCrudo = p.costoActual ?? p.precio_costo ?? null;
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
