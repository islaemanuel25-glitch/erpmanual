"use client";

// LA TERCERA FORMA DEL PANEL: un producto que la lista NO trajo.
//
// Las dos formas que ya andan viven de una comparación —el archivo dice esto, el
// ERP dice aquello—. Acá no hay fila del archivo, así que no hay contra qué
// comparar: arriba va lo que hay en el SISTEMA y abajo las tarjetas de siempre.
//
//   CASO A · sin código de Arcor guardado
//     Las tarjetas son FILAS del archivo. Elegir una dice "este producto es esta
//     fila", y de ahí sale el vínculo que va a faltar en todas las listas
//     siguientes. La sugerencia usa DOS señales: el parecido de nombre Y que el
//     costo caiga en el aumento esperado. Una sola señal muestra pero no propone.
//
//   CASO B · con código, pero la lista no lo trajo
//     Las tarjetas son destinos. Ninguno toca un costo.
//
// La forma la decide `formaDelPanelDeProducto`, no este componente.

import { useMemo, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";

import SunmiButton from "@/components/sunmi/SunmiButton";
import { money, fechaHora } from "@/lib/proveedores/listas/presentacion";
import { TONO_ESTADO_VARIACION, TEXTO_ESTADO_VARIACION } from "@/lib/proveedores/listas/rangoAumento";
import {
  PREGUNTA,
  DESTINO,
  TEXTO_DESTINO,
  DETALLE_DESTINO,
  formaDelPanelDeProducto,
} from "@/lib/proveedores/listas/panelDecision";
import { candidatosParaProducto, sugerenciaUnica } from "@/lib/proveedores/listas/candidatosSinCodigo";
import { rangoDeLaFila } from "@/lib/proveedores/listas/vigenciaConfirmacion";

const pct = (n) =>
  n === null || n === undefined ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(1)} %`;

/** Arriba: lo que hay en el sistema. Es todo lo que se puede afirmar. */
function LoQueHayEnElSistema({ producto }) {
  const dato = (etiqueta, valor) => (
    <div className="min-w-0">
      <div className="text-[9.5px] uppercase sunmi-text-muted font-semibold">{etiqueta}</div>
      <div className="text-[11.5px] sunmi-text-strong truncate">{valor ?? "—"}</div>
    </div>
  );
  return (
    <div className="rounded-lg border sunmi-border p-2.5">
      <div className="text-[10px] uppercase font-semibold sunmi-text-accent mb-1.5">
        Lo que hay en el sistema
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {dato("Producto", producto?.nombre)}
        {dato("SKU", producto?.sku)}
        {dato("Código de barras", producto?.codigoBarra)}
        {dato("Costo actual", money(producto?.costoActual))}
        {dato("Últ. actualización", fechaHora(producto?.actualizadoEn))}
      </div>
      {producto?.codigosProveedor?.length ? (
        <div className="text-[9.5px] sunmi-text-muted mt-1.5">
          Códigos del proveedor:{" "}
          {producto.codigosProveedor
            .map((c) => `${c.codigo}${c.activo ? "" : " (dado de baja)"}`)
            .join(" · ")}
        </div>
      ) : null}
    </div>
  );
}

/** Una tarjeta elegible. Misma forma que las de las otras dos preguntas. */
function Tarjeta({ clave, titulo, detalle, elegida, sugerida, onElegir, extra, senales }) {
  return (
    <label
      style={elegida ? { borderColor: "var(--pos-accent)" } : undefined}
      className={`block rounded-lg border p-2.5 transition-colors sunmi-border cursor-pointer ${
        elegida ? "sunmi-surface-soft" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <input
          type="radio"
          checked={!!elegida}
          onChange={() => onElegir?.(clave)}
          aria-label={titulo}
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[12px] font-semibold sunmi-text-strong">{titulo}</span>
            {sugerida ? (
              <span className="text-[9.5px] px-1.5 py-0.5 rounded sunmi-badge-accent inline-flex items-center gap-1">
                <Check size={10} aria-hidden="true" /> sugerida
              </span>
            ) : null}
            {senales?.length ? (
              <span className="text-[9.5px] sunmi-text-muted">
                {senales.length === 2 ? "nombre y precio" : senales[0] === "NOMBRE" ? "solo el nombre" : "solo el precio"}
              </span>
            ) : null}
          </div>
          {detalle ? (
            <div className="text-[10.5px] sunmi-text-muted leading-tight mt-0.5">{detalle}</div>
          ) : null}
          {extra}
        </div>
      </div>
    </label>
  );
}

