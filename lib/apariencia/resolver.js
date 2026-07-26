// lib/apariencia/resolver.js
//
// Resolución PURA del tema efectivo, con el orden:
//   preferencia personal del dispositivo
//   → apariencia institucional del local
//   → tema predeterminado del sistema
// Un tema inválido en un nivel se ignora y se cae al siguiente.

/**
 * @param {string|null} personalKey     preferencia personal (localStorage) o null
 * @param {string|null} institucionalKey apariencia institucional del local o null
 * @param {{ esValido: (k:string)=>boolean, porDefecto: string }} opts
 * @returns {{ key: string, fuente: "personal"|"institucional"|"default" }}
 */
export function resolverTemaEfectivo(personalKey, institucionalKey, { esValido, porDefecto }) {
  if (personalKey && esValido(personalKey)) {
    return { key: personalKey, fuente: "personal" };
  }
  if (institucionalKey && esValido(institucionalKey)) {
    return { key: institucionalKey, fuente: "institucional" };
  }
  return { key: porDefecto, fuente: "default" };
}
