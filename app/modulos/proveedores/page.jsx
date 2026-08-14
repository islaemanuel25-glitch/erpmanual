"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import SunmiCard from "@/components/sunmi/SunmiCard";
import SunmiHeader from "@/components/sunmi/SunmiHeader";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiTable from "@/components/sunmi/SunmiTable";
import SunmiTableRow from "@/components/sunmi/SunmiTableRow";
import SunmiTableEmpty from "@/components/sunmi/SunmiTableEmpty";
import SunmiSeparator from "@/components/sunmi/SunmiSeparator";
import SunmiBadgeEstado from "@/components/sunmi/SunmiBadgeEstado";
import SunmiSelectAdv, { SunmiSelectOption } from "@/components/sunmi/SunmiSelectAdv";

import SunmiPill from "@/components/sunmi/SunmiPill"; // 🔥 agregado para chips
import { Search } from "lucide-react";

import ModalProveedor from "@/components/proveedores/ModalProveedor";
import ModalCodigosProveedor from "@/components/proveedores/ModalCodigosProveedor";
import { useUser } from "@/app/context/UserContext";
import useContextoActivo from "@/hooks/useContextoActivo";
import SinPermisos from "@/components/auth/SinPermisos";
import { recibeHoy, formatDiaLabel } from "@/lib/proveedores/diasPedido";

const PAGE_SIZE = 10;

