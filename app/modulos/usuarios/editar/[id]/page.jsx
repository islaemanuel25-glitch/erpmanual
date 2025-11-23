"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import ModalUsuario from "@/components/usuarios/ModalUsuario";

export default function EditarUsuarioPage() {
  const router = useRouter();
  const { id } = useParams();

  const [roles, setRoles] = useState([]);
  const [locales, setLocales] = useState([]);

  const [initialData, setInitialData] = useState(null);
  const [open, setOpen] = useState(true);

  // cargar roles y locales
  useEffect(() => {
    const cargarListas = async () => {
      const rRoles = await fetch("/api/usuarios/listarRoles", { credentials: "include", credentials: "include" }).then((r) => r.json());
      const rLocales = await fetch("/api/usuarios/listarLocales", { credentials: "include", credentials: "include" }).then((r) => r.json());

      setRoles(Array.isArray(rRoles.items) ? rRoles.items : []);
      setLocales(Array.isArray(rLocales.items) ? rLocales.items : []);
    };

    cargarListas();
  }, []);

  // cargar usuario
  useEffect(() => {
    const cargar = async () => {
      const res = await fetch(`/api/usuarios/obtener?id=${id}`, { credentials: "include",
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json();

      if (!json.ok || !json.usuario) {
        alert("❌ Usuario no encontrado");
        router.push("/modulos/usuarios");
        return;
      }

      setInitialData(json.usuario);
    };

    if (id) cargar();
  }, [id]);

  const handleSubmit = async (form) => {
    const res = await fetch(`/api/usuarios/editar/${id}`, { credentials: "include",
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" , headers: { "Content-Type": "application/json" }},
      body: JSON.stringify(form),
    });

    const json = await res.json();

    if (!json.ok) {
      alert(json.error || "❌ Error actualizando usuario");
      return;
    }

    router.push("/modulos/usuarios");
  };

  const handleClose = () => {
    router.push("/modulos/usuarios");
  };

  if (!initialData) return null;

  return (
    <ModalUsuario
      open={open}
      onClose={handleClose}
      onSubmit={handleSubmit}
      roles={roles}
      locales={locales}
      initialData={initialData}
    />
  );
}
