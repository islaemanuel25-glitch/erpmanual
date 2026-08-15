"use client";

import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import FormProducto from "@/components/productos/FormProducto";

export default function ModalProducto({
  open,
  onClose,
  onSubmit,
  catalogos,
  initialData = null,
  editandoOverrideLocal = false,
  // Propiedad resuelta por el BACKEND (no inferir en el front). Defaults true para
  // el alta y productos propios. El backend revalida en la edición.
  puedeEditarCosto = true,
  puedeEditarBase = true,
}) {
  return (
    <SunmiModalLayout
      open={open}
      title={initialData ? "Editar producto" : "Nuevo producto"}
      onClose={onClose}
      // TODO EXPLÍCITO, incluso lo que hoy coincide con el default del kit: en
      // esta misma tanda los defaults del `alto`, del `z` y del espaciado se
      // mueven, y lo que está declarado no se mueve con ellos.
      //
      // EL VELO NO CIERRA, y acá no es solo por el criterio de qué se pierde
      // —que también, es el formulario más largo del sistema—: la capa hecha a
      // mano NO TENÍA `onClick`, así que hoy tocar afuera no cierra. Sin esto, el
      // velo del kit pasaría a cerrar y eso sería un cambio de comportamiento.
      destructivo
      z={9999}
      // La tarjeta declaraba `w-[95%] max-w-4xl`. El ancho va por `className`,
      // que el kit NEGOCIA: al recibir un `w-*` retira su `w-full`.
      maxWidth="max-w-4xl"
      className="w-[95%]"
      // El tope vive en el CUERPO y lo está TOCANDO en los dos anchos —630 de
      // 630 a 1366x900, y 448 de 448 a 360x640—, así que moverlo a la tarjeta
      // cambiaría la pantalla. Por eso `altoVa` se declara aunque hoy sea el
      // default de `centrado`.
      alto="max-h-[70vh]"
      altoVa="cuerpo"
      // `mt-3` son los 10,5 px que hoy pone el `mb-3` del encabezado, y `px-1`
      // es el del cuerpo actual. Sin gap: el cuerpo tiene un solo hijo.
      espacioCuerpo="mt-3 px-1"
      // La cinta ámbar en mayúsculas se conserva. Sin declararlo, el título
      // pasaría a texto blanco normal.
      encabezado="cinta"
    >
      {/* El `{open && …}` se queda, y no lo reemplaza el `open` del kit: hoy es
          lo que desmonta el formulario al cerrar, y sacarlo confiando en que el
          kit lo cubre cambiaría de dueño una responsabilidad que ya funciona.
          Medido el 2026-08-14: cerrado, la capa tenía cero inputs adentro. */}
      {open && (
        <FormProducto
          initialData={initialData}
          catalogos={catalogos}
          onSubmit={onSubmit}
          onCancel={onClose}
          submitLabel={initialData ? "Guardar cambios" : "Crear producto"}
          editandoOverrideLocal={editandoOverrideLocal}
          puedeEditarCosto={puedeEditarCosto}
          puedeEditarBase={puedeEditarBase}
        />
      )}
    </SunmiModalLayout>
  );
}
