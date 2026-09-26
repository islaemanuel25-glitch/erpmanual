"use client";

// components/finanzas/DetalleDeTurno.jsx
//
// UN TURNO, EXPLICADO DE ARRIBA A ABAJO.
//
// ── NINGÚN NÚMERO SE CALCULA ACÁ ──────────────────────────────────────────
//
// Todos vienen resueltos de `/api/finanzas/turno/[turnoId]`, y allá salen de
// `lib/caja/efectivoEsperado.js`, que es la fuente única del ERP para el
// efectivo esperado. Esa fórmula ya vivió tres veces copiada —en cerrar, en
// resumen y a mano adentro de un modal— y basta con que una se desincronice para
// que el cierre, el arqueo y esta pantalla informen faltantes distintos de la
// misma caja.
//
// ── NULL NO ES CERO, Y ACÁ SE NOTA ────────────────────────────────────────
//
// Los importes que persiste el cierre están en NULL mientras el turno esté
// abierto, y también en los turnos cerrados antes de que existiera el circuito
// del dinero. Dibujar un `$0,00` ahí afirmaría que se contó cero, que es
// exactamente lo contrario de "no se contó". Por eso el bloque del cierre no se
// dibuja cuando no hay conteo.

import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { formatearMoneda } from "@/lib/moneda";
import { CAJA_SIN_CONTEO } from "@/lib/caja/vistaTurno";
import { TEXTO_SIN_CONTAR, TEXTO_DIFERENCIA_NO_DISPONIBLE } from "@/lib/caja/cierreRelevo";
import { horaAR } from "@/lib/fechas/formatearFechaHora";
import { CLASE_MOVIMIENTO } from "@/lib/finanzas/movimientosDeCaja";

/** Los cuatro estados en palabras. El dato es el enum; esto es cómo se dice. */
const ESTADO_EN_PALABRAS = {
  ABIERTO: "Abierto",
  CIERRE_EN_PREPARACION: "Contando para cerrar",
  CERRADO: "Cerrado",
  ANULADO: "Anulado",
};

function Renglon({ rotulo, valor, nota = null, atenuado = false, fuerte = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div className={`text-sm3 ${atenuado ? "sunmi-text-muted" : "sunmi-text-strong"}`}>
          {rotulo}
        </div>
        {nota ? <div className="text-xs2 sunmi-text-muted">{nota}</div> : null}
      </div>
      <div
        className={`shrink-0 tabular-nums ${
          fuerte ? "text-base2 font-semibold" : "text-sm3 font-medium"
        } ${atenuado ? "sunmi-text-muted" : "sunmi-text-strong"}`}
      >
        {valor}
      </div>
    </div>
  );
}

function Bloque({ titulo, children }) {
  return (
    <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-3">
      <h2 className="text-xs2 font-semibold sunmi-text-muted tracking-wider">{titulo}</h2>
      {children}
    </section>
  );
}

