// lib/caja/correcciones/motor.js
//
// CORRECCIÓN HISTÓRICA DE CAJA — EL MOTOR, UNO SOLO PARA ENSAYAR Y PARA APLICAR.
//
// El ensayo en seco y la aplicación recorren EXACTAMENTE el mismo camino: cargan
// y bloquean las filas, arman el plan, escriben los UPDATE, releen, comprueban
// las invariantes. La única diferencia es el final: el ensayo tira un error a
// propósito para que Postgres deshaga todo, y la aplicación guarda el registro
// de la corrección y la bitácora y confirma. Un ensayo que no ejercitara los
// UPDATE no probaría que se pueden escribir.
//
// ── LO QUE SE AUTORIZA ─────────────────────────────────────────────────────
//
// No se autoriza un valor fuente suelto: se autoriza la HUELLA del plan entero
// —todos los valores antes y después, y qué filas se leyeron—. Si entre el
// ensayo y la aplicación cambió cualquier cosa, el plan de ahora da otra huella
// y no se aplica. Nunca se recalcula un plan distinto y se aplica igual.

import {
  ESTADO_MANIFIESTO,
  ACCION_CORRECCION_HISTORICA,
  TIPO_CORRECCION,
  CAMPOS_JSON,
  ORDEN_ENTIDADES,
  validarManifiesto,
  armarPlan,
  invariantes,
  huellaDelPlan,
  listaDelAlcance,
  mismoValor,
  canonico,
  textoDeValor,
} from "./plan.js";
import { OPCIONES_TX } from "../cierreRelevoServer.js";

export const RESULTADO = Object.freeze({
  ENSAYO: "ENSAYO",
  APLICADA: "APLICADA",
  YA_APLICADA: "YA_APLICADA",
  RECHAZADA: "RECHAZADA",
});

/** Qué columnas se leen de cada entidad. Importes y desgloses, más lo que identifica. */
const COLUMNAS = {
  Turno: [
    "id", "localId", "cierre", "cierreEnPreparacionEn", "anuladoEn", "montoInicial", "montoEsperadoEfectivo",
    "montoRealEfectivo", "diferenciaEfectivo", "efectivoRetiradoCierre", "fondoDejadoCierre", "retiroCierreMovimientoId",
  ],
  CierrePreparacion: [
    "id", "turnoId", "estado", "efectivoEsperadoCorte", "desgloseCambio", "totalCambio", "efectivoRetiradoEsperado",
    "desgloseRetiroContado", "totalRetiroContado", "desgloseContado", "totalContado", "retiroFinal", "diferencia", "arqueoFinalId",
  ],
  RetiroPreparacion: [
    "id", "turnoId", "estado", "efectivoEsperadoCorte", "totalCambio", "efectivoRetiradoEsperado",
    "totalRetiroContado", "totalCajonDerivado", "diferencia", "arqueoCajaId",
  ],
  ArqueoCaja: ["id", "turnoId", "tipo", "efectivoEsperado", "efectivoContado", "diferencia", "efectivoRetirado", "fondoDejado"],
  CambioPendiente: [
    "id", "estado", "cierrePreparacionId", "turnoOrigenId", "turnoDestinoId", "total", "desglose",
    "totalRecibido", "desgloseRecibido", "diferencia",
  ],
  CajaMovimiento: ["id", "turnoId", "tipo", "monto"],
};

const DELEGADO = {
  Turno: "turno",
  CierrePreparacion: "cierrePreparacion",
  RetiroPreparacion: "retiroPreparacion",
  ArqueoCaja: "arqueoCaja",
  CambioPendiente: "cambioPendiente",
  CajaMovimiento: "cajaMovimiento",
};

const seleccion = (entidad) => Object.fromEntries(COLUMNAS[entidad].map((c) => [c, true]));
const normalizar = (fila) => (fila ? canonico(fila) : fila);

/** Un error que el motor usa para deshacer la transacción a propósito. */
class Deshacer extends Error {
  constructor(informe) {
    super("deshacer");
    this.informe = informe;
  }
}

/** Bloqueo FOR UPDATE de un conjunto de filas, en orden de id. */
async function bloquear(tx, entidad, ids) {
  for (const id of [...ids].sort((a, b) => a - b)) {
    // El nombre de la tabla sale de una lista cerrada, nunca del pedido.
    await tx.$queryRawUnsafe(`SELECT id FROM "${entidad}" WHERE id = $1 FOR UPDATE`, id);
  }
}

/**
 * Los turnos que toca el manifiesto. Se leen sin bloquear: el turno de un sobre
 * o de un corte no cambia nunca, y hace falta saberlo para bloquear en orden.
 */
