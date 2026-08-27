// EL ÚNICO MOTOR DE CANDIDATOS DE PROVEEDOR.
//
// Lo consumen Listas de precios y Facturas. No hay un macheador por módulo: eso
// es exactamente lo que garantiza que dentro de tres meses uno de los dos
// proponga algo que el otro no, y que nadie se entere hasta ver un costo mal
// aplicado.
//
// ── EL ORDEN DE PRIORIDAD, Y POR QUÉ ES ESE ────────────────────────────────
//
//   1. CÓDIGO EXACTO confirmado para ese proveedor.
//   2. ALIAS EXACTO confirmado para ese proveedor.
//   3. NOMBRE NORMALIZADO EXACTO.
//   4. APROXIMADO con ranking semántico.
//   5. Búsqueda manual — que no es un escalón del motor sino su ausencia.
//
// Los tres primeros no interpretan nada: o el texto coincide o no. El cuarto sí
// interpreta, y por eso es el único que puede quedar por debajo del umbral y
// pedir confirmación.
//
// ── POR QUÉ EL RANKING PESA POR PAPEL Y NO POR PALABRA ─────────────────────
//
// Medido sobre el caso que lo motivó, con el motor anterior:
//
//   texto leído: "MARLBIRO 10 ROJO"
//   MARLBORO 10    → comparte "10"            → 2 puntos
//   CAMEL 10 ROJO  → comparte "10" y "rojo"   → 4 puntos  ← ganaba
//
// Sumar palabras iguales hace que una marca equivocada valga lo mismo que una
// variante que falta. Acá una marca distinta es una CONTRADICCIÓN y pesa en
// contra; que al candidato le falte un modificador apenas descuenta.
//
// ── LO QUE ESTE MÓDULO NO HACE ────────────────────────────────────────────
//
// No escribe. No sabe de Prisma. No decide si un vínculo se guarda: eso es de
// `servicioIdentidad`. Acá solo se ordenan candidatos y se dice por qué.

import { levenshtein, normalizarTexto } from "@/lib/productos/busquedaFuzzyProducto";
import { normalizarCodigo } from "@/lib/proveedores/listas/normalizarCodigo";
import { PAPEL, tokenizarProducto } from "./tokensDeProducto.js";

/** Por qué este candidato está donde está. Se muestra en pantalla. */
export const MOTIVO_CANDIDATO = Object.freeze({
  CODIGO_EXACTO: "CODIGO_EXACTO",
  ALIAS_CONFIRMADO: "ALIAS_CONFIRMADO",
  NOMBRE_EXACTO: "NOMBRE_EXACTO",
  APROXIMADO: "APROXIMADO",
});

export const TEXTO_MOTIVO_CANDIDATO = Object.freeze({
  [MOTIVO_CANDIDATO.CODIGO_EXACTO]: "Código exacto",
  [MOTIVO_CANDIDATO.ALIAS_CONFIRMADO]: "Alias confirmado del proveedor",
  [MOTIVO_CANDIDATO.NOMBRE_EXACTO]: "Nombre exacto",
  [MOTIVO_CANDIDATO.APROXIMADO]: "Sugerencia por marca y presentación",
});

// ── LOS PESOS ──────────────────────────────────────────────────────────────
//
// Son relativos entre sí y ese orden es la regla; los valores concretos salen de
// que la marca tenga que poder GANARLE sola a un número más una variante, que es
// el caso "MARLBORO 10" contra "CAMEL 10 ROJO".
//
// La asimetría entre FALTA y CONTRADICE es lo importante: que al candidato le
// falte "rojo" apenas descuenta, porque el papel puede no nombrarlo. Que diga
// otro número es otra cosa: los dos hablaron del mismo campo y dijeron distinto.
export const PESO = Object.freeze({
  MARCA_IGUAL: 100,
  MARCA_PARECIDA: 85,
  MARCA_DISTINTA: -120,
  NUMERO_IGUAL: 30,
  NUMERO_CONTRADICE: -60,
  NUMERO_FALTA: -4,
  PRESENTACION_IGUAL: 20,
  PRESENTACION_CONTRADICE: -40,
  PRESENTACION_FALTA: -3,
  VARIANTE_IGUAL: 10,
  VARIANTE_FALTA: -3,
  VARIANTE_SOBRA: -2,
  GENERICO_IGUAL: 1,
});

