"use client";

// Circuito del dinero físico de un turno: de dónde vino el cambio con el que
// abrió, qué pasó adentro, qué salió del local y qué pasó al turno siguiente.
//
// LA PREGUNTA QUE RESPONDE
//
// "De toda la plata que tocó este cajón, ¿cuánta se fue de verdad?"
//
// Y la respuesta separa tres cosas que parecen iguales: los retiros de
// recaudación y el retiro final SALIERON del local; el cambio dejado NO —se
// quedó en el cajón para que el turno siguiente pueda dar vuelto—. Sumar el
// cambio a "dinero retirado" inflaría la recaudación por plata que nunca se fue,
// y contarlo otra vez como ingreso del turno siguiente la duplicaría.
//
// LAS DOS FUENTES, Y POR QUÉ CONVIVEN
//
// Los turnos nuevos traspasan el cambio por CambioPendiente, con vínculo de id.
// Los turnos viejos usaban la cadena `fondoOrigenTurnoId`, que quedó desactivada
// —adivinaba qué cierre correspondía a qué cajón— pero cuyos datos históricos
// siguen ahí. Se leen las dos: primero el relevo real, y si no hay, los campos
// viejos, para que un turno de julio se siga viendo como se veía.
//
// REGLA DE PRESENTACIÓN: `null` y `0` NO son lo mismo y no se muestran igual.
//   · null → nadie registró esto. Se muestra "—".
//   · 0 → alguien decidió explícitamente que era cero. Se muestra "$0".
//
// Móvil: cards apiladas. Escritorio: dos columnas.

import SunmiCard from "@/components/sunmi/SunmiCard";
import Link from "next/link";
import { armarCircuito, verificarCircuito, etiquetaEstadoCambio } from "@/lib/caja/circuitoDinero";
import { DesgloseResumido } from "@/components/caja/PanelesApertura";

const fmt = (n) =>
  Number(n ?? 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const hhmm = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
};

/** Importe que distingue ausencia de cero. */
function Monto({ valor, clase = "" }) {
  if (valor === null || valor === undefined) {
    return <span className="sunmi-text-muted" title="Este turno no registra este dato">—</span>;
  }
  return <span className={clase}>${fmt(valor)}</span>;
}

function Dato({ etiqueta, children, ayuda }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b sunmi-divider last:border-0">
      <div className="min-w-0">
        <div className="text-[12px] sunmi-text-muted leading-tight">{etiqueta}</div>
        {ayuda && <div className="text-[11px] sunmi-text-muted opacity-70 leading-tight">{ayuda}</div>}
      </div>
      <div className="text-sm font-semibold shrink-0 text-right">{children}</div>
    </div>
  );
}

function EnlaceTurno({ id }) {
  if (!id) return <span className="sunmi-text-muted">—</span>;
  return (
    <Link href={`/modulos/turnos/${id}`} className="sunmi-text-link underline">
      #{id}
    </Link>
  );
}

