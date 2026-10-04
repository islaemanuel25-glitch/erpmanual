"use client";

// components/tesoreria/PantallaTesoreria.jsx
//
// LA PANTALLA DE TESORERÍA, PRESENTACIONAL. Recibe lo que contestó
// `GET /api/finanzas/tesoreria` y lo dibuja; no pide nada, no escribe nada y no
// recalcula plata. El hook (`useTesoreria`) trae los datos y el tablero
// (`TableroTesoreria`) abre las hojas.
//
// Figma "Tesorería · móvil" (archivo uptcbzbnV5M4q32kgmupF9, página 14:2):
//   A · Resumen del período ...... `ResumenTesoreria` (16:210, y H 19:1232)
//   B · Turno ...................... `DetalleDeTurno` (17:499, y F 19:975, G 19:1100)
//   C · Caja ....................... `DetalleDeCaja` (17:622)
//   I · Verificación ............... `DetalleDeVerificacion` (19:1381)
//
// La vista sale de la URL (`ctx.vista`); cambiarla es navegar, así que el
// "atrás" del teléfono vuelve al resumen.

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
  ESTADO_TESORERIA,
  actosQueCruzan,
  avisosDeRevision,
  franjaHoraria,
  lecturaDelGrupo,
  periodoSinMovimientos,
  presentacionDePago,
  proporcionVerificada,
  rotuloDeTurnos,
} from "@/lib/tesoreria/pantallaTesoreria";

import {
  AvisoDeEstado,
  Bloque,
  EnlaceTesoreria,
  InsigniaDeEstado,
  NotaPunteada,
  Renglon,
  RotuloDeSeccion,
  TarjetaDeTurno,
  TarjetaHero,
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
  const v = r.verificacion || {};

  if (periodoSinMovimientos(lectura)) {
    return (
      <div className="text-center py-12 sunmi-text-muted text-xs">
        No hubo movimientos de Tesorería en este período: ninguna caja entregó efectivo, no hubo cobros por POS ni
        egresos.
      </div>
    );
  }

  const avisos = avisosDeRevision(lectura);
  const grupos = (lectura.grupos || []).map((g) => lecturaDelGrupo(lectura, g.clave)).filter(Boolean);
  const cruzan = actosQueCruzan(lectura);

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

      <BaseConocida resumen={r} />

      {Number(v.entregadoDeclarado || 0) > 0 && <EfectivoDeLasCajas verificacion={v} grupos={grupos} />}

      <CobradoPorPos resumen={r} />

      <SalioPorFuera lectura={lectura} resumen={r} />

      {grupos.length > 0 && (
        <>
          <RotuloDeSeccion cuenta={grupos.length}>{rotuloDeTurnos(ctx.unidad)}</RotuloDeSeccion>
          {grupos.map((g) => (
            <TarjetaDeTurno
              key={g.grupo.clave}
              g={g}
              contexto={contextoDeTurno(g)}
              puedeVerificar={Boolean(datos.puedeVerificarEfectivo)}
              onVerificar={() => onVerificar(g)}
              onVerCajas={() => onIr({ vista: VISTA_TESORERIA.TURNO, grupo: g.grupo.clave })}
              onVerVerificacion={(id) => onIr({ vista: VISTA_TESORERIA.VERIFICACION, verificacion: id, grupo: g.grupo.clave })}
            />
          ))}
        </>
      )}

      {cruzan.length > 0 && <VerificacionesQueCruzan actos={cruzan} onIr={onIr} />}
    </>
  );
}

/** "2 cajas · 08:02 a 14:10". */
export function contextoDeTurno(g) {
  const n = g.cajas.length;
  const cajas = n === 1 ? "1 caja" : `${n} cajas`;
  const franja = franjaHoraria(g.grupo.primerHecho, g.grupo.ultimoHecho);
  return franja ? `${cajas} · ${franja}` : cajas;
}

/**
 * 1 · BASE CONOCIDA. La cifra del servidor y su certeza. No es saldo: es lo que
 * el sistema conoce del período.
 */
