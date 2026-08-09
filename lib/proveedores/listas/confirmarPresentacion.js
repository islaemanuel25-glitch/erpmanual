// lib/proveedores/listas/confirmarPresentacion.js
//
// CONFIRMAR LA PRESENTACIÓN Y EL PRECIO de una fila que quedó por revisar.
//
// ── TRES DATOS QUE NO SE MEZCLAN ────────────────────────────────────────────
//
// 1. PRESENTACIÓN DEL PRODUCTO — cuántas unidades comerciales trae el envase que
//    se compra, se vende y se stockea. Sale de la descripción del proveedor y se
//    compara contra `factor_pack`. Se guarda EN LA FILA y nunca reescribe la
//    ficha del producto.
//
// 2. BASE DEL PRECIO — de qué cosa es el precio informado. Sale de la columna
//    U.M. del archivo y solo de ahí: UN es una unidad comercial, DI un display
//    completo, BU un bulto comercial.
//
// 3. NIVEL LOGÍSTICO DEL PROVEEDOR — el UxBU. Displays por bulto, cajas por caja
//    madre. ERP Azul no maneja ese nivel: NO es la cantidad del producto, NO
//    determina el armado y NO multiplica ningún precio. Se muestra como dato del
//    archivo y nada más.
//
// ── EL ÚNICO MULTIPLICADOR LEGÍTIMO ─────────────────────────────────────────
//
// El ERP guarda UN costo por producto, el de SU presentación.
//
//   · U.M. = DI o BU → el precio ya es el del envase cotizado. Multiplicador 1,
//     sin excepción. Un display de $5.678 cuesta $5.962 con recargo, traiga 12 o
//     traiga 18 adentro.
//
//   · U.M. = UN → el precio es de una unidad comercial. Si el producto del ERP
//     es esa unidad, multiplicador 1. Si agrupa varias, multiplicador igual a la
//     cantidad real del pack, que sale del `factor_pack` del ERP o de la
//     descripción del proveedor. NUNCA de UxBU.
//
// ── EL PORCENTAJE COMO EVIDENCIA ────────────────────────────────────────────
//
// Cuando hay dos hipótesis, la variación contra el costo actual delata cuál es
// imposible: una caja de 21 alfajores que hoy vale $21.000 no puede pasar a
// $1.050. Eso descarta lo absurdo; NO elige entre lo posible, y NUNCA confirma
// ni aplica solo.
//
// Módulo puro: sin BD, sin Next.

import {
  aplicarRecargo,
  round2,
  requiereConversionABulto,
  factorValido,
  calcularVariacion,
} from "./calculoCosto.js";
import { ESTADO_LINEA } from "./estados.js";
import { esImportacionAbierta } from "./persistencia.js";
import { presentacionDeDescripcion, compatibilidadDePresentacion } from "./presentacionDescripcion.js";
import { recomendarHipotesis, clasificarVariacion, RANGO_POR_DEFECTO } from "./rangoAumento.js";
// Solo depende de `rangoAumento`, así que no arma ciclo con este módulo.
import { confirmacionDeInterpretacionVigente } from "./vigenciaConfirmacion.js";

/** De qué cosa es el precio que informó el proveedor. Sale del archivo. */
export const BASE_PRECIO = {
  UNIDAD: "UNIDAD",
  DISPLAY: "DISPLAY",
  BULTO: "BULTO",
};

export const TEXTO_BASE_PRECIO = {
  UNIDAD: "una unidad suelta",
  DISPLAY: "un display completo",
  BULTO: "un bulto completo",
};

export const MOTIVO_NO_CONFIRMABLE = {
  IMPORTACION_CERRADA: "IMPORTACION_CERRADA",
  FILA_APLICADA: "FILA_APLICADA",
  ESTADO_NO_CONFIRMABLE: "ESTADO_NO_CONFIRMABLE",
  SIN_PRODUCTO: "SIN_PRODUCTO",
  EXCLUIDA: "EXCLUIDA",
  BASE_INDETERMINADA: "BASE_INDETERMINADA",
};

export const TEXTO_NO_CONFIRMABLE = {
  IMPORTACION_CERRADA: "La importación está cerrada.",
  FILA_APLICADA: "Esta fila ya se aplicó y no se puede modificar.",
  ESTADO_NO_CONFIRMABLE: "Solo se puede confirmar una fila que quedó por revisar.",
  SIN_PRODUCTO: "La fila no tiene un producto del ERP para confirmar.",
  EXCLUIDA: "La fila está excluida. Volvé a incluirla antes de confirmarla.",
  BASE_INDETERMINADA:
    "El archivo no dice de qué presentación es este precio, así que no hay forma de saber a qué corresponde. No se puede confirmar sin ese dato.",
};

