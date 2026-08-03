"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import CircuitoDelDinero from "@/components/turnos/CircuitoDelDinero";
import ArqueosDelTurno from "@/components/turnos/ArqueosDelTurno";
import { ResultadoCierre, ComoSeCalculo, PagosNoEfectivo } from "@/components/turnos/ResumenCierre";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import { showError, showSuccess } from "@/components/sunmi/SunmiToast";

const fmt = (n) =>
  n != null
    ? Number(n).toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "-";

const fmtFecha = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const fmtHora = (iso) => {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const FORMA_PAGO_LABELS = {
  efectivo: "Efectivo",
  mercadopago: "MercadoPago",
  debito: "Debito",
  credito: "Credito",
  fiado: "Fiado",
};

function imprimirZReport(turno, resumen, movimientos) {
  const totalVentas =
    (resumen.totalEfectivo || 0) + (resumen.totalDigital || 0);

  // El RETIRO DE CIERRE se separa del resto. Ocurre DESPUÉS del conteo, así que
  // no forma parte del efectivo esperado: si se sumara al resto de los retiros,
  // el comprobante imprimiría un esperado más bajo que el del arqueo FINAL y el
  // faltante que muestra el papel no coincidiría con el guardado.
  const idRetiroCierre = turno.retiroCierreMovimientoId ?? null;
  const previos = (movimientos || []).filter((m) => m.id !== idRetiroCierre);
  const totalIngresos = previos.filter((m) => m.tipo === "INGRESO").reduce((s, m) => s + m.monto, 0);
  const totalRetiros = previos.filter((m) => m.tipo === "RETIRO").reduce((s, m) => s + m.monto, 0);

  // El esperado GUARDADO manda. Solo se recalcula en turnos anteriores al
  // circuito, que no lo tienen persistido.
  const esperado =
    turno.montoEsperadoEfectivo != null
      ? Number(turno.montoEsperadoEfectivo)
      : Number(turno.montoInicial) + (resumen.totalEfectivo || 0) + totalIngresos - totalRetiros;

  let movHtml = "";
  if (previos.length > 0) {
    movHtml = `
<div class="line"></div>
<div class="center bold">MOVIMIENTOS CAJA</div>
<div class="row"><span>Ingresos:</span><span>+$${fmt(totalIngresos)}</span></div>
<div class="row"><span>Retiros:</span><span>-$${fmt(totalRetiros)}</span></div>`;
  }

  // Entrega del efectivo. Solo se imprime en turnos que pasaron por el circuito
  // nuevo: en los históricos estos campos son NULL y la sección no existe.
  const hayEntrega = turno.efectivoRetiradoCierre != null || turno.fondoDejadoCierre != null;
  const entregaHtml = hayEntrega
    ? `
<div class="line"></div>
<div class="center bold">ENTREGA DEL EFECTIVO</div>
<div class="row"><span>Se retira:</span><span>$${fmt(turno.efectivoRetiradoCierre)}</span></div>
<div class="row bold"><span>Queda de fondo:</span><span>$${fmt(turno.fondoDejadoCierre)}</span></div>
${turno.destinoRetiroCierre ? `<div class="row"><span>Destino:</span><span>${turno.destinoRetiroCierre}</span></div>` : ""}
${turno.recibidoPorCierre ? `<div class="row"><span>Recibe:</span><span>${turno.recibidoPorCierre}</span></div>` : ""}
<div class="center" style="font-size:10px;margin-top:4px;">El fondo que queda abre el proximo turno</div>`
    : "";

  const obsHtml = turno.observaciones
    ? `
<div class="line"></div>
<div class="center bold">OBSERVACIONES</div>
<div style="font-size:11px;">${String(turno.observaciones).replace(/</g, "&lt;")}</div>`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Z Report - Turno #${turno.id}</title>
<style>
  body { font-family: monospace; font-size: 12px; width: 280px; margin: 0 auto; padding: 10px; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .line { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; }
  .row span:last-child { text-align: right; }
  .big { font-size: 14px; }
  h2 { margin: 4px 0; font-size: 14px; }
</style></head><body>
<div class="center bold big">Z REPORT</div>
<div class="center">Cierre de Turno</div>
<div class="line"></div>
<div class="row"><span>Turno:</span><span>#${turno.id}</span></div>
<div class="row"><span>Local:</span><span>${turno.local?.nombre || "-"}</span></div>
<div class="row"><span>Cajero:</span><span>${turno.vendedor?.nombre || "-"}</span></div>
<div class="row"><span>Apertura:</span><span>${fmtFecha(turno.apertura)}</span></div>
<div class="row"><span>Cierre:</span><span>${fmtFecha(turno.cierre)}</span></div>
<div class="line"></div>
<div class="center bold">VENTAS</div>
<div class="row"><span>Cantidad:</span><span>${resumen.cantidadVentas || 0}</span></div>
<div class="line"></div>
<div class="row"><span>Efectivo:</span><span>$${fmt(resumen.totalEfectivo)}</span></div>
<div class="row"><span>MercadoPago:</span><span>$${fmt(resumen.desglose?.mercadopago)}</span></div>
<div class="row"><span>Debito:</span><span>$${fmt(resumen.desglose?.debito)}</span></div>
<div class="row"><span>Credito:</span><span>$${fmt(resumen.desglose?.credito)}</span></div>
<div class="row"><span>Fiado:</span><span>$${fmt(resumen.desglose?.fiado)}</span></div>
<div class="line"></div>
<div class="row bold"><span>Total ventas:</span><span>$${fmt(totalVentas)}</span></div>
${movHtml}
<div class="line"></div>
<div class="center bold">ARQUEO EFECTIVO</div>
<div class="row"><span>Monto inicial:</span><span>$${fmt(turno.montoInicial)}</span></div>
<div class="row"><span>+ Ventas efectivo:</span><span>$${fmt(resumen.totalEfectivo)}</span></div>
${totalIngresos > 0 ? `<div class="row"><span>+ Ingresos:</span><span>$${fmt(totalIngresos)}</span></div>` : ""}
${totalRetiros > 0 ? `<div class="row"><span>- Retiros:</span><span>$${fmt(totalRetiros)}</span></div>` : ""}
<div class="row bold"><span>Efectivo esperado:</span><span>$${fmt(esperado)}</span></div>
<div class="row"><span>Efectivo contado:</span><span>$${fmt(turno.montoRealEfectivo)}</span></div>
<div class="row bold"><span>Diferencia:</span><span>$${fmt(turno.diferenciaEfectivo)}</span></div>
${entregaHtml}
${obsHtml}
<div class="line"></div>
<div class="center" style="font-size:10px; margin-top:8px;">Impreso: ${new Date().toLocaleString("es-AR")}</div>
</body></html>`;

  const win = window.open("", "_blank", "width=320,height=600");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

export default function TurnoDetallePage() {
  const router = useRouter();
  const params = useParams();
  const turnoId = params?.id;

  const { perfil, cargando: cargandoUser } = useUser();
  const { loading: cargandoCtx, contexto, needsContexto } = useContextoActivo();

  const [turno, setTurno] = useState(null);
  const [ventas, setVentas] = useState([]);
  const [resumen, setResumen] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  // Secciones colapsadas por defecto: en el turno 175 son 99 ventas y 5 arqueos,
  // y abrirlos de entrada empujaba el resultado del cierre fuera de la pantalla.
  const [verVentas, setVerVentas] = useState(false);
  const [verMovimientos, setVerMovimientos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal movimiento caja
  const [modalMov, setModalMov] = useState(null); // null | "INGRESO" | "RETIRO"
  const [movMonto, setMovMonto] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  const [guardandoMov, setGuardandoMov] = useState(false);

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puedeUsar = esAdmin || permisos.includes("pos.usar");

  const cargarMovimientos = useCallback(async () => {
    if (!turnoId) return;
    try {
      const res = await fetch(
        `/api/pos-ventas/caja-movimientos/listar?turnoId=${turnoId}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.ok) setMovimientos(data.items || []);
    } catch {
      // silencioso
    }
  }, [turnoId]);

  useEffect(() => {
    if (!turnoId || !contexto?.localId) return;

    const cargar = async () => {
      setLoading(true);
      setError("");
      try {
        const [resVentas, resResumen] = await Promise.all([
          fetch(`/api/pos-ventas/turnos/ventas?turnoId=${turnoId}`, {
            credentials: "include",
          }),
          fetch(`/api/pos-ventas/turnos/resumen?turnoId=${turnoId}`, {
            credentials: "include",
          }),
        ]);

        const dataVentas = await resVentas.json();
        const dataResumen = await resResumen.json();

        if (dataVentas.ok) {
          setTurno(dataVentas.turno);
          setVentas(dataVentas.ventas || []);
        } else {
          setError(dataVentas.error || "Error cargando turno");
        }

        if (dataResumen.ok) {
          setResumen(dataResumen);
        }
      } catch (err) {
        console.error("Error cargando detalle turno:", err);
        setError("Error de conexion");
      } finally {
        setLoading(false);
      }
    };

    cargar();
    cargarMovimientos();
  }, [turnoId, contexto?.localId, cargarMovimientos]);

  const handleGuardarMovimiento = async () => {
    const montoNum = Number(movMonto);
    if (!montoNum || montoNum <= 0) {
      showError("Ingresa un monto valido");
      return;
    }

    setGuardandoMov(true);
    try {
      const res = await fetch("/api/pos-ventas/caja-movimientos/crear", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turnoId: Number(turnoId),
          tipo: modalMov,
          monto: montoNum,
          motivo: movMotivo || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showSuccess(`${modalMov === "INGRESO" ? "Ingreso" : "Retiro"} registrado`);
        setModalMov(null);
        setMovMonto("");
        setMovMotivo("");
        cargarMovimientos();
      } else {
        showError(data.error || "Error al registrar movimiento");
      }
    } catch {
      showError("Error de conexion");
    } finally {
      setGuardandoMov(false);
    }
  };

  if (cargandoUser || cargandoCtx) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }
  if (!puedeUsar) return <SinPermisos />;

  if (loading) {
    return (
      <div className="p-3">
        <SunmiLoader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 space-y-3">
        <SunmiCard>
          <p className="sunmi-text-danger">{error}</p>
          <div className="mt-3 flex justify-end">
            <SunmiBackButton href="/modulos/turnos" />
          </div>
        </SunmiCard>
      </div>
    );
  }

  if (!turno) return null;

  const estaCerrado = turno.cierre != null;
  const totalVentas =
    (resumen?.totalEfectivo || 0) + (resumen?.totalDigital || 0);

  // El RETIRO DE CIERRE se saca de estos totales. Ocurre DESPUÉS del conteo, así
  // que no forma parte del efectivo esperado: si entrara, la tarjeta "Cómo se
  // calculó" mostraría una cuenta que no cierra contra su propio total (con un
  // retiro de cierre de $70.500 se leía "− Retiros $82.500" arriba de un esperado
  // de $80.500). Se muestra aparte, en "Entrega del efectivo".
  const movimientosPrevios = movimientos.filter(
    (m) => m.id !== (turno?.retiroCierreMovimientoId ?? null)
  );
  const totalIngresos = movimientosPrevios
    .filter((m) => m.tipo === "INGRESO")
    .reduce((s, m) => s + m.monto, 0);
  const totalRetiros = movimientosPrevios
    .filter((m) => m.tipo === "RETIRO")
    .reduce((s, m) => s + m.monto, 0);

  // El esperado lo calcula el BACKEND, con la fórmula única. Esta pantalla
  // llegó a recalcularlo por su cuenta —una cuarta copia de la regla que decide
  // si falta plata— porque el endpoint devolvía el retiro de cierre descontado
  // dos veces. Ese bug se corrigió en `resumen`, así que acá ya no hace falta
  // repetir la cuenta. El `??` cubre el instante previo a que llegue la
  // respuesta y a un backend viejo que todavía no exponga el campo.
  const esperadoEfectivo =
    resumen?.efectivoEsperado ??
    Number(turno.montoInicial) + (resumen?.totalEfectivo || 0) + totalIngresos - totalRetiros;

  const ventaHeaders = [
    "#",
    "Fecha",
    "Total",
    "Forma Pago",
    "Neto Recibido",
    "Comision",
    "Costo",
    "Ganancia Neta",
  ];

  return (
    <div className="p-3 space-y-3">
      {/* Header del turno */}
      <SunmiCard>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold">
            Turno #{turno.id} - {turno.vendedor?.nombre || "-"}
          </h1>
          <div className="flex gap-2">
            <SunmiBackButton href="/modulos/turnos" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div>
            <span className="sunmi-text-muted text-xs">Apertura</span>
            <p className="font-semibold text-sm">{fmtFecha(turno.apertura)}</p>
          </div>
          <div>
            <span className="sunmi-text-muted text-xs">Cierre</span>
            <p className="font-semibold text-sm">
              {estaCerrado ? (
                fmtFecha(turno.cierre)
              ) : (
                <span className="sunmi-text-success">Abierto</span>
              )}
            </p>
          </div>
          <div>
            <span className="sunmi-text-muted text-xs">Monto Inicial</span>
            <p className="font-semibold text-sm">${fmt(turno.montoInicial)}</p>
          </div>
          <div>
            <span className="sunmi-text-muted text-xs">Cant. Ventas</span>
            <p className="font-semibold text-sm">
              {resumen?.cantidadVentas ?? turno.cantidadVentas ?? ventas.length}
            </p>
          </div>
        </div>

        {turno.observaciones && (
          <div className="mt-3">
            <span className="sunmi-text-muted text-xs">Observaciones</span>
            <p className="text-sm">{turno.observaciones}</p>
          </div>
        )}
      </SunmiCard>
      {/* 2 · RESULTADO DEL CIERRE — lo primero que se busca al abrir la pantalla. */}
      <ResultadoCierre turno={turno} />

      {/* 3 · CÓMO SE CALCULÓ — solo efectivo. */}
      {resumen && (
        <ComoSeCalculo
          turno={turno}
          resumen={resumen}
          ingresos={totalIngresos}
          retiros={totalRetiros}
        />
      )}

      {/* 4 · PAGOS QUE NO ENTRAN AL CAJÓN — secundaria; se oculta sola si no hay. */}
      {resumen && <PagosNoEfectivo resumen={resumen} />}

      {/* 5 · ENTREGA DEL EFECTIVO Y FONDO */}
      {estaCerrado && <CircuitoDelDinero turno={turno} />}

      {/* 6 · ARQUEOS — resumen; el detalle se despliega a pedido. */}
      <ArqueosDelTurno
        turnoId={turno?.id}
        movimientos={movimientos}
        montoInicial={turno?.montoInicial}
      />

      {/* 7 · MOVIMIENTOS — una línea si no hay; tabla solo si el usuario la pide.
          Una tabla vacía ocupando media pantalla era ruido puro. */}
      <SunmiCard>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-base font-bold">Movimientos de caja</h2>
          {!estaCerrado && (
            <div className="flex gap-2">
              <SunmiButton color="green" onClick={() => setModalMov("INGRESO")}>
                Ingreso
              </SunmiButton>
              <SunmiButton color="red" onClick={() => setModalMov("RETIRO")}>
                Retiro
              </SunmiButton>
            </div>
          )}
        </div>

        {movimientosPrevios.length === 0 ? (
          <p className="text-sm sunmi-text-muted mt-2">
            No se registraron ingresos ni retiros de caja durante el turno.
            {turno?.retiroCierreMovimientoId != null && " El retiro del cierre se muestra en “Entrega del efectivo”."}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <div className="text-[11px] sunmi-text-muted leading-tight">Ingresos</div>
                <div className="text-lg font-bold tabular-nums sunmi-text-success">
                  +${fmt(totalIngresos)}
                </div>
              </div>
              <div>
                <div className="text-[11px] sunmi-text-muted leading-tight">Retiros</div>
                <div className="text-lg font-bold tabular-nums sunmi-text-danger">
                  -${fmt(totalRetiros)}
                </div>
              </div>
            </div>
            <SunmiButton
              color="cyan"
              onClick={() => setVerMovimientos((v) => !v)}
              className="!w-full min-h-11 mt-3"
            >
              {verMovimientos
                ? "Ocultar movimientos"
                : `Ver movimientos de caja (${movimientosPrevios.length})`}
            </SunmiButton>

            {verMovimientos && (
              <div className="mt-3 space-y-2">
                {movimientosPrevios.map((m) => (
                  <div key={m.id} className="rounded-lg sunmi-surface-soft p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold">
                        {m.tipo === "INGRESO" ? "Ingreso" : "Retiro"}
                        <span className="ml-2 text-[11px] font-normal sunmi-text-muted">
                          {fmtHora(m.createdAt)}
                        </span>
                      </span>
                      <span
                        className={`text-base font-bold tabular-nums ${
                          m.tipo === "INGRESO" ? "sunmi-text-success" : "sunmi-text-danger"
                        }`}
                      >
                        {m.tipo === "INGRESO" ? "+" : "-"}${fmt(m.monto)}
                      </span>
                    </div>
                    {m.motivo && <p className="text-[12px] mt-1 leading-snug">{m.motivo}</p>}
                    {m.usuario?.nombre && (
                      <p className="text-[11px] sunmi-text-muted mt-0.5">{m.usuario.nombre}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </SunmiCard>

      {/* 8 · VENTAS — no se renderizan 99 filas antes del resumen. */}
      <SunmiCard>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-base font-bold">
            {ventas.length} venta{ventas.length === 1 ? "" : "s"} en este turno
          </h2>
          {ventas.length > 0 && (
            <SunmiButton color="cyan" onClick={() => setVerVentas((v) => !v)}>
              {verVentas ? "Ocultar" : "Ver ventas"}
            </SunmiButton>
          )}
        </div>

        {ventas.length === 0 && (
          <p className="text-sm sunmi-text-muted mt-2">Este turno no registró ventas.</p>
        )}

        {verVentas && ventas.length > 0 && (
          <>
            {/* Móvil: cards de una columna, sin scroll horizontal. */}
            <div className="lg:hidden mt-3 space-y-2">
              {ventas.map((v) => (
                <div key={v.id} className="rounded-lg sunmi-surface-soft p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold">
                      #{v.numero}
                      <span className="ml-2 text-[11px] font-normal sunmi-text-muted">
                        {fmtHora(v.fecha)}
                      </span>
                    </span>
                    <span className="text-base font-bold tabular-nums">${fmt(v.total)}</span>
                  </div>
                  <div className="text-[12px] sunmi-text-muted mt-0.5">
                    {FORMA_PAGO_LABELS[v.formaPago] || v.formaPago || "-"}
                    {v.cliente?.nombre ? ` · ${v.cliente.nombre}` : ""}
                  </div>
                </div>
              ))}
            </div>

            {/* Escritorio: la tabla de siempre. */}
            <div className="hidden lg:block mt-3 overflow-x-auto">
              <SunmiTable headers={ventaHeaders}>
                {ventas.map((v) => (
                  <SunmiTableRow key={v.id}>
                    <td className="px-3 py-2 text-sm">#{v.numero}</td>
                    <td className="px-3 py-2 text-sm">{fmtHora(v.fecha)}</td>
                    <td className="px-3 py-2 text-sm">{v.cliente?.nombre || "-"}</td>
                    <td className="px-3 py-2 text-sm">
                      {FORMA_PAGO_LABELS[v.formaPago] || v.formaPago || "-"}
                    </td>
                    <td className="px-3 py-2 text-sm text-right tabular-nums">${fmt(v.total)}</td>
                  </SunmiTableRow>
                ))}
              </SunmiTable>
            </div>
          </>
        )}
      </SunmiCard>

      {/* 9 · ACCIONES DE IMPRESIÓN. El Z Report se imprime; ya no se repite en
          pantalla como una cuarta copia de esperado/contado/diferencia. */}
      {estaCerrado && resumen && (
        <SunmiCard>
          <SunmiButton
            color="cyan"
            onClick={() => imprimirZReport(turno, resumen, movimientos)}
            className="!w-full min-h-12"
          >
            Imprimir Z Report
          </SunmiButton>
        </SunmiCard>
      )}

      {/* Modal ingreso/retiro */}
      {modalMov && (
        <div className="fixed inset-0 sunmi-overlay-strong flex items-center justify-center p-4 z-50">
          <SunmiCard className="w-full max-w-sm p-4">
            <h3 className="text-lg font-bold mb-3">
              {modalMov === "INGRESO" ? "Ingreso de Efectivo" : "Retiro de Efectivo"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs sunmi-text-muted">Monto</label>
                <SunmiInput
                  type="number"
                  placeholder="0.00"
                  value={movMonto}
                  onChange={(e) => setMovMonto(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs sunmi-text-muted">Motivo (opcional)</label>
                <SunmiInput
                  placeholder="Ej: cambio, pago proveedor..."
                  value={movMotivo}
                  onChange={(e) => setMovMotivo(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <SunmiButton
                color={modalMov === "INGRESO" ? "cyan" : "amber"}
                onClick={handleGuardarMovimiento}
                disabled={guardandoMov}
                className="flex-1"
              >
                {guardandoMov ? "Guardando..." : "Confirmar"}
              </SunmiButton>
              <SunmiButton
                color="slate"
                onClick={() => setModalMov(null)}
                disabled={guardandoMov}
                className="flex-1"
              >
                Cancelar
              </SunmiButton>
            </div>
          </SunmiCard>
        </div>
      )}
    </div>
  );
}
