// LA TABLA COMO ESTÁ EN EL PAPEL, ANTES DE INTERPRETARLA.
//
// ── POR QUÉ HIZO FALTA, Y ES UN DEFECTO DE ARQUITECTURA QUE SE ARREGLA ────
//
// Hasta acá el importador guardaba solo LÍNEAS YA NORMALIZADAS: código,
// descripción, cantidad, unidad, precio, bonificación, subtotal. La lectura
// decidía qué columna era cuál y ahí se terminaba la discusión.
//
// Con eso, "reanalizar con otra receta" era mentira. Una receta puede decir que
// la primera columna es la cantidad, pero si la lectura inicial la tomó por
// otra cosa, esa información YA SE PERDIÓ: no hay de dónde sacarla. Peor todavía
// —y es el caso del ejemplo que motivó la receta—: `extraerFilasExcel` DESCARTA
// los renglones sin cantidad. Un papel donde la columna vacía significa "no se
// envió" perdía esas filas antes de que nadie pudiera explicar qué significaban,
// y ninguna explicación posterior podía traerlas de vuelta.
//
// Una receta que no puede recuperar lo que la primera lectura descartó no es una
// receta: es una preferencia que se aplica sobre un resultado ya cocinado.
//
// ── QUÉ SE CONSERVA ───────────────────────────────────────────────────────
//
// Los encabezados y las celdas, como texto, tal como se leyeron. Con eso la
// receta vuelve a mapear columnas y vuelve a decidir qué renglones cuentan, sin
// volver a abrir el archivo y sin volver a pedirle nada al modelo.
//
// No se conserva el archivo: pesa, puede tener datos que no hacen falta guardar
// y no agrega nada que las celdas no digan. Lo que se conserva es lo mínimo que
// permite reinterpretar.

import { CRITERIO_ENVIADO } from "./recetaDeLectura.js";

export const ORIGEN_CRUDO = Object.freeze({ EXCEL: "EXCEL", VISUAL: "VISUAL" });

/** Cuántas filas se conservan. Más que esto no es una tabla, es un archivo. */
export const MAX_FILAS_CRUDAS = 600;

const texto = (valor) => {
  if (valor === null || valor === undefined || typeof valor === "boolean") return "";
  return String(valor).trim();
};

const numero = (valor) => {
  if (valor === null || valor === undefined || valor === "") return null;
  const limpio = typeof valor === "string" ? valor.replace(/\s/g, "").replace(",", ".") : valor;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
};

/**
 * Arma la representación cruda a partir de filas de celdas.
 *
 * @param filas         arreglo de arreglos de celdas, incluida la de encabezado
 * @param filaEncabezado índice de la fila que hace de encabezado
 */
export function crudoDesdeFilas({ origen, filas = [], filaEncabezado = 0 } = {}) {
  const todas = Array.isArray(filas) ? filas : [];
  const encabezados = (todas[filaEncabezado] || []).map(texto);
  const cuerpo = todas
    .slice(filaEncabezado + 1, filaEncabezado + 1 + MAX_FILAS_CRUDAS)
    .map((fila, indice) => ({
      indice: filaEncabezado + 2 + indice,
      celdas: (Array.isArray(fila) ? fila : []).map(texto),
    }));
  return {
    origen: origen === ORIGEN_CRUDO.VISUAL ? ORIGEN_CRUDO.VISUAL : ORIGEN_CRUDO.EXCEL,
    encabezados,
    filas: cuerpo,
  };
}

/** ¿Hay con qué reinterpretar? */
export function crudoUtilizable(crudo) {
  return Boolean(crudo && Array.isArray(crudo.filas) && crudo.filas.length > 0);
}

/**
 * EN QUÉ COLUMNA ESTÁ CADA CAMPO, SEGÚN LA RECETA.
 *
 * La receta puede decirlo por ENCABEZADO —"la columna que dice ENVIADO"— o por
 * POSICIÓN —"la primera"—. El encabezado gana cuando existe: sobrevive a que el
 * proveedor agregue una columna al principio, y la posición no.
 *
 * Devuelve `null` para lo que la receta no dice. Un campo sin columna no se
 * inventa: se deja vacío y quien mira la pantalla lo ve vacío.
 */
export function columnasSegunReceta({ crudo, receta } = {}) {
  const encabezados = (crudo?.encabezados ?? []).map((h) => normalizar(h));
  const salida = {};
  for (const [campo, definicion] of Object.entries(receta?.columnas ?? {})) {
    if (!definicion) {
      salida[campo] = null;
      continue;
    }
    let indice = null;
    if (definicion.encabezado) {
      const buscado = normalizar(definicion.encabezado);
      const encontrado = encabezados.findIndex((h) => h === buscado);
      // Se acepta también el que CONTIENE el texto, porque un encabezado
      // impreso suele traer la unidad al lado —"CANT."— y quien escribe la
      // explicación pone la palabra, no el rótulo exacto.
      indice = encontrado >= 0 ? encontrado : encabezados.findIndex((h) => h.includes(buscado));
      if (indice < 0) indice = null;
    }
    if (indice === null && definicion.posicion !== null && definicion.posicion !== undefined) {
      indice = definicion.posicion;
    }
    salida[campo] = indice;
  }
  return salida;
}