async function turnosDelManifiesto(tx, manifiesto) {
  const turnos = new Set();
  const faltan = [];
  for (const c of manifiesto.correcciones) {
    if (c.tipo === TIPO_CORRECCION.RECEPCION_SOBRE) {
      const s = await tx.cambioPendiente.findUnique({ where: { id: c.cambioPendienteId }, select: { turnoDestinoId: true } });
      if (!s) faltan.push(`El sobre #${c.cambioPendienteId} no existe.`);
      else if (s.turnoDestinoId) turnos.add(s.turnoDestinoId);
    } else if (c.tipo === TIPO_CORRECCION.CORTE) {
      const k = await tx.cierrePreparacion.findUnique({ where: { id: c.cierrePreparacionId }, select: { turnoId: true } });
      if (!k) faltan.push(`El corte #${c.cierrePreparacionId} no existe.`);
      else turnos.add(k.turnoId);
    }
  }
  return { turnos: [...turnos], faltan };
}

/**
 * Bloquea y carga el alcance: los turnos del manifiesto y todo lo que en ellos
 * se congeló a partir del fondo o del conteo. Siempre en el mismo orden de
 * entidades —turno, corte, retiro, sobre, arqueo, movimiento—, que es el de los
 * flujos del circuito, para no cruzarse con ellos.
 */
async function cargarAlcance(tx, manifiesto, turnoIds) {
  await bloquear(tx, "Turno", turnoIds);

  const cortes = await tx.cierrePreparacion.findMany({ where: { turnoId: { in: turnoIds } }, select: { id: true } });
  const cortesIds = [
    ...new Set([
      ...cortes.map((c) => c.id),
      ...manifiesto.correcciones.filter((c) => c.tipo === TIPO_CORRECCION.CORTE).map((c) => c.cierrePreparacionId),
    ]),
  ];
  await bloquear(tx, "CierrePreparacion", cortesIds);

  const retiros = await tx.retiroPreparacion.findMany({ where: { turnoId: { in: turnoIds } }, select: { id: true } });
  await bloquear(tx, "RetiroPreparacion", retiros.map((r) => r.id));

  const sobres = await tx.cambioPendiente.findMany({
    where: { OR: [{ cierrePreparacionId: { in: cortesIds } }, { turnoDestinoId: { in: turnoIds } }] },
    select: { id: true },
  });
  const sobresIds = [
    ...new Set([
      ...sobres.map((s) => s.id),
      ...manifiesto.correcciones.filter((c) => c.tipo === TIPO_CORRECCION.RECEPCION_SOBRE).map((c) => c.cambioPendienteId),
    ]),
  ];
  await bloquear(tx, "CambioPendiente", sobresIds);

  const arqueos = await tx.arqueoCaja.findMany({ where: { turnoId: { in: turnoIds } }, select: { id: true } });
  await bloquear(tx, "ArqueoCaja", arqueos.map((a) => a.id));

  const turnosLeidos = await tx.turno.findMany({ where: { id: { in: turnoIds } }, select: { retiroCierreMovimientoId: true } });
  const movimientosIds = turnosLeidos.map((t) => t.retiroCierreMovimientoId).filter((x) => x != null);
  await bloquear(tx, "CajaMovimiento", movimientosIds);

  return leerAlcance(tx, {
    Turno: turnoIds,
    CierrePreparacion: cortesIds,
    RetiroPreparacion: retiros.map((r) => r.id),
    CambioPendiente: sobresIds,
    ArqueoCaja: arqueos.map((a) => a.id),
    CajaMovimiento: movimientosIds,
  });
}

/** Lee las filas de cada entidad por id y las deja en forma canónica. */
async function leerAlcance(tx, idsPorEntidad) {
  const alcance = {};
  for (const entidad of ORDEN_ENTIDADES) {
    alcance[entidad] = {};
    const ids = idsPorEntidad[entidad] ?? [];
    if (!ids.length) continue;
    const leidas = await tx[DELEGADO[entidad]].findMany({ where: { id: { in: ids } }, select: seleccion(entidad) });
    for (const fila of leidas) alcance[entidad][fila.id] = normalizar(fila);
  }
  return alcance;
}

const idsDelAlcance = (alcance) =>
  Object.fromEntries(ORDEN_ENTIDADES.map((e) => [e, Object.keys(alcance[e] ?? {}).map(Number)]));

/**
 * Escribe los cambios del plan, fila por fila, condicionados por el id Y por el
 * valor anterior de cada importe. Cada UPDATE tiene que tocar exactamente una
 * fila: si no, algo cambió debajo del plan y se deshace todo. Los desgloses no
 * van en el WHERE —comparar JSON ahí no es confiable—: los protege el bloqueo
 * FOR UPDATE y la comparación que ya hizo el plan.
 */
