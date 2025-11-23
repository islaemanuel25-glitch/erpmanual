"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ModalUsuario from "@/components/usuarios/ModalUsuario";

export default function NuevoUsuarioPage() {
  const router = useRouter();

  const [roles, setRoles] = useState([]);
  const [locales, setLocales] = useState([]);
  const [open, setOpen] = useState(true);

  // cargar roles + locales
  useEffect(() => {
    const cargar = async () => {
      // ✅ TRAE ROLES REALES DEL CRUD DE ROLES
      const rRoles = await fetch("/api/roles/listar")
        .then((r) => r.json())
        .catch(() => ({ ok: false }));

      // ✅ TRAE LOCALES
      const rLocales = await fetch("/api/locales/listar")
        .then((r) => r.json())
        .catch(() => ({ ok: false }));

      setRoles(Array.isArray(rRoles.items) ? rRoles.items : []);
      setLocales(Array.isArray(rLocales.items) ? rLocales.items : []);
    };

    cargar();
  }, []);

  const handleSubmit = async (form) => {
    const res = await fetch("/api/usuarios/crear", { credentials: "include",
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" , headers: { "Content-Type": "application/json" }},
      body: JSON.stringify(form),
    });

    const json = await res.json();

    if (!json.ok) {
      alert(json.error || "❌ Error al crear usuario");
      return;
    }

    router.push("/modulos/usuarios");
  };

  const handleClose = () => {
    router.push("/modulos/usuarios");
  };

  return (
    <ModalUsuario
      open={open}
      onClose={handleClose}
      onSubmit={handleSubmit}
      roles={roles}
      locales={locales}
      initialData={null}
    />
  );
}