/**
 * LAS LÍNEAS QUE SALEN DE APLICARLE LA RECETA AL CRUDO.
 *
 * Es la operación que hace posible "reanalizar sin volver a leer el archivo": el
 * papel no cambió, cambió cómo se lo interpreta.
 *
 * ── LOS RENGLONES DESCARTADOS SE CUENTAN, NO DESAPARECEN ─────────────────
 *
 * `descartadas` dice cuántos se dejaron afuera y por qué. Sin eso, una receta
 * que descarta de más se ve exactamente igual que un papel con menos renglones,
 * y es la clase de diferencia que nadie nota hasta que falta mercadería.
 */
export function lineasDesdeElCrudo({ crudo, receta } = {}) {
  if (!crudoUtilizable(crudo)) return null;

  const columnas = columnasSegunReceta({ crudo, receta });
  const criterio = receta?.enviado?.criterio ?? null;
  const columnaMarca =
    criterio === CRITERIO_ENVIADO.COLUMNA_MARCADA && receta?.enviado?.columna
      ? indicePorEncabezado(crudo, receta.enviado.columna)
      : null;

  const lineas = [];
  const descartadas = [];

  for (const fila of crudo.filas) {
    const celda = (campo) => {
      const indice = columnas[campo];
      return indice === null || indice === undefined ? null : fila.celdas[indice] ?? null;
    };

    const codigo = texto(celda("codigo")) || null;
    const descripcion = texto(celda("descripcion")) || null;
    const cantidadCruda = celda("cantidad");
    const cantidad = numero(cantidadCruda);

    // Una fila totalmente vacía no es un renglón descartado: no es un renglón.
    if (!fila.celdas.some((c) => c !== "")) continue;
    if (!codigo && !descripcion) {
      descartadas.push({ fila: fila.indice, porque: "sin código ni descripción" });
      continue;
    }

    // ── EL CRITERIO DE ENVÍO, QUE ES EL QUE LA RECETA VIENE A RESOLVER ────
    if (criterio === CRITERIO_ENVIADO.CANTIDAD_PRESENTE && (cantidadCruda === null || cantidadCruda === "")) {
      descartadas.push({ fila: fila.indice, porque: "la cantidad está vacía: no fue enviado", producto: descripcion || codigo });
      continue;
    }
    if (columnaMarca !== null) {
      const marca = texto(fila.celdas[columnaMarca]).toUpperCase();
      const marcado = marca !== "" && !["0", "NO", "N"].includes(marca);
      if (!marcado) {
        descartadas.push({ fila: fila.indice, porque: "no está marcado como enviado", producto: descripcion || codigo });
        continue;
      }
    }

    lineas.push({
      filaOrigen: fila.indice,
      codigo,
      descripcion: descripcion || codigo || "Sin descripción",
      // `null` y no 0: un renglón sin cantidad legible es distinto de uno con
      // cantidad cero, y la pantalla los tiene que poder distinguir.
      cantidad,
      unidad: texto(celda("unidad")).toUpperCase() || null,
      precioUnitario: numero(celda("precioUnitario")),
      bonificacionPct: porcentajeDeCelda(celda("bonificacionPct")),
      subtotal: numero(celda("subtotal")),
    });
  }

  return {
    lineas,
    descartadas,
    // Lo que la receta SÍ pudo mapear. Es lo que después decide si el subtotal
    // se puede usar: sin columna mapeada no hay subtotal leído, y eso no es lo
    // mismo que un subtotal en cero.
    hayColumnaSubtotal: columnas.subtotal !== null && columnas.subtotal !== undefined,
    hayColumnaBonificacion: columnas.bonificacionPct !== null && columnas.bonificacionPct !== undefined,
  };
}

/**
 * Una bonificación de una celda.
 *
 * Misma regla que en el lector de Excel, y por el mismo motivo: una hoja puede
 * traer el 14 % como `14` o como `0,14`. El redondeo a seis decimales no es
 * cosmético — `0.14 * 100` da 14.000000000000002 en coma flotante, y ese valor
 * viajaría hasta el cálculo del precio.
 */
function porcentajeDeCelda(valor) {
  const n = numero(valor);
  if (n === null) return null;
  if (n > 0 && n < 1) return Number((n * 100).toFixed(6));
  return n;
}

function indicePorEncabezado(crudo, nombre) {
  const buscado = normalizar(nombre);
  const encabezados = (crudo?.encabezados ?? []).map((h) => normalizar(h));
  const exacto = encabezados.findIndex((h) => h === buscado);
  if (exacto >= 0) return exacto;
  const contiene = encabezados.findIndex((h) => h.includes(buscado));
  return contiene >= 0 ? contiene : null;
}

function normalizar(valor) {
  // Los diacríticos se sacan por PROPIEDAD Unicode y no por un rango escrito
  // con los caracteres literales adentro. El rango literal funciona, pero deja
  // el archivo dependiendo de que nadie lo abra ni lo guarde con otra
  // codificación — y en este proyecto una regex maltratada por una herramienta
  // ya movió 20.362 píxeles una vez.
  return texto(valor)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}
