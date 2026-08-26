"use client";

import { useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import ImportarPedidoDesdeArchivo from "@/components/compras-proveedor/ImportarPedidoDesdeArchivo";
import useContextoActivo from "@/hooks/useContextoActivo";

export default function ImportarPedidoPage() {
  const router = useRouter();
  const { perfil } = useUser();
  const { loading, needsContexto } = useContextoActivo();

  if (!perfil || loading) return null;
  if (needsContexto) {
    router.push("/inicio");
    return null;
  }

  const permisos = perfil?.permisos || [];
  const autorizado = permisos.includes("*") || permisos.includes("compras.crear");
  if (!autorizado) return <SinPermisos />;

  return <ImportarPedidoDesdeArchivo />;
}
