"use client";

// NUEVA IMPORTACIÓN de una lista de precios.
//
// Elegir proveedor, subir el Excel, importar. Al terminar se va derecho a la
// conciliación: el número que importa no es "se subió", es qué propone.
//
// ── EL RECARGO SE MUESTRA, NO SE DECIDE ACÁ ─────────────────────────────────
//
// Los valores que se ven —recargo y umbral— vienen de la configuración del
// proveedor y se mandan como sugerencia. El endpoint es la autoridad: si el
// formulario manda cualquier cosa, el servidor usa el default de la
// configuración. La pantalla no es fuente de verdad de ninguna regla comercial.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

import { ErrorRecuperable, Dato } from "@/components/proveedores/listas/PiezasListas";
import {
  proveedorAdmiteImportacion,
  validarArchivoEnCliente,
  mensajeDeError,
  tamanoArchivo,
  porcentaje,
} from "@/lib/proveedores/listas/presentacion";
import { LIMITES } from "@/lib/proveedores/listas/persistencia";
import { CONFIG_ARCOR } from "@/lib/proveedores/listas/configuraciones/arcor";
// El mismo rango con el que va a nacer la importación. Se muestra desde la
// constante y no con un 10 y un 20 escritos acá: si el default cambia, la
// pantalla que lo anuncia tiene que cambiar con él.
import { RANGO_POR_DEFECTO } from "@/lib/proveedores/listas/rangoAumento";

