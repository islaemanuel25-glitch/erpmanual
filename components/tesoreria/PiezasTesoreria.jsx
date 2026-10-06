"use client";

// components/tesoreria/PiezasTesoreria.jsx
//
// LAS PIEZAS DE LA PANTALLA DE TESORERÍA, del tablero de componentes del Figma
// (página "Tesorería · móvil", nodo 14:3).
//
// Se arman con el kit y con las piezas que ya usa Finanzas en el celular —el
// `Renglon` y el `Bloque` del Resumen—, no con unas parecidas al lado. Lo que es
// propio de Tesorería es poco: la insignia de estado, el botón en sus cuatro
// tipos del Figma (que es `SunmiButton`), el encabezado de un detalle y las
// tarjetas de turno y de caja.
//
// Los colores son SIEMPRE clases semánticas del tema (`sunmi-text-*`,
// `sunmi-border-*`): la insignia pinta su contorno con `border-current`, así que
// el borde es el mismo token que el texto en los catorce temas.

import SunmiActionCard from "@/components/sunmi/SunmiActionCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import { Bloque, Renglon } from "@/components/finanzas/PiezasDelResumen";
import { formatearMoneda } from "@/lib/moneda";
import {
  INSIGNIA_TESORERIA,
  ESTADO_TESORERIA,
  estadoDeCaja,
  franjaHoraria,
  insigniaDeCajaEnElTurno,
  proporcionVerificada,
  textoFaltaSobra,
} from "@/lib/tesoreria/pantallaTesoreria";

export { Bloque, Renglon };

const CLASE_TONO = Object.freeze({
  warning: "sunmi-text-warning",
  success: "sunmi-text-success",
  danger: "sunmi-text-danger",
  muted: "sunmi-text-muted",
});

/** El color de un importe con signo: lo que resta en peligro, lo que suma en éxito. */
export function colorDeDiferencia(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n === 0) return null;
  return n < 0 ? "sunmi-text-danger" : "sunmi-text-success";
}

/** "−$2.000" / "+$500" / "$0": el signo va en el texto, no solo en el color. */
export function textoDeDiferencia(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return formatearMoneda(null);
  if (n < 0) return `−${formatearMoneda(-n)}`;
  if (n > 0) return `+${formatearMoneda(n)}`;
  return formatearMoneda(0);
}

/**
 * INSIGNIA DE ESTADO (Figma 14:29). Contorno y texto en el token semántico, sin
 * relleno, con un punto del mismo color. El texto dice el estado: no depende
 * del color para entenderse.
 */
export function InsigniaDeEstado({ estado }) {
  const i = INSIGNIA_TESORERIA[estado];
  if (!i) return null;
  return (
    <span
      data-insignia={estado}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-current px-2 py-0.5 text-sm2 font-semibold whitespace-nowrap ${CLASE_TONO[i.tono]}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {i.texto}
    </span>
  );
}

const CLASE_BOTON = Object.freeze({
  primario: { color: "primary", clase: "" },
  secundario: { color: "ghost", clase: "border sunmi-divider sunmi-text-strong" },
  peligro: { color: "ghost", clase: "border sunmi-border-danger sunmi-text-danger" },
  fantasma: { color: "ghost", clase: "sunmi-text-accent" },
});

/**
 * BOTÓN (Figma 14:67): 44 px de alto —`min-h-toque`—, ancho completo. Es
 * `SunmiButton`; el tipo elige color y contorno del kit.
 */
export function BotonTesoreria({ tipo = "primario", children, className = "", ...props }) {
  const b = CLASE_BOTON[tipo] || CLASE_BOTON.primario;
  return (
    <SunmiButton
      color={b.color}
      type="button"
      className={`w-full min-h-toque justify-center rounded-xl text-base font-semibold ${b.clase} ${className}`}
      {...props}
    >
      {children}
    </SunmiButton>
  );
}

/** Un enlace de texto de la tarjeta: "Ver cajas del turno ›". */
export function EnlaceTesoreria({ children, onClick }) {
  return (
    <SunmiLinkButton onClick={onClick} className="self-start text-sm2 font-medium">
      {children} ›
    </SunmiLinkButton>
  );
}

