// An in-memory stand-in for the Supabase client, enough of the query
// builder for the live server actions: select / insert / update /
// upsert / delete, eq / neq / in / is filters, order, limit, single /
// maybeSingle, and exact counts. game_events gets an id, a created_at
// that always moves forward, and the unique idempotency_key the real
// table has (23505 on a replay).
//
// Not a test file (no .test.ts): liveActionsTwoPhones.test.ts uses it.

type Row = Record<string, unknown>;

export interface FakeDb {
  tables: Record<string, Row[]>;
  client: FakeClient;
  /** Rows of one table, in insert order. */
  rows(table: string): Row[];
}

type Filter = (row: Row) => boolean;

interface Result {
  data: unknown;
  error: { code?: string; message: string } | null;
  count?: number | null;
}

let clock = Date.parse("2026-10-24T09:00:00.000Z");
let seq = 0;

function nextStamp(): string {
  clock += 1000;
  return new Date(clock).toISOString();
}

function nextId(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
}

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private orders: { col: string; ascending: boolean }[] = [];
  private limitN: number | null = null;
  private mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private singleMode: "one" | "maybe" | null = null;
  private countMode: "exact" | null = null;
  private head = false;
  private returning = false;

  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, opts?: { count?: "exact"; head?: boolean }) {
    if (this.mode === "select") this.mode = "select";
    else this.returning = true;
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], _opts?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row) {
    this.mode = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== v);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  is(col: string, v: unknown) {
    this.filters.push((r) => (r[col] ?? null) === v);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, ascending: opts?.ascending ?? true });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  singleRow() {
    this.singleMode = "one";
    return this;
  }

  private run(): Result {
    const all = this.db.rows(this.table);
    const match = (r: Row) => this.filters.every((f) => f(r));
    if (this.mode === "insert" || this.mode === "upsert") {
      const added: Row[] = [];
      for (const raw of this.payload) {
        const row: Row = { ...raw };
        if (this.table === "game_events") {
          const key = row.idempotency_key;
          if (key && all.some((r) => r.idempotency_key === key)) {
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
          row.id ??= nextId();
          row.created_at ??= nextStamp();
          row.player_id ??= null;
          row.idempotency_key ??= null;
        }
        if (this.mode === "upsert" && "game_id" in row) {
          const i = all.findIndex((r) => r.game_id === row.game_id);
          if (i >= 0) {
            all[i] = { ...all[i], ...row };
            added.push(all[i]);
            continue;
          }
        }
        all.push(row);
        added.push(row);
      }
      return this.shape(added);
    }
    if (this.mode === "update") {
      const hit = all.filter(match);
      for (const r of hit) Object.assign(r, this.patch);
      return this.shape(hit);
    }
    if (this.mode === "delete") {
      const keep = all.filter((r) => !match(r));
      const gone = all.length - keep.length;
      all.splice(0, all.length, ...keep);
      return { data: null, error: null, count: gone };
    }
    let out = all.filter(match);
    for (const o of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => {
        const x = String(a[o.col] ?? "");
        const y = String(b[o.col] ?? "");
        return o.ascending ? x.localeCompare(y) : y.localeCompare(x);
      });
    }
    const count = this.countMode ? out.length : null;
    if (this.limitN !== null) out = out.slice(0, this.limitN);
    if (this.head) return { data: null, error: null, count };
    return { ...this.shape(out), count };
  }

  private shape(rows: Row[]): Result {
    if (this.singleMode) {
      if (rows.length === 0) {
        return this.singleMode === "maybe"
          ? { data: null, error: null }
          : { data: null, error: { code: "PGRST116", message: "no rows" } };
      }
      return { data: { ...rows[0] }, error: null };
    }
    if ((this.mode === "insert" || this.mode === "update" || this.mode === "upsert") && !this.returning) {
      return { data: null, error: null };
    }
    return { data: rows.map((r) => ({ ...r })), error: null };
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }
}

export interface FakeClient {
  from(table: string): Query & { single(): Query };
}

export function makeFakeDb(seed: Record<string, Row[]> = {}): FakeDb {
  const tables: Record<string, Row[]> = {};
  const db: FakeDb = {
    tables,
    rows(table: string) {
      tables[table] ??= [];
      return tables[table];
    },
    client: {
      from(table: string) {
        const q = new Query(db, table) as Query & { single(): Query };
        // `.single()` is a builder call here, as in supabase-js.
        q.single = () => q.singleRow();
        return q;
      },
    },
  };
  for (const [t, rows] of Object.entries(seed)) {
    for (const r of rows) {
      const row = { ...r };
      if (t === "game_events") {
        row.id ??= nextId();
        row.created_at ??= nextStamp();
        row.player_id ??= null;
        row.idempotency_key ??= null;
      }
      db.rows(t).push(row);
    }
  }
  return db;
}
