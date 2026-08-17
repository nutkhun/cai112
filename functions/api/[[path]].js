// Cloudflare Pages Function: a small PostgREST-style API over Cloudflare D1 + R2.
// Routes (everything lives under /api):
//   POST   /api/db                       read or write the D1 database
//   GET    /api/changes?since=<seq>      change feed used to emulate realtime
//   PUT    /api/storage/<bucket>/<key>   upload a file to R2
//   GET    /api/storage/<bucket>/<key>   read a file from R2
//   DELETE /api/storage/<bucket>/<key>   delete a file from R2

const TABLES = { students: 1, groups: 1, group_invitations: 1, join_requests: 1, group_messages: 1, group_notes: 1, student_notes: 1, assignments: 1, assignment_due_dates: 1, grades: 1, rubric_scores: 1, materials: 1, absence_requests: 1, teacher_messages: 1, emails: 1 };

const HAS_UPDATED_AT = { group_invitations: 1, join_requests: 1, group_notes: 1, student_notes: 1, assignment_due_dates: 1, grades: 1, rubric_scores: 1, materials: 1, absence_requests: 1 };

const JSON_COLUMNS = { rubric_scores: ['scores'] };

const BUCKETS = { 'chat-attachments': 1, 'materials': 1, 'message-images': 1, 'absence-documents': 1, 'group-assignments': 1 };

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

function ident(name) {
  const text = String(name);
  let ok = text.length > 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const isLetter = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
    const isDigit = c >= '0' && c <= '9';
    if (!(isLetter || (isDigit && i > 0))) { ok = false; break; }
  }
  if (!ok) throw new Error('Invalid identifier: ' + text);
  return '"' + text + '"';
}

function bindValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function bindAll(stmt, binds) {
  if (!binds || binds.length === 0) return stmt;
  return stmt.bind.apply(stmt, binds);
}

function decodeRow(table, row) {
  const cols = JSON_COLUMNS[table];
  if (!row || !cols) return row;
  for (const col of cols) {
    if (typeof row[col] === 'string') {
      try { row[col] = JSON.parse(row[col]); } catch (err) { /* keep the raw text */ }
    }
  }
  return row;
}

function condition(filter, binds) {
  const op = String(filter.op || 'eq');
  if (op === 'or') return orGroup(String(filter.val == null ? '' : filter.val), binds);
  const col = ident(filter.col);
  const value = filter.val;
  if (op === 'eq' || op === 'is') {
    if (value === null) return col + ' IS NULL';
    binds.push(bindValue(value));
    return col + ' = ?';
  }
  if (op === 'neq') {
    if (value === null) return col + ' IS NOT NULL';
    binds.push(bindValue(value));
    return col + ' <> ?';
  }
  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    const symbols = { gt: ' > ?', gte: ' >= ?', lt: ' < ?', lte: ' <= ?' };
    binds.push(bindValue(value));
    return col + symbols[op];
  }
  if (op === 'like') { binds.push(bindValue(value)); return col + ' LIKE ?'; }
  if (op === 'ilike') { binds.push(String(value).toLowerCase()); return 'lower(' + col + ') LIKE ?'; }
  if (op === 'in') {
    const list = Array.isArray(value) ? value : [];
    if (list.length === 0) return '0 = 1';
    for (const item of list) binds.push(bindValue(item));
    return col + ' IN (' + list.map(function () { return '?'; }).join(', ') + ')';
  }
  throw new Error('Unsupported operator: ' + op);
}

function orGroup(expression, binds) {
  const terms = expression.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
  const parts = [];
  for (const term of terms) {
    const first = term.indexOf('.');
    const second = term.indexOf('.', first + 1);
    if (first < 0 || second < 0) throw new Error('Bad or() term: ' + term);
    const col = term.slice(0, first);
    const op = term.slice(first + 1, second);
    let raw = term.slice(second + 1);
    let value = raw;
    if (raw === 'null') value = null;
    else if (raw === 'true') value = 1;
    else if (raw === 'false') value = 0;
    parts.push(condition({ col: col, op: op, val: value }, binds));
  }
  if (parts.length === 0) return '1 = 1';
  return '(' + parts.join(' OR ') + ')';
}

