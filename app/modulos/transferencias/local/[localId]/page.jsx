// app/modulos/transferencias/local/[localId]/page.jsx
//
// LA PANTALLA DE ADENTRO DE UN LOCAL (V33b).
//
// ── POR QUÉ ES UNA RUTA Y NO UN ESTADO DE LA ENTRADA ─────────────────────
//
// Fue una decisión, y los dos motivos son de uso y no de arquitectura:
//
//   · EL BOTÓN ATRÁS. Entrar a un local y volver es el movimiento principal de
//     esta pantalla. Con estado, el "atrás" del teléfono saldría de
//     Transferencias entero en vez de volver a la lista, que es lo que
//     cualquiera espera.
//   · VOLVER DEL DETALLE. Desde acá se entra a una transferencia; al volver hay
//     que caer en el local, no en la lista. Con una ruta eso es gratis.
//
// Y una tercera que no es de uso pero pesa: la pantalla se puede abrir por URL,
// así que el arnés puede ir directo sin tener que tocar la lista primero.
//
// ── CONVIVE CON `[id]` SIN AMBIGÜEDAD ────────────────────────────────────
//
// `/modulos/transferencias/local/7` no choca con `/modulos/transferencias/7`
// —el detalle de una transferencia— porque `local` es un segmento estático y
// Next lo resuelve antes que el dinámico. Es el mismo criterio que ya usa
// `corte-de-semana`.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiInput from "@/components/sunmi/SunmiInput";

import AccionDePantalla from "@/components/transferencias/AccionDePantalla";
import CuentaDelPeriodoCerrado from "@/components/transferencias/CuentaDelPeriodoCerrado";
import DiaDeTransferencias from "@/components/transferencias/DiaDeTransferencias";
import { RUTA_TRANSFERENCIAS } from "@/components/transferencias/corteDeSemana";
import { diasDeTransferencias } from "@/lib/transferencias/diasDeTransferencias";

/** El mismo formato de importe que el resto del módulo. */
function money(n) {
  return `$ ${Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function LocalDeTransferenciasPage() {
  const { localId } = useParams();
  const router = useRouter();
  const { perfil, cargando: cargandoUsuario } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [numero, setNumero] = useState("");

  // El título sale del DATO y no de la ruta: por ruta la barra diría
  // "Transferencias", que es de dónde se vino y no dónde se está.
  useTituloDePagina(datos?.local?.nombre || "Local");
  const volver = useAccionDePagina(() => <SunmiBackButton href={RUTA_TRANSFERENCIAS} />, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const url = new URL("/api/transferencias/tablero", window.location.origin);
      // `destino` y no `localId`: `localId` es un parámetro reservado de la API
      // —significa "el alcance que pido" y un no-admin solo puede pasar el
      // suyo—, así que mandarlo desde el depósito daba 403. El motivo largo está
      // en la ruta. El segmento de la URL sí se llama `localId`, y está bien:
      // ahí no hay ninguna convención que pisar.
      url.searchParams.set("destino", String(localId));
      const res = await fetch(url.toString(), { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo cargar el local.");
      setDatos(j);
    } catch (e) {
      setError(e.message);
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [localId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (cargandoUsuario) return null;
  if (!esAdmin && !permisos.includes("transferencias.ver")) return <SinPermisos />;

  const buscado = numero.trim().replace(/^#/, "");
  const delPeriodo = datos?.cerrado?.transferencias || [];
  const visibles = buscado
    ? delPeriodo.filter((t) => String(t.id).includes(buscado))
    : delPeriodo;

  return (
    <div className="w-full min-h-full px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{volver}</AccionDePantalla>

      {cargando && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}

      {error && !cargando && (
        <div className="rounded-xl border sunmi-border-danger px-4 py-3 text-xs sunmi-text-danger">
          {error}
        </div>
      )}

      {!cargando && !error && datos?.cerrado && (
        <>
          <CuentaDelPeriodoCerrado
            cerrado={datos.cerrado}
            enCurso={datos.enCurso}
            unidadNombre="Semana"
            money={money}
          />

          {/* ── EL BUSCADOR Y EL VACÍO CUELGAN DE QUE HAYA ALGO ────────────
              El buscador vive ACÁ y no en la entrada: el número sirve cuando ya
              se sabe cuál se busca, y eso pasa adentro de un local.

              Y no se dibuja si el período cerrado está vacío, por dos motivos.
              Uno: un campo para buscar en una lista sin filas no puede
              encontrar nada. El otro es el que se vio en la captura del local
              sin movimiento — el mismo hecho dicho DOS VECES y con dos
              redacciones distintas: "No se le envió nada en ese período" en la
              tarjeta y "No hay transferencias en el período cerrado" abajo. Lo
              dice la tarjeta, que es donde está el importe en cero. */}
          {delPeriodo.length > 0 && (
            <SunmiInput
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="Buscar transferencia por número"
              inputMode="numeric"
              aria-label="Buscar transferencia por número"
              className="w-full rounded-xl text-sm3"
            />
          )}

          {visibles.length === 0 ? (
            buscado ? (
              <div className="text-center py-12 sunmi-text-muted text-xs">
                Ninguna transferencia de este período tiene ese número.
              </div>
            ) : null
          ) : (
            diasDeTransferencias(visibles).map((dia) => (
              <DiaDeTransferencias
                key={dia.clave}
                dia={dia}
                onRecibir={(t) => router.push(`/modulos/transferencias/${t.id}`)}
                onVer={(t) => router.push(`/modulos/transferencias/${t.id}`)}
                money={money}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}
