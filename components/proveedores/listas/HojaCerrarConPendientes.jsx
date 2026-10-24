"use client";

// "TE QUEDAN PRECIOS SIN APLICAR": LO QUE SE ABRE AL TERMINAR O CANCELAR UNA
// LISTA QUE TODAVÍA TIENE ALGO PARA APLICAR (Emanuel, 2026-10-24).
//
// Terminar cerraba directo y una lista terminada ya no se aplica: 56 precios
// revisados se perdieron sin un aviso. Esta hoja dice cuáles quedan y ofrece
// aplicarlos primero. Las cuentas y los textos están en `cerrarConPendientes.js`.
//
//   Terminar:  una tarjeta por producto con precio nuevo sin aplicar, cada una
//              con su «✓ Usar» · «✓ Aplicar estos N y terminar» · «Terminar sin
//              aplicar» · «Volver». Si además quedan para revisar, una línea
//              gris con «Ver», que abre ese chip.
//   Cancelar:  «Cancelar sin aplicar» · «Volver». Cancelar es "esto no
//              servía": no se ofrece aplicar, se avisa que se pierden.
//
// ── POR QUÉ LAS TARJETAS (Dab, producción d158de62) ─────────────────────────
//
// Decía "3 listos sin tildar" y nada más: Emanuel no sabía qué 3 productos eran
// ni podía hacer nada desde ahí. Las tarjetas son las de la hoja de bajas
// (`TarjetaPrecioNuevo`) con el «✓ Usar» de la revisión (`BotonUsar`), que hace
// lo mismo que en la tarjeta de la pantalla.
//
// Si no hay tarjetas que mostrar —las cuentas del servidor nombran filas que no
// son de ninguna tarjeta— queda el texto con los números, y «Aplicar y
// terminar» solo si hay marcados: aplicar no toca lo que nadie marcó.
//
// La pieza es la confirmación del kit en forma de hoja, la misma de abajo que
// abren vincular y el reporte.

import SunmiHojaDeConfirmacion from "@/components/sunmi/SunmiHojaDeConfirmacion";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import TarjetaPrecioNuevo from "@/components/proveedores/listas/TarjetaPrecioNuevo";
import { BotonUsar } from "@/components/proveedores/listas/TarjetaProductoDeLaLista";
import { ESTADO_TU_PRODUCTO } from "@/lib/proveedores/listas/tusProductos";
import {
  CIERRE,
  TEXTO_APLICAR_Y_TERMINAR,
  TEXTO_CANCELAR_SIN_APLICAR,
  TEXTO_TERMINAR_SIN_APLICAR,
  TITULO_PENDIENTES,
  textoAplicarEstosYTerminar,
  textoDeLosPendientes,
  textoDePendientes,
  textoQuedanParaRevisar,
} from "@/lib/proveedores/listas/cerrarConPendientes";

/**
 * @param accion        CIERRE.TERMINAR o CIERRE.CANCELAR
 * @param pendientes    `pendientesAlCerrar()`: { listos, sinTildar }
 * @param productos     `productosPendientes()`: { sinMarcar, marcados, todos }
 * @param paraRevisar   cuántos quedan en «Para revisar» fuera de las tarjetas
 * @param tocando       el productoBaseId cuyo «✓ Usar» está en vuelo
 * @param trabajando    aplicando o cerrando: apaga los botones y el velo
 * @param onUsar, onVerParaRevisar, onAplicarYTerminar, onCerrarSinAplicar, onVolver
 */
export default function HojaCerrarConPendientes({
  accion = CIERRE.TERMINAR,
  pendientes,
  productos = null,
  paraRevisar = 0,
  tocando = null,
  trabajando = false,
  onUsar,
  onVerParaRevisar,
  onAplicarYTerminar,
  onCerrarSinAplicar,
  onVolver,
}) {
  const comun = {
    forma: "hoja",
    titulo: TITULO_PENDIENTES,
    trabajando,
    onVolver,
  };
  const todos = productos?.todos ?? [];

  if (accion === CIERRE.TERMINAR && todos.length > 0) {
    return (
      <SunmiHojaDeConfirmacion
        {...comun}
        puntos={[textoDeLosPendientes(productos)]}
        textoConfirmar={textoAplicarEstosYTerminar(todos.length)}
        textoTrabajando="Aplicando…"
        colorConfirmar="primary"
        onConfirmar={onAplicarYTerminar}
        textoAlternativa={TEXTO_TERMINAR_SIN_APLICAR}
        colorAlternativa="secondary"
        onAlternativa={onCerrarSinAplicar}
      >
        <div className="space-y-2">
          {todos.map((it) => (
            <TarjetaPrecioNuevo
              key={it.productoBaseId}
              nombre={it.nombre}
              costoHoy={it.costoHoy}
              costoNuevo={it.costoNuevo}
              variacionPct={it.variacionPct}
              accion={
                it.usar ? (
                  <BotonUsar
                    enUso={it.estado === ESTADO_TU_PRODUCTO.CAMBIA}
                    trabajando={trabajando || tocando === it.productoBaseId}
                    onClick={() => onUsar?.(it)}
                  />
                ) : null
              }
            />
          ))}
        </div>
        {paraRevisar > 0 ? (
          <p className="text-sm2 sunmi-text-muted leading-snug">
            {textoQuedanParaRevisar(paraRevisar)}{" "}
            <SunmiLinkButton onClick={onVerParaRevisar} disabled={trabajando} className="text-sm2">
              Ver
            </SunmiLinkButton>
          </p>
        ) : null}
      </SunmiHojaDeConfirmacion>
    );
  }

  const puntos = [textoDePendientes(pendientes, accion)];

  if (accion === CIERRE.TERMINAR && pendientes?.listos > 0) {
    return (
      <SunmiHojaDeConfirmacion
        {...comun}
        puntos={puntos}
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
      puntos={puntos}
      textoConfirmar={accion === CIERRE.CANCELAR ? TEXTO_CANCELAR_SIN_APLICAR : TEXTO_TERMINAR_SIN_APLICAR}
      textoTrabajando={accion === CIERRE.CANCELAR ? "Cancelando…" : "Terminando…"}
      colorConfirmar="secondary"
      onConfirmar={onCerrarSinAplicar}
    />
  );
}
