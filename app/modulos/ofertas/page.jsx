"use client";

// LA LISTA DE OFERTAS, EN EL TELÉFONO.
//
// ── LA TARJETA ES LA DEL KIT, NO UNA NUEVA ───────────────────────────────
//
// `TarjetaOfertaMovil` adapta una oferta a `SunmiProductoCard`, que es la MISMA
// pieza que dibujan el catálogo y stock, y la grilla es `SunmiListaProductoCards`,
// la misma de las otras dos listas. Acá no se dibuja un píxel: esta pantalla
// decide qué se pide, qué se muestra y qué se puede tocar.
//
// ── EL BUSCADOR SE FUE ───────────────────────────────────────────────────
//
// Había un campo de búsqueda por nombre arriba de todo. Con las ofertas que hay
// —una en producción— no sirve para nada y ocupa el lugar de lo que importa, que
// es ver qué está cobrando el POS ahora. Vuelve cuando haya volumen que lo
// justifique; el endpoint sigue aceptando `q`, así que devolverlo es una línea.
//
// Con él se fue el filtro por estado, que era una fila de botones con conteos: la
// vista operativa entra en una pantalla y filtrar cinco tarjetas es más trabajo
// que mirarlas.
//
// ── EL BARRIDO CORRE AL ENTRAR, Y ESO NO CAMBIÓ ──────────────────────────
//
// Antes de listar se dispara la comparación de costos. Es acá y no en una tarea
// programada porque el proyecto no tiene planificador. La consecuencia hay que
// saberla: si nadie entra en tres días, nadie se entera de que cambió un costo.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import { useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiSolapas from "@/components/sunmi/SunmiSolapas";
import SunmiListaProductoCards from "@/components/sunmi/SunmiListaProductoCards";

import TarjetaOfertaMovil from "@/components/ofertas/TarjetaOfertaMovil";
import ModalTerminarOferta from "@/components/ofertas/ModalTerminarOferta";

const EN_CURSO = "EN_CURSO";
const TERMINADAS = "TERMINADAS";

const SOLAPAS = [
  { valor: EN_CURSO, texto: "En curso" },
  { valor: TERMINADAS, texto: "Terminadas" },
];

export default function OfertasPage() {
  const router = useRouter();
  const { perfil, cargando } = useUser();

  useTituloDePagina("Ofertas");

  const permisos = useMemo(() => perfil?.permisos || [], [perfil]);
  const esAdmin = permisos.includes("*");
  const puede = useCallback(
    (code) => esAdmin || permisos.includes(code),
    [esAdmin, permisos]
  );

  const puedeVer = puede("ofertas.ver");
  const puedeCrear = puede("ofertas.crear");
  const puedeFinalizar = puede("ofertas.finalizar");
  const puedeEditar = puede("ofertas.editar");

  const [solapa, setSolapa] = useState(EN_CURSO);
  const [items, setItems] = useState([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [error, setError] = useState(null);

  // El modal de terminar: qué oferta, si está trabajando y qué falló.
  const [aTerminar, setATerminar] = useState(null);
  const [terminando, setTerminando] = useState(false);
  const [errorTerminar, setErrorTerminar] = useState(null);

  const archivadas = solapa === TERMINADAS;

  const cargar = useCallback(async () => {
    setCargandoLista(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (archivadas) params.set("archivadas", "1");

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
    } catch (e) {
      setItems([]);
      setError(`No se pudo hablar con el servidor: ${e.message}`);
    } finally {
      setCargandoLista(false);
    }
  }, [archivadas]);

  // El barrido se dispara una vez al entrar, y solo para la vista operativa: en
  // las terminadas no hay nada que revisar. Si falla, no frena la pantalla — el
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
    cargar();
  }, [puedeVer, cargar]);

  const terminarAhora = async () => {
    if (!aTerminar) return;
    setTerminando(true);
    setErrorTerminar(null);
    try {
      const res = await fetch(`/api/ofertas/${aTerminar.id}/finalizar`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErrorTerminar(json?.error || `No se pudo terminar (HTTP ${res.status}).`);
        return;
      }
      setATerminar(null);
      await cargar();
    } catch (e) {
      setErrorTerminar(`No se pudo hablar con el servidor: ${e.message}`);
    } finally {
      setTerminando(false);
    }
  };

  if (cargando) return null;
  if (!puedeVer) return <SinPermisos />;

  return (
    <div className="w-full min-h-full p-4 flex flex-col gap-3.5">
      {puedeCrear && (
        <SunmiButton
          onClick={() => router.push("/modulos/ofertas/nueva")}
          className="w-full sunmi-accion-ancha rounded-md text-sm3 font-medium"
        >
          + Crear oferta
        </SunmiButton>
      )}

      <SunmiSolapas
        opciones={SOLAPAS}
        valor={solapa}
        onCambiar={setSolapa}
        etiqueta="Qué ofertas mostrar"
      />

      {error && (
        <div className="sunmi-panel rounded-lg p-3 text-sm3 sunmi-text-danger">
          {error}
          <div className="mt-2">
            <SunmiButton color="slate" onClick={cargar}>
              Reintentar
            </SunmiButton>
          </div>
        </div>
      )}

      {cargandoLista && !error && <SunmiLoader />}

      {/* ── EL VACÍO NO MANDA A NINGÚN LADO ──────────────────────────────
          Antes decía "Creá la primera con el botón de arriba", que es una
          instrucción para usar un botón que está a la vista. Lo que falta saber
          es qué pasa cuando hay una, y eso es lo que dice ahora. */}
      {!cargandoLista && !error && items.length === 0 && (
        <div className="text-center py-4">
          <div className="text-base2 font-medium sunmi-text-strong">
            {archivadas
              ? "Todavía no terminaste ninguna oferta"
              : "No hay ninguna oferta corriendo"}
          </div>
          <div className="mt-1 text-sm3 sunmi-pos-muted leading-snug">
            {archivadas
              ? "Las que termines van a quedar acá, con quién las terminó y cuándo."
              : "Cuando publiques una, el POS la cobra sola y la vas a ver acá con lo que falta para que termine."}
          </div>
        </div>
      )}

      {!cargandoLista && !error && items.length > 0 && (
        <SunmiListaProductoCards>
          {items.map((o) => (
            <TarjetaOfertaMovil
              key={o.id}
              oferta={o}
              // Una oferta ya terminada no se puede volver a terminar: la ruta
              // contesta 409 y el botón no tendría qué hacer.
              puedeFinalizar={puedeFinalizar && !archivadas}
              puedeEditar={puedeEditar}
              onTerminar={(of) => {
                setErrorTerminar(null);
                setATerminar(of);
              }}
              onEditar={(of) => router.push(`/modulos/ofertas/${of.id}`)}
            />
          ))}
        </SunmiListaProductoCards>
      )}

      <ModalTerminarOferta
        abierto={!!aTerminar}
        oferta={aTerminar}
        trabajando={terminando}
        error={errorTerminar}
        onCerrar={() => setATerminar(null)}
        onTerminar={terminarAhora}
      />
    </div>
  );
}
