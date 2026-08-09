// lib/proveedores/listas/aplicacion.js
//
// REGLAS DE LA APLICACIÓN DE COSTOS. Módulo puro: sin BD, sin Next.
//
// Acá está la decisión de si una fila se escribe o no, y con qué números. El
// endpoint aporta los datos frescos de la base y ejecuta; todo el criterio vive
// en estas funciones para poder probarlo sin levantar Postgres.
//
// ── POR QUÉ SE REVALIDA TODO ────────────────────────────────────────────────
//
// Entre que se concilió el archivo y que alguien aprieta "Aplicar" pueden pasar
// horas. En el medio el producto pudo cambiar de factor, pasar a fiambre, mudar
// de dueño o recibir un costo nuevo por otra vía. Aplicar el número que quedó
// congelado en la conciliación escribiría un costo calculado con supuestos que
// ya no valen — y el costo es el dato del que cuelgan todos los precios.
//
// Por eso la revalidación NO confía en `costoMaestroPropuesto`: recalcula desde
// el producto vivo y recién compara. Si el número no coincide, la fila se omite
// con motivo, no se "actualiza sola": el usuario conció una propuesta concreta y
// aplicar otra distinta sin avisar sería cambiar el trato a mitad de camino.
//
// ── ESTRATEGIA ANTE INCONSISTENCIAS ─────────────────────────────────────────
//
// Fila que cambió → se omite ESA fila, con su motivo, y las demás se aplican.
// Error técnico de escritura → rollback completo. La diferencia importa: lo
// primero es una discrepancia de negocio prevista y aislable; lo segundo es que
// no sabemos en qué estado quedó la base, y ahí lo único seguro es no dejar nada.

import { esComboBase } from "../../combos/guards.js";
import { puedeEditarCosto } from "../../productos/propiedadCosto.js";
import { precioDesdeMargen, hayReglaAutomatica } from "../../precios/precioDesdeMargen.js";
import {
  aCentavos,
  mismoCosto,
  round2,
  aplicarRecargo,
  bloqueoPorUnidad,
  requiereConversionABulto,
  factorValido,
} from "./calculoCosto.js";
import { ESTADO_LINEA } from "./estados.js";
import { basePrecioDeFila, armadoConfirmadoPorElArchivo } from "./confirmarPresentacion.js";
import { multiplicadorConfirmadoUsable } from "./vigenciaConfirmacion.js";

// ── Modo de precio de venta ─────────────────────────────────────────────────
//
// Solo dos. No hay "fijar un precio a mano" desde acá: esta pantalla mueve
// costos de una lista completa, y ofrecer un precio manual masivo sería otra
// herramienta.
export const MODO_PRECIO_VENTA = {
  MANTENER_VENTA: "MANTENER_VENTA",
  RECALCULAR_POR_MARGEN: "RECALCULAR_POR_MARGEN",
};

export const TEXTO_MODO_PRECIO_VENTA = {
  MANTENER_VENTA: "Mantener el precio de venta",
  RECALCULAR_POR_MARGEN: "Recalcular la venta por margen",
};

export const MODO_PRECIO_VENTA_DEFAULT = MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN;

export function modoPrecioVentaValido(valor) {
  return valor === MODO_PRECIO_VENTA.MANTENER_VENTA ||
    valor === MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN;
}

/** El modo pedido, o el default. Un valor inventado NO se acepta en silencio como
 *  "mantener": el default de Arcor es recalcular y mentirle al usuario sobre qué
 *  hizo el sistema es peor que rechazar. El endpoint valida antes de llegar acá. */
export function resolverModoPrecioVenta(valor) {
  return modoPrecioVentaValido(valor) ? valor : MODO_PRECIO_VENTA_DEFAULT;
}

// ── Resultados y motivos ────────────────────────────────────────────────────

export const RESULTADO_FILA = {
  APLICADA: "APLICADA",
  OMITIDA: "OMITIDA",
};

