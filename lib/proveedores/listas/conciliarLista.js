// lib/proveedores/listas/conciliarLista.js
//
// MOTOR DE CONCILIACIÓN DE LISTAS DE PROVEEDOR.
//
// Recibe filas ya parseadas, los productos del ERP ya cargados y la
// configuración comercial del proveedor, y devuelve qué habría que hacer con
// cada fila. Función pura: no toca Prisma, no lee la sesión, no escribe ningún
// precio y no tiene efectos.
//
// ── QUÉ ES GENERAL Y QUÉ ES DEL PROVEEDOR ───────────────────────────────────
//
// Este archivo no menciona a Arcor, ni el 5 %, ni "Precio C/IVA", ni UN/DI/BU.
// Todo eso vive en `configuraciones/arcor.js`. El motor sabe:
//   · cómo machear un código contra el ERP;
//   · cómo aplicar un recargo y comparar contra el costo actual;
//   · qué hace que una fila no se pueda aplicar;
//   · cómo se arma el resumen.
// La traducción de la unidad comercial al costo maestro se la PIDE a la
// configuración. Un proveedor nuevo es un archivo de configuración nuevo.
//
// Tampoco importa el parser: recibe filas normalizadas. Así el mismo motor sirve
// para un Excel, un CSV o un pegado a mano.
//
// ── LO QUE NO HACE, A PROPÓSITO ─────────────────────────────────────────────
//
// No crea vínculos de código, no aplica precios, no toca overrides de local, no
// machea por nombre y no confirma sugerencias. Conciliar es decidir; aplicar es
// otra etapa.

import {
  MOTIVO_BLOQUEO,
  ERROR_COSTO,
  aCentavos,
  desdeCentavos,
  round2,
  mismoCosto,
  requiereConversionABulto,
  factorValido,
  bloqueoPorUnidad,
  aplicarRecargo,
  calcularVariacion,
} from "./calculoCosto.js";
import { ESTADO_LINEA, clasificarLinea, esAplicable, resumirEstados } from "./estados.js";
// Las hipótesis de lectura del precio y cuál se recomienda, con LA MISMA función
// que arma las tarjetas del panel. Si el motor recomendara con una regla propia,
// la cola de pendientes y la fila abierta dirían cosas distintas del mismo caso.
import { analizarFila } from "./confirmarPresentacion.js";
// De dónde sale el rango de una fila: el congelado si la confirmación está
// vigente, después el de la cabecera, después el default. El 10-20 no se escribe
// acá ni en ningún otro lado.
import { rangoDeLaFila } from "./vigenciaConfirmacion.js";
// El normalizador de texto del ERP, no uno propio: si la comparación de nombres
// usara otras reglas que el buscador de productos, dos pantallas dirían cosas
// distintas del mismo par de nombres.
import { normalizarTexto } from "../../productos/busquedaFuzzyProducto.js";
import {
  clavesDeCodigo,
  esCodigoNumerico,
  sufijoNumerico,
  longitudesAplicables,
  tipoSufijo,
  LONGITUDES_SUFIJO,
  MIN_DIGITOS_SUFIJO,
} from "./normalizarCodigo.js";

/** Cómo se encontró el producto de una fila. */
export const TIPO_COINCIDENCIA = {
  CODIGO_INTERNO: "CODIGO_INTERNO",
  CODIGO_INTERNO_SIN_CEROS: "CODIGO_INTERNO_SIN_CEROS",
  /// Fallback por terminación numérica. El número dice con cuántos dígitos se
  /// resolvió: cuantos más, más fuerte la coincidencia.
  SUFIJO_8: "SUFIJO_8",
  SUFIJO_7: "SUFIJO_7",
  SUFIJO_6: "SUFIJO_6",
  SUFIJO_5: "SUFIJO_5",
  SUFIJO_4: "SUFIJO_4",
  /// Último camino que MACHEA. Solo dentro del universo del proveedor: dos
  /// productos del catálogo pueden compartir código de barras, pero que los dos
  /// sean además de este proveedor es otra cosa —y si pasa, queda ambigua—.
  CODIGO_BARRA: "CODIGO_BARRA",
  AMBIGUA: "AMBIGUA",
  NINGUNA: "NINGUNA",
};

/** ¿Este tipo de coincidencia salió del fallback por sufijo? */
export function esCoincidenciaPorSufijo(tipo) {
  return typeof tipo === "string" && tipo.startsWith("SUFIJO_");
}

/** Cuántos dígitos usó una coincidencia por sufijo. null si no fue por sufijo. */
export function digitosDeSufijo(tipo) {
  if (!esCoincidenciaPorSufijo(tipo)) return null;
  const n = Number(tipo.slice("SUFIJO_".length));
  return Number.isInteger(n) ? n : null;
}