/** Tope de la cantidad de una presentación. Más que esto es contenido interno. */
export const CANTIDAD_MAX = 1000;

/** El texto fijo del UxBU. Es un dato del archivo y nada más. */
export const LEYENDA_UXBU =
  "Dato logístico del proveedor. No se utiliza para calcular el armado ni el costo en ERP Azul.";

/**
 * De qué es el precio, según el archivo. `null` cuando no se puede determinar:
 * ahí se bloquea, no se supone.
 */
export function basePrecioDeFila(fila) {
  const u = String(fila?.unidadProveedor ?? "").trim().toUpperCase();
  if (u === "UN") return BASE_PRECIO.UNIDAD;
  if (u === "DI") return BASE_PRECIO.DISPLAY;
  if (u === "BU") return BASE_PRECIO.BULTO;
  return null;
}

/** Los dos estados en los que queda una fila después de confirmarla. */
const ESTADOS_YA_RESUELTA = new Set([ESTADO_LINEA.LISTO_PARA_ACTUALIZAR, ESTADO_LINEA.SIN_CAMBIOS]);

/**
 * ¿Es una fila ya resuelta por una persona, que todavía se puede corregir?
 *
 * Se pide la confirmación VIGENTE y no solo la fecha: si después de confirmar se
 * revinculó a otro producto, la fila vuelve sola a la cola y entra por la puerta
 * de siempre.
 */
export function esConfirmadaEditable(fila) {
  return (
    fila?.aplicada !== true &&
    ESTADOS_YA_RESUELTA.has(fila?.estado) &&
    confirmacionDeInterpretacionVigente(fila)
  );
}

/** ¿Se puede confirmar esta fila? */
export function puedeConfirmarse(fila, importacion) {
  if (!importacion || !esImportacionAbierta(importacion.estado)) {
    return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.IMPORTACION_CERRADA };
  }
  if (!fila) return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.ESTADO_NO_CONFIRMABLE };
  if (fila.aplicada === true) return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.FILA_APLICADA };
  if (fila.excluidaManual === true) return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.EXCLUIDA };
  // La puerta se abre para dos casos, y solo dos:
  //
  //   · La fila está por revisar —FACTOR_DUDOSO—: es la confirmación de siempre.
  //   · La fila YA fue confirmada y todavía NO se aplicó: cambiar de opinión.
  //     Confirmar la dejó en LISTO_PARA_ACTUALIZAR o SIN_CAMBIOS y, con la regla
  //     vieja, ese mismo éxito la volvía intocable: la única forma de corregir
  //     una lectura equivocada era no haberla confirmado nunca.
  //
  // APLICADA SIGUE SIENDO INTOCABLE, y se rechaza más arriba: ahí el costo ya
  // está escrito en el producto y deshacerlo es otro problema, con otra
  // herramienta que hoy no existe.
  if (fila.estado !== ESTADO_LINEA.FACTOR_DUDOSO && !esConfirmadaEditable(fila)) {
    return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.ESTADO_NO_CONFIRMABLE };
  }
  if (fila.productoBaseId === null || fila.productoBaseId === undefined) {
    return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.SIN_PRODUCTO };
  }
  if (basePrecioDeFila(fila) === null) {
    return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.BASE_INDETERMINADA };
  }
  return { ok: true, motivo: null };
}

/** Una cantidad de presentación válida: entero de 1 al tope. */
export function cantidadValida(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= CANTIDAD_MAX;
}

/**
 * LA CONCILIACIÓN DE PRESENTACIÓN, independiente de la del precio.
 *
 * Compara lo que dice la descripción del proveedor contra lo que tiene cargado
 * el producto. Que difieran no impide costear: son dos preguntas distintas.
 */
export function conciliarPresentacion(fila, base) {
  const desc = presentacionDeDescripcion(fila?.descripcionProveedor);
  return {
    cantidadDescripcion: desc.cantidad,
    contenidoInterno: desc.contenidoInterno,
    pesoTexto: desc.pesoTexto,
    origenCantidad: desc.origen,
    factorPackErp: base?.factor_pack ?? null,
    compatibilidad: compatibilidadDePresentacion({
      cantidadDescripcion: desc.cantidad,
      factorPack: base?.factor_pack,
    }),
    // Se muestra, no se usa. Ver LEYENDA_UXBU.
    unidadesPorBultoArchivo: fila?.unidadesPorBulto ?? null,
  };
}

