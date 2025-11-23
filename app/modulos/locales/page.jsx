"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import UiTable from "@/components/UiTable";

const PAGE_SIZE = 10;

export default function LocalesPage() {
  const router = useRouter();

  const [locales, setLocales] = useState([]);
  const [search, setSearch] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchLocales = useCallback(async () => {
    const res = await fetch("/api/locales", { credentials: "include", cache: "no-store" });
    const data = await res.json();

    let arr = data?.data || [];

    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter((l) => l.nombre.toLowerCase().includes(q));
    }

    if (tipoFiltro) arr = arr.filter((l) => l.tipo === tipoFiltro);

    if (estadoFiltro) {
      const v = estadoFiltro === "true";
      arr = arr.filter((l) => l.activo === v);
    }

    setTotal(arr.length);

    const from = (page - 1) * PAGE_SIZE;
    setLocales(arr.slice(from, from + PAGE_SIZE));
  }, [search, tipoFiltro, estadoFiltro, page]);

  useEffect(() => {
    fetchLocales();
  }, [fetchLocales]);

  const columnas = [
    { key: "nombre", titulo: "Nombre" },
    { key: "tipo", titulo: "Tipo" },
    { key: "ciudad", titulo: "Ciudad" },
    { key: "provincia", titulo: "Provincia" },
    {
      key: "activo",
      titulo: "Estado",
      render: (v) => (
        <span
          className={`px-2 py-[2px] rounded-full text-[11px] font-medium ${
            v ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"
          }`}
        >
          {v ? "Activo" : "Inactivo"}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6 flex flex-col h-full">

      <div className="flex justify-between mb-4">
        <input
          type="text"
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border px-3 py-2 rounded w-64"
        />

        <button
          onClick={() => router.push("/modulos/locales/nuevo")}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          + Nuevo
        </button>
      </div>

      <UiTable
        columnas={columnas}
        datos={locales}
        page={page}
        totalPages={totalPages}
        onNext={() => setPage((p) => p + 1)}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        accionesPersonalizadas={(row) => (
          <div className="flex gap-2">
            <button
              onClick={() => router.push(`/modulos/locales/editar/${row.id}`)}
              className="text-blue-600"
            >
              ✏️
            </button>

            <button
              onClick={async () => {
                if (!confirm(`¿Eliminar "${row.nombre}"?`)) return;

                await fetch(`/api/locales/${row.id}`, { credentials: "include", method: "DELETE" });
                fetchLocales();
              }}
              className="text-red-600"
            >
              🗑️
            </button>
          </div>
        )}
      />
    </div>
  );
}
