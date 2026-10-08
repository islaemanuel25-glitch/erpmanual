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
// Son el mismo momento con distinto dueño del número: en la receta se está
// probando cómo se lee, y en la recepción se está arreglando un papel concreto.
// Lo que se ve —el cartel de arriba, los productos que no dan su cuenta con la
// foto al lado, la lista de lo leído— es idéntico, y si se escribiera dos veces
// se separarían el día que una cambie. Es la regla 1 de CLAUDE.md.
//
// ── LO QUE ESTE BLOQUE NO HACE ────────────────────────────────────────────
//
// No guarda, no lee, no decide. Recibe un `resultado` —el de `comoLoEntendio`—
// y avisa hacia afuera qué eligió la persona. Quién escribe eso, y si lo
// escribe, es de cada pantalla: en la receta la elección solo recalcula, y en
// la recepción se guarda en la línea del comprobante.
//
// ── Y NO CORRIGE SOLO ─────────────────────────────────────────────────────
//
// El sistema sabe qué número DARÍA la cuenta; no sabe cuál dice el papel. Los
// dos pueden diferir porque el proveedor se equivocó, y ahí manda el papel. Se
// muestran los dos y elige la persona, con la foto al lado.

import { useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import { formatearMoneda } from "@/lib/moneda";
import { textoDelResultado } from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";
import VisorDeFoto from "@/components/compras-proveedor/VisorDeFoto";

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

/** Un producto que no da su cuenta: se muestran los dos números y elige quien mira. */
export function ProductoSospechoso({ p, onElegir, onVerFoto }) {
  const [aMano, setAMano] = useState("");
  return (
    <SunmiCard className="p-3 space-y-renglon border sunmi-border-warning">
      <div className="flex items-start justify-between gap-renglon">
        <span className="min-w-0 flex flex-col">
          <span className="text-sm3 font-medium sunmi-text-strong break-words">{p.nombre}</span>
          <span className="text-sm2 sunmi-text-muted">{p.textoCantidad}</span>
        </span>
        <SunmiButton
          color="ghost"
          type="button"
          onClick={onVerFoto}
          className="shrink-0 min-h-toque text-sm3 sunmi-text-accent"
        >
          Ver foto
        </SunmiButton>
      </div>

      <span className="block text-sm3 sunmi-text-muted">
        Mirá la foto y tocá el que dice el papel:
      </span>

      <div className="flex flex-col gap-dato">
        <SunmiButton
          color="slate"
          type="button"
          onClick={() => onElegir(p.daLaCuenta)}
          className="w-full min-h-toque justify-start text-sm3"
        >
          Da la cuenta {formatearMoneda(p.daLaCuenta)}
        </SunmiButton>
        <SunmiButton
          color="slate"
          type="button"
          onClick={() => onElegir(p.subtotal)}
          className="w-full min-h-toque justify-start text-sm3"
        >
          Leyó {formatearMoneda(p.subtotal)}
        </SunmiButton>
      </div>

      <span className="block text-sm2 sunmi-text-muted">
        Si ninguno es, escribilo como está en el papel.
      </span>
      <div className="flex gap-dato">
        <SunmiInput
          inputMode="decimal"
          value={aMano}
          onChange={(e) => setAMano(e.target.value)}
          placeholder="0,00"
          className="w-35p min-h-toque px-4 text-lg2 tabular-nums"
        />
        <SunmiButton
          color="slate"
          type="button"
          disabled={!aMano.trim()}
          onClick={() => onElegir(Number(String(aMano).replace(/\./g, "").replace(",", ".")))}
          className="min-h-toque text-sm3"
        >
          Usar este
        </SunmiButton>
      </div>
    </SunmiCard>
  );
}

/**
 * El bloque entero: cartel, los que no dan su cuenta, y la lista de lo leído.
 *
 * @param resultado      lo que devuelve `comoLoEntendio`
 * @param comprobanteId  de qué papel es la foto
 * @param onElegir       (indice, valor) — qué número dijo la persona que dice el papel
 */
export default function AsiLoEntendio({ resultado, comprobanteId, onElegir }) {
  const [verTodos, setVerTodos] = useState(false);
  // ── LA FOTO SE ABRE ACÁ ADENTRO, NO EN OTRA PESTAÑA ─────────────────
  //
  // `window.open` la dejaba en manos del navegador: sin respetar el EXIF, sin
  // forma de girarla y al tamaño que él eligiera. El papel de Paty se veía
  // dado vuelta y en una franja.
  const [mirandoLaFoto, setMirandoLaFoto] = useState(false);
  if (!resultado) return null;
  const texto = textoDelResultado(resultado, { moneda: formatearMoneda });
  if (!texto) return null;

  const visibles = verTodos ? resultado.productos : resultado.productos.slice(0, PRODUCTOS_A_LA_VISTA);
  const verFoto = () => setMirandoLaFoto(true);

  return (
    <>
      <VisorDeFoto
        comprobanteId={comprobanteId}
        abierto={mirandoLaFoto}
        onCerrar={() => setMirandoLaFoto(false)}
      />

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

      {resultado.sospechosos.map((p) => (
        <ProductoSospechoso
          key={p.indice}
          p={p}
          onVerFoto={verFoto}
          onElegir={(valor) => onElegir?.(p.indice, Number(valor))}
        />
      ))}

      {resultado.sospechosos.length > 0 && (
        <span className="block text-sm2 sunmi-text-muted">
          Los otros {resultado.enOrden}{" "}
          {resultado.enOrden === 1 ? "producto da la cuenta" : "productos dan la cuenta"}.
        </span>
      )}

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
    </>
  );
}
