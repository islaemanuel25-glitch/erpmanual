// lib/transferencias/recepcionServidor.js
//
// LO QUE TODA RUTA DE RECEPCIÓN TIENE QUE PREGUNTAR ANTES DE ESCRIBIR.
//
// Son tres preguntas y siempre las mismas: si la transferencia existe, si esta
// persona puede recibirla, y si su estado admite cambios. Hasta acá vivían
// copiadas en `guardar-recepcion` y en `confirmar-recepcion`, con diferencias
// chicas entre las dos —una devuelve 403 y la otra 400 cuando falta el local—.
// Con dos rutas nuevas encima, esas diferencias se vuelven cuatro versiones de
// la misma regla, y la que se olvide de actualizarse es la que va a dejar entrar
// a alguien.
//
// ── NADA DE ESTO SE DECIDE CON LO QUE MANDA EL CLIENTE ────────────────────
//
// El origen, el destino y el estado salen de la transferencia PERSISTIDA. El
// cliente solo aporta un id. Es la misma razón por la que `guardar-recepcion`
// dejó de leer la cantidad enviada del request: cualquier dato que el navegador
// pueda elegir y el servidor no relea es un dato que alguien va a elegir mal a
// propósito.

import { esComboBase } from "@/lib/combos/guards";
import { validarDetalleRecepcion } from "./recepcion.js";

/** Estados en los que la recepción todavía se puede editar. */
export const ESTADOS_EDITABLES = ["Enviada", "Recibiendo"];

/**
 * LA FILA DE `Transferencia` ES EL MUTEX DE TODA LA RECEPCIÓN.
 *
 * ── LA CARRERA QUE ESTO CIERRA ────────────────────────────────────────────
 *
 * Comprobar el estado con una lectura y mutar después NO alcanza, y no es
 * teórico:
 *
 *   1. confirmar lee la transferencia y sus detalles;
 *   2. todavía no tomó nada;
 *   3. el destino agrega una línea;
 *   4. confirmar toma el lock y procesa el snapshot VIEJO;
 *   5. la transferencia queda Recibida con una línea cuyo stock nunca se movió.
 *
 * Y las variantes: un DELETE que validó en "Recibiendo" y se ejecuta después de
 * confirmar; un guardar que escribe cantidades sobre un estado que ya cambió; un
 * POST que reescribe "Recibiendo" alrededor de una confirmación.
 *
 * ── POR QUÉ UN `updateMany` CONDICIONAL ES UN MUTEX DE VERDAD ────────────
 *
 * Porque en PostgreSQL un UPDATE toma el lock EXCLUSIVO de la fila, y en READ
 * COMMITTED —el nivel por defecto— una segunda transacción que quiera actualizar
 * la misma fila se BLOQUEA hasta que la primera termina y después vuelve a
 * evaluar su WHERE contra la versión nueva.
 *
 * O sea que no es "comprobar y esperar que nadie se meta": el que llega segundo
 * ve el estado que dejó el primero. Si el primero puso "Confirmando", el segundo
 * empareja cero filas y se entera.
 *
 * Es el mismo mecanismo que ya usaba la barrera de doble confirmación; lo que
 * cambia es que ahora lo usan LAS CUATRO escrituras, y que la lectura de lo que
 * se va a procesar ocurre DESPUÉS de tomarlo.
 *
 * @param {*} tx cliente DENTRO de una transacción — con `prisma` no hay mutex
 * @param {number} transferenciaId
 * @param {string} estadoNuevo "Recibiendo" para editar, "Confirmando" para cerrar
 * @returns {Promise<boolean>} false = otro flujo la tiene o ya terminó
 */
export async function reclamarRecepcion(tx, transferenciaId, estadoNuevo) {
  const r = await tx.transferencia.updateMany({
    where: { id: Number(transferenciaId), estado: { in: ESTADOS_EDITABLES } },
    data: { estado: estadoNuevo },
  });
  return r.count > 0;
}

/** El mensaje de haber perdido la carrera. Uno solo, para que las cuatro rutas digan lo mismo. */
export const MENSAJE_CARRERA =
  "Otra persona está confirmando esta transferencia o ya la confirmó. Recargá la pantalla antes de seguir.";

/**
 * Error tipado que se lanza DENTRO de una transacción para abortarla entera.
 *
 * Vive acá y no en una ruta porque las cuatro escrituras de recepción lo
 * necesitan: desde adentro de `$transaction` no se puede devolver un
 * `NextResponse` —eso confirmaría la transacción—, así que el único camino es
 * lanzar y que el `catch` de afuera lo traduzca a HTTP.
 */
