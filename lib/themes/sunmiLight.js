const sunmiLight = {
  key: "sunmiLight",
  label: "Light Minimal",
  layout: "bg-slate-100 text-slate-900",

  card: "bg-white border border-slate-200",

  header: {
    bg: "from-slate-100 via-slate-50 to-slate-100",
    border: "border-slate-200",
    text: "text-slate-900",
  },

  sidebar: {
    bg: "bg-white",
    border: "border-slate-200",
    icon: "text-slate-700",
    iconActive: "text-slate-900",
    hover: "hover:bg-slate-200",

    dropdownBg: "bg-white",
    dropdownBorder: "border-slate-300",
    dropdownHeading: "text-slate-700",
    dropdownItem: "text-slate-700",
    dropdownItemHover: "hover:bg-slate-200 hover:text-slate-900",
  },

  table: {
    header: "bg-slate-100",
    row: "hover:bg-slate-50",
  },

  badgeActivo: "bg-emerald-500 text-white",
  badgeInactivo: "bg-slate-400 text-white",

  // ======================================================
  // CSS VARIABLES
  // ======================================================
  cssVars: {
    "--sunmi-bg": "#f1f5f9", // slate-100
    "--sunmi-text": "#0f172a", // slate-900

    "--sunmi-header-bg": "linear-gradient(to right, #f1f5f9, #f8fafc, #f1f5f9)",
    "--sunmi-header-text": "#0f172a", // slate-900
    "--sunmi-header-border": "#e2e8f0", // slate-200

    "--sunmi-sidebar-bg": "#ffffff", // white
    "--sunmi-sidebar-text": "#334155", // slate-700
    "--sunmi-sidebar-border": "#e2e8f0", // slate-200

    "--sunmi-card-bg": "#ffffff", // white
    "--sunmi-card-border": "#e2e8f0", // slate-200
    "--sunmi-card-text": "#0f172a", // slate-900

    "--sunmi-table-header-bg": "#f1f5f9", // slate-100
    "--sunmi-table-row-bg": "#f8fafc", // slate-50

    "--sunmi-badge-activo-bg": "#10b981", // emerald-500
    "--sunmi-badge-activo-text": "#ffffff", // white
    "--sunmi-badge-inactivo-bg": "#94a3b8", // slate-400
    "--sunmi-badge-inactivo-text": "#ffffff", // white
  },
};

export default sunmiLight;
