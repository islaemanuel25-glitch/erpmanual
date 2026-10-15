"use client";

// app/modulos/empleados/page.jsx
//
// ADMINISTRACIÓN → EMPLEADOS. Quien trabaja en el local, maneje o no la caja.
// Regla de Emanuel (2026-10-15): todo operador es empleado, no todo empleado es
// operador (cocina, reparto). Sueldo y consumo del personal eligen de acá. Mismo
// permiso y las mismas piezas que la pantalla de Operadores. Y los dos son de UN
// local: la lista, el alta y la edición son las del local activo.

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiButtonIcon from "@/components/sunmi/SunmiButtonIcon";
import ModalEmpleado from "@/components/empleados/ModalEmpleado";

const RUTA = "/modulos/empleados";

export default function EmpleadosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { perfil, cargando } = useUser();

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puede = esAdmin || permisos.includes("config_local.operadores");

  const nuevo = searchParams.get("nuevo");
  const editar = searchParams.get("editar");

  const [empleados, setEmpleados] = useState([]);
  const [operadoresLibres, setOperadoresLibres] = useState([]);
  const [search, setSearch] = useState("");
  const [errorCarga, setErrorCarga] = useState("");
  const [errorModal, setErrorModal] = useState("");

  // Cada guardado suma uno y la lista se vuelve a pedir.
  const [recarga, setRecarga] = useState(0);
  const cargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let vigente = true;
    fetch("/api/empleados/listar-todos", { credentials: "include", cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((json) => {
        if (!vigente) return;
        if (!json?.ok) {
          setErrorCarga(json?.error || "No se pudo cargar la lista de empleados.");
          return;
        }
        setErrorCarga("");
        setEmpleados(json.items);
        setOperadoresLibres(json.operadoresLibres || []);
      })
      .catch(() => {
        if (vigente) setErrorCarga("No se pudo cargar la lista de empleados.");
      });
    return () => {
      vigente = false;
    };
  }, [recarga]);

  const modalOpen = Boolean(nuevo || editar);
  const initialData = editar ? empleados.find((e) => e.id === Number(editar)) || null : null;

  const cerrar = () => {
    setErrorModal("");
    router.push(RUTA);
  };

  const guardar = async (form) => {
    const url = editar ? "/api/empleados/editar" : "/api/empleados/crear";
    const body = editar ? { id: Number(editar), ...form } : form;
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        setErrorModal(json?.error || "No se pudo guardar el empleado.");
        return;
      }
      cerrar();
      cargar();
    } catch {
      setErrorModal("Sin conexión: no se guardó.");
    }
  };

  if (cargando) return null;
  if (!puede) return <SinPermisos />;

  const q = search.trim().toLowerCase();
  const lista = q ? empleados.filter((e) => e.nombre?.toLowerCase().includes(q)) : empleados;

  const columnas = [
    { clave: "nombre", titulo: "Nombre", render: (e) => <span className="font-medium">{e.nombre}</span> },
    {
      clave: "operador",
      titulo: "Operador",
      render: (e) => (e.operador ? e.operador.nombre : <span className="sunmi-text-muted">—</span>),
    },
    {
      clave: "estado",
      titulo: "Estado",
      align: "centro",
      render: (e) => <SunmiBadgeEstado value={e.activo} />,
    },
    {
      clave: "acciones",
      titulo: "Acciones",
      align: "der",
      render: (e) => (
        <SunmiButtonIcon
          icon={Pencil}
          size={16}
          title={`Editar ${e.nombre}`}
          onClick={() => router.push(`${RUTA}?editar=${e.id}`)}
        />
      ),
    },
  ];

  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <SunmiCardHeader title="Empleados" />

        <SunmiSeparator label="Filtros" />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex-1">
            <SunmiInput
              placeholder="Buscar empleado..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 md:shrink-0">
            <SunmiButton onClick={() => setSearch("")} color="slate">
              Limpiar
            </SunmiButton>
            <SunmiButton onClick={() => router.push(`${RUTA}?nuevo=1`)}>+ Nuevo</SunmiButton>
          </div>
        </div>

        <SunmiSeparator label="Listado" />
        {errorCarga ? (
          <p role="alert" className="text-sm2 sunmi-text-danger break-words">
            {errorCarga}
          </p>
        ) : (
          <SunmiTable
            columnas={columnas}
            filas={lista}
            claveFila={(e) => e.id}
            vacio="No hay empleados para mostrar"
          />
        )}
      </SunmiCard>

      <ModalEmpleado
        // Otro empleado, o los datos que llegaron después de abrir: otro
        // formulario, que arranca de lo que hay.
        key={`${editar ?? "nuevo"}-${initialData ? initialData.id : "vacio"}`}
        open={modalOpen}
        onClose={cerrar}
        onSubmit={guardar}
        operadoresLibres={operadoresLibres}
        initialData={initialData}
        error={errorModal}
      />
    </div>
  );
}
