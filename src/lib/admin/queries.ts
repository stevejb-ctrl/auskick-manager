import type { createAdminClient } from "@/lib/supabase/admin";
import type {
  ContactNote,
  ContactPreference,
  ContactTag,
  Game,
  GameStatus,
  Profile,
  TeamRole,
} from "@/lib/types";

// Admin-only cross-tenant queries. Every function takes an admin client
// (createAdminClient) — they bypass RLS, so only call from routes/actions
// that have already passed requireSuperAdmin(). Typed rows come back via
// the explicit return interfaces below, not via the client generics.
type Admin = ReturnType<typeof createAdminClient>;

const PAGE_SIZE = 25;

// ─── Shape types returned to pages ────────────────────────────

export interface AdminKPIs {
  users: { total: number; new7d: number; new30d: number };
  teams: { total: number; new30d: number };
  games: {
    total: number;
    inProgress: number;
    completed7d: number;
    upcoming7d: number;
  };
  players: { activeTotal: number };
}

export interface SignupRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  team_count: number;
}

export interface TeamRow {
  id: string;
  name: string;
  age_group: string;
  admin_email: string | null;
  member_count: number;
  player_count: number;
  created_at: string;
}

export interface ActiveTeamRow {
  team_id: string;
  name: string;
  event_count: number;
}

export interface CompletedGameRow {
  id: string;
  team_id: string;
  team_name: string;
  opponent: string;
  scheduled_at: string;
}

export interface UserListFilters {
  q?: string;
  tagIds?: string[];
  signupRange?: "7d" | "30d" | "90d" | "all";
  cursor?: number;
}

export interface UserListRow extends SignupRow {
  tags: ContactTag[];
  unsubscribed: boolean;
}

export interface UserListPage {
  rows: UserListRow[];
  nextCursor: number | null;
  total: number;
}

export interface TeamListFilters {
  q?: string;
  cursor?: number;
}

export interface TeamListPage {
  rows: TeamRow[];
  nextCursor: number | null;
  total: number;
}

export interface GameListFilters {
  status?: GameStatus | "all";
  cursor?: number;
}

export interface GameListRow {
  id: string;
  team_id: string;
  team_name: string;
  opponent: string;
  scheduled_at: string;
  status: GameStatus;
  round_number: number | null;
}

export interface GameListPage {
  rows: GameListRow[];
  nextCursor: number | null;
  total: number;
}

export interface UserDetailMembership {
  team_id: string;
  team_name: string;
  role: TeamRole;
  joined_at: string;
}

export interface UserDetail {
  profile: Profile;
  memberships: UserDetailMembership[];
  tags: ContactTag[];
  notes: ContactNote[];
  preference: ContactPreference | null;
}

// ─── Helpers ──────────────────────────────────────────────────

function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function daysAhead(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── KPIs ─────────────────────────────────────────────────────

export async function getKPIs(admin: Admin): Promise<AdminKPIs> {
  const iso7 = daysAgo(7);
  const iso30 = daysAgo(30);
  const iso7Ahead = daysAhead(7);
  const now = nowIso();

  const [
    usersTotal,
    users7,
    users30,
    teamsTotal,
    teams30,
    gamesTotal,
    gamesInProgress,
    gamesCompleted7,
    gamesUpcoming7,
    activePlayers,
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", iso7),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", iso30),
    admin.from("teams").select("id", { count: "exact", head: true }),
    admin
      .from("teams")
      .select("id", { count: "exact", head: true })
      .gte("created_at", iso30),
    admin.from("games").select("id", { count: "exact", head: true }),
    admin
      .from("games")
      .select("id", { count: "exact", head: true })
      .eq("status", "in_progress"),
    admin
      .from("games")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("scheduled_at", iso7),
    admin
      .from("games")
      .select("id", { count: "exact", head: true })
      .eq("status", "upcoming")
      .gte("scheduled_at", now)
      .lte("scheduled_at", iso7Ahead),
    admin
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ]);

  return {
    users: {
      total: usersTotal.count ?? 0,
      new7d: users7.count ?? 0,
      new30d: users30.count ?? 0,
    },
    teams: {
      total: teamsTotal.count ?? 0,
      new30d: teams30.count ?? 0,
    },
    games: {
      total: gamesTotal.count ?? 0,
      inProgress: gamesInProgress.count ?? 0,
      completed7d: gamesCompleted7.count ?? 0,
      upcoming7d: gamesUpcoming7.count ?? 0,
    },
    players: { activeTotal: activePlayers.count ?? 0 },
  };
}

