const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Source-only contracts: no page initialization, HTTP, accounts or backend writes.
const root = path.resolve(__dirname, '..');
const files = ['registro', 'perfil', 'busqueda', 'anuncios'];
const source = Object.fromEntries(files.map(name => [name, fs.readFileSync(path.join(root, `buscARTE_${name}.html`), 'utf8').replace(/\r\n/g, '\n')]));
const roles = ['Operador de sonido FOH', 'Operador de sonido de monitores', 'Operador de iluminación', 'Stage / Asistente de escenario', 'Stage Manager'];
const plain = value => JSON.parse(JSON.stringify(value));

function constant(text, name) {
  const start = new RegExp(`^([ \\t]*)const ${name} = ([\\[{])`, 'm').exec(text);
  assert.ok(start, `Missing catalog ${name}`);
  const offset = start.index + start[0].length - 1;
  const tail = text.slice(offset);
  const end = start[2] === '['
    ? tail.indexOf('\n')
    : new RegExp(`^${start[1]}\\}[;]?[ \\t]*$`, 'm').exec(tail)?.index;
  assert.ok(Number.isInteger(end) && end > 0, `Missing end of ${name}`);
  const literal = start[2] === '[' ? tail.slice(0, end).replace(/;\s*$/, '') : tail.slice(0, end + start[1].length + 1);
  return vm.runInNewContext(`(${literal})`, {}, { timeout: 1000 });
}

function functionSource(text, name) {
  const start = new RegExp(`^([ \\t]*)function ${name}\\(`, 'm').exec(text);
  assert.ok(start, `Missing function ${name}`);
  const tail = text.slice(start.index);
  const end = new RegExp(`^${start[1]}\\}[;]?[ \\t]*$`, 'm').exec(tail);
  assert.ok(end, `Missing end of ${name}`);
  return tail.slice(0, end.index + end[0].length);
}

function buttons(text, id) {
  const start = text.indexOf(`id="${id}"`);
  assert.ok(start >= 0, `Missing chips ${id}`);
  return [...text.slice(start, text.indexOf('</div>', start)).matchAll(/<button\b[^>]*>([^<]+)<\/button>/g)].map(match => match[1].replaceAll('&amp;', '&').trim());
}

const search = constant(source.busqueda, 'RUBROS_BUSQUEDA_CONFIG');
const searchLabels = constant(source.busqueda, 'INSTR_LABELS');
const adsInstruments = constant(source.anuncios, 'INSTRUMENTOS');
const adsFilters = constant(source.anuncios, 'RUBROS_FILTROS_PANEL');
const adsCreate = constant(source.anuncios, 'BUSCO_RUBRO_CHIPS');

test('five exact roles occur once in every Music create/edit/search/ad catalog', () => {
  const catalogs = {
    registro: buttons(source.registro, 'chips-instrumentos'),
    perfil: buttons(source.perfil, 'chips-inst'),
    searchChips: search.musica.filtrosPrincipales[0].chips,
    searchLabels,
    adsInstruments,
    adsFilters: adsFilters.musica[0].chips,
    adsCreate: adsCreate.musica.chips,
    adsFallback: buttons(source.anuncios, 'busco-chips-especificos'),
  };
  for (const [name, chips] of Object.entries(catalogs)) {
    for (const role of roles) assert.equal(chips.filter(value => value === role).length, 1, `${name}: ${role}`);
    assert.equal(new Set(chips).size, chips.length, `${name}: no duplicate chips`);
    for (const legacy of ['Guitarra', 'Voz / Canto', 'Compositor / Arreglador', 'Manager']) assert.ok(chips.includes(legacy), `${name}: preserve ${legacy}`);
  }
  for (const name of ['registro', 'perfil', 'searchChips', 'searchLabels', 'adsInstruments', 'adsFilters']) {
    assert.ok(catalogs[name].includes('Técnico de sonido'), `${name}: preserve generic sound technician`);
  }
});