/**
 * Cuánto puede errarle el OCR a una marca y que igual sea la misma.
 *
 * Proporcional al largo y con techo: "marlbiro" contra "marlboro" es una letra
 * sobre ocho y pasa; "camel" contra "marlboro" no pasa por ningún lado.
 */
export function distanciaToleradaDeMarca(a, b) {
  const corto = Math.min(String(a || "").length, String(b || "").length);
  if (corto < 4) return 0;
  return Math.min(2, Math.floor(corto / 5));
}

/** ¿Estas dos marcas son la misma, tolerando un error de lectura? */
export function marcasCoinciden(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const tolerancia = distanciaToleradaDeMarca(a, b);
  if (tolerancia <= 0) return false;
  return levenshtein(a, b, tolerancia) <= tolerancia;
}

/**
 * Puntaje semántico entre el texto del papel y el nombre de un candidato.
 *
 * MAYOR ES MEJOR — al revés que los rankeadores viejos, que usaban distancia.
 * Se dice acá porque mezclarlos es un error fácil y silencioso.
 *
 * @returns {{ puntaje: number, contradice: boolean, detalle: object }}
 */
export function puntuarCandidato(textoLeido, nombreCandidato) {
  const leido = tokenizarProducto(textoLeido);
  const cand = tokenizarProducto(nombreCandidato);

  let puntaje = 0;
  let contradice = false;
  const detalle = { marca: null, numeros: null, presentaciones: null, variantes: null };

  // ── MARCA ────────────────────────────────────────────────────────────────
  if (leido.marca && cand.marca) {
    if (leido.marca === cand.marca) {
      puntaje += PESO.MARCA_IGUAL;
      detalle.marca = "IGUAL";
    } else if (marcasCoinciden(leido.marca, cand.marca)) {
      puntaje += PESO.MARCA_PARECIDA;
      detalle.marca = "PARECIDA";
    } else {
      puntaje += PESO.MARCA_DISTINTA;
      contradice = true;
      detalle.marca = "DISTINTA";
    }
  } else {
    detalle.marca = "SIN_MARCA";
  }

  // ── NÚMEROS ──────────────────────────────────────────────────────────────
  //
  // Un número que está en los dos y coincide suma. Uno que está en los dos
  // campos pero con valor distinto CONTRADICE. Uno que solo está de un lado
  // apenas descuenta: el papel puede no repetir el gramaje.
  const numLeido = new Set(leido.numeros);
  const numCand = new Set(cand.numeros);
  let numerosIguales = 0;
  for (const n of numLeido) if (numCand.has(n)) numerosIguales++;
  puntaje += numerosIguales * PESO.NUMERO_IGUAL;
  const faltanNumeros = [...numLeido].filter((n) => !numCand.has(n));
  // Hay contradicción cuando los DOS traen números y ninguno coincide: hablaron
  // del mismo campo y dijeron cosas distintas. Si uno no trae ninguno, no
  // contradice — calla.
  if (numLeido.size > 0 && numCand.size > 0 && numerosIguales === 0) {
    puntaje += PESO.NUMERO_CONTRADICE;
    contradice = true;
    detalle.numeros = "CONTRADICE";
  } else {
    puntaje += faltanNumeros.length * PESO.NUMERO_FALTA;
    detalle.numeros = numerosIguales > 0 ? "IGUAL" : "AUSENTE";
  }

  // ── PRESENTACIÓN ─────────────────────────────────────────────────────────
  const preLeido = new Set(leido.presentaciones);
  const preCand = new Set(cand.presentaciones);
  let presIguales = 0;
  for (const p of preLeido) if (preCand.has(p)) presIguales++;
  puntaje += presIguales * PESO.PRESENTACION_IGUAL;
  if (preLeido.size > 0 && preCand.size > 0 && presIguales === 0) {
    puntaje += PESO.PRESENTACION_CONTRADICE;
    contradice = true;
    detalle.presentaciones = "CONTRADICE";
  } else {
    puntaje += (preLeido.size - presIguales) * PESO.PRESENTACION_FALTA;
    detalle.presentaciones = presIguales > 0 ? "IGUAL" : "AUSENTE";
  }

  // ── VARIANTE ─────────────────────────────────────────────────────────────
  //
  // La variante NUNCA contradice. "rojo" contra "blue" puede ser el mismo
  // producto nombrado distinto por el proveedor, y castigarlo como una marca
  // equivocada haría perder el candidato correcto.
  const varLeido = new Set(leido.variantes);
  const varCand = new Set(cand.variantes);
  let varIguales = 0;
  for (const v of varLeido) if (varCand.has(v)) varIguales++;
  puntaje += varIguales * PESO.VARIANTE_IGUAL;
  puntaje += (varLeido.size - varIguales) * PESO.VARIANTE_FALTA;
  puntaje += Math.max(0, varCand.size - varIguales) * PESO.VARIANTE_SOBRA;
  detalle.variantes = varIguales > 0 ? "IGUAL" : varLeido.size ? "FALTA" : "SIN_VARIANTE";

  // ── GENÉRICOS ────────────────────────────────────────────────────────────
  const genCand = new Set(cand.genericos);
  for (const g of leido.genericos) if (genCand.has(g)) puntaje += PESO.GENERICO_IGUAL;

  return { puntaje, contradice, detalle };
}

