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
  cajasSuperpuestas,
  comoCerroLaCaja,
  diferenciaDeCaja,
  esCerrada,
  estadoDeCaja,
  mas,
  menos,
  plata,
  renglonDelTurno,
  rotuloDeDia,
  textoDelHistorial,
} from "@/lib/turnosYCierres/pantallaTurnosYCierres";
import { ETIQUETA_TIPO_EGRESO, TIPOS_EGRESO } from "@/lib/caja/tipoEgreso";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";

import { FilaDePago, Insignia, Recuadro, Renglon, RenglonConTono, Rotulo } from "./PiezasTurnosYCierres";
import { CobradoPorMedioElectronico, EfectivoDeLaCaja, Separador } from "./DetalleDeCaja";

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
  puedeClasificar = false,
  onClasificar = null,
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
          puedeClasificar={puedeClasificar}
          onClasificar={onClasificar}
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

export function ListaDeTurnos({
  datos,
  pestana,
  abiertosIniciales = [],
  onCambiarPestana,
  onVerCaja,
  puedeClasificar = false,
  onClasificar = null,
}) {
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
            puedeClasificar={puedeClasificar}
            onClasificar={onClasificar}
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

/**
 * "PLATA QUE SALIÓ DE LA CAJA" (P5): cada pago con su tipo y su marca. Arriba,
 * si hay, cuántos no tienen tipo; quien puede, toca uno y le asigna el tipo.
 */
export function PlataQueSalio({ g, puedeClasificar = false, onClasificar = null }) {
  const [eligiendo, setEligiendo] = useState(null);
  const pagos = g.pagos || [];
  if (!pagos.length) return null;
  const clasificar = puedeClasificar && onClasificar ? (p) => setEligiendo(p) : null;
  const primeroSinClasificar = pagos.find((p) => p.clasificable && !p.tipoEgreso);
  return (
    <div data-plata-que-salio className="space-y-2">
      {g.sinClasificar ? (
        <div className="flex items-center justify-between gap-2 rounded-lg sunmi-btn-warning-soft px-3 py-2">
          <span className="text-sm2 font-semibold sunmi-text-warning">
            {g.sinClasificar} {g.sinClasificar === 1 ? "pago sin clasificar" : "pagos sin clasificar"}
          </span>
          {clasificar && primeroSinClasificar ? (
            <SunmiLinkButton onClick={() => clasificar(primeroSinClasificar)} className="shrink-0 text-sm2 font-semibold">
              Clasificar ›
            </SunmiLinkButton>
          ) : null}
        </div>
      ) : null}
      <Rotulo>PLATA QUE SALIÓ DE LA CAJA</Rotulo>
      {pagos.map((p) => (
        <FilaDePago key={p.id} p={p} onClasificar={clasificar && p.clasificable ? clasificar : null} />
      ))}
      <ElegirTipoDePago
        pago={eligiendo}
        onCerrar={() => setEligiendo(null)}
        onElegir={async (tipo) => {
          const ok = await onClasificar?.(eligiendo.id, tipo);
          if (ok !== false) setEligiendo(null);
        }}
      />
    </div>
  );
}

/** El tipo de un pago sin clasificar: solo el tipo, ni el monto ni la caja. */
function ElegirTipoDePago({ pago, onCerrar, onElegir }) {
  const [guardando, setGuardando] = useState(false);
  return (
    <SunmiModalLayout
      open={Boolean(pago)}
      title="Clasificar pago"
      subtitle={pago ? `${pago.corta} · ${plata(pago.monto)}` : ""}
      onClose={onCerrar}
      forma="hoja-o-centrado"
      espacioCuerpo="mt-2"
      z={NIVEL_MODAL_GLOBAL}
    >
      <div className="grid gap-2">
        {TIPOS_EGRESO.map((tipo) => (
          <SunmiButton
            key={tipo}
            type="button"
            color={pago?.tipoEgreso === tipo ? "primary" : "slate"}
            disabled={guardando}
            onClick={async () => {
              setGuardando(true);
              try {
                await onElegir(tipo);
              } finally {
                setGuardando(false);
              }
            }}
            className="w-full min-h-toque justify-center"
          >
            {ETIQUETA_TIPO_EGRESO[tipo]}
          </SunmiButton>
        ))}
      </div>
    </SunmiModalLayout>
  );
}

/** Quién consumió y cuánto, al costo. Sin consumos, nada. */
export function ConsumoDelPersonal({ consumos = [] }) {
  if (!consumos?.length) return null;
  return (
    <div data-consumo-del-personal className="space-y-1.5">
      <Rotulo>CONSUMO DEL PERSONAL</Rotulo>
      {consumos.map((c) => (
        <Renglon
          key={c.id}
          rotulo={`${c.quien} · ${c.productos} ${c.productos === 1 ? "producto" : "productos"}`}
          valor={plata(c.costo)}
        />
      ))}
    </div>
  );
}

export function TarjetaDeTurno({ g, conDia = false, abiertoInicial = false, onVerCaja, puedeClasificar = false, onClasificar = null }) {
  // La flecha pliega el TURNO: su desglose. "Quién trabajó" y el resultado se
  // ven siempre; cada caja se despliega sola, varias a la vez.
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [abiertas, setAbiertas] = useState(() => new Set());
  const alternarCaja = (id) =>
    setAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  const superpuestas = cajasSuperpuestas(g.cajas);

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
            <span className="block text-sm2 sunmi-text-muted">{renglonDelTurno(g, { conDia })}</span>
          </span>
          <span aria-hidden="true" className="shrink-0 pt-1 text-base sunmi-text-accent">
            {abierto ? "˄" : "˅"}
          </span>
        </span>
      </SunmiButton>

      {superpuestas ? (
        <div data-cajas-superpuestas>
          <span className="inline-flex items-center rounded-full sunmi-btn-warning-soft px-2.5 py-0.5 text-sm2 font-semibold">
            {superpuestas.texto}
          </span>
        </div>
      ) : null}

      <QuienTrabajo cajas={g.cajas} abiertas={abiertas} onAlternar={alternarCaja} onVerCaja={onVerCaja} />

      <Recuadro rotulo="RESULTADO DEL TURNO" valor={plata(g.resultado)} tono={Number(g.resultado) < 0 ? "danger" : "success"} />

      {abierto ? (
        <>
          <DesgloseDelTurno g={g} />
          <ConsumoDelPersonal consumos={g.consumos} />
          <PlataQueSalio g={g} puedeClasificar={puedeClasificar} onClasificar={onClasificar} />
        </>
      ) : null}
    </section>
  );
}

