"use client";

// LA ADAPTACIÓN DE STOCK PARA LA TARJETA DE PRODUCTO DEL KIT.
//
// No dibuja una card propia: aporta las dos ranuras que Stock necesita. El
// núcleo —nombre, proveedor, foto, códigos, valor y pie táctil— es el mismo que
// usa Productos. Las reglas de cantidad siguen saliendo de los helpers que ya
// usa la tabla de escritorio.

import { Gauge, SlidersHorizontal } from "lucide-react";

import SunmiProductoCard, {
  AccionTarjeta,
  BloqueValorTarjeta,
  MiniaturaProductoTarjeta,
  NumeroBloqueValor,
  RotuloBloqueValor,
} from "@/components/sunmi/SunmiProductoCard";
import { fromUnidades, kgToPiezas } from "@/lib/conversiones/stock";
import {
  esFiambreFijoItem,
  esPackDeposito,
  formatCantidad,
  getPresentacionDeposito,
  getUnidadDeposito,
  getUnidadLocal,
} from "@/lib/stock/presentacion";

function plural(cantidad, singular, pluralForma) {
  return Math.abs(Number(cantidad)) === 1 ? singular : pluralForma;
}

// Devuelve el mismo hecho que la tabla, acomodado al bloque compacto: el número
// grande lleva la cantidad principal y el rótulo conserva escala y equivalencia.
export function cantidadParaTarjeta(producto, esDeposito) {
  const esFiambreFijo = esFiambreFijoItem(producto);
  const opciones = { esFiambreFijo, esDeposito };
  const unidad = esDeposito
    ? getUnidadDeposito(producto)
    : getUnidadLocal(producto);

  if (esPackDeposito(producto, esDeposito)) {
    const { bultos, sueltas } = fromUnidades({
      unidades: Number(producto.stock || 0),
      factorPack: producto.factorPack,
    });
    if (bultos !== 0) {
      return {
        principal: `${bultos} ${plural(bultos, "bulto", "bultos")}`,
        rotulo: sueltas !== 0 ? `${unidad} · ${sueltas} uds sueltas` : unidad,
      };
    }
    return { principal: `${sueltas} uds`, rotulo: unidad };
  }

  let referencia = null;
  if (
    producto.unidadMedida === "kg" &&
    producto.modoCompraProveedor === "UNIDAD" &&
    producto.pesoReferenciaKg > 0
  ) {
    if (esFiambreFijo && esDeposito) {
      referencia = `${(Number(producto.stock || 0) * producto.pesoReferenciaKg).toFixed(3)} kg`;
    } else {
      referencia = `≈ ${kgToPiezas(Number(producto.stock || 0), producto.pesoReferenciaKg)} pzs`;
    }
  }

  const presentacionDeposito = !esDeposito ? getPresentacionDeposito(producto) : null;
  return {
    principal: formatCantidad(producto.stock, producto.unidadMedida, opciones),
    rotulo: [unidad, referencia, presentacionDeposito ? `Dep. ${presentacionDeposito}` : null]
      .filter(Boolean)
      .join(" · "),
  };
}

function limiteParaTarjeta(producto, valor, esDeposito) {
  const esFiambreFijo = esFiambreFijoItem(producto);
  if (esPackDeposito(producto, esDeposito)) {
    const { bultos, sueltas } = fromUnidades({
      unidades: Number(valor || 0),
      factorPack: producto.factorPack,
    });
    return sueltas === 0 ? `${bultos} b` : `${bultos} b + ${sueltas} u`;
  }
  return formatCantidad(valor, producto.unidadMedida, {
    esFiambreFijo,
    esDeposito,
  });
}

export default function TarjetaStockMovil({
  producto,
  esDeposito,
  onAjustar,
  onEditarLimites,
}) {
  const cantidad = cantidadParaTarjeta(producto, esDeposito);
  const minimo = limiteParaTarjeta(producto, producto.stockMin, esDeposito);
  const maximo = limiteParaTarjeta(producto, producto.stockMax, esDeposito);
  const stockNegativo = Number(producto.stock || 0) < 0;

  return (
    <SunmiProductoCard
      nombre={producto.nombre}
      empresa={producto.proveedorNombre ?? null}
      codigoBarra={producto.codigoBarra ?? null}
      codigoInterno={producto.codigoInterno ?? null}
      marca={
        <span className="flex min-w-0 items-center gap-2">
          <MiniaturaProductoTarjeta url={producto.imagenUrl} />
          <span className="flex min-w-0 flex-col gap-1 text-sm2 sunmi-text-muted [font-variant-numeric:tabular-nums]">
            <span>Mín. {minimo}</span>
            <span>Máx. {maximo}</span>
          </span>
        </span>
      }
      valor={
        <BloqueValorTarjeta className="flex-col items-end leading-none" data-stock-valor>
          <RotuloBloqueValor style={{ color: "var(--pos-accent)" }}>
            STOCK · {cantidad.rotulo}
          </RotuloBloqueValor>
          <NumeroBloqueValor>{cantidad.principal}</NumeroBloqueValor>
        </BloqueValorTarjeta>
      }
      aviso={stockNegativo ? "Stock negativo" : producto.faltante ? "Bajo mínimo" : null}
      acciones={
        <>
          <AccionTarjeta icono={Gauge} onClick={() => onAjustar?.(producto)}>
            Ajustar
          </AccionTarjeta>
          <AccionTarjeta
            icono={SlidersHorizontal}
            onClick={() => onEditarLimites?.(producto)}
          >
            Límites
          </AccionTarjeta>
        </>
      }
    />
  );
}
