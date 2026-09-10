// lib/transferencias/presentacionEnvio.js
//
// CÓMO SALIÓ LA MERCADERÍA DEL ORIGEN, Y CÓMO SE LEE ESO DESPUÉS.
//
// ── DOS FUENTES, Y NO SE MEZCLAN ──────────────────────────────────────────
//
// Una línea de transferencia puede contestar la pregunta de dos maneras:
//
//   · REGISTRADA — la línea trae su snapshot. Se despachó después de que el
//     sistema aprendiera a guardarlo, así que dice la verdad de aquel día
//     aunque el catálogo haya cambiado diez veces desde entonces.
//
//   · RECONSTRUIDA — la línea es anterior y no tiene snapshot. Se deduce del
//     catálogo de HOY, que es lo único que hay.
//
// La diferencia se expone en `registrado` y NO es cosmética: una reconstruida
// puede cambiar mañana si alguien edita el producto, y eso hay que poder saberlo
// antes de usarla para explicarle una diferencia a alguien.
//
// **Lo que no se hace es rellenar el hueco.** Dividir 48 unidades por el factor
// actual da "6 cajones" y suena bien, pero nadie registró eso: con 47 unidades
// la cuenta ni siquiera da entera, y el número saldría de un catálogo que pudo
// cambiar. Una fila sin snapshot dice "no se registró"; una rellenada diría "se
// registró así", que sería falso.
//
// ── POR QUÉ EL FACTOR TAMBIÉN SE CONGELA ─────────────────────────────────
//
// Porque de él sale la ARITMÉTICA, no solo el rótulo. La recepción multiplica
// por el factor para llegar a unidades físicas y `confirmar-recepcion` convierte
// piezas a kilos con el peso de referencia. Leerlos vivos significa que editar el
// producto después de despachar cambia cuánto stock entra al destino de una
// transferencia que ya salió.

import { PRESENTACION, agrupa, presentacionDeProducto } from "@/lib/productos/presentacionDeProducto";

export { PRESENTACION, agrupa };

/**
 * EL DESCRIPTOR DE UNA LÍNEA: qué presentación, con qué números.
 *
 * @param {object} linea Una línea de `TransferenciaDetalle` o su DTO. Se leen:
 *   presentacionEnvio, cantidadPresentada, sueltasEnviadas, factorPresentacion,
 *   pesoPiezaKg  → el snapshot;
 *   unidadEnviada, cantidad / cantidadEnviada  → lo que siempre estuvo;
 *   producto de catálogo (unidadMedida, factorPack, modoVentaDeposito,
 *   pesoReferenciaKg) → solo para reconstruir cuando no hay snapshot.
 *
 * @returns {{
 *   presentacion: string, cantidad: number, sueltas: number,
 *   factor: number|null, pesoPiezaKg: number|null, registrado: boolean
 * }}
 */
export function descriptorDeEnvio(linea = {}) {
  const cantidadFisica = Number(linea.cantidadEnviada ?? linea.cantidad ?? 0) || 0;

  // ── CAMINO 1: LA LÍNEA LO TRAE REGISTRADO ───────────────────────────────
  if (linea.presentacionEnvio) {
    const factor = linea.factorPresentacion == null ? null : Number(linea.factorPresentacion);
    const peso = linea.pesoPiezaKg == null ? null : Number(linea.pesoPiezaKg);
    return {
      presentacion: String(linea.presentacionEnvio),
      // `cantidadPresentada` es el dato; la física es el respaldo por si una
      // fila quedara a medias, que hoy no puede pasar porque se escriben juntas.
      cantidad: Number(linea.cantidadPresentada ?? cantidadFisica) || 0,
      sueltas: Number(linea.sueltasEnviadas ?? 0) || 0,
      factor: Number.isFinite(factor) && factor > 1 ? factor : null,
      pesoPiezaKg: Number.isFinite(peso) && peso > 0 ? peso : null,
      registrado: true,
    };
  }

  // ── CAMINO 2: RECONSTRUCCIÓN, MARCADA COMO TAL ──────────────────────────
  //
  // Se conserva EXACTAMENTE el comportamiento que había: la cantidad que se
  // muestra es la física, y `unidadEnviada` decide si se contó en bultos. Lo
  // único que se agrega es distinguir cajón de pack y kg de unidad, que es
  // información del producto y no una reinterpretación de la cantidad.
  const { presentacion, factor, pesoPiezaKg } = presentacionDeProducto({
    unidadMedida: linea.unidadMedida,
    factorPack: linea.factorPack,
    modoVentaDeposito: linea.modoVentaDeposito,
    pesoReferenciaKg: linea.pesoReferenciaKg,
    // SIN `modoCompraProveedor`: cómo el depósito le compra al proveedor no
    // decide en qué cuenta el local que recibe. Ver el comentario de PIEZA en
    // `presentacionDeProducto`.
    pesoEsFijo: linea.pesoEsFijo,
    contadoEn: linea.unidadEnviada || null,
  });

  return {
    presentacion,
    cantidad: cantidadFisica,
    sueltas: 0,
    factor,
    pesoPiezaKg,
    registrado: false,
  };
}

