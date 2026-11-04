"use client";

// PAQUETE 3 DE UNA LISTA: "SIN PRODUCTO EN TU CATÁLOGO" (Emanuel, 2026-11-04).
//
// Los renglones de la lista que no son de ningún producto tuyo, uno por
// tarjeta, como vinieron: código, descripción y precio. Es la recepción de
// mercadería copiada, no una pantalla parecida:
//
//   · la tarjeta es `TarjetaLineaFactura` TAL CUAL, con la fila de la lista
//     en la forma que ella lee (`filaParaLaTarjetaDeRecepcion`): para ella es
//     una línea sin vincular, con «Corregir»;
//   · «Corregir» abre «Qué producto es» (`HojaQueProductoEsDeLaLista`): el
//     buscador con los productos del proveedor primero, después todo el
//     catálogo, y si no existe «Crear producto» con el alta de siempre;
//   · elegir o crear vinculan por `filas/[filaId]/vincular`, y la tarjeta se
//     va de acá al paquete que le toca. La lista se relee sin el cargador,
//     como en los otros dos paquetes: el lugar no se pierde.
//
// El armado de la pantalla es el de los otros dos paquetes:
// `SunmiPantallaDeTrabajo`, el buscador con micrófono y el aviso de abajo.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiPantallaDeTrabajo from "@/components/sunmi/SunmiPantallaDeTrabajo";
import SunmiCampoBusquedaVoz from "@/components/sunmi/SunmiCampoBusquedaVoz";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";

import TarjetaLineaFactura from "@/components/compras-proveedor/TarjetaLineaFactura";
import HojaQueProductoEsDeLaLista from "@/components/proveedores/listas/HojaQueProductoEsDeLaLista";
import { ErrorRecuperable } from "@/components/proveedores/listas/PiezasListas";
import { Aviso } from "@/components/proveedores/listas/PiezasPantallas";
import { Marco, DURACION_AVISO_HECHO_MS, TEXTO_HECHO } from "../page";
import { filaParaLaTarjetaDeRecepcion } from "@/lib/proveedores/listas/altaDesdeLaLista";
import {
  TARJETAS_POR_TANDA,
  TITULO_SIN_PRODUCTO,
  explicacionSinProducto,
  filaCoincideConLaBusqueda,
  textoVinculado,
} from "@/lib/proveedores/listas/sinProducto";

