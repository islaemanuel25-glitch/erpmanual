"use client";

import Link from "next/link";
import { Lightbulb } from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiListItem from "@/components/sunmi/SunmiListItem";
import SunmiNavCard from "@/components/sunmi/SunmiNavCard";
import SinPermisos from "@/components/auth/SinPermisos";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import { puedeVerConfigLocal, puedeVerSeccion } from "@/lib/config/acceso";
import { SECCIONES_POS } from "@/lib/config/seccionesPos";

// CONFIGURACIÓN POS — portada del módulo.
//
// Mobile conserva el chrome GLOBAL del ERP (Header + título mobile de LayoutBase),
// igual que Productos y el resto de los módulos. El rediseño aprobado vive
// solamente dentro del contenido de la página.
//
// El gating no cambia: cada sección se filtra con puedeVerSeccion y una sección
// futura sigue sin Link real aunque se vea en la portada.

export default function ConfiguracionPosPage() {
  const { perfil, cargando } = useUser();
  const { contexto } = useContextoActivo();

  if (cargando) return null;
  if (!puedeVerConfigLocal(perfil)) return <SinPermisos />;

  const visibles = SECCIONES_POS.filter((s) => puedeVerSeccion(perfil, s));
  if (visibles.length === 0) return <SinPermisos />;

  return (
    <>
      {/* MOBILE — contenido aprobado, dentro del shell normal del ERP */}
      <section className="md:hidden min-h-full">
        <div className="space-y-5">
          {/* Acá vivían dos chips con el local y el rol. Se fueron porque el
              Header global del ERP ya muestra las dos cosas, arriba y en todas
              las pantallas: repetirlas dos centímetros más abajo no agrega un
              dato, agrega ruido y hace que ésta se vea distinta del resto. */}
          <p className="text-sm sunmi-text-muted">
            Configurá cómo funciona la venta en este local.
          </p>

          <div className="flex flex-col gap-3">
            {visibles.map((s) => (
              <SunmiNavCard
                key={s.key}
                icon={s.icon}
                label={s.label}
                descripcion={s.descripcion}
                // Sin `href` la tarjeta no navega Y no dibuja la flecha: las dos
                // cosas las decide la pieza a partir del mismo dato, así que no
                // pueden quedar en desacuerdo. Una sección futura no tiene
                // destino, y `seccionesPos` tiene un candado que lo exige.
                href={s.href}
                atenuado={s.disponible === false}
                estado={s.disponible === false ? "Próximamente" : null}
              />
            ))}
          </div>

          <div className="sunmi-btn-accent-soft flex items-start gap-3 rounded-2xl p-4">
            <span className="sunmi-badge-accent flex size-10 shrink-0 items-center justify-center rounded-full">
              <Lightbulb className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold sunmi-text-accent">Tip</p>
              <p className="mt-1 text-sm leading-snug sunmi-text-muted">
                Cada sección personaliza el POS según las necesidades del local.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* DESKTOP — sin cambios funcionales ni visuales en esta tanda */}
      <div className="hidden max-w-2xl mx-auto md:block">
        <SunmiHeader
          title="Configuración POS"
          subtitle={contexto?.nombre ? `Local: ${contexto.nombre}` : undefined}
        />

        <p className="text-xs sunmi-text-muted mb-4 px-1">
          Configurá cómo funciona la venta. Cada tema tiene su propia sección.
        </p>

        <div className="flex flex-col gap-3">
          {visibles.map((s) => {
            const disponible = s.disponible !== false;

            const tarjeta = (
              <SunmiCard className={`p-3 ${disponible ? "" : "opacity-60"}`}>
                <SunmiListItem
                  clickable={disponible}
                  label={s.label}
                  description={
                    s.nota ? `${s.descripcion} · ${s.nota}` : s.descripcion
                  }
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
    </>
  );
}
