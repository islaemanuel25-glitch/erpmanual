"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ModalProducto from "@/components/productos/ModalProductoFinal";
import { useUser } from "@/app/context/UserContext";

export default function NuevoProductoPage() {
  const router = useRouter();
  const { perfil } = useUser(); // local actual

  const [catalogos, setCatalogos] = useState({
    CATEGORIAS: [],
    PROVEEDORES: [],
    AREAS: [],
  });

  const [open, setOpen] = useState(true);

  // ============================
  // Cargar catálogos (FIX)
  // ============================
  useEffect(() => {
    const cargar = async () => {
      try {
        const [cat, prov, area] = await Promise.all([
          fetch("/api/categorias/listar", { credentials: "include" }).then(r => r.json()),
          fetch("/api/proveedores/listar", { credentials: "include" }).then(r => r.json()),
          fetch("/api/areas-fisicas/listar", { credentials: "include" }).then(r => r.json()),
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
  // Crear producto
  // ============================
  const handleSubmit = async (form) => {
    try {
      const localId = perfil?.localId || 0;

      const res = await fetch(`/api/productos/crear?localId=${localId}`, {
        credentials: "include",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!data.ok) {
        alert(data.error || "Error al crear producto");
        return;
      }

      router.push("/modulos/productos");
    } catch (err) {
      console.error("Error guardando producto:", err);
      alert("Error interno");
    }
  };

  const handleClose = () => {
    router.push("/modulos/productos");
  };

  return (
    <ModalProducto
      open={open}
      onClose={handleClose}
      onSubmit={handleSubmit}
      catalogos={catalogos}
      initialData={null}
      localId={perfil?.localId || 0}
    />
  );
}
