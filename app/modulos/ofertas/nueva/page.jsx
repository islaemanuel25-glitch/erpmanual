"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiCardHeader from "@/components/sunmi/SunmiCardHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";

import FormularioOferta from "@/components/ofertas/FormularioOferta";
import EditorProductosOferta from "@/components/ofertas/EditorProductosOferta";
import { CONDICION_PAGO_OFERTA } from "@/lib/ofertas/vigencia";
import { desdeInputFechaHora, paraInputFechaHora } from "@/lib/ofertas/formato";

// CREAR UNA OFERTA. Nace como BORRADOR: crear no es publicar.
//
// Las fechas por defecto son de hoy a una semana, que es la forma que tienen
// casi todas —"Semana Galletitas"—. Un valor por defecto que sirve para el caso
// común ahorra dos campos por oferta; los que no encajan se cambian.

export default function NuevaOfertaPage() {
  const router = useRouter();
  const { perfil, cargando } = useUser();
  const { contexto } = useContextoActivo();

  const permisos = useMemo(() => perfil?.permisos || [], [perfil]);
  const puedeCrear = permisos.includes("*") || permisos.includes("ofertas.crear");

  const [datos, setDatos] = useState(() => {
    const ahora = new Date();
    const enUnaSemana = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);
    return {
      nombre: "",
      inicioEn: paraInputFechaHora(ahora),
      finEn: paraInputFechaHora(enUnaSemana),
      condicionPago: CONDICION_PAGO_OFERTA.CUALQUIER_MEDIO,
      observaciones: "",
    };
  });
  const [lineas, setLineas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  if (cargando) return null;
  if (!puedeCrear) return <SinPermisos />;

  const lineasInvalidas = lineas.filter(
    (l) => l.precioOferta === "" || !(Number(l.precioOferta) > 0) || Number(l.precioOferta) >= l.precioNormal
  );

  const guardar = async () => {
    setError(null);

    if (!datos.nombre.trim()) return setError("La oferta necesita un nombre.");
    const inicio = desdeInputFechaHora(datos.inicioEn);
    const fin = desdeInputFechaHora(datos.finEn);
    if (!inicio || !fin) return setError("Revisá las fechas de inicio y finalización.");
    if (lineasInvalidas.length > 0) {
      return setError(
        `Hay ${lineasInvalidas.length} producto${lineasInvalidas.length === 1 ? "" : "s"} con un precio de oferta inválido.`
      );
    }

    setGuardando(true);
    try {
      const res = await fetch("/api/ofertas/crear", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: datos.nombre.trim(),
          inicioEn: inicio,
          finEn: fin,
          condicionPago: datos.condicionPago,
          observaciones: datos.observaciones || null,
          lineas: lineas.map((l) => ({
            productoLocalId: l.productoLocalId,
            precioOferta: Number(l.precioOferta),
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || `No se pudo crear la oferta (HTTP ${res.status}).`);
        return;
      }
      router.push(`/modulos/ofertas/${json.ofertaId}`);
    } catch (e) {
      setError(`No se pudo hablar con el servidor: ${e.message}`);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="w-full min-h-full">
      <SunmiCard>
        <div className="flex items-center gap-2 mb-1">
          <SunmiBackButton onClick={() => router.push("/modulos/ofertas")} />
          <SunmiCardHeader
            title="Nueva oferta"
            subtitle="Se guarda como borrador. Publicarla es un paso aparte."
          />
        </div>

        <FormularioOferta valor={datos} onChange={setDatos} localNombre={contexto?.nombre} />

        <EditorProductosOferta lineas={lineas} onChange={setLineas} />

        {error && (
          <div className="sunmi-panel rounded-lg p-3 text-sm sunmi-text-danger mt-3">{error}</div>
        )}

        <div className="flex gap-2 mt-3">
          <SunmiButton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar borrador"}
          </SunmiButton>
          <SunmiButton color="slate" onClick={() => router.push("/modulos/ofertas")} disabled={guardando}>
            Cancelar
          </SunmiButton>
        </div>
      </SunmiCard>
    </div>
  );
}
