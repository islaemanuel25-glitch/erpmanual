"use client";

// components/turnos-y-cierres/DetalleDeCaja.jsx
//
// EL DETALLE DE UNA CAJA (Figma 359:523) Y SU COMPROBANTE Z (359:605),
// PRESENTACIONALES. Reciben lo que contestó `GET /api/turnos-y-cierres/cajas/:id`
// y lo dibujan; no recalculan plata.
//
// La diferencia grande es la de la caja: lo contado contra lo que tenía que
// haber, con `calcularEfectivoEsperado`. La de cada arqueo es la ACUMULADA
// hasta ese corte, tal como se guardó: se muestra sola y nunca se suma.

import SunmiButton from "@/components/sunmi/SunmiButton";
import { fechaHoraAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { fechaOperativaISO } from "@/lib/caja/turnoOperativo";
import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { franjaHoraria, textoFaltaSobra } from "@/lib/tesoreria/pantallaTesoreria";
import { CLASE_MOVIMIENTO } from "@/lib/finanzas/movimientosDeCaja";
import {
  CLASE_TONO,
  diferenciaGrande,
  esCerrada,
  estadoDeCaja,
  plata,
  rotuloDeDia,
} from "@/lib/turnosYCierres/pantallaTurnosYCierres";

import { Bloque, Insignia, Renglon, RenglonConTono } from "./PiezasTurnosYCierres";

const menos = (n) => `−${plata(n)}`;
const mas = (n) => `+${plata(n)}`;

/** Las salidas que no son arqueo ni cierre: pagos y retiros de Caja −. */
const salidasDeEfectivo = (c) =>
  (c.salidas || []).filter((s) => s.clase !== CLASE_MOVIMIENTO.RECAUDACION && s.clase !== CLASE_MOVIMIENTO.CIERRE);

/** El día de la caja: el de su turno operativo, o el de su apertura. */
const diaDe = (c) => fechaOperativaISO(c.fechaOperativa) || fechaArgentinaISO(c.apertura);

function Separador() {
  return <div className="border-t sunmi-divider" />;
}

/** El encabezado: "Caja #632 · Damaris" y de qué turno y día es. */
function Encabezado({ c, local }) {
  const est = estadoDeCaja(c);
  const horario = esCerrada(c) ? franjaHoraria(c.apertura, c.cierre) : `desde ${franjaHoraria(c.apertura, null)}`;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 truncate text-xl2 font-bold sunmi-text-strong">
          Caja #{c.id} · {c.nombre}
        </h1>
        <Insignia texto={est.texto} tono={est.tono} />
      </div>
      <p className="text-sm2 sunmi-text-muted">{[local, c.turno, rotuloDeDia(diaDe(c)), horario].filter(Boolean).join(" · ")}</p>
    </div>
  );
}

