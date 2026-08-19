// CUANDO CAMBIA LA ESCALA, EL PRECIO QUEDA CON EL NÚMERO VIEJO Y EL SIGNIFICADO
// NUEVO — Y NADA AVISA.
//
// ── EL CASO REAL, MEDIDO ──────────────────────────────────────────────────────
//
// "Pechuga Rebozada Sadia X 3kg" era un producto por UNIDAD y su precio, 36.900,
// era el de la unidad: una pechuga de 3 kg. El 2026-08-01 se lo convirtió a
// fiambre de pieza fija —`unidad_medida` de "unidad" a "kg", `pesoEsFijo` a Sí,
// `pesoReferenciaKg` a 3— y ese mismo 36.900 pasó a leerse como precio POR KILO.
// Nadie lo dividió por 3. La tarjeta del depósito llegó a mostrar 110.700, que es
// 36.900 × 3.
//
// No fue un dato mal cargado ni una importación vieja: el número era correcto
// para la escala anterior. Lo rompió el cambio de escala.
//
// Y son CUATRO productos, que son exactamente los cuatro que se convirtieron a
// pieza fija con precio cargado: los otros dieciséis convertidos no tenían el
// problema porque su peso de referencia es 1, donde las dos escalas coinciden.
//
// ── POR QUÉ AVISA Y NO CONVIERTE SOLO ────────────────────────────────────────
//
// Decisión de Emanuel, 2026-08-19: **cambiar un precio automáticamente en cinco
// ubicaciones es peor que el problema.** Un producto puede tener el precio ya
// corregido a mano en una ubicación y no en otra, y una conversión automática
// pisaría la corrección sin que nadie se entere. Así que esto DEVUELVE un aviso
// —qué queda mal, dónde, y con qué número quedaría— y la persona decide.
//
// Esta función no escribe nada y no sabe de Prisma.
//
// ── EL FACTOR DE PACK TAMBIÉN, AUNQUE HOY NO TENGA NINGÚN CASO ───────────────
//
// Medido sobre los 2.383 productos activos: hay 4 descalzados por peso de pieza y
// **CERO por factor de pack**. Se cubre igual porque el mecanismo es idéntico —el
// precio de un bulto de 12 no es el de un bulto de 24— y porque el día que pase
// no habrá con qué darse cuenta. Cubrirlo cuesta una rama.

import { esFiambreFijo } from "../conversiones/stock.js";

export const ESCALA_SIN_CAMBIO = null;

// ── EL MARGEN TÍPICO DEL NEGOCIO, MEDIDO Y NO SUPUESTO ───────────────────────
//
// Sobre los 2.383 productos activos de producción con costo y venta cargados
// (2026-08-19): mediana 1,309, percentil 5 en 1,060 y percentil 95 en 1,561. El
// valor más repetido es 1,30, con 775 productos.
//
// Se guarda como rango y no como un número porque lo que se busca NO es "el
// margen correcto" —eso lo decide el negocio producto por producto— sino un
// margen tan fuera de lo habitual que solo se explica por un error de escala.
export const MARGEN_TIPICO = { min: 1.06, max: 1.561 };

export const DIAGNOSTICO = {
  NORMAL: "MARGEN_NORMAL",
  POR_PESO: "DESCALZADO_POR_PESO_DE_PIEZA",
  POR_FACTOR: "DESCALZADO_POR_FACTOR_DE_PACK",
  BAJO: "MARGEN_BAJO_O_SIN_GANANCIA",
  ALTO_LEGITIMO: "MARGEN_ALTO_NO_EXPLICADO_POR_ESCALA",
  SIN_DATOS: "SIN_DATOS",
};

/** Number finito a partir de number | string | Decimal de Prisma. */
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * ¿Este producto se vende por PIEZA en el depósito?
 *
 * LLAMA al predicado compartido, no lo reimplementa. La primera versión de este
 * archivo escribía la condición a mano —con el argumento de que acá se evalúa un
 * estado HIPOTÉTICO, lo que el formulario está por guardar, y no una fila de la
 * base—. El candado `copiasPredicadoFiambre` la detectó y tiene razón:
 * `esFiambreFijo` es una función pura que recibe un objeto, así que le da igual
 * si ese objeto salió de Prisma o del formulario.
 *
 * Y la copia no era inocente: la mía no exigía `modoCompraProveedor === "UNIDAD"`
 * y la compartida sí, así que habría avisado en productos que el sistema NO trata
 * como pieza fija — un aviso sobre una conversión que nunca va a ocurrir.
 */
