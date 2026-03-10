# Auditoría FormProducto — Según lógica real del negocio

**Alcance:** Solo el formulario Nuevo/Editar producto (FormProducto). Ver si representa bien: venta por peso en local, compra por pieza en depósito/proveedor. Sin implementación ni cambios de código.

**Contexto negocio:** (1) Local: fiambres y productos por kg se venden por peso, no por pieza en POS. (2) Depósito/compra: algunos productos por kg se compran por pieza/barra (ej. mortadela); se pide por unidades; el producto tiene lógica de peso (fijo o promedio).

---

## CAMPOS ACTUALES DEL FORM

**Archivo:** components/productos/FormProducto.jsx.

### Sección "Presentación"
- **Unidad *** — Select: Unidad | Pack | Cajón | Kg. Sin texto de ayuda.
- **Factor pack** — Número. Sin ayuda. Se deshabilita lógica con unidad (modo_pedido pasa a UNIDAD si unidad o factor ≤ 1).
- **Peso (kg)** — Número. Sin aclarar si es peso del producto, peso por bulto o peso por pieza.
- **Volumen (ml)** — Número.

### Sección "Precios"
- **Costo *** — Número.
- **Margen %** — Número.
- **Venta *** — Número. No indica “por unidad”, “por kg” ni “por bulto”.
- **IVA %** — Número.

### Sección "Reposición automática"
- **Modo de pedido** — Bulto | Unidad. Deshabilitado si unidad_medida es unidad o factor_pack ≤ 1. Ayuda: “Solo disponible para pack/cajón con factor > 1”.
- **Cómo sale (depósito→locales)** — SOLO_BULTO | SOLO_UNIDAD. Ayuda: “Bulto: local pide solo bultos completos. Unidad: pide por unidad.”

### Sección "Compras a proveedor (fiambre)"
- **Modo compra proveedor** — Bulto (default) | Unidad (fiambre/kg). Ayuda: “Fiambre: stock en kg, pedido por unidades (piezas)”.
- Si modoCompraProveedor === UNIDAD:
  - **Peso referencia (kg)** — Número. Ayuda: “Peso por pieza. Ej: mortadela 4.5kg, salame 1.2kg”.
  - **Peso fijo** — Toggle. Ayuda: “Fijo: mortadela siempre 4.5kg. Variable: salame (peso varía)”.
  - **Actualizar promedio en recepción** — Toggle. Ayuda: “Al recibir, recalcular peso promedio con los kg reales”.

**No se muestran en el form:** modo_stock (se envía "BULTO" por defecto), pesoPromedioKg (lo actualiza el backend en recepción; no editable).

---

## LOGICA REAL DEL NEGOCIO VS FORM ACTUAL

| Aspecto | Lógica real | Form actual |
|--------|-------------|-------------|
| **Cómo se vende en local** | Fiambres y productos por kg → por peso (kg). No por pieza en POS. | Unidad tiene opción “Kg”; no dice “en local se vende por peso”. No vincula “Kg” con “fiambre”. |
| **Cómo se compra a proveedor** | Algunos por kg se compran por pieza/barra (mortadela); pedido en unidades; producto con peso (fijo o variable). | “Compras a proveedor (fiambre)” con Modo compra = Unidad; Peso referencia y Peso fijo. Bien para “compra por pieza”. No aclara que en local igual se vende por kg. |
| **Control de stock** | Stock en kg para fiambre; en unidades para unidad/pack/cajón. | No hay bloque “Stock”. No se explica que con Kg o fiambre el stock es en kg. modo_stock no es editable. |
| **Peso fijo vs variable** | Mortadela fija 4.5 kg; salame variable. | Peso fijo (toggle) y “Actualizar promedio en recepción” están; texto de ayuda claro. |
| **Peso de referencia / promedio por pieza** | Peso por pieza para pedir y recibir (y en futuro para descontar en venta por pieza). | “Peso referencia (kg)” con buena ayuda. pesoPromedioKg no se muestra (solo lo actualiza el sistema). |

**Resumen:** El form permite configurar “compra por pieza” y “peso por pieza” (fiambre), pero no explicita “venta en local siempre por kg” ni agrupa “Venta en local” vs “Compra a proveedor”. Unidad (Unidad/Pack/Cajón/Kg) y Modo compra proveedor están en secciones separadas; no se guía “si es fiambre, Unidad debería ser Kg”.

---

## CAMPOS CONFUSOS

