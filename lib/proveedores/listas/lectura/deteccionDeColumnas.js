// lib/proveedores/listas/lectura/deteccionDeColumnas.js
//
// QUÉ ES CADA COLUMNA DE UNA LISTA QUE NUNCA SE VIO.
//
// ── POR QUÉ NO SE PUEDE IR POR EL NOMBRE DEL ENCABEZADO ─────────────────────
//
// Porque no hay dos que se llamen igual. Sobre las cuatro listas reales, la
// columna del precio que se termina usando se llama, respectivamente:
//
//   "Precio"  ·  "FINAL"  ·  "Px. Final"  ·  "It_PrecioFinal"
//
// y el código se llama "Código", "COD", "Art" e "It_Codigo". Buscar nombres
// conocidos funciona con las cuatro que uno tiene en la mano y falla con la
// quinta, que es justo la que va a subir el cliente.
//
// ── ENTONCES SE MIRA EL CONTENIDO, Y EL NOMBRE SOLO DESEMPATA ───────────────
//
// Lo que una columna ES se decide por lo que tiene adentro en TODAS las filas:
// trece dígitos en casi todas es un código de barras; números con decimales y de
// magnitud parecida entre sí es un precio; texto largo y distinto en cada fila es
// la descripción. Eso no depende del idioma del encabezado ni de cómo lo escribió
// el que exportó el archivo.
//
// El nombre entra DESPUÉS y solo para desempatar entre candidatas del mismo tipo
// —cuál de las cinco columnas de precio se propone primero— y nunca para decidir
// sola. Una columna que se llama "PRECIO" y tiene fechas adentro no es un precio.
//
// ── LO QUE ESTE MÓDULO NO HACE ──────────────────────────────────────────────
//
// No elige la columna de precio definitiva. Propone un orden y la pantalla lo
// confirma; y cuál se usa de verdad lo decide `decisionDeLista.js` probando cada
// una contra los costos que ya están en el sistema. Acá se decide qué COLUMNA ES
// QUÉ, no cuál conviene.
//
// Módulo puro: sin BD, sin Next.

import { numeroDeLista, pareceNumero, cantidadDeLista } from "./numeroDeLista.js";
import { normalizarTitulo } from "./filasDeTexto.js";

/** Los campos que el motor necesita de cada fila. */
export const CAMPO = {
  CODIGO: "codigo",
  CODIGO_BARRA: "codigoBarra",
  DESCRIPCION: "descripcion",
  CANTIDAD: "cantidad",
  DESCUENTO: "descuento",
  PRECIO: "precio",
};

/**
 * Palabras que, cuando aparecen en un encabezado, EMPUJAN a un campo.
 *
 * No deciden: ordenan. Ver el encabezado del archivo.
 */
const PISTAS = {
  [CAMPO.CODIGO_BARRA]: ["codbarra", "codigodebarra", "codigobarra", "ean", "barra", "gtin"],
  [CAMPO.CODIGO]: ["codigo", "cod", "art", "articulo", "itcodigo", "sku", "referencia"],
  [CAMPO.DESCRIPCION]: ["descripcion", "articulo", "detalle", "producto", "nombre", "itdescripcion"],
  [CAMPO.CANTIDAD]: ["uxb", "und", "unidad", "unidades", "bulto", "porbulto", "uxbu", "cant", "cantidad"],
  [CAMPO.DESCUENTO]: ["desc", "descuento", "dto", "bonif", "bonificacion", "dsc"],
  // "lista" NO está, y es a propósito: "Lista de Precios 3 en PESO" y "LISTA DE
  // PRECIO 22 + 9,5%" son los TÍTULOS de dos de los cuatro archivos, no columnas.
  // Con esa pista adentro, `pareceTituloDeColumna` los tomaba por encabezados y el
  // título del documento terminaba puesto como nombre de una columna.
  [CAMPO.PRECIO]: ["precio", "final", "neto", "preventa", "importe", "pvp", "px", "unitario", "costo"],
};

/** Un código de barras: 8, 12, 13 o 14 dígitos, todos dígitos. */
export function pareceCodigoDeBarras(texto) {
  const t = String(texto ?? "").trim();
  return /^\d+$/.test(t) && [8, 12, 13, 14].includes(t.length);
}

/**
 * El perfil de una columna: qué proporción de sus celdas es cada cosa.
 *
 * Se mide sobre las celdas NO VACÍAS. Una columna medio vacía no deja de ser lo
 * que es: en la lista de bebidas la de impuesto interno viene vacía en las filas
 * de soda y llena en las de gaseosa, y sigue siendo la de impuesto interno.
 */
