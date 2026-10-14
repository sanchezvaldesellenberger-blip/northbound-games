-- These tables are only accessible through the validated Edge Function.
create table public.nb_lb_runs (
  id uuid primary key default gen_random_uuid(),
  player_hash text not null check (player_hash ~ '^[a-f0-9]{64}$'),
  game text not null check (game in ('polaris-drift','aurora-stack','glacier-breaker','constellation','tundra-dash','halo-orbit')),
  started_at timestamptz not null default now(),
  used boolean not null default false
);
create index nb_lb_runs_time on public.nb_lb_runs (started_at);
create table public.nb_lb_limits (
  identity_hash text not null,
  hour timestamptz not null,
  count integer not null,
  primary key (identity_hash, hour)
);
create table public.nb_lb_scores (
  player_hash text not null,
  game text not null check (game in ('polaris-drift','aurora-stack','glacier-breaker','constellation','tundra-dash','halo-orbit')),
  nickname text not null check (nickname ~ '^[A-Za-z0-9][A-Za-z0-9 _-]{2,17}$' and nickname = btrim(nickname)),
  score integer not null check (score between 1 and 100000000),
  achieved_at timestamptz not null default now(),
  hidden boolean not null default false,
  primary key (player_hash, game)
);
create index nb_lb_score_order on public.nb_lb_scores (game, score desc, achieved_at, player_hash) where not hidden;
alter table public.nb_lb_runs enable row level security;
alter table public.nb_lb_limits enable row level security;
alter table public.nb_lb_scores enable row level security;
create policy nb_lb_runs_deny_browser on public.nb_lb_runs for all to anon, authenticated using (false) with check (false);
create policy nb_lb_limits_deny_browser on public.nb_lb_limits for all to anon, authenticated using (false) with check (false);
create policy nb_lb_scores_deny_browser on public.nb_lb_scores for all to anon, authenticated using (false) with check (false);
revoke all on public.nb_lb_runs, public.nb_lb_limits, public.nb_lb_scores from public, anon, authenticated;
grant all on public.nb_lb_runs, public.nb_lb_limits, public.nb_lb_scores to service_role;

create function public.nb_lb_start(p_player text, p_ip text, p_game text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare n integer; run uuid;
begin
  insert into public.nb_lb_limits values ('player:' || p_player, date_trunc('hour', now()), 1)
    on conflict (identity_hash, hour) do update set count = public.nb_lb_limits.count + 1 returning count into n;
  if n > 60 then raise exception 'rate_limit'; end if;
  insert into public.nb_lb_limits values ('network:' || p_ip, date_trunc('hour', now()), 1)
    on conflict (identity_hash, hour) do update set count = public.nb_lb_limits.count + 1 returning count into n;
  if n > 240 then raise exception 'rate_limit'; end if;
  delete from public.nb_lb_runs where started_at < now() - interval '1 day';
  delete from public.nb_lb_limits where hour < now() - interval '1 day';
  insert into public.nb_lb_runs (player_hash, game) values (p_player, p_game) returning id into run;
  return run;
end;
$$;

create function public.nb_lb_submit(p_player text, p_game text, p_run uuid, p_name text, p_score integer, p_duration integer)
returns table (best integer) language plpgsql security invoker set search_path = '' as $$
declare ticket public.nb_lb_runs;
begin
  select * into ticket from public.nb_lb_runs where id = p_run for update;
  if not found or ticket.used or ticket.player_hash <> p_player or ticket.game <> p_game
    or ticket.started_at < now() - interval '1 day'
    or p_duration > extract(epoch from (now() - ticket.started_at)) * 1000 + 5000
    or p_duration < 100 or p_duration > 10800000 then raise exception 'invalid_run'; end if;
  update public.nb_lb_runs set used = true where id = p_run;
  insert into public.nb_lb_scores (player_hash, game, nickname, score) values (p_player, p_game, p_name, p_score)
    on conflict (player_hash, game) do update set nickname = excluded.nickname, score = excluded.score, achieved_at = now()
    where excluded.score > public.nb_lb_scores.score;
  return query select s.score from public.nb_lb_scores s where s.player_hash = p_player and s.game = p_game;
end;
$$;

create function public.nb_lb_read(p_game text)
returns table (rank bigint, name text, score integer, achieved_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select row_number() over (order by s.score desc, s.achieved_at, s.player_hash), s.nickname, s.score, s.achieved_at
  from public.nb_lb_scores s where s.game = p_game and not s.hidden
  order by s.score desc, s.achieved_at, s.player_hash limit 25;
$$;
revoke all on function public.nb_lb_start(text,text,text), public.nb_lb_submit(text,text,uuid,text,integer,integer), public.nb_lb_read(text) from public, anon, authenticated;
grant execute on function public.nb_lb_start(text,text,text), public.nb_lb_submit(text,text,uuid,text,integer,integer), public.nb_lb_read(text) to service_role;
