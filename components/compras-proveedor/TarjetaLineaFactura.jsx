"use client";

// UNA LÍNEA DE LA FACTURA, CON LA MISMA TARJETA QUE LA RECEPCIÓN DE UNA
// TRANSFERENCIA.
//
// ── ESTO ES UNA COPIA, NO UNA INSPIRACIÓN ─────────────────────────────────
//
// La composición, las clases y los dos estados —colapsada cuando no hay nada
// que decidir, abierta cuando sí— salen de `TarjetaRecepcionMovil` tal cual
// están. No se eligió ningún tamaño acá: `p-2` colapsada, `p-4 space-y-3`
// abierta, `text-sm2` en la línea de resumen, `text-md2 font-semibold` en el
// nombre, `text-lg2 font-semibold` en el importe, y las dos clases de botón que
// ese archivo define —`sunmi-btn-accent-outline` para el caso feliz y
// `sunmi-btn-accent-suave` para corregir—.
//
// Las tandas anteriores fueron con medidas y el resultado se veía distinto,
// justamente porque una medida escrita a mano al lado de una pieza no es la
// pieza: es otro número que coincide hasta que uno de los dos se mueve.
//
// ── LO ÚNICO QUE NO EXISTE ALLÁ: EL PRECIO ────────────────────────────────
//
// Una transferencia se mueve entre dos locales del mismo grupo y su recepción
// no mira precios. Una factura puede traer el mismo producto a otro precio, y
// eso hay que verlo y decidirlo.
//
// Se agrega CON LA FORMA QUE ESA PIEZA YA TIENE para un número que cambió: el
// anterior arriba, en chico y tachado, y el nuevo abajo, en grande y en
// warning. Es exactamente cómo ella muestra un importe corregido — se lee "de
// cuánto era" → "cuánto es". No se inventó un tratamiento nuevo.

import { Check, Pencil } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import { formatearMoneda } from "@/lib/moneda";
import {
  ESTADO_LINEA,
  cantidadEnEscalaDelPedido,
  cantidadFueConvertida,
  diferenciaDeCantidad,
  estadoDeLinea,
  porcentajeDelPrecio,
  precioCambio,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

/** Las mismas dos clases de botón que usa la tarjeta de transferencias. */
const CLASE_COINCIDE = "sunmi-btn-accent-outline";
const CLASE_CORREGIR = "sunmi-btn-accent-suave";

export const TEXTO_COINCIDE = "✓ Coincide";
export const TEXTO_CORREGIR = "Corregir";

/** Cantidades: enteras sin decimales, fraccionarias con hasta 3 útiles. */
const fmtCant = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
};

