"use client";

// components/tesoreria/PantallaTesoreria.jsx
//
// LA PANTALLA DE TESORERÍA, PRESENTACIONAL. Recibe lo que contestó
// `GET /api/finanzas/tesoreria` y lo dibuja; no pide nada, no escribe nada y no
// recalcula plata. El hook (`useTesoreria`) trae los datos y el tablero
// (`TableroTesoreria`) abre las hojas.
//
// El RESUMEN es el rediseño móvil aprobado (Figma EVJ2KvVCrY0oVSowfboymQ):
//   A · Pantalla principal ........ `ResumenTesoreria` (351:499): COBRADO POR
//       POS → EFECTIVO ENTREGADO → EFECTIVO ENTREGADO POR TURNO
//   F · "Ver cajas" abierto ....... `TurnoConCajas` (351:620), sin navegar
//   B–E y G · estados ............. `TarjetaDeTurno` y `SinTurnoAsignado` (351:707)
//
// Los detalles siguen siendo los de "Tesorería · móvil" (uptcbzbnV5M4q32kgmupF9):
//   B · Turno ...................... `DetalleDeTurno` (17:499, y F 19:975, G 19:1100)
//   C · Caja ....................... `DetalleDeCaja` (17:622)
//   I · Verificación ............... `DetalleDeVerificacion` (19:1381)
//
// La vista sale de la URL (`ctx.vista`); cambiarla es navegar, así que el
// "atrás" del teléfono vuelve al resumen.

import { useState } from "react";

import ChipsDePeriodo from "@/components/transferencias/ChipsDePeriodo";
import NavegadorDePeriodo from "@/components/transferencias/NavegadorDePeriodo";
import SunmiDateRangePicker from "@/components/sunmi/SunmiDateRangePicker";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import { formatearMoneda } from "@/lib/moneda";
import { CLAVE_OTRO_FINANZAS } from "@/lib/finanzas/periodoFinanciero";
import { VISTA_TESORERIA } from "@/lib/tesoreria/contextoTesoreria";
import {
  actosQueCruzan,
  avisosDeRevision,
  contextoDelGrupo,
  diferenciaDelPeriodo,
  gruposEnOrden,
  lecturaDelGrupo,
  periodoSinMovimientos,
  presentacionDePago,
  proporcionVerificada,
  textoFaltaSobra,
} from "@/lib/tesoreria/pantallaTesoreria";

import {
  AvisoDeEstado,
  BarraDeAvance,
  Bloque,
  CajasDelTurno,
  EnlaceTesoreria,
  NotaPunteada,
  Renglon,
  RotuloDeSeccion,
  SinTurnoAsignado,
  TarjetaDeTurno,
  TarjetaHero,
  colorDeDiferencia,
  textoDeDiferencia,
} from "./PiezasTesoreria";
import { DetalleDeCaja, DetalleDeTurno, DetalleDeVerificacion } from "./DetallesTesoreria";

const sinCambio = () => {};

/**
 * @param {object} props
 * @param {object|null} props.datos   la respuesta de la API (vista UN_LOCAL)
 * @param {object} props.ctx          el contexto de la URL (`parseContextoTesoreria`)
 * @param {boolean} props.faltaRango  «Otro» sin las dos fechas: no se pidió nada
 * @param {string} props.hoy          AAAA-MM-DD argentino, tope del calendario
 * @param {function|null} props.onCambiarLocal  solo el depósito: volver a la lista
 */
