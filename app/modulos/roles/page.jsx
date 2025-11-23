"use client";

import { useEffect, useMemo, useState } from "react";
import FiltrosRoles from "@/components/roles/FiltrosRoles";
import ColumnManagerRoles from "@/components/roles/ColumnManagerRoles";
import TablaRoles from "@/components/roles/TablaRoles";
import ModalRol from "@/components/roles/ModalRol";

const PAGE_SIZE = 25;

export default function RolesPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [filtros, setFiltros] = useState({
    search: "",
    activo: "",
  });

  const allColumns = [
    { key: "nombre", label: "Nombre" },
    { key: "permisos", label: "Permisos" },
  ];

  // ---------------------------------------
  // 🔵 CORRECCIÓN: rolesCols (camelCase)
  // ---------------------------------------
  const [visibleCols, setVisibleCols] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("rolesCols");
      if (saved) return JSON.parse(saved);
    }
    return allColumns.map((c) => c.key);
  });

  useEffect(() => {
    localStorage.setItem("rolesCols", JSON.stringify(visibleCols));
  }, [visibleCols]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/roles/listar?page=${page}&q=${filtros.search || ""}`,
        { credentials: "include" }
      );

      const data = await res.json();

      if (data.ok && Array.isArray(data.items)) {
        setRows(data.items);
        setTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error("Error cargando roles:", err); // ✔️ FIX
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRoles();
  }, [page, filtros]);

  const handleSubmit = async (payload) => {
    try {
      const isEdit = Boolean(editing);

      const url = isEdit
        ? `/api/roles/editar/${editing.id}`
        : `/api/roles/crear`;

      const res = await fetch(url, {
        credentials: "include",
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.ok) return alert(data.error || "Error guardando rol");

      setModalOpen(false);
      setEditing(null);
      fetchRoles();
    } catch (err) {
      console.error("Error guardando rol:", err);
    }
  };

  const handleEditar = async (id) => {
    try {
      const res = await fetch(`/api/roles/obtener?id=${id}`, {
        credentials: "include",
      });
      const data = await res.json();

      if (data.ok && data.item) {
        setEditing(data.item);
        setModalOpen(true);
      } else {
        alert(data.error || "No se pudo cargar el rol");
      }
    } catch (err) {
      console.error("Error al editar rol:", err); // ✔️ FIX
    }
  };

  const handleEliminar = async (id) => {
    if (!confirm("¿Eliminar rol?")) return;

    try {
      const res = await fetch(`/api/roles/eliminar/${id}`, {
        credentials: "include",
        method: "DELETE",
      });
      const data = await res.json();

      if (data.ok) {
        fetchRoles();
      } else {
        alert(data.error || "Error eliminando rol");
      }
    } catch (err) {
      console.error("Error eliminando rol:", err);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Roles</h1>

      <FiltrosRoles
        initial={filtros}
        onChange={(f) => {
          setFiltros(f);
          setPage(1);
        }}
      />

      <div className="flex items-center justify-end gap-2">
        <ColumnManagerRoles
          allColumns={allColumns}
          visibleKeys={visibleCols}
          onChange={setVisibleCols}
        />

        <button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="px-4 py-2 rounded-md bg-blue-600 text-white"
        >
          Nuevo rol
        </button>
      </div>

      <div className="overflow-x-auto w-full border rounded-lg">
        <TablaRoles
          rows={rows}
          columns={allColumns.filter((c) => visibleCols.includes(c.key))}
          page={page}
          totalPages={totalPages}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onEditar={handleEditar}
          onEliminar={handleEliminar}
        />
      </div>

      <ModalRol
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        initialData={editing}
        onSubmit={handleSubmit}
      />

      {loading && (
        <div className="text-center text-gray-500 mt-4">Cargando...</div>
      )}
    </div>
  );
}
