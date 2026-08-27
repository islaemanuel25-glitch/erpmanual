// CÓMO SE LEE EL DOCUMENTO DE ESTE PROVEEDOR.
//
// ── QUÉ ES Y QUÉ NO ES ────────────────────────────────────────────────────
//
// Es la receta ESTRUCTURAL: qué columna es cuál, cómo se sabe si un renglón fue
// enviado, qué significa la cantidad, en qué escala está el precio y cómo se
// reconoce esta variante del documento.
//
// NO es la receta de impuestos. Esa ya existe —`RecetaProveedor`, una por
// proveedor— y contesta otra pregunta: dónde viene el IVA, si hay interno, qué
// percepciones. Meter lo estructural adentro de aquella habría obligado a
// romperle la unicidad, porque un mismo proveedor factura con VARIOS formatos
// —Consumidor Final, Responsable Inscripto— y los impuestos no cambian entre
// ellos. Dos hechos distintos, dos tablas.
//
// NO guarda identidad de productos. Los códigos, alias, descripciones y
// presentaciones siguen viviendo en `ProductoCodigoProveedor`, que es lo que
// hace que Listas de precios y Facturas compartan lo que aprenden. Una receta
// que guardara aliases sería una segunda memoria del proveedor, y el día que las
// dos difieran nadie sabría cuál manda. Hay un candado que lo exige.
//
// ── LA EXPLICACIÓN EN CASTELLANO NO SE EJECUTA NUNCA ──────────────────────
//
// Una persona escribe "la primera columna es la cantidad enviada; si está vacía
// el producto no fue enviado". Ese texto va a la IA, que devuelve una receta
// ESTRUCTURADA, y esa receta pasa por `recetaValida` antes de existir. Lo que se
// guarda y lo que se aplica es siempre la estructura, nunca el texto.
//
// El texto queda guardado igual, pero como DOCUMENTACIÓN: para poder mostrar
// después qué fue lo que alguien quiso decir cuando esta receta se creó. No se
// vuelve a interpretar solo.
//
// ── NO SE GUARDAN NÚMEROS DE UNA FACTURA ──────────────────────────────────
//
// Cantidades, importes, descuentos y porcentajes de renglón se leen de CADA
// archivo, siempre. La receta dice DÓNDE mirar, no cuánto valía la última vez.
// Guardar un valor variable haría que la factura de marzo se leyera con los
// números de febrero, y eso no daría un error: daría un número plausible.
//
// El único número que la receta guarda es la tolerancia comercial, que es una
// preferencia y no un dato del papel.

/**
 * Una explicación más larga que esto no es una explicación.
 *
 * Vive en este archivo —que es puro— y no al lado de la función que llama al
 * modelo, porque la PANTALLA también lo necesita para acotar el campo. Si
 * estuviera allá, importarlo desde el navegador arrastraría el módulo de IA
 * entero al bundle del cliente, con su `process.env` adentro.
 */
export const LARGO_MAXIMO_EXPLICACION = 2000;

/** Cómo se sabe si un renglón fue efectivamente enviado. */
export const CRITERIO_ENVIADO = Object.freeze({
  /** Hay cantidad escrita. Vacío = no vino. Es el caso del pedido de Emanuel. */
  CANTIDAD_PRESENTE: "CANTIDAD_PRESENTE",
  /** Una columna aparte lo marca (una tilde, una X, un "SI"). */
  COLUMNA_MARCADA: "COLUMNA_MARCADA",
  /** Todos los renglones del papel fueron enviados. Es lo normal en una factura. */
  TODOS: "TODOS",
});

export const TEXTO_CRITERIO_ENVIADO = Object.freeze({
  [CRITERIO_ENVIADO.CANTIDAD_PRESENTE]: "Si la cantidad está vacía, el producto no fue enviado",
  [CRITERIO_ENVIADO.COLUMNA_MARCADA]: "Una columna aparte marca lo que se envió",
  [CRITERIO_ENVIADO.TODOS]: "Todos los renglones del papel fueron enviados",
});

/** Los campos que una columna puede representar. Cerrado a propósito. */
export const CAMPOS = Object.freeze([
  "codigo",
  "descripcion",
  "cantidad",
  "unidad",
  "precioUnitario",
  "bonificacionPct",
  "subtotal",
]);

const UNIDADES = Object.freeze(["UNIDAD", "BULTO"]);

const texto = (valor, maximo = 120) => {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).trim();
  if (!t) return null;
  return t.slice(0, maximo);
};

const booleanoOnulo = (valor) => (typeof valor === "boolean" ? valor : null);

const unidadOnula = (valor) => {
  const t = texto(valor);
  return t && UNIDADES.includes(t.toUpperCase()) ? t.toUpperCase() : null;
};

