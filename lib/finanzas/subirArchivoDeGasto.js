// lib/finanzas/subirArchivoDeGasto.js
//
// SUBE LA FOTO O EL ARCHIVO DEL TICKET A UN GASTO YA CREADO
// (`/api/finanzas/gastos/[gastoId]/archivo`). Lo llaman "Pagar" del POS y
// Finanzas → Gastos: la subida es una sola, desde los dos lados.
//
// Devuelve el error con sus palabras, o null. Nunca tira: el gasto ya está
// registrado cuando esto corre, y un archivo que no sube no lo deshace.

export async function subirArchivoDeGasto({ gastoId, archivo }) {
  try {
    const fd = new FormData();
    fd.append("archivo", archivo);
    const r = await fetch(`/api/finanzas/gastos/${gastoId}/archivo`, { method: "POST", body: fd, credentials: "include" });
    const d = await r.json().catch(() => null);
    if (d?.ok) return null;
    return d?.error || "No se pudo subir el archivo.";
  } catch {
    return "No se pudo subir el archivo.";
  }
}