/** El rótulo de una sección suelta, como "TURNOS DEL DÍA · 2". */
export function RotuloDeSeccion({ children, cuenta = null }) {
  return (
    <div className="flex items-start gap-2 pt-1.5 text-xs2 font-semibold">
      <h2 className="flex-1 min-w-0 sunmi-text-muted tracking-wider">{children}</h2>
      {cuenta != null ? <span className="sunmi-text-muted opacity-70">{cuenta}</span> : null}
    </div>
  );
}

/** Una nota con borde punteado: aclara una regla, no es un dato. */
export function NotaPunteada({ children, tono = "muted" }) {
  return (
    <div className={`rounded-xl border border-dashed sunmi-divider px-3 py-2.5 text-sm2 ${CLASE_TONO[tono] || CLASE_TONO.muted}`}>
      {children}
    </div>
  );
}

/** Un aviso con borde en el tono del estado (requiere revisión, sin importe). */
export function AvisoDeEstado({ tono = "danger", children, accion = null }) {
  const borde = tono === "warning" ? "sunmi-border-warning" : "sunmi-border-danger";
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl border ${borde} px-3 py-2.5 text-sm2 ${CLASE_TONO[tono]}`}>
      <div>{children}</div>
      {accion}
    </div>
  );
}

/**
 * La tarjeta protagonista: el número grande. La franja de acento la lleva solo
 * la Base conocida, como en el Figma; los detalles la dibujan sin franja.
 */
export function TarjetaHero({ children, franja = true }) {
  return (
    <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-2">
      {franja ? <span className="block h-1 w-9 rounded-full sunmi-bg-accent" aria-hidden="true" /> : null}
      {children}
    </section>
  );
}

/** El número grande de una tarjeta, con su rótulo en mayúsculas arriba. */
export function CifraHero({ rotulo, valor, color = "sunmi-text-strong", accesorio = null }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0 text-xs2 font-semibold sunmi-text-muted tracking-wider">{rotulo}</div>
        {accesorio}
      </div>
      <div className={`text-xl3 font-semibold tabular-nums ${color}`}>{valor}</div>
    </div>
  );
}

/**
 * EL ENCABEZADO DE UN DETALLE (B, C, I): ‹, el título, el local y una línea de
 * contexto. "‹" vuelve a la vista anterior.
 */
export function EncabezadoDeDetalle({ titulo, local, contexto, onVolver }) {
  return (
    <header className="space-y-1">
      <div className="flex items-center gap-2.5">
        <SunmiButton
          color="ghost"
          type="button"
          onClick={onVolver}
          aria-label="Volver"
          className="min-h-toque min-w-toque justify-center px-0 text-xl2 sunmi-text-muted"
        >
          ‹
        </SunmiButton>
        <h1 className="flex-1 min-w-0 text-lg2 font-semibold sunmi-text-strong">{titulo}</h1>
        {local ? <span className="shrink-0 text-sm2 font-medium sunmi-text-muted">{local}</span> : null}
      </div>
      {contexto ? <p className="text-sm2 sunmi-text-muted">{contexto}</p> : null}
    </header>
  );
}

/**
 * EL AVANCE DE LO VERIFICADO sobre lo entregado (Figma EVJ2KvVCrY0oVSowfboymQ,
 * "Avance · verificado / entregado"). `pct` es el de `proporcionVerificada`,
 * truncado: no dice 100 si falta contar. El color sale del token de texto del
 * tema con `bg-current`: no hay una clase de fondo de éxito o advertencia y no
 * se escribe uno fijo.
 */
export function BarraDeAvance({ pct }) {
  if (pct == null) return null;
  return (
    <div className="flex h-1.5 gap-0.5 overflow-hidden" aria-hidden="true" data-avance={pct}>
      {pct > 0 && <div className="h-full rounded-full bg-current sunmi-text-success" style={{ width: `${pct}%` }} />}
      {pct < 100 && <div className="h-full flex-1 rounded-full bg-current sunmi-text-warning" />}
    </div>
  );
}

/** "Verificado $X · Falta $Y" en una fila: los dos importes del servidor. */
export function VerificadoYFalta({ verificado, falta }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm2">
      <span className="sunmi-text-muted">
        Verificado <span className="font-semibold tabular-nums sunmi-text-strong">{formatearMoneda(verificado)}</span>
      </span>
      <span className="sunmi-text-muted">
        Falta <span className="font-semibold tabular-nums sunmi-text-strong">{formatearMoneda(falta)}</span>
      </span>
    </div>
  );
}

/**
 * TARJETA DE TURNO (Figma EVJ2KvVCrY0oVSowfboymQ, "Tesorería / Tarjeta de
 * turno"). La cifra protagonista es el EFECTIVO ENTREGADO del turno: ni lo
 * cobrado por POS ni lo digital, que van en el bloque "COBRADO POR POS". Debajo,
 * cuánto se verificó y cuánto falta, la diferencia de Tesorería si hay, la
 * acción y "Ver cajas", que abre las cajas acá mismo (`children`).
 */
export function TarjetaDeTurno({
  g,
  contexto,
  puedeVerificar,
  onVerificar,
  onVerVerificacion,
  cajasAbiertas = false,
  onAlternarCajas = null,
  children = null,
}) {
  const v = g.grupo.verificacion || {};
  const enRevision = g.estado === ESTADO_TESORERIA.REQUIERE_REVISION;
  const diferencia = textoFaltaSobra(g.diferencia);
  const sinImporte = g.cajas.filter((c) => c.sinImporte).map((c) => c.etiqueta);
  return (
    <section
      data-tarjeta-turno={g.grupo.clave}
      className={`sunmi-bg-card rounded-xl2 border p-4 space-y-2.5 ${enRevision ? "sunmi-border-danger" : "sunmi-divider"}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-0.5">
          <h3 className="text-base2 font-semibold sunmi-text-strong break-words">{g.nombre}</h3>
          {contexto ? <p className="text-sm2 sunmi-text-muted">{contexto}</p> : null}
        </div>
        <InsigniaDeEstado estado={g.estado} />
      </div>

      <div>
        <div data-efectivo-del-turno className="text-xl3 font-semibold tabular-nums sunmi-text-strong break-words">
          {formatearMoneda(g.grupo.efectivoDeclaradoEntregado)}
        </div>
        <p className="text-sm2 sunmi-text-muted">Efectivo entregado</p>
      </div>
      <BarraDeAvance pct={proporcionVerificada(v)} />
      <VerificadoYFalta verificado={v.efectivoVerificado} falta={v.entregadoPendienteDeVerificar} />
      {diferencia && <Renglon rotulo="Diferencia" valor={diferencia} colorValor={colorDeDiferencia(g.diferencia)} />}

      {enRevision && (
        <AvisoDeEstado tono="danger">Una entrega cambió después de verificarla. Lo verificado no se recalculó.</AvisoDeEstado>
      )}
      {sinImporte.length > 0 && (
        <AvisoDeEstado tono="warning">{sinImporte.join(", ")} cerró sin conteo: no hay importe para verificar.</AvisoDeEstado>
      )}

      {puedeVerificar && g.pendientes.length > 0 && <BotonTesoreria onClick={onVerificar}>Verificar efectivo</BotonTesoreria>}
      {enRevision && g.enRevision.length > 0 && (
        <BotonTesoreria tipo="secundario" onClick={() => onVerVerificacion(g.enRevision[0].id)}>
          Revisar verificación
        </BotonTesoreria>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {onAlternarCajas ? (
          <EnlaceTesoreria onClick={onAlternarCajas}>{cajasAbiertas ? "Ocultar cajas" : `Ver cajas (${g.cajas.length})`}</EnlaceTesoreria>
        ) : null}
        {g.completos.length > 0 && (
          <EnlaceTesoreria onClick={() => onVerVerificacion(g.completos[0].id)}>Ver verificación</EnlaceTesoreria>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * LAS CAJAS DEL TURNO, abiertas debajo de su tarjeta (Figma 351:620, "Turno +
 * cajas (mismo bloque)"): el turno sigue arriba como contexto.
 */
export function CajasDelTurno({ g, verificaciones, onVerCaja }) {
  return (
    <div className="border-t sunmi-divider pt-2.5 space-y-1.5" data-cajas-del-turno={g.grupo.clave}>
      <div className="text-xs2 font-semibold sunmi-text-muted tracking-wider">CAJAS DEL TURNO</div>
      {g.cajas.map((c) => (
        <CajaDelTurno
          key={c.turnoId}
          c={c}
          insignia={insigniaDeCajaEnElTurno(estadoDeCaja(c, verificaciones), g.estado)}
          onVerCaja={onVerCaja ? () => onVerCaja(c) : null}
        />
      ))}
    </div>
  );
}

/**
 * CAJA DEL TURNO (Figma EVJ2KvVCrY0oVSowfboymQ, "Tesorería / Caja del turno").
 * Quién, cuánto efectivo entregó, qué caja y en qué horario, y SU diferencia
 * de caja si tuvo: es del cajero y NO se compensa con la de otra caja, así que
 * no hay un total de diferencias en ningún lado. La insignia va solo cuando
 * dice algo que la del turno no dice. Lo digital no está: no es plata a contar.
 */
export function CajaDelTurno({ c, insignia = null, onVerCaja = null }) {
  const caja = c.caja || {};
  const entregado = c.sinImporte && !c.entregas?.length ? null : c.efectivoDeclaradoEntregado;
  const franja = franjaHoraria(caja.apertura, caja.cierre);
  const diferencia = textoFaltaSobra(caja.diferenciaCaja);
  const contenido = (
    <>
      <div className="flex w-full items-baseline gap-2">
        <span className="flex-1 min-w-0 truncate text-base font-semibold sunmi-text-strong">
          {caja.operadorNombre || c.etiqueta}
        </span>
        <span className={`shrink-0 tabular-nums font-semibold ${entregado == null ? "sunmi-text-muted" : "sunmi-text-strong"}`}>
          {entregado == null ? "Sin importe declarado" : formatearMoneda(entregado)}
        </span>
      </div>
      <div className="flex w-full items-center gap-2 text-sm2 sunmi-text-muted">
        <span className="flex-1 min-w-0 truncate">{[`Caja #${c.turnoId}`, franja].filter(Boolean).join(" · ")}</span>
        <InsigniaDeEstado estado={insignia} />
      </div>
      {diferencia && (
        <div className="flex w-full items-baseline gap-2 text-sm2" data-diferencia-de-caja>
          <span className="flex-1 min-w-0 sunmi-text-muted">Diferencia de caja</span>
          <span className={`shrink-0 tabular-nums font-semibold ${colorDeDiferencia(caja.diferenciaCaja)}`}>{diferencia}</span>
        </div>
      )}
    </>
  );
  return onVerCaja ? (
    <SunmiActionCard data-caja-turno={c.turnoId} onClick={onVerCaja} aria-label={`Ver la caja de ${caja.operadorNombre || c.etiqueta}`}>
      {contenido}
    </SunmiActionCard>
  ) : (
    <div data-caja-turno={c.turnoId} className="flex flex-col gap-1.5 p-3">
      {contenido}
    </div>
  );
}

/**
 * LAS CAJAS SIN TURNO ASIGNADO (Figma EVJ2KvVCrY0oVSowfboymQ, "Tesorería / Sin
 * turno asignado"): las anteriores al turno operativo, al final y en un
 * renglón compacto, sin competir con los turnos de hoy. Siguen siendo
 * verificables: con efectivo pendiente, "Verificar" abre el mismo flujo; si
 * no, "Ver" abre sus cajas acá mismo.
 */
export function SinTurnoAsignado({ g, contexto, puedeVerificar, onVerificar, cajasAbiertas = false, onAlternarCajas, children = null }) {
  const v = g.grupo.verificacion || {};
  const falta = Number(v.entregadoPendienteDeVerificar || 0) > 0;
  const verificar = puedeVerificar && g.pendientes.length > 0;
  const estado = [ESTADO_TESORERIA.REQUIERE_REVISION, ESTADO_TESORERIA.SIN_IMPORTE_DECLARADO].includes(g.estado) ? g.estado : null;
  return (
    <section data-sin-turno={g.grupo.clave} className="rounded-xl2 border border-dashed sunmi-divider px-4 py-3 space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold sunmi-text-muted">{g.nombre}</h3>
          <p className="text-sm2 sunmi-text-muted">
            {[contexto, falta ? `falta ${formatearMoneda(v.entregadoPendienteDeVerificar)}` : null].filter(Boolean).join(" · ")}
          </p>
          {estado ? <InsigniaDeEstado estado={estado} /> : null}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="text-sm font-semibold tabular-nums sunmi-text-muted">{formatearMoneda(g.grupo.efectivoDeclaradoEntregado)}</span>
          {verificar ? (
            <EnlaceTesoreria onClick={onVerificar}>Verificar</EnlaceTesoreria>
          ) : (
            <EnlaceTesoreria onClick={onAlternarCajas}>{cajasAbiertas ? "Ocultar" : "Ver"}</EnlaceTesoreria>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
