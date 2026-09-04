"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Archive, ArrowLeft } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiPill from "@/components/sunmi/SunmiPill";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import TarjetaOferta from "@/components/ofertas/TarjetaOferta";
import { ESTADO_OFERTA, ESTADOS_OPERATIVOS } from "@/lib/ofertas/estados";

// PANTALLA PRINCIPAL DE OFERTAS.
//
// ── LO ARCHIVADO NO ES UNA PESTAÑA MÁS ─────────────────────────────────────
//
// La vista de todos los días muestra lo que está rigiendo, lo que va a regir y
// lo que hay que decidir. Las finalizadas se llegan por "Ver archivadas", que
// cambia la pantalla entera en vez de agregar una solapa gigante: una lista de
// ofertas viejas al lado de las vivas hace que la vista útil se lea peor todos
// los días para servir a algo que se consulta una vez por mes.
//
// ── EL BARRIDO CORRE AL ENTRAR ─────────────────────────────────────────────
//
// Antes de listar se dispara la comparación de costos. Es acá y no en una tarea
// programada porque el proyecto no tiene planificador. La consecuencia hay que
// saberla: si nadie entra en tres días, nadie se entera de que cambió un costo.

export default function OfertasPage() {
  const router = useRouter();
  const { perfil, cargando } = useUser();

  const permisos = useMemo(() => perfil?.permisos || [], [perfil]);
  const esAdmin = permisos.includes("*");
  const puedeVer = esAdmin || permisos.includes("ofertas.ver");
  const puedeCrear = esAdmin || permisos.includes("ofertas.crear");

  const [archivadas, setArchivadas] = useState(false);
  const [q, setQ] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [items, setItems] = useState([]);
  const [resumen, setResumen] = useState({});
  const [cargandoLista, setCargandoLista] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargandoLista(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (archivadas) params.set("archivadas", "1");
      if (q.trim()) params.set("q", q.trim());
      if (estadoFiltro) params.set("estado", estadoFiltro);

      const res = await fetch(`/api/ofertas/listar?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);

      // La rama del error existe y se dibuja. Sin ella, un 500 se vería igual
      // que "no hay ofertas todavía", que es exactamente el defecto del
      // INC-0006 en la pantalla de proveedores.
      if (!res.ok || !json?.ok) {
        setItems([]);
        setError(json?.error || `No se pudo cargar el listado (HTTP ${res.status}).`);
        return;
      }
      setItems(json.items || []);
      setResumen(json.resumen || {});
    } catch (e) {
      setItems([]);
      setError(`No se pudo hablar con el servidor: ${e.message}`);
    } finally {
      setCargandoLista(false);
    }
  }, [archivadas, q, estadoFiltro]);

  // El barrido se dispara una vez al entrar, y solo para la vista operativa: en
  // el archivo no hay nada que revisar. Si falla, no frena la pantalla — el
  // listado vale igual aunque la comparación de costos no haya corrido.
  useEffect(() => {
    if (!puedeVer || archivadas) return;
    let vivo = true;
    fetch("/api/ofertas/barrido", { method: "POST", credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (vivo && j?.ok && (j.marcadas > 0 || j.desmarcadas > 0)) cargar();
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [puedeVer, archivadas, cargar]);

  useEffect(() => {
    if (!puedeVer) return;
    const t = setTimeout(cargar, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [puedeVer, cargar, q]);

  if (cargando) return null;
  if (!puedeVer) return <SinPermisos />;

  const totalPorRevisar = items.reduce((a, o) => a + (o.lineasPorRevisar || 0), 0);

  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <SunmiCardHeader
          title={archivadas ? "Ofertas archivadas" : "Ofertas"}
          subtitle={
            archivadas
              ? "Las que ya se finalizaron. Se pueden duplicar para volver a usarlas."
              : "Lo que está en la calle, lo que viene y lo que hay que decidir."
          }
        />

        {/* Resumen compacto. Solo se dibujan los estados que tienen algo: una
            fila de ceros ocupa lugar y no dice nada. */}
        {!archivadas && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {ESTADOS_OPERATIVOS.filter((e) => (resumen[e] || 0) > 0).map((e) => (
              <SunmiButton
                key={e}
                color={estadoFiltro === e ? "cyan" : "slate"}
                onClick={() => setEstadoFiltro(estadoFiltro === e ? "" : e)}
              >
                {resumen[e]} {e}
              </SunmiButton>
            ))}
            {totalPorRevisar > 0 && (
              <SunmiPill color="amber">
                {totalPorRevisar} {totalPorRevisar === 1 ? "producto por revisar" : "productos por revisar"}
              </SunmiPill>
            )}
          </div>
        )}

        <SunmiSeparator label="Buscar" />
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <div className="flex-1 relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--pos-link)" }}
              aria-hidden="true"
            />
            <SunmiInput
              placeholder="Buscar oferta por nombre..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="!pl-9"
            />
          </div>
          <div className="flex gap-2 md:shrink-0">
            {puedeCrear && !archivadas && (
              <SunmiButton onClick={() => router.push("/modulos/ofertas/nueva")}>+ Crear oferta</SunmiButton>
            )}
            <SunmiButton
              color="slate"
              onClick={() => {
                setEstadoFiltro("");
                setArchivadas((v) => !v);
              }}
            >
              {archivadas ? (
                <span className="inline-flex items-center gap-1">
                  <ArrowLeft size={14} aria-hidden="true" /> Volver
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Archive size={14} aria-hidden="true" /> Ver archivadas
                </span>
              )}
            </SunmiButton>
          </div>
        </div>

        <SunmiSeparator label={archivadas ? "Archivadas" : "En curso"} />

        {error && (
          <div className="sunmi-panel rounded-lg p-3 text-sm sunmi-text-danger mb-2">
            {error}
            <div className="mt-2">
              <SunmiButton color="slate" onClick={cargar}>Reintentar</SunmiButton>
            </div>
          </div>
        )}

        {cargandoLista && !error && <SunmiLoader />}

        {!cargandoLista && !error && items.length === 0 && (
          <div className="sunmi-panel rounded-lg p-4 text-sm sunmi-text-muted text-center">
            {archivadas
              ? "Todavía no hay ofertas archivadas."
              : estadoFiltro || q
              ? "Ninguna oferta coincide con lo buscado."
              : "No hay ofertas todavía. Creá la primera con el botón de arriba."}
          </div>
        )}

        {!cargandoLista && !error && items.length > 0 && (
          <div className="flex flex-col gap-2">
            {items.map((o) => (
              <TarjetaOferta
                key={o.id}
                oferta={o}
                onAbrir={(of) => router.push(`/modulos/ofertas/${of.id}`)}
              />
            ))}
          </div>
        )}
      </SunmiCard>
    </div>
  );
}