export default function PantallaTesoreria({
  datos,
  cargando = false,
  error = "",
  ctx,
  faltaRango = false,
  hoy,
  onCambiarUnidad,
  onElegirRango,
  onAtras,
  onAdelante,
  onReintentar,
  onIr,
  onVolver,
  onVerificar,
  onAnular,
  onCambiarLocal = null,
}) {
  const lectura = datos?.tesoreria || null;
  const local = datos?.local?.nombre || "";
  const enDetalle = ctx.vista !== VISTA_TESORERIA.RESUMEN && lectura;

  if (enDetalle) {
    const comun = { datos, lectura, ctx, local, onIr, onVolver, onVerificar, onAnular };
    if (ctx.vista === VISTA_TESORERIA.TURNO) return <DetalleDeTurno {...comun} />;
    if (ctx.vista === VISTA_TESORERIA.CAJA) return <DetalleDeCaja {...comun} />;
    if (ctx.vista === VISTA_TESORERIA.VERIFICACION) return <DetalleDeVerificacion {...comun} />;
  }

  return (
    <div className="space-y-3.5">
      <FilaDelLocal local={local} onCambiarLocal={onCambiarLocal} />

      <EncabezadoDePeriodo
        datos={datos}
        ctx={ctx}
        hoy={hoy}
        onCambiarUnidad={onCambiarUnidad}
        onElegirRango={onElegirRango}
        onAtras={onAtras}
        onAdelante={onAdelante}
      />

      {faltaRango && (
        <SunmiAviso tono="neutral" titulo="Elegí el período">
          Con «Otro» elegí desde y hasta para ver la Tesorería de esas fechas.
        </SunmiAviso>
      )}

      {cargando && !lectura && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}

      {error && !cargando && (
        <div role="alert" className="rounded-xl border sunmi-border-danger px-4 py-3 space-y-2">
          <p className="text-sm2 sunmi-text-danger">{error}</p>
          {onReintentar ? (
            <SunmiButton color="slate" type="button" onClick={onReintentar} className="min-h-toque">
              Reintentar
            </SunmiButton>
          ) : null}
        </div>
      )}

      {lectura && !error && (
        <ResumenTesoreria datos={datos} lectura={lectura} ctx={ctx} onIr={onIr} onVerificar={onVerificar} />
      )}
    </div>
  );
}

/** El local que se mira; el depósito puede volver a la lista para elegir otro. */
function FilaDelLocal({ local, onCambiarLocal }) {
  if (!local) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      {onCambiarLocal ? (
        <SunmiLinkButton onClick={onCambiarLocal} className="text-sm2 font-medium" aria-label={`Cambiar de local (${local})`}>
          {local} ▾
        </SunmiLinkButton>
      ) : (
        <span className="text-sm2 font-medium sunmi-text-muted">{local}</span>
      )}
    </div>
  );
}

/**
 * EL ENCABEZADO TEMPORAL CANÓNICO DE FINANZAS (Figma 21:1523): los cuatro chips
 * y el navegador, con los textos de `descripcionFinanciera` que manda el
 * servidor. Acá «Otro» NO va apagado: Tesorería sabe consultarlo. Con «Otro»
 * aparece el calendario de rango del kit, y el navegador dice «Período elegido»
 * con las flechas apagadas —el servidor contesta `puedeAvanzar` y
 * `puedeRetroceder` en false—.
 */
function EncabezadoDePeriodo({ datos, ctx, hoy, onCambiarUnidad, onElegirRango, onAtras, onAdelante }) {
  const descripcion = datos?.periodo?.descripcion || null;
  const esOtro = ctx.unidad === CLAVE_OTRO_FINANZAS;
  return (
    <div className="space-y-3">
      <ChipsDePeriodo valor={ctx.unidad} onCambiar={onCambiarUnidad} />
      {esOtro && (
        <SunmiDateRangePicker
          valueDesde={ctx.desde || ""}
          valueHasta={ctx.hasta || ""}
          // El kit los llama al aplicar, ANTES de `onApply`: sin ellos «Aplicar»
          // se cae y el rango no llega. El período vive en la URL y solo cambia
          // al aplicar, así que no hay nada que guardar mientras se elige.
          onChangeDesde={sinCambio}
          onChangeHasta={sinCambio}
          onApply={(desde, hasta) => onElegirRango(desde, hasta)}
          placeholder="Elegí desde y hasta"
          maxDate={hoy}
        />
      )}
      {descripcion && (
        <NavegadorDePeriodo
          titulo={descripcion.titulo}
          subtitulo={descripcion.subtitulo}
          puedeAvanzar={Boolean(datos?.puedeAvanzar)}
          puedeRetroceder={Boolean(datos?.puedeRetroceder)}
          onAtras={onAtras}
          onAdelante={onAdelante}
        />
      )}
    </div>
  );
}

