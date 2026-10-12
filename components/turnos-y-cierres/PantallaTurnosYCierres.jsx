"use client";

// components/turnos-y-cierres/PantallaTurnosYCierres.jsx
//
// LA PANTALLA DE "TURNOS Y CIERRES", PRESENTACIONAL. Recibe lo que contestó
// `GET /api/turnos-y-cierres` y lo dibuja; no pide nada y no recalcula plata.
//
//   A2 (364:577) · los turnos del período, plegados ......... `ListaDeTurnos`
//   A3 (364:674) · un turno y sus cajas, desplegados ........ `TarjetaDeTurno`
//   D  (359:2367) · el cajero: solo sus cajas ............... `MisCajas`
//
// Las diferencias de caja no se suman nunca: el turno dice cuántas cajas faltan
// y cuántas sobran, y cada caja muestra la suya.

import { useState } from "react";

import SelectorDePeriodo from "@/components/periodo/SelectorDePeriodo";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSolapas from "@/components/sunmi/SunmiSolapas";
import { horaAR } from "@/lib/fechas/formatearFechaHora";
import { fechaArgentinaISO } from "@/lib/fechas/rangoArgentina";
import { franjaHoraria } from "@/lib/tesoreria/pantallaTesoreria";
import { PESTANA_TODOS, grupoEnPestana } from "@/lib/turnosYCierres/lecturaTurnosYCierres";
import {
  CLASE_TONO,
  diferenciaDeCaja,
  diferenciasDelGrupo,
  esCerrada,
  estadoDeCaja,
  plata,
  rotuloDeDia,
  subtituloDelGrupo,
  tonoDeGanancia,
} from "@/lib/turnosYCierres/pantallaTurnosYCierres";

import { Cifra, FilaDeSalida, Insignia, Renglon, Rotulo } from "./PiezasTurnosYCierres";

/**
 * @param {object} props
 * @param {object|null} props.datos  la respuesta de la API
 * @param {object} props.ctx         el período de la URL (`parseContextoTesoreria`)
 * @param {string} props.pestana     la pestaña elegida
 */
