// lib/pos-ventas/cobroPantalla.js
//
// LO QUE EL PANEL DE COBRO DEL POS DIBUJA Y MANDA.
//
// ── EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR ────────────────────────
//
// `FormaPago.jsx` derivaba la `key` de cada botón de `tipoContable.toLowerCase()`.
// Eso alcanzaba mientras un tipo contable fuera un botón, y se rompe solo desde
// que los medios se configuran:
//
//     Banco X       → CREDITO
//     Mercado Pago  → CREDITO   (por una modalidad de crédito)
//
// Son DOS botones distintos con la misma key. React reusaría el nodo, el select
// de "Dividir pago" no podría distinguirlos, y el segundo tender pisaría al
// primero. Nada de eso tira un error: da un cobro equivocado.
//
// Acá la identidad de un botón es la del `MedioCobroLocal`, y la de una opción
// cobrable es la de la modalidad cuando hay. Es la MISMA clave que usa el
// preview —`claveCobro`— así que el número que se muestra y el que se cobra se
// buscan con lo mismo.
//
// ── LOS DEFAULTS NO TIENEN ID, Y NO SE LES INVENTA UNO ─────────────────────
//
// Un local sin configurar recibe cuatro medios sin fila. Esos siguen
// direccionándose por su tipo contable, exactamente como hasta hoy, y su cobro
// sigue viajando por `formaPago`. No se les fabrica un id para uniformar: un id
// inventado es lo único peor que dos formas de clave.
//
// ── PURO ───────────────────────────────────────────────────────────────────
//
// Nada de acá calcula plata. Los totales salen del preview, que llama al MISMO
// motor que corre en el servidor. Este archivo elige QUÉ mostrar y arma QUÉ
// mandar; el cuánto no es asunto suyo.

import { MEDIO_LABEL } from "./pagos.js";
import { MEDIOS_POR_DEFECTO } from "./mediosCobro.js";
import { claveCobro, condicionDeMedio, condicionDeModalidad, modalidadesActivas } from "./modalidadesDeMedio.js";

/**
 * LOS BOTONES DEL PANEL, uno por medio activo del local.
 *
 * Un medio con modalidades sigue siendo UN botón. Esa es la regla visual central
 * del diseño: "Mercado Pago" es un botón que abre un selector, y no tres botones
 * llamados Mercado Pago, Mercado Pago Crédito y Mercado Pago Débito.
 *
 * Sin configuración —modo offline, o una pantalla que todavía no la pasa— se cae
 * a `MEDIOS_POR_DEFECTO`, que es la MISMA constante que usa el servidor. Una
 * segunda lista escrita acá mostraría botones distintos de los que el backend
 * cobra el día que una de las dos cambie.
 */
export function botonesDeCobro(mediosCobro) {
  if (!Array.isArray(mediosCobro) || mediosCobro.length === 0) {
    return MEDIOS_POR_DEFECTO.map((d) => botonDeMedio({
      id: null,
      nombre: MEDIO_LABEL[d.tipoContable] || d.tipoContable,
      activo: true,
      tipoContable: d.tipoContable,
      procesador: d.procesador,
      recargoPct: 0,
      comisionPct: null,
      modalidades: [],
    }));
  }
  return mediosCobro.filter((m) => m?.activo !== false).map(botonDeMedio);
}

/** Un medio compuesto, en la forma que dibuja el panel. */
export function botonDeMedio(medio) {
  const activas = modalidadesActivas(medio);
  return {
    // La clave estable del botón. Con fila es su id; sin fila —un default— es su
    // tipo contable, que es lo único estable que tiene antes de existir.
    clave: medio?.id != null ? `medio:${medio.id}` : `tipo:${medio?.tipoContable}`,
    medioCobroLocalId: medio?.id ?? null,
    nombre: medio?.nombre,
    tipoContable: medio?.tipoContable,
    procesador: medio?.procesador ?? null,
    // Lo que viaja como `formaPago` en el cuerpo, que es el contrato de hoy y no
    // se toca. Con modalidad elegida se recalcula sobre el tipo de la modalidad.
    formaPagoLegacy: String(medio?.tipoContable ?? "").toLowerCase(),
    modalidades: activas,
    // ── LA REGLA VISUAL, Y NO ES LA DEL SERVIDOR ──────────────────────────
    //
    // El servidor resuelve solo una modalidad cuando hay UNA sola activa
    // (`requiereModalidad` es >= 2). La pantalla NO usa esa regla: con una o con
    // cinco abre el selector.
    //
    // El motivo es de uso, no de dominio: un botón que unas veces cobra al toque
    // y otras abre una pantalla es un botón en el que no se puede confiar, y el
    // cajero cobra mirando la mano, no la pantalla. La regla queda estable —medio
    // con modalidades, selector— y si más adelante medimos que ahorrar un toque
    // vale la pena, se cambia acá y en un solo lugar.
    abreSelector: activas.length >= 1,
    // La condición del propio medio, para cuando no hay modalidades. Es lo que
    // el preview indexa.
    condicion: condicionDeMedio(medio),
  };
}