export const MOTIVO_OMISION = {
  NO_SELECCIONADA: "NO_SELECCIONADA",
  ESTADO_NO_APLICABLE: "ESTADO_NO_APLICABLE",
  YA_APLICADA: "YA_APLICADA",
  PRODUCTO_INEXISTENTE: "PRODUCTO_INEXISTENTE",
  PRODUCTO_ES_COMBO: "PRODUCTO_ES_COMBO",
  PROPIEDAD_PERDIDA: "PROPIEDAD_PERDIDA",
  CONFIGURACION_CAMBIO: "CONFIGURACION_CAMBIO",
  COSTO_CAMBIO_DESDE_CONCILIACION: "COSTO_CAMBIO_DESDE_CONCILIACION",
  PROPUESTA_DIFERENTE: "PROPUESTA_DIFERENTE",
  UNIDAD_INCOMPATIBLE: "UNIDAD_INCOMPATIBLE",
  FACTOR_FALTANTE: "FACTOR_FALTANTE",
  PRECIO_NO_CREIBLE: "PRECIO_NO_CREIBLE",
  ERROR_DE_CALCULO: "ERROR_DE_CALCULO",
  SIN_CAMBIO: "SIN_CAMBIO",
};

// CADA MOTIVO DICE QUÉ PASÓ Y QUÉ HACER.
//
// Antes varios describían un estado interno y dejaban a la persona sin próximo
// paso. El peor era ERROR_DE_CALCULO —"No se pudo calcular el costo con los
// datos actuales"— que es donde caían las filas de display confirmadas: no
// nombraba el problema ni sugería nada, y el problema estaba en el sistema.
//
// La forma es siempre la misma: primero qué pasó, después qué hacer. Sin
// vocabulario del motor: nadie tiene por qué saber qué es un factor de bulto.
export const TEXTO_OMISION = {
  NO_SELECCIONADA: "No estaba tildada para aplicar. Tildala y volvé a aplicar.",
  ESTADO_NO_APLICABLE:
    "Dejó de estar lista: alguien la cambió mientras tanto. Abrila para ver cómo quedó.",
  YA_APLICADA: "Ya se había aplicado antes. Su costo nuevo ya está escrito.",
  PRODUCTO_INEXISTENTE:
    "El producto que tenía vinculado ya no existe. Vinculá la fila a otro producto.",
  PRODUCTO_ES_COMBO:
    "Es un combo: su costo sale de lo que lo compone, así que no se le escribe uno propio.",
  PROPIEDAD_PERDIDA:
    "El costo de este producto lo administra otra ubicación. Aplicalo desde ahí.",
  CONFIGURACION_CAMBIO:
    "Cambió la presentación del producto —unidad, armado o modo de compra— después de conciliar, " +
    "así que el costo calculado quedó viejo. Abrí la fila y volvé a elegir cómo leer el precio.",
  COSTO_CAMBIO_DESDE_CONCILIACION:
    "Alguien cambió el costo de este producto después de conciliar. La propuesta quedó vieja: " +
    "abrí la fila para ver el costo de hoy y decidir de nuevo.",
  PROPUESTA_DIFERENTE:
    "Con los datos de hoy, el costo da distinto del que se había propuesto. No se aplica un número " +
    "que nadie aprobó: abrí la fila y confirmá el nuevo.",
  UNIDAD_INCOMPATIBLE:
    "El producto se vende por kilo y la lista lo informa por unidad. No hay forma de pasar de uno " +
    "al otro sin saber cuánto pesa: corregí la unidad del producto.",
  FACTOR_FALTANTE:
    "El producto se compra por bulto pero no tiene cargado cuántas unidades trae. Cargá ese dato " +
    "en la ficha del producto y volvé a aplicar.",
  PRECIO_NO_CREIBLE:
    "El precio que trae la lista es cero o demasiado bajo para ser real. Revisá esa fila del archivo.",
  ERROR_DE_CALCULO:
    "La interpretación confirmada no se puede convertir en un costo con los datos de hoy. Suele ser " +
    "que cambió el armado del producto después de confirmar: abrí la fila y volvé a elegir la lectura.",
  SIN_CAMBIO: "El costo ya era ese: no había nada que cambiar.",
};

/** Texto de un motivo, con salida legible aunque llegue uno desconocido. */
export function textoOmision(motivo) {
  return TEXTO_OMISION[motivo] ?? "No se pudo aplicar.";
}

// ── Revalidación ────────────────────────────────────────────────────────────