/**
 * EL DESGLOSE DEL TURNO, de lo cobrado al resultado. Cada número viene del
 * servidor; acá solo se ordena. "Total cobrado" es lo vendido por todos los
 * medios —el fiado también, para que la cuenta cierre con la ganancia— menos
 * sus comisiones. Las diferencias de caja van una por caja y con nombre: un
 * faltante y un sobrante nunca se netean entre sí.
 */
export function DesgloseDelTurno({ g }) {
  const conDiferencia = g.cajas.filter((c) => c.metricas?.faltantes || c.metricas?.sobrantes);
  return (
    <div data-cuenta-del-turno className="space-y-1.5">
      <Rotulo>LO QUE SE COBRÓ</Rotulo>
      {(g.medios || []).map((m) => (
        <Renglon key={m.medio} rotulo={m.etiqueta} valor={plata(m.monto)} />
      ))}
      <Renglon rotulo="Comisiones" valor={menos(g.comisiones)} />
      <Separador />
      <Renglon rotulo="Total cobrado" valor={plata(g.neto)} fuerte />
      <Renglon rotulo="Costo de la mercadería" valor={menos(g.costo)} />
      <Separador />
      <Renglon rotulo="Ganancia de las ventas" valor={plata(g.ganancia)} fuerte />
      <Renglon rotulo="Sueldos y gastos" valor={menos(g.sueldosYGastos)} />
      <Renglon rotulo="Consumo del personal" valor={menos(g.consumoPersonal)} />
      {conDiferencia.map((c) =>
        c.metricas.faltantes ? (
          <RenglonConTono key={c.id} rotulo={`Faltante de caja · ${c.nombre}`} valor={menos(c.metricas.faltantes)} tono="danger" />
        ) : (
          <RenglonConTono key={c.id} rotulo={`Sobrante de caja · ${c.nombre}`} valor={mas(c.metricas.sobrantes)} tono="warning" />
        )
      )}
      <Separador />
      <Renglon rotulo="Resultado del turno" valor={plata(g.resultado)} fuerte />
    </div>
  );
}