// ── A · EL RESUMEN DEL PERÍODO ───────────────────────────────────────────

function ResumenTesoreria({ datos, lectura, ctx, onIr, onVerificar }) {
  const r = lectura.resumen || {};

  if (periodoSinMovimientos(lectura)) {
    return (
      <div className="text-center py-12 sunmi-text-muted text-xs">
        No hubo movimientos de Tesorería en este período: ninguna caja entregó efectivo, no hubo cobros por POS ni
        egresos.
      </div>
    );
  }

  const avisos = avisosDeRevision(lectura);
  const grupos = gruposEnOrden((lectura.grupos || []).map((g) => lecturaDelGrupo(lectura, g.clave)).filter(Boolean));
  const cruzan = actosQueCruzan(lectura);
  const comunDeTurno = {
    verificaciones: lectura.verificaciones,
    puedeVerificar: Boolean(datos.puedeVerificarEfectivo),
    onVerificar,
    onIr,
    unidad: ctx.unidad,
  };

  return (
    <>
      {avisos.map((a) => (
        <AvisoDeEstado
          key={a.verificacionId}
          tono="danger"
          accion={
            <EnlaceTesoreria onClick={() => onIr({ vista: VISTA_TESORERIA.VERIFICACION, verificacion: a.verificacionId })}>
              Ver verificación #{a.verificacionId}
            </EnlaceTesoreria>
          }
        >
          Una verificación requiere revisión: {a.cajas.length ? `la entrega de ${a.cajas.join(", ")}` : "una entrega"}{" "}
          cambió después de verificarla. Lo verificado no se recalculó.
        </AvisoDeEstado>
      ))}

      <CobradoPorPos resumen={r} />

      {Number(r.efectivoDeclaradoEntregado || 0) > 0 && <EfectivoEntregado lectura={lectura} resumen={r} />}

      {grupos.length > 0 && (
        <>
          <RotuloDeSeccion>EFECTIVO ENTREGADO POR TURNO</RotuloDeSeccion>
          {grupos.map((g) =>
            g.grupo.sinTurno ? (
              <SinTurnoConCajas key={g.grupo.clave} g={g} {...comunDeTurno} />
            ) : (
              <TurnoConCajas key={g.grupo.clave} g={g} {...comunDeTurno} />
            )
          )}
        </>
      )}

      <SalioPorFuera lectura={lectura} resumen={r} />

      {cruzan.length > 0 && <VerificacionesQueCruzan actos={cruzan} onIr={onIr} />}
    </>
  );
}

/** Lo que las tarjetas de turno necesitan para abrir lo suyo. */
function accionesDeTurno(g, { onVerificar, onIr }) {
  return {
    onVerificar: () => onVerificar(g),
    onVerVerificacion: (id) => onIr({ vista: VISTA_TESORERIA.VERIFICACION, verificacion: id, grupo: g.grupo.clave }),
    onVerCaja: (c) => onIr({ vista: VISTA_TESORERIA.CAJA, caja: c.turnoId, grupo: g.grupo.clave }),
  };
}

/**
 * UN TURNO CON SUS CAJAS. "Ver cajas" las abre debajo de la tarjeta, en el
 * mismo bloque, sin navegar: el turno queda arriba como contexto.
 */
export function TurnoConCajas({ g, verificaciones, puedeVerificar, onVerificar, onIr, unidad, abiertoInicial = false }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const acciones = accionesDeTurno(g, { onVerificar, onIr });
  return (
    <TarjetaDeTurno
      g={g}
      contexto={contextoDeTurno(g, unidad)}
      puedeVerificar={puedeVerificar}
      onVerificar={acciones.onVerificar}
      onVerVerificacion={acciones.onVerVerificacion}
      cajasAbiertas={abierto}
      onAlternarCajas={() => setAbierto((a) => !a)}
    >
      {abierto && <CajasDelTurno g={g} verificaciones={verificaciones} onVerCaja={acciones.onVerCaja} />}
    </TarjetaDeTurno>
  );
}