export default function NuevaImportacionPage() {
  const router = useRouter();
  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const inputArchivo = useRef(null);

  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [proveedores, setProveedores] = useState([]);
  const [proveedorId, setProveedorId] = useState("");
  const [archivo, setArchivo] = useState(null);
  const [errorArchivo, setErrorArchivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

  const cargarProveedores = useCallback(async () => {
    setCargando(true);
    setErrorCarga("");
    try {
      const r = await fetch("/api/proveedores/listas/proveedores", {
        credentials: "include",
        cache: "no-store",
      });
      const json = await r.json();
      if (!r.ok || !json?.ok) {
        setErrorCarga(json?.error || "No se pudieron cargar los proveedores.");
        return;
      }
      setProveedores(json.items ?? []);
    } catch {
      setErrorCarga("Error de conexión.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto) return;
    cargarProveedores();
  }, [cargarProveedores, cargandoUser, cargandoCtx, esAdmin, needsContexto]);

  const proveedor = useMemo(
    () => proveedores.find((p) => String(p.id) === String(proveedorId)) ?? null,
    [proveedores, proveedorId]
  );
  const compat = proveedorAdmiteImportacion(proveedor);

  // Los valores comerciales que se van a usar. Se muestran para que nadie
  // importe sin saber con qué recargo, pero el servidor decide.
  const recargoPct = CONFIG_ARCOR.recargoPct;
  const umbralPct = CONFIG_ARCOR.umbralVariacionPct;

  const elegirArchivo = (e) => {
    const f = e.target.files?.[0] ?? null;
    setErrorEnvio(null);
    if (!f) {
      setArchivo(null);
      setErrorArchivo("");
      return;
    }
    const v = validarArchivoEnCliente(f, {
      tamanoMaxBytes: LIMITES.tamanoMaxBytes,
      extensiones: LIMITES.extensiones,
    });
    setArchivo(v.ok ? f : null);
    setErrorArchivo(v.ok ? "" : v.error);
    if (!v.ok && inputArchivo.current) inputArchivo.current.value = "";
  };

  const puedeEnviar = !!proveedor && compat.admite && !!archivo && !errorArchivo && !enviando;

  const importar = async () => {
    if (!puedeEnviar) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo, archivo.name);
      fd.append("proveedorId", String(proveedor.id));
      // Sugerencias: el endpoint las valida y, si no sirven, usa las suyas.
      fd.append("recargoPct", String(recargoPct));
      fd.append("umbralVariacionPct", String(umbralPct));

      const r = await fetch("/api/proveedores/listas/importar", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await r.json().catch(() => null);

      if (!r.ok || !json?.ok) {
        setErrorEnvio(mensajeDeError(json, r.status));
        return;
      }
      router.replace(`/modulos/proveedores/listas/${json.importacionId}`);
    } catch {
      setErrorEnvio({ mensaje: "Error de conexión.", duplicada: false });
    } finally {
      setEnviando(false);
    }
  };

  if (cargandoUser || cargandoCtx) return null;
  if (!esAdmin) return <SinPermisos />;

  if (needsContexto) {
    return (
      <Marco router={router}>
        <SunmiCard>
          <p className="text-sm text-center py-6 sunmi-text-muted">
            Seleccioná un contexto operativo para importar una lista.
          </p>
        </SunmiCard>
      </Marco>
    );
  }

  return (
    <Marco router={router}>
      <SunmiCard className="p-3">
        <h1 className="text-base sm:text-lg font-bold sunmi-text-strong leading-tight">
          Nueva importación
        </h1>
        <p className="text-[11px] sm:text-xs sunmi-text-muted leading-tight">
          Se calcula qué costo propone la lista. No se modifica ningún precio todavía.
        </p>
      </SunmiCard>

      {cargando && (
        <SunmiCard className="p-6">
          <SunmiLoader />
        </SunmiCard>
      )}

      {!cargando && errorCarga && (
        <ErrorRecuperable mensaje={errorCarga} onReintentar={cargarProveedores} />
      )}

      {!cargando && !errorCarga && (
        <SunmiCard className="p-3 space-y-4">
          {/* ── Proveedor ─────────────────────────────────────────────── */}
          <div className="space-y-1">
            <label htmlFor="proveedor" className="text-[12px] font-semibold sunmi-text-strong block">
              Proveedor
            </label>
            <SunmiSelectAdv
              id="proveedor"
              value={proveedorId}
              onChange={(v) => {
                setProveedorId(v);
                setErrorEnvio(null);
              }}
              placeholder="Elegí un proveedor"
              searchable
            >
              {/* Los que no admiten importación se listan igual, con la marca.
                  Esconderlos dejaría al usuario buscando un proveedor que está
                  ahí y que solo necesita que le configuren el formato. */}
              {proveedores.map((prov) => (
                <SunmiSelectOption key={prov.id} value={String(prov.id)}>
                  {prov.admiteImportacion
                    ? prov.nombre
                    : `${prov.nombre} — sin formato configurado`}
                </SunmiSelectOption>
              ))}
            </SunmiSelectAdv>
            {proveedor && !compat.admite && (
              <p className="text-[11.5px] sunmi-text-danger leading-snug">{compat.motivo}</p>
            )}
            {proveedores.length === 0 && (
              <p className="text-[11.5px] sunmi-text-muted">
                No hay proveedores visibles en este contexto.
              </p>
            )}
          </div>

          {/* ── Configuración comercial ───────────────────────────────── */}
          <div className="sunmi-surface-soft sunmi-border border rounded-lg p-3 grid grid-cols-2 gap-3">
            <Dato label="Recargo que se aplica">{porcentaje(recargoPct)}</Dato>
            <Dato label="Umbral de variación alta">{porcentaje(umbralPct)}</Dato>
            <Dato label="Aumento esperado">
              {porcentaje(RANGO_POR_DEFECTO.minPct)} a {porcentaje(RANGO_POR_DEFECTO.maxPct)}
            </Dato>
            <p className="col-span-2 text-[10.5px] sunmi-text-muted leading-snug">
              Son los valores configurados para el proveedor y no se pueden cambiar
              después: quedan guardados en la importación al crearla, y todas sus filas
              se evalúan con estos. Para usar otros hay que importar de nuevo.
            </p>
          </div>

          {/* ── Archivo ───────────────────────────────────────────────── */}
          <div className="space-y-1">
            <label htmlFor="archivo" className="text-[12px] font-semibold sunmi-text-strong block">
              Archivo de la lista ({LIMITES.extensiones.join(", ")})
            </label>
            <input
              ref={inputArchivo}
              id="archivo"
              name="archivo"
              type="file"
              accept=".xlsx"
              onChange={elegirArchivo}
              disabled={enviando}
              className="block w-full text-[12px] sunmi-text-muted file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:sunmi-btn-base file:sunmi-btn-slate"
            />
            {archivo && (
              <p className="text-[11.5px] sunmi-text-success">
                {archivo.name} · {tamanoArchivo(archivo.size)}
              </p>
            )}
            {errorArchivo && <p className="text-[11.5px] sunmi-text-danger">{errorArchivo}</p>}
            <p className="text-[10.5px] sunmi-text-muted">
              Hasta {Math.round(LIMITES.tamanoMaxBytes / 1024 / 1024)} MB y {LIMITES.filasMax} filas.
            </p>
          </div>

          {/* ── El error del servidor ─────────────────────────────────── */}
          {errorEnvio && (
            <div className="sunmi-surface-soft sunmi-border border rounded-lg p-3 space-y-2">
              <p className="text-[12px] sunmi-text-danger leading-snug">{errorEnvio.mensaje}</p>
              {errorEnvio.detalle && (
                <p className="text-[11.5px] sunmi-text-muted">{errorEnvio.detalle}</p>
              )}
              {errorEnvio.duplicada && errorEnvio.importacionId && (
                <SunmiButton
                  color="slate"
                  onClick={() =>
                    router.push(`/modulos/proveedores/listas/${errorEnvio.importacionId}`)
                  }
                  className="py-2 !text-xs"
                >
                  Abrir la importación existente
                </SunmiButton>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2 pt-1">
            <SunmiButton
              color="slate"
              onClick={() => router.push("/modulos/proveedores/listas")}
              disabled={enviando}
              className="py-3 !text-xs order-2 sm:order-1"
            >
              Cancelar
            </SunmiButton>
            <SunmiButton
              color="cyan"
              onClick={importar}
              disabled={!puedeEnviar}
              className="py-3 font-bold !text-xs order-1 sm:order-2 inline-flex items-center justify-center gap-1"
            >
              <Upload size={14} aria-hidden="true" />
              {enviando ? "Importando…" : "Importar y conciliar"}
            </SunmiButton>
          </div>
        </SunmiCard>
      )}
    </Marco>
  );
}

function Marco({ children, router }) {
  return (
    <div className="p-2 lg:p-3 space-y-3 w-full max-w-[720px] mx-auto">
      <button
        type="button"
        onClick={() => router.push("/modulos/proveedores/listas")}
        className="text-[11px] sunmi-text-muted inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Volver al historial
      </button>
      {children}
    </div>
  );
}