export default function DetalleDeCaja({ datos, onVerZ }) {
  const c = datos.caja;
  const e = c.efectivo;
  const grande = diferenciaGrande(c);
  const salidas = salidasDeEfectivo(c);

  return (
    <div className="space-y-3.5">
      <Encabezado c={c} local={datos.local?.nombre} />

      <Bloque titulo="DIFERENCIA DE CAJA">
        <div data-diferencia-grande className={`text-xl3 font-bold tabular-nums ${CLASE_TONO[grande.tono]}`}>
          {grande.texto}
        </div>
        <Separador />
        <div className="space-y-1.5">
          <Renglon rotulo="Fondo inicial" valor={plata(e.fondoInicial)} />
          <Renglon rotulo="Ventas en efectivo" valor={mas(e.ventasEfectivo)} />
          {e.ingresos ? <Renglon rotulo="Ingresos" valor={mas(e.ingresos)} /> : null}
          <Renglon rotulo="Salidas de efectivo" valor={menos(e.salidasEfectivo)} />
          <Renglon rotulo="Retirado en arqueos" valor={menos(e.retiradoArqueos)} />
        </div>
        <Separador />
        <div className="space-y-1.5">
          <Renglon rotulo={esCerrada(c) ? "Tenía que haber" : "Tiene que haber"} valor={plata(e.teniaQueHaber)} fuerte />
          {esCerrada(c) ? <Renglon rotulo="Contado al cerrar" valor={plata(e.contado)} fuerte /> : null}
        </div>
      </Bloque>

      <Bloque titulo="COBRADO EN LA CAJA">
        <div className="space-y-1.5">
          <Renglon rotulo="Efectivo" valor={plata(c.cobrado.efectivo)} />
          {c.cobrado.porMedio.map((m) => (
            <Renglon key={m.medio} rotulo={m.etiqueta} valor={plata(m.monto)} />
          ))}
        </div>
        <Separador />
        <div className="space-y-1.5">
          <Renglon rotulo="Total cobrado" valor={plata(c.cobrado.total)} fuerte />
          <Renglon rotulo="Fiado" valor={plata(c.cobrado.fiado)} atenuado />
        </div>
      </Bloque>

      <Bloque titulo="ARQUEOS Y CIERRE">
        {datos.arqueos?.length ? (
          <div className="divide-y sunmi-divide">
            {datos.arqueos.map((a) => (
              <div key={a.id} data-arqueo={a.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm3 font-semibold sunmi-text-strong">
                    {horaAR(a.instante)} · {a.tipo}
                  </div>
                  <div className="text-xs2 sunmi-text-muted">
                    {a.accion} {plata(a.monto)}
                  </div>
                </div>
                <DiferenciaAcumulada valor={a.diferencia} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm2 sunmi-text-muted">Sin arqueos.</p>
        )}
      </Bloque>

      <Bloque titulo="SALIDAS DE EFECTIVO">
        {salidas.length ? (
          <div className="space-y-1.5">
            {salidas.map((s) => (
              <Renglon key={s.id} rotulo={s.larga} nota={horaAR(s.instante)} valor={plata(s.monto)} />
            ))}
          </div>
        ) : (
          <p className="text-sm2 sunmi-text-muted">Sin salidas.</p>
        )}
      </Bloque>

      {esCerrada(c) ? (
        <SunmiButton
          type="button"
          color="primary"
          onClick={onVerZ}
          className="w-full min-h-toque justify-center rounded-xl text-base font-semibold"
        >
          Ver comprobante Z
        </SunmiButton>
      ) : null}
    </div>
  );
}

/** La diferencia de un arqueo: la acumulada hasta ese corte, tal cual. */
function DiferenciaAcumulada({ valor }) {
  const t = textoFaltaSobra(valor);
  if (valor == null) return null;
  if (!t) return <span className={`shrink-0 text-sm2 font-semibold ${CLASE_TONO.success}`}>Sin diferencia</span>;
  return (
    <span className={`shrink-0 text-sm2 font-semibold tabular-nums ${Number(valor) < 0 ? CLASE_TONO.danger : CLASE_TONO.warning}`}>
      {t}
    </span>
  );
}

// ── C · EL COMPROBANTE Z ─────────────────────────────────────────────────

export function ComprobanteZ({ datos, onReimprimir }) {
  const c = datos.caja;
  const e = c.efectivo;
  const grande = diferenciaGrande(c);
  const cantidadArqueos = (c.salidas || []).filter((s) => s.clase === CLASE_MOVIMIENTO.RECAUDACION).length;
  return (
    <div className="space-y-3.5">
      <section data-comprobante-z className="rounded-xl2 border border-dashed sunmi-border sunmi-bg-card p-4 space-y-3">
        <div className="text-center">
          <div className="text-base2 font-bold sunmi-text-strong">CIERRE DE CAJA · Z</div>
          <div className="text-sm3 font-semibold sunmi-text-strong">{datos.local?.nombre}</div>
        </div>
        <Separador />
        <div className="space-y-1">
          <Renglon rotulo="Caja" valor={`#${c.id}`} />
          <Renglon rotulo="Operador" valor={c.nombre} valorLargo />
          <Renglon rotulo="Turno" valor={c.turno} valorLargo />
          <Renglon rotulo="Abrió" valor={fechaHoraAR(c.apertura)} />
          <Renglon rotulo="Cerró" valor={fechaHoraAR(c.cierre)} />
        </div>
        <Separador />
        <div className="space-y-1">
          <Renglon rotulo="Efectivo" valor={plata(c.cobrado.efectivo)} />
          {c.cobrado.porMedio.map((m) => (
            <Renglon key={m.medio} rotulo={m.etiqueta} valor={plata(m.monto)} />
          ))}
          <Renglon rotulo="Total cobrado" valor={plata(c.cobrado.total)} fuerte />
          <Renglon rotulo="Fiado" valor={plata(c.cobrado.fiado)} />
        </div>
        <Separador />
        <div className="space-y-1">
          <Renglon rotulo="Fondo inicial" valor={plata(e.fondoInicial)} />
          {e.ingresos ? <Renglon rotulo="Ingresos" valor={mas(e.ingresos)} /> : null}
          <Renglon rotulo="Salidas" valor={menos(e.salidasEfectivo)} />
          <Renglon rotulo={`Arqueos (${cantidadArqueos})`} valor={menos(e.retiradoArqueos)} />
          <Renglon rotulo="Tenía que haber" valor={plata(e.teniaQueHaber)} fuerte />
          <Renglon rotulo="Contado" valor={plata(e.contado)} fuerte />
          <RenglonConTono rotulo="Diferencia" valor={grande.texto} tono={grande.tono} fuerte />
        </div>
      </section>

      <SunmiButton
        type="button"
        color="ghost"
        onClick={onReimprimir}
        className="w-full min-h-toque justify-center rounded-xl border sunmi-border-accent sunmi-text-accent text-base font-semibold"
      >
        Reimprimir
      </SunmiButton>
    </div>
  );
}
