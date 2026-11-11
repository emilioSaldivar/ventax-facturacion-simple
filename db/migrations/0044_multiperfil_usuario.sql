-- SPEC_MULTIPERFIL_USUARIO_v0.1 (FS-54): un usuario con varias configuraciones operativas.
--
-- Antes: una sola configuracion activa por usuario (indice de 0004). Ahora: N configuraciones
-- activas, todas del mismo facturador (RN-01), sin repetir el mismo perfil. El refresh token
-- recuerda con que configuracion se emitio, para que la renovacion conserve el punto.
--
-- Reversa (manual, no automatizada): drop trigger y function; drop index
-- usuario_operacion_config_usuario_perfil_uidx; recrear usuario_operacion_config_usuario_activa_uidx
-- SOLO si ningun usuario tiene dos configuraciones activas; alter table refresh_tokens drop column
-- operacion_config_id.

-- Precondicion: hoy no puede haber un usuario con dos facturadores activos.
do $$
begin
  if exists (
    select 1
      from usuario_operacion_config
     where activo and deleted_at is null
     group by usuario_id
    having count(distinct facturador_id) > 1
  ) then
    raise exception 'MULTIPERFIL_PRECONDICION: hay usuarios con mas de un facturador activo';
  end if;
end $$;

drop index if exists usuario_operacion_config_usuario_activa_uidx;

create unique index usuario_operacion_config_usuario_perfil_uidx
  on usuario_operacion_config (usuario_id, actividad_punto_perfil_id)
  where activo = true and deleted_at is null;

create index if not exists usuario_operacion_config_usuario_activa_idx
  on usuario_operacion_config (usuario_id)
  where activo = true and deleted_at is null;

-- RN-01: todas las configuraciones activas de un usuario son del mismo facturador. Red de
-- seguridad: la API valida antes y responde 422 FACTURADOR_DISTINTO con mensaje propio.
create or replace function usuario_operacion_config_un_facturador() returns trigger as $$
begin
  if new.activo and new.deleted_at is null and exists (
    select 1
      from usuario_operacion_config u
     where u.usuario_id = new.usuario_id
       and u.id <> new.id
       and u.activo
       and u.deleted_at is null
       and u.facturador_id <> new.facturador_id
  ) then
    raise exception 'USUARIO_CON_OTRO_FACTURADOR' using errcode = '23514';
  end if;
  return new;
end
$$ language plpgsql;

create trigger usuario_operacion_config_un_facturador_trg
  before insert or update on usuario_operacion_config
  for each row execute function usuario_operacion_config_un_facturador();

alter table refresh_tokens
  add column operacion_config_id uuid references usuario_operacion_config(id);

create index refresh_tokens_operacion_config_idx
  on refresh_tokens (operacion_config_id)
  where revoked_at is null;