/**
 * "QUIÉN TRABAJÓ" (Figma "OPCIÓN B", 415:483): una tarjetita por caja, arriba
 * de todo y también con el turno plegado, para no tener que bajar hasta el
 * final. Antes las cajas iban al pie de la tarjeta y solo desplegadas.
 */
export function QuienTrabajo({ cajas = [], abiertas, onAlternar, onVerCaja }) {
  if (!cajas.length) return null;
  return (
    <div data-quien-trabajo className="space-y-2">
      <Rotulo>QUIÉN TRABAJÓ</Rotulo>
      {cajas.map((c) => (
        <PersonaDelTurno key={c.id} c={c} abierta={abiertas.has(c.id)} onAlternar={() => onAlternar(c.id)} onVerCaja={onVerCaja} />
      ))}
    </div>
  );
}

/** "Caja #938 · 00:07–08:08", o "desde 00:07" mientras siga abierta. */
const horarioDeLaCaja = (c) =>
  esCerrada(c) ? `${horaAR(c.apertura)}–${horaAR(c.cierre)}` : `desde ${horaAR(c.apertura)}`;

/**
 * Una persona del turno: su caja y cómo cerró. Toda la cabecera se toca y
 * despliega, adentro de la misma tarjetita, la caja como en su detalle (V2 · B)
 * —las MISMAS piezas `EfectivoDeLaCaja` y `CobradoEnLaCaja`, sin recalcular—.
 */
export function PersonaDelTurno({ c, abierta = false, onAlternar, onVerCaja }) {
  const cierre = comoCerroLaCaja(c);
  const historial = textoDelHistorial(c.historialDelMes);
  return (
    <div
      data-caja={c.id}
      data-abierta={abierta ? "" : undefined}
      className={`rounded-xl ${abierta ? "border-2 sunmi-border-accent sunmi-bg" : "border sunmi-border sunmi-bg-card"}`}
    >
      <SunmiButton
        type="button"
        color="ghost"
        aria-expanded={abierta}
        onClick={onAlternar}
        className="w-full min-h-toque px-4 py-3 rounded-xl justify-start text-left font-normal"
      >
        <span className="flex w-full items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-base2 font-bold sunmi-text-strong">{c.nombre}</span>
            <span className="block text-sm2 sunmi-text-muted">
              Caja #{c.id} · {horarioDeLaCaja(c)}
            </span>
            {historial ? (
              <span data-historial-del-mes className={`block text-sm2 font-medium ${CLASE_TONO[historial.tono]}`}>
                {historial.texto}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 text-right">
            <span data-como-cerro className={`block text-sm3 font-semibold tabular-nums ${CLASE_TONO[cierre.tono]}`}>
              {cierre.texto}
            </span>
            <span className="block text-sm2 font-semibold sunmi-text-accent">{abierta ? "Ocultar caja" : "Ver caja ›"}</span>
          </span>
        </span>
      </SunmiButton>

      {abierta ? (
        <div data-detalle-de-la-caja className="space-y-3 px-3 pb-3">
          <EfectivoDeLaCaja c={c} />
          <CobradoPorMedioElectronico c={c} />
          <SunmiButton
            type="button"
            color="primary"
            onClick={() => onVerCaja?.(c.id)}
            className="w-full min-h-toque justify-center rounded-xl text-base font-semibold"
          >
            {esCerrada(c) ? "Ver detalle y Z ›" : "Ver detalle ›"}
          </SunmiButton>
        </div>
      ) : null}
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
