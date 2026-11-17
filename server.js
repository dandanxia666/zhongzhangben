'use strict';
/* ==================================================================
   众账本后端服务器 v1
   零依赖(仅 Node 内置模块):node server.js 即可运行
   - 静态服务:/ 与 /code.html
   - 登录鉴权:users.json 存 SHA256 口令散列,内存令牌
   - 业务 API:会计引擎(engine.js)在服务器端强制执行全部规则
   - 实时推送:SSE(event: update / presence),跨设备同步
   - 持久化:zzb-data.json 原子写入
   ================================================================== */
var http = require('http');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var E = require('./engine.js');

var PORT = +(process.env.PORT || 8100);
var ROOT = __dirname;
var DATA = path.join(ROOT, 'zzb-data.json');
var USERS = path.join(ROOT, 'users.json');
var CLIENT = path.join(ROOT, 'code.html');

/* ---------------- 状态与持久化 ---------------- */
var S = null, SEQ = 0;
function loadState(){
  try {
    var j = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    if (j && j.S && Array.isArray(j.S.vouchers)){ S = j.S; SEQ = j.seq || 0; return; }
  } catch(e){}
  S = E.seedState();
  saveState();
}
function saveState(){
  try {
    var tmp = DATA + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ seq: SEQ, S: S }));
    fs.renameSync(tmp, DATA);
  } catch(e){ console.error('持久化失败:', e.message); }
}

/* ---------------- 口令(散列存储) ---------------- */
function sha(s){ return crypto.createHash('sha256').update(s).digest('hex'); }
function loadUsers(){
  try {
    var u = JSON.parse(fs.readFileSync(USERS, 'utf8'));
    if (u && typeof u === 'object' && Object.keys(u).length) return u;
  } catch(e){}
  var seed = {};
  S.members.forEach(function(m){ seed[m.id] = sha(m.id + ':123456'); });
  fs.writeFileSync(USERS, JSON.stringify(seed, null, 2));
  return seed;
}
function saveUsers(){ try { fs.writeFileSync(USERS, JSON.stringify(USERS_DB, null, 2)); } catch(e){} }

/* ---------------- 鉴权 ---------------- */
var tokens = new Map(); /* token -> uid */
function member(uid){ return S.members.filter(function(m){ return m.id === uid; })[0] || null; }
function nameOf(uid){ var m = member(uid); return m ? m.name : '未知'; }
function auth(req){
  var h = req.headers['authorization'] || '';
  var m = h.match(/^Bearer ([A-Za-z0-9]+)$/);
  if (m && tokens.has(m[1])){
    var uid = tokens.get(m[1]);
    var mm = member(uid);
    if (mm) return { token: m[1], uid: uid, member: mm };
    tokens.delete(m[1]);
  }
  return null;
}

/* ---------------- SSE 实时推送与在线状态 ---------------- */
var sseClients = new Map(); /* token -> {res, name} */
function sseBroadcast(event, obj){
  var payload = 'event: ' + event + '\ndata: ' + JSON.stringify(obj) + '\n\n';
  sseClients.forEach(function(c){ try { c.res.write(payload); } catch(e){} });
}
function onlineNames(){
  var seen = {}, names = [];
  sseClients.forEach(function(c){ if (!seen[c.name]){ seen[c.name] = 1; names.push(c.name); } });
  return names;
}
function broadcastUpdate(actorUid, info){
  SEQ++;
  saveState();
  sseBroadcast('update', { seq: SEQ, name: nameOf(actorUid), info: info, online: onlineNames() });
}
setInterval(function(){
  sseClients.forEach(function(c){ try { c.res.write(': ping\n\n'); } catch(e){} });
}, 25000);

