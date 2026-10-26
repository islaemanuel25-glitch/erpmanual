"use client";

// LOS PRODUCTOS DEL PEDIDO QUE NO ESTÁN EN NINGUNA BOLETA LEÍDA.
//
// ── LA REGLA (Mauro, 2026-10-26) ──────────────────────────────────────────
//
// Algunos proveedores mandan productos del pedido sin factura, boleta ni nada.
// La mercadería llega y no figura en ningún papel, y hasta acá eso contaba como
// que no llegó. Es una excepción, pero no puede quedar sin poder ingresarse.
//
// Cada producto tiene dos botones, y se puede cambiar de idea antes de recibir:
//
//   · «Llegó sin papel»: entra con la cantidad pedida —que se puede cambiar— y
//     al costo que ya tiene el ERP. No hay precio contra qué comparar, así que
//     no pregunta nada de precio ni escribe costo maestro. Suma al total a
//     pagar y cuenta como llegado.
//   · «No llegó»: no entra. Es también lo que vale si nadie tocó nada.
//
// La elección se guarda apenas se toca —en la línea del pedido, `llegoSinPapel`—
// y por eso sobrevive al refresco y queda registrada para la segunda revisión.
//
// ── NADA SE MUEVE AL TOCAR ────────────────────────────────────────────────
//
// Todas las tarjetas tienen las mismas cuatro filas siempre: el nombre en una
// línea, lo pedido en una línea, el campo de cantidad —apagado si no llegó, no
// escondido— y los dos botones. Elegir o cambiar una cantidad no agrega ni saca
// nada.

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCampoCantidad from "@/components/sunmi/SunmiCampoCantidad";
import { formatearMoneda } from "@/lib/moneda";
import {
  LLEGADA,
  llegada,
  llegaronSinPapel,
} from "@/lib/compras-proveedor/cierreDeRecepcion";
import { importeSinPapelCentavos } from "@/lib/compras-proveedor/pagoDelCierre";
import { desdeCentavos } from "@/lib/caja/efectivoEsperado";

export const TITULO_SIN_BOLETA = "No están en ninguna boleta";

const limpio = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
};

/**
 * @param productos  los `sinComprobante` de la conciliación
 * @param llegadas   lo elegido en esta pantalla y todavía no vuelto de la base
 * @param contados   las cantidades escritas, por línea del pedido
 * @param onElegir   (producto, LLEGADA)
 * @param onCantidad (producto, número)
 */
export default function ProductosSinBoleta({
  productos = [],
  llegadas = {},
  contados = {},
  onElegir,
  onCantidad,
  deshabilitado = false,
  // Por qué no se pudo guardar lo último que se tocó, o null.
  fallo = null,
}) {
  if (!productos.length) return null;
  const sinPapel = desdeCentavos(
    importeSinPapelCentavos(llegaronSinPapel({ sinComprobante: productos, llegadas, contados }))
  );

  return (
    <section className="flex flex-col gap-renglon" data-sin-boleta>
      <div className="flex flex-col gap-dato">
        <span className="text-sm3 font-semibold sunmi-text-strong">{TITULO_SIN_BOLETA}</span>
        <span className="text-sm2 sunmi-text-muted break-words">
          Productos del pedido que ningún papel trae. Decí si llegaron igual.
        </span>
        {fallo && (
          <span className="text-sm2 sunmi-text-danger break-words" role="alert">
            {fallo}
          </span>
        )}
      </div>

      {productos.map((d) => {
        const llego = llegada(d, llegadas) === LLEGADA.LLEGO;
        return (
          <SunmiCard key={d.pedidoDetalleId} className="p-3 flex flex-col gap-dato">
            <span className="text-sm3 font-semibold sunmi-text-strong truncate">
              {d.producto || "Sin nombre"}
            </span>
            <span className="text-sm2 sunmi-text-muted tabular-nums truncate">
              Pediste {limpio(d.cantidadPedida)} · costo del ERP {formatearMoneda(d.precioCostoDelPedido ?? d.costoCatalogo)}
            </span>
            <SunmiCampoCantidad
              // Lo escrito tal cual, aunque esté vacío mientras se escribe; lo
              // que entra lo decide `cantidadSinPapel`, que con vacío usa lo pedido.
              valor={contados?.[d.pedidoDetalleId] ?? d.cantidadPedida}
              onCambiar={(n) => onCantidad?.(d, n)}
              etiqueta={`Cuánto llegó de ${d.producto || "este producto"}`}
              minimo={0}
              tipo="number"
              ocupaElAncho
              deshabilitado={deshabilitado || !llego}
            />
            <div className="flex gap-dentroFiltro">
              <SunmiButton
                color={llego ? "primary" : "slate"}
                type="button"
                aria-pressed={llego}
                disabled={deshabilitado}
                onClick={() => onElegir?.(d, LLEGADA.LLEGO)}
                className="flex-1 min-h-toque justify-center rounded-control text-sm3"
              >
                Llegó sin papel
              </SunmiButton>
              <SunmiButton
                color={!llego ? "primary" : "slate"}
                type="button"
                aria-pressed={!llego}
                disabled={deshabilitado}
                onClick={() => onElegir?.(d, LLEGADA.NO_LLEGO)}
                className="flex-1 min-h-toque justify-center rounded-control text-sm3"
              >
                No llegó
              </SunmiButton>
            </div>
          </SunmiCard>
        );
      })}

      {/* El renglón propio del total a pagar: a costo del ERP, siempre a la
          vista —también en $0— para que elegir no lo haga aparecer. */}
      <span className="text-sm3 font-semibold tabular-nums sunmi-text-strong">
        {`Sin papel: ${formatearMoneda(sinPapel)}`}
      </span>
    </section>
  );
}