/** Motivos que decide el motor, no el proveedor. */
export const MOTIVO_CONCILIACION = {
  SIN_CODIGO: "SIN_CODIGO",
  SIN_VINCULO: "SIN_VINCULO",
  VINCULO_AMBIGUO: "VINCULO_AMBIGUO",
  SIN_PROPIEDAD_COSTO: "SIN_PROPIEDAD_COSTO",
  PRODUCTO_COMBO: "PRODUCTO_COMBO",
  PRECIO_CERO: "PRECIO_CERO",
  PRECIO_NO_CREIBLE: "PRECIO_NO_CREIBLE",
  PRECIO_INVALIDO: "PRECIO_INVALIDO",
  /** Metadato de una fila NO_MACHEADA, nunca un estado. */
  SUGERENCIA_CODIGO_BARRAS: "SUGERENCIA_CODIGO_BARRAS",
  /** Sugerencia por parecido de nombre. NUNCA machea: solo propone. */
  SUGERENCIA_NOMBRE: "SUGERENCIA_NOMBRE",
};

export const TEXTO_MOTIVO = {
  SIN_CODIGO: "La fila no trae un código utilizable.",
  SIN_VINCULO: "El código no está vinculado a ningún producto de este proveedor.",
  VINCULO_AMBIGUO: "El código apunta a más de un producto. Hay que desambiguar a mano.",
  SIN_PROPIEDAD_COSTO:
    "El costo de este producto lo administra otra ubicación. Desde acá no se puede modificar.",
  PRODUCTO_COMBO: "Los combos no tienen costo propio que actualizar.",
  PRECIO_CERO: "El proveedor informa precio 0. No se aplica automáticamente.",
  PRECIO_NO_CREIBLE:
    "El precio informado es prácticamente cero. Casi seguro es un error del archivo.",
  PRECIO_INVALIDO: "El precio informado no es un número válido.",
  SUGERENCIA_CODIGO_BARRAS:
    "Hay un producto con el mismo código de barras. Confirmá el vínculo antes de aplicar.",
};

// ── Índices ──────────────────────────────────────────────────────────────────

/**
 * Índice de los códigos internos del proveedor.
 *
 * Espeja `ProductoCodigoProveedor`: el llamador ya filtró por grupo y proveedor,
 * porque esa combinación es la clave única de la tabla y no tiene sentido
 * repetir el filtro acá.
 *
 * Los códigos INACTIVOS se indexan aparte: no machean —un vínculo dado de baja
 * no debe volver a aplicar precios— pero tampoco cuentan como faltantes.
 */
export function indexarCodigosProveedor(codigos = []) {
  const exacto = new Map();
  const sinCeros = new Map();
  const inactivos = new Map();
  // Un mapa por longitud: { 8 => Map<sufijo, items>, 7 => ..., 4 => ... }.
  // Solo entran vínculos ACTIVOS y códigos completamente numéricos. Un vínculo
  // dado de baja no puede reaparecer por la puerta de atrás del fallback.
  const sufijos = new Map(LONGITUDES_SUFIJO.map((n) => [n, new Map()]));

  for (const c of codigos) {
    const { normalizado, sinCeros: sc } = clavesDeCodigo(c?.codigoInterno);
    if (!normalizado) continue;
    const activo = c?.activo !== false;
    const destino = activo ? exacto : inactivos;

    if (!destino.has(normalizado)) destino.set(normalizado, []);
    destino.get(normalizado).push(c);

    if (activo && sc) {
      if (!sinCeros.has(sc)) sinCeros.set(sc, []);
      sinCeros.get(sc).push(c);
    }

    if (activo && esCodigoNumerico(normalizado)) {
      for (const largo of LONGITUDES_SUFIJO) {
        const suf = sufijoNumerico(normalizado, largo);
        if (!suf) continue; // el código tiene menos dígitos que esta longitud
        const mapa = sufijos.get(largo);
        if (!mapa.has(suf)) mapa.set(suf, []);
        mapa.get(suf).push(c);
      }
    }
  }
  return { exacto, sinCeros, inactivos, sufijos };
}

/**
 * Índice de códigos de barras del ERP.
 *
 * Solo para SUGERIR. Un código de barras compartido entre dos productos no
 * sugiere nada: se descarta por ambiguo.
 */
export function indexarCodigosBarra(productos = []) {
  const porBarra = new Map();
  for (const p of productos) {
    for (const b of p?.codigosBarra ?? []) {
      const { normalizado } = clavesDeCodigo(b);
      if (!normalizado) continue;
      if (!porBarra.has(normalizado)) porBarra.set(normalizado, []);
      porBarra.get(normalizado).push(p);
    }
  }
  return porBarra;
}

// ── Macheo ───────────────────────────────────────────────────────────────────

