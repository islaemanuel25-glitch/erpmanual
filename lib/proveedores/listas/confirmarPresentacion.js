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
import { recomendarHipotesis, clasificarVariacion, quedaFueraDelRango } from "./rangoAumento.js";
import { aplicarImpuestoAdicional } from "./configuracionProveedor.js";

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
  // NOMBRA LOS CUATRO CASOS, porque son los únicos que llegan acá y porque el
  // texto viejo —"solo se puede confirmar una fila que quedó por revisar"— era
  // verdad sobre el código y falso sobre la pantalla: se lo comía alguien que
  // estaba mirando justamente una fila por revisar.
  ESTADO_NO_CONFIRMABLE:
    "Esta fila no está esperando una lectura: o no se pudo leer, o no se le puede escribir el costo, o su código está repetido. Miralo en el detalle de la lista.",
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

/**
 * LOS ESTADOS EN LOS QUE TODAVÍA HAY UNA LECTURA QUE DECIDIR.
 *
 * ── POR QUÉ SON TRES Y NO UNO ──────────────────────────────────────────────
 *
 *   FACTOR_DUDOSO          nadie decidió y el motor no se anima. Es el caso
 *                          obvio, y era el único que esta puerta aceptaba.
 *   LISTO_PARA_ACTUALIZAR  hay un costo propuesto. Puede venir de que una
 *                          persona ya eligió —y quiere cambiar de opinión— o de
 *                          que el motor resolvió solo. Las dos se pueden mirar
 *                          desde la pantalla de revisar, así que las dos se
 *                          tienen que poder contestar.
 *   SIN_CAMBIOS            el costo no se mueve con la lectura que se eligió.
 *                          Que no cambie no significa que la lectura sea la
 *                          correcta: con otra, cambia.
 *
 * ── LO QUE FALTA ACÁ, Y ESTÁ AFUERA A PROPÓSITO ────────────────────────────
 *
 * NO_MACHEADO y CODIGO_DUPLICADO no tienen un producto al que escribirle el
 * costo; BLOQUEADO y ERROR no tienen un costo que escribir. Confirmar una
 * lectura sobre cualquiera de esos cuatro no guardaría una decisión: guardaría
 * una decisión que nadie va a poder aplicar.
 */
const ESTADOS_DECIDIBLES = new Set([
  ESTADO_LINEA.FACTOR_DUDOSO,
  ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
  ESTADO_LINEA.SIN_CAMBIOS,
]);

// ── LO QUE ESTABA ACÁ Y POR QUÉ SE FUE (2026-09-18) ─────────────────────────
//
// Había un `esConfirmadaEditable(fila)` que exigía, además del estado, que la
// fila tuviera una confirmación de persona VIGENTE. La puerta se abría para
// FACTOR_DUDOSO o para una fila ya confirmada; cualquier otra cosa se rechazaba
// con "Solo se puede confirmar una fila que quedó por revisar".
//
// EL CASO QUE LO ROMPIÓ, reproducido por Emanuel a 360 y después contra la base:
// vinculó un producto desde «No vinieron», el motor volvió a conciliar esa fila,
// el costo le dio +4,5 % —adentro del rango del proveedor— y la fila quedó
// LISTO_PARA_ACTUALIZAR con `confirmadoEn` en null. La pantalla de revisar la
// abre igual, porque se llega con `?filaId=`, y muestra las dos lecturas con la
// más probable marcada. Tocar «Usar $31.636,08 y seguir» no hacía NADA: el
// servidor contestaba 409 y la pantalla se quedaba donde estaba.
//
// NO ERA UN PROBLEMA DE «No vinieron». Es de cualquier fila que el motor haya
// resuelto solo, y estaba también en «Ver cómo se leyó y cambiarlo», el link que
// la lista de los que se actualizan pone justamente sobre filas que —por estar
// listas— NO están en la cola. Medido: la fila 16649 de la importación 22, que
// nadie tocó nunca, daba el mismo 409.
//
// El razonamiento del código viejo estaba escrito y decía: «la resolvió el motor,
// no alguien; no hay decisión que cambiar». Es al revés, y es la regla que este
// proyecto ya tiene escrita en otro lado: LA PROPUESTA DEL MOTOR NO ES LA
// ELECCIÓN DE NADIE. Precisamente por eso una persona tiene que poder
// contestarla — y al contestarla queda `confirmadoEn` con su autor, que es lo que
// antes no existía.
//
// El segundo motivo de la vigencia —«si se revinculó después de confirmar, la
// fila vuelve sola a la cola y entra por la puerta de siempre»— era falso por la
// misma razón: volver a conciliar no la deja necesariamente en FACTOR_DUDOSO.
// Puede dejarla LISTO_PARA_ACTUALIZAR, y entonces no entraba por ninguna puerta.
//
// La vigencia de la confirmación sigue importando donde sí decide algo: en
// `vigenciaConfirmacion`, que la usa para saber qué rango rige y si la lectura
// guardada todavía vale. Acá era una condición para PODER DECIDIR, y una persona
// mirando la pantalla siempre puede.

