-- ==========================================================================
-- THE FORGE — ATHLETE DEVELOPMENT PORTAL
-- Supabase database schema + row-level security
--
-- Run this whole file once in Supabase: Dashboard → SQL Editor → New query
-- → paste → Run. Then run the "first admin" line at the very bottom with
-- your own name and email.
--
-- Who can see what (enforced by the database, not the web page):
--   • Families (guardians) see only the athletes linked to them, and only
--     PUBLISHED reports. They never see coach observation notes.
--   • Coaches see only athletes assigned to them, including drafts.
--   • Admins see and manage everything.
--   • Anyone who signs in with an email that is not in `people` sees nothing.
-- ==========================================================================

-- ---------- PEOPLE (staff + guardians) ----------
create table public.people (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null check (email = lower(trim(email))),   -- stored lowercase
  full_name     text not null,
  role          text not null check (role in ('admin','coach','guardian')),
  is_coach      boolean not null default false,      -- an admin who also coaches
  phone         text,
  contact_pref  text not null default 'Email' check (contact_pref in ('Email','Text','Phone call')),
  best_time     text,
  notify_email  boolean not null default true,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------- ATHLETES ----------
create table public.athletes (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  primary_style  text not null default 'Greco-Roman' check (primary_style in
                   ('Folkstyle','Freestyle','Greco-Roman','Freestyle & Greco-Roman','All Three Styles')),
  affiliation    text not null default 'Rochelle Wrestling Club',
  stage          text not null default 'New to The Forge',
  coach_id       uuid references public.people(id) on delete set null,
  status         text not null default 'test' check (status in ('test','active','grace','inactive')),
  created_at     timestamptz not null default now()
);

create table public.athlete_guardians (
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  guardian_id   uuid not null references public.people(id) on delete cascade,
  relationship  text not null default 'Parent',
  primary key (athlete_id, guardian_id)
);

-- ---------- ASSESSMENTS (one per athlete per month) ----------
create table public.assessments (
  id               uuid primary key default gen_random_uuid(),
  athlete_id       uuid not null references public.athletes(id) on delete cascade,
  coach_id         uuid references public.people(id) on delete set null,
  period           date not null check (extract(day from period) = 1),   -- first of the month
  status           text not null default 'draft' check (status in ('draft','review','ready','published')),
  ratings          jsonb not null default '{}',
  style_ratings    jsonb not null default '{}',
  stand            text not null default '',
  well             text not null default '',
  tough            text not null default '',
  adj_coach        text not null default '',
  adj_athlete      text not null default '',
  take             text not null default '',
  goals            jsonb not null default '[]',
  contrib          jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  approved_at      timestamptz,
  published_at     timestamptz,
  acknowledged_at  timestamptz,
  unique (athlete_id, period)
);

-- Coach observation notes live in their own table so families can never read them.
create table public.assessment_notes (
  assessment_id  uuid primary key references public.assessments(id) on delete cascade,
  notes          jsonb not null default '{}',
  updated_at     timestamptz not null default now()
);

-- ---------- FAMILY REFLECTIONS ----------
create table public.reflections (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references public.assessments(id) on delete cascade,
  athlete_id     uuid not null references public.athletes(id) on delete cascade,
  author_id      uuid references public.people(id) on delete set null,
  answers        jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  ack_at         timestamptz,
  ack_reply      text
);

-- ---------- COACH REQUESTS TO FAMILIES ----------
create table public.asks (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.athletes(id) on delete cascade,
  coach_id     uuid references public.people(id) on delete set null,
  type         text not null default 'Question',
  body         text not null,
  created_at   timestamptz not null default now(),
  reply_text   text,
  reply_link   text,
  reply_by     uuid references public.people(id) on delete set null,
  replied_at   timestamptz,
  seen_at      timestamptz
);

-- ---------- MEETINGS ----------
create table public.availability (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.people(id) on delete cascade,
  starts_at  timestamptz not null,
  open       boolean not null default true,
  unique (coach_id, starts_at)
);

create table public.meetings (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  coach_id      uuid references public.people(id) on delete set null,
  starts_at     timestamptz not null,
  purpose       text not null default 'Quarterly development meeting',
  note          text,
  status        text not null default 'requested' check (status in ('requested','confirmed','declined','completed')),
  summary       text,
  requested_by  uuid references public.people(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ---------- AUDIT + NOTIFICATIONS ----------
create table public.audit_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor_id  uuid references public.people(id) on delete set null,
  action    text not null
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  person_id   uuid references public.people(id) on delete cascade,
  athlete_id  uuid references public.athletes(id) on delete cascade,
  kind        text not null,                 -- report | ask | meeting
  channel     text not null default 'email',
  address     text not null,
  subject     text not null,
  body        text not null,
  status      text not null default 'queued' check (status in ('queued','sent','failed')),
  sent_at     timestamptz,
  error       text
);

-- ==========================================================================
-- HELPER FUNCTIONS (security definer so they can look things up without
-- tripping the row-level rules they are used inside of)
-- ==========================================================================
create or replace function public.me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.people
  where email = lower(auth.jwt() ->> 'email') and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.people where id = public.me() and role = 'admin')
$$;

create or replace function public.coaches_athlete(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.athletes where id = aid and coach_id = public.me())
$$;

create or replace function public.guards_athlete(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.athlete_guardians where athlete_id = aid and guardian_id = public.me())
$$;

create or replace function public.can_see_athlete(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.coaches_athlete(aid) or public.guards_athlete(aid)
$$;

-- Is person `pid` a guardian of an athlete I coach, or a co-guardian of one of my kids?
create or replace function public.can_see_person(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.athlete_guardians ag
    join public.athletes a on a.id = ag.athlete_id
    where ag.guardian_id = pid
      and (a.coach_id = public.me() or public.guards_athlete(a.id))
  )
$$;

-- Family marks a report as read.
create or replace function public.acknowledge_report(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.assessments set acknowledged_at = coalesce(acknowledged_at, now())
  where id = p_id and status = 'published' and public.guards_athlete(athlete_id)
$$;

-- ==========================================================================
-- RULES ENFORCED BY TRIGGERS
-- ==========================================================================

-- People: only admins may change someone's email, role, coach flag or active state.
create or replace function public.guard_people_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and (new.email is distinct from old.email or new.role is distinct from old.role
     or new.is_coach is distinct from old.is_coach or new.active is distinct from old.active) then
    raise exception 'Only an administrator can change email, role or access.';
  end if;
  return new;
end $$;
create trigger people_guard before update on public.people
  for each row execute function public.guard_people_update();

-- Assessments: approval before publishing; published reports are locked
-- except goal progress and the family's "read" mark; server sets timestamps.
create or replace function public.guard_assessment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('ready','published') then
      raise exception 'New assessments start as drafts.';
    end if;
    new.coach_id := coalesce(new.coach_id, public.me());
    new.approved_at := null; new.published_at := null; new.acknowledged_at := null;
    return new;
  end if;

  if old.status = 'published' then
    if (new.status, new.ratings, new.style_ratings, new.stand, new.well, new.tough, new.adj_coach,
        new.adj_athlete, new.take, new.period, new.athlete_id, new.published_at, new.approved_at)
       is distinct from
       (old.status, old.ratings, old.style_ratings, old.stand, old.well, old.tough, old.adj_coach,
        old.adj_athlete, old.take, old.period, old.athlete_id, old.published_at, old.approved_at) then
      raise exception 'This report is published and locked. Contact an administrator for corrections.';
    end if;
    return new;
  end if;

  new.updated_at := now();
  if new.status = 'published' then
    if old.status <> 'ready' then raise exception 'Approve the report before publishing.'; end if;
    new.published_at := now();
    new.acknowledged_at := null;
  elsif new.status = 'ready' then
    new.approved_at := coalesce(case when old.status = 'ready' then old.approved_at end, now());
  else
    new.approved_at := null;
  end if;
  return new;
end $$;
create trigger assessments_guard before insert or update on public.assessments
  for each row execute function public.guard_assessment();

-- Queue an email to every guardian (who wants email) of an athlete.
create or replace function public.queue_family_email(p_athlete uuid, p_kind text, p_subject text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (person_id, athlete_id, kind, channel, address, subject, body)
  select p.id, p_athlete, p_kind, 'email', p.email, p_subject, p_body
  from public.athlete_guardians ag join public.people p on p.id = ag.guardian_id
  where ag.athlete_id = p_athlete and p.active and p.notify_email;
end $$;

create or replace function public.first_name(n text) returns text
language sql immutable as $$ select split_part(trim(n), ' ', 1) $$;

create or replace function public.notify_on_publish() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record; c text;
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    select * into a from public.athletes where id = new.athlete_id;
    select full_name into c from public.people where id = coalesce(new.coach_id, a.coach_id);
    perform public.queue_family_email(new.athlete_id, 'report',
      public.first_name(a.full_name) || '''s ' || to_char(new.period, 'FMMonth YYYY') || ' report is ready',
      public.first_name(a.full_name) || '''s ' || to_char(new.period, 'FMMonth YYYY') || ' development report from '
        || coalesce(c, 'their coach') || ' is ready to read.');
    insert into public.audit_log (actor_id, action)
      values (public.me(), 'Published ' || to_char(new.period, 'FMMonth YYYY') || ' report — ' || a.full_name);
  end if;
  return new;
end $$;
create trigger assessments_notify after update on public.assessments
  for each row execute function public.notify_on_publish();

create or replace function public.notify_on_ask() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record; c text;
begin
  select * into a from public.athletes where id = new.athlete_id;
  select full_name into c from public.people where id = new.coach_id;
  perform public.queue_family_email(new.athlete_id, 'ask',
    coalesce(c, 'Your coach') || ' sent you a ' || lower(new.type),
    coalesce(c, 'Your coach') || ' sent a ' || lower(new.type) || ' about ' || public.first_name(a.full_name)
      || '. Sign in to read it and reply.');
  return new;
end $$;
create trigger asks_notify after insert on public.asks
  for each row execute function public.notify_on_ask();

create or replace function public.notify_on_meeting() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record; c text;
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    select * into a from public.athletes where id = new.athlete_id;
    select full_name into c from public.people where id = new.coach_id;
    perform public.queue_family_email(new.athlete_id, 'meeting',
      'Meeting confirmed: ' || to_char(new.starts_at at time zone 'America/Chicago', 'FMDay, FMMonth FMDD at FMHH12:MI AM'),
      'Your development meeting with ' || coalesce(c, 'your coach') || ' about ' || public.first_name(a.full_name)
        || ' is confirmed for ' || to_char(new.starts_at at time zone 'America/Chicago', 'FMDay, FMMonth FMDD at FMHH12:MI AM')
        || ' at The Forge, 1135 Lincoln Hwy, Rochelle.');
  end if;
  return new;
end $$;
create trigger meetings_notify after update on public.meetings
  for each row execute function public.notify_on_meeting();

-- Meetings: families can only book an open time with their athlete's own coach;
-- a requested time closes for everyone, and reopens if the coach declines.
create or replace function public.guard_meeting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not (public.is_admin() or public.coaches_athlete(new.athlete_id)) then
      if new.coach_id is distinct from (select coach_id from public.athletes where id = new.athlete_id) then
        raise exception 'Meetings are booked with your athlete''s assigned coach.';
      end if;
      if not exists (select 1 from public.availability
                     where coach_id = new.coach_id and starts_at = new.starts_at and open) then
        raise exception 'That time is no longer available. Pick another time.';
      end if;
      new.status := 'requested';
    end if;
    update public.availability set open = false where coach_id = new.coach_id and starts_at = new.starts_at;
  elsif new.status = 'declined' and old.status is distinct from 'declined' then
    update public.availability set open = true
      where coach_id = new.coach_id and starts_at = new.starts_at and starts_at > now();
  end if;
  return new;
end $$;
create trigger meetings_guard before insert or update on public.meetings
  for each row execute function public.guard_meeting();
create unique index meetings_one_per_slot on public.meetings (coach_id, starts_at)
  where status in ('requested','confirmed');

-- ==========================================================================
-- ROW-LEVEL SECURITY
-- ==========================================================================
alter table public.people            enable row level security;
alter table public.athletes          enable row level security;
alter table public.athlete_guardians enable row level security;
alter table public.assessments       enable row level security;
alter table public.assessment_notes  enable row level security;
alter table public.reflections       enable row level security;
alter table public.asks              enable row level security;
alter table public.availability      enable row level security;
alter table public.meetings          enable row level security;
alter table public.audit_log         enable row level security;
alter table public.notifications     enable row level security;

-- people
create policy people_read on public.people for select to authenticated using (
  id = public.me() or public.is_admin()
  or (public.me() is not null and (role in ('coach','admin')))
  or public.can_see_person(id));
create policy people_admin_insert on public.people for insert to authenticated with check (public.is_admin());
create policy people_update on public.people for update to authenticated
  using (id = public.me() or public.is_admin()) with check (id = public.me() or public.is_admin());
create policy people_admin_delete on public.people for delete to authenticated using (public.is_admin());

-- athletes
create policy athletes_read on public.athletes for select to authenticated using (public.can_see_athlete(id));
create policy athletes_admin_write on public.athletes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- athlete_guardians
create policy ag_read on public.athlete_guardians for select to authenticated using (
  guardian_id = public.me() or public.is_admin() or public.coaches_athlete(athlete_id) or public.guards_athlete(athlete_id));
create policy ag_admin_write on public.athlete_guardians for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- assessments
create policy assess_read on public.assessments for select to authenticated using (
  public.is_admin() or public.coaches_athlete(athlete_id)
  or (status = 'published' and public.guards_athlete(athlete_id)));
create policy assess_insert on public.assessments for insert to authenticated
  with check (public.is_admin() or public.coaches_athlete(athlete_id));
create policy assess_update on public.assessments for update to authenticated
  using (public.is_admin() or public.coaches_athlete(athlete_id))
  with check (public.is_admin() or public.coaches_athlete(athlete_id));
create policy assess_delete on public.assessments for delete to authenticated
  using (public.is_admin() and status <> 'published');

-- coach notes (staff only)
create policy notes_staff on public.assessment_notes for all to authenticated
  using (exists (select 1 from public.assessments a where a.id = assessment_id
                 and (public.is_admin() or public.coaches_athlete(a.athlete_id))))
  with check (exists (select 1 from public.assessments a where a.id = assessment_id
                 and (public.is_admin() or public.coaches_athlete(a.athlete_id))));

-- reflections
create policy refl_read on public.reflections for select to authenticated using (public.can_see_athlete(athlete_id));
create policy refl_insert on public.reflections for insert to authenticated
  with check (public.guards_athlete(athlete_id) and author_id = public.me());
create policy refl_ack on public.reflections for update to authenticated
  using (public.is_admin() or public.coaches_athlete(athlete_id))
  with check (public.is_admin() or public.coaches_athlete(athlete_id));

-- asks
create policy asks_read on public.asks for select to authenticated using (public.can_see_athlete(athlete_id));
create policy asks_insert on public.asks for insert to authenticated
  with check ((public.is_admin() or public.coaches_athlete(athlete_id)) and coach_id = public.me());
create policy asks_update on public.asks for update to authenticated
  using (public.can_see_athlete(athlete_id)) with check (public.can_see_athlete(athlete_id));

-- availability
create policy avail_read on public.availability for select to authenticated using (public.me() is not null);
create policy avail_write on public.availability for all to authenticated
  using (coach_id = public.me() or public.is_admin()) with check (coach_id = public.me() or public.is_admin());

-- meetings
create policy mtg_read on public.meetings for select to authenticated using (public.can_see_athlete(athlete_id));
create policy mtg_insert on public.meetings for insert to authenticated
  with check (public.can_see_athlete(athlete_id) and requested_by = public.me());
create policy mtg_update on public.meetings for update to authenticated
  using (public.is_admin() or public.coaches_athlete(athlete_id))
  with check (public.is_admin() or public.coaches_athlete(athlete_id));

-- audit log
create policy audit_insert on public.audit_log for insert to authenticated with check (actor_id = public.me());
create policy audit_read on public.audit_log for select to authenticated using (public.is_admin());

-- notifications (inserted only by the triggers above)
create policy notif_read on public.notifications for select to authenticated
  using (public.is_admin() or person_id = public.me());

-- Nothing is readable without signing in.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;
grant execute on function public.acknowledge_report(uuid) to authenticated;

-- ==========================================================================
-- FIRST ADMIN — edit the name and email, then run this line once.
-- ==========================================================================
-- insert into public.people (email, full_name, role, is_coach) values ('you@example.com', 'Your Name', 'admin', true);