/**
 * UN CANDIDATO POR PRODUCTO.
 *
 * AMBIGUA significa "no sé a qué producto corresponde". Dos vínculos que apuntan
 * al MISMO producto no son eso: se sabe perfectamente a cuál se le escribe el
 * costo, solo que el proveedor lo nombra de dos formas.
 *
 * Antes se deduplicaba con `new Set` sobre los vínculos, que compara por objeto,
 * así que dos códigos del mismo producto contaban como dos candidatos y la fila
 * caía en AMBIGUA sin serlo. Un caso real: `1002631` y `2631`, los dos MOGUL
 * DIENTES 500G — el ERP guarda el código con un prefijo y el proveedor lo informa
 * sin él.
 *
 * Se volvió urgente al empezar a guardar el macheo de las filas aplicadas: es
 * justo eso lo que fabrica pares de códigos para un mismo producto, así que el
 * error de conteo se iba a multiplicar solo.
 *
 * Se conserva el PRIMERO de cada producto. Cuál se conserve no cambia nada: el
 * motor usa `candidatos[0].productoBaseId`, y todos los descartados tienen ese
 * mismo id.
 */
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

/**
 * Busca el producto de una fila.
 *
 * PRIORIDAD, y el orden importa:
 *   1. código interno exacto normalizado;
 *   2. fallback sin ceros iniciales, SOLO si el exacto no encontró nada;
 *   3. fallback por sufijo numérico, de 8 dígitos a 4, deteniéndose en la
 *      primera longitud que encuentre algo;
 *   4. código de barras — que NO machea, solo sugiere;
 *   5. nombre — no se implementa. Genera falsos positivos que nadie revisa.
 *
 * Cualquiera de los caminos que dé más de un PRODUCTO devuelve AMBIGUA con todos
 * los candidatos. Elegir uno sería adivinar a qué producto se le cambia el costo.
 * En el fallback por sufijo la ambigüedad además CORTA la escalera: no se baja a
 * menos dígitos buscando un empate más flojo.
 */
export function macheePorCodigo(indice, fila) {
  const claves = clavesDeCodigo(fila?.codigoNormalizado ?? fila?.codigoCrudo);
  if (!claves.normalizado) {
    return { tipo: TIPO_COINCIDENCIA.NINGUNA, candidatos: [], claves };
  }

  const exacto = unoPorProducto(indice.exacto.get(claves.normalizado) ?? []);
  if (exacto.length === 1) {
    return { tipo: TIPO_COINCIDENCIA.CODIGO_INTERNO, candidatos: exacto, claves };
  }
  if (exacto.length > 1) {
    return { tipo: TIPO_COINCIDENCIA.AMBIGUA, candidatos: exacto, claves };
  }

  // Fallback: la lista perdió los ceros al pasar por Excel, o el ERP los tiene y
  // la lista no. Se prueba con la forma sin ceros de los dos lados.
  const clave = fila?.codigoComparableSinCeros || claves.sinCeros || claves.normalizado;
  const porSinCeros = [
    ...(indice.sinCeros.get(clave) ?? []),
    ...(claves.sinCeros ? indice.exacto.get(claves.sinCeros) ?? [] : []),
  ];
  const unicos = unoPorProducto(porSinCeros);
  if (unicos.length === 1) {
    return { tipo: TIPO_COINCIDENCIA.CODIGO_INTERNO_SIN_CEROS, candidatos: unicos, claves };
  }
  if (unicos.length > 1) {
    return { tipo: TIPO_COINCIDENCIA.AMBIGUA, candidatos: unicos, claves };
  }

  // ── Escalera de sufijos ──────────────────────────────────────────────────
  //
  // Solo para códigos completamente numéricos y de al menos 4 dígitos. Se baja
  // de 8 a 4 y se corta en la PRIMERA longitud que devuelve algo: si devolvió
  // uno, es el match; si devolvió varios, es ambigua y no se sigue bajando.
  return macheePorSufijo(indice, claves);
}

/**
 * El fallback por terminación numérica. Separado para poder leerlo y probarlo
 * solo, porque es la parte que más fácil se vuelve peligrosa si se toca.
 */
export function macheePorSufijo(indice, claves) {
  const codigo = claves?.normalizado ?? "";
  const largos = longitudesAplicables(codigo);
  if (largos.length === 0) {
    return { tipo: TIPO_COINCIDENCIA.NINGUNA, candidatos: [], claves };
  }

  for (const largo of largos) {
    const suf = sufijoNumerico(codigo, largo);
    if (!suf) continue;
    const encontrados = indice?.sufijos?.get(largo)?.get(suf) ?? [];
    if (encontrados.length === 0) continue;

    const unicos = unoPorProducto(encontrados);
    if (unicos.length === 1) {
      return {
        tipo: tipoSufijo(largo),
        candidatos: unicos,
        claves,
        sufijoDigitos: largo,
        sufijo: suf,
      };
    }
    // Más de uno: se informa y se CORTA. Bajar a menos dígitos solo agrandaría
    // el empate.
    return {
      tipo: TIPO_COINCIDENCIA.AMBIGUA,
      candidatos: unicos,
      claves,
      sufijoDigitos: largo,
      sufijo: suf,
    };
  }

  return { tipo: TIPO_COINCIDENCIA.NINGUNA, candidatos: [], claves };
}

