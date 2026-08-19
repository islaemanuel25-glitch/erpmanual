"use client";

import { useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiToggleEstado from "@/components/sunmi/SunmiToggleEstado";
import { useSunmiTheme } from "@/components/sunmi/SunmiThemeProvider";
import { SUNMI_THEMES } from "@/lib/sunmiThemes";
import { useUser } from "@/app/context/UserContext";
import { useLayoutSettings } from "@/app/context/LayoutSettingsContext";
import SinPermisos from "@/components/auth/SinPermisos";
import { PanelLeft, PanelTop, LayoutGrid, Building2, Smartphone } from "lucide-react";

const MENU_MODES = [
  { key: "sidebarLeft", label: "Sidebar izquierdo", description: "Menú lateral con iconos (comportamiento actual).", Icon: PanelLeft },
  { key: "topbar", label: "Menú superior", description: "Barra horizontal arriba con dropdowns.", Icon: PanelTop },
  { key: "launcher", label: "App / Launcher", description: "Grilla de aplicaciones desde un botón flotante.", Icon: LayoutGrid },
];

// Grilla de themes reutilizable. `seleccion` marca el theme activo de ESA sección.
function ThemeGrid({ seleccion, onSelect, disabled, etiquetaActivo, etiquetaAplicar }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Object.values(SUNMI_THEMES).map((t) => (
        <SunmiCard
          key={t.key}
          className={`flex flex-col justify-between gap-3 ${seleccion === t.key ? "ring-2 ring-amber-400" : ""}`}
        >
          <div>
            <h3 className="text-sm font-semibold mb-1">{t.label}</h3>
            <div className="rounded-xl border border-dashed sunmi-border p-3 text-xs mt-2">
              <div className={`mb-2 rounded-lg border px-2 py-1 ${t.header.bg} ${t.header.border}`}>
                <div className={t.header.text}>Header ejemplo</div>
              </div>
              <div className={`rounded-lg px-2 py-2 text-xs ${t.card}`}>Card ejemplo</div>
              <div className="mt-2 flex gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${t.badgeActivo}`}>Activo</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${t.badgeInactivo}`}>Inactivo</span>
              </div>
            </div>
          </div>
          <SunmiButton onClick={() => onSelect(t.key)} disabled={disabled} color={seleccion === t.key ? "cyan" : "slate"}>
            {seleccion === t.key ? etiquetaActivo : etiquetaAplicar}
          </SunmiButton>
        </SunmiCard>
      ))}
    </div>
  );
}

