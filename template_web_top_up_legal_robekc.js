# ROBEKC Top-up Web — Template (Legal-ready)

This single-file project bundle contains a minimal, secure, and local-ready top-up website template (front-end + Node.js backend + SQLite). It's designed to be easy to run locally and extend to a real payment gateway later. It includes basic anti-abuse, simple admin panel, and clear spots to plug an official payment provider.

---

## Project structure

```
/robekc-topup/
  ├─ package.json
  ├─ server.js            # Express backend
  ├─ db.sqlite            # created on first run
  ├─ /public
  │    ├─ index.html      # Customer top-up page
  │    ├─ success.html
  │    ├─ admin.html
  │    └─ styles.css
  └─ README.md
```

---

## package.json

```json
{
  "name": "robekc-topup",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "sqlite3": "^5.1.6",
    "helmet": "^7.0.0",
    "express-rate-limit": "^6.8.0",
    "body-parser": "^1.20.2",
    "express-session": "^1.17.3",
    "bcrypt": "^5.1.0",
    "uuid": "^9.0.0"
  }
}
```

---

## server.js

```javascript
// Minimal top-up backend with SQLite. Replace PAYMENT/GATEWAY placeholders with real provider SDKs.
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set true when using HTTPS
}));

// Basic rate limiter
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use(limiter);

// Init DB
const DBSOURCE = path.join(__dirname, 'db.sqlite');
const db = new sqlite3.Database(DBSOURCE, (err) => {
  if (err) return console.error(err.message);
  console.log('Connected to SQLite database');
});

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user TEXT,
    game TEXT,
    amount INTEGER,
    status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT
  )`, () => {
    // create default admin if none
    db.get('SELECT COUNT(*) as c FROM admins', (e, row) => {
      if (row && row.c === 0) {
        const defaultUser = 'admin';
        const defaultPass = 'changeit';
        bcrypt.hash(defaultPass, 10, (err, hash) => {
          if (!err) db.run('INSERT INTO admins(username,password_hash) VALUES(?,?)', [defaultUser, hash]);
        });
      }
    });
  });
});

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/success', (req, res) => res.sendFile(path.join(__dirname, 'public', 'success.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// API: Create top-up order (customer)
app.post('/api/topup', (req, res) => {
  // Basic validation
  const { user, game, amount } = req.body;
  if (!user || !game || !amount) return res.status(400).json({ error: 'Missing fields' });
  const numericAmount = parseInt(amount, 10);
  if (isNaN(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });

  // Create order
  const id = uuidv4();
  db.run('INSERT INTO orders(id,user,game,amount,status) VALUES(?,?,?,?,?)', [id, user, game, numericAmount, 'PENDING'], (err) => {
    if (err) return res.status(500).json({ error: 'DB error' });

    // TODO: Integrate real payment provider here. For now we return a mock payment URL.
    const mockPaymentUrl = `${req.protocol}://${req.get('host')}/success?order=${id}`;
    res.json({ orderId: id, paymentUrl: mockPaymentUrl });
  });
});

// API: Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing' });
  db.get('SELECT * FROM admins WHERE username = ?', [username], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB' });
    if (!row) return res.status(401).json({ error: 'Unauthorized' });
    bcrypt.compare(password, row.password_hash, (e, ok) => {
      if (ok) {
        req.session.admin = { id: row.id, username: row.username };
        res.json({ ok: true });
      } else res.status(401).json({ error: 'Unauthorized' });
    });
  });
});

// API: Admin fetch orders (requires session)
app.get('/api/admin/orders', (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: 'unauth' });
  db.all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200', (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB' });
    res.json({ orders: rows });
  });
});