/**
 * Coincidencia por CÓDIGO DE BARRAS, dentro del universo del proveedor.
 *
 * Antes esto era solo una sugerencia, y con razón: el catálogo entero entraba
 * como candidato y un código de barras compartido podía apuntar a cualquier
 * producto. Ahora los candidatos son únicamente los productos que se le compran
 * a este proveedor, así que una coincidencia acá es una afirmación mucho más
 * fuerte y alcanza para vincular.
 *
 * Igual que en los demás caminos: más de un candidato es AMBIGUA, no un sorteo.
 */
export function macheePorCodigoBarra(indiceBarra, fila) {
  const { normalizado } = clavesDeCodigo(fila?.codigoBarraProveedor);
  if (!normalizado) return { tipo: TIPO_COINCIDENCIA.NINGUNA, candidatos: [] };
  // Mismo criterio que en los códigos internos: un producto que tiene el mismo
  // código de barras cargado dos veces —el global y el propio de la ubicación,
  // por ejemplo— no vuelve ambigua a la fila.
  const candidatos = unoPorProducto(indiceBarra.get(normalizado) ?? []);
  if (candidatos.length === 1) {
    return { tipo: TIPO_COINCIDENCIA.CODIGO_BARRA, candidatos, codigoBarra: normalizado };
  }
  if (candidatos.length > 1) {
    return { tipo: TIPO_COINCIDENCIA.AMBIGUA, candidatos, codigoBarra: normalizado };
  }
  return { tipo: TIPO_COINCIDENCIA.NINGUNA, candidatos: [] };
}

// ── Sugerencia por nombre ───────────────────────────────────────────────────

/** Umbral de parecido. Por debajo no se sugiere nada. */
export const MIN_PARECIDO_NOMBRE = 0.6;

/**
 * Parecido entre dos nombres, por palabras compartidas.
 *
 * Jaccard sobre los tokens normalizados: cuántas palabras comparten sobre el
 * total de palabras distintas. Se eligió esto y no una distancia de edición
 * porque los nombres de lista y de ERP difieren en ORDEN y en agregados
 * —"PURE LA HUERTA 530G X12" contra "Pure la huerta 530g"— más que en letras.
 *
 * Devuelve 0 cuando alguno queda sin tokens.
 */
export function parecidoNombre(a, b) {
  const ta = new Set(normalizarTexto(a).split(/\s+/).filter((t) => t.length >= 2));
  const tb = new Set(normalizarTexto(b).split(/\s+/).filter((t) => t.length >= 2));
  if (ta.size === 0 || tb.size === 0) return 0;
  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes++;
  const union = ta.size + tb.size - comunes;
  return union === 0 ? 0 : comunes / union;
}

/**
 * Sugerencia por nombre. NO MACHEA NUNCA: es lo último y lo más flojo.
 *
 * Se exige un ganador único y con margen: si el segundo mejor está igual de
 * cerca, no se sugiere nada. Un nombre parecido es una pista para que una
 * persona mire, jamás una razón para mover un costo.
 */
export function sugerirPorNombre(productos, fila) {
  const descripcion = fila?.descripcionProveedor ?? "";
  if (!descripcion) return null;

  let mejor = null;
  let mejorScore = 0;
  let segundoScore = 0;

  for (const p of productos) {
    const score = parecidoNombre(descripcion, p?.nombre);
    if (score > mejorScore) {
      segundoScore = mejorScore;
      mejorScore = score;
      mejor = p;
    } else if (score > segundoScore) {
      segundoScore = score;
    }
  }

  if (!mejor || mejorScore < MIN_PARECIDO_NOMBRE) return null;
  // Empate técnico: dos productos igual de parecidos no sugieren ninguno.
  if (segundoScore >= mejorScore) return null;

  return {
    motivo: MOTIVO_CONCILIACION.SUGERENCIA_NOMBRE,
    producto: mejor,
    parecido: Number(mejorScore.toFixed(3)),
    confirmada: false,
  };
}

/**
 * Sugerencia por código de barras. NO machea.
 *
 * Devuelve un producto solo cuando hay exactamente uno con ese código de barras.
 * La fila sigue siendo NO_MACHEADO: el administrador tiene que confirmar el
 * vínculo, y crear ese vínculo es de otra etapa.
 */
