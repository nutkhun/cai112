// Cloudflare backend client.
// This file keeps the same import path and export name that the rest of the app
// already uses, but every call now goes to the Pages Functions in /functions/api,
// which read and write Cloudflare D1 (database) and R2 (file storage).
// Import it exactly as before:
//   import { supabase } from "@/integrations/supabase/client";

type Row = Record<string, any>;
type Filter = { col: string; op: string; val: any };
type ApiResult = { data: any; count: number | null; error: any };

const POLL_MS = 3000;

function fail(message: string, code?: string) {
  return { message: message, details: '', hint: '', code: code || 'CF_ERROR' };
}

async function callDb(payload: Row): Promise<ApiResult> {
  try {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    let body: any = {};
    try { body = await response.json(); } catch (err) { body = {}; }
    if (!response.ok || (body && body.error)) {
      return { data: null, count: null, error: fail((body && body.error) || ('Request failed: ' + response.status)) };
    }
    return { data: body.data, count: body.count === undefined ? null : body.count, error: null };
  } catch (err: any) {
    return { data: null, count: null, error: fail((err && err.message) || 'Network error') };
  }
}

function encodeKey(path: string) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

class Query {
  private table: string;
  private op: string = 'select';
  private opLocked: boolean = false;
  private columns: string | null = null;
  private filters: Filter[] = [];
  private orders: { col: string; ascending: boolean }[] = [];
  private limitTo: number | null = null;
  private wantCount: boolean = false;
  private headOnly: boolean = false;
  private rows: Row[] = [];
  private values: Row = {};
  private conflict: string | null = null;
  private shape: string = 'many';

  constructor(table: string) {
    this.table = table;
  }

  select(columns?: string, options?: any) {
    if (this.opLocked) return this;
    this.columns = columns === undefined ? '*' : columns;
    if (options && options.count) this.wantCount = true;
    if (options && options.head) this.headOnly = true;
    return this;
  }

  insert(rows: any) {
    this.op = 'insert';
    this.opLocked = true;
    this.rows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  upsert(rows: any, options?: any) {
    this.op = 'upsert';
    this.opLocked = true;
    this.rows = Array.isArray(rows) ? rows : [rows];
    this.conflict = (options && options.onConflict) || 'id';
    return this;
  }

  update(values: Row) {
    this.op = 'update';
    this.opLocked = true;
    this.values = values || {};
    return this;
  }

  delete() {
    this.op = 'delete';
    this.opLocked = true;
    return this;
  }

  private add(col: string, op: string, val: any) {
    this.filters.push({ col: col, op: op, val: val });
    return this;
  }

  eq(col: string, val: any) { return this.add(col, 'eq', val); }
  neq(col: string, val: any) { return this.add(col, 'neq', val); }
  gt(col: string, val: any) { return this.add(col, 'gt', val); }
  gte(col: string, val: any) { return this.add(col, 'gte', val); }
  lt(col: string, val: any) { return this.add(col, 'lt', val); }
  lte(col: string, val: any) { return this.add(col, 'lte', val); }
  like(col: string, val: any) { return this.add(col, 'like', val); }
  ilike(col: string, val: any) { return this.add(col, 'ilike', val); }
  is(col: string, val: any) { return this.add(col, 'is', val); }
  in(col: string, val: any[]) { return this.add(col, 'in', val); }
  or(expression: string) { return this.add('or', 'or', expression); }
  filter(col: string, op: string, val: any) { return this.add(col, op, val); }
  contains(col: string, val: any) { return this.add(col, 'like', '%' + String(val) + '%'); }

  // Only the common not('col', 'is', null) shape is needed here.
  not(col: string, _op: string, val: any) { return this.add(col, 'neq', val); }

  match(query: Row) {
    const keys = Object.keys(query || {});
    for (const key of keys) this.add(key, 'eq', query[key]);
    return this;
  }

  order(col: string, options?: any) {
    this.orders.push({ col: col, ascending: !(options && options.ascending === false) });
    return this;
  }

  limit(n: number) { this.limitTo = n; return this; }
  range(from: number, to: number) { this.limitTo = to - from + 1; return this; }
  single() { this.shape = 'single'; return this; }
  maybeSingle() { this.shape = 'maybe'; return this; }

  private async run(): Promise<any> {
    const payload: Row = { table: this.table, op: this.op };
    if (this.op === 'select') {
      payload.columns = this.columns === null ? '*' : this.columns;
      payload.order = this.orders;
      payload.limit = this.limitTo;
      payload.count = this.wantCount;
      payload.head = this.headOnly;
    }
    if (this.op === 'insert' || this.op === 'upsert') {
      payload.rows = this.rows;
      payload.onConflict = this.conflict;
    }
    if (this.op === 'update') payload.values = this.values;
    if (this.op !== 'insert' && this.op !== 'upsert') payload.filters = this.filters;

    const result = await callDb(payload);
    if (result.error) {
      return { data: null, error: result.error, count: null, status: 400, statusText: 'Error' };
    }
    if (this.headOnly) {
      return { data: null, error: null, count: result.count, status: 200, statusText: 'OK' };
    }
    const list = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : []);
    if (this.shape === 'single') {
      if (list.length === 0) {
        return { data: null, error: fail('No rows returned', 'PGRST116'), count: 0, status: 406, statusText: 'Not Acceptable' };
      }
      return { data: list[0], error: null, count: result.count, status: 200, statusText: 'OK' };
    }
    if (this.shape === 'maybe') {
      return { data: list.length > 0 ? list[0] : null, error: null, count: result.count, status: 200, statusText: 'OK' };
    }
    return { data: list, error: null, count: result.count, status: 200, statusText: 'OK' };
  }

