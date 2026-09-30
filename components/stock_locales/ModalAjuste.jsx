"use client";

import { useState, useEffect, useRef } from "react";
import SunmiInput from "@/components/sunmi/SunmiInput";
import SunmiButton from "@/components/sunmi/SunmiButton";
import SunmiModalLayout from "@/components/sunmi/SunmiModalLayout";
import SunmiTextarea from "@/components/sunmi/SunmiTextarea";
import { toUnidades, fromUnidades, piezasToKg } from "@/lib/conversiones/stock";
import {
  DIRECCION_DIFERENCIA,
  ETIQUETA_MOTIVO,
  direccionDeDiferencia,
  motivoExigeDetalle,
  motivosParaDireccion,
} from "@/lib/stock/motivosDeDiferencia";
import { presentacionCantidadStock, unidadFisicaDeItem } from "@/lib/stock/presentacion";
import { UNIDAD_FISICA_STOCK, motivoCantidadNoAdmitida } from "@/lib/stock/escalaFisica";
import { useNumberInputHandlers } from "@/hooks/useNumberInputHandlers";

export default function ModalAjuste({ open, onClose, producto, local }) {
  // Hooks deben ejecutarse siempre, antes de cualquier return condicional
  const [bultos, setBultos] = useState("");
  const [sueltas, setSueltas] = useState("");
  const [tipo, setTipo] = useState("sumar");
  const [motivo, setMotivo] = useState("");
  // La causa, de la lista compartida con transferencias y compras. `motivo`
  // queda como el detalle en texto libre.
  const [causa, setCausa] = useState(null);
  // Si el grupo exige la causa. `null` mientras no se sabe: la pantalla no
  // afirma "opcional" antes de preguntarle al servidor.
  const [causaObligatoria, setCausaObligatoria] = useState(null);
  const cantidadRef = useRef(null);

  // ── LA REGLA LA DICE EL SERVIDOR, CON LA MISMA FUNCIÓN QUE LA APLICA ──────
  //
  // Antes el campo decía "Motivo (opcional)" siempre, aunque el grupo lo
  // tuviera obligatorio: el usuario se enteraba por el error al guardar. El GET
  // de la ruta de ajuste resuelve la regla igual que su POST.
  const localId = local?.id;
  useEffect(() => {
    if (!open) return;
    let vigente = true;
    setCausaObligatoria(null);
    fetch(`/api/stock_locales/ajustar?localId=${encodeURIComponent(localId ?? "")}`)
      .then((r) => r.json())
      .then((j) => {
        if (vigente && j?.ok) setCausaObligatoria(j.requireMotivoAjusteStock === true);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [open, localId]);

  useEffect(() => {
    if (open) {
      setBultos("");
      setSueltas("");
      setTipo("sumar");
      setMotivo("");
      setCausa(null);
      // Autofocus y seleccionar al abrir
      setTimeout(() => {
        cantidadRef.current?.focus();
        cantidadRef.current?.select();
      }, 50);
    }
  }, [open]);

  // Handlers de input numérico + lock de scroll del body (hook compartido).
  const { handleWheel, handleFocus, handleBlur } = useNumberInputHandlers(open);

  // Validación después de los hooks
  if (!open || !producto) return null;

  const factorPack = Number(producto.factorPack || producto.factor_pack || 1);
  const unidadMedida = producto.unidadMedida || producto.unidad_medida || "unidad";
  const esDeposito = local?.esDeposito || local?.es_deposito || false;
  const usarBultos = esDeposito && factorPack > 1 && (unidadMedida === "pack" || unidadMedida === "cajon");

  // ── LA UNIDAD DE LA FILA, NO LA DEL CATÁLOGO ─────────────────────────────
  //
  // Acá se decidía "kg" mirando solo `unidadMedida`, y un producto de peso fijo
  // en el depósito —guardado en PIEZAS— se mostraba "6.000 kg" y pedía kilos,
  // mientras la tabla y la tarjeta decían "6 pzs". La cantidad que se manda
  // sigue siendo la de la fila: piezas en el depósito, kilos en un local. Lo
  // único que cambia es que el rótulo dice la verdad.
  const unidadFisica = unidadFisicaDeItem(producto, esDeposito);
  const esPieza = unidadFisica === UNIDAD_FISICA_STOCK.PIEZA;
  const esKg = unidadFisica === UNIDAD_FISICA_STOCK.KG;

  // Calcular total en unidades
  const totalUnidades = usarBultos
    ? toUnidades({
        cantidad: Number(bultos || 0),
        unidad: "BULTO",
        factorPack,
      }) + Number(sueltas || 0)
    : Number(sueltas || bultos || 0);

  // ── HACIA DÓNDE VA EL STOCK, PARA SABER QUÉ CAUSAS OFRECER ───────────────
  //
  // Sumar sube y restar baja. Fijar depende de lo que se escribe contra el
  // stock que se muestra: 7 sobre 9 es una baja, 7 sobre 5 una suba, y 7 sobre
  // 7 no tiene nada que explicar. El servidor vuelve a decidirlo contra el
  // stock REAL bloqueado, que puede haber cambiado desde que se abrió esto.
  const cantidadEscrita = sueltas !== "" || bultos !== "";
  const direccion =
    tipo === "sumar"
      ? DIRECCION_DIFERENCIA.AUMENTO
      : tipo === "restar"
      ? DIRECCION_DIFERENCIA.DISMINUCION
      : cantidadEscrita
      ? direccionDeDiferencia(Number(producto.stock || 0), totalUnidades)
      : null;
  const causasOfrecidas = motivosParaDireccion(direccion);
  // Una causa elegida que deja de tener sentido —se cambió de Restar a Sumar,
  // o el número fijado pasó al otro lado del stock— no viaja: se ignora y el
  // usuario la vuelve a elegir entre las que corresponden.
  const causaVigente = causa && causasOfrecidas.includes(causa) ? causa : null;
  const pideDetalle = motivoExigeDetalle(causaVigente);

  const guardar = async () => {
    const cantidadInvalida =
      tipo === "fijar" ? totalUnidades < 0 : totalUnidades <= 0;
    if (cantidadInvalida) {
      alert(
        tipo === "fijar"
          ? "La cantidad no puede ser negativa"
          : "La cantidad debe ser mayor a 0"
      );
      return;
    }
    const noAdmitida = motivoCantidadNoAdmitida(totalUnidades, unidadFisica);
    if (noAdmitida) {
      alert(noAdmitida);
      return;
    }
    if (causaObligatoria && causasOfrecidas.length > 0 && !causaVigente) {
      alert("Elegí la causa del ajuste.");
      return;
    }
    if (pideDetalle && !motivo.trim()) {
      alert(`Con la causa "${ETIQUETA_MOTIVO[causaVigente]}" contá qué pasó en el detalle.`);
      return;
    }

    try {
      const body = {
        modo: "ajuste",
        localId: local.id,
        productoLocalId: producto.id,
        cantidad: totalUnidades, // Siempre en unidades para el backend
        tipo,
        motivoPrincipal: causaVigente,
        motivo,
      };

      const res = await fetch("/api/stock_locales/ajustar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (json.ok) {
        onClose(true);
      } else {
        alert(json.error || "Error ajustando stock");
      }
    } catch (e) {
      console.error("AJUSTE ERROR:", e);
      alert("Error inesperado");
    }
  };

  // El modal lo arma el kit. Ver el comentario de `ModalLimites`: acá había el
  // mismo `fixed inset-0` a mano, con su velo y su encabezado propios.
  return (
    <SunmiModalLayout
      open={open}
      title="Ajustar stock"
      onClose={() => onClose(false)}
      maxWidth="max-w-md"
      // Ver el comentario de `ModalLimites`: los dos primeros no tienen default
      // a propósito, y `destructivo` conserva que tocar afuera NO cierre, que es
      // lo que hacía la capa a mano. Acá lo que se pierde es la cantidad
      // escrita y su motivo.
      espacioCuerpo="mt-2 gap-3"
      z={9999}
      destructivo
      footer={
        <SunmiButton color="amber" className="w-full" onClick={guardar}>
          Guardar ajuste
        </SunmiButton>
      }
    >
      <div>
        <div>

          {/* El nombre volvió al cuerpo: `SunmiModalLayout` declara `subtitle`
              pero no lo dibuja, así que pasarlo por ahí perdía de vista QUÉ
              producto se está ajustando. Se vio en la captura. */}
          <p className="text-sm2 font-medium sunmi-text-strong">
            {producto.nombre}
          </p>
          <p className="text-xs sunmi-text-muted">
            {local.nombre}
          </p>

          {(() => {
            const stockNum = Number(producto.stock || 0);
            if (usarBultos) {
              const presentacionLabel =
                unidadMedida === "cajon"
                  ? `Cajón x${factorPack}`
                  : `Pack x${factorPack}`;
              let stockActualLabel;
              if (stockNum < 0) {
                stockActualLabel = `${stockNum} uds`;
              } else if (stockNum === 0) {
                stockActualLabel = "0 uds";
              } else {
                const { bultos, sueltas } = fromUnidades({
                  unidades: stockNum,
                  factorPack,
                });
                if (bultos > 0 && sueltas > 0) {
                  stockActualLabel = `${bultos} bultos + ${sueltas} uds`;
                } else if (bultos > 0) {
                  stockActualLabel = `${bultos} bultos`;
                } else {
                  stockActualLabel = `${sueltas} uds`;
                }
              }
              return (
                <div className="text-[13px] mt-2 px-3 py-2 rounded sunmi-surface-soft">
                  <div className="text-[11px] sunmi-text-muted">
                    Presentación:{" "}
                    <span className="sunmi-text-strong">{presentacionLabel}</span>
                  </div>
                  <div>
                    Stock actual:{" "}
                    <strong className="sunmi-text-strong">{stockActualLabel}</strong>
                  </div>
                  <div className="text-[11px] sunmi-text-muted">
                    Total: {stockNum} unidades
                  </div>
                </div>
              );
            }
            return (
              <p className="text-[13px] mt-2 px-3 py-2 rounded sunmi-surface-soft">
                Stock actual:{" "}
                <strong className="sunmi-text-strong">
                  {esPieza || esKg
                    ? presentacionCantidadStock(producto, esDeposito).texto
                    : `${Math.round(stockNum)} unidades`}
                </strong>
                {esPieza && stockNum > 0 && (
                  <span className="sunmi-text-muted">
                    {` · equivale a ${piezasToKg(stockNum, producto.pesoReferenciaKg).toFixed(3)} kg`}
                  </span>
                )}
              </p>
            );
          })()}

          {/* Inputs */}
          <div className="flex flex-col gap-3 mt-4">
            {usarBultos ? (
              <>
                {/* Bultos + Sueltas */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] sunmi-label mb-1 block">
                      Bultos
                    </label>
                    <SunmiInput
                      ref={cantidadRef}
                      type="number"
                      placeholder="0"
                      min={0}
                      value={bultos}
                      onChange={(e) => setBultos(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && guardar()}
                      onWheel={handleWheel}
                      onFocus={handleFocus}
                      onBlur={handleBlur}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] sunmi-label mb-1 block">
                      Sueltas
                    </label>
                    <SunmiInput
                      type="number"
                      placeholder="0"
                      min={0}
                      max={factorPack - 1}
                      value={sueltas}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (val >= 0 && val < factorPack) {
                          setSueltas(e.target.value);
                        }
                      }}
                      onKeyDown={(e) => e.key === "Enter" && guardar()}
                      onWheel={handleWheel}
                      onFocus={handleFocus}
                      onBlur={handleBlur}
                    />
                  </div>
                </div>
                <p className="text-slate-400 text-[11px]">
                  Total: <strong className="text-slate-200">{totalUnidades} {unidadMedida === "kg" ? "kg" : "unidades"}</strong>
                </p>
              </>
            ) : (
              <>
                {/* Solo unidades / kg */}
                <div>
                  <label className="text-[11px] sunmi-label mb-1 block">
                    {esPieza ? "Cantidad (pzs)" : esKg ? "Cantidad (kg)" : "Cantidad (unidades)"}
                  </label>
                  <SunmiInput
                    ref={cantidadRef}
                    type="number"
                    placeholder="0"
                    min={0}
                    step={esKg ? 0.001 : 1}
                    value={sueltas || bultos}
                    onChange={(e) => {
                      const raw = e.target.value;
                      // La pieza queda como se escribió: si trae decimales, el
                      // guardado la RECHAZA diciendo por qué, en vez de
                      // truncarla en silencio a otra cantidad.
                      if (!esKg && !esPieza) {
                        const entero = raw === "" ? "" : String(parseInt(raw, 10) || 0);
                        setSueltas(entero);
                      } else {
                        setSueltas(raw);
                      }
                      setBultos("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && guardar()}
                    onWheel={handleWheel}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
              </>
            )}

            {/* Tipo */}
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="radio"
                  name="tipo-ajuste"
                  value="sumar"
                  checked={tipo === "sumar"}
                  onChange={() => setTipo("sumar")}
                  className="accent-cyan-500"
                />
                <span className="sunmi-text-strong">Sumar</span>
              </label>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="radio"
                  name="tipo-ajuste"
                  value="restar"
                  checked={tipo === "restar"}
                  onChange={() => setTipo("restar")}
                  className="accent-cyan-500"
                />
                <span className="sunmi-text-strong">Restar</span>
              </label>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="radio"
                  name="tipo-ajuste"
                  value="fijar"
                  checked={tipo === "fijar"}
                  onChange={() => setTipo("fijar")}
                  className="accent-cyan-500"
                />
                <span className="sunmi-text-strong">Fijar stock real</span>
              </label>
            </div>

            {/* La causa: los mismos botones que la hoja de corrección de
                compras, con los valores del vocabulario compartido. Sin
                diferencia —fijar el mismo número que se muestra— no hay
                ninguna que ofrecer. Tocar la elegida la suelta, salvo que sea
                obligatoria. */}
            {causasOfrecidas.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-sm2 sunmi-label">
                  {causaObligatoria === null
                    ? "Causa"
                    : causaObligatoria
                    ? "Causa (obligatoria)"
                    : "Causa (opcional)"}
                </span>
                <div className="flex flex-wrap gap-dentroFiltro">
                  {causasOfrecidas.map((valor) => (
                    <SunmiButton
                      key={valor}
                      color={causaVigente === valor ? "primary" : "slate"}
                      type="button"
                      aria-pressed={causaVigente === valor}
                      onClick={() =>
                        setCausa(causaVigente === valor && !causaObligatoria ? null : valor)
                      }
                      className="flex-1 min-h-toque justify-center rounded-control text-sm3"
                    >
                      {ETIQUETA_MOTIVO[valor]}
                    </SunmiButton>
                  ))}
                </div>
              </div>
            )}

            {/* El detalle, en texto libre. Con "Otro" es lo único que dice
                qué pasó, y por eso ahí es obligatorio. */}
            <SunmiTextarea
              className="h-20"
              placeholder={pideDetalle ? "Detalle: contá qué pasó (obligatorio)" : "Detalle (opcional)"}
              aria-label="Detalle del ajuste"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          {/* El botón de guardar se fue al `footer` del layout. */}
        </div>
      </div>
    </SunmiModalLayout>
  );
}