const enteroPositivoOnulo = (valor) => {
  // El descarte explícito va PRIMERO y no es defensivo de más: `Number(null)` es
  // 0, y `Number("")` también. Sin esta línea, "no dijo en qué posición está"
  // se guardaba como "está en la primera columna" — la trampa del cero falsy,
  // dada vuelta, y ya van cinco veces en este módulo.
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n < 100 ? n : null;
};

/**
 * ¿ESTE TEXTO ES UN DATO DE UNA FACTURA EN VEZ DE UNA REGLA?
 *
 * Las pistas de variante son el único campo de texto libre que la receta guarda
 * y se aplica a cada archivo, así que es por donde se colaría el número de la
 * factura de marzo. Un importe, una fecha o un número de comprobante como pista
 * harían que la receta reconociera UN documento en vez de un formato — y la
 * primera vez que fallara sería con la factura siguiente, sin decir por qué.
 *
 * Se rechaza lo que sea mayormente dígitos. "CONSUMIDOR FINAL" pasa; "0001-00012345"
 * y "12/03/2026" y "$ 50.500" no.
 */
export function pistaUtilizable(valor) {
  const t = texto(valor, 60);
  if (!t) return false;
  const letras = (t.match(/[a-záéíóúñü]/gi) || []).length;
  const digitos = (t.match(/\d/g) || []).length;
  if (letras < 3) return false;
  return digitos <= letras / 2;
}

/**
 * LA RECETA, VALIDADA Y ACOTADA.
 *
 * Todo lo que no esté en el vocabulario se descarta. No se corrige, no se
 * completa y no se adivina: un campo que no se entendió queda en `null`, que es
 * lo que hace que la prioridad de `resolverUnidadDelPapel` siga preguntando en
 * vez de aplicar algo que nadie dijo.
 *
 * Se aplica SIEMPRE, venga de una persona o de la IA. Es el único lugar por el
 * que una receta puede llegar a existir.
 */
export function recetaValida(cruda) {
  const c = cruda && typeof cruda === "object" ? cruda : {};

  const columnas = {};
  const columnasCrudas = c.columnas && typeof c.columnas === "object" ? c.columnas : {};
  for (const campo of CAMPOS) {
    const definicion = columnasCrudas[campo];
    if (!definicion || typeof definicion !== "object") {
      columnas[campo] = null;
      continue;
    }
    const encabezado = texto(definicion.encabezado, 60);
    const posicion = enteroPositivoOnulo(definicion.posicion);
    // Una columna sin encabezado NI posición no identifica nada. Guardarla como
    // objeto vacío haría creer que el campo está resuelto.
    columnas[campo] = encabezado === null && posicion === null ? null : { encabezado, posicion };
  }

  const criterio = texto(c.enviado?.criterio);
  const criterioValido =
    criterio && Object.values(CRITERIO_ENVIADO).includes(criterio.toUpperCase())
      ? criterio.toUpperCase()
      : null;

  return {
    nombre: texto(c.nombre, 60),
    columnas,
    enviado: {
      // Sin criterio reconocido NO se asume "todos": asumirlo metería en el
      // pedido renglones que el proveedor no mandó, que es el defecto que este
      // campo existe para evitar.
      criterio: criterioValido,
      columna: criterioValido === CRITERIO_ENVIADO.COLUMNA_MARCADA ? texto(c.enviado?.columna, 60) : null,
    },
    /** En qué escala está expresada la CANTIDAD. */
    cantidadEn: unidadOnula(c.cantidadEn),
    /** En qué escala está expresado el PRECIO. Es otra pregunta. */
    facturaPor: unidadOnula(c.facturaPor),
    subtotal: {
      hayColumna: booleanoOnulo(c.subtotal?.hayColumna),
      // Si el importe del renglón ya viene con la bonificación aplicada. Es lo
      // que decide si el precio efectivo sale del subtotal o del descuento.
      incluyeBonificacion: booleanoOnulo(c.subtotal?.incluyeBonificacion),
    },
    variante: {
      pistas: (Array.isArray(c.variante?.pistas) ? c.variante.pistas : [])
        .filter(pistaUtilizable)
        .map((p) => texto(p, 60))
        .slice(0, 8),
    },
    toleranciaEscalaPct: toleranciaGuardable(c.toleranciaEscalaPct),
  };
}

/** La tolerancia comercial, o null para que rija el default único. */
function toleranciaGuardable(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > 1000) return null;
  return n;
}

/**
 * ¿ESTA RECETA GUARDA ALGÚN VALOR DE UNA FACTURA?
 *
 * Devuelve la lista de campos que no deberían estar. Es la comprobación que
 * separa "dice dónde mirar" de "se acordó de lo que decía la última". Se usa en
 * un candado y también antes de guardar: una receta que traiga números de un
 * documento no se guarda, se rechaza diciendo cuáles.
 */
