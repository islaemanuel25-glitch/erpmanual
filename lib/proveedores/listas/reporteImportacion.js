// lib/proveedores/listas/reporteImportacion.js
//
// EL REPORTE DE UNA IMPORTACIÓN, como dato.
//
// ── QUÉ ES ──────────────────────────────────────────────────────────────────
//
// Una fotografía histórica: qué pasó con los productos del proveedor en ESTA
// importación. Sale de lo que quedó guardado —costos aplicados, filas, motivos—
// y no recalcula nada del producto vivo. Si mañana alguien cambia un costo a
// mano, este reporte tiene que seguir diciendo lo que decía.
//
// ── POR QUÉ ES UN MÓDULO APARTE DEL PDF ─────────────────────────────────────
//
// Porque lo difícil no es dibujar: es que los números cierren y que un producto
// tocado por dos filas aparezca una sola vez. Eso se prueba sin abrir un PDF.
// El generador solo pinta lo que este módulo ya dejó resuelto.
//
// Módulo puro: sin BD, sin Next, sin jsPDF.

import { resumenDeActualizado, motivoDePendiente, TEXTO_MOTIVO_PENDIENTE } from "./detalleSistema.js";

export const TIPO_REPORTE = {
  COMPLETO: "COMPLETO",
  ACTUALIZADOS: "ACTUALIZADOS",
  NO_ACTUALIZADOS: "NO_ACTUALIZADOS",
};

export const TITULO_REPORTE = {
  COMPLETO: "Reporte completo",
  ACTUALIZADOS: "Productos actualizados",
  NO_ACTUALIZADOS: "Productos no actualizados",
};

export const NOMBRE_ARCHIVO = {
  COMPLETO: "reporte-completo",
  ACTUALIZADOS: "productos-actualizados",
  NO_ACTUALIZADOS: "productos-no-actualizados",
};

const n = (x) => (x === null || x === undefined || Number.isNaN(Number(x)) ? null : Number(x));

/**
 * El encabezado del reporte: de qué importación estamos hablando.
 *
 * `generadoEn` entra por parámetro y no se toma del reloj acá adentro para que
 * el módulo siga siendo puro y la prueba pueda fijar la fecha.
 */
export function encabezadoDeReporte({ cabecera, proveedor, usuario, generadoEn } = {}) {
  return [
    { etiqueta: "Sistema", valor: "ERP Azul" },
    { etiqueta: "Proveedor", valor: proveedor?.nombre ?? "—" },
    { etiqueta: "Archivo", valor: cabecera?.archivoNombre ?? "—" },
    { etiqueta: "Importación", valor: `#${cabecera?.id ?? "—"}` },
    { etiqueta: "Fecha de carga", valor: cabecera?.createdAt ?? null, tipo: "fecha" },
    { etiqueta: "Generado", valor: generadoEn ?? null, tipo: "fecha" },
    { etiqueta: "Usuario", valor: usuario ?? cabecera?.usuario?.nombre ?? "—" },
    { etiqueta: "Estado", valor: cabecera?.estado ?? "—" },
    { etiqueta: "Recargo aplicado", valor: `${n(cabecera?.recargoPct) ?? 0} %` },
    {
      etiqueta: "Rango esperado",
      valor:
        cabecera?.aumentoEsperadoMinPct === null || cabecera?.aumentoEsperadoMinPct === undefined
          ? "—"
          : `${n(cabecera.aumentoEsperadoMinPct)} % a ${n(cabecera.aumentoEsperadoMaxPct)} %`,
    },
  ];
}

/** Las cuatro cifras del resumen, con su verificación. */
export function totalesDeReporte(sistema = {}) {
  const universo = n(sistema.universo) ?? 0;
  const [act, pen, aus] = (sistema.metricas ?? []).map((m) => n(m.valor) ?? 0);
  const suma = (act ?? 0) + (pen ?? 0) + (aus ?? 0);
  return {
    universo,
    actualizados: act ?? 0,
    pendientes: pen ?? 0,
    ausentes: aus ?? 0,
    filasAplicadas: n(sistema.filasAplicadas),
    suma,
    cierra: universo > 0 && suma === universo,
  };
}

/**
 * Una línea del reporte de actualizados: un PRODUCTO, con sus filas.
 *
 * El costo anterior es el de la primera aplicación y el aplicado el de la
 * última: es el recorrido real cuando dos filas tocaron el mismo producto.
 */
