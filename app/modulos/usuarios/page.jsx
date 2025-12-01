"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";

import SunmiTableMaster from "@/components/sunmi/SunmiTableMaster";
import ModalUsuario from "@/components/usuarios/ModalUsuario";

// ✅ NUEVO COMPONENTE
import CeldaUsuario from "@/components/usuarios/CeldaUsuario";

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

  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const limpiarFiltros = () => {
    setSearch("");
    setRolFiltro("");
    setLocalFiltro("");
    setPage(1);
  };

  // Cargar roles/locales
  useEffect(() => {
    const cargar = async () => {
      try {
        const rRoles = await fetch("/api/usuarios/listarRoles", { credentials: "include" }).then((r) => r.json());
        const rLocales = await fetch("/api/usuarios/listarLocales", { credentials: "include" }).then((r) => r.json());

        setRoles(rRoles.roles || []);
        setLocales(rLocales.locales || []);
      } catch (e) {
        setRoles([]);
        setLocales([]);
      }
    };

    cargar();
  }, []);

  // Cargar usuario en edición
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
        alert("Usuario no encontrado");
        router.push("/modulos/usuarios");
        return;
      }

      setInitialData(json.usuario);
    };

    cargarUsuario();
  }, [editar]);

  // Cargar listado
  const fetchUsuarios = useCallback(async () => {
    try {
      const res = await fetch("/api/usuarios/listar", {
        credentials: "include",
        cache: "no-store",
      });

      const json = await res.json();

      if (!json.ok || !json.usuarios) {
        setUsuarios([]);
        setTotal(0);
        return;
      }

      let lista = json.usuarios;

      // Busqueda
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        lista = lista.filter(
          (u) =>
            u.nombre?.toLowerCase().includes(q) ||
            u.email?.toLowerCase().includes(q)
        );
      }

      // Filtros
      if (rolFiltro) lista = lista.filter((u) => u.rolId === Number(rolFiltro));
      if (localFiltro) lista = lista.filter((u) => u.localId === Number(localFiltro));

      setTotal(lista.length);

      // Corte por página
      const from = (page - 1) * pageSize;
      const to = from + pageSize;

      setUsuarios(lista.slice(from, to));
    } catch (e) {
      setUsuarios([]);
      setTotal(0);
    }
  }, [page, pageSize, search, rolFiltro, localFiltro]);

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  useEffect(() => {
    setPage(1);
  }, [search, rolFiltro, localFiltro]);

  useEffect(() => {
    setModalOpen(Boolean(nuevo || editar));
  }, [nuevo, editar]);

  const closeModal = () => {
    router.push("/modulos/usuarios");
  };

  const handleSubmit = async (form) => {
    const url = editar ? `/api/usuarios/editar/${editar}` : `/api/usuarios/crear`;
    const method = editar ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const json = await res.json();

    if (!json.ok) {
      alert(json.error || "Error");
      return;
    }

    closeModal();
    fetchUsuarios();
  };

  const handleEliminar = async (id) => {
    if (!confirm("¿Eliminar usuario?")) return;
    alert("Falta implementar eliminar en backend.");
  };

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>

        {/* FILTROS */}
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

        {/* LISTADO */}
        <SunmiSeparator label="Listado" color="amber" />

        <SunmiTableMaster
          columns={[
            { id: "usuario", label: "Usuario" },
            { id: "rol", label: "Rol" },
            { id: "local", label: "Local" },
            { id: "estado", label: "Estado", align: "center" },
          ]}

          rows={usuarios.map((u) => ({
            id: u.id,

            usuario: <CeldaUsuario nombre={u.nombre} email={u.email} />,

            rol: u.rol?.nombre ?? "—",
            local: u.local?.nombre ?? "—",

            estado: (
              <div className="flex justify-center">
                <SunmiBadgeEstado value={u.activo} />
              </div>
            ),
          }))}

          actions={[
            {
              icon: "edit",
              onClick: (row) =>
                router.push(`/modulos/usuarios?editar=${row.id}`),
            },
            {
              icon: "delete",
              onClick: (row) => handleEliminar(row.id),
            },
          ]}

          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          onChangePageSize={(v) => {
            setPageSize(v);
            setPage(1);
          }}
          onPrev={() => setPage((p) => p - 1)}
          onNext={() => setPage((p) => p + 1)}
        />

      </SunmiCard>

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
