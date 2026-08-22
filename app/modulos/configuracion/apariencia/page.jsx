"use client";

import { useState } from "react";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiButton from "@/components/sunmi/SunmiButton";
// `SunmiToggleEstado` se fue con los dos interruptores de la tarjeta. La pieza
// sigue en el kit y la usan otras pantallas; acá quedó sin consumidor.
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
  // `refrescar` lo usaba el guardado de las preferencias de la tarjeta, que se
  // fue con ellas.
  const { perfil, cargando } = useUser();
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  // ── ACÁ ESTABA EL ESTADO DE LAS PREFERENCIAS DE LA TARJETA ──────────────
  //
  // Con los dos interruptores fuera, no queda ninguna que guardar desde esta
  // pantalla: se fueron el estado y su `guardarTarjeta`. El endpoint sigue
  // aceptando las dos columnas —el PUT es parcial— y el perfil las sigue
  // trayendo; lo que no existe más es una pantalla que las escriba.
  //
  // El motivo de cada una está más abajo, donde estaban los interruptores.

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

          {/* ── ACÁ VIVÍAN LAS PREFERENCIAS DE LA TARJETA, Y NO QUEDA NINGUNA ──
              Eran dos interruptores de apariencia del LOCAL, y los dos quedaron
              sin efecto por el mismo motivo: la tarjeta del celular dejó de
              tener lo que apagaban.

              "Mostrar siempre el precio por unidad" se fue el 2026-08-19, cuando
              la tarjeta pasó a mostrar la escala en la que se VENDE: el número lo
              decide el POS y no hay nada que elegir.

              "Ocultar la equivalencia de bulto" se va ahora, con la franja de
              equivalencia. La presentación pasó a viajar pegada al precio
              —"$31.200 · PACK X 24"— y la otra escala se mudó al dorso.

              La regla es la misma las dos veces: un interruptor que no hace nada
              es peor que no tenerlo. Se toca, no pasa nada, y lo próximo que se
              reporta es "el sistema anda mal".

              Y el de la equivalencia NO se reutilizó para apagar el dorso. Lo que
              ocultaba era un bloque PERMANENTE que aparecía sin pedirlo; el dorso
              solo se ve si alguien lo pide tocando. Darle un sentido nuevo a un
              booleano ya guardado es cambiarle el significado a una preferencia
              que la gente ya tomó, sin avisarles.

              LAS DOS COLUMNAS DE LA BASE SE CONSERVAN. Borrarlas es un DROP
              COLUMN sobre producción a cambio de dos bytes por local, y con ellas
              se iría el dato de cualquiera que las haya prendido. El porqué está
              en `lib/config/aparienciaLocal.js`. */}
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
