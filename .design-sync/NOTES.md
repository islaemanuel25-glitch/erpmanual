# design-sync — notas del repo

## EL `projectId` NO SE COMMITEA. ESTE REPOSITORIO ES PÚBLICO.

`config.json` normalmente lleva un campo `projectId` con el identificador del
proyecto de claude.ai/design al que sincroniza. **Acá se saca a propósito**: es el
identificador de un recurso privado de la cuenta de Emanuel, y este repositorio es
público. No da acceso por sí solo —hace falta estar autenticado— pero identifica
qué proyecto es, y eso no tiene por qué estar a la vista de cualquiera.

**Qué cuesta sacarlo, dicho para que nadie lo reponga sin querer:** sin ese campo,
un re-sync no sabe a qué proyecto va y ofrecería crear uno nuevo. **Antes de
sincronizar hay que pegarlo de vuelta en `config.json`.** El valor está en la URL
del proyecto: `https://claude.ai/design/p/<ese-es-el-id>`.

## Cómo está armado este sync, y por qué así

- **El repo no publica el kit como paquete**: no hay `dist/`, ni punto de entrada,
  ni Storybook. La entrada se genera —un barrel que re-exporta los componentes— en
  `.cache/kit-entry.jsx`, que es material derivado y no se commitea.
- **El CSS se compila aparte**, a `.cache/kit.css`, corriendo Tailwind sobre
  `app/globals.css`. Esa hoja ya trae los catorce temas, las clases del kit y la
  fuente, en el orden de cascada que el proyecto cuida. Sin ese paso las tarjetas
  salen sin estilo, porque las clases de Tailwind sólo existen dentro del build de
  Next.
- **El tema de las tarjetas lo fija `preview-provider.jsx`**, no el provider del
  kit. `SunmiThemeProvider` administra la preferencia y a propósito NO escribe
  `data-theme` en su primer sincronizado, para no pisar lo que dejó el servidor.
  En una tarjeta suelta no hay servidor: sin el envoltorio, todo se dibuja con el
  tema por defecto sobre fondo blanco.
- **`guidelinesGlob` está acotado a mano.** Por defecto el conversor se llevaba los
  26 documentos de `docs/` como si fueran guías de diseño, incluidos el checklist
  de despliegue, el runbook de backup y el estado del sistema. Quedaron los tres
  que sí son de diseño.

## Riesgos para el próximo sync

- **`SunmiToast` no es un componente** y está excluido: ese archivo exporta
  `SunmiToaster` y cuatro funciones de aviso. Si alguien lo repone al mapa, el
  chequeo de exports se pone rojo.
- **Los once excluidos son los que no usa ninguna pantalla.** Incluirlos no es
  neutral: el agente de diseño los tomaría como parte del kit y los usaría en
  pantallas nuevas, que es cómo se revive código muerto.
- **El sync dejó `ds-bundle/` y `.ds-sync/` sin ignorar la primera vez**, y eso
  puso ROJO el candado de tokens del repo: contaba las variables internas de
  Tailwind del CSS compilado como tokens huérfanos. Ya están en `.gitignore`; si
  alguien los saca, vuelve a pasar.
- **Quedó a medias**: subió el primer lote de 11 componentes. Faltan 18
  previsualizaciones por escribir.
