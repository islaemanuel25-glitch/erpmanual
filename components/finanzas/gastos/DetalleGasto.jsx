"use client";

// components/finanzas/gastos/DetalleGasto.jsx
//
// UN GASTO ABIERTO: importes, sus datos y el historial de pagos.
//
// La forma es la de `DetalleCuentaPorPagar`, con sus mismas piezas: los tres
// importes son `ImporteConRotulo`, cada dato es un `Renglon` y cada pago es un
// `RenglonDePago`. Registrar un pago es `ModalRegistrarPago`, apuntado al gasto.
//
// ── SOLO SE LEE ──────────────────────────────────────────────────────────
//
// No hay editar, eliminar ni anular: la API no los tiene. La fecha prevista de
// pago se muestra y no se cambia —en una cuenta por pagar hay un PATCH; en un
// gasto, no—.
//
// ── VER NO ES PAGAR, Y SE DICE ───────────────────────────────────────────
//
// "Registrar pago" aparece con `puedePagar`, que decide el servidor: el
// permiso Y operar la ubicación del gasto. Con el permiso pero mirando desde
// otra ubicación, se explica por qué no está el botón, en gris y sin tono de
// error, con la frase de Pagos.

import { useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import ModalRegistrarPago from "@/components/finanzas/pagos/ModalRegistrarPago";
import { Renglon, RenglonDePago } from "@/components/finanzas/pagos/DetalleCuentaPorPagar";
import { COLOR_ESTADO_CUENTA, ImporteConRotulo } from "@/components/finanzas/pagos/TarjetaCuentaPorPagar";
import { formatearMoneda } from "@/lib/moneda";
import { ESTADO_CUENTA, diaLegible } from "@/lib/finanzas/pagosProveedores";
import { ROTULO_ESTADO_GASTO } from "@/lib/finanzas/calendarioDeGastos";

export default function DetalleGasto({ datos, onCambio }) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const { gasto, pagos = [], puedeEscribir, puedePagar = false, medios = [] } = datos;
  const pagado = gasto.estado === ESTADO_CUENTA.PAGADA;
  const local = gasto.local?.nombre || "la ubicación del gasto";

  return (
    <>
      <SunmiCard className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-lg2 font-semibold sunmi-text-strong break-words">{gasto.concepto}</div>
            <div className="text-xs2 sunmi-text-muted">{gasto.categoria?.nombre || "Sin categoría"}</div>
            <div className="text-xs2 sunmi-text-muted">
              Gasto de <span className="sunmi-text-strong">{gasto.local?.nombre || "—"}</span>
            </div>
          </div>
          <SunmiPill color={COLOR_ESTADO_CUENTA[gasto.estado] || "slate"}>
            {ROTULO_ESTADO_GASTO[gasto.estado] || gasto.estado}
          </SunmiPill>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <ImporteConRotulo rotulo="Total" valor={gasto.total} />
          <ImporteConRotulo rotulo="Pagado" valor={gasto.pagado} />
          <ImporteConRotulo rotulo="Saldo" valor={gasto.saldo} fuerte />
        </div>

        <SunmiSeparator />

        <Renglon rotulo="Fecha">{diaLegible(gasto.fecha)}</Renglon>
        {gasto.beneficiario && <Renglon rotulo="Beneficiario">{gasto.beneficiario}</Renglon>}
        {gasto.comprobanteNumero && <Renglon rotulo="Comprobante">{gasto.comprobanteNumero}</Renglon>}
        {gasto.vencimiento && <Renglon rotulo="Vencimiento">{diaLegible(gasto.vencimiento)}</Renglon>}
        {gasto.fechaPrevistaPago && <Renglon rotulo="Fecha prevista de pago">{diaLegible(gasto.fechaPrevistaPago)}</Renglon>}

        {puedePagar && !pagado && (
          <SunmiButton color="primary" className="w-full" onClick={() => setModalAbierto(true)}>
            Registrar pago
          </SunmiButton>
        )}
        {puedeEscribir && !puedePagar && !pagado && (
          <p className="text-xs sunmi-text-muted break-words">
            Este gasto lo paga {local}: para registrar un pago hay que estar operando en esa ubicación.
          </p>
        )}
      </SunmiCard>

      <h2 className="text-xs2 font-semibold sunmi-text-muted tracking-wider">PAGOS</h2>

      {pagos.length === 0 ? (
        <SunmiAviso tono="neutral" titulo="Sin pagos">
          Todavía no se registró ningún pago de este gasto.
        </SunmiAviso>
      ) : (
        <SunmiCard className="p-4 divide-y sunmi-divide">
          {pagos.map((p) => (
            <RenglonDePago key={p.id} pago={p} />
          ))}
        </SunmiCard>
      )}

      {puedePagar && (
        <ModalRegistrarPago
          abierto={modalAbierto}
          cuenta={gasto}
          medios={medios}
          urlPago={`/api/finanzas/gastos/${gasto.id}/pagos`}
          subtitulo={`${gasto.concepto} · saldo ${formatearMoneda(gasto.saldo)}`}
          origen={gasto.local}
          onCerrar={() => setModalAbierto(false)}
          onRegistrado={() => {
            setModalAbierto(false);
            onCambio?.();
          }}
        />
      )}
    </>
  );
}
