"use client";

// "ESTOS PRODUCTOS BAJAN DE PRECIO": LO QUE SE ABRE ANTES DE APLICAR CUANDO
// ALGO DE LO QUE SE VA A ESCRIBIR BAJA (Emanuel, 2026-10-24).
//
// Una tarjeta por producto —nombre, "$ hoy → $ nuevo" y el % en rojo— y dos
// botones: «Aplicar igual» y «Volver». Nada se escribe hasta «Aplicar igual».
// Las cuentas están en `bajasDeLaLista.js`.
//
// La pieza es la confirmación del kit en forma de hoja, la misma de "Te quedan
// precios sin aplicar": las tarjetas van en su lugar de contenido.

import SunmiHojaDeConfirmacion from "@/components/sunmi/SunmiHojaDeConfirmacion";
import TarjetaPrecioNuevo from "@/components/proveedores/listas/TarjetaPrecioNuevo";
import { TEXTO_APLICAR_IGUAL, TITULO_BAJAS } from "@/lib/proveedores/listas/bajasDeLaLista";

/**
 * @param bajas       `bajasAlAplicar()`: [{ productoBaseId, nombre, costoHoy, costoNuevo, variacionPct }]
 * @param trabajando  aplicando: apaga los botones y el velo
 * @param onAplicarIgual, onVolver
 */
export default function HojaBajasDePrecio({ bajas = [], trabajando = false, onAplicarIgual, onVolver }) {
  return (
    <SunmiHojaDeConfirmacion
      forma="hoja"
      titulo={TITULO_BAJAS}
      textoConfirmar={TEXTO_APLICAR_IGUAL}
      textoTrabajando="Aplicando…"
      colorConfirmar="primary"
      trabajando={trabajando}
      onConfirmar={onAplicarIgual}
      onVolver={onVolver}
    >
      <div className="space-y-2">
        {bajas.map((b) => (
          <TarjetaPrecioNuevo
            key={b.productoBaseId}
            nombre={b.nombre}
            costoHoy={b.costoHoy}
            costoNuevo={b.costoNuevo}
            variacionPct={b.variacionPct}
          />
        ))}
      </div>
    </SunmiHojaDeConfirmacion>
  );
}
