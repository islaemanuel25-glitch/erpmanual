"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

import SunmiPill from "@/components/sunmi/SunmiPill"; // 🔥 agregado para chips
import { Search } from "lucide-react";

import ModalProveedor from "@/components/proveedores/ModalProveedor";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

const PAGE_SIZE = 10;

export default function ProveedoresPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  const nuevo = searchParams.get("nuevo");
  const editarId = searchParams.get("editar");

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("activos");

  const [page, setPage] = useState(1);

  const [editData, setEditData] = useState(null);

  // =========================================================
  // CARGAR LISTA
  // =========================================================
  const cargar = async () => {
    try {
      setLoading(true);

      const res = await fetch(
        `/api/proveedores/listar?search=${search}&estado=${estado}&page=${page}&pageSize=${PAGE_SIZE}`,
        { credentials: "include" }
      );

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
  }, [search, estado, page]);

  // =========================================================
  // CARGAR EDITAR
  // =========================================================
  useEffect(() => {
    const loadEdit = async () => {
      if (!editarId) return;

      const res = await fetch(`/api/proveedores/obtener?id=${editarId}`, {
        credentials: "include",
      });

      const data = await res.json();
      if (data.ok) setEditData(data.item);
    };
    loadEdit();
  }, [editarId]);

  const cerrarModal = () => {
    setEditData(null);
    router.push("/modulos/proveedores");
  };

  // =========================================================
  // CREAR
  // =========================================================
  const crearProveedor = async (form) => {
    const res = await fetch("/api/proveedores/crear", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    if (data.ok) {
      cerrarModal();
      cargar();
    } else alert(data.error || "Error al crear proveedor");
  };

  // =========================================================
  // EDITAR
  // =========================================================
  const guardarEdicion = async (form) => {
    const res = await fetch("/api/proveedores/editar", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, id: editData.id }),
    });

    const data = await res.json();
    if (data.ok) {
      cerrarModal();
      cargar();
    } else alert(data.error || "Error al editar proveedor");
  };

  // =========================================================
  // ELIMINAR
  // =========================================================
  const eliminar = async (id) => {
    if (!confirm("¿Eliminar proveedor?")) return;

    const res = await fetch("/api/proveedores/eliminar", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    const data = await res.json();
    if (data.ok) cargar();
    else alert(data.error || "No se pudo eliminar");
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (!perfil || loadingCtx) return null;
  if (needsContexto) { router.push("/inicio"); return null; }

  const permisosP = perfil?.permisos || [];
  const esAdminP = Array.isArray(permisosP) && permisosP.includes("*");
  if (!esAdminP && !permisosP.includes("proveedores.ver")) return <SinPermisos />;

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <SunmiSeparator label="Filtros" className="my-4" />

        {/* ===================== */}
        {/* FILTROS */}
        {/* ===================== */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-2">
          <div className="flex flex-col md:flex-row gap-3 flex-1">
            <div className="flex-1 relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--pos-link)" }}
              />
              <SunmiInput
                placeholder="Buscar proveedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="!pl-9 !border-2 pulse-neon"
                style={{ borderColor: "var(--pos-link)" }}
              />
            </div>

            <div className="w-full md:w-44 md:shrink-0">
              <SunmiSelectAdv
                value={estado}
                onChange={setEstado}
                className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
              >
                <SunmiSelectOption value="activos">Activos</SunmiSelectOption>
                <SunmiSelectOption value="todos">Todos</SunmiSelectOption>
              </SunmiSelectAdv>
            </div>
          </div>

          <div className="flex gap-2 md:shrink-0 justify-end">
            <SunmiButton
              color="slate"
              className="!border !border-[var(--pos-link)]"
              onClick={() => {
                setSearch("");
                setEstado("activos");
                setPage(1);
              }}
            >
              Limpiar
            </SunmiButton>

            <SunmiButton
             
              onClick={() => router.push("/modulos/proveedores?nuevo=1")}
            >
              ＋ Nuevo
            </SunmiButton>
          </div>
        </div>

        <SunmiSeparator label="Listado" className="my-4" />

        {/* ===================== */}
        {/* TABLA */}
        {/* ===================== */}
        <div className="overflow-x-auto rounded-2xl border sunmi-border">
          <SunmiTable
            headers={[
              "Nombre",
              "Teléfono",
              "Email",
              "CUIT",
              "Días",
              "Compras",
              "Estado",
              "Acciones",
            ]}
          >
            {loading ? (
              <SunmiTableEmpty label="Cargando..." />
            ) : items.length === 0 ? (
              <SunmiTableEmpty label="Sin proveedores" />
            ) : (
              items.map((item) => (
                <SunmiTableRow key={item.id}>
                  <td className="px-3 py-2">{item.nombre}</td>
                  <td className="px-3 py-2">{item.telefono || "-"}</td>
                  <td className="px-3 py-2">{item.email || "-"}</td>
                  <td className="px-3 py-2">{item.cuit || "-"}</td>

                  {/* 🔥 DIAS EN CHIPS */}
                  <td className="px-3 py-2">
                    {item.dias_pedido?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {item.dias_pedido.map((d, i) => (
                          <SunmiPill key={i}>{d}</SunmiPill>
                        ))}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>

                  {/* BOTÓN COMPRAS */}
                  <td className="px-3 py-2 text-center">
                    <SunmiButton
                      onClick={() =>
                        router.push(`/modulos/compras-proveedor/nueva?proveedorId=${item.id}`)
                      }
                    >
                      Nuevo pedido
                    </SunmiButton>
                  </td>

                  {/* Estado */}
                  <td className="px-3 py-2">
                    <SunmiBadgeEstado value={item.activo} />
                  </td>

                  {/* Acciones */}
                  <td className="px-3 py-2 text-right">
                    <div className="flex gap-3 justify-end text-[15px]">
                      <button
                        onClick={() =>
                          router.push(`/modulos/proveedores?editar=${item.id}`)
                        }
                        className="sunmi-link-accent"
                      >
                        ✏️
                      </button>

                      <button
                        onClick={() => eliminar(item.id)}
                        className="sunmi-link-danger"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </SunmiTableRow>
              ))
            )}
          </SunmiTable>
        </div>

        {/* ===================== */}
        {/* PAGINACIÓN */}
        {/* ===================== */}
        <div className="flex justify-between pt-4 px-2">
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

        {/* ===================== */}
        {/* MODAL */}
        {/* ===================== */}
        {nuevo && (
          <ModalProveedor
            open={true}
            onClose={cerrarModal}
            onSubmit={crearProveedor}
          />
        )}

        {editarId && editData && (
          <ModalProveedor
            open={true}
            initialData={editData}
            onClose={cerrarModal}
            onSubmit={guardarEdicion}
          />
        )}
      </SunmiCard>
    </div>
  );
}
