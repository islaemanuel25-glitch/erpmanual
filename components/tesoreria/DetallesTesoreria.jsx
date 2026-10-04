"use client";

// components/tesoreria/DetallesTesoreria.jsx
//
// LOS TRES DETALLES DE TESORERÍA: un turno (Figma B 17:499, con los estados F,
// G y H), una caja (C 17:622) y una verificación (I 19:1381). Presentacionales,
// como la pantalla: todo lo que muestran viene de la lectura.
//
// Dos reglas que se ven acá y no se pueden perder:
//   · la diferencia de CAJA es del cajero y se muestra caja por caja, sin
//     sumarse ni compensarse; la diferencia de TESORERÍA es del acto de
//     verificación y se muestra entera, sin repartirse entre cajas;
//   · lo pagado desde una caja ya está descontado de su entrega: se informa
//     como incluido y no resta.

import { formatearMoneda } from "@/lib/moneda";
import { fechaLargaAR, horaAR } from "@/lib/fechas/formatearFechaHora";
import { conMayuscula } from "@/lib/transferencias/descripcionDelPeriodo";
import { VISTA_TESORERIA } from "@/lib/tesoreria/contextoTesoreria";
import {
  ESTADO_TESORERIA,
  actoPorId,
  estadoDeCaja,
  etiquetaDe,
  franjaHoraria,
  lecturaDelGrupo,
  nombreDelGrupo,
  pieDeCaja,
  presentacionDePago,
  rotuloDeEntrega,
} from "@/lib/tesoreria/pantallaTesoreria";
import { ALERTA, ESTADO_ENTREGA, etiquetaDeCaja } from "@/lib/tesoreria/lecturaTesoreria";

import {
  AvisoDeEstado,
  Bloque,
  BotonTesoreria,
  CajaDelTurno,
  CifraHero,
  EncabezadoDeDetalle,
  InsigniaDeEstado,
  NotaPunteada,
  Renglon,
  RotuloDeSeccion,
  TarjetaDeTurno,
  TarjetaHero,
  colorDeDiferencia,
  textoDeDiferencia,
} from "./PiezasTesoreria";

function NoEsta({ texto, local, onVolver }) {
  return (
    <div className="space-y-3.5">
      <EncabezadoDeDetalle titulo="Tesorería" local={local} onVolver={onVolver} />
      <div className="text-center py-12 sunmi-text-muted text-xs">{texto}</div>
    </div>
  );
}

// ── B · UN TURNO COMERCIAL ───────────────────────────────────────────────

