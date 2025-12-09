import {
  Home,
  Users,
  Shield,
  MapPin,
  Package,
  Building2,
  Truck,
  ShoppingCart,
  Settings,
  Palette,
} from "lucide-react";

// Estructura de grupos para el menú agrupado
export const sidebarGroups = [
  {
    id: "principal",
    label: "Principal",
    icon: Home,
    iconFilled: Home,
    items: [
      { href: "/modulos/dashboard", label: "Panel", icon: Home },
    ],
  },
  {
    id: "administracion",
    label: "Administración",
    icon: Users,
    iconFilled: Users,
    items: [
      { href: "/modulos/usuarios", label: "Usuarios", icon: Users },
      { href: "/modulos/roles", label: "Roles", icon: Shield },
      { href: "/modulos/locales", label: "Locales", icon: MapPin },
      { href: "/modulos/grupos", label: "Grupos", icon: Building2 },
    ],
  },
  {
    id: "inventario",
    label: "Inventario",
    icon: Package,
    iconFilled: Package,
    items: [
      { href: "/modulos/productos", label: "Productos", icon: Package },
      { href: "/modulos/stock_locales", label: "Stock", icon: Package },
      { href: "/modulos/transferencias", label: "Transferencias", icon: Truck },
      { href: "/modulos/pos-transferencias", label: "POS Transferencias", icon: ShoppingCart },
    ],
  },
  {
    id: "configuracion",
    label: "Configuración",
    icon: Settings,
    iconFilled: Settings,
    items: [
      { href: "/modulos/proveedores", label: "Proveedores", icon: Building2 },
      { href: "/modulos/apariencia", label: "Apariencia", icon: Palette },
      { href: "/modulos/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

export default sidebarGroups;

