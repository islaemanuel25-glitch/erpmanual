"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";

import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

import ModalRol from "@/components/roles/ModalRol";

const PAGE_SIZE = 10;

export default function RolesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // query params
  const nuevo = searchParams.get("nuevo");
  const editar = searchParams.get("editar");

  const modalOpen = nuevo || editar;

  const [editing, setEditing] = useState(null);

  const [roles, setRoles] = useState([]);
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const limpiarFiltros = () => {
    setSearch("");
    setPage(1);
  };

  // ================================
  // CARGAR ROL SI ESTAMOS EN EDITAR
  // ================================
  useEffect(() => {
    if (!editar) {
      setEditing(null);
      return;
    }

    const loadRol = async () => {
      try {
        const res = await fetch(`/api/roles/obtener?id=${editar}`, {
          credentials: "include",
        });

        const json = await res.json();

        if (json.ok && json.item) {
          setEditing(json.item);
        } else {
          setEditing(null);
        }
      } catch {
        setEditing(null);
      }
    };

    loadRol();
  }, [editar]);

  // ================================
  // CARGAR LISTADO
  // ================================
  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/roles/listar", {
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json();

      if (!json.ok || !Array.isArray(json.items)) {
        setRoles([]);
        setTotal(0);
        return;
      }

      let lista = json.items;

      // filtro search
      if (search.trim()) {
        const q = search.toLowerCase();
        lista = lista.filter((r) => r.nombre?.toLowerCase().includes(q));
      }

      setTotal(lista.length);

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE;

      setRoles(lista.slice(from, to));
    } catch {
      setRoles([]);
      setTotal(0);
    }
  }, [page, search]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  // ================================
  // ACCIONES
  // ================================
  const handleEditar = (id) => router.push(`/modulos/roles?editar=${id}`);

  const handleNuevo = () => router.push("/modulos/roles?nuevo=1");

  const handleEliminar = async (id) => {
    if (!confirm("¿Eliminar rol?")) return;

    const res = await fetch(`/api/roles/eliminar/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    const json = await res.json();

    if (!json.ok) {
      alert(json.error || "❌ Error al eliminar rol");
      return;
    }

    alert("✅ Rol eliminado");
    fetchRoles();
  };

  const handleCloseModal = () => {
    router.push("/modulos/roles");
  };

  const handleSubmit = async (payload) => {
    const isEdit = Boolean(editar);

    const url = isEdit
      ? `/api/roles/editar/${editar}`
      : `/api/roles/crear`;

    const res = await fetch(url, {
      method: isEdit ? "PUT" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!json.ok) {
      alert(json.error || "❌ Error al guardar");
      return;
    }

    alert("✅ Guardado correctamente");

    handleCloseModal();
    fetchRoles();
  };

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        {/* ====================== */}
        {/* FILTROS */}
        {/* ====================== */}
        <SunmiSeparator label="Filtros" color="amber" />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-2">
          <div className="flex flex-col md:flex-row gap-3 flex-1">
            <SunmiInput
              placeholder="Buscar rol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <SunmiButton onClick={limpiarFiltros} color="slate">
              Limpiar
            </SunmiButton>

            <SunmiButton onClick={handleNuevo} color="amber">
              ＋ Nuevo
            </SunmiButton>
          </div>
        </div>

        {/* ====================== */}
        {/* LISTADO */}
        {/* ====================== */}
        <SunmiSeparator label="Listado" color="amber" />

        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <SunmiTable>
            <thead>
              <tr className="bg-amber-400 text-slate-900 text-[12px] uppercase tracking-wide">
                <th className="px-3 py-2 text-left">Rol</th>
                <th className="px-3 py-2 text-left">Permisos</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {roles.length === 0 && (
                <SunmiTableEmpty message="No hay roles para mostrar" />
              )}

              {roles.map((r) => (
                <SunmiTableRow key={r.id}>
                  <td className="px-3 py-2">
                    <span className="text-[13px] font-medium">{r.nombre}</span>
                  </td>

                  <td className="px-3 py-2 text-[11px] text-slate-400">
                    {Array.isArray(r.permisos) ? r.permisos.join(", ") : "—"}
                  </td>

                  <td className="px-3 py-2 text-right">
                    <div className="flex gap-3 justify-end text-[15px]">
                      <button
                        onClick={() => handleEditar(r.id)}
                        className="text-amber-300 hover:text-amber-200"
                      >
                        ✏️
                      </button>

                      <button
                        onClick={() => handleEliminar(r.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </SunmiTableRow>
              ))}
            </tbody>
          </SunmiTable>
        </div>

        {/* PAGINACIÓN */}
        <div className="flex justify-between pt-4 px-2">
          <SunmiButton
            color="slate"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            « Anterior
          </SunmiButton>

          <SunmiButton
            color="slate"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente »
          </SunmiButton>
        </div>
      </SunmiCard>

      {/* ====================== */}
      {/* MODAL */}
      {/* ====================== */}
      <ModalRol
        open={modalOpen ? true : false}
        initialData={editing}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
