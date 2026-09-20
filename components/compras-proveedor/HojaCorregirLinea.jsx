"use client";

// LA HOJA DE CORREGIR UNA LÍNEA DE LA FACTURA.
//
// ── NUNCA SE MUESTRA UNA DECISIÓN QUE NO HAY QUE TOMAR ────────────────────
//
// Es la regla que ordena toda la hoja. Las tres secciones son condicionales:
// el precio solo si cambió, el motivo solo si la cantidad no coincide, y la
// fila de sueltas solo si el producto va por pack. Cuando todo coincide, la
// hoja queda en una sección y dos botones.
//
// Lo contrario —mostrar las tres siempre, deshabilitadas o vacías— convierte
// cada línea en un formulario de once campos, y con 197 líneas eso es la
// pantalla que esta tanda vino a sacar.
//
// ── LA HOJA ES LA DEL KIT ─────────────────────────────────────────────────
//
// `SunmiModalLayout forma="hoja"`, la misma que usa la recepción de una
// transferencia para corregir un producto: trae la capa, el velo, el `Escape`,
// la pila de modales y el portal. Lo que se dibuja adentro es de acá.
//
// ── QUÉ GUARDA Y DÓNDE ────────────────────────────────────────────────────
//
// Cantidad, sueltas y motivo van al estado de la pantalla, que ya los persiste
// en el navegador y los escribe todos juntos al recibir. El precio es la
// excepción: se escribe en el momento con `aceptar-precio`, porque cambiar el
// costo de una línea es una decisión propia y no parte del conteo — y porque
// esa ruta ya existe y ya valida todo lo que hay que validar.

import { useEffect, useMemo, useState } from "react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiModalLayout, { NIVEL_MODAL_GLOBAL } from "@/components/sunmi/SunmiModalLayout";
import { formatearMoneda } from "@/lib/moneda";
import {
  diferenciaDeCantidad,
  porcentajeDelPrecio,
  precioCambio,
} from "@/lib/compras-proveedor/estadoDeLineaFacturada";

/** Los MISMOS motivos que la recepción de una transferencia, con sus valores
 *  canónicos: un reporte por motivo no puede ver dos vocabularios. */
export const MOTIVOS = Object.freeze([
  { valor: "Faltante", texto: "Faltante" },
  { valor: "Producto dañado", texto: "Dañado" },
  { valor: "Otro", texto: "Otro" },
]);

const limpio = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
};

/** Un stepper de una fila: rótulo de ancho fijo y los tres controles. */
function FilaStepper({ rotulo, valor, onCambiar }) {
  const n = Number(valor) || 0;
  return (
    <div className="min-h-botonFoto flex items-center gap-renglon">
      <span className="w-rotuloStepper shrink-0 text-sm3 sunmi-text-muted">{rotulo}</span>
      <div className="flex-1 flex items-center gap-renglon">
        <SunmiButton
          color="slate"
          type="button"
          aria-label={`Restar ${rotulo.toLowerCase()}`}
          onClick={() => onCambiar(Math.max(0, n - 1))}
          className="w-cajaStepper min-h-botonFoto shrink-0 justify-center rounded-control text-lg2"
        >
          −
        </SunmiButton>
        <SunmiInput
          type="text"
          inputMode="numeric"
          aria-label={rotulo}
          value={valor === "" || valor == null ? "" : String(valor)}
          placeholder="0"
          onChange={(e) => onCambiar(e.target.value.replace(/[^\d]/g, ""))}
          className="flex-1 min-h-botonFoto text-center text-lg2 font-bold tabular-nums"
        />
        <SunmiButton
          color="slate"
          type="button"
          aria-label={`Sumar ${rotulo.toLowerCase()}`}
          onClick={() => onCambiar(n + 1)}
          className="w-cajaStepper min-h-botonFoto shrink-0 justify-center rounded-control text-lg2"
        >
          +
        </SunmiButton>
      </div>
    </div>
  );
}

