const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../buscARTE_perfil_publico.html'), 'utf8');
const config = html.slice(html.indexOf('  const RUBRO_COLORS ='), html.indexOf('  // Aplicar rubro UI apenas carga'));
const render = html.slice(html.indexOf('  function aplicarRubroPerfil('), html.indexOf('  // Render mínimo para cuentas'));
function fixture(rubro, fields, extra = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent:'', innerHTML:'', style:{} });
    return nodes.get(id);
  };
  const context = vm.createContext({
    document: { getElementById:node, querySelector:node, documentElement:{style:{setProperty(){}}} },
    escapeHtml: value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
  });
  vm.runInContext(config + '\n' + render, context, {timeout:1000});
  const profile = {rubro, campos_especificos:fields, ...extra};
  context.aplicarRubroPerfil(rubro, profile);
  return {node, context};
}

test('Modelaje muestra todos los tipos de trabajo sin cambiar género del resumen', () => {
  const {node} = fixture('modelaje', {tipo_trabajo:['Publicidad','Pasarela'], genero:['Mujer']});
  assert.match(node('section-title-generos').innerHTML, /Tipo de trabajo/);
  assert.equal(node('perfil-generos').innerHTML, '<span class="genero-chip primary">Publicidad</span><span class="genero-chip primary">Pasarela</span>');
  assert.equal(node('stat-genero').textContent, 'Mujer');
  assert.equal(node('stat-instrumento').textContent, 'Publicidad');
});

test('Modelaje respeta aliases antiguos, datos vacíos y ausencia sin usar género como fallback', () => {
  const legacy = fixture('modelaje', JSON.stringify({'chips-tipo-modelo':['Editorial'], 'chips-genero-modelo':['Mujer']}));
  assert.match(legacy.node('perfil-generos').innerHTML, />Editorial</);
  assert.equal(legacy.node('stat-genero').textContent, 'Mujer');
  for (const fields of [
    {tipo_trabajo:[], 'chips-tipo-modelo':['Editorial'], genero:['Mujer']},
    {genero:['Mujer']},
    '{invalid JSON',
  ]) assert.equal(fixture('modelaje', fields).node('perfil-generos').innerHTML, '—');
});

test('El estado vacío de portfolio es neutro sólo para Modelaje, al iniciar y al cargar', () => {
  const {node, context} = fixture('modelaje', {});
  assert.equal(node('#perfil-videos > .video-item-empty:only-child').textContent, 'Sin material de portfolio cargado');
  assert.equal(context.getPortfolioEmptyText('modelaje'), 'Sin material de portfolio cargado');
  for (const rubro of ['musica','actuacion','audiovisual','diseno','tatuaje','danza','maquillaje','circo','escritura']) {
    assert.equal(context.getPortfolioEmptyText(rubro), 'Sin videos cargados');
  }
  assert.match(html, /if \(videosEl\) videosEl\.innerHTML = `[^\n]+getPortfolioEmptyText\(rubro\)/);
  assert.match(html, /if \(videosEl && p\.videos\)/);
});

test('Música y Danza conservan su sección y todos los scripts inline siguen siendo válidos', () => {
  assert.match(fixture('musica', {}, {generos:'Rock, Jazz'}).node('perfil-generos').innerHTML, />Rock</);
  assert.match(fixture('danza', {rol:['Bailarín/a'], disciplina:['Tango']}).node('perfil-generos').innerHTML, />Tango</);
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/src\s*=|application\/ld\+json/.test(match[1]) || !match[2].trim()) continue;
    new vm.Script(match[2]);
  }
});
