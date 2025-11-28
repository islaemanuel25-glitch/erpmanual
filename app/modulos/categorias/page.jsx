"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import ModalCategoria from "@/components/categorias/ModalCategoria";

export default function CategoriasPage() {

  const router = useRouter();
  const searchParams = useSearchParams();

  // ============================================
  // FILTROS + PAGINACIÓN
  // ============================================
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [estado, setEstado] = useState(searchParams.get("estado") || "todos");

  const [page, setPage] = useState(Number(searchParams.get("page") || 1));
  const pageSize = 20;

  // ============================================
  // DATA
  // ============================================
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [totalPages, setTotalPages] = useState(1);

  // ============================================
  // MODAL
  // ============================================
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("nuevo"); 
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState(null);

  // ============================================
  // CARGAR LISTA (REFORMADO)
  // ============================================
  const cargar = useCallback(async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      params.set("page", page);
      params.set("pageSize", pageSize);
      params.set("estado", estado);
      if (search.trim()) params.set("search", search.trim());

      router.replace(`/modulos/categorias?${params.toString()}`);

      const res = await fetch(`/api/categorias/listar?${params.toString()}`);
      const data = await res.json();

      if (data.ok) {
        setItems(data.items || []);
        setTotalPages(data.totalPages || 1);
      }

    } catch (e) {
      console.error("Error cargando categorías:", e);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, estado, search, router]);

  // ============================================
  // CAMBIO DE FILTROS → SOLO reset page
  // ============================================
  useEffect(() => {
    const delay = setTimeout(() => {
      setPage(1);
    }, 250);

    return () => clearTimeout(delay);
  }, [search, estado]);

  // ============================================
  // CAMBIO DE PAGE → disparamos cargar()
  // ============================================
  useEffect(() => {
    cargar();
  }, [page, cargar]);

  // ============================================
  // MODALES
  // ============================================
  const abrirNuevo = () => {
    setModalMode("nuevo");
    setCategoriaSeleccionada(null);
    setModalOpen(true);
  };

  const abrirEditar = (item) => {
    setModalMode("editar");
    setCategoriaSeleccionada(item);
    setModalOpen(true);
  };

  const cerrarModal = () => setModalOpen(false);

  const refrescar = () => cargar();

  // ============================================
  // LIMPIAR FILTROS
  // ============================================
  const limpiar = () => {
    setSearch("");
    setEstado("todos");
    setPage(1);
  };

  // ============================================
  // ELIMINAR
  // ============================================
  const eliminar = async (id) => {
    if (!confirm("¿Eliminar categoría?")) return;

    try {
      const res = await fetch("/api/categorias/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const data = await res.json();

      if (!data.ok) return alert(data.error || "Error al eliminar");

      cargar();

    } catch (e) {
      console.error("Error eliminando:", e);
      alert("Error al eliminar categoría");
    }
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className="p-3 space-y-4">

      <SunmiHeader titulo="📁 Categorías" />

      <SunmiCard>

        {/* ========= FILTROS ========= */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">

          <SunmiInput
            placeholder="Buscar por nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <SunmiSelectAdv
            value={estado}
            onChange={(v) => setEstado(v)}
            options={[
              new SunmiSelectOption("todos", "Todas"),
              new SunmiSelectOption("activas", "Activas"),
              new SunmiSelectOption("inactivas", "Inactivas"),
            ]}
          />

          <div className="flex gap-2">
            <SunmiButton
              variant="secondary"
              className="w-full"
              onClick={limpiar}
            >
              Limpiar
            </SunmiButton>

            <SunmiButton className="w-full" onClick={abrirNuevo}>
              ＋ Nueva
            </SunmiButton>
          </div>
        </div>

        <SunmiSeparator />

        {/* ========= TABLA ========= */}
        {loading ? (
          <div className="p-6 flex justify-center">
            <SunmiLoader />
          </div>
        ) : (
          <SunmiTable headers={["Nombre", "Estado", "Acciones"]}>
            {items.length === 0 ? (
              <SunmiTableEmpty mensaje="No hay categorías" />
            ) : (
              items.map((item) => (
                <SunmiTableRow key={item.id}>
                  <td className="px-3 py-2">{item.nombre}</td>

                  <td className="px-3 py-2">
                    <SunmiBadgeEstado estado={item.activo} />
                  </td>

                  <td className="px-3 py-2 flex gap-3">

                    {/* EDITAR */}
                    <SunmiButton
                      variant="ghost"
                      className="text-amber-400 px-2"
                      onClick={() => abrirEditar(item)}
                    >
                      Editar
                    </SunmiButton>

                    {/* ELIMINAR */}
                    <SunmiButton
                      variant="danger"
                      className="px-2"
                      onClick={() => eliminar(item.id)}
                    >
                      Eliminar
                    </SunmiButton>

                  </td>
                </SunmiTableRow>
              ))
            )}
          </SunmiTable>
        )}

        <SunmiSeparator />

        {/* ========= PAGINACIÓN ========= */}
        <div className="p-4 flex justify-between">
          <SunmiButton
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Anterior
          </SunmiButton>

          <span className="text-slate-400 text-sm self-center">
            Página {page} de {totalPages}
          </span>

          <SunmiButton
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente →
          </SunmiButton>
        </div>
      </SunmiCard>

      <ModalCategoria
        open={modalOpen}
        mode={modalMode}
        initialData={categoriaSeleccionada}
        onClose={cerrarModal}
        onSaved={refrescar}
      />
    </div>
  );
}
