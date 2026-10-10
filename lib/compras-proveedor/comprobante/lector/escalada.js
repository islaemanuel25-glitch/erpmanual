// lib/compras-proveedor/comprobante/lector/escalada.js
//
// CUANDO LA LECTURA DE TODOS LOS DÍAS NO ALCANZA, O NO HAY CON QUÉ GUIARLA,
// LEE EL MODELO GRANDE.
//
// ── EL OBJETIVO, DE EMANUEL (2026-10-08/09) ───────────────────────────────
//
// Que ningún cliente tenga que configurar ni explicar proveedor por proveedor.
// El modelo grande interpreta la boleta como lo haría una persona y explica
// cómo viene armada; alguien confirma esa explicación UNA vez y queda como la
// receta del proveedor, con la que lee Flash de ahí en adelante.
//
// ── CUÁNDO ENTRA, Y CUÁNDO NO ─────────────────────────────────────────────
//
// Una sola vez por pedido de lectura y nunca en bucle —su respaldo, una vez
// más, solo si el titular no pudo contestar: ver
// `MOTIVOS_QUE_PASAN_EN_LA_ESCALADA`—:
//
//   a) FALTAN_RENGLONES — Flash transcribió menos de los que dice ver.
//   b) NO_CIERRA        — los costos de Flash no suman el total del papel.
//   c) SIN_RECETA       — el proveedor no tiene una explicación confirmada: no
//      hay con qué guiar a Flash, así que lee directamente el grande (desde el
//      2026-10-10, por Secco #256).
//   d) FLASH_SIN_RESPUESTA — Flash venció su espera sin contestar.
//
// NO entra cuando el papel no trae total (SIN_TOTAL): sin total no hay contra
// qué verificar lo que diga. Tampoco cuando Flash falló por cuota, servicio
// caído o respuesta cortada: eso se arregla volviendo a leer.
//
// ── LA PALABRA DEL MODELO GRANDE NO VALE ──────────────────────────────────
//
// Lo que devuelve pasa por la MISMA puerta que una lectura de Flash: la suma
// de los costos finales contra el total impreso. Si cierra, su lectura queda y
// su explicación se propone como receta. Si no cierra, queda lo de Flash —o
// nada, si no hubo— y su estado: ni costo propuesto, ni receta propuesta.
//
// Este módulo no toca la base ni la red: el intérprete entra por parámetro.

import { pasarPorLaPuerta, ESTADO } from "./puerta.js";
import { MOTIVO_LECTURA } from "./contrato.js";
import { correspondePasarAlRespaldo, MOTIVOS_QUE_PASAN_EN_LA_ESCALADA } from "./cadena.js";

/** Los casos en que entra el modelo grande. Se guardan en `LlamadaLector.escalada`. */
export const ESCALADA = Object.freeze({
  FALTAN_RENGLONES: "FALTAN_RENGLONES",
  NO_CIERRA: "NO_CIERRA",
  SIN_RECETA: "SIN_RECETA",
  /**
   * d) Flash no contestó a tiempo: venció su espera sin devolver nada.
   *
   * No es calidad sino disponibilidad —no hubo lectura que juzgar—, y es justo
   * cuando más hace falta otro lector: el comprobante 22 de Das se cortó tres
   * veces así (medido en producción el 2026-10-10).
   */
  FLASH_SIN_RESPUESTA: "FLASH_SIN_RESPUESTA",
});

/**
 * ¿HAY QUE LLAMAR AL MODELO GRANDE? Y si hay, por cuál caso.
 *
 * @param resultado       lo que devolvió la cadena de Flash, o null si Flash no leyó
 * @param puerta          lo que dijo la puerta sobre esa lectura
 * @param sinExplicacion  true si el proveedor no tiene explicación confirmada
 * @returns una clave de `ESCALADA`, o null
 */
