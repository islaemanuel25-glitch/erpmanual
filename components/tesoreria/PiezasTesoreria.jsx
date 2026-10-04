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

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import { Bloque, Renglon } from "@/components/finanzas/PiezasDelResumen";
import { formatearMoneda } from "@/lib/moneda";
import { INSIGNIA_TESORERIA, ESTADO_TESORERIA, notaDeDigitales, notaDeEntregas, totalDigital } from "@/lib/tesoreria/pantallaTesoreria";

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

/** El sub-bloque "VERIFICACIÓN DE EFECTIVO" de una tarjeta, sobre el fondo de la app. */
export function SubBloque({ titulo, children }) {
  return (
    <div className="sunmi-surface rounded-xl border sunmi-border p-3 space-y-2">
      <div className="text-xs2 font-semibold sunmi-text-muted tracking-wider">{titulo}</div>
      {children}
    </div>
  );
}

/**
 * LO QUE DICE LA VERIFICACIÓN DE UN TURNO, en cada estado del Figma (15:325).
 * Recibe la lectura del grupo ya armada (`lecturaDelGrupo`); no calcula plata.
 */
export function VerificacionDelTurno({ g, puedeVerificar, onVerificar, onVerVerificacion }) {
  const v = g.grupo.verificacion || {};
  const pendiente = Number(v.entregadoPendienteDeVerificar || 0);
  const quien = g.completos.length === 1 ? quienYCuando(g.completos[0]) : null;
  const sinImporteDeCajas = g.cajas.filter((c) => c.sinImporte).map((c) => c.etiqueta);
  const hayPendientes = g.pendientes.length > 0;

  return (
    <SubBloque titulo="VERIFICACIÓN DE EFECTIVO">
      {g.estado === ESTADO_TESORERIA.REQUIERE_REVISION && (
        <AvisoDeEstado tono="danger">
          {g.enRevision.length
            ? "Una entrega cambió después de verificarla. Lo verificado es la foto de ese momento y no se recalculó."
            : "Una verificación de este turno requiere revisión."}
        </AvisoDeEstado>
      )}
      {sinImporteDeCajas.length > 0 && (
        <AvisoDeEstado tono="warning">
          {sinImporteDeCajas.join(", ")} cerró sin conteo: no hay importe declarado. No se toma como $0 y no se puede
          verificar.
        </AvisoDeEstado>
      )}

      {g.estado === ESTADO_TESORERIA.PARCIAL ? (
        <>
          <Renglon
            rotulo="Verificado"
            nota={notaDeCajas(g.verificadas)}
            valor={formatearMoneda(v.entregadoCubiertoPorVerificaciones)}
          />
          <Renglon
            rotulo="Pendiente de verificar"
            nota={notaDeCajas(g.pendientes)}
            valor={formatearMoneda(pendiente)}
            colorValor="sunmi-text-warning"
          />
          <p className="text-xs2 sunmi-text-warning">
            Lo verificado no cubre todo el turno: falta contar el efectivo de {cajasDe(g.pendientes)}.
          </p>
        </>
      ) : (
        <>
          <Renglon
            rotulo={g.estado === ESTADO_TESORERIA.REQUIERE_REVISION ? "Declarado al verificar" : "Declarado"}
            nota={
              g.estado === ESTADO_TESORERIA.REQUIERE_REVISION
                ? "Foto histórica, no se recalcula"
                : "Lo que las cajas dijeron que entregaron"
            }
            valor={formatearMoneda(
              g.estado === ESTADO_TESORERIA.REQUIERE_REVISION || g.completos.length
                ? v.declaradoDeLosActos || v.entregadoDeclarado
                : v.entregadoDeclarado
            )}
            atenuado={g.estado === ESTADO_TESORERIA.REQUIERE_REVISION}
          />
          {g.completos.length || g.estado === ESTADO_TESORERIA.REQUIERE_REVISION ? (
            <>
              <Renglon rotulo="Verificado" nota={quien} valor={formatearMoneda(v.efectivoVerificado)} />
              {g.diferencia != null && (
                <Renglon
                  rotulo="Diferencia Tesorería"
                  valor={textoDeDiferencia(g.diferencia)}
                  colorValor={colorDeDiferencia(g.diferencia)}
                  notaValor={g.diferencia ? "verificado − declarado" : null}
                  fuerte={!g.diferencia}
                />
              )}
            </>
          ) : (
            <Renglon rotulo="Verificado" valor="Pendiente" atenuado />
          )}
        </>
      )}

      {g.completos.length > 0 && (
        <EnlaceTesoreria onClick={() => onVerVerificacion(g.completos[0].id)}>
          {g.completos.length === 1 ? "Ver verificación" : `Ver verificación #${g.completos[0].id}`}
        </EnlaceTesoreria>
      )}

      {puedeVerificar && hayPendientes && (
        <BotonTesoreria onClick={onVerificar}>
          {g.estado === ESTADO_TESORERIA.PARCIAL
            ? `Verificar lo pendiente · ${formatearMoneda(pendiente)}`
            : g.estado === ESTADO_TESORERIA.SIN_IMPORTE_DECLARADO
              ? `Verificar lo declarado · ${formatearMoneda(pendiente)}`
              : "Verificar efectivo"}
        </BotonTesoreria>
      )}
      {g.estado === ESTADO_TESORERIA.REQUIERE_REVISION && g.enRevision.length > 0 && (
        <BotonTesoreria tipo="secundario" onClick={() => onVerVerificacion(g.enRevision[0].id)}>
          Revisar verificación
        </BotonTesoreria>
      )}
    </SubBloque>
  );
}

