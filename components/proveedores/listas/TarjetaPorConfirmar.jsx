"use client";

// «POR CONFIRMAR» DEL PAQUETE 2, "PUEDEN SER DE DAB" (Emanuel, 2026-10-24).
//
// Un producto tuyo de otro proveedor, o sin proveedor, que se parece a un
// renglón de la lista: el nombre grande, con qué proveedor figura hoy, la
// pregunta "¿Es 4148 · GRANIX BOCADITOS FRUTILLA 2KG?" y el precio de la lista.
//
// Era la tarjeta de la hoja "Pueden ser de…" (`TarjetaPosible`), que se borró
// cuando el paquete 2 pasó a tener su pantalla: se mudó acá tal cual, con la
// forma de las de la revisión (`TarjetaDeRevision`): «✓ Sí» arriba a la
// derecha; «No» y «Otro» abajo a la izquierda. QUÉ hace cada botón lo decide
// la pantalla.

import SunmiButton from "@/components/sunmi/SunmiButton";
import { TarjetaDeRevision, CLASE_ACCION_CORREGIR, CLASE_ACCION_RAPIDA } from "@/components/revision/PiezasDeRevision";
import { money } from "@/components/proveedores/listas/PiezasPantallas";
import { preguntaDeLaSugerencia, TEXTO_OTRO, TEXTO_SI } from "@/components/proveedores/listas/TarjetaProductoDeLaLista";

export const TEXTO_NO = "No";

/**
 * @param item  uno de `puedenSer.porConfirmar` del resultado:
 *              `{ productoBaseId, nombre, proveedoresDeHoy, renglon }`
 */
export default function TarjetaPorConfirmar({ item, abierta = true, trabajando = false, error = "", onSi, onNo, onOtro }) {
  return (
    <TarjetaDeRevision
      nombre={item.nombre}
      debajo={
        <>
          <p className="text-xs sunmi-text-muted">{item.proveedoresDeHoy}</p>
          <p className="text-sm2 sunmi-text-strong break-words">{preguntaDeLaSugerencia(item.renglon)}</p>
          <p className="text-xs sunmi-text-muted tabular-nums">{money(item.renglon?.precio)}</p>
        </>
      }
      accionArriba={
        abierta ? (
          <SunmiButton onClick={() => onSi?.(item)} disabled={trabajando} className={`shrink-0 ${CLASE_ACCION_RAPIDA}`}>
            {TEXTO_SI}
          </SunmiButton>
        ) : null
      }
      avisos={error ? <p className="text-sm2 sunmi-text-danger">{error}</p> : null}
      accionAbajo={
        abierta ? (
          <div className="flex items-center gap-2">
            <SunmiButton onClick={() => onNo?.(item)} disabled={trabajando} className={`shrink-0 ${CLASE_ACCION_CORREGIR}`}>
              {TEXTO_NO}
            </SunmiButton>
            <SunmiButton onClick={() => onOtro?.(item)} disabled={trabajando} className={`shrink-0 ${CLASE_ACCION_CORREGIR}`}>
              {TEXTO_OTRO}
            </SunmiButton>
          </div>
        ) : null
      }
      data-producto={item.productoBaseId}
    />
  );
}