// ─── Overview lists ───────────────────────────────────────────

export async function getRecentSignups(
  admin: Admin,
  limit = 20
): Promise<SignupRow[]> {
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (profiles ?? []) as Array<
    Pick<Profile, "id" | "email" | "full_name" | "created_at">
  >;
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const { data: memberships } = await admin
    .from("team_memberships")
    .select("user_id")
    .in("user_id", ids);

  const counts = new Map<string, number>();
  for (const m of (memberships ?? []) as Array<{ user_id: string }>) {
    counts.set(m.user_id, (counts.get(m.user_id) ?? 0) + 1);
  }

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    full_name: r.full_name,
    created_at: r.created_at,
    team_count: counts.get(r.id) ?? 0,
  }));
}

export async function getRecentTeams(
  admin: Admin,
  limit = 10
): Promise<TeamRow[]> {
  const { data: teams } = await admin
    .from("teams")
    .select("id, name, age_group, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return enrichTeams(admin, (teams ?? []) as RawTeam[]);
}

interface RawTeam {
  id: string;
  name: string;
  age_group: string;
  created_by: string;
  created_at: string;
}

async function enrichTeams(admin: Admin, teams: RawTeam[]): Promise<TeamRow[]> {
  if (teams.length === 0) return [];

  const ids = teams.map((t) => t.id);
  const creatorIds = Array.from(new Set(teams.map((t) => t.created_by)));

  const [memberships, players, creators] = await Promise.all([
    admin.from("team_memberships").select("team_id, user_id, role").in("team_id", ids),
    admin
      .from("players")
      .select("team_id")
      .in("team_id", ids)
      .eq("is_active", true),
    admin.from("profiles").select("id, email").in("id", creatorIds),
  ]);

  const memberCount = new Map<string, number>();
  const adminEmails = new Map<string, string>();
  const creatorEmail = new Map<string, string>();

  for (const c of (creators.data ?? []) as Array<{ id: string; email: string }>) {
    creatorEmail.set(c.id, c.email);
  }

  const adminMemberships = new Map<string, string>(); // team_id -> user_id
  for (const m of (memberships.data ?? []) as Array<{
    team_id: string;
    user_id: string;
    role: TeamRole;
  }>) {
    memberCount.set(m.team_id, (memberCount.get(m.team_id) ?? 0) + 1);
    if (m.role === "admin" && !adminMemberships.has(m.team_id)) {
      adminMemberships.set(m.team_id, m.user_id);
    }
  }

  // Fetch admin emails in one hit for any admins we haven't already seen.
  const adminUserIds = Array.from(new Set(adminMemberships.values())).filter(
    (id) => !creatorEmail.has(id)
  );
  if (adminUserIds.length > 0) {
    const { data: adminRows } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", adminUserIds);
    for (const r of (adminRows ?? []) as Array<{ id: string; email: string }>) {
      creatorEmail.set(r.id, r.email);
    }
  }
  adminMemberships.forEach((userId, teamId) => {
    const em = creatorEmail.get(userId);
    if (em) adminEmails.set(teamId, em);
  });

  const playerCount = new Map<string, number>();
  for (const p of (players.data ?? []) as Array<{ team_id: string }>) {
    playerCount.set(p.team_id, (playerCount.get(p.team_id) ?? 0) + 1);
  }

  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    age_group: t.age_group,
    admin_email: adminEmails.get(t.id) ?? creatorEmail.get(t.created_by) ?? null,
    member_count: memberCount.get(t.id) ?? 0,
    player_count: playerCount.get(t.id) ?? 0,
    created_at: t.created_at,
  }));
}