  then(onFulfilled?: any, onRejected?: any) { return this.run().then(onFulfilled, onRejected); }
  catch(onRejected?: any) { return this.run().catch(onRejected); }
  finally(onFinally?: any) { return this.run().finally(onFinally); }
}

const storage = {
  from(bucket: string) {
    const base = '/api/storage/' + encodeURIComponent(bucket) + '/';
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    return {
      async upload(path: string, file: any, options?: any) {
        try {
          const type = (options && options.contentType) || (file && file.type) || 'application/octet-stream';
          const response = await fetch(base + encodeKey(path), {
            method: 'PUT',
            headers: { 'content-type': type },
            body: file
          });
          if (!response.ok) return { data: null, error: fail('Upload failed: ' + response.status) };
          return { data: { path: path, fullPath: bucket + '/' + path }, error: null };
        } catch (err: any) {
          return { data: null, error: fail((err && err.message) || 'Upload failed') };
        }
      },
      async download(path: string) {
        try {
          const response = await fetch(base + encodeKey(path));
          if (!response.ok) return { data: null, error: fail('Download failed: ' + response.status) };
          const blob = await response.blob();
          return { data: blob, error: null };
        } catch (err: any) {
          return { data: null, error: fail((err && err.message) || 'Download failed') };
        }
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: origin + base + encodeKey(path) } };
      },
      async createSignedUrl(path: string, _expiresIn?: number) {
        return { data: { signedUrl: origin + base + encodeKey(path) }, error: null };
      },
      async remove(paths: any) {
        const list = Array.isArray(paths) ? paths : [paths];
        try {
          for (const path of list) await fetch(base + encodeKey(path), { method: 'DELETE' });
          return { data: list.map(function (p: string) { return { name: p }; }), error: null };
        } catch (err: any) {
          return { data: null, error: fail((err && err.message) || 'Delete failed') };
        }
      },
      async list() { return { data: [], error: null }; }
    };
  }
};

// Realtime is emulated: a single poller reads the change feed written by the API
// layer and hands each changed row to whichever channels asked for that table.
function matchesFilter(filter: string, row: Row) {
  if (!filter) return true;
  const equals = String(filter).indexOf('=');
  if (equals < 0) return true;
  const col = String(filter).slice(0, equals).trim();
  const rest = String(filter).slice(equals + 1);
  const dot = rest.indexOf('.');
  const value = dot < 0 ? rest : rest.slice(dot + 1);
  if (!row || row[col] === undefined) return true;
  return String(row[col]) === String(value);
}

type Handler = { config: any; callback: (payload: any) => void };

