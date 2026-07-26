"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv, {
  SunmiSelectOption,
} from "@/components/sunmi/SunmiSelectAdv";

import { Plus, Search } from "lucide-react";

import ModalGrupo from "@/components/grupos/ModalGrupo";
import GrupoListRow from "@/components/grupos/GrupoListRow";

const PAGE_SIZE = 25;

export default function PageGrupos() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { perfil, cargando: cargandoUser } = useUser();

  const permisosUser = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisosUser) && permisosUser.includes("*");

  const nuevo = searchParams.get("nuevo");
  const editar = searchParams.get("editar");

  const [modalOpen, setModalOpen] = useState(Boolean(nuevo || editar));
  const [editing, setEditing] = useState(null);

  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [search, setSearch] = useState("");
  const [orden, setOrden] = useState("nombreAsc");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const cargar = useCallback(async () => {
    try {
      setCargando(true);

      const params = new URLSearchParams({
        q: search,
        orden,
        page: String(page),
      });

      const res = await fetch(`/api/grupos/listar?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setItems([]);
        setTotalPages(1);
        return;
      }

      setItems(data.items || []);
      setTotalPages(data.totalPages || 1);
    } catch {
      setItems([]);
      setTotalPages(1);
    } finally {
      setCargando(false);
    }
  }, [search, orden, page]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    setPage(1);
  }, [search, orden]);

  useEffect(() => {
    setModalOpen(Boolean(nuevo || editar));
  }, [nuevo, editar]);

  // Cargar grupo en edición
  useEffect(() => {
    if (!editar) {
      setEditing(null);
      return;
    }

    const loadGrupo = async () => {
      try {
        const res = await fetch(`/api/grupos/${editar}`, {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json();

        if (res.ok && data) {
          setEditing(data);
        } else {
          setEditing(null);
        }
      } catch {
        setEditing(null);
      }
    };

    loadGrupo();
  }, [editar]);

  const limpiarFiltros = () => {
    setSearch("");
    setOrden("nombreAsc");
    setPage(1);
  };

  const handleCloseModal = () => {
    router.push("/modulos/grupos");
  };

  const handleNuevo = () => {
    router.push("/modulos/grupos?nuevo=1");
  };

  const handleEditar = (id) => {
    router.push(`/modulos/grupos?editar=${id}`);
  };

  const eliminar = async (id, nombre) => {
    if (!confirm(`¿Eliminar el grupo "${nombre}"?`)) return;

    try {
      const res = await fetch(`/api/grupos/${id}`, {
        credentials: "include",
        method: "DELETE",
      });

      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "Error al eliminar");
        return;
      }

      cargar();
    } catch {
      alert("No se pudo eliminar");
    }
  };

  const handleSubmit = async (payload) => {
    const isEdit = Boolean(editar);
    const { nombre, localesIds, depositosIds } = payload;

    const url = isEdit ? `/api/grupos/${editar}` : `/api/grupos/crear`;

    const res = await fetch(url, {
      method: isEdit ? "PUT" : "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });

    const json = await res.json();

    if (!res.ok || !json.ok) {
      alert(json.error || "Error al guardar");
      return;
    }

    const grupoId = isEdit ? editar : json.data.id;

    // Obtener asignaciones actuales
    let localesActuales = [];
    let depositosActuales = [];

    if (isEdit) {
      try {
        const resLocales = await fetch(`/api/grupos/${grupoId}/locales`, {
          credentials: "include",
        });
        const dataLocales = await resLocales.json();
        localesActuales = (dataLocales.data || []).map((l) => l.localId);

        const resDepositos = await fetch(`/api/grupos/${grupoId}/depositos`, {
          credentials: "include",
        });
        const dataDepositos = await resDepositos.json();
        depositosActuales = (dataDepositos.data || []).map((d) => d.localId);
      } catch {
        // Continuar aunque falle
      }
    }

    // Actualizar asignaciones de locales
    if (Array.isArray(localesIds)) {
      const nuevos = localesIds.filter((id) => !localesActuales.includes(id));
      const quitar = localesActuales.filter((id) => !localesIds.includes(id));

      for (const localId of nuevos) {
        await fetch(`/api/grupos/${grupoId}/locales`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ localId }),
        });
      }

      for (const localId of quitar) {
        await fetch(`/api/grupos/${grupoId}/locales`, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ localId }),
        });
      }
    }

    // Actualizar asignaciones de depósitos
    if (Array.isArray(depositosIds)) {
      const nuevos = depositosIds.filter(
        (id) => !depositosActuales.includes(id)
      );
      const quitar = depositosActuales.filter(
        (id) => !depositosIds.includes(id)
      );

      for (const localId of nuevos) {
        await fetch(`/api/grupos/${grupoId}/depositos`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ localId }),
        });
      }

      for (const localId of quitar) {
        await fetch(`/api/grupos/${grupoId}/depositos`, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ localId }),
        });
      }
    }

    handleCloseModal();
    cargar();
  };

  if (cargandoUser) return null;
  if (!esAdmin) return <SinPermisos />;

  return (
    <div className="w-full min-h-full p-2 flex flex-col gap-3">
      {/* HEADER DE PÁGINA: título + búsqueda inline + nuevo */}
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-base md:text-lg font-semibold sunmi-text-strong shrink-0">
          Grupos
        </h1>

        <div className="relative flex-1 min-w-[160px] max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--pos-link)" }}
          />
          <SunmiInput
            placeholder="Buscar grupo..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="!pl-9 !border-2 pulse-neon"
            style={{ borderColor: "var(--pos-link)" }}
          />
        </div>

        <SunmiButton color="amber" onClick={handleNuevo}>
          <span className="inline-flex items-center gap-1">
            <Plus size={14} /> Nuevo grupo
          </span>
        </SunmiButton>
      </div>

      {/* TOOLBAR CHICA: orden + limpiar + contador */}
      <div className="flex items-center gap-2 flex-wrap text-[11px] sunmi-text-muted">
        <span className="shrink-0">Ordenar:</span>
        <div className="w-44">
          <SunmiSelectAdv
            value={orden}
            onChange={setOrden}
            className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
          >
            <SunmiSelectOption value="nombreAsc">Nombre (A → Z)</SunmiSelectOption>
            <SunmiSelectOption value="nombreDesc">Nombre (Z → A)</SunmiSelectOption>
            <SunmiSelectOption value="depositosDesc">Más depósitos</SunmiSelectOption>
            <SunmiSelectOption value="localesDesc">Más locales</SunmiSelectOption>
          </SunmiSelectAdv>
        </div>
        <button
          type="button"
          onClick={limpiarFiltros}
          className="px-2 py-1 rounded-md hover:sunmi-control-hover transition"
        >
          Limpiar
        </button>
        <span className="ml-auto">
          {!cargando && `${items.length} ${items.length === 1 ? "grupo" : "grupos"}`}
        </span>
      </div>

      {/* LISTA: cards horizontales */}
      <div className="flex flex-col gap-2">
        {cargando ? (
          <div className="py-10 text-center sunmi-text-muted text-xs">
            Cargando grupos...
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center sunmi-text-muted text-xs border sunmi-divider rounded-lg">
            No hay grupos coincidentes.
          </div>
        ) : (
          items.map((g) => (
            <GrupoListRow
              key={g.id}
              grupo={g}
              onAdministrar={(grupo) => router.push(`/modulos/grupos/${grupo.id}`)}
              onEditar={(grupo) => handleEditar(grupo.id)}
              onEliminar={(grupo) => eliminar(grupo.id, grupo.nombre)}
            />
          ))
        )}
      </div>

      {/* PAGINACIÓN */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t sunmi-divider">
          <SunmiButton
            color="slate"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            « Anterior
          </SunmiButton>
          <span className="sunmi-text-muted text-[11px]">
            Página {page} / {totalPages}
          </span>
          <SunmiButton
            color="slate"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente »
          </SunmiButton>
        </div>
      )}

      <ModalGrupo
        open={modalOpen}
        initialData={editing}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
