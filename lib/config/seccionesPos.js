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
    // Sin "e integraciones": Integraciones es su propia sección, justo abajo, y
    // nombrarla acá además de allá hacía que esta descripción ocupara dos
    // renglones y la tarjeta quedara más alta que las otras.
    descripcion: "Medios de pago, recargos y comisiones",
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
    // ── SIN `href` A PROPÓSITO ─────────────────────────────────────────────
    //
    // La apariencia del POS es una etapa futura y todavía no existe. La primera
    // versión de esto la enlazaba a `/modulos/configuracion/apariencia`,
    // razonando que una fila muerta es peor que una que lleva a algo. Estaba
    // mal: esa pantalla es la apariencia INSTITUCIONAL del local —el theme
    // general, el menú— y no la del POS. Mandar ahí a quien viene buscando los
    // themes del POS no es llevarlo a "algo": es llevarlo a otra cosa, y encima
    // dándole a entender que ya está resuelto.
    //
    // Se muestra visible y apagada, como en el diseño aprobado, para que se
    // sepa que viene. Sin navegación.
    disponible: false,
    nota: "Más adelante",
    icon: Contrast,
    permiso: "config_local.apariencia",
  },
];
