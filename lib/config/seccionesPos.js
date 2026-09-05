// LAS CUATRO SECCIONES DE CONFIGURACIÓN POS.
//
// Viven acá y no adentro del JSX de la portada por una razón concreta: el gating
// de cada una es lo que decide si alguien puede llegar o no a administrar los
// medios de cobro, y una lista escrita adentro de un componente no se puede
// ejercer sin montar React. Los iconos vienen de lucide igual que en
// `lib/menu/registry.js`, que hace exactamente esto mismo.
//
// Cada sección declara su permiso PROPIO. Entrar a la portada alcanza con
// cualquiera de `PERMISOS_CONFIG_POS`; lo que se ve adentro es otra pregunta, y
// se contesta por sección: quien administra los medios de cobro no tiene por qué
// poder cambiar si el cliente es obligatorio para cerrar una venta.

import { ArrowLeftRight, Check, Contrast, DollarSign } from "lucide-react";

import { PERMISOS_CONFIG_POS } from "./acceso.js";

export const SECCIONES_POS = [
  {
    key: "cobros",
    label: "Cobros",
    descripcion: "Medios de pago, recargos, comisiones e integraciones",
    href: "/modulos/configuracion/pos-ventas/cobros",
    icon: DollarSign,
    permiso: "config_local.medios_cobro",
  },
  {
    key: "reglas",
    label: "Reglas de venta",
    descripcion: "Cliente, operador, descuentos, fiado y cierre",
    href: "/modulos/configuracion/pos-ventas/reglas",
    icon: Check,
    permiso: "config_local.pos",
  },
  {
    key: "integraciones",
    label: "Integraciones",
    descripcion: "Conexiones con procesadores y conciliación",
    href: "/modulos/configuracion/pos-ventas/integraciones",
    icon: ArrowLeftRight,
    // No habilita nada nuevo: es estado futuro. Lo ve quien puede entrar.
    permisos: PERMISOS_CONFIG_POS,
  },
  {
    key: "apariencia",
    label: "Apariencia",
    descripcion: "Themes y distribución del POS",
    // La superficie que YA existe, no una nueva. El diseño la muestra apagada
    // con un "más adelante"; se dejó enlazada porque la pantalla existe y
    // funciona, y una fila muerta que lleva a ningún lado es peor que una que
    // lleva a lo que hay. Está anotado como diferencia contra el mockup.
    href: "/modulos/configuracion/apariencia",
    icon: Contrast,
    permiso: "config_local.apariencia",
  },
];
