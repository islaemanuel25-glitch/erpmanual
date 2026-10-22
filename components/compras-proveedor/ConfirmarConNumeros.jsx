"use client";

// LA CONFIRMACIÓN DE ALGO QUE SE LLEVA TRABAJO PUESTO.
//
// Se sacó tal cual del modal de borrar un comprobante (`PanelComprobantes`)
// cuando la recepción necesitó el mismo para anular un pedido (Emanuel,
// 2026-10-22). Dos copias se separarían el día que una cambie: regla 1.
//
// El contrato es el que ya tenía ese modal y es la razón de que exista:
//
//   · se dice CON NÚMEROS qué se lleva puesto —un "esta acción no se puede
//     deshacer" genérico no lo lee nadie—;
//   · lo que no se recupera volviendo a hacer algo va APARTE, en ámbar;
//   · el botón rojo NO es el primero: el que cancela está antes, porque el
//     dedo cae en el de arriba.

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";

/**
 * @param titulo        la pregunta: "¿Borrar este comprobante?"
 * @param subtitulo     qué cosa es, para no confundirla con otra
 * @param texto         qué se lleva, con números
 * @param aviso         lo que no se recupera, o null
 * @param error         lo que contestó el servidor si no se pudo, o null
 * @param textoNo       el que cancela
 * @param textoSi       el rojo
 * @param textoHaciendo el rojo mientras trabaja
 * @param trabajando    mientras el servidor trabaja: no se cierra ni se aprieta dos veces
 */
export default function ConfirmarConNumeros({
  titulo,
  subtitulo = null,
  texto,
  aviso = null,
  error = null,
  textoNo,
  textoSi,
  textoHaciendo,
  trabajando = false,
  onNo,
  onSi,
}) {
  return (
    <SunmiModalLayout
      open
      title={titulo}
      subtitle={subtitulo}
      color="red"
      onClose={() => (trabajando ? null : onNo())}
      // El valor que este modal ya tenía: era el default del kit y ahora se
      // declara, porque el kit dejó de tener uno. No cambia un píxel.
      espacioCuerpo="mt-2 gap-3"
      // El valor efectivo que esta pantalla ya tenía. El kit dejó de tener
      // default de `z`.
      z={9999}
    >
      <p className="text-xs sunmi-text-strong leading-snug">{texto}</p>
      {aviso && (
        <p className="text-xs sunmi-text-warning leading-snug mt-2 font-bold">{aviso}</p>
      )}
      {error && (
        <p className="text-xs sunmi-text-danger leading-snug mt-2">{error}</p>
      )}
      <div className="flex flex-col gap-2 mt-4">
        <SunmiButton
          color="slate"
          type="button"
          disabled={trabajando}
          className="py-3 justify-center"
          onClick={onNo}
        >
          {textoNo}
        </SunmiButton>
        <SunmiButton
          color="red"
          type="button"
          disabled={trabajando}
          className="py-3 justify-center"
          onClick={onSi}
        >
          {trabajando ? textoHaciendo : textoSi}
        </SunmiButton>
      </div>
    </SunmiModalLayout>
  );
}
