// lib/proveedores/listas/presentacion.js
//
// Cómo se MUESTRA una conciliación. Puro: sin React, sin fetch, sin Prisma.
//
// Vive separado de las pantallas para poder probar lo que de verdad se rompe —el
// texto de un estado, el motivo que se pierde, un importe mal formateado— sin
// montar un navegador. Las pantallas quedan con el armado visual y nada más.
//
// ── EL COLOR NO ALCANZA ─────────────────────────────────────────────────────
//
// Cada estado lleva etiqueta, tono semántico Y un símbolo. Ocho estados
// distinguidos solo por color son ocho estados indistinguibles para quien no
// distingue colores, y encima el ERP tiene ocho temas: un rojo que se lee en uno
// puede ser ilegible en otro. El texto es lo que siempre se entiende.

import { ESTADO_LINEA, PRIORIDAD_ESTADO } from "./estados.js";
import { TEXTO_BLOQUEO, MOTIVO_BLOQUEO } from "./calculoCosto.js";
import { TEXTO_MOTIVO_UNIDAD } from "./configuraciones/arcor.js";
import { TEXTO_MOTIVO } from "./conciliarLista.js";

/**
 * Cómo se presenta cada estado.
 *
 * `tono` es un token semántico del sistema de temas, nunca un color literal.
 * `simbolo` es lo que hace que el estado se entienda en blanco y negro.
 */
export const PRESENTACION_ESTADO = {
  LISTO_PARA_ACTUALIZAR: {
    etiqueta: "Listo",
    detalle: "Se puede actualizar el costo",
    tono: "sunmi-badge-success",
    texto: "sunmi-text-success",
    simbolo: "✓",
  },
  SIN_CAMBIOS: {
    etiqueta: "Sin cambios",
    detalle: "El costo propuesto es el que ya tiene",
    tono: "sunmi-badge-muted",
    texto: "sunmi-text-muted",
    simbolo: "=",
  },
  NO_MACHEADO: {
    etiqueta: "Sin vincular",
    detalle: "El código no está vinculado a ningún producto",
    tono: "sunmi-badge-muted",
    texto: "sunmi-text-muted",
    simbolo: "?",
  },
  CODIGO_DUPLICADO: {
    etiqueta: "Código duplicado",
    detalle: "El código apunta a más de un producto",
    tono: "sunmi-badge-danger",
    texto: "sunmi-text-danger",
    simbolo: "!!",
  },
  FACTOR_DUDOSO: {
    etiqueta: "Revisar armado",
    detalle: "No se puede convertir el precio con los datos cargados",
    tono: "sunmi-badge-accent",
    texto: "sunmi-text-warning",
    simbolo: "△",
  },
  EXCLUIDO: {
    etiqueta: "Excluido",
    detalle: "Se dejó afuera a propósito",
    tono: "sunmi-badge-muted",
    texto: "sunmi-text-muted",
    simbolo: "–",
  },
  BLOQUEADO: {
    etiqueta: "Bloqueado",
    detalle: "No se puede aplicar",
    tono: "sunmi-badge-danger",
    texto: "sunmi-text-danger",
    simbolo: "✕",
  },
  ERROR: {
    etiqueta: "Error",
    detalle: "La fila no se pudo leer",
    tono: "sunmi-badge-danger",
    texto: "sunmi-text-danger",
    simbolo: "✕",
  },
};

/** La presentación de un estado. Uno desconocido no rompe la pantalla. */
/**
 * Estados de la CABECERA de una importación. Van aparte de los de fila: el mapa
 * de arriba tiene exactamente los ocho que produce el motor, y mezclar los dos
 * vocabularios haría que "todos los estados tienen presentación" deje de
 * significar algo.
 */
export const PRESENTACION_ESTADO_IMPORTACION = {
  CANCELADA: {
    etiqueta: "CANCELADA",
    detalle: "Se canceló a mano. Queda como historial y no se puede aplicar.",
    tono: "sunmi-badge-danger",
    texto: "sunmi-text-danger",
    simbolo: "✕",
  },
};