export function sugerirPorCodigoBarra(indiceBarra, fila) {
  const { normalizado } = clavesDeCodigo(fila?.codigoBarraProveedor);
  if (!normalizado) return null;
  // Un producto repetido en el índice —mismo código de barras cargado dos veces—
  // no es "más de un producto": sugerirlo es correcto.
  const candidatos = unoPorProducto(indiceBarra.get(normalizado) ?? []);
  if (candidatos.length !== 1) return null;
  return {
    motivo: MOTIVO_CONCILIACION.SUGERENCIA_CODIGO_BARRAS,
    codigoBarra: normalizado,
    producto: candidatos[0],
    // Sin confirmar no se aplica nada. Es el punto de todo esto.
    confirmada: false,
  };
}

// ── Adaptación al vocabulario de la Etapa 1 ─────────────────────────────────

/**
 * Los helpers de costo hablan el vocabulario del schema (snake_case). La entrada
 * del motor es camelCase y estable. Traducir acá, en un solo lugar, evita que
 * cada llamada tenga que acordarse.
 */
function baseParaHelpers(producto) {
  return {
    unidad_medida: producto?.unidadMedida ?? null,
    factor_pack: producto?.factorPack ?? null,
    modoCompraProveedor: producto?.modoCompraProveedor ?? null,
    pesoReferenciaKg: producto?.pesoReferenciaKg ?? null,
    // El costo actual, que no lo necesitan los helpers de costo pero sí
    // `analizarFila`: sin él no hay contra qué medir las hipótesis y todas
    // saldrían sin referencia. Se traduce acá, con los demás, y no en el punto de
    // uso, para que la adaptación al vocabulario del schema siga estando en un
    // solo lugar.
    precio_costo: producto?.precioCostoActual ?? null,
  };
}

/**
 * Propiedad del costo, con la MISMA regla que `lib/productos/propiedadCosto.js`.
 *
 * Se replica en vez de importarse para que el motor siga siendo puro y sin
 * dependencias fuera de su carpeta; la regla es de tres líneas y está probada de
 * los dos lados. Producto sin `creadoEnLocalId` → del depósito (decisión D2).
 */
export function puedeTocarElCosto({ creadoEnLocalId, operandoEnLocalId, depositoLocalId }) {
  const op = Number(operandoEnLocalId);
  if (!Number.isInteger(op) || op <= 0) return false;
  const esDeDeposito =
    creadoEnLocalId == null
      ? true
      : depositoLocalId == null
        ? false
        : Number(creadoEnLocalId) === Number(depositoLocalId);
  const duenio = esDeDeposito
    ? depositoLocalId == null
      ? null
      : Number(depositoLocalId)
    : Number(creadoEnLocalId);
  if (duenio == null) return false;
  return op === duenio;
}

// ── Una fila ─────────────────────────────────────────────────────────────────

function filaVacia(fila) {
  return {
    fila,
    producto: null,
    tipoCoincidencia: TIPO_COINCIDENCIA.NINGUNA,
    sufijoDigitos: null,
    codigoBarraMacheado: null,
    sugerencia: null,
    costoAnterior: null,
    precioConIva: null,
    recargoPct: null,
    montoRecargo: null,
    precioConRecargo: null,
    unidadProveedor: fila?.unidadProveedor ?? null,
    unidadesPorBulto: fila?.unidadesPorBulto ?? null,
    factorErp: null,
    costoUnitarioCalculado: null,
    costoMaestroPropuesto: null,
    diferencia: null,
    diferenciaPct: null,
    variacionAlta: false,
    estado: ESTADO_LINEA.ERROR,
    // Nulo mientras el motor no llegue a evaluar las hipótesis. Es distinto de
    // REVISAR: REVISAR es "las miré y ninguna cierra".
    resultadoInterpretacion: null,
    motivo: null,
    seleccionable: false,
    seleccionadaPorDefecto: false,
  };
}

/**
 * Concilia UNA fila.
 *
 * El orden de los chequeos no es casual: primero lo que impide identificar el
 * producto, después lo que impide escribirle, después lo que impide calcular, y
 * al final la comparación. Es el mismo orden de prioridad de `estados.js`, para
 * que el estado que sale de acá y el que saldría de clasificar por separado
 * nunca se contradigan.
 */
