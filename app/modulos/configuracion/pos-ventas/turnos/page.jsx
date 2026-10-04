"use client";

// app/modulos/configuracion/pos-ventas/turnos/page.jsx
//
// EL CATÁLOGO DE TURNOS OPERATIVOS DEL LOCAL (config_local.pos).
//
// Mañana, Tarde, Noche, o los que use este local. Sin horas: es un catálogo,
// no una franja horaria. Quien abre una caja elige uno de los ACTIVOS, y
// Tesorería recibe y verifica el efectivo por turno. Un turno no se borra —una
// caja o una verificación pueden apuntarlo—: se desactiva, y deja de ofrecerse
// para abrir caja.

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SinPermisos from "@/components/auth/SinPermisos";
import { useUser } from "@/app/context/UserContext";
import { LARGO_MAXIMO_NOMBRE_TURNO } from "@/lib/caja/turnoOperativo";

const URL_CATALOGO = "/api/config/turnos-operativos";

async function pedir(url, metodo, cuerpo) {
  const res = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const json = await res.json().catch(() => ({}));
  return res.ok && json?.ok ? { ok: true, ...json } : { ok: false, error: json?.error || "No se pudo guardar." };
}

export default function ConfigTurnosOperativosPage() {
  const { perfil, cargando: cargandoUser } = useUser();
  const permisos = perfil?.permisos || [];
  const puede = permisos.includes("*") || permisos.includes("config_local.pos");

  const [turnos, setTurnos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const [nombres, setNombres] = useState({});
  const [mensaje, setMensaje] = useState(null);

  const aplicarLectura = useCallback((json) => {
    if (json?.ok) {
      setTurnos(json.turnos || []);
      setNombres({});
    } else {
      setMensaje({ tipo: "error", texto: json?.error || "No se pudieron leer los turnos del local." });
    }
    setCargando(false);
  }, []);
  const leer = () =>
    fetch(URL_CATALOGO, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({}));
  const cargar = async () => aplicarLectura(await leer());

  useEffect(() => {
    if (!puede) return;
    leer().then(aplicarLectura);
  }, [puede, aplicarLectura]);

  const hacer = async (accion, ok) => {
    if (ocupado) return;
    setOcupado(true);
    setMensaje(null);
    const r = await accion();
    setOcupado(false);
    if (!r.ok) {
      setMensaje({ tipo: "error", texto: r.error });
      return;
    }
    setMensaje({ tipo: "ok", texto: ok });
    await cargar();
  };

  const agregar = () => {
    if (!nuevo.trim()) return;
    hacer(() => pedir(URL_CATALOGO, "POST", { nombre: nuevo }), `Turno «${nuevo.trim()}» agregado`).then(() => setNuevo(""));
  };
  const renombrar = (t) => {
    const nombre = nombres[t.id];
    hacer(() => pedir(`${URL_CATALOGO}/${t.id}`, "PATCH", { nombre }), "Nombre guardado");
  };
  const activar = (t) =>
    hacer(
      () => pedir(`${URL_CATALOGO}/${t.id}`, "PATCH", { activo: !t.activo }),
      t.activo ? `«${t.nombre}» desactivado: ya no se ofrece al abrir caja` : `«${t.nombre}» activado`
    );
  const mover = (i, delta) => {
    const ids = turnos.map((t) => t.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    hacer(() => pedir(URL_CATALOGO, "PUT", { orden: ids }), "Orden guardado");
  };

  if (cargandoUser) return null;
  if (!puede) return <SinPermisos />;

  return (
    <div className="max-w-2xl mx-auto">
      <SunmiHeader title="Turnos operativos" subtitle="Configuración POS · Los turnos que elige quien abre una caja." />

      {cargando ? (
        <SunmiLoader />
      ) : (
        <div className="flex flex-col gap-4">
          <SunmiAviso titulo="Cómo se usan">
            Al abrir una caja se elige de qué turno es. Tesorería recibe y verifica el efectivo de cada turno por separado.
            No tienen horario: el turno no se deduce por la hora. Un turno desactivado deja de ofrecerse al abrir caja y
            las cajas que ya lo usaron lo conservan.
          </SunmiAviso>

          {turnos.length === 0 && (
            <SunmiAviso tono="warning" titulo="Este local no tiene turnos">
              Sin al menos un turno activo no se puede abrir caja en este local.
            </SunmiAviso>
          )}

          {turnos.map((t, i) => {
            const editado = nombres[t.id] !== undefined && nombres[t.id] !== t.nombre;
            return (
              <SunmiCard key={t.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <SunmiInput
                    aria-label={`Nombre del turno ${t.nombre}`}
                    value={nombres[t.id] ?? t.nombre}
                    maxLength={LARGO_MAXIMO_NOMBRE_TURNO}
                    onChange={(e) => setNombres((n) => ({ ...n, [t.id]: e.target.value }))}
                  />
                  {editado && (
                    <SunmiButton color="primary" disabled={ocupado} onClick={() => renombrar(t)}>
                      Guardar
                    </SunmiButton>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm2 ${t.activo ? "sunmi-text-success" : "sunmi-text-muted"}`}>
                    {t.activo ? "Activo: se ofrece al abrir caja" : "Inactivo: no se ofrece"}
                  </span>
                  <div className="flex items-center gap-2">
                    <SunmiButton color="ghost" aria-label={`Subir ${t.nombre}`} disabled={ocupado || i === 0} onClick={() => mover(i, -1)}>
                      <ArrowUp size={16} />
                    </SunmiButton>
                    <SunmiButton
                      color="ghost"
                      aria-label={`Bajar ${t.nombre}`}
                      disabled={ocupado || i === turnos.length - 1}
                      onClick={() => mover(i, 1)}
                    >
                      <ArrowDown size={16} />
                    </SunmiButton>
                    <SunmiButton color="slate" disabled={ocupado} onClick={() => activar(t)}>
                      {t.activo ? "Desactivar" : "Activar"}
                    </SunmiButton>
                  </div>
                </div>
              </SunmiCard>
            );
          })}

          <SunmiCard className="flex flex-col gap-2">
            <label htmlFor="turno-nuevo" className="text-sm font-semibold">
              Agregar un turno
            </label>
            <div className="flex items-center gap-2">
              <SunmiInput
                id="turno-nuevo"
                placeholder="Por ejemplo: Mañana"
                value={nuevo}
                maxLength={LARGO_MAXIMO_NOMBRE_TURNO}
                onChange={(e) => setNuevo(e.target.value)}
              />
              <SunmiButton color="primary" disabled={ocupado || !nuevo.trim()} onClick={agregar}>
                Agregar
              </SunmiButton>
            </div>
          </SunmiCard>

          {mensaje && <SunmiAviso tono={mensaje.tipo === "ok" ? "success" : "danger"}>{mensaje.texto}</SunmiAviso>}
        </div>
      )}
    </div>
  );
}
