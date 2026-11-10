// lib/compras-proveedor/comprobante/razonarRenglones.js
//
// UNA CONSULTA A LA IA POR RECEPCIÓN, CON TODOS LOS RENGLONES DUDOSOS JUNTOS.
//
// Corre al terminar de leer un papel (`leer/[id]`), sin hacer esperar a la
// pantalla. Arma la MISMA conciliación que la pantalla (`cargarConciliacion`),
// elige los renglones dudosos que todavía no se consultaron, le pregunta a la
// IA por la puerta única (`pedirJson`: la misma clave, el mismo modelo y el
// mismo contador que el lector), verifica cada propuesta con los números y la
// guarda —válida o descartada— en `PropuestaIaRenglon`.
//
// SI LA IA FALLA, NO PASA NADA: la recepción sigue exactamente como antes, sin
// cartel. Se deja una línea en el log y listo (Emanuel, 2026-11-07).

import { pedirJson } from "@/lib/ia/salidaEstructurada";
import { cargarConciliacion, lineasSospechadasDeCorrimiento } from "./conciliacionDelPedido.js";
import { candidatosParaLaIa } from "./vinculo.js";
import {
  ESQUEMA_PROPUESTA_IA,
  candidatoParaLaIa,
  esRenglonDudoso,
  instruccionesPropuestaIa,
  renglonParaLaIa,
  validarRespuestaIa,
  verificarPropuesta,
} from "./propuestaIa.js";
import { comoViene, unidadDelBulto } from "@/lib/unidades/reglaDeUnidades";

/** Cuánto se espera la respuesta. La pantalla no la espera: corre aparte. */
export const ESPERA_PROPUESTA_IA_MS = 45_000;

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Los renglones dudosos de la recepción, con su candidatos, listos para la IA.
 * Separado de la consulta para poder probarlo sin red ni base.
 */
export function pedidoDeLaRecepcion({ filas, contexto, detallesPlanos = [], ultimosPrecios = new Map(), yaConsultadas = new Set() }) {
  const datosPorBase = contexto?.datosPorBase ?? new Map();
  const universo = (contexto?.datos?.productos ?? []).map((p) => ({ productoBaseId: p.productoBaseId, nombre: p.nombre }));
  const barrasPorBase = new Map((contexto?.datos?.productos ?? []).map((p) => [p.productoBaseId, p.codigosBarra ?? []]));
  const codigosPorBase = new Map();
  for (const v of contexto?.datos?.codigosProveedor ?? []) {
    if (v?.activo === false) continue;
    if (!codigosPorBase.has(v.productoBaseId)) codigosPorBase.set(v.productoBaseId, []);
    codigosPorBase.get(v.productoBaseId).push(v.codigoInterno);
  }
  const renglones = [];
  const fichas = new Map();
  for (const fila of filas) {
    if (yaConsultadas.has(Number(fila.lineaId)) || !esRenglonDudoso(fila)) continue;
    const ids = candidatosParaLaIa({
      texto: fila.textoCrudo ?? "",
      incluir: [fila.productoBaseId, ...(fila.candidatos ?? []).map((c) => c.productoBaseId)],
      lineasDelPedido: detallesPlanos,
      universoProveedor: universo,
      catalogo: contexto?.catalogoNormalizado ?? [],
    });
    const candidatos = ids
      .map((id) => datosPorBase.get(id))
      .filter(Boolean)
      .map((ficha) => {
        fichas.set(Number(ficha.id), ficha);
        return candidatoParaLaIa({
          ficha,
          codigos: [...(codigosPorBase.get(ficha.id) ?? []), ...(barrasPorBase.get(ficha.id) ?? [])],
          ultimoPrecioPagado: ultimosPrecios.get(Number(ficha.id)) ?? null,
        });
      });
    if (!candidatos.length) continue;
    renglones.push(renglonParaLaIa(fila, candidatos));
  }
  return { renglones, fichas };
}

/**
 * Lo que se guarda por renglón preguntado: la propuesta y su verificación.
 * Un renglón que la IA no contestó no se guarda: se vuelve a preguntar la
 * próxima vez que se lea el papel.
 */
export function propuestasAGuardar({ grupoId, renglones, validadas, filasPorLinea, fichas, variacionNormalPct, modelo = null }) {
  const salida = [];
  for (const r of renglones) {
    const p = validadas.get(Number(r.lineaId));
    if (!p) continue;
    const ficha = p.productoBaseId != null ? fichas.get(Number(p.productoBaseId)) : null;
    const v = ficha
      ? verificarPropuesta({ fila: filasPorLinea.get(Number(r.lineaId)), ficha, unidadesPorPack: p.unidadesPorPack, variacionNormalPct })
      : { valida: false, variacionPct: null };
    salida.push({
      grupoId,
      comprobanteLineaId: Number(r.lineaId),
      productoBaseId: p.productoBaseId,
      unidadesPorPack: p.unidadesPorPack,
      motivo: p.motivo,
      valida: v.valida,
      variacionPct: Number.isFinite(v.variacionPct) ? Math.round(v.variacionPct * 100) / 100 : null,
      modelo,
    });
  }
  return salida;
}