/**
 * LAS HIPÓTESIS DE COSTO comercialmente válidas.
 *
 * Con display o bulto hay una sola: el precio ya está en la escala del envase.
 * Con precio por unidad hay dos o tres, según de dónde salga la cantidad del
 * pack. UxBU no genera ninguna, nunca.
 */
export function hipotesisDeCosto({ fila, base, recargoPct } = {}) {
  const basePrecio = basePrecioDeFila(fila);
  if (basePrecio === null) return [];

  const conRecargo = aplicarRecargo(Number(fila?.precioConIva), Number(recargoPct ?? 0));
  if (conRecargo === null || !Number.isFinite(conRecargo) || conRecargo <= 0) return [];

  const sinConversion = {
    clave: "MISMA_PRESENTACION",
    multiplicador: 1,
    costoNuevo: round2(conRecargo),
    origenCantidad: null,
    detalle:
      basePrecio === BASE_PRECIO.UNIDAD
        ? "El producto del ERP es esa misma unidad. El costo es el precio informado."
        : `El producto del ERP es ${TEXTO_BASE_PRECIO[basePrecio]} que cotiza el proveedor. El costo es el precio informado, sin multiplicar.`,
  };

  // ── DI: el display del proveedor NO siempre es el envase del ERP ─────────
  //
  // En 89 de las 93 filas DI del archivo real el precio tal cual ya explica el
  // costo que el producto tiene hoy: ahí el display ES el envase y multiplicar
  // sería un desastre. Por eso la lectura sin multiplicar sigue yendo primera y
  // sigue siendo la única en todas esas filas.
  //
  // Las otras son las galletitas x3: el proveedor cotiza el paquete de tres y el
  // ERP costea la caja que trae `factor_pack` de esos paquetes. Ahí el precio
  // tal cual hunde el costo un 93 % y la fila quedaba trabada sin ninguna
  // alternativa que ofrecer.
  //
  // LA SEGUNDA LECTURA SE OFRECE SOLO SI EL ARCHIVO CONFIRMA EL ARMADO. La
  // condición es la MISMA que el motor ya aplica a las filas por unidad
  // —`FACTOR_DIFIERE`—: si el proveedor arma de a 16 y el producto dice 14, uno
  // de los dos está desactualizado y multiplicar por cualquiera de los dos da un
  // costo equivocado. Sin esa coincidencia no se ofrece nada: un `factor_pack`
  // mal cargado no puede colarse dentro de una tarjeta que se ve razonable.
  //
  // Esto NO cambia lo que el motor aplica solo. La conversión automática de DI
  // sigue negándose (`DISPLAY_SIN_EQUIVALENCIA`) y estas filas siguen pidiendo
  // que alguien decida: lo único que cambia es que ahora hay entre qué elegir.
  if (basePrecio === BASE_PRECIO.DISPLAY) {
    const factorErp = base?.factor_pack;
    const armadoConfirmado =
      requiereConversionABulto(base) &&
      factorValido(factorErp) &&
      fila?.unidadesPorBulto !== null &&
      fila?.unidadesPorBulto !== undefined &&
      Number(fila.unidadesPorBulto) === Number(factorErp);

    if (!armadoConfirmado) return [sinConversion];

    const n = Number(factorErp);
    return [
      sinConversion,
      {
        clave: `PACK_${n}`,
        multiplicador: n,
        costoNuevo: round2(conRecargo * n),
        origenCantidad: "factor_pack del ERP, y el archivo informa el mismo armado",
        detalle: `El proveedor cotiza el envase que arma, y este producto del ERP es el bulto de ${n}. El costo es el precio por ${n}.`,
      },
    ];
  }

  // BU: el precio ya es el del bulto. No hay nada que multiplicar.
  if (basePrecio !== BASE_PRECIO.UNIDAD) return [sinConversion];

  const lista = [sinConversion];
  const desc = presentacionDeDescripcion(fila?.descripcionProveedor);
  const vistas = new Set([1]);

  const agregar = (n, origen) => {
    if (!cantidadValida(n) || n === 1 || vistas.has(Number(n))) return;
    vistas.add(Number(n));
    lista.push({
      clave: `PACK_${n}`,
      multiplicador: Number(n),
      costoNuevo: round2(conRecargo * Number(n)),
      origenCantidad: origen,
      detalle: `El proveedor cotiza la unidad y este producto agrupa ${n}. El costo es el precio por ${n}.`,
    });
  };

  // El producto solo puede agrupar si el ERP lo guarda como pack.
  if (requiereConversionABulto(base)) agregar(base?.factor_pack, "factor_pack del ERP");
  agregar(desc.cantidad, "descripción del proveedor");

  return lista;
}

/**
 * Todo lo que hace falta para decidir, en un solo lugar: la presentación, las
 * hipótesis evaluadas contra el rango, y cuál se recomienda.
 */
