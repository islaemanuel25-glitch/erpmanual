"use client";

import Link from "next/link";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import { Palette, PackageOpen } from "lucide-react";

const SECCIONES = [
  {
    label: "Apariencia",
    href: "/modulos/configuracion/apariencia",
    icon: Palette,
    descripcion: "Theme visual y disposición del menú.",
  },
  {
    label: "Stock",
    href: "/modulos/configuracion/stock",
    icon: PackageOpen,
    descripcion: "Permitir vender sin stock (modo carga inicial).",
  },
];

export default function ConfiguracionPage() {
  const { perfil, cargando } = useUser();

  if (cargando) return null;

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  if (!esAdmin) return <SinPermisos />;

  return (
    <div className="max-w-2xl mx-auto">
      <SunmiHeader
        title="Configuración"
        subtitle="Elegí una sección para configurar."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SECCIONES.map((s) => (
          <Link key={s.href} href={s.href}>
            <SunmiCard className="flex items-start gap-3 hover:ring-2 hover:ring-amber-400 transition cursor-pointer">
              <s.icon size={24} className="sunmi-text-accent mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold">{s.label}</h3>
                <p className="text-xs sunmi-text-muted">{s.descripcion}</p>
              </div>
            </SunmiCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