export async function getMostActiveTeams(
  admin: Admin,
  days = 30,
  limit = 5
): Promise<ActiveTeamRow[]> {
  // Event activity in the last N days: pull game_events -> map to games ->
  // aggregate by team_id. No server-side group-by in the supabase-js client,
  // so we do it in memory. Event volume across a whole org stays small.
  const since = daysAgo(days);
  const { data: events } = await admin
    .from("game_events")
    .select("game_id")
    .gte("created_at", since);

  const gameIds = Array.from(
    new Set(((events ?? []) as Array<{ game_id: string }>).map((e) => e.game_id))
  );
  if (gameIds.length === 0) return [];

  const { data: games } = await admin
    .from("games")
    .select("id, team_id")
    .in("id", gameIds);

  const gameToTeam = new Map<string, string>();
  for (const g of (games ?? []) as Array<{ id: string; team_id: string }>) {
    gameToTeam.set(g.id, g.team_id);
  }

  const perTeam = new Map<string, number>();
  for (const e of (events ?? []) as Array<{ game_id: string }>) {
    const teamId = gameToTeam.get(e.game_id);
    if (!teamId) continue;
    perTeam.set(teamId, (perTeam.get(teamId) ?? 0) + 1);
  }

  const teamIds = Array.from(perTeam.keys());
  if (teamIds.length === 0) return [];

  const { data: teams } = await admin
    .from("teams")
    .select("id, name")
    .in("id", teamIds);

  const teamName = new Map<string, string>();
  for (const t of (teams ?? []) as Array<{ id: string; name: string }>) {
    teamName.set(t.id, t.name);
  }

  return Array.from(perTeam.entries())
    .map(([team_id, event_count]) => ({
      team_id,
      name: teamName.get(team_id) ?? "—",
      event_count,
    }))
    .sort((a, b) => b.event_count - a.event_count)
    .slice(0, limit);
}

export async function getRecentCompletedGames(
  admin: Admin,
  limit = 10
): Promise<CompletedGameRow[]> {
  const { data: games } = await admin
    .from("games")
    .select("id, team_id, opponent, scheduled_at")
    .eq("status", "completed")
    .order("scheduled_at", { ascending: false })
    .limit(limit);

  const rows = (games ?? []) as Array<
    Pick<Game, "id" | "team_id" | "opponent" | "scheduled_at">
  >;
  if (rows.length === 0) return [];

  const teamIds = Array.from(new Set(rows.map((r) => r.team_id)));
  const { data: teams } = await admin
    .from("teams")
    .select("id, name")
    .in("id", teamIds);
  const teamName = new Map<string, string>();
  for (const t of (teams ?? []) as Array<{ id: string; name: string }>) {
    teamName.set(t.id, t.name);
  }

  return rows.map((r) => ({
    id: r.id,
    team_id: r.team_id,
    team_name: teamName.get(r.team_id) ?? "—",
    opponent: r.opponent,
    scheduled_at: r.scheduled_at,
  }));
}

// ─── Paginated lists ─────────────────────────────────────────