- **unidad_medida:** Puede leerse como “unidad de medida del producto” o “cómo se vende”. No se aclara que en POS “Kg” = venta por peso (kg) y “Unidad” = venta por unidad. Para fiambre, “Kg” es lo correcto; el form no lo sugiere.
- **modo_pedido:** Etiqueta “Modo de pedido” en sección “Reposición automática”. Es para pedidos **al depósito** (bulto vs unidad), no para compra a proveedor. Se puede confundir con “cómo se pide al proveedor”.
- **modo_envio:** “Cómo sale (depósito→locales)” aclara que es depósito→locales. Menos ambiguo, pero “modo_envio” como nombre no lo dice.
- **modoCompraProveedor:** “Modo compra proveedor” + “Unidad (fiambre/kg)” deja claro que es compra. “Bulto” vs “Unidad” aquí sí refiere a compra (por bulto o por pieza).
- **peso_kg:** En Presentación. No se distingue de “peso por pieza” (pesoReferenciaKg). En modelo: peso_kg = peso del producto (referencia genérica); pesoReferenciaKg = peso por pieza (fiambre). En el form ambos son “peso” en kg; solo el de fiambre tiene “por pieza” en la ayuda.
- **pesoReferenciaKg:** Bien ubicado en fiambre; ayuda clara “Peso por pieza”.
- **pesoPromedioKg:** No está en el form (se actualiza en recepción). Quien edita no ve el promedio actual; solo “Actualizar promedio en recepción”.
- **precio_venta / precio_costo:** No indican “por qué”: por unidad, por kg o por bulto. Para kg, precio_venta = precio por kg; para pack/cajón, suele ser por bulto. El usuario puede cargar mal si no lo sabe.

---

## QUÉ ALCANZA Y QUÉ NO

**Alcanza para representar:**
- Producto vendido por kg en local: Unidad = Kg. Precio = precio por kg.
- Comprado por pieza en proveedor: Modo compra proveedor = Unidad (fiambre); Peso referencia; Peso fijo; Actualizar promedio. La estructura de datos lo soporta.
- Peso fijo vs variable: Peso fijo + Actualizar promedio en recepción.

**No alcanza o no está claro en el form:**
- **Relación Unidad ↔ Compra:** No se indica que para “fiambre” (compra por pieza) la Unidad de venta debe ser Kg. Se puede guardar Unidad = Unidad y Modo compra = Unidad (fiambre), inconsistente para mortadela.
- **Sentido de precios:** No dice si Costo/Venta son por unidad, por kg o por bulto según el tipo de producto.
- **Stock:** No se explica en qué unidad está el stock (kg vs unidades) según Unidad y modo compra.
- **peso_kg vs pesoReferenciaKg:** Dos “pesos” sin aclarar: uno genérico (Presentación), otro “por pieza” (Fiambre). Riesgo de duplicar o confundir.

---

## DIAGNOSTICO FINAL

- **Estructura/modelo:** Con la estructura actual (unidad_medida, factor_pack, modoCompraProveedor, pesoReferenciaKg, pesoEsFijo, actualizaPromedioPorRecepcion) se puede representar correctamente: venta por kg en local + compra por pieza en proveedor + peso fijo o variable. No hace falta cambiar modelo para ese caso.

- **Formulario (UI):** No representa del todo bien la lógica de negocio porque:
  - No agrupa ni explica “Cómo se vende (local)” vs “Cómo se compra (proveedor)”.
  - No aclara qué significa cada “Unidad” (Kg = venta por peso en POS).
  - No guía que fiambre → Unidad = Kg.
  - precio_venta / precio_costo sin “por unidad / por kg / por bulto”.
  - peso_kg (Presentación) y pesoReferenciaKg (Fiambre) pueden confundirse.

- **Validaciones:** No hay validación que obligue o avise “si Modo compra = Unidad (fiambre), Unidad debería ser Kg”. Se pueden guardar combinaciones inconsistentes.

**Qué habría que corregir:**
- **UI/formulario:** Agrupar o titular mejor bloques (ej. “Venta en local”, “Compra a proveedor”); texto de ayuda en Unidad (Kg = venta por peso; para fiambre usar Kg); aclarar Costo/Venta “por unidad”, “por kg” o “por bulto” según unidad_medida; distinguir peso_kg (peso del producto) de pesoReferenciaKg (peso por pieza).
- **UI + validaciones:** Añadir validación o aviso: si modoCompraProveedor === UNIDAD y unidad_medida !== "kg", advertir o sugerir cambiar a Kg (o bloquear guardar según política).
- **Estructura/modelo:** No es necesario cambiar para el caso “venta por kg en local, compra por pieza en proveedor, peso fijo o variable”. Opcional: si se quisiera mostrar pesoPromedioKg (solo lectura) en el form, sería solo UI.

**Resumen:** Alcanza la estructura; lo que falla es **claridad y guía en el formulario** y **validaciones** para evitar combinaciones incoherentes (fiambre con Unidad ≠ Kg). Corregir con mejoras de **UI + validaciones**; no hace falta cambiar modelo.

---

**Documento de auditoría; no incluye implementación ni cambios de código.**
