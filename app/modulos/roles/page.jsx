"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiButtonIcon from "@/components/sunmi/SunmiButtonIcon";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";

import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

import { Pencil, Trash2 } from "lucide-react";

import ModalRol from "@/components/roles/ModalRol";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

const PAGE_SIZE = 25;

export default function RolesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ui } = useUIConfig();

  const nuevo = searchParams.get("nuevo");
  const editar = searchParams.get("editar");

  const [modalOpen, setModalOpen] = useState(Boolean(nuevo || editar));
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

  // Cargar rol en edición
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
        setEditing(json.ok ? json.item : null);
      } catch {
        setEditing(null);
      }
    };

    loadRol();
  }, [editar]);

  // Cargar listado
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

  useEffect(() => {
    setModalOpen(Boolean(nuevo || editar));
  }, [nuevo, editar]);

  const handleCloseModal = () => {
    router.push("/modulos/roles");
  };

  const handleNuevo = () => {
    router.push("/modulos/roles?nuevo=1");
  };

  const handleEditar = (id) => {
    router.push(`/modulos/roles?editar=${id}`);
  };

  const handleEliminar = async (id) => {
    if (!confirm("¿Eliminar rol?")) return;

    const res = await fetch(`/api/roles/eliminar/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    const json = await res.json();
    if (!json.ok) return alert(json.error || "Error al eliminar");

    fetchRoles();
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
    if (!json.ok) return alert(json.error || "Error al guardar");

    handleCloseModal();
    fetchRoles();
  };

  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <SunmiCardHeader
          title="Roles del sistema"
          subtitle="Gestioná los roles y sus permisos"
          color="amber"
        />

        {/* FILTROS */}
        <SunmiSeparator label="Filtros" color="amber" />

        <div
          className="flex flex-col md:flex-row md:items-center md:justify-between"
          style={{
            gap: ui.helpers.spacing("md"),
          }}
        >
          <div
            className="flex flex-col md:flex-row flex-1"
            style={{
              gap: ui.helpers.spacing("md"),
            }}
          >
            <SunmiInput
              placeholder="Buscar rol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div
            className="flex"
            style={{
              gap: ui.helpers.spacing("sm"),
            }}
          >
            <SunmiButton onClick={limpiarFiltros} color="slate">
              Limpiar
            </SunmiButton>

            <SunmiButton onClick={handleNuevo} color="amber">
              ＋ Nuevo
            </SunmiButton>
          </div>
        </div>

        {/* LISTADO */}
        <SunmiSeparator label="Listado" color="amber" />

        <SunmiTable headers={["Rol", "Permisos", "Acciones"]}>
          {roles.length === 0 ? (
            <SunmiTableEmpty message="No hay roles para mostrar" />
          ) : (
            roles.map((r) => (
              <SunmiTableRow key={r.id}>
                <td>{r.nombre}</td>

                <td>
                  {Array.isArray(r.permisos)
                    ? r.permisos.join(", ")
                    : "—"}
                </td>

                <td>
                  <div
                    className="flex justify-end"
                    style={{
                      gap: ui.helpers.spacing("xs"),
                    }}
                  >
                    <SunmiButtonIcon
                      icon={Pencil}
                      color="amber"
                      size={parseInt(ui.helpers.icon(1))}
                      onClick={() => handleEditar(r.id)}
                    />

                    <SunmiButtonIcon
                      icon={Trash2}
                      color="red"
                      size={parseInt(ui.helpers.icon(1))}
                      onClick={() => handleEliminar(r.id)}
                    />
                  </div>
                </td>
              </SunmiTableRow>
            ))
          )}
        </SunmiTable>

        {/* PAGINACIÓN */}
        <SunmiSeparator />

        <div
          className="flex justify-between"
          style={{
            gap: ui.helpers.spacing("sm"),
          }}
        >
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

      <ModalRol
        open={modalOpen}
        initialData={editing}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
