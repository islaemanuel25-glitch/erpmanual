// lib/caja/retiroDinero.js
//
// RETIRO DE RECAUDACIÓN: contar el cajón, dejar un fondo y sacar el resto, en
// una sola operación.
//
// Antes esto eran DOS actos sin relación: un arqueo (que solo fotografía) y un
// CajaMovimiento RETIRO manual (que sí descuenta). Si el cajero hacía el primero
// y olvidaba el segundo, el sistema le imputaba un faltante exactamente igual a
// lo que había retirado. Ese es el bug que este módulo cierra.
//
// Es PURO: no consulta la base, no conoce Prisma y no sabe de HTTP. La aritmética
// que decide cuánta plata sale del cajón se puede probar sin levantar nada.
//
// NO duplica la fórmula del efectivo esperado —esa vive una sola vez en
// efectivoEsperado.js— ni la invariante del reparto, que se delega a
// cierreCaja.js. Acá solo está lo propio del retiro: cuánto conviene sacar.

import { aCentavos, desdeCentavos } from "./efectivoEsperado.js";
import { validarRepartoCierre } from "./cierreCaja.js";

/**
 * Fondo objetivo efectivo del local.
 *
 * Orden de resolución, sin atajos:
 *   1. lo configurado en el local (ConfiguracionLocal.fondoObjetivoCaja);
 *   2. si no hay, el montoInicial del turno —que es el fondo con el que se abrió;
 *   3. y si tampoco hay, 0.
 *
 * El paso 3 NO es "asumir cero": es el piso aritmético cuando no existe ningún
 * dato. Con fondo 0 el sugerido es "retirar todo", así que la UI tiene que
 * advertirlo; por eso se devuelve también de dónde salió el valor.
 *
 * @returns {{fondoObjetivo:number, origen:'CONFIGURADO'|'MONTO_INICIAL'|'SIN_DATO'}}
 */
export function resolverFondoObjetivo({ configurado, montoInicial } = {}) {
  const cfg = Number(configurado);
  if (Number.isFinite(cfg) && cfg >= 0 && configurado !== null && configurado !== undefined && configurado !== "") {
    return { fondoObjetivo: desdeCentavos(aCentavos(cfg)), origen: "CONFIGURADO" };
  }
  const ini = Number(montoInicial);
  if (Number.isFinite(ini) && ini >= 0 && montoInicial !== null && montoInicial !== undefined && montoInicial !== "") {
    return { fondoObjetivo: desdeCentavos(aCentavos(ini)), origen: "MONTO_INICIAL" };
  }
  return { fondoObjetivo: 0, origen: "SIN_DATO" };
}

/**
 * Cuánto conviene retirar para dejar el fondo objetivo.
 *
 *   sugerido = max(0, contado − fondoObjetivo)
 *
 * El `max(0, …)` no es defensivo, es la regla: si en el cajón hay MENOS que el
 * fondo objetivo no se retira nada. Un sugerido negativo significaría "poner
 * plata", que no es un retiro y no puede salir de esta pantalla.
 */
export function calcularRetiroSugerido({ efectivoContado, fondoObjetivo } = {}) {
  const contadoCent = aCentavos(efectivoContado);
  const objetivoCent = aCentavos(fondoObjetivo);
  if (contadoCent <= 0) return 0;
  return desdeCentavos(Math.max(0, contadoCent - Math.max(0, objetivoCent)));
}

/**
 * Reparto completo sugerido: qué se retira y qué queda.
 *
 * Si el contado no alcanza el objetivo, queda TODO como fondo y no se retira
 * nada: el fondo real es menor al deseado y la pantalla debe mostrarlo, no
 * disimularlo retirando de menos.
 */
export function sugerirRepartoRetiro({ efectivoContado, fondoObjetivo } = {}) {
  const contadoCent = Math.max(0, aCentavos(efectivoContado));
  const retiradoCent = aCentavos(calcularRetiroSugerido({ efectivoContado, fondoObjetivo }));
  return {
    efectivoRetirado: desdeCentavos(retiradoCent),
    fondoDejado: desdeCentavos(contadoCent - retiradoCent),
  };
}

/**
 * Valida el reparto elegido. Invariante EXACTA, en centavos enteros:
 *
 *   efectivoRetirado + fondoDejado = efectivoContado
 *
 * Delega en `validarRepartoCierre`, que ya implementa esta misma invariante para
 * el cierre. Reimplementarla acá sería una segunda copia de la regla que decide
 * si falta plata, y basta con que una se desincronice para que el retiro y el
 * cierre acepten repartos distintos sobre el mismo conteo. En la etapa 5, cuando
 * el cierre pase a ser "el último retiro", queda una sola función y este
 * envoltorio desaparece.
 */
export function validarRepartoRetiro({ efectivoContado, efectivoRetirado, fondoDejado } = {}) {
  const r = validarRepartoCierre({
    contado: efectivoContado,
    retirado: efectivoRetirado,
    fondoDejado,
  });
  return {
    valido: r.valido,
    error: r.error,
    efectivoRetirado: r.retirado,
    fondoDejado: r.fondoDejado,
  };
}

/**
 * Motivo del CajaMovimiento generado por un retiro.
 *
 * Es solo para que un humano lea el historial. El vínculo real entre el retiro y
 * su movimiento es `ArqueoCaja.cajaMovimientoRetiroId`, con UNIQUE en la base:
 * NUNCA se busca ni se desduplica por este texto.
 */
export function motivoRetiroRecaudacion(arqueoId) {
  return `Retiro de recaudación #${arqueoId}`;
}

/** Prefijo reservado: el modal de egresos manuales no puede imitarlo. */
export const PREFIJO_MOTIVO_RESERVADO = "Retiro de recaudación";

/** Minúsculas y SIN diacríticos, para comparar motivos escritos a mano. */
function normalizarMotivo(texto) {
  return String(texto ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * ¿Este motivo pertenece al flujo automático?
 *
 * Se usa para RECHAZAR que un egreso manual se haga pasar por un retiro de
 * recaudación. NO es lo que impide el doble descuento —de eso se encarga el
 * vínculo 1:1 por id, con UNIQUE en la base—: acá lo que se protege es que el
 * historial siga siendo legible y que nadie fabrique a mano una línea idéntica a
 * la que genera el sistema.
 *
 * Se comparan los acentos NORMALIZADOS: "recaudacion" sin tilde, o con la tilde
 * mal codificada, son exactamente el mismo intento y tienen que rechazarse
 * igual. Un guard que solo detecta la grafía perfecta no protege de nada.
 */
export function esMotivoReservado(motivo) {
  return normalizarMotivo(motivo).startsWith(normalizarMotivo(PREFIJO_MOTIVO_RESERVADO));
}

/** Clave de idempotencia del retiro. Obligatoria: ver el comentario del schema. */
export function validarIdempotencyKey(clave) {
  const s = String(clave ?? "").trim();
  if (!s) return { valido: false, error: "Falta la clave de idempotencia del retiro." };
  if (s.length > 120) return { valido: false, error: "La clave de idempotencia es demasiado larga." };
  return { valido: true, clave: s };
}