/**
 * ¿Esta fila se puede aplicar AHORA, con el producto tal como está en la base?
 *
 * @param fila       fila persistida de la importación
 * @param base       producto vivo: { id, es_combo, creadoEnLocalId, precio_costo,
 *                   unidad_medida, factor_pack, modoCompraProveedor, margen,
 *                   redondeo_100 }
 * @param contexto   { operandoEnLocalId, depositoLocalId }
 * @param config     configuración del proveedor (recargo, piso de precio)
 * @param recargoPct recargo GUARDADO EN LA IMPORTACIÓN. No el de la config: la
 *                   importación se concilió con un recargo concreto y ese es el
 *                   que el usuario aprobó, aunque después alguien cambie el default.
 *
 * @returns {{ aplicable: boolean, motivo: string|null, costoNuevo: number|null,
 *             costoActual: number|null }}
 */
export function revalidarFila({ fila, base, contexto = {}, config = {}, recargoPct } = {}) {
  const no = (motivo) => ({ aplicable: false, motivo, costoNuevo: null, costoActual: base ? Number(base.precio_costo) : null });

  if (!fila) return no(MOTIVO_OMISION.ESTADO_NO_APLICABLE);
  if (fila.aplicada === true) return no(MOTIVO_OMISION.YA_APLICADA);
  if (fila.estado !== ESTADO_LINEA.LISTO_PARA_ACTUALIZAR) return no(MOTIVO_OMISION.ESTADO_NO_APLICABLE);
  if (!base) return no(MOTIVO_OMISION.PRODUCTO_INEXISTENTE);
  if (esComboBase(base)) return no(MOTIVO_OMISION.PRODUCTO_ES_COMBO);

  // Propiedad del costo, con los valores vivos. Un producto pudo cambiar de
  // dueño entre la conciliación y ahora.
  const permitido = puedeEditarCosto(
    contexto.operandoEnLocalId ?? null,
    base.creadoEnLocalId ?? null,
    contexto.depositoLocalId ?? null
  );
  if (!permitido) return no(MOTIVO_OMISION.PROPIEDAD_PERDIDA);

  // Precio creíble: se mide sobre el precio DE LISTA, antes del recargo, que es
  // el dato que informó el proveedor.
  const piso = Number(config.pisoPrecioCreible ?? 0);
  const precioLista = Number(fila.precioConIva);
  if (!Number.isFinite(precioLista) || precioLista <= 0 || (piso > 0 && precioLista < piso)) {
    return no(MOTIVO_OMISION.PRECIO_NO_CREIBLE);
  }

  // Kg y fiambre. Mismo predicado que la conciliación, sobre el producto VIVO:
  // un producto que pasó a fiambre después de conciliar deja de ser aplicable.
  if (bloqueoPorUnidad(base, "UNIDAD")) return no(MOTIVO_OMISION.UNIDAD_INCOMPATIBLE);

  // ── El costo, con EL MISMO resolvedor que usó la conciliación ─────────────
  //
  // No se recalcula con una fórmula propia. `resolverCostoMaestro` es lo que
  // sabe que "UN" multiplica por el factor solo si coincide con UxBU, que "BU"
  // ya viene en escala de bulto y NO se vuelve a multiplicar, y que "DI" no es
  // aplicable. Escribir acá una segunda versión de esa lógica es exactamente
  // como se corrompen los costos: dos implementaciones que se separan con el
  // tiempo y nadie se entera hasta que un cajón vale doce veces de más.
  const precioConRecargo = aplicarRecargo(precioLista, Number(recargoPct ?? 0));
  if (precioConRecargo === null || !Number.isFinite(precioConRecargo) || precioConRecargo <= 0) {
    return no(MOTIVO_OMISION.ERROR_DE_CALCULO);
  }

  const unidad = fila.unidadProveedor ?? null;
  const admitidas = config.unidadesAdmitidas ?? [];
  if (admitidas.length > 0 && !admitidas.includes(unidad)) {
    return no(MOTIVO_OMISION.ERROR_DE_CALCULO);
  }

  // ── Interpretación confirmada a mano ──────────────────────────────────────
  //
  // Cuando una persona confirmó qué es el producto respecto de lo que cotiza el
  // proveedor, ESA es la respuesta. Volver a preguntarle al resolvedor
  // devolvería el mismo "no puedo deducirlo" que dejó la fila trabada.
  //
  // El multiplicador confirmado vale 1 salvo que el archivo diga que el precio
  // es por unidad suelta y el producto agrupe varias. La CANTIDAD de la
  // presentación no participa: es un dato del producto, no un factor.
  //
  // No se saltea ninguna otra revalidación: producto vivo, propiedad del costo,
  // precio creíble, unidad compatible y las tres guardas de más abajo siguen
  // corriendo igual.
  //
  // Y tiene que estar VIGENTE. Una confirmación anterior a la última vinculación
  // eligió una interpretación para un producto que la fila ya no tiene: su
  // multiplicador no puede escribir un costo. No se borra —la autoría queda—,
  // deja de contar, y la fila cae al resolvedor como si nunca se hubiera
  // confirmado. Éste es el consumidor grave: acá se escribe en producción.
  const mult = fila.multiplicadorConfirmado;
  const confirmada = multiplicadorConfirmadoUsable(fila) && Number.isInteger(mult) && mult >= 1;
  // Multiplicar solo se admite cuando el archivo lo demuestra. Dos casos, y son
  // los MISMOS dos que el panel le ofrece a la persona, con el mismo predicado:
  //
  //   · precio por UNIDAD y producto que agrupa;
  //   · precio por DISPLAY cuando el archivo confirma el armado —el UxBU coincide
  //     con el `factor_pack`—, y entonces el único multiplicador legítimo es ese
  //     factor y ningún otro.
  //
  // Acá vivía una copia más vieja de esta regla, que solo admitía el primer caso.
  // Como una fila confirmada FALLA CERRADA, el efecto no fue aplicar de más sino
  // no aplicar: las filas de display confirmadas con la lectura del bulto se
  // omitían con "no se pudo calcular el costo", después de que alguien las
  // hubiera decidido. Dos copias de la misma regla, una desactualizada.
  const basePrecio = basePrecioDeFila(fila);
  const puedeMultiplicar =
    (basePrecio === "UNIDAD" && requiereConversionABulto(base)) ||
    (basePrecio === "DISPLAY" &&
      armadoConfirmadoPorElArchivo(fila, base) &&
      mult === Number(base.factor_pack));
  const multValido = confirmada && (mult === 1 || puedeMultiplicar);
  const costoConfirmado = multValido ? round2(precioConRecargo * mult) : null;

  // Una fila confirmada FALLA CERRADA. Si lo confirmado no da un costo
  // —multiplicador inválido, multiplicación que el archivo no habilita, base que
  // ya no se puede leer— la fila NO se aplica. Dejarla caer al resolvedor sería
  // peor que no confirmar nada: aplicaría un costo distinto del que la persona
  // aprobó.
  if (confirmada && (costoConfirmado === null || basePrecioDeFila(fila) === null)) {
    return no(MOTIVO_OMISION.ERROR_DE_CALCULO);
  }

  const requiereBulto = requiereConversionABulto(base);
  const factorErp = base.factor_pack ?? null;
  const conversion = costoConfirmado !== null
    ? { costoMaestro: costoConfirmado, motivo: null }
    : config.resolverCostoMaestro({
    unidadProveedor: unidad,
    unidadesPorBulto: fila.unidadesPorBulto ?? null,
    precioConRecargo,
    producto: {
      factorPack: factorErp,
      unidadMedida: base.unidad_medida,
      modoCompraProveedor: base.modoCompraProveedor,
      esCombo: base.es_combo === true,
      creadoEnLocalId: base.creadoEnLocalId ?? null,
    },
    requiereBulto,
    factorErp,
    factorErpValido: factorValido(factorErp),
    equivalenciaDisplay: config.equivalenciaDisplay,
  });

  if (conversion.motivo) {
    // El factor desapareció o dejó de coincidir con el armado del proveedor.
    const esFactor =
      conversion.motivo === "FACTOR_AUSENTE" ||
      conversion.motivo === "FACTOR_DIFIERE" ||
      conversion.motivo === "BULTO_SOBRE_UNIDAD_SUELTA";
    return no(esFactor ? MOTIVO_OMISION.FACTOR_FALTANTE : MOTIVO_OMISION.ERROR_DE_CALCULO);
  }

  const costoNuevo = conversion.costoMaestro;
  if (costoNuevo === null || !Number.isFinite(costoNuevo) || costoNuevo <= 0) {
    return no(MOTIVO_OMISION.ERROR_DE_CALCULO);
  }

  // La presentación cambió: el factor con el que se calculó no es el de ahora.
  const factorConciliado = fila.factorErp === null || fila.factorErp === undefined ? null : Number(fila.factorErp);
  if (factorConciliado !== null && Number(factorErp ?? 0) !== factorConciliado) {
    return { aplicable: false, motivo: MOTIVO_OMISION.CONFIGURACION_CAMBIO, costoNuevo, costoActual: Number(base.precio_costo) };
  }

  // El costo del producto se movió desde que se concilió: la diferencia que el
  // usuario aprobó ya no es la que se va a producir.
  const costoActual = Number(base.precio_costo);
  const costoAnteriorConciliado = fila.costoAnterior;
  if (costoAnteriorConciliado !== null && costoAnteriorConciliado !== undefined) {
    if (!mismoCosto(costoActual, costoAnteriorConciliado)) {
      return { aplicable: false, motivo: MOTIVO_OMISION.COSTO_CAMBIO_DESDE_CONCILIACION, costoNuevo, costoActual };
    }
  }

  // La propuesta recalculada tiene que ser la misma que se mostró.
  const propuestaGuardada = fila.costoMaestroPropuesto;
  if (propuestaGuardada !== null && propuestaGuardada !== undefined) {
    if (aCentavos(propuestaGuardada) !== aCentavos(costoNuevo)) {
      return { aplicable: false, motivo: MOTIVO_OMISION.PROPUESTA_DIFERENTE, costoNuevo, costoActual };
    }
  }

  // Nada que escribir.
  if (mismoCosto(costoActual, costoNuevo)) {
    return { aplicable: false, motivo: MOTIVO_OMISION.SIN_CAMBIO, costoNuevo, costoActual };
  }

  return { aplicable: true, motivo: null, costoNuevo, costoActual };
}

