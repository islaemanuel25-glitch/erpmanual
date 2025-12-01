"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import ModalLocal from "@/components/locales/ModalLocal";
import SunmiTableLocales from "@/components/locales/SunmiTableLocales";

const PAGE_SIZE = 10;

export default function LocalesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nuevo = searchParams.get("nuevo");
  const editar = searchParams.get("editar");
  const modalOpen = nuevo || editar;

  const [editing, setEditing] = useState(null);
  const [locales, setLocales] = useState([]);
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const limpiarFiltros = () => {
    setSearch("");
    setPage(1);
  };

  // ================================
  // CARGAR LOCAL SI EDITAMOS
  // ================================
  useEffect(() => {
    if (!editar) {
      setEditing(null);
      return;
    }

    const loadLocal = async () => {
      try {
        const res = await fetch(`/api/locales/${editar}`, {
          credentials: "include",
        });

        const json = await res.json();

        if (json.ok && json.data) {
          setEditing(json.data);
        } else {
          setEditing(null);
        }
      } catch {
        setEditing(null);
      }
    };

    loadLocal();
  }, [editar]);

  // ================================
  // CARGAR LISTADO
  // ================================
  const fetchLocales = useCallback(async () => {
    try {
      const res = await fetch("/api/locales", {
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json();

      if (!json.data || !Array.isArray(json.data)) {
        setLocales([]);
        setTotal(0);
        return;
      }

      let lista = json.data;

      if (search.trim()) {
        const q = search.toLowerCase();
        lista = lista.filter((l) => l.nombre.toLowerCase().includes(q));
      }

      setTotal(lista.length);

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE;

      setLocales(lista.slice(from, to));
    } catch {
      setLocales([]);
      setTotal(0);
    }
  }, [page, search]);

  useEffect(() => {
    fetchLocales();
  }, [fetchLocales]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  // ================================
  // ACCIONES
  // ================================
  const handleEditar = (id) => router.push(`/modulos/locales?editar=${id}`);
  const handleNuevo = () => router.push("/modulos/locales?nuevo=1");

  const handleEliminar = async (id) => {
    if (!confirm("¿Eliminar local?")) return;

    const res = await fetch(`/api/locales/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    const json = await res.json();

    if (!json.ok) {
      alert(json.error || "❌ Error al eliminar local");
      return;
    }

    alert("✅ Local eliminado");
    fetchLocales();
  };

  const handleCloseModal = () => router.push("/modulos/locales");

  const handleSubmit = async (payload) => {
    const isEdit = Boolean(editar);

    const url = isEdit
      ? `/api/locales/${editar}`
      : `/api/locales`;

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
    fetchLocales();
  };

  // ================================
  // COLUMNAS TABLA
  // ================================
  const columnas = [
    { key: "nombre", titulo: "Local" },
    { key: "tipo", titulo: "Tipo" },
    { key: "ciudad", titulo: "Ciudad" },
    {
      key: "activo",
      titulo: "Estado",
      render: (value, row) => (
        <SunmiBadgeEstado estado={row.activo ? "activo" : "inactivo"} />
      ),
    },
  ];

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <SunmiHeader title="Locales" color="amber" />

        <SunmiSeparator label="Filtros" color="amber" />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-2">
          <SunmiInput
            placeholder="Buscar local..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="flex gap-2 justify-end">
            <SunmiButton onClick={limpiarFiltros} color="slate">
              Limpiar
            </SunmiButton>

            <SunmiButton onClick={handleNuevo} color="amber">
              ＋ Nuevo
            </SunmiButton>
          </div>
        </div>

        <SunmiSeparator label="Listado" color="amber" />

        <SunmiTableLocales
          columnas={columnas}
          datos={locales}
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
          accionesPersonalizadas={(row) => (
            <div className="flex gap-3 justify-end text-[15px]">
              <button
                onClick={() => handleEditar(row.id)}
                className="text-amber-300 hover:text-amber-200"
              >
                ✏️
              </button>

              <button
                onClick={() => handleEliminar(row.id)}
                className="text-red-400 hover:text-red-300"
              >
                🗑️
              </button>
            </div>
          )}
        />
      </SunmiCard>

      <ModalLocal
        open={modalOpen ? true : false}
        initialData={editing}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
