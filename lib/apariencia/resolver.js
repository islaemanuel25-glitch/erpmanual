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

/**
 * Extrae la clave de tema INSTITUCIONAL desde el `aparienciaJson` del local
 * (forma `{ tema: "<clave>", ... }`). Devuelve la clave solo si es válida; si el
 * JSON no es objeto, no tiene `tema`, o el tema es inválido → null. Pura y
 * client-safe: se usa tanto en el resolver SSR como en el cliente.
 *
 * @param {any} aparienciaJson  ConfiguracionLocal.aparienciaJson (o null)
 * @param {(k:string)=>boolean} esValido
 * @returns {string|null}
 */
export function temaDesdeApariencia(aparienciaJson, esValido) {
  const tema =
    aparienciaJson && typeof aparienciaJson === "object" && !Array.isArray(aparienciaJson)
      ? aparienciaJson.tema
      : null;
  return typeof tema === "string" && esValido(tema) ? tema : null;
}
