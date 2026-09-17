"use client";

// 3 · ¿LEÍ BIEN LA LISTA?
//
// La primera vez que llega la lista de un proveedor, y cada vez que el archivo
// cambia de estructura. Después no se ve más: la respuesta queda guardada.
//
// ── POR QUÉ SE PREGUNTA CON EJEMPLOS Y NO CON NOMBRES DE COLUMNA ────────────
//
// Porque "columna «FINAL»" no le dice nada a nadie: el archivo de ese proveedor
// tiene tres columnas que se llaman parecido. Lo que permite contestar sin abrir
// el PDF son los VALORES que el sistema leyó de esa columna, y los primeros
// productos armados. Si el precio dice "$ 5.366,80" y el producto es LIVRA
// MANZANA, está bien; si dice "6", está mal, y se ve de un vistazo.
//
// ── EL PRECIO LLEVA SU EVIDENCIA ───────────────────────────────────────────
//
// De todas las columnas, la del precio es la única que el sistema puede
// verificar solo: prueba cada candidata contra los costos que ya están cargados
// y cuenta en cuántos productos cierra. Ese número se muestra —"coincide con tus
// costos en 94 de cada 100 productos"— porque es la diferencia entre una
// propuesta y una adivinanza.
//
// ── CUANDO EL SISTEMA NO PUDO ELEGIR ───────────────────────────────────────
//
// Dos columnas que dan resultados parecidos, o ninguna que cierre. Ahí esta
// pantalla abre con el precio SIN elegir y lo pide: es lo único que el usuario
// puede resolver y el sistema no.

import { useMemo, useState } from "react";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import { Aviso, money } from "@/components/proveedores/listas/PiezasPantallas";
import { CAMPO } from "@/lib/proveedores/listas/lectura/deteccionDeColumnas";
import { numeroDeLista } from "@/lib/proveedores/listas/lectura/numeroDeLista";

/** Los datos que se le muestran al usuario, en el orden en que los lee. */
const DATOS = [
  { campo: CAMPO.CODIGO, titulo: "Código" },
  { campo: CAMPO.DESCRIPCION, titulo: "Producto" },
  { campo: CAMPO.CANTIDAD, titulo: "Unidades por caja" },
  { campo: CAMPO.DESCUENTO, titulo: "Descuento" },
];