// ── Precio de venta ─────────────────────────────────────────────────────────

/**
 * Qué precio de venta corresponde para un costo nuevo.
 *
 * Devuelve `{ aplica: false }` cuando NO hay que tocar la venta: modo mantener,
 * o producto sin regla automática (sin margen configurado). Sin margen el precio
 * es manual y recalcularlo lo pisaría — misma semántica que el resto del ERP.
 */
export function ventaParaModo({ modo, costo, margenConfigurado, redondeo100 = false } = {}) {
  if (modo !== MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN) return { aplica: false, precioFinal: null };
  if (!hayReglaAutomatica(margenConfigurado)) return { aplica: false, precioFinal: null };
  const r = precioDesdeMargen({ costo, margenConfigurado, redondeo100 });
  if (!r.aplica || r.precioFinal === null) return { aplica: false, precioFinal: null };
  // Redondeo al final: la venta se persiste en Decimal(12,2).
  return { aplica: true, precioFinal: round2(r.precioFinal) };
}

/**
 * ¿Se pisa el override de costo de un local?
 *
 * Solo si el local NO tiene criterio propio: override ausente, o exactamente
 * igual al costo maestro anterior (venía arrastrando el maestro). Si difiere,
 * alguien lo cargó a mano para esa ubicación y esta herramienta no lo toca.
 */
