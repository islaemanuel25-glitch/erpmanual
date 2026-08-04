// Gate de identificadores no definidos.
//
// Config MÍNIMO y aparte, con una sola regla: `no-undef`. Existe porque
// `npm run lint` arrastra ~108 problemas preexistentes y sale en rojo siempre;
// una regla nueva ahí queda sepultada y no sirve como barrera.
//
// Éste tiene que salir en VERDE. Si falla, hay un identificador que no existe.
//
// Nació de un caso real: `ArqueosDelTurno.jsx` usaba `etiquetaRegistro` sin
// importarlo. Compiló, pasó el lint, pasaron 1207 pruebas, y la pantalla de
// detalle de turno reventaba en producción con ReferenceError.
//
// Alcance: código de aplicación (app, components, lib, hooks). NO cubre
// scripts/generador/, que hoy tiene 4 `capitalize` sin definir —un bug real y
// preexistente, del mismo tipo, pero ajeno a este arreglo—. La regla igual está
// activa en eslint.config.mjs, así que ese hallazgo sigue visible en el lint
// general en vez de quedar tapado.

import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";

export default defineConfig([
  globalIgnores([".next/**", "out/**", "build/**", "node_modules/**"]),
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { "no-undef": "error" },
  },
]);