/** Las opciones que muestra el selector de un botón: una por modalidad activa. */
export function opcionesDeModalidad(boton, medio) {
  return (boton?.modalidades ?? []).map((modalidad) => {
    const condicion = condicionDeModalidad(medio ?? { id: boton.medioCobroLocalId, nombre: boton.nombre, procesador: boton.procesador }, modalidad);
    return {
      clave: claveCobro(condicion),
      modalidadId: modalidad.id,
      nombre: modalidad.nombre,
      recargoPct: Number(modalidad.recargoPct) || 0,
      tipoContable: modalidad.tipoContable,
      condicion,
    };
  });
}

/**
 * LA CLAVE CON LA QUE SE LE PREGUNTA EL TOTAL AL PREVIEW.
 *
 * Un botón sin modalidades pregunta por sí mismo; con modalidad elegida,
 * pregunta por la modalidad. Es `claveCobro` y no una segunda convención: si el
 * preview y la pantalla indexaran distinto, el número que se muestra podría no
 * ser el de la opción que se está mirando.
 */
export function claveDeOpcion(boton, modalidad = null) {
  if (modalidad) return claveCobro({ modalidadId: modalidad.modalidadId ?? modalidad.id });
  return claveCobro(boton?.condicion ?? {});
}

/**
 * EL TOTAL DE UN BOTÓN, que con modalidades puede no ser un número.
 *
 * Sin modalidades hay un total. Con modalidades hay uno por cada una, y si
 * difieren no existe un total honesto para el botón: se informa el rango y el
 * importe real vive en cada opción del selector. Es la misma decisión que ya
 * tomaba el panel cuando los cuatro medios daban distinto.
 *
 * @returns {{total:number|null, min:number, max:number, difiere:boolean}}
 */
export function totalDeBoton(boton, previewPorOpcion, totalPorDefecto = 0) {
  const leer = (clave) => {
    const p = previewPorOpcion?.[clave];
    return p ? Number(p.total) : null;
  };

  if (!boton?.abreSelector) {
    const t = leer(claveDeOpcion(boton));
    const valor = t == null ? Number(totalPorDefecto) : t;
    return { total: valor, min: valor, max: valor, difiere: false };
  }

  const totales = (boton.modalidades ?? [])
    .map((m) => leer(claveCobro({ modalidadId: m.id })))
    .filter((t) => t != null);

  if (totales.length === 0) {
    const valor = Number(totalPorDefecto);
    return { total: valor, min: valor, max: valor, difiere: false };
  }

  const min = Math.min(...totales);
  const max = Math.max(...totales);
  return { total: min === max ? min : null, min, max, difiere: min !== max };
}

/**
 * LA IDENTIDAD QUE VIAJA EN EL CUERPO — y NADA más que la identidad.
 *
 * Es literalmente lo único que el servidor lee del tender: `medioCobroLocalId`,
 * `modalidadId` y `monto`. El porcentaje, la comisión, el tipo contable, el
 * procesador y los nombres los relee él de la configuración, así que mandarlos
 * desde acá sería mandar datos que se ignoran y, peor, sugerir que el navegador
 * decide algo.
 *
 * Devuelve `null` para un default sin fila: no se inventa un id.
 */
export function identidadDeSeleccion(boton, modalidad = null) {
  if (!boton || boton.medioCobroLocalId == null) return null;
  return {
    medioCobroLocalId: boton.medioCobroLocalId,
    modalidadId: modalidad?.modalidadId ?? modalidad?.id ?? null,
  };
}

/**
 * `formaPago` del cuerpo cuando se cobra con esta selección.
 *
 * Sigue siendo el TIPO CONTABLE en minúscula, que es el contrato de hoy: la ruta
 * lo exige y varios consumidores lo leen. Con modalidad elegida es el tipo DE LA
 * MODALIDAD, que es lo que la venta va a congelar — mandar el del padre haría
 * que `Venta.formaPago` dijera "mercadopago" en una venta que la base registra
 * como CREDITO.
 */
export function formaPagoDeSeleccion(boton, modalidad = null) {
  const tipo = modalidad?.tipoContable ?? boton?.tipoContable;
  return String(tipo ?? "").toLowerCase();
}

/**
 * UNA FILA DEL PANEL "DIVIDIR PAGO".
 *
 * Antes una fila era `{medio, monto}` y su identidad era el tipo contable. Eso
 * no puede representar dos modalidades del mismo tipo —"Crédito 1 pago" y
 * "Crédito cuotas" son las dos CREDITO— así que la fila pasó a llevar la
 * selección completa. `clave` es la de la opción elegida, que es lo que impide
 * que dos filas distintas se cuenten como la misma.
 */
