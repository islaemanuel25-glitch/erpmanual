"use client";

// EL PIE ANCLADO: el resumen en criollo y los botones.
//
// ── POR QUÉ NO SCROLLEA ──────────────────────────────────────────────────
//
// El resumen y los botones son la decisión, y una decisión que hay que ir a
// buscar hacia abajo se toma sin leerla.
//
// ── POR QUÉ SE EXTRAJO, Y POR QUÉ LOS BOTONES SON `children` ─────────────
//
// La caja es idéntica en las dos pantallas —el anclaje, el borde, el fondo
// opaco, los tres espacios—; lo que cambia son los botones, porque dependen del
// estado de la oferta: en crear son "Guardar borrador" y "Publicar", y en el
// detalle de una ya publicada son "Guardar cambios" y "Finalizar".
//
// Por eso los botones entran como `children` en vez de como una lista de props:
// una prop por botón obligaría a esta pieza a conocer los estados de una oferta,
// que es negocio y no dibujo.
//
// ── EL FONDO ES OPACO A PROPÓSITO ────────────────────────────────────────
//
// `sunmi-bg-pie` pinta el color base de la app más el degradado. Sin el opaco,
// el contenido que scrollea por debajo se lee a través del pie.

export default function PieDeOferta({ resumen, advertencia = null, children }) {
  return (
    <div className="sticky bottom-0 border-t sunmi-border sunmi-bg-pie px-4 pt-3 pb-4 space-y-3">
      <div className="text-sm3 sunmi-text-muted-strong">{resumen}</div>

      <div className="flex gap-2">{children}</div>

      {advertencia && <div className="text-sm2 sunmi-text-muted">{advertencia}</div>}
    </div>
  );
}
