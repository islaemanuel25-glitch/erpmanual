"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ModalProducto from "@/components/productos/ModalProductoFinal";
import { useUser } from "@/app/context/UserContext";

export default function EditarProductoPage({ params }) {
  const router = useRouter();
  const id = Number(params.id);
  const { perfil } = useUser(); // trae localId del usuario (local o deposito o admin)

  const [catalogos, setCatalogos] = useState({
    CATEGORIAS: [],
    PROVEEDORES: [],
    AREAS: [],
  });

  const [initialData, setInitialData] = useState(null);
  const [open, setOpen] = useState(true);

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
  // Cargar producto según localId
  // ============================
  useEffect(() => {
    const cargarProducto = async () => {
      try {
        const res = await fetch(
          `/api/productos/${id}?localId=${perfil?.localId || 0}`,
          { credentials: "include" }
        );

        const data = await res.json();

        if (!data.ok) {
          alert(data.error || "Producto no encontrado");
          router.push("/modulos/productos");
          return;
        }

        // La API devuelve `item`, no `producto`
        setInitialData(data.item);
      } catch (err) {
        console.error("Error cargando producto:", err);
        router.push("/modulos/productos");
      }
    };

    if (perfil) cargarProducto();
  }, [id, perfil]);

  // ============================
  // Guardar cambios (PUT)
  // ============================
  const handleSubmit = async (form) => {
    try {
      const res = await fetch(
        `/api/productos/${id}?localId=${perfil?.localId || 0}`,
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

      router.push("/modulos/productos");
    } catch (err) {
      console.error("Error guardando producto:", err);
      alert("Error interno");
    }
  };

  // ============================
  // Cerrar modal
  // ============================
  const handleClose = () => {
    router.push("/modulos/productos");
  };

  return (
    <ModalProducto
      open={open}
      onClose={handleClose}
      onSubmit={handleSubmit}
      catalogos={catalogos}
      initialData={initialData}
      localId={perfil?.localId || 0}
    />
  );
}
