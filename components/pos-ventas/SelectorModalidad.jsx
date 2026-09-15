"use client";

import SunmiButton from "@/components/sunmi/SunmiButton";
import { CLASE_BOTON_MEDIO, etiquetaRecargoDeOpcion } from "@/lib/pos-ventas/mediosCobroPantalla";

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
// ── UNA OPCIÓN SE VE COMO UN BOTÓN DE MEDIO, PORQUE ES UNO ─────────────────
//
// Elegir "Crédito 1 pago" adentro de Mercado Pago es otra forma de tocar el
// mismo botón, no otra clase de cosa. Así que las opciones llevan
// `CLASE_BOTON_MEDIO`, LA MISMA constante que el panel: mismo alto, mismo radio,
// misma variante y misma tipografía, sin una sola clase escrita al lado.
//
// Antes se dibujaban con `SunmiButton color="secondary"`, que es la variante
// GENÉRICA del kit y no la del POS —`sunmi-pos-btn-secondary`—. Son dos reglas
// distintas del CSS: las opciones salían con otro fondo y otro alto que los
// botones de los que colgaban, y por eso se veía mal.
//
// El "← Volver" y el nombre del medio los dibuja `FormaPago` con el MISMO
// encabezado que usa el panel de dividir: escribirlo dos veces es como empiezan
// a separarse.
//
// ── Y NO HAY LÍNEA QUE DIGA "ELEGÍ LA MODALIDAD" ──────────────────────────
//
// La había, arriba de todo. El encabezado ya dice "Mercado Pago" y abajo están
// las opciones: la línea del medio no agregaba información y empujaba las
// opciones fuera del pulgar en una pantalla de 360 px.

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
    <div className="flex flex-col gap-2">
      {opciones.map((opcion) => (
        <SunmiButton
          key={opcion.clave}
          // `ghost` NO es un color: es la ausencia de relleno. El fondo, el
          // borde y el tono los pone `sunmi-pos-btn-secondary`, que es la
          // variante del POS y la que usan los botones del panel. Pedir
          // `secondary` traería la del KIT y volveríamos al defecto.
          color="ghost"
          type="button"
          disabled={deshabilitado}
          onClick={() => onElegir(opcion)}
          className={`${CLASE_BOTON_MEDIO} w-full px-3 flex items-center justify-between gap-3 text-left`}
        >
          {/* El nombre hereda el tamaño y el peso del botón: es el mismo texto
              que el nombre de un medio en el panel, y no se lo pisa con otra
              clase para que no puedan separarse. */}
          <span className="min-w-0 flex flex-col">
            <span className="truncate">{opcion.nombre}</span>
            <span className="text-xs font-normal sunmi-text-muted">
              {etiquetaRecargoDeOpcion(opcion.recargoPct)}
            </span>
          </span>
          {/* EL NÚMERO QUE EL CAJERO LE VA A DECIR AL CLIENTE. Del preview. */}
          <span className="text-lg font-black sunmi-text-accent tabular-nums shrink-0">
            ${formatearImporte(totalDe(opcion.clave))}
          </span>
        </SunmiButton>
      ))}
    </div>
  );
}
