"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

const PAGE_SIZE = 20;

const ESTADO_COLORS = {
  BORRADOR: "slate",
  CONFIRMADO: "amber",
  ENVIADO: "cyan",
  RECIBIDO: "green",
};

function formatFecha(f) {
  if (!f) return "-";
  return new Date(f).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ComprasProveedorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState("");

  const proveedorIdParam = searchParams.get("proveedorId") || "";

  const cargar = async () => {
    try {
      setLoading(true);
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (estado) qs.set("estado", estado);
      if (proveedorIdParam) qs.set("proveedorId", proveedorIdParam);

      const res = await fetch(`/api/compras-proveedor/listar?${qs}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        setItems(data.items || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [page, estado, proveedorIdParam]);

  // Redirigir a inicio si falta contexto (evitar router.push durante render)
  useEffect(() => {
    if (needsContexto) router.push("/inicio");
  }, [needsContexto, router]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (!perfil || loadingCtx) return null;
  if (needsContexto) return null;

  const permisosP = perfil?.permisos || [];
  const esAdminP = Array.isArray(permisosP) && permisosP.includes("*");
  if (!esAdminP && !permisosP.includes("compras.ver")) return <SinPermisos />;

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <div className="flex items-center justify-between mb-4">
          <SunmiHeader title="Compras a Proveedor" />
          <SunmiButton onClick={() => router.push("/modulos/compras-proveedor/nueva")}>
            ＋ Nuevo pedido
          </SunmiButton>
        </div>

        <SunmiSeparator label="Filtros" className="my-4" />

        <div className="flex flex-col md:flex-row gap-3 px-2 mb-4">
          <div className="w-48">
            <SunmiSelectAdv
              value={estado}
              onChange={setEstado}
              className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
            >
              <SunmiSelectOption value="">Todos los estados</SunmiSelectOption>
              <SunmiSelectOption value="BORRADOR">Borrador</SunmiSelectOption>
              <SunmiSelectOption value="CONFIRMADO">Confirmado</SunmiSelectOption>
              <SunmiSelectOption value="ENVIADO">Enviado</SunmiSelectOption>
              <SunmiSelectOption value="RECIBIDO">Recibido</SunmiSelectOption>
              <SunmiSelectOption value="ANULADO">Anulado</SunmiSelectOption>
            </SunmiSelectAdv>
          </div>

          <SunmiButton
            color="slate"
            className="!border !border-[var(--pos-link)]"
            onClick={() => {
              setEstado("");
              setPage(1);
            }}
          >
            Limpiar
          </SunmiButton>
        </div>

        <SunmiSeparator label="Listado" className="my-4" />

        <div className="overflow-x-auto rounded-2xl border sunmi-border">
          <SunmiTable
            headers={[
              "#",
              "Proveedor",
              "Depósito",
              "Items",
              "Estado",
              "Creado",
              "Acciones",
            ]}
          >
            {loading ? (
              <SunmiTableEmpty label="Cargando..." />
            ) : items.length === 0 ? (
              <SunmiTableEmpty label="Sin pedidos" />
            ) : (
              items.map((item) => (
                <SunmiTableRow key={item.id}>
                  <td className="px-3 py-2 font-mono text-xs">#{item.id}</td>
                  <td className="px-3 py-2">{item.proveedorNombre}</td>
                  <td className="px-3 py-2">{item.depositoNombre}</td>
                  <td className="px-3 py-2 text-center">{item.cantItems}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium
                        ${item.estado === "BORRADOR" ? "sunmi-badge-muted" : ""}
                        ${item.estado === "CONFIRMADO" ? "sunmi-badge-accent" : ""}
                        ${item.estado === "ENVIADO" ? "sunmi-badge-link" : ""}
                        ${item.estado === "RECIBIDO" ? "sunmi-badge-success" : ""}
                        ${item.estado === "ANULADO" ? "sunmi-badge-danger" : ""}
                      `}
                    >
                      {item.estado}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{formatFecha(item.createdAt)}</td>
                  <td className="px-3 py-2">
                    <SunmiButton
                      color="cyan"
                      onClick={() =>
                        router.push(`/modulos/compras-proveedor/${item.id}`)
                      }
                    >
                      Ver
                    </SunmiButton>
                  </td>
                </SunmiTableRow>
              ))
            )}
          </SunmiTable>
        </div>

        <div className="flex justify-between pt-4 px-2">
          <SunmiButton
            color="slate"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            « Anterior
          </SunmiButton>
          <span className="sunmi-text-muted text-sm self-center">
            Página {page} de {totalPages || 1}
          </span>
          <SunmiButton
            color="slate"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente »
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
