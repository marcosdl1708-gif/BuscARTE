import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEmail } from '../netlify/lib/mail-templates.mjs';

const base = 'https://buscarte.com.ar';
const options = { baseUrl:base, unsubscribeUrl:`${base}/.netlify/functions/email-preferencias?token=firmado`, actionUrl:`${base}/buscARTE_login.html?redirect=buscARTE_perfil.html%23completar&token=medicion` };
const marketing = ['novedades', 'resumen_mensual', 'perfil_incompleto'];

test('all supported mail types have useful HTML and readable plain text', () => {
  for (const tipo of ['bienvenida', 'mensaje', 'contacto', 'reporte', ...marketing, 'reset']) {
    const email = buildEmail(tipo, { nombre:'Ana', remitente:'Pedro', preview:'¿Armamos algo?', email:'ana@example.com', asunto:'Consulta', mensaje:'Hola', perfilId:12, motivo:'Contenido', faltantes:['foto'], mes:'septiembre', nuevosMusicos:9, nuevosAnuncios:4 }, options);
    assert.ok(email, tipo);
    assert.match(email.html, /^<!doctype html>/);
    assert.match(email.html, /<html lang="es-AR">/);
    assert.ok(email.subject.length > 10 && email.text.length > 100, tipo);
    assert.doesNotMatch(email.text, /<\/?(?:html|a|p|table|strong|div)\b|&amp;/i);
    assert.match(email.text, /buscARTE/);
    assert.doesNotMatch(email.html, /<(?:img|script|iframe|link)\b|display:\s*(?:flex|grid)/i);
    assert.equal((email.html.match(/data-primary-cta=/g) || []).length, tipo === 'contacto' ? 0 : 1, tipo);
  }
});

test('welcome gives profile completion the only primary CTA', () => {
  const email = buildEmail('bienvenida', { nombre:'Ana' });
  assert.match(email.html, /data-primary-cta="true"[^>]*>Completar mi perfil<\/a>/);
  assert.match(email.html, /buscARTE_login.html\?redirect=buscARTE_perfil.html%23completar/);
  assert.ok(email.text.indexOf('Completar mi perfil:') < email.text.indexOf('Explorar artistas'));
  assert.doesNotMatch(email.text, /aparecen primero|más mensajes|ranking|garantiz/i);
});

test('welcome respects visitor and business account purposes', () => {
  const visitor = buildEmail('bienvenida', {nombre:'Ana',tipo_cuenta:'visitante'});
  assert.match(visitor.html, /data-primary-cta="true" href="https:\/\/buscarte.com.ar\/buscARTE_busqueda.html"[^>]*>Explorar artistas<\/a>/);
  assert.match(visitor.text, /guardá los perfiles/);
  assert.doesNotMatch(visitor.text, /Completar mi perfil|disciplina|cinco|foto/);
  const business = buildEmail('bienvenida', {nombre:'Espacio Uno',tipo_cuenta:'negocio'});
  assert.match(business.html, /Presentá tu espacio/);
  assert.match(business.text, /espacio o servicio/);
  assert.match(business.html, /data-primary-cta="true"[^>]*>Completar mi perfil<\/a>/);
  assert.doesNotMatch(business.text, /tu arte|tu disciplina/);
  const artist = buildEmail('bienvenida', {nombre:'Ana',tipo_cuenta:'artista'});
  assert.match(artist.html, /data-primary-cta="true"[^>]*>Completar mi perfil<\/a>/);
});

test('marketing fails closed without a safe same-origin unsubscribe destination', () => {
  for (const tipo of marketing) {
    for (const unsubscribeUrl of [undefined, '', 'javascript:alert(1)', 'https://evil.example/unsub', '//evil.example/unsub', 'https://buscarte.com.ar@evil.example/unsub']) {
      assert.equal(buildEmail(tipo, { faltantes:['bio'], unsubscribeUrl:options.unsubscribeUrl }, { unsubscribeUrl }), null, `${tipo}: ${unsubscribeUrl}`);
    }
    const email = buildEmail(tipo, { faltantes:['bio'] }, options);
    assert.match(email.html, /Dejar de recibir novedades y recordatorios/);
    assert.ok(email.text.includes(options.unsubscribeUrl));
    assert.doesNotMatch(email.text, /respondé este mail/);
  }
});

test('reminders request only actual missing fields; complete or unknown fields yield no mail', () => {
  const email = buildEmail('perfil_incompleto', { faltantes:['bio', 'bio', 'desconocido'], etapa:'48h' }, options);
  assert.match(email.text, /Una presentación breve/);
  assert.doesNotMatch(email.text, /Una foto|Tu ubicación|Tu disciplina|Tu nombre artístico/);
  assert.equal((email.text.match(/Una presentación breve/g) || []).length, 1);
  for (const faltantes of [undefined, [], ['desconocido'], 'foto', {foto:false}]) {
    assert.equal(buildEmail('perfil_incompleto', { faltantes }, options), null);
  }
  assert.match(buildEmail('perfil_incompleto', { faltantes:{foto:true, bio:false} }, options).text, /Una foto/);
});

test('stages reflect timing without changing the missing-field request', () => {
  const timed = ['48h', '7d', 'reactivacion'].map(etapa => buildEmail('perfil_incompleto', { etapa, faltantes:['ubicacion'] }, options));
  assert.equal(new Set(timed.map(email => email.subject)).size, 3);
  assert.match(timed[1].text, /una semana/);
  assert.match(timed[2].text, /Hace un tiempo/);
  for (const email of timed) {
    assert.match(email.text, /Tu ubicación/);
    assert.doesNotMatch(email.text, /Una foto|Una presentación breve|Tu disciplina/);
  }
});