export default function ConfirmarColumnas({ proveedor, pregunta, trabajando, onVolver, onConfirmado }) {
  const titulos = pregunta?.titulos ?? [];
  const ejemplos = pregunta?.ejemplos ?? [];
  const conteo = pregunta?.conteo ?? null;
  const opciones = pregunta?.opciones ?? [];

  // El mapa que se está mirando. Arranca en lo que propuso el servidor y el
  // usuario lo corrige; el precio arranca sin elegir cuando hubo empate.
  const [mapeo, setMapeo] = useState(() => ({ ...(pregunta?.mapeo ?? {}) }));
  const [columnaPrecio, setColumnaPrecio] = useState(() => {
    if (pregunta?.empate) return null;
    const precios = pregunta?.mapeo?.precios ?? [];
    return precios.length > 0 ? precios[0] : null;
  });
  const [conDescuento, setConDescuento] = useState(false);
  const [cambiando, setCambiando] = useState(null);

  /** Cuántas filas explicó cada columna candidata, si el servidor lo contó. */
  const respaldo = useMemo(() => {
    const m = new Map();
    for (const o of opciones) {
      if (o.conDescuento) continue;
      m.set(o.columna, { explicadas: o.explicadas, comparables: o.comparables });
    }
    return m;
  }, [opciones]);

  const precioElegido = columnaPrecio !== null && columnaPrecio !== undefined;
  const puedeSeguir = !trabajando && mapeo.codigo !== null && mapeo.descripcion !== null && precioElegido;

  const cambiarColumna = (campo, indice) => {
    setMapeo((ant) => {
      const nuevo = { ...ant };
      // Una columna es UNA cosa: asignarla a un campo se la saca al anterior.
      // Sin esto se puede dejar la misma columna como código y como precio, y el
      // resultado sería una lista de costos iguales a los códigos.
      for (const k of ["codigo", "codigoBarra", "descripcion", "cantidad", "descuento"]) {
        if (nuevo[k] === indice) nuevo[k] = null;
      }
      nuevo[campo] = indice;
      return nuevo;
    });
    setCambiando(null);
  };

  const elegirPrecio = (indice) => {
    setColumnaPrecio(indice);
    setMapeo((ant) => ({
      ...ant,
      // La elegida va primera entre las candidatas, y las demás se conservan: el
      // motor las vuelve a probar en cada importación.
      precios: [indice, ...(ant.precios ?? []).filter((c) => c !== indice)],
    }));
    setCambiando(null);
  };

  return (
    <>
      {/* El título ya lo pone la página en la fila del shell —cambia a "¿Leí
          bien la lista?" al entrar a este paso— y la salida también. Acá queda
          el subtítulo, que es propio de esta pregunta y no del paso.
          El volver del shell vuelve al listado, y para retroceder AL PASO
          ANTERIOR sin perder el archivo está "Algo está mal", abajo: son dos
          vueltas distintas y antes las dos decían "Volver". */}
      <p className="text-sm2 sunmi-text-muted leading-snug">
        {pregunta?.empate
          ? pregunta?.error
          : `Es la primera lista de ${proveedor?.nombre ?? "este proveedor"}. Fijate que estos datos estén bien: te lo pregunto una sola vez.`}
      </p>

      {pregunta?.queCambio && <Aviso tono="warning">{pregunta.queCambio}</Aviso>}

      <SunmiCard className="p-0 overflow-hidden">
        {DATOS.map(({ campo, titulo }) => {
          const indice = mapeo[campo];
          if (campo === CAMPO.CANTIDAD && indice === null) return null;
          if (campo === CAMPO.DESCUENTO && indice === null) return null;
          return (
            <Dato
              key={campo}
              titulo={titulo}
              nombreColumna={indice === null ? null : titulos[indice]}
              abierto={cambiando === campo}
              titulos={titulos}
              onAbrir={() => setCambiando(cambiando === campo ? null : campo)}
              onElegir={(i) => cambiarColumna(campo, i)}
            />
          );
        })}

        <Dato
          titulo="Precio"
          nombreColumna={precioElegido ? titulos[columnaPrecio] : null}
          textoSinElegir="Elegí cuál es"
          evidencia={evidenciaDePrecio(respaldo.get(columnaPrecio))}
          abierto={cambiando === "precio"}
          titulos={titulos}
          soloEstas={pregunta?.mapeo?.precios ?? null}
          respaldo={respaldo}
          onAbrir={() => setCambiando(cambiando === "precio" ? null : "precio")}
          onElegir={elegirPrecio}
        />
      </SunmiCard>

      {/* CON O SIN DESCUENTO, solo si el archivo trae una columna de descuento.
          Preguntarlo siempre sería preguntar por algo que no existe. */}
      {mapeo.descuento !== null && mapeo.descuento !== undefined && (
        <SunmiCard className="p-4 space-y-2">
          <p className="text-sm3 font-semibold sunmi-text-strong">
            ¿El precio ya tiene el descuento aplicado?
          </p>
          <div className="grid grid-cols-2 gap-3">
            <SunmiButton
              color={!conDescuento ? "cyan" : "slate"}
              onClick={() => setConDescuento(false)}
              aria-pressed={!conDescuento}
              className="min-h-toque text-base font-semibold"
            >
              Ya lo tiene
            </SunmiButton>
            <SunmiButton
              color={conDescuento ? "cyan" : "slate"}
              onClick={() => setConDescuento(true)}
              aria-pressed={conDescuento}
              className="min-h-toque text-base font-semibold"
            >
              Hay que restarlo
            </SunmiButton>
          </div>
          <p className="text-sm2 sunmi-text-muted leading-snug">
            Si no estás seguro, dejalo como está: el sistema va a avisar si los costos no cierran.
          </p>
        </SunmiCard>
      )}

      <div className="space-y-2">
        <h2 className="text-sm3 font-semibold sunmi-text-strong">Así quedan los primeros productos</h2>
        {ejemplos.slice(0, 3).map((e, i) => (
          <SunmiCard key={i} className="p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm3 sunmi-text-strong truncate">
                  {valor(e, mapeo.descripcion) || "(sin nombre)"}
                </div>
                <div className="text-xs2 sunmi-text-muted">
                  Código {valor(e, mapeo.codigo) || "—"}
                  {mapeo.cantidad !== null && mapeo.cantidad !== undefined
                    ? ` · Caja de ${valor(e, mapeo.cantidad) || "—"}`
                    : ""}
                </div>
              </div>
              <div className="text-sm3 font-semibold tabular-nums sunmi-text-strong shrink-0">
                {precioElegido ? money(numeroDeLista(valor(e, columnaPrecio))) : "—"}
              </div>
            </div>
          </SunmiCard>
        ))}
      </div>

      {conteo && (
        <p className="text-sm2 sunmi-text-muted leading-snug">
          {conteo.descartadas === 1
            ? "Salteé 1 fila que no es un producto (un título o un encabezado)."
            : `Salteé ${conteo.descartadas} filas que no son productos (títulos y encabezados).`}
        </p>
      )}

      <div className="space-y-2">
        <SunmiButton
          color="cyan"
          onClick={() => onConfirmado({ columnaPrecio, conDescuento, mapeo, titulos, huella: pregunta?.huella })}
          disabled={!puedeSeguir}
          className="w-full min-h-toque text-base font-bold"
        >
          {trabajando ? "Leyendo…" : "Está bien, seguir"}
        </SunmiButton>
        {!precioElegido && (
          <p className="text-sm2 sunmi-text-warning text-center leading-snug">
            Elegí cuál columna es el precio que te factura este proveedor.
          </p>
        )}
        <SunmiButton color="slate" onClick={onVolver} className="w-full min-h-toque text-sm3">
          Algo está mal
        </SunmiButton>
      </div>
    </>
  );
}