export class ErrorRecepcion extends Error {
  /**
   * @param {object} [datos] Campos extra que el cuerpo de la respuesta necesita
   *   para ser accionable. La guarda de "productos sin revisar" manda cuántos
   *   faltan y algunos nombres: un cartel que solo dice "no se puede confirmar"
   *   obliga a buscar a mano entre 150 productos cuál quedó.
   */
  constructor(code, message, status = 409, datos = null) {
    super(message);
    this.name = "ErrorRecepcion";
    this.code = code;
    this.status = status;
    this.datos = datos;
  }
}

/**
 * Tomar el lock o abortar. Es la forma en que lo usan las cuatro rutas.
 *
 * Existe para que ninguna se olvide de mirar el resultado: `reclamarRecepcion`
 * devuelve un booleano, y un booleano ignorado es exactamente la carrera que
 * esto viene a cerrar.
 */
export async function reclamarOFallar(tx, transferenciaId, estadoNuevo) {
  const tomado = await reclamarRecepcion(tx, transferenciaId, estadoNuevo);
  if (!tomado) {
    throw new ErrorRecepcion("RECEPCION_TOMADA", MENSAJE_CARRERA, 409);
  }
}

/**
 * Los detalles de una transferencia con todo lo que la recepción necesita.
 *
 * Recibe el cliente para que se pueda leer DENTRO de la transacción, que es el
 * único punto donde la lectura es autoritativa.
 */
export function cargarDetallesDeRecepcion(db, transferenciaId) {
  return db.transferenciaDetalle.findMany({
    where: { transferenciaId: Number(transferenciaId) },
    include: { producto: { include: { base: true } } },
    orderBy: { id: "asc" },
  });
}

/**
 * De los detalles a los planes de mutación, o al primer error.
 *
 * Existe como UNA función porque se usa dos veces: afuera de la transacción para
 * poder contestar rápido con un mensaje bueno, y adentro —después del lock— como
 * la versión que manda. Si fueran dos copias, la de adentro se quedaría atrás y
 * el rechazo amable de afuera dejaría pasar lo que la de adentro tendría que
 * frenar.
 *
 * Los combos se saltean acá y no en cada llamador: no tienen stock físico.
 *
 * @returns {{ok:true, planes:Map<number,object>} | {ok:false, error:string, nombre:string|null}}
 */
/**
 * El factor de agrupación que corresponde a ESTA línea.
 *
 * Prioridad: lo que quedó registrado al enviar; si no hay, el catálogo actual.
 * Es una sola pregunta y vive acá para que la recepción y la confirmación no
 * puedan contestarla distinto.
 */
export function factorParaRecepcion(d = {}) {
  const congelado = Number(d.factorPresentacion);
  if (Number.isInteger(congelado) && congelado > 1) return congelado;
  return Number(d.producto?.base?.factor_pack || 1);
}

/**
 * El peso de una PIEZA que corresponde a ESTA línea.
 *
 * Mismo criterio que el factor, y por un motivo más caro: de este número sale
 * cuántos KILOS se le acreditan al destino. Leerlo vivo significaba que editar
 * `pesoReferenciaKg` después de despachar cambiaba el stock que entraba.
 */
export function pesoPiezaParaRecepcion(d = {}) {
  const congelado = Number(d.pesoPiezaKg);
  if (Number.isFinite(congelado) && congelado > 0) return congelado;
  return Number(d.producto?.base?.pesoReferenciaKg || 0);
}

export function planificarRecepcion(detalles = []) {
  const planes = new Map();

  for (const d of detalles) {
    if (esComboBase(d.producto?.base)) continue;

    const plan = validarDetalleRecepcion({
      detalle: {
        cantidad: d.cantidad,
        recibido: d.recibido,
        unidadEnviada: d.unidadEnviada,
        motivoPrincipal: d.motivoPrincipal,
        motivoDetalle: d.motivoDetalle,
        agregadoEnRecepcion: d.agregadoEnRecepcion,
        // El pack incompleto viaja con el resto: la aritmética física sale de
        // `milesimasFisicas` y necesita las dos mitades.
        recibidoUnidadesSueltas: d.recibidoUnidadesSueltas,
      },
      // ── EL FACTOR CONGELADO LE GANA AL DEL CATÁLOGO ─────────────────────
      //
      // Si la línea trae su snapshot, la conversión a unidades físicas usa el
      // factor con el que se DESPACHÓ, no el que el producto tiene hoy. Sin
      // esto, editar `factor_pack` de 8 a 12 después de despachar cambiaba
      // cuántas unidades entraban al destino de un remito que ya había salido.
      //
      // Una línea sin snapshot sigue leyendo el catálogo, que es exactamente lo
      // que hacía antes: no se reinterpreta el histórico.
      factorPack: factorParaRecepcion(d),
    });

    if (!plan.ok) {
      return {
        ok: false,
        error: plan.error,
        nombre: d.producto?.base?.nombre || d.producto?.nombre || null,
      };
    }
    planes.set(d.id, plan);
  }

  return { ok: true, planes };
}