export function conciliarFila({ fila, indice, indiceBarra, productosPorId, contexto, config }) {
  const salida = filaVacia(fila);
  const excluido = fila?.excluido === true;

  // ── 1. Precio ────────────────────────────────────────────────────────────
  const precioCrudo = fila?.[config.precioBase];
  const precio = Number(precioCrudo);
  if (precioCrudo === null || precioCrudo === undefined || precioCrudo === "" || !Number.isFinite(precio) || precio < 0) {
    return {
      ...salida,
      estado: ESTADO_LINEA.ERROR,
      motivo: MOTIVO_CONCILIACION.PRECIO_INVALIDO,
      detalleError: precio < 0 ? ERROR_COSTO.PRECIO_NEGATIVO : ERROR_COSTO.PRECIO_INVALIDO,
    };
  }

  const recargoPct = Number(config.recargoPct ?? 0);
  const precioConRecargo = aplicarRecargo(precio, recargoPct);
  const montoRecargo = round2(precioConRecargo - precio);

  salida.precioConIva = precio;
  salida.recargoPct = recargoPct;
  salida.montoRecargo = montoRecargo;
  salida.precioConRecargo = round2(precioConRecargo);

  // ── 2. Macheo ────────────────────────────────────────────────────────────
  const machee = macheePorCodigo(indice, fila);
  salida.tipoCoincidencia = machee.tipo;
  // Cuántos dígitos resolvieron el vínculo. Queda en la fila para poder auditar
  // después con qué fuerza se macheó cada producto.
  salida.sufijoDigitos = machee.sufijoDigitos ?? null;

  if (machee.tipo === TIPO_COINCIDENCIA.AMBIGUA) {
    return {
      ...salida,
      estado: ESTADO_LINEA.CODIGO_DUPLICADO,
      motivo: MOTIVO_CONCILIACION.VINCULO_AMBIGUO,
      candidatos: machee.candidatos.map((c) => c.productoBaseId),
    };
  }

  // Sin código interno ni sufijo: queda el código de barras, que ahora SÍ
  // machea porque los candidatos son solo los productos de este proveedor.
  let porBarra = { tipo: TIPO_COINCIDENCIA.NINGUNA, candidatos: [] };
  if (machee.tipo === TIPO_COINCIDENCIA.NINGUNA) {
    porBarra = macheePorCodigoBarra(indiceBarra, fila);

    if (porBarra.tipo === TIPO_COINCIDENCIA.AMBIGUA) {
      salida.tipoCoincidencia = TIPO_COINCIDENCIA.AMBIGUA;
      return {
        ...salida,
        estado: ESTADO_LINEA.CODIGO_DUPLICADO,
        motivo: MOTIVO_CONCILIACION.VINCULO_AMBIGUO,
        candidatos: porBarra.candidatos.map((p) => p.productoBaseId),
      };
    }

    if (porBarra.tipo === TIPO_COINCIDENCIA.NINGUNA) {
      // Último recurso, y solo como PISTA: el parecido de nombre. Nunca vincula.
      const sugerencia = sugerirPorNombre([...productosPorId.values()], fila);
      return {
        ...salida,
        sugerencia,
        estado: ESTADO_LINEA.NO_MACHEADO,
        motivo: machee.claves.normalizado
          ? MOTIVO_CONCILIACION.SIN_VINCULO
          : MOTIVO_CONCILIACION.SIN_CODIGO,
      };
    }

    salida.tipoCoincidencia = TIPO_COINCIDENCIA.CODIGO_BARRA;
    salida.codigoBarraMacheado = porBarra.codigoBarra ?? null;
  }

  // El producto: por código interno viene un VÍNCULO —hay que resolverlo contra
  // el catálogo— y por código de barras viene el producto directo.
  const producto =
    porBarra.tipo === TIPO_COINCIDENCIA.CODIGO_BARRA
      ? porBarra.candidatos[0]
      : productosPorId.get(machee.candidatos[0].productoBaseId) ?? null;
  if (!producto) {
    return {
      ...salida,
      estado: ESTADO_LINEA.NO_MACHEADO,
      motivo: MOTIVO_CONCILIACION.SIN_VINCULO,
    };
  }
  salida.producto = producto;
  salida.costoAnterior = producto.precioCostoActual ?? null;
  salida.factorErp = producto.factorPack ?? null;

  const base = baseParaHelpers(producto);

  // ── 3. Lo que impide ESCRIBIR el costo ───────────────────────────────────
  //
  // Va antes de calcular: si no se puede escribir, el número es de adorno.

  if (producto.esCombo === true) {
    return { ...salida, estado: ESTADO_LINEA.BLOQUEADO, motivo: MOTIVO_CONCILIACION.PRODUCTO_COMBO };
  }

  if (
    !puedeTocarElCosto({
      creadoEnLocalId: producto.creadoEnLocalId ?? null,
      operandoEnLocalId: contexto?.operandoEnLocalId,
      depositoLocalId: contexto?.depositoLocalId ?? null,
    })
  ) {
    return {
      ...salida,
      estado: ESTADO_LINEA.BLOQUEADO,
      motivo: MOTIVO_CONCILIACION.SIN_PROPIEDAD_COSTO,
    };
  }

  // Kg y fiambre: el ERP guarda el costo POR KILO y la lista informa por unidad
  // comercial. Es la regla de la Etapa 1 y se consulta con su mismo predicado,
  // sin pesos aproximados y sin `pesoReferenciaKg`. Vale para las tres unidades
  // del proveedor: un precio por bulto tampoco es un precio por kilo.
  const bloqueoUnidad = bloqueoPorUnidad(base, "UNIDAD");
  if (bloqueoUnidad) {
    return { ...salida, estado: ESTADO_LINEA.BLOQUEADO, motivo: bloqueoUnidad };
  }

  // ── 4. Precio que no se aplica solo ──────────────────────────────────────
  const piso = Number(config.pisoPrecioCreible ?? 0);
  if (precio === 0) {
    return { ...salida, estado: ESTADO_LINEA.BLOQUEADO, motivo: MOTIVO_CONCILIACION.PRECIO_CERO };
  }
  if (piso > 0 && precio < piso) {
    return {
      ...salida,
      estado: ESTADO_LINEA.BLOQUEADO,
      motivo: MOTIVO_CONCILIACION.PRECIO_NO_CREIBLE,
    };
  }

  // ── 5. Unidad no admitida ────────────────────────────────────────────────
  const unidad = fila?.unidadProveedor ?? null;
  const admitidas = config.unidadesAdmitidas ?? [];
  if (admitidas.length > 0 && !admitidas.includes(unidad)) {
    return {
      ...salida,
      estado: ESTADO_LINEA.FACTOR_DUDOSO,
      motivo: "UNIDAD_NO_ADMITIDA",
    };
  }

  // ── 6. La conversión, que la decide el PROVEEDOR ─────────────────────────
  const requiereBulto = requiereConversionABulto(base);
  const factorErp = producto.factorPack ?? null;
  const conversion = config.resolverCostoMaestro({
    unidadProveedor: unidad,
    unidadesPorBulto: fila?.unidadesPorBulto ?? null,
    precioConRecargo,
    producto,
    requiereBulto,
    factorErp,
    factorErpValido: factorValido(factorErp),
    equivalenciaDisplay: config.equivalenciaDisplay,
  });

  salida.costoUnitarioCalculado = round2(precioConRecargo);

  if (conversion.motivo) {
    return {
      ...salida,
      estado:
        conversion.bloqueante === "BLOQUEADO"
          ? ESTADO_LINEA.BLOQUEADO
          : ESTADO_LINEA.FACTOR_DUDOSO,
      motivo: conversion.motivo,
      factorErp,
    };
  }

  salida.costoMaestroPropuesto = conversion.costoMaestro;
  salida.factorAplicado = conversion.factorAplicado;

  // ── 7. Variación ─────────────────────────────────────────────────────────
  const variacion = calcularVariacion({
    costoAnterior: salida.costoAnterior,
    costoNuevo: conversion.costoMaestro,
    umbralPct: config.umbralVariacionPct,
  });
  salida.diferencia = variacion.diferencia;
  salida.diferenciaPct = variacion.diferenciaPct;
  salida.variacionAlta = variacion.variacionAlta;
  salida.porcentajeIndefinido = variacion.porcentajeIndefinido;

  // ── 8. Estado final ──────────────────────────────────────────────────────
  //
  // La variación alta NO entra acá: es una advertencia, y un aumento grande del
  // proveedor sigue siendo aplicable.
  const estado = clasificarLinea({
    error: null,
    duplicado: false,
    macheado: true,
    bloqueado: false,
    factorDudoso: false,
    excluido,
    costoActual: salida.costoAnterior,
    costoNuevo: conversion.costoMaestro,
  });

  salida.estado = estado;
  salida.motivo = null;

  // ── 9. ¿Se pudo elegir cómo leer el precio? ──────────────────────────────
  //
  // El SEGUNDO veredicto del motor sobre la misma fila, y va pegado al primero a
  // propósito: el estado dice qué se puede hacer con ella, esto dice si hubo una
  // sola lectura creíble del precio o si hay que preguntar. Se calculan juntos y
  // se persisten juntos; separarlos dejaría que uno se actualice sin el otro y la
  // cola de pendientes mentiría.
  //
  // Va acá y no en `conciliarLista` porque `vincular/route.js` llama a esta
  // función directo: calcularlo un nivel más arriba dejaría el valor viejo justo
  // después de la acción que más probablemente saca la fila de la cola.
  salida.resultadoInterpretacion = analizarFila({
    // El precio viaja bajo el nombre con el que se persiste. `hipotesisDeCosto`
    // lee `precioConIva`; el motor lo tomó de `config.precioBase`, que en otro
    // proveedor puede llamarse distinto. Es el mismo número: el que ya quedó en
    // `salida.precioConIva` y el que va a la columna.
    fila: { ...fila, precioConIva: salida.precioConIva },
    base,
    recargoPct,
    rango: rangoDeLaFila(fila, contexto?.cabecera),
  }).resultado;

  salida.seleccionable = esAplicable(estado);
  // Solo lo que está listo se marca solo. Todo lo demás lo tiene que elegir
  // una persona, a mano, mirando el motivo.
  salida.seleccionadaPorDefecto = salida.seleccionable;
  return salida;
}

