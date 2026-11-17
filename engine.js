/* 众账本会计引擎 —— 从 code.html 第一部分提取,服务器与浏览器共用 */
var TODAY = '2026-11-08';

var ACCOUNTS = [
  {code:'1001',     name:'库存现金',     cls:'asset', cash:true},
  {code:'1002',     name:'银行存款',     cls:'asset', cash:true},
  {code:'1012',     name:'其他货币资金', cls:'asset'},
  {code:'1012.01',  name:'微信',         cls:'asset', parent:'1012', cash:true},
  {code:'1012.02',  name:'支付宝',       cls:'asset', parent:'1012', cash:true},
  {code:'1122',     name:'应收账款',     cls:'asset'},
  {code:'1405',     name:'库存商品',     cls:'asset'},
  {code:'2202',     name:'应付账款',     cls:'liab'},
  {code:'2241',     name:'其他应付款',   cls:'liab'},
  {code:'3001',     name:'实收资本',     cls:'eq'},
  {code:'3103',     name:'本年利润',     cls:'eq'},
  {code:'5001',     name:'主营业务收入', cls:'inc'},
  {code:'5301',     name:'营业外收入',   cls:'inc'},
  {code:'5401',     name:'主营业务成本', cls:'exp'},
  {code:'5601',     name:'销售费用',     cls:'exp'},
  {code:'5601.01',  name:'摊位费',       cls:'exp', parent:'5601'},
  {code:'5601.02',  name:'宣传费',       cls:'exp', parent:'5601'},
  {code:'5602',     name:'管理费用',     cls:'exp'}
];
var ACC = {};
ACCOUNTS.forEach(function(a){ ACC[a.code] = a; });
function accChildren(code){ return ACCOUNTS.filter(function(a){ return a.parent === code; }); }
function leafCodes(code){ var ch = accChildren(code); return ch.length ? ch.map(function(a){ return a.code; }) : [code]; }
var TOPS  = ACCOUNTS.filter(function(a){ return !a.parent; });
var LEAVES = ACCOUNTS.filter(function(a){ return !accChildren(a.code).length; });
var CLS_NAME = {asset:'资产', liab:'负债', eq:'权益', inc:'收入', exp:'费用'};
var CLS_ORDER = ['asset','liab','eq','inc','exp'];
function isDebitCls(cls){ return cls === 'asset' || cls === 'exp'; }

