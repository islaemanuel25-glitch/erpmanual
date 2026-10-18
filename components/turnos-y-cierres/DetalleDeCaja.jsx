"use client";

// components/turnos-y-cierres/DetalleDeCaja.jsx
//
// EL DETALLE DE UNA CAJA (Figma "V2 · B", 367:650), SUS ARQUEOS Y PAGOS, Y SU
// COMPROBANTE Z (359:605), PRESENTACIONALES. Reciben lo que contestó
// `GET /api/turnos-y-cierres/cajas/:id` y lo dibujan; no recalculan plata.
//
// La diferencia del recuadro es la de la caja: lo contado contra lo que tenía
// que haber, con `calcularEfectivoEsperado`. La de cada retiro del cajón es la
// de SU tramo (`arqueosDeCaja`): la acumulada de ese corte menos la anterior.

import SunmiButton from "@/components/sunmi/SunmiButton";
import { fechaHoraAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { fechaOperativaISO } from "@/lib/caja/turnoOperativo";
import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { franjaHoraria } from "@/lib/tesoreria/pantallaTesoreria";
import { CLASE_MOVIMIENTO } from "@/lib/finanzas/movimientosDeCaja";
import {
  CLASE_TONO,
  TEXTO_COMISION_SIN_CALCULAR,
  diferenciaDelCajon,
  diferenciaGrande,
  esCerrada,
  estadoDeCaja,
  mas,
  menos,
  plata,
  rotuloDeDia,
  textoDeDiferencia,
} from "@/lib/turnosYCierres/pantallaTurnosYCierres";

import { BarraDeMedios, Bloque, Insignia, Recuadro, Renglon, RenglonConTono, Rotulo } from "./PiezasTurnosYCierres";

/** Los pagos desde la caja: las salidas que no son arqueo ni cierre. */
const pagosDeLaCaja = (c) =>
  (c.salidas || []).filter((s) => s.clase !== CLASE_MOVIMIENTO.RECAUDACION && s.clase !== CLASE_MOVIMIENTO.CIERRE);

/** El día de la caja: el de su turno operativo, o el de su apertura. */
const diaDe = (c) => fechaOperativaISO(c.fechaOperativa) || fechaArgentinaISO(c.apertura);

export function Separador() {
  return <div className="border-t sunmi-divider" />;
}

/** El encabezado: "Caja #632 · Damaris" y de qué turno y día es. */
export function Encabezado({ c, local }) {
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

/**
 * EL EFECTIVO DE LA CAJA: LA ÚNICA LECTURA DEL CAJÓN. Lo que entró, lo que
 * salió —pagos y TODOS los retiros en orden de hora, con el cierre como último:
 * el cierre es un arqueo más— y la diferencia. Cada retiro dice la diferencia
 * de SU tramo, no la acumulada, que hacía parecer que faltó en todos.
 *
 * Dibuja `c.cajon` tal como vino (`efectivoDelCajon` en
 * `lib/turnosYCierres/lecturaTurnosYCierres.js`); no suma ni resta nada. Los
 * montos van sin signo: lo que sale ya lo dice "SALIÓ DEL CAJÓN". Lo usan la
 * caja desplegada del trabajador y el detalle de la caja: la misma pieza.
 */
export function EfectivoDeLaCaja({ c }) {
  const k = c.cajon;
  const dif = diferenciaDelCajon(c);
  return (
    <Bloque titulo="EFECTIVO DE LA CAJA">
      <Rotulo>ENTRÓ AL CAJÓN</Rotulo>
      <div data-entro-al-cajon className="space-y-1.5">
        <Renglon rotulo="Cambio inicial" valor={plata(k.entro.cambioInicial)} />
        <Renglon rotulo="Ventas en efectivo" valor={plata(k.entro.ventasEfectivo)} />
        {k.entro.ingresos ? <Renglon rotulo="Ingresos" valor={plata(k.entro.ingresos)} /> : null}
      </div>
      <Separador />
      <Renglon rotulo="Entró" valor={plata(k.entro.total)} fuerte />

      <Rotulo>SALIÓ DEL CAJÓN</Rotulo>
      <div data-salio-del-cajon className="space-y-1.5">
        {k.salio.pagosDesdeCaja ? <Renglon rotulo="Pagos desde la caja" valor={plata(k.salio.pagosDesdeCaja)} /> : null}
        {k.salio.retiros.map((r) => {
          const tramo = textoDeDiferencia(r.tramo);
          return (
            <div key={r.id} data-retiro={r.id}>
              <Renglon
                rotulo={r.instante ? `${horaAR(r.instante)} · ${r.rotulo}` : r.rotulo}
                valor={r.esConteo ? `Contó ${plata(r.monto)}` : plata(r.monto)}
                atenuado={r.esConteo}
                nota={tramo?.texto ?? null}
                notaColor={tramo ? CLASE_TONO[tramo.tono] : undefined}
              />
            </div>
          );
        })}
      </div>
      <Separador />
      <Renglon rotulo="Salió" valor={plata(k.salio.total)} fuerte />

      {esCerrada(c) ? (
        <Recuadro rotulo="DIFERENCIA DE LA CAJA" valor={dif.texto} tono={dif.tono}>
          <div className="text-xs2 sunmi-text-muted">
            Entró {plata(k.entro.total)} − salió {plata(k.salio.total)}
          </div>
        </Recuadro>
      ) : (
        <p data-caja-abierta className="text-sm2 sunmi-text-muted">{dif.texto}</p>
      )}
    </Bloque>
  );
}

/**
 * LO COBRADO EN LA CAJA (V2 · B): la barra con el porcentaje de cada medio, el
 * monto de cada uno y, debajo de cada medio digital, su comisión restada; el
 * total, el neto y el fiado aparte.
 */
export function CobradoEnLaCaja({ c }) {
  const cobrados = c.cobrado.medios.filter((m) => !m.esFiado);
  return (
    <Bloque titulo="COBRADO EN LA CAJA">
      <BarraDeMedios medios={cobrados} conPorcentaje />
      <div data-cobrado-por-medio className="space-y-1.5">
        {cobrados.map((m) => (
          <div key={m.medio} data-medio={m.medio} className="space-y-1.5">
            <Renglon rotulo={m.etiqueta} valor={plata(m.monto)} />
            {m.medio === "EFECTIVO" ? null : (
              <div className="pl-3">
                {m.comisionConocida ? (
                  <Renglon rotulo={`Comisión ${m.etiqueta}`} valor={menos(m.comision)} colorValor={CLASE_TONO.danger} atenuado />
                ) : (
                  <Renglon rotulo={`Comisión ${m.etiqueta}`} valor={TEXTO_COMISION_SIN_CALCULAR} atenuado />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <Separador />
      <Renglon rotulo="Total cobrado" valor={plata(c.cobrado.total)} fuerte />
      <Separador />
      <div className="space-y-1.5">
        <Renglon
          rotulo="Neto después de comisiones"
          nota={c.cobrado.comisionesConocidas ? null : TEXTO_COMISION_SIN_CALCULAR}
          valor={plata(c.cobrado.netoDespuesDeComisiones)}
          colorValor={CLASE_TONO.success}
          fuerte
        />
        <Renglon rotulo="Fiado" valor={plata(c.cobrado.fiado)} atenuado />
      </div>
    </Bloque>
  );
}

/**
 * LO COBRADO POR CADA MEDIO ELECTRÓNICO, en corto: un bloque por medio —"MERCADO
 * PAGO", "CRÉDITO"…— con lo cobrado y su comisión. Es la caja desplegada en
 * "Quién trabajó"; el efectivo ya está en su bloque y el total, en el turno.
 * Los medios son los de `cobrado.medios`, tal como vinieron: QR es MERCADOPAGO y
 * el crédito por Mercado Pago es CREDITO, cada uno en su bloque.
 */
export function CobradoPorMedioElectronico({ c }) {
  const medios = (c.cobrado?.medios || []).filter((m) => !m.esFiado && m.medio !== "EFECTIVO");
  return medios.map((m) => (
    <Bloque key={m.medio} titulo={m.etiqueta.toUpperCase()}>
      <div data-medio={m.medio} className="space-y-1.5">
        <Renglon rotulo="Cobrado" valor={plata(m.monto)} />
        {m.comisionConocida ? (
          <Renglon rotulo="Comisión" valor={menos(m.comision)} colorValor={CLASE_TONO.danger} />
        ) : (
          <Renglon rotulo="Comisión" valor={TEXTO_COMISION_SIN_CALCULAR} atenuado />
        )}
      </div>
    </Bloque>
  ));
}

export default function DetalleDeCaja({ datos, onVerMovimientos }) {
  const c = datos.caja;

  return (
    <div className="space-y-3.5">
      <Encabezado c={c} local={datos.local?.nombre} />

      <EfectivoDeLaCaja c={c} />

      <CobradoEnLaCaja c={c} />

      <SunmiButton
        type="button"
        color="primary"
        onClick={onVerMovimientos}
        className="w-full min-h-toque justify-center rounded-xl text-base font-semibold"
      >
        Pagos y Z ›
      </SunmiButton>
    </div>
  );
}

// ── LOS ARQUEOS, LOS PAGOS Y EL BOTÓN AL Z ───────────────────────────────

export function MovimientosDeCaja({ datos, onVerZ }) {
  const c = datos.caja;
  const pagos = pagosDeLaCaja(c);
  return (
    <div className="space-y-3.5">
      <Encabezado c={c} local={datos.local?.nombre} />

      {/* La lista "Arqueos y cierre" se fue de acá: los arqueos y el cierre son
          los retiros de "SALIÓ DEL CAJÓN" en `EfectivoDeLaCaja`, con la
          diferencia de cada tramo. Una sola lectura de la caja, en un lugar. */}
      <Bloque titulo="PAGOS DESDE LA CAJA">
        {pagos.length ? (
          <div className="space-y-1.5">
            {pagos.map((s) => (
              <Renglon key={s.id} rotulo={s.larga} nota={horaAR(s.instante)} valor={plata(s.monto)} />
            ))}
          </div>
        ) : (
          <p className="text-sm2 sunmi-text-muted">Sin pagos.</p>
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
          <Renglon rotulo="Cambio inicial" valor={plata(e.cambioInicial)} />
          <Renglon rotulo="Ventas en efectivo" valor={mas(e.ventasEfectivo)} />
          {e.ingresos ? <Renglon rotulo="Ingresos" valor={mas(e.ingresos)} /> : null}
          <Renglon rotulo="Pagos desde la caja" valor={menos(e.pagosDesdeCaja)} />
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
