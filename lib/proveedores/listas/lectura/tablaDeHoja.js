// lib/proveedores/listas/lectura/tablaDeHoja.js
//
// DE UNA HOJA DE CÁLCULO A LA MISMA TABLA QUE SALE DE UN PDF.
//
// ── POR QUÉ NO ES TRIVIAL, SI LA PLANILLA YA TIENE COLUMNAS ─────────────────
//
// Porque tener columnas no es lo mismo que tener LAS columnas. Una lista
// exportada a Excel trae, arriba de la tabla, el nombre de la empresa y la fecha;
// trae columnas enteras vacías que el que exportó nunca borró; y trae, entre los
// productos, los mismos títulos de rubro que trae el PDF. Si eso entra como
// datos, el motor de decisión recibe filas que no son productos.
//
// Lo que este módulo NO tiene que resolver es dónde empieza cada columna: eso ya
// viene dado, y es la única diferencia con `tablaDeArchivo.js`.
//
// ── LA SALIDA ES LA MISMA, Y ESO ES EL PUNTO ────────────────────────────────
//
// Devuelve `{ titulos, filas, filasDescartadas }` con la misma forma que
// `tablaDeFragmentos`, así que `proponerMapeo` y `decidirLista` no saben —ni
// tienen por qué saber— si el archivo era un PDF o una planilla. Un formato nuevo
// se agrega escribiendo otro módulo como éste, no tocando el motor.
//
// Módulo puro: sin BD, sin Next, sin `xlsx`. Recibe una matriz de textos.

import { pareceTituloDeColumna } from "./deteccionDeColumnas.js";

/** Un texto limpio de una celda de planilla, venga como venga. */
function texto(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/**
 * La tabla de una hoja.
 *
 * @param matriz  string[][] — la hoja tal cual, incluidas las filas de arriba
 * @returns { titulos, filas: [{ pagina, y, valores }], filasDescartadas }
 */
export function tablaDeHoja(matriz = []) {
  const limpias = matriz.map((f) => (Array.isArray(f) ? f.map(texto) : []));

  // ── 1. Dónde empieza la tabla ────────────────────────────────────────────
  //
  // En el renglón con más nombres de columna. Igual que en el PDF y por el mismo
  // motivo: lo que está arriba del encabezado no es de la tabla.
  let corte = -1;
  let mejor = 0;
  for (let i = 0; i < limpias.length; i++) {
    const llenas = limpias[i].filter((c) => c !== "").length;
    if (llenas < 2) continue;
    const titulos = limpias[i].filter((c) => pareceTituloDeColumna(c)).length;
    if (titulos >= 2 && titulos >= llenas / 2 && titulos > mejor) {
      mejor = titulos;
      corte = i;
    }
  }
  const desde = corte < 0 ? 0 : corte;
  const cuerpo = limpias.slice(desde);
  if (cuerpo.length === 0) return { titulos: [], filas: [], filasDescartadas: [], anclas: [] };

  // ── 2. Las columnas que tienen algo ──────────────────────────────────────
  //
  // Una columna vacía en TODAS las filas no es una columna: es una que el que
  // exportó dejó ahí. Dejarla adentro le corre el índice a todas las demás y
  // hace que la propuesta de mapeo hable de columnas que en la pantalla no se
  // ven.
  const ancho = Math.max(...cuerpo.map((f) => f.length), 0);
  const usadas = [];
  for (let c = 0; c < ancho; c++) {
    if (cuerpo.some((f) => texto(f[c]) !== "")) usadas.push(c);
  }
  if (usadas.length === 0) return { titulos: [], filas: [], filasDescartadas: [], anclas: [] };

  const conValores = cuerpo.map((f, i) => ({
    pagina: 1,
    y: desde + i + 1, // el número de fila de la planilla, para poder señalarla
    valores: usadas.map((c) => texto(f[c])),
  }));

  // ── 3. Los títulos ───────────────────────────────────────────────────────
  const titulos = new Array(usadas.length).fill("");
  for (const f of conValores) {
    if (!esEncabezado(f.valores)) continue;
    for (let i = 0; i < titulos.length; i++) {
      if (!titulos[i] && f.valores[i]) titulos[i] = f.valores[i];
    }
  }

  // ── 4. Qué es una fila de datos ──────────────────────────────────────────
  const filas = [];
  const filasDescartadas = [];
  for (const f of conValores) {
    const llenas = f.valores.filter((v) => v !== "").length;
    const linea = f.valores.filter(Boolean).join(" | ").slice(0, 120);
    if (llenas <= 1) {
      filasDescartadas.push({ pagina: 1, y: f.y, texto: linea, motivo: "TITULO_O_SUELTA" });
      continue;
    }
    if (esEncabezado(f.valores)) {
      filasDescartadas.push({ pagina: 1, y: f.y, texto: linea, motivo: "ENCABEZADO" });
      continue;
    }
    filas.push({ pagina: 1, y: f.y, valores: f.valores });
  }

  return { titulos, filas, filasDescartadas, anclas: usadas };
}

/** ¿Este renglón es encabezado y no datos? La misma regla que en el PDF. */
function esEncabezado(valores = []) {
  const llenas = valores.filter((v) => v !== "").length;
  if (llenas < 2) return false;
  const titulos = valores.filter((v) => pareceTituloDeColumna(v)).length;
  return titulos >= 2 && titulos >= llenas / 2;
}

/**
 * Una matriz a partir del texto de un CSV.
 *
 * ── EL SEPARADOR SE DETECTA, NO SE SUPONE ───────────────────────────────────
 *
 * Un CSV argentino usa la coma como separador DECIMAL —"1.234,56"—, así que
 * separar por coma parte los precios al medio. El punto y coma es lo que usa
 * Excel en español y es el caso más común acá; el tabulador aparece cuando
 * alguien pega de una planilla. Se elige el que produce más columnas en las
 * primeras filas, que es la única forma de acertarle sin preguntarle al usuario.
 */
export function matrizDeCsv(contenido = "") {
  const texto = String(contenido).replace(/^﻿/, "");
  const lineas = texto.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (lineas.length === 0) return [];

  const muestra = lineas.slice(0, 20);
  let separador = ";";
  let mejor = 0;
  for (const sep of [";", "\t", ",", "|"]) {
    const columnas = muestra.map((l) => partirLinea(l, sep).length);
    // La MEDIANA y no el promedio: una sola línea rara no decide el separador.
    const ordenadas = [...columnas].sort((a, b) => a - b);
    const mediana = ordenadas[Math.floor(ordenadas.length / 2)];
    if (mediana > mejor) {
      mejor = mediana;
      separador = sep;
    }
  }
  return lineas.map((l) => partirLinea(l, separador));
}

/** Parte una línea respetando las comillas dobles. */
function partirLinea(linea, separador) {
  const salida = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else entreComillas = !entreComillas;
      continue;
    }
    if (c === separador && !entreComillas) {
      salida.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  salida.push(actual);
  return salida.map((x) => x.trim());
}
