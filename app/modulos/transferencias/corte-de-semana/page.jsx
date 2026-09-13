// app/modulos/transferencias/corte-de-semana/page.jsx
//
// DÓNDE SE ACUERDA QUÉ DÍA ARRANCA LA SEMANA DE CADA LOCAL (V29).
//
// ── POR QUÉ ES UNA PANTALLA APARTE ────────────────────────────────────────
//
// Porque se configura una vez y se mira casi nunca, y la lista de trabajo se
// mira todos los días. Meterla como un panel adentro de Transferencias sería
// poner una decisión anual en el camino de una tarea diaria.
//
// ── POR QUÉ VIVE BAJO `/modulos/transferencias/` ──────────────────────────
//
// Porque es configuración DE transferencias y así se encuentra sola. Convive
// con `[id]` sin ambigüedad: Next resuelve primero el segmento estático, así
// que `/modulos/transferencias/corte-de-semana` nunca cae en la ficha de una
// transferencia con ese id — que además no puede existir, porque los ids son
// enteros.
//
// ── EL CAMINO PARA LLEGAR ─────────────────────────────────────────────────
//
// Desde el aviso de la lista de trabajo, que aparece cuando hay al menos una
// relación sin configurar. No hay entrada permanente en el menú: es lo que
// decide `TableroMovil`, y queda anotado como decisión sin diseño.
"use client";

import { useCallback, useEffect, useState } from "react";

import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiAviso from "@/components/sunmi/SunmiAviso";

import EncabezadoMovil from "@/components/transferencias/EncabezadoMovil";
import FilaCorteDeSemana from "@/components/transferencias/FilaCorteDeSemana";

import { UNIDADES, rangoDelPeriodo } from "@/lib/transferencias/periodoDePago";

export default function CorteDeSemanaPage() {
  // El contexto entrega `perfil.permisos`, y el administrador es el que tiene
  // el comodín. Se lee igual que en la pantalla de al lado, que es de donde sale
  // esta forma: inventarle otra acá sería leer `permisos` de la raíz y recibir
  // `undefined`, que se comporta como "sin permisos" sin decir por qué.
  const { perfil, cargando: cargandoUsuario } = useUser();
  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");

  const [relaciones, setRelaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState(null);
  const [diaElegido, setDiaElegido] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await fetch("/api/transferencias/acuerdos", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudieron leer los cortes.");
      setRelaciones(j.relaciones || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const empezarAEditar = (r) => {
    setEditando(r.localId);
    setDiaElegido(r.diaDeCorte);
  };

  const guardar = async (localId, dia) => {
    setGuardando(true);
    setError("");
    try {
      const res = await fetch("/api/transferencias/acuerdos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localId, diaDeCorte: dia }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j?.error || "No se pudo guardar el corte.");
      setRelaciones(j.relaciones || []);
      setEditando(null);
      setDiaElegido(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  if (cargandoUsuario) return null;
  if (!esAdmin && !permisos.includes("transferencias.ver")) return <SinPermisos />;

  return (
    <div className="w-full min-h-full px-4 pt-4 pb-4 space-y-3.5">
      <EncabezadoMovil
        titulo="Corte de semana"
        accion={<SunmiBackButton href="/modulos/transferencias" />}
      />

      <p className="text-xs sunmi-text-muted">
        Definí qué día arranca la semana para cada local. Cambia el rango que toma el chip Semana
        y, con él, qué transferencias entran en cada pago.
      </p>

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

      {!cargando && relaciones.length === 0 && !error && (
        <div className="text-center py-12 sunmi-text-muted text-xs">
          Este grupo no tiene locales además del depósito.
        </div>
      )}

      {!cargando &&
        relaciones.map((r) => {
          const esta = editando === r.localId;
          return (
            <FilaCorteDeSemana
              key={r.localId}
              relacion={{
                ...r,
                // El rango que produciría el día que se está tocando, para que
                // elegir "Mar" no sea elegir a ciegas. Se calcula acá porque es
                // una función pura y el servidor no tiene nada que agregarle.
                rangoPropuesto: esta
                  ? rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte: diaElegido })
                  : r.rango,
              }}
              editando={esta}
              diaElegido={diaElegido}
              guardando={guardando && esta}
              onElegirDia={setDiaElegido}
              onEditar={() => empezarAEditar(r)}
              onGuardar={(dia) => guardar(r.localId, dia)}
            />
          );
        })}

      {!cargando && relaciones.length > 0 && (
        <SunmiAviso tono="warning" titulo="Sobre lo ya pagado">
          Cambiar el corte no mueve transferencias ya pagadas. Solo cambia qué entra en el período
          que se está armando.
        </SunmiAviso>
      )}
    </div>
  );
}
