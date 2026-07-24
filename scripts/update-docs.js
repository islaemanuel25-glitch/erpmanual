/**
 * Script de auto-documentación
 *
 * Lee los cambios recientes de git y actualiza la documentación
 * correspondiente en docs/modulos/ y CHANGELOG.md
 *
 * Uso: node scripts/update-docs.js [--since="2025-01-01"] [--dry-run]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Configuración ───────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'docs');
const MODULOS_DIR = path.join(DOCS_DIR, 'modulos');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');
const ULTIMA_ACT_PATH = path.join(DOCS_DIR, 'ULTIMA-ACTUALIZACION.md');

// Mapeo de rutas a módulos
const MODULO_MAP = {
  'app/modulos/pos-ventas':       'pos-ventas',
  'components/pos-ventas':        'pos-ventas',
  'app/api/pos-ventas':           'pos-ventas',
  'app/modulos/auditoria-pos-ventas': 'pos-ventas',
  'components/auditoria-pos-ventas':  'pos-ventas',
  'app/api/auditoria-pos-ventas':     'pos-ventas',
  'lib/auditoria-pos-ventas':         'pos-ventas',
  // Bitácora de auditoría central. DEBE ir DESPUÉS de auditoria-pos-ventas:
  // detectarModulo usa startsWith y "auditoria" es prefijo de "auditoria-pos-ventas".
  'app/modulos/auditoria':            'auditoria',
  'components/auditoria':             'auditoria',
  'app/api/auditoria':                'auditoria',
  'lib/auditoria':                    'auditoria',
  'app/modulos/pos-transferencias': 'pos-transferencias',
  'components/pos-transferencias':  'pos-transferencias',
  'app/api/pos-transferencias':     'pos-transferencias',
  'app/modulos/productos':        'productos',
  'components/productos':         'productos',
  'app/api/productos':            'productos',
  'app/modulos/stock_locales':    'stock',
  'components/stock':             'stock',
  'app/api/stock':                'stock',
  'app/modulos/transferencias':   'transferencias',
  'components/transferencias':    'transferencias',
  'app/api/transferencias':       'transferencias',
  'app/modulos/usuarios':         'usuarios',
  'components/usuarios':          'usuarios',
  'app/api/usuarios':             'usuarios',
  'app/modulos/roles':            'roles',
  'app/api/roles':                'roles',
  'app/modulos/grupos':           'grupos',
  'components/grupo':             'grupos',
  'app/api/grupos':               'grupos',
  'app/modulos/locales':          'locales',
  'components/locales':           'locales',
  'app/api/locales':              'locales',
  'app/modulos/categorias':       'categorias',
  'app/api/categorias':           'categorias',
  'app/modulos/proveedores':      'proveedores',
  'app/api/proveedores':          'proveedores',
  'app/modulos/configuracion':    'configuracion',
  'app/api/configuracion':        'configuracion',
  'app/modulos/dashboard':        'dashboard',
  'app/api/dashboard':            'dashboard',
  'lib/conversiones':             'productos',
  'components/sidebar':           'configuracion',
  'components/LayoutBase':        'configuracion',
};

// ─── Argumentos CLI ──────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sinceArg = args.find(a => a.startsWith('--since='));

// ─── Helpers ─────────────────────────────────────────────────────

function ahora() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function hoy() {
  return ahora().split(' ')[0];
}

function gitExec(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

function getUltimaActualizacionDocs() {
  if (sinceArg) {
    return sinceArg.split('=')[1];
  }
  // Buscar el último commit que tocó docs/
  const hash = gitExec('git log -1 --format=%H -- docs/');
  if (hash) {
    return gitExec(`git log -1 --format=%aI ${hash}`).split('T')[0];
  }
  // Fallback: 30 días atrás
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}

function getCommitsDesde(since) {
  const log = gitExec(
    `git log --since="${since}" --format="%H|||%s|||%aI" --no-merges`
  );
  if (!log) return [];
  return log.split('\n').filter(Boolean).map(line => {
    const [hash, subject, date] = line.split('|||');
    return { hash, subject, date: date.split('T')[0] };
  });
}

function getArchivosModificados(hash) {
  const files = gitExec(`git diff-tree --no-commit-id --name-only -r ${hash}`);
  return files ? files.split('\n').filter(Boolean) : [];
}

function detectarModulo(filepath) {
  // Normalizar separadores
  const normalized = filepath.replace(/\\/g, '/');
  for (const [prefix, modulo] of Object.entries(MODULO_MAP)) {
    if (normalized.startsWith(prefix)) {
      return modulo;
    }
  }
  return null;
}

// ─── Lógica principal ────────────────────────────────────────────

function analizarCambios() {
  const since = getUltimaActualizacionDocs();
  console.log(`📅 Analizando cambios desde: ${since}`);

  const commits = getCommitsDesde(since);
  console.log(`📝 Commits encontrados: ${commits.length}`);

  if (commits.length === 0) {
    console.log('✅ No hay cambios nuevos para documentar.');
    return null;
  }

  // Agrupar cambios por módulo
  const modulosAfectados = {};

  for (const commit of commits) {
    const archivos = getArchivosModificados(commit.hash);
    for (const archivo of archivos) {
      const modulo = detectarModulo(archivo);
      if (modulo) {
        if (!modulosAfectados[modulo]) {
          modulosAfectados[modulo] = {
            archivos: new Set(),
            commits: [],
            archivosNuevos: [],
            archivosModificados: [],
          };
        }
        modulosAfectados[modulo].archivos.add(archivo);
        // Evitar commits duplicados
        if (!modulosAfectados[modulo].commits.find(c => c.hash === commit.hash)) {
          modulosAfectados[modulo].commits.push(commit);
        }
      }
    }
  }

  // Clasificar archivos nuevos vs modificados
  for (const [modulo, data] of Object.entries(modulosAfectados)) {
    for (const archivo of data.archivos) {
      // Verificar si el archivo fue creado en este rango
      const firstCommit = gitExec(
        `git log --diff-filter=A --format=%H --since="${since}" -- "${archivo}"`
      );
      if (firstCommit) {
        data.archivosNuevos.push(archivo);
      } else {
        data.archivosModificados.push(archivo);
      }
    }
  }

  return { since, commits, modulosAfectados };
}

function actualizarDocModulo(modulo, data) {
  const docPath = path.join(MODULOS_DIR, `${modulo}.md`);

  if (!fs.existsSync(docPath)) {
    console.log(`  ⚠️  No existe docs/modulos/${modulo}.md — omitido`);
    return;
  }

  let contenido = fs.readFileSync(docPath, 'utf-8');

  // Fecha de última actualización: actualizar si existe; si no, crearla justo
  // después del primer encabezado H1 (tolera CRLF).
  const fechaRegex = /\*\*Última actualización:\*\*\s*.*/;
  if (fechaRegex.test(contenido)) {
    contenido = contenido.replace(
      fechaRegex,
      `**Última actualización:** ${ahora()}`
    );
  } else {
    contenido = contenido.replace(
      /^(#\s.*(?:\r?\n))/,
      `$1\n**Última actualización:** ${ahora()}\n`
    );
  }

  // Cambios recientes: insertar bajo la sección; si NO existe, crearla al final
  // del archivo (así el doc del módulo se mantiene aunque no la tuviera).
  const cambiosSection = '## Cambios recientes';
  const nuevosEntries = data.commits
    .map(c => `- ${c.date}: ${c.subject}`)
    .join('\n');
  if (contenido.includes(cambiosSection)) {
    contenido = contenido.replace(
      cambiosSection,
      `${cambiosSection}\n${nuevosEntries}`
    );
  } else {
    contenido = `${contenido.replace(/\s*$/, '')}\n\n${cambiosSection}\n${nuevosEntries}\n`;
  }

  if (dryRun) {
    console.log(`  [DRY-RUN] Actualizaría: docs/modulos/${modulo}.md`);
  } else {
    fs.writeFileSync(docPath, contenido, 'utf-8');
    console.log(`  ✅ Actualizado: docs/modulos/${modulo}.md`);
  }
}

