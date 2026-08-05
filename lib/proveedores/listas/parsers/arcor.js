// lib/proveedores/listas/parsers/arcor.js
//
// PARSER DE LA LISTA DE PRECIOS DE ARCOR.
//
// Función pura: recibe un workbook ya leído y devuelve lo que encontró. No abre
// archivos, no toca Prisma, no escribe nada, no calcula costos. Traducir el
// Excel a filas y decir qué está mal es todo lo que hace.
//
// ── CÓMO ES EL ARCHIVO ───────────────────────────────────────────────────────
//
// Una hoja, encabezado en la fila 1, y después una mezcla de dos cosas:
//
//   · FILAS DE CATEGORÍA — solo la columna A, con la jerarquía entera metida en
//     un string: "03- ALIMENTOS   91- COMESTIBLES LA CAMPAGNOLA   0123- ADEREZOS".
//   · FILAS DE PRODUCTO — código, descripción, unidad comercial, unidades por
//     bulto y los dos precios.
//
// La categoría no se repite por producto: vale hasta que aparece otra. Por eso
// el parser la arrastra.
//
// ── POR QUÉ SE BUSCA POR ENCABEZADO Y NO POR POSICIÓN ────────────────────────
//
// Arcor exporta el mismo listado con distintas columnas según qué pidió el que
// lo generó: una exportación real tiene "Cod de barra" donde otra tiene "Precio
// S/IVA". Si el parser leyera "la columna E", el mismo código leería un precio
// en un archivo y un código de barras en el otro, y nadie lo notaría hasta ver
// costos absurdos. Se busca cada columna POR SU NOMBRE y, si falta una de las
// obligatorias, se rechaza el archivo entero.
//
// ── LAS UNIDADES NO SE INTERPRETAN ───────────────────────────────────────────
//
// UN, DI y BU se conservan tal cual. Un display no es una unidad y un bulto no
// es factor 1: qué significa cada uno para el costo es problema de otra etapa.
// Acá no se multiplica ni se divide ningún precio.
//
// ── LAS FÓRMULAS NO SE EJECUTAN ──────────────────────────────────────────────
//
// La columna "Precio S/IVA" son fórmulas (F/1,21). Se lee su VALOR CACHEADO si
// está; si el archivo viene de LibreOffice o se guardó sin cachear, queda en
// null y no pasa nada. La fuente de verdad para conciliar es "Precio C/IVA",
// que es un número escrito, no una fórmula.

import XLSX from "xlsx";

// Import relativo (no alias "@/") porque este módulo se prueba con `node --test`.
import { clavesDeCodigo } from "../normalizarCodigo.js";

/** Las unidades comerciales que Arcor usa. No se traducen ni se convierten. */
export const UNIDAD_PROVEEDOR = {
  UN: "UN", // unidad
  DI: "DI", // display
  BU: "BU", // bulto
};

export const UNIDADES_VALIDAS = new Set(Object.keys(UNIDAD_PROVEEDOR));

/** Qué representa cada una, para mostrar. No habilita ninguna conversión. */
export const DESCRIPCION_UNIDAD = {
  UN: "unidad",
  DI: "display",
  BU: "bulto",
};

// ── QUÉ COLUMNAS HACEN FALTA ─────────────────────────────────────────────────
//
// Arcor exporta el mismo listado con distintas columnas según qué pidió el que
// lo generó. Dos formatos reales, confirmados contra archivos de verdad:
//
//   Formato A: Producto · Descripción · U.M. · UxBU · Precio S/IVA · Precio C/IVA
//   Formato B: Producto · Descripción · U.M. · UxBU · Precio C/IVA · Cod de barra
//
// Lo único que la conciliación necesita de los dos es PRECIO C/IVA — la regla
// comercial se arma sobre él. "Precio S/IVA" es una fórmula derivada y "Cod de
// barra" es un dato de más: exigir cualquiera de los dos rechazaría un archivo
// perfectamente utilizable.
//
// Por eso el mapeo es SIEMPRE por nombre de encabezado y nunca por posición. En
// el formato B, "Precio C/IVA" está en la columna E; en el A, en la F. Un parser
// posicional leería un código de barras de trece dígitos como si fuera un precio
// y nadie lo notaría hasta ver costos absurdos.

