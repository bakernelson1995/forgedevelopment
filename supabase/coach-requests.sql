-- ==========================================================================
-- COACH SELECTION BY FAMILIES  (run after schema.sql)
-- A family picks a coach for an athlete who doesn't have one (or asks to
-- switch). The coach gets an email, then accepts or declines in the portal.
-- Accepting assigns the athlete; the family gets an email either way.
-- ==========================================================================

-- Coach profile shown to families
alter table public.people
  add column if not exists specialties text,
  add column if not exists bio text,
  add column if not exists accepting boolean not null default true;

create table if not exists public.coach_requests (
  id              uuid primary key default gen_random_uuid(),
  athlete_id      uuid not null references public.athletes(id) on delete cascade,
  coach_id        uuid not null references public.people(id) on delete cascade,
  requested_by    uuid references public.people(id) on delete set null,
  requester_name  text,
  note            text,
  status          text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid references public.people(id) on delete set null
);
create unique index if not exists coach_requests_one_pending on public.coach_requests (athlete_id) where status = 'pending';

create or replace function public.is_coach_person(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.people where id = pid and active and (role = 'coach' or (role = 'admin' and is_coach)))
$$;

-- A coach can see the basic athlete record while that athlete's request to them is pending.
create or replace function public.requested_of_me(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coach_requests where athlete_id = aid and coach_id = public.me() and status = 'pending')
$$;

create or replace function public.guard_coach_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_coach_person(new.coach_id) then raise exception 'Pick one of the Forge coaches.'; end if;
    if new.coach_id = (select coach_id from public.athletes where id = new.athlete_id) then
      raise exception 'That coach is already your athlete''s coach.';
    end if;
    new.status := 'pending'; new.decided_at := null; new.decided_by := null;
    new.requester_name := (select full_name from public.people where id = new.requested_by);
    return new;
  end if;
  if new.coach_id is distinct from old.coach_id or new.athlete_id is distinct from old.athlete_id then
    raise exception 'Requests can''t be redirected. Withdraw it and send a new one.';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'pending' then raise exception 'This request has already been answered.'; end if;
    if new.status in ('accepted','declined') and not (public.is_admin() or new.coach_id = public.me()) then
      raise exception 'Only that coach or an administrator can answer this request.';
    end if;
    if new.status = 'withdrawn' and not (public.is_admin() or public.guards_athlete(new.athlete_id)) then
      raise exception 'Only the family or an administrator can withdraw this request.';
    end if;
    new.decided_at := now(); new.decided_by := public.me();
  end if;
  return new;
end $$;
drop trigger if exists coach_requests_guard on public.coach_requests;
create trigger coach_requests_guard before insert or update on public.coach_requests
  for each row execute function public.guard_coach_request();

create or replace function public.after_coach_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record; c record;
begin
  select * into a from public.athletes where id = new.athlete_id;
  select * into c from public.people where id = new.coach_id;
  if tg_op = 'INSERT' then
    -- Email the coach: new athlete application
    insert into public.notifications (person_id, athlete_id, kind, channel, address, subject, body)
    select c.id, a.id, 'coach_request', 'email', c.email,
      'New athlete application: ' || a.full_name,
      coalesce(new.requester_name, 'A Forge family') || ' has applied for you to coach ' || a.full_name
        || ' (' || a.primary_style || ', ' || a.affiliation || ').'
        || coalesce(' Their note: "' || nullif(trim(new.note), '') || '"', '')
        || ' Sign in to the athlete portal to accept or decline.'
    where c.active and c.notify_email;
    insert into public.audit_log (actor_id, action)
      values (public.me(), 'Coach request — ' || a.full_name || ' → ' || c.full_name);
  elsif new.status = 'accepted' and old.status = 'pending' then
    update public.athletes set coach_id = new.coach_id where id = new.athlete_id;
    perform public.queue_family_email(a.id, 'coach_request',
      c.full_name || ' is now ' || public.first_name(a.full_name) || '''s coach',
      c.full_name || ' accepted your request and is now ' || public.first_name(a.full_name) || '''s primary coach at The Forge.');
    insert into public.audit_log (actor_id, action)
      values (public.me(), 'Accepted coach request — ' || a.full_name || ' → ' || c.full_name);
  elsif new.status = 'declined' and old.status = 'pending' then
    perform public.queue_family_email(a.id, 'coach_request',
      'Update on your coach request for ' || public.first_name(a.full_name),
      c.full_name || ' isn''t able to take on ' || public.first_name(a.full_name)
        || ' right now. Sign in to choose another Forge coach.');
    insert into public.audit_log (actor_id, action)
      values (public.me(), 'Declined coach request — ' || a.full_name || ' → ' || c.full_name);
  end if;
  return new;
end $$;
drop trigger if exists coach_requests_after on public.coach_requests;
create trigger coach_requests_after after insert or update on public.coach_requests
  for each row execute function public.after_coach_request();

alter table public.coach_requests enable row level security;
drop policy if exists cr_read on public.coach_requests;
create policy cr_read on public.coach_requests for select to authenticated
  using (public.is_admin() or coach_id = public.me() or public.guards_athlete(athlete_id));
drop policy if exists cr_insert on public.coach_requests;
create policy cr_insert on public.coach_requests for insert to authenticated
  with check ((public.guards_athlete(athlete_id) or public.is_admin()) and requested_by = public.me());
drop policy if exists cr_update on public.coach_requests;
create policy cr_update on public.coach_requests for update to authenticated
  using (public.is_admin() or coach_id = public.me() or public.guards_athlete(athlete_id))
  with check (public.is_admin() or coach_id = public.me() or public.guards_athlete(athlete_id));
drop policy if exists athletes_read_requested on public.athletes;
create policy athletes_read_requested on public.athletes for select to authenticated
  using (public.requested_of_me(id));

revoke all on public.coach_requests from anon;
revoke execute on function public.is_coach_person(uuid), public.requested_of_me(uuid),
  public.guard_coach_request(), public.after_coach_request() from public, anon, authenticated;
grant execute on function public.requested_of_me(uuid) to authenticated;