export async function listUsers(
  admin: Admin,
  filters: UserListFilters
): Promise<UserListPage> {
  const cursor = filters.cursor ?? 0;
  const from = cursor;
  const to = cursor + PAGE_SIZE - 1;

  let profileIds: string[] | null = null;

  if (filters.tagIds && filters.tagIds.length > 0) {
    const { data: tagged } = await admin
      .from("profile_tags")
      .select("profile_id, tag_id")
      .in("tag_id", filters.tagIds);
    // Intersection: a profile must have ALL selected tags.
    const perProfile = new Map<string, Set<string>>();
    for (const r of (tagged ?? []) as Array<{
      profile_id: string;
      tag_id: string;
    }>) {
      const set = perProfile.get(r.profile_id) ?? new Set<string>();
      set.add(r.tag_id);
      perProfile.set(r.profile_id, set);
    }
    const matches: string[] = [];
    const required = filters.tagIds;
    perProfile.forEach((set, pid) => {
      if (required.every((t) => set.has(t))) matches.push(pid);
    });
    profileIds = matches;
    if (profileIds.length === 0) {
      return { rows: [], nextCursor: null, total: 0 };
    }
  }

  let query = admin
    .from("profiles")
    .select("id, email, full_name, created_at, is_super_admin", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.q && filters.q.trim().length > 0) {
    const q = filters.q.trim();
    query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
  }
  if (filters.signupRange && filters.signupRange !== "all") {
    const days =
      filters.signupRange === "7d"
        ? 7
        : filters.signupRange === "30d"
          ? 30
          : 90;
    query = query.gte("created_at", daysAgo(days));
  }
  if (profileIds) {
    query = query.in("id", profileIds);
  }

  const { data: profiles, count } = await query;
  const rows = (profiles ?? []) as Array<
    Pick<Profile, "id" | "email" | "full_name" | "created_at">
  >;
  if (rows.length === 0) {
    return { rows: [], nextCursor: null, total: count ?? 0 };
  }

  const ids = rows.map((r) => r.id);

  const [memberships, tagJoins, allTags, prefs] = await Promise.all([
    admin.from("team_memberships").select("user_id").in("user_id", ids),
    admin
      .from("profile_tags")
      .select("profile_id, tag_id")
      .in("profile_id", ids),
    admin.from("contact_tags").select("*"),
    admin
      .from("contact_preferences")
      .select("profile_id, unsubscribed_at")
      .in("profile_id", ids),
  ]);

  const teamCount = new Map<string, number>();
  for (const m of (memberships.data ?? []) as Array<{ user_id: string }>) {
    teamCount.set(m.user_id, (teamCount.get(m.user_id) ?? 0) + 1);
  }

  const tagsById = new Map<string, ContactTag>();
  for (const t of (allTags.data ?? []) as ContactTag[]) tagsById.set(t.id, t);

  const tagsFor = new Map<string, ContactTag[]>();
  for (const tj of (tagJoins.data ?? []) as Array<{
    profile_id: string;
    tag_id: string;
  }>) {
    const tag = tagsById.get(tj.tag_id);
    if (!tag) continue;
    const arr = tagsFor.get(tj.profile_id) ?? [];
    arr.push(tag);
    tagsFor.set(tj.profile_id, arr);
  }

  const unsub = new Map<string, boolean>();
  for (const p of (prefs.data ?? []) as Array<{
    profile_id: string;
    unsubscribed_at: string | null;
  }>) {
    unsub.set(p.profile_id, p.unsubscribed_at !== null);
  }

  const total = count ?? rows.length;
  const nextCursor = from + rows.length < total ? from + rows.length : null;

  return {
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      full_name: r.full_name,
      created_at: r.created_at,
      team_count: teamCount.get(r.id) ?? 0,
      tags: tagsFor.get(r.id) ?? [],
      unsubscribed: unsub.get(r.id) ?? false,
    })),
    nextCursor,
    total,
  };
}

export async function listTeams(
  admin: Admin,
  filters: TeamListFilters
): Promise<TeamListPage> {
  const cursor = filters.cursor ?? 0;
  const from = cursor;
  const to = cursor + PAGE_SIZE - 1;

  let query = admin
    .from("teams")
    .select("id, name, age_group, created_by, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.q && filters.q.trim().length > 0) {
    query = query.ilike("name", `%${filters.q.trim()}%`);
  }

  const { data: teams, count } = await query;
  const enriched = await enrichTeams(admin, (teams ?? []) as RawTeam[]);
  const total = count ?? enriched.length;
  const nextCursor = from + enriched.length < total ? from + enriched.length : null;
  return { rows: enriched, nextCursor, total };
}