/** Sin alguno de estos el archivo no sirve. */
export const ENCABEZADOS_OBLIGATORIOS = {
  codigo: "Producto",
  descripcion: "Descripción",
  unidad: "U.M.",
  unidadesPorBulto: "UxBU",
  precioConIva: "Precio C/IVA",
};

/** Se leen si están; si no están, el archivo sigue siendo válido. */
export const ENCABEZADOS_OPCIONALES = {
  precioSinIva: "Precio S/IVA",
  codigoBarra: "Cod de barra",
};

/** Todos los que el parser sabe leer. */
export const ENCABEZADOS = { ...ENCABEZADOS_OBLIGATORIOS, ...ENCABEZADOS_OPCIONALES };

export const ERROR_PARSER = {
  SIN_HOJAS: "SIN_HOJAS",
  NINGUNA_HOJA_VALIDA: "NINGUNA_HOJA_VALIDA",
  MULTIPLES_HOJAS_VALIDAS: "MULTIPLES_HOJAS_VALIDAS",
  ENCABEZADO_FALTANTE: "ENCABEZADO_FALTANTE",
  ENCABEZADO_DUPLICADO: "ENCABEZADO_DUPLICADO",
  CODIGO_VACIO: "CODIGO_VACIO",
  DESCRIPCION_VACIA: "DESCRIPCION_VACIA",
  UNIDAD_DESCONOCIDA: "UNIDAD_DESCONOCIDA",
  UXBU_INVALIDO: "UXBU_INVALIDO",
  PRECIO_INVALIDO: "PRECIO_INVALIDO",
  CODIGO_DUPLICADO: "CODIGO_DUPLICADO",
  FILA_PARCIAL: "FILA_PARCIAL",
};

export const ADVERTENCIA_PARSER = {
  PRECIO_CERO: "PRECIO_CERO",
  PRECIO_CASI_CERO: "PRECIO_CASI_CERO",
  PRECIO_SIN_IVA_AUSENTE: "PRECIO_SIN_IVA_AUSENTE",
  COLUMNA_INESPERADA: "COLUMNA_INESPERADA",
  ENCABEZADO_EXTRA: "ENCABEZADO_EXTRA",
};

/** Debajo de este importe un precio deja de ser creíble como precio de lista. */
export const PISO_PRECIO_CREIBLE = 1;

// ── Lectura de celdas ────────────────────────────────────────────────────────

/**
 * El valor de una celda, o null.
 *
 * Una celda con fórmula sin valor cacheado tiene `.f` pero no `.v`: se devuelve
 * null en vez de intentar resolverla. No se incorpora ningún motor de fórmulas.
 */
function valorCelda(hoja, fila, col) {
  const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: col })];
  if (!celda) return null;
  if (celda.v === undefined || celda.v === null) return null;
  return celda.v;
}

/** ¿Esta celda tiene fórmula? Informativo: sirve para explicar un null. */
function tieneFormula(hoja, fila, col) {
  const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: col })];
  return !!celda?.f;
}

/**
 * El contenido de una celda COMO TEXTO, sin que el número la arruine.
 *
 * Es lo que hace falta para el código de barras. Un EAN de trece dígitos leído
 * como número sobrevive, pero un código guardado como texto con ceros a la
 * izquierda —"0779336010301"— los pierde apenas alguien lo convierte, y un
 * número más largo se imprime en notación científica. Acá: si la celda es texto
 * se devuelve tal cual, y si es número se formatea sin exponente y sin
 * separadores de miles.
 */
function textoCelda(hoja, fila, col) {
  const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: col })];
  if (!celda || celda.v === undefined || celda.v === null) return null;
  const v = celda.v;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    // "fullwide" sin agrupación: 7793360103018 y no 7,793360103018e+12.
    return v.toLocaleString("fullwide", { useGrouping: false });
  }
  const t = String(v).trim();
  return t === "" ? null : t;
}

const texto = (v) => (v === null || v === undefined ? "" : String(v).trim());
const vacio = (v) => texto(v) === "";

