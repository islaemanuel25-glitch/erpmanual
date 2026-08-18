"use client";

// LA FICHA DE SÓLO LECTURA DE UN PRODUCTO.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// La tarjeta del catálogo tiene dos botones, "Ver" y "Editar", y hasta este
// commit **los dos llevaban al mismo lado**: no había ninguna pantalla de ver
// producto en todo el ERP. Se relevó antes de escribir esto — las rutas bajo
// `productos/` eran editar, combos, precios y edición rápida, y `FormProducto`
// no acepta ninguna prop de sólo lectura, solo bloquea campos sueltos por
// permiso. Dos botones que hacen lo mismo se notan.
//
// ── LO QUE SE MIDIÓ ANTES DE DIBUJAR ──────────────────────────────────────
//
// **La foto: 0 de 2.377 productos activos tienen `imagen_url` cargada.** El
// campo existe y se llena a mano pegando una URL —no hay subida de archivos en
// el proyecto—, así que hoy el caso normal es que no haya foto. Por eso el hueco
// no es un rectángulo grande vacío: es un marco chico que DICE que no hay
// imagen, del mismo tamaño que tendría la imagen, para que la pantalla no salte
// el día que alguien cargue una.
//
// ── LAS TRES SECCIONES ────────────────────────────────────────────────────
//
// La ficha de edición agrupa en trece secciones porque tiene que dejar tocar
// cada campo. Ésta es para LEER, y se agrupa por la pregunta que contesta:
// qué es, cuánto vale, y con qué se lo identifica. Rótulo a la izquierda y
// valor a la derecha en cada renglón.
//
// ── LOS PRECIOS SALEN DE LAS MISMAS FUNCIONES QUE LA TARJETA ──────────────
//
// `precioEnEscalaQueSeCobra`, `etiquetaEscalaPrecio` y `lineaDeEquivalencia`.
// No se recalcula nada acá: el catálogo y esta ficha tienen que decir el mismo
// número, y la única forma de garantizarlo es que salga del mismo lugar. El
// costo, en cambio, va tal cual está guardado — no se cobra, se paga.
//
// ── LO QUE NO MUESTRA, Y POR QUÉ ──────────────────────────────────────────
//
// **Stock.** No está en el camino de datos: ni el mapper ni `obtener` lo
// devuelven, y vive en otro modelo. Ponerlo no es leer un campo más — es una
// consulta nueva en el backend, con su verificación contra Postgres. Queda
// afuera y dicho, en vez de mostrarse vacío.

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ImageOff } from "lucide-react";

import { useUser } from "@/app/context/UserContext";
import SinPermisos from "@/components/auth/SinPermisos";
import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiBackButton from "@/components/sunmi/SunmiBackButton";
import SunmiLoader from "@/components/sunmi/SunmiLoader";
import useContextoActivo from "@/hooks/useContextoActivo";

import { formatearMoneda, lineaDeEquivalencia } from "@/lib/moneda";
import { etiquetaEscalaPrecio } from "@/lib/precios/escalaPrecio";
import { precioEnEscalaQueSeCobra } from "@/lib/precios/redondeo";
import { esProductoServicio } from "@/lib/pos-ventas/servicios";

/** Lo que se muestra en un renglón cuyo dato no está cargado. */
const SIN_DATO = "—";

/**
 * UN RENGLÓN: rótulo a la izquierda, valor a la derecha.
 *
 * El valor va alineado a la derecha y el rótulo a la izquierda para que la
 * columna de valores quede a plomo y se pueda recorrer de arriba abajo sin
 * leer los rótulos, que es para lo que sirve una ficha.
 */
function Renglon({ rotulo, children }) {
  const vacio = children === null || children === undefined || children === "";
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b sunmi-divider last:border-b-0">
      <span className="text-xs sunmi-text-muted shrink-0">{rotulo}</span>
      <span
        className={`text-sm text-right [overflow-wrap:anywhere] ${
          vacio ? "italic opacity-70 sunmi-text-muted" : "sunmi-text-strong"
        }`}
      >
        {vacio ? SIN_DATO : children}
      </span>
    </div>
  );
}

/** Una sección con su título, del mismo tamaño que usa la ficha de edición. */
function Seccion({ titulo, children }) {
  return (
    <SunmiCard className="mt-3">
      {/* El tamaño va acá y no en `sunmi-section-title` porque esa clase solo
          define color y peso — es la misma pareja de clases que ya usa la ficha
          de edición para sus trece secciones, copiada tal cual para que las dos
          pantallas titulen igual. */}
      <h3 className="text-[13px] sunmi-section-title mb-1">{titulo}</h3>
      <div>{children}</div>
    </SunmiCard>
  );
}

