"use client";

import Link from "next/link";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiListItem from "@/components/sunmi/SunmiListItem";
import SinPermisos from "@/components/auth/SinPermisos";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import { puedeVerConfigLocal, puedeVerSeccion } from "@/lib/config/acceso";
import { SECCIONES_POS } from "@/lib/config/seccionesPos";

// CONFIGURACIÓN POS — la portada del módulo.
//
// ── ESTA RUTA CAMBIÓ DE CONTENIDO, NO DE LUGAR ─────────────────────────────
//
// Antes acá vivían directamente los tres toggles de reglas del POS. Ahora es la
// portada y las reglas se mudaron a `/pos-ventas/reglas`, ENTERAS y sin
// reescribir: el archivo se movió con `git mv` y lo único que cambió es el
// título. La lógica de esos toggles no está duplicada en ningún lado.
//
// La ruta se conserva porque es la que ya está en el menú, en la landing de
// tarjetas y en cualquier favorito que alguien haya guardado.
//
// ── CADA SECCIÓN TIENE SU PROPIO PERMISO ───────────────────────────────────
//
// Entrar acá alcanza con cualquiera de los dos de `PERMISOS_CONFIG_POS`. Qué se
// ve adentro lo decide cada fila por separado, porque son cosas distintas: quien
// administra los medios de cobro no tiene por qué poder cambiar si el cliente es
// obligatorio para cerrar una venta.
//
// Una sección sin permiso NO se dibuja, que es la convención del resto del
// sistema: el menú hace exactamente lo mismo.

export default function ConfiguracionPosPage() {
  const { perfil, cargando } = useUser();
  const { contexto } = useContextoActivo();

  if (cargando) return null;
  if (!puedeVerConfigLocal(perfil)) return <SinPermisos />;

  const visibles = SECCIONES_POS.filter((s) => puedeVerSeccion(perfil, s));
  if (visibles.length === 0) return <SinPermisos />;

  return (
    <div className="max-w-2xl mx-auto">
      <SunmiHeader
        title="Configuración POS"
        subtitle={contexto?.nombre ? `Local: ${contexto.nombre}` : undefined}
      />

      <p className="text-xs sunmi-text-muted mb-4 px-1">
        Configurá cómo funciona la venta. Cada tema tiene su propia sección.
      </p>

      <div className="flex flex-col gap-3">
        {visibles.map((s) => {
          // Una sección que TODAVÍA NO EXISTE se muestra apagada y sin envolver
          // en un `Link`. No alcanza con apagarla visualmente: sin quitar el
          // enlace seguiría navegando, y estaría llevando a otro lado del que
          // promete. Ver el comentario de `apariencia` en `seccionesPos.js`.
          const disponible = s.disponible !== false;

          const tarjeta = (
            <SunmiCard className={`p-3 ${disponible ? "" : "opacity-60"}`}>
              <SunmiListItem
                clickable={disponible}
                label={s.label}
                description={s.nota ? `${s.descripcion} · ${s.nota}` : s.descripcion}
                left={
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      disponible ? "sunmi-badge-accent" : "sunmi-badge-muted"
                    }`}
                  >
                    <s.icon size={18} />
                  </span>
                }
                right={<span className="sunmi-text-muted">›</span>}
              />
            </SunmiCard>
          );

          return disponible ? (
            <Link key={s.key} href={s.href}>
              {tarjeta}
            </Link>
          ) : (
            <div key={s.key}>{tarjeta}</div>
          );
        })}
      </div>
    </div>
  );
}