function actualizarUltimaActualizacion(modulosAfectados) {
  const fecha = ahora();
  const modulos = Object.keys(modulosAfectados);

  let seccionModulos = '';
  for (const [modulo, data] of Object.entries(modulosAfectados)) {
    const totalArchivos = data.archivos.size;
    const nuevos = data.archivosNuevos.length;
    const modificados = data.archivosModificados.length;
    const resumen = data.commits.map(c => c.subject).slice(0, 3).join(', ');

    seccionModulos += `### ${modulo}
- ${resumen}
- Archivos: ${nuevos > 0 ? `${nuevos} nuevos` : ''}${nuevos > 0 && modificados > 0 ? ', ' : ''}${modificados > 0 ? `${modificados} modificados` : ''} (${totalArchivos} total)
\n`;
  }

  // Listar archivos nuevos
  const archivosNuevos = [];
  for (const data of Object.values(modulosAfectados)) {
    archivosNuevos.push(...data.archivosNuevos);
  }

  let seccionArchivosNuevos = '';
  if (archivosNuevos.length > 0) {
    seccionArchivosNuevos = `## Archivos nuevos desde última sincronización
${archivosNuevos.map(a => `- ${a}`).join('\n')}
`;
  }

  const contenido = `## Última actualización del Proyecto Claude

**Fecha:** ${fecha}

## Módulos modificados recientemente

${seccionModulos}
${seccionArchivosNuevos}
## Acción recomendada
✅ Subir archivos nuevos al Proyecto Claude en claude.ai
✅ Ejecutar: git push

---
*Generado automáticamente por scripts/update-docs.js*
`;

  if (dryRun) {
    console.log('[DRY-RUN] Actualizaría: docs/ULTIMA-ACTUALIZACION.md');
  } else {
    fs.writeFileSync(ULTIMA_ACT_PATH, contenido, 'utf-8');
    console.log('✅ Actualizado: docs/ULTIMA-ACTUALIZACION.md');
  }
}

