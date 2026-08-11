// lib/proveedores/listas/persistencia.js
//
// De la conciliación en memoria a las filas que van a la base.
//
// Puro: no importa Prisma, no abre transacciones, no escribe nada. Traduce la
// salida del motor a la forma de las tablas y cuenta. Que sea puro es lo que
// permite probar los contadores y el mapeo sin base de datos, que es donde
// aparecen los errores de verdad —un estado mal mapeado, un decimal perdido, un
// contador que no suma—.
//
// LAS FILAS SE GUARDAN TODAS, incluidas las que no se pueden aplicar. Una lista
// de Arcor trae 917 productos y solo una parte queda lista; guardar únicamente
// esa parte dejaría sin explicación a las demás, y esa explicación es lo que
// permite corregir el catálogo.

import { ESTADO_LINEA, PRIORIDAD_ESTADO } from "./estados.js";
import { TIPO_COINCIDENCIA } from "./conciliarLista.js";

/** Límites del upload. Viven acá para que el endpoint y las pruebas usen los mismos. */
export const LIMITES = {
  /** 10 MB. El archivo real de agosto pesa 68 KB; el de códigos de barras, 143 KB. */
  tamanoMaxBytes: 10 * 1024 * 1024,
  /** Techo de filas de producto. El archivo real trae 917. */
  filasMax: 20000,
  extensiones: [".xlsx"],
  /**
   * MIME que manda un navegador para un .xlsx. Se valida de forma DEFENSIVA:
   * el MIME lo elige el cliente y se puede falsificar, así que sirve para
   * rechazar lo obvio, no para autorizar. La extensión y el parseo real son los
   * que mandan.
   */
  mimes: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
    "",
  ],
  /** Techo de página en las lecturas. */
  pageSizeMax: 200,
  pageSizeDefault: 50,
};

/**
 * Opciones de la transacción de persistencia.
 *
 * El default de Prisma para una transacción interactiva son 5 segundos, y las
 * 917 filas del archivo real los pasan cuando la base está ocupada: la
 * transacción vence a mitad, los INSERT se revierten y el usuario ve "Error
 * interno" sin ninguna pista. Pasó de verdad en las pruebas.
 *
 * Se sube el techo, no se achica el trabajo: partir la carga en varias
 * transacciones rompería el "todo o nada" y podría dejar una cabecera diciendo
 * que tiene 917 filas cuando entraron 500. `maxWait` es cuánto se espera una
 * conexión libre del pool; `timeout`, cuánto puede durar la transacción.
 */
export const OPCIONES_TX = { maxWait: 10000, timeout: 60000 };

/** Estado de la cabecera. Espeja el enum de Prisma. */
export const ESTADO_IMPORTACION = {
  BORRADOR: "BORRADOR",
  CONCILIADA: "CONCILIADA",
  APLICADA: "APLICADA",
  DESCARTADA: "DESCARTADA",
  /// Cancelada a mano: queda como historial y libera el archivo.
  CANCELADA: "CANCELADA",
  /// Se aplicó una tanda y quedan filas pendientes. Sigue abierta.
  PARCIALMENTE_APLICADA: "PARCIALMENTE_APLICADA",
  /// Cerrada a mano: no acepta trabajo nuevo, pero SÍ se puede revertir.
  TERMINADA: "TERMINADA",
};

/**
 * Estados en los que la importación SIGUE ABIERTA para trabajar.
 *
 * Que una tanda se haya aplicado no cierra el proceso: lo que cierra es que no
 * queden filas pendientes, o que alguien lo decida. La protección contra volver
 * a aplicar algo vive en la FILA (), no acá: por eso una importación
 * parcialmente aplicada puede seguir abierta sin riesgo de duplicar nada.
 */
export const ESTADOS_ABIERTOS = ["CONCILIADA", "PARCIALMENTE_APLICADA"];

/** ¿Se puede seguir trabajando sobre esta importación? */
export function esImportacionAbierta(estado) {
  return ESTADOS_ABIERTOS.includes(estado);
}

