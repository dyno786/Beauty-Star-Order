/**
 * Beauty Star Orders - Server v4
 * Fixes: Windows Auth, TCP port, named instance
 */
const http = require('http');
const url  = require('url');
const sql  = require('mssql');
const fs   = require('fs');
const path = require('path');

const PORT    = 3001;
const LOG_CSV = path.join(__dirname, 'error-log.csv');

function writeLog(type, store, message){
  if(!fs.existsSync(LOG_CSV))
    fs.writeFileSync(LOG_CSV, 'Date,Time,Type,Store,Message\n');
  const now  = new Date();
  const safe = s => `"${String(s).replace(/"/g,'""')}"`;
  fs.appendFileSync(LOG_CSV,
    `${safe(now.toLocaleDateString('en-GB'))},${safe(now.toLocaleTimeString('en-GB'))},${safe(type)},${safe(store||'')},${safe(message)}\n`
  );
  console.log(`[${type}] ${store||''} ${message}`);
}

// ── TRY MULTIPLE CONNECTION CONFIGS ───────────────────────────────────────
const CONFIGS = [
  // Works on ANY branch PC — localhost so same files work everywhere
  { server:'localhost', options:{ instanceName:'SQLEXPRESS', trustServerCertificate:true, encrypt:false }, user:'beautystar', password:'Bs2024!orders' },
  { server:'127.0.0.1', options:{ instanceName:'SQLEXPRESS', trustServerCertificate:true, encrypt:false }, user:'beautystar', password:'Bs2024!orders' },
  { server:'localhost\SQLEXPRESS', options:{ trustServerCertificate:true, encrypt:false }, user:'beautystar', password:'Bs2024!orders' },
  { server:'localhost', options:{ instanceName:'SQLEXPRESS', trustedConnection:true, trustServerCertificate:true, encrypt:false } },
  { server:'localhost\SQLEXPRESS', options:{ trustedConnection:true, trustServerCertificate:true, encrypt:false } },
];

const BASE = { database:'ITSDryStock', pool:{ max:5, min:0, idleTimeoutMillis:30000 } };

let pool = null;
let connectedConfig = null;

async function getPool(){
  if(pool) return pool;
  for(const cfg of CONFIGS){
    const full = { ...BASE, ...cfg, options:{ ...BASE.options, ...cfg.options } };
    const label = `${full.server}${full.options.instanceName?'\\'+full.options.instanceName:''}:${full.port||'auto'}`;
    try{
      writeLog('CONNECT','',`Trying ${label}...`);
      pool = await sql.connect(full);
      connectedConfig = label;
      writeLog('CONNECT','',`SUCCESS via ${label}`);
      return pool;
    }catch(e){
      writeLog('CONNECT_FAIL','',`${label}: ${e.message.split('\n')[0]}`);
      pool = null;
      try{ await sql.close(); }catch(x){}
    }
  }
  throw new Error('Could not connect — see error-log.csv for details');
}

const STOCK_SQL = `
  SELECT spr.spr_stkcode AS code, bp.bxp_instock AS qty
  FROM   BranchProducts bp
  JOIN   Products          p   ON p.prd_pk      = bp.bxp_prdfk
  JOIN   SupplierProducts  spr ON spr.spr_prdfk  = bp.bxp_prdfk AND spr.spr_main=1 AND spr.spr_inactive=0
  JOIN   Branches          br  ON br.brn_pk     = bp.bxp_brnfk
  WHERE  br.brn_name = @store AND bp.bxp_inactive=0 AND p.prd_deleted=0
    AND  spr.spr_stkcode IS NOT NULL AND spr.spr_stkcode != ''`;

const BRANCHES_SQL = `SELECT brn_pk, brn_number, brn_name FROM Branches ORDER BY brn_name`;

const ALL_SQL = `
  SELECT br.brn_name AS store, spr.spr_stkcode AS code, bp.bxp_instock AS qty
  FROM   BranchProducts bp
  JOIN   Products          p   ON p.prd_pk      = bp.bxp_prdfk
  JOIN   SupplierProducts  spr ON spr.spr_prdfk  = bp.bxp_prdfk AND spr.spr_main=1 AND spr.spr_inactive=0
  JOIN   Branches          br  ON br.brn_pk     = bp.bxp_brnfk
  WHERE  bp.bxp_inactive=0 AND p.prd_deleted=0
    AND  spr.spr_stkcode IS NOT NULL AND spr.spr_stkcode != ''`;

const httpServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS'){ res.writeHead(204); res.end(); return; }

  const p = url.parse(req.url, true);

  if(p.pathname==='/health'){
    let dbOk=false;
    try{ await getPool(); dbOk=true; }catch(e){}
    res.writeHead(200);
    res.end(JSON.stringify({ status:'ok', db:dbOk?'connected':'error', via:connectedConfig||'none', time:new Date().toISOString() }));
    return;
  }

  if(p.pathname==='/branches'){
    try{
      const db=await getPool();
      const r=await db.request().query(BRANCHES_SQL);
      writeLog('INFO','',`${r.recordset.length} branches returned`);
      res.writeHead(200); res.end(JSON.stringify(r.recordset));
    }catch(e){ pool=null; writeLog('ERROR','branches',e.message); res.writeHead(500); res.end(JSON.stringify({error:e.message})); }
    return;
  }

  if(p.pathname==='/stock'){
    const store=p.query.store;
    if(!store){ res.writeHead(400); res.end(JSON.stringify({error:'Missing ?store='})); return; }
    try{
      const db=await getPool();
      let r1=db.request(); r1.input('store',sql.NVarChar,store);
      let rows=(await r1.query(STOCK_SQL)).recordset;
      if(!rows.length){
        let r2=db.request(); r2.input('store',sql.NVarChar,`%${store}%`);
        rows=(await r2.query(STOCK_SQL.replace('br.brn_name = @store','br.brn_name LIKE @store'))).recordset;
      }
      const map={};
      rows.forEach(r=>{ if(r.code) map[r.code.trim()]=parseFloat(r.qty)||0; });
      writeLog('STOCK',store,`${rows.length} products returned`);
      res.writeHead(200); res.end(JSON.stringify(map));
    }catch(e){ pool=null; writeLog('ERROR',store,e.message); res.writeHead(500); res.end(JSON.stringify({error:e.message})); }
    return;
  }

  if(p.pathname==='/stock/all'){
    try{
      const db=await getPool();
      const rows=(await db.request().query(ALL_SQL)).recordset;
      const out={};
      rows.forEach(r=>{ if(!out[r.store])out[r.store]={}; out[r.store][r.code.trim()]=parseFloat(r.qty)||0; });
      writeLog('STOCK','ALL',`${rows.length} rows, ${Object.keys(out).length} stores`);
      res.writeHead(200); res.end(JSON.stringify(out));
    }catch(e){ pool=null; writeLog('ERROR','all',e.message); res.writeHead(500); res.end(JSON.stringify({error:e.message})); }
    return;
  }

  if(p.pathname==='/log'){
    if(!fs.existsSync(LOG_CSV)) fs.writeFileSync(LOG_CSV,'Date,Time,Type,Store,Message\n');
    res.setHeader('Content-Type','text/csv');
    res.setHeader('Content-Disposition','attachment; filename="error-log.csv"');
    res.writeHead(200); res.end(fs.readFileSync(LOG_CSV,'utf8'));
    return;
  }

  res.writeHead(404); res.end(JSON.stringify({error:'Try /health /branches /stock?store=Name /stock/all /log'}));
});

httpServer.listen(PORT,'0.0.0.0',()=>{
  writeLog('START','',`Server on port ${PORT}`);
  console.log(`\n✅  Beauty Star Orders server running`);
  console.log(`    http://127.0.0.1:${PORT}/health`);
  console.log(`    http://127.0.0.1:${PORT}/branches`);
  console.log(`    http://127.0.0.1:${PORT}/stock?store=Chapeltown`);
  console.log(`    error-log.csv: ${LOG_CSV}\n`);
  console.log(`[*] KEEP THIS WINDOW OPEN\n`);
});

httpServer.on('error',e=>{
  if(e.code==='EADDRINUSE'){ writeLog('ERROR','','Port '+PORT+' already in use'); console.log('\n[!] Port already in use — close the other window\n'); }
  else writeLog('ERROR','','Server: '+e.message);
  process.exit(1);
});

process.on('SIGINT',async()=>{ writeLog('STOP','','Shutdown'); if(pool)await pool.close(); process.exit(0); });
