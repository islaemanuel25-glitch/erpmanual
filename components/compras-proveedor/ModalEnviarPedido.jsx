"use client";

import { useState } from "react";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLinkButton from "@/components/sunmi/SunmiLinkButton";
import { RESULTADO_COMPARTIR } from "@/lib/compartir/compartirArchivo";
import { cantidadDeProductos, totalEstimadoDelPedido } from "@/lib/compras-proveedor/textoPedido";
import { formatearMoneda } from "@/lib/moneda";
import useAccionesEnvioPedido from "@/hooks/useAccionesEnvioPedido";

/**
 * Modal de envío de un pedido a proveedor.
 *
 * ── UN BOTÓN QUE MANDA Y MARCA, EN VEZ DE DOS PASOS ───────────────────────
 *
 * Hasta el 2026-09-19 esto eran dos cosas separadas: compartí el pedido por un
 * lado, y después tocá "Marcar como enviado al proveedor". El sistema preguntaba
 * algo que no puede verificar, y de ahí salían los dos desenlaces malos: alguien
 * marca sin haber mandado, o manda y se olvida de marcar — y el pedido se queda
 * en borrador para siempre, invisible para Recibir mercadería.
 *
 * Ahora el botón principal hace las dos cosas, y lo que decide si marca es POR
 * CUÁL CAMINO SALIÓ el menú de compartir:
 *
 *   · COMPARTIDO — eligió a dónde mandarlo. Se marca, sin preguntar nada: la
 *     persona ya hizo el gesto que confirma el envío.
 *   · CANCELADO  — abrió el menú y lo cerró. NO se marca. Cancelar es una
 *     decisión, y marcar acá sería inventar un envío que no pasó.
 *   · DESCARGADO — el aparato no puede compartir archivos, así que el PDF bajó a
 *     la carpeta de descargas. Ahí sí se pregunta, porque bajar un archivo no es
 *     haberlo mandado: el envío todavía falta.
 *
 * ── Y UNA SALIDA EN TEXTO, NO EN BOTÓN ────────────────────────────────────
 *
 * "Ya se lo mandé por otro medio" marca sin abrir nada, para cuando se llamó por
 * teléfono o se mandó de otra forma. Va como texto y no como botón a propósito:
 * es el caso raro, y un tercer botón lo pondría a competir con el que hay que
 * tocar.
 *
 * Props: pedido (objeto completo de /obtener), onClose, onEnviado.
 */
