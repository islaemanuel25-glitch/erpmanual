"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv, {
  SunmiSelectOption,
} from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiButtonIcon from "@/components/sunmi/SunmiButtonIcon";

import SunmiEntityCard from "@/components/sunmi/SunmiEntityCard";
import SunmiSection from "@/components/sunmi/SunmiSection";
import SunmiList from "@/components/sunmi/SunmiList";
import SunmiListItem from "@/components/sunmi/SunmiListItem";
import SunmiGrid from "@/components/sunmi/SunmiGrid";

import { Pencil, Trash2 } from "lucide-react";

import ModalGrupo from "@/components/grupos/ModalGrupo";

const PAGE_SIZE = 25;

export default function PageGrupos() {
  const router = useRouter();
  const searchParams = useSearchParams();

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

  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <SunmiCardHeader
          title="Grupos del sistema"
          subtitle="Gestioná grupos de locales y depósitos"
          color="amber"
        />

        {/* FILTROS */}
        <SunmiSeparator label="Filtros" color="amber" />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex flex-col md:flex-row gap-3 flex-1">
            <SunmiInput
              placeholder="Buscar grupo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <SunmiSelectAdv value={orden} onChange={setOrden}>
              <SunmiSelectOption value="nombreAsc">
                Nombre (A → Z)
              </SunmiSelectOption>
              <SunmiSelectOption value="nombreDesc">
                Nombre (Z → A)
              </SunmiSelectOption>
              <SunmiSelectOption value="depositosDesc">
                Más depósitos
              </SunmiSelectOption>
              <SunmiSelectOption value="localesDesc">
                Más locales
              </SunmiSelectOption>
            </SunmiSelectAdv>
          </div>

          <div className="flex gap-2">
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

        {cargando ? (
          <div className="flex justify-center">Cargando grupos...</div>
        ) : items.length === 0 ? (
          <div className="flex justify-center">No hay grupos coincidentes.</div>
        ) : (
          <SunmiGrid minWidth={320} gap={16}>
            {items.map((g) => {
              const cantidadLocales = Array.isArray(g.localesGrupo)
                ? g.localesGrupo.length
                : 0;
              const cantidadDepositos = Array.isArray(g.locales)
                ? g.locales.length
                : 0;

              return (
                <SunmiEntityCard
                  key={g.id}
                  title={g.nombre}
                  subtitle={`${cantidadLocales} locales · ${cantidadDepositos} depósitos`}
                  color="amber"
                  actions={
                    <>
                      <SunmiButton
                        color="amber"
                        onClick={() =>
                          router.push(`/modulos/grupos/${g.id}`)
                        }
                      >
                        Administrar
                      </SunmiButton>

                      <SunmiButtonIcon
                        icon={Pencil}
                        color="amber"
                        size={16}
                        onClick={() => handleEditar(g.id)}
                      />

                      <SunmiButtonIcon
                        icon={Trash2}
                        color="red"
                        size={16}
                        onClick={() => eliminar(g.id, g.nombre)}
                      />
                    </>
                  }
                >
                  <SunmiSection title="Locales">
                    {cantidadLocales === 0 ? (
                      <div>No hay locales asignados</div>
                    ) : (
                      <SunmiList>
                        {g.localesGrupo.map((lg) => (
                          <SunmiListItem
                            key={lg.local.id}
                            label={lg.local.nombre}
                          />
                        ))}
                      </SunmiList>
                    )}
                  </SunmiSection>

                  <SunmiSection title="Depósitos">
                    {cantidadDepositos === 0 ? (
                      <div>No hay depósitos asignados</div>
                    ) : (
                      <SunmiList>
                        {g.locales.map((d) => (
                          <SunmiListItem
                            key={d.localId}
                            label={d.local.nombre}
                          />
                        ))}
                      </SunmiList>
                    )}
                  </SunmiSection>
                </SunmiEntityCard>
              );
            })}
          </SunmiGrid>
        )}

        {/* PAGINACIÓN */}
        <SunmiSeparator />

        <div className="flex justify-between gap-2">
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

      <ModalGrupo
        open={modalOpen}
        initialData={editing}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