/**
 * ¿Se puede confirmar esta fila?
 *
 * `lecturasPropias` dice que el proveedor enumera sus lecturas por su cuenta, sin
 * la columna de unidad comercial del archivo. Ver el veto de abajo.
 */
export function puedeConfirmarse(fila, importacion, { lecturasPropias = false } = {}) {
  if (!importacion || !esImportacionAbierta(importacion.estado)) {
    return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.IMPORTACION_CERRADA };
  }
  if (!fila) return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.ESTADO_NO_CONFIRMABLE };
  if (fila.aplicada === true) return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.FILA_APLICADA };
  if (fila.excluidaManual === true) return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.EXCLUIDA };
  // ── SIN PRODUCTO SE CONTESTA PRIMERO, PORQUE ES LO QUE PASA ──────────────
  //
  // Va antes del estado a propósito. Una fila NO_MACHEADA no tiene producto Y
  // tiene un estado no decidible, así que las dos ramas la rechazan; la
  // diferencia es qué se le dice a la persona. "No tiene un producto del ERP"
  // nombra el problema y sugiere la acción —vincularlo—; "no se puede confirmar"
  // la deja adivinando.
  if (fila.productoBaseId === null || fila.productoBaseId === undefined) {
    return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.SIN_PRODUCTO };
  }
  // APLICADA SIGUE SIENDO INTOCABLE, y se rechaza más arriba: ahí el costo ya
  // está escrito en el producto y deshacerlo es otro problema, con otra
  // herramienta que hoy no existe.
  if (!ESTADOS_DECIDIBLES.has(fila.estado)) {
    return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.ESTADO_NO_CONFIRMABLE };
  }
  // Solo se exige la unidad comercial cuando es ella la que decide las lecturas.
  // Un proveedor con enumerador propio no manda esa columna Y NO LA NECESITA: sus
  // lecturas son el precio tal cual y el precio por el factor del bulto. Ver el
  // mismo veto en `resultadoConfirmacion`.
  if (!lecturasPropias && basePrecioDeFila(fila) === null) {
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
 * ¿EL ARCHIVO CONFIRMA EL ARMADO DEL PRODUCTO?
 *
 * O sea: ¿el ERP costea un bulto Y el proveedor informa que arma de a esa misma
 * cantidad? Es la condición que habilita leer el precio de un display como el
 * precio de una unidad comercial del bulto.
 *
 * VIVE EN UN SOLO LUGAR A PROPÓSITO. Estaba escrita adentro de `hipotesisDeCosto`
 * —lo que se le OFRECE a la persona— y el que ESCRIBE el costo tenía la suya,
 * más vieja, que solo admitía multiplicar cuando el precio era por unidad. El
 * resultado fue una fila que se podía confirmar y no se podía aplicar: el panel
 * proponía la lectura del bulto, alguien la elegía, y al aplicar la tanda la fila
 * se omitía con "no se pudo calcular el costo". Dos copias de la misma regla, una
 * de las dos desactualizada.
 *
 * La comparación contra el UxBU no es opcional: si el proveedor arma de a 16 y el
 * producto dice 14, uno de los dos está desactualizado y multiplicar por
 * cualquiera de los dos da un costo equivocado. Es la misma que ya aplica el
 * motor a las filas por unidad con `FACTOR_DIFIERE`.
 */
export function armadoConfirmadoPorElArchivo(fila, base) {
  const factorErp = base?.factor_pack;
  return (
    requiereConversionABulto(base) &&
    factorValido(factorErp) &&
    fila?.unidadesPorBulto !== null &&
    fila?.unidadesPorBulto !== undefined &&
    Number(fila.unidadesPorBulto) === Number(factorErp)
  );
}

/**
 * LAS HIPÓTESIS DE COSTO comercialmente válidas.
 *
 * Con display o bulto hay una sola: el precio ya está en la escala del envase.
 * Con precio por unidad hay dos o tres, según de dónde salga la cantidad del
 * pack. UxBU no genera ninguna, nunca.
 */
export function hipotesisDeCosto({ fila, base, recargoPct, impuestoAdicionalPct } = {}) {
  const basePrecio = basePrecioDeFila(fila);
  if (basePrecio === null) return [];

  // El orden importa y es éste: precio de lista → recargo comercial → impuesto
  // adicional. El recargo construye el costo del proveedor; el impuesto es lo
  // que ese proveedor agrega por fuera de los de su lista, así que va sobre el
  // costo ya armado y no sobre el precio pelado.
  //
  // El multiplicador va DESPUÉS de los dos, y da lo mismo: multiplicar por un
  // porcentaje y por una cantidad conmuta. Por eso mismo no hay una opción "por
  // unidad o por pack" — con un porcentaje las dos cuentas dan el mismo número.
  const conRecargo = aplicarImpuestoAdicional(
    aplicarRecargo(Number(fila?.precioConIva), Number(recargoPct ?? 0)),
    impuestoAdicionalPct
  );
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
    if (!armadoConfirmadoPorElArchivo(fila, base)) return [sinConversion];

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
export function analizarFila({ fila, base, recargoPct, rango, impuestoAdicionalPct, lecturasPosibles } = {}) {
  // SIN RANGO NO SE DECIDE NADA. Acá se caía a `RANGO_POR_DEFECTO`, que ya no
  // existe: el rango se carga por proveedor y una lista sin él no se concilia.
  // Se pasa el null tal cual y `recomendarHipotesis` contesta REVISAR, que es la
  // verdad —nadie dijo contra qué comparar— en vez de un veredicto calculado con
  // un criterio que nadie eligió.
  const minPct = rango?.minPct ?? null;
  const maxPct = rango?.maxPct ?? null;

  const presentacion = conciliarPresentacion(fila, base);
  // QUIÉN ENUMERA LAS LECTURAS ES EL PROVEEDOR, igual que en `costoDeLaFila`.
  //
  // `hipotesisDeCosto` lee la unidad comercial —UN, DI, BU— de una columna que
  // solo trae el archivo de Arcor. Para una fila genérica devuelve una lista
  // vacía, y con la lista vacía la pantalla de revisar no tendría ningún "Usar
  // $X" que ofrecer y el endpoint de confirmar rechazaría cualquier hipótesis.
  // O sea: las filas de un proveedor cualquiera se podrían mirar y no resolver.
  const enumerar = lecturasPosibles ?? hipotesisDeCosto;
  const hipotesis = enumerar({ fila, base, recargoPct, impuestoAdicionalPct });
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
  fila, base, clave, cantidadPresentacion, recargoPct, rango, impuestoAdicionalPct, lecturasPosibles,
  // ── EL AVISO QUE LA PANTALLA TIENE QUE HABER DADO ───────────────────────
  //
  // `true` significa: a la persona le mostraron que este costo NO cae en el
  // rango del proveedor y siguió igual. No es un parámetro de conveniencia, es
  // el hecho que después habilita escribir ese costo, y por eso se devuelve para
  // que la ruta lo persista con fecha y autor.
  //
  // Va en false por default a propósito: quien no lo manda no está aceptando
  // nada, y la confirmación de un costo fuera de rango se rechaza. Ésa es la
  // diferencia con la versión anterior, donde una lectura absurda se aceptaba
  // sola con tal de que ninguna otra cayera en rango.
  aceptarFueraDeRango = false,
} = {}) {
  // ── LA UNIDAD COMERCIAL SOLO SE EXIGE SI ES QUIEN DECIDE ─────────────────
  //
  // "No se sabe de qué presentación es el precio" es el veto correcto cuando las
  // lecturas salen de la columna de unidad del archivo: sin esa columna no hay
  // lecturas y no hay nada que confirmar.
  //
  // Cuando el proveedor trae su propio enumerador, esa columna no existe Y NO
  // HACE FALTA: las lecturas son el precio tal cual y el precio por el factor del
  // bulto, y las dos son perfectamente confirmables. Dejar el veto acá haría que
  // ninguna fila de un proveedor genérico se pudiera resolver a mano — se podría
  // mirar y no arreglar, que es la peor de las dos.
  if (!lecturasPosibles && basePrecioDeFila(fila) === null) {
    return { ok: false, motivo: TEXTO_NO_CONFIRMABLE.BASE_INDETERMINADA };
  }

  const analisis = analizarFila({ fila, base, recargoPct, rango, impuestoAdicionalPct, lecturasPosibles });
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

  // `precioConRecargo` y `montoRecargo` son SOLO el recargo comercial, fieles a
  // su nombre y a su columna. El impuesto adicional NO entra acá: vive en
  // `impuestoAdicionalPct` de la cabecera, y el costo se reconstruye desde la
  // fila como precio con recargo, por el impuesto, por el multiplicador.
  // Meterlo adentro de una columna que dice "recargo" haría que el número no se
  // pueda explicar sin leer el código.
  const precio = Number(fila?.precioConIva);
  const conRecargo = aplicarRecargo(precio, Number(recargoPct ?? 0));
  const costoNuevo = elegida.costoNuevo;
  const costoAnterior = analisis.costoActual;

  const v = calcularVariacion({ costoAnterior, costoNuevo, umbralPct: analisis.rango.maxPct });
  const clas = clasificarVariacion({
    costoActual: costoAnterior, costoNuevo,
    minPct: analisis.rango.minPct, maxPct: analisis.rango.maxPct,
  });

  // ── UN COSTO FUERA DEL RANGO SE ACEPTA SOLO CON EL AVISO DADO ────────────
  //
  // Acá arriba hay un veto que rechaza la lectura absurda "mientras haya algo
  // creíble". El agujero era la otra mitad: cuando NINGUNA lectura cae en rango
  // —que es justo por lo que la fila está en la cola— cualquiera se aceptaba sin
  // decir nada, y la fila quedaba LISTO_PARA_ACTUALIZAR con su +1.008 %.
  //
  // Ahora se rechaza salvo que la pantalla informe que ya lo avisó. No se veta
  // el caso: hay productos donde el costo cargado está mal y la lista tiene
  // razón. Se veta aceptarlo EN SILENCIO.
  const fueraDeRango = quedaFueraDelRango({
    costoActual: costoAnterior,
    costoNuevo,
    minPct: analisis.rango.minPct,
    maxPct: analisis.rango.maxPct,
  });
  if (fueraDeRango && aceptarFueraDeRango !== true) {
    return {
      ok: false,
      motivo:
        "Ese costo no cae en el rango de aumento que cargaste para este proveedor. Mirá el porcentaje de cada lectura y, si igual corresponde, confirmalo sabiendo que queda afuera.",
      fueraDeRango: true,
      variacionPct: clas.variacionPct,
    };
  }

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
    // Si este costo queda afuera del rango, y por lo tanto si la ruta tiene que
    // dejar registrada la aceptación. Va como dato y no como "ya lo guardé":
    // quien escribe en la base es la ruta, con su usuario y su fecha.
    fueraDeRango,
  };
}