function whereClause(filters, binds) {
  if (!Array.isArray(filters) || filters.length === 0) return '';
  return ' WHERE ' + filters.map(function (f) { return condition(f, binds); }).join(' AND ');
}

function orderClause(order) {
  if (!Array.isArray(order) || order.length === 0) return '';
  return ' ORDER BY ' + order.map(function (o) {
    return ident(o.col) + (o.ascending === false ? ' DESC' : ' ASC');
  }).join(', ');
}

function selectList(columns) {
  const raw = String(columns == null ? '*' : columns).trim();
  if (raw === '' || raw === '*') return '*';
  const parts = raw.split(',').map(function (c) { return c.trim(); }).filter(Boolean);
  if (parts.indexOf('*') >= 0) return '*';
  return parts.map(ident).join(', ');
}

async function logChanges(env, table, op, ids) {
  const clean = (ids || []).filter(function (id) { return id !== null && id !== undefined; });
  if (clean.length === 0) return;
  const stmt = env.DB.prepare('INSERT INTO _changes (tbl, op, row_id) VALUES (?, ?, ?)');
  await env.DB.batch(clean.map(function (id) { return stmt.bind(table, op, String(id)); }));
}

async function handleDb(request, env) {
  let body;
  try { body = await request.json(); } catch (err) { return json({ error: 'Invalid JSON body' }, 400); }
  const table = String(body.table || '');
  if (!TABLES[table]) return json({ error: 'Unknown table: ' + table }, 400);
  const quoted = ident(table);
  const op = String(body.op || 'select');
  try {
    if (op === 'select') {
      let count = null;
      if (body.count) {
        const countBinds = [];
        const countWhere = whereClause(body.filters, countBinds);
        const row = await bindAll(env.DB.prepare('SELECT COUNT(*) AS n FROM ' + quoted + countWhere), countBinds).first();
        count = row ? Number(row.n) : 0;
        if (body.head) return json({ data: null, count: count });
      }
      const binds = [];
      let sql = 'SELECT ' + selectList(body.columns) + ' FROM ' + quoted + whereClause(body.filters, binds) + orderClause(body.order);
      if (body.limit !== null && body.limit !== undefined) sql += ' LIMIT ' + Number(body.limit);
      const result = await bindAll(env.DB.prepare(sql), binds).all();
      const rows = (result.results || []).map(function (r) { return decodeRow(table, r); });
      return json({ data: rows, count: count });
    }
    if (op === 'insert' || op === 'upsert') {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const saved = [];
      for (const input of rows) {
        const record = Object.assign({}, input);
        if (record.id === undefined || record.id === null) record.id = crypto.randomUUID();
        if (HAS_UPDATED_AT[table]) record.updated_at = new Date().toISOString();
        const cols = Object.keys(record);
        const binds = cols.map(function (c) { return bindValue(record[c]); });
        let sql = 'INSERT INTO ' + quoted + ' (' + cols.map(ident).join(', ') + ') VALUES (' + cols.map(function () { return '?'; }).join(', ') + ')';
        if (op === 'upsert') {
          const conflict = String(body.onConflict || 'id').split(',').map(function (c) { return c.trim(); }).filter(Boolean);
          const updatable = cols.filter(function (c) { return c !== 'id' && conflict.indexOf(c) < 0; });
          const assignments = updatable.map(function (c) { return ident(c) + ' = excluded.' + ident(c); });
          sql += ' ON CONFLICT (' + conflict.map(ident).join(', ') + ') DO ' + (assignments.length ? 'UPDATE SET ' + assignments.join(', ') : 'NOTHING');
        }
        sql += ' RETURNING *';
        const result = await bindAll(env.DB.prepare(sql), binds).all();
        const stored = (result.results || [])[0];
        if (stored) saved.push(decodeRow(table, stored));
      }
      await logChanges(env, table, op === 'insert' ? 'INSERT' : 'UPDATE', saved.map(function (r) { return r.id; }));
      return json({ data: saved });
    }
    if (op === 'update') {
      const record = Object.assign({}, body.values || {});
      if (Object.keys(record).length === 0) return json({ data: [] });
      if (HAS_UPDATED_AT[table]) record.updated_at = new Date().toISOString();
      const cols = Object.keys(record);
      const binds = cols.map(function (c) { return bindValue(record[c]); });
      const sql = 'UPDATE ' + quoted + ' SET ' + cols.map(function (c) { return ident(c) + ' = ?'; }).join(', ') + whereClause(body.filters, binds) + ' RETURNING *';
      const result = await bindAll(env.DB.prepare(sql), binds).all();
      const rows = (result.results || []).map(function (r) { return decodeRow(table, r); });
      await logChanges(env, table, 'UPDATE', rows.map(function (r) { return r.id; }));
      return json({ data: rows });
    }
    if (op === 'delete') {
      const binds = [];
      const sql = 'DELETE FROM ' + quoted + whereClause(body.filters, binds) + ' RETURNING *';
      const result = await bindAll(env.DB.prepare(sql), binds).all();
      const rows = (result.results || []).map(function (r) { return decodeRow(table, r); });
      await logChanges(env, table, 'DELETE', rows.map(function (r) { return r.id; }));
      return json({ data: rows });
    }
    return json({ error: 'Unknown op: ' + op }, 400);
  } catch (err) {
    return json({ error: (err && err.message) || 'Database error' }, 400);
  }
}

