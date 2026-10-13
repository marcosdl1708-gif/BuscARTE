/* Disciplinas de una persona: adaptador de presentación, nunca autorización. */
(function () {
  'use strict';
  const labels = Object.freeze({musica:'Música',actuacion:'Actuación & escena',audiovisual:'Audiovisual & fotografía',modelaje:'Modelaje',diseno:'Diseño & artes visuales',tatuaje:'Tatuaje & arte corporal',danza:'Danza',maquillaje:'Maquillaje, vestuario & FX',circo:'Circo & artes escénicas',escritura:'Escritura & guión'});
  const keys = Object.keys(labels);
  const fields = ['instrumento','generos','referentes','disponibilidad','donde_ensaya','experiencia','campos_especificos'];
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  function campos(value) {
    if (value == null || value === '') return value == null ? null : {};
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!object(parsed)) throw new Error('Los datos de la disciplina no tienen un formato válido.');
    return clone(parsed);
  }
  function empty() { return {instrumento:'',generos:'',referentes:'',disponibilidad:'',donde_ensaya:'',experiencia:null,campos_especificos:{}}; }
  function detail(source = {}) {
    const result = empty();
    for (const key of fields) if (Object.hasOwn(source,key)) result[key] = key === 'campos_especificos' ? campos(source[key]) : clone(source[key]);
    return result;
  }
  function primary(row = {}) { return row?.rubro_principal || row?.rubro || ''; }
  function read(row = {}, strict = false) {
    row=row || {};
    const principal = primary(row);
    if (row.tipo_cuenta && row.tipo_cuenta !== 'artista') return {version:1,selected:[],details:{}};
    if (row.disciplinas != null) {
      try {
        const value = typeof row.disciplinas === 'string' ? JSON.parse(row.disciplinas) : row.disciplinas;
        if (!object(value) || Object.keys(value).some(key=>!['version','selected','details'].includes(key)) || value.version !== 1 || !Array.isArray(value.selected) || !value.selected.length || new Set(value.selected).size !== value.selected.length || value.selected.some(key => !keys.includes(key)) || !value.selected.includes(principal) || !object(value.details) || Object.keys(value.details).some(key => !value.selected.includes(key))) throw new Error('Formato de disciplinas inválido.');
        const details = {};
        for (const key of value.selected) {
          if (!object(value.details[key]) || Object.keys(value.details[key]).some(field=>!fields.includes(field))) throw new Error('Faltan datos de una disciplina.');
          details[key] = detail(value.details[key]);
        }
        return {version:1,selected:[...value.selected],details};
      } catch (error) { if (strict) throw error; }
    }
    if (!keys.includes(principal)) return {version:1,selected:[],details:{}};
    let legacy;
    try { legacy = detail(row); } catch (error) { if (strict) throw error; legacy = {...empty(),...Object.fromEntries(fields.filter(key=>key!=='campos_especificos' && Object.hasOwn(row,key)).map(key=>[key,clone(row[key])]))}; }
    return {version:1,selected:[principal],details:{[principal]:legacy}};
  }
  function list(row) { return read(row).selected; }
  function has(row,key) { return list(row).includes(key); }
  function project(row,key) {
    const state = read(row);
    if (!state.selected.includes(key)) return null;
    return {...row,...clone(state.details[key]),rubro:key,rubro_principal:primary(row),disciplinas:state};
  }
  function own() {
    const session = window.BuscARTESesion;
    return session?.status === 'verified' ? session.user : null;
  }
  window.BuscARTEDisciplinas = Object.freeze({labels,keys,fields,empty,detail,primary,read,list,has,project,clone,own});
})();
