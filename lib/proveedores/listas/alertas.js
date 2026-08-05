// lib/proveedores/listas/alertas.js
//
// Señales de "mirá esta fila antes de aplicarla". Módulo puro: sin BD, sin Next.
//
// El código puede machear perfecto y el producto ser otro. Pasa cuando el
// proveedor cambia la presentación —la mermelada pasó de 454 g a 500 g— o cuando
// el nombre del ERP quedó viejo. El macheo no se equivoca en esos casos: el que
// cambió es el producto, y quien aplica tiene que enterarse.
//
// Estas alertas NO bloquean. Bloquear por gramaje dejaría afuera decenas de
// filas correctas donde el nombre del ERP simplemente está desactualizado. Lo
// que hacen es dirigir la atención: son pocas y se revisan a ojo.
//
// LO QUE NO SE USA COMO ALERTA, A PROPÓSITO
//
// El parecido de nombre. Se probó y marcaba 50 de 86 filas, casi todas macheos
// correctos: "SALSA BARBACOA LC x 250g" contra "Salba barbacoa la campagnola
// 250gr" es el mismo producto aunque compartan pocas palabras. Una alerta que
// se dispara siempre no es una alerta, es ruido, y termina haciendo que se
// ignoren también las que importan.

export const TIPO_ALERTA = {
  GRAMAJE: "GRAMAJE",
  FACTOR: "FACTOR",
  PRESENTACION: "PRESENTACION",
  VARIACION_ALTA: "VARIACION_ALTA",
};

export const TEXTO_ALERTA = {
  GRAMAJE: "El gramaje del archivo no coincide con el del producto.",
  FACTOR: "El factor de bulto cambió desde que se concilió.",
  PRESENTACION: "La presentación del producto cambió desde que se concilió.",
  VARIACION_ALTA: "La variación de costo supera el umbral del proveedor.",
};

/** Unidades de peso y volumen que aparecen en los nombres comerciales. */
const UNIDADES = "g|gr|grs|gramos|kg|kgs|ml|cc|lt|l";
const RE_GRAMAJE = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIDADES})\\b`, "gi");

/** Normaliza una unidad escrita de cualquier manera a su forma canónica. */
function unidadCanonica(u) {
  const x = String(u).toLowerCase();
  if (x === "gr" || x === "grs" || x === "gramos") return "g";
  if (x === "kgs") return "kg";
  if (x === "lt" || x === "l") return "l";
  return x;
}

/**
 * Los gramajes que menciona un texto, en forma canónica.
 *
 * "MERM. P.A. DURAZNO X 454g" → Set { "454g" }
 *
 * Se normaliza a la unidad base para poder comparar: 0,5 kg y 500 g son lo
 * mismo y no deberían disparar una alerta.
 */
export function gramajesDe(texto) {
  const out = new Set();
  if (!texto) return out;
  for (const m of String(texto).matchAll(RE_GRAMAJE)) {
    const valor = Number(String(m[1]).replace(",", "."));
    if (!Number.isFinite(valor)) continue;
    const unidad = unidadCanonica(m[2]);
    // Todo a gramos o mililitros para que 1kg y 1000g comparen igual.
    if (unidad === "kg") out.add(`${valor * 1000}g`);
    else if (unidad === "l") out.add(`${valor * 1000}ml`);
    else if (unidad === "cc") out.add(`${valor}ml`);
    else out.add(`${valor}${unidad}`);
  }
  return out;
}

/**
 * ¿Los gramajes de los dos textos se contradicen?
 *
 * Solo cuando LOS DOS mencionan alguno y no comparten ninguno. Si uno no dice
 * nada de gramaje, no hay contradicción: hay falta de información, que no es lo
 * mismo y no justifica una alerta.
 */
export function gramajeDiscrepa(textoLista, textoErp) {
  const a = gramajesDe(textoLista);
  const b = gramajesDe(textoErp);
  if (a.size === 0 || b.size === 0) return false;
  for (const g of a) if (b.has(g)) return false;
  return true;
}

/** Presentación legible de un producto del ERP: "pack de 12", "kg", "unidad". */
export function presentacionDe({ unidadMedida, factorPack } = {}) {
  const um = String(unidadMedida ?? "").toLowerCase();
  const f = Number(factorPack);
  const etiqueta = um === "cajon" ? "cajón" : um;
  if (!um) return "—";
  if (um === "pack" || um === "cajon" || um === "caja" || um === "carton") {
    return Number.isFinite(f) && f >= 1 ? `${etiqueta} de ${f}` : `${etiqueta} sin factor`;
  }
  return etiqueta;
}

/**
 * Las alertas de una fila ya conciliada, comparándola con el producto VIVO.
 *
 * @param fila  { descripcionProveedor, factorErp, variacionAlta, unidadProveedor }
 * @param base  { nombre, unidad_medida, factor_pack }
 * @returns Array<{ tipo, texto, detalle }>
 */
export function alertasDeFila(fila, base) {
  const alertas = [];
  if (!fila) return alertas;

  if (fila.variacionAlta === true) {
    alertas.push({
      tipo: TIPO_ALERTA.VARIACION_ALTA,
      texto: TEXTO_ALERTA.VARIACION_ALTA,
      detalle: fila.diferenciaPct === null || fila.diferenciaPct === undefined
        ? null
        : `${Number(fila.diferenciaPct) > 0 ? "+" : ""}${Number(fila.diferenciaPct).toFixed(1)} %`,
    });
  }

  if (!base) return alertas;

  if (gramajeDiscrepa(fila.descripcionProveedor, base.nombre)) {
    const a = [...gramajesDe(fila.descripcionProveedor)].join(" / ");
    const b = [...gramajesDe(base.nombre)].join(" / ");
    alertas.push({
      tipo: TIPO_ALERTA.GRAMAJE,
      texto: TEXTO_ALERTA.GRAMAJE,
      detalle: `archivo ${a} · ERP ${b}`,
    });
  }

  // El factor con el que se calculó contra el que tiene el producto ahora.
  const factorConciliado = fila.factorErp === null || fila.factorErp === undefined
    ? null : Number(fila.factorErp);
  const factorVivo = base.factor_pack === null || base.factor_pack === undefined
    ? null : Number(base.factor_pack);
  if (factorConciliado !== null && factorVivo !== null && factorConciliado !== factorVivo) {
    alertas.push({
      tipo: TIPO_ALERTA.FACTOR,
      texto: TEXTO_ALERTA.FACTOR,
      detalle: `conciliado ${factorConciliado} · ahora ${factorVivo}`,
    });
  }

  // Un producto que dejó de ser bulto —o pasó a serlo— cambia de escala y el
  // costo propuesto se calculó con la escala vieja.
  if (fila.presentacionConciliada && base.unidad_medida) {
    const ahora = presentacionDe({ unidadMedida: base.unidad_medida, factorPack: base.factor_pack });
    if (fila.presentacionConciliada !== ahora) {
      alertas.push({
        tipo: TIPO_ALERTA.PRESENTACION,
        texto: TEXTO_ALERTA.PRESENTACION,
        detalle: `${fila.presentacionConciliada} → ${ahora}`,
      });
    }
  }

  return alertas;
}

/** ¿La fila tiene alguna alerta? Atajo para filtrar. */
export function tieneAlerta(fila, base) {
  return alertasDeFila(fila, base).length > 0;
}