export function DetalleDeTurno({ datos, lectura, ctx, local, onIr, onVolver, onVerificar }) {
  const g = lecturaDelGrupo(lectura, ctx.grupo);
  if (!g) return <NoEsta texto="Ese turno no está en el período elegido." local={local} onVolver={onVolver} />;

  const puedeVerificar = Boolean(datos.puedeVerificarEfectivo);
  const verVerificacion = (id) => onIr({ vista: VISTA_TESORERIA.VERIFICACION, verificacion: id, grupo: g.grupo.clave });
  const n = g.cajas.length;
  const contexto = [franjaHoraria(g.grupo.primerHecho, g.grupo.ultimoHecho), n === 1 ? "1 caja" : `${n} cajas`]
    .filter(Boolean)
    .join(" · ");
  // G: un conteo conjunto de varias cajas con diferencia se explica una vez.
  const conjunto = g.completos.find((a) => a.cantidadDeCajas > 1 && Number(a.diferencia) !== 0);
  const pendienteSinContar = !g.estado || g.estado === ESTADO_TESORERIA.PENDIENTE;

  return (
    <div className="space-y-3.5">
      <EncabezadoDeDetalle titulo={g.nombre} local={local} contexto={contexto} onVolver={onVolver} />

      {pendienteSinContar ? (
        <>
          <TarjetaHero franja={false}>
            <CifraHero rotulo="COBRADO DECLARADO DEL TURNO" valor={formatearMoneda(g.cobradoDeclarado)} />
            <Renglon rotulo="Efectivo entregado" valor={formatearMoneda(g.grupo.efectivoDeclaradoEntregado)} />
            {(g.grupo.cobradoPorMedio || [])
              .filter((m) => !m.esEfectivo)
              .map((m) => (
                <Renglon key={m.medio} rotulo={m.rotulo} nota="Cobrado por POS" valor={formatearMoneda(m.montoDeclarado)} atenuado />
              ))}
          </TarjetaHero>
          <Bloque titulo="VERIFICACIÓN DE EFECTIVO">
            <div className="flex items-center gap-2">
              <p className="flex-1 min-w-0 text-sm sunmi-text-muted">
                {g.estado ? "Nadie contó todavía este efectivo" : "No hubo entregas de efectivo en este turno"}
              </p>
              <InsigniaDeEstado estado={g.estado} />
            </div>
            {g.estado && (
              <>
                <Renglon
                  rotulo="Declarado"
                  nota="Lo que las cajas dijeron que entregaron"
                  valor={formatearMoneda(g.grupo.verificacion?.entregadoDeclarado)}
                  fuerte
                />
                <Renglon rotulo="Verificado" valor="Pendiente" atenuado />
                {puedeVerificar && g.pendientes.length > 0 && (
                  <BotonTesoreria onClick={() => onVerificar(g)}>Verificar efectivo</BotonTesoreria>
                )}
              </>
            )}
          </Bloque>
        </>
      ) : (
        <TarjetaDeTurno
          g={g}
          contexto={contexto}
          puedeVerificar={puedeVerificar}
          onVerificar={() => onVerificar(g)}
          onVerVerificacion={verVerificacion}
        />
      )}

      {conjunto && (
        <NotaPunteada>
          Las {conjunto.cantidadDeCajas} cajas se contaron juntas: {formatearMoneda(conjunto.importeVerificado)} contra{" "}
          {formatearMoneda(conjunto.importeDeclarado)} declarados. La diferencia de {textoDeDiferencia(conjunto.diferencia)} es
          de ese conteo conjunto y no se reparte entre cajas.
        </NotaPunteada>
      )}

      {g.queCruzan.length > 0 && (
        <NotaPunteada>
          {g.queCruzan.length === 1 ? "Una verificación incluye" : `${g.queCruzan.length} verificaciones incluyen`} entregas
          de otro turno o de fuera del período: se muestran enteras en su detalle y no se suman acá.
        </NotaPunteada>
      )}

      <RotuloDeSeccion>CAJAS DEL TURNO</RotuloDeSeccion>
      {g.cajas.map((c) => {
        const estado = estadoDeCaja(c, lectura.verificaciones);
        return (
          <CajaDelTurno
            key={c.turnoId}
            c={c}
            estado={estado}
            leyenda={pieDeCaja(estado, c.entregas)}
            onVerCaja={() => onIr({ vista: VISTA_TESORERIA.CAJA, caja: c.turnoId, grupo: g.grupo.clave })}
          />
        );
      })}

      {n > 1 && (
        <NotaPunteada>
          Cada diferencia de caja es de su cajero. Si una caja da −$5.000 y otra +$5.000, no se compensan: Tesorería junta
          la plata del turno, no las responsabilidades.
        </NotaPunteada>
      )}
    </div>
  );
}

// ── C · UNA CAJA ─────────────────────────────────────────────────────────

