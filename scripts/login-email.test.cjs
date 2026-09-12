const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const register=fs.readFileSync(path.join(root,'buscARTE_registro.html'),'utf8');
const login=fs.readFileSync(path.join(root,'buscARTE_login.html'),'utf8');
test('las tres altas y su validación usan el mismo email normalizado que login',()=>{
  const expressions=[...register.matchAll(/const email = (document\.getElementById\('reg-email'\)[^;]+);/g)].map(m=>m[1]);
  assert.equal(expressions.length,4);
  const loginExpression=login.match(/const email = (emailInput\.value[^;]+);/)[1];
  for(const value of ['  Artista.Prueba@EXAMPLE.invalid  ','artista.prueba@example.invalid']) {
    const ctx=vm.createContext({document:{getElementById:()=>({value})},emailInput:{value}});
    for(const expression of expressions) assert.equal(vm.runInContext(expression,ctx),'artista.prueba@example.invalid');
    assert.equal(vm.runInContext(loginExpression,ctx),'artista.prueba@example.invalid');
  }
});
test('contraseñas preservan mayúsculas y espacios; scripts inline válidos',()=>{
  assert.equal([...register.matchAll(/const password = document\.getElementById\('reg-password'\)\?\.value;/g)].length,3);
  assert.match(login,/const pass = passInput\.value;/);
  for(const html of [register,login]) for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if(!/src\s*=|application\/ld\+json/.test(m[1])) new vm.Script(m[2]);
  }
});
test('parche SQL acotado, atómico, sin Auth/RLS ni modificación de contraseñas',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase/migrations/20260912174431_normalize_legacy_login_email.sql'),'utf8');
  assert.equal((sql.match(/p_email := lower\(btrim\(p_email\)\);/g)||[]).length,2);
  assert.match(sql,/LOCK TABLE public\.perfiles IN SHARE ROW EXCLUSIVE MODE/);
  assert.match(sql,/GROUP BY lower\(btrim\(email\)\) HAVING count\(\*\) > 1/);
  assert.match(sql,/UPDATE public\.perfiles SET email = lower\(btrim\(email\)\)/);
  assert.match(sql,/Non-email profile data changed; rolling back/);
  assert.match(sql,/RPC privileges changed; rolling back/);
  assert.doesNotMatch(sql,/UPDATE[\s\S]*?SET\s+password\s*=|SECURITY DEFINER|ALTER POLICY|DROP TABLE|auth\.users/i);
});