// ── UMBRALES DEL VÍNCULO AUTOMÁTICO ────────────────────────────────────────
//
// Tres condiciones, y las tres tienen que darse. Cada una tapa un agujero
// distinto: el puntaje tapa "se parece poco a todo", el margen tapa "se parece
// igual a dos", y la contradicción tapa "se parece mucho pero dice otra marca".
export const UMBRAL_AUTOMATICO = Object.freeze({
  /** Con la marca parecida y el número igual ya se llega: 85 + 30 − 3 = 112. */
  PUNTAJE_MINIMO: 100,
  /** Cuánto tiene que sacarle al segundo. Menos que esto es un empate. */
  MARGEN_MINIMO: 40,
});

/**
 * Los candidatos ordenados, con su motivo y si alguno alcanza para vincular solo.
 *
 * @param textoLeido        la descripción tal como vino del papel
 * @param codigoLeido       el código del papel, si trae
 * @param vinculos          filas de ProductoCodigoProveedor de ESTE proveedor
 * @param productos         catálogo candidato (ya acotado por quien llama)
 * @param obtenerNombre     cómo sacarle el nombre a un producto
 * @param obtenerId         cómo sacarle el id de ProductoBase a un producto
 */
export function buscarCandidatosDeProveedor({
  textoLeido = "",
  codigoLeido = null,
  vinculos = [],
  productos = [],
  obtenerNombre = (p) => p?.nombre ?? "",
  obtenerId = (p) => p?.productoBaseId ?? p?.baseId ?? p?.id ?? null,
} = {}) {
  const porBase = new Map();
  for (const p of productos) {
    const id = Number(obtenerId(p));
    if (Number.isInteger(id) && !porBase.has(id)) porBase.set(id, p);
  }
  const activos = vinculos.filter((v) => v?.activo !== false);

  // ── 1. CÓDIGO EXACTO ─────────────────────────────────────────────────────
  const codigo = normalizarCodigo(codigoLeido);
  if (codigo) {
    const porCodigo = unoPorProducto(
      activos.filter((v) => normalizarCodigo(v?.codigoInterno) === codigo)
    );
    if (porCodigo.length === 1) {
      return resultado({
        motivo: MOTIVO_CANDIDATO.CODIGO_EXACTO,
        vinculo: porCodigo[0],
        porBase,
        obtenerNombre,
        automatico: true,
      });
    }
    if (porCodigo.length > 1) {
      return ambiguo(porCodigo, porBase, obtenerNombre, MOTIVO_CANDIDATO.CODIGO_EXACTO);
    }
  }

  // ── 2. ALIAS EXACTO ──────────────────────────────────────────────────────
  //
  // El alias se compara NORMALIZADO de los dos lados. Guardarlo crudo y
  // compararlo crudo haría que un espacio de más lo pierda.
  const textoNorm = normalizarTexto(textoLeido);
  if (textoNorm) {
    const porAlias = unoPorProducto(
      activos.filter((v) => normalizarTexto(v?.descripcionProveedor) === textoNorm)
    );
    if (porAlias.length === 1) {
      return resultado({
        motivo: MOTIVO_CANDIDATO.ALIAS_CONFIRMADO,
        vinculo: porAlias[0],
        porBase,
        obtenerNombre,
        automatico: true,
      });
    }
    if (porAlias.length > 1) {
      return ambiguo(porAlias, porBase, obtenerNombre, MOTIVO_CANDIDATO.ALIAS_CONFIRMADO);
    }
  }

  // ── 3. NOMBRE NORMALIZADO EXACTO ─────────────────────────────────────────
  if (textoNorm) {
    const exactos = productos.filter((p) => normalizarTexto(obtenerNombre(p)) === textoNorm);
    if (exactos.length === 1) {
      const id = Number(obtenerId(exactos[0]));
      return {
        motivo: MOTIVO_CANDIDATO.NOMBRE_EXACTO,
        texto: TEXTO_MOTIVO_CANDIDATO[MOTIVO_CANDIDATO.NOMBRE_EXACTO],
        automatico: true,
        requiereConfirmacion: false,
        candidatos: [{ productoBaseId: id, nombre: obtenerNombre(exactos[0]), puntaje: null, motivo: MOTIVO_CANDIDATO.NOMBRE_EXACTO }],
        elegido: { productoBaseId: id, vinculo: null },
      };
    }
  }

  // ── 4. APROXIMADO ────────────────────────────────────────────────────────
  const puntuados = [];
  for (const p of productos) {
    const id = Number(obtenerId(p));
    if (!Number.isInteger(id)) continue;
    const nombre = obtenerNombre(p);
    const { puntaje, contradice, detalle } = puntuarCandidato(textoLeido, nombre);
    puntuados.push({ productoBaseId: id, nombre, puntaje, contradice, detalle, motivo: MOTIVO_CANDIDATO.APROXIMADO });
  }
  // A igual puntaje gana el nombre más corto: el que no agrega palabras que el
  // papel no dijo es el más probable. Es el mismo criterio que ya usaba
  // `rankearPorPalabras`, y se conserva para no cambiar dos cosas a la vez.
  puntuados.sort((a, b) => b.puntaje - a.puntaje || a.nombre.length - b.nombre.length);

  const mejor = puntuados[0] ?? null;
  const segundo = puntuados[1] ?? null;
  const margen = mejor && segundo ? mejor.puntaje - segundo.puntaje : Infinity;
  const alcanza =
    Boolean(mejor) &&
    mejor.puntaje >= UMBRAL_AUTOMATICO.PUNTAJE_MINIMO &&
    margen >= UMBRAL_AUTOMATICO.MARGEN_MINIMO &&
    mejor.contradice !== true;

  return {
    motivo: MOTIVO_CANDIDATO.APROXIMADO,
    texto: TEXTO_MOTIVO_CANDIDATO[MOTIVO_CANDIDATO.APROXIMADO],
    automatico: alcanza,
    requiereConfirmacion: !alcanza,
    margen: Number.isFinite(margen) ? margen : null,
    candidatos: puntuados,
    elegido: alcanza ? { productoBaseId: mejor.productoBaseId, vinculo: null } : null,
  };
}