/**
 * LOS PRODUCTOS DEL REMITO QUE TODAVÍA NADIE REVISÓ.
 *
 * ── POR QUÉ ESTO EXISTE Y POR QUÉ VA ADENTRO DEL LOCK ─────────────────────
 *
 * La recepción dejó de ser una lista que se recorre en el orden del remito y
 * pasó a ser un control físico: el operador va producto por producto y marca
 * cada uno como revisado. Confirmar con productos sin revisar sería cerrar un
 * conteo que nadie terminó, y el stock se mueve ahí.
 *
 * Bloquear el botón en la pantalla no alcanza —una pestaña vieja, un pedido a
 * mano, dos personas recibiendo—, así que la guarda vive en el servidor. Y se
 * evalúa DESPUÉS de tomar el lock, sobre la lectura firme: entre el snapshot de
 * afuera y la transacción alguien puede haber desmarcado o agregado una línea.
 *
 * ── LAS AGREGADAS NO CUENTAN ──────────────────────────────────────────────
 *
 * Una línea agregada en recepción no pertenece al remito: apareció porque el
 * operador la encontró, así que ya está "revisada" por definición. Meterla en el
 * denominador haría que agregar un producto bloqueara la confirmación.
 *
 * @param {object[]} detalles  los detalles ya leídos adentro de la transacción
 * @returns {{id:number, nombre:string|null}[]} los originales sin revisar
 */
export function originalesSinRevisar(detalles = []) {
  return detalles
    .filter((d) => d.agregadoEnRecepcion !== true && d.revisadoEnRecepcion !== true)
    .map((d) => ({
      id: d.id,
      nombre: d.producto?.base?.nombre || d.producto?.nombre || null,
    }));
}

/** ¿Este estado admite cargar, agregar o borrar líneas de recepción? */
export function esEditableEnRecepcion(estado) {
  return ESTADOS_EDITABLES.includes(String(estado || ""));
}

/**
 * ¿ESTA PERSONA PUEDE RECIBIR ESTA TRANSFERENCIA?
 *
 * Solo el DESTINO, salvo admin. El origen no: quien manda no es quien cuenta lo
 * que llegó, y dejarlo tocar la recepción sería dejarlo cerrar su propia
 * diferencia.
 *
 * @returns {{ok:true} | {ok:false, status:number, error:string}}
 */
export function puedeRecibir(session, transferencia) {
  if (session?.esAdmin) return { ok: true };

  const localId = Number(session?.localId || 0);
  if (!localId) {
    return { ok: false, status: 400, error: "Usuario sin local asignado" };
  }
  if (localId !== Number(transferencia?.destinoId)) {
    return { ok: false, status: 403, error: "No podés recibir esta transferencia" };
  }
  return { ok: true };
}

/**
 * ¿EL ESTADO ADMITE ESCRIBIR?
 *
 * "Recibida" se contesta aparte porque es el caso que la gente vive: se confirmó
 * y alguien vuelve a la pantalla vieja. Merece un mensaje que diga qué pasó, no
 * uno genérico con el nombre del estado adentro.
 *
 * @returns {{ok:true} | {ok:false, status:number, error:string}}
 */
export function estadoAdmiteRecepcion(estado, { accion = "guardar cambios" } = {}) {
  if (String(estado) === "Recibida") {
    return {
      ok: false,
      status: 400,
      error: `Esta transferencia ya fue confirmada. No se pueden ${accion}.`,
    };
  }
  if (!esEditableEnRecepcion(estado)) {
    return {
      ok: false,
      status: 400,
      error: `No se puede editar una transferencia en estado "${estado}"`,
    };
  }
  return { ok: true };
}