export default function PanelProducto({
  producto,
  importacion,
  filasSinMachear = [],
  onVincularFila,
  onDestino,
  trabajando = false,
}) {
  const [eleccion, setEleccion] = useState(null);

  // Los candidatos se calculan con el mismo módulo que mide el servidor: la
  // pantalla no inventa una regla de parecido propia.
  const candidatos = useMemo(() => {
    if (producto?.grupo !== "SIN_CODIGO") return [];
    return candidatosParaProducto({
      producto: {
        nombre: producto.nombre,
        precio_costo: producto.costoActual,
        unidad_medida: producto.unidadMedida,
        factor_pack: producto.factorPack,
        modoCompraProveedor: producto.modoCompraProveedor,
      },
      filas: filasSinMachear,
      recargoPct: importacion?.recargoPct,
      rango: rangoDeLaFila({}, importacion),
    });
  }, [producto, filasSinMachear, importacion]);

  const sugerida = useMemo(() => sugerenciaUnica(candidatos), [candidatos]);
  const forma = formaDelPanelDeProducto({ grupo: producto?.grupo, candidatos: candidatos.length });

  const confirmar = () => {
    if (!eleccion) return;
    if (forma.pregunta === PREGUNTA.FILA) onVincularFila?.(Number(eleccion));
    if (forma.pregunta === PREGUNTA.DESTINO) onDestino?.(eleccion);
  };

  return (
    <div data-rol="panel-producto" className="space-y-2 p-2.5">
      <LoQueHayEnElSistema producto={producto} />

      {forma.pregunta === null ? (
        <div className="rounded-lg border sunmi-border p-2.5">
          <div className="text-[12px] font-semibold sunmi-text-strong">Nada que elegir</div>
          <div className="text-[10.5px] sunmi-text-muted mt-0.5">
            Ninguna fila del archivo se parece a este producto ni da un costo coherente. Si el
            proveedor lo informó con otro nombre, buscalo a mano.
          </div>
        </div>
      ) : null}

      {forma.pregunta === PREGUNTA.FILA ? (
        <>
          <p className="text-[10.5px] sunmi-text-muted leading-snug">
            Elegí qué fila del archivo es este producto. Se sugiere solo cuando el nombre se
            parece <span className="font-semibold">y</span> el costo cae en el aumento esperado:
            una sola señal se muestra, pero no propone.
          </p>
          <div className="space-y-1.5">
            {candidatos.map((c) => (
              <Tarjeta
                key={c.filaId}
                clave={String(c.filaId)}
                titulo={c.descripcion || `Fila ${c.filaExcel}`}
                detalle={`Fila ${c.filaExcel} · código ${c.codigo ?? "—"} · parecido ${Math.round(c.parecido * 100)} %`}
                elegida={eleccion === String(c.filaId)}
                sugerida={sugerida?.filaId === c.filaId}
                senales={c.senales}
                onElegir={setEleccion}
                extra={
                  <div className="text-[10.5px] mt-1 tabular-nums">
                    Costo quedaría en <span className="font-semibold">{money(c.costoNuevo)}</span>{" "}
                    <span className={TONO_ESTADO_VARIACION[c.estadoVariacion] ?? "sunmi-text-muted"}>
                      {pct(c.variacionPct)} · {TEXTO_ESTADO_VARIACION[c.estadoVariacion] ?? "—"}
                    </span>
                  </div>
                }
              />
            ))}
          </div>
        </>
      ) : null}

      {forma.pregunta === PREGUNTA.DESTINO ? (
        <>
          <p className="text-[10.5px] sunmi-text-muted leading-snug">
            El proveedor no informó este producto en esta lista. Ninguna de estas opciones toca
            el costo.
          </p>
          <div className="space-y-1.5">
            {Object.values(DESTINO).map((d) => (
              <Tarjeta
                key={d}
                clave={d}
                titulo={TEXTO_DESTINO[d]}
                detalle={DETALLE_DESTINO[d]}
                elegida={eleccion === d}
                onElegir={setEleccion}
              />
            ))}
          </div>
          {eleccion === DESTINO.DISCONTINUADO ? (
            <div className="rounded-lg border sunmi-border p-2 flex items-start gap-2 sunmi-text-warning">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div className="text-[10.5px] leading-snug">
                Se da de baja el código de este proveedor. El producto no se toca: sigue vivo en
                el sistema y se puede seguir vendiendo. Si el proveedor vuelve a traerlo, se
                vincula de nuevo.
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {forma.pregunta !== null ? (
        <div className="flex justify-end pt-0.5">
          <SunmiButton
            color="amber"
            onClick={confirmar}
            disabled={!eleccion || trabajando}
            className="py-1.5 px-3 !text-[11px]"
          >
            {trabajando ? "Guardando…" : "Confirmar y seguir"}
          </SunmiButton>
        </div>
      ) : null}
    </div>
  );
}
