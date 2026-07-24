"use client";

import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import BitacoraAuditoria from "@/components/auditoria/BitacoraAuditoria";

export default function AuditoriaPage() {
  const { perfil, cargando } = useUser();

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puede = esAdmin || permisos.includes("auditoria.ver");

  if (cargando) return null;
  if (!puede) return <SinPermisos />;

  return <BitacoraAuditoria />;
}