function esPiezaFija(e = {}) {
  return esFiambreFijo({
    unidad_medida: e.unidad_medida ?? e.unidadMedida,
    modoCompraProveedor: e.modoCompraProveedor,
    pesoReferenciaKg: e.pesoReferenciaKg,
    pesoEsFijo: e.pesoEsFijo,
    modoVentaDeposito: e.modoVentaDeposito,
  });
}

/**
 * EL FACTOR POR EL QUE HAY QUE MULTIPLICAR EL PRECIO VIEJO para que siga
 * significando lo mismo después del cambio.
 *
 * Devuelve `null` cuando no hay cambio de escala, o cuando lo hay pero no se
 * puede calcular el equivalente — y esos dos casos NO son lo mismo: el segundo
 * igual tiene que avisar, sin proponer número. Por eso el resultado lleva
 * `motivo` además del factor.
 */
export function factorDeConversion(antes = {}, despues = {}) {
  const eraPieza = esPiezaFija(antes);
  const esPieza = esPiezaFija(despues);

  // ── 1) Entra o sale del modo pieza fija ──────────────────────────────────
  if (!eraPieza && esPieza) {
    // El precio era por unidad/pieza y pasa a leerse por kilo: hay que dividirlo
    // por lo que pesa la pieza.
    const peso = num(despues.pesoReferenciaKg);
    if (peso === null || peso <= 0) return { factor: null, motivo: "PIEZA_SIN_PESO" };
    return { factor: 1 / peso, motivo: "PASA_A_PIEZA_FIJA" };
  }
  if (eraPieza && !esPieza) {
    const peso = num(antes.pesoReferenciaKg);
    if (peso === null || peso <= 0) return { factor: null, motivo: "PIEZA_SIN_PESO" };
    return { factor: peso, motivo: "DEJA_DE_SER_PIEZA_FIJA" };
  }

  // ── 2) Cambia el peso de la pieza, siguiendo en modo pieza ───────────────
  if (eraPieza && esPieza) {
    const p0 = num(antes.pesoReferenciaKg);
    const p1 = num(despues.pesoReferenciaKg);
    if (p0 === null || p1 === null || p0 <= 0 || p1 <= 0) return { factor: null, motivo: "PIEZA_SIN_PESO" };
    if (p0 === p1) return { factor: null, motivo: ESCALA_SIN_CAMBIO };
    // El precio por kilo NO cambia si cambia el peso de la pieza: lo que cambia
    // es cuánto sale una pieza, y eso lo deriva el sistema. No hay nada que
    // convertir.
    return { factor: null, motivo: ESCALA_SIN_CAMBIO };
  }

  // ── 3) Cambia el factor de pack ──────────────────────────────────────────
  const um0 = String(antes.unidad_medida ?? antes.unidadMedida ?? "").toLowerCase();
  const um1 = String(despues.unidad_medida ?? despues.unidadMedida ?? "").toLowerCase();
  const DE_BULTO = ["pack", "cajon"];
  const f0 = num(antes.factor_pack ?? antes.factorPack);
  const f1 = num(despues.factor_pack ?? despues.factorPack);

  const era = DE_BULTO.includes(um0) && f0 !== null && f0 > 1;
  const es = DE_BULTO.includes(um1) && f1 !== null && f1 > 1;

  if (era && es && f0 !== f1) {
    // El precio está cargado POR BULTO. Un bulto de 24 no vale lo que uno de 12.
    return { factor: f1 / f0, motivo: "CAMBIA_FACTOR_DE_PACK" };
  }
  if (era && !es) return { factor: f0 !== null && f0 > 0 ? 1 / f0 : null, motivo: "DEJA_DE_SER_BULTO" };
  if (!era && es) return { factor: f1, motivo: "PASA_A_SER_BULTO" };

  // ── 4) Cambió la unidad sin que se pueda derivar un equivalente ──────────
  //
  // "unidad" → "kg" sin pieza fija es el ejemplo: el precio de una unidad y el
  // precio de un kilo no tienen ninguna relación que el sistema pueda conocer.
  // Avisa igual, y a propósito sin sugerir número: inventar uno acá sería
  // exactamente el error que esta función viene a evitar.
  if (um0 && um1 && um0 !== um1) return { factor: null, motivo: "CAMBIA_UNIDAD_SIN_EQUIVALENCIA" };

  return { factor: null, motivo: ESCALA_SIN_CAMBIO };
}