export function perfilDeColumna(valores = []) {
  const llenos = valores.map((v) => String(v ?? "").trim()).filter((v) => v !== "");
  const n = llenos.length;
  if (n === 0) {
    return { llenas: 0, proporcionLlena: 0, numeros: 0, barras: 0, enteros: 0, porcentajes: 0, texto: 0, largoMedio: 0, distintos: 0 };
  }
  let numeros = 0, barras = 0, enteros = 0, porcentajes = 0, texto = 0, largo = 0;
  const vistos = new Set();
  const magnitudes = [];
  for (const v of llenos) {
    vistos.add(v);
    largo += v.length;
    if (pareceCodigoDeBarras(v)) barras++;
    const num = numeroDeLista(v);
    if (num !== null) {
      numeros++;
      // LA MAGNITUD, NO EL SIGNO. Una columna de descuentos escrita en negativo
      // —"-12,0"— dejaba la mediana en null y con eso el puntaje de descuento
      // quedaba bajo el umbral: la columna existía, se llamaba "Desc%", y el
      // motor no la veía.
      if (num !== 0) magnitudes.push(Math.abs(num));
      if (Number.isInteger(num)) enteros++;
      if (pareceProporcion(v, num)) porcentajes++;
    } else {
      texto++;
    }
  }
  magnitudes.sort((a, b) => a - b);
  return {
    llenas: n,
    proporcionLlena: n / Math.max(1, valores.length),
    numeros: numeros / n,
    barras: barras / n,
    enteros: enteros / n,
    porcentajes: porcentajes / n,
    texto: texto / n,
    largoMedio: largo / n,
    distintos: vistos.size / n,
    mediana: magnitudes.length ? magnitudes[Math.floor(magnitudes.length / 2)] : null,
  };
}

/**
 * ¿Esta celda parece un porcentaje y no un precio?
 *
 * Tres formas, y las tres salen de las listas reales: el signo escrito ("39%"),
 * el número negativo —en una lista de precios nada cuesta menos que nada, así que
 * un negativo chico es un descuento ("-12,0")— y el entero corto sin decimales
 * dentro de 0 a 100, que es como se escribe un descuento cuando la columna ya se
 * llama "Desc".
 */
function pareceProporcion(texto, num) {
  if (String(texto).includes("%")) return true;
  if (num < 0 && num >= -100) return true;
  return Number.isInteger(num) && num >= 0 && num <= 100 && !/[.,]/.test(String(texto));
}

/** Cuánto "empuja" el encabezado de una columna hacia un campo, de 0 a 1. */
function pistaDelTitulo(titulo, campo) {
  const t = normalizarTitulo(titulo);
  if (!t) return 0;
  const palabras = PISTAS[campo] ?? [];
  let mejor = 0;
  for (const p of palabras) {
    if (t === p) mejor = Math.max(mejor, 1);
    else if (t.startsWith(p) || t.endsWith(p)) mejor = Math.max(mejor, 0.7);
    else if (t.includes(p)) mejor = Math.max(mejor, 0.5);
  }
  return mejor;
}

/**
 * Qué tan bien una columna encaja en cada campo, de 0 a 1.
 *
 * Los pesos están elegidos para que el CONTENIDO pese más que el nombre: una
 * columna que se llama "PRECIO" y tiene texto adentro no gana como precio.
 */
