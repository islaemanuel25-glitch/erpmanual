"use client";

// UNA LÍNEA DE LA FACTURA, COMPARADA CONTRA LA DEL PEDIDO.
//
// ── QUÉ REEMPLAZA ─────────────────────────────────────────────────────────
//
// Tarjetas que decían "Pediste 1 bulto a $30780.00. Ningún comprobante la
// trajo." — una oración por línea, con el precio a seis decimales, repetida 197
// veces. Nadie revisa 197 oraciones: se revisa una columna.
//
// ── LA COMPARACIÓN ES DOS RENGLONES Y UN RÓTULO FIJO ──────────────────────
//
// "Pediste" arriba y "Factura" abajo, con los rótulos de ancho FIJO para que
// los dos valores arranquen a la misma altura. Si el rótulo se reparte, los
// números quedan desalineados y deja de leerse como una comparación: hay que
// mirar dos veces para saber cuál es cuál.
//
// ── EL PRECIO SOLO APARECE SI CAMBIÓ ──────────────────────────────────────
//
// Es la regla que hace usable la pantalla. Con el precio siempre visible, las
// 197 líneas tienen un número en acento y el color deja de significar algo.
// Mostrándolo solo cuando cambió, el naranja aparece únicamente donde hay una
// decisión que tomar, y se puede barrer la lista sin leer.
//
// ── DE DÓNDE SALIÓ LA COMPOSICIÓN ─────────────────────────────────────────
//
// De `TarjetaRecepcionMovil`, la de transferencias: tarjeta con el nombre y el
// estado arriba, el detalle en el medio y la acción abajo. Lo que cambia es el
// contenido —allá el eje es cuántos bultos llegaron, acá hay además el eje del
// precio— y por eso es otra pieza y no la misma con props.

import SunmiButton from "@/components/sunmi/SunmiButton";
import { formatearMoneda } from "@/lib/moneda";
import {
  ESTADO_LINEA,
  diferenciaDeCantidad,
  estadoDeLinea,
  porcentajeDelPrecio,
  precioCambio,
  rotuloDeEstado,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

/** Un número como lo escribiría una persona: sin decimales si no hacen falta. */
function limpio(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
}

/** "+5,1 %" / "−3,0 %", con la coma decimal de acá. */
function pct(valor) {
  const signo = valor > 0 ? "+" : "−";
  return `${signo}${Math.abs(valor).toFixed(1).replace(".", ",")} %`;
}

/** Un renglón de la comparación: rótulo de ancho fijo y su valor. */
function Renglon({ rotulo, children }) {
  return (
    <div className="min-h-renglonComparacion flex items-baseline gap-entreFiltros">
      <span className="w-rotuloComparacion shrink-0 text-sm3 sunmi-text-muted">{rotulo}</span>
      {children}
    </div>
  );
}

export default function TarjetaLineaFactura({ fila, onCorregir }) {
  const estado = estadoDeLinea(fila);
  const cambio = precioCambio(fila);
  const porcentaje = porcentajeDelPrecio(fila);
  const faltan = diferenciaDeCantidad(fila);
  const noPedida = estado === ESTADO_LINEA.NO_PEDIDO;
  const pideAtencion = estado !== ESTADO_LINEA.COINCIDE;

  return (
    <div className="rounded-xl border sunmi-divider sunmi-bg-card px-4 py-filtro flex flex-col gap-renglon">
      {/* ── FILA 1: QUÉ ES Y CÓMO ESTÁ ─────────────────────────────────── */}
      <div className="min-h-filaNombre flex items-center gap-renglon">
        <span className="flex-1 min-w-0 text-lg2 font-bold sunmi-text-strong truncate">
          {fila?.producto || fila?.textoCrudo || "Sin nombre"}
        </span>
        <span
          className={`shrink-0 rounded-control border px-renglon py-dentroFiltro text-sm3 font-medium ${
            pideAtencion ? "sunmi-border-accent sunmi-text-accent" : "sunmi-divider sunmi-text-muted"
          }`}
        >
          {rotuloDeEstado(fila)}
        </span>
      </div>

      {/* ── FILA 2: LA COMPARACIÓN ──────────────────────────────────────── */}
      <div className="flex flex-col gap-hilo">
        <Renglon rotulo="Pediste">
          {noPedida ? (
            <span className="text-sm3 sunmi-text-muted">no lo pediste</span>
          ) : (
            <span className="text-sm3 sunmi-text-strong tabular-nums">
              {limpio(fila?.cantidadPedida)}
              {cambio && fila?.costoCatalogo != null
                ? ` · ${formatearMoneda(fila.costoCatalogo)}`
                : ""}
            </span>
          )}
        </Renglon>

        <Renglon rotulo="Factura">
          <span className="text-sm3 font-bold sunmi-text-accent tabular-nums">
            {limpio(fila?.cantidad)}
            {cambio && fila?.costoFactura != null
              ? ` · ${formatearMoneda(fila.costoFactura)}`
              : ""}
          </span>

          {/* El lugar de la derecha lo ocupa UNA cosa: el porcentaje si lo que
              cambió es el precio, o cuánto falta si lo que cambió es la
              cantidad. Nunca las dos, porque nunca pasan juntas: si la cantidad
              difiere, el estado ya es "falta" o "sobra". */}
          {cambio && porcentaje != null && (
            <span className="text-sm3 font-bold sunmi-text-accent">{pct(porcentaje)}</span>
          )}
          {!cambio && faltan != null && faltan !== 0 && (
            <span className="text-sm3 font-bold sunmi-text-accent">
              {faltan > 0 ? `falta ${limpio(faltan)}` : `sobra ${limpio(-faltan)}`}
            </span>
          )}
        </Renglon>
      </div>

      {/* ── FILA 3: LA ACCIÓN Y LA PLATA ────────────────────────────────── */}
      <div className="min-h-toque flex items-center justify-between gap-renglon">
        <SunmiButton
          color="slate"
          type="button"
          onClick={() => onCorregir?.(fila)}
          className="w-botonCorregir min-h-toque justify-center rounded-control text-sm3"
        >
          Corregir
        </SunmiButton>
        <span className="text-lg3 font-bold sunmi-text-strong tabular-nums text-right">
          {formatearMoneda(fila?.subtotal ?? 0)}
        </span>
      </div>
    </div>
  );
}
