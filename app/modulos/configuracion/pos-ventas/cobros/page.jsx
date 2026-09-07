"use client";

import Link from "next/link";
import { Info } from "lucide-react";

import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiNavCard from "@/components/sunmi/SunmiNavCard";
import SunmiAviso from "@/components/sunmi/SunmiAviso";
import SinPermisos from "@/components/auth/SinPermisos";
import { useAccionDePagina } from "@/app/context/AccionDePaginaContext";
import { useUser } from "@/app/context/UserContext";
import useMediosCobro from "@/hooks/useMediosCobro";
import { puedeVerSeccion } from "@/lib/config/acceso";
import { etiquetaVisibilidad, inicialesDeMedio, resumenComercial } from "@/lib/pos-ventas/mediosCobroPantalla";

// COBROS — qué medios ve el cajero al cobrar.
//
// ── MISMO PATRÓN QUE LA PORTADA, NO UNO PARECIDO ───────────────────────────
//
// Las tarjetas son `SunmiNavCard`, la misma pieza que usa Configuración POS, y
// el aviso es `SunmiAviso`, extraído del "Tip" de esa portada. Lo único que las
// dos pantallas no comparten es qué va adentro del redondel —allá un icono, acá
// las iniciales del medio— y eso se resuelve con un prop de la pieza, no
// duplicando la tarjeta.
//
// ── LO QUE SE SACÓ DE LA PANTALLA, Y POR QUÉ ───────────────────────────────
//
// La cinta "COBROS", el "Configuración POS · Local: …" y el rol: todo eso ya lo
// muestra el shell del ERP arriba, en todas las pantallas. Repetirlo acá no
// agregaba un dato.
//
// Del resumen de cada medio se fueron el orden y el procesador. Siguen
// existiendo y siguen siendo editables adentro del medio; simplemente no son lo
// primero que alguien necesita leer en una lista. Lo que queda es lo que cambia
// plata: el recargo y la comisión.
//
// Y el párrafo permanente sobre los procesadores se fue: era una explicación que
// se leía una vez y después estorbaba todos los días.
//
// ── LA LISTA SIGUE SIENDO DEL SERVIDOR ─────────────────────────────────────
//
// Se dibuja `medios.map` sobre lo que devuelve `/api/medios-cobro`, en su orden,
// con la cantidad y los nombres que haya. Acá no hay ningún medio escrito.

const RUTA_PORTADA = "/modulos/configuracion/pos-ventas";
const RUTA_COBROS = `${RUTA_PORTADA}/cobros`;

export default function CobrosPage() {
  const { perfil, cargando: cargandoUser } = useUser();
  const { cargando, error, medios, usandoDefaults } = useMediosCobro();

  const puedeVer = puedeVerSeccion(perfil, { permiso: "config_local.medios_cobro" });

  // ── LA ACCIÓN VA AL SLOT DEL SHELL, QUE ES DONDE ESTÁ EL TÍTULO ──────────
  //
  // En mobile el título "Cobros" lo dibuja `LayoutBase` en una fila que está
  // ARRIBA de `<main>`, así que nada escrito acá adentro puede quedar a su
  // altura. Registrando la acción, el shell la pone en esa misma fila y la
  // composición queda "Cobros ......... ← Volver", sin duplicar el título ni
  // esconder el global ni empujar nada con márgenes.
  //
  // El destino va explícito y no `router.back()`: desde Cobros se vuelve SIEMPRE
  // a la portada de Configuración POS, se haya llegado desde donde se haya
  // llegado.
  //
  // La fábrica devuelve `null` cuando el usuario no tiene el permiso, para no
  // ofrecer la acción en una pantalla que muestra `SinPermisos`. El hook se
  // llama siempre —nunca condicionalmente—; lo que cambia es lo que devuelve.
  const volver = useAccionDePagina(
    () => (puedeVer ? <SunmiBackButton href={RUTA_PORTADA} /> : null),
    [puedeVer]
  );

  if (cargandoUser) return null;
  if (!puedeVer) return <SinPermisos />;

  return (
    <div className="max-w-2xl mx-auto">
      {/* SOLO ESCRITORIO, y es el MISMO nodo que se registró arriba: se declara
          una vez y aparece en un lugar por ancho.

          En escritorio el shell no tiene fila de título propia —el `<h1>` vive
          en la barra superior del `Header`—, así que ahí no hay ninguna fila
          donde poner la acción y la colocación sigue siendo la de siempre:
          arriba a la derecha del contenido, dentro de la misma columna, igual
          que `configuracion/ticket` y que otros 25 usos del botón.

          En mobile este div es `hidden`, así que no ocupa alto: la acción ya
          está arriba, en la fila del título. */}
      <div className="hidden md:flex justify-end mb-2">{volver}</div>

      <div className="space-y-5">
        {/* Acá había un <h1>Cobros</h1>. Se fue porque el título de la pantalla
            ya lo pone el shell —el bloque mobile de LayoutBase y el <h1> del
            Header en escritorio—, y desde que la ruta resuelve su propio título
            los dos dicen "Cobros". Dejarlo era leerlo dos veces seguidas. */}
        <p className="text-sm sunmi-text-muted">
          Configurá los medios de cobro de este local.
        </p>

        {cargando ? (
          <SunmiLoader />
        ) : error ? (
          <SunmiCard className="p-3 text-xs sunmi-text-danger">{error}</SunmiCard>
        ) : (
          <>
            <div className="space-y-3">
              <h2 className="text-sm2 sunmi-section-title">MEDIOS DE COBRO</h2>

              <div className="flex flex-col gap-3">
                {medios.map((m) => (
                  <SunmiNavCard
                    key={m.claveEdicion}
                    // Las dos letras salen del NOMBRE, que lo escribe cada local:
                    // por eso acá va una sigla y no un icono.
                    insignia={inicialesDeMedio(m.nombre)}
                    label={m.nombre}
                    descripcion={resumenComercial(m)}
                    // `claveEdicion` es opaca: llega del GET y se devuelve tal
                    // cual. Esta pantalla no la arma ni la interpreta.
                    href={`${RUTA_COBROS}/${encodeURIComponent(m.claveEdicion)}`}
                    // Un medio oculto se dibuja apagado y NO se esconde: sigue
                    // existiendo y esconderlo dejaría a alguien sin forma de
                    // volver a prenderlo. La señal es la misma que usa la
                    // portada para una sección que todavía no está.
                    atenuado={!m.activo}
                    estado={m.activo ? null : etiquetaVisibilidad(m)}
                  />
                ))}
              </div>
            </div>

            <Link href={`${RUTA_COBROS}/nuevo`} className="block">
              <SunmiCard className="p-4 text-center text-sm font-semibold sunmi-text-accent">
                + Agregar medio de cobro
              </SunmiCard>
            </Link>

            {usandoDefaults && (
              <SunmiAviso icon={Info} titulo="Configuración predeterminada">
                Usa los medios del sistema. Al cambiar uno, se guarda una configuración propia.
              </SunmiAviso>
            )}
          </>
        )}
      </div>
    </div>
  );
}