export function analizarFila({ fila, base, recargoPct, rango } = {}) {
  const minPct = rango?.minPct ?? RANGO_POR_DEFECTO.minPct;
  const maxPct = rango?.maxPct ?? RANGO_POR_DEFECTO.maxPct;

  const presentacion = conciliarPresentacion(fila, base);
  const hipotesis = hipotesisDeCosto({ fila, base, recargoPct });
  const costoActual =
    base?.precio_costo === null || base?.precio_costo === undefined ? null : Number(base.precio_costo);

  const r = recomendarHipotesis({ hipotesis, costoActual, minPct, maxPct });

  return {
    basePrecio: basePrecioDeFila(fila),
    presentacion,
    costoActual,
    rango: { minPct, maxPct },
    ...r,
  };
}

/**
 * Cómo queda la fila al confirmar una hipótesis.
 *
 * La hipótesis tiene que ser una de las que el archivo habilita, y no puede ser
 * una absurda: esas se muestran explicadas pero no son elegibles.
 */
export function resultadoConfirmacion({
  fila, base, clave, cantidadPresentacion, recargoPct, rango,
} = {}) {
  if (basePrecioDeFila(fila) === null) {
    return { ok: false, motivo: TEXTO_NO_CONFIRMABLE.BASE_INDETERMINADA };
  }

  const analisis = analizarFila({ fila, base, recargoPct, rango });
  const elegida = analisis.evaluadas.find((h) => h.clave === clave);
  if (!elegida) {
    return { ok: false, motivo: "Esa interpretación no corresponde a lo que informa el archivo." };
  }
  // UNA ABSURDA NO SE ELIGE MIENTRAS HAYA ALGO CREÍBLE.
  //
  // Pero cuando NINGUNA lo es —`REVISAR`— rechazarlas todas dejaba la fila sin
  // salida: el panel mostraba la única lectura tachada de imposible y el botón
  // apagado, y no había forma de avanzar ni de equivocarse a propósito. Que una
  // fila no tenga sugerencia no puede significar que no tenga opciones.
  //
  // Se acepta explicada y elegida a mano, nunca sugerida y nunca aplicada sola:
  // el resultado sigue siendo LISTO_PARA_ACTUALIZAR con su variación a la vista.
  if (elegida.absurda && analisis.resultado !== "REVISAR") {
    return {
      ok: false,
      motivo:
        "Esa interpretación cambia el costo de orden de magnitud, así que no puede ser la correcta. Si igual corresponde, revisá antes el producto vinculado o el costo anterior.",
    };
  }
  if (cantidadPresentacion !== null && cantidadPresentacion !== undefined && !cantidadValida(cantidadPresentacion)) {
    return { ok: false, motivo: `La cantidad de la presentación tiene que ser un entero de 1 a ${CANTIDAD_MAX}.` };
  }

  const precio = Number(fila?.precioConIva);
  const conRecargo = aplicarRecargo(precio, Number(recargoPct ?? 0));
  const costoNuevo = elegida.costoNuevo;
  const costoAnterior = analisis.costoActual;

  const v = calcularVariacion({ costoAnterior, costoNuevo, umbralPct: analisis.rango.maxPct });
  const clas = clasificarVariacion({
    costoActual: costoAnterior, costoNuevo,
    minPct: analisis.rango.minPct, maxPct: analisis.rango.maxPct,
  });

  // SIN_CAMBIOS solo cuando el costo realmente no se mueve. La fila sigue
  // visible: no desaparece por no aumentar.
  const sinCambio = costoAnterior !== null && v.diferenciaCentavos === 0;

  return {
    ok: true,
    estado: sinCambio ? ESTADO_LINEA.SIN_CAMBIOS : ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    clave: elegida.clave,
    multiplicador: elegida.multiplicador,
    // La cantidad de la presentación se guarda SIEMPRE como dato de la fila,
    // multiplique o no, y nunca toca ProductoBase.factor_pack.
    cantidadPresentacion: cantidadValida(cantidadPresentacion)
      ? Number(cantidadPresentacion)
      : (analisis.presentacion.cantidadDescripcion ?? null),
    costoNuevo,
    costoAnterior,
    precioConRecargo: round2(conRecargo),
    montoRecargo: round2(conRecargo - precio),
    diferencia: v.diferencia,
    diferenciaPct: v.diferenciaPct,
    estadoVariacion: clas.estado,
    variacionPct: clas.variacionPct,
    // El flag histórico de la cabecera: se conserva para no romper contadores.
    variacionAlta: v.variacionAlta === true,
    rango: analisis.rango,
  };
}
