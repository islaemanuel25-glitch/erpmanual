"use client";

import Link from "next/link";
import {
  ChevronRight,
  Lightbulb,
  Store,
  UserRound,
} from "lucide-react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiListItem from "@/components/sunmi/SunmiListItem";
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

  const rolVisible = perfil?.esAdmin
    ? "Administrador"
    : perfil?.rolNombre || "Usuario";

  return (
    <>
      {/* MOBILE — contenido aprobado, dentro del shell normal del ERP */}
      <section className="md:hidden min-h-full">
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <span className="sunmi-btn-accent-soft inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold">
              <Store className="size-4" aria-hidden="true" />
              {contexto?.nombre ? `Local: ${contexto.nombre}` : "Local activo"}
            </span>

            <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--success-fg)] bg-[color:var(--success-bg-hover)] px-3 py-2 text-sm font-semibold text-[color:var(--success-fg)]">
              <UserRound className="size-4" aria-hidden="true" />
              {rolVisible}
            </span>
          </div>

          <p className="text-sm sunmi-text-muted">
            Configurá cómo funciona la venta en este local.
          </p>

          <div className="flex flex-col gap-3">
            {visibles.map((s) => {
              const disponible = s.disponible !== false;

              const tarjeta = (
                <SunmiCard
                  className={`flex items-center gap-3 p-4 ${disponible ? "" : "opacity-60"}`}
                >
                  <span
                    className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${
                      disponible ? "sunmi-badge-accent" : "sunmi-badge-muted"
                    }`}
                  >
                    <s.icon className="size-6" aria-hidden="true" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold sunmi-text-strong">
                      {s.label}
                    </h3>
                    <p className="mt-1 text-sm leading-snug sunmi-text-muted">
                      {s.descripcion}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {!disponible && (
                      <span className="sunmi-badge-muted rounded-full px-3 py-1 text-xs">
                        Próximamente
                      </span>
                    )}
                    <ChevronRight
                      className="size-5 sunmi-text-muted"
                      aria-hidden="true"
                    />
                  </div>
                </SunmiCard>
              );

              return disponible ? (
                <Link key={s.key} href={s.href} className="block">
                  {tarjeta}
                </Link>
              ) : (
                <div key={s.key}>{tarjeta}</div>
              );
            })}
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
