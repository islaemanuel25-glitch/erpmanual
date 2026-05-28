"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";

import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiButtonIcon from "@/components/sunmi/SunmiButtonIcon";

import { Pencil, Trash2, Search } from "lucide-react";

import ModalOperador from "@/components/operadores/ModalOperador";

export default function OperadoresPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { perfil, cargando } = useUser();

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puede = esAdmin || permisos.includes("usuarios.gestionar");

  const nuevo = searchParams.get("nuevo");
  const editar = searchParams.get("editar");

  const [modalOpen, setModalOpen] = useState(Boolean(nuevo || editar));
  const [operadores, setOperadores] = useState([]);
  const [locales, setLocales] = useState([]);
  const [initialData, setInitialData] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/operador/locales", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setLocales(d.locales || []))
      .catch(() => setLocales([]));
  }, []);

  useEffect(() => {
    if (!editar) {
      setInitialData(null);
      return;
    }
    const op = operadores.find((o) => o.id === Number(editar));
    setInitialData(op || null);
  }, [editar, operadores]);

  const fetchOperadores = useCallback(async () => {
    try {
      const res = await fetch("/api/operador/listar-todos", { credentials: "include", cache: "no-store" });
      const json = await res.json();
      setOperadores(json.ok ? json.items : []);
    } catch {
      setOperadores([]);
    }
  }, []);

  useEffect(() => { fetchOperadores(); }, [fetchOperadores]);

  useEffect(() => {
    setModalOpen(Boolean(nuevo || editar));
  }, [nuevo, editar]);

  const closeModal = () => router.push("/modulos/operadores");

  const handleSubmit = async (form) => {
    const isEdit = Boolean(editar);
    const url = isEdit ? "/api/operador/editar" : "/api/operador/crear";
    const body = isEdit ? { id: Number(editar), ...form } : form;

    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) return alert(json.error || "Error");
    closeModal();
    fetchOperadores();
  };

  const handleEliminar = async (op) => {
    if (!confirm(`¿Eliminar operador "${op.nombre}" permanentemente?`)) return;
    try {
      const res = await fetch("/api/operador/eliminar", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: op.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return alert(json?.error || "No se pudo eliminar.");
      fetchOperadores();
    } catch { alert("Error de red."); }
  };

  if (cargando) return null;
  if (!puede) return <SinPermisos />;

  let lista = operadores;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    lista = lista.filter((o) => o.nombre?.toLowerCase().includes(q));
  }

  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <SunmiCardHeader title="Operadores" />

        <SunmiSeparator label="Filtros" />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex-1 relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--pos-link)" }}
            />
            <SunmiInput
              placeholder="Buscar operador..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="!pl-9 !border-2 pulse-neon"
              style={{ borderColor: "var(--pos-link)" }}
            />
          </div>
          <div className="flex gap-2 md:shrink-0">
            <SunmiButton onClick={() => setSearch("")} color="slate" className="!border !border-[var(--pos-link)]">Limpiar</SunmiButton>
            <SunmiButton onClick={() => router.push("/modulos/operadores?nuevo=1")}>+ Nuevo</SunmiButton>
          </div>
        </div>

        <SunmiSeparator label="Listado" />
        <SunmiTable headers={["Nombre", "Locales", "Estado", "Acciones"]}>
          {lista.length === 0 ? (
            <SunmiTableEmpty message="No hay operadores para mostrar" />
          ) : (
            lista.map((op) => (
              <SunmiTableRow key={op.id}>
                <td className="font-medium">{op.nombre}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {(op.locales || []).map((l) => (
                      <span key={l.id} className="text-[10px] px-1.5 py-0.5 rounded sunmi-badge-success">{l.nombre}</span>
                    ))}
                    {(!op.locales || op.locales.length === 0) && (
                      <span className="text-[10px] sunmi-text-muted">Sin local</span>
                    )}
                  </div>
                </td>
                <td><div className="flex justify-center"><SunmiBadgeEstado value={op.activo} /></div></td>
                <td>
                  <div className="flex justify-end gap-1">
                    <SunmiButtonIcon icon={Pencil} size={16} onClick={() => router.push(`/modulos/operadores?editar=${op.id}`)} />
                    <SunmiButtonIcon icon={Trash2} color="red" size={16} onClick={() => handleEliminar(op)} />
                  </div>
                </td>
              </SunmiTableRow>
            ))
          )}
        </SunmiTable>
      </SunmiCard>

      <ModalOperador
        open={modalOpen}
        onClose={closeModal}
        onSubmit={handleSubmit}
        locales={locales}
        initialData={initialData}
      />
    </div>
  );
}
