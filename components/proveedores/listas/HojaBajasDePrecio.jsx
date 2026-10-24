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
import SunmiCard from "@/components/sunmi/SunmiCard";
import { money, pct, tonoDelPorcentaje } from "@/components/proveedores/listas/PiezasPantallas";
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
          <SunmiCard key={b.productoBaseId} className="p-3">
            <p className="text-sm3 font-semibold sunmi-text-strong break-words">{b.nombre}</p>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-sm2 tabular-nums sunmi-text-muted">
                {money(b.costoHoy)} → {money(b.costoNuevo)}
              </span>
              <span className={`shrink-0 text-sm2 font-semibold tabular-nums ${tonoDelPorcentaje(b.variacionPct)}`}>
                {pct(b.variacionPct)}
              </span>
            </div>
          </SunmiCard>
        ))}
      </div>
    </SunmiHojaDeConfirmacion>
  );
}
