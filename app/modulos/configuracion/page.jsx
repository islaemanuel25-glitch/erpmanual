"use client";

import Link from "next/link";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import { puedeVerConfigLocal } from "@/lib/config/acceso";
import { Palette, PackageOpen, Receipt, Wrench, Tags, ShoppingCart, BellRing } from "lucide-react";

// Cada tarjeta declara su gating igual que el menú (lib/menu/registry.js):
//  - `permiso`: el config_local.* (o listas_precios.ver) que la habilita.
//  - `adminOnly`: exclusiva de admin (no la ve DUEÑO_LOCAL/ENCARGADO).
// El backend revalida cada escritura; esto solo decide qué tarjetas se muestran.
const SECCIONES = [
  {
    label: "Apariencia",
    href: "/modulos/configuracion/apariencia",
    icon: Palette,
    descripcion: "Theme visual y disposicion del menu.",
    permiso: "config_local.apariencia",
  },
  {
    label: "Stock",
    href: "/modulos/configuracion/stock",
    icon: PackageOpen,
    descripcion: "Permitir vender sin stock (modo carga inicial).",
    permiso: "config_local.stock",
  },
  {
    label: "POS Ventas",
    href: "/modulos/configuracion/pos-ventas",
    icon: ShoppingCart,
    descripcion: "Reglas de cierre de venta del POS (cliente y operario obligatorio).",
    permiso: "config_local.pos",
  },
  {
    label: "Editor de Ticket",
    href: "/modulos/configuracion/ticket",
    icon: Receipt,
    descripcion: "Personalizar tipografia y estilos del ticket termico.",
    permiso: "config_local.ticket",
  },
  {
    label: "Listas de precios",
    href: "/modulos/configuracion/listas-precios",
    icon: Tags,
    descripcion: "Administrá listas de precios comerciales del grupo (minorista, mayorista, costos).",
    permiso: "listas_precios.ver",
  },
  {
    label: "Alertas del dispositivo",
    href: "/modulos/configuracion/alertas-dispositivo",
    icon: BellRing,
    descripcion: "Notificaciones push en este dispositivo (activar, renovar, probar).",
    permiso: "config_local.alertas",
  },
  {
    label: "Mantenimiento",
    href: "/modulos/configuracion/mantenimiento",
    icon: Wrench,
    descripcion: "Herramientas administrativas y operaciones peligrosas.",
    adminOnly: true,
  },
];

export default function ConfiguracionPage() {
  const { perfil, cargando } = useUser();

  if (cargando) return null;

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  // DUEÑO_LOCAL/ENCARGADO entran si tienen alguna config_local.* (o admin).
  if (!puedeVerConfigLocal(perfil)) return <SinPermisos />;

  // Filtrado por tarjeta: admin ve todo; el resto solo las tarjetas cuyo permiso
  // posee, y nunca las adminOnly (p. ej. Mantenimiento / reset destructivo).
  const secciones = SECCIONES.filter((s) => {
    if (esAdmin) return true;
    if (s.adminOnly) return false;
    return !s.permiso || permisos.includes(s.permiso);
  });

  return (
    <div className="max-w-2xl mx-auto">
      <SunmiHeader
        title="Configuración"
        subtitle="Elegí una sección para configurar."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {secciones.map((s) => (
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