export function presentarEstado(estado) {
  return (
    PRESENTACION_ESTADO[estado] ??
    PRESENTACION_ESTADO_IMPORTACION[estado] ?? {
      etiqueta: String(estado ?? "—"),
      detalle: "",
      tono: "sunmi-badge-muted",
      texto: "sunmi-text-muted",
      simbolo: "·",
    }
  );
}

/** Los ocho estados en el orden del filtro: de más grave a más leve. */
export const ESTADOS_FILTRABLES = PRIORIDAD_ESTADO.map((e) => ({
  valor: e,
  etiqueta: presentarEstado(e).etiqueta,
}));

// ── Motivos ─────────────────────────────────────────────────────────────────

/**
 * El texto de un motivo, buscado en las tres fuentes que los producen: el motor,
 * la configuración del proveedor y la regla de unidad incompatible.
 *
 * NUNCA devuelve vacío cuando hay motivo: si no lo conoce, muestra el código
 * crudo. Esconder el motivo de una fila que no se aplicó deja al usuario sin
 * nada que corregir, que es lo único que puede hacer con esa fila.
 */
export function textoDeMotivo(motivo) {
  if (!motivo) return "";
  if (motivo === MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE) {
    return TEXTO_BLOQUEO[MOTIVO_BLOQUEO.UNIDAD_INCOMPATIBLE];
  }
  return TEXTO_MOTIVO_UNIDAD[motivo] ?? TEXTO_MOTIVO[motivo] ?? motivo;
}

/** Cómo se llama cada forma de coincidencia, en castellano. */
export const TEXTO_COINCIDENCIA = {
  CODIGO_INTERNO: "Código del proveedor",
  CODIGO_INTERNO_SIN_CEROS: "Código sin ceros",
  AMBIGUA: "Ambigua",
  NINGUNA: "Sin coincidencia",
};

export function textoDeCoincidencia(tipo) {
  return TEXTO_COINCIDENCIA[tipo] ?? "—";
}

// ── Formatos ────────────────────────────────────────────────────────────────

