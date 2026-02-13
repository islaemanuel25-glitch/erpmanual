"use client";

import { useState, useEffect } from "react";
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
  const [loading, setLoading] = useState(false);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [clienteEditar, setClienteEditar] = useState(null);

  useEffect(() => {
    cargarClientes();
  }, []);

  const cargarClientes = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/clientes/listar", {
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

  const handleEliminar = async (id) => {
    if (!confirm("Desactivar este cliente?")) return;

    try {
      const res = await fetch(`/api/clientes/eliminar/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        cargarClientes();
      }
    } catch (error) {
      console.error("Error desactivando:", error);
    }
  };

  const clientesFiltrados = clientes.filter((c) => {
    if (!busqueda) return true;
    const b = busqueda.toLowerCase();
    return (
      c.nombre.toLowerCase().includes(b) ||
      (c.documento && c.documento.includes(b)) ||
      (c.telefono && c.telefono.includes(b))
    );
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
        <SunmiInput
          type="text"
          placeholder="Buscar por nombre, documento o telefono..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full"
        />
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
              "Estado",
              "Acciones",
            ]}
          >
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-slate-400">
                  Cargando...
                </td>
              </tr>
            ) : clientesFiltrados.length === 0 ? (
              <SunmiTableEmpty colSpan={6} message="No hay clientes" />
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
                    <SunmiBadgeEstado value={cliente.activo} />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditar(cliente)}
                        className="text-cyan-400 hover:text-cyan-300 text-xs"
                      >
                        Editar
                      </button>
                      {cliente.activo && (
                        <button
                          onClick={() => handleEliminar(cliente.id)}
                          className="text-red-400 hover:text-red-300 text-xs"
                        >
                          Desactivar
                        </button>
                      )}
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
          cliente={clienteEditar}
          onCerrar={() => setMostrarModal(false)}
          onGuardado={() => {
            setMostrarModal(false);
            cargarClientes();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal crear/editar cliente
// ---------------------------------------------------------------------------
function ModalCliente({ cliente, onCerrar, onGuardado }) {
  const esEdicion = !!cliente;

  const [form, setForm] = useState({
    nombre: cliente?.nombre || "",
    documento: cliente?.documento || "",
    telefono: cliente?.telefono || "",
    email: cliente?.email || "",
    direccion: cliente?.direccion || "",
  });

  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!data.ok) {
        setErrorMsg(data.error || "Error al guardar");
        return;
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
      <SunmiCard className="w-full max-w-md p-4">
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
