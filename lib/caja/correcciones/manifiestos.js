// lib/caja/correcciones/manifiestos.js
//
// LOS MANIFIESTOS DE CORRECCIÓN HISTÓRICA DE CAJA, VERSIONADOS EN EL REPO.
//
// Nació vacío con la herramienta. Cada incidente entra en su propia tanda,
// primero PROPUESTO, con los valores anteriores LEÍDOS en producción y la
// composición corregida tomada de un desglose persistido del mismo dinero.
// Desde 2026-09-26: I4 e I6, los dos PROPUESTO.
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
// acá, ni siquiera como PROPUESTO. I5 tampoco: su corte 201 está VENCIDO y el
// turno 396 no está cerrado, y el plan lo rechazaría con razón. Tampoco el turno 277 / corte 85: está en
// `EXCLUSIONES` y el plan lo rechaza aunque alguien lo agregue.

// ── I4 · sobre 190 → turno 388 ──────────────────────────────────────────────
//
// Cadena leída en producción: corte 190 / turno 383 → sobre 190 → turno 388 →
// corte 198 → sobre 198 → turno 399.
//
// El sobre 190 se DEJÓ bien —$23.000— y se RECIBIÓ como $23.000.000: el
// receptor cargó 23000 billetes de $1.000. Ese fondo inflado entró en el
// esperado del turno 388 y en todo lo que se congeló de él.

/** El desglose con que el corte 190 DEJÓ el sobre 190. Persistido, suma $23.000. */
export const DESGLOSE_DEJADO_SOBRE_190 = Object.freeze({ 100: 11, 200: 2, 500: 15, 1000: 14 });

// ── I6 · turno 508 → corte 312 → sobre 312 → turno 510 ─────────────────────
//
// El corte 312 separó el cambio como 23000 billetes de $1.000 —$23.000.000—
// cuando eran $23.000. El retiro contado, $43.500, estuvo bien.

/** El conteo con que el turno 510 RECIBIÓ el sobre 312. Persistido, suma $23.000. */
export const DESGLOSE_RECIBIDO_SOBRE_312 = Object.freeze({ 1000: 3, 20000: 1 });

/** @type {Array<object>} */
export const MANIFIESTOS = [
  {
    codigo: "I4",
    estado: "PROPUESTO",
    motivo:
      "Recepción del sobre 190 cargada ×1000: se contaron 23000 billetes de $1.000 ($23.000.000) " +
      "en un sobre dejado por $23.000. El fondo inflado del turno 388 infló su esperado y su diferencia.",
    evidencia:
      "Composición corregida: el desglose persistido con que el corte 190 DEJÓ ese mismo sobre 190, " +
      "{100: 11, 200: 2, 500: 15, 1000: 14}, que suma exactamente $23.000 y coincide con el cambio del " +
      "corte 190. No se afirma conocer físicamente cada billete recibido: es la única composición " +
      "persistida del mismo sobre que representa el total correcto. El faltante que quede en el turno " +
      "388 después de corregir el fondo es real con la información disponible y no se ajusta.",
    correcciones: [
      {
        tipo: "RECEPCION_SOBRE",
        cambioPendienteId: 190,
        antes: { desgloseRecibido: { 1000: 23000 } },
        despues: { desgloseRecibido: { ...DESGLOSE_DEJADO_SOBRE_190 } },
      },
    ],
  },
  {
    codigo: "I6",
    estado: "PROPUESTO",
    motivo:
      "Cambio del corte 312 separado ×1000: 23000 billetes de $1.000 ($23.000.000) donde eran $23.000. " +
      "Infló el cajón, el fondo dejado, la diferencia del turno 508 y el sobre 312.",
    evidencia:
      "Composición corregida del cambio: el conteo persistido con que el turno 510 RECIBIÓ ese mismo " +
      "sobre 312, {1000: 3, 20000: 1}, que suma exactamente $23.000. Es un conteo real del receptor " +
      "sobre el mismo dinero: no se inventa una composición. El retiro contado del corte 312 " +
      "({500: 1, 1000: 13, 10000: 1, 20000: 1} = $43.500) no se toca.",
    correcciones: [
      {
        tipo: "CORTE",
        cierrePreparacionId: 312,
        antes: { desgloseCambio: { 1000: 23000 } },
        despues: { desgloseCambio: { ...DESGLOSE_RECIBIDO_SOBRE_312 } },
      },
    ],
  },
];

/** El manifiesto de un código, o null. */
export function buscarManifiesto(codigo, lista = MANIFIESTOS) {
  return lista.find((m) => m.codigo === codigo) ?? null;
}