export function motivoDeEscalada({ resultado, puerta, sinExplicacion = false } = {}) {
  // Sin explicación confirmada no hay con qué guiar a Flash: lee el grande.
  if (sinExplicacion) return ESCALADA.SIN_RECETA;
  // Flash que no terminó: el único fallo de Flash que escala. Los demás —cuota,
  // servicio caído, respuesta cortada— no son "Flash no alcanza" y se
  // arreglan volviendo a leer.
  if (resultado?.ok !== true) {
    return resultado?.motivo === MOTIVO_LECTURA.TARDO_DEMASIADO ? ESCALADA.FLASH_SIN_RESPUESTA : null;
  }
  if (!puerta) return null;
  if (puerta.estado === ESTADO.SIN_TOTAL) return null;
  // El conteo se mira en la lectura y no en `puerta.faltanLineas`: una lectura
  // de CERO renglones sale de la puerta por la rama de "inutilizable", que no
  // cuenta renglones, y es justamente la peor de las cortas.
  const dice = Number(resultado.lectura?.lineasEnElPapel);
  const trajo = Array.isArray(resultado.lectura?.lineas) ? resultado.lectura.lineas.length : 0;
  if (Number.isFinite(dice) && dice > trajo) return ESCALADA.FALTAN_RENGLONES;
  if (!puerta.cierra) return ESCALADA.NO_CIERRA;
  return null;
}

/**
 * EL VEREDICTO SOBRE LO QUE DEVOLVIÓ EL MODELO GRANDE. Lo da el código.
 *
 * Cierra si la puerta dice que cierra —la suma de los costos finales da el
 * total impreso— y no falta ningún renglón.
 */
export function verificarLaInterpretacion({ lectura, receta }) {
  const puerta = pasarPorLaPuerta({ lectura, receta });
  if (!puerta.cierra) return { cierra: false, puerta, porque: puerta.porque };
  if (puerta.faltanLineas) return { cierra: false, puerta, porque: puerta.avisoLineas };
  return { cierra: true, puerta, porque: null };
}

/** Por qué no se pudo interpretar, en pocas palabras. */
const RAZON_DE_LA_FALLA = Object.freeze({
  [MOTIVO_LECTURA.TARDO_DEMASIADO]: "tardó más de lo que se lo espera",
  [MOTIVO_LECTURA.LECTURA_CORTADA]: "la respuesta llegó cortada",
  [MOTIVO_LECTURA.CUOTA_AGOTADA]: "se agotó la cuota del servicio",
  [MOTIVO_LECTURA.SERVICIO_CAIDO]: "el servicio no contestó",
});

/** Lo que se le dice a la persona. Uno por desenlace, ninguno en silencio. */
export function textoDeLaEscalada({ cerro, llamo, propone = false, motivoFalla = null, porque = null }) {
  if (!llamo) return null;
  if (cerro) {
    return (
      "Lo leyó el lector grande y la cuenta cierra." +
      (propone
        ? " Además explicó cómo viene la boleta de este proveedor: está para confirmar en Recetas de facturas."
        : "")
    );
  }
  if (motivoFalla) {
    return (
      `No se pudo interpretar el papel con el lector grande: ${RAZON_DE_LA_FALLA[motivoFalla] ?? "no contestó"}. ` +
      "Volver a leer puede servir."
    );
  }
  return `Lo leyó también el lector grande y tampoco cierra. ${porque ?? "No se propone ningún costo ni receta."}`;
}

/**
 * LEER CON EL MODELO GRANDE, SI HACE FALTA. UNA VEZ, Y SU RESPALDO SOLO SI EL
 * TITULAR NO PUDO CONTESTAR.
 *
 * @param resultado       lo que devolvió la cadena de Flash, o null si no leyó
 * @param receta          la del proveedor, con su `explicacion`; o null
 * @param recetaVersion   su versión, null si no hay confirmada
 * @param sinExplicacion  true si el proveedor no tiene explicación confirmada
 * @param interpretes     `{ titular, respaldo }`, cada uno
 *                        `{ nombre, disponible(), interpretar() }`
 * @param archivos        las fotos del comprobante
 *
 * @returns `{ motivo, llamo, llamadas, cerro, texto }` y, si cerró, además
 *          `lectura` y `receta` —las que reemplazan a las de Flash— y
 *          `propuesta` con la explicación a dejar pendiente, o null cuando es
 *          la misma que ya está confirmada.
 */
