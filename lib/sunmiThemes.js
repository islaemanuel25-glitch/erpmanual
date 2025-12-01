// lib/sunmiThemes.js

export const SUNMI_THEMES = {
    // ======================================================
    // THEME 1: SUNMI DARK (ACTUAL)
    // ======================================================
    sunmiDark: {
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
    },
  
    // ======================================================
    // THEME 2: SUNMI DARK COMPACT
    // ======================================================
    sunmiDarkCompact: {
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
    },
  
    // ======================================================
    // THEME 3: SUNMI LIGHT
    // ======================================================
    sunmiLight: {
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
    },
  };
  
  export const DEFAULT_SUNMI_THEME_KEY = "sunmiDark";
  