function c100(v){ return Math.round(v * 100); }
function fmt(c){
  var sign = c < 0 ? '-' : '';
  var v = Math.abs(c) / 100;
  return sign + v.toLocaleString('zh-CN', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function money(c){ return (c < 0 ? '-¥' : '¥') + fmt(Math.abs(c)); }
function monthOf(d){ return d.slice(0,7); }
function monthEnd(m){
  var y = +m.slice(0,4), mm = +m.slice(5,7);
  var d = new Date(y, mm, 0).getDate();
  return m + '-' + (d < 10 ? '0' + d : d);
}
function accName(code){
  var a = ACC[code]; if (!a) return code;
  var n = a.parent ? ACC[a.parent].name + '——' + a.name : a.name;
  return n + '(' + code + ')';
}
function accShort(code){ var a = ACC[code]; return a ? a.name + ' (' + code + ')' : code; }

function V(id, date, summary, lines, by, at, revBy, revAt, extra){
  var v = {
    id:id, date:date, summary:summary, lines:lines,
    status: revBy ? '已生效' : '待复核',
    by:by, at:at, revBy:revBy || null, revAt:revAt || null,
    system:false, reverses:null, rejectNote:null, voidNote:null
  };
  if (extra) for (var k in extra) v[k] = extra[k];
  return v;
}
function seedState(){
  var S = {
    org:'某创业项目 A',
    members:[
      {id:'u1', name:'张三', role:'admin'},
      {id:'u2', name:'李四', role:'admin'},
      {id:'u3', name:'王五', role:'viewer'}
    ],
    vouchers:[
      V('记-001','2026-10-01','合伙人出资到账',[{acc:'1002',dc:'借',amt:8000},{acc:'3001',dc:'贷',amt:8000}],'u1','2026-10-01 09:12','u2','2026-10-01 09:40',{vtype:'收',attach:1}),
      V('记-002','2026-10-02','校友企业赞助到账',[{acc:'1012.01',dc:'借',amt:2000},{acc:'5301',dc:'贷',amt:2000}],'u2','2026-10-02 14:05','u1','2026-10-02 14:31',{vtype:'收',attach:1}),
      V('记-003','2026-10-03','创业大赛奖金到账',[{acc:'1002',dc:'借',amt:3000},{acc:'5301',dc:'贷',amt:3000}],'u1','2026-10-03 10:20','u2','2026-10-03 10:58',{vtype:'收',attach:1}),
      V('记-004','2026-10-05','采购第一批文创货品',[{acc:'1405',dc:'借',amt:1500},{acc:'1012.01',dc:'贷',amt:1500}],'u1','2026-10-05 15:02','u2','2026-10-05 15:26',{vtype:'付',attach:1}),
      V('记-005','2026-10-08','义卖收入(误记金额)',[{acc:'1012.01',dc:'借',amt:4200},{acc:'5001',dc:'贷',amt:4200}],'u2','2026-10-08 16:40','u1','2026-10-08 17:05',{vtype:'收',attach:1}),
      V('记-006','2026-10-09','打印宣传物料',[{acc:'5601.02',dc:'借',amt:180},{acc:'1012.01',dc:'贷',amt:180}],'u1','2026-10-09 11:15','u1','2026-10-09 11:32',{vtype:'付',attach:1}),
      V('记-007','2026-10-12','收社团委托代收活动费',[{acc:'1012.01',dc:'借',amt:3000},{acc:'2241',dc:'贷',amt:3000}],'u1','2026-10-12 09:50','u2','2026-10-12 10:14',{vtype:'收',attach:1}),
      V('记-008','2026-10-13','代付社团场地费',[{acc:'2241',dc:'借',amt:800},{acc:'1012.01',dc:'贷',amt:800}],'u1','2026-10-13 13:22','u2','2026-10-13 13:47',{vtype:'付',attach:1}),
      V('记-009','2026-10-16','红冲 记-005:义卖收入多记',[
        {acc:'1012.01',dc:'借',amt:-4200},{acc:'5001',dc:'贷',amt:-4200}
      ],'u2','2026-10-16 09:03','u1','2026-10-16 09:21',{reverses:'记-005',vtype:'收',attach:1}),
      V('记-010','2026-10-16','更正:义卖收入(实收)',[{acc:'1012.01',dc:'借',amt:2400},{acc:'5001',dc:'贷',amt:2400}],'u2','2026-10-16 09:30','u1','2026-10-16 09:52',{vtype:'收',attach:1}),
      V('记-011','2026-10-20','结转第一批销售成本',[{acc:'5401',dc:'借',amt:1200},{acc:'1405',dc:'贷',amt:1200}],'u1','2026-10-20 16:08','u2','2026-10-20 16:30',{vtype:'转',attach:0}),
      V('记-012','2026-10-31','系统结转:2026-10 损益结转至本年利润',[
        {acc:'5301',dc:'借',amt:5000},{acc:'5001',dc:'借',amt:2400},
        {acc:'5401',dc:'贷',amt:1200},{acc:'5601.02',dc:'贷',amt:180},{acc:'3103',dc:'贷',amt:6020}
      ],'u1','2026-10-31 18:00','u1','2026-10-31 18:00',{system:true,vtype:'转',attach:0}),
      V('记-013','2026-11-02','采购第二批货品',[{acc:'1405',dc:'借',amt:900},{acc:'1002',dc:'贷',amt:900}],'u1','2026-11-02 10:41','u2','2026-11-02 11:05',{vtype:'付',attach:1}),
      V('记-014','2026-11-05','校内市集义卖收入',[{acc:'1012.02',dc:'借',amt:1800},{acc:'5001',dc:'贷',amt:1800}],'u2','2026-11-05 15:12',null,null,{vtype:'收',attach:2}),
      V('记-015','2026-11-06','市集摊位费',[{acc:'5601.01',dc:'借',amt:200},{acc:'1012.01',dc:'贷',amt:200}],'u1','2026-11-06 09:26','u2','2026-11-06 09:58',{vtype:'付',attach:1}),
      V('记-016','2026-11-07','结转第二批销售成本',[{acc:'5401',dc:'借',amt:750},{acc:'1405',dc:'贷',amt:750}],'u1','2026-11-07 14:19','u1','2026-11-07 14:44',{vtype:'转',attach:0})
    ],
    closeLog:[{month:'2026-10', by:'u1', at:'2026-10-31 18:00', transferId:'记-012'}],
    publicKey:'a7f3d2',
    audit:[]
  };
  S.vouchers.forEach(function(v){
    var who = memberName0(S, v.by);
    S.audit.push({at:v.at, actor:who, action: v.system ? '系统结转' : '制单', target:v.id, detail:v.summary});
    if (v.revAt) S.audit.push({at:v.revAt, actor:memberName0(S, v.revBy), action:'复核通过', target:v.id,
      detail: v.revBy === v.by ? '复核人与制单人相同,如实标注' : v.summary});
  });
  S.audit.push({at:'2026-10-31 18:00', actor:'张三', action:'结账', target:'2026-10',
    detail:'三步校验通过;损益自动结转生成 记-012,当月冻结'});
  S.audit.push({at:'2026-10-31 18:05', actor:'张三', action:'生成公示链接', target:'公示',
    detail:'单密钥只读链接,免登录'});
  S.audit.sort(function(a,b){ return a.at < b.at ? -1 : 1; });
  return S;
}
function memberName0(S, id){
  var m = S.members.filter(function(x){ return x.id === id; })[0];
  return m ? m.name : id;
}

function log(S, actor, action, target, detail){
  S.audit.push({at: nowStamp(), actor:actor, action:action, target:target, detail:detail || ''});
}
function nowStamp(){
  var d = new Date();
  var p = function(n){ return n < 10 ? '0' + n : '' + n; };
  return TODAY + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function effV(S, upto){
  return S.vouchers.filter(function(v){
    return v.status === '已生效' && (!upto || v.date <= upto);
  });
}
function sums(list){
  var m = {};
  list.forEach(function(v){
    v.lines.forEach(function(l){
      var t = m[l.acc] || (m[l.acc] = {d:0, c:0});
      t[l.dc === '借' ? 'd' : 'c'] += c100(l.amt);
    });
  });
  return m;
}
function closedMonths(S){
  return S.closeLog.map(function(c){ return c.month; }).sort();
}
function isClosed(S, month){
  return S.closeLog.some(function(c){ return c.month === month; });
}
function dataMonths(S){
  var set = {};
  S.vouchers.forEach(function(v){ set[monthOf(v.date)] = true; });
  set[monthOf(TODAY)] = true;
  return Object.keys(set).sort();
}
function sumOf(map, code){
  var d = 0, c = 0;
  leafCodes(code).forEach(function(k){
    var s = map[k]; if (s){ d += s.d; c += s.c; }
  });
  return {d:d, c:c};
}
function trialBalance(S, month){
  var start = month + '-01', end = monthEnd(month);
  var open = sums(effV(S, end).filter(function(v){ return v.date < start; }));
  var per  = sums(effV(S, end).filter(function(v){ return v.date >= start; }));
  var rows = [], tpd = 0, tpc = 0, tdb = 0, tdc = 0;
  TOPS.forEach(function(a){
    var o = sumOf(open, a.code), p = sumOf(per, a.code);
    var on = isDebitCls(a.cls) ? o.d - o.c : o.c - o.d;
    var cn = on + (isDebitCls(a.cls) ? p.d - p.c : p.c - p.d);
    if (on !== 0 || p.d !== 0 || p.c !== 0){
      rows.push({code:a.code, name:a.name, cls:a.cls, detail:false,
        o:on, pd:p.d, pc:p.c, c:cn});
      accChildren(a.code).forEach(function(ch){
        var o2 = open[ch.code] || {d:0,c:0}, p2 = per[ch.code] || {d:0,c:0};
        var on2 = isDebitCls(a.cls) ? o2.d - o2.c : o2.c - o2.d;
        var cn2 = on2 + (isDebitCls(a.cls) ? p2.d - p2.c : p2.c - p2.d);
        if (on2 !== 0 || p2.d !== 0 || p2.c !== 0){
          rows.push({code:ch.code, name:ch.name, cls:a.cls, detail:true,
            o:on2, pd:p2.d, pc:p2.c, c:cn2});
        }
      });
      tpd += p.d; tpc += p.c;
      if (cn > 0){ if (isDebitCls(a.cls)) tdb += cn; else tdc += cn; }
      else if (cn < 0){ if (isDebitCls(a.cls)) tdc += -cn; else tdb += -cn; }
    }
  });
  return {rows:rows, tpd:tpd, tpc:tpc, tdb:tdb, tdc:tdc,
    ok: tpd === tpc && tdb === tdc};
}
function pnl(S, from, to){
  var inc = {}, exp = {};
  effV(S, to).forEach(function(v){
    if (v.system || v.date < from) return;
    v.lines.forEach(function(l){
      var cls = ACC[l.acc].cls, t = c100(l.amt) * (l.dc === '贷' ? 1 : -1);
      if (cls === 'inc'){ inc[l.acc] = (inc[l.acc] || 0) + t; }
      else if (cls === 'exp'){ exp[l.acc] = (exp[l.acc] || 0) - t; }
    });
  });
  var incT = 0, expT = 0;
  for (var k in inc) incT += inc[k];
  for (var e in exp) expT += exp[e];
  return {inc:inc, exp:exp, incT:incT, expT:expT, net:incT - expT};
}
function balanceSheet(S, asOf){
  var t = sums(effV(S, asOf));
  var assets = [], liabs = [], eqs = [], aT = 0, lT = 0, eT = 0;
  TOPS.forEach(function(a){
    var s = sumOf(t, a.code); if (!s.d && !s.c) return;
    if (a.cls === 'asset'){ var n = s.d - s.c; if (n !== 0){ assets.push({code:a.code,name:a.name,n:n}); aT += n; } }
    else if (a.cls === 'liab'){ var n2 = s.c - s.d; if (n2 !== 0){ liabs.push({code:a.code,name:a.name,n:n2}); lT += n2; } }
    else if (a.cls === 'eq'){ var n3 = s.c - s.d; if (n3 !== 0){ eqs.push({code:a.code,name:a.name,n:n3}); eT += n3; } }
  });
  var pending = 0;
  TOPS.forEach(function(a){
    var s = sumOf(t, a.code); if (!s.d && !s.c) return;
    if (a.cls === 'inc') pending += s.c - s.d;
    else if (a.cls === 'exp') pending -= s.d - s.c;
  });
  if (pending !== 0){
    eqs.push({code:'—', name:'待结转损益', n:pending});
    eT += pending;
  }
  var rhs = lT + eT;
  return {assets:assets, liabs:liabs, eqs:eqs, aT:aT, lT:lT, eT:eT, pending:pending,
    ok: aT === rhs, diff: aT - rhs};
}
function cashTotal(S, asOf){
  var t = sums(effV(S, asOf)), n = 0;
  LEAVES.forEach(function(a){ if (a.cash && t[a.code]) n += t[a.code].d - t[a.code].c; });
  return n;
}
function ledgerOf(S, code, month){
  var a = ACC[code];
  var codes = leafCodes(code);
  var start = month === 'all' ? null : month + '-01';
  var end = month === 'all' ? null : monthEnd(month);
  var open = 0, rows = [];
  var order = {};
  S.vouchers.forEach(function(v, i){ order[v.id] = i; });
  effV(S, end).forEach(function(v){
    var inPeriod = !start || v.date >= start;
    v.lines.forEach(function(l){
      if (codes.indexOf(l.acc) < 0) return;
      var amt = c100(l.amt);          /* 有符号:红冲为负,方向仍记原方向列 */
      var isD = l.dc === '借';
      if (!inPeriod){ open += isD ? amt : -amt; return; }
      rows.push({date:v.date, id:v.id, summary:v.summary, system:!!v.system,
        d: isD ? amt : 0, c: isD ? 0 : amt});
    });
  });
  rows.sort(function(x, y){
    return x.date === y.date ? order[x.id] - order[y.id] : (x.date < y.date ? -1 : 1);
  });
  var bal = open, dSum = 0, cSum = 0;
  rows.forEach(function(r){ bal += r.d - r.c; dSum += r.d; cSum += r.c; r.bal = bal; });
  return {acc:a, month:month, open:open, rows:rows, dSum:dSum, cSum:cSum, close:bal};
}
function voucherTotal(v){
  var n = 0;
  v.lines.forEach(function(l){ if (l.dc === '借') n += c100(l.amt); });
  return n;
}
function vtypeOf(lines){
  var net = 0;
  lines.forEach(function(l){
    if (ACC[l.acc] && ACC[l.acc].cash) net += c100(l.amt) * (l.dc === '借' ? 1 : -1);
  });
  return net > 0 ? '收' : (net < 0 ? '付' : '转');
}
function vtypeOfV(v){ return v.vtype || vtypeOf(v.lines); }
function pendingIn(S, month){
  return S.vouchers.filter(function(v){
    return v.status === '待复核' && (!month || monthOf(v.date) === month);
  });
}

function assertWritable(S, date){
  var m = monthOf(date);
  if (isClosed(S, m)) return m + ' 已结账,该期间已冻结:录入、复核、红冲均被拒绝';
  var closed = closedMonths(S);
  if (closed.length && m < closed[closed.length - 1])
    return m + ' 早于已结账期间 ' + closed[closed.length - 1] + ',不能入账';
  if (date > TODAY) return '日期不能晚于今天(' + TODAY + ')';
  return null;
}
function nextId(S){
  var n = S.vouchers.length + 1, id;
  do { id = '记-' + ('00' + n).slice(-3); n++; } while (S.vouchers.some(function(v){ return v.id === id; }));
  return id;
}
function insertVoucher(S, v){
  v.id = nextId(S);
  S.vouchers.push(v);
  return v;
}
function createVoucher(S, actorId, payload){
  if (!payload.summary || !payload.summary.trim()) return {ok:false, err:'摘要不能为空'};
  var attach = payload.attach;
  if (attach === undefined || attach === null || attach === '') attach = 0;
  attach = +attach;
  if (!(attach >= 0) || Math.floor(attach) !== attach) return {ok:false, err:'附件张数须为 0 或正整数'};
  var freeze = assertWritable(S, payload.date);
  if (freeze) return {ok:false, err:freeze};
  if (!payload.lines || payload.lines.length < 2) return {ok:false, err:'分录至少两行'};
  var d = 0, c = 0;
  for (var i = 0; i < payload.lines.length; i++){
    var l = payload.lines[i];
    if (!ACC[l.acc]) return {ok:false, err:'第 ' + (i+1) + ' 行科目无效'};
    if (accChildren(l.acc).length) return {ok:false, err:accName(l.acc) + ' 是一级科目,请在明细科目上记账(如 ' + accChildren(l.acc)[0].name + ')'};
    if (!(l.amt > 0)) return {ok:false, err:'第 ' + (i+1) + ' 行金额必须大于 0'};
    if (l.dc === '借') d += c100(l.amt); else if (l.dc === '贷') c += c100(l.amt);
    else return {ok:false, err:'第 ' + (i+1) + ' 行方向无效'};
  }
  if (d !== c) return {ok:false, err:'借贷不平:借方 ' + fmt(d) + ',贷方 ' + fmt(c) + ',差额 ' + fmt(Math.abs(d-c)) + ',不许存'};
  var dup = {};
  for (var j = 0; j < payload.lines.length; j++){
    var key = payload.lines[j].acc + payload.lines[j].dc;
    if (dup[key]) return {ok:false, err:'同一科目同一方向出现两行,请合并'};
    dup[key] = true;
  }
  var v = insertVoucher(S, {
    date:payload.date, summary:payload.summary.trim(), lines:payload.lines,
    status:'待复核', by:actorId, at:nowStamp(), revBy:null, revAt:null,
    vtype: payload.vtype || vtypeOf(payload.lines), attach: attach,
    system:false, reverses:null, rejectNote:null, voidNote:null
  });
  log(S, memberName0(S, actorId), '制单', v.id, v.summary);
  return {ok:true, id:v.id};
}
function reviewVoucher(S, id, actorId, verdict, note){
  var v = S.vouchers.filter(function(x){ return x.id === id; })[0];
  if (!v) return {ok:false, err:'凭证不存在'};
  if (v.status !== '待复核') return {ok:false, err:'只有待复核凭证可以复核'};
  var freeze = assertWritable(S, v.date);
  if (freeze) return {ok:false, err:freeze};
  var who = memberName0(S, actorId);
  if (verdict === 'pass'){
    v.status = '已生效'; v.revBy = actorId; v.revAt = nowStamp();
    log(S, who, '复核通过', v.id, v.revBy === v.by ? '复核人与制单人相同,如实标注' : v.summary);
    return {ok:true, same:v.revBy === v.by};
  } else {
    v.status = '已驳回'; v.revBy = actorId; v.revAt = nowStamp(); v.rejectNote = note || '';
    log(S, who, '复核驳回', v.id, note || v.summary);
    return {ok:true};
  }
}
function reverseVoucher(S, id, actorId, reason){
  var v = S.vouchers.filter(function(x){ return x.id === id; })[0];
  if (!v) return {ok:false, err:'凭证不存在'};
  if (v.status !== '已生效') return {ok:false, err:'只有已生效凭证可以红冲'};
  var freeze = assertWritable(S, v.date);
  if (freeze) return {ok:false, err:freeze};
  var exists = S.vouchers.some(function(x){ return x.reverses === id && (x.status === '待复核' || x.status === '已生效'); });
  if (exists) return {ok:false, err:'该凭证已有红冲凭证(或待复核),不能重复红冲'};
  var lines = v.lines.map(function(l){ return {acc:l.acc, dc:l.dc, amt:-l.amt}; });
  var r = insertVoucher(S, {
    date:v.date, summary:'红冲 ' + v.id + ':' + (reason || v.summary), lines:lines,
    status:'待复核', by:actorId, at:nowStamp(), revBy:null, revAt:null,
    vtype: vtypeOfV(v), attach: 0,
    system:false, reverses:id, rejectNote:null, voidNote:null
  });
  log(S, memberName0(S, actorId), '红冲制单', r.id, '冲销 ' + v.id + ' · ' + (reason || v.summary));
  return {ok:true, id:r.id};
}
function canClose(S, month){
  var start = month + '-01', end = monthEnd(month);
  var pend = pendingIn(S, month);
  var tb = trialBalance(S, month);
  var bs = balanceSheet(S, end);
  var earlier = dataMonths(S).filter(function(m){ return m < month && !isClosed(S, m); });
  return {
    month:month,
    preOk: earlier.length === 0,
    preDetail: earlier.length ? earlier.join('、') + ' 尚未结账,须先结前序月份' : '前序月份均已结账',
    checks:[
      {label:'当月无待复核凭证', pass: pend.length === 0,
       detail: pend.length === 0 ? '当月凭证全部复核完毕' : pend.length + ' 笔待复核:' + pend.map(function(v){return v.id;}).join('、')},
      {label:'科目余额表:本期发生借 = 贷', pass: tb.tpd === tb.tpc,
       detail:'借方发生 ' + fmt(tb.tpd) + ' / 贷方发生 ' + fmt(tb.tpc)},
      {label:'期末恒等式:资产 = 负债 + 权益', pass: bs.ok,
       detail: fmt(bs.aT) + ' = ' + fmt(bs.lT) + ' + ' + fmt(bs.eT)}
    ]
  };
}
function closeMonth(S, month, actorId){
  if (isClosed(S, month)) return {ok:false, err:month + ' 已结账,不能重复结账;如需调整请先反结账'};
  var cc = canClose(S, month);
  if (!cc.preOk) return {ok:false, err:cc.preDetail};
  var failed = cc.checks.filter(function(c){ return !c.pass; });
  if (failed.length) return {ok:false, err:'结账校验未通过:' + failed.map(function(f){return f.label;}).join('、')};
  var end = monthEnd(month), date = end > TODAY ? TODAY : end;
  var p = pnl(S, month + '-01', end);
  var transferId = null;
  if (p.net !== 0){
    var lines = [], dn = 0, cn = 0;
    ACCOUNTS.forEach(function(a){
      if (a.cls === 'inc' && p.inc[a.code]){
        var n = p.inc[a.code];
        if (n > 0){ lines.push({acc:a.code, dc:'借', amt:n/100}); dn += n; }
        else if (n < 0){ lines.push({acc:a.code, dc:'贷', amt:-n/100}); cn += -n; }
      }
      if (a.cls === 'exp' && p.exp[a.code]){
        var e = p.exp[a.code];
        if (e > 0){ lines.push({acc:a.code, dc:'贷', amt:e/100}); cn += e; }
        else if (e < 0){ lines.push({acc:a.code, dc:'借', amt:-e/100}); dn += -e; }
      }
    });
    if (p.net > 0){ lines.push({acc:'3103', dc:'贷', amt:p.net/100}); cn += p.net; }
    else { lines.push({acc:'3103', dc:'借', amt:-p.net/100}); dn += -p.net; }
    if (dn !== cn) return {ok:false, err:'结转凭证生成异常,已中止'};
    var tv = insertVoucher(S, {
      date:date, summary:'系统结转:' + month + ' 损益结转至本年利润', lines:lines,
      status:'已生效', by:actorId, at:nowStamp(), revBy:actorId, revAt:nowStamp(),
      vtype:'转', attach:0,
      system:true, reverses:null, rejectNote:null, voidNote:null
    });
    transferId = tv.id;
    log(S, memberName0(S, actorId), '系统结转', tv.id, '结账自动生成');
  }
  S.closeLog.push({month:month, by:actorId, at:nowStamp(), transferId:transferId});
  log(S, memberName0(S, actorId), '结账', month,
    '三步校验通过' + (transferId ? ';损益结转生成 ' + transferId : ';当月损益为零,无结转凭证') + ',当月冻结');
  return {ok:true, transferId:transferId};
}
function uncloseLast(S, actorId){
  if (!S.closeLog.length) return {ok:false, err:'没有已结账期间'};
  var last = S.closeLog[S.closeLog.length - 1];
  if (last.transferId){
    var tv = S.vouchers.filter(function(v){ return v.id === last.transferId; })[0];
    if (tv){ tv.status = '已作废'; tv.voidNote = '反结账作废,不进入报表'; }
  }
  S.closeLog.pop();
  log(S, memberName0(S, actorId), '反结账', last.month,
    (last.transferId ? last.transferId + ' 转为作废,' : '') + '当月恢复可入账');
  return {ok:true, month:last.month};
}
function memberAdd(S, actorId, name, role){
  if (!name || !name.trim()) return {ok:false, err:'姓名不能为空'};
  if (S.members.some(function(m){ return m.name === name.trim(); })) return {ok:false, err:'成员已存在'};
  var id = 'u' + (S.members.length + 1 + Math.floor(Math.random()*90));
  S.members.push({id:id, name:name.trim(), role:role});
  log(S, memberName0(S, actorId), '成员新增', name.trim(), role === 'admin' ? '管理员' : '只读成员');
  return {ok:true};
}
function memberRole(S, actorId, targetId, role){
  var m = S.members.filter(function(x){ return x.id === targetId; })[0];
  if (!m) return {ok:false, err:'成员不存在'};
  if (m.role === 'admin' && role !== 'admin' &&
      S.members.filter(function(x){ return x.role === 'admin'; }).length === 1)
    return {ok:false, err:'至少保留一名管理员'};
  var from = m.role === 'admin' ? '管理员' : '只读成员';
  m.role = role;
  log(S, memberName0(S, actorId), '成员角色变更', m.name, from + ' → ' + (role === 'admin' ? '管理员' : '只读成员'));
  return {ok:true};
}
function memberRemove(S, actorId, targetId){
  var m = S.members.filter(function(x){ return x.id === targetId; })[0];
  if (!m) return {ok:false, err:'成员不存在'};
  if (m.id === actorId) return {ok:false, err:'不能移除自己'};
  if (m.role === 'admin' && S.members.filter(function(x){ return x.role === 'admin'; }).length === 1)
    return {ok:false, err:'至少保留一名管理员'};
  S.members = S.members.filter(function(x){ return x.id !== targetId; });
  log(S, memberName0(S, actorId), '成员移除', m.name, m.role === 'admin' ? '管理员' : '只读成员');
  return {ok:true};
}
function regenKey(S, actorId){
  var k = '';
  for (var i = 0; i < 6; i++) k += '0123456789abcdef'[Math.floor(Math.random()*16)];
  S.publicKey = k;
  log(S, memberName0(S, actorId), '公示密钥重新生成', '公示', '旧链接立即失效');
  return {ok:true, key:k};
}

/* Node 导出(浏览器端引入本文件时忽略) */
if (typeof module !== 'undefined' && module.exports){
  module.exports = {
    TODAY: TODAY, ACCOUNTS: ACCOUNTS, ACC: ACC, CLS_NAME: CLS_NAME,
    CLS_ORDER: CLS_ORDER, TOPS: TOPS, LEAVES: LEAVES,
    seedState: seedState, memberName0: memberName0, effV: effV, sums: sums,
    closedMonths: closedMonths, isClosed: isClosed, dataMonths: dataMonths,
    sumOf: sumOf, trialBalance: trialBalance, pnl: pnl, balanceSheet: balanceSheet,
    cashTotal: cashTotal, ledgerOf: ledgerOf, voucherTotal: voucherTotal,
    vtypeOf: vtypeOf, vtypeOfV: vtypeOfV, pendingIn: pendingIn,
    assertWritable: assertWritable, nextId: nextId, insertVoucher: insertVoucher,
    createVoucher: createVoucher, reviewVoucher: reviewVoucher,
    reverseVoucher: reverseVoucher, canClose: canClose, closeMonth: closeMonth,
    uncloseLast: uncloseLast, memberAdd: memberAdd, memberRole: memberRole,
    memberRemove: memberRemove, regenKey: regenKey,
    isDebitCls: isDebitCls, accChildren: accChildren, leafCodes: leafCodes,
    c100: c100, fmt: fmt, monthOf: monthOf, monthEnd: monthEnd,
    accName: accName, accShort: accShort
  };
}