function BaseConocida({ resumen: r }) {
  const v = r.verificacion || {};
  const pendiente = Number(v.entregadoPendienteDeVerificar || 0);
  const declarado = Number(v.entregadoDeclarado || 0);
  const cc = r.cobrosCuentaCorrienteSinUbicar || { cantidad: 0, monto: 0 };
  return (
    <TarjetaHero>
      <div className="text-xs2 font-semibold sunmi-text-muted tracking-wider">BASE CONOCIDA DE TESORERÍA</div>
      <div className="text-xl3 font-semibold tabular-nums sunmi-text-strong" data-base-conocida>
        {formatearMoneda(r.baseConocida)}
      </div>
      <p className="text-sm2 sunmi-text-muted">
        Efectivo entregado {formatearMoneda(r.efectivoDeclaradoEntregado)} + cobrado por POS{" "}
        {formatearMoneda(r.digitalCobradoDeclarado)} − egresos exteriores {formatearMoneda(r.egresosExterioresConocidos)}
      </p>
      {declarado > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {pendiente > 0 ? (
            <>
              <InsigniaDeEstado estado={ESTADO_TESORERIA.PARCIAL} />
              <span className="text-sm font-medium sunmi-text-warning">
                {formatearMoneda(pendiente)} del efectivo sin verificar
              </span>
            </>
          ) : (
            <>
              <InsigniaDeEstado estado={ESTADO_TESORERIA.VERIFICADA} />
              <span className="text-sm font-medium sunmi-text-success">Todo el efectivo declarado está verificado</span>
            </>
          )}
        </div>
      )}
      {r.baseIncompleta && (
        <p className="text-xs2 sunmi-text-warning">
          Hay cajas sin cerrar o que cerraron sin conteo: su efectivo todavía no está en la base.
        </p>
      )}
      {Number(cc.cantidad) > 0 && (
        <p className="text-xs2 sunmi-text-muted">
          {cc.cantidad === 1 ? "1 cobro" : `${cc.cantidad} cobros`} de cuenta corriente ({formatearMoneda(cc.monto)}) sin
          medio ni caja: no están en la base.
        </p>
      )}
      <p className="text-xs2 sunmi-text-muted opacity-80">No es saldo bancario: es lo que el sistema conoce del período.</p>
    </TarjetaHero>
  );
}

/** 3 · EFECTIVO DE LAS CAJAS: declarado, verificado y pendiente, separados. */
function EfectivoDeLasCajas({ verificacion: v, grupos }) {
  const pct = proporcionVerificada(v);
  const conPendiente = grupos.filter((g) => g.pendientes.length).map((g) => g.nombre);
  return (
    <Bloque titulo="EFECTIVO DE LAS CAJAS">
      <Renglon
        rotulo="Declarado entregado"
        nota="Lo que las cajas dijeron que entregaron"
        valor={formatearMoneda(v.entregadoDeclarado)}
        fuerte
      />
      <Renglon
        rotulo="Verificado"
        nota="Contado por el responsable"
        valor={formatearMoneda(v.efectivoVerificado)}
        colorValor={Number(v.efectivoVerificado) > 0 ? "sunmi-text-success" : null}
        notaValor={Number(v.actosCompletos) > 0 ? `de ${formatearMoneda(v.declaradoDeLosActos)} declarados` : null}
      />
      <Renglon
        rotulo="Pendiente de verificar"
        nota={conPendiente.length ? conPendiente.join(", ") : null}
        valor={formatearMoneda(v.entregadoPendienteDeVerificar)}
        colorValor={Number(v.entregadoPendienteDeVerificar) > 0 ? "sunmi-text-warning" : null}
      />
      {pct != null && (
        <>
          <div className="flex h-1.5 gap-0.5 overflow-hidden" aria-hidden="true">
            {/* El color sale del token de texto del tema (`bg-current`): no hay
                una clase de fondo de éxito/advertencia y no se escribe uno fijo. */}
            {pct > 0 && <div className="h-full rounded-full bg-current sunmi-text-success" style={{ width: `${pct}%` }} />}
            {pct < 100 && <div className="h-full flex-1 rounded-full bg-current sunmi-text-warning" />}
          </div>
          <p className="text-xs2 sunmi-text-muted">{pct}% del efectivo declarado ya fue contado</p>
        </>
      )}
    </Bloque>
  );
}

/**
 * 13 · COBRADO POR POS. Declarado por el POS: no es acreditado ni conciliado.
 * Comisión y neto son ESTIMADOS.
 */
function CobradoPorPos({ resumen: r }) {
  const digitales = (r.cobradoPorMedio || []).filter((m) => !m.esEfectivo);
  if (!digitales.length) return null;
  return (
    <Bloque titulo="COBRADO POR POS">
      {digitales.map((m) => (
        <Renglon
          key={m.medio}
          rotulo={m.rotulo}
          nota={
            m.comisionEstimada != null
              ? `Comisión est. ${formatearMoneda(m.comisionEstimada)} · neto est. ${formatearMoneda(m.netoEstimado)}`
              : null
          }
          valor={formatearMoneda(m.montoDeclarado)}
        />
      ))}
      <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />
      <Renglon rotulo="Total cobrado por POS" valor={formatearMoneda(r.digitalCobradoDeclarado)} fuerte />
      {r.comisionEstimadaIncompleta && (
        <p className="text-xs2 sunmi-text-warning">Hay ventas con comisión pendiente: la comisión estimada está incompleta.</p>
      )}
      <p className="text-xs2 sunmi-text-muted">
        Declarado por el POS. Todavía no es dinero acreditado ni conciliado con Mercado Pago o el banco.
      </p>
    </Bloque>
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