test('search classifies technical roles as instruments and matches saved CSV without changing aliases', () => {
  const context = vm.createContext({ INSTR_LABELS: searchLabels, BUSCA_LABELS: constant(source.busqueda, 'BUSCA_LABELS'), activeFilters: {}, onChips: [...roles, 'Rock', 'Banda'] });
  const assignments = ['instrumentos', 'generos'].map(field => {
    const line = source.busqueda.match(new RegExp(`^\\s*activeFilters\\.${field} = onChips[^\\n]+`, 'm'));
    assert.ok(line, `Missing actual ${field} classifier`);
    return line[0];
  });
  vm.runInContext([...['normalizeText', 'includesLoose', 'matchesArrayField'].map(name => functionSource(source.busqueda, name)), ...assignments].join('\n'), context, { timeout: 1000 });
  assert.deepEqual(plain(context.activeFilters.instrumentos), roles);
  assert.deepEqual(plain(context.activeFilters.generos), ['Rock']);
  for (const role of roles) {
    assert.equal(context.matchesArrayField(`Guitarra, ${role}`, [role]), true, role);
    assert.equal(context.matchesArrayField('Guitarra, Técnico de sonido, Manager', [role]), false, `${role}: do not match unrelated legacy profile`);
  }
  assert.equal(context.matchesArrayField('Operador de iluminacion', ['Operador de iluminación']), true);
  assert.equal(context.matchesArrayField('Teclado / Piano', ['Teclado'], { Teclado: 'Teclado / Piano' }), true);
});

test('Busco and Ofrezco render Music roles and serialize them to existing instrumentos, not genres/tags', () => {
  const elements = Object.fromEntries(['ofrezco-chips-especificos', 'ofrezco-titulo', 'busco-chips-especificos'].map(id => [id, { innerHTML: '', placeholder: '' }]));
  const context = vm.createContext({
    BUSCO_RUBRO_CHIPS: adsCreate, OFREZCO_PLACEHOLDERS: {}, anuncioEnviando: false, formRubrosRenderizados: new Map(), buscoRubroSeleccionado: null,
    document: { getElementById: id => elements[id], querySelectorAll: () => [] },
    INSTRUMENTOS: adsInstruments, GENEROS: constant(source.anuncios, 'GENEROS'), chips: [...roles, 'Rock', 'Etiqueta de fixture'], datos: {},
  });
  const assignments = ['instrumentos', 'generos', 'tags'].map(field => {
    const line = source.anuncios.match(new RegExp(`^\\s*datos\\.${field} = chips\\.filter[^\\n]+`, 'm'));
    assert.ok(line, `Missing actual ${field} serializer`);
    return line[0];
  });
  vm.runInContext(['renderOfrecerChips', 'seleccionarRubroBusco'].map(name => functionSource(source.anuncios, name)).join('\n') + '\n' + assignments.join('\n'), context, { timeout: 1000 });
  context.renderOfrecerChips('musica');
  context.seleccionarRubroBusco('musica', null);
  for (const id of ['ofrezco-chips-especificos', 'busco-chips-especificos']) {
    for (const role of roles) assert.ok(elements[id].innerHTML.includes(`>${role}</button>`), `${id}: ${role}`);
    assert.ok(elements[id].innerHTML.includes('Instrumento / Rol'));
  }
  assert.deepEqual(plain(context.datos), { instrumentos: roles.join(', '), generos: 'Rock', tags: 'Etiqueta de fixture' });
  context.renderOfrecerChips('danza');
  context.seleccionarRubroBusco('danza', null);
  for (const id of ['ofrezco-chips-especificos', 'busco-chips-especificos']) {
    for (const role of roles) assert.equal(elements[id].innerHTML.includes(role), false, `${id}: no Music roles in Dance`);
    assert.ok(elements[id].innerHTML.includes('Tango'));
  }
});

test('roles stay out of other rubros and Marketplace; all inline JavaScript still parses', () => {
  for (const catalog of [search, adsFilters, adsCreate]) {
    for (const [rubro, config] of Object.entries(catalog)) {
      if (rubro === 'musica') continue;
      for (const role of roles) assert.equal(JSON.stringify(config).includes(role), false, `${rubro}: ${role}`);
    }
  }
  const products = constant(source.anuncios, 'CATEGORIAS_VENTA_POR_RUBRO');
  for (const role of roles) assert.equal(JSON.stringify(products).includes(role), false, `Marketplace: ${role}`);
  assert.ok(products.musica.includes('Monitores / Parlantes'));
  for (const [name, text] of Object.entries(source)) {
    let count = 0;
    for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=/.test(match[1]) || /application\/ld\+json/.test(match[1]) || !match[2].trim()) continue;
      new vm.Script(match[2], { filename: `buscARTE_${name}.html:inline-${++count}` });
    }
    assert.ok(count > 0, `${name}: inline scripts checked, never executed`);
  }
});