/**
 * ¿Se puede DESHACER lo que esta importación escribió?
 *
 * NO es la misma pregunta que "¿sigue abierta?", y por eso son dos listas y no
 * una con un caso especial adentro. Terminar una lista cierra el trabajo —no se
 * confirma ni se aplica nada más— pero no puede cerrar la salida de emergencia:
 * una lista terminada es justo la que ya escribió cientos de costos, y es donde
 * más falta hace poder volver.
 *
 * CANCELADA queda afuera a propósito: nunca escribió un costo —el endpoint la
 * rechaza si la importación está aplicada—, así que no hay nada que deshacer.
 * APLICADA y las demás también quedan afuera.
 */
export const ESTADOS_REVERTIBLES = [...ESTADOS_ABIERTOS, ESTADO_IMPORTACION.TERMINADA];

export function esImportacionRevertible(estado) {
  return ESTADOS_REVERTIBLES.includes(estado);
}

/**
 * Valor con el que NACE la cabecera. `NO_TOCAR` acá significa "todavía no se
 * aplicó", no una decisión del usuario.
 *
 * El vocabulario REAL de la aplicación —MANTENER_VENTA y RECALCULAR_POR_MARGEN—
 * vive en `aplicacion.js`, que es quien decide y escribe. Se mantiene este valor
 * inicial para no reescribir las importaciones que ya existen en la base.
 */
export const MODO_PRECIO_VENTA = {
  NO_TOCAR: "NO_TOCAR",
  RECALCULAR_POR_MARGEN: "RECALCULAR_POR_MARGEN",
};

/** Nombre de la columna contadora de cada estado, en la cabecera. */
const COLUMNA_CONTADOR = {
  LISTO_PARA_ACTUALIZAR: "listoParaActualizar",
  SIN_CAMBIOS: "sinCambios",
  NO_MACHEADO: "noMacheadas",
  CODIGO_DUPLICADO: "codigoDuplicado",
  FACTOR_DUDOSO: "factorDudoso",
  EXCLUIDO: "excluidas",
  BLOQUEADO: "bloqueadas",
  ERROR: "errores",
};

/** ¿Es uno de los cuatro tipos de coincidencia que admite la base? */
function tipoCoincidenciaValido(t) {
  return Object.prototype.hasOwnProperty.call(TIPO_COINCIDENCIA, t);
}

/**
 * Un número listo para una columna Decimal, o null.
 *
 * Prisma acepta number para Decimal, pero un no finito rompe la inserción con un
 * error críptico a mitad del lote. Se filtra acá.
 */