/** Las cajas sin turno asignado, en su renglón compacto; "Ver" abre sus cajas. */
export function SinTurnoConCajas({ g, verificaciones, puedeVerificar, onVerificar, onIr, unidad, abiertoInicial = false }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const acciones = accionesDeTurno(g, { onVerificar, onIr });
  return (
    <SinTurnoAsignado
      g={g}
      contexto={contextoDeTurno(g, unidad)}
      puedeVerificar={puedeVerificar}
      onVerificar={acciones.onVerificar}
      cajasAbiertas={abierto}
      onAlternarCajas={() => setAbierto((a) => !a)}
    >
      {abierto && <CajasDelTurno g={g} verificaciones={verificaciones} onVerCaja={acciones.onVerCaja} />}
    </SinTurnoAsignado>
  );
}

/** "2 cajas", o "Domingo 4 de octubre · 2 cajas" cuando el período tiene varios días. */
export function contextoDeTurno(g, unidad) {
  return contextoDelGrupo(g.grupo, unidad, g.cajas.length);
}

/**
 * COBRADO POR POS (Figma EVJ2KvVCrY0oVSowfboymQ, 351:528). Contesta solo
 * cuánto cobró comercialmente el POS y por qué medios: el total, el efectivo
 * VENDIDO y lo digital por medio. Es contexto: no lleva estados, ni cajas, ni
 * "Verificar". Los importes son los del servidor tal cual —el total también—;
 * FIADO no está, porque no entró dinero.
 */
function CobradoPorPos({ resumen: r }) {
  const digitales = (r.cobradoPorMedio || []).filter((m) => !m.esEfectivo);
  const cc = r.cobrosCuentaCorrienteSinUbicar || { cantidad: 0, monto: 0 };
  if (!Number(r.cobradoPorPosDeclarado || 0)) return null;
  return (
    <section className="sunmi-bg-card rounded-xl2 border sunmi-border px-4 py-3 space-y-1.5" data-cobrado-por-pos>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs2 font-semibold sunmi-text-muted tracking-wider">COBRADO POR POS</h2>
        <span className="text-base2 font-semibold tabular-nums sunmi-text-strong">{formatearMoneda(r.cobradoPorPosDeclarado)}</span>
      </div>
      <Renglon rotulo="En efectivo" valor={formatearMoneda(r.efectivoCobradoDeclarado)} />
      {digitales.length > 0 && (
        <>
          <Renglon rotulo="Digital" valor={formatearMoneda(r.digitalCobradoDeclarado)} />
          <div className="pl-3.5 space-y-1.5">
            {digitales.map((m) => (
              <Renglon key={m.medio} rotulo={m.rotulo} valor={formatearMoneda(m.montoDeclarado)} atenuado />
            ))}
          </div>
        </>
      )}
      {Number(cc.cantidad) > 0 && (
        <p className="text-xs2 sunmi-text-muted">
          {cc.cantidad === 1 ? "1 cobro" : `${cc.cantidad} cobros`} de cuenta corriente ({formatearMoneda(cc.monto)}) sin
          medio ni caja: no están acá.
        </p>
      )}
    </section>
  );
}

/**
 * EFECTIVO ENTREGADO (Figma EVJ2KvVCrY0oVSowfboymQ, 351:541): la plata física
 * que las cajas entregaron a Tesorería, cuánto se verificó y cuánto falta. La
 * diferencia es la de TESORERÍA —lo contado contra lo entregado, la de cada
 * verificación entera— y aparece solo si hay; nunca es una suma de las
 * diferencias de caja de los operadores.
 */
