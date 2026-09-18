"use client";

// 5b · ¿CUÁL ES <PRODUCTO>?
//
// ── QUÉ SE ELIGE ACÁ, Y QUÉ NO ─────────────────────────────────────────────
//
// Se elige QUÉ RENGLÓN DEL PAPEL corresponde a un producto del catálogo. No se
// elige un producto: ése ya está y es el correcto. Lo que está mal es cuál con
// cuál.
//
// El caso que la trae: "MOGUL CONITOS" tiene guardado el código 13113 del
// proveedor, la lista trae un 13113 que es "MOGUL GOMITAS 30G X 12", y el que
// corresponde es el 3113. El macheo hizo lo correcto con lo que tenía; lo que
// estaba mal era el código guardado, y no había forma de corregirlo desde donde
// se ve el problema.
//
// ── DOS PUERTAS, UNA PANTALLA ──────────────────────────────────────────────
//
// Desde el 2026-09-18 se entra por `?fila=` —«No es este producto», con una fila
// atada al producto equivocado— o por `?producto=` —«No vinieron», con un producto
// que no tiene NINGUNA fila—. La pregunta es la misma y la lista de candidatas es
// la misma; lo que cambia —endpoint, a dónde se vuelve, si «No está en la lista»
// escribe— sale todo de `entradaDeElegirFila` y no de ternarios repartidos acá.
//
// ── SOLO LOS RENGLONES DE ESTA LISTA ───────────────────────────────────────
//
// Buscar en todo el catálogo del proveedor ofrecería productos que esta lista no
// trae, y elegir uno de ésos dejaría una fila vinculada a un renglón que no
// existe en el archivo: el costo saldría de la nada.
//
// ── LO QUE SE DECIDE ACÁ SE RECUERDA ───────────────────────────────────────
//
// El código nuevo queda guardado para el producto: las próximas listas de este
// proveedor lo van a usar sin preguntar. Es el pedido de Emanuel con todas las
// letras —lo que explica una vez no se vuelve a explicar— y por eso la pantalla
// lo dice antes de que aprete, no después.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";

import { ErrorRecuperable } from "@/components/proveedores/listas/PiezasListas";
import { Aviso } from "@/components/proveedores/listas/PiezasPantallas";
import { useAccionDePagina, useTituloDePagina } from "@/app/context/AccionDePaginaContext";
import { money } from "@/lib/proveedores/listas/presentacion";
import {
  entradaDeElegirFila,
  destinoTrasVincular,
  PUERTA,
} from "@/lib/proveedores/listas/entradaDeElegirFila";

export default function ElegirFilaDeLaListaPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = Number(params?.id);
  const entrada = useMemo(
    () =>
      entradaDeElegirFila({
        importacionId: id,
        fila: searchParams?.get("fila"),
        producto: searchParams?.get("producto"),
        filtro: searchParams?.get("filtro"),
      }),
    [id, searchParams]
  );
  // Con la puerta inválida no hay endpoint ni vuelta: la pantalla lo dice y no le
  // pide nada al servidor. El volver igual tiene que llevar a algún lado, y la
  // cola de revisar es la pantalla de la que cuelga esta ruta.
  const endpoint = entrada?.endpoint ?? null;
  const volverA = entrada?.volverA ?? `/modulos/proveedores/listas/${id}/revisar`;
  const textoVolver = entrada?.textoVolver ?? "Revisar";

  const sesion = useUser() || {};
  const perfil = sesion.perfil;
  const cargandoUser = sesion.cargando !== false;
  const { loading: cargandoCtx, needsContexto } = useContextoActivo();

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [datos, setDatos] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [elegida, setElegida] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");

  useTituloDePagina(datos?.producto?.nombre ? `¿Cuál es ${datos.producto.nombre}?` : "Elegir de la lista");
  // En una sola expresión y sin paréntesis alrededor del JSX, que es como lo
  // escriben las otras cinco del módulo: el candado de `volverDelModulo` busca
  // exactamente `useAccionDePagina(() => <SunmiBackButton`, y con el JSX
  // envuelto no lo encuentra y da rojo diciendo que el volver no está en el slot.
  // El destino y el texto del volver salen de la PUERTA: desde «No vinieron» hay
  // que volver a «No cambian» con su filtro, no a la cola de revisar, que no es
  // de donde se vino.
  useAccionDePagina(
    () => <SunmiBackButton href={volverA} texto={textoVolver} className="min-h-toque" />,
    [volverA, textoVolver]
  );

  const cargar = useCallback(
    async (texto) => {
      if (!endpoint) return;
      setCargando(true);
      setError("");
      try {
        const qs = new URLSearchParams();
        if (texto) qs.set("buscar", texto);
        const r = await fetch(`${endpoint}?${qs}`, { credentials: "include", cache: "no-store" });
        // ── UN 500 NO SE PUEDE LEER COMO UNA LISTA VACÍA ──────────────────
        //
        // `r.json()` explota cuando el servidor contesta una página de error en
        // vez de JSON, y sin esto ese throw caería en el `catch` diciendo "no se
        // pudo conectar": justo lo contrario de lo que pasó.
        const json = await r.json().catch(() => null);
        if (!r.ok || !json?.ok) {
          setError(json?.error || `No se pudieron buscar los renglones (error ${r.status}).`);
          return;
        }
        setDatos(json);
      } catch {
        setError("No se pudo conectar con el servidor. Probá de nuevo.");
      } finally {
        setCargando(false);
      }
    },
    [endpoint]
  );

  useEffect(() => {
    if (cargandoUser || cargandoCtx || !esAdmin || needsContexto) return;
    if (!endpoint) return;
    cargar("");
  }, [cargandoUser, cargandoCtx, esAdmin, needsContexto, endpoint, cargar]);

  // La búsqueda va al SERVIDOR, con una espera. Filtrar en el navegador buscaría
  // dentro de las treinta que se trajeron, así que escribir el nombre de un
  // renglón que está más abajo no daría nada y parecería que no está.
  useEffect(() => {
    if (!datos) return;
    const t = setTimeout(() => cargar(buscar.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscar]);

  const items = useMemo(() => datos?.items ?? [], [datos]);
  const laElegida = useMemo(
    () => items.find((i) => i.id === elegida) ?? null,
    [items, elegida]
  );

  const corregir = async (cuerpo) => {
    setTrabajando(true);
    setAviso(null);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setAviso({ tono: "danger", texto: j?.error || `No se pudo corregir (error ${r.status}).` });
        return;
      }
      // La fila queda con sus lecturas recalculadas y hay que contestarlas. Desde
      // «No vinieron» se va DERECHO a ese renglón —es el único que le importa a
      // quien vino hasta acá— y desde «No es este producto», a la cola, que es de
      // donde se venía. El por qué está en `destinoTrasVincular`.
      router.push(destinoTrasVincular(entrada, j?.filaId));
    } catch {
      setAviso({ tono: "danger", texto: "No se pudo conectar con el servidor. Probá de nuevo." });
    } finally {
      setTrabajando(false);
    }
  };

  if (cargandoUser || cargandoCtx) return <Marco><SunmiLoader /></Marco>;
  if (!esAdmin) return <SinPermisos />;
  if (!entrada) {
    return (
      <Marco>
        <Aviso tono="danger">
          No se dijo qué producto hay que buscar en la lista. Entrá desde «No es este producto»,
          en revisar, o desde «Buscarlo en la lista», en los que no vinieron.
        </Aviso>
      </Marco>
    );
  }

  return (
    <Marco>
      <p className="text-sm2 sunmi-text-muted leading-snug">
        Buscá en la lista de {datos?.proveedor?.nombre ?? "este proveedor"}. Te muestro primero las
        que se parecen.
      </p>

      {/* ── POR QUÉ SE LE DICE QUE CASI SIEMPRE ESTÁ ──────────────────────
          Desde «No vinieron» la persona llega creyendo que el proveedor dejó de
          traer el producto: es lo que decía la hoja. Que el motivo casi siempre
          sea otro —el código guardado— es justamente lo que la trajo a buscar, y
          si no se lo dice acá se va a rendir en la primera búsqueda que no dé. */}
      {entrada.puerta === PUERTA.PRODUCTO && (
        <p className="text-sm2 sunmi-text-muted leading-snug">
          Casi siempre está con otro nombre y otro código. Cuando lo encuentres, queda atado para
          siempre y esta lista lo va a corregir.
        </p>
      )}

      {aviso && <Aviso tono={aviso.tono}>{aviso.texto}</Aviso>}

      <SunmiInput
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Buscar por código o descripción"
        aria-label="Buscar un renglón de la lista"
        className="min-h-toque text-base w-full"
      />

      {cargando && <SunmiLoader />}
      {!cargando && error && <ErrorRecuperable mensaje={error} onReintentar={() => cargar(buscar)} />}

      {!cargando && !error && items.length === 0 && (
        <p className="text-sm3 sunmi-text-muted leading-snug">
          No hay ningún renglón de esta lista que coincida con «{buscar}».
        </p>
      )}

      {!cargando && !error && items.length > 0 && (
        <SunmiCard className="p-0 divide-y sunmi-divide">
          {/* La fila tocable es un `SunmiButton color="ghost"` con hijos `span`,
              que es como la dibujan las otras pantallas del módulo. Un `<button>`
              crudo se ve igual y no trae el alto de toque ni los estados del
              kit; el trinquete lo cuenta y por eso no pasa. */}
          {items.map((it) => (
            <SunmiButton
              key={it.id}
              color="ghost"
              type="button"
              onClick={() => setElegida(it.id === elegida ? null : it.id)}
              aria-pressed={it.id === elegida}
              aria-label={`${it.codigo}: ${it.descripcion}`}
              className={[
                "w-full block text-left p-3 min-h-toque",
                it.id === elegida ? "sunmi-bg-selected" : "",
              ].filter(Boolean).join(" ")}
            >
              <span className="block space-y-0.5">
                <span className="block text-sm3 font-semibold sunmi-text-strong leading-snug break-words">
                  {it.codigo} · {it.descripcion}
                </span>
                <span className="block text-sm2 sunmi-text-muted leading-snug tabular-nums">
                  {it.unidad ? `${it.unidad} · ` : ""}
                  {it.cantidad > 1 ? `${it.cantidad} · ` : ""}
                  {money(it.precio)}
                  {/* "LA QUE ESTABA" ES EL DATO QUE EVITA ELEGIR LO MISMO. Sin
                      esta marca, en una lista donde dos renglones se parecen es
                      fácil volver a tocar el que ya estaba y creer que se
                      corrigió algo. */}
                  {it.laQueEstaba ? " · la que estaba" : ""}
                </span>
                {/* SI OTRO PRODUCTO YA SE LO LLEVÓ, SE DICE. No lo impide
                    —puede ser que ESE sea el mal vinculado— pero no se decide a
                    ciegas. */}
                {it.tomadaPor && (
                  <span className="block text-sm2 sunmi-text-warning leading-snug">
                    Ahora está vinculado a {it.tomadaPor}
                  </span>
                )}
              </span>
            </SunmiButton>
          ))}
        </SunmiCard>
      )}

      {!cargando && !error && datos?.total > items.length && (
        <p className="text-sm2 sunmi-text-muted leading-snug">
          Se muestran {items.length} de {datos.total} renglones. Buscá para achicar la lista.
        </p>
      )}

      <div className="space-y-2">
        <SunmiButton
          color="cyan"
          onClick={() => corregir({ filaElegidaId: elegida })}
          disabled={!elegida || trabajando || laElegida?.laQueEstaba || !datos?.editable}
          className="w-full min-h-toque text-base font-bold"
        >
          {trabajando
            ? "Guardando…"
            : laElegida
              ? `Es este: ${laElegida.codigo} · ${laElegida.descripcion}`
              : "Elegí un renglón de la lista"}
        </SunmiButton>

        {/* LO QUE VA A PASAR, ANTES DE QUE APRIETE Y NO DESPUÉS. El vínculo
            queda para siempre: eso hay que poder leerlo antes de decidirlo. */}
        {laElegida && !laElegida.laQueEstaba && (
          <p className="text-sm2 sunmi-text-muted leading-snug">
            Queda vinculado para siempre: las próximas listas de{" "}
            {datos?.proveedor?.nombre ?? "este proveedor"} usan el {laElegida.codigo} para este
            producto. Después vuelve a preguntar cómo se lee el precio.
          </p>
        )}

        {/* ── «NO ESTÁ EN LA LISTA» HACE DOS COSAS DISTINTAS Y DICE CUÁL ────
            Desde «No es este producto» hay una fila que desvincular, y eso se
            escribe. Desde «No vinieron» el producto YA está afuera —por eso
            apareció ahí— así que confirmarlo es volver sin escribir nada.
            Mandar un POST igual le inventaría una decisión a alguien que solo
            miró y se fue. Cuál de las dos es lo decide `entradaDeElegirFila`. */}
        <SunmiButton
          color="slate"
          onClick={() =>
            entrada.sacarDeLaListaEscribe ? corregir({ noEstaEnLaLista: true }) : router.push(volverA)
          }
          disabled={trabajando || (entrada.sacarDeLaListaEscribe && !datos?.editable)}
          className="w-full min-h-toque text-sm3"
        >
          No está en la lista
        </SunmiButton>
        <p className="text-sm2 sunmi-text-muted leading-snug">
          {entrada.sacarDeLaListaEscribe
            ? "Sale de esta lista y queda con el costo que tiene ahora. El producto no se borra de ningún lado."
            : "Queda como está, con el costo de ahora, y esta lista no lo va a corregir."}
        </p>
      </div>
    </Marco>
  );
}

function Marco({ children }) {
  return <div className="p-4 space-y-3 pb-24">{children}</div>;
}