export default function TarjetaLineaFactura({ fila, onCorregir, onCoincide, guardando = false }) {
  const estado = estadoDeLinea(fila);
  const cambio = precioCambio(fila);
  const porcentaje = porcentajeDelPrecio(fila);
  const faltan = diferenciaDeCantidad(fila);
  const esNoPedida = estado === ESTADO_LINEA.NO_PEDIDO;
  const sinVincular = estado === ESTADO_LINEA.SIN_VINCULAR;
  const resuelta = estado === ESTADO_LINEA.COINCIDE;
  // La cantidad SIEMPRE en la escala del pedido. Lo crudo se muestra al lado
  // cuando se convirtió, para que se pueda cotejar con el papel sin dudar.
  const cantidad = cantidadEnEscalaDelPedido(fila);
  const convertida = cantidadFueConvertida(fila);

  // ── LA TARJETA COLAPSADA, PARA LO QUE NO TIENE NADA QUE DECIDIR ─────────
  //
  // Misma condición que allá: una línea sin diferencia se lee de un vistazo y
  // no ocupa media pantalla. Con 197 líneas es la diferencia entre barrer la
  // lista y scrollear un documento.
  if (resuelta) {
    return (
      <SunmiCard className="p-2" data-linea-factura={fila?.producto || fila?.lineaId}>
        <div className="flex items-center gap-2">
          <Check size={16} aria-hidden="true" className="shrink-0 sunmi-text-success" />
          <span className="min-w-0 flex-auto truncate text-sm2 sunmi-text-strong text-left">
            {fila?.producto || fila?.textoCrudo || "Sin nombre"}
          </span>
          <span className="shrink-0 whitespace-nowrap tabular-nums text-sm2 sunmi-text-strong">
            {fmtCant(cantidad)} · {formatearMoneda(fila?.subtotal ?? 0)}
          </span>
        </div>
      </SunmiCard>
    );
  }

  // ── LA TARJETA ABIERTA, PARA LO QUE HAY QUE MIRAR ──────────────────────
  const tono = esNoPedida ? "sunmi-state-danger" : "sunmi-state-warning";

  return (
    <SunmiCard className={`p-4 space-y-3 ${tono}`} data-linea-factura={fila?.producto || fila?.lineaId}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-md2 font-semibold sunmi-text-strong break-words">
            {fila?.producto || fila?.textoCrudo || "Sin nombre"}
          </p>

          {sinVincular ? (
            <p className="text-xs sunmi-text-muted break-words">
              Todavía no se sabe qué producto es. Tocá Corregir para elegirlo.
            </p>
          ) : esNoPedida ? (
            <p className="text-xs sunmi-text-muted break-words">
              El proveedor lo facturó y no estaba en el pedido.
            </p>
          ) : (
            <>
              <p className="flex items-baseline gap-x-2 flex-wrap break-words">
                <span className="text-xs sunmi-text-muted shrink-0">Pediste</span>
                <span className="min-w-0 whitespace-nowrap text-base2 font-semibold tabular-nums sunmi-text-strong">
                  {fmtCant(fila?.cantidadPedida)}
                </span>
              </p>
              <p className="flex items-baseline gap-x-2 flex-wrap break-words">
                <span className="text-xs sunmi-text-muted shrink-0">Factura</span>
                <span className="min-w-0 whitespace-nowrap text-base2 font-semibold tabular-nums sunmi-text-accent">
                  {fmtCant(cantidad)}
                </span>
                {/* De dónde salió ese número, cuando no es el del papel. Sin
                    esto, quien coteja renglón por renglón ve 8 donde el papel
                    dice 80 y no sabe si la pantalla se equivocó. */}
                {convertida && (
                  <span className="text-xs tabular-nums sunmi-text-muted shrink-0">
                    el papel dice {fmtCant(fila?.cantidad)} u
                  </span>
                )}
                {faltan != null && faltan !== 0 && (
                  <span className="text-xs tabular-nums sunmi-text-muted shrink-0">
                    {faltan > 0 ? `falta ${fmtCant(faltan)}` : `sobra ${fmtCant(-faltan)}`}
                  </span>
                )}
              </p>
            </>
          )}
        </div>

        {/* ── EL PRECIO, CON LA FORMA DEL IMPORTE CORREGIDO ────────────────
            El anterior arriba, chico y tachado; el nuevo abajo, grande y en
            warning. Es la misma composición con la que esa tarjeta muestra un
            importe que cambió. Solo aparece cuando el precio cambió: si no, el
            número no dice nada que la línea no diga ya. */}
        {cambio && (
          <span className="shrink-0 whitespace-nowrap text-right">
            <span className="block text-xs2 tabular-nums line-through sunmi-text-muted">
              {formatearMoneda(fila?.costoCatalogo)}
            </span>
            <span className="block text-sm2 tabular-nums font-semibold sunmi-text-warning">
              {formatearMoneda(fila?.costoFactura)}
              {porcentaje != null
                ? ` (${porcentaje > 0 ? "+" : "−"}${Math.abs(porcentaje)
                    .toFixed(1)
                    .replace(".", ",")} %)`
                : ""}
            </span>
          </span>
        )}
      </div>

      <SunmiSeparator />

      <div className="flex items-center justify-between gap-3">
        <SunmiButton
          type="button"
          onClick={() => onCorregir?.(fila)}
          disabled={guardando}
          className={`shrink-0 ${CLASE_CORREGIR}`}
        >
          {TEXTO_CORREGIR}
        </SunmiButton>

        {/* El caso feliz en un toque, sin abrir nada: lo que la factura dice es
            lo que llegó. Misma idea y misma clase que allá. */}
        {!esNoPedida && !sinVincular && (
          <SunmiLinkButton
            onClick={() => onCoincide?.(fila)}
            disabled={guardando}
            aria-label={`Aceptar lo que dice la factura para ${fila?.producto || "esta línea"}`}
            className={`shrink-0 no-underline ${CLASE_COINCIDE}`}
          >
            {TEXTO_COINCIDE}
          </SunmiLinkButton>
        )}

        <span className="shrink-0 whitespace-nowrap tabular-nums text-lg2 font-semibold sunmi-text-strong">
          {formatearMoneda(fila?.subtotal ?? 0)}
        </span>
      </div>
    </SunmiCard>
  );
}