function EfectivoEntregado({ lectura, resumen: r }) {
  const v = r.verificacion || {};
  const diferencia = diferenciaDelPeriodo(lectura);
  const texto = textoFaltaSobra(diferencia);
  return (
    <TarjetaHero franja={false}>
      <div className="text-xs2 font-semibold sunmi-text-muted tracking-wider">EFECTIVO ENTREGADO</div>
      <div className="text-xl3 font-semibold tabular-nums sunmi-text-strong break-words" data-efectivo-entregado>
        {formatearMoneda(r.efectivoDeclaradoEntregado)}
      </div>
      <BarraDeAvance pct={proporcionVerificada(v)} />
      <Renglon rotulo="Verificado" valor={formatearMoneda(v.efectivoVerificado)} />
      <Renglon rotulo="Falta verificar" valor={formatearMoneda(v.entregadoPendienteDeVerificar)} />
      {texto && <Renglon rotulo="Diferencia" valor={texto} colorValor={colorDeDiferencia(diferencia)} />}
      {r.baseIncompleta && (
        <p className="text-xs2 sunmi-text-warning">Hay cajas sin cerrar o que cerraron sin conteo: su efectivo no está acá.</p>
      )}
    </TarjetaHero>
  );
}

/**
 * 14 y 15 · LO QUE SALIÓ POR FUERA DE LAS CAJAS (resta, una vez) y, aparte, lo
 * pagado DESDE las cajas, que no resta: ya está descontado de cada entrega.
 */
function SalioPorFuera({ lectura, resumen: r }) {
  const egresos = lectura.egresosExteriores || [];
  const desdeCaja = Number(r.pagosDesdeCajaInformativos || 0);
  if (!egresos.length && !desdeCaja) return null;
  return (
    <Bloque titulo="SALIÓ POR FUERA DE LAS CAJAS">
      {egresos.map((p) => {
        const pres = presentacionDePago(p);
        return (
          <Renglon
            key={`${p.origen}-${p.id}`}
            rotulo={pres.rotulo}
            nota={pres.nota}
            valor={`−${formatearMoneda(p.montoPagado)}`}
            colorValor="sunmi-text-danger"
          />
        );
      })}
      {egresos.length > 0 && (
        <>
          <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />
          <Renglon rotulo="Total egresos exteriores" valor={`−${formatearMoneda(r.egresosExterioresConocidos)}`} fuerte />
        </>
      )}
      {desdeCaja > 0 && (
        <div className="rounded-xl border border-dashed sunmi-divider p-2.5 space-y-2" data-pagado-desde-cajas>
          <Renglon rotulo="Pagado desde cajas" valor={formatearMoneda(desdeCaja)} notaValor="no resta" atenuado />
          <p className="text-xs2 sunmi-text-muted">
            Ya está descontado del efectivo que entregó cada caja. Se ve en la caja, no se vuelve a restar.
          </p>
        </div>
      )}
    </Bloque>
  );
}

/**
 * 16 · LAS VERIFICACIONES QUE CRUZAN EL PERÍODO, aparte y enteras. No se suman
 * a lo verificado del período ni se reparten: tienen entregas fuera de él.
 */
function VerificacionesQueCruzan({ actos, onIr }) {
  return (
    <Bloque titulo="VERIFICACIONES QUE CRUZAN ESTE PERÍODO">
      {actos.map((a) => (
        <div key={a.id} className="space-y-1">
          <Renglon
            rotulo={`Verificación #${a.id}`}
            nota={`${a.entregasEnElPeriodo.length} de ${a.entregas.length} entregas en este período · ${
              a.cantidadDeCajas === 1 ? "1 caja" : `${a.cantidadDeCajas} cajas`
            }`}
            valor={textoDeDiferencia(a.diferencia)}
            notaValor="diferencia del acto entero"
          />
          <EnlaceTesoreria onClick={() => onIr({ vista: VISTA_TESORERIA.VERIFICACION, verificacion: a.id })}>
            Ver verificación
          </EnlaceTesoreria>
        </div>
      ))}
      <NotaPunteada>
        Tienen entregas fuera del período: se muestran enteras y no se suman a lo verificado de este período.
      </NotaPunteada>
    </Bloque>
  );
}