/**
 * ¿EL MARGEN DE ESTE PRODUCTO DELATA UN DESCALCE DE ESCALA?
 *
 * ── EL REPARO, QUE ES LO QUE HACE QUE ESTO SIRVA ─────────────────────────────
 *
 * No marca "margen raro". Marca **un margen fuera de lo habitual que se explica
 * EXACTAMENTE por el factor de escala del producto** — dividirlo por el peso de
 * la pieza, o por el factor del pack, lo devuelve al rango normal.
 *
 * Esa distinción no es un detalle: medido sobre los 2.383 activos, hay **116
 * productos con margen alto que NO se explica por escala**. Un control que
 * marcara "margen alto" los señalaría a los 116 y sería ruido — y un control que
 * siempre devuelve ruido se lee salteado. Con este criterio salen **4**, que son
 * exactamente los cuatro productos convertidos a pieza fija con precio cargado.
 *
 * Los 120 de margen bajo tampoco entran acá: ésos son el caso de "se vende sin
 * ganancia", que ya tiene su propio aviso en la tarjeta.
 */
export function diagnosticarMargen({
  precioCosto,
  precioVenta,
  pesoReferenciaKg = null,
  factorPack = null,
  unidadMedida = null,
  rango = MARGEN_TIPICO,
} = {}) {
  const c = num(precioCosto);
  const v = num(precioVenta);
  if (c === null || v === null || c <= 0 || v <= 0) {
    return { diagnostico: DIAGNOSTICO.SIN_DATOS, ratio: null, sugerido: null };
  }

  const ratio = v / c;
  const dentro = (x) => x >= rango.min && x <= rango.max;

  if (dentro(ratio)) return { diagnostico: DIAGNOSTICO.NORMAL, ratio, sugerido: null };

  // El peso primero: es el caso medido.
  //
  // `peso !== 1` es REDUNDANTE hoy y se deja igual, con esta nota para que nadie
  // la borre creyendo que hace algo ni la defienda creyendo que protege: si el
  // peso es 1, `ratio / peso` es el mismo `ratio`, y acá solo se llega cuando el
  // ratio YA quedó fuera del rango. La rama no puede darse. Se conserva porque
  // hace explícito que el peso 1 no distingue escalas —son 12 productos así— y
  // porque dejaría de ser redundante si alguien cambiara el orden de las
  // comprobaciones. Comprobado sacándola: ningún candado se pone rojo.
  const peso = num(pesoReferenciaKg);
  if (peso !== null && peso > 0 && peso !== 1 && dentro(ratio / peso)) {
    return {
      diagnostico: DIAGNOSTICO.POR_PESO,
      ratio,
      sugerido: Number((v / peso).toFixed(2)),
    };
  }

  const f = num(factorPack);
  const um = String(unidadMedida || "").toLowerCase();
  if (["pack", "cajon"].includes(um) && f !== null && f > 1 && dentro(ratio / f)) {
    return {
      diagnostico: DIAGNOSTICO.POR_FACTOR,
      ratio,
      sugerido: Number((v / f).toFixed(2)),
    };
  }

  if (ratio < rango.min) return { diagnostico: DIAGNOSTICO.BAJO, ratio, sugerido: null };

  // Margen alto y NO explicado por ninguna escala: es una decisión comercial,
  // no un error. No se marca.
  return { diagnostico: DIAGNOSTICO.ALTO_LEGITIMO, ratio, sugerido: null };
}

/**
 * EL AVISO COMPLETO: qué precio queda mal, en qué ubicaciones, y con qué número
 * quedaría.
 *
 * @param {object} args
 * @param {object} args.antes     estado de escala guardado hoy
 * @param {object} args.despues   estado que el formulario está por guardar
 * @param {Array}  args.ubicaciones  [{ localId, nombre, precioVenta }]
 * @returns {object|null} null si no hay cambio de escala
 */
export function avisoDeCambioDeEscala({ antes = {}, despues = {}, ubicaciones = [] } = {}) {
  const { factor, motivo } = factorDeConversion(antes, despues);
  if (motivo === ESCALA_SIN_CAMBIO) return null;

  const filas = (ubicaciones || [])
    .map((u) => {
      const actual = num(u.precioVenta ?? u.precio_venta);
      if (actual === null || actual === 0) return null; // sin precio no hay nada que avisar
      const sugerido = factor === null ? null : Number((actual * factor).toFixed(2));
      return {
        localId: u.localId ?? null,
        nombre: u.nombre ?? null,
        precioActual: actual,
        precioSugerido: sugerido,
      };
    })
    .filter(Boolean);

  if (!filas.length) return null;

  return { motivo, factor, ubicaciones: filas };
}