const channels: any[] = [];
let timer: any = null;
let cursor: number | null = null;
let busy = false;

class Channel {
  topic: string;
  private handlers: Handler[] = [];

  constructor(topic: string) {
    this.topic = topic;
  }

  on(event: string, config: any, callback: any) {
    if (String(event) === 'postgres_changes') {
      this.handlers.push({ config: config || {}, callback: callback });
    }
    return this;
  }

  subscribe(callback?: any) {
    if (channels.indexOf(this) < 0) channels.push(this);
    startPolling();
    if (typeof callback === 'function') callback('SUBSCRIBED');
    return this;
  }

  unsubscribe() {
    return removeChannel(this);
  }

  deliver(payload: any) {
    for (const handler of this.handlers) {
      const config = handler.config || {};
      if (config.table && config.table !== '*' && config.table !== payload.table) continue;
      if (config.event && config.event !== '*' && String(config.event).toUpperCase() !== payload.eventType) continue;
      const target = payload.eventType === 'DELETE' ? payload.old : payload.new;
      if (!matchesFilter(config.filter, target)) continue;
      try { handler.callback(payload); } catch (err) { /* a listener error must not stop the others */ }
    }
  }
}

function startPolling() {
  if (timer !== null) return;
  timer = setInterval(tick, POLL_MS);
  tick();
}

function stopPolling() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function removeChannel(channel: any) {
  const index = channels.indexOf(channel);
  if (index >= 0) channels.splice(index, 1);
  if (channels.length === 0) stopPolling();
  return Promise.resolve('ok');
}

async function tick() {
  if (busy || channels.length === 0) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  busy = true;
  try {
    if (cursor === null) {
      const first = await fetch('/api/changes');
      const head = await first.json();
      cursor = Number(head.last) || 0;
      return;
    }
    const response = await fetch('/api/changes?since=' + cursor);
    const body = await response.json();
    const changes = Array.isArray(body.changes) ? body.changes : [];
    cursor = Number(body.last) || cursor;
    if (changes.length > 0) await dispatch(changes);
  } catch (err) {
    // Network hiccup: the next tick tries again from the same cursor.
  } finally {
    busy = false;
  }
}

async function dispatch(changes: any[]) {
  const wanted: Record<string, string[]> = {};
  for (const change of changes) {
    if (String(change.op) === 'DELETE') continue;
    const table = String(change.tbl);
    if (!wanted[table]) wanted[table] = [];
    if (wanted[table].indexOf(String(change.row_id)) < 0) wanted[table].push(String(change.row_id));
  }

  const rowsByTable: Record<string, Record<string, Row>> = {};
  const tables = Object.keys(wanted);
  for (const table of tables) {
    const result = await callDb({
      table: table,
      op: 'select',
      columns: '*',
      filters: [{ col: 'id', op: 'in', val: wanted[table] }]
    });
    const map: Record<string, Row> = {};
    const list = Array.isArray(result.data) ? result.data : [];
    for (const row of list) map[String(row.id)] = row;
    rowsByTable[table] = map;
  }

  for (const change of changes) {
    const table = String(change.tbl);
    const op = String(change.op);
    const id = String(change.row_id);
    const row = op === 'DELETE' ? null : ((rowsByTable[table] || {})[id] || null);
    if (op !== 'DELETE' && !row) continue;
    const payload = {
      schema: 'public',
      table: table,
      commit_timestamp: new Date().toISOString(),
      eventType: op,
      type: op,
      event: op,
      new: row || {},
      old: row ? {} : { id: id },
      errors: null
    };
    const listeners = channels.slice();
    for (const channel of listeners) channel.deliver(payload);
  }
}

export const supabase = {
  from(table: string) { return new Query(table); },
  storage: storage,
  channel(topic: string) { return new Channel(topic); },
  getChannels() { return channels.slice(); },
  removeChannel: removeChannel,
  removeAllChannels() {
    channels.length = 0;
    stopPolling();
    return Promise.resolve('ok');
  },
  rpc(_name?: string, _args?: any) {
    return Promise.resolve({ data: null, error: fail('rpc is not available on the Cloudflare backend') });
  }
};

export default supabase;
