"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

import SunmiUserCell from "@/components/sunmi/SunmiUserCell";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiButtonIcon from "@/components/sunmi/SunmiButtonIcon";

import { Pencil, Trash2 } from "lucide-react";

import ModalUsuario from "@/components/usuarios/ModalUsuario";

const PAGE_SIZE = 25;

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

  // Cargar roles y locales
  useEffect(() => {
    const cargar = async () => {
      try {
        const rRoles = await fetch("/api/usuarios/listarRoles", {
          credentials: "include",
        }).then((r) => r.json());
        const rLocales = await fetch("/api/usuarios/listarLocales", {
          credentials: "include",
        }).then((r) => r.json());

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
  }, [editar, router]);

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

      // Búsqueda
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
      alert(json.error || "Error");
      return;
    }

    closeModal();
    fetchUsuarios();
  };

  const handleEliminar = async (id) => {
    if (!confirm("¿Eliminar usuario?")) return;
    alert("Eliminar no implementado aún.");
  };

  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <SunmiCardHeader
          title="Usuarios del sistema"
          subtitle="Gestioná los usuarios y sus permisos"
          color="amber"
        />

        {/* FILTROS */}
        <SunmiSeparator label="Filtros" color="amber" />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
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

          <div className="flex gap-2">
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

        <SunmiTable headers={["Usuario", "Rol", "Local", "Estado", "Acciones"]}>
          {usuarios.length === 0 ? (
            <SunmiTableEmpty message="No hay usuarios para mostrar" />
          ) : (
            usuarios.map((u) => (
              <SunmiTableRow key={u.id}>
                <td>
                  <SunmiUserCell nombre={u.nombre} email={u.email} />
                </td>

                <td>{u.rol?.nombre ?? "—"}</td>

                <td>{u.local?.nombre ?? "—"}</td>

                <td>
                  <div className="flex justify-center">
                    <SunmiBadgeEstado value={u.activo} />
                  </div>
                </td>

                <td>
                  <div className="flex justify-end gap-1">
                    <SunmiButtonIcon
                      icon={Pencil}
                      color="amber"
                      size={16}
                      onClick={() =>
                        router.push(`/modulos/usuarios?editar=${u.id}`)
                      }
                    />

                    <SunmiButtonIcon
                      icon={Trash2}
                      color="red"
                      size={16}
                      onClick={() => handleEliminar(u.id)}
                    />
                  </div>
                </td>
              </SunmiTableRow>
            ))
          )}
        </SunmiTable>

        {/* PAGINACIÓN */}
        <SunmiSeparator />

        <div className="flex justify-between gap-2">
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
