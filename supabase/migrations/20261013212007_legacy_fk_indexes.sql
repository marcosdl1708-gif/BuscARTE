-- Metadata-only audit 2026-10-13: eight FK columns lack a leading valid index.
-- Additive performance aid for chats/owner lookups/deletion, no data rewrites.
-- Existing perfiles_guardados(user_id,perfil_id) and sesiones_web(perfil_id)
-- already cover their corresponding FK; no duplicate indexes are added there.
create index if not exists anuncios_user_id_idx on public.anuncios(user_id);
create index if not exists conversaciones_anuncio_id_idx on public.conversaciones(anuncio_id);
create index if not exists conversaciones_user1_id_idx on public.conversaciones(user1_id);
create index if not exists conversaciones_user2_id_idx on public.conversaciones(user2_id);
create index if not exists mensajes_anuncio_id_idx on public.mensajes(anuncio_id);
create index if not exists mensajes_de_user_id_idx on public.mensajes(de_user_id);
create index if not exists mensajes_para_user_id_idx on public.mensajes(para_user_id);
create index if not exists perfiles_guardados_perfil_id_idx on public.perfiles_guardados(perfil_id);