async function escribir(tx, cambios, ganchos) {
  const porFila = new Map();
  for (const c of cambios) {
    const clave = `${c.entidad}#${c.id}`;
    if (!porFila.has(clave)) porFila.set(clave, { entidad: c.entidad, id: c.id, antes: {}, data: {} });
    const fila = porFila.get(clave);
    fila.data[c.campo] = c.despues;
    if (!CAMPOS_JSON.has(c.campo)) fila.antes[c.campo] = c.antes;
  }
  let escritas = 0;
  for (const { entidad, id, antes, data } of porFila.values()) {
    const { count } = await tx[DELEGADO[entidad]].updateMany({ where: { id, ...antes }, data });
    if (count !== 1) throw new Error(`La fila ${entidad} #${id} no tenía los valores anteriores del plan (${count} filas).`);
    escritas += 1;
    // Solo para las pruebas: provocar un fallo a mitad de camino.
    await ganchos?.despuesDeEscribirFila?.({ entidad, id, escritas });
  }
  return escritas;
}

/** Los cambios agrupados por fila, en el formato de la bitácora central. */
function cambiosParaBitacora(cambios) {
  const porFila = new Map();
  for (const c of cambios) {
    const clave = `${c.entidad}#${c.id}`;
    if (!porFila.has(clave)) porFila.set(clave, { entidad: c.entidad, nombre: `${c.entidad} #${c.id}`, id: String(c.id), campos: [] });
    porFila.get(clave).campos.push({ campo: c.campo, label: c.campo, antes: textoDeValor(c.antes), despues: textoDeValor(c.despues) });
  }
  return [...porFila.values()];
}

/**
 * Ensaya o aplica una corrección.
 *
 * @param {object} prisma      cliente (o uno de prueba)
 * @param {object} manifiesto  tal como está en el repo
 * @param {object} opciones
 * @param {"ensayo"|"aplicar"} opciones.modo
 * @param {number} opciones.usuarioId  quien ejecuta
 * @param {object} [opciones.ganchos]  solo pruebas
 * @returns {Promise<object>} el informe; nunca tira por una regla del negocio
 */
