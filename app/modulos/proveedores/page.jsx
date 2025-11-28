"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";

import ModalProveedor from "@/components/proveedores/ModalProveedor";

const PAGE_SIZE = 10;

export default function ProveedoresPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nuevo = searchParams.get("nuevo");
  const editarId = searchParams.get("editar");

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("activos");

  const [page, setPage] = useState(1);

  const [editData, setEditData] = useState(null);

  // ---------------------------------------------------------
  // CARGAR LISTA
  // ---------------------------------------------------------
  const cargar = async () => {
    try {
      setLoading(true);

      const res = await fetch(
        `/api/proveedores/listar?search=${search}&estado=${estado}&page=${page}&pageSize=${PAGE_SIZE}`,
        { credentials: "include" }
      );
      const data = await res.json();

      if (data.ok) {
        setItems(data.items || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [search, estado, page]);

  // ---------------------------------------------------------
  // ABRIR MODAL EDITAR
  // ---------------------------------------------------------
  useEffect(() => {
    const loadEdit = async () => {
      if (!editarId) return;

      const res = await fetch(`/api/proveedores/obtener?id=${editarId}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) setEditData(data.item);
    };
    loadEdit();
  }, [editarId]);

  // ---------------------------------------------------------
  // CERRAR MODAL
  // ---------------------------------------------------------
  const cerrarModal = () => {
    setEditData(null);
    router.push("/modulos/proveedores");
  };

  // ---------------------------------------------------------
  // CREAR PROVEEDOR
  // ---------------------------------------------------------
  const crearProveedor = async (form) => {
    const res = await fetch("/api/proveedores/crear", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    if (data.ok) {
      cerrarModal();
      cargar();
    } else {
      alert(data.error || "Error al crear proveedor");
    }
  };

  // ---------------------------------------------------------
  // GUARDAR EDICIÓN
  // ---------------------------------------------------------
  const guardarEdicion = async (form) => {
    const res = await fetch("/api/proveedores/editar", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, id: editData.id }),
    });

    const data = await res.json();
    if (data.ok) {
      cerrarModal();
      cargar();
    } else {
      alert(data.error || "Error al editar proveedor");
    }
  };

  // ---------------------------------------------------------
  // ELIMINAR
  // ---------------------------------------------------------
  const eliminar = async (id) => {
    if (!confirm("¿Eliminar proveedor?")) return;

    const res = await fetch("/api/proveedores/eliminar", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    const data = await res.json();
    if (data.ok) {
      cargar();
    } else {
      alert(data.error || "No se pudo eliminar");
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <SunmiCard>
      <SunmiHeader title="Proveedores" />

      {/* ===================== */}
      {/* FILTROS */}
      {/* ===================== */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <SunmiInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar proveedor..."
        />

        {/* Filtro Estado */}
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl p-2 text-white"
        >
          <option value="activos">Activos</option>
          <option value="todos">Todos</option>
        </select>

        <SunmiButton onClick={() => router.push("/modulos/proveedores?nuevo=1")}>
          ＋ Nuevo
        </SunmiButton>
      </div>

      <SunmiSeparator className="my-4" />

      {/* ===================== */}
      {/* TABLA */}
      {/* ===================== */}
      <SunmiTable
        headers={[
          "Nombre",
          "Teléfono",
          "Email",
          "CUIT",
          "Estado",
          "Acciones",
        ]}
      >
        {loading ? (
          <SunmiTableEmpty label="Cargando..." />
        ) : items.length === 0 ? (
          <SunmiTableEmpty label="Sin proveedores" />
        ) : (
          items.map((item) => (
            <SunmiTableRow key={item.id}>
              <td>{item.nombre}</td>
              <td>{item.telefono || "-"}</td>
              <td>{item.email || "-"}</td>
              <td>{item.cuit || "-"}</td>

              <td>
                <SunmiBadgeEstado activo={item.activo} />
              </td>

              <td className="flex gap-2">
                <SunmiButton
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    router.push(`/modulos/proveedores?editar=${item.id}`)
                  }
                >
                  Editar
                </SunmiButton>

                <SunmiButton
                  size="sm"
                  variant="danger"
                  onClick={() => eliminar(item.id)}
                >
                  Eliminar
                </SunmiButton>
              </td>
            </SunmiTableRow>
          ))
        )}
      </SunmiTable>

      {/* ===================== */}
      {/* PAGINACIÓN */}
      {/* ===================== */}
      <div className="flex justify-center gap-3 mt-4">
        <SunmiButton
          variant="secondary"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          « Anterior
        </SunmiButton>

        <span className="text-white">
          {page} / {totalPages || 1}
        </span>

        <SunmiButton
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Siguiente »
        </SunmiButton>
      </div>

      {/* ===================== */}
      {/* MODAL */}
      {/* ===================== */}
      {nuevo && (
        <ModalProveedor
          open={true}
          onClose={cerrarModal}
          onSubmit={crearProveedor}
        />
      )}

      {editarId && editData && (
        <ModalProveedor
          open={true}
          initialData={editData}
          onClose={cerrarModal}
          onSubmit={guardarEdicion}
        />
      )}
    </SunmiCard>
  );
}
