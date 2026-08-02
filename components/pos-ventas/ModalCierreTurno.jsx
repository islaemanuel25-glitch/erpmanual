"use client";

import { useState, useEffect } from "react";
import { useOperadorContext } from "@/app/context/OperadorContext";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import {
  sugerirRepartoCierre,
  validarRepartoCierre,
  detectarFondoOmitido,
} from "@/lib/caja/cierreCaja";

function formatPrecio(n) {
  return Number(n).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Cierre de caja en TRES pasos.
 *
 * Por qué cambió: el cierre anterior mostraba el efectivo esperado ARRIBA del
 * campo de conteo. Con el número a la vista pasaron las dos cosas que se ven en
 * los datos de producción: 46 turnos del depósito cerraron con el contado
 * idéntico al esperado —eso es copiar, no contar— y 17 turnos de un local
 * cerraron contando solo lo vendido, con un faltante exacto por el valor del
 * fondo de apertura.
 *
 *   Paso 1 CONTAR    → a ciegas. Se dice qué hay que contar y con cuánto abrió
 *                      el turno, pero NO el esperado.
 *   Paso 2 COMPARAR  → recién acá aparece el esperado y la diferencia. Si el
 *                      conteo tiene la forma exacta de "me olvidé el fondo", se
 *                      avisa y se ofrece volver a contar.
 *   Paso 3 ENTREGAR  → qué sale del cajón y qué queda para el próximo turno.
 *                      La suma tiene que dar el contado, sin resto.
 */
export default function ModalCierreTurno({ turno, onCerrar, onCerrado }) {
  const { requerirOperador } = useOperadorContext();
  const [paso, setPaso] = useState(1);
  const [montoReal, setMontoReal] = useState("");
  const [retirado, setRetirado] = useState("");
  const [fondoDejado, setFondoDejado] = useState("");
  const [destinoRetiro, setDestinoRetiro] = useState("");
  const [recibidoPor, setRecibidoPor] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [avisoIgnorado, setAvisoIgnorado] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch(
          `/api/pos-ventas/turnos/resumen?turnoId=${turno.id}`,
          { credentials: "include" }
        );
        const data = await res.json();
        if (data.ok) setResumen(data);
      } catch {
        console.error("Error cargando resumen");
      }
    };
    cargar();
  }, [turno.id]);

  const handleCierre = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/pos-ventas/turnos/cerrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          turnoId: turno.id,
          montoRealEfectivo: Number(montoReal),
          observaciones,
          efectivoRetirado: Number(reparto.retirado),
          fondoDejado: Number(reparto.fondoDejado),
          destinoRetiro,
          recibidoPor,
        }),
      });

      // Sin operario activo → modal de PIN encima (sin cerrar el de cierre).
      if (res.status === 428) {
        requerirOperador();
        return;
      }

      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Error al cerrar turno");
        return;
      }

      onCerrado(data.turno);
    } catch {
      setError("Error de conexion al cerrar turno");
    } finally {
      setLoading(false);
    }
  };

  if (!resumen) {
    return (
      <div className="fixed inset-0 sunmi-pos-overlay flex items-center justify-center p-4 z-50">
        <SunmiCard className="w-full max-w-md p-4 text-center py-8">
          <span className="text-sm sunmi-pos-muted">
            Cargando resumen del turno...
          </span>
        </SunmiCard>
      </div>
    );
  }

  const totalIngresos = Number(resumen.totalIngresosCaja) || 0;
  const totalRetiros = Number(resumen.totalRetirosCaja) || 0;
  const montoInicial = Number(turno.montoInicial) || 0;

  // El esperado lo calcula el BACKEND (lib/caja/efectivoEsperado) y viene en la
  // respuesta de turnos/resumen. El `??` es compatibilidad hacia atrás para una
  // pestaña con bundle viejo; el valor que se persiste siempre lo recalcula el
  // backend al confirmar.
  const esperado =
    resumen.efectivoEsperado != null
      ? Number(resumen.efectivoEsperado)
      : montoInicial + Number(resumen.totalEfectivo) + totalIngresos - totalRetiros;

  const contado = Number(montoReal) || 0;
  const diferencia = montoReal ? contado - esperado : 0;
  const cuadrada = Math.abs(diferencia) < 0.01;

  const aviso = montoReal
    ? detectarFondoOmitido({
        contado,
        montoInicial,
        ventasEfectivo: Number(resumen.totalEfectivo) || 0,
        ingresos: totalIngresos,
        retiros: totalRetiros,
        efectivoEsperado: esperado,
      })
    : { omitido: false, mensaje: null };

  const sugerido = sugerirRepartoCierre({ contado, montoInicial });
  const reparto = {
    retirado: retirado === "" ? sugerido.retirado : Number(retirado) || 0,
    fondoDejado: fondoDejado === "" ? sugerido.fondoDejado : Number(fondoDejado) || 0,
  };
  const repartoOk = validarRepartoCierre({ contado, ...reparto });

  // Al escribir uno de los dos montos, el otro se completa solo: la suma tiene
  // que dar el contado y hacer esa resta a mano es una fuente de errores.
  const cambiarRetirado = (v) => {
    setRetirado(v);
    const n = Number(v);
    setFondoDejado(v === "" ? "" : String(Math.max(0, Math.round((contado - (Number.isFinite(n) ? n : 0)) * 100) / 100)));
  };
  const cambiarFondo = (v) => {
    setFondoDejado(v);
    const n = Number(v);
    setRetirado(v === "" ? "" : String(Math.max(0, Math.round((contado - (Number.isFinite(n) ? n : 0)) * 100) / 100)));
  };

  const Paso = ({ n, titulo }) => (
    <div className="flex items-center gap-1.5">
      <span
        className={`grid place-items-center w-6 h-6 rounded-full text-xs font-bold ${
          paso === n ? "sunmi-pos-btn-primary" : paso > n ? "sunmi-pos-text-success" : "sunmi-pos-muted"
        }`}
      >
        {paso > n ? "✓" : n}
      </span>
      <span className={`text-xs ${paso === n ? "font-bold" : "sunmi-pos-muted"}`}>{titulo}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 sunmi-pos-overlay flex items-center justify-center p-4 z-50 overflow-y-auto">
      <SunmiCard className="w-full max-w-lg p-4 my-4">
        <div className="text-center mb-3">
          <h2 className="text-xl font-bold">Cierre de Caja</h2>
          <div className="text-sm sunmi-pos-muted mt-1">
            Turno #{turno.id} &bull; {new Date(turno.apertura).toLocaleString("es-AR")}
          </div>
        </div>

        <div className="flex items-center justify-between gap-1 mb-4 px-1">
          <Paso n={1} titulo="Contar" />
          <span className="flex-1 h-px sunmi-pos-panel" />
          <Paso n={2} titulo="Comparar" />
          <span className="flex-1 h-px sunmi-pos-panel" />
          <Paso n={3} titulo="Entregar" />
        </div>

        {/* ── PASO 1: CONTAR (a ciegas) ─────────────────────────────────── */}
        {paso === 1 && (
          <>
            <div className="sunmi-pos-panel p-3 rounded-lg mb-4">
              <div className="text-base font-bold mb-1">
                Contá TODO el efectivo físico que hay en el cajón, incluido el fondo inicial.
              </div>
              <div className="text-sm sunmi-pos-muted">
                Este turno abrió con{" "}
                <span className="font-bold sunmi-pos-text-accent">${formatPrecio(montoInicial)}</span>.
                Ese dinero también se cuenta.
              </div>
              <div className="text-[12px] sunmi-pos-muted mt-2">
                No cuentes lo cobrado con Mercado Pago, débito ni crédito: esa plata no está en el cajón.
              </div>
            </div>

            <div className="mb-4">
              <label className="text-sm sunmi-pos-muted mb-1 block font-semibold">
                Dinero en el cajón
              </label>
              <SunmiInput
                type="number"
                step="0.01"
                min="0"
                value={montoReal}
                onChange={(e) => { setMontoReal(e.target.value); setRetirado(""); setFondoDejado(""); setAvisoIgnorado(false); }}
                placeholder="0.00"
                className="text-3xl !text-center min-h-16"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <SunmiButton color="slate" onClick={onCerrar} disabled={loading} className="flex-1 !py-3">
                Cancelar
              </SunmiButton>
              <SunmiButton
                color="amber"
                onClick={() => setPaso(2)}
                disabled={!montoReal}
                className="flex-1 !py-3 !font-bold"
              >
                Continuar
              </SunmiButton>
            </div>
          </>
        )}

        {/* ── PASO 2: COMPARAR ──────────────────────────────────────────── */}
        {paso === 2 && (
          <>
            <div className="sunmi-pos-panel p-3 rounded-lg mb-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="sunmi-pos-muted">Fondo con el que abrió</span>
                <span>${formatPrecio(montoInicial)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="sunmi-pos-muted">+ Ventas cobradas en efectivo</span>
                <span className="sunmi-pos-text-success">+${formatPrecio(resumen.totalEfectivo)}</span>
              </div>
              {totalIngresos > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="sunmi-pos-muted">+ Ingresos de caja</span>
                  <span className="sunmi-pos-text-success">+${formatPrecio(totalIngresos)}</span>
                </div>
              )}
              {totalRetiros > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="sunmi-pos-muted">− Retiros ya registrados</span>
                  <span className="sunmi-pos-text-danger">−${formatPrecio(totalRetiros)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold border-t pt-1" style={{ borderColor: "var(--pos-panel-border)" }}>
                <span>Efectivo esperado</span>
                <span className="sunmi-pos-text-accent">${formatPrecio(esperado)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold">
                <span>Efectivo contado</span>
                <span>${formatPrecio(contado)}</span>
              </div>
            </div>

            <div
              className="p-3 rounded-lg mb-3 text-center sunmi-pos-panel"
              style={!cuadrada && diferencia < 0 ? { background: "color-mix(in srgb, var(--pos-danger) 15%, transparent)", border: "1px solid var(--pos-danger)" } : undefined}
            >
              <div className="text-xs mb-1">
                {cuadrada ? "La caja cuadra" : diferencia > 0 ? "Sobra dinero en el cajón" : "Falta dinero en el cajón"}
              </div>
              <div
                className={`text-3xl font-bold ${
                  cuadrada ? "sunmi-pos-text-success" : diferencia > 0 ? "sunmi-pos-text-accent" : "sunmi-pos-text-danger"
                }`}
              >
                {diferencia > 0 ? "+" : ""}${formatPrecio(diferencia)}
              </div>
            </div>

            {/* Fondo inicial omitido: el patrón exacto, no una tolerancia. */}
            {aviso.omitido && !avisoIgnorado && (
              <div
                className="p-3 rounded-lg mb-3"
                style={{ background: "color-mix(in srgb, var(--pos-accent) 12%, transparent)", border: "1px solid var(--pos-accent)" }}
              >
                <div className="text-sm font-bold mb-1">{aviso.mensaje}</div>
                <div className="text-[12px] sunmi-pos-muted mb-2">
                  Contaste ${formatPrecio(contado)}, que es exactamente lo que vendiste en efectivo.
                  Si sumás el fondo de ${formatPrecio(aviso.fondoInicial)}, la caja cierra en{" "}
                  ${formatPrecio(aviso.esperadoSiIncluye)}.
                </div>
                <div className="flex gap-2">
                  <SunmiButton
                    color="amber"
                    onClick={() => { setPaso(1); setMontoReal(""); }}
                    className="flex-1 !py-2 !text-sm !font-bold"
                  >
                    Volver a contar
                  </SunmiButton>
                  <SunmiButton color="slate" onClick={() => setAvisoIgnorado(true)} className="flex-1 !py-2 !text-sm">
                    Confirmar igualmente
                  </SunmiButton>
                </div>
              </div>
            )}

            <div className="mb-3">
              <label className="text-sm sunmi-pos-muted mb-1 block">Observaciones (opcional)</label>
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej: faltante por error en un vuelto"
                className="w-full sunmi-input text-sm resize-none"
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              <SunmiButton color="slate" onClick={() => setPaso(1)} disabled={loading} className="flex-1 !py-3">
                Volver
              </SunmiButton>
              <SunmiButton
                color="amber"
                onClick={() => setPaso(3)}
                disabled={aviso.omitido && !avisoIgnorado}
                className="flex-1 !py-3 !font-bold"
              >
                Continuar
              </SunmiButton>
            </div>
          </>
        )}

        {/* ── PASO 3: ENTREGAR Y DEJAR FONDO ────────────────────────────── */}
        {paso === 3 && (
          <>
            <div className="sunmi-pos-panel p-3 rounded-lg mb-3">
              <div className="text-base font-bold mb-1">¿Qué hacemos con el efectivo contado?</div>
              <div className="flex justify-between text-sm mt-2">
                <span className="sunmi-pos-muted">Efectivo contado</span>
                <span className="font-bold text-lg">${formatPrecio(contado)}</span>
              </div>
              <div className="text-[12px] sunmi-pos-muted mt-1">
                Lo que se retira sale del cajón y queda registrado. Lo que queda es el fondo con el que
                abre el próximo turno.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-sm sunmi-pos-muted mb-1 block font-semibold">Se retira</label>
                <SunmiInput
                  type="number"
                  step="0.01"
                  min="0"
                  value={retirado === "" ? String(sugerido.retirado) : retirado}
                  onChange={(e) => cambiarRetirado(e.target.value)}
                  className="text-xl !text-center"
                />
              </div>
              <div>
                <label className="text-sm sunmi-pos-muted mb-1 block font-semibold">Queda de fondo</label>
                <SunmiInput
                  type="number"
                  step="0.01"
                  min="0"
                  value={fondoDejado === "" ? String(sugerido.fondoDejado) : fondoDejado}
                  onChange={(e) => cambiarFondo(e.target.value)}
                  className="text-xl !text-center"
                />
              </div>
            </div>

            <div
              className={`text-xs text-center rounded px-2 py-1.5 mb-3 ${repartoOk.valido ? "sunmi-pos-panel" : ""}`}
              style={!repartoOk.valido ? { background: "color-mix(in srgb, var(--pos-danger) 12%, transparent)", border: "1px solid var(--pos-danger)" } : undefined}
            >
              {repartoOk.valido
                ? `Se retira $${formatPrecio(reparto.retirado)} y quedan $${formatPrecio(reparto.fondoDejado)} para el próximo turno.`
                : repartoOk.error}
            </div>

            {reparto.retirado > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-sm sunmi-pos-muted mb-1 block">¿A dónde va? (opcional)</label>
                  <SunmiInput
                    value={destinoRetiro}
                    onChange={(e) => setDestinoRetiro(e.target.value)}
                    placeholder="Ej: caja fuerte"
                    className="!text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm sunmi-pos-muted mb-1 block">¿Quién lo recibe? (opcional)</label>
                  <SunmiInput
                    value={recibidoPor}
                    onChange={(e) => setRecibidoPor(e.target.value)}
                    placeholder="Nombre"
                    className="!text-sm"
                  />
                </div>
              </div>
            )}

            {error && (
              <div
                className="text-xs sunmi-pos-text-danger text-center rounded px-2 py-1.5 mb-3"
                style={{ background: "color-mix(in srgb, var(--pos-danger) 10%, transparent)", border: "1px solid var(--pos-danger)" }}
              >
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <SunmiButton color="slate" onClick={() => setPaso(2)} disabled={loading} className="flex-1 !py-3">
                Volver
              </SunmiButton>
              <SunmiButton
                color="amber"
                onClick={handleCierre}
                disabled={loading || !repartoOk.valido}
                className="flex-1 !py-3 !font-bold"
              >
                {loading ? "Cerrando..." : "Cerrar Turno"}
              </SunmiButton>
            </div>
          </>
        )}
      </SunmiCard>
    </div>
  );
}