// API: Mock webhook to mark paid (for testing)
app.post('/api/webhook/mock-pay', (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'missing orderId' });
  db.run('UPDATE orders SET status = ? WHERE id = ?', ['PAID', orderId], function(err) {
    if (err) return res.status(500).json({ error: 'DB' });
    return res.json({ ok: true });
  });
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
```

---

## public/index.html

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>ROBEKC Top-up</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="card">
    <h1>Top-up ROBEKC</h1>
    <form id="topupForm">
      <label>Nama / ID pemain<input name="user" required></label>
      <label>Game / Paket<select name="game" required>
        <option value="ROBEKC-COIN-100">Coin 100</option>
        <option value="ROBEKC-COIN-500">Coin 500</option>
      </select></label>
      <label>Jumlah (Rp)<input name="amount" type="number" required></label>
      <button type="submit">Bayar</button>
    </form>
    <div id="message"></div>
  </main>

  <script>
    const form = document.getElementById('topupForm');
    const msg = document.getElementById('message');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const payload = { user: data.get('user'), game: data.get('game'), amount: data.get('amount') };
      msg.textContent = 'Membuat order...';
      try {
        const res = await fetch('/api/topup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const j = await res.json();
        if (res.ok) {
          msg.innerHTML = `Order dibuat: <b>${j.orderId}</b>. Arahkan pelanggan ke payment URL.`;
          // For demo, auto-redirect to mock payment
          window.location.href = j.paymentUrl;
        } else {
          msg.textContent = j.error || 'Error';
        }
      } catch (err) { msg.textContent = 'Network error'; }
    });
  </script>
</body>
</html>
```

---

## public/success.html

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Payment Success</title><link rel="stylesheet" href="/styles.css"></head>
<body>
  <main class="card"><h1>Pembayaran Sukses (Mock)</h1>
  <p>Terima kasih. Ini halaman mock — sistem akan menandai order sebagai PAID jika admin memverifikasi atau webhook nyata terpasang.</p>
  <p><a href="/">Kembali ke halaman top-up</a></p>
  </main>
</body>
</html>
```

---

## public/admin.html

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin ROBEKC</title><link rel="stylesheet" href="/styles.css"></head>
<body>
  <main class="card">
    <h1>Admin Panel</h1>
    <form id="loginForm">
      <label>Username<input name="username" required></label>
      <label>Password<input name="password" type="password" required></label>
      <button type="submit">Login</button>
    </form>
    <section id="adminArea" style="display:none">
      <button id="logout">Logout</button>
      <h2>Recent Orders</h2>
      <div id="orders"></div>
    </section>
  </main>

  <script>
    const loginForm = document.getElementById('loginForm');
    const adminArea = document.getElementById('adminArea');
    const ordersDiv = document.getElementById('orders');
    const logoutBtn = document.getElementById('logout');

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(loginForm);
      const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ username: f.get('username'), password: f.get('password') }) });
      if (res.ok) { loginForm.style.display='none'; adminArea.style.display='block'; loadOrders(); }
      else alert('Login failed');
    });

    async function loadOrders(){
      const r = await fetch('/api/admin/orders');
      if (r.ok) { const j = await r.json(); ordersDiv.innerHTML = '<pre>'+JSON.stringify(j.orders, null, 2) +'</pre>'; }
      else { ordersDiv.textContent = 'Unauthorized or error'; }
    }

    logoutBtn.addEventListener('click', async () => { await fetch('/api/admin/logout',{method:'POST'}); location.reload(); });
  </script>
</body>
</html>
```

---

## public/styles.css

```css
body{font-family:system-ui,Arial;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9;margin:0}
.card{background:white;padding:24px;border-radius:12px;box-shadow:0 6px 18px rgba(2,6,23,0.08);width:320px}
label{display:block;margin:8px 0}
input,select,button{width:100%;padding:8px;margin-top:6px;border-radius:8px;border:1px solid #ddd}
button{cursor:pointer}
```

---

## README.md (quick start)

```
# ROBEKC Top-up - Local Demo

1. Node.js >= 18 recommended.
2. unzip/copy project.
3. npm install
4. npm start
5. Open http://localhost:3000
6. Admin panel: http://localhost:3000/admin
   Default admin credentials: username `admin` password `changeit` (change immediately)

## To go legal / production-ready (checklist)
- Integrate a trusted payment gateway (use official SDK, HTTPS, and server-side signature verification).
- Add full HTTPS (TLS) via reverse proxy (nginx) or platform (Vercel/Heroku) and set session cookie secure flag.
- Implement KYC / ID verification if required by local regulations for top-up businesses.
- Add invoices/receipts and record for tax reporting.
- Clear Terms of Service and Refund Policy (Indonesian language if operating in Indonesia).
- Keep logs and implement fraud detection/limits per user.
- Use environment variables for secrets; never commit credentials.
- Regularly patch dependencies and run security scans.

## Notes
This template is intentionally minimal. Replace the mock payment flow with your real payment gateway integration and add the required legal pages and KYC flows for full compliance.
```

---

# End of template

