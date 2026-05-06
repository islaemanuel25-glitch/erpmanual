// lib/sunmiThemes.js

export const SUNMI_THEMES = {
    // ======================================================
    // THEME 1: SUNMI DARK (ACTUAL)
    // ======================================================
    sunmiDark: {
      key: "sunmiDark",
      label: "Sunmi Dark (Actual)",
      layout: "bg-slate-950 text-slate-50",
      accent: "amber",

      // ---- Cards ----
      card: "bg-slate-900 border border-slate-800",

      // ---- Header (chrome unificado con sidebar) ----
      header: {
        bg: "bg-[var(--header-bg)]",
        border: "border-[var(--header-border)]",
        text: "text-slate-900",
      },

      // Ribbon de título de módulo (SunmiHeader, área de contenido)
      titleRibbon: {
        bg: "from-amber-400/10 via-amber-400/0 to-amber-500/5",
        border: "border-amber-400/40",
        text: "text-amber-200",
      },

      // ======================================================
      // SIDEBAR COMPLETA (Pro, Mobile, Group)
      // ======================================================
      sidebar: {
        bg: "bg-[var(--sidebar-bg)]",
        border: "border-[var(--sidebar-border)]",
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
        headerClass: "sunmi-thead",
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
      accent: "cyan",

      card: "bg-slate-900/90 border border-slate-800/80",

      header: {
        bg: "bg-[var(--header-bg)]",
        border: "border-[var(--header-border)]",
        text: "text-cyan-200",
      },

      titleRibbon: {
        bg: "from-cyan-400/10 via-cyan-400/0 to-cyan-500/5",
        border: "border-cyan-400/40",
        text: "text-cyan-200",
      },

      sidebar: {
        bg: "bg-[var(--sidebar-bg)]",
        border: "border-[var(--sidebar-border)]",
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
        headerClass: "sunmi-thead",
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
      accent: "cyan",

      card: "bg-white border border-slate-200",

      header: {
        bg: "bg-[var(--header-bg)]",
        border: "border-[var(--header-border)]",
        text: "text-slate-900",
      },

      titleRibbon: {
        bg: "from-slate-100 via-slate-50 to-slate-100",
        border: "border-slate-200",
        text: "text-slate-900",
      },

      sidebar: {
        bg: "bg-[var(--sidebar-bg)]",
        border: "border-[var(--sidebar-border)]",
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
        headerClass: "sunmi-thead",
      },
  
      badgeActivo: "bg-emerald-500 text-white",
      badgeInactivo: "bg-slate-400 text-white",
    },

    // ======================================================
    // THEME 4: SUNMI GRAPHITE
    // ======================================================
    sunmiGraphite: {
      key: "sunmiGraphite",
      label: "Sunmi Graphite",
      layout: "bg-[#0e1116] text-[#e6edf3]",
      accent: "amber",

      card: "bg-[#161b22] border border-[#2a2f36]",

      header: {
        bg: "bg-[var(--header-bg)]",
        border: "border-[var(--header-border)]",
        text: "text-gray-200",
      },

      titleRibbon: {
        bg: "bg-amber-400",
        border: "border-[#2a2f36]",
        text: "text-slate-900",
      },

      sidebar: {
        bg: "bg-[var(--sidebar-bg)]",
        border: "border-[var(--sidebar-border)]",
        icon: "text-gray-400",
        iconActive: "text-white",
        hover: "hover:bg-[#1f242b]",

        dropdownBg: "bg-[#161b22]",
        dropdownBorder: "border-[#2a2f36]",
        dropdownHeading: "text-gray-400",
        dropdownItem: "text-gray-200",
        dropdownItemHover: "hover:bg-[#1f242b]",
      },

      table: {
        headerClass: "sunmi-thead",
      },

      badgeActivo: "bg-green-500 text-white",
      badgeInactivo: "bg-gray-600 text-gray-200",
    },

    // ======================================================
    // THEME 5: SUNMI SAND
    // ======================================================
    sunmiSand: {
      key: "sunmiSand",
      label: "Sunmi Sand",
      layout: "bg-[#f6f1e7] text-[#1f2937]",
      accent: "amber",

      card: "bg-[#fffaf0] border border-[#e7d9c3]",

      header: {
        bg: "bg-[var(--header-bg)]",
        border: "border-[var(--header-border)]",
        text: "text-slate-900",
      },

      titleRibbon: {
        bg: "bg-amber-400",
        border: "border-[#e7d9c3]",
        text: "text-slate-900",
      },

      sidebar: {
        bg: "bg-[var(--sidebar-bg)]",
        border: "border-[var(--sidebar-border)]",
        icon: "text-[#6b7280]",
        iconActive: "text-[#111827]",
        hover: "hover:bg-[#f1e6d5]",

        dropdownBg: "bg-[#fffaf0]",
        dropdownBorder: "border-[#e7d9c3]",
        dropdownHeading: "text-[#6b7280]",
        dropdownItem: "text-[#1f2937]",
        dropdownItemHover: "hover:bg-[#f1e6d5]",
      },

      table: {
        headerClass: "sunmi-thead",
      },

      badgeActivo: "bg-green-600 text-white",
      badgeInactivo: "bg-[#9ca3af] text-white",
    },

    // ======================================================
    // THEME 6: SUNMI BLUE CLASSIC
    // ======================================================
    sunmiBlueClassic: {
      key: "sunmiBlueClassic",
      label: "Sunmi Blue Classic",
      layout: "bg-[#0b1f3a] text-[#e6f0ff]",
      accent: "amber",

      card: "bg-[#102a4d] border border-[#1d3b6b]",

      header: {
        bg: "bg-[var(--header-bg)]",
        border: "border-[var(--header-border)]",
        text: "text-blue-100",
      },

      titleRibbon: {
        bg: "bg-amber-400",
        border: "border-[#1d3b6b]",
        text: "text-slate-900",
      },

      sidebar: {
        bg: "bg-[var(--sidebar-bg)]",
        border: "border-[var(--sidebar-border)]",
        icon: "text-blue-200",
        iconActive: "text-white",
        hover: "hover:bg-[#163866]",

        dropdownBg: "bg-[#102a4d]",
        dropdownBorder: "border-[#1d3b6b]",
        dropdownHeading: "text-blue-200",
        dropdownItem: "text-blue-100",
        dropdownItemHover: "hover:bg-[#163866]",
      },

      table: {
        headerClass: "sunmi-thead",
      },

      badgeActivo: "bg-green-500 text-white",
      badgeInactivo: "bg-blue-900 text-blue-200",
    },

    // ======================================================
    // THEME 7: SUNMI FRANCE
    // ======================================================
    sunmiFrance: {
      key: "sunmiFrance",
      label: "Sunmi France",
      layout: "bg-white text-black",
      accent: "cyan",

      card: "bg-white border border-black",

      header: {
        bg: "bg-[var(--header-bg)]",
        border: "border-[var(--header-border)]",
        text: "text-white",
      },

      titleRibbon: {
        bg: "bg-[#0055A4]",
        border: "border-black",
        text: "text-white",
      },

      sidebar: {
        bg: "bg-[var(--sidebar-bg)]",
        border: "border-[var(--sidebar-border)]",
        icon: "text-white",
        iconActive: "text-white",
        hover: "hover:bg-[#004080]",

        dropdownBg: "bg-[#0055A4]",
        dropdownBorder: "border-black",
        dropdownHeading: "text-white",
        dropdownItem: "text-white",
        dropdownItemHover: "hover:bg-[#004080]",
      },

      table: {
        headerClass: "sunmi-thead",
      },

      badgeActivo: "bg-green-600 text-white",
      badgeInactivo: "bg-gray-400 text-black",
    },

    // ======================================================
    // THEME 8: SUNMI FRANCE SPLIT (Header blanco + Sidebar azul)
    // ======================================================
    sunmiFranceSplit: {
      key: "sunmiFranceSplit",
      label: "Sunmi France Split",
      layout: "bg-white text-black",
      accent: "cyan",

      card: "bg-white border border-black",

      header: {
        bg: "bg-[var(--header-bg)]",
        border: "border-[var(--header-border)]",
        text: "text-slate-900",
      },

      titleRibbon: {
        bg: "bg-[#0055A4]",
        border: "border-black",
        text: "text-white",
      },

      sidebar: {
        bg: "bg-[var(--sidebar-bg)]",
        border: "border-[var(--sidebar-border)]",
        icon: "text-white",
        iconActive: "text-white",
        hover: "hover:bg-[#004080]",

        dropdownBg: "bg-[#0055A4]",
        dropdownBorder: "border-black",
        dropdownHeading: "text-white",
        dropdownItem: "text-white",
        dropdownItemHover: "hover:bg-[#004080]",
      },

      table: {
        headerClass: "sunmi-thead",
      },

      badgeActivo: "bg-green-600 text-white",
      badgeInactivo: "bg-gray-400 text-black",
    },
  };

  export const DEFAULT_SUNMI_THEME_KEY = "sunmiDark";
  