/** Compara encabezados sin que un acento, un espacio de más o una mayúscula
 *  distinta hagan fallar el reconocimiento. */
export function normalizarEncabezado(valor) {
  return texto(valor)
    .normalize("NFD")
    // Marcas diacríticas por rango unicode, no por literales: "Descripción" y
    // "Descripcion" tienen que reconocerse igual sin que el propio archivo
    // fuente dependa de cómo se guardaron sus acentos.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Mapa encabezado → índice de columna, leyendo la fila 1 de la hoja.
 *
 * Devuelve `{ columnas, faltantes, duplicados, extras }`. `columnas` usa las
 * claves lógicas de ENCABEZADOS, no letras: el resto del parser nunca menciona
 * "la columna E".
 */
export function mapearColumnas(hoja) {
  const rango = XLSX.utils.decode_range(hoja?.["!ref"] ?? "A1:A1");
  const esperados = new Map(
    Object.entries(ENCABEZADOS).map(([clave, titulo]) => [normalizarEncabezado(titulo), clave])
  );

  const columnas = {};
  const duplicados = [];
  const extras = [];

  for (let c = rango.s.c; c <= rango.e.c; c++) {
    const bruto = valorCelda(hoja, rango.s.r, c);
    if (vacio(bruto)) continue;
    const norm = normalizarEncabezado(bruto);
    const clave = esperados.get(norm);
    if (!clave) {
      extras.push({ columna: c, titulo: texto(bruto) });
      continue;
    }
    if (columnas[clave] !== undefined) {
      duplicados.push({ clave, titulo: texto(bruto), columna: c });
      continue;
    }
    columnas[clave] = c;
  }

  // `faltantes` cuenta SOLO los obligatorios: un archivo sin "Precio S/IVA" o
  // sin "Cod de barra" es válido.
  const faltantes = Object.keys(ENCABEZADOS_OBLIGATORIOS).filter((k) => columnas[k] === undefined);
  const opcionalesAusentes = Object.keys(ENCABEZADOS_OPCIONALES).filter(
    (k) => columnas[k] === undefined
  );
  return { columnas, faltantes, opcionalesAusentes, duplicados, extras, filaEncabezado: rango.s.r };
}

/** ¿Esta hoja tiene los cinco encabezados obligatorios? */
export function hojaEsCandidata(hoja) {
  return mapearColumnas(hoja).faltantes.length === 0;
}

/** Qué formato de exportación es, para poder decirlo en el informe. */
export function formatoDeHoja(hoja) {
  const { columnas, faltantes } = mapearColumnas(hoja);
  if (faltantes.length > 0) return null;
  const conSinIva = columnas.precioSinIva !== undefined;
  const conBarra = columnas.codigoBarra !== undefined;
  if (conSinIva && !conBarra) return "A";
  if (!conSinIva && conBarra) return "B";
  return "MIXTO";
}

// ── Clasificación de filas ───────────────────────────────────────────────────

export const TIPO_FILA = {
  VACIA: "VACIA",
  CATEGORIA: "CATEGORIA",
  PRODUCTO: "PRODUCTO",
  PARCIAL: "PARCIAL",
};

/**
 * Qué es esta fila.
 *
 * CATEGORÍA es la fila que tiene texto en la primera columna y NADA en las
 * demás columnas conocidas. PRODUCTO es la que tiene código y descripción —
 * después se valida lo demás, pero un producto con la unidad mal escrita sigue
 * siendo un producto, no una fila rota—. Lo que tiene contenido y no encaja en
 * ninguna de las dos es PARCIAL: no se descarta en silencio, se informa.
 */
export function clasificarFila({ codigo, descripcion, unidad, unidadesPorBulto, precioConIva }) {
  const hayCodigo = !vacio(codigo);

  // SOLO SE MIRAN LAS COLUMNAS OBLIGATORIAS. Las accesorias —Precio S/IVA y Cod
  // de barra— quedan afuera a propósito, y esto no es una licencia: es lo que
  // hacen los archivos reales.
  //
  // En la lista de agosto 2026, 76 de las 77 filas de categoría traen un CERO
  // numérico en Precio S/IVA; la única que no lo trae es la primera. Mirando esa
  // columna, 76 categorías se leían como filas rotas y los 917 productos
  // quedaban colgados de una sola categoría equivocada. En la exportación con
  // códigos de barras pasa lo mismo en la columna de barras, con 0 y con string
  // vacío.
  //
  // El criterio coincide además con la definición del listado: una fila de
  // categoría es texto en la primera columna SIN descripción ni unidad
  // comercial. Lo que llene una columna derivada no la convierte en producto.
  const restoVacio =
    vacio(descripcion) && vacio(unidad) && vacio(unidadesPorBulto) && vacio(precioConIva);

  if (!hayCodigo && restoVacio) return TIPO_FILA.VACIA;
  if (hayCodigo && restoVacio) return TIPO_FILA.CATEGORIA;
  if (hayCodigo && !vacio(descripcion)) return TIPO_FILA.PRODUCTO;
  return TIPO_FILA.PARCIAL;
}

// ── El parser ────────────────────────────────────────────────────────────────

/**
 * Parsea la lista de precios de Arcor.
 *
 * @param workbook  workbook de la librería XLSX, ya leído por quien llama
 * @param opciones.hoja  forzar una hoja por nombre (para diagnóstico)
 *
 * @returns { productos, categorias, advertencias, errores, resumen }
 *
 * Nunca lanza por un archivo mal formado: los problemas salen por `errores`,
 * con fila y motivo. Un archivo con errores igual devuelve los productos que sí
 * se pudieron leer, porque revisar 900 filas es más fácil con las buenas ya
 * separadas.
 */
export function parsearListaArcor(workbook, { hoja: hojaForzada } = {}) {
  const productos = [];
  const categorias = [];
  const advertencias = [];
  const errores = [];

  const nombres = workbook?.SheetNames ?? [];
  if (nombres.length === 0) {
    errores.push({ codigo: ERROR_PARSER.SIN_HOJAS, mensaje: "El archivo no tiene hojas." });
    return armarSalida({ productos, categorias, advertencias, errores, hojaNombre: null });
  }

  // ── Qué hoja ───────────────────────────────────────────────────────────
  const candidatas = nombres.filter((n) => hojaEsCandidata(workbook.Sheets[n]));

  let hojaNombre = null;
  if (hojaForzada) {
    if (!nombres.includes(hojaForzada)) {
      errores.push({
        codigo: ERROR_PARSER.NINGUNA_HOJA_VALIDA,
        mensaje: `La hoja "${hojaForzada}" no existe en el archivo.`,
      });
      return armarSalida({ productos, categorias, advertencias, errores, hojaNombre: null });
    }
    hojaNombre = hojaForzada;
  } else if (candidatas.length === 0) {
    // Se informa qué falta en cada hoja: "ninguna sirve" sin decir por qué
    // obliga a abrir el Excel a mano.
    const detalle = nombres.map((n) => ({
      hoja: n,
      faltantes: mapearColumnas(workbook.Sheets[n]).faltantes,
    }));
    errores.push({
      codigo: ERROR_PARSER.NINGUNA_HOJA_VALIDA,
      mensaje: "Ninguna hoja tiene los encabezados de la lista de Arcor.",
      detalle,
    });
    return armarSalida({ productos, categorias, advertencias, errores, hojaNombre: null });
  } else if (candidatas.length > 1) {
    // Elegir una sería adivinar cuál lista quiso subir el usuario.
    errores.push({
      codigo: ERROR_PARSER.MULTIPLES_HOJAS_VALIDAS,
      mensaje: "Más de una hoja parece una lista de precios. Dejá una sola.",
      detalle: { hojas: candidatas },
    });
    return armarSalida({ productos, categorias, advertencias, errores, hojaNombre: null });
  } else {
    hojaNombre = candidatas[0];
  }

  const hoja = workbook.Sheets[hojaNombre];
  const { columnas, faltantes, opcionalesAusentes, duplicados, extras, filaEncabezado } =
    mapearColumnas(hoja);
  const formato = formatoDeHoja(hoja);

  if (faltantes.length > 0) {
    errores.push({
      codigo: ERROR_PARSER.ENCABEZADO_FALTANTE,
      mensaje: `Faltan encabezados obligatorios: ${faltantes
        .map((k) => ENCABEZADOS_OBLIGATORIOS[k])
        .join(", ")}.`,
      detalle: { faltantes, hoja: hojaNombre },
    });
    return armarSalida({ productos, categorias, advertencias, errores, hojaNombre });
  }
  for (const d of duplicados) {
    // Un obligatorio repetido es ambigüedad real: no se sabe cuál columna es el
    // precio. Un opcional repetido se ignora con aviso, porque su ausencia ya
    // era aceptable.
    const esObligatorio = Object.prototype.hasOwnProperty.call(ENCABEZADOS_OBLIGATORIOS, d.clave);
    if (esObligatorio) {
      errores.push({
        codigo: ERROR_PARSER.ENCABEZADO_DUPLICADO,
        mensaje: `El encabezado obligatorio "${d.titulo}" aparece más de una vez.`,
        detalle: d,
      });
    } else {
      advertencias.push({
        codigo: ADVERTENCIA_PARSER.ENCABEZADO_EXTRA,
        mensaje: `El encabezado opcional "${d.titulo}" aparece más de una vez. Se usa el primero.`,
        detalle: d,
      });
    }
  }
  if (errores.length > 0) {
    return armarSalida({ productos, categorias, advertencias, errores, hojaNombre });
  }
  for (const e of extras) {
    advertencias.push({
      codigo: ADVERTENCIA_PARSER.ENCABEZADO_EXTRA,
      mensaje: `Columna no esperada en el encabezado: "${e.titulo}". Se ignora.`,
      detalle: e,
    });
  }

  // Columnas que no son ninguna de las seis: se ignoran, pero si traen datos se
  // avisa una vez, con la fila. G y H del archivo real entran por acá.
  const conocidas = new Set(Object.values(columnas));
  const rango = XLSX.utils.decode_range(hoja["!ref"]);

  // ── Filas ──────────────────────────────────────────────────────────────
  let categoriaCruda = null;
  let filasVacias = 0;
  const vistos = new Map(); // codigoNormalizado → primera fila donde apareció

  for (let r = filaEncabezado + 1; r <= rango.e.r; r++) {
    const filaExcel = r + 1; // 1-based, como lo ve el usuario en Excel

    const crudo = {
      codigo: valorCelda(hoja, r, columnas.codigo),
      descripcion: valorCelda(hoja, r, columnas.descripcion),
      unidad: valorCelda(hoja, r, columnas.unidad),
      unidadesPorBulto: valorCelda(hoja, r, columnas.unidadesPorBulto),
      // Columna opcional: sin ella, `undefined` como índice devuelve null.
      precioSinIva:
        columnas.precioSinIva === undefined ? null : valorCelda(hoja, r, columnas.precioSinIva),
      precioConIva: valorCelda(hoja, r, columnas.precioConIva),
    };

    const tipo = clasificarFila(crudo);

    if (tipo === TIPO_FILA.VACIA) {
      filasVacias++;
      continue;
    }

    if (tipo === TIPO_FILA.CATEGORIA) {
      categoriaCruda = texto(crudo.codigo);
      categorias.push({ filaExcel, hojaNombre, textoCrudo: categoriaCruda });
      continue;
    }

    if (tipo === TIPO_FILA.PARCIAL) {
      errores.push({
        codigo: ERROR_PARSER.FILA_PARCIAL,
        filaExcel,
        mensaje: "La fila tiene datos pero no es un producto ni una categoría.",
        detalle: crudo,
      });
      continue;
    }

    // ── Producto ─────────────────────────────────────────────────────────
    const claves = clavesDeCodigo(crudo.codigo);
    const problemas = [];

    if (!claves.normalizado) {
      problemas.push({ codigo: ERROR_PARSER.CODIGO_VACIO, mensaje: "El código quedó vacío al normalizar." });
    }

    const descripcion = texto(crudo.descripcion);
    if (!descripcion) {
      problemas.push({ codigo: ERROR_PARSER.DESCRIPCION_VACIA, mensaje: "Falta la descripción." });
    }

    const unidad = texto(crudo.unidad).toUpperCase();
    if (!UNIDADES_VALIDAS.has(unidad)) {
      problemas.push({
        codigo: ERROR_PARSER.UNIDAD_DESCONOCIDA,
        mensaje: `Unidad comercial desconocida: "${texto(crudo.unidad)}". Se esperaba UN, DI o BU.`,
      });
    }

    // UxBU: entero mayor o igual que 1. Un decimal no es un error de tipeo
    // inofensivo: significa que la fila no dice cuántas unidades entran.
    const uxbuNum = Number(crudo.unidadesPorBulto);
    const uxbuOk =
      !vacio(crudo.unidadesPorBulto) &&
      Number.isFinite(uxbuNum) &&
      Number.isInteger(uxbuNum) &&
      uxbuNum >= 1;
    if (!uxbuOk) {
      problemas.push({
        codigo: ERROR_PARSER.UXBU_INVALIDO,
        mensaje: `UxBU inválido: "${texto(crudo.unidadesPorBulto)}". Se espera un entero de 1 o más.`,
      });
    }

    // Precio con IVA: la fuente de verdad.
    const precioNum = Number(crudo.precioConIva);
    const precioOk = !vacio(crudo.precioConIva) && Number.isFinite(precioNum) && precioNum >= 0;
    if (!precioOk) {
      problemas.push({
        codigo: ERROR_PARSER.PRECIO_INVALIDO,
        mensaje: `Precio C/IVA inválido: "${texto(crudo.precioConIva)}".`,
      });
    }

    // Precio sin IVA: opcional y derivado. NUNCA se calcula a partir de C/IVA —
    // el archivo lo trae como fórmula y reproducirla acá inventaría un dato.
    //
    // Si la columna no existe, queda en null y no se avisa nada: es un formato
    // válido, no una anomalía. Si existe pero la celda no tiene valor —fórmula
    // sin cachear, o vacía— ahí sí se avisa, porque el archivo prometía el dato.
    let precioSinIva = null;
    const hayColumnaSinIva = columnas.precioSinIva !== undefined;
    if (hayColumnaSinIva && !vacio(crudo.precioSinIva)) {
      const n = Number(crudo.precioSinIva);
      precioSinIva = Number.isFinite(n) ? n : null;
    }
    if (hayColumnaSinIva && precioSinIva === null) {
      advertencias.push({
        codigo: ADVERTENCIA_PARSER.PRECIO_SIN_IVA_AUSENTE,
        filaExcel,
        mensaje: tieneFormula(hoja, r, columnas.precioSinIva)
          ? "Precio S/IVA es una fórmula sin valor guardado. Se usa Precio C/IVA."
          : "Precio S/IVA vacío. Se usa Precio C/IVA.",
      });
    }

    // Código de barras: opcional, se lee COMO TEXTO y no se usa para machear
    // todavía. No es un precio y no participa de ninguna validación numérica.
    const codigoBarraProveedor =
      columnas.codigoBarra === undefined ? null : textoCelda(hoja, r, columnas.codigoBarra);

    // Columnas fuera de las seis con contenido: no rompen, avisan.
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      if (conocidas.has(c)) continue;
      const v = valorCelda(hoja, r, c);
      if (vacio(v)) continue;
      advertencias.push({
        codigo: ADVERTENCIA_PARSER.COLUMNA_INESPERADA,
        filaExcel,
        mensaje: `La columna ${XLSX.utils.encode_col(c)} tiene contenido que el parser ignora.`,
        detalle: { columna: XLSX.utils.encode_col(c), valor: texto(v) },
      });
    }

    if (problemas.length > 0) {
      for (const p of problemas) {
        errores.push({ ...p, filaExcel, codigoCrudo: claves.crudo, detalle: crudo });
      }
      continue;
    }

    // Duplicado dentro del archivo. No se descarta ninguno de los dos: se
    // informan las dos filas para que alguien mire cuál sobra.
    const previa = vistos.get(claves.normalizado);
    if (previa !== undefined) {
      errores.push({
        codigo: ERROR_PARSER.CODIGO_DUPLICADO,
        filaExcel,
        codigoCrudo: claves.crudo,
        mensaje: `El código "${claves.crudo}" ya apareció en la fila ${previa}.`,
        detalle: { filaPrevia: previa, codigoNormalizado: claves.normalizado },
      });
      continue;
    }
    vistos.set(claves.normalizado, filaExcel);

    // Precio cero o casi cero: se conserva como dato y se advierte. Descartarlo
    // en silencio escondería una fila que el proveedor mandó mal.
    if (precioNum === 0) {
      advertencias.push({
        codigo: ADVERTENCIA_PARSER.PRECIO_CERO,
        filaExcel,
        codigoCrudo: claves.crudo,
        mensaje: `El producto "${claves.crudo}" viene con precio 0.`,
      });
    } else if (precioNum > 0 && precioNum < PISO_PRECIO_CREIBLE) {
      advertencias.push({
        codigo: ADVERTENCIA_PARSER.PRECIO_CASI_CERO,
        filaExcel,
        codigoCrudo: claves.crudo,
        mensaje: `El producto "${claves.crudo}" viene con un precio de ${precioNum}, prácticamente cero.`,
      });
    }

    productos.push({
      filaExcel,
      hojaNombre,
      codigoCrudo: claves.crudo,
      codigoNormalizado: claves.normalizado,
      // null y no "" cuando no hay una variante distinta: así se distingue
      // "no tiene ceros que sacar" de "quedó vacío".
      codigoComparableSinCeros: claves.sinCeros || null,
      descripcionProveedor: descripcion,
      unidadProveedor: unidad,
      unidadesPorBulto: uxbuNum,
      precioSinIva,
      precioConIva: precioNum,
      // null cuando el formato no la trae. No se machea con esto todavía.
      codigoBarraProveedor: codigoBarraProveedor || null,
      categoriaCruda,
    });
  }

  return armarSalida({
    productos, categorias, advertencias, errores, hojaNombre, filasVacias,
    formato, columnasOpcionalesAusentes: opcionalesAusentes,
  });
}

