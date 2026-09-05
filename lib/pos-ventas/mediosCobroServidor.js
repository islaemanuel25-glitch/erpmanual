// lib/pos-ventas/mediosCobroServidor.js
//
// LA PARTE DE LOS MEDIOS DE COBRO QUE HABLA CON LA BASE.
//
// Todo lo que DECIDE algo vive en `mediosCobro.js`, que es puro y está cubierto
// por candados. Acá solo se leen filas y se les da la forma que ese módulo
// espera. La separación no es estética: lo que se meta acá deja de estar cubierto
// por la suite, así que conviene que sea poco y aburrido.

import { normalizarRecargos } from "@/lib/recargos-pago/recargoPago.js";
import {
  componerMedios,
  MEDIOS_POR_DEFECTO,
  parsearClaveEdicion,
  validarMedios,
} from "./mediosCobro.js";
import { MEDIO_LABEL } from "./pagos.js";

/**
 * Los medios de cobro de un local, compuestos y listos para usar.
 *
 * Tres consultas: los medios configurados, los recargos y la comisión del grupo.
 * Un local sin medios configurados devuelve los DEFAULTS —los cuatro botones de
 * hoy—, que es lo que hace que nada cambie hasta que alguien configure algo.
 *
 * @param {*} db cliente Prisma o tx
 * @param {{localId:number, grupoId:number}} args
 */
export async function mediosDelLocal(db, { localId, grupoId }) {
  if (!localId) return [];

  const [filas, recargos, configuracionGrupo] = await Promise.all([
    db.medioCobroLocal.findMany({
      where: { localId: Number(localId) },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    }),
    db.recargoPagoLocal.findMany({
      where: { localId: Number(localId) },
      select: { medio: true, porcentaje: true },
    }),
    grupoId
      ? db.configuracionGrupo.findUnique({
          where: { grupoId: Number(grupoId) },
          select: { comisionDebito: true, comisionCredito: true, comisionMercadopago: true },
        })
      : null,
  ]);

  return componerMedios({
    filas,
    recargosPorMedio: normalizarRecargos(recargos),
    configuracionGrupo,
  });
}

/**
 * MATERIALIZAR LOS DEFAULTS.
 *
 * La primera vez que alguien guarda configuración de un local que no tenía
 * ninguna, hay que escribir los cuatro medios por defecto ANTES de aplicar su
 * cambio. Si no, apagar "Crédito" dejaría al local con una sola fila —la de
 * Crédito, apagada— y el POS se quedaría sin los otros tres botones, porque a
 * partir de la primera fila manda la configuración y no los defaults.
 *
 * Es idempotente: si ya hay filas, no toca nada.
 *
 * @returns {Promise<{materializados:number}>}
 */
export async function materializarDefaults(db, { localId }) {
  const cuantos = await db.medioCobroLocal.count({ where: { localId: Number(localId) } });
  if (cuantos > 0) return { materializados: 0 };

  await db.medioCobroLocal.createMany({
    data: MEDIOS_POR_DEFECTO.map((d) => ({
      localId: Number(localId),
      nombre: MEDIO_LABEL[d.tipoContable] || d.tipoContable,
      activo: true,
      orden: d.orden,
      tipoContable: d.tipoContable,
      procesador: d.procesador,
      // NULL a propósito: hereda la comisión del grupo. Copiar acá el valor del
      // grupo convertiría "hereda" en "alguien lo decidió", y el día que cambie
      // la del grupo este local dejaría de seguirla sin que nadie sepa por qué.
      comisionPct: null,
    })),
  });

  return { materializados: MEDIOS_POR_DEFECTO.length };
}

/**
 * ¿ESTE CAMBIO SE PUEDE GUARDAR?
 *
 * Arma cómo quedaría el local después del cambio y le pregunta a `validarMedios`,
 * que es donde viven las dos reglas. Los tres verbos pasan por acá —crear, editar
 * y borrar— justamente para que no haya tres versiones de lo mismo.
 *
 * Se pregunta ANTES de escribir. Para el choque de tipos el índice parcial de la
 * base garantiza lo mismo, pero contesta con un mensaje de Postgres; esto
 * contesta con uno que se entiende. Para "que quede al menos uno activo" no hay
 * nada en la base: acá es la única defensa.
 *
 * @param {*} db
 * @param {{localId:number, medioId?:number, cambios?:object, borrar?:boolean}} args
 */
export async function validarCambioDeMedio(db, { localId, medioId = null, cambios = {}, borrar = false }) {
  const actuales = await db.medioCobroLocal.findMany({
    where: { localId: Number(localId) },
    select: { id: true, nombre: true, activo: true, tipoContable: true },
  });

  if (borrar) {
    return validarMedios(actuales.filter((m) => m.id !== Number(medioId)));
  }

  const resultante = actuales.map((m) =>
    medioId != null && m.id === Number(medioId) ? { ...m, ...cambios } : m
  );
  // Un medio nuevo todavía no está en la tabla.
  if (medioId == null) resultante.push({ id: null, ...cambios });

  return validarMedios(resultante);
}

