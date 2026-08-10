# INC-0001 — React2Shell: RCE crítica en Next.js

**Estado:** Cerrado
**Cuándo:** mitigado el **2026-04-27** (fecha del commit).

## Qué pasó

Se publicaron **CVE-2025-55182** y **CVE-2025-66478**, conocidas como
*React2Shell*: una ejecución remota de código **crítica (CVSS 10.0)** en la
deserialización del protocolo RSC (Flight) de React Server Components.

**Afecta a Next.js 16.0.x con App Router**, que es exactamente lo que corre este
proyecto.

## Resolución

Actualización a `next@16.0.10` + `react@19.2.1` + `react-dom@19.2.1`, con las
**versiones pineadas exactas** —sin rango— por estabilidad de producción.

Verificado hoy contra `node_modules`: las tres versiones instaladas son esas.

## Lección

El proyecto quedó con las versiones de React y Next **fijadas exactas** en
`package.json`, a diferencia del resto de las dependencias, que llevan `^`. Es
deliberado y conviene no "normalizarlo" sin entender por qué está así.

## Evidencia

- Commit **`2947f9c`** *chore(deps): upgrade next@16.0.10 + react@19.2.1 +
  react-dom@19.2.1*, del 2026-04-27. El cuerpo del commit nombra las dos CVE, el
  CVSS, el vector y la razón del pineo exacto.
- `package.json` — `"next": "16.0.10"`, `"react": "19.2.1"`, `"react-dom": "19.2.1"`,
  sin `^`.

## Sin verificar

Fuera del commit, **el repositorio no contiene ningún registro del incidente**: no
hay documento de postmortem, ni evidencia de explotación, ni fechas de detección,
ni descripción de las medidas de contención que se hayan tomado antes del parche.

Todo eso puede haber existido y no estar acá. **No se documenta lo que no se pudo
verificar**: si hace falta, hay que reconstruirlo de los logs del VPS o de donde
se haya registrado, no de la memoria.