export default function AparienciaPage() {
  const {
    setThemeKey,
    limpiarPreferenciaPersonal,
    setInstitucional,
    personalKey,
    institucionalKey,
    tienePreferenciaPersonal,
  } = useSunmiTheme();
  const { menuMode, setMenuMode } = useLayoutSettings();
  const { perfil, cargando, refrescar } = useUser();
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  // ── LAS PREFERENCIAS DE LA TARJETA, EN ESTA MISMA PANTALLA ──────────────
  //
  // El estado arranca del perfil, que las trae de `/api/me` ya resueltas a
  // booleano. Si el local nunca las tocó llegan en `false`, que es lo que se ve
  // hoy.
  const [tarjeta, setTarjeta] = useState({
    tarjetaOcultarEquivalencia: perfil?.tarjetaOcultarEquivalencia === true,
  });

  // ── SE GUARDA UNA SOLA PREFERENCIA POR VEZ, A PROPÓSITO ─────────────────
  //
  // El cuerpo lleva ÚNICAMENTE la que cambió. Del otro lado el update es parcial
  // —`datosAActualizar`—, así que lo que no se manda no se toca. Mandar las dos
  // siempre funcionaría igual hoy, pero volvería a atar dos decisiones que son
  // independientes, que es exactamente lo que hacía el JSON de apariencia.
  const guardarTarjeta = async (campo, valor) => {
    setGuardando(true);
    setMensaje(null);
    const previo = tarjeta[campo];
    setTarjeta((t) => ({ ...t, [campo]: valor }));
    try {
      const res = await fetch("/api/config/apariencia-local", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [campo]: valor }),
      });
      const data = await res.json();
      if (data.ok) {
        setMensaje({ tipo: "ok", texto: "Tarjeta de productos actualizada." });
        // El catálogo lee esto del perfil, así que hay que refrescarlo o el
        // cambio recién se vería al volver a entrar a la aplicación.
        await refrescar?.();
      } else {
        setTarjeta((t) => ({ ...t, [campo]: previo }));
        setMensaje({ tipo: "error", texto: data.error || "No se pudo guardar." });
      }
    } catch {
      setTarjeta((t) => ({ ...t, [campo]: previo }));
      setMensaje({ tipo: "error", texto: "No se pudo guardar." });
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return null;
  if (!perfil) return <SinPermisos />;

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puedeInstitucional = esAdmin || permisos.includes("config_local.apariencia");

  // Guardar apariencia INSTITUCIONAL del local (persistente + compartida).
  const guardarInstitucional = async (tema) => {
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await fetch("/api/config/apariencia-local", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ apariencia: { tema } }),
      });
      const data = await res.json();
      if (data.ok) {
        // Refrescar de inmediato en este dispositivo (los demás la toman al cargar).
        setInstitucional(data.apariencia?.tema ?? tema);
        setMensaje({ tipo: "ok", texto: "Apariencia del local actualizada." });
      } else {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo guardar." });
      }
    } catch {
      setMensaje({ tipo: "error", texto: "Error de conexión." });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <SunmiHeader title="Apariencia del ERP" subtitle="Apariencia del local (compartida) y preferencia de este dispositivo." />

      {/* ---- APARIENCIA INSTITUCIONAL DEL LOCAL ---- */}
      {puedeInstitucional && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={18} className="sunmi-text-accent" />
            <h2 className="text-lg font-semibold">Apariencia del local</h2>
          </div>
          <p className="text-xs sunmi-text-muted mb-4">
            Persistente y compartida: se aplica en todos los dispositivos que operen este local
            (salvo que el dispositivo tenga una preferencia personal). Requiere permiso de configuración del local.
          </p>
          <ThemeGrid
            seleccion={institucionalKey}
            onSelect={guardarInstitucional}
            disabled={guardando}
            etiquetaActivo="Apariencia del local"
            etiquetaAplicar="Fijar para el local"
          />
          {mensaje && (
            <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${mensaje.tipo === "ok" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
              {mensaje.texto}
            </div>
          )}

          {/* ── LA TARJETA DE PRODUCTOS ──────────────────────────────────
              Va en esta sección y no en una nueva porque es lo mismo que el
              tema: apariencia del LOCAL, compartida por todos sus dispositivos,
              con el mismo permiso. Y va DEBAJO del tema, separada, porque la
              página ya mezcla tres ámbitos —local, dispositivo y menú— y
              agregar una cuarta cosa suelta arriba lo empeoraría. */}
          <div className="mt-6 pt-5 border-t sunmi-divider">
            <h3 className="text-sm font-semibold mb-1">Tarjeta de productos</h3>
            <p className="text-xs sunmi-text-muted mb-4">
              Cómo se ve el catálogo en pantallas angostas, para todo el local. Apagada
              se ve como hasta ahora.
            </p>

            {/* ── ACÁ HABÍA UN SEGUNDO INTERRUPTOR Y SE SACÓ ──────────────────
                "Mostrar siempre el precio por unidad" quedó SIN EFECTO el
                2026-08-19, cuando la tarjeta pasó a mostrar la escala en la que
                se VENDE: desde entonces el número lo decide el POS y no hay nada
                que elegir. En un local ya muestra el unitario sin prenderlo, y
                en el depósito forzarlo haría que la tarjeta contradiga al
                mostrador.
                Un interruptor que no hace nada es peor que no tenerlo: se toca,
                no pasa nada, y lo próximo que se reporta es "el sistema anda
                mal". La COLUMNA de la base se conserva — ver
                `lib/config/aparienciaLocal.js`. */}
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm">Ocultar la equivalencia de bulto</div>
                  <div className="text-xs sunmi-text-muted">
                    Saca el renglón &quot;1 pack = 24 un&quot;. La línea sigue diciendo en qué
                    escala está el precio: no se pierde ese dato.
                  </div>
                </div>
                <div className="shrink-0">
                  <SunmiToggleEstado
                    value={tarjeta.tarjetaOcultarEquivalencia}
                    onChange={(v) => !guardando && guardarTarjeta("tarjetaOcultarEquivalencia", v)}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ---- PREFERENCIA DE ESTE DISPOSITIVO ---- */}
      <section>
        <div className="flex items-center gap-2 mb-1">
          <Smartphone size={18} className="sunmi-text-accent" />
          <h2 className="text-lg font-semibold">Preferencia de este dispositivo</h2>
        </div>
        <p className="text-xs sunmi-text-muted mb-4">
          Solo afecta a este navegador y prevalece sobre la apariencia del local. Si la borrás,
          vuelve a verse la apariencia del local{institucionalKey ? "" : " (o el tema por defecto)"}.
        </p>
        <div className="mb-3">
          <SunmiButton color="slate" onClick={limpiarPreferenciaPersonal} disabled={!tienePreferenciaPersonal}>
            {tienePreferenciaPersonal ? "Usar apariencia del local" : "Usando apariencia del local"}
          </SunmiButton>
        </div>
        <ThemeGrid
          seleccion={personalKey}
          onSelect={setThemeKey}
          disabled={false}
          etiquetaActivo="Preferencia aplicada"
          etiquetaAplicar="Usar en este dispositivo"
        />
      </section>

      {/* ---- DISPOSICIÓN DEL MENÚ (preferencia del dispositivo) ---- */}
      <h2 className="text-lg font-semibold mt-8 mb-4">Disposici&oacute;n del men&uacute;</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MENU_MODES.map((m) => (
          <div key={m.key} onClick={() => setMenuMode(m.key)} className="cursor-pointer">
            <SunmiCard className={`flex items-center gap-4 transition ${menuMode === m.key ? "ring-2 ring-amber-400" : ""}`}>
              <m.Icon size={32} className={menuMode === m.key ? "sunmi-text-accent" : "sunmi-text-muted"} />
              <div>
                <h3 className="text-sm font-semibold">{m.label}</h3>
                <p className="text-xs sunmi-text-muted">{m.description}</p>
              </div>
            </SunmiCard>
          </div>
        ))}
      </div>
    </div>
  );
}