// Con más de dos cajas los nombres no entran en una nota: se dice cuántas son,
// y los nombres quedan en el detalle del turno.
const MAX_CAJAS_NOMBRADAS = 2;
function nombresDeCajas(entregas) {
  return [...new Set(entregas.map((e) => e.etiquetaCaja).filter(Boolean))];
}
function cajasDe(entregas) {
  return nombresDeCajas(entregas).join(", ");
}
function notaDeCajas(entregas) {
  const cajas = nombresDeCajas(entregas);
  if (!cajas.length) return null;
  const quienes = cajas.length > MAX_CAJAS_NOMBRADAS ? `${cajas.length} cajas` : cajas.join(", ");
  return `${quienes} · ${entregas.length === 1 ? "1 entrega" : `${entregas.length} entregas`}`;
}
function quienYCuando(acto) {
  const nombre = acto?.verificadaPor?.nombre;
  return nombre ? `Contó: ${nombre}` : null;
}

/**
 * TARJETA DE TURNO (Figma 15:325). Lo cobrado declarado, el efectivo entregado,
 * lo digital del POS y el estado de su verificación. No depende de cómo arma el
 * servidor el grupo: nombra lo que llega.
 */
export function TarjetaDeTurno({ g, contexto, puedeVerificar, onVerificar, onVerCajas, onVerVerificacion }) {
  const digitales = (g.grupo.cobradoPorMedio || []).filter((m) => !m.esEfectivo);
  const sinImporte = g.sinImporte.length;
  const conEntrega = g.cajas.length - sinImporte;
  return (
    <section
      data-tarjeta-turno={g.grupo.clave}
      className={`sunmi-bg-card rounded-xl2 border p-4 space-y-2.5 ${
        g.estado === ESTADO_TESORERIA.REQUIERE_REVISION ? "sunmi-border-danger" : "sunmi-divider"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-0.5">
          <h3 className="text-base2 font-semibold sunmi-text-strong">{g.nombre}</h3>
          {contexto ? <p className="text-sm2 sunmi-text-muted">{contexto}</p> : null}
        </div>
        <InsigniaDeEstado estado={g.estado} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="flex-1 min-w-0 text-sm sunmi-text-muted">Cobrado declarado</span>
        <span className="text-lg3 font-semibold tabular-nums sunmi-text-strong">{formatearMoneda(g.cobradoDeclarado)}</span>
      </div>
      <Renglon
        rotulo="Efectivo entregado"
        nota={sinImporte ? `${conEntrega} de ${g.cajas.length} cajas` : null}
        notaValor={sinImporte ? `+ ${sinImporte === 1 ? "1 caja" : `${sinImporte} cajas`} sin importe` : null}
        valor={formatearMoneda(g.grupo.efectivoDeclaradoEntregado)}
      />
      {digitales.map((m) => (
        <Renglon key={m.medio} rotulo={m.rotulo} valor={formatearMoneda(m.montoDeclarado)} atenuado />
      ))}
      <VerificacionDelTurno
        g={g}
        puedeVerificar={puedeVerificar}
        onVerificar={onVerificar}
        onVerVerificacion={onVerVerificacion}
      />
      {onVerCajas ? <EnlaceTesoreria onClick={onVerCajas}>Ver cajas del turno</EnlaceTesoreria> : null}
    </section>
  );
}

/**
 * CAJA DEL TURNO (Figma 17:498). Lo que entregó, lo que cobró por POS y SU
 * diferencia de caja, que es del cajero y NO se compensa con la de otra caja.
 */
export function CajaDelTurno({ c, estado, leyenda, onVerCaja }) {
  const caja = c.caja || {};
  const digital = totalDigital(caja.cobradoPorMedio || c.cobradoPorMedio || []);
  const entregado = caja.efectivoDeclaradoEntregado ?? c.efectivoDeclaradoEntregado;
  return (
    <section data-caja-turno={c.turnoId} className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-0.5">
          <h3 className="text-base font-semibold sunmi-text-strong">{c.etiqueta}</h3>
          {caja.operadorNombre ? <p className="text-sm2 sunmi-text-muted">Operador: {caja.operadorNombre}</p> : null}
        </div>
        <InsigniaDeEstado estado={estado} />
      </div>
      <Renglon
        rotulo="Efectivo entregado"
        nota={c.entregas?.length ? notaDeEntregas(c.entregas) : null}
        valor={entregado == null ? "Sin importe declarado" : formatearMoneda(entregado)}
        atenuado={entregado == null}
      />
      {/* Sin cobros por POS no se dibuja un "$0": parecería que hubo actividad. */}
      {Number(digital) > 0 && (
        <Renglon
          rotulo="Cobrado por POS"
          nota={notaDeDigitales(caja.cobradoPorMedio || c.cobradoPorMedio || []) || null}
          valor={formatearMoneda(digital)}
          atenuado
        />
      )}
      <Renglon
        rotulo="Diferencia de caja"
        nota="Del arqueo de esta caja"
        valor={caja.diferenciaCaja == null ? "Sin arqueo" : textoDeDiferencia(caja.diferenciaCaja)}
        colorValor={colorDeDiferencia(caja.diferenciaCaja)}
        atenuado={caja.diferenciaCaja == null}
      />
      <div className="flex items-start gap-2 text-sm2">
        <p
          className={`flex-1 min-w-0 ${
            estado === ESTADO_TESORERIA.REQUIERE_REVISION ? "sunmi-text-danger" : "sunmi-text-muted"
          }`}
        >
          {leyenda}
        </p>
        {onVerCaja ? <EnlaceTesoreria onClick={onVerCaja}>Ver caja</EnlaceTesoreria> : null}
      </div>
    </section>
  );
}
