-- Apply only AFTER the secure frontend/functions have been published and checked.
-- Preserve rows/passwords/IDs; close the old anonymous mutation/private-read paths.
revoke all on public.perfiles,public.mensajes,public.conversaciones,public.perfiles_guardados,
  public.reacciones,public.anuncios,public.artistas_sugeridos from public,anon,authenticated;

-- Public professional presentation only. Credentials/recovery/email never public.
grant select(id,created_at,nombre,instrumento,generos,provincia,ciudad,barrio,bio,referentes,
  disponibilidad,donde_ensaya,redes,videos,es_premium,foto_url,celular,baneado,experiencia,
  edad,genero_principal,tipo_cuenta,rubro,campos_especificos) on public.perfiles to anon,authenticated;
grant select on public.anuncios,public.artistas_sugeridos to anon,authenticated;
grant select(anuncio_id,tipo) on public.reacciones to anon,authenticated;

-- Defense in depth: remove the permissive legacy policies, not just their grants.
drop policy "Permitir insercion publica" on public.perfiles;
drop policy "Actualizar perfil" on public.perfiles;
drop policy "Insertar mensajes" on public.mensajes;
drop policy "Leer mensajes" on public.mensajes;
drop policy "Insertar conversaciones" on public.conversaciones;
drop policy "Actualizar conversaciones" on public.conversaciones;
drop policy "Leer conversaciones" on public.conversaciones;
drop policy "Ver guardados" on public.perfiles_guardados;
drop policy "Guardar perfil" on public.perfiles_guardados;
drop policy "Eliminar guardado" on public.perfiles_guardados;
drop policy "Insertar anuncios publicos" on public.anuncios;
drop policy "Eliminar anuncios" on public.anuncios;
drop policy "Insertar artistas" on public.artistas_sugeridos;
drop policy "Actualizar artistas" on public.artistas_sugeridos;
drop policy "Insertar reaccion" on public.reacciones;
drop policy "Eliminar reaccion" on public.reacciones;

drop policy "Leer anuncios publicos" on public.anuncios;
create policy "Leer anuncios publicos" on public.anuncios for select to anon,authenticated using (oculto=false);
drop policy "Subir fotos perfil" on storage.objects;
drop policy "Subir fotos anuncios" on storage.objects;

revoke all on function public.login_usuario(text,text) from public,anon,authenticated;
revoke all on function public.registrar_usuario(text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.cambiar_password(bigint,text) from public,anon,authenticated;
revoke all on function public.eliminar_cuenta(integer) from public,anon,authenticated;
revoke all on function public.gestionar_anuncio(bigint,bigint,text) from public,anon,authenticated;
revoke all on function public.vencer_anuncios_viejos() from public,anon,authenticated;
revoke all on function public.buscar_musicos(text) from public,anon,authenticated;
grant execute on function public.login_usuario(text,text),
  public.registrar_usuario(text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb),
  public.cambiar_password(bigint,text),public.eliminar_cuenta(integer),
  public.gestionar_anuncio(bigint,bigint,text),public.vencer_anuncios_viejos(),public.buscar_musicos(text) to service_role;

alter function public.login_usuario(text,text) set search_path = public,extensions,pg_temp;
alter function public.registrar_usuario(text,text,text,text,text,text,text,text,text,text,text,text,text,jsonb) set search_path = public,extensions,pg_temp;
alter function public.cambiar_password(bigint,text) set search_path = public,extensions,pg_temp;
alter function public.buscar_musicos(text) set search_path = public,extensions,pg_temp;
alter function public.eliminar_cuenta(integer) security invoker;
alter function public.eliminar_cuenta(integer) set search_path = public,extensions,pg_temp;
alter function public.gestionar_anuncio(bigint,bigint,text) security invoker;
alter function public.vencer_anuncios_viejos() security invoker;

-- Keep unrelated chat history when an owned ad is deleted; avoid dangling FKs
-- and orphan reactions. Only the verified server may call this routine.
create or replace function public.eliminar_cuenta(p_user_id integer)
returns json language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.sesiones_web where perfil_id=p_user_id;
  delete from public.reacciones where user_id=p_user_id or anuncio_id in (select id from public.anuncios where user_id=p_user_id);
  delete from public.mensajes where de_user_id=p_user_id or para_user_id=p_user_id;
  delete from public.conversaciones where user1_id=p_user_id or user2_id=p_user_id;
  update public.mensajes set anuncio_id=null where anuncio_id in (select id from public.anuncios where user_id=p_user_id);
  update public.conversaciones set anuncio_id=null where anuncio_id in (select id from public.anuncios where user_id=p_user_id);
  delete from public.perfiles_guardados where user_id=p_user_id or perfil_id=p_user_id;
  delete from public.anuncios where user_id=p_user_id;
  delete from public.perfiles where id=p_user_id;
  return json_build_object('ok',true);
exception when others then return json_build_object('ok',false);
end;
$$;
