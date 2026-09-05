// lib/pos-ventas/mediosCobroServidor.js
//
// LA PARTE DE LOS MEDIOS DE COBRO QUE HABLA CON LA BASE.
//
// Todo lo que DECIDE algo vive en `mediosCobro.js`, que es puro y está cubierto
// por candados. Acá solo se leen filas y se les da la forma que ese módulo
// espera. La separación no es estética: lo que se meta acá deja de estar cubierto
// por la suite, así que conviene que sea poco y aburrido.

import { normalizarRecargos } from "@/lib/recargos-pago/recargoPago.js";
import { componerMedios, MEDIOS_POR_DEFECTO, validarMedios } from "./mediosCobro.js";
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
 * ¿El cambio pedido deja al local con dos medios activos del mismo tipo?
 *
 * Se pregunta ANTES de escribir, sobre el estado que quedaría. El índice parcial
 * de la base garantiza lo mismo, pero contesta con un mensaje de Postgres; esto
 * contesta con uno que se entiende.
 *
 * @param {*} db
 * @param {{localId:number, medioId?:number, cambios:object}} args
 */
export async function validarCambioDeMedio(db, { localId, medioId = null, cambios = {} }) {
  const actuales = await db.medioCobroLocal.findMany({
    where: { localId: Number(localId) },
    select: { id: true, nombre: true, activo: true, tipoContable: true },
  });

  const resultante = actuales.map((m) =>
    medioId != null && m.id === Number(medioId) ? { ...m, ...cambios } : m
  );
  // Un medio nuevo todavía no está en la tabla.
  if (medioId == null) resultante.push({ id: null, ...cambios });

  return validarMedios(resultante);
}
