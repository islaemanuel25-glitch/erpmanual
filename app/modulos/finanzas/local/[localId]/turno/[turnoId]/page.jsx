// app/modulos/finanzas/local/[localId]/turno/[turnoId]/page.jsx
//
// UN TURNO, DESDE FINANZAS.
//
// ── POR QUÉ CUELGA DEL LOCAL Y NO ES UNA RUTA SUELTA ─────────────────────
//
// Porque así "Volver" es el local, con su período, sin que la URL tenga que
// decir a dónde vuelve. Una ruta de retorno que viene de afuera es una ruta que
// alguien puede elegir; acá el destino se DERIVA del segmento que ya está en el
// camino. Es el mismo criterio que `contextoDelTablero` dejó escrito en
// Transferencias: lo que viaja es el contexto, no un `returnTo`.
//
// ── Y POR QUÉ NO SE MANDA A `/modulos/turnos/[id]` ───────────────────────
//
// Esa pantalla existe y muestra casi lo mismo, pero pide `pos.usar`: es la vista
// del cajero sobre su propia caja. Quien mira Finanzas puede no tener ese
// permiso —un contador, el dueño desde el celular— y mandarlo ahí le daría un
// "Sin permisos" en la mitad del recorrido. Lo que NO se duplica es la
// aritmética: el efectivo esperado sale de `lib/caja/efectivoEsperado.js` en el
// servidor, que es la fuente única.
"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import AccionDePantalla from "@/components/transferencias/AccionDePantalla";

import DetalleDeTurno from "@/components/finanzas/DetalleDeTurno";
import { parseContextoFinanzas, urlDelLocal } from "@/lib/finanzas/contextoFinanzas";

export default function TurnoDeFinanzasPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12">
          <SunmiLoader />
        </div>
      }
    >
      <Turno />
    </Suspense>
  );
}

function Turno() {
  const { localId, turnoId } = useParams();
  const { perfil, cargando: cargandoUsuario } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await fetch(`/api/finanzas/turno/${turnoId}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo abrir el turno.");
      setDatos(j);
    } catch (e) {
      setError(e.message);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [turnoId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El título sale del DATO: por ruta el shell diría "Finanzas" —de dónde se
  // vino— o el id del turno, que no le dice nada a nadie.
  useTituloDePagina(datos?.turno?.aCargo ? `Turno ${datos.turno.aCargo}` : "Turno");

  // ── EL VOLVER SE LLEVA EL PERÍODO CON EL QUE SE ENTRÓ ──────────────────
  //
  // Sin esto, salir de un turno cae en el período de hoy: la pantalla del local
  // se remonta y su estado arranca en el valor por defecto. Es el defecto que
  // Transferencias tiene medido —33 transferencias de una semana pasada,
  // renavegando después de cada una— y acá se evita desde el principio.
  //
  // La dependencia es la CADENA y no el objeto: `useSearchParams` devuelve uno
  // nuevo en cada render, y una fábrica que dependa de él vuelve a registrar en
  // bucle. Y se lee con el hook y no con `window.location`, que no existe al
  // prerenderizar.
  const params = useSearchParams();
  const contextoEnLaUrl = params.toString();
  const volver = useAccionDePagina(
    () => (
      <SunmiBackButton
        href={urlDelLocal(
          localId,
          parseContextoFinanzas(new URLSearchParams(contextoEnLaUrl))
        )}
      />
    ),
    [localId, contextoEnLaUrl]
  );

  if (cargandoUsuario) return null;
  if (!esAdmin && !permisos.includes("finanzas.ver")) return <SinPermisos />;

  return (
    // El mismo tope de ancho que las otras dos de Finanzas. Ver el motivo en
    // `components/finanzas/TableroFinanzas.jsx`.
    <div className="w-full min-h-full mx-auto max-w-4xl px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{volver}</AccionDePantalla>
      <DetalleDeTurno datos={datos} cargando={cargando} error={error} />
    </div>
  );
}