function decimal(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function entero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

/**
 * Una fila del motor → una fila de `ImportacionListaFila`.
 *
 * `importacionId` NO se pone acá: lo agrega quien inserta, porque hasta que la
 * cabecera no existe no hay id.
 */
export function filaAPersistir(resultado) {
  const f = resultado?.fila ?? {};
  const sug = resultado?.sugerencia ?? null;

  return {
    filaExcel: entero(f.filaExcel) ?? 0,
    hojaNombre: String(f.hojaNombre ?? ""),

    codigoCrudo: String(f.codigoCrudo ?? ""),
    codigoNormalizado: String(f.codigoNormalizado ?? ""),
    codigoComparableSinCeros: f.codigoComparableSinCeros ?? null,
    codigoBarraProveedor: f.codigoBarraProveedor ?? null,
    descripcionProveedor: String(f.descripcionProveedor ?? ""),
    categoriaCruda: f.categoriaCruda ?? null,

    unidadProveedor: String(f.unidadProveedor ?? ""),
    unidadesPorBulto: entero(f.unidadesPorBulto),
    precioConIva: decimal(resultado?.precioConIva ?? f.precioConIva) ?? 0,
    precioSinIva: decimal(f.precioSinIva),

    productoBaseId: resultado?.producto?.productoBaseId ?? null,
    codigoProveedorId: resultado?.codigoProveedorId ?? null,
    tipoCoincidencia: tipoCoincidenciaValido(resultado?.tipoCoincidencia)
      ? resultado.tipoCoincidencia
      : TIPO_COINCIDENCIA.NINGUNA,
    // Con cuántos dígitos resolvió el fallback por sufijo. null cuando el vínculo
    // no vino por ahí. Se guarda aparte del tipo para poder contarlo sin parsear
    // el nombre del enum.
    sufijoDigitos: entero(resultado?.sufijoDigitos),
    // La sugerencia se guarda como DATO, no como vínculo: nadie la confirmó.
    sugerenciaProductoBaseId: sug?.producto?.productoBaseId ?? null,
    sugerenciaCodigoBarra: sug?.codigoBarra ?? null,

    costoAnterior: decimal(resultado?.costoAnterior),
    recargoPct: decimal(resultado?.recargoPct) ?? 0,
    montoRecargo: decimal(resultado?.montoRecargo),
    precioConRecargo: decimal(resultado?.precioConRecargo),
    factorErp: entero(resultado?.factorErp),
    costoUnitarioCalculado: decimal(resultado?.costoUnitarioCalculado),
    costoMaestroPropuesto: decimal(resultado?.costoMaestroPropuesto),
    diferencia: decimal(resultado?.diferencia),
    diferenciaPct: decimal(resultado?.diferenciaPct),
    variacionAlta: resultado?.variacionAlta === true,

    estado: resultado?.estado ?? ESTADO_LINEA.ERROR,
    motivo: resultado?.motivo ?? null,

    // Va pegado al estado a propósito: son los dos veredictos del motor sobre la
    // misma fila —qué se puede hacer con ella, y si se pudo elegir cómo leer el
    // precio— y se escriben en la misma pasada. Separarlos invitaría a que uno
    // se actualice sin el otro.
    resultadoInterpretacion: resultado?.resultadoInterpretacion ?? null,

    seleccionable: resultado?.seleccionable === true,
    seleccionada: resultado?.seleccionadaPorDefecto === true,
    // Nacen sin aplicar. La etapa de aplicación las marca.
    aplicada: false,
    costoAplicado: null,
  };
}

/** Todas las filas de una conciliación, en el orden en que vinieron. */
export function filasAPersistir(conciliacion) {
  return (conciliacion?.filas ?? []).map(filaAPersistir);
}

/**
 * Los contadores de la cabecera, derivados de las filas.
 *
 * Se calculan de la conciliación y no se copian del resumen del motor: si algún
 * día los dos divergieran, la cabecera tiene que decir lo que realmente se
 * guardó. La prueba de "la suma de estados es igual al total" cierra ese
 * contrato.
 */
export function contadoresDeCabecera(conciliacion) {
  const filas = conciliacion?.filas ?? [];
  const contadores = {};
  for (const estado of PRIORIDAD_ESTADO) contadores[COLUMNA_CONTADOR[estado]] = 0;

  for (const r of filas) {
    const col = COLUMNA_CONTADOR[r.estado];
    if (col) contadores[col] += 1;
  }

  return {
    ...contadores,
    totalFilas: filas.length,
    // Cuenta TODA sugerencia pendiente. Desde que el código de barras machea,
    // las que quedan son de nombre; la columna conserva su nombre histórico
    // para no migrar datos por una etiqueta.
    sugerenciasCodigoBarras: filas.filter((r) => r.sugerencia).length,
    variacionAlta: filas.filter((r) => r.variacionAlta).length,
    faltantes: (conciliacion?.faltantes ?? []).length,
  };
}

/** ¿Los contadores cierran contra el total? Invariante de la cabecera. */
export function contadoresCierran(contadores) {
  const suma = Object.values(COLUMNA_CONTADOR).reduce(
    (acc, col) => acc + (contadores?.[col] ?? 0),
    0
  );
  return suma === contadores?.totalFilas;
}

/**
 * Reparte las filas en lotes.
 *
 * `createMany` con 917 filas en un solo statement arma una consulta enorme y
 * pesada de parsear del lado del servidor. En lotes entra igual de rápido y el
 * plan de la base no se degrada. Todos los lotes van dentro de la MISMA
 * transacción, así que o entran todos o no entra ninguno.
 */
export function enLotes(filas, tamano = 500) {
  const n = Math.max(1, Number(tamano) || 500);
  const lotes = [];
  for (let i = 0; i < filas.length; i += n) lotes.push(filas.slice(i, i + n));
  return lotes;
}

// ── Validación del archivo ──────────────────────────────────────────────────

export const ERROR_UPLOAD = {
  SIN_ARCHIVO: "SIN_ARCHIVO",
  ARCHIVO_VACIO: "ARCHIVO_VACIO",
  EXTENSION_INVALIDA: "EXTENSION_INVALIDA",
  MIME_INVALIDO: "MIME_INVALIDO",
  DEMASIADO_GRANDE: "DEMASIADO_GRANDE",
  DEMASIADAS_FILAS: "DEMASIADAS_FILAS",
};

/**
 * Valida el archivo ANTES de leerlo entero y antes de parsear.
 *
 * El nombre no se cree: se usa solo para la extensión, y la extensión sola
 * tampoco autoriza —quien decide es el parseo real, que falla si el contenido no
 * es un .xlsx—. Acá se corta lo grosero para no gastar memoria en algo que ya se
 * sabe que no sirve.
 */
export function validarArchivo({
  nombre,
  tamano,
  mime,
  extensionesPermitidas = LIMITES.extensiones,
  // Los otros dos límites también entran por parámetro desde el 2026-08-11, con
  // los defaults de siempre. El motivo: la subida de comprobantes acepta fotos y
  // PDF, y necesitaba las mismas cinco validaciones con otra lista. Escribir una
  // función parecida al lado habría dejado dos reglas que se separan el día que
  // una cambie — y esta decide qué archivos entran al sistema.
  mimesPermitidos = LIMITES.mimes,
  tamanoMaxBytes = LIMITES.tamanoMaxBytes,
  // Qué nombrar en el mensaje de MIME inválido. Decirle "planilla" a quien
  // subió una foto sería un mensaje que no explica nada.
  queSeEsperaba = "una planilla",
} = {}) {
  if (!nombre) return { ok: false, codigo: ERROR_UPLOAD.SIN_ARCHIVO, error: "Falta el archivo." };

  const n = String(nombre).toLowerCase();
  const extOk = extensionesPermitidas.some((e) => n.endsWith(e));
  if (!extOk) {
    return {
      ok: false,
      codigo: ERROR_UPLOAD.EXTENSION_INVALIDA,
      error: `Solo se aceptan archivos ${extensionesPermitidas.join(", ")}.`,
    };
  }

  const bytes = Number(tamano);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return { ok: false, codigo: ERROR_UPLOAD.ARCHIVO_VACIO, error: "El archivo está vacío." };
  }
  if (bytes > tamanoMaxBytes) {
    return {
      ok: false,
      codigo: ERROR_UPLOAD.DEMASIADO_GRANDE,
      error: `El archivo supera el límite de ${Math.round(tamanoMaxBytes / 1024 / 1024)} MB.`,
    };
  }

  // El MIME lo elige el cliente: sirve para rechazar lo evidente, no para
  // autorizar. Un .xlsx renombrado desde un .exe se corta igual en el parseo.
  const m = String(mime ?? "").toLowerCase();
  if (m && !mimesPermitidos.includes(m)) {
    return {
      ok: false,
      codigo: ERROR_UPLOAD.MIME_INVALIDO,
      error: `El tipo de archivo no corresponde a ${queSeEsperaba}.`,
    };
  }

  return { ok: true };
}

/** Los parámetros de paginación, ya acotados. */
export function paginacion({ page, pageSize } = {}) {
  const p = Math.max(1, Number(page) || 1);

  // Un pageSize inválido cae al DEFAULT, no a 1. `Math.max(1, -5)` daría 1, y
  // una página de un solo elemento no es lo que pidió nadie: es un parámetro mal
  // escrito que hay que ignorar entero.
  const bruto = Number(pageSize);
  const s = Number.isFinite(bruto) && bruto >= 1
    ? Math.min(LIMITES.pageSizeMax, Math.floor(bruto))
    : LIMITES.pageSizeDefault;

  return { page: p, pageSize: s, skip: (p - 1) * s, take: s };
}
