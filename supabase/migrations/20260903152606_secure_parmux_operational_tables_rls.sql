begin;

alter table public.contacts_cases enable row level security;
alter table public.contacts_cases force row level security;

alter table public.system_logs enable row level security;
alter table public.system_logs force row level security;

alter table public.businesses enable row level security;
alter table public.businesses force row level security;

alter table public.business_settings enable row level security;
alter table public.business_settings force row level security;

alter table public.contacts enable row level security;
alter table public.contacts force row level security;

alter table public.conversations enable row level security;
alter table public.conversations force row level security;

alter table public.messages enable row level security;
alter table public.messages force row level security;

alter table public.conversation_events enable row level security;
alter table public.conversation_events force row level security;

revoke all on table
  public.contacts_cases,
  public.system_logs,
  public.businesses,
  public.business_settings,
  public.contacts,
  public.conversations,
  public.messages,
  public.conversation_events
from anon, authenticated;

grant all on table
  public.contacts_cases,
  public.system_logs,
  public.businesses,
  public.business_settings,
  public.contacts,
  public.conversations,
  public.messages,
  public.conversation_events
to service_role;

revoke all on sequence public.contacts_cases_id_seq from anon, authenticated;
grant all on sequence public.contacts_cases_id_seq to service_role;

comment on table public.contacts_cases is
  'Tabla operacional interna PARMUX; acceso cliente bloqueado por RLS y grants. Usar solo desde servidor/service_role.';
comment on table public.system_logs is
  'Logs operacionales internos PARMUX; acceso cliente bloqueado por RLS y grants. Usar solo desde servidor/service_role.';
comment on table public.businesses is
  'Configuracion operacional interna PARMUX; acceso cliente bloqueado por RLS y grants. Usar solo desde servidor/service_role.';
comment on table public.business_settings is
  'Configuracion operacional interna PARMUX; acceso cliente bloqueado por RLS y grants. Usar solo desde servidor/service_role.';
comment on table public.contacts is
  'Contactos operacionales internos PARMUX; acceso cliente bloqueado por RLS y grants. Usar solo desde servidor/service_role.';
comment on table public.conversations is
  'Conversaciones operacionales internas PARMUX; acceso cliente bloqueado por RLS y grants. Usar solo desde servidor/service_role.';
comment on table public.messages is
  'Mensajes operacionales internos PARMUX; acceso cliente bloqueado por RLS y grants. Usar solo desde servidor/service_role.';
comment on table public.conversation_events is
  'Eventos operacionales internos PARMUX; acceso cliente bloqueado por RLS y grants. Usar solo desde servidor/service_role.';

commit;
