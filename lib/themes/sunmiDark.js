const sunmiDark = {
  key: "sunmiDark",
  label: "Sunmi Dark (Actual)",
  layout: "bg-slate-950 text-slate-50",

  // ---- Cards ----
  card: "bg-slate-900 border border-slate-800",

  // ---- Header ----
  header: {
    bg: "from-amber-400/10 via-amber-400/0 to-amber-500/5",
    border: "border-amber-400/40",
    text: "text-amber-200",
  },

  // ======================================================
  // SIDEBAR COMPLETA (Pro, Mobile, Group)
  // ======================================================
  sidebar: {
    bg: "bg-[#FACC15]", // fondo bloque lateral (tu amarillo Sunmi)
    border: "border-yellow-600",
    icon: "text-slate-900",
    iconActive: "text-slate-900",
    hover: "hover:bg-yellow-300",

    // Panel desplegable (SidebarGroup)
    dropdownBg: "bg-slate-950",
    dropdownBorder: "border-slate-800",
    dropdownHeading: "text-yellow-400",
    dropdownItem: "text-slate-200",
    dropdownItemHover: "hover:bg-yellow-500/20 hover:text-yellow-400",
  },

  // ---- Tables ----
  table: {
    header: "bg-slate-900/80",
    row: "hover:bg-slate-900/80",
  },

  // ---- Badges ----
  badgeActivo: "bg-emerald-400 text-slate-950",
  badgeInactivo: "bg-slate-700 text-slate-200",

  // ======================================================
  // CSS VARIABLES
  // ======================================================
  cssVars: {
    "--sunmi-bg": "#0f172a", // slate-950
    "--sunmi-text": "#f8fafc", // slate-50

    "--sunmi-header-bg": "linear-gradient(to right, rgba(251,191,36,0.1), rgba(251,191,36,0), rgba(251,191,36,0.05))",
    "--sunmi-header-text": "#fde047", // amber-200
    "--sunmi-header-border": "rgba(250,204,21,0.4)", // amber-400/40

    "--sunmi-sidebar-bg": "#FACC15", // amarillo Sunmi
    "--sunmi-sidebar-text": "#0f172a", // slate-900
    "--sunmi-sidebar-border": "#ca8a04", // yellow-600

    "--sunmi-card-bg": "#0f172a", // slate-900
    "--sunmi-card-border": "#1e293b", // slate-800
    "--sunmi-card-text": "#f8fafc", // slate-50

    "--sunmi-table-header-bg": "rgba(15,23,42,0.8)", // slate-900/80
    "--sunmi-table-row-bg": "rgba(15,23,42,0.8)", // slate-900/80

    "--sunmi-badge-activo-bg": "#34d399", // emerald-400
    "--sunmi-badge-activo-text": "#0f172a", // slate-950
    "--sunmi-badge-inactivo-bg": "#475569", // slate-700
    "--sunmi-badge-inactivo-text": "#e2e8f0", // slate-200
  },
};

export default sunmiDark;
