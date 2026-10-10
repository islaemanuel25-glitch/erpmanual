"use client";

// ASÍ LO ENTENDIÓ: EL PAPEL, DICHO EN CASTELLANO.
//
// ── POR QUÉ ESTÁ ACÁ Y NO ADENTRO DE UNA PANTALLA ─────────────────────────
//
// Lo dibujan DOS pantallas y tiene que ser el mismo bloque en las dos:
//
//   · la receta del proveedor, cuando se prueba una explicación;
//   · la recepción, arriba de la conciliación, cuando el papel no cerró.
//
// Son el mismo momento con distinto dueño: en la receta se está probando cómo
// se lee, y en la recepción se está mirando un papel concreto. Lo que se ve —el
// cartel de arriba y la lista de lo leído— es idéntico, y si se escribiera dos
// veces se separarían el día que una cambie. Es la regla 1 de CLAUDE.md.
//
// ── LO QUE ESTE BLOQUE NO HACE ────────────────────────────────────────────
//
// No guarda, no lee, no decide. Recibe un `resultado` —el de `comoLoEntendio`—
// y lo dibuja. Desde la lectura interpretada (#165) no señala renglones
// sospechosos: eso lo hacían reglas de formato que ya no existen. Si el papel
// no cierra, cada renglón se corrige desde su hoja mirando la foto.

import { useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import { formatearMoneda } from "@/lib/moneda";
import { textoDelResultado } from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";

/** Cuántos productos se ven antes de pedir el resto. */
export const PRODUCTOS_A_LA_VISTA = 3;

/** La dirección de la foto de un comprobante. Una sola, para las dos pantallas. */
export const fotoDelComprobante = (comprobanteId) =>
  `/api/compras-proveedor/comprobantes/foto/${comprobanteId}`;

/** Un producto de la lista de "así lo entendió". */
export function ProductoLeido({ p }) {
  return (
    <div className="flex items-start justify-between gap-renglon">
      <span className="min-w-0 flex flex-col">
        <span className="text-sm3 sunmi-text-strong break-words">{p.nombre}</span>
        <span className="text-sm2 sunmi-text-muted tabular-nums">
          {p.textoCantidad}
          {p.neto != null ? ` · ${formatearMoneda(p.neto)} ${p.textoPrecio}` : ""}
        </span>
      </span>
      {/* ── EL IMPORTE FINAL DEL RENGLÓN, NO EL NETO ────────────────────
          Con IVA e impuesto interno adentro: es el que después se convierte en
          costo. Antes acá iba `p.subtotal` —la columna NETO— así que el
          renglón decía un número y el costo salía 21 % más arriba sin que nada
          lo explicara. Se cae al neto solo si el final no se pudo resolver. */}
      {/* ── UN IMPORTE QUE NO SE SABE NO SE DIBUJA EN $0,00 ─────────────
          Es la sexta vez del cero falsy en este módulo: `aCentavos(null)` da 0
          y el cero se propaga hasta acá. Los 12 renglones de TDC salieron en
          $0,00, que se lee como "este producto no vale nada" en vez de "no se
          pudo leer". Una raya dice la verdad. */}
      <span className="shrink-0 whitespace-nowrap tabular-nums text-sm2 font-semibold sunmi-text-strong">
        {p.bonificado
          ? "bonificado"
          : p.importeFinal != null
          ? formatearMoneda(p.importeFinal)
          : p.subtotal != null
            ? formatearMoneda(p.subtotal)
            : "—"}
      </span>
    </div>
  );
}

/**
 * El bloque entero: el cartel con la cuenta y la lista de lo leído.
 *
 * @param resultado      lo que devuelve `comoLoEntendio`
 */
export default function AsiLoEntendio({ resultado }) {
  const [verTodos, setVerTodos] = useState(false);
  if (!resultado) return null;
  const texto = textoDelResultado(resultado, { moneda: formatearMoneda });
  if (!texto) return null;

  const visibles = verTodos ? resultado.productos : resultado.productos.slice(0, PRODUCTOS_A_LA_VISTA);

  return (
    <>
      <SunmiCard
        className={`p-3 ${
          texto.tono === "ok"
            ? "sunmi-state-success"
            : texto.tono === "alerta"
              ? "sunmi-state-warning"
              : ""
        }`}
      >
        <span className="block text-sm3 font-medium sunmi-text-strong break-words">
          {texto.titulo}
        </span>
        <p className="text-sm2 sunmi-text-muted break-words">{texto.detalle}</p>
      </SunmiCard>

      {/* Sin productos no hay lista: una tarjeta vacía se lee como "algo
          tendría que estar acá". El cartel de arriba ya dice que no se leyeron. */}
      {resultado.productos.length > 0 && (
      <SunmiCard className="p-3 space-y-renglon">
        {visibles.map((p, i) => (
          <div key={p.indice} className="space-y-renglon">
            {i > 0 && <SunmiSeparator />}
            <ProductoLeido p={p} />
          </div>
        ))}
        {!verTodos && resultado.productos.length > PRODUCTOS_A_LA_VISTA && (
          <SunmiButton
            color="ghost"
            type="button"
            onClick={() => setVerTodos(true)}
            className="w-full min-h-toque justify-center text-sm3 sunmi-text-accent"
          >
            Ver los {resultado.productos.length - PRODUCTOS_A_LA_VISTA} restantes
          </SunmiButton>
        )}
      </SunmiCard>
      )}
    </>
  );
}