export default function VerProductoPage({ params }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { perfil, cargando: cargandoPerfil } = useUser();
  const { loading: loadingCtx, contexto } = useContextoActivo();

  const permisos = perfil?.permisos || [];
  const esAdmin = Array.isArray(permisos) && permisos.includes("*");
  const puedeVer = esAdmin || permisos.includes("productos.ver");

  const localId = contexto?.localId || 0;

  const [prodId, setProdId] = useState(null);
  const [item, setItem] = useState(null);
  const [catalogos, setCatalogos] = useState({ CATEGORIAS: [], PROVEEDORES: [], AREAS: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // ── EL ID SE VALIDA ANTES DE PEDIR NADA ─────────────────────────────────
  //
  // Esta ruta es un segmento dinámico al lado de cinco carpetas estáticas
  // —`nuevo`, `nuevo-combo`, `edicion-rapida`, `actualizacion-precios`,
  // `editar`—. Las estáticas le ganan, pero cualquier otra cosa que hoy da 404
  // pasaría a entrar acá: `/modulos/productos/editar` sin id llegaría con
  // `id="editar"`. Se rechaza de entrada, igual que hace `abrirEditar`.
  useEffect(() => {
    Promise.resolve(params).then((p) => {
      const n = Number(p?.id);
      if (!p?.id || !Number.isInteger(n) || n <= 0) {
        setError("El identificador del producto no es válido.");
        setCargando(false);
        return;
      }
      setProdId(n);
    });
  }, [params]);

  // La vuelta conserva los filtros del listado, igual que la ficha de edición.
  const returnUrl = useMemo(() => {
    const qs = new URLSearchParams(searchParams).toString();
    return qs ? `/modulos/productos?${qs}` : "/modulos/productos";
  }, [searchParams]);

  useEffect(() => {
    if (!prodId || loadingCtx) return;
    let vivo = true;

    (async () => {
      setCargando(true);
      setError(null);
      try {
        const [prodRes, catRes, provRes, areaRes] = await Promise.all([
          fetch(`/api/productos/obtener?id=${prodId}&localId=${localId}`, { credentials: "include" }),
          fetch("/api/catalogos/categorias", { credentials: "include" }),
          fetch("/api/catalogos/proveedores", { credentials: "include" }),
          fetch("/api/catalogos/areas-fisicas", { credentials: "include" }),
        ]);

        if (prodRes.status === 401) {
          router.replace("/login");
          return;
        }

        // ── LA RAMA DEL ERROR NO ES OPCIONAL ────────────────────────────────
        //
        // `obtener` contesta 404 en TRES casos a propósito —no existe, es de
        // otro grupo, o es exclusivo de otro local— y con el mismo texto, para
        // no revelar existencia. Sin esta rama, los tres se verían igual que una
        // pantalla en blanco. Ya pasó en proveedores y está anotado como regla.
        if (!prodRes.ok) {
          const cuerpo = await prodRes.json().catch(() => ({}));
          if (!vivo) return;
          setError(
            cuerpo?.error ||
              (prodRes.status === 404
                ? "No se encontró este producto, o no es visible desde esta ubicación."
                : `No se pudo cargar el producto (${prodRes.status}).`)
          );
          setCargando(false);
          return;
        }

        const [prod, cat, prov, area] = await Promise.all([
          prodRes.json(),
          catRes.ok ? catRes.json() : { items: [] },
          provRes.ok ? provRes.json() : { items: [] },
          areaRes.ok ? areaRes.json() : { items: [] },
        ]);
        if (!vivo) return;

        setItem(prod?.item ?? null);
        setCatalogos({
          CATEGORIAS: cat.items ?? [],
          PROVEEDORES: prov.items ?? [],
          AREAS: area.items ?? [],
        });
        setCargando(false);
      } catch (e) {
        if (!vivo) return;
        setError(`No se pudo cargar el producto: ${e.message}`);
        setCargando(false);
      }
    })();

    return () => { vivo = false; };
  }, [prodId, localId, loadingCtx, router]);

  // Los catálogos vienen como listas y el producto trae IDs sueltos: sin este
  // cruce la ficha mostraría "Categoría: 17".
  const nombreDe = (lista, id) =>
    id ? (lista.find((x) => Number(x.id) === Number(id))?.nombre ?? null) : null;

  if (cargandoPerfil || loadingCtx) return <SunmiLoader />;
  if (!puedeVer) return <SinPermisos />;

  if (error) {
    return (
      <div className="p-3">
        <SunmiBackButton href={returnUrl} />
        <SunmiCard className="mt-3">
          <p className="text-sm sunmi-text-strong">{error}</p>
        </SunmiCard>
      </div>
    );
  }

  if (cargando || !item) return <SunmiLoader />;

  const esServicio = esProductoServicio(item);
  const precioMostrado = precioEnEscalaQueSeCobra({
    precio: item.precioVenta,
    factor: item.factorPack,
    unidad: item.unidadMedida,
    redondeo100: item.redondeo100,
  });

  return (
    <div className="p-3">
      <SunmiBackButton href={returnUrl} />

      <SunmiHeader title={item.nombre} />

      {/* LA FOTO. Medido: 0 de 2.377 productos activos tienen una cargada, así
          que el caso normal es éste. El marco ocupa el mismo lugar que ocuparía
          la imagen para que la pantalla no salte cuando alguien cargue una. */}
      <SunmiCard className="mt-3">
        <div className="flex justify-center">
          {item.imagenUrl ? (
            <img
              src={item.imagenUrl}
              alt={item.nombre}
              className="h-40 w-40 object-contain rounded-xl"
            />
          ) : (
            <div className="h-40 w-40 rounded-xl border sunmi-divider flex flex-col items-center justify-center gap-2">
              <ImageOff className="w-7 h-7 sunmi-text-muted" aria-hidden="true" />
              <span className="text-xs sunmi-text-muted">sin imagen cargada</span>
            </div>
          )}
        </div>
      </SunmiCard>

      <Seccion titulo="Qué es">
        <Renglon rotulo="Nombre">{item.nombre}</Renglon>
        <Renglon rotulo="Descripción">{item.descripcion}</Renglon>
        <Renglon rotulo="Categoría">{nombreDe(catalogos.CATEGORIAS, item.categoriaId)}</Renglon>
        <Renglon rotulo="Proveedor">{nombreDe(catalogos.PROVEEDORES, item.proveedorId)}</Renglon>
        <Renglon rotulo="Área física">{nombreDe(catalogos.AREAS, item.areaFisicaId)}</Renglon>
        <Renglon rotulo="Tipo">{item.esCombo ? "Combo" : esServicio ? "Servicio de importe variable" : "Producto"}</Renglon>
        <Renglon rotulo="Estado">{item.activo ? "Activo" : "Inactivo"}</Renglon>
      </Seccion>

      <Seccion titulo="Cuánto vale">
        {esServicio ? (
          // Un servicio no tiene precio: la columna es obligatoria y guarda cero,
          // y mostrar "$0,00" no se distingue de un producto mal cargado.
          <Renglon rotulo="Precio">Importe variable · se carga al vender</Renglon>
        ) : (
          <>
            <Renglon rotulo={`Venta (${etiquetaEscalaPrecio(item.unidadMedida)})`}>
              {formatearMoneda(precioMostrado)}
            </Renglon>
            <Renglon rotulo="Escala">
              {lineaDeEquivalencia({
                precio: item.precioVenta,
                factor: item.factorPack,
                unidad: item.unidadMedida,
                redondeo100: item.redondeo100,
                esCombo: item.esCombo,
              })}
            </Renglon>
            {/* El costo va TAL CUAL ESTÁ GUARDADO: no se cobra, se paga, así que
                no le corresponde el redondeo comercial que se aplica a la venta. */}
            <Renglon rotulo="Costo guardado">{formatearMoneda(item.precioCosto)}</Renglon>
            <Renglon rotulo="Margen">
              {item.margen === null || item.margen === undefined ? null : `${item.margen} %`}
            </Renglon>
            <Renglon rotulo="IVA">
              {item.ivaPorcentaje === null || item.ivaPorcentaje === undefined
                ? null
                : `${item.ivaPorcentaje} %`}
            </Renglon>
            <Renglon rotulo="Redondeo a $100">{item.redondeo100 ? "Sí" : "No"}</Renglon>
          </>
        )}
      </Seccion>

      <Seccion titulo="Con qué se identifica">
        <Renglon rotulo="Código de barras">{item.codigoBarra}</Renglon>
        <Renglon rotulo="Código secundario">{item.codigoBarraSecundario}</Renglon>
        <Renglon rotulo="Código propio de esta ubicación">{item.codigoBarraPropio}</Renglon>
        <Renglon rotulo="SKU">{item.sku}</Renglon>
        <Renglon rotulo="Código interno">{item.id}</Renglon>
        <Renglon rotulo="Unidad de medida">{item.unidadMedida}</Renglon>
        <Renglon rotulo="Unidades por bulto">
          {Number(item.factorPack) > 1 ? item.factorPack : null}
        </Renglon>
      </Seccion>
    </div>
  );
}