/** "Es la que coincide con tus costos en 94 de cada 100 productos". */
function evidenciaDePrecio(r) {
  if (!r || !r.comparables) return null;
  const de100 = Math.round((r.explicadas / r.comparables) * 100);
  return `Es la que coincide con tus costos en ${de100} de cada 100 productos.`;
}

function valor(ejemplo, indice) {
  if (indice === null || indice === undefined) return "";
  return String(ejemplo?.valores?.[indice] ?? "").trim();
}

/**
 * Un dato detectado, con el botón para cambiar de columna.
 *
 * La lista de columnas se abre ADENTRO de la fila y no en un modal: en un
 * teléfono, un modal encima tapa justamente los ejemplos que uno está mirando
 * para decidir.
 */
function Dato({
  titulo,
  nombreColumna,
  textoSinElegir = "Sin detectar",
  evidencia,
  abierto,
  titulos = [],
  soloEstas = null,
  respaldo = null,
  onAbrir,
  onElegir,
}) {
  const indices = (soloEstas ?? titulos.map((_, i) => i));
  return (
    <div className="p-3 border-b sunmi-border last:border-b-0">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm3 font-semibold sunmi-text-strong">{titulo}</div>
          <div className="text-sm2 sunmi-text-muted truncate">
            {nombreColumna ? `columna «${nombreColumna}»` : textoSinElegir}
          </div>
          {evidencia && <div className="text-sm2 sunmi-text-success leading-snug">{evidencia}</div>}
        </div>
        <SunmiButton
          color="slate"
          onClick={onAbrir}
          aria-expanded={abierto}
          className="min-h-toque min-w-toque shrink-0 text-sm2"
        >
          {abierto ? "Cerrar" : "Cambiar"}
        </SunmiButton>
      </div>

      {abierto && (
        <div className="mt-2 space-y-1">
          {indices.map((i) => {
            const r = respaldo?.get(i);
            return (
              <SunmiButton
                key={i}
                color="ghost"
                onClick={() => onElegir(i)}
                className="w-full text-left min-h-toque sunmi-surface-soft rounded-lg px-3 block"
              >
                <span className="text-sm3 sunmi-text-strong">
                  {titulos[i] || `Columna ${i + 1}`}
                </span>
                {r?.comparables ? (
                  <span className="block text-xs2 sunmi-text-muted">
                    coincide en {Math.round((r.explicadas / r.comparables) * 100)} de cada 100
                  </span>
                ) : null}
              </SunmiButton>
            );
          })}
        </div>
      )}
    </div>
  );
}