function actualizarChangelog(modulosAfectados) {
  const fecha = hoy();
  const modulos = Object.keys(modulosAfectados);
  const modulosStr = modulos.join(', ');

  // Generar sección de cambios
  let cambios = `## [${fecha}] - Actualización: ${modulosStr}\n\n### Modificado\n`;

  for (const [modulo, data] of Object.entries(modulosAfectados)) {
    for (const commit of data.commits) {
      cambios += `- **${modulo}**: ${commit.subject}\n`;
    }
  }

  cambios += '\n';

  if (!fs.existsSync(CHANGELOG_PATH)) {
    const contenido = `# Changelog\n\n${cambios}`;
    if (!dryRun) {
      fs.writeFileSync(CHANGELOG_PATH, contenido, 'utf-8');
    }
    return;
  }

  const actual = fs.readFileSync(CHANGELOG_PATH, 'utf-8');

  // Verificar que no se duplique la misma entrada de fecha
  if (actual.includes(`## [${fecha}]`)) {
    console.log(`⚠️  CHANGELOG.md ya tiene entrada para ${fecha} — omitido`);
    return;
  }

  // Insertar después del título. Tolera CRLF ('# Changelog\r\n' o '\n');
  // el replace literal con '\n' fallaba en archivos con saltos CRLF (no-op).
  // Fallback: si no hay header reconocible, prepend el bloque.
  const headerRe = /# Changelog\r?\n/;
  const nuevoContenido = headerRe.test(actual)
    ? actual.replace(headerRe, (m) => `${m}\n${cambios}`)
    : `# Changelog\n\n${cambios}${actual}`;

  if (dryRun) {
    console.log('[DRY-RUN] Actualizaría: CHANGELOG.md');
  } else {
    fs.writeFileSync(CHANGELOG_PATH, nuevoContenido, 'utf-8');
    console.log('✅ Actualizado: CHANGELOG.md');
  }
}

// ─── Main ────────────────────────────────────────────────────────

function main() {
  console.log('🔄 Sistema de auto-documentación');
  console.log('================================\n');

  // Verificar que estamos en un repo git
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    console.error('❌ No se encontró repositorio git en', ROOT);
    process.exit(1);
  }

  // Asegurar que existen los directorios
  if (!fs.existsSync(MODULOS_DIR)) {
    fs.mkdirSync(MODULOS_DIR, { recursive: true });
  }

  const resultado = analizarCambios();
  if (!resultado) return;

  const { modulosAfectados } = resultado;
  const modulos = Object.keys(modulosAfectados);

  console.log(`\n📦 Módulos afectados: ${modulos.join(', ')}\n`);

  // Actualizar docs de cada módulo
  for (const [modulo, data] of Object.entries(modulosAfectados)) {
    actualizarDocModulo(modulo, data);
  }

  // Actualizar ULTIMA-ACTUALIZACION.md
  actualizarUltimaActualizacion(modulosAfectados);

  // Actualizar CHANGELOG.md
  actualizarChangelog(modulosAfectados);

  console.log('\n✅ Auto-documentación completada.');

  if (!dryRun) {
    console.log(`\n📋 Módulos actualizados: ${modulos.join(', ')}`);
    console.log('💡 Sugerencia de commit:');
    console.log(`   git add docs/ CHANGELOG.md && git commit -m "docs: auto-update [${modulos.join(', ')}]"`);
  }
}

main();