export function filaDeBoton(boton, modalidad = null, monto = "") {
  return {
    botonClave: boton?.clave ?? null,
    modalidadId: modalidad?.modalidadId ?? modalidad?.id ?? null,
    clave: claveDeOpcion(boton, modalidad),
    // El tipo contable EFECTIVO de la opción es lo que decide si esta fila cubre
    // los servicios. Se guarda resuelto para que el evaluador no tenga que
    // volver a buscar el botón, y para que la decisión no dependa del NOMBRE:
    // una modalidad puede llamarse como quiera y lo que manda es su tipo.
    tipoContable: modalidad?.tipoContable ?? boton?.tipoContable ?? null,
    medioCobroLocalId: boton?.medioCobroLocalId ?? null,
    medio: String(boton?.tipoContable ?? "").toLowerCase(),
    nombre: boton?.nombre ?? "",
    nombreModalidad: modalidad?.nombre ?? null,
    monto,
  };
}

/**
 * LA CONDICIÓN DE FIADO, para preguntarle su total al preview.
 *
 * Fiado no es un medio de cobro configurable —no tiene fila, no tiene
 * modalidades y no admite recargo— así que no aparece en `opcionesDeCobro`. Pero
 * el panel igual tiene que mostrar su importe, y ese importe tiene que salir del
 * MISMO motor y no de una resta hecha acá.
 */
export const CONDICION_FIADO = {
  medioCobroLocalId: null,
  medioNombre: null,
  procesador: null,
  modalidadId: null,
  modalidadNombre: null,
  medio: "FIADO",
  recargoPct: 0,
  comisionPct: null,
};

/**
 * LAS OPCIONES COBRABLES DE UN BOTÓN: él mismo, o una por modalidad activa.
 *
 * Es lo que hay que recorrer para saber si a un botón le queda algo libre en el
 * panel dividido. Un botón con modalidades PUEDE aparecer dos veces —"Crédito 1
 * pago" y "Crédito cuotas" son dos tenders distintos y la base los acepta— y
 * ésta es la función que impide que la pantalla lo prohíba por su cuenta.
 */
export function opcionesCobrablesDe(boton) {
  if (!boton?.abreSelector) return [{ clave: claveDeOpcion(boton), modalidadId: null, nombre: boton?.nombre }];
  return opcionesDeModalidad(boton);
}

/** Las opciones de un botón que todavía no están en otra fila. */
export function opcionesLibresDe(boton, clavesUsadas = [], claveActual = null) {
  return opcionesCobrablesDe(boton).filter(
    (o) => o.clave === claveActual || !clavesUsadas.includes(o.clave)
  );
}

/**
 * QUÉ MEDIOS PUEDE ELEGIR ESTA FILA.
 *
 * El suyo siempre, más los que tengan al menos una opción libre. Un medio con
 * modalidades no se descarta por estar ya usado: puede quedarle otra modalidad,
 * y ésa es la diferencia con el panel de antes, donde un medio usado
 * desaparecía de la lista.
 */
export function botonesDisponiblesParaFila(botones, filas, idx) {
  const clavesUsadas = (filas ?? []).map((f) => f.clave);
  const actual = filas?.[idx];
  return (botones ?? []).filter((b) => {
    if (b.clave === actual?.botonClave) return true;
    return opcionesLibresDe(b, clavesUsadas).length > 0;
  });
}

/** Qué modalidades puede elegir esta fila: la suya, más las que no estén en otra. */
export function modalidadesDisponiblesParaFila(boton, filas, idx) {
  const clavesUsadas = (filas ?? []).map((f) => f.clave);
  return opcionesLibresDe(boton, clavesUsadas, filas?.[idx]?.clave ?? null);
}

/**
 * LA PRIMERA FILA QUE SE PUEDE AGREGAR, o `null` si no queda ninguna.
 *
 * Devuelve la fila armada y no solo el botón: quien agrega no tiene que saber
 * que un medio con modalidades necesita además una modalidad elegida.
 */
export function primeraFilaLibre(botones, filas = []) {
  const clavesUsadas = filas.map((f) => f.clave);
  for (const boton of botones ?? []) {
    const libres = opcionesLibresDe(boton, clavesUsadas);
    if (libres.length === 0) continue;
    return filaDeBoton(boton, boton.abreSelector ? libres[0] : null);
  }
  return null;
}

/**
 * CON QUÉ FILAS SE ABRE EL PANEL DIVIDIDO.
 *
 * Los dos primeros medios del local, cada uno con su primera opción libre. Con un
 * solo medio se abre con una fila: dividir entre uno no tiene sentido, pero
 * inventar un segundo medio que el local no cobra tampoco.
 */
export function filasIniciales(botones) {
  const filas = [];
  for (const boton of botones ?? []) {
    if (filas.length >= 2) break;
    const fila = primeraFilaLibre([boton], filas);
    if (fila) filas.push(fila);
  }
  return filas;
}

/** Las condiciones de un conjunto de filas, para pedirle el total al preview. */
export function condicionesDeFilas(filas, botones) {
  return (Array.isArray(filas) ? filas : [])
    .map((f) => {
      const boton = botones.find((b) => b.clave === f.botonClave);
      if (!boton) return null;
      if (f.modalidadId == null) return boton.condicion;
      const opcion = opcionesDeModalidad(boton).find((o) => o.modalidadId === f.modalidadId);
      return opcion ? opcion.condicion : boton.condicion;
    })
    .filter(Boolean);
}
