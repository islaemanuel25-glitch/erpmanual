"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PlusCircle,
  Warehouse,
  Store,
  Settings,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function PageGrupos() {
  const router = useRouter();

  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);

  // ✅ Filtros (corregido naming)
  const [search, setSearch] = useState("");
  const [orden, setOrden] = useState("nombreAsc");

  // ✅ Paginación
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const cargar = async () => {
    try {
      setCargando(true);

      const params = new URLSearchParams({
        q: search,
        orden,
        page,
      });

      const res = await fetch(`/api/grupos/listar?${params.toString()}`, { credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok || !data.ok) throw new Error(data.error);

      setItems(data.items || []);
      setTotalPages(data.totalPages || 1);
    } catch {
      alert("No se pudieron cargar los grupos");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [search, orden, page]);

  const eliminar = async (id, nombre) => {
    if (!confirm(`¿Eliminar el grupo "${nombre}"?`)) return;

    try {
      const res = await fetch(`/api/grupos/${id}`, { credentials: "include",
        method: "DELETE",
      });

      const data = await res.json();
      if (!data.ok) return alert(data.error);

      cargar();
    } catch {
      alert("No se pudo eliminar");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-8">

      {/* Título principal */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <p className="text-gray-500">
            Administrá grupos de locales y depósitos para tu ERP Azul.
          </p>
        </div>

        <button
          onClick={() => router.push("/modulos/grupos/nuevo")}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center gap-2"
        >
          <PlusCircle size={20} />
          Nuevo Grupo
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded shadow">

        {/* Buscador */}
        <div className="flex items-center w-full md:w-1/2 border rounded px-3 py-2 bg-gray-50">
          <Search size={18} className="mr-2 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar grupo por nombre..."
            className="w-full bg-transparent outline-none"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>

        {/* Orden - corregido naming */}
        <select
          className="border px-3 py-2 rounded w-full md:w-1/3"
          value={orden}
          onChange={(e) => {
            setPage(1);
            setOrden(e.target.value);
          }}
        >
          <option value="nombreAsc">Nombre (A → Z)</option>
          <option value="nombreDesc">Nombre (Z → A)</option>
          <option value="depositosDesc">Más depósitos</option>
          <option value="localesDesc">Más locales</option>
        </select>
      </div>

      {/* Contenido */}
      {cargando ? (
        <div className="text-gray-600">Cargando grupos...</div>
      ) : items.length === 0 ? (
        <div className="text-gray-500 text-center border rounded p-6">
          No hay grupos coincidentes.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {items.map((g) => (
            <div
              key={g.id}
              className="border rounded-lg shadow-sm p-5 bg-white hover:shadow-md transition"
            >
              <h2 className="text-lg font-semibold text-gray-800">
                {g.nombre}
              </h2>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Warehouse className="text-blue-600" size={20} />
                  <span className="text-gray-700">
                    Depósitos: <strong>{g.locales?.length || 0}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Store className="text-green-600" size={20} />
                  <span className="text-gray-700">
                    Locales: <strong>{g.localesGrupo?.length || 0}</strong>
                  </span>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex justify-between mt-5">
                <button
                  onClick={() => router.push(`/modulos/grupos/${g.id}`)}
                  className="bg-gray-700 hover:bg-gray-800 text-white px-3 py-2 rounded flex items-center gap-1"
                >
                  <Settings size={18} />
                  Administrar
                </button>

                <button
                  onClick={() => eliminar(g.id, g.nombre)}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded flex items-center gap-1"
                >
                  <Trash2 size={18} />
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginación */}
      <div className="flex justify-center items-center gap-4 mt-6">

        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="px-3 py-1 rounded border disabled:opacity-40"
        >
          <ChevronLeft size={18} />
        </button>

        <span className="text-gray-700">
          Página {page} de {totalPages}
        </span>

        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 py-1 rounded border disabled:opacity-40"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