export default function CircuitoDelDinero({ turno, resumen = null }) {
  if (!turno) return null;

  const t = turno;
  const relevo = resumen?.relevo ?? null;
  const c = armarCircuito({
    turno,
    resumen,
    cambioRecibido: relevo?.cambioRecibido ?? null,
    cambioDejado: relevo?.cambioDejado ?? null,
    corte: relevo?.corte ?? null,
  });
  const verificacion = verificarCircuito(c);

  // Compatibilidad: turnos que usaron la cadena vieja de fondo, hoy desactivada.
  const hayViejo =
    t.fondoSugeridoApertura != null || t.fondoRecibidoApertura != null || t.fondoOrigenTurnoId != null;

  if (c.historico && !hayViejo) {
    return (
      <SunmiCard>
        <h3 className="text-sm font-bold mb-1">Circuito del dinero</h3>
        <p className="text-[12px] sunmi-text-muted">
          Este turno es anterior al circuito de entrega y cambio, así que no registra cuánto se
          retiró ni cuánto quedó en el cajón. Sus cifras de caja no cambiaron.
        </p>
      </SunmiCard>
    );
  }

  const difVieja = t.diferenciaFondoApertura;
  const tono = (n) =>
    n == null || Number(n) === 0 ? "" : Number(n) > 0 ? "sunmi-text-warning" : "sunmi-text-danger";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* ── 1. CON QUÉ ABRIÓ ── */}
        <SunmiCard>
          <h3 className="text-sm font-bold mb-2">Al abrir</h3>

          <Dato etiqueta="Monto inicial" ayuda="Lo que el operador contó de verdad">
            <Monto valor={c.apertura.montoInicial} clase="sunmi-text-strong" />
          </Dato>

          {c.apertura.vieneDeCambio ? (
            <>
              <Dato etiqueta="Viene del cambio que dejó el turno">
                <EnlaceTurno id={c.apertura.turnoOrigenId} />
              </Dato>
              <Dato etiqueta="Lo dejó">
                {c.apertura.operadorEntrego || <span className="sunmi-text-muted">—</span>}
              </Dato>
              <Dato etiqueta="Lo recibió">
                {c.apertura.operadorRecibio || <span className="sunmi-text-muted">—</span>}
              </Dato>
              <Dato etiqueta="Total declarado por el cierre anterior">
                <Monto valor={c.apertura.totalDeclarado} />
              </Dato>
              <Dato etiqueta="Total contado al recibir">
                <Monto valor={c.apertura.totalRecibido} />
              </Dato>
              <Dato etiqueta="Diferencia de recepción">
                <Monto valor={c.apertura.diferencia} clase={tono(c.apertura.diferencia)} />
              </Dato>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <div className="sunmi-surface-soft rounded px-2 py-1.5">
                  <div className="text-[11px] sunmi-text-muted mb-1">Denominaciones declaradas</div>
                  <DesgloseResumido desglose={c.apertura.desgloseDeclarado} />
                </div>
                <div className="sunmi-surface-soft rounded px-2 py-1.5">
                  <div className="text-[11px] sunmi-text-muted mb-1">Denominaciones recibidas</div>
                  <DesgloseResumido desglose={c.apertura.desgloseRecibido} />
                </div>
              </div>

              {c.apertura.motivoDiferencia && (
                <div className="mt-2 text-[12px] sunmi-state-warning sunmi-text-warning rounded px-2 py-1.5">
                  <span className="opacity-80">Motivo de la diferencia: </span>
                  {c.apertura.motivoDiferencia}
                </div>
              )}
            </>
          ) : hayViejo ? (
            <>
              {/* Cadena vieja de fondo: se muestra tal cual para que un turno
                  histórico se siga leyendo como siempre. */}
              <Dato etiqueta="Fondo que dejó el cierre anterior" ayuda="Cadena anterior, hoy desactivada">
                <Monto valor={t.fondoSugeridoApertura} />
              </Dato>
              <Dato etiqueta="Fondo realmente recibido">
                <Monto valor={t.fondoRecibidoApertura} />
              </Dato>
              <Dato etiqueta="Diferencia de recepción">
                <Monto valor={difVieja} clase={tono(difVieja)} />
              </Dato>
              <Dato etiqueta="Viene del turno">
                <EnlaceTurno id={t.fondoOrigenTurnoId} />
              </Dato>
            </>
          ) : (
            <Dato etiqueta="Origen del cambio" ayuda="No vino de un cierre anterior">
              <span className="sunmi-text-muted text-[12px] font-normal">
                {c.apertura.observacion || "Sin registrar"}
              </span>
            </Dato>
          )}
        </SunmiCard>

        {/* ── 2-5. LO QUE PASÓ ADENTRO ── */}
        <SunmiCard>
          <h3 className="text-sm font-bold mb-2">Durante el turno</h3>
          <Dato etiqueta="Ventas en efectivo">
            <Monto valor={c.ventasEfectivo} />
          </Dato>
          <Dato etiqueta="Ingresos manuales" ayuda="Caja +">
            <Monto valor={c.ingresosManuales} />
          </Dato>
          <Dato etiqueta="Retiros manuales" ayuda="Caja −">
            <Monto valor={c.retirosManuales} clase={c.retirosManuales ? "sunmi-text-warning" : ""} />
          </Dato>
          <Dato etiqueta="Retiros de recaudación" ayuda="Salieron del local durante el turno">
            <Monto valor={c.retirosRecaudacion} clase={c.retirosRecaudacion ? "sunmi-text-warning" : ""} />
          </Dato>
        </SunmiCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* ── 6. EL CIERRE ── */}
        <SunmiCard>
          <h3 className="text-sm font-bold mb-2">Al cerrar</h3>
          {c.cierre.corteEn && (
            <Dato etiqueta="Hora del corte" ayuda="Desde acá, lo que pase es del turno siguiente">
              <span className="font-mono tabular-nums">{hhmm(c.cierre.corteEn)}</span>
            </Dato>
          )}
          <Dato etiqueta="Efectivo esperado" ayuda={c.cierre.corteEn ? "Congelado al corte" : undefined}>
            <Monto valor={c.cierre.efectivoEsperado} />
          </Dato>
          <Dato etiqueta="Efectivo contado">
            <Monto valor={c.cierre.efectivoContado} />
          </Dato>
          <Dato etiqueta="Diferencia">
            <Monto valor={c.cierre.diferencia} clase={tono(c.cierre.diferencia)} />
          </Dato>
          <Dato etiqueta="Retiro final" ayuda="Salió del local">
            <Monto valor={c.cierre.retiroFinal} clase="sunmi-text-warning" />
          </Dato>
          {c.cierre.destino && <Dato etiqueta="Destino del retiro">{c.cierre.destino}</Dato>}
          {c.cierre.recibidoPor && <Dato etiqueta="Lo recibió">{c.cierre.recibidoPor}</Dato>}
        </SunmiCard>

        {/* ── 7-8. EL CAMBIO QUE PASÓ AL SIGUIENTE ── */}
        <SunmiCard>
          <h3 className="text-sm font-bold mb-2">Cambio para el turno siguiente</h3>
          <p className="text-[11px] sunmi-text-muted leading-snug mb-2">
            No es un gasto ni un retiro: se quedó en el cajón. Entra al circuito recién cuando el
            turno siguiente lo toma como monto inicial.
          </p>
          <Dato etiqueta="Cambio dejado">
            <Monto valor={c.cierre.cambioDejado} clase="sunmi-text-link" />
          </Dato>
          <Dato etiqueta="Estado">
            {c.cierre.estadoCambio ? (
              <span className="text-[12px] font-normal">{etiquetaEstadoCambio(c.cierre.estadoCambio)}</span>
            ) : t.fondoConsumidoEnTurnoId ? (
              <span className="text-[12px] font-normal">Recibido por el turno siguiente</span>
            ) : c.cierre.cambioDejado != null ? (
              <span className="sunmi-text-warning text-[12px] font-normal">Todavía sin tomar</span>
            ) : (
              <span className="sunmi-text-muted">—</span>
            )}
          </Dato>
          <Dato etiqueta="Lo recibió el turno">
            <EnlaceTurno id={c.cierre.turnoDestinoId ?? t.fondoConsumidoEnTurnoId} />
          </Dato>
          {c.cierre.desgloseCambio && (
            <div className="mt-2 sunmi-surface-soft rounded px-2 py-1.5">
              <div className="text-[11px] sunmi-text-muted mb-1">Denominaciones dejadas</div>
              <DesgloseResumido desglose={c.cierre.desgloseCambio} />
            </div>
          )}
        </SunmiCard>
      </div>

      {/* ── 9. LOS TOTALES, Y LA REGLA QUE LOS GOBIERNA ── */}
      <SunmiCard>
        <h3 className="text-sm font-bold mb-2">Resultado del circuito</h3>
        <Dato
          etiqueta="Dinero que salió del local"
          ayuda="Retiros manuales + retiros de recaudación + retiro final"
        >
          <Monto valor={c.totales.salioDelLocal} clase="sunmi-text-warning" />
        </Dato>
        <Dato
          etiqueta="Dinero transferido al turno siguiente"
          ayuda="No salió del local: cambió de turno"
        >
          <Monto valor={c.totales.transferidoAlSiguiente} clase="sunmi-text-link" />
        </Dato>
        {c.totales.recibidoDelAnterior != null && (
          <Dato etiqueta="Recibido del turno anterior" ayuda="Tampoco es un ingreso nuevo">
            <Monto valor={c.totales.recibidoDelAnterior} clase="sunmi-text-link" />
          </Dato>
        )}

        {/* Las igualdades que prueban que nada se contó dos veces. */}
        {verificacion.verificable && (
          <div
            className={`mt-2 rounded px-2 py-1.5 text-[11px] leading-snug ${
              verificacion.cierra
                ? "sunmi-state-success sunmi-text-success"
                : "sunmi-state-danger sunmi-text-danger"
            }`}
          >
            {verificacion.cierra ? (
              <>
                Las cuentas cierran: el esperado sale de la apertura y los movimientos, y lo contado
                se reparte sin resto entre lo retirado y el cambio.
              </>
            ) : (
              <>
                <div className="font-bold">El circuito no cierra. Revisar:</div>
                {verificacion.checks
                  .filter((x) => !x.cumple)
                  .map((x) => (
                    <div key={x.nombre}>
                      {x.nombre}: ${fmt(x.izquierda)} ≠ ${fmt(x.derecha)}
                    </div>
                  ))}
              </>
            )}
          </div>
        )}

        {t.observaciones && (
          <div className="mt-2 text-[12px] sunmi-surface-soft rounded px-2 py-1.5">
            <span className="sunmi-text-muted">Observación del cierre: </span>
            {t.observaciones}
          </div>
        )}
      </SunmiCard>
    </div>
  );
}