export async function ejecutarCorreccion(prisma, manifiesto, { modo, usuarioId, ganchos } = {}) {
  const aplicar = modo === "aplicar";
  const base = {
    codigo: manifiesto?.codigo ?? null,
    estado: manifiesto?.estado ?? null,
    modo: aplicar ? "aplicar" : "ensayo",
    resultado: RESULTADO.RECHAZADA,
    hash: null,
    hashAutorizado: manifiesto?.autorizacion?.hash ?? null,
    hashCoincide: null,
    cambios: [],
    filasQueCambian: [],
    filasSinCambio: [],
    invariantes: [],
    errores: [],
  };

  const validacion = validarManifiesto(manifiesto);
  if (!validacion.valido) return { ...base, errores: validacion.errores };
  if (aplicar && manifiesto.estado !== ESTADO_MANIFIESTO.AUTORIZADO) {
    return { ...base, errores: ["Un manifiesto PROPUESTO solo se puede ensayar."] };
  }
  if (!Number.isInteger(usuarioId) || usuarioId <= 0) return { ...base, errores: ["Falta quién ejecuta."] };

  try {
    return await prisma.$transaction(async (tx) => {
      const { turnos, faltan } = await turnosDelManifiesto(tx, manifiesto);
      if (faltan.length) return { ...base, errores: faltan };
      if (!turnos.length) return { ...base, errores: ["El manifiesto no llega a ningún turno."] };

      // Primero los turnos: dos aplicaciones simultáneas del mismo incidente se
      // serializan acá, y la segunda ya ve el registro de la primera.
      const alcance = await cargarAlcance(tx, manifiesto, turnos);

      const previa = await tx.correccionCaja.findUnique({ where: { codigo: manifiesto.codigo } });
      if (previa) {
        const misma = previa.manifiestoHash === manifiesto.autorizacion?.hash;
        return {
          ...base,
          resultado: misma ? RESULTADO.YA_APLICADA : RESULTADO.RECHAZADA,
          hash: previa.manifiestoHash,
          hashCoincide: misma,
          errores: misma ? [] : [`El incidente ${manifiesto.codigo} ya se corrigió con otro plan. Una reversión es otra corrección.`],
          aplicadaEn: previa.ejecutadoEn,
        };
      }

      const faltantes = [];
      for (const codigo of manifiesto.dependeDe ?? []) {
        const dep = await tx.correccionCaja.findUnique({ where: { codigo }, select: { id: true } });
        if (!dep) faltantes.push(`Depende de ${codigo}, que todavía no se aplicó.`);
      }
      if (faltantes.length) return { ...base, errores: faltantes };

      const plan = armarPlan(alcance, manifiesto);
      const informe = {
        ...base,
        cambios: plan.cambios,
        filasQueCambian: plan.tocadas,
        filasSinCambio: plan.sinCambio,
        errores: [...plan.errores],
      };
      if (plan.errores.length) return informe;
      if (!plan.cambios.length) return { ...informe, errores: ["El plan no cambia nada: los valores ya son los corregidos."] };

      const hash = huellaDelPlan({
        codigo: manifiesto.codigo,
        correcciones: manifiesto.correcciones,
        alcance: listaDelAlcance(alcance),
        cambios: plan.cambios,
      });
      informe.hash = hash;
      informe.hashCoincide = informe.hashAutorizado ? informe.hashAutorizado === hash : null;
      informe.invariantes = invariantes(plan.estado, plan.tocadas);

      if (aplicar && hash !== manifiesto.autorizacion.hash) {
        return {
          ...informe,
          errores: ["El plan de hoy no es el autorizado: cambió algún valor desde el ensayo. Hay que volver a ensayar y autorizar."],
        };
      }
      if (informe.invariantes.some((i) => !i.ok)) {
        return { ...informe, errores: ["El plan rompe una identidad del circuito: no se aplica."] };
      }

      // ── Escribir, releer, comprobar ──
      await escribir(tx, plan.cambios, ganchos);
      const escrito = await leerAlcance(tx, idsDelAlcance(alcance));
      const noQuedo = plan.cambios.filter((c) => !mismoValor(escrito[c.entidad]?.[c.id]?.[c.campo], c.despues));
      const invariantesEscritas = invariantes(escrito, plan.tocadas);
      const fallos = [
        ...noQuedo.map((c) => `${c.entidad} #${c.id}.${c.campo} no quedó con el valor del plan.`),
        ...invariantesEscritas.filter((i) => !i.ok).map((i) => `No se cumple: ${i.nombre}.`),
      ];
      if (fallos.length) throw new Deshacer({ ...informe, errores: fallos });

      if (!aplicar) throw new Deshacer({ ...informe, resultado: RESULTADO.ENSAYO, invariantes: invariantesEscritas });

      // ── Aplicación: el registro y la bitácora, en la misma transacción ──
      const localIds = [...new Set(Object.values(alcance.Turno).map((t) => t.localId))];
      const registro = await tx.correccionCaja.create({
        data: {
          codigo: manifiesto.codigo,
          manifiestoHash: hash,
          motivo: manifiesto.motivo,
          evidencia: manifiesto.evidencia,
          autorizadoPorUsuarioId: manifiesto.autorizacion.autorizadoPorUsuarioId,
          ejecutadoPorUsuarioId: usuarioId,
          cambios: plan.cambios,
          snapshotAntes: alcance,
          snapshotDespues: escrito,
        },
      });
      await tx.auditoriaBitacora.create({
        data: {
          usuarioId,
          operadorId: null,
          localId: localIds.length === 1 ? localIds[0] : null,
          accion: ACCION_CORRECCION_HISTORICA,
          entidad: "CorreccionCaja",
          entidadId: manifiesto.codigo,
          entidadNombre: `Corrección de caja ${manifiesto.codigo}`,
          cambios: [
            ...cambiosParaBitacora(plan.cambios),
            {
              entidad: "Corrección de caja",
              nombre: manifiesto.codigo,
              id: String(registro.id),
              campos: [],
              correccion: {
                codigo: manifiesto.codigo,
                hash,
                motivo: manifiesto.motivo,
                autorizadoPorUsuarioId: manifiesto.autorizacion.autorizadoPorUsuarioId,
                correccionCajaId: registro.id,
              },
            },
          ],
        },
      });

      return { ...informe, resultado: RESULTADO.APLICADA, invariantes: invariantesEscritas, correccionCajaId: registro.id };
    }, OPCIONES_TX);
  } catch (error) {
    if (error instanceof Deshacer) return error.informe;
    // El único que llega acá por una carrera: dos aplicaciones del mismo código.
    if (error?.code === "P2002") {
      const previa = await prisma.correccionCaja.findUnique({ where: { codigo: manifiesto.codigo } });
      const misma = previa?.manifiestoHash === manifiesto.autorizacion?.hash;
      return { ...base, resultado: misma ? RESULTADO.YA_APLICADA : RESULTADO.RECHAZADA, hash: previa?.manifiestoHash ?? null };
    }
    return { ...base, errores: [error?.message || String(error)] };
  }
}