export function debeActualizarOverride(overrideActual, costoMaestroAnterior) {
  if (overrideActual === null || overrideActual === undefined) return true;
  return mismoCosto(overrideActual, costoMaestroAnterior);
}

/** Lo mismo para el precio de venta del local. */
export function debeActualizarVentaOverride(ventaOverride, ventaMaestraAnterior) {
  if (ventaOverride === null || ventaOverride === undefined) return true;
  return mismoCosto(ventaOverride, ventaMaestraAnterior);
}

// ── Resumen ─────────────────────────────────────────────────────────────────

/** Cuenta el resultado de una corrida, agrupando los motivos de omisión. */
export function resumirAplicacion(resultados = []) {
  const motivos = {};
  let aplicadas = 0;
  let omitidas = 0;
  for (const r of resultados) {
    if (r.resultado === RESULTADO_FILA.APLICADA) {
      aplicadas++;
    } else {
      omitidas++;
      const k = r.motivo ?? "DESCONOCIDO";
      motivos[k] = (motivos[k] ?? 0) + 1;
    }
  }
  return {
    aplicadas,
    omitidas,
    total: resultados.length,
    motivos: Object.entries(motivos)
      .map(([motivo, cantidad]) => ({ motivo, cantidad, texto: textoOmision(motivo) }))
      .sort((a, b) => b.cantidad - a.cantidad),
  };
}
