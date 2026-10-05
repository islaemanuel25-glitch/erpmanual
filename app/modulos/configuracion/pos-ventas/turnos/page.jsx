"use client";

// app/modulos/configuracion/pos-ventas/turnos/page.jsx
//
// EL CATÁLOGO DE TURNOS OPERATIVOS DEL LOCAL (config_local.pos).
//
// Los turnos que use este local: nombre, orden, activo y una ventana de
// reconocimiento opcional. La ventana NO es la duración del turno: la apertura
// la usa para proponer el turno, y quien abre confirma o cambia. Las ventanas
// de dos turnos se pueden solapar: a esa hora, la apertura pregunta. Tesorería
// recibe y verifica el efectivo por turno. Un turno no se borra —una caja o
// una verificación pueden apuntarlo—: se desactiva, y deja de ofrecerse para
// abrir caja.

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
import { LARGO_MAXIMO_NOMBRE_TURNO, descripcionDeVentana } from "@/lib/caja/turnoOperativo";

/** La ventana de un turno como la muestran los dos campos de hora. */
const ventanaDe = (t) => ({ inicio: t.horaInicioReconocimiento ?? "", fin: t.horaFinReconocimiento ?? "" });

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
  const [nuevaVentana, setNuevaVentana] = useState({ inicio: "", fin: "" });
  const [nombres, setNombres] = useState({});
  const [ventanas, setVentanas] = useState({});
  const [mensaje, setMensaje] = useState(null);

  const aplicarLectura = useCallback((json) => {
    if (json?.ok) {
      setTurnos(json.turnos || []);
      setNombres({});
      setVentanas({});
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
    const cuerpo = { nombre: nuevo, horaInicioReconocimiento: nuevaVentana.inicio, horaFinReconocimiento: nuevaVentana.fin };
    hacer(() => pedir(URL_CATALOGO, "POST", cuerpo), `Turno «${nuevo.trim()}» agregado`).then(() => {
      setNuevo("");
      setNuevaVentana({ inicio: "", fin: "" });
    });
  };
  const renombrar = (t) => {
    const nombre = nombres[t.id];
    hacer(() => pedir(`${URL_CATALOGO}/${t.id}`, "PATCH", { nombre }), "Nombre guardado");
  };
  // Las dos horas vacías sacan la ventana: el turno deja de proponerse solo.
  const guardarVentana = (t) => {
    const v = ventanas[t.id];
    hacer(
      () => pedir(`${URL_CATALOGO}/${t.id}`, "PATCH", { horaInicioReconocimiento: v.inicio || null, horaFinReconocimiento: v.fin || null }),
      "Horario de reconocimiento guardado"
    );
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
            El orden de la lista es el ciclo del local: después del último turno viene el primero. El horario de
            reconocimiento dice dónde empieza cada turno en el día; no es su duración. Al abrir una caja se puede elegir el
            turno que está en curso —aunque se haya extendido— o el que sigue en el ciclo, y la fecha operativa sale de
            esa ocurrencia. Si la hora cae en el horario de un solo turno, se propone ese y se puede cambiar. El horario
            es opcional, pero un turno sin horario no se puede ubicar en el día: cuando es el que sigue, la apertura pide
            cargárselo. Un turno desactivado deja de ofrecerse y las cajas que ya lo usaron lo conservan.
          </SunmiAviso>

          {turnos.length === 0 && (
            <SunmiAviso tono="warning" titulo="Este local todavía no usa turnos operativos">
              Mientras no tenga ninguno, las cajas abren sin turno. Al agregar el primero, toda caja nueva va a pedir un
              turno, y desactivarlos después no vuelve atrás.
            </SunmiAviso>
          )}
          {turnos.length > 0 && !turnos.some((t) => t.activo) && (
            <SunmiAviso tono="warning" titulo="Ningún turno activo">
              Este local ya usa turnos operativos: sin uno activo, no se puede abrir caja.
            </SunmiAviso>
          )}

          {turnos.map((t, i) => {
            const editado = nombres[t.id] !== undefined && nombres[t.id] !== t.nombre;
            const ventana = ventanas[t.id] ?? ventanaDe(t);
            const ventanaEditada = ventanas[t.id] !== undefined && (ventana.inicio !== ventanaDe(t).inicio || ventana.fin !== ventanaDe(t).fin);
            const cambiarVentana = (campo) => (e) => setVentanas((v) => ({ ...v, [t.id]: { ...ventana, [campo]: e.target.value } }));
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
                <div className="flex flex-col gap-1">
                  <span className="text-sm2 sunmi-text-muted">Horario de reconocimiento (opcional)</span>
                  <div className="flex items-center gap-2">
                    <SunmiInput type="time" aria-label={`Desde, ${t.nombre}`} value={ventana.inicio} onChange={cambiarVentana("inicio")} />
                    <SunmiInput type="time" aria-label={`Hasta, ${t.nombre}`} value={ventana.fin} onChange={cambiarVentana("fin")} />
                    {ventanaEditada && (
                      <SunmiButton color="primary" disabled={ocupado} onClick={() => guardarVentana(t)}>
                        Guardar
                      </SunmiButton>
                    )}
                  </div>
                  <span className="text-sm2 sunmi-text-muted">{descripcionDeVentana(t)}</span>
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
                placeholder="Nombre del turno"
                value={nuevo}
                maxLength={LARGO_MAXIMO_NOMBRE_TURNO}
                onChange={(e) => setNuevo(e.target.value)}
              />
              <SunmiButton color="primary" disabled={ocupado || !nuevo.trim()} onClick={agregar}>
                Agregar
              </SunmiButton>
            </div>
            <span className="text-sm2 sunmi-text-muted">Horario de reconocimiento (opcional)</span>
            <div className="flex items-center gap-2">
              <SunmiInput
                type="time"
                aria-label="Desde, turno nuevo"
                value={nuevaVentana.inicio}
                onChange={(e) => setNuevaVentana((v) => ({ ...v, inicio: e.target.value }))}
              />
              <SunmiInput
                type="time"
                aria-label="Hasta, turno nuevo"
                value={nuevaVentana.fin}
                onChange={(e) => setNuevaVentana((v) => ({ ...v, fin: e.target.value }))}
              />
            </div>
          </SunmiCard>

          {mensaje && <SunmiAviso tono={mensaje.tipo === "ok" ? "success" : "danger"}>{mensaje.texto}</SunmiAviso>}
        </div>
      )}
    </div>
  );
}
