"use client";

// PASAR UN CONTROL A ACTUALIZAR PRECIOS.
//
// ── POR QUÉ PIDE EL RANGO ACÁ ───────────────────────────────────────────────
//
// Porque controlar no lo pregunta, y actualizar no puede sin él: es el criterio
// que decide qué lectura del precio se toma y qué filas se marcan para revisar.
// Sin rango, `decidirLista` devuelve SIN_RANGO y la lista entera queda para
// revisar a mano — que es peor que no haber pasado.
//
// Se pide en el momento de pasar y no antes porque hasta acá no hacía falta.
// Quien subió el archivo para mirar si coincidía no tenía por qué contestar
// cuánto suele aumentar este proveedor; ahora que decidió actualizar, sí.
//
// ── Y POR QUÉ NO SE ESCRIBE NINGÚN COSTO ────────────────────────────────────
//
// Pasar vuelve a conciliar la MISMA importación con el rango nuevo y deja el
// resultado de siempre, con su botón de aplicar y su confirmación. Esta hoja no
// es la que escribe, y el texto lo dice: si fuera la última pantalla antes de
// tocar los costos, tendría que enumerar qué pasa con el precio de venta, como
// hace `HojaConfirmarAplicar`.

import { useState } from "react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
// El rango se valida con la MISMA función que usa el motor. Escribir acá una
// comparación parecida es lo que CLAUDE.md prohíbe: no se rompen el día que se
// escriben, se rompen el día que una cambia.
import { rangoValido } from "@/lib/proveedores/listas/rangoAumento";

export default function HojaPasarAActualizar({
  proveedor,
  // El rango que el proveedor tenga guardado, para arrancar con algo en vez de
  // dos campos vacíos. Puede no haberlo: controlar se puede hacer sin él.
  minSugerido = null,
  maxSugerido = null,
  trabajando = false,
  error = null,
  onPasar,
  onVolver,
}) {
  const [minPct, setMinPct] = useState(minSugerido === null ? "" : String(minSugerido));
  const [maxPct, setMaxPct] = useState(maxSugerido === null ? "" : String(maxSugerido));

  const min = minPct === "" ? null : Number(minPct);
  const max = maxPct === "" ? null : Number(maxPct);
  // ── EL 0 A 0 NO SIRVE ACÁ, Y ES EL CASO QUE ORIGINÓ TODO ─────────────────
  //
  // `rangoValido` lo acepta —0 ≤ 0— y ahí empezó el problema: una lista de
  // actualizar con el rango en cero se rinde eligiendo la columna y deja todas
  // las filas para revisar. El servidor hoy lo convierte de nuevo en un control,
  // así que pasar a actualizar con 0 a 0 dejaría la importación exactamente
  // donde estaba, y desde la pantalla se vería como un botón que no hace nada.
  const esCeroACero = min === 0 && max === 0;
  const puedePasar =
    min !== null && max !== null && rangoValido({ minPct: min, maxPct: max }) && !esCeroACero && !trabajando;

  return (
    <SunmiModalLayout
      open
      title="Pasar a actualizar precios"
      color="amber"
      onClose={trabajando ? undefined : onVolver}
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      // LLEVA `destructivo`: hay dos campos escritos que se pierden si el velo
      // cierra la hoja con un toque del pulgar. El criterio del kit es qué se
      // pierde al cerrar sin querer, no qué tan grave es la acción.
      destructivo
      footer={
        <div className="space-y-2 w-full">
          <SunmiButton
            color="cyan"
            onClick={() => onPasar({ minPct: min, maxPct: max })}
            disabled={!puedePasar}
            className="w-full min-h-toque text-base font-bold"
          >
            {trabajando ? "Pasando…" : "Volver a leer con este aumento"}
          </SunmiButton>
          <SunmiButton
            color="slate"
            onClick={onVolver}
            disabled={trabajando}
            className="w-full min-h-toque text-sm3"
          >
            Volver
          </SunmiButton>
        </div>
      }
    >
      <p className="text-sm3 sunmi-text-strong leading-snug">
        Para actualizar precios hace falta saber cuánto suele aumentar{" "}
        {proveedor || "este proveedor"}: es lo que decide qué costos se cambian solos y cuáles te
        muestro para que los mires.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-sm2 sunmi-text-muted block">Desde</span>
          <SunmiInput
            type="number"
            inputMode="decimal"
            value={minPct}
            onChange={(e) => setMinPct(e.target.value)}
            placeholder="5"
            aria-label="Aumento mínimo esperado, en por ciento"
            className="min-h-toque text-base w-full"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm2 sunmi-text-muted block">Hasta</span>
          <SunmiInput
            type="number"
            inputMode="decimal"
            value={maxPct}
            onChange={(e) => setMaxPct(e.target.value)}
            placeholder="8"
            aria-label="Aumento máximo esperado, en por ciento"
            className="min-h-toque text-base w-full"
          />
        </label>
      </div>

      {esCeroACero && (
        <p className="text-sm2 sunmi-text-warning leading-snug">
          Con 0 % a 0 % esto sigue siendo un control: para actualizar precios poné cuánto suele
          aumentar.
        </p>
      )}

      <p className="text-sm2 sunmi-text-muted leading-snug">
        No se cambia ningún costo todavía. Se vuelve a leer esta misma lista —no hace falta subir
        el archivo de nuevo— y vas a ver el resultado antes de aplicar.
      </p>

      {error && <p className="text-sm2 sunmi-text-danger leading-snug">{error}</p>}
    </SunmiModalLayout>
  );
}