// ── Resumen ──────────────────────────────────────────────────────────────────

function armarSalida({
  productos, categorias, advertencias, errores, hojaNombre, filasVacias = 0,
  formato = null, columnasOpcionalesAusentes = [],
}) {
  const porUnidad = { UN: 0, DI: 0, BU: 0 };
  let numericos = 0;
  let alfanumericos = 0;

  for (const p of productos) {
    if (porUnidad[p.unidadProveedor] !== undefined) porUnidad[p.unidadProveedor] += 1;
    if (/^[0-9]+$/.test(p.codigoNormalizado)) numericos += 1;
    else alfanumericos += 1;
  }

  const porTipoDeError = {};
  for (const e of errores) porTipoDeError[e.codigo] = (porTipoDeError[e.codigo] ?? 0) + 1;
  const porTipoDeAdvertencia = {};
  for (const a of advertencias) porTipoDeAdvertencia[a.codigo] = (porTipoDeAdvertencia[a.codigo] ?? 0) + 1;

  return {
    productos,
    categorias,
    advertencias,
    errores,
    resumen: {
      hojaNombre,
      // "A" (con Precio S/IVA), "B" (con Cod de barra) o "MIXTO". Sirve para que
      // el informe diga qué exportación subió el usuario.
      formato,
      columnasOpcionalesAusentes,
      productos: productos.length,
      categorias: categorias.length,
      porUnidad,
      conCodigoBarra: productos.filter((p) => p.codigoBarraProveedor).length,
      codigos: { numericos, alfanumericos },
      filasVacias,
      // "Descartadas" son las filas con contenido que no llegaron a producto:
      // parciales y las que fallaron alguna validación. Las categorías no se
      // descartan — se usan.
      filasDescartadas: errores.filter((e) => e.filaExcel !== undefined).length,
      errores: errores.length,
      advertencias: advertencias.length,
      porTipoDeError,
      porTipoDeAdvertencia,
    },
  };
}
