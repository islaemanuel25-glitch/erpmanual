"use client";

// LA RECETA PROPUESTA, CONFIRMADA SIN SALIR DE LA RECEPCIÓN.
//
// ── EL CASO (Emanuel, 2026-10-21) ─────────────────────────────────────────
//
// Con la primera factura de un proveedor sin receta, el lector grande la lee,
// la cuenta cierra y su explicación queda propuesta (`lector/escalada.js`).
// Hasta hoy eso se confirmaba solo en Compras → Recetas de facturas, y Emanuel
// sube la factura acá, en la recepción: tenía que irse a otra pantalla para
// decir "está bien".
//
// ── NO ES UN BLOQUE NUEVO ─────────────────────────────────────────────────
//
// Son las piezas de Recetas de facturas (`PropuestaDeReceta.jsx`) con el
// guardado de esa pantalla (`useGuardarLaExplicacion`): la misma ruta, el
// mismo cuerpo con `confirmarPropuesta`, y el permiso que esa ruta revalida.
// Lo único propio de la recepción es QUÉ propuestas se ofrecen
// (`propuestasParaLaRecepcion`) y qué NO se relee al confirmar: los papeles de
// este pedido, que están en la mano.
//
// «Algo está mal: corregir la explicación» lleva a Recetas de facturas con el
// papel que armó la propuesta, que es donde se prueba y se corrige.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import PropuestaDeReceta, {
  MensajeDeLaReceta,
  TarjetaDeLaExplicacion,
  sePuedeGuardarLaExplicacion,
} from "@/components/compras-proveedor/PropuestaDeReceta";
import { useGuardarLaExplicacion } from "@/components/compras-proveedor/ExplicacionDelPapel";
import { comoLoEntendio } from "@/lib/compras-proveedor/comprobante/pruebaDeExplicacion";
import { propuestasParaLaRecepcion } from "@/lib/compras-proveedor/comprobante/explicacionPorTipo";

/** Una propuesta: su explicación, cómo leyó el papel y el botón. */
function UnaPropuesta({ propuesta, guardando, releyendo, onGuardar, onCorregir }) {
  const [explicacion, setExplicacion] = useState(propuesta.explicacion);
  // La MISMA cuenta que hace Recetas de facturas con una propuesta: la lectura
  // con la que cerró, sin gastar otra consulta.
  const resultado = useMemo(() => comoLoEntendio({ lectura: propuesta.lectura }), [propuesta.lectura]);
  const sePuedeGuardar = sePuedeGuardarLaExplicacion({ resultado, explicacion });
  return (
    <section className="space-y-3">
      <TarjetaDeLaExplicacion
        tipo={propuesta.tipoComprobante}
        propuesta
        explicacion={explicacion}
        onCambiar={setExplicacion}
      />
      <PropuestaDeReceta
        resultado={resultado}
        propuesta
        guardando={guardando}
        releyendo={releyendo}
        sePuedeGuardar={sePuedeGuardar}
        onGuardar={() => onGuardar(explicacion)}
        onCorregir={onCorregir}
      />
    </section>
  );
}

/**
 * @param proveedorId    el del pedido
 * @param comprobantes   los del pedido, `[{ id, letra }]`: de ellos sale qué
 *                       tipo de papel llegó, y son los que no se releen
 */
export default function PropuestaEnLaRecepcion({ proveedorId, comprobantes = [] }) {
  const router = useRouter();
  const [propuestas, setPropuestas] = useState([]);
  const [mensaje, setMensaje] = useState(null);
  const { guardando, releyendo, guardar } = useGuardarLaExplicacion({ setMensaje });

  // Una clave estable: la lista llega armada de nuevo en cada render.
  const letras = comprobantes.map((c) => c?.letra ?? "").join("|");

  useEffect(() => {
    if (!proveedorId) return undefined;
    let vigente = true;
    (async () => {
      try {
        const r = await fetch(
          `/api/compras-proveedor/recetas/explicacion?proveedorId=${proveedorId}`,
          { credentials: "include", cache: "no-store" }
        );
        const d = await r.json().catch(() => null);
        if (!vigente) return;
        // Sin respuesta no se ofrece nada, y no se dice en rojo: la propuesta
        // sigue esperando en Recetas de facturas, y esto no frena la recepción.
        if (!d?.ok) return;
        setPropuestas(
          propuestasParaLaRecepcion({
            propuestas: d.propuestas,
            explicaciones: d.explicaciones,
            tiposDelPedido: letras.split("|"),
          })
        );
      } catch {
        // Igual que arriba: sin conexión, la recepción sigue como estaba.
      }
    })();
    return () => {
      vigente = false;
    };
  }, [proveedorId, letras]);

  async function confirmar(propuesta, explicacion) {
    const guardo = await guardar({
      cuerpo: {
        proveedorId,
        tipoComprobante: propuesta.tipoComprobante,
        explicacion,
        confirmarPropuesta: true,
      },
      exceptuar: comprobantes.map((c) => c?.id).filter(Boolean),
    });
    // Confirmada, deja de estar pendiente y el bloque se va.
    if (guardo) {
      setPropuestas((prev) => prev.filter((p) => p.tipoComprobante !== propuesta.tipoComprobante));
    }
  }

  function corregir(propuesta) {
    const volverA = typeof window !== "undefined" ? window.location.pathname : "";
    const conPapel = propuesta.comprobanteId ? `comprobante=${propuesta.comprobanteId}&` : "";
    router.push(
      `/modulos/proveedores/recetas/${proveedorId}?${conPapel}volverA=${encodeURIComponent(volverA)}`
    );
  }

  if (!propuestas.length && !mensaje) return null;

  return (
    <div className="space-y-3">
      {propuestas.map((p) => (
        <UnaPropuesta
          key={p.tipoComprobante}
          propuesta={p}
          guardando={guardando}
          releyendo={releyendo}
          onGuardar={(explicacion) => confirmar(p, explicacion)}
          onCorregir={() => corregir(p)}
        />
      ))}
      <MensajeDeLaReceta mensaje={mensaje} />
    </div>
  );
}