export default function ModalEnviarPedido({ pedido, onClose, onEnviado }) {
  const {
    mandarAlProveedor,
    copiarTextoDelProveedor,
    descargarPdfDelProveedor,
    descargarPrefactura,
    marcarEnviado,
  } = useAccionesEnvioPedido(pedido);

  const [trabajando, setTrabajando] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const productos = cantidadDeProductos(pedido);
  const total = totalEstimadoDelPedido(pedido);

  /** El único camino por el que este modal marca. Los tres lo usan. */
  const marcar = async () => {
    const r = await marcarEnviado();
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    onEnviado?.();
    return true;
  };

  const mandar = async () => {
    if (trabajando) return;
    setTrabajando("mandar");
    setError("");
    setAviso("");
    try {
      const resultado = await mandarAlProveedor();

      if (resultado === RESULTADO_COMPARTIR.CANCELADO) {
        // No se marca y no se avisa nada: cerrar el menú es volver atrás, y un
        // cartel explicando que no pasó nada sobra.
        return;
      }

      if (resultado === RESULTADO_COMPARTIR.DESCARGADO) {
        if (
          !window.confirm(
            "Este aparato no puede compartir archivos, así que el PDF se descargó.\n\n" +
              "¿Ya se lo mandaste al proveedor?"
          )
        ) {
          setAviso(
            "El PDF quedó descargado. Mandalo y después usá «Ya se lo mandé por otro medio»."
          );
          return;
        }
      }

      await marcar();
    } catch (e) {
      setError(e?.message || "No se pudo preparar el pedido para mandar.");
    } finally {
      setTrabajando("");
    }
  };

  const copiar = async () => {
    setError("");
    const ok = await copiarTextoDelProveedor();
    setAviso(
      ok
        ? "Pedido copiado, sin precios."
        : "No se pudo copiar al portapapeles (¿permisos del navegador?)."
    );
  };

  const yaLoMande = async () => {
    if (trabajando) return;
    if (!window.confirm("¿Confirmás que este pedido ya fue enviado al proveedor?")) return;
    setTrabajando("marcar");
    setError("");
    setAviso("");
    try {
      await marcar();
    } finally {
      setTrabajando("");
    }
  };

  return (
    <SunmiModalLayout
      open
      // SE FUE LA CINTA ÁMBAR EN MAYÚSCULAS que decía "ENVIAR PEDIDO #N". Era un
      // título disfrazado de botón: lo más llamativo de la ventana sin ser lo que
      // hay que tocar. Sin el prop, el kit dibuja el encabezado de tarjeta —texto
      // normal— que es lo que corresponde a un título.
      title={`Pedido #${pedido?.id} guardado`}
      // EL RENGLÓN DE ABAJO NO VA COMO `subtitle`, Y NO ES UNA PREFERENCIA.
      //
      // `SunmiModalLayout` DECLARA el prop y NO LO REENVÍA a su encabezado, a
      // propósito y con su motivo escrito al lado: reenviarlo encendería de golpe
      // los seis subtítulos de modal que hoy están muertos, y dos de esos repiten
      // su propio título. O sea que pasarlo acá no fallaría: se descartaría en
      // silencio y el renglón no se dibujaría nunca.
      //
      // Lo comprobé abriendo el modal, no leyendo: la primera versión lo pasaba
      // como `subtitle` y el conteo NO APARECÍA en la pantalla. Así que va como
      // primer renglón del cuerpo, que es donde se ve.
      onClose={onClose}
      // El valor efectivo que esta pantalla ya tenía. El kit dejó de tener
      // default de `z`.
      z={9999}
      maxWidth="max-w-md"
      // El cuerpo es contenido suelto con sus propios márgenes: no tiene scroll
      // propio ni separación entre bloques que el kit deba poner.
      espacioCuerpo=""
      espacioPie=""
    >
      <>
        {/* Qué se guardó, en una línea: cuántos renglones y cuánto suma. Va acá
            y no en el encabezado por el motivo de arriba. */}
        <p className="text-sm2 sunmi-text-muted -mt-2 mb-3">
          {productos} {productos === 1 ? "producto" : "productos"}
          {total > 0 ? ` · ${formatearMoneda(total)}` : ""}
        </p>

        {/* ── PARA EL PROVEEDOR ─────────────────────────────────────────── */}
        <div className="mb-1">
          <span className="text-sm2 font-semibold sunmi-text-strong">Para el proveedor</span>
          <p className="text-sm2 sunmi-text-muted">Producto, cantidad y unidad. Sin precios.</p>
        </div>

        <SunmiButton
          color="amber"
          type="button"
          className="w-full min-h-principal justify-center"
          disabled={!!trabajando}
          onClick={mandar}
        >
          {trabajando === "mandar" ? "Preparando..." : "Mandar al proveedor"}
        </SunmiButton>

        <p className="text-sm2 sunmi-text-muted mt-1.5">
          Se abre el menú para compartir. Al volver, el pedido queda marcado como enviado.
        </p>

        <div className="flex gap-2 mt-2">
          <SunmiButton
            color="slate"
            type="button"
            className="flex-1 min-h-toque justify-center"
            disabled={!!trabajando}
            onClick={copiar}
          >
            Copiar texto
          </SunmiButton>
          <SunmiButton
            color="slate"
            type="button"
            className="flex-1 min-h-toque justify-center"
            disabled={!!trabajando}
            onClick={descargarPdfDelProveedor}
          >
            Descargar PDF
          </SunmiButton>
        </div>

        <div className="border-t sunmi-divider my-3" />

        {/* ── PARA VOS ──────────────────────────────────────────────────── */}
        <div className="mb-1">
          <span className="text-sm2 font-semibold sunmi-text-strong">Para vos</span>
          <p className="text-sm2 sunmi-text-muted">
            Con costos y total. No se la mandes al proveedor.
          </p>
        </div>

        <SunmiButton
          color="slate"
          type="button"
          className="w-full min-h-toque justify-center"
          disabled={!!trabajando}
          onClick={descargarPrefactura}
        >
          Descargar prefactura
        </SunmiButton>

        {aviso && <p className="text-sm2 sunmi-text-muted mt-3 text-center">{aviso}</p>}
        {error && <p className="text-sm2 sunmi-text-danger mt-3 text-center">{error}</p>}

        {/* LA SALIDA CHICA: texto y no botón, porque es el caso raro y un tercer
            botón competiría con el que hay que tocar.

            `min-h-toque` igual: medido abriendo el modal a 360, el enlace solo
            daba 14 px de alto, y 14 px en un Sunmi es un blanco que se falla. El
            alto se lo pone el consumidor —la pieza no reserva caja por contrato—
            y con `inline-flex` el subrayado no se estira. */}
        <div className="mt-3 flex justify-center">
          <SunmiLinkButton
            type="button"
            disabled={!!trabajando}
            onClick={yaLoMande}
            className="min-h-toque inline-flex items-center px-2"
          >
            {trabajando === "marcar" ? "Marcando..." : "Ya se lo mandé por otro medio"}
          </SunmiLinkButton>
        </div>
      </>
    </SunmiModalLayout>
  );
}
