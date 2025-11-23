"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import UiTable from "@/components/UiTable";

const PAGE_SIZE = 10;

export default function UsuariosPage() {
  const router = useRouter();

  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [locales, setLocales] = useState([]);

  const [search, setSearch] = useState("");
  const [rolFiltro, setRolFiltro] = useState("");
  const [localFiltro, setLocalFiltro] = useState("");
  const [page, setPage] = useState(1);

  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const limpiarFiltros = () => {
    setSearch("");
    setRolFiltro("");
    setLocalFiltro("");
    setPage(1);
  };

  // cargar roles y locales
  useEffect(() => {
    const cargar = async () => {
      const rRoles = await fetch("/api/usuarios/listarRoles", { credentials: "include", credentials: "include" }).then((r) => r.json());
      const rLocales = await fetch("/api/usuarios/listarLocales", { credentials: "include", credentials: "include" }).then((r) => r.json());

      setRoles(Array.isArray(rRoles.items) ? rRoles.items : []);
      setLocales(Array.isArray(rLocales.items) ? rLocales.items : []);
    };

    cargar();
  }, []);

  // cargar usuarios
  const fetchUsuarios = useCallback(async () => {
    const res = await fetch("/api/usuarios/listar", { credentials: "include", credentials: "include", cache: "no-store" });
    const json = await res.json();

    if (!json.ok || !Array.isArray(json.usuarios)) {
      setUsuarios([]);
      setTotal(0);
      return;
    }

    let lista = json.usuarios;

    // filtros front
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      lista = lista.filter(
        (u) =>
          u.nombre?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q)
      );
    }

    if (rolFiltro) lista = lista.filter((u) => u.rolId === Number(rolFiltro));
    if (localFiltro) lista = lista.filter((u) => u.localId === Number(localFiltro));

    setTotal(lista.length);

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE;

    setUsuarios(lista.slice(from, to));
  }, [page, search, rolFiltro, localFiltro]);

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  useEffect(() => {
    setPage(1);
  }, [search, rolFiltro, localFiltro]);

  const handleEditar = (id) => router.push(`/modulos/usuarios/editar/${id}`);

  const handleEliminar = async (id) => {
    if (!confirm("¿Eliminar usuario?")) return;

    const res = await fetch(`/api/usuarios/eliminar/${id}`, { credentials: "include",
      method: "DELETE",
      credentials: "include",
    });

    if (!res.ok) return alert("❌ Error al eliminar");

    alert("✅ Usuario eliminado");
    fetchUsuarios();
  };

  const columnas = [
    {
      key: "nombre",
      titulo: "Usuario",
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-xs font-semibold">
            {row.nombre?.[0] ?? "?"}
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] text-gray-800 font-medium">{row.nombre}</span>
            <span className="text-[11px] text-gray-500">{row.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: "rol",
      titulo: "Rol",
      render: (_, row) =>
        row.rol?.nombre || row.rolNombre || "—",
    },
    {
      key: "local",
      titulo: "Local",
      render: (_, row) =>
        row.local?.nombre || row.localNombre || "—",
    },
    {
      key: "activo",
      titulo: "Estado",
      render: (v) => (
        <span
          className={`px-2 py-[2px] rounded-full text-[11px] font-medium ${
            v ? "bg-green-100 text-green-700" : "bg-gray-300 text-gray-700"
          }`}
        >
          {v ? "Activo" : "Inactivo"}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col w-full h-full overflow-hidden p-6">

      {/* FILTROS */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div className="flex flex-col md:flex-row gap-3 flex-1">
          <input
            type="text"
            placeholder="Buscar usuario..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 h-[36px] px-3 rounded-md border text-[13px]"
          />

          <select
            value={rolFiltro}
            onChange={(e) => setRolFiltro(e.target.value)}
            className="w-[170px] h-[36px] px-3 text-[13px] rounded-md border"
          >
            <option value="">Rol...</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>

          <select
            value={localFiltro}
            onChange={(e) => setLocalFiltro(e.target.value)}
            className="w-[170px] h-[36px] px-3 text-[13px] rounded-md border"
          >
            <option value="">Local...</option>
            {locales.map((l) => (
              <option key={l.id} value={l.id}>{l.nombre}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={limpiarFiltros}
            className="h-[36px] px-4 rounded-md border bg-gray-200 text-[13px]"
          >
            Limpiar
          </button>

          <button
            onClick={() => router.push("/modulos/usuarios/nuevo")}
            className="h-[36px] px-4 bg-blue-600 text-white rounded-md text-[13px]"
          >
            ＋ Nuevo
          </button>
        </div>
      </div>

      {/* TABLA */}
      <UiTable
        columnas={columnas}
        datos={usuarios}
        page={page}
        totalPages={totalPages}
        onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        accionesPersonalizadas={(row) => (
          <div className="flex gap-3">
            <button onClick={() => handleEditar(row.id)} className="text-blue-600">✏️</button>
            <button onClick={() => handleEliminar(row.id)} className="text-red-600">🗑️</button>
          </div>
        )}
      />
    </div>
  );
}
