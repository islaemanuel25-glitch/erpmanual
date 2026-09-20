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
//
// ── Y UN PRECIO YA DECIDIDO NO SE MUESTRA COMO PROBLEMA ───────────────────
//
// La diferencia entre lo que factura el proveedor y el costo interno es la
// ganancia del depósito: es estable y vuelve igual en cada recepción. Una vez
// decidida, sigue siendo una diferencia y se sigue viendo —el número no se
// esconde— pero deja el tono de alerta y el tachado, que son la forma de decir
// "esto hay que resolverlo". Lo que queda es una línea que dice qué se decidió.

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
  hayQueDecidirElPrecio,
  porcentajeDelPrecio,
  precioCambio,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";
import {
  DECISION_DE_PRECIO,
  decisionVigente,
} from "@/lib/compras-proveedor/decisionDePrecio";

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

export default function TarjetaLineaFactura({
  fila,
  onCorregir,
  onCoincide,
  /**
   * ── QUIÉN DICE QUE ESTA LÍNEA ESTÁ REVISADA ─────────────────────────────
   *
   * La persona, tocando "✓ Coincide". No el sistema.
   *
   * Acá la tarjeta se colapsaba cuando el cálculo daba "coincide" —cantidad
   * igual y precio igual—, o sea que se ponía el tilde verde sola y daba por
   * controlado un renglón que nadie miró. Y la pantalla se contradecía: las
   * tarjetas en verde mientras el contador de arriba decía "0 / 15 sin
   * diferencias · 15 para revisar".
   *
   * En la recepción de una transferencia ese botón es la MARCA de que alguien
   * controló el renglón contra el papel. Acá es lo mismo. Lo que el sistema
   * calculó se sigue mostrando como dato —la comparación, el precio— pero no
   * marca nada por su cuenta.
   */
  revisada = false,
  guardando = false,
}) {
  const estado = estadoDeLinea(fila);
  // Dos preguntas distintas: si el precio cambió, y si hay que decidirlo. Con
  // la decisión ya tomada sobre estos dos números, lo segundo es que no.
  const decidido = decisionVigente(fila);
  const cambio = hayQueDecidirElPrecio(fila);
  const porcentaje = porcentajeDelPrecio(fila);
  const faltan = diferenciaDeCantidad(fila);
  const esNoPedida = estado === ESTADO_LINEA.NO_PEDIDO;
  const sinVincular = estado === ESTADO_LINEA.SIN_VINCULAR;
  const resuelta = revisada;
  // La cantidad SIEMPRE en la escala del pedido. Lo crudo se muestra al lado
  // cuando se convirtió, para que se pueda cotejar con el papel sin dudar.
  const cantidad = cantidadEnEscalaDelPedido(fila);
  const convertida = cantidadFueConvertida(fila);

  // ── LA TARJETA COLAPSADA, PARA LO QUE YA SE CONTROLÓ ───────────────────
  //
  // Mismo criterio que allá: una línea ya revisada se lee de un vistazo y no
  // ocupa media pantalla. Con 197 líneas es la diferencia entre barrer la lista
  // y scrollear un documento. Lo que la colapsa es el toque de la persona, no
  // el cálculo.
  if (resuelta) {
    return (
      <SunmiCard className="p-2" data-linea-factura={fila?.producto || fila?.lineaId}>
        {/* Tocarla la vuelve a abrir, que es de donde sale "Desmarcar". Mismo
            gesto que la tarjeta colapsada de la recepción de una transferencia:
            la lista queda atrás y cerrar es un gesto, no una decisión. */}
        <SunmiLinkButton
          onClick={() => onCorregir?.(fila)}
          aria-label={`Ver ${fila?.producto || "esta línea"}`}
          className="block w-full text-left no-underline"
        >
        <div className="flex items-center gap-2">
          <Check size={16} aria-hidden="true" className="shrink-0 sunmi-text-success" />
          <span className="min-w-0 flex-auto truncate text-sm2 sunmi-text-strong text-left">
            {fila?.producto || fila?.textoCrudo || "Sin nombre"}
          </span>
          <span className="shrink-0 whitespace-nowrap tabular-nums text-sm2 sunmi-text-strong">
            {fmtCant(cantidad)} · {formatearMoneda(fila?.subtotal ?? 0)}
          </span>
        </div>
        </SunmiLinkButton>
      </SunmiCard>
    );
  }

  // ── LA TARJETA ABIERTA, PARA LO QUE HAY QUE MIRAR ──────────────────────
  //
  // El tono de alerta es para lo que hay que resolver. Una línea que coincide
  // —y una cuyo único desvío era un precio ya decidido— no tiene nada que
  // resolver: se muestra igual, porque nadie la controló todavía, pero sin el
  // naranja que dice "acá hay un problema".
  const tono = esNoPedida
    ? "sunmi-state-danger"
    : estado === ESTADO_LINEA.COINCIDE
      ? ""
      : "sunmi-state-warning";

  return (
    <SunmiCard
      className={`p-4 space-y-3 ${tono}`.trimEnd()}
      data-linea-factura={fila?.producto || fila?.lineaId}
    >
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

        {/* ── LO QUE YA SE DECIDIÓ, EN UNA LÍNEA ──────────────────────────
            Mismo lugar y misma forma que el precio que cambió, porque es el
            mismo dato contestado: arriba qué se decidió, abajo con qué número
            queda. Sin tachado y sin warning — no hay nada que resolver. Se
            cambia desde Corregir, que es el mismo camino de siempre. */}
        {!cambio && decidido && precioCambio(fila) && (
          <span className="shrink-0 whitespace-nowrap text-right">
            <span className="block text-xs2 sunmi-text-muted">Ya decidido</span>
            <span className="block text-sm2 tabular-nums font-semibold sunmi-text-strong">
              {formatearMoneda(
                decidido.decision === DECISION_DE_PRECIO.DEJA_EL_MIO
                  ? fila?.costoCatalogo
                  : fila?.costoFactura
              )}
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
        {/* ── "✓ COINCIDE" SE OFRECE, NO SE APLICA ──────────────────────
            Se ofrece cuando el cálculo no encontró diferencias: ahí el gesto es
            de un toque. Con una diferencia a la vista, el camino es Corregir —
            ofrecer "coincide" sobre algo que no coincide invita a cerrar sin
            mirar, que es justo lo que este botón tiene que evitar. */}
        {!esNoPedida && !sinVincular && estado === ESTADO_LINEA.COINCIDE && (
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
