"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import useLocalSelector from "@/hooks/useLocalSelector";
import PantallaSeleccionLocal from "@/components/local/PantallaSeleccionLocal";
import SelectorLocalCompacto from "@/components/local/SelectorLocalCompacto";

export default function ClientesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    perfil,
    locales,
    localSeleccionado,
    localNombre,
    esAdminSinLocal,
    cargandoLocales,
    handleCambiarLocal,
  } = useLocalSelector();

  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [estadoClientes, setEstadoClientes] = useState("activos");
  const [tagFiltro, setTagFiltro] = useState("");
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [clienteEditar, setClienteEditar] = useState(null);
  const [mostrarVentas, setMostrarVentas] = useState(false);
  const [clienteVentas, setClienteVentas] = useState(null);
  const [clienteCC, setClienteCC] = useState(null);

  useEffect(() => {
    if (localSeleccionado) {
      cargarClientes();
      cargarTags();
    }
  }, [localSeleccionado, estadoClientes]);

  // Abrir modal de edición si viene el parámetro editar en la URL
  useEffect(() => {
    const editarId = Number(searchParams.get("editar"));
    
    if (editarId > 0 && clientes.length > 0 && !loading && !mostrarModal) {
      const cliente = clientes.find((c) => c.id === editarId);
      
      if (cliente) {
        setClienteEditar(cliente);
        setMostrarModal(true);
        
        // Limpiar el query param editar sin recargar
        const params = new URLSearchParams(searchParams.toString());
        params.delete("editar");
        const newUrl = params.toString()
          ? `/modulos/clientes?${params.toString()}`
          : "/modulos/clientes";
        router.replace(newUrl);
      }
    }
  }, [clientes, loading, searchParams, mostrarModal, router]);

  const cargarTags = async () => {
    if (!localSeleccionado) return;
    try {
      const res = await fetch(`/api/clientes/tags?localId=${localSeleccionado}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setTags(data.items || []);
      }
    } catch (error) {
      console.error("Error cargando tags:", error);
    }
  };

  const cargarClientes = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (localSeleccionado) {
        params.set("localId", String(localSeleccionado));
      }
      if (estadoClientes === "activos") {
        params.set("activo", "true");
      } else if (estadoClientes === "inactivos") {
        params.set("activo", "false");
      }

      const url = params.toString()
        ? `/api/clientes/listar?${params.toString()}`
        : "/api/clientes/listar";

      const res = await fetch(url, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setClientes(data.items || []);
      }
    } catch (error) {
      console.error("Error cargando clientes:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleNuevo = () => {
    setClienteEditar(null);
    setMostrarModal(true);
  };

  const handleEditar = (cliente) => {
    setClienteEditar(cliente);
    setMostrarModal(true);
  };

  const handleVerVentas = (cliente) => {
    setClienteVentas(cliente);
    setMostrarVentas(true);
  };

  const handleToggleActivo = async (cliente) => {
    const accion = cliente.activo ? "Desactivar" : "Reactivar";
    if (!confirm(`${accion} este cliente?`)) return;

    try {
      const res = await fetch(`/api/clientes/editar/${cliente.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          activo: !cliente.activo,
          localId: localSeleccionado,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        cargarClientes();
      }
    } catch (error) {
      console.error("Error actualizando estado:", error);
    }
  };

  const clientesFiltrados = clientes.filter((c) => {
    // Filtro por búsqueda
    if (busqueda) {
      const b = busqueda.toLowerCase();
      const matchBusqueda =
        c.nombre.toLowerCase().includes(b) ||
        (c.documento && c.documento.includes(b)) ||
        (c.telefono && c.telefono.includes(b));
      if (!matchBusqueda) return false;
    }

    // Filtro por etiqueta
    if (tagFiltro) {
      const tieneTag = c.tags?.some((t) => String(t.id) === tagFiltro);
      if (!tieneTag) return false;
    }

    return true;
  });

  if (!perfil || cargandoLocales) return null;

  if (esAdminSinLocal && !localSeleccionado) {
    return (
      <PantallaSeleccionLocal
        locales={locales}
        onSeleccionar={handleCambiarLocal}
      />
    );
  }

  return (
    <div className="p-2 lg:p-3 space-y-3 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold">Clientes</h1>
            <p className="text-sm text-slate-400">
              Gestion de clientes del sistema
            </p>
          </div>
          <SelectorLocalCompacto
            locales={locales}
            localSeleccionado={localSeleccionado}
            localNombre={localNombre}
            onChange={handleCambiarLocal}
          />
        </div>
        <SunmiButton color="amber" onClick={handleNuevo}>
          + Nuevo Cliente
        </SunmiButton>
      </div>

      {/* Busqueda */}
      <SunmiCard className="p-3">
        <div className="flex flex-col md:flex-row gap-2">
          <SunmiInput
            type="text"
            placeholder="Buscar por nombre, documento o telefono..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="flex-1"
          />
          <select
            value={tagFiltro}
            onChange={(e) => setTagFiltro(e.target.value)}
            className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
          >
            <option value="">Todas las etiquetas</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.nombre}
              </option>
            ))}
          </select>
          <select
            value={estadoClientes}
            onChange={(e) => setEstadoClientes(e.target.value)}
            className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
          >
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
      </SunmiCard>

      {/* Tabla */}
      <SunmiCard className="p-3">
        <SunmiSeparator label={`Clientes (${clientesFiltrados.length})`} />

        <div className="overflow-x-auto mt-3">
          <SunmiTable
            headers={[
              "Nombre",
              "Documento",
              "Telefono",
              "Email",
              "Etiquetas",
              "Estado",
              "Acciones",
            ]}
          >
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-400">
                  Cargando...
                </td>
              </tr>
            ) : clientesFiltrados.length === 0 ? (
              <SunmiTableEmpty colSpan={7} message="No hay clientes" />
            ) : (
              clientesFiltrados.map((cliente) => (
                <SunmiTableRow key={cliente.id}>
                  <td className="px-2 py-1.5 font-medium">{cliente.nombre}</td>
                  <td className="px-2 py-1.5 font-mono text-sm">
                    {cliente.documento || "-"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-sm">
                    {cliente.telefono || "-"}
                  </td>
                  <td className="px-2 py-1.5 text-sm">
                    {cliente.email || "-"}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {cliente.tags && cliente.tags.length > 0 ? (
                        cliente.tags.map((tag) => (
                          <span
                            key={tag.id}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                          >
                            {tag.nombre}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <SunmiBadgeEstado value={cliente.activo} />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-2">
                      <button
                        onClick={() => router.push(`/modulos/clientes/${cliente.id}?localId=${localSeleccionado}`)}
                        className="text-cyan-400 hover:text-cyan-300 text-xs font-medium"
                      >
                        Abrir
                      </button>
                      <button
                        onClick={() => setClienteCC(cliente)}
                        className="text-emerald-400 hover:text-emerald-300 text-xs"
                      >
                        Cta Cte
                      </button>
                      <button
                        onClick={() => handleVerVentas(cliente)}
                        className="text-amber-400 hover:text-amber-300 text-xs"
                      >
                        Ventas
                      </button>
                      <button
                        onClick={() => handleEditar(cliente)}
                        className="text-cyan-400 hover:text-cyan-300 text-xs"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleToggleActivo(cliente)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        {cliente.activo ? "Desactivar" : "Reactivar"}
                      </button>
                    </div>
                  </td>
                </SunmiTableRow>
              ))
            )}
          </SunmiTable>
        </div>
      </SunmiCard>

      {/* Modal */}
      {mostrarModal && (
        <ModalCliente
          key={clienteEditar?.id || "nuevo"}
          cliente={clienteEditar}
          localId={localSeleccionado}
          onCerrar={() => setMostrarModal(false)}
          onGuardado={() => {
            setMostrarModal(false);
            cargarClientes();
          }}
        />
      )}

      {/* Modal Ventas */}
      {mostrarVentas && clienteVentas && (
        <ModalVentasCliente
          cliente={clienteVentas}
          localId={localSeleccionado}
          onCerrar={() => {
            setMostrarVentas(false);
            setClienteVentas(null);
          }}
        />
      )}

      {/* Modal Cuenta Corriente */}
      {clienteCC && (
        <ModalCuentaCorriente
          cliente={clienteCC}
          localId={localSeleccionado}
          onCerrar={() => setClienteCC(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal crear/editar cliente
// ---------------------------------------------------------------------------
function ModalCliente({ cliente, localId, onCerrar, onGuardado }) {
  const esEdicion = !!cliente;

  const [form, setForm] = useState({
    nombre: cliente?.nombre || "",
    documento: cliente?.documento || "",
    telefono: cliente?.telefono || "",
    email: cliente?.email || "",
    direccion: cliente?.direccion || "",
    observaciones: cliente?.observaciones || "",
    limiteCredito: cliente?.limiteCredito != null ? String(cliente.limiteCredito) : "",
    descuentoPorcentaje: cliente?.descuentoPorcentaje != null ? String(cliente.descuentoPorcentaje) : "",
  });

  const [tags, setTags] = useState([]);
  const [tagsSeleccionados, setTagsSeleccionados] = useState(
    cliente?.tags?.map((t) => t.id) || []
  );
  const [nuevoTagNombre, setNuevoTagNombre] = useState("");
  const [creandoTag, setCreandoTag] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (localId) {
      cargarTags();
    }
  }, [localId]);

  const cargarTags = async () => {
    if (!localId) return;
    try {
      const res = await fetch(`/api/clientes/tags?localId=${localId}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setTags(data.items || []);
      }
    } catch (error) {
      console.error("Error cargando tags:", error);
    }
  };

  const handleCrearTag = async () => {
    if (!nuevoTagNombre.trim()) return;

    setCreandoTag(true);
    try {
      const res = await fetch("/api/clientes/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nombre: nuevoTagNombre.trim(), localId }),
      });

      const data = await res.json();
      if (data.ok) {
        setTags((prev) => [...prev, data.item]);
        setTagsSeleccionados((prev) => [...prev, data.item.id]);
        setNuevoTagNombre("");
      } else {
        setErrorMsg(data.error || "Error creando etiqueta");
      }
    } catch (error) {
      console.error("Error creando tag:", error);
      setErrorMsg("Error de conexión");
    } finally {
      setCreandoTag(false);
    }
  };

  const handleToggleTag = (tagId) => {
    setTagsSeleccionados((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleChange = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleGuardar = async () => {
    if (!form.nombre.trim()) {
      setErrorMsg("El nombre es obligatorio");
      return;
    }

    setErrorMsg("");
    setGuardando(true);

    try {
      const url = esEdicion
        ? `/api/clientes/editar/${cliente.id}`
        : "/api/clientes/crear";

      const res = await fetch(url, {
        method: esEdicion ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...form,
          localId,
          limiteCredito: form.limiteCredito !== "" ? form.limiteCredito : null,
          descuentoPorcentaje: form.descuentoPorcentaje !== "" ? form.descuentoPorcentaje : null,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setErrorMsg(data.error || "Error al guardar");
        return;
      }

      // Guardar tags del cliente
      const clienteId = esEdicion ? cliente.id : data.cliente?.id;
      if (clienteId && localId && tagsSeleccionados.length >= 0) {
        const resTags = await fetch(`/api/clientes/${clienteId}/tags`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tagIds: tagsSeleccionados, localId }),
        });

        const dataTags = await resTags.json();
        if (!dataTags.ok) {
          console.error("Error guardando tags:", dataTags.error);
        }
      }

      onGuardado();
    } catch (error) {
      console.error("Error guardando:", error);
      setErrorMsg("Error de conexion");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-md p-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">
            {esEdicion ? "Editar Cliente" : "Nuevo Cliente"}
          </h3>
          <button
            onClick={onCerrar}
            className="text-xl text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">
              Nombre *
            </label>
            <SunmiInput
              type="text"
              value={form.nombre}
              onChange={(e) => handleChange("nombre", e.target.value)}
              placeholder="Juan Perez"
              autoFocus
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">
              DNI / CUIT
            </label>
            <SunmiInput
              type="text"
              value={form.documento}
              onChange={(e) => handleChange("documento", e.target.value)}
              placeholder="12345678"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">
              Telefono
            </label>
            <SunmiInput
              type="text"
              value={form.telefono}
              onChange={(e) => handleChange("telefono", e.target.value)}
              placeholder="3412345678"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">
              Email
            </label>
            <SunmiInput
              type="email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="cliente@email.com"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">
              Direccion
            </label>
            <SunmiInput
              type="text"
              value={form.direccion}
              onChange={(e) => handleChange("direccion", e.target.value)}
              placeholder="Calle 123"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">
              Observaciones
            </label>
            <textarea
              value={form.observaciones}
              onChange={(e) => handleChange("observaciones", e.target.value)}
              placeholder="Notas internas del cliente..."
              className="w-full min-h-20 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">
              Límite de crédito (opcional)
            </label>
            <SunmiInput
              type="number"
              value={form.limiteCredito}
              onChange={(e) => handleChange("limiteCredito", e.target.value)}
              placeholder="0.00"
              step="0.01"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Dejar vacío para sin límite
            </p>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">
              Descuento % (opcional)
            </label>
            <SunmiInput
              type="number"
              value={form.descuentoPorcentaje}
              onChange={(e) => handleChange("descuentoPorcentaje", e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              max="100"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Dejar vacío para sin descuento
            </p>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 mb-1 block">
              Etiquetas
            </label>
            <div className="space-y-2">
              {/* Tags seleccionados */}
              <div className="flex flex-wrap gap-1">
                {tags
                  .filter((t) => tagsSeleccionados.includes(t.id))
                  .map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30"
                    >
                      {tag.nombre} ✕
                    </button>
                  ))}
              </div>

              {/* Selector de tags */}
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleToggleTag(Number(e.target.value));
                    e.target.value = "";
                  }
                }}
                className="w-full h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
              >
                <option value="">Agregar etiqueta...</option>
                {tags
                  .filter((t) => !tagsSeleccionados.includes(t.id))
                  .map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.nombre}
                    </option>
                  ))}
              </select>

              {/* Crear tag rápido */}
              <div className="flex gap-2">
                <SunmiInput
                  type="text"
                  value={nuevoTagNombre}
                  onChange={(e) => setNuevoTagNombre(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCrearTag();
                    }
                  }}
                  placeholder="Crear nueva etiqueta..."
                  className="flex-1"
                />
                <SunmiButton
                  color="cyan"
                  onClick={handleCrearTag}
                  disabled={!nuevoTagNombre.trim() || creandoTag}
                >
                  {creandoTag ? "..." : "+"}
                </SunmiButton>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="text-xs text-red-400 text-center bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
              {errorMsg}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <SunmiButton
              color="slate"
              onClick={onCerrar}
              disabled={guardando}
              className="flex-1"
            >
              Cancelar
            </SunmiButton>
            <SunmiButton
              color="amber"
              onClick={handleGuardar}
              disabled={guardando}
              className="flex-1"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </SunmiButton>
          </div>
        </div>
      </SunmiCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal historial de ventas del cliente
// ---------------------------------------------------------------------------
function ModalVentasCliente({ cliente, localId, onCerrar }) {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const cargarVentas = async () => {
      // Validar que haya localId
      if (!localId) {
        setErrorMsg("Seleccioná un local para ver el historial de ventas.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg("");
      try {
        const res = await fetch(`/api/clientes/${cliente.id}/ventas?localId=${localId}`, {
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
  }, [cliente.id, localId]);

  const formatFecha = (fechaStr) => {
    try {
      const fecha = new Date(fechaStr);
      return fecha.toLocaleDateString("es-AR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-3xl p-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold">Historial de Ventas</h3>
            <p className="text-sm text-slate-400">{cliente.nombre}</p>
          </div>
          <button
            onClick={onCerrar}
            className="text-xl text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-400">
            Cargando ventas...
          </div>
        ) : errorMsg ? (
          <div className="text-center py-8 text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
            {errorMsg}
          </div>
        ) : ventas.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            Sin ventas registradas
          </div>
        ) : (
          <div className="overflow-y-auto flex-1">
            <SunmiTable
              headers={["Fecha", "Ticket", "Total", "Local"]}
              className="text-xs"
            >
              {ventas.map((venta) => (
                <SunmiTableRow key={venta.id}>
                  <td className="px-2 py-1.5 text-sm">
                    {formatFecha(venta.fecha)}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-sm">
                    #{venta.numero}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-sm text-emerald-400">
                    ${formatPrecio(venta.total)}
                  </td>
                  <td className="px-2 py-1.5 text-sm">
                    {venta.localNombre}
                  </td>
                </SunmiTableRow>
              ))}
            </SunmiTable>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-slate-700">
          <SunmiButton color="slate" onClick={onCerrar} className="w-full">
            Cerrar
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal Cuenta Corriente
// ---------------------------------------------------------------------------
function ModalCuentaCorriente({ cliente, localId, onCerrar }) {
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
      setErrorMsg("Seleccioná un local para ver la cuenta corriente.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(
        `/api/clientes/${cliente.id}/cuenta-corriente?localId=${localId}`,
        { credentials: "include" }
      );
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
      const fecha = new Date(fechaStr);
      return fecha.toLocaleDateString("es-AR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
      <SunmiCard className="w-full max-w-3xl p-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold">Cuenta Corriente</h3>
            <p className="text-sm text-slate-400">{cliente.nombre}</p>
          </div>
          <button
            onClick={onCerrar}
            className="text-xl text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Saldo */}
        <div
          className={`rounded-lg px-4 py-3 mb-4 text-center font-bold text-lg ${
            saldo > 0
              ? "bg-red-500/15 text-red-400 border border-red-500/30"
              : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
          }`}
        >
          Saldo: ${formatPrecio(saldo)}
          <span className="text-xs font-normal ml-2">
            {saldo > 0 ? "(debe)" : saldo < 0 ? "(a favor)" : "(sin deuda)"}
          </span>
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2 mb-4">
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

        {/* Mini-form Pago */}
        {mostrarPago && (
          <SunmiCard className="p-3 mb-4">
            <p className="text-sm font-medium mb-2">Registrar Pago</p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[11px] text-slate-400 mb-1 block">
                  Monto
                </label>
                <SunmiInput
                  type="number"
                  value={montoPago}
                  onChange={(e) => setMontoPago(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] text-slate-400 mb-1 block">
                  Nota (opcional)
                </label>
                <SunmiInput
                  type="text"
                  value={notaPago}
                  onChange={(e) => setNotaPago(e.target.value)}
                  placeholder="Efectivo, transferencia..."
                />
              </div>
              <SunmiButton
                color="amber"
                onClick={handleRegistrarPago}
                disabled={guardandoPago || !montoPago}
              >
                {guardandoPago ? "..." : "Guardar"}
              </SunmiButton>
            </div>
          </SunmiCard>
        )}

        {/* Mini-form Ajuste */}
        {mostrarAjuste && (
          <SunmiCard className="p-3 mb-4">
            <p className="text-sm font-medium mb-2">Registrar Ajuste</p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[11px] text-slate-400 mb-1 block">
                  Monto
                </label>
                <SunmiInput
                  type="number"
                  value={montoAjuste}
                  onChange={(e) => setMontoAjuste(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 mb-1 block">
                  Tipo
                </label>
                <select
                  value={direccionAjuste}
                  onChange={(e) => setDireccionAjuste(e.target.value)}
                  className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm text-slate-200"
                >
                  <option value="DEBITO">Debe (+deuda)</option>
                  <option value="CREDITO">Haber (-deuda)</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[11px] text-slate-400 mb-1 block">
                  Nota
                </label>
                <SunmiInput
                  type="text"
                  value={notaAjuste}
                  onChange={(e) => setNotaAjuste(e.target.value)}
                  placeholder="Motivo del ajuste..."
                />
              </div>
              <SunmiButton
                color="cyan"
                onClick={handleRegistrarAjuste}
                disabled={guardandoAjuste || !montoAjuste}
              >
                {guardandoAjuste ? "..." : "Guardar"}
              </SunmiButton>
            </div>
          </SunmiCard>
        )}

        {errorMsg && (
          <div className="text-xs text-red-400 text-center bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5 mb-3">
            {errorMsg}
          </div>
        )}

        {/* Tabla movimientos */}
        {loading ? (
          <div className="text-center py-8 text-slate-400">
            Cargando movimientos...
          </div>
        ) : movimientos.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            Sin movimientos registrados
          </div>
        ) : (
          <div className="overflow-y-auto flex-1">
            <SunmiTable
              headers={["Fecha", "Tipo", "Nota", "Debe", "Haber"]}
              className="text-xs"
            >
              {movimientos.map((m) => (
                <SunmiTableRow key={m.id}>
                  <td className="px-2 py-1.5 text-sm">
                    {formatFecha(m.createdAt)}
                  </td>
                  <td className="px-2 py-1.5 text-sm">
                    {tipoLabel[m.tipo] || m.tipo}
                  </td>
                  <td className="px-2 py-1.5 text-sm text-slate-400">
                    {m.nota || "-"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-sm text-red-400">
                    {m.direccion === "DEBITO" ? `$${formatPrecio(m.monto)}` : ""}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-sm text-emerald-400">
                    {m.direccion === "CREDITO"
                      ? `$${formatPrecio(m.monto)}`
                      : ""}
                  </td>
                </SunmiTableRow>
              ))}
            </SunmiTable>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-slate-700">
          <SunmiButton color="slate" onClick={onCerrar} className="w-full">
            Cerrar
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
