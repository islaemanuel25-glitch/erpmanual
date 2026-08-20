"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { fechaHoraAR } from "@/lib/fechas/formatearFechaHora";
import { useUser } from "@/app/context/UserContext";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";

export default function ClienteDetallePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { perfil } = useUser();
  const clienteId = Number(params.id);
  const qsLocalId = Number(searchParams.get("localId")) || null;
  const localId = qsLocalId || perfil?.localId || null;

  const [cliente, setCliente] = useState(null);
  const [tab, setTab] = useState("datos");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!localId) {
      setErrorMsg("No hay contexto operativo activo.");
      setLoading(false);
      return;
    }

    const cargarCliente = async () => {
      setLoading(true);
      setErrorMsg("");
      try {
        const res = await fetch(`/api/clientes/${clienteId}?localId=${localId}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.ok) {
          setCliente(data.cliente);
        } else {
          setErrorMsg(data.error || "Error cargando cliente");
        }
      } catch (error) {
        console.error("Error cargando cliente:", error);
        setErrorMsg("Error de conexión");
      } finally {
        setLoading(false);
      }
    };

    cargarCliente();
  }, [clienteId, localId]);

  if (loading) {
    return (
      <div className="p-2 lg:p-3 max-w-5xl mx-auto">
        <div className="text-center py-8 sunmi-text-muted">Cargando...</div>
      </div>
    );
  }

  if (errorMsg || !cliente) {
    return (
      <div className="p-2 lg:p-3 max-w-5xl mx-auto">
        <SunmiCard className="p-4">
          <div className="text-center sunmi-text-danger">{errorMsg || "Cliente no encontrado"}</div>
          <div className="mt-4 flex justify-end">
            <SunmiBackButton href="/modulos/clientes" />
          </div>
        </SunmiCard>
      </div>
    );
  }

  return (
    <div className="p-2 lg:p-3 max-w-5xl mx-auto space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Cliente: {cliente.nombre}</h1>
          <p className="text-sm sunmi-text-muted">Detalle del cliente</p>
        </div>
        <div className="flex gap-2">
          <SunmiButton
            color="cyan"
            onClick={() => {
              router.push(`/modulos/clientes?localId=${localId}&editar=${clienteId}`);
            }}
          >
            Editar
          </SunmiButton>
          <SunmiBackButton href={`/modulos/clientes?localId=${localId}`} />
        </div>
      </div>

      {/* Tabs */}
      <SunmiCard className="p-3">
        <div className="flex gap-2 border-b sunmi-divider">
          <button
            onClick={() => setTab("datos")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === "datos"
                ? "sunmi-text-link border-b-2 border-[var(--pos-link)]"
                : "sunmi-link-muted"
            }`}
          >
            Datos
          </button>
          <button
            onClick={() => setTab("ventas")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === "ventas"
                ? "sunmi-text-link border-b-2 border-[var(--pos-link)]"
                : "sunmi-link-muted"
            }`}
          >
            Ventas
          </button>
          <button
            onClick={() => setTab("cuenta-corriente")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === "cuenta-corriente"
                ? "sunmi-text-link border-b-2 border-[var(--pos-link)]"
                : "sunmi-link-muted"
            }`}
          >
            Cuenta Corriente
          </button>
          <button
            onClick={() => setTab("puntos")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === "puntos"
                ? "text-purple-400 border-b-2 border-purple-400"
                : "sunmi-link-muted"
            }`}
          >
            Puntos
          </button>
        </div>
      </SunmiCard>

      {/* Tab Content */}
      {tab === "datos" && <TabDatos cliente={cliente} />}
      {tab === "ventas" && <TabVentas clienteId={clienteId} localId={localId} />}
      {tab === "cuenta-corriente" && (
        <TabCuentaCorriente cliente={cliente} localId={localId} />
      )}
      {tab === "puntos" && (
        <TabPuntos clienteId={clienteId} localId={localId} />
      )}
    </div>
  );
}

// Tab Datos
function TabDatos({ cliente }) {
  return (
    <SunmiCard className="p-4">
      <SunmiSeparator label="Información del Cliente" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div>
          <label className="text-[11px] sunmi-text-muted mb-1 block">Nombre</label>
          <div className="text-sm font-medium">{cliente.nombre}</div>
        </div>
        <div>
          <label className="text-[11px] sunmi-text-muted mb-1 block">Estado</label>
          <SunmiBadgeEstado value={cliente.activo} />
        </div>
        <div>
          <label className="text-[11px] sunmi-text-muted mb-1 block">Documento</label>
          <div className="text-sm font-mono">{cliente.documento || "-"}</div>
        </div>
        <div>
          <label className="text-[11px] sunmi-text-muted mb-1 block">Teléfono</label>
          <div className="text-sm font-mono">{cliente.telefono || "-"}</div>
        </div>
        <div>
          <label className="text-[11px] sunmi-text-muted mb-1 block">Email</label>
          <div className="text-sm">{cliente.email || "-"}</div>
        </div>
        <div>
          <label className="text-[11px] sunmi-text-muted mb-1 block">Dirección</label>
          <div className="text-sm">{cliente.direccion || "-"}</div>
        </div>
        <div>
          <label className="text-[11px] sunmi-text-muted mb-1 block">Límite de crédito</label>
          <div className="text-sm font-mono">
            {cliente.limiteCredito != null
              ? `$${Number(cliente.limiteCredito).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "Sin límite"}
          </div>
        </div>
        <div>
          <label className="text-[11px] sunmi-text-muted mb-1 block">Descuento %</label>
          <div className="text-sm font-mono">
            {cliente.descuentoPorcentaje != null
              ? `${Number(cliente.descuentoPorcentaje)}%`
              : "Sin descuento"}
          </div>
        </div>
        <div>
          <label className="text-[11px] sunmi-text-muted mb-1 block">Lista de precios</label>
          <div className="text-sm">
            {cliente.listaPrecio?.nombre ? (
              <span>
                {cliente.listaPrecio.nombre}
                {cliente.listaPrecio.activo === false && (
                  <span className="sunmi-text-muted ml-1">(inactiva)</span>
                )}
              </span>
            ) : (
              <span className="sunmi-text-muted">Usa default</span>
            )}
          </div>
        </div>
      </div>

      {/* Etiquetas */}
      {cliente.tags && cliente.tags.length > 0 && (
        <div className="mt-4">
          <label className="text-[11px] sunmi-text-muted mb-1 block">Etiquetas</label>
          <div className="flex flex-wrap gap-1">
            {cliente.tags.map((tag) => (
              <span
                key={tag.id}
                className="text-[10px] px-2 py-0.5 rounded-full sunmi-badge-link"
              >
                {tag.nombre}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Observaciones */}
      {cliente.observaciones && (
        <div className="mt-4">
          <label className="text-[11px] sunmi-text-muted mb-1 block">Observaciones</label>
          <div className="text-sm sunmi-text-muted sunmi-surface p-3 rounded-lg">
            {cliente.observaciones}
          </div>
        </div>
      )}
    </SunmiCard>
  );
}

// Tab Ventas
function TabVentas({ clienteId, localId }) {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const cargarVentas = async () => {
      if (!localId) {
        setErrorMsg("No hay contexto operativo activo.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg("");
      try {
        const res = await fetch(`/api/clientes/${clienteId}/ventas?localId=${localId}`, {
          credentials: "include",
        });

        if (res.status === 401) {
          setErrorMsg("No autenticado");
          return;
        }

        const data = await res.json();

        if (data.ok) {
          setVentas(data.items || []);
        } else {
          setErrorMsg(data.error || "Error cargando ventas");
        }
      } catch (error) {
        console.error("Error cargando ventas:", error);
        setErrorMsg("Error de conexión");
      } finally {
        setLoading(false);
      }
    };

    cargarVentas();
  }, [clienteId, localId]);

  const formatFecha = (fechaStr) => {
    try {
      // Zona de Argentina y 24 horas: ver `lib/fechas/formatearFechaHora.js`.
      return fechaHoraAR(fechaStr);
    } catch {
      return fechaStr;
    }
  };

  const formatPrecio = (n) => {
    return Number(n).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  return (
    <SunmiCard className="p-4">
      <SunmiSeparator label="Historial de Ventas" />
      {loading ? (
        <div className="text-center py-8 sunmi-text-muted">Cargando ventas...</div>
      ) : errorMsg ? (
        <div className="text-center py-8 sunmi-text-danger sunmi-state-danger rounded px-2 py-1.5">
          {errorMsg}
        </div>
      ) : ventas.length === 0 ? (
        <div className="text-center py-8 sunmi-text-muted">Sin ventas registradas</div>
      ) : (
        <div className="overflow-x-auto mt-3">
          <SunmiTable headers={["Fecha", "Ticket", "Total", "Local"]}>
            {ventas.map((venta) => (
              <SunmiTableRow key={venta.id}>
                <td className="px-2 py-1.5 text-sm">{formatFecha(venta.fecha)}</td>
                <td className="px-2 py-1.5 font-mono text-sm">#{venta.numero}</td>
                <td className="px-2 py-1.5 font-mono text-sm sunmi-text-success">
                  ${formatPrecio(venta.total)}
                </td>
                <td className="px-2 py-1.5 text-sm">{venta.localNombre}</td>
              </SunmiTableRow>
            ))}
          </SunmiTable>
        </div>
      )}
    </SunmiCard>
  );
}

// Tab Puntos
function TabPuntos({ clienteId, localId }) {
  const [saldo, setSaldo] = useState(0);
  const [activo, setActivo] = useState(false);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const cargarPuntos = async () => {
      if (!localId) {
        setErrorMsg("No hay contexto operativo activo.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setErrorMsg("");
      try {
        const res = await fetch(`/api/clientes/${clienteId}/puntos?localId=${localId}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (data.ok) {
          setSaldo(data.saldo || 0);
          setActivo(data.activo);
          setMovimientos(data.items || []);
        } else {
          setErrorMsg(data.error || "Error cargando puntos");
        }
      } catch (error) {
        console.error("Error cargando puntos:", error);
        setErrorMsg("Error de conexión");
      } finally {
        setLoading(false);
      }
    };

    cargarPuntos();
  }, [clienteId, localId]);

  const formatFecha = (fechaStr) => {
    try {
      // Zona de Argentina y 24 horas: ver `lib/fechas/formatearFechaHora.js`.
      return fechaHoraAR(fechaStr);
    } catch {
      return fechaStr;
    }
  };

  const tipoLabel = {
    ACREDITACION: "Acreditación",
    CANJE: "Canje",
    AJUSTE: "Ajuste",
    EXPIRACION: "Expiración",
  };

  if (!activo && !loading) {
    return (
      <SunmiCard className="p-4">
        <SunmiSeparator label="Puntos de Fidelidad" />
        <div className="text-center py-8 sunmi-text-muted">
          Puntos no habilitados en este local
        </div>
      </SunmiCard>
    );
  }

  return (
    <SunmiCard className="p-4">
      <SunmiSeparator label="Puntos de Fidelidad" />

      {loading ? (
        <div className="text-center py-8 sunmi-text-muted">Cargando puntos...</div>
      ) : errorMsg ? (
        <div className="text-center py-8 sunmi-text-danger sunmi-state-danger rounded px-2 py-1.5">
          {errorMsg}
        </div>
      ) : (
        <>
          {/* Saldo */}
          <div className="rounded-lg px-4 py-3 mt-4 text-center font-bold text-lg bg-purple-500/15 text-purple-400 border border-purple-500/30">
            Saldo: {saldo} puntos
          </div>

          {/* Movimientos */}
          {movimientos.length === 0 ? (
            <div className="text-center py-8 sunmi-text-muted mt-4">Sin movimientos</div>
          ) : (
            <div className="overflow-x-auto mt-4">
              <SunmiTable
                headers={["Fecha", "Tipo", "Dirección", "Puntos", "Nota"]}
              >
                {movimientos.map((mov) => (
                  <SunmiTableRow key={mov.id}>
                    <td className="px-2 py-1.5 text-sm">{formatFecha(mov.createdAt)}</td>
                    <td className="px-2 py-1.5 text-sm">{tipoLabel[mov.tipo] || mov.tipo}</td>
                    <td className="px-2 py-1.5 text-sm">
                      {mov.direccion === "CREDITO" ? "+" : "-"}
                    </td>
                    <td
                      className={`px-2 py-1.5 font-mono text-sm ${
                        mov.direccion === "CREDITO" ? "sunmi-text-success" : "sunmi-text-danger"
                      }`}
                    >
                      {mov.puntos}
                    </td>
                    <td className="px-2 py-1.5 text-sm">{mov.nota || "-"}</td>
                  </SunmiTableRow>
                ))}
              </SunmiTable>
            </div>
          )}
        </>
      )}
    </SunmiCard>
  );
}

// Tab Cuenta Corriente
function TabCuentaCorriente({ cliente, localId }) {
  const [movimientos, setMovimientos] = useState([]);
  const [saldo, setSaldo] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // Sub-modales
  const [mostrarPago, setMostrarPago] = useState(false);
  const [mostrarAjuste, setMostrarAjuste] = useState(false);

  // Form pago
  const [montoPago, setMontoPago] = useState("");
  const [notaPago, setNotaPago] = useState("");
  const [guardandoPago, setGuardandoPago] = useState(false);

  // Form ajuste
  const [montoAjuste, setMontoAjuste] = useState("");
  const [direccionAjuste, setDireccionAjuste] = useState("DEBITO");
  const [notaAjuste, setNotaAjuste] = useState("");
  const [guardandoAjuste, setGuardandoAjuste] = useState(false);

  const cargarCC = async () => {
    if (!localId) {
      setErrorMsg("No hay contexto operativo activo.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/clientes/${cliente.id}/cuenta-corriente?localId=${localId}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setMovimientos(data.items || []);
        setSaldo(data.saldo || 0);
      } else {
        setErrorMsg(data.error || "Error cargando cuenta corriente");
      }
    } catch (error) {
      console.error("Error cargando CC:", error);
      setErrorMsg("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarCC();
  }, [cliente.id, localId]);

  const handleRegistrarPago = async () => {
    const monto = Number(montoPago);
    if (!monto || monto <= 0) return;

    setGuardandoPago(true);
    try {
      const res = await fetch(
        `/api/clientes/${cliente.id}/cuenta-corriente/pagos?localId=${localId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ monto, nota: notaPago || null }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        setMostrarPago(false);
        setMontoPago("");
        setNotaPago("");
        cargarCC();
      } else {
        setErrorMsg(data.error || "Error registrando pago");
      }
    } catch (error) {
      console.error("Error registrando pago:", error);
      setErrorMsg("Error de conexión");
    } finally {
      setGuardandoPago(false);
    }
  };

  const handleRegistrarAjuste = async () => {
    const monto = Number(montoAjuste);
    if (!monto || monto <= 0) return;

    setGuardandoAjuste(true);
    try {
      const res = await fetch(
        `/api/clientes/${cliente.id}/cuenta-corriente/ajustes?localId=${localId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            monto,
            direccion: direccionAjuste,
            nota: notaAjuste || null,
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        setMostrarAjuste(false);
        setMontoAjuste("");
        setNotaAjuste("");
        setDireccionAjuste("DEBITO");
        cargarCC();
      } else {
        setErrorMsg(data.error || "Error registrando ajuste");
      }
    } catch (error) {
      console.error("Error registrando ajuste:", error);
      setErrorMsg("Error de conexión");
    } finally {
      setGuardandoAjuste(false);
    }
  };

  const formatFecha = (fechaStr) => {
    try {
      // Zona de Argentina y 24 horas: ver `lib/fechas/formatearFechaHora.js`.
      return fechaHoraAR(fechaStr);
    } catch {
      return fechaStr;
    }
  };

  const formatPrecio = (n) =>
    Number(n).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const tipoLabel = { VENTA: "Venta", PAGO: "Pago", AJUSTE: "Ajuste" };

  return (
    <SunmiCard className="p-4">
      <SunmiSeparator label="Cuenta Corriente" />

      {/* Saldo */}
      <div
        className={`rounded-lg px-4 py-3 mt-4 text-center font-bold text-lg ${
          saldo > 0
            ? "sunmi-state-danger sunmi-text-danger"
            : "sunmi-state-success sunmi-text-success"
        }`}
      >
        Saldo: ${formatPrecio(saldo)}
        <span className="text-xs font-normal ml-2">
          {saldo > 0 ? "(debe)" : saldo < 0 ? "(a favor)" : "(sin deuda)"}
        </span>
      </div>

      {/* Botones de acción */}
      <div className="flex gap-2 mt-4">
        <SunmiButton
          color="amber"
          onClick={() => {
            setMostrarPago(!mostrarPago);
            setMostrarAjuste(false);
            setErrorMsg("");
          }}
          className="flex-1"
        >
          Registrar Pago
        </SunmiButton>
        <SunmiButton
          color="cyan"
          onClick={() => {
            setMostrarAjuste(!mostrarAjuste);
            setMostrarPago(false);
            setErrorMsg("");
          }}
          className="flex-1"
        >
          Ajuste
        </SunmiButton>
      </div>

      {/* Form Pago */}
      {mostrarPago && (
        <div className="mt-4 p-3 sunmi-surface rounded-lg border sunmi-border">
          <div className="space-y-2">
            <div>
              <label className="text-[11px] sunmi-text-muted mb-1 block">Monto</label>
              <SunmiInput
                type="number"
                value={montoPago}
                onChange={(e) => setMontoPago(e.target.value)}
                placeholder="0.00"
                step="0.01"
              />
            </div>
            <div>
              <label className="text-[11px] sunmi-text-muted mb-1 block">Nota (opcional)</label>
              <SunmiInput
                type="text"
                value={notaPago}
                onChange={(e) => setNotaPago(e.target.value)}
                placeholder="Nota del pago..."
              />
            </div>
            <div className="flex gap-2">
              <SunmiButton
                color="amber"
                onClick={handleRegistrarPago}
                disabled={!montoPago || guardandoPago}
                className="flex-1"
              >
                {guardandoPago ? "Guardando..." : "Registrar"}
              </SunmiButton>
              <SunmiButton
                color="slate"
                onClick={() => {
                  setMostrarPago(false);
                  setMontoPago("");
                  setNotaPago("");
                }}
              >
                Cancelar
              </SunmiButton>
            </div>
          </div>
        </div>
      )}

      {/* Form Ajuste */}
      {mostrarAjuste && (
        <div className="mt-4 p-3 sunmi-surface rounded-lg border sunmi-border">
          <div className="space-y-2">
            <div>
              <label className="text-[11px] sunmi-text-muted mb-1 block">Monto</label>
              <SunmiInput
                type="number"
                value={montoAjuste}
                onChange={(e) => setMontoAjuste(e.target.value)}
                placeholder="0.00"
                step="0.01"
              />
            </div>
            <div>
              <label className="text-[11px] sunmi-text-muted mb-1 block">Dirección</label>
              <select
                value={direccionAjuste}
                onChange={(e) => setDireccionAjuste(e.target.value)}
                className="w-full h-11 rounded-xl px-3 text-sm sunmi-select-native"
              >
                <option value="DEBITO">Débito</option>
                <option value="CREDITO">Crédito</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] sunmi-text-muted mb-1 block">Nota (opcional)</label>
              <SunmiInput
                type="text"
                value={notaAjuste}
                onChange={(e) => setNotaAjuste(e.target.value)}
                placeholder="Nota del ajuste..."
              />
            </div>
            <div className="flex gap-2">
              <SunmiButton
                color="cyan"
                onClick={handleRegistrarAjuste}
                disabled={!montoAjuste || guardandoAjuste}
                className="flex-1"
              >
                {guardandoAjuste ? "Guardando..." : "Registrar"}
              </SunmiButton>
              <SunmiButton
                color="slate"
                onClick={() => {
                  setMostrarAjuste(false);
                  setMontoAjuste("");
                  setNotaAjuste("");
                  setDireccionAjuste("DEBITO");
                }}
              >
                Cancelar
              </SunmiButton>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mt-4 text-xs sunmi-text-danger text-center sunmi-state-danger rounded px-2 py-1.5">
          {errorMsg}
        </div>
      )}

      {/* Movimientos */}
      {loading ? (
        <div className="text-center py-8 sunmi-text-muted mt-4">Cargando movimientos...</div>
      ) : movimientos.length === 0 ? (
        <div className="text-center py-8 sunmi-text-muted mt-4">Sin movimientos</div>
      ) : (
        <div className="overflow-x-auto mt-4">
          <SunmiTable
            headers={["Fecha", "Tipo", "Monto", "Nota"]}
          >
            {movimientos.map((mov) => (
              <SunmiTableRow key={mov.id}>
                <td className="px-2 py-1.5 text-sm">{formatFecha(mov.createdAt)}</td>
                <td className="px-2 py-1.5 text-sm">{tipoLabel[mov.tipo] || mov.tipo}</td>
                <td
                  className={`px-2 py-1.5 font-mono text-sm ${
                    mov.tipo === "PAGO" || mov.direccion === "CREDITO"
                      ? "sunmi-text-success"
                      : "sunmi-text-danger"
                  }`}
                >
                  {mov.direccion === "CREDITO" ? "+" : "-"}${formatPrecio(mov.monto)}
                </td>
                <td className="px-2 py-1.5 text-sm">{mov.nota || "-"}</td>
              </SunmiTableRow>
            ))}
          </SunmiTable>
        </div>
      )}
    </SunmiCard>
  );
}

