"use client";

// "TE QUEDAN PRECIOS SIN APLICAR": LO QUE SE ABRE AL TERMINAR O CANCELAR UNA
// LISTA QUE TODAVÍA TIENE ALGO PARA APLICAR (Emanuel, 2026-10-24).
//
// Terminar cerraba directo y una lista terminada ya no se aplica: 56 precios
// revisados se perdieron sin un aviso. Esta hoja dice cuántos quedan y ofrece
// aplicar primero. Las cuentas y los textos están en `cerrarConPendientes.js`.
//
//   Terminar:  «✓ Aplicar y terminar» · «Terminar sin aplicar» · «Volver»
//   Cancelar:  «Cancelar sin aplicar» · «Volver». Cancelar es "esto no
//              servía": no se ofrece aplicar, se avisa que se pierden.
//
// Si solo quedan listos sin tildar, aplicar no los tocaría —aplica los
// tildados—, así que «Aplicar y terminar» no se ofrece: sería un botón que
// promete algo que no hace.
//
// La pieza es la confirmación del kit en forma de hoja, la misma de abajo que
// abren vincular y el reporte.

import SunmiHojaDeConfirmacion from "@/components/sunmi/SunmiHojaDeConfirmacion";
import {
  CIERRE,
  TEXTO_APLICAR_Y_TERMINAR,
  TEXTO_CANCELAR_SIN_APLICAR,
  TEXTO_TERMINAR_SIN_APLICAR,
  TITULO_PENDIENTES,
  textoDePendientes,
} from "@/lib/proveedores/listas/cerrarConPendientes";

/**
 * @param accion        CIERRE.TERMINAR o CIERRE.CANCELAR
 * @param pendientes    `pendientesAlCerrar()`: { listos, sinTildar }
 * @param trabajando    aplicando o cerrando: apaga los botones y el velo
 * @param onAplicarYTerminar, onCerrarSinAplicar, onVolver
 */
export default function HojaCerrarConPendientes({
  accion = CIERRE.TERMINAR,
  pendientes,
  trabajando = false,
  onAplicarYTerminar,
  onCerrarSinAplicar,
  onVolver,
}) {
  const comun = {
    forma: "hoja",
    titulo: TITULO_PENDIENTES,
    puntos: [textoDePendientes(pendientes, accion)],
    trabajando,
    onVolver,
  };

  if (accion === CIERRE.TERMINAR && pendientes?.listos > 0) {
    return (
      <SunmiHojaDeConfirmacion
        {...comun}
        textoConfirmar={TEXTO_APLICAR_Y_TERMINAR}
        textoTrabajando="Aplicando…"
        colorConfirmar="primary"
        onConfirmar={onAplicarYTerminar}
        textoAlternativa={TEXTO_TERMINAR_SIN_APLICAR}
        colorAlternativa="secondary"
        onAlternativa={onCerrarSinAplicar}
      />
    );
  }

  return (
    <SunmiHojaDeConfirmacion
      {...comun}
      textoConfirmar={accion === CIERRE.CANCELAR ? TEXTO_CANCELAR_SIN_APLICAR : TEXTO_TERMINAR_SIN_APLICAR}
      textoTrabajando={accion === CIERRE.CANCELAR ? "Cancelando…" : "Terminando…"}
      colorConfirmar="secondary"
      onConfirmar={onCerrarSinAplicar}
    />
  );
}
