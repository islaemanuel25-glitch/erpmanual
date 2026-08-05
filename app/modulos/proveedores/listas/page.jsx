"use client";

// LISTAS DE PROVEEDORES — historial de importaciones.
//
// Página propia, no modal: una importación se revisa con calma y se comparte por
// URL. El historial se pagina EN LA BASE; nunca se traen todas las importaciones
// para paginarlas en memoria.
//
// Solo administradores en esta primera versión: importar una lista mueve el costo
// de todo el catálogo de un proveedor de una sola vez.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileSpreadsheet, Plus } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import {
  BadgeEstado,
  Paginacion,
  Vacio,
  ErrorRecuperable,
} from "@/components/proveedores/listas/PiezasListas";
import { fechaHora, tamanoArchivo } from "@/lib/proveedores/listas/presentacion";

const PAGE_SIZE = 20;

export default function HistorialListasPage() {
  const router = useRouter();
  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [pag, setPag] = useState({ page: 1, paginas: 1, total: 0 });
  const [page, setPage] = useState(1);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await fetch(`/api/proveedores/listas?page=${page}&pageSize=${PAGE_SIZE}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setError(json?.error || "No se pudo cargar el historial.");
        return;
      }
      setItems(json.items ?? []);
      setPag(json.paginacion ?? { page: 1, paginas: 1, total: 0 });
    } catch {
      setError("Error de conexión.");
    } finally {
      setCargando(false);
    }
  }, [page]);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto) return;
    cargar();
  }, [cargar, cargandoUser, cargandoCtx, esAdmin, needsContexto]);

  if (cargandoUser || cargandoCtx) return null;
  // El backend es la autoridad; esto solo evita mostrar una pantalla que va a
  // rebotar con 403 en cada llamada.
  if (!esAdmin) return <SinPermisos />;

  if (needsContexto) {
    return (
      <Marco router={router}>
        <SunmiCard>
          <p className="text-sm text-center py-6 sunmi-text-muted">
            Seleccioná un contexto operativo para ver las importaciones.
          </p>
        </SunmiCard>
      </Marco>
    );
  }

  return (
    <Marco router={router}>
      <SunmiCard className="p-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight inline-flex items-center gap-2">
              <FileSpreadsheet size={18} aria-hidden="true" />
              Listas de proveedores
            </h1>
            <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
              Importaciones de listas de precios. Todavía no se aplica ningún costo.
            </p>
          </div>
          <SunmiButton
            color="cyan"
            onClick={() => router.push("/modulos/proveedores/listas/nueva")}
            className="py-2 !text-xs inline-flex items-center gap-1"
          >
            <Plus size={14} aria-hidden="true" />
            Nueva importación
          </SunmiButton>
        </div>
      </SunmiCard>

      {cargando && (
        <SunmiCard className="p-6">
          <SunmiLoader />
        </SunmiCard>
      )}

      {!cargando && error && <ErrorRecuperable mensaje={error} onReintentar={cargar} />}

      {!cargando && !error && items.length === 0 && (
        <Vacio
          titulo="Todavía no importaste ninguna lista"
          detalle="Subí el Excel de un proveedor para ver qué costos propone."
          accion={
            <SunmiButton
              color="cyan"
              onClick={() => router.push("/modulos/proveedores/listas/nueva")}
              className="py-2 !text-xs"
            >
              Nueva importación
            </SunmiButton>
          }
        />
      )}

      {!cargando && !error && items.length > 0 && (
        <>
          {/* ESCRITORIO: tabla. */}
          <SunmiCard className="hidden lg:block p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="sunmi-border border-b">
                    <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold">Proveedor</th>
                    <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold">Archivo</th>
                    <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold">Fecha</th>
                    <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold">Usuario</th>
                    <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold">Estado</th>
                    <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold text-right">Filas</th>
                    <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold text-right">Listas</th>
                    <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold text-right">Sin cambios</th>
                    <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold text-right">Sin vincular</th>
                    <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold text-right">Bloqueadas</th>
                    <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold text-right">Armado</th>
                    <th className="px-2 py-2 text-[11px] sunmi-text-muted font-semibold text-right">Errores</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="sunmi-border border-b sunmi-row-hover">
                      <td className="px-2 py-2 text-[12px] sunmi-text-strong">{i.proveedor?.nombre ?? "—"}</td>
                      <td className="px-2 py-2 text-[12px] sunmi-text-muted max-w-[24ch]">
                        <div className="truncate" title={i.archivoNombre}>{i.archivoNombre}</div>
                        <div className="text-[10px]">{tamanoArchivo(i.archivoTamano)}</div>
                      </td>
                      <td className="px-2 py-2 text-[11.5px] sunmi-text-muted tabular-nums">{fechaHora(i.createdAt)}</td>
                      <td className="px-2 py-2 text-[12px] sunmi-text-muted">{i.usuario?.nombre ?? "—"}</td>
                      <td className="px-2 py-2"><BadgeEstado estado={i.estado} /></td>
                      <td className="px-2 py-2 text-[12px] tabular-nums text-right sunmi-text-strong">{i.totalFilas}</td>
                      <td className="px-2 py-2 text-[12px] tabular-nums text-right sunmi-text-success">{i.listoParaActualizar}</td>
                      <td className="px-2 py-2 text-[12px] tabular-nums text-right sunmi-text-muted">{i.sinCambios}</td>
                      <td className="px-2 py-2 text-[12px] tabular-nums text-right sunmi-text-muted">{i.noMacheadas}</td>
                      <td className="px-2 py-2 text-[12px] tabular-nums text-right sunmi-text-danger">{i.bloqueadas}</td>
                      <td className="px-2 py-2 text-[12px] tabular-nums text-right sunmi-text-warning">{i.factorDudoso}</td>
                      <td className="px-2 py-2 text-[12px] tabular-nums text-right sunmi-text-danger">{i.errores}</td>
                      <td className="px-2 py-2 text-right">
                        <SunmiButton
                          color="cyan"
                          onClick={() => router.push(`/modulos/proveedores/listas/${i.id}`)}
                          className="py-1.5 px-3 !text-xs"
                        >
                          Ver
                        </SunmiButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SunmiCard>

          {/* MÓVIL: cards. */}
          <div className="lg:hidden space-y-2">
            {items.map((i) => (
              <SunmiCard key={i.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold sunmi-text-strong">{i.proveedor?.nombre ?? "—"}</div>
                    <div className="text-[11px] sunmi-text-muted break-all">{i.archivoNombre}</div>
                  </div>
                  <BadgeEstado estado={i.estado} className="shrink-0" />
                </div>
                <div className="text-[11px] sunmi-text-muted">
                  {fechaHora(i.createdAt)} · {i.usuario?.nombre ?? "—"} · {tamanoArchivo(i.archivoTamano)}
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[11.5px]">
                  <Cifra etiqueta="Filas" valor={i.totalFilas} tono="sunmi-text-strong" />
                  <Cifra etiqueta="Listas" valor={i.listoParaActualizar} tono="sunmi-text-success" />
                  <Cifra etiqueta="Sin cambios" valor={i.sinCambios} tono="sunmi-text-muted" />
                  <Cifra etiqueta="Sin vincular" valor={i.noMacheadas} tono="sunmi-text-muted" />
                  <Cifra etiqueta="Armado" valor={i.factorDudoso} tono="sunmi-text-warning" />
                  <Cifra etiqueta="Bloqueadas" valor={i.bloqueadas} tono="sunmi-text-danger" />
                </div>
                <SunmiButton
                  color="cyan"
                  onClick={() => router.push(`/modulos/proveedores/listas/${i.id}`)}
                  className="w-full py-2 !text-xs"
                >
                  Ver conciliación
                </SunmiButton>
              </SunmiCard>
            ))}
          </div>

          <Paginacion
            page={pag.page}
            paginas={pag.paginas}
            total={pag.total}
            cargando={cargando}
            onPage={setPage}
          />
        </>
      )}
    </Marco>
  );
}

function Cifra({ etiqueta, valor, tono }) {
  return (
    <div className="flex justify-between gap-1">
      <span className="sunmi-text-muted truncate">{etiqueta}</span>
      <span className={`tabular-nums font-semibold ${tono}`}>{valor}</span>
    </div>
  );
}

function Marco({ children, router }) {
  return (
    <div className="p-2 lg:p-3 space-y-3 w-full max-w-[1600px] mx-auto">
      <button
        type="button"
        onClick={() => router.push("/modulos/compras")}
        className="text-[11px] sunmi-text-muted inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Volver a Compras
      </button>
      {children}
    </div>
  );
}
