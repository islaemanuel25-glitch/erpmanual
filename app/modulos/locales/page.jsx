"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiButtonIcon from "@/components/sunmi/SunmiButtonIcon";

import { Pencil, Trash2 } from "lucide-react";

import ModalLocal from "@/components/locales/ModalLocal";
import { useUIConfig } from "@/components/providers/UIConfigProvider";

const PAGE_SIZE = 25;

export default function LocalesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ui } = useUIConfig();

  const nuevo = searchParams.get("nuevo");
  const editar = searchParams.get("editar");

  const [modalOpen, setModalOpen] = useState(Boolean(nuevo || editar));
  const [editing, setEditing] = useState(null);
  const [locales, setLocales] = useState([]);
  const [search, setSearch] = useState("");
  const [activoFiltro, setActivoFiltro] = useState("");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const limpiarFiltros = () => {
    setSearch("");
    setActivoFiltro("");
    setPage(1);
  };

  // Cargar local en edición
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

  // Cargar listado
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
        lista = lista.filter((l) => l.nombre?.toLowerCase().includes(q));
      }

      if (activoFiltro === "activo") {
        lista = lista.filter((l) => l.activo === true);
      } else if (activoFiltro === "inactivo") {
        lista = lista.filter((l) => l.activo === false);
      }

      setTotal(lista.length);

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE;

      setLocales(lista.slice(from, to));
    } catch {
      setLocales([]);
      setTotal(0);
    }
  }, [page, search, activoFiltro]);

  useEffect(() => {
    fetchLocales();
  }, [fetchLocales]);

  useEffect(() => {
    setPage(1);
  }, [search, activoFiltro]);

  useEffect(() => {
    setModalOpen(Boolean(nuevo || editar));
  }, [nuevo, editar]);

  const handleCloseModal = () => {
    router.push("/modulos/locales");
  };

  const handleNuevo = () => {
    router.push("/modulos/locales?nuevo=1");
  };

  const handleEditar = (id) => {
    router.push(`/modulos/locales?editar=${id}`);
  };

  const handleEliminar = async (id) => {
    if (!confirm("¿Eliminar local?")) return;

    const res = await fetch(`/api/locales/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    const json = await res.json();

    if (!json.ok) {
      alert(json.error || "Error al eliminar");
      return;
    }

    fetchLocales();
  };

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
      alert(json.error || "Error al guardar");
      return;
    }

    handleCloseModal();
    fetchLocales();
  };

  const getTipoLabel = (tipo) => {
    if (tipo === "deposito") return "Depósito";
    if (tipo === "local") return "Local";
    return tipo || "—";
  };

  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <SunmiCardHeader
          title="Locales del sistema"
          subtitle="Gestioná los locales y depósitos"
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
              placeholder="Buscar local..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <SunmiSelectAdv value={activoFiltro} onChange={setActivoFiltro}>
              <SunmiSelectOption value="">Estado…</SunmiSelectOption>
              <SunmiSelectOption value="activo">Activo</SunmiSelectOption>
              <SunmiSelectOption value="inactivo">Inactivo</SunmiSelectOption>
            </SunmiSelectAdv>
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

        <SunmiTable headers={["Local", "Tipo", "Ciudad", "Estado", "Acciones"]}>
          {locales.length === 0 ? (
            <SunmiTableEmpty message="No hay locales para mostrar" />
          ) : (
            locales.map((l) => (
              <SunmiTableRow key={l.id}>
                <td>{l.nombre || "—"}</td>

                <td>{getTipoLabel(l.tipo)}</td>

                <td>{l.ciudad || "—"}</td>

                <td>
                  <div className="flex justify-center">
                    <SunmiBadgeEstado value={l.activo} />
                  </div>
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
                      onClick={() => handleEditar(l.id)}
                    />

                    <SunmiButtonIcon
                      icon={Trash2}
                      color="red"
                      size={parseInt(ui.helpers.icon(1))}
                      onClick={() => handleEliminar(l.id)}
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

      <ModalLocal
        open={modalOpen}
        initialData={editing}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