test('untrusted content remains text in all HTML contexts and never chooses a link', () => {
  const attack = '<img src=x onerror="alert(1)"> & " \'\nHeader: injected';
  const email = buildEmail('resumen_mensual', { nombre:attack, mes:attack, nuevosMusicos:-4, nuevosAnuncios:'9oops', proximosEventos:[{id:'javascript:alert(1)', titulo:attack, fecha:attack, lugar:attack, url:'https://evil.example'}], actionUrl:'https://evil.example' }, options);
  assert.doesNotMatch(email.html, /<img|onerror="|href="(?:javascript:|https:\/\/evil)/i);
  assert.match(email.html, /&lt;img/);
  assert.doesNotMatch(email.subject, /[\r\n]/);
  assert.match(email.text, /0 artistas nuevos\n0 anuncios publicados/);
  assert.ok(email.text.includes(attack));
  assert.ok(email.html.includes(options.actionUrl.replace(/&/g, '&amp;')));
});

test('message preserves line breaks and escapes HTML rather than interpreting it', () => {
  const email = buildEmail('mensaje', { remitente:'Ana\r\nBcc: intruso', preview:'Uno\n<script>alert(1)</script>' });
  assert.doesNotMatch(email.subject, /[\r\n]/);
  assert.match(email.html, /Uno<br>&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(email.text, /Uno\n<script>alert\(1\)<\/script>/);
});

test('reset only renders a server-built same-origin destination', () => {
  const datos = { nombre:'Ana', link:'https://evil.example/token' };
  assert.equal(buildEmail('reset', datos), null);
  for (const actionUrl of ['javascript:alert(1)', 'https://evil.example', 'https://buscarte.com.ar\\@evil.example', 'https://buscarte.com.ar/reset?x=\n1']) {
    assert.equal(buildEmail('reset', datos, { actionUrl }), null);
  }
  const actionUrl = `${base}/buscARTE_reset.html?token=abc&source=server`;
  const email = buildEmail('reset', datos, { actionUrl });
  assert.ok(email.text.includes(actionUrl));
  assert.match(email.html, /token=abc&amp;source=server/);
  assert.doesNotMatch(email.html, /evil\.example/);
  assert.match(email.text, /expira en 1 hora/);
});

test('contact reply-to is a single valid address and metadata cannot create links', () => {
  const email = buildEmail('contacto', { nombre:'Ana', email:'ana+web@example.com', asunto:'Hola\r\nBcc: bad', mensaje:'<b>contenido</b>', url:'javascript:alert(1)', userAgent:'<iframe src=evil>' });
  assert.equal(email.replyTo, 'ana+web@example.com');
  assert.doesNotMatch(email.subject, /[\r\n]/);
  assert.match(email.html, /&lt;b&gt;contenido&lt;\/b&gt;/);
  assert.doesNotMatch(email.html, /href="javascript:|<iframe/);
  for (const address of ['ana@example.com\nBcc:bad@example.com', '"ana"@example.com', 'ana@example.com,evil@example.com', '<ana@example.com>']) {
    assert.equal(buildEmail('contacto', { email:address }).replyTo, undefined);
  }
});

test('reports retain admin destination with escaped report and reporter details', () => {
  const email = buildEmail('reporte', { perfilNombre:'<b>Nombre</b>', perfilId:'1" onclick="x', motivo:'<script>x</script>', reporterNombre:'<img>', reporterId:2, detalle:'Línea uno\nLínea dos' }, { actionUrl:'https://evil.example' });
  assert.match(email.html, /https:\/\/supabase.com\/dashboard\/project\/xiaanchoanxmampegoay\/editor/);
  assert.doesNotMatch(email.html, /<script|<img>|onclick="|href="https:\/\/evil/);
  assert.match(email.html, /Línea uno<br>Línea dos/);
  assert.match(email.text, /Reportado por: <img> \(ID: 2\)/);
});

test('summary event links derive from IDs, never user URL; malformed counts and collections are bounded', () => {
  const email = buildEmail('resumen_mensual', { mes:'septiembre', nuevosMusicos:12, nuevosAnuncios:'7', proximosEventos:[{id:17, titulo:'Encuentro', fecha:'sábado', lugar:'La Plata', url:'https://evil.example'}, {id:'2" onmouseover="x', titulo:'Sin vínculo'}] }, { unsubscribeUrl:options.unsubscribeUrl });
  assert.match(email.html, /href="https:\/\/buscarte.com.ar\/buscARTE_anuncio_detalle.html\?id=17"/);
  assert.ok(email.text.includes('Encuentro · sábado · La Plata · https://buscarte.com.ar/buscARTE_anuncio_detalle.html?id=17'));
  assert.doesNotMatch(email.html, /evil\.example|onmouseover|display:flex/);
  assert.match(email.text, /12 artistas nuevos\n7 anuncios publicados/);
  assert.ok(buildEmail('resumen_mensual', { proximosEventos:'not-an-array' }, options));
  const bounded = buildEmail('resumen_mensual', { eventos:Array.from({length:10}, (_, index) => ({id:index + 1, titulo:`Evento ${index + 1}`})) }, options);
  assert.match(bounded.text, /Evento 3/);
  assert.doesNotMatch(bounded.text, /Evento 4/);
});

test('invalid options cannot introduce unsafe base URL or override raw data URLs', () => {
  const email = buildEmail('bienvenida', { actionUrl:'https://evil.example', link:'javascript:x' }, { baseUrl:'javascript:alert(1)', actionUrl:'//evil.example' });
  assert.match(email.html, /href="https:\/\/buscarte.com.ar\/buscARTE_login/);
  assert.doesNotMatch(email.html, /href="(?:javascript:|https:\/\/evil)/);
  assert.equal(buildEmail('unsupported'), null);
  assert.ok(buildEmail('bienvenida', null, null));
});