export function DetalleDeCaja({ lectura, ctx, local, onIr, onVolver }) {
  const caja = (lectura.cajas || []).find((c) => c.turnoId === ctx.caja);
  if (!caja) return <NoEsta texto="Esa caja no tiene hechos en el período elegido." local={local} onVolver={onVolver} />;

  const grupo = ctx.grupo ? (lectura.grupos || []).find((x) => x.clave === ctx.grupo) : null;
  const nombreGrupo = grupo ? nombreDelGrupo(grupo) : null;
  const entregas = caja.entregas || [];
  const estado = estadoDeCaja({ entregas, sinImporte: caja.sinImporteDeclarado }, lectura.verificaciones);
  const verificacionDe = [...new Set(entregas.map((e) => e.verificacionId).filter(Boolean))];
  const digitales = (caja.cobradoPorMedio || []).filter((m) => !m.esEfectivo);
  const efectivoVendido = (caja.cobradoPorMedio || []).find((m) => m.esEfectivo);
  const pagos = caja.pagosDesdeCaja || [];
  const contexto = [
    nombreGrupo,
    caja.operadorNombre ? `Operador ${caja.operadorNombre}` : null,
    franjaHoraria(caja.apertura, caja.cierre),
  ]
    .filter(Boolean)
    .join(" · ");
  const leyendaEstado =
    estado === ESTADO_TESORERIA.VERIFICADA
      ? `En la verificación ${verificacionDe.map((id) => `#${id}`).join(", ")}`
      : estado === ESTADO_TESORERIA.REQUIERE_REVISION
        ? "Su verificación requiere revisión"
        : nombreGrupo
          ? `Se verifica con ${nombreGrupo}`
          : "Se verifica con su turno";

  return (
    <div className="space-y-3.5">
      <EncabezadoDeDetalle titulo={etiquetaDe(caja)} local={local} contexto={contexto} onVolver={onVolver} />

      <TarjetaHero franja={false}>
        <CifraHero
          rotulo="EFECTIVO ENTREGADO"
          valor={caja.efectivoDeclaradoEntregado == null ? "Sin importe declarado" : formatearMoneda(caja.efectivoDeclaradoEntregado)}
          color={caja.efectivoDeclaradoEntregado == null ? "sunmi-text-muted" : "sunmi-text-strong"}
        />
        {estado && (
          <div className="flex items-center gap-2">
            <InsigniaDeEstado estado={estado} />
            <span className="flex-1 min-w-0 text-sm2 sunmi-text-muted">{leyendaEstado}</span>
          </div>
        )}
      </TarjetaHero>

      {(caja.alertas || []).includes(ALERTA.TURNO_ANULADO) && (
        <AvisoDeEstado tono="warning">Turno anulado: su entrega se conserva y se muestra marcada.</AvisoDeEstado>
      )}
      {(caja.alertas || []).includes(ALERTA.CAJA_SIN_CERRAR) && (
        <AvisoDeEstado tono="warning">La caja sigue abierta: su efectivo declarado todavía no está completo.</AvisoDeEstado>
      )}

      <Bloque titulo="ENTREGAS DE ESTA CAJA">
        {entregas.length ? (
          <>
            {entregas.map((e) => (
              <Renglon
                key={e.cajaMovimientoId}
                rotulo={rotuloDeEntrega(e.clase)}
                nota={[
                  horaAR(e.instante, { vacio: "" }),
                  e.estadoVerificacion === ESTADO_ENTREGA.VERIFICADA ? `verificación #${e.verificacionId}` : "pendiente de verificar",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                valor={formatearMoneda(e.montoDeclarado)}
              />
            ))}
            <div className="border-t sunmi-divider opacity-70" aria-hidden="true" />
            <Renglon rotulo="Total entregado" valor={formatearMoneda(caja.efectivoDeclaradoEntregado)} fuerte />
            <p className="text-xs2 sunmi-text-muted">
              Cada entrega se cuenta una sola vez: el arqueo y el cierre del turno repiten estos mismos importes y no se suman.
            </p>
          </>
        ) : caja.sinImporteDeclarado ? (
          <AvisoDeEstado tono="warning">
            Cerró sin conteo: no hay importe declarado. No se toma como $0 y no se puede verificar.
          </AvisoDeEstado>
        ) : (
          <p className="text-sm2 sunmi-text-muted">Esta caja no entregó efectivo en el período.</p>
        )}
      </Bloque>

      {(digitales.length > 0 || efectivoVendido) && (
        <Bloque titulo="COBRADO POR POS">
          {digitales.map((m) => (
            <Renglon key={m.medio} rotulo={m.rotulo} valor={formatearMoneda(m.montoDeclarado)} />
          ))}
          {efectivoVendido && (
            <Renglon
              rotulo="Vendido en efectivo"
              nota="Informativo: no es lo entregado"
              valor={formatearMoneda(efectivoVendido.montoDeclarado)}
              atenuado
            />
          )}
        </Bloque>
      )}

      <Bloque titulo="ARQUEO DE LA CAJA">
        <Renglon
          rotulo="Diferencia de caja"
          nota="Contado contra esperado por el POS"
          valor={caja.diferenciaCaja == null ? "Sin arqueo" : textoDeDiferencia(caja.diferenciaCaja)}
          colorValor={colorDeDiferencia(caja.diferenciaCaja)}
          atenuado={caja.diferenciaCaja == null}
        />
        <p className="text-xs2 sunmi-text-muted">
          Es responsabilidad de quien atendió la caja. No es la diferencia de Tesorería ni se compensa con otras cajas.
        </p>
      </Bloque>

      {pagos.length > 0 && (
        <Bloque titulo="PAGOS HECHOS DESDE ESTA CAJA">
          {pagos.map((p) => {
            const pres = presentacionDePago(p);
            return (
              <Renglon
                key={`${p.origen}-${p.id}`}
                rotulo={pres.rotulo}
                nota={[pres.nota, horaAR(p.fecha, { vacio: "" })].filter(Boolean).join(" · ")}
                valor={formatearMoneda(p.montoPagado)}
                notaValor="ya incluido"
                atenuado
              />
            );
          })}
          <div className="rounded-xl border border-current px-2.5 py-2 text-sm2 sunmi-text-success" data-ya-incluido>
            Ya incluido en el efectivo entregado: la caja entregó {formatearMoneda(caja.efectivoDeclaradoEntregado)} después
            de pagar. No se vuelve a restar en Tesorería.
          </div>
        </Bloque>
      )}

      {(caja.movimientosManuales || []).length > 0 && (
        <Bloque titulo="MOVIMIENTOS MANUALES DE CAJA">
          {caja.movimientosManuales.map((m) => (
            <Renglon
              key={m.cajaMovimientoId}
              rotulo={m.tipo === "INGRESO" ? "Caja +" : "Caja −"}
              nota={[horaAR(m.instante, { vacio: "" }), m.motivo].filter(Boolean).join(" · ")}
              valor={formatearMoneda(m.monto)}
              atenuado
            />
          ))}
          <p className="text-xs2 sunmi-text-muted">Sin clase de entrega ni de pago: no suman ni restan en Tesorería.</p>
        </Bloque>
      )}

      {grupo && (
        <BotonTesoreria tipo="secundario" onClick={() => onIr({ vista: VISTA_TESORERIA.TURNO, grupo: grupo.clave })}>
          Ir a {nombreGrupo}
        </BotonTesoreria>
      )}
    </div>
  );
}

// ── I · UNA VERIFICACIÓN ─────────────────────────────────────────────────

export function DetalleDeVerificacion({ datos, lectura, ctx, local, onVolver, onAnular }) {
  const acto = actoPorId(lectura, ctx.verificacion);
  if (!acto) {
    return (
      <NoEsta
        texto="Esa verificación no está vigente en el período elegido: puede haberse anulado o no tener entregas acá."
        local={local}
        onVolver={onVolver}
      />
    );
  }

  const estado = acto.desactualizada
    ? ESTADO_TESORERIA.REQUIERE_REVISION
    : Number(acto.diferencia) === 0
      ? ESTADO_TESORERIA.CORRECTO
      : ESTADO_TESORERIA.CON_DIFERENCIA;
  const grupos = (acto.grupos || [])
    .map((clave) => (lectura.grupos || []).find((x) => x.clave === clave))
    .filter(Boolean)
    .map(nombreDelGrupo);
  const cajasPorId = new Map((lectura.cajas || []).map((c) => [c.turnoId, c]));
  const nombreDeCaja = (turnoId) => {
    const c = cajasPorId.get(turnoId);
    return c ? etiquetaDe(c) : etiquetaDeCaja({ turnoId, operadorNombre: null });
  };
  const desactualizadas = new Map((acto.entregasDesactualizadas || []).map((x) => [x.cajaMovimientoId, x.motivos]));
  const cuando = acto.verificadaEn ? `${conMayuscula(fechaLargaAR(acto.verificadaEn))} · ${horaAR(acto.verificadaEn)}` : "—";
  const vigente = acto.vigente !== false && acto.estado !== "ANULADA";

  return (
    <div className="space-y-3.5">
      <EncabezadoDeDetalle
        titulo={`Verificación #${acto.id}`}
        local={local}
        contexto={[grupos.join(", "), acto.cantidadDeCajas === 1 ? "1 caja incluida" : `${acto.cantidadDeCajas} cajas incluidas`]
          .filter(Boolean)
          .join(" · ")}
        onVolver={onVolver}
      />

      <TarjetaHero franja={false}>
        <CifraHero
          rotulo="DIFERENCIA TESORERÍA"
          valor={textoDeDiferencia(acto.diferencia)}
          color={colorDeDiferencia(acto.diferencia) || "sunmi-text-strong"}
          accesorio={<InsigniaDeEstado estado={estado} />}
        />
        <Renglon rotulo="Declarado" nota="Lo que las cajas dijeron que entregaron" valor={formatearMoneda(acto.importeDeclarado)} />
        <Renglon rotulo="Verificado" nota="Lo que se contó" valor={formatearMoneda(acto.importeVerificado)} />
      </TarjetaHero>

      {acto.desactualizada && (
        <AvisoDeEstado tono="danger">
          Una entrega cambió después de verificarla. Lo verificado es la foto de ese momento: no se recalcula ni se corrige
          solo. Si hay que volver a contar, se anula y se verifica de nuevo.
        </AvisoDeEstado>
      )}
      {acto.completaEnElPeriodo === false && (
        <NotaPunteada>
          Incluye entregas fuera de este período: se muestra entera y no se suma a lo verificado del período.
        </NotaPunteada>
      )}

      <Bloque titulo="QUIÉN Y CUÁNDO">
        <Renglon rotulo="Verificó" nota="Usuario del ERP" valor={acto.verificadaPor?.nombre || "Sin dato"} />
        {acto.verificadaPorOperador ? (
          <Renglon
            rotulo="Operador"
            nota="Operador del PIN"
            valor={acto.verificadaPorOperador.nombre || `#${acto.verificadaPorOperador.id}`}
          />
        ) : null}
        <Renglon rotulo="Fecha" valor={cuando} />
        {acto.observacion ? <Renglon rotulo="Observación" nota={acto.observacion} valor="" atenuado /> : null}
      </Bloque>

      <Bloque titulo="ENTREGAS VERIFICADAS">
        {(acto.entregas || []).map((e) => {
          const motivos = desactualizadas.get(e.cajaMovimientoId);
          return (
            <Renglon
              key={e.cajaMovimientoId}
              rotulo={`${nombreDeCaja(e.turnoId)} · ${rotuloDeEntrega(e.clase).toLowerCase()}`}
              nota={[horaAR(e.instante, { vacio: "" }), motivos?.length ? "cambió después de verificar" : null]
                .filter(Boolean)
                .join(" · ")}
              notaColor={motivos?.length ? "sunmi-text-danger" : "sunmi-text-muted"}
              valor={formatearMoneda(e.montoDeclarado)}
            />
          );
        })}
        <p className="text-xs2 sunmi-text-muted">
          Es la foto de cada entrega al verificar. Si una cambia después, la verificación avisa y no se recalcula.
        </p>
      </Bloque>

      <Bloque titulo="SI HAY QUE CORREGIR">
        <p className="text-sm2 sunmi-text-muted">
          Una verificación no se edita. Si lo contado estuvo mal, o hay que corregir una entrega de caja, se anula y se vuelve
          a verificar. Mientras esté vigente, la corrección histórica de caja no puede tocar estas entregas.
        </p>
      </Bloque>

      {datos.puedeAnularVerificacion && vigente && (
        <BotonTesoreria tipo="peligro" onClick={() => onAnular(acto)}>
          Anular verificación
        </BotonTesoreria>
      )}
    </div>
  );
}