/* ---------------- 工具 ---------------- */
function json(res, code, obj){
  var body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req, cb){
  var chunks = [], size = 0;
  req.on('data', function(d){
    size += d.length;
    if (size > 1024 * 1024){ req.destroy(); cb(null); return; }
    chunks.push(d);
  });
  req.on('end', function(){
    if (!chunks.length) return cb({});
    try { cb(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch(e){ cb(null); }
  });
}

/* ---------------- 业务 API ---------------- */
function handleApi(req, res, urlObj, method){
  var p = urlObj.pathname;
  var needAuth = p !== '/api/ping' && p !== '/api/meta' && p !== '/api/login' && !/^\/api\/pub\//.test(p) && p !== '/api/events';
  var a = auth(req);
  if (needAuth && !a) return json(res, 401, { ok: false, err: '未登录或登录已失效' });

  /* 公开 */
  if (p === '/api/ping') return json(res, 200, { ok: true, server: true, time: Date.now() });
  if (p === '/api/meta'){
    return json(res, 200, { ok: true, org: S.org,
      members: S.members.map(function(m){ return { id: m.id, name: m.name, role: m.role }; }) });
  }
  if (p === '/api/login' && method === 'POST'){
    return readBody(req, function(b){
      if (!b || !b.uid || USERS_DB[b.uid] !== sha(b.uid + ':' + (b.pass || '')))
        return json(res, 401, { ok: false, err: '账号或口令不正确(演示口令:123456)' });
      var token = crypto.randomBytes(24).toString('hex');
      tokens.set(token, b.uid);
      return json(res, 200, { ok: true, token: token, uid: b.uid, name: nameOf(b.uid), seq: SEQ });
    });
  }
  var mPub = p.match(/^\/api\/pub\/(\w+)$/);
  if (mPub){
    if (mPub[1] !== S.publicKey) return json(res, 404, { ok: false });
    var bs = E.balanceSheet(S, E.TODAY);
    return json(res, 200, { ok: true, org: S.org, aT: bs.aT, lT: bs.lT,
      eff: E.effV(S, E.TODAY).map(function(v){
        return { date: v.date, id: v.id, summary: v.summary, total: E.voucherTotal(v), status: v.status };
      }) });
  }
  if (p === '/api/events'){
    var tok = (urlObj.searchParams && urlObj.searchParams.get('token')) || null;
    if (!tok || !tokens.has(tok)) return json(res, 401, { ok: false, err: '无效令牌' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive'
    });
    res.write('retry: 2000\n\n');
    sseClients.set(tok, { res: res, name: nameOf(tokens.get(tok)) });
    sseBroadcast('presence', { online: onlineNames() });
    req.on('close', function(){
      sseClients.delete(tok);
      sseBroadcast('presence', { online: onlineNames() });
    });
    return;
  }

  /* 以下均需登录;除查询外均需管理员 */
  if (p === '/api/state' && method === 'GET')
    return json(res, 200, { ok: true, seq: SEQ, state: S, online: onlineNames() });
  if (p === '/api/raw' && method === 'GET'){
    if (a.member.role !== 'admin') return json(res, 403, { ok: false, err: '需要管理员权限' });
    return json(res, 200, { ok: true, seq: SEQ, raw: JSON.stringify(S, null, 2) });
  }

  if (a.member.role !== 'admin')
    return json(res, 403, { ok: false, err: '需要管理员权限' });

  if (p === '/api/vouchers' && method === 'POST'){
    return readBody(req, function(b){
      if (!b) return json(res, 400, { ok: false, err: '请求体无效' });
      var r = E.createVoucher(S, a.uid, b);
      if (!r.ok) return json(res, 400, r);
      broadcastUpdate(a.uid, '制单 ' + r.id);
      return json(res, 200, { ok: true, id: r.id, seq: SEQ });
    });
  }
  var mRev = p.match(/^\/api\/vouchers\/([^/]+)\/(review|reverse)$/);
  if (mRev && method === 'POST'){
    var vid = decodeURIComponent(mRev[1]);
    return readBody(req, function(b){
      if (!b) return json(res, 400, { ok: false, err: '请求体无效' });
      var r;
      if (mRev[2] === 'review') r = E.reviewVoucher(S, vid, a.uid, b.verdict === 'reject' ? 'reject' : 'pass', b.note || '');
      else r = E.reverseVoucher(S, vid, a.uid, b.reason || '');
      if (!r.ok) return json(res, 400, r);
      broadcastUpdate(a.uid, (mRev[2] === 'review' ? (b.verdict === 'reject' ? '复核驳回 ' : '复核通过 ') : '红冲制单 ') + vid);
      return json(res, 200, { ok: true, id: r.id || vid, seq: SEQ });
    });
  }
  if (p === '/api/close' && method === 'POST'){
    var m = E.monthOf(E.TODAY);
    var r2 = E.closeMonth(S, m, a.uid);
    if (!r2.ok) return json(res, 400, r2);
    broadcastUpdate(a.uid, '结账 ' + m);
    return json(res, 200, { ok: true, seq: SEQ });
  }
  if (p === '/api/unclose' && method === 'POST'){
    var r3 = E.uncloseLast(S, a.uid);
    if (!r3.ok) return json(res, 400, r3);
    broadcastUpdate(a.uid, '反结账');
    return json(res, 200, { ok: true, seq: SEQ });
  }
  if (p === '/api/members' && method === 'POST'){
    return readBody(req, function(b){
      if (!b) return json(res, 400, { ok: false, err: '请求体无效' });
      var r4 = E.memberAdd(S, a.uid, b.name || '', b.role === 'admin' ? 'admin' : 'viewer');
      if (!r4.ok) return json(res, 400, r4);
      var added = S.members[S.members.length - 1];
      USERS_DB[added.id] = sha(added.id + ':123456');
      saveUsers();
      broadcastUpdate(a.uid, '成员新增 ' + added.name);
      return json(res, 200, { ok: true, seq: SEQ });
    });
  }
  var mMem = p.match(/^\/api\/members\/([^/]+)\/(role|remove)$/);
  if (mMem && method === 'POST'){
    var mid = mMem[1];
    return readBody(req, function(b){
      var r5;
      if (mMem[2] === 'role'){
        if (!b || (b.role !== 'admin' && b.role !== 'viewer'))
          return json(res, 400, { ok: false, err: '角色无效' });
        r5 = E.memberRole(S, a.uid, mid, b.role);
      } else {
        r5 = E.memberRemove(S, a.uid, mid);
        if (r5.ok){ delete USERS_DB[mid]; saveUsers(); }
      }
      if (!r5.ok) return json(res, 400, r5);
      broadcastUpdate(a.uid, mMem[2] === 'role' ? '成员角色变更' : '成员移除');
      return json(res, 200, { ok: true, seq: SEQ });
    });
  }
  if (p === '/api/regen-key' && method === 'POST'){
    var r6 = E.regenKey(S, a.uid);
    if (!r6.ok) return json(res, 400, r6);
    broadcastUpdate(a.uid, '公示密钥重新生成');
    return json(res, 200, { ok: true, key: r6.key, seq: SEQ });
  }
  if (p === '/api/reset' && method === 'POST'){
    S = E.seedState();
    broadcastUpdate(a.uid, '重置演示数据');
    return json(res, 200, { ok: true, seq: SEQ });
  }
  if (p === '/api/import' && method === 'POST'){
    return readBody(req, function(b){
      var obj;
      try { obj = typeof b.json === 'string' ? JSON.parse(b.json) : b.json; }
      catch(e){ return json(res, 400, { ok: false, err: 'JSON 解析失败:' + e.message }); }
      if (!obj || !Array.isArray(obj.vouchers) || !Array.isArray(obj.members) || !Array.isArray(obj.closeLog))
        return json(res, 400, { ok: false, err: '数据结构不像账本备份' });
      S = obj;
      S.members.forEach(function(m){ if (!USERS_DB[m.id]) USERS_DB[m.id] = sha(m.id + ':123456'); });
      saveUsers();
      broadcastUpdate(a.uid, '导入恢复');
      return json(res, 200, { ok: true, seq: SEQ });
    });
  }
  if (p === '/api/logout' && method === 'POST'){
    tokens.delete(a.token);
    var c = sseClients.get(a.token);
    if (c){ sseClients.delete(a.token); sseBroadcast('presence', { online: onlineNames() }); }
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { ok: false, err: '接口不存在' });
}

/* ---------------- 静态服务 ---------------- */
var CLIENT_CACHE = null, CLIENT_MTIME = 0;
function serveClient(res){
  try {
    var st = fs.statSync(CLIENT);
    if (st.mtimeMs !== CLIENT_MTIME){ CLIENT_CACHE = fs.readFileSync(CLIENT); CLIENT_MTIME = st.mtimeMs; }
  } catch(e){}
  if (!CLIENT_CACHE){ res.writeHead(404); res.end('code.html not found'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(CLIENT_CACHE);
}

/* ---------------- 启动 ---------------- */
loadState();
var USERS_DB = loadUsers();
http.createServer(function(req, res){
  var urlObj;
  try { urlObj = new URL(req.url, 'http://localhost'); }
  catch(e){ res.writeHead(400); res.end('bad request'); return; }
  var t0 = Date.now();
  res.on('finish', function(){
    if (urlObj.pathname.startsWith('/api') && urlObj.pathname !== '/api/events')
      console.log(new Date().toTimeString().slice(0,8), req.method, urlObj.pathname, '→', res.statusCode, (Date.now() - t0) + 'ms');
  });
  if (urlObj.pathname.startsWith('/api')) return handleApi(req, res, urlObj, req.method);
  if (urlObj.pathname === '/' || urlObj.pathname === '/code.html' || urlObj.pathname === '/index.html')
    return serveClient(res);
  /* 服务器内部文件一律不对外 */
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
}).listen(PORT, '0.0.0.0', function(){
  console.log('众账本后端已启动: http://127.0.0.1:' + PORT + '/  (Ctrl+C 停止)');
  console.log('数据文件:', DATA);
});
