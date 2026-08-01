// lib/version/compararBuild.js
//
// Comparación pura entre el build que tiene cargado el NAVEGADOR y el que está
// sirviendo el SERVIDOR ahora mismo. Sin red, sin React, sin Next.
//
// Existe por un caso real: el 31/07/2026 se desplegó el fix de margen y una
// pestaña abierta desde antes siguió corriendo el JavaScript viejo. El servidor
// ya tenía el código nuevo, pero el formulario del navegador no — y siguió
// guardando el margen deformado durante 76 segundos después del deploy. El
// bundle viejo no fallaba al cargar (por eso `deploymentId` de Next no lo
// hubiera detectado): simplemente ejecutaba lógica vieja.
//
// La identidad es el SHA del commit desplegado, el MISMO para las dos partes:
//   cliente  → NEXT_PUBLIC_BUILD_ID (incrustado en build time)
//   servidor → APP_BUILD_ID (leído en runtime por /api/version)
//
// No se comparan fechas ni números de versión a mano: solo el SHA.

/** El resultado es explícito y de tres estados: nunca un booleano ambiguo. */
export const MISMA = "MISMA";
export const DISTINTA = "DISTINTA";
export const INDETERMINADO = "INDETERMINADO";

/** Largo mínimo para aceptar un SHA abreviado como prefijo (el default de git). */
export const LARGO_MINIMO_ABREVIADO = 7;

/**
 * Normaliza un build id: recorta espacios laterales y baja a minúsculas.
 * Un valor que no sea string no numérico ni útil se colapsa a "" (ausente).
 */
export function normalizarBuildId(valor) {
  if (typeof valor !== "string") return "";
  return valor.trim().toLowerCase();
}

/**
 * Compara el build del cliente contra el del servidor.
 *
 * @returns {"MISMA"|"DISTINTA"|"INDETERMINADO"}
 *
 * - `INDETERMINADO` cuando falta cualquiera de los dos. Es el caso de
 *   desarrollo (sin build id inyectado) y el de un endpoint que no respondió:
 *   no se puede afirmar que haya versión nueva, así que no se afirma.
 * - `MISMA` si son iguales, o si uno es prefijo INEQUÍVOCO del otro con al
 *   menos 7 caracteres: `49ea192` y `49ea192155598471…` son el mismo commit.
 * - `DISTINTA` en cualquier otro caso.
 */
export function compararBuild(buildCliente, buildServidor) {
  const cliente = normalizarBuildId(buildCliente);
  const servidor = normalizarBuildId(buildServidor);

  if (!cliente || !servidor) return INDETERMINADO;
  if (cliente === servidor) return MISMA;

  // SHA abreviado contra SHA completo. El piso de 7 evita que un prefijo
  // ridículamente corto ("4" contra "49ea192…") pase por igual.
  const [corto, largo] =
    cliente.length <= servidor.length ? [cliente, servidor] : [servidor, cliente];

  if (corto.length >= LARGO_MINIMO_ABREVIADO && largo.startsWith(corto)) return MISMA;

  return DISTINTA;
}

/**
 * Política de guardado. Regla de seguridad: solo se bloquea cuando hay CERTEZA
 * de que el bundle quedó viejo.
 *
 * `INDETERMINADO` (error de red, endpoint caído, guard inactivo en desarrollo)
 * → se PERMITE guardar. Un chequeo de versión que no puede verificarse nunca
 * debe frenar el trabajo de nadie: el costo de un falso positivo es un usuario
 * bloqueado sin motivo.
 */
export function permiteGuardar(resultado) {
  return resultado !== DISTINTA;
}

/** ¿El guard está operativo? Sin build id en el cliente, no hay nada que comparar. */
export function guardActivo(buildCliente) {
  return normalizarBuildId(buildCliente) !== "";
}