async function handleChanges(url, env) {
  const since = url.searchParams.get('since');
  if (since === null || since === '') {
    const row = await env.DB.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM _changes').first();
    return json({ last: row ? Number(row.seq) : 0, changes: [] });
  }
  const from = Number(since) || 0;
  const result = await env.DB.prepare('SELECT seq, tbl, op, row_id FROM _changes WHERE seq > ? ORDER BY seq ASC LIMIT 200').bind(from).all();
  const changes = result.results || [];
  let last = from;
  for (const change of changes) if (Number(change.seq) > last) last = Number(change.seq);
  if (Math.random() < 0.02) {
    await env.DB.prepare("DELETE FROM _changes WHERE at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours')").run();
  }
  return json({ last: last, changes: changes });
}

async function handleStorage(request, env, segments) {
  const bucket = segments[0];
  const key = segments.slice(1).join('/');
  if (!bucket || !BUCKETS[bucket]) return json({ error: 'Unknown bucket' }, 400);
  if (!key) return json({ error: 'Missing object key' }, 400);
  const objectKey = bucket + '/' + key;
  const method = request.method.toUpperCase();
  if (method === 'PUT' || method === 'POST') {
    const contentType = request.headers.get('content-type') || 'application/octet-stream';
    const data = await request.arrayBuffer();
    await env.FILES.put(objectKey, data, { httpMetadata: { contentType: contentType } });
    return json({ data: { path: key } });
  }
  if (method === 'DELETE') {
    await env.FILES.delete(objectKey);
    return json({ data: { path: key } });
  }
  if (method === 'GET' || method === 'HEAD') {
    const object = await env.FILES.get(objectKey);
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'private, max-age=60');
    const parts = key.split('/');
    const name = parts[parts.length - 1] || 'file';
    const wantsDownload = new URL(request.url).searchParams.get('download');
    headers.set('content-disposition', (wantsDownload ? 'attachment' : 'inline') + '; filename="' + name.split('"').join('') + '"');
    return new Response(method === 'HEAD' ? null : object.body, { headers: headers });
  }
  return json({ error: 'Method not allowed' }, 405);
}

export async function onRequest(context) {
  const request = context.request;
  const env = context.env;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const url = new URL(request.url);
  const segments = url.pathname.split('/').filter(Boolean).map(function (s) { return decodeURIComponent(s); });
  if (segments[0] !== 'api') return json({ error: 'Not found' }, 404);
  const route = segments[1];
  if (route === 'db') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    return handleDb(request, env);
  }
  if (route === 'changes') return handleChanges(url, env);
  if (route === 'storage') return handleStorage(request, env, segments.slice(2));
  if (route === 'health') return json({ ok: true });
  return json({ error: 'Not found' }, 404);
}
