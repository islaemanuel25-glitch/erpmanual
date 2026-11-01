// lib/caja/vistaTurno.js
//
// Traducción del cierre de caja a LENGUAJE DIRECTO.
//
// No calcula plata nueva: toda la aritmética contable vive en efectivoEsperado.js
// y en cierreCaja.js. Acá solo se decide QUÉ SE DICE y CÓMO, para que la pantalla
// no tenga texto suelto y esto se pueda probar sin renderizar nada.
//
// Por qué existe: la pantalla mostraba "Sobrante $62.500" y nada más. El cajero
// leía un badge sin saber si eso era grave, ni de dónde salía, ni qué hacer. Un
// sobrante de esa magnitud casi siempre es plata de turnos anteriores que quedó
// en el cajón o un retiro que nadie registró — pero eso es una PISTA, no un
// veredicto, y el texto tiene que decirlo así.
//
// El desglose entre arqueos, la pista del fondo omitido, el resumen de arqueos y
// la etiqueta de cada registro se borraron el 2026-11-01 con la ficha del turno
// viejo, que era su único lector.

import { aCentavos, desdeCentavos } from "./efectivoEsperado.js";

export const CAJA_CORRECTA = "CORRECTA";
export const CAJA_SOBRANTE = "SOBRANTE";
export const CAJA_FALTANTE = "FALTANTE";
/** El turno está CERRADO pero nadie contó la caja: "cerrar sin conteo". */
export const CAJA_SIN_CONTEO = "SIN_CONTEO";

const fmt = (n) =>
  Number(n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Resultado del cierre en palabras.
 *
 * `cerrado` dice si el TURNO ya cerró. Sin él, un contado vacío solo puede
 * significar "todavía no se contó"; con él, y con el contado en null, significa
 * que se cerró sin contar —"cerrar sin conteo"— y la diferencia no se conoce.
 * Decir "turno abierto" ahí sería falso, y calcular una diferencia contra cero,
 * inventarla.
 *
 * @param {{esperado:any, contado:any, cerrado?:boolean}} args
 * @returns {{estado:string, titulo:string, monto:number|null, explicacion:string|null, cerrado:boolean}}
 */
export function resultadoCierre({ esperado, contado, cerrado = false } = {}) {
  if ((contado === null || contado === undefined) && cerrado === true) {
    return {
      estado: CAJA_SIN_CONTEO,
      titulo: "Cerrado sin conteo",
      monto: null,
      explicacion:
        "La caja se cerró sin contar. El esperado es el que quedó congelado en el corte; lo contado y la diferencia no se conocen.",
      cerrado: true,
    };
  }
  if (contado === null || contado === undefined) {
    return {
      estado: null,
      titulo: "Turno abierto",
      monto: 0,
      explicacion: "Todavía no se contó la caja. El resultado aparece al cerrar el turno.",
      cerrado: false,
    };
  }

  const dif = aCentavos(contado) - aCentavos(esperado);
  const monto = desdeCentavos(Math.abs(dif));

  if (dif === 0) {
    return {
      estado: CAJA_CORRECTA,
      titulo: "Caja correcta",
      monto: 0,
      explicacion: "Lo contado coincide exactamente con lo que tenía que haber.",
      cerrado: true,
    };
  }

  if (dif > 0) {
    return {
      estado: CAJA_SOBRANTE,
      titulo: `Sobran $${fmt(monto)}`,
      monto,
      // Pista, no veredicto: se enumeran las causas frecuentes sin afirmar cuál fue.
      explicacion:
        "Este sobrante puede ser dinero de turnos anteriores que quedó en el cajón o retiros no registrados.",
      cerrado: true,
    };
  }

  return {
    estado: CAJA_FALTANTE,
    titulo: `Faltan $${fmt(monto)}`,
    monto,
    explicacion:
      "Este faltante puede ser un error de conteo, un vuelto mal dado o dinero que salió del cajón sin registrarse.",
    cerrado: true,
  };
}
