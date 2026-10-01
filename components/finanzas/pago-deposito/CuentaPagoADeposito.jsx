"use client";

// components/finanzas/pago-deposito/CuentaPagoADeposito.jsx
//
// LA PANTALLA DE UN LOCAL: cuánto se reconoció como pago al depósito en el
// período, qué transferencias lo forman, y qué falta confirmar.
//
// **UNA SOLA, PARA LOS DOS QUE LA MIRAN** —el depósito que entró por la lista y
// el local que entró directo—, igual que `CuentaFinancieraDeUnLocal`: recibe los
// datos ya resueltos y no sabe quién la mira.
//
// ── ES UNA LECTURA FINANCIERA, NO EL DETALLE OPERATIVO ───────────────────
//
// Cada fila dice lo mínimo: número, día e importe reconocido. Los productos, las
// cantidades y las diferencias son de Transferencias y se abren con "Ver": acá no
// se dibuja una línea de mercadería. Las pendientes van solo como total, no de a
// una: son estado de hoy y se operan en Transferencias.

import { useMemo } from "react";
import { useRouter } from "next/navigation";

import ChipsDePeriodo from "@/components/transferencias/ChipsDePeriodo";
import NavegadorDePeriodo from "@/components/transferencias/NavegadorDePeriodo";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import ResumenConImporte from "@/components/periodo/ResumenConImporte";
import DiaConBanda from "@/components/periodo/DiaConBanda";
import FilaConImporte from "@/components/periodo/FilaConImporte";
import EnlaceAlModulo from "@/components/stock_diario/EnlaceAlModulo";
import { CHIPS_APAGADOS } from "@/components/finanzas/CuentaFinancieraDeUnLocal";

import { formatearMoneda } from "@/lib/moneda";
import { diaLegible } from "@/lib/fechas/diaISO";
import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { diasDeTransferencias } from "@/lib/transferencias/diasDeTransferencias";
import { urlDelDetalle } from "@/lib/transferencias/contextoDelTablero";
import {
  CRITERIO_CUENTA,
  NOTA_PENDIENTES,
  NOTA_RECONOCIMIENTO,
  ROTULO_PAGO_A_DEPOSITO,
  ROTULO_PENDIENTE_DE_RECEPCION,
  rotuloDeTransferencias,
} from "@/lib/transferencias/criterioDeCuenta";

/**
 * EL PENDIENTE DE RECEPCIÓN, ATENUADO Y SIN LISTAR.
 *
 * El mismo trato que en el Resumen: el renglón en `sunmi-text-muted` para que no
 * se lea como plata que ya salió, su nota de cuándo es, y NADA de a una: son
 * estado de hoy y se ven en Transferencias.
 */
function Pendiente({ pendientes }) {
  const p = pendientes || { total: 0, cantidadTransferencias: 0 };
  const hay = Number(p.cantidadTransferencias || 0) > 0;
  return (
    <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm3 sunmi-text-muted">{ROTULO_PENDIENTE_DE_RECEPCION}</div>
        <div className="shrink-0 text-sm3 font-medium tabular-nums sunmi-text-muted">
          {formatearMoneda(p.total)}
        </div>
      </div>
      <div className="text-xs2 sunmi-text-muted">
        {hay ? `${rotuloDeTransferencias(p.cantidadTransferencias)} · ${NOTA_PENDIENTES}` : "Ninguna sin confirmar."}
      </div>
      {/* El enlace al detalle operativo de esas mismas pendientes en
          Transferencias. Solo si hay pendientes Y el usuario puede verlas: el
          endpoint ya pone `verPendientes` en `null` cuando falta alguna de las
          dos condiciones, así que acá alcanza con preguntar por el enlace. */}
      {hay && p.verPendientes && (
        <div className="pt-0.5">
          <EnlaceAlModulo href={p.verPendientes} texto="Ver pendientes" />
        </div>
      )}
    </section>
  );
}