/** El último precio pagado a este proveedor, por unidad, de cada producto. */
async function ultimosPreciosPagados(prisma, { grupoId, proveedorId, ids, datosPorBase }) {
  if (!ids.length || !proveedorId) return new Map();
  const detalles = await prisma.pedidoProveedorDetalle.findMany({
    where: {
      pedido: { grupoId, proveedorId, estado: "RECIBIDO" },
      producto: { baseId: { in: ids } },
      cantidadRecibida: { not: null },
      precioCosto: { not: null },
    },
    orderBy: { id: "desc" },
    select: { precioCosto: true, unidad: true, producto: { select: { baseId: true } } },
    take: 500,
  });
  const salida = new Map();
  for (const d of detalles) {
    const base = Number(d.producto?.baseId);
    if (salida.has(base)) continue;
    const ficha = datosPorBase.get(base);
    const factor = comoViene({ factor_pack: ficha?.factor_pack, modoCompraProveedor: ficha?.modoCompraProveedor }).factor;
    const precio = num(d.precioCosto);
    if (precio === null) continue;
    salida.set(base, Math.round((d.unidad === "BULTO" ? unidadDelBulto({ precio, factor }) : precio) * 100) / 100);
  }
  return salida;
}

/**
 * LA CONSULTA DE UNA RECEPCIÓN. Nunca tira: si algo falla, deja una línea en
 * el log y devuelve `{ ok: false, motivo }`. La recepción no se entera.
 *
 * `pedirJsonImpl`, `env` y `fetchImpl` se inyectan para los candados: la red a
 * la IA está prohibida en las pruebas.
 */
export async function razonarRenglonesDudosos(prisma, { grupoId, localId, pedidoId, comprobanteId = null, pedirJsonImpl = pedirJson, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  try {
    const c = await cargarConciliacion(prisma, { grupoId, localId, pedidoId });
    if (!c) return { ok: false, motivo: "SIN_PEDIDO" };
    const sospechadas = lineasSospechadasDeCorrimiento(c);
    const filas = (c.grupos ?? [])
      .flatMap((g) => g.filas ?? [])
      .filter((f) => num(f.lineaId) > 0)
      .map((f) => ({ ...f, corridaSospechada: sospechadas.has(f.lineaId), variacionNormalPct: c.variacionNormalPct }));
    const ids = filas.map((f) => Number(f.lineaId));
    const ya = ids.length
      ? await prisma.propuestaIaRenglon.findMany({ where: { comprobanteLineaId: { in: ids } }, select: { comprobanteLineaId: true } })
      : [];
    const yaConsultadas = new Set(ya.map((p) => p.comprobanteLineaId));
    const proveedorId = c.pedido?.proveedorId ?? null;
    const previo = pedidoDeLaRecepcion({ filas, contexto: c.contexto, detallesPlanos: c.detallesPlanos, yaConsultadas });
    if (!previo.renglones.length) return { ok: true, consultados: 0 };
    const ultimosPrecios = await ultimosPreciosPagados(prisma, {
      grupoId,
      proveedorId,
      ids: [...previo.fichas.keys()],
      datosPorBase: c.contexto?.datosPorBase ?? new Map(),
    });
    return await consultarYGuardar({
      grupoId,
      filas,
      contexto: c.contexto,
      detallesPlanos: c.detallesPlanos,
      ultimosPrecios,
      yaConsultadas,
      variacionNormalPct: c.variacionNormalPct,
      proveedor: c.comprobantes?.[0]?.proveedor?.nombre ?? null,
      pedirJsonImpl,
      env,
      fetchImpl,
      comprobanteId,
      guardar: (data) => prisma.propuestaIaRenglon.createMany({ data, skipDuplicates: true }),
      etiqueta: `pedido ${pedidoId}`,
    });
  } catch (e) {
    console.error(`[propuesta IA] pedido ${pedidoId}: falló (${e?.message ?? e}). La recepción sigue igual.`);
    return { ok: false, motivo: "ERROR" };
  }
}

/**
 * PREGUNTAR, VALIDAR, VERIFICAR Y GUARDAR, sin cargar nada de la base: lo
 * recibe ya armado. Con ningún renglón dudoso no se llama a la IA. Si la IA
 * falla —error, tiempo agotado, JSON que no sirve— no se guarda nada y se deja
 * una línea en el log. Nunca tira.
 */
export async function consultarYGuardar({
  grupoId, filas, contexto, detallesPlanos = [], ultimosPrecios = new Map(), yaConsultadas = new Set(),
  variacionNormalPct = null, proveedor = null, pedirJsonImpl = pedirJson, env = process.env,
  fetchImpl = globalThis.fetch, comprobanteId = null, guardar, etiqueta = "recepción",
}) {
  try {
    const { renglones, fichas } = pedidoDeLaRecepcion({ filas, contexto, detallesPlanos, ultimosPrecios, yaConsultadas });
    if (!renglones.length) return { ok: true, consultados: 0 };
    const r = await pedirJsonImpl({
      instrucciones: instruccionesPropuestaIa({ proveedor, renglones }),
      esquema: ESQUEMA_PROPUESTA_IA,
      timeoutMs: ESPERA_PROPUESTA_IA_MS,
      env,
      fetchImpl,
      comprobanteId,
    });
    if (!r?.ok) {
      console.error(`[propuesta IA] ${etiqueta}: no se pudo consultar (${r?.motivo ?? "sin motivo"}). La recepción sigue igual.`);
      return { ok: false, motivo: r?.motivo ?? "SIN_RESPUESTA" };
    }
    const validadas = validarRespuestaIa(r.datos, renglones);
    const filasPorLinea = new Map(filas.map((f) => [Number(f.lineaId), f]));
    const aGuardar = propuestasAGuardar({ grupoId, renglones, validadas, filasPorLinea, fichas, variacionNormalPct, modelo: r.modelo ?? null });
    if (aGuardar.length) await guardar(aGuardar);
    return { ok: true, consultados: renglones.length, validas: aGuardar.filter((p) => p.valida).length, guardadas: aGuardar, consumo: r.consumo ?? null };
  } catch (e) {
    console.error(`[propuesta IA] ${etiqueta}: falló (${e?.message ?? e}). La recepción sigue igual.`);
    return { ok: false, motivo: "ERROR" };
  }
}