/** Un vínculo por producto: dos códigos del mismo producto no son ambigüedad. */
function unoPorProducto(vinculos) {
  const vistos = new Set();
  const salida = [];
  for (const v of vinculos) {
    const id = v?.productoBaseId;
    if (id === null || id === undefined || vistos.has(id)) continue;
    vistos.add(id);
    salida.push(v);
  }
  return salida;
}

function resultado({ motivo, vinculo, porBase, obtenerNombre, automatico }) {
  const id = Number(vinculo.productoBaseId);
  const producto = porBase.get(id) ?? null;
  return {
    motivo,
    texto: TEXTO_MOTIVO_CANDIDATO[motivo],
    automatico,
    requiereConfirmacion: !automatico,
    candidatos: [{
      productoBaseId: id,
      nombre: producto ? obtenerNombre(producto) : null,
      puntaje: null,
      motivo,
    }],
    elegido: { productoBaseId: id, vinculo },
  };
}

function ambiguo(vinculos, porBase, obtenerNombre, motivo) {
  return {
    motivo,
    texto: TEXTO_MOTIVO_CANDIDATO[motivo],
    automatico: false,
    requiereConfirmacion: true,
    ambigua: true,
    candidatos: vinculos.map((v) => {
      const id = Number(v.productoBaseId);
      const producto = porBase.get(id) ?? null;
      return { productoBaseId: id, nombre: producto ? obtenerNombre(producto) : null, puntaje: null, motivo };
    }),
    elegido: null,
  };
}
