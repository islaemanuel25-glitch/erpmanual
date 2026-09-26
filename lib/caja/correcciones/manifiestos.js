// lib/caja/correcciones/manifiestos.js
//
// LOS MANIFIESTOS DE CORRECCIÓN HISTÓRICA DE CAJA, VERSIONADOS EN EL REPO.
//
// Vacío a propósito: este archivo nace con la herramienta, sin ningún incidente
// real. Cada incidente entra en su propia tanda, primero PROPUESTO.
//
// ── EL CICLO DE UN INCIDENTE ───────────────────────────────────────────────
//
//  1. Entra PROPUESTO, con el valor FUENTE corregido y el valor anterior que
//     tiene que encontrar. Nada más: las copias derivadas no se escriben acá.
//  2. Se despliega y se corre el ENSAYO EN SECO en producción. El ensayo calcula
//     todas las copias con las funciones del circuito, ejercita los UPDATE y los
//     deshace, y devuelve el plan completo con su huella.
//  3. Emanuel revisa ese plan.
//  4. Si está bien, el manifiesto pasa a AUTORIZADO con ESA huella exacta y quién
//     la autorizó, en otra tanda.
//  5. Recién ahí aparece el botón de aplicar. Si algo cambió desde el ensayo, la
//     huella no coincide y no se aplica: se vuelve al paso 2.
//
// ── EL FORMATO ─────────────────────────────────────────────────────────────
//
//   {
//     codigo: "I4",
//     estado: "PROPUESTO" | "AUTORIZADO",
//     motivo: "Recepción del sobre 190 cargada ×1000",
//     evidencia: "El sobre dice $23.000 y ...",
//     dependeDe: ["I2-ORIGEN"],            // opcional: correcciones que tienen que estar aplicadas
//     autorizacion: {                       // solo AUTORIZADO
//       hash: "<64 hex del ensayo revisado>",
//       autorizadoPorUsuarioId: 1,
//     },
//     correcciones: [
//       { tipo: "RECEPCION_SOBRE", cambioPendienteId: 190,
//         antes:   { desgloseRecibido: { "1000": 23000 } },
//         despues: { desgloseRecibido: { "1000": 23 } } },
//       { tipo: "CORTE", cierrePreparacionId: 201,
//         antes:   { desgloseCambio: { "1000": 23000 } },
//         despues: { desgloseCambio: { "1000": 23 } } },
//     ],
//   }
//
// Un CORTE puede corregir `desgloseCambio`, `desgloseRetiroContado` o los dos.
// Una RECEPCION_SOBRE corrige `desgloseRecibido`. No hay otro tipo, y ninguno
// toca ventas.
//
// Los incidentes cuyo valor correcto no está demostrado —I3, I7, I12— NO entran
// acá, ni siquiera como PROPUESTO. Tampoco el turno 277 / corte 85: está en
// `EXCLUSIONES` y el plan lo rechaza aunque alguien lo agregue.

/** @type {Array<object>} */
export const MANIFIESTOS = [];

/** El manifiesto de un código, o null. */
export function buscarManifiesto(codigo, lista = MANIFIESTOS) {
  return lista.find((m) => m.codigo === codigo) ?? null;
}
