"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ModalProducto from "@/components/productos/ModalProductoFinal";
import useContextoActivo from "@/hooks/useContextoActivo";

export default function EditarProductoPage({ params }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = Number(params.id);
  const { contexto } = useContextoActivo(); // localId activo + esDeposito
  const localId = contexto?.localId || 0;

  // URL de retorno al listado preservando contexto (page, sort, filtros)
  const returnUrl = useMemo(() => {
    const listing = new URLSearchParams();
    for (const [k, v] of searchParams.entries()) {
      listing.set(k, v);
    }
    const qs = listing.toString();
    return qs ? `/modulos/productos?${qs}` : "/modulos/productos";
  }, [searchParams]);

  const [catalogos, setCatalogos] = useState({
    CATEGORIAS: [],
    PROVEEDORES: [],
    AREAS: [],
  });

  const [initialData, setInitialData] = useState(null);
  const [open, setOpen] = useState(true);
  // Propiedad resuelta por el BACKEND (obtener) — no inferir en el front.
  const [puedeEditarCosto, setPuedeEditarCosto] = useState(true);
  const [puedeEditarBase, setPuedeEditarBase] = useState(true);

  // ============================
  // Cargar catálogos
  // ============================
  useEffect(() => {
    const cargar = async () => {
      try {
        const [cat, prov, area] = await Promise.all([
          fetch("/api/catalogos/categorias", { credentials: "include" }).then((r) => r.json()),
          fetch("/api/catalogos/proveedores", { credentials: "include" }).then((r) => r.json()),
          fetch("/api/catalogos/areas-fisicas", { credentials: "include" }).then((r) => r.json()),
        ]);

        setCatalogos({
          CATEGORIAS: cat.items ?? [],
          PROVEEDORES: prov.items ?? [],
          AREAS: area.items ?? [],
        });
      } catch (err) {
        console.error("Error cargando catálogos:", err);
      }
    };

    cargar();
  }, []);

  // ============================
  // Cargar producto según localId (endpoint canónico: obtener)
  // ============================
  useEffect(() => {
    if (!id || !localId) return;

    const cargarProducto = async () => {
      try {
        const res = await fetch(
          `/api/productos/obtener?id=${id}&localId=${localId}`,
          { credentials: "include" }
        );

        if (res.status === 401) {
          router.replace("/login");
          return;
        }

        const data = await res.json();

        if (!data.ok) {
          // Producto de otro local → 404 (aislamiento): no abrir el editor.
          alert(data.error || "Producto no encontrado");
          router.push(returnUrl);
          return;
        }

        // La API devuelve `item`, no `producto`
        setInitialData(data.item);
        // Propiedad resuelta por el backend (dueño del producto).
        setPuedeEditarCosto(data.puedeEditarCosto !== false);
        setPuedeEditarBase(data.puedeEditarBase !== false);
      } catch (err) {
        console.error("Error cargando producto:", err);
        router.push(returnUrl);
      }
    };

    cargarProducto();
  }, [id, localId]);

  // ============================
  // Guardar cambios (PUT)
  // ============================
  const handleSubmit = async (form) => {
    try {
      const res = await fetch(
        `/api/productos/editar/${id}?localId=${localId}`,
        {
          credentials: "include",
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(form),
        }
      );

      const data = await res.json();

      if (!data.ok) {
        alert(data.error || "Error al editar producto");
        return;
      }

      router.push(returnUrl);
    } catch (err) {
      console.error("Error guardando producto:", err);
      alert("Error interno");
    }
  };

  // ============================
  // Cerrar modal
  // ============================
  const handleClose = () => {
    router.push(returnUrl);
  };

  return (
    <ModalProducto
      open={open}
      onClose={handleClose}
      onSubmit={handleSubmit}
      catalogos={catalogos}
      initialData={initialData}
      localId={localId}
      editandoOverrideLocal={localId > 0 && !contexto?.esDeposito}
      puedeEditarCosto={puedeEditarCosto}
      puedeEditarBase={puedeEditarBase}
    />
  );
}