export function valoresDeFacturaEnLaReceta(receta) {
  const problemas = [];
  const r = receta || {};

  for (const pista of r.variante?.pistas ?? []) {
    if (!pistaUtilizable(pista)) problemas.push(`pista de variante "${pista}"`);
  }
  // Los encabezados son nombres de columna —"CANT", "PRECIO"—, no valores. Uno
  // que sea mayormente dígitos es el contenido de una celda, no su título.
  for (const [campo, definicion] of Object.entries(r.columnas ?? {})) {
    if (!definicion?.encabezado) continue;
    if (!pistaUtilizable(definicion.encabezado)) {
      problemas.push(`encabezado de ${campo}: "${definicion.encabezado}"`);
    }
  }
  return problemas;
}

/**
 * ¿ALCANZA PARA LEER, O ESTÁ VACÍA?
 *
 * Una receta sin ninguna columna identificada y sin criterio de envío no aporta
 * nada, y guardarla haría creer que el formato ya está enseñado.
 */
export function recetaAporta(receta) {
  const r = receta || {};
  const columnas = Object.values(r.columnas ?? {}).filter(Boolean).length;
  return (
    columnas > 0 ||
    r.enviado?.criterio !== null ||
    r.cantidadEn !== null ||
    r.facturaPor !== null ||
    r.subtotal?.hayColumna !== null
  );
}

/**
 * LA RECETA EN CASTELLANO, PARA MOSTRARLA ANTES DE CONFIRMAR.
 *
 * Se arma acá y no en la pantalla porque quien confirma tiene que ver lo que se
 * ENTENDIÓ, no lo que escribió. Si la pantalla lo redactara por su cuenta,
 * podría describir bien una receta que quedó mal.
 */
export function recetaEnCastellano(receta) {
  const r = receta || {};
  const partes = [];

  const nombradas = CAMPOS.filter((campo) => r.columnas?.[campo]).map((campo) => {
    const definicion = r.columnas[campo];
    const donde = definicion.encabezado
      ? `"${definicion.encabezado}"`
      : `la columna ${definicion.posicion + 1}`;
    return `${NOMBRE_DE_CAMPO[campo]} sale de ${donde}`;
  });
  partes.push(...nombradas);

  if (r.enviado?.criterio) {
    const base = TEXTO_CRITERIO_ENVIADO[r.enviado.criterio];
    partes.push(r.enviado.columna ? `${base} ("${r.enviado.columna}")` : base);
  }
  if (r.cantidadEn) {
    partes.push(`La cantidad está expresada en ${r.cantidadEn === "BULTO" ? "bultos" : "unidades sueltas"}`);
  }
  if (r.facturaPor) {
    partes.push(`El precio está expresado por ${r.facturaPor === "BULTO" ? "bulto" : "unidad"}`);
  }
  if (r.subtotal?.hayColumna === true) {
    partes.push(
      r.subtotal.incluyeBonificacion === true
        ? "Hay columna de importe por renglón, y ya trae la bonificación aplicada"
        : "Hay columna de importe por renglón"
    );
  } else if (r.subtotal?.hayColumna === false) {
    partes.push("No hay columna de importe por renglón");
  }
  if (r.variante?.pistas?.length) {
    partes.push(`Se reconoce este formato por: ${r.variante.pistas.join(", ")}`);
  }

  return partes;
}

const NOMBRE_DE_CAMPO = Object.freeze({
  codigo: "El código",
  descripcion: "La descripción",
  cantidad: "La cantidad",
  unidad: "La unidad",
  precioUnitario: "El precio unitario",
  bonificacionPct: "La bonificación",
  subtotal: "El importe del renglón",
});

/**
 * LO QUE LA RECETA LE APORTA AL PREPARADO DE LÍNEAS.
 *
 * Traduce la receta a los parámetros que ya entiende `prepararLineasImportadas`.
 * Vive acá para que la pantalla no tenga que conocer los dos vocabularios, y
 * para que agregar un campo a la receta no obligue a tocar el componente.
 */
export function parametrosDeLectura(receta) {
  const r = receta || {};
  return {
    cantidadEn: r.cantidadEn ?? null,
    facturaPor: r.facturaPor ?? "UNIDAD",
    // `null` en la receta NO se convierte en `false`: significa que la receta no
    // opina, y entonces manda lo que haya contestado el lector sobre el papel.
    hayColumnaSubtotal: r.subtotal?.hayColumna ?? null,
    toleranciaEscalaPct: r.toleranciaEscalaPct ?? null,
  };
}