/**
 * Cuántas unidades físicas representa un descriptor.
 *
 * Es la misma cuenta que hace el stock —multiplicar UNA vez y sumar las
 * sueltas—, escrita acá una sola vez para que la pantalla y el servidor no
 * puedan discrepar. Para KG y PIEZA no hay conversión: la cantidad ES la escala.
 */
export function unidadesFisicasDelDescriptor(d = {}) {
  if (!agrupa(d.presentacion)) return Number(d.cantidad) || 0;
  const f = Number(d.factor);
  if (!Number.isFinite(f) || f <= 1) return Number(d.cantidad) || 0;
  return (Number(d.cantidad) || 0) * f + (Number(d.sueltas) || 0);
}

/**
 * LA TRADUCCIÓN DE UNA PRESENTACIÓN AL ENUM TÉCNICO DE `unidadEnviada`.
 *
 *     PACK, CAJÓN            → BULTO
 *     UNIDAD, KG, PIEZA      → UNIDAD
 *
 * Un agrupado SIN factor conocido también cae en UNIDAD: agrupa, pero no se sabe
 * con cuánto, y multiplicar por un factor inventado es peor que no agrupar.
 *
 * ── POR QUÉ ES UNA FUNCIÓN Y NO UN TERNARIO EN CADA PANTALLA ─────────────
 *
 * Porque `unidadEnviada` es un enum de base con dos valores y la presentación
 * tiene cinco: la traducción no es obvia y se estaba escribiendo a mano en tres
 * lugares. Además es lo que le permite a la pantalla de producto no declarado
 * dejar de PREGUNTARLA — el catálogo del origen ya contesta qué es el producto,
 * y pedirle al operador que lo traduzca a BULTO o UNIDAD es pedirle que haga a
 * mano una cuenta que el dominio ya tiene resuelta.
 *
 * @param {{presentacion: string, factor: number|null}} d
 * @returns {"BULTO"|"UNIDAD"}
 */
export function unidadFisicaDe(d = {}) {
  const factor = Number(d.factor);
  const agrupada = agrupa(d.presentacion) && Number.isFinite(factor) && factor > 1;
  return agrupada ? "BULTO" : "UNIDAD";
}

/**
 * LA ESCALA EN LA QUE SE RECIBE ESTA LÍNEA. Una sola respuesta para todo el repo.
 *
 * ── EL DEFECTO QUE ESTO CIERRA ──────────────────────────────────────────
 *
 * Cada ruta de recepción interpretaba la línea por su cuenta, y todas de la
 * misma forma equivocada:
 *
 *     cantidad:      d.cantidad
 *     unidadEnviada: d.unidadEnviada
 *     factorPack:    d.producto.base.factor_pack
 *
 * Para una línea con snapshot eso está mal. Una venta interna persiste la
 * cantidad FÍSICA consolidada —48— con `unidadEnviada = "UNIDAD"` y factor 1,
 * porque el POS ya había convertido. El snapshot dice que eso fueron 6 CAJÓN x8.
 * Leyendo los campos crudos, la recepción operaba en 48 UNIDAD: el operador
 * contaba cajones contra un campo que hablaba de unidades, y un pack incompleto
 * —5 cajones y 7 sueltas— ni siquiera se podía representar, porque con factor 1
 * `milesimasFisicas` rechaza el desglose.
 *
 * ── LA REGLA ────────────────────────────────────────────────────────────
 *
 * Con snapshot manda el snapshot: PACK y CAJÓN se reciben en BULTO con el factor
 * congelado, y UNIDAD, KG y PIEZA en UNIDAD con factor 1 —en esas tres la
 * cantidad YA está en la escala del dominio y multiplicar sería inventar—.
 *
 * Sin snapshot se conserva EXACTAMENTE lo de antes: la reconstrucción del
 * descriptor lee `unidadEnviada` como `contadoEn`, así que una línea vieja en
 * BULTO con factor 8 sigue dando BULTO y 8. No se reinterpreta ningún histórico.
 *
 * @param {object} linea Una línea en la forma que `descriptorDeEnvio` entiende.
 * @returns {{cantidad:number, sueltas:number, unidad:"BULTO"|"UNIDAD",
 *   factorPack:number, registrado:boolean, envio:object}}
 */
