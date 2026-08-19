"use client";

// components/productos/AvisoCambioDeEscala.jsx
//
// AVISO DE QUE ESTE CAMBIO DEJA PRECIOS CON EL NÚMERO VIEJO Y EL SIGNIFICADO
// NUEVO.
//
// ── EL CASO QUE LO ORIGINÓ ───────────────────────────────────────────────────
//
// "Pechuga Rebozada Sadia X 3kg" era un producto por unidad y su precio, 36.900,
// era el de la unidad. El 2026-08-01 se lo convirtió a fiambre de pieza fija de
// 3 kg y ese número pasó a leerse como precio POR KILO. Nadie lo dividió, nada
// avisó, y la tarjeta del depósito llegó a mostrar 110.700. Tres de las cinco
// ubicaciones siguen así.
//
// ── AVISA, NO CONVIERTE ──────────────────────────────────────────────────────
//
// Decisión de Emanuel: cambiar un precio automáticamente en cinco ubicaciones es
// peor que el problema. Dos de las cinco filas de la pechuga YA fueron
// corregidas a mano; una conversión automática las habría vuelto a dividir. Por
// eso esto muestra los números y ofrece guardar igual — el precio lo cambia una
// persona, en la pantalla que corresponde.
//
// Mismo criterio de forma que `AvisoVersionNueva`: panel integrado, sin portal,
// sin overlay y sin <dialog>. La pantalla no se bloquea.
//
// A diferencia de aquél, acá SÍ hay un botón de guardar igual: el cambio de
// escala puede ser exactamente lo que la persona quiere hacer, y el precio puede
// estar bien porque ya lo corrigió. Lo que no puede pasar es que se guarde sin
// que nadie se lo haya dicho.

import SunmiButton from "@/components/sunmi/SunmiButton";
import { TriangleAlert } from "lucide-react";
import { formatearMoneda } from "@/lib/moneda";

const TITULO = {
  PASA_A_PIEZA_FIJA: "Este producto pasa a venderse por pieza",
  DEJA_DE_SER_PIEZA_FIJA: "Este producto deja de venderse por pieza",
  CAMBIA_FACTOR_DE_PACK: "Cambia cuántas unidades trae el bulto",
  PASA_A_SER_BULTO: "Este producto pasa a venderse por bulto",
  DEJA_DE_SER_BULTO: "Este producto deja de venderse por bulto",
  CAMBIA_UNIDAD_SIN_EQUIVALENCIA: "Cambia la unidad de medida",
};

export default function AvisoCambioDeEscala({ aviso, onGuardarIgual, onCancelar, guardando = false }) {
  if (!aviso) return null;

  const { motivo, factor, ubicaciones = [] } = aviso;
  const haySugerencia = factor !== null && factor !== undefined;

  return (
    <div
      role="alert"
      className="sunmi-state-warning sunmi-border rounded-lg p-3 flex flex-col gap-3"
    >
      <div className="flex items-start gap-2 sm:gap-3">
        <div className="shrink-0 grid place-items-center w-9 h-9 rounded-lg sunmi-surface-soft sunmi-text-warning">
          <TriangleAlert size={18} strokeWidth={2} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold sunmi-text-strong leading-tight">
            {TITULO[motivo] || "Cambia la escala de este producto"}
          </div>
          <p className="text-[12px] sunmi-text-muted leading-snug mt-0.5">
            {haySugerencia ? (
              <>
                El precio de venta queda con el número de antes y el significado
                nuevo. Abajo está en qué quedaría cada ubicación si se convierte.{" "}
                <strong className="sunmi-text-strong">
                  Guardar no cambia ningún precio
                </strong>
                : los precios se corrigen a mano, uno por uno.
              </>
            ) : (
              <>
                El precio de venta queda con el número de antes y el significado
                nuevo, y en este caso{" "}
                <strong className="sunmi-text-strong">
                  no hay forma de calcular el equivalente
                </strong>{" "}
                — el precio de una unidad y el de un kilo no tienen relación.
                Estos son los precios que hay que revisar.
              </>
            )}
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-1 pl-1">
        {ubicaciones.map((u) => (
          <li
            key={u.localId ?? u.nombre}
            className="text-[12px] flex flex-wrap items-baseline gap-x-2"
          >
            <span className="font-semibold sunmi-text-strong">{u.nombre || `Local ${u.localId}`}</span>
            <span className="sunmi-text-muted">
              hoy {formatearMoneda(u.precioActual)}
            </span>
            {u.precioSugerido !== null && u.precioSugerido !== undefined && (
              <span className="sunmi-text-strong">
                → quedaría {formatearMoneda(u.precioSugerido)}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        <SunmiButton
          color="amber"
          onClick={onGuardarIgual}
          disabled={guardando}
          className="whitespace-nowrap font-semibold"
        >
          Guardar igual
        </SunmiButton>
        <SunmiButton
          variant="ghost"
          onClick={onCancelar}
          disabled={guardando}
          className="whitespace-nowrap"
        >
          Volver a revisar
        </SunmiButton>
      </div>
    </div>
  );
}