export default function DetalleDeTurno({ datos, cargando = false, error = "" }) {
  if (cargando) {
    return (
      <div className="py-12">
        <SunmiLoader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border sunmi-border-danger px-4 py-3 text-xs sunmi-text-danger">
        {error}
      </div>
    );
  }

  if (!datos?.turno) return null;

  const { turno, cobros, caja, esperado, resultado, arqueos, movimientos } = datos;
  const persistido = esperado?.persistido || {};
  // "Se contó" es la pregunta, y se contesta con la PRESENCIA del dato. Un
  // `!== null` explícito y no un `if (valor)`: un conteo de cero es un conteo.
  const seConto = persistido.montoRealEfectivo !== null && persistido.montoRealEfectivo !== undefined;

  return (
    <div className="space-y-3.5">
      <section className="sunmi-bg-card rounded-xl2 border sunmi-border p-4 space-y-1">
        <div className="text-xl2 font-semibold sunmi-text-strong">
          {turno.aCargo ? `Turno ${turno.aCargo}` : "Turno"}
        </div>
        <div className="text-sm2 sunmi-text-muted">
          {turno.horario} · {ESTADO_EN_PALABRAS[turno.estado] || turno.estado}
        </div>
        <div className="text-xs2 sunmi-text-muted">
          {turno.localNombre} · turno {turno.id}
        </div>
        {turno.anulado && (
          // El turno anulado se abrió por error: no hubo plata, no hubo conteo y
          // no hubo diferencia. Sus importes de cierre están en NULL a propósito.
          <div className="text-sm2 sunmi-text-warning">
            Turno anulado. No se contó caja: sus importes de cierre quedaron sin registrar.
          </div>
        )}
      </section>

      {/* ── CÓMO SE LLEGA AL EFECTIVO ESPERADO ─────────────────────────────
          En el mismo orden en que lo suma la fórmula, para que se pueda
          comprobar renglón por renglón: fondo + efectivo + ingresos − retiros. */}
      <Bloque titulo="EFECTIVO DE LA CAJA">
        <Renglon rotulo="Fondo inicial" valor={formatearMoneda(esperado.montoInicial)} />
        <Renglon
          rotulo="Ventas en efectivo"
          nota={
            esperado.cantidadVentas === 1
              ? "1 venta en el turno"
              : `${esperado.cantidadVentas} ventas en el turno`
          }
          valor={formatearMoneda(esperado.ventasEfectivo)}
        />
        <Renglon rotulo="Ingresos de caja" valor={`+${formatearMoneda(esperado.ingresos)}`} />
        <Renglon rotulo="Retiros de caja" valor={`−${formatearMoneda(esperado.retiros)}`} />

        <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />

        <Renglon
          rotulo="Efectivo esperado"
          valor={formatearMoneda(esperado.efectivoEsperado)}
          fuerte
        />

        {seConto ? (
          <>
            <Renglon
              rotulo="Efectivo contado"
              valor={formatearMoneda(persistido.montoRealEfectivo)}
            />
            <div className="text-sm2 sunmi-text-muted">{resultado?.titulo}</div>
            {resultado?.explicacion && (
              <div className="text-xs2 sunmi-text-muted">{resultado.explicacion}</div>
            )}
          </>
        ) : resultado?.estado === CAJA_SIN_CONTEO ? (
          // CERRADO SIN CONTEO: el turno se cerró sin contar. El esperado que vale
          // es el congelado en el corte; lo contado y la diferencia no se conocen.
          <>
            <Renglon
              rotulo="Esperado al corte"
              valor={formatearMoneda(persistido.montoEsperadoEfectivo)}
            />
            <Renglon rotulo="Efectivo contado" valor={TEXTO_SIN_CONTAR} />
            <Renglon rotulo="Diferencia" valor={TEXTO_DIFERENCIA_NO_DISPONIBLE} />
            <div className="text-sm2 sunmi-text-muted">{resultado.titulo}</div>
            <div className="text-xs2 sunmi-text-muted">{resultado.explicacion}</div>
          </>
        ) : (
          // Ver el encabezado: NULL es "no se contó", no "contó cero".
          <div className="text-xs2 sunmi-text-muted">
            Todavía no se contó la caja de este turno.
          </div>
        )}
      </Bloque>

      {/* ── LOS OTROS MEDIOS ───────────────────────────────────────────────
          El efectivo esperado no los incluye —no son plata en el cajón— y por
          eso van en su propio bloque y no mezclados arriba. */}
      <Bloque titulo="OTROS MEDIOS DE COBRO">
        {(cobros?.medios || []).filter((m) => !m.esEfectivo).length === 0 ? (
          <div className="text-sm2 sunmi-text-muted">Solo hubo cobros en efectivo.</div>
        ) : (
          (cobros?.medios || [])
            .filter((m) => !m.esEfectivo)
            .map((m) => (
              <Renglon
                key={m.medio}
                rotulo={m.rotulo}
                nota={
                  !m.esCobro
                    ? "A cuenta corriente: todavía no entró"
                    : m.comision > 0
                      ? `Comisión ${formatearMoneda(m.comision)} · neto ${formatearMoneda(m.neto)}`
                      : null
                }
                valor={formatearMoneda(m.monto)}
                atenuado={!m.esCobro}
              />
            ))
        )}
      </Bloque>

      {/* ── LOS MOVIMIENTOS, UNO POR UNO ───────────────────────────────────
          Con el motivo TAL CUAL se escribió. No se interpreta: "Panadería" es
          texto que alguien tipeó, no un pago a proveedor registrado. */}
      <Bloque titulo="MOVIMIENTOS DE CAJA">
        {(movimientos || []).length === 0 ? (
          <div className="text-sm2 sunmi-text-muted">No hubo movimientos en este turno.</div>
        ) : (
          movimientos.map((m) => (
            <Renglon
              key={m.id}
              rotulo={
                m.clase === CLASE_MOVIMIENTO.RECAUDACION
                  ? "Retiro de recaudación"
                  : m.clase === CLASE_MOVIMIENTO.CIERRE
                    ? "Retiro del cierre"
                    : m.tipo === "RETIRO"
                      ? "Retiro de caja"
                      : "Ingreso de caja"
              }
              nota={`${horaAR(m.createdAt, { vacio: "—" })}${m.motivo ? ` · ${m.motivo}` : ""}`}
              valor={`${m.tipo === "RETIRO" ? "−" : "+"}${formatearMoneda(m.monto)}`}
              // Los dos automáticos se atenúan: no los cargó una persona y no
              // son plata que se gastó. El de cierre, además, NO entra en el
              // esperado de arriba — ver la ruta.
              atenuado={m.clase !== CLASE_MOVIMIENTO.MANUAL}
            />
          ))
        )}
        <div className="text-xs2 sunmi-text-muted">
          Un retiro dice que salió plata del cajón y con qué motivo se escribió. El sistema no
          registra en qué se usó.
        </div>
      </Bloque>

      {(arqueos || []).length > 0 && (
        <Bloque titulo="ARQUEOS">
          {arqueos.map((a) => (
            <Renglon
              key={a.id}
              rotulo={a.tipo === "FINAL" ? "Arqueo final" : "Arqueo parcial"}
              nota={`${horaAR(a.fechaHora, { vacio: "—" })} · esperaba ${formatearMoneda(
                a.efectivoEsperado
              )}`}
              valor={formatearMoneda(a.efectivoContado)}
            />
          ))}
        </Bloque>
      )}

      <div className="text-xs2 sunmi-text-muted">
        Este turno tuvo {formatearMoneda(caja?.ingresos)} en ingresos manuales y{" "}
        {formatearMoneda(caja?.retiros)} en retiros manuales.
      </div>
    </div>
  );
}