/** Una de las dos opciones de precio. Excluyentes, la elegida con borde 2. */
function OpcionDePrecio({ elegida, titulo, detalle, onElegir }) {
  return (
    <SunmiButton
      color="ghost"
      type="button"
      aria-pressed={elegida}
      onClick={onElegir}
      className={`w-full min-h-0 flex-col items-start text-left rounded-lg px-filtro py-renglon gap-0.5 ${
        elegida ? "border-2 sunmi-border-accent" : "border sunmi-divider"
      }`}
    >
      <span className="text-sm3 font-medium sunmi-text-strong">{titulo}</span>
      <span className="text-sm3 sunmi-text-muted">{detalle}</span>
    </SunmiButton>
  );
}

export default function HojaCorregirLinea({
  fila,
  abierta,
  onCerrar,
  onGuardar,
  onAceptarPrecio,
  guardando = false,
}) {
  const cambio = precioCambio(fila);
  const porcentaje = porcentajeDelPrecio(fila);
  // Va por pack cuando el pedido se hizo en bultos y el bulto trae más de uno.
  const vaPorPack = (fila?.unidadPedido ?? "BULTO") === "BULTO" && Number(fila?.factorPack) > 1;

  const [bultos, setBultos] = useState("");
  const [sueltas, setSueltas] = useState("");
  const [motivo, setMotivo] = useState(null);
  const [detalleMotivo, setDetalleMotivo] = useState("");
  const [aceptaPrecio, setAceptaPrecio] = useState(true);
  const [error, setError] = useState("");

  // Al abrir se arranca de lo que ya hay: lo contado antes si lo hubo, y si no
  // lo que dice la factura, que es la propuesta razonable —el papel ya afirma
  // cuánto mandó—. Nunca de lo PEDIDO: eso daría por contado algo que nadie
  // contó, que es el defecto que ya arreglamos en el stepper del pedido.
  useEffect(() => {
    if (!abierta || !fila) return;
    setBultos(
      fila.cantidadRecibida != null ? String(fila.cantidadRecibida) : String(fila.cantidad ?? "")
    );
    setSueltas(fila.unidadesSueltas != null ? String(fila.unidadesSueltas) : "");
    setMotivo(fila.motivoPrincipal ?? null);
    setDetalleMotivo(fila.motivoDetalle ?? "");
    setAceptaPrecio(true);
    setError("");
  }, [abierta, fila]);

  const entraAlStock = useMemo(() => {
    const b = Number(bultos) || 0;
    const s = Number(sueltas) || 0;
    const factor = vaPorPack ? Number(fila?.factorPack) || 1 : 1;
    return b * factor + s;
  }, [bultos, sueltas, vaPorPack, fila?.factorPack]);

  const cantidadDifiere = useMemo(() => {
    const pedida = Number(fila?.cantidadPedida);
    const contada = Number(bultos);
    if (!Number.isFinite(pedida) || !Number.isFinite(contada)) return false;
    return pedida !== contada;
  }, [fila?.cantidadPedida, bultos]);

  if (!fila) return null;

  const guardar = async () => {
    setError("");
    if (cantidadDifiere && !motivo) {
      setError("Elegí por qué la cantidad no coincide.");
      return;
    }
    if (cantidadDifiere && motivo === "Otro" && !detalleMotivo.trim()) {
      setError("Contá qué pasó.");
      return;
    }
    // El precio primero: si falla, no se guarda un conteo que la persona iba a
    // acompañar con una decisión de costo que no ocurrió.
    if (cambio && aceptaPrecio) {
      const r = await onAceptarPrecio?.(fila);
      if (r && r.ok === false) {
        setError(r.error || "No se pudo aceptar el precio.");
        return;
      }
    }
    onGuardar?.({
      pedidoDetalleId: fila.pedidoDetalleId,
      cantidadRecibida: bultos === "" ? null : Number(bultos),
      unidadesSueltas: vaPorPack && sueltas !== "" ? Number(sueltas) : null,
      motivoPrincipal: cantidadDifiere ? motivo : null,
      motivoDetalle: cantidadDifiere && motivo === "Otro" ? detalleMotivo.trim() : null,
    });
  };

  return (
    <SunmiModalLayout
      open={!!abierta}
      title={fila.producto || fila.textoCrudo || "Producto"}
      onClose={onCerrar}
      z={NIVEL_MODAL_GLOBAL}
      forma="hoja"
      destructivo
      espacioCuerpo="gap-hoja"
    >
      {/* ── 1 · CUÁNTO ENTRÓ ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-renglon">
        <span className="text-sm3 font-medium sunmi-text-strong">Cuánto entró</span>
        <span className="text-sm3 sunmi-text-muted">
          Pediste {limpio(fila.cantidadPedida)} · la factura dice {limpio(fila.cantidad)}
          {vaPorPack ? ` · 1 bulto = ${limpio(fila.factorPack)} u` : ""}
        </span>

        <FilaStepper rotulo="Bultos" valor={bultos} onCambiar={setBultos} />
        {/* Sin pack no hay sueltas que contar: el bulto ES la unidad. */}
        {vaPorPack && <FilaStepper rotulo="Sueltas" valor={sueltas} onCambiar={setSueltas} />}

        <div className="min-h-barraStock sunmi-control rounded-control px-filtro py-entreFiltros flex items-center justify-between gap-renglon">
          <span className="text-sm3 sunmi-text-muted">Entra al stock</span>
          <span className="text-sm3 font-bold tabular-nums">
            {limpio(entraAlStock)} {entraAlStock === 1 ? "unidad" : "unidades"}
          </span>
        </div>
      </div>

      {/* ── 2 · EL PRECIO, SOLO SI CAMBIÓ ────────────────────────────────── */}
      {cambio && (
        <div className="border-t sunmi-divider pt-hoja flex flex-col gap-renglon">
          <span className="text-sm3 font-medium sunmi-text-strong">
            El precio {porcentaje != null && porcentaje < 0 ? "bajó" : "subió"}{" "}
            {porcentaje != null ? `${Math.abs(porcentaje).toFixed(1).replace(".", ",")} %` : ""}
          </span>
          <span className="text-sm3 sunmi-text-muted">
            Tenías {formatearMoneda(fila.costoCatalogo)} · la factura trae{" "}
            {formatearMoneda(fila.costoFactura)}
          </span>

          <div className="flex flex-col gap-0.5">
            <OpcionDePrecio
              elegida={aceptaPrecio}
              titulo="Aceptar el precio nuevo"
              detalle="Pasa a ser tu costo. El margen se recalcula."
              onElegir={() => setAceptaPrecio(true)}
            />
            <OpcionDePrecio
              elegida={!aceptaPrecio}
              titulo="Dejar el que tenía"
              detalle="Entra la mercadería sin tocar el costo."
              onElegir={() => setAceptaPrecio(false)}
            />
          </div>
        </div>
      )}

      {/* ── 3 · EL MOTIVO, SOLO SI LA CANTIDAD NO COINCIDE ───────────────── */}
      {cantidadDifiere && (
        <div className="border-t sunmi-divider pt-hoja flex flex-col gap-renglon">
          <span className="text-sm3 font-medium sunmi-text-strong">Motivo de la diferencia</span>
          <div className="flex flex-wrap gap-dentroFiltro">
            {MOTIVOS.map((m) => (
              <SunmiButton
                key={m.valor}
                color={motivo === m.valor ? "primary" : "slate"}
                type="button"
                aria-pressed={motivo === m.valor}
                onClick={() => setMotivo(m.valor)}
                className="flex-1 min-h-toque justify-center rounded-control text-sm3"
              >
                {m.texto}
              </SunmiButton>
            ))}
          </div>
          {motivo === "Otro" && (
            <SunmiInput
              type="text"
              aria-label="Qué pasó"
              placeholder="Contá qué pasó"
              value={detalleMotivo}
              onChange={(e) => setDetalleMotivo(e.target.value)}
              className="w-full min-h-toque px-4 text-sm3"
            />
          )}
        </div>
      )}

      {error && <span className="text-sm3 sunmi-text-danger">{error}</span>}

      <div className="flex gap-renglon">
        <SunmiButton
          color="slate"
          type="button"
          onClick={onCerrar}
          className="flex-1 min-h-botonFoto justify-center text-sm3"
        >
          Cancelar
        </SunmiButton>
        <SunmiButton
          color="primary"
          type="button"
          disabled={guardando}
          onClick={guardar}
          className="flex-1 min-h-botonFoto justify-center text-sm3"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </SunmiButton>
      </div>
    </SunmiModalLayout>
  );
}
