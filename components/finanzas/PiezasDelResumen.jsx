"use client";

// components/finanzas/PiezasDelResumen.jsx
//
// LAS PIEZAS QUE COMPARTEN LAS DOS PRESENTACIONES DEL RESUMEN.
//
// El Resumen tiene dos dibujos —el de celular, del Figma aprobado, y el de
// escritorio, que conserva el de antes— y los dos consumen el MISMO `resumen`.
// Lo que comparten vive acá UNA vez: no hay un `Renglon` del celular al lado de
// otro del escritorio que haga casi lo mismo (regla 1 del CLAUDE.md).
//
// ── CON LOS PROPS POR DEFECTO, EL MARKUP ES EL DE ANTES ──────────────────
//
// `hero`, `tono`, `notaValor`, `fuerte` y `aclararQueNoResta` los pide solo el
// celular. Sin ellos, cada pieza dibuja EXACTAMENTE el mismo nodo que dibujaba
// antes de la tanda mobile: mismas clases, mismo orden, mismos hijos. Eso es lo
// que deja al escritorio idéntico, y lo afirma el candado de escritorio contra
// el render de la base.

import { formatearMoneda } from "@/lib/moneda";
import EnlaceAlModulo from "@/components/stock_diario/EnlaceAlModulo";
import {
  NOTA_PENDIENTES,
  NOTA_RECONOCIMIENTO,
  ROTULO_PAGO_A_DEPOSITO,
  ROTULO_PENDIENTE_DE_RECEPCION,
  rotuloDeTransferencias,
} from "@/lib/transferencias/criterioDeCuenta";

/**
 * El número grande de un bloque. `hero` lo lleva a tamaño protagonista y
 * `tono="danger"` tiñe el valor de un resultado negativo —el signo "−" del
 * texto ya lo dice sin color; el tono acompaña—.
 */
export function Metrica({ rotulo, valor, detalle = null, hero = false, tono = "strong" }) {
  const colorValor = tono === "danger" ? "sunmi-text-danger" : "sunmi-text-strong";
  return (
    <div className="min-w-0">
      <div className="text-xs sunmi-text-muted">{rotulo}</div>
      <div className={`${hero ? "text-xl3" : "text-xl2"} font-semibold tabular-nums ${colorValor}`}>{valor}</div>
      {detalle ? <div className="text-sm2 sunmi-text-muted">{detalle}</div> : null}
    </div>
  );
}

/**
 * Un renglón rótulo/importe. `nota` va debajo del rótulo; `notaValor` debajo
 * del importe —es el "% sobre ventas" del celular, que no empuja el número—.
 * `fuerte` resalta una etapa; `atenuado` baja el tono.
 */
export function Renglon({
  rotulo,
  valor,
  nota = null,
  notaValor = null,
  notaValorColor = "sunmi-text-muted",
  atenuado = false,
  fuerte = false,
}) {
  const tono = atenuado ? "sunmi-text-muted" : "sunmi-text-strong";
  const claseRotulo = fuerte ? `text-sm3 font-semibold ${tono}` : `text-sm3 ${tono}`;
  const claseValor = `text-sm3 ${fuerte ? "font-semibold" : "font-medium"} tabular-nums ${tono}`;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div className={claseRotulo}>{rotulo}</div>
        {nota ? <div className="text-xs2 sunmi-text-muted">{nota}</div> : null}
      </div>
      {notaValor ? (
        <div className="shrink-0 text-right">
          <div className={claseValor}>{valor}</div>
          <div className={`text-xs2 ${notaValorColor}`}>{notaValor}</div>
        </div>
      ) : (
        <div className={`shrink-0 ${claseValor}`}>{valor}</div>
      )}
    </div>
  );
}

export function Bloque({ titulo, children }) {
  return (
    <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-3">
      <h2 className="text-xs2 font-semibold sunmi-text-muted tracking-wider">{titulo}</h2>
      {children}
    </section>
  );
}

/**
 * EL PAGO A DEPÓSITO DEL PERÍODO, con las pendientes de recepción aparte.
 *
 * El importe es lo recibido y confirmado; las pendientes se informan con el
 * renglón atenuado —el mismo trato que el fiado en Cobros— para que no se lean
 * como plata que ya salió. `aclararQueNoResta` agrega, discreto, que nada de
 * esto resta del Resultado: lo pide el celular, donde el Resultado está arriba.
 */
export function PagoADeposito({ pago, aclararQueNoResta = false }) {
  const pendientes = pago.pendientes || { total: 0, cantidadTransferencias: 0 };
  const hayPendientes = Number(pendientes.cantidadTransferencias || 0) > 0;
  return (
    <Bloque titulo="PAGO A DEPÓSITO">
      <Renglon
        rotulo={ROTULO_PAGO_A_DEPOSITO}
        nota={`${rotuloDeTransferencias(pago.cantidadTransferencias)} recibidas en el período`}
        valor={formatearMoneda(pago.total)}
      />
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0 text-xs2 sunmi-text-muted">{NOTA_RECONOCIMIENTO}</div>
        {pago.verDetalle ? <EnlaceAlModulo href={pago.verDetalle} texto="Ver" /> : null}
      </div>

      <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />

      <Renglon
        rotulo={ROTULO_PENDIENTE_DE_RECEPCION}
        nota={
          hayPendientes
            ? `${rotuloDeTransferencias(pendientes.cantidadTransferencias)} · ${NOTA_PENDIENTES}`
            : "Ninguna sin confirmar."
        }
        valor={formatearMoneda(pendientes.total)}
        atenuado
      />
      {aclararQueNoResta ? <div className="text-xs2 sunmi-text-muted">No resta del resultado.</div> : null}
    </Bloque>
  );
}