export default function PantallaTurnosYCierres({
  datos,
  cargando = false,
  error = "",
  ctx,
  hoy,
  pestana = PESTANA_TODOS,
  abiertosIniciales = [],
  onCambiarPestana,
  onCambiarUnidad,
  onElegirRango,
  onAtras,
  onAdelante,
  onReintentar,
  onVerCaja,
}) {
  if (datos?.vista === "MIS_CAJAS") return <MisCajas datos={datos} onVerCaja={onVerCaja} />;
  // Hasta la primera respuesta no se sabe si quien mira es un cajero —que no
  // tiene período— o ve el local entero: no se dibuja un selector que se iría.
  if (cargando && !datos) {
    return (
      <div className="py-12">
        <SunmiLoader />
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {datos?.local?.nombre ? <p className="text-sm3 sunmi-text-muted">{datos.local.nombre}</p> : null}

      <SelectorDePeriodo
        datos={datos}
        ctx={ctx}
        hoy={hoy}
        onCambiarUnidad={onCambiarUnidad}
        onElegirRango={onElegirRango}
        onAtras={onAtras}
        onAdelante={onAdelante}
      />

      {error && !cargando ? <Error error={error} onReintentar={onReintentar} /> : null}

      {datos?.vista === "LOCAL" && (
        <ListaDeTurnos
          datos={datos}
          pestana={pestana}
          abiertosIniciales={abiertosIniciales}
          onCambiarPestana={onCambiarPestana}
          onVerCaja={onVerCaja}
        />
      )}
    </div>
  );
}

function Error({ error, onReintentar }) {
  return (
    <div role="alert" className="rounded-xl border sunmi-border-danger px-4 py-3 space-y-2">
      <p className="text-sm2 sunmi-text-danger">{error}</p>
      {onReintentar ? (
        <SunmiButton color="slate" type="button" onClick={onReintentar} className="min-h-toque">
          Reintentar
        </SunmiButton>
      ) : null}
    </div>
  );
}

// ── A2 · LOS TURNOS DEL PERÍODO ──────────────────────────────────────────

export function ListaDeTurnos({ datos, pestana, abiertosIniciales = [], onCambiarPestana, onVerCaja }) {
  const grupos = (datos.grupos || []).filter((g) => grupoEnPestana(g, pestana));
  // Con más de un día en el período, cada tarjeta dice de qué día es.
  const conDia = new Set((datos.grupos || []).map((g) => g.dia)).size > 1;

  return (
    <>
      <AvisoVentasSinCaja sinCaja={datos.ventasSinCaja} />

      <SunmiSolapas opciones={datos.pestanas || []} valor={pestana} onCambiar={onCambiarPestana} etiqueta="Turno" />

      {grupos.length === 0 ? (
        <p className="py-10 text-center text-sm3 sunmi-text-muted">Sin cajas en este período.</p>
      ) : (
        grupos.map((g) => (
          <TarjetaDeTurno
            key={g.clave}
            g={g}
            conDia={conDia}
            abiertoInicial={abiertosIniciales.includes(g.clave)}
            onVerCaja={onVerCaja}
          />
        ))
      )}
    </>
  );
}

/** "N ventas sin caja asignada · $X", con su lista a pedido. Solo si hay. */
export function AvisoVentasSinCaja({ sinCaja }) {
  const [abierto, setAbierto] = useState(false);
  if (!sinCaja || !sinCaja.cantidad) return null;
  const n = sinCaja.cantidad;
  return (
    <div data-ventas-sin-caja className="rounded-xl border sunmi-border-warning sunmi-btn-warning-soft px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm3 font-semibold sunmi-text-strong">
            {n} {n === 1 ? "venta sin caja asignada" : "ventas sin caja asignada"}
          </div>
          <div className="text-sm2 sunmi-text-muted tabular-nums">{plata(sinCaja.total)}</div>
        </div>
        <SunmiLinkButton onClick={() => setAbierto((v) => !v)} className="shrink-0 text-sm2 font-semibold">
          {abierto ? "Ocultar" : "Ver ›"}
        </SunmiLinkButton>
      </div>
      {abierto && (
        <div className="space-y-1.5 border-t sunmi-divider pt-2">
          {sinCaja.items.map((v) => (
            <Renglon
              key={v.id}
              rotulo={v.numero != null ? `Venta #${v.numero}` : `Venta ${v.id}`}
              nota={`${rotuloDeDia(fechaArgentinaISO(v.fecha))} · ${horaAR(v.fecha)}`}
              valor={plata(v.total)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── A3 · UN TURNO, PLEGADO Y DESPLEGADO ─────────────────────────────────

export function TarjetaDeTurno({ g, conDia = false, abiertoInicial = false, onVerCaja }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const dif = diferenciasDelGrupo(g);

  return (
    <section data-tarjeta-turno={g.clave} className="rounded-xl2 border sunmi-border sunmi-bg-card p-4 space-y-3">
      <SunmiButton
        type="button"
        color="ghost"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="w-full min-h-0 p-0 rounded-none justify-start text-left font-normal"
      >
        <span className="flex w-full items-start gap-2">
          <span className="min-w-0 flex-1">
            <span className="block text-lg2 font-bold sunmi-text-strong">{g.titulo}</span>
            <span className="block text-sm2 sunmi-text-muted">{subtituloDelGrupo(g, { conDia })}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-xs2 font-medium sunmi-text-muted">Ganancia</span>
            <span className={`block text-lg2 font-bold tabular-nums ${CLASE_TONO[tonoDeGanancia(g.ganancia)]}`}>
              {plata(g.ganancia)}
            </span>
          </span>
          <span aria-hidden="true" className="shrink-0 pt-1 text-base sunmi-text-accent">
            {abierto ? "˄" : "˅"}
          </span>
        </span>
      </SunmiButton>

      <div className="grid grid-cols-2 gap-2">
        <Cifra rotulo="Tickets" valor={g.tickets} />
        <Cifra rotulo="Vendido" valor={plata(g.vendido)} />
      </div>

      {abierto ? (
        <div data-cajas-del-turno className="divide-y sunmi-divide">
          {g.cajas.map((c) => (
            <CajaDelTurno key={c.id} c={c} onVerCaja={onVerCaja} />
          ))}
        </div>
      ) : dif ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm3 sunmi-text-muted">Diferencias de caja</span>
          <Insignia texto={dif.texto} tono={dif.tono} />
        </div>
      ) : null}
    </section>
  );
}

/** Una caja dentro del turno desplegado. */
export function CajaDelTurno({ c, onVerCaja }) {
  const est = estadoDeCaja(c);
  const dif = diferenciaDeCaja(c);
  const salidas = c.salidas || [];
  return (
    <div data-caja={c.id} className="space-y-3 py-3 first:pt-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-base2 font-bold sunmi-text-strong">
            {c.nombre} · Caja #{c.id}
          </span>
          <Insignia texto={est.texto} tono={est.tono} />
        </div>
        <div className="flex items-center justify-between gap-2 text-sm2">
          <span className="sunmi-text-muted">{franjaHoraria(c.apertura, c.cierre) || "—"}</span>
          {dif ? (
            <span data-diferencia-de-caja className={`font-semibold tabular-nums ${CLASE_TONO[dif.tono]}`}>
              {dif.texto}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Cifra rotulo="Bruto" valor={plata(c.metricas.bruto)} />
        <Cifra rotulo="Neto" valor={plata(c.metricas.neto)} />
        <Cifra rotulo="Ganancia" valor={plata(c.metricas.ganancia)} tono={tonoDeGanancia(c.metricas.ganancia)} />
        <Cifra rotulo="Tickets" valor={c.metricas.tickets} />
      </div>

      <div className="space-y-1.5">
        <Rotulo>COBRADO</Rotulo>
        <Renglon rotulo="Efectivo" valor={plata(c.cobrado.efectivo)} />
        <Renglon rotulo="Digital" valor={plata(c.cobrado.digital)} />
        {c.cobrado.porMedio.map((m) => (
          <Renglon key={m.medio} rotulo={m.etiqueta} valor={plata(m.monto)} atenuado />
        ))}
        <Renglon rotulo="Fiado" valor={plata(c.cobrado.fiado)} atenuado />
      </div>

      <div className="space-y-2">
        <Rotulo>LO QUE SALIÓ DE LA CAJA</Rotulo>
        {salidas.length ? (
          salidas.map((s) => <FilaDeSalida key={s.id} s={s} />)
        ) : (
          <p className="text-sm2 sunmi-text-muted">Sin salidas.</p>
        )}
      </div>

      <SunmiButton
        type="button"
        color="primary"
        onClick={() => onVerCaja?.(c.id)}
        className="w-full min-h-toque justify-center rounded-xl text-base font-semibold"
      >
        {esCerrada(c) ? "Ver detalle y Z ›" : "Ver detalle ›"}
      </SunmiButton>
    </div>
  );
}

// ── D · EL CAJERO: SOLO SUS CAJAS ────────────────────────────────────────

export function MisCajas({ datos, onVerCaja }) {
  const hoy = datos.hoy || [];
  const anteriores = datos.anteriores || [];
  return (
    <div className="space-y-3.5">
      <p className="text-sm3 sunmi-text-muted">{[datos.quien, datos.local?.nombre].filter(Boolean).join(" · ")}</p>
      {!hoy.length && !anteriores.length ? (
        <p className="py-10 text-center text-sm3 sunmi-text-muted">Todavía no tenés cajas.</p>
      ) : null}
      {hoy.length ? <ListaDeMisCajas titulo="HOY" cajas={hoy} onVerCaja={onVerCaja} /> : null}
      {anteriores.length ? <ListaDeMisCajas titulo="ANTERIORES" cajas={anteriores} onVerCaja={onVerCaja} conDia /> : null}
    </div>
  );
}

function ListaDeMisCajas({ titulo, cajas, onVerCaja, conDia = false }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs2 font-semibold tracking-wider sunmi-text-muted">{titulo}</h2>
      <div className="rounded-xl2 border sunmi-border sunmi-bg-card px-4 divide-y sunmi-divide">
        {cajas.map((c) => (
          <MiCaja key={c.id} c={c} conDia={conDia} onVerCaja={onVerCaja} />
        ))}
      </div>
    </section>
  );
}

function MiCaja({ c, conDia, onVerCaja }) {
  const est = estadoDeCaja(c);
  const dif = diferenciaDeCaja(c);
  const cerrada = esCerrada(c);
  const horario = cerrada ? franjaHoraria(c.apertura, c.cierre) : `desde ${franjaHoraria(c.apertura, null)}`;
  return (
    <SunmiButton
      type="button"
      color="ghost"
      data-mi-caja={c.id}
      onClick={() => onVerCaja?.(c.id)}
      className="w-full min-h-0 py-3 px-0 rounded-none justify-start text-left font-normal"
    >
      <span className="block w-full space-y-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-base2 font-bold sunmi-text-strong">{conDia ? rotuloDeDia(c.dia) : c.nombre}</span>
          <Insignia texto={est.texto} tono={est.tono} />
        </span>
        <span className="flex items-center justify-between gap-2 text-sm2">
          <span className="sunmi-text-muted">
            Caja #{c.id} · {horario}
          </span>
          <span className="font-semibold sunmi-text-accent">{cerrada ? "Ver y Z ›" : "Ver ›"}</span>
        </span>
        <span className="flex items-center justify-between gap-2 text-sm2">
          {cerrada ? (
            <>
              <span className="sunmi-text-muted">Diferencia de caja</span>
              {dif ? <span className={`font-semibold tabular-nums ${CLASE_TONO[dif.tono]}`}>{dif.texto}</span> : null}
            </>
          ) : (
            <>
              <span className="sunmi-text-muted">Efectivo esperado ahora</span>
              <span className="font-semibold tabular-nums sunmi-text-strong">{plata(c.efectivo.teniaQueHaber)}</span>
            </>
          )}
        </span>
      </span>
    </SunmiButton>
  );
}