export default function CuentaPagoADeposito({
  datos,
  cargando = false,
  error = "",
  unidad,
  onCambiarUnidad,
  onAtras,
  onAdelante,
}) {
  const router = useRouter();
  const pago = datos?.pagoADeposito;
  const periodo = datos?.periodo;
  const puedeVer = Boolean(datos?.puedeVerTransferencias);

  // El contexto para "volver" desde el detalle: el período, el criterio de
  // recepción, y el local del enlace —del depósito, el mirado; del local, el
  // suyo (null)—. Lo mismo que arma el "Ver transferencias" agregado.
  const ctxDetalle = {
    unidad: datos?.unidad,
    desp: datos?.desplazamiento,
    local: datos?.localDelEnlace ?? null,
    criterio: CRITERIO_CUENTA.RECEPCION,
  };

  // Agrupadas por el día en que se confirmaron, con la MISMA pieza que agrupa
  // las de Transferencias. No recalcula importes: suma los que ya vinieron.
  const dias = useMemo(
    () => diasDeTransferencias(datos?.recibidas || [], { fechaDe: (t) => t.fechaRecepcion }),
    [datos?.recibidas]
  );
  const sinReconocidas = (datos?.recibidas || []).length === 0;

  return (
    <>
      <ChipsDePeriodo valor={unidad} onCambiar={onCambiarUnidad} deshabilitadas={CHIPS_APAGADOS} />

      {periodo?.descripcion && (
        <NavegadorDePeriodo
          titulo={periodo.descripcion.titulo}
          subtitulo={periodo.descripcion.subtitulo}
          puedeAvanzar={Boolean(datos?.puedeAvanzar)}
          puedeRetroceder={Boolean(datos?.puedeRetroceder)}
          onAtras={onAtras}
          onAdelante={onAdelante}
        />
      )}

      {cargando && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}

      {error && !cargando && (
        <div className="rounded-xl border sunmi-border-danger px-4 py-3 text-xs sunmi-text-danger">
          {error}
        </div>
      )}

      {!cargando && !error && pago && !pago.aplica && (
        <div className="text-center py-12 sunmi-text-muted text-xs">
          El depósito no le paga al depósito.
        </div>
      )}

      {!cargando && !error && pago?.aplica && (
        <>
          <ResumenConImporte
            rotulo={ROTULO_PAGO_A_DEPOSITO}
            importe={formatearMoneda(pago.total)}
            subtitulo={`${rotuloDeTransferencias(pago.cantidadTransferencias)} recibidas${
              periodo?.descripcion?.titulo ? ` · ${periodo.descripcion.titulo}` : ""
            }`}
            nota={NOTA_RECONOCIMIENTO}
            accion={pago.verDetalle ? <EnlaceAlModulo href={pago.verDetalle} texto="Ver transferencias" /> : null}
          />

          <Pendiente pendientes={pago.pendientes} />

          {sinReconocidas ? (
            // El período existe y no se reconoció nada: es una respuesta, no un
            // vacío de datos.
            <div className="text-center py-12 sunmi-text-muted text-xs">
              No se reconoció ningún pago a depósito en este período.
            </div>
          ) : (
            dias.map((dia) => (
              <DiaConBanda
                key={dia.clave}
                titulo={dia.titulo}
                dato={rotuloDeTransferencias(dia.cantidad)}
                importe={formatearMoneda(dia.importe)}
              >
                {dia.transferencias.map((t) => (
                  <FilaConImporte
                    key={t.id}
                    importe={formatearMoneda(t.importe)}
                    onAbrir={puedeVer ? () => router.push(urlDelDetalle(t.id, ctxDetalle)) : undefined}
                    etiqueta={puedeVer ? `Abrir la transferencia #${t.id}` : undefined}
                  >
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-base font-semibold sunmi-text-strong tabular-nums">
                        Transferencia #{t.id}
                      </span>
                    </div>
                    <div className="text-sm2 sunmi-text-muted">
                      {diaLegible(fechaArgentinaISO(new Date(t.fechaRecepcion)))}
                    </div>
                  </FilaConImporte>
                ))}
              </DiaConBanda>
            ))
          )}
        </>
      )}
    </>
  );
}
