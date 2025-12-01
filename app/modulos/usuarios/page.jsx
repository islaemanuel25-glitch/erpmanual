"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";

import ModalUsuario from "@/components/usuarios/ModalUsuario";

const PAGE_SIZE = 10;

export default function UsuariosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nuevo = searchParams.get("nuevo");
  const editar = searchParams.get("editar");

  const [modalOpen, setModalOpen] = useState(Boolean(nuevo || editar));

  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [locales, setLocales] = useState([]);

  const [initialData, setInitialData] = useState(null);

  const [search, setSearch] = useState("");
  const [rolFiltro, setRolFiltro] = useState("");
  const [localFiltro, setLocalFiltro] = useState("");
  const [page, setPage] = useState(1);

  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const limpiarFiltros = () => {
    setSearch("");
    setRolFiltro("");
    setLocalFiltro("");
    setPage(1);
  };

  // --------------------------------------------------------
  // CARGAR ROLES Y LOCALES
  // --------------------------------------------------------
  useEffect(() => {
    const cargar = async () => {
      try {
        const rRoles = await fetch("/api/usuarios/listarRoles", {
          credentials: "include",
        }).then((r) => r.json());

        const rLocales = await fetch("/api/usuarios/listarLocales", {
          credentials: "include",
        }).then((r) => r.json());

        setRoles(Array.isArray(rRoles.roles) ? rRoles.roles : []);
        setLocales(Array.isArray(rLocales.locales) ? rLocales.locales : []);
      } catch (e) {
        setRoles([]);
        setLocales([]);
      }
    };

    cargar();
  }, []);

  // --------------------------------------------------------
  // CARGAR USUARIO EN MODO EDICIÓN
  // --------------------------------------------------------
  useEffect(() => {
    if (!editar) {
      setInitialData(null);
      return;
    }

    const cargarUsuario = async () => {
      const res = await fetch(`/api/usuarios/obtener?id=${editar}`, {
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

    cargarUsuario();
  }, [editar]);

  // --------------------------------------------------------
  // CARGA LISTADO
  // --------------------------------------------------------
  const fetchUsuarios = useCallback(async () => {
    try {
      const res = await fetch("/api/usuarios/listar", {
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json();

      if (!json.ok || !Array.isArray(json.usuarios)) {
        setUsuarios([]);
        setTotal(0);
        return;
      }

      let lista = json.usuarios;

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        lista = lista.filter(
          (u) =>
            u.nombre?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q)
        );
      }

      if (rolFiltro) lista = lista.filter((u) => u.rolId === Number(rolFiltro));
      if (localFiltro)
        lista = lista.filter((u) => u.localId === Number(localFiltro));

      setTotal(lista.length);

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE;

      setUsuarios(lista.slice(from, to));
    } catch (e) {
      setUsuarios([]);
      setTotal(0);
    }
  }, [page, search, rolFiltro, localFiltro]);

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  useEffect(() => {
    setPage(1);
  }, [search, rolFiltro, localFiltro]);

  // --------------------------------------------------------
  // ABRIR / CERRAR MODAL
  // --------------------------------------------------------
  useEffect(() => {
    setModalOpen(Boolean(nuevo || editar));
  }, [nuevo, editar]);

  const closeModal = () => {
    router.push("/modulos/usuarios");
  };

  const handleSubmit = async (form) => {
    const url = editar
      ? `/api/usuarios/editar/${editar}`
      : `/api/usuarios/crear`;

    const method = editar ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const json = await res.json();

    if (!json.ok) {
      alert(json.error || "❌ Error");
      return;
    }

    closeModal();
    fetchUsuarios();
  };

  // --------------------------------------------------------
  // RENDER PRINCIPAL
  // --------------------------------------------------------
  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <SunmiSeparator label="Filtros" color="amber" />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-2">
          <div className="flex flex-col md:flex-row gap-3 flex-1">
            <SunmiInput
              placeholder="Buscar usuario..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <SunmiSelectAdv value={rolFiltro} onChange={setRolFiltro}>
              <SunmiSelectOption value="">Rol…</SunmiSelectOption>
              {roles.map((r) => (
                <SunmiSelectOption key={r.id} value={r.id}>
                  {r.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>

            <SunmiSelectAdv value={localFiltro} onChange={setLocalFiltro}>
              <SunmiSelectOption value="">Local…</SunmiSelectOption>
              {locales.map((l) => (
                <SunmiSelectOption key={l.id} value={l.id}>
                  {l.nombre}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
          </div>

          <div className="flex gap-2 justify-end">
            <SunmiButton onClick={limpiarFiltros} color="slate">
              Limpiar
            </SunmiButton>

            <SunmiButton
              onClick={() => router.push("/modulos/usuarios?nuevo=1")}
              color="amber"
            >
              ＋ Nuevo
            </SunmiButton>
          </div>
        </div>

        <SunmiSeparator label="Listado" color="amber" />

        <div className="overflow-x-auto rounded-2xl border border-slate-800">
  <SunmiTable
    headers={[
      "Usuario",
      "Rol",
      "Local",
      "Estado",
      "Acciones",
    ]}
  >
    {usuarios.length === 0 && (
      <SunmiTableEmpty mensaje="No hay usuarios para mostrar" />
    )}

    {usuarios.map((row) => (
      <SunmiTableRow key={row.id}>
        {/* Usuario */}
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-amber-400 text-slate-900 flex items-center justify-center text-xs font-bold">
              {row.nombre?.[0] ?? "?"}
            </div>

            <div className="flex flex-col">
              <span className="text-[13px] font-medium">
                {row.nombre}
              </span>
              <span className="text-[11px] text-slate-400">
                {row.email}
              </span>
            </div>
          </div>
        </td>

        {/* Rol */}
        <td className="px-3 py-2">
          {row.rol?.nombre ?? "—"}
        </td>

        {/* Local */}
        <td className="px-3 py-2">
          {row.local?.nombre ?? "—"}
        </td>

        {/* Estado */}
        <td className="px-3 py-2">
          <SunmiBadgeEstado estado={row.activo} />
        </td>

        {/* Acciones */}
        <td className="px-3 py-2 text-right">
          <div className="flex gap-3 justify-end text-[15px]">
            <button
              onClick={() =>
                router.push(`/modulos/usuarios?editar=${row.id}`)
              }
              className="text-amber-300 hover:text-amber-200"
            >
              ✏️
            </button>
            <button
              onClick={() => handleEliminar(row.id)}
              className="text-red-400 hover:text-red-300"
            >
              🗑️
            </button>
          </div>
        </td>
      </SunmiTableRow>
    ))}
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

          <SunmiButton
            color="slate"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente »
          </SunmiButton>
        </div>
      </SunmiCard>

      {/* MODAL */}
      <ModalUsuario
        open={modalOpen}
        onClose={closeModal}
        onSubmit={handleSubmit}
        roles={roles}
        locales={locales}
        initialData={initialData}
      />
    </div>
  );
}