export function puntajesDeColumna({ titulo, perfil }) {
  const p = perfil;
  const pista = (campo) => pistaDelTitulo(titulo, campo);

  const barra = p.barras > 0.8 ? 1 : p.barras;
  const descripcion =
    (p.texto > 0.7 ? 0.7 : p.texto * 0.5) +
    (p.largoMedio > 12 ? 0.2 : 0) +
    (p.distintos > 0.8 ? 0.1 : 0);
  // El código: corto, casi siempre distinto en cada fila, y NO es un precio.
  const codigo =
    (p.distintos > 0.85 ? 0.45 : p.distintos * 0.3) +
    (p.largoMedio <= 12 ? 0.3 : 0) +
    (p.barras > 0.8 ? -0.6 : 0) +
    (p.texto > 0.6 ? -0.2 : 0);
  // El precio: número, con magnitud de plata y variedad. Un entero chico y
  // repetido —como el "6" de la columna de unidades— no es un precio.
  const precio =
    (p.numeros > 0.85 ? 0.5 : p.numeros * 0.3) +
    (p.mediana !== null && p.mediana >= 10 ? 0.25 : -0.3) +
    (p.distintos > 0.3 ? 0.15 : 0) +
    (p.barras > 0.5 ? -0.8 : 0) +
    (p.enteros > 0.95 && p.mediana !== null && p.mediana < 1000 ? -0.3 : 0);
  // La cantidad por bulto: enteros chicos, muy repetidos.
  const cantidad =
    (p.enteros > 0.9 ? 0.4 : 0) +
    (p.mediana !== null && p.mediana >= 1 && p.mediana <= 200 ? 0.3 : -0.4) +
    (p.distintos < 0.4 ? 0.2 : 0) +
    (p.barras > 0.5 ? -0.8 : 0);
  // El descuento: porcentajes, o números chicos muy repetidos.
  const descuento =
    (p.porcentajes > 0.6 ? 0.5 : 0) +
    (p.mediana !== null && p.mediana > 0 && p.mediana <= 60 ? 0.2 : -0.3) +
    (p.distintos < 0.3 ? 0.2 : 0);

  const crudos = {
    [CAMPO.CODIGO_BARRA]: barra,
    [CAMPO.DESCRIPCION]: descripcion,
    [CAMPO.CODIGO]: codigo,
    [CAMPO.PRECIO]: precio,
    [CAMPO.CANTIDAD]: cantidad,
    [CAMPO.DESCUENTO]: descuento,
  };

  const salida = {};
  for (const campo of Object.keys(crudos)) {
    // El título suma hasta un 35 %: desempata entre columnas parecidas y no
    // alcanza para dar vuelta un contenido que no encaja.
    salida[campo] = Math.max(0, Math.min(1, crudos[campo] * 0.75 + pista(campo) * 0.35));
  }
  return salida;
}

/**
 * LA PROPUESTA DE MAPEO para un archivo nuevo.
 *
 * @param columnas  [{ indice, titulo, valores: [] }]
 * @returns {
 *   mapeo: { codigo, codigoBarra, descripcion, cantidad, descuento, precios: [] },
 *   confianza: 0..1,
 *   columnas: [{ indice, titulo, tipo, puntaje, ejemplos }],
 *   motivosDeDuda: []
 * }
 *
 * `precios` es una LISTA y va ordenada de más a menos probable: una lista puede
 * traer cinco columnas de precio y cuál se usa no lo decide este módulo.
 */
