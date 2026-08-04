import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // ── no-undef: un identificador que no existe no debe pasar ───────────────
  //
  // `eslint-config-next` no activa esta regla. Por ese hueco se fue a producción
  // un `etiquetaRegistro` que el componente usaba sin importar: compiló, pasó el
  // lint, pasaron 1207 pruebas, y la pantalla de detalle de turno reventaba con
  // ReferenceError al desplegar la lista.
  //
  // La regla solo sirve si los globals están declarados. Sin eso marca `console`,
  // `process` o `window` y el ruido la vuelve inservible — medido: 40 de 47
  // hallazgos eran exactamente eso.
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { "no-undef": "error" },
  },
  {
    // El service worker tiene su propio universo: `clients`, `self`, `caches`.
    files: ["public/sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
]);

export default eslintConfig;
