"""
Beauty Star Orders - Server (Python fallback)
Run this if Node.js is not installed.
Requires: pip install pyodbc
"""
import http.server, json, urllib.parse, sys
from datetime import datetime
try:
    import pyodbc
except ImportError:
    print("Run: pip install pyodbc"); sys.exit(1)

SERVER   = r'.\SQLEXPRESS'
DATABASE = 'ITSDryStock'
PORT     = 3001
DRIVERS  = ['ODBC Driver 17 for SQL Server','ODBC Driver 18 for SQL Server','SQL Server']

STOCK_SQL = """
  SELECT bar.bar_barcode AS code, bp.bxp_instock AS qty
  FROM   BranchProducts bp
  JOIN   Products   p   ON p.prd_pk    = bp.bxp_prdfk
  JOIN   Barcodes   bar ON bar.bar_prdfk = bp.bxp_prdfk AND bar.bar_default = 1
  JOIN   Branches   br  ON br.brn_pk   = bp.bxp_brnfk
  WHERE  br.brn_name = ? AND bp.bxp_inactive = 0
    AND  bar.bar_deleted = 0 AND p.prd_deleted = 0
"""

BRANCHES_SQL = "SELECT brn_pk, brn_number, brn_name FROM Branches WHERE brn_Active = 1 ORDER BY brn_name"

def connect():
    for d in DRIVERS:
        try:
            return pyodbc.connect(f'DRIVER={{{d}}};SERVER={SERVER};DATABASE={DATABASE};Trusted_Connection=yes;TrustServerCertificate=yes;',timeout=5)
        except: continue
    raise Exception("Could not connect. Download ODBC driver from https://aka.ms/downloadmsodbcsql")

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self,f,*a): print(f"[{datetime.now().strftime('%H:%M:%S')}] {f%a}")
    def send_json(self,code,data):
        b=json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type','application/json')
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Content-Length',len(b))
        self.end_headers(); self.wfile.write(b)
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Methods','GET,OPTIONS')
        self.end_headers()
    def do_GET(self):
        parsed=urllib.parse.urlparse(self.path)
        params=urllib.parse.parse_qs(parsed.query)
        if parsed.path=='/health':
            self.send_json(200,{'status':'ok'}); return
        if parsed.path=='/branches':
            try:
                c=connect(); cur=c.cursor(); cur.execute(BRANCHES_SQL)
                rows=[{'brn_pk':r[0],'brn_number':r[1],'brn_name':r[2]} for r in cur.fetchall()]
                c.close(); self.send_json(200,rows)
            except Exception as e: self.send_json(500,{'error':str(e)})
            return
        if parsed.path=='/stock':
            store=(params.get('store',[''])[0])
            if not store: self.send_json(400,{'error':'Missing ?store='}); return
            try:
                c=connect(); cur=c.cursor()
                cur.execute(STOCK_SQL, store)
                rows=cur.fetchall()
                if not rows:
                    cur.execute(STOCK_SQL.replace('br.brn_name = ?','br.brn_name LIKE ?'), f'%{store}%')
                    rows=cur.fetchall()
                c.close()
                m={r[0].strip():float(r[1] or 0) for r in rows if r[0]}
                print(f"  -> {store}: {len(rows)} products")
                self.send_json(200,m)
            except Exception as e: self.send_json(500,{'error':str(e)})
            return
        self.send_json(404,{'error':'Try /health /branches /stock?store=Name'})

if __name__=='__main__':
    s=http.server.HTTPServer(('127.0.0.1',PORT),H)
    print(f"\n✅  Beauty Star Orders server running")
    print(f"    http://localhost:{PORT}/branches")
    print(f"    http://localhost:{PORT}/stock?store=StoreName\n")
    try: s.serve_forever()
    except KeyboardInterrupt: print('\nStopped.'); s.server_close()
