/**
 * Envia un ticket al print-server local (ESC/POS nativo).
 * El print-server (ERP-Imprimir.exe) debe estar corriendo en localhost:17777.
 */

const PRINT_SERVER_URL = "http://localhost:17777";
const TIMEOUT_MS = 8000;

export default async function imprimirTicketNativo(venta, ancho) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${PRINT_SERVER_URL}/print/ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venta, ancho }),
      signal: controller.signal,
    });

    const data = await res.json();

    if (!data.ok) {
      return { ok: false, error: data.error || "Error del servidor de impresion" };
    }

    return { ok: true };
  } catch (err) {
    if (err.name === "AbortError") {
      return {
        ok: false,
        error: "El servicio local no responde (timeout). Verifica que ERP-Imprimir.exe este corriendo.",
      };
    }
    return {
      ok: false,
      error: "El servicio local no esta iniciado. Verifica que ERP-Imprimir.exe este corriendo en esta PC.",
    };
  } finally {
    clearTimeout(timer);
  }
}