export async function escalarAlModeloGrande({
  resultado,
  receta,
  recetaVersion = null,
  sinExplicacion = false,
  interpretes = null,
  archivos = [],
  proveedorNombre = null,
} = {}) {
  const puertaFlash = resultado?.ok === true
    ? pasarPorLaPuerta({ lectura: resultado.lectura, receta, recetaVersion })
    : null;
  const motivo = motivoDeEscalada({ resultado, puerta: puertaFlash, sinExplicacion });
  const nada = { motivo, llamo: false, llamadas: [], cerro: false, texto: null };
  if (!motivo) return nada;

  const disponibles = [interpretes?.titular, interpretes?.respaldo].filter((i) => i?.disponible?.().ok);
  if (!disponibles.length) return { ...nada, disponible: false };

  // ── CADA LLAMADA SE ANOTA, SALGA COMO SALGA, CON EL MODELO QUE LA ATENDIÓ ─
  const llamadas = [];
  let pro = null;
  for (const interprete of disponibles) {
    pro = await interprete.interpretar({
      archivos,
      receta,
      referencia: resultado?.ok === true ? resultado.lectura : null,
      motivo,
      proveedorNombre,
    });
    llamadas.push({
      lector: interprete.nombre,
      ok: pro?.ok === true,
      motivo: pro?.ok ? null : pro?.motivo ?? null,
      detalle: pro?.ok ? null : pro?.detalle ?? null,
      escalada: motivo,
      duracionMs: pro?.duracionMs ?? null,
      tokens: pro?.tokens ?? null,
      respuestaCruda: pro?.respuestaCruda ?? null,
    });
    // Al respaldo SOLO si el titular no pudo contestar. Una respuesta
    // ilegible o una lectura que no cierra NO pasan: ver `cadena.js`.
    if (pro?.ok === true || !correspondePasarAlRespaldo(pro?.motivo, MOTIVOS_QUE_PASAN_EN_LA_ESCALADA)) break;
  }
  if (pro?.ok !== true) {
    return {
      motivo, llamo: true, llamadas, cerro: false,
      texto: textoDeLaEscalada({ llamo: true, cerro: false, motivoFalla: pro?.motivo ?? MOTIVO_LECTURA.SERVICIO_CAIDO }),
    };
  }

  // ── LA RECETA QUE QUEDA CON LA LECTURA ES SU EXPLICACIÓN ───────────────
  //
  // El costo no sale de la receta: lo trae cada renglón. Lo que se guarda con
  // el comprobante es cómo se leyó, para poder mirarlo dentro de seis meses.
  const explicacion = pro.propuesta?.explicacion ?? pro.lectura?.explicacion ?? null;
  const recetaUsada = { interpretada: true, explicacion };
  const veredicto = verificarLaInterpretacion({ lectura: pro.lectura, receta: recetaUsada });
  if (!veredicto.cierra) {
    return {
      motivo, llamo: true, llamadas, cerro: false, porque: veredicto.porque,
      // Su lectura viaja igual: si Flash no leyó —proveedor sin explicación—
      // es la única que hay, y una lectura que no cierra se guarda como tal
      // para poder recibir igual y corregir a mano. No propone nada.
      lectura: pro.lectura,
      receta: recetaUsada,
      texto: textoDeLaEscalada({ llamo: true, cerro: false, porque: veredicto.porque }),
    };
  }

  // Si explicó lo mismo que ya está confirmado, no hay nada que aprender.
  const confirmada = String(receta?.explicacion ?? "").trim();
  const propone = Boolean(explicacion) && explicacion !== confirmada;
  return {
    motivo,
    llamo: true,
    llamadas,
    cerro: true,
    // Quién respondió: el que dejó la propuesta.
    modelo: llamadas[llamadas.length - 1].lector,
    lectura: pro.lectura,
    receta: recetaUsada,
    recetaVersion: propone ? null : recetaVersion,
    propuesta: propone ? { explicacion } : null,
    texto: textoDeLaEscalada({ llamo: true, cerro: true, propone }),
  };
}
