"use client";

import SunmiButton from "@/components/sunmi/SunmiButton";
import { formatearPct } from "@/lib/pos-ventas/mediosCobroPantalla";

// ELEGIR CON QUÉ MODALIDAD SE COBRA — lo que abre un botón padre.
//
// ── POR QUÉ ESTO EXISTE ────────────────────────────────────────────────────
//
// "Mercado Pago" es UN botón. Adentro puede haber Débito al 2 % y Crédito al
// 6 %, que cobran distinto y no son dos medios: son dos condiciones del mismo.
// Ponerlos como tres botones en el panel —Mercado Pago, MP Débito, MP Crédito—
// es exactamente lo que este diseño viene a reemplazar.
//
// ── NO CALCULA NADA, Y ES LA REGLA MÁS IMPORTANTE DE ESTE ARCHIVO ──────────
//
// Cada opción muestra un importe, y ese importe viene resuelto de arriba: sale
// de `totalesPorOpcionDeCobro`, que llama al MISMO motor que corre en el
// servidor al registrar la venta. Acá no hay ninguna multiplicación, ningún
// `total * 1.06` y ningún porcentaje aplicado en JSX. Si lo hubiera, el número
// que ve el cliente y el que cobra el backend podrían separarse el día que
// cambie una regla del motor, y nadie se enteraría hasta el arqueo.
//
// El porcentaje que se muestra al lado del nombre es de LECTURA: dice por qué
// ese total es distinto del otro. No se usa para calcularlo.
//
// ── LOS BOTONES SON DEL KIT, Y EL ENCABEZADO NO ESTÁ ACÁ ───────────────────
//
// Las opciones son `SunmiButton`: un `<button>` crudo acá sería hardcodeo nuevo
// teniendo la pieza al lado, y además se pierde el tratamiento de foco que el
// kit ya resolvió. El "← Volver" y el título los dibuja `FormaPago` con el MISMO
// encabezado que usa el panel de dividir: escribirlo dos veces es como empiezan
// a separarse.

/**
 * @param {object} props
 * @param {Array}  props.opciones   las modalidades activas, ya resueltas
 * @param {(clave:string) => number} props.totalDe  el total de cada opción, del preview
 * @param {(opcion:object) => void} props.onElegir
 */
export default function SelectorModalidad({
  opciones = [],
  totalDe,
  onElegir,
  deshabilitado = false,
  formatearImporte,
}) {
  return (
    <>
      <div className="text-sm font-medium text-center sunmi-text-muted">Elegí la modalidad</div>

      <div className="flex flex-col gap-2">
        {opciones.map((opcion) => (
          <SunmiButton
            key={opcion.clave}
            color="secondary"
            type="button"
            disabled={deshabilitado}
            onClick={() => onElegir(opcion)}
            className="min-h-14 rounded-md px-3 flex items-center justify-between gap-3 text-left"
          >
            <span className="min-w-0 flex flex-col">
              <span className="text-sm font-semibold truncate">{opcion.nombre}</span>
              <span className="text-xs sunmi-text-muted">
                {opcion.recargoPct > 0 ? `Recargo ${formatearPct(opcion.recargoPct)}` : "Sin recargo"}
              </span>
            </span>
            {/* EL NÚMERO QUE EL CAJERO LE VA A DECIR AL CLIENTE. Del preview. */}
            <span className="text-base font-black sunmi-text-accent tabular-nums shrink-0">
              ${formatearImporte(totalDe(opcion.clave))}
            </span>
          </SunmiButton>
        ))}
      </div>
    </>
  );
}
