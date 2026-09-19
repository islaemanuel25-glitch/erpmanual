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
  // La comparación de la propuesta ya no es al centavo. Ver dónde se usa.
  difierenSoloEnElRedondeo,
  diferenciaDeCosto,
} from "./calculoCosto.js";
import { ESTADO_LINEA } from "./estados.js";
import { productoEstaDeBaja } from "./productoDeBaja.js";
import { basePrecioDeFila, armadoConfirmadoPorElArchivo } from "./confirmarPresentacion.js";
import { multiplicadorConfirmadoUsable, rangoDeLaFila } from "./vigenciaConfirmacion.js";
// El precio del que sale el costo —lista, recargo comercial, impuesto adicional—
// lo arma UNA sola función, la misma que usó el panel al confirmar.
import { precioBaseDelCosto } from "./configuracionProveedor.js";
import { costoDeLaFila, MOTIVO_LECTURA } from "./eleccionDeLectura.js";
// El rango se vuelve a comprobar acá, sobre el costo que se va a escribir. Ver
// el bloque del final de `revalidarFila`.
import { quedaFueraDelRango, laEligioUnaPersona } from "./rangoAumento.js";
// UNA LISTA DE CONTROL NO ESCRIBE COSTOS. El candado que lo afirma está en
// `lib/proveedores/listas/controlNoEscribe.test.mjs`, con su contraprueba.
import { MODO_LISTA, modoDeImportacion } from "./modoDeLaLista.js";

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
  /** El producto se dio de baja entre conciliar y aplicar. */
  PRODUCTO_DADO_DE_BAJA: "PRODUCTO_DADO_DE_BAJA",
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
  /** El costo que se iba a escribir no cae en el rango del proveedor y nadie lo eligió. */
  FUERA_DE_RANGO: "FUERA_DE_RANGO",
  /** La lista se subió para controlar. Controlar no escribe. */
  LISTA_DE_CONTROL: "LISTA_DE_CONTROL",
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
  PRODUCTO_DADO_DE_BAJA:
    "El producto está dado de baja, así que no se le escribe costo. Si lo volvés a usar, activalo y aplicá de nuevo.",
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
  FUERA_DE_RANGO:
    "El costo que salía de esta lista no cae en el rango de aumento que cargaste para este proveedor, y nadie eligió esa lectura a mano. Abrí la fila, mirá las formas de leer el precio y elegí la que corresponde.",
  LISTA_DE_CONTROL:
    "Esta lista se subió para controlar, así que no cambia ningún costo. Si querés que actualice precios, usá «Pasar a actualizar precios» desde el resultado del control.",
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

  // ── CONTROLAR NO ESCRIBE, Y SE CORTA ACÁ ─────────────────────────────────
  //
  // Va PRIMERO, antes que cualquier otra condición, porque lo que decide no es
  // una propiedad de esta fila sino para qué se subió la lista entera. Poniéndolo
  // más abajo, una fila que fallara antes por otro motivo devolvería ese otro
  // motivo y el veredicto dependería del orden de los `if`.
  //
  // Y va acá, en la función que decide si una fila se escribe, en vez de solo en
  // la ruta que hoy aplica: la ruta es una y mañana puede haber otra. Esto es lo
  // que hace que el modo no se pueda saltear por olvido, y no depende de que el
  // estado de la línea diga la verdad —una fila controlada queda igual en
  // LISTO_PARA_ACTUALIZAR, porque el precio efectivamente difiere del costo—.
  if (modoDeImportacion(contexto.cabecera) === MODO_LISTA.CONTROLAR) {
    return no(MOTIVO_OMISION.LISTA_DE_CONTROL);
  }

  if (fila.aplicada === true) return no(MOTIVO_OMISION.YA_APLICADA);
  if (fila.estado !== ESTADO_LINEA.LISTO_PARA_ACTUALIZAR) return no(MOTIVO_OMISION.ESTADO_NO_APLICABLE);
  if (!base) return no(MOTIVO_OMISION.PRODUCTO_INEXISTENTE);

  // ── DADO DE BAJA: SE COMPRUEBA AL ESCRIBIR, NO SOLO AL CONCILIAR ─────────
  //
  // El universo de la conciliación ya deja afuera a los productos de baja, así
  // que en el camino normal esta fila no llega hasta acá. Pero entre conciliar
  // una lista y aplicarla pasan días, y en el medio alguien puede dar de baja el
  // producto: esa fila quedó conciliada, apuntando a un producto que ya no está.
  //
  // Filtrar al conciliar no la protege — la fila ya existe. Por eso la pregunta
  // se vuelve a hacer acá, con el producto tal como está HOY, que es la misma
  // razón por la que la propiedad del costo y el costo vivo también se
  // revalidan en esta función y no se confían a lo que decidió la conciliación.
  if (productoEstaDeBaja(base)) return no(MOTIVO_OMISION.PRODUCTO_DADO_DE_BAJA);

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

  // ── CUÁNDO LA UNIDAD COMERCIAL ES OBLIGATORIA, Y CUÁNDO NO EXISTE ────────
  //
  // `basePrecioDeFila` lee la columna de unidad comercial del archivo —UN, DI,
  // BU—, que solo manda Arcor. Un proveedor con enumerador propio no manda esa
  // columna Y NO LA NECESITA: sus lecturas son el precio tal cual y el precio
  // por el factor del bulto, y las arma su `lecturasPosibles`.
  //
  // Esta distinción YA ESTABA ESCRITA dos veces —en `puedeConfirmarse` y en
  // `resultadoConfirmacion`, las dos con el mismo comentario— y faltaba
  // justamente acá, que es donde se escribe el costo. El resultado: la pantalla
  // dejaba confirmar la fila, la marcaba lista, la contaba entre los 369 del
  // botón, y al aplicar la omitía con "no se pudo calcular el costo". Diez filas
  // que una persona había decidido de a una, tiradas en silencio.
  const leeUnidadDelArchivo = typeof config?.lecturasPosibles !== "function";

  const puedeMultiplicar =
    (basePrecio === "UNIDAD" && requiereConversionABulto(base)) ||
    (basePrecio === "DISPLAY" &&
      armadoConfirmadoPorElArchivo(fila, base) &&
      mult === Number(base.factor_pack)) ||
    // Sin columna de unidad, lo que habilita multiplicar es el factor del
    // catálogo: es el mismo multiplicador que la pantalla le ofreció.
    (!leeUnidadDelArchivo && requiereConversionABulto(base) && mult === Number(base.factor_pack));
  const multValido = confirmada && (mult === 1 || puedeMultiplicar);

  // ── EL COSTO CONFIRMADO SALE DEL MISMO PRECIO QUE VIO LA PERSONA ─────────
  //
  // `precioConRecargo` es SOLO el recargo comercial, fiel a su nombre y a su
  // columna, y es lo que el veto estructural del proveedor necesita más abajo.
  // NO es el precio del que sale el costo: falta el impuesto adicional del
  // proveedor, que va después del recargo. Acá se multiplicaba `precioConRecargo`
  // y ése era el defecto.
  //
  // Lo que la persona confirmó en el panel lo calculó `hipotesisDeCosto`, con el
  // impuesto puesto, y ese número quedó guardado en `costoMaestroPropuesto`. Unas
  // líneas más abajo hay una guarda que exige que el recálculo dé exactamente lo
  // guardado, al centavo, y omite la fila con PROPUESTA_DIFERENTE si no. Con el
  // impuesto perdido acá, esa guarda no podía dar otra cosa: en la importación #12
  // de producción, 1.160,25 guardado contra 1.050 recalculado, y las OCHO filas
  // confirmadas a mano omitidas en silencio. Mientras el proveedor tenga impuesto
  // adicional distinto de cero, TODAS las filas confirmadas se omitían — y con el
  // impuesto en cero ninguna, que es por qué el defecto no se veía en desarrollo.
  //
  // Por eso el precio se le pide a `precioBaseDelCosto`, que es la MISMA función
  // que usa `hipotesisDeCosto` para armar las lecturas que se le ofrecieron. No
  // una copia con el impuesto agregado: la misma, o esto se vuelve a separar.
  const precioBase = precioBaseDelCosto({
    precioLista,
    recargoPct,
    impuestoAdicionalPct: config.impuestoAdicionalPct ?? null,
  });
  // Una fila confirmada FALLA CERRADA, así que un precio base que no da un número
  // no multiplica nada: cae en el `if` de abajo con ERROR_DE_CALCULO.
  const precioBaseUsable = precioBase !== null && Number.isFinite(precioBase) && precioBase > 0;
  const costoConfirmado = multValido && precioBaseUsable ? round2(precioBase * mult) : null;

  // Una fila confirmada FALLA CERRADA. Si lo confirmado no da un costo
  // —multiplicador inválido, multiplicación que el archivo no habilita, base que
  // ya no se puede leer— la fila NO se aplica. Dejarla caer al resolvedor sería
  // peor que no confirmar nada: aplicaría un costo distinto del que la persona
  // aprobó.
  if (confirmada && (costoConfirmado === null || (leeUnidadDelArchivo && basePrecio === null))) {
    return no(MOTIVO_OMISION.ERROR_DE_CALCULO);
  }

  const requiereBulto = requiereConversionABulto(base);
  const factorErp = base.factor_pack ?? null;

  // ── LA PRESENTACIÓN CAMBIÓ ───────────────────────────────────────────────
  //
  // El factor con el que se calculó la propuesta no es el que tiene el producto
  // ahora. Va ANTES de calcular el costo, y el orden importa: desde que el rango
  // elige la lectura, un factor cambiado suele dar un costo que además queda
  // fuera del rango, y si esta guarda corriera después el usuario leería "no se
  // pudo calcular" en vez de "cambió el armado del producto". El motivo correcto
  // es el que le dice qué arreglar.
  const factorConciliado = fila.factorErp === null || fila.factorErp === undefined ? null : Number(fila.factorErp);
  if (factorConciliado !== null && Number(factorErp ?? 0) !== factorConciliado) {
    return { aplicable: false, motivo: MOTIVO_OMISION.CONFIGURACION_CAMBIO, costoNuevo: null, costoActual: Number(base.precio_costo) };
  }

  // LA MISMA FUNCIÓN QUE USÓ LA CONCILIACIÓN. No se le pregunta directo a
  // `resolverCostoMaestro`: desde el 2026-09-16 el rango elige entre las lecturas
  // posibles, y si eso se decidiera en dos lugares se repetiría el defecto que
  // este mismo archivo ya documenta unas líneas más arriba —dos copias de la
  // regla de multiplicación, una más vieja, y filas confirmadas que no se podían
  // aplicar—.
  const conversion = costoConfirmado !== null
    ? { ok: true, costoMaestro: costoConfirmado, motivo: null }
    : costoDeLaFila({
        fila,
        base,
        config,
        recargoPct,
        impuestoAdicionalPct: config.impuestoAdicionalPct ?? null,
        rango: rangoDeLaFila(fila, contexto.cabecera ?? null),
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
      });

  if (conversion.ok === false) {
    // El factor desapareció o dejó de coincidir con el armado del proveedor.
    const esFactor =
      conversion.motivo === "FACTOR_AUSENTE" ||
      conversion.motivo === "FACTOR_DIFIERE" ||
      conversion.motivo === "BULTO_SOBRE_UNIDAD_SUELTA";
    // Y una fila que quedó fuera del rango NO se aplica, aunque alguien la haya
    // seleccionado: entre conciliar y aplicar pudo cambiarle el costo al
    // producto, y el rango es justamente lo que detecta que la lectura dejó de
    // tener sentido. Falla cerrada, como todo lo de este archivo.
    //
    // Y SE DICE CUÁL DE LOS DOS FUE. Antes las dos salían como "no se pudo
    // calcular el costo", que manda a mirar el producto cuando lo que pasa es
    // que el precio de la lista no se parece a lo que aumenta el proveedor. Son
    // dos arreglos distintos.
    if (conversion.motivo === MOTIVO_LECTURA.FUERA_DE_RANGO) {
      return no(MOTIVO_OMISION.FUERA_DE_RANGO);
    }
    return no(esFactor ? MOTIVO_OMISION.FACTOR_FALTANTE : MOTIVO_OMISION.ERROR_DE_CALCULO);
  }

  const costoNuevo = conversion.costoMaestro;
  if (costoNuevo === null || !Number.isFinite(costoNuevo) || costoNuevo <= 0) {
    return no(MOTIVO_OMISION.ERROR_DE_CALCULO);
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

  // ── LA PROPUESTA RECALCULADA TIENE QUE SER LA MISMA QUE SE MOSTRÓ ───────
  //
  // Pero "la misma" NO es "idéntica al centavo", y exigir eso frenaba
  // escrituras legítimas. En la #12, siete filas se informaron como "su precio
  // cambió" cuando lo que difería eran siete centavos sobre $31.428 —el
  // 0,0002 %—, por dónde caía un redondeo intermedio. El precio no se había
  // movido; lo que no coincidía era la cuenta consigo misma.
  //
  // Se compara con una tolerancia, y el que decide es `difierenSoloEnElRedondeo`:
  // UN PESO, el mismo para un costo de $40 y para uno de $65.000. Por debajo de
  // eso, dos números no pueden ser dos precios distintos.
  //
  // ── Y SE ESCRIBE EL RECALCULADO, NO EL GUARDADO ────────────────────────
  //
  // Es el que sale de los datos de hoy y del mismo resolvedor que usó la
  // conciliación. El guardado es el mismo precio con el redondeo en otro lugar,
  // y escribirlo sería preferir a propósito el número que sabemos peor.
  //
  // ESTO ES LA RED, NO EL ARREGLO. La causa de esos centavos está resuelta donde
  // se producía —el unitario ya no se redondea antes de multiplicarlo por el
  // bulto, ver `generico.js`— y esta tolerancia cubre las filas que YA quedaron
  // conciliadas con el número viejo. Si empieza a tapar diferencias nuevas, hay
  // una segunda causa y hay que buscarla, no ensanchar el margen.
  const propuestaGuardada = fila.costoMaestroPropuesto;
  if (propuestaGuardada !== null && propuestaGuardada !== undefined) {
    if (!difierenSoloEnElRedondeo(propuestaGuardada, costoNuevo)) {
      return {
        aplicable: false,
        motivo: MOTIVO_OMISION.PROPUESTA_DIFERENTE,
        costoNuevo,
        costoActual,
        // Cuánto difiere, para que el aviso pueda decirlo en vez de afirmar que
        // el precio cambió, que es algo que esta función no sabe.
        diferencia: diferenciaDeCosto(propuestaGuardada, costoNuevo),
      };
    }
  }

  // Nada que escribir.
  if (mismoCosto(costoActual, costoNuevo)) {
    return { aplicable: false, motivo: MOTIVO_OMISION.SIN_CAMBIO, costoNuevo, costoActual };
  }

  // ── EL RANGO SE VUELVE A VERIFICAR ACÁ, FILA POR FILA ────────────────────
  //
  // Unas líneas más arriba hay un comentario que dice "una fila que quedó fuera
  // del rango NO se aplica". Era cierto solo para las filas que llegan sin
  // confirmar: la rama de `costoConfirmado` saltea `costoDeLaFila` entera, que
  // es donde vivía la única comparación contra el rango. O sea que la defensa
  // estaba escrita y era inalcanzable justo para las filas que una persona había
  // tocado.
  //
  // Lo que se midió: una fila de M Y F con la lista en 879,66 y el producto en
  // 1.000 la caja da dos lecturas, -7,6 % y +1.008,4 %, y NINGUNA cae en el 2–15
  // del proveedor. Como ninguna cae, `resultadoConfirmacion` deja confirmar
  // cualquiera —incluida la absurda— y la fila queda LISTO_PARA_ACTUALIZAR.
  // `revalidarFila` devolvía `aplicable: true` con costoNuevo 11.083,72.
  //
  // Ahora el rango se comprueba SIEMPRE y sobre el costo que se va a escribir.
  // La única puerta es que una persona lo haya elegido: `laEligioUnaPersona` mira
  // la confirmación vigente, que es el registro de que alguien contestó cómo leer
  // ese precio para ESTE producto. Lo que nadie eligió no se escribe.
  const rangoDeAplicacion = rangoDeLaFila(fila, contexto.cabecera ?? null);
  const fuera = quedaFueraDelRango({
    costoActual,
    costoNuevo,
    minPct: rangoDeAplicacion.minPct,
    maxPct: rangoDeAplicacion.maxPct,
  });
  if (fuera && !laEligioUnaPersona(fila)) {
    return { aplicable: false, motivo: MOTIVO_OMISION.FUERA_DE_RANGO, costoNuevo, costoActual };
  }

  return { aplicable: true, motivo: null, costoNuevo, costoActual, fueraDeRango: fuera };
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

// ── QUÉ VA A ESCRIBIR APLICAR, ANTES DE APLICAR ─────────────────────────────

/**
 * LOS CAMPOS DEL PRODUCTO QUE `revalidarFila` MIRA, Y NINGUNO MENOS.
 *
 * Es un `select` de Prisma y vive acá, al lado de la función que los consume,
 * porque el defecto que más veces pisó este repo es justamente éste: el campo que
 * una guarda necesita y el `select` no trae. Llega en `undefined`, la guarda
 * contesta lo que contesta un `undefined`, y nada avisa.
 *
 * Hay dos rutas que revalidan —aplicar y el resultado— y con el `select` escrito
 * en cada una, agregarle un campo a `revalidarFila` arregla una y deja la otra
 * decidiendo sobre un `undefined`. Se pide lo mismo en los dos lados o no se
 * pide.
 *
 * Qué decide cada uno: `activo` y `locales.activo` la baja del producto;
 * `creadoEnLocalId` la propiedad del costo; `es_combo` el combo;
 * `unidad_medida`, `factor_pack` y `modoCompraProveedor` la conversión;
 * `precio_costo` la comparación contra el costo de hoy. `precio_venta`, `margen`
 * y `redondeo_100` no los mira la revalidación: los usa quien escribe, y van acá
 * para que las dos rutas pidan una sola cosa.
 *
 * NO se filtra por `activo` en el `where` de quien lo use: un producto dado de
 * baja tiene que LLEGAR hasta la revalidación, porque lo que corresponde es
 * omitir la fila con su motivo. Filtrándolo caería en PRODUCTO_INEXISTENTE y el
 * cartel diría que hay que vincularla a otro producto, que es falso.
 */
export const CAMPOS_PRODUCTO_PARA_REVALIDAR = {
  id: true,
  nombre: true,
  precio_costo: true,
  precio_venta: true,
  margen: true,
  redondeo_100: true,
  es_combo: true,
  creadoEnLocalId: true,
  unidad_medida: true,
  factor_pack: true,
  modoCompraProveedor: true,
  pesoReferenciaKg: true,
  activo: true,
  locales: { select: { activo: true } },
};

/**
 * LAS FILAS QUE APLICAR VA A ESCRIBIR, Y LAS QUE VA A OMITIR CON SU MOTIVO.
 *
 * ── POR QUÉ EXISTE, Y POR QUÉ NO ES UN `for` EN CADA RUTA ──────────────────
 *
 * Este bucle ya estaba escrito en el resumen previo de `aplicar` —el GET— y
 * hacía falta también en el resultado, que es la pantalla donde se lee el número
 * grande y el botón. Escribirlo dos veces es exactamente la copia que este módulo
 * ya pagó una vez con la regla de multiplicación: dos versiones de "¿esta fila se
 * aplica?" que se separan, y el número que promete la pantalla deja de ser el que
 * escribe el motor.
 *
 * Acá no se decide nada: decide `revalidarFila`. Esto agrupa.
 *
 * ── POR QUÉ LAS OMITIDAS TRAEN LOS DOS NÚMEROS ─────────────────────────────
 *
 * Porque sin ellos el aviso no se puede escribir. "El costo da distinto del que
 * se había propuesto" sin decir cuánto era y cuánto es obliga a abrir la fila
 * para enterarse de qué cambió, y son las filas que una persona ya miró una vez.
 *
 * `costoGuardado` es la propuesta que se mostró y que quedó persistida;
 * `costoRecalculado` es lo que sale con los datos de HOY. Cuando difieren al
 * centavo, `revalidarFila` omite la fila con PROPUESTA_DIFERENTE, y ésos son los
 * dos números que la pantalla tiene que poder mostrar.
 *
 * Módulo puro: recibe las filas y los productos ya leídos, y no toca la base.
 *
 * @param filas      las filas candidatas —las que `aplicar` consulta:
 *                   `seleccionada: true, aplicada: false`—
 * @param productoDe (fila) => producto vivo o null
 * @param contexto   el mismo que consume `revalidarFila`
 * @param config     ídem, con `impuestoAdicionalPct` de la cabecera
 * @param recargoPct el GUARDADO en la importación
 *
 * Las aplicables vuelven CON SU COSTO, el que devolvió la revalidación. Quien
 * necesite sumarlos no vuelve a llamar a `revalidarFila`: preguntar dos veces lo
 * mismo es tener dos respuestas, y la que se muestra podría no ser la que se
 * escribe.
 *
 * @returns { aplicables, idsAplicables, cuantasAplicables, omitidas, idsOmitidas, porMotivo }
 */
export function revisarAntesDeAplicar({
  filas = [],
  productoDe = () => null,
  contexto = {},
  config = {},
  recargoPct,
} = {}) {
  const aplicables = [];
  const omitidas = [];
  const porMotivo = {};

  for (const fila of filas) {
    const base = productoDe(fila);
    const v = revalidarFila({ fila, base, contexto, config, recargoPct });
    if (v.aplicable) {
      aplicables.push({
        filaId: fila.id,
        fila,
        base,
        costoNuevo: v.costoNuevo ?? null,
        costoActual: v.costoActual ?? null,
        fueraDeRango: v.fueraDeRango === true,
      });
      continue;
    }
    const motivo = v.motivo ?? "DESCONOCIDO";
    porMotivo[motivo] = (porMotivo[motivo] ?? 0) + 1;
    omitidas.push({
      filaId: fila.id,
      filaExcel: fila.filaExcel ?? null,
      // El nombre del producto si lo hay; si no, lo que dice el archivo. Una
      // fila sin producto igual tiene que poder nombrarse en el aviso.
      nombre: base?.nombre ?? fila.descripcionProveedor ?? null,
      motivo,
      texto: textoOmision(motivo),
      costoGuardado: numeroONulo(fila.costoMaestroPropuesto),
      costoRecalculado: v.costoNuevo ?? null,
      costoActual: v.costoActual ?? null,
      // EN CUÁNTO DIFIERE, en pesos y en porcentaje. Lo calcula `revalidarFila`
      // con la misma función que decide si la diferencia alcanza para frenar, así
      // que el aviso no puede decir un número distinto del que tomó la decisión.
      diferencia: v.diferencia ?? null,
    });
  }

  return {
    aplicables,
    idsAplicables: aplicables.map((a) => a.filaId),
    cuantasAplicables: aplicables.length,
    omitidas,
    idsOmitidas: omitidas.map((o) => o.filaId),
    porMotivo,
  };
}

/** Las omitidas de un motivo, en el orden en que vienen las filas. */
export function omitidasPorMotivo(revision, motivo) {
  return (revision?.omitidas ?? []).filter((o) => o.motivo === motivo);
}

const numeroONulo = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

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