/** Importe en pesos, formato local. `null` se muestra como raya, no como $0. */
export function money(valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Importe con signo: una diferencia de +$50 no es lo mismo que una de −$50.
 *
 * El signo va ADELANTE del símbolo de moneda —"-$ 200,00" y no "$ -200,00"—
 * porque es lo primero que se busca al escanear una columna de diferencias.
 */
export function moneyConSigno(valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return money(0);
  const signo = n > 0 ? "+" : "-";
  return `${signo}${money(Math.abs(n))}`;
}

/** Porcentaje legible. Dos decimales alcanzan y evitan el 29.989999999 %. */
export function porcentaje(valor, { conSigno = false } = {}) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  const signo = conSigno && n > 0 ? "+" : "";
  return `${signo}${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

/** Tono de una diferencia: subir cuesta plata, bajar la ahorra. */
export function tonoDiferencia(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n === 0) return "sunmi-text-muted";
  return n > 0 ? "sunmi-text-warning" : "sunmi-text-success";
}

/** Fecha y hora en formato local, corto. */
export function fechaHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Tamaño de archivo legible. */
export function tamanoArchivo(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ── Resumen ─────────────────────────────────────────────────────────────────

/**
 * Las métricas de la cabecera, en el orden en que se muestran.
 *
 * Salen TODAS de los contadores del backend: no se recalcula ninguna en la
 * pantalla. Si la pantalla sumara por su cuenta y el backend cambiara, el
 * usuario vería dos verdades distintas.
 */
export function metricasDeImportacion(cab = {}) {
  return [
    { clave: "totalFilas", etiqueta: "Total", valor: cab.totalFilas ?? 0, tono: "sunmi-text-strong" },
    { clave: "listoParaActualizar", etiqueta: "Listos", valor: cab.listoParaActualizar ?? 0, tono: "sunmi-text-success" },
    { clave: "sinCambios", etiqueta: "Sin cambios", valor: cab.sinCambios ?? 0, tono: "sunmi-text-muted" },
    { clave: "noMacheadas", etiqueta: "Sin vincular", valor: cab.noMacheadas ?? 0, tono: "sunmi-text-muted" },
    { clave: "factorDudoso", etiqueta: "Revisar armado", valor: cab.factorDudoso ?? 0, tono: "sunmi-text-warning" },
    { clave: "bloqueadas", etiqueta: "Bloqueadas", valor: cab.bloqueadas ?? 0, tono: "sunmi-text-danger" },
    { clave: "errores", etiqueta: "Errores", valor: cab.errores ?? 0, tono: "sunmi-text-danger" },
    { clave: "variacionAlta", etiqueta: "Variación alta", valor: cab.variacionAlta ?? 0, tono: "sunmi-text-warning" },
  ];
}

/** ¿Los contadores de la cabecera cierran contra el total? */
export function resumenCoherente(cab = {}) {
  const suma =
    (cab.listoParaActualizar ?? 0) + (cab.sinCambios ?? 0) + (cab.noMacheadas ?? 0) +
    (cab.codigoDuplicado ?? 0) + (cab.factorDudoso ?? 0) + (cab.excluidas ?? 0) +
    (cab.bloqueadas ?? 0) + (cab.errores ?? 0);
  return suma === (cab.totalFilas ?? 0);
}

// ── Proveedores ─────────────────────────────────────────────────────────────

/**
 * ¿Este proveedor admite importar listas?
 *
 * Sin `parserListaId` no hay forma de saber qué formato manda, y adivinarlo por
 * el nombre es justo lo que el registro evita. Se informa con un motivo, no se
 * esconde el proveedor: el usuario tiene que poder ver que existe y por qué no
 * puede usarlo todavía.
 */
export function proveedorAdmiteImportacion(prov) {
  if (!prov) return { admite: false, motivo: "Seleccioná un proveedor." };
  if (!prov.parserListaId) {
    return {
      admite: false,
      motivo:
        "Este proveedor no tiene configurado el formato de su lista de precios. Cargalo antes de importar.",
    };
  }
  return { admite: true, motivo: null };
}

// ── Archivo ─────────────────────────────────────────────────────────────────

/**
 * Validación en el navegador, ANTES de subir.
 *
 * Es una cortesía, no una garantía: el servidor vuelve a validar todo. Sirve
 * para no hacerle esperar la subida de 10 MB a alguien que eligió un .pdf.
 */
export function validarArchivoEnCliente(file, { tamanoMaxBytes, extensiones } = {}) {
  if (!file) return { ok: false, error: "Elegí un archivo." };
  const nombre = String(file.name ?? "").toLowerCase();
  const exts = extensiones ?? [".xlsx"];
  if (!exts.some((e) => nombre.endsWith(e))) {
    return { ok: false, error: `Solo se aceptan archivos ${exts.join(", ")}.` };
  }
  if (!file.size) return { ok: false, error: "El archivo está vacío." };
  const max = Number(tamanoMaxBytes);
  if (Number.isFinite(max) && file.size > max) {
    return { ok: false, error: `El archivo supera el límite de ${Math.round(max / 1024 / 1024)} MB.` };
  }
  return { ok: true, error: null };
}

/**
 * El mensaje de un error del endpoint.
 *
 * El 409 de archivo repetido es el único que trae datos útiles además del texto:
 * el id y el estado de la importación anterior, para poder ofrecer abrirla.
 */
export function mensajeDeError(json, status) {
  const base = json?.error ?? "No se pudo importar el archivo.";
  if (status === 409 && json?.importacionExistente) {
    const { id, estado } = json.importacionExistente;
    return {
      mensaje: base,
      duplicada: true,
      importacionId: id ?? null,
      estadoExistente: estado ?? null,
      detalle: `Ya existe la importación #${id}${estado ? ` (${estado})` : ""}.`,
    };
  }
  return { mensaje: base, duplicada: false, importacionId: null, estadoExistente: null, detalle: null };
}

export { ESTADO_LINEA };
