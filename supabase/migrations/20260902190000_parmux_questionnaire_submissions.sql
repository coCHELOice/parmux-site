begin;

create table if not exists public.parmux_questionnaire_submissions (
  id uuid primary key,
  client_id text not null check (client_id ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  clinic_name text not null check (char_length(clinic_name) between 1 and 160),
  schema_version smallint not null default 1 check (schema_version > 0),
  payload jsonb not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  contact_email text not null check (char_length(contact_email) between 3 and 320),
  status text not null default 'received'
    check (status in ('received', 'reviewed', 'proposal_prepared', 'follow_up', 'closed')),
  email_status text not null default 'pending'
    check (email_status in ('pending', 'delivered', 'failed')),
  hetzner_backup_status text not null default 'pending'
    check (hetzner_backup_status in ('pending', 'stored', 'failed', 'not_configured')),
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parmux_questionnaire_submissions_client_received_idx
  on public.parmux_questionnaire_submissions (client_id, received_at desc);

alter table public.parmux_questionnaire_submissions enable row level security;
alter table public.parmux_questionnaire_submissions force row level security;

revoke all on table public.parmux_questionnaire_submissions from anon, authenticated;
grant all on table public.parmux_questionnaire_submissions to service_role;

comment on table public.parmux_questionnaire_submissions is
  'Envíos finales de cuestionarios comerciales PARMUX. Acceso exclusivo server-side.';

commit;