export function lineasDeActualizados(items = []) {
  return items.map((item) => {
    const r = resumenDeActualizado(item.filas ?? []);
    return {
      productoId: item.id,
      nombre: item.nombre,
      codigoArcor: item.codigosArcor?.length ? item.codigosArcor.join(" / ") : null,
      costoAnterior: r?.costoAnterior ?? null,
      costoAplicado: r?.costoAplicado ?? null,
      variacionPct: r?.variacionPct ?? null,
      aplicadaEn: r?.aplicadaEn ?? null,
      filas: (item.filas ?? []).filter((f) => f.aplicada).map((f) => f.filaExcel),
      variasFilas: r?.variasFilas === true,
    };
  });
}

/**
 * Una línea del reporte de pendientes.
 *
 * El motivo se calcula con el mismo módulo que usa la pantalla, así el papel y
 * el monitor dicen lo mismo. `analizarPara` la inyecta quien llama: el módulo no
 * conoce la configuración del proveedor.
 */
export function lineasDePendientes(items = [], analizarPara) {
  return items.map((item) => {
    const principal = (item.filas ?? []).find((f) => !f.aplicada) ?? item.filas?.[0] ?? null;
    const analisis = analizarPara ? analizarPara(item, principal) : null;
    const { motivo } = motivoDePendiente({ fila: principal, analisis });
    const elegida = analisis?.evaluadas?.find((h) => h.clave === analisis.recomendada) ?? null;
    return {
      productoId: item.id,
      nombre: item.nombre,
      codigoArcor: item.codigosArcor?.length ? item.codigosArcor.join(" / ") : null,
      costoActual: n(item.costoActual),
      costoPropuesto: elegida ? n(elegida.costoNuevo) : null,
      variacionPct: elegida ? n(elegida.variacionPct) : null,
      motivo: TEXTO_MOTIVO_PENDIENTE[motivo] ?? motivo,
      filas: (item.filas ?? []).map((f) => f.filaExcel),
    };
  });
}

/** Una línea del reporte de no informados. */
export function lineasDeAusentes(items = []) {
  return items.map((item) => ({
    productoId: item.id,
    nombre: item.nombre,
    codigoArcor: item.codigosArcor?.length ? item.codigosArcor.join(" / ") : null,
    costoActual: n(item.costoActual),
    actualizadoEn: item.actualizadoEn ?? null,
    motivo: "Arcor no informó este producto en esta lista",
  }));
}

/**
 * Reparte las líneas en páginas.
 *
 * Cortar una fila al medio entre dos hojas hace ilegible un reporte que se
 * imprime, así que se reparte por líneas enteras. La primera página lleva menos
 * porque arriba va el encabezado y el resumen.
 */
export function paginar(lineas = [], { porPagina = 30, primeraPagina = null } = {}) {
  if (lineas.length === 0) return [];
  const primera = primeraPagina ?? porPagina;
  const paginas = [lineas.slice(0, primera)];
  for (let i = primera; i < lineas.length; i += porPagina) {
    paginas.push(lineas.slice(i, i + porPagina));
  }
  return paginas.filter((p) => p.length > 0);
}

/**
 * Qué secciones lleva cada tipo de reporte.
 *
 * El completo lleva todo; los otros dos, lo suyo. Que la decisión viva acá y no
 * en el generador es lo que permite probar que "no actualizados" trae pendientes
 * Y no informados, que es el punto de ese reporte.
 */
export function seccionesDeReporte(tipo) {
  if (tipo === TIPO_REPORTE.ACTUALIZADOS) return ["ACTUALIZADOS"];
  if (tipo === TIPO_REPORTE.NO_ACTUALIZADOS) return ["PENDIENTES", "AUSENTES"];
  return ["RESUMEN", "ACTUALIZADOS", "PENDIENTES", "AUSENTES"];
}

/** El nombre del archivo que se descarga o se comparte. */
export function nombreArchivo({ tipo, importacionId, generadoEn } = {}) {
  const d = generadoEn ? new Date(generadoEn) : null;
  const sello =
    d && !Number.isNaN(d.getTime())
      ? `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
      : "sin-fecha";
  return `${NOMBRE_ARCHIVO[tipo] ?? "reporte"}-importacion-${importacionId ?? "s-n"}-${sello}.pdf`;
}