export default function ProveedoresPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { perfil } = useUser();
  const { loading: loadingCtx, needsContexto } = useContextoActivo();

  const nuevo = searchParams.get("nuevo");
  const editarId = searchParams.get("editar");

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("activos");
  const [soloHoy, setSoloHoy] = useState(false);

  const [page, setPage] = useState(1);

  const [editData, setEditData] = useState(null);

  // ── EL TERCER LUGAR DONDE UN ERROR SE VUELVE "NO PASA NADA" ────────────────
  //
  // El 500 de `obtener` estuvo diecinueve días sin que nadie lo viera, y no fue
  // solo porque el mensaje fuera mudo: **esta pantalla lo TIRABA**. Los dos
  // `fetch` de lectura preguntaban por el caso bueno y no tenían rama para el
  // malo, así que un fallo se veía exactamente igual que un botón que no hace
  // nada.
  //
  // El incidente del 2026-08-12 ya había enseñado que los mensajes viven en tres
  // lugares y los candados miraban dos. Este es un cuarto: el consumidor. Un
  // mensaje perfecto que nadie muestra sigue siendo "Error interno".
  //
  // ── Y SON DOS ESTADOS, NO UNO. Se probó con uno y NO SE VEÍA ──────────────
  //
  // Con un solo `errorMsg`, las dos consultas se pisaban: la ficha escribía el
  // aviso y el listado —que en ese local devuelve una lista vacía con `ok: true`,
  // o sea que le va bien— lo borraba al terminar. La pantalla volvía a no decir
  // nada, que es exactamente el defecto que este cambio venía a sacar.
  //
  // No lo encontró ningún candado: compilaba, y el candado de "la pantalla
  // muestra el error" estaba en verde porque el código para mostrarlo estaba
  // escrito. Lo encontró ABRIR LA PANTALLA y mirar la captura.
  //
  // Cada consulta es dueña de su mensaje y solo limpia el suyo.
  const [errorLista, setErrorLista] = useState("");
  const [errorFicha, setErrorFicha] = useState("");

  // Vista solo lectura de productos vinculados por código interno
  const [vinculadosProv, setVinculadosProv] = useState(null);

  // =========================================================
  // CARGAR LISTA
  // =========================================================
  const cargar = async () => {
    try {
      setLoading(true);

      const res = await fetch(
        `/api/proveedores/listar?search=${search}&estado=${estado}&page=${page}&pageSize=${PAGE_SIZE}`,
        { credentials: "include" }
      );

      const data = await res.json();

      if (data.ok) {
        setItems(data.items || []);
        setTotal(data.total || 0);
        setErrorLista("");
      } else {
        setErrorLista(data.error || "No se pudo cargar la lista de proveedores.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, [search, estado, page]);

  // =========================================================
  // CARGAR EDITAR
  // =========================================================
  useEffect(() => {
    const loadEdit = async () => {
      if (!editarId) return;

      const res = await fetch(`/api/proveedores/obtener?id=${editarId}`, {
        credentials: "include",
      });

      const data = await res.json();
      if (data.ok) {
        setEditData(data.item);
        setErrorFicha("");
      } else {
        // Un 404 acá NO es una falla: es la regla de visibilidad diciendo que ese
        // proveedor no es de este local. Se dice eso y no "error", que mandaría a
        // buscar el problema al lugar equivocado.
        setErrorFicha(
          res.status === 404
            ? "Ese proveedor no es de este local. Cada local tiene sus propios proveedores."
            : data.error || "No se pudo abrir la ficha del proveedor."
        );
      }
    };
    loadEdit();
  }, [editarId]);

  const cerrarModal = () => {
    setEditData(null);
    router.push("/modulos/proveedores");
  };

  // =========================================================
  // CREAR
  // =========================================================
  const crearProveedor = async (form) => {
    const res = await fetch("/api/proveedores/crear", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    if (data.ok) {
      cerrarModal();
      cargar();
    } else alert(data.error || "Error al crear proveedor");
  };

  // =========================================================
  // EDITAR
  // =========================================================
  const guardarEdicion = async (form) => {
    const res = await fetch("/api/proveedores/editar", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, id: editData.id }),
    });

    const data = await res.json();
    if (data.ok) {
      cerrarModal();
      cargar();
    } else alert(data.error || "Error al editar proveedor");
  };

  // =========================================================
  // ELIMINAR
  // =========================================================
  const eliminar = async (id) => {
    if (!confirm("¿Eliminar proveedor?")) return;

    const res = await fetch("/api/proveedores/eliminar", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    const data = await res.json();
    if (data.ok) cargar();
    else alert(data.error || "No se pudo eliminar");
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (!perfil || loadingCtx) return null;
  if (needsContexto) { router.push("/inicio"); return null; }

  const permisosP = perfil?.permisos || [];
  const esAdminP = Array.isArray(permisosP) && permisosP.includes("*");
  if (!esAdminP && !permisosP.includes("proveedores.ver")) return <SinPermisos />;

  return (
    <div className="sunmi-bg w-full min-h-full p-4">
      <SunmiCard>
        <SunmiSeparator label="Filtros" className="my-4" />

        {/* ===================== */}
        {/* FILTROS */}
        {/* ===================== */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-2">
          <div className="flex flex-col md:flex-row gap-3 flex-1">
            <div className="flex-1 relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--pos-link)" }}
              />
              <SunmiInput
                placeholder="Buscar proveedor..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="!pl-9 !border-2 pulse-neon"
                style={{ borderColor: "var(--pos-link)" }}
              />
            </div>

            <div className="w-full md:w-44 md:shrink-0">
              <SunmiSelectAdv
                value={estado}
                onChange={setEstado}
                className="[&_.sunmi-select-trigger]:!border-[var(--pos-link)]"
              >
                <SunmiSelectOption value="activos">Activos</SunmiSelectOption>
                <SunmiSelectOption value="todos">Todos</SunmiSelectOption>
              </SunmiSelectAdv>
            </div>

            <label
              className="flex items-center gap-1.5 text-xs sunmi-text-muted whitespace-nowrap cursor-pointer select-none md:shrink-0"
              title="Solo proveedores cuyo día de pedido incluye hoy"
            >
              <input
                type="checkbox"
                checked={soloHoy}
                onChange={(e) => setSoloHoy(e.target.checked)}
                className="accent-[var(--pos-link)]"
              />
              Solo de hoy
            </label>
          </div>

          <div className="flex gap-2 md:shrink-0 justify-end">
            <SunmiButton
              color="slate"
              className="!border !border-[var(--pos-link)]"
              onClick={() => {
                setSearch("");
                setEstado("activos");
                setSoloHoy(false);
                setPage(1);
              }}
            >
              Limpiar
            </SunmiButton>

            <SunmiButton
             
              onClick={() => router.push("/modulos/proveedores?nuevo=1")}
            >
              ＋ Nuevo
            </SunmiButton>
          </div>
        </div>

        <SunmiSeparator label="Listado" className="my-4" />

        {/* El aviso va ACÁ y no adentro del modal a propósito: cuando `obtener`
            falla, el modal es justamente lo que no se dibuja. Un mensaje que
            vive en el modal roto no lo lee nadie. */}
        {[errorFicha, errorLista].filter(Boolean).map((texto) => (
          <div
            key={texto}
            className="mb-4 text-xs sunmi-text-danger sunmi-state-danger rounded px-3 py-2 text-center"
          >
            {texto}
          </div>
        ))}

        {/* ===================== */}
        {/* TABLA */}
        {/* ===================== */}
        <div className="overflow-x-auto rounded-2xl border sunmi-border">
          <SunmiTable
            headers={[
              "Nombre",
              "Teléfono",
              "Email",
              "CUIT",
              "Días",
              "Compras",
              "Estado",
              "Acciones",
            ]}
          >
            {loading ? (
              <SunmiTableEmpty message="Cargando..." />
            ) : (() => {
              const itemsFiltrados = soloHoy
                ? items.filter((p) => recibeHoy(p.dias_pedido))
                : items;

              if (itemsFiltrados.length === 0) {
                return (
                  <SunmiTableEmpty
                    message={soloHoy ? "Sin proveedores que reciban pedido hoy" : "Sin proveedores"}
                  />
                );
              }

              return itemsFiltrados.map((item) => (
                <SunmiTableRow key={item.id}>
                  <td className="px-3 py-2">{item.nombre}</td>
                  <td className="px-3 py-2">{item.telefono || "-"}</td>
                  <td className="px-3 py-2">{item.email || "-"}</td>
                  <td className="px-3 py-2">{item.cuit || "-"}</td>

                  {/* DIAS EN CHIPS + badge "Hoy" si aplica */}
                  <td className="px-3 py-2">
                    {item.dias_pedido?.length ? (
                      <div className="flex flex-wrap gap-1 items-center">
                        {recibeHoy(item.dias_pedido) && (
                          <span
                            className="inline-block px-1.5 py-[1px] rounded-md text-[10.5px] font-semibold leading-none whitespace-nowrap border"
                            style={{
                              color: "var(--pos-link)",
                              borderColor: "var(--pos-link)",
                            }}
                            title="Este proveedor recibe pedidos hoy"
                          >
                            Hoy
                          </span>
                        )}
                        {item.dias_pedido.map((d, i) => (
                          <SunmiPill key={i}>{formatDiaLabel(d)}</SunmiPill>
                        ))}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>

                  {/* BOTÓN COMPRAS */}
                  <td className="px-3 py-2 text-center">
                    <SunmiButton
                      onClick={() =>
                        router.push(`/modulos/compras-proveedor/nueva?proveedorId=${item.id}`)
                      }
                    >
                      Nuevo pedido
                    </SunmiButton>
                  </td>

                  {/* Estado */}
                  <td className="px-3 py-2">
                    <SunmiBadgeEstado value={item.activo} />
                  </td>

                  {/* Acciones */}
                  <td className="px-3 py-2 text-right">
                    <div className="flex gap-3 justify-end text-[15px]">
                      <button
                        onClick={() =>
                          setVinculadosProv({ id: item.id, nombre: item.nombre })
                        }
                        className="sunmi-link-accent"
                        title="Productos vinculados por código interno"
                      >
                        🔗
                      </button>

                      <button
                        onClick={() =>
                          router.push(`/modulos/proveedores?editar=${item.id}`)
                        }
                        className="sunmi-link-accent"
                      >
                        ✏️
                      </button>

                      <button
                        onClick={() => eliminar(item.id)}
                        className="sunmi-link-danger"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </SunmiTableRow>
              ));
            })()}
          </SunmiTable>
        </div>

        {/* ===================== */}
        {/* PAGINACIÓN */}
        {/* ===================== */}
        <div className="flex justify-between pt-4 px-2">
          <SunmiButton
            color="slate"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            « Anterior
          </SunmiButton>

          <SunmiButton
            color="slate"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente »
          </SunmiButton>
        </div>

        {/* ===================== */}
        {/* MODAL */}
        {/* ===================== */}
        {nuevo && (
          <ModalProveedor
            open={true}
            onClose={cerrarModal}
            onSubmit={crearProveedor}
          />
        )}

        {editarId && editData && (
          <ModalProveedor
            open={true}
            initialData={editData}
            onClose={cerrarModal}
            onSubmit={guardarEdicion}
          />
        )}

        {vinculadosProv && (
          <ModalCodigosProveedor
            open={true}
            proveedor={vinculadosProv}
            onClose={() => setVinculadosProv(null)}
          />
        )}
      </SunmiCard>
    </div>
  );
}