export function proponerMapeo(columnas = []) {
  const evaluadas = columnas.map((c) => {
    const perfil = perfilDeColumna(c.valores);
    return { ...c, perfil, puntajes: puntajesDeColumna({ titulo: c.titulo, perfil }) };
  });

  // ── SE ASIGNA POR PUNTAJE, NO POR UN ORDEN DE CAMPOS FIJO ────────────────
  //
  // La primera versión recorría los campos en un orden elegido de antemano y le
  // daba a cada uno su mejor columna libre. Con eso, un campo que pasaba raspando
  // le robaba la columna a otro que la quería mucho más: en la lista de M Y F la
  // columna "Desc%" puntuaba 1,00 como descuento y 0,67 como cantidad por bulto
  // —sus valores, "-12,0", son enteros chicos y repetidos—, y como la cantidad se
  // preguntaba antes, se la llevaba. La lista quedaba sin descuento y con una
  // cantidad por bulto que era el descuento.
  //
  // Ahora se arman todos los pares columna-campo, se ordenan por puntaje y se
  // toma el mejor que tenga las dos puntas libres. Lo inequívoco sigue saliendo
  // primero —un código de barras puntúa 1,00 y nada le compite— sin que haga
  // falta escribirlo en una lista.
  const campos = [CAMPO.CODIGO_BARRA, CAMPO.DESCRIPCION, CAMPO.CANTIDAD, CAMPO.DESCUENTO, CAMPO.CODIGO];
  const tomadas = new Set();
  const mapeo = { codigo: null, codigoBarra: null, descripcion: null, cantidad: null, descuento: null, precios: [] };
  const UMBRAL = 0.45;

  const pares = [];
  for (const c of evaluadas) {
    for (const campo of campos) {
      if (c.puntajes[campo] >= UMBRAL) pares.push({ indice: c.indice, campo, puntaje: c.puntajes[campo] });
    }
  }
  // A igual puntaje decide el orden de `campos`, para que el resultado no dependa
  // de en qué orden vinieron las columnas.
  pares.sort((a, b) => b.puntaje - a.puntaje || campos.indexOf(a.campo) - campos.indexOf(b.campo));

  const camposTomados = new Set();
  for (const p of pares) {
    if (tomadas.has(p.indice) || camposTomados.has(p.campo)) continue;
    tomadas.add(p.indice);
    camposTomados.add(p.campo);
    if (p.campo === CAMPO.CODIGO_BARRA) mapeo.codigoBarra = p.indice;
    else if (p.campo === CAMPO.DESCRIPCION) mapeo.descripcion = p.indice;
    else if (p.campo === CAMPO.CANTIDAD) mapeo.cantidad = p.indice;
    else if (p.campo === CAMPO.DESCUENTO) mapeo.descuento = p.indice;
    else if (p.campo === CAMPO.CODIGO) mapeo.codigo = p.indice;
  }

  // Los precios: TODAS las que llegan al umbral, de mayor a menor puntaje.
  mapeo.precios = evaluadas
    .filter((c) => !tomadas.has(c.indice) && c.puntajes[CAMPO.PRECIO] >= UMBRAL)
    .sort((a, b) => b.puntajes[CAMPO.PRECIO] - a.puntajes[CAMPO.PRECIO])
    .map((c) => c.indice);

  // ── SIN CÓDIGO PROPIO, EL DE BARRAS HACE DE CÓDIGO ───────────────────────
  //
  // Hay listas con código de barras y nada más. Dejar `codigo` en null las haría
  // ilegibles, y el de barras identifica igual de bien.
  if (mapeo.codigo === null && mapeo.codigoBarra !== null) {
    mapeo.codigo = mapeo.codigoBarra;
  }

  const motivosDeDuda = [];
  if (mapeo.codigo === null) motivosDeDuda.push("No se encontró una columna que parezca el código del producto.");
  if (mapeo.descripcion === null) motivosDeDuda.push("No se encontró una columna que parezca la descripción.");
  if (mapeo.precios.length === 0) motivosDeDuda.push("No se encontró ninguna columna que parezca un precio.");

  // La confianza es el promedio de los puntajes de lo que se asignó, castigado
  // por cada campo esencial que falta. Se informa para que la pantalla pueda
  // decir "revisá esto" en vez de presentar una propuesta floja como si fuera
  // segura.
  const asignados = [];
  const puntajeDe = (indice, campo) => evaluadas.find((c) => c.indice === indice)?.puntajes[campo] ?? 0;
  if (mapeo.codigo !== null) asignados.push(puntajeDe(mapeo.codigo, CAMPO.CODIGO));
  if (mapeo.descripcion !== null) asignados.push(puntajeDe(mapeo.descripcion, CAMPO.DESCRIPCION));
  for (const p of mapeo.precios) asignados.push(puntajeDe(p, CAMPO.PRECIO));
  const base = asignados.length ? asignados.reduce((a, b) => a + b, 0) / asignados.length : 0;
  const confianza = Math.max(0, base - motivosDeDuda.length * 0.3);

  return {
    mapeo,
    confianza,
    motivosDeDuda,
    columnas: evaluadas.map((c) => ({
      indice: c.indice,
      titulo: c.titulo,
      tipo: tipoAsignado(c.indice, mapeo),
      puntaje: Math.max(...Object.values(c.puntajes)),
      ejemplos: c.valores.filter((v) => String(v ?? "").trim() !== "").slice(0, 3),
    })),
  };
}

function tipoAsignado(indice, mapeo) {
  if (mapeo.codigoBarra === indice) return CAMPO.CODIGO_BARRA;
  if (mapeo.codigo === indice) return CAMPO.CODIGO;
  if (mapeo.descripcion === indice) return CAMPO.DESCRIPCION;
  if (mapeo.cantidad === indice) return CAMPO.CANTIDAD;
  if (mapeo.descuento === indice) return CAMPO.DESCUENTO;
  if (mapeo.precios.includes(indice)) return CAMPO.PRECIO;
  return null;
}

/** ¿Este texto parece el título de una columna y no un dato? */
export function pareceTituloDeColumna(texto) {
  const t = String(texto ?? "").trim();
  if (t === "" || t.length > 30) return false;
  if (pareceNumero(t) && cantidadDeLista(t) === null) return false;
  const n = normalizarTitulo(t);
  if (!n) return false;
  for (const palabras of Object.values(PISTAS)) {
    for (const p of palabras) {
      if (n === p || n.startsWith(p) || n.endsWith(p)) return true;
    }
  }
  return false;
}