export default function SinProductoDeLaListaPage() {
  const params = useParams();
  const id = Number(params?.id);

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [cuantas, setCuantas] = useState(TARJETAS_POR_TANDA);
  /** El renglón con la hoja abierta, o null. */
  const [eligiendo, setEligiendo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  /** `{ texto, vez }`: el aviso de abajo después de vincular. */
  const [hecho, setHecho] = useState(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const puedeListas = permisos.includes("*") || permisos.includes("proveedores.listas");
  // Es el permiso que exige `/api/productos/crear`, que lo revalida igual.
  const puedeCrearProducto = perfil?.esAdmin === true || permisos.includes("*") || permisos.includes("productos.crear");

  useTituloDePagina(TITULO_SIN_PRODUCTO);
  useAccionDePagina(
    () => <SunmiBackButton href="/modulos/proveedores/listas" texto="Listas" className="min-h-toque" />,
    []
  );

  const cargar = useCallback(
    async ({ silencioso = false } = {}) => {
      if (!silencioso) setCargando(true);
      if (!silencioso) setError("");
      try {
        const r = await fetch(`/api/proveedores/listas/${id}/sin-producto`, { credentials: "include", cache: "no-store" });
        const json = await r.json().catch(() => null);
        if (!r.ok || !json?.ok) {
          const texto = json?.error || "No se pudieron cargar los renglones sin producto.";
          if (silencioso) setAviso({ tono: "danger", texto });
          else setError(texto);
          return;
        }
        setDatos(json);
      } catch {
        const texto = "No se pudo conectar con el servidor. Probá de nuevo.";
        if (silencioso) setAviso({ tono: "danger", texto });
        else setError(texto);
      } finally {
        if (!silencioso) setCargando(false);
      }
    },
    [id]
  );

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !puedeListas || needsContexto || !Number.isInteger(id)) return;
    cargar();
  }, [cargar, cargandoUser, cargandoCtx, puedeListas, needsContexto, id]);

  useEffect(() => {
    if (!hecho) return undefined;
    const reloj = setTimeout(() => setHecho(null), DURACION_AVISO_HECHO_MS);
    return () => clearTimeout(reloj);
  }, [hecho]);

  const items = useMemo(() => datos?.items ?? [], [datos]);
  const porId = useMemo(() => new Map(items.map((f) => [f.id, f])), [items]);
  const visibles = useMemo(() => items.filter((f) => filaCoincideConLaBusqueda(f, buscar)), [items, buscar]);

  /** Vincula y relee sin el cargador. Devuelve `{ ok, error? }` a la hoja. */
  const vincular = async (fila, productoBaseId) => {
    setGuardando(true);
    try {
      const r = await fetch(`/api/proveedores/listas/${id}/filas/${fila.id}/vincular`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productoBaseId }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) return { ok: false, error: j?.error || "El servidor no pudo vincularlo y no dijo por qué." };
      setEligiendo(null);
      await cargar({ silencioso: true });
      setHecho({ texto: textoVinculado(j.nombre), vez: Date.now() });
      return { ok: true };
    } catch {
      return { ok: false, error: "No se pudo conectar con el servidor. Nada quedó guardado: probá de nuevo." };
    } finally {
      setGuardando(false);
    }
  };

  if (cargandoUser || cargandoCtx) return null;
  if (!puedeListas) return <SinPermisos />;

  if (needsContexto) {
    return (
      <Marco>
        <SunmiCard className="p-4">
          <p className="text-sm2 text-center sunmi-text-muted">Seleccioná un contexto operativo para ver esta lista.</p>
        </SunmiCard>
      </Marco>
    );
  }

  if (cargando) {
    return (
      <Marco>
        <SunmiCard className="p-6">
          <SunmiLoader />
        </SunmiCard>
      </Marco>
    );
  }

  if (error) {
    return (
      <Marco>
        <ErrorRecuperable mensaje={error} onReintentar={cargar} />
      </Marco>
    );
  }

  const cabecera = datos?.cabecera ?? {};
  const proveedor = cabecera.proveedor ?? null;
  const nombreProveedor = proveedor?.nombre ?? "Proveedor";
  const abierta = cabecera.abierta === true;

  return (
    <Marco>
      <SunmiPantallaDeTrabajo
        contexto={
          <>
            <span className="min-w-0 font-semibold sunmi-text-strong break-words">{nombreProveedor}</span>
            <p className="text-sm2 sunmi-text-muted leading-snug">{explicacionSinProducto(nombreProveedor)}</p>
            <p className="text-sm2 sunmi-text-muted">
              <span className="tabular-nums sunmi-text-strong font-semibold">{items.length}</span>{" "}
              {items.length === 1 ? "renglón sin producto" : "renglones sin producto"}
            </p>
          </>
        }
        buscador={
          <SunmiCampoBusquedaVoz
            value={buscar}
            onChange={(v) => {
              setBuscar(v);
              setCuantas(TARJETAS_POR_TANDA);
            }}
            onVoz={setBuscar}
            placeholder="Buscar código o descripción…"
            ariaLabel="Buscar un renglón por código o descripción"
          />
        }
        antesDeLista={
          !abierta ? (
            <Aviso tono="warning">Esta lista está cerrada: ya no se pueden vincular sus renglones.</Aviso>
          ) : aviso ? (
            <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>
          ) : null
        }
        lista={
          <>
            {visibles.slice(0, cuantas).map((f) => (
              <TarjetaLineaFactura
                key={f.id}
                fila={filaParaLaTarjetaDeRecepcion(f)}
                guardando={!abierta}
                onCorregir={(t) => abierta && setEligiendo(porId.get(t.filaId) ?? null)}
              />
            ))}
            {visibles.length > cuantas && (
              <SunmiButton
                color="slate"
                type="button"
                onClick={() => setCuantas((c) => c + TARJETAS_POR_TANDA)}
                className="w-full min-h-toque justify-center text-sm3"
              >
                Ver {Math.min(TARJETAS_POR_TANDA, visibles.length - cuantas)} más de {visibles.length - cuantas}
              </SunmiButton>
            )}
            {visibles.length === 0 && (
              <p className="text-center py-6 sunmi-text-muted text-sm2">
                {buscar.trim() ? "Ningún renglón se llama así ni tiene ese código." : "No queda ningún renglón sin producto."}
              </p>
            )}
          </>
        }
        pieDePantalla={
          hecho ? (
            <div className="flex items-center justify-between gap-3" role="status" aria-live="polite">
              <span className="min-w-0 text-sm2 sunmi-text-strong break-words">
                {TEXTO_HECHO} {hecho.texto}
              </span>
            </div>
          ) : null
        }
        despuesDelPie={
          eligiendo ? (
            <HojaQueProductoEsDeLaLista
              key={eligiendo.id}
              fila={eligiendo}
              abierta
              onCerrar={() => setEligiendo(null)}
              onVincular={vincular}
              guardando={guardando}
              proveedorId={proveedor?.id ?? null}
              proveedorNombre={proveedor?.nombre ?? null}
              puedeCrearProducto={puedeCrearProducto}
            />
          ) : null
        }
      />
    </Marco>
  );
}
