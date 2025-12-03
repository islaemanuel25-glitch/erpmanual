// /lib/uiConfig.js

export const DEFAULT_UI_CONFIG = {
    // =========================================================
    // TIPOGRAFÍA GLOBAL
    // =========================================================
    fontSize: "md", // xs | sm | md | lg
  
    typography: {
      xs: {
        fontSize: "0.70rem",
        lineHeight: "1.0rem",
      },
      sm: {
        fontSize: "0.78rem",
        lineHeight: "1.1rem",
      },
      md: {
        fontSize: "0.88rem",
        lineHeight: "1.25rem",
      },
      lg: {
        fontSize: "1.0rem",
        lineHeight: "1.4rem",
      },
    },
  
    // =========================================================
    // DENSIDAD GLOBAL (alto de filas, inputs, botones)
    // =========================================================
    density: "comfortable", // compact | comfortable | spacious
  
    densityConfig: {
      compact: {
        tableRowHeight: 32,
        inputHeight: 32,
        selectHeight: 32,
        buttonHeight: 32,
        iconSize: 16,
        sectionGap: 6,
      },
      comfortable: {
        tableRowHeight: 40,
        inputHeight: 38,
        selectHeight: 38,
        buttonHeight: 38,
        iconSize: 18,
        sectionGap: 10,
      },
      spacious: {
        tableRowHeight: 48,
        inputHeight: 44,
        selectHeight: 44,
        buttonHeight: 44,
        iconSize: 20,
        sectionGap: 14,
      },
    },
  
    // =========================================================
    // ESPACIADO GLOBAL ENTRE ELEMENTOS
    // =========================================================
    spacing: "md", // xs | sm | md | lg
  
    spacingScale: {
      xs: "2px",
      sm: "4px",
      md: "8px",
      lg: "12px",
    },
  
    // =========================================================
    // ESCALA GLOBAL (multiplicador)
    // =========================================================
    scale: 1, // 0.9 | 1 | 1.1
  };
  