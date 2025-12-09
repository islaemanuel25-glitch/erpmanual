const sunmiDarkCompact = {
  key: "sunmiDarkCompact",
  label: "Sunmi Dark Compact",
  layout: "bg-slate-950 text-slate-50",

  card: "bg-slate-900/90 border border-slate-800/80",

  header: {
    bg: "from-cyan-400/10 via-cyan-400/0 to-cyan-500/5",
    border: "border-cyan-400/40",
    text: "text-cyan-200",
  },

  sidebar: {
    bg: "bg-slate-950",
    border: "border-slate-800",
    icon: "text-slate-400",
    iconActive: "text-cyan-400",
    hover: "hover:bg-slate-900/70",

    dropdownBg: "bg-slate-950",
    dropdownBorder: "border-slate-800",
    dropdownHeading: "text-cyan-400",
    dropdownItem: "text-slate-200",
    dropdownItemHover: "hover:bg-cyan-500/10 hover:text-cyan-400",
  },

  table: {
    header: "bg-slate-900",
    row: "hover:bg-slate-900",
  },

  badgeActivo: "bg-emerald-300 text-slate-950",
  badgeInactivo: "bg-slate-700 text-slate-200",

  // ======================================================
  // CSS VARIABLES
  // ======================================================
  cssVars: {
    "--sunmi-bg": "#0f172a", // slate-950
    "--sunmi-text": "#f8fafc", // slate-50

    "--sunmi-header-bg": "linear-gradient(to right, rgba(34,211,238,0.1), rgba(34,211,238,0), rgba(34,211,238,0.05))",
    "--sunmi-header-text": "#a5f3fc", // cyan-200
    "--sunmi-header-border": "rgba(34,211,238,0.4)", // cyan-400/40

    "--sunmi-sidebar-bg": "#0f172a", // slate-950
    "--sunmi-sidebar-text": "#94a3b8", // slate-400
    "--sunmi-sidebar-border": "#1e293b", // slate-800

    "--sunmi-card-bg": "rgba(15,23,42,0.9)", // slate-900/90
    "--sunmi-card-border": "rgba(30,41,59,0.8)", // slate-800/80
    "--sunmi-card-text": "#f8fafc", // slate-50

    "--sunmi-table-header-bg": "#1e293b", // slate-900
    "--sunmi-table-row-bg": "#1e293b", // slate-900

    "--sunmi-badge-activo-bg": "#6ee7b7", // emerald-300
    "--sunmi-badge-activo-text": "#0f172a", // slate-950
    "--sunmi-badge-inactivo-bg": "#475569", // slate-700
    "--sunmi-badge-inactivo-text": "#e2e8f0", // slate-200
  },
};

export default sunmiDarkCompact;