export async function listGames(
  admin: Admin,
  filters: GameListFilters
): Promise<GameListPage> {
  const cursor = filters.cursor ?? 0;
  const from = cursor;
  const to = cursor + PAGE_SIZE - 1;

  let query = admin
    .from("games")
    .select("id, team_id, opponent, scheduled_at, status, round_number", {
      count: "exact",
    })
    .order("scheduled_at", { ascending: false })
    .range(from, to);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  const { data: games, count } = await query;
  const rows = (games ?? []) as Array<{
    id: string;
    team_id: string;
    opponent: string;
    scheduled_at: string;
    status: GameStatus;
    round_number: number | null;
  }>;
  if (rows.length === 0) {
    return { rows: [], nextCursor: null, total: count ?? 0 };
  }

  const teamIds = Array.from(new Set(rows.map((r) => r.team_id)));
  const { data: teams } = await admin
    .from("teams")
    .select("id, name")
    .in("id", teamIds);
  const teamName = new Map<string, string>();
  for (const t of (teams ?? []) as Array<{ id: string; name: string }>) {
    teamName.set(t.id, t.name);
  }

  const total = count ?? rows.length;
  const nextCursor = from + rows.length < total ? from + rows.length : null;

  return {
    rows: rows.map((r) => ({
      id: r.id,
      team_id: r.team_id,
      team_name: teamName.get(r.team_id) ?? "—",
      opponent: r.opponent,
      scheduled_at: r.scheduled_at,
      status: r.status,
      round_number: r.round_number,
    })),
    nextCursor,
    total,
  };
}

// ─── User detail ──────────────────────────────────────────────

export async function getUserDetail(
  admin: Admin,
  profileId: string
): Promise<UserDetail | null> {
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile) return null;

  const [memberships, tagJoins, allTags, notes, preference] = await Promise.all([
    admin
      .from("team_memberships")
      .select("team_id, role, created_at")
      .eq("user_id", profileId),
    admin.from("profile_tags").select("tag_id").eq("profile_id", profileId),
    admin.from("contact_tags").select("*"),
    admin
      .from("contact_notes")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false }),
    admin
      .from("contact_preferences")
      .select("*")
      .eq("profile_id", profileId)
      .maybeSingle(),
  ]);

  const memRows = (memberships.data ?? []) as Array<{
    team_id: string;
    role: TeamRole;
    created_at: string;
  }>;
  const teamIds = memRows.map((m) => m.team_id);
  const { data: teams } = teamIds.length
    ? await admin.from("teams").select("id, name").in("id", teamIds)
    : { data: [] as Array<{ id: string; name: string }> };
  const teamName = new Map<string, string>();
  for (const t of (teams ?? []) as Array<{ id: string; name: string }>) {
    teamName.set(t.id, t.name);
  }

  const tagsById = new Map<string, ContactTag>();
  for (const t of (allTags.data ?? []) as ContactTag[]) tagsById.set(t.id, t);
  const assignedTagIds = (tagJoins.data ?? []) as Array<{ tag_id: string }>;
  const tags = assignedTagIds
    .map((r) => tagsById.get(r.tag_id))
    .filter((t): t is ContactTag => Boolean(t));

  return {
    profile: profile as Profile,
    memberships: memRows.map((m) => ({
      team_id: m.team_id,
      team_name: teamName.get(m.team_id) ?? "—",
      role: m.role,
      joined_at: m.created_at,
    })),
    tags,
    notes: (notes.data ?? []) as ContactNote[],
    preference: (preference.data as ContactPreference | null) ?? null,
  };
}

export async function listAllTags(admin: Admin): Promise<ContactTag[]> {
  const { data } = await admin
    .from("contact_tags")
    .select("*")
    .order("name", { ascending: true });
  return (data ?? []) as ContactTag[];
}
