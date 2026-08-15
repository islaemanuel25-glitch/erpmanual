"use client";

// ANDAMIO DESCARTABLE para mirar EL VELO DEL KIT en cada tema.
//
// NO SE COMMITEA. Hay un candado que hace fallar la suite si aparece trackeado
// cualquier `app/andamio-*`.
//
// ── POR QUÉ UN ANDAMIO Y NO UNA PANTALLA DE VERDAD ────────────────────────────
//
// La pregunta es del KIT, no de una pantalla: el velo lo dibuja
// `SunmiModalLayout` con `color-mix(in srgb, var(--app-bg) 78%, transparent)`, y
// eso sale igual en las trece migradas. Para contestarla hace falta la pieza
// real, un tema real y algo atrás — nada de eso necesita la base ni sesión.
//
// Y hoy no hay sesión: el Edge vivo la perdió y la clave no la tengo. Antes que
// frenar la pregunta, se monta la pieza.
//
// ── LO DE ATRÁS ES UN PATRÓN DE PRUEBA Y SE DICE ──────────────────────────────
//
// No son datos inventados para que la foto salga linda: es lo contrario. Lo que
// se mide es si a través del velo se distingue que lo de atrás está bloqueado,
// así que atrás va lo que en una pantalla de verdad tienta a tocar —texto,
// filas y BOTONES— pintado con las clases del tema, que son las que dan los
// colores reales. Si el velo no alcanza, se va a ver acá igual que en caja.

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiCard from "@/components/sunmi/SunmiCard";

const FILAS = [
  ["Mortadela Paladini", "10 kg", "$ 81.500"],
  ["Queso Cremoso La Serenísima", "4 kg", "$ 49.200"],
  ["Jamón cocido Cagnoli", "6 kg", "$ 73.800"],
  ["Salame Milán", "3 kg", "$ 28.400"],
  ["Queso Port Salut", "5 kg", "$ 41.000"],
];

export default function AndamioVelo() {
  // GUARDIA DE ENTORNO — ver `scripts/andamiosNoSeCommitean.test.mjs`.
  if (process.env.NODE_ENV === "production") notFound();

  // Después de montar y no durante el render: el servidor no ve la query, así
  // que leerla en el render daría una hidratación distinta del HTML servido y la
  // foto podría salir del lado equivocado. El arnés espera 4 s antes de
  // fotografiar, de sobra para este efecto.
  const [viejo, setViejo] = useState(false);
  useEffect(() => {
    setViejo(new URLSearchParams(window.location.search).get("velo") === "viejo");
  }, []);

  return (
    <div className="min-h-dvh sunmi-surface p-6">
      <h1 className="text-xl font-bold mb-4">Pantalla de atrás</h1>

      <div className="flex gap-2 mb-4">
        <SunmiButton color="amber">Guardar</SunmiButton>
        <SunmiButton color="slate">Cancelar</SunmiButton>
        <SunmiButton color="red">Eliminar</SunmiButton>
      </div>

      {/* Con divs y no con una tabla a propósito: el trinquete cuenta las celdas
          escritas a mano, y subirle la línea de base por un andamio que se borra
          hoy sería exactamente la salida deshonesta que el trinquete existe para
          impedir. Lo que se mide es el color de atrás, no la tabla. */}
      <SunmiCard className="mb-4">
        <div className="flex gap-4 text-sm sunmi-text-muted mb-1">
          <span className="flex-1">Producto</span>
          <span className="w-20">Cantidad</span>
          <span className="w-24">Importe</span>
        </div>
        {FILAS.map((f) => (
          <div key={f[0]} className="flex gap-4 text-sm py-2 border-t sunmi-divider">
            <span className="flex-1">{f[0]}</span>
            <span className="w-20">{f[1]}</span>
            <span className="w-24">{f[2]}</span>
          </div>
        ))}
      </SunmiCard>

      <p className="text-sm sunmi-text-muted max-w-2xl">
        Este párrafo existe para ver cuánto texto corrido se sigue leyendo a
        través del velo. Si se lee cómodo, el velo no está diciendo que lo de
        atrás esté bloqueado.
      </p>

      {/* Con `?velo=viejo` se dibuja la capa HECHA A MANO, la que hoy tienen las
          23 sin migrar: `sunmi-overlay`, que es negro al 50 %. Es el término de
          comparación que faltaba — sin él, "el velo del kit apaga bien" no se
          puede contrastar contra nada. Los dos lados se fotografían con el mismo
          fondo y el mismo tema, que es la condición para que la resta valga. */}
      {viejo ? (
        <div className="fixed inset-0 sunmi-overlay flex items-center justify-center p-4 z-50">
          <SunmiCard className="w-full max-w-md p-4">
            <h3 className="text-lg font-bold mb-3">Nueva categoría</h3>
            <p className="text-sm">
              El cuerpo del modal, para ver el contraste de la tarjeta contra el
              velo.
            </p>
          </SunmiCard>
        </div>
      ) : (
        <SunmiModalLayout
          open
          forma="centrado"
          title="Nueva categoría"
          onClose={() => {}}
          maxWidth="max-w-md"
          // Los dos que el kit dejó sin default. Se copian de `ModalCategoria`,
          // que es la pantalla que este andamio imita: la foto tiene que salir
          // igual a la de verdad o no mide lo que dice medir.
          espacioCuerpo="p-4 space-y-4"
          z={9999}
        >
          <p className="text-sm">
            El cuerpo del modal, para ver el contraste de la tarjeta contra el
            velo.
          </p>
        </SunmiModalLayout>
      )}
    </div>
  );
}
