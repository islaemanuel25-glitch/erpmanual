"use client";

// components/transferencias/TableroMovil.jsx
//
// LO QUE SE VE AL ABRIR TRANSFERENCIAS EN EL TELÉFONO.
//
// ── DOS ENTRADAS, Y LA ELIGE UN DATO QUE YA EXISTE ────────────────────────
//
// El DEPÓSITO ve la lista de locales y entra a la cuenta de uno. El LOCAL ve
// directo la suya, sin esa lista — es la única suya, elegirla no sería una
// elección.
//
// Lo decide `Local.es_deposito` en el servidor —no el `modo` de
// `resolveVistaOperativa`, que dice el ALCANCE y no quién sos— y acá llega
// resuelto: el depósito recibe `vista: "ENTRADA"` y el local `vista: "UN_LOCAL"`.
//
// ── Y LA PANTALLA DE ADENTRO ES LA MISMA PARA LOS DOS ─────────────────────
//
// `CuentaDeUnLocal`, la misma pieza que dibuja `/modulos/transferencias/local/<id>`.
//
// Hasta la V40 no era así: el local tenía su propia pantalla, con chips arriba,
// el período EN CURSO y dos secciones "PARA RECIBIR" / "YA RECIBIDAS". O sea que
// el defecto que abrió esta línea de trabajo —mostrar el período abierto en la
// pantalla que dice cuánto se cobra— seguía intacto justo del lado del que
// cobra. Eran dos implementaciones del mismo hecho y una se quedó atrás.
//
// ── EL REPORTE SIGUE ENTERO, DETRÁS DE SU BOTÓN ───────────────────────────
//
// Lo que hace falta al abrir no es un reporte: es la lista de trabajo.

import { useRouter } from "next/navigation";

import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";

import AccionDePantalla, { CLASE_ACCION_DE_PANTALLA } from "./AccionDePantalla";
import CuentaDeUnLocal from "./CuentaDeUnLocal";
import EntradaDeLocales from "./EntradaDeLocales";
import { money, useCuentaDeLocal } from "./useCuentaDeLocal";

import { useUser } from "@/app/context/UserContext";
import { useAccionDePagina } from "@/app/context/AccionDePaginaContext";
import { RUTA_SEMANA_OPERATIVA, puedeConfigurarLaSemana } from "@/lib/semanaOperativa/rutas";
import { urlDelDetalle } from "@/lib/transferencias/contextoDelTablero";

export default function TableroMovil({ onAbrirReporte = null }) {
  const router = useRouter();
  const { perfil } = useUser();
  // El atajo a la semana solo se ofrece a quien puede usarlo, y solo en la
  // cuenta PROPIA del local: la pantalla de semana operativa configura la
  // ubicación en la que se opera. Desde la entrada del depósito no se ofrece
  // —llevaría al depósito a cambiar SU semana creyendo que cambia la de un local—:
  // ahí el aviso solo informa qué locales faltan.
  const puedeConfigurar = puedeConfigurarLaSemana(perfil?.permisos);

  // ── LAS DOS CONSULTAS, Y SOLO UNA SE USA ────────────────────────────────
  //
  // `entrada=1` contesta la lista de locales SI quien pregunta es el depósito;
  // si es un local, el servidor ignora el pedido y devuelve su cuenta. O sea que
  // una sola llamada decide las dos vistas, y la pantalla no tiene que adivinar
  // quién es antes de preguntar.
  const cuenta = useCuentaDeLocal({});
  const esEntrada = cuenta.datos?.vista === "ENTRADA";

  // EL BOTÓN VIAJA EN EL RENGLÓN QUE YA EXISTE. El shell dibuja el título de la
  // pantalla y pone a su derecha lo que la pantalla registre acá, así que en un
  // teléfono "Reporte" no cuesta un renglón propio ni obliga a repetir la
  // palabra "Transferencias".
  //
  // En su ruta propia no hay reporte al que ir —vive en `/modulos/transferencias`,
  // que es de escritorio— así que sin `onAbrirReporte` el botón no se registra.
  const botonDeReporte = useAccionDePagina(
    () =>
      onAbrirReporte ? (
        <SunmiButton
          type="button"
          color="slate"
          onClick={onAbrirReporte}
          className={CLASE_ACCION_DE_PANTALLA}
        >
          Reporte
        </SunmiButton>
      ) : null,
    [onAbrirReporte]
  );

  return (
    // Padding 14 a los lados y arriba —`p-4` en la escala del proyecto— y 12,25
    // entre bloques.
    <div className="w-full min-h-full px-4 pt-4 pb-4 space-y-3.5">
      <AccionDePantalla>{botonDeReporte}</AccionDePantalla>

      {cuenta.cargando && !cuenta.datos && (
        <div className="py-12">
          <SunmiLoader />
        </div>
      )}

      {cuenta.error && !cuenta.cargando && (
        <div className="rounded-xl border sunmi-border-danger px-4 py-3 text-xs sunmi-text-danger">
          {cuenta.error}
        </div>
      )}

      {/* ── EL DEPÓSITO: SOLO LA LISTA DE LOCALES ──────────────────────────
          Sin chips, sin importes, sin transferencias y sin buscador. El período
          no puede vivir arriba de esta pantalla: cada local corta su semana el
          día que acordó, así que un chip global tendría que elegir UNO para
          todos y cualquiera que elija es el equivocado para alguien. */}
      {esEntrada && (
        <EntradaDeLocales
          locales={cuenta.datos.locales || []}
          // Los dos textos viajan desde acá desde que Finanzas usa la misma
          // pieza: son de ESTE dominio —"operar por transferencia" no significa
          // nada en Finanzas— y escritos adentro del componente obligaban a la
          // segunda pantalla a mentir o a copiarlo. Los valores son los mismos
          // que estaban, así que esta pantalla no cambia.
          rotulo="LOCALES"
          textoVacio="Ningún local opera por transferencia con este depósito."
          localesSinSemana={(cuenta.datos.locales || []).filter((l) => l.sinConfigurar).map((l) => l.nombre)}
          onEntrar={(l) => router.push(`/modulos/transferencias/local/${l.localId}`)}
        />
      )}

      {/* ── EL LOCAL: SU PROPIA CUENTA, LA MISMA PANTALLA ──────────────────── */}
      {!esEntrada && cuenta.datos?.vista === "UN_LOCAL" && (
        <CuentaDeUnLocal
          {...cuenta}
          money={money}
          puedeConfigurarCorte={puedeConfigurar}
          onConfigurarCorte={() => router.push(RUTA_SEMANA_OPERATIVA)}
          // EL CONTEXTO VIAJA CON EL LINK. Sin esto, volver del detalle caía en
          // el período de hoy: la pantalla se remonta y el estado arranca en su
          // valor por defecto. Es un `push` —el detalle SÍ es otro lugar— y las
          // flechas usan `replace`, que es lo que deja una sola entrada.
          onAbrirTransferencia={(t) => router.push(urlDelDetalle(t.id, cuenta.contexto))}
        />
      )}
    </div>
  );
}