export function escalaDeEnvio(linea = {}) {
  const envio = descriptorDeEnvio(linea);
  const factor = Number(envio.factor);
  const agrupada = unidadFisicaDe(envio) === "BULTO";

  return {
    cantidad: Number(envio.cantidad) || 0,
    // Las sueltas solo significan algo dentro de un bulto. En UNIDAD, KG y PIEZA
    // la cantidad ya las contiene, y sumarlas las contaría dos veces.
    sueltas: agrupada ? Number(envio.sueltas) || 0 : 0,
    unidad: agrupada ? "BULTO" : "UNIDAD",
    factorPack: agrupada ? factor : 1,
    registrado: envio.registrado,
    envio,
  };
}

/**
 * LA IDENTIDAD DE UNA EDICIÓN. Es lo que va en la `key` de la ficha.
 *
 * ── EL DEFECTO QUE ESTO CIERRA ──────────────────────────────────────────
 *
 * La ficha inicializa su estado UNA vez —`useState(() => inicial())`— y el
 * consumidor la montaba con `key={seleccionado.id}`. Con eso, cambiar de
 * producto la remonta y el estado nace del producto nuevo, que era todo lo que
 * hacía falta… hasta que apareció una acción que cambia la ESCALA de la misma
 * línea sin cambiarle el id.
 *
 * Adoptar la presentación actual sobre una histórica hace exactamente eso:
 *
 *     antes    40 UNIDAD, el campo dice 40
 *     adopta   el servidor persiste 5 CAJÓN x8
 *     recarga  el id sigue siendo el mismo → React CONSERVA el estado
 *     queda    el rótulo dice "5 CAJÓN x8" y el campo sigue diciendo 40
 *
 * Y 40 cajones de 8 son 320 unidades. Es el mismo defecto que la propuesta en
 * escala física ya había costado una vez, por otra puerta.
 *
 * ── POR QUÉ UNA FIRMA Y NO UN `useEffect` QUE SINCRONICE ────────────────
 *
 * Un efecto que pisa el estado cuando cambian las props tiene que decidir
 * CUÁNDO pisar, y esa decisión se equivoca con el operador escribiendo: le
 * borraría lo que está tipeando cada vez que el padre recargue por otra razón.
 * La `key` no decide nada — React remonta cuando la identidad cambió, y la
 * identidad de una edición incluye en qué escala se está editando.
 *
 * Sale de `escalaDeEnvio` para que no pueda separarse de la escala real: si
 * mañana cambia qué determina la escala, esta firma cambia con ella.
 */
export function firmaDeEdicion(linea = {}) {
  const e = escalaDeEnvio(linea);
  return [
    linea.id ?? "sin-id",
    e.envio.presentacion,
    e.factorPack,
    e.cantidad,
    e.sueltas,
    // La marca de adopción entra aparte: dos adopciones que dieran los mismos
    // números seguirían siendo dos decisiones distintas.
    linea.presentacionAdoptadaAt ? String(linea.presentacionAdoptadaAt) : "",
  ].join("|");
}

/** El número, con coma decimal y sin ceros de relleno. */
function fmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

/**
 * EL RÓTULO QUE VE EL OPERADOR: "6 CAJÓN x8", "3,250 KG", "2 PIEZA".
 *
 * La presentación registrada es la PRINCIPAL. Las unidades físicas son
 * secundarias y se piden aparte —`rotuloFisicoDeEnvio`— porque para KG y PIEZA
 * decir "unidades" sería falso.
 */
