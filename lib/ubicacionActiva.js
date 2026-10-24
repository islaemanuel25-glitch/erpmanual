// CAMBIAR LA UBICACIÓN ACTIVA, DESDE EL NAVEGADOR.
//
// Salió de `app/inicio/page.jsx`, tal cual, el 2026-10-24: la revisión de una
// lista de proveedor necesita mandar a la ubicación que administra los costos
// ("Ir a Depósito: depo") sin pasar por la pantalla de elegir. El pedido es el
// mismo y la ruta también (`/api/contexto-activo/set`), que es la que decide
// quién puede elegir qué: un no administrador solo su propio local.
//
// Sin imports de servidor: `lib/contexto.js` es el de la cookie, del lado del
// servidor, y no se mezcla con esto.

/**
 * @returns `{ ok, error?, localId?, nombre?, esDeposito? }`, la respuesta de la
 *          ruta tal cual. Un error de red se devuelve como `{ ok: false }` con
 *          su texto, para que cada pantalla lo diga donde se tocó.
 */
export async function elegirUbicacionActiva(localId) {
  try {
    const res = await fetch("/api/contexto-activo/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ localId }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: "Error de conexión" };
  }
}

/**
 * "Depósito: depo" o "Local: mini el 7", como lo dice el encabezado de la app
 * (`components/Header.jsx`). Allá son dos nodos de JSX a propósito —juntarlos
 * mueve píxeles—; acá hace falta el texto para escribirlo adentro de una frase.
 */
export function nombreDeUbicacion({ nombre, esDeposito }) {
  return `${esDeposito ? "Depósito" : "Local"}: ${nombre}`;
}