/**
 * RESOLVER LA CLAVE DE EDICIÓN A UNA FILA REAL, materializando si hace falta.
 *
 * La pantalla manda la clave que le dio el GET y no sabe si detrás hay una fila o
 * un default. Acá se decide: si el local todavía no configuró nada se
 * materializan los cuatro —siempre los cuatro, nunca solo el pedido— y recién
 * después se busca.
 *
 * Un default se resuelve por su TIPO, que es lo único estable que tiene antes de
 * existir. Y se busca entre las filas RECIÉN materializadas, no entre las que
 * pudiera haber: si el local ya tenía configuración, una clave de default no
 * corresponde a nada y devuelve null.
 *
 * @returns {Promise<{id:number, tipoContable:string, activo:boolean}|null>}
 */
export async function resolverMedioParaEditar(db, { localId, clave }) {
  const ref = parsearClaveEdicion(clave);
  if (!ref) return null;

  const campos = { id: true, tipoContable: true, activo: true };

  // Un id se busca DIRECTO, sin materializar. Materializar primero escribiría
  // cuatro filas como efecto de una búsqueda que va a fallar —un id ajeno, uno
  // inventado— y una consulta que no encuentra nada no tiene por qué dejar
  // rastro.
  if (ref.clase === "id") {
    return db.medioCobroLocal.findFirst({
      where: { id: ref.id, localId: Number(localId) },
      select: campos,
    });
  }

  // Una clave de default solo tiene sentido si el local NO tenía configuración
  // propia. Si ya la tenía, sus medios se piden por id y esta clave viene de una
  // pantalla desactualizada: se contesta que no existe y la pantalla recarga. No
  // se resuelve por tipo "para ser amable", porque dos medios pueden compartir
  // tipo —uno activo y otro no— y se editaría el que no era.
  const materializado = await materializarDefaults(db, { localId: Number(localId) });
  if (materializado.materializados === 0) return null;

  return db.medioCobroLocal.findFirst({
    where: { localId: Number(localId), tipoContable: ref.tipoContable },
    select: campos,
  });
}

/**
 * GUARDAR UN MEDIO Y SU RECARGO EN UNA SOLA OPERACIÓN.
 *
 * La pantalla tiene un solo "Guardar cambios" y edita las dos cosas. Si la
 * pantalla hiciera dos requests, una podría entrar y la otra fallar, y el local
 * quedaría con el medio renombrado y el recargo viejo sin que nadie se entere.
 * Entonces la ruta del medio es la FACHADA y esto es su cuerpo: todo adentro de
 * la transacción que le pasen.
 *
 * ── EL RECARGO NO SE COPIA: SE ESCRIBE DONDE VIVE ────────────────────────────
 *
 * `RecargoPagoLocal` sigue siendo la única fuente. Acá se hace el MISMO upsert
 * que hace `PUT /api/recargos-pago`, con la misma validación y guardando el mismo
 * `actualizadoPorId`. No se borra la fila cuando el recargo es 0: ausencia y 0
 * significan lo mismo para el cálculo, y la fila en 0 es lo que distingue "se
 * decidió no cobrar" de "nunca se configuró". Es la semántica que ya tenía.
 *
 * ── EL RECARGO ES DEL TIPO, NO DEL BOTÓN ─────────────────────────────────────
 *
 * `RecargoPagoLocal` está indexado por `(localId, medio)`, donde `medio` es el
 * tipo contable. O sea: si un medio cambia de tipo, el recargo NO viaja con él —
 * pasa a mostrar el del tipo nuevo—, y dos medios del mismo tipo comparten uno
 * solo. Es una consecuencia real de no duplicar la fuente, y se resuelve
 * explícitamente: el recargo que llega se escribe sobre el tipo con el que el
 * medio QUEDA, y el del tipo anterior no se toca, porque no es de este medio.
 *
 * @param {*} tx cliente dentro de una transacción
 * @param {{localId:number, medioId:number, cambios:object, recargoPct?:number, usuarioId?:number}} args
 */
export async function aplicarCambioDeMedio(tx, { localId, medioId, cambios = {}, recargoPct, usuarioId = null }) {
  const medio = await tx.medioCobroLocal.update({
    where: { id: Number(medioId) },
    data: cambios,
  });

  await guardarRecargoDeTipo(tx, {
    localId,
    tipoContable: medio.tipoContable,
    recargoPct,
    usuarioId,
  });

  return medio;
}

/**
 * El upsert de `RecargoPagoLocal`, escrito una sola vez.
 *
 * Es el MISMO que hace `PUT /api/recargos-pago`: mismo where compuesto, misma
 * autoría, y no borra la fila cuando el porcentaje es 0. Está acá para que crear
 * un medio y editarlo no terminen guardando el recargo de dos maneras distintas.
 *
 * `recargoPct === undefined` significa "el pedido no habla del recargo" y no
 * toca nada. Es distinto de 0, que significa "no se le cobra recargo" y sí se
 * guarda.
 */
export async function guardarRecargoDeTipo(tx, { localId, tipoContable, recargoPct, usuarioId = null }) {
  if (recargoPct === undefined) return { guardado: false };

  await tx.recargoPagoLocal.upsert({
    where: { localId_medio: { localId: Number(localId), medio: tipoContable } },
    update: { porcentaje: recargoPct, actualizadoPorId: usuarioId },
    create: {
      localId: Number(localId),
      medio: tipoContable,
      porcentaje: recargoPct,
      actualizadoPorId: usuarioId,
    },
  });

  return { guardado: true };
}