export function rotuloDeEnvio(d = {}) {
  const cant = fmt(d.cantidad);
  switch (d.presentacion) {
    case PRESENTACION.PACK:
      return d.factor ? `${cant} PACK x${d.factor}` : `${cant} PACK`;
    case PRESENTACION.CAJON:
      return d.factor ? `${cant} CAJÓN x${d.factor}` : `${cant} CAJÓN`;
    case PRESENTACION.KG:
      return `${cant} KG`;
    case PRESENTACION.PIEZA:
      return `${cant} PIEZA`;
    default:
      return `${cant} UNIDAD`;
  }
}

/**
 * EL RÓTULO COMPLETO, CON EL BULTO INCOMPLETO: "5 CAJÓN x8 + 7 unidades sueltas".
 *
 * ── POR QUÉ NO ALCANZA CON `rotuloDeEnvio` ──────────────────────────────
 *
 * Aquél nombra la cantidad en su presentación y nada más, que es lo que la
 * pantalla necesita arriba del campo editable. Pero hay un lugar donde perder
 * las sueltas no es una omisión de estilo: **la auditoría de stock.**
 *
 * Un movimiento documentado como "recibido 5 BULTO" sobre un conteo de 5 cajones
 * más 7 sueltas es incompleto de una forma que no se puede reconstruir después:
 * la fila dice que se movió 1 unidad y el texto no explica de dónde salió ese 1.
 * Quien audite seis meses más tarde no tiene manera de llegar a 47 contra 48.
 *
 * Vale para los DOS lados. Un despacho mixto —4 packs de 6 más 5 sueltas— tiene
 * sueltas del lado ENVIADO desde que el snapshot las registra, y documentarlo
 * como "enviado 4 PACK x6" pierde 5 unidades del remito.
 *
 * No duplica nada: compone `rotuloDeEnvio` con el mismo formateador de números
 * del módulo. La aritmética sigue viviendo en `unidadesFisicasDelDescriptor`.
 */
export function rotuloConSueltas(d = {}) {
  const base = rotuloDeEnvio(d);
  const s = Number(d.sueltas) || 0;
  // Sin bulto no hay sueltas: en UNIDAD, KG y PIEZA la cantidad ya las contiene.
  if (!agrupa(d.presentacion) || s <= 0) return base;
  return `${base} + ${fmt(s)} ${s === 1 ? "unidad suelta" : "unidades sueltas"}`;
}

/** Solo el nombre de la presentación, sin cantidad: "CAJÓN x8", "KG". */
export function nombreDePresentacion(d = {}) {
  switch (d.presentacion) {
    case PRESENTACION.PACK:
      return d.factor ? `PACK x${d.factor}` : "PACK";
    case PRESENTACION.CAJON:
      return d.factor ? `CAJÓN x${d.factor}` : "CAJÓN";
    case PRESENTACION.KG:
      return "KG";
    case PRESENTACION.PIEZA:
      return "PIEZA";
    default:
      return "UNIDAD";
  }
}

/**
 * La línea secundaria: "48 unidades físicas".
 *
 * Devuelve `null` cuando no aporta nada o cuando sería MENTIRA: en KG y en
 * PIEZA la cantidad ya está en la escala del dominio y llamarla "unidades" es el
 * defecto que esta tanda vino a sacar.
 */
export function rotuloFisicoDeEnvio(d = {}) {
  if (!agrupa(d.presentacion)) return null;
  if (!d.factor) return null;
  const total = unidadesFisicasDelDescriptor(d);
  return `${fmt(total)} ${total === 1 ? "unidad física" : "unidades físicas"}`;
}

/**
 * Cómo se nombra una DIFERENCIA en esta presentación.
 *
 * En KG se expresa en kilos —"0,150 KG"— y en PIEZA en piezas. En los agrupados
 * la diferencia vive en unidades físicas, que es donde el pack incompleto tiene
 * sentido: faltar "medio cajón" no significa nada, faltar 1 unidad sí.
 */
export function unidadDeDiferencia(d = {}) {
  switch (d.presentacion) {
    case PRESENTACION.KG:
      return "KG";
    case PRESENTACION.PIEZA:
      return "PIEZA";
    default:
      return "unidades";
  }
}