// ── La conciliación completa ────────────────────────────────────────────────

/**
 * Concilia una lista entera.
 *
 * @param filas            filas ya parseadas y normalizadas
 * @param productos        productos del ERP ya cargados
 * @param codigosProveedor vínculos de `ProductoCodigoProveedor`, ya filtrados
 *                         por grupo y proveedor
 * @param contexto         { grupoId, proveedorId, operandoEnLocalId, depositoLocalId,
 *                           cabecera } — `cabecera` es la importación, y de ella
 *                           sale el rango de aumento esperado. Entra por acá y no
 *                           por `config` porque el rango es de la importación, no
 *                           del proveedor: dos listas del mismo proveedor pueden
 *                           tener rangos distintos.
 * @param config           configuración comercial del proveedor
 */
export function conciliarLista({
  filas = [],
  productos = [],
  codigosProveedor = [],
  contexto = {},
  config,
} = {}) {
  if (!config || typeof config.resolverCostoMaestro !== "function") {
    throw new Error("conciliarLista: falta la configuración del proveedor.");
  }

  const indice = indexarCodigosProveedor(codigosProveedor);
  const indiceBarra = indexarCodigosBarra(productos);
  const productosPorId = new Map(productos.map((p) => [p.productoBaseId, p]));

  const resultado = filas.map((fila) =>
    conciliarFila({ fila, indice, indiceBarra, productosPorId, contexto, config })
  );

  // ── Faltantes ──────────────────────────────────────────────────────────
  //
  // Códigos ACTIVOS del proveedor que no vinieron en el archivo. Los inactivos
  // no cuentan: un vínculo dado de baja no se espera en la lista.
  //
  // PENDIENTE, y este es su lugar: cuando el proveedor le cambia el código a un
  // producto, el vínculo viejo queda activo y aparece acá como faltante en TODAS
  // las listas siguientes, para siempre. No rompe nada —ningún costo va al
  // producto equivocado— pero ensucia el conteo, y va a ensuciarlo más ahora que
  // los vínculos se guardan solos al aplicar.
  //
  // La acción que falta es dar de baja ese código viejo, y no va suelta: vive en
  // la card de "no vinieron en esta lista", que es donde el usuario ve el ruido y
  // donde puede decidir si el código murió o si el proveedor simplemente no lo
  // informó este mes. Se resuelve cuando se rediseñe esa card.
  const enArchivo = new Set();
  for (const f of filas) {
    const { normalizado } = clavesDeCodigo(f?.codigoNormalizado ?? f?.codigoCrudo);
    if (normalizado) enArchivo.add(normalizado);
  }
  const faltantes = [];
  for (const [normalizado, vinculos] of indice.exacto) {
    if (enArchivo.has(normalizado)) continue;
    for (const v of vinculos) {
      const p = productosPorId.get(v.productoBaseId) ?? null;
      faltantes.push({
        codigoInterno: v.codigoInterno,
        codigoNormalizado: normalizado,
        productoBaseId: v.productoBaseId,
        nombre: p?.nombre ?? null,
      });
    }
  }

  const estados = resultado.map((r) => r.estado);
  const porEstado = resumirEstados(estados);

  return {
    filas: resultado,
    faltantes,
    resumen: {
      proveedor: config.proveedor ?? null,
      recargoPct: Number(config.recargoPct ?? 0),
      umbralVariacionPct: config.umbralVariacionPct ?? null,
      totalFilas: resultado.length,
      porEstado,
      // El código de barras ya no sugiere: machea. Lo que queda como sugerencia
      // es el parecido de nombre, que nunca vincula solo.
      sugerenciasCodigoBarras: resultado.filter(
        (r) => r.sugerencia?.motivo === MOTIVO_CONCILIACION.SUGERENCIA_CODIGO_BARRAS
      ).length,
      sugerenciasNombre: resultado.filter(
        (r) => r.sugerencia?.motivo === MOTIVO_CONCILIACION.SUGERENCIA_NOMBRE
      ).length,
      macheadasPorCodigoBarra: resultado.filter(
        (r) => r.tipoCoincidencia === TIPO_COINCIDENCIA.CODIGO_BARRA
      ).length,
      variacionAlta: resultado.filter((r) => r.variacionAlta).length,
      seleccionables: resultado.filter((r) => r.seleccionable).length,
      seleccionadas: resultado.filter((r) => r.seleccionadaPorDefecto).length,
      faltantes: faltantes.length,
      codigosProveedorActivos: indice.exacto.size,
      codigosProveedorInactivos: indice.inactivos.size,
    },
  };
}

export { ESTADO_LINEA, MOTIVO_BLOQUEO, aCentavos, desdeCentavos, mismoCosto };
