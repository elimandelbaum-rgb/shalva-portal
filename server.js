// טוען משתני סביבה מקובץ .env אם קיים (לא חובה)
try { require('dotenv').config(); } catch (e) {}

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const { initDB, getDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const db = initDB();

// יצירת תיקיות uploads מסודרות
const uploadRoot = path.join(__dirname, 'public', 'uploads');
['uploads','public',uploadRoot].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); });

// הגדרת multer — קבצים נשמרים ב-public/uploads/YYYY-MM/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const now = new Date();
    const subDir = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const dir = path.join(uploadRoot, subDir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // אבטח שם קובץ + הוסף חותמת זמן
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9א-ת\-_]/g,'_').substring(0, 40);
    const ts = Date.now();
    cb(null, `${ts}-${safe}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024 }, // 60MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mov|pdf)$/i;
    if (!allowed.test(file.originalname)) return cb(new Error('סוג קובץ לא נתמך'));
    cb(null, true);
  }
});


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Session store פשוט
app.use(session({
  secret: process.env.SESSION_SECRET || 'shalva-portal-2026-secret',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { 
    maxAge: 24*60*60*1000,
    secure: false,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

const auth = (req,res,next) => req.session.user ? next() : res.status(401).json({error:'Unauthorized'});
const admin = (req,res,next) => ['adm','super'].includes(req.session.user?.role) ? next() : res.status(403).json({error:'Forbidden'});
const superOnly = (req,res,next) => req.session.user?.role==='super' ? next() : res.status(403).json({error:'Super admin only'});
const isManager = (u) => ['adm','super','mgr','hr'].includes(u?.role);

function safeUser(u) {
  const {password:_,...s} = u;
  try { s.menu = JSON.parse(s.menu||'[]'); } catch { s.menu=[]; }
  return s;
}

// ── DEPARTMENTS ──
app.get('/api/departments', auth, (req,res) => {
  const depts = db.prepare('SELECT d.*, u.name as manager_name FROM departments d LEFT JOIN users u ON d.manager_id=u.id').all();
  res.json(depts);
});

app.post('/api/departments', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  const {name,manager_id,description,color} = req.body;
  if (!name) return res.status(400).json({error:'שם חובה'});
  try {
    const r = db.prepare('INSERT INTO departments(name,manager_id,description,color) VALUES(?,?,?,?)').run(name,manager_id||0,description||'',color||'#7B2D8B');
    res.json({id:r.lastInsertRowid,name,manager_id,description,color});
  } catch(e) { res.status(400).json({error:'מחלקה קיימת'}); }
});

app.put('/api/departments/:id', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  const {name,manager_id,description,color} = req.body;
  db.prepare('UPDATE departments SET name=?,manager_id=?,description=?,color=? WHERE id=?').run(name,manager_id||0,description||'',color||'#7B2D8B',req.params.id);
  // עדכן dept של כל עובדי המחלקה
  if (name) db.prepare('UPDATE users SET dept=? WHERE dept=(SELECT name FROM departments WHERE id=?)').run(name,req.params.id);
  res.json({ok:true});
});

app.delete('/api/departments/:id', auth, (req,res) => {
  if (req.session.user?.role!=='super') return res.status(403).json({error:'Super admin only'});
  db.prepare('DELETE FROM departments WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// ── AUTH ──
app.post('/api/login', (req,res) => {
  const {username,password} = req.body;
  const u = db.prepare('SELECT * FROM users WHERE username=? AND active=1').get(username);
  if (!u || u.password !== password) return res.status(401).json({error:'Invalid credentials'});
  req.session.user = safeUser(u);
  res.json({user: safeUser(u)});
});
app.post('/api/logout', (req,res) => { req.session.destroy(); res.json({ok:true}); });
app.get('/api/me', auth, (req,res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.user.id);
  if (!u) return res.status(404).json({error:'Not found'});
  res.json(safeUser(u));
});

// ── USERS ──
app.get('/api/users', auth, (req,res) => {
  const me = req.session.user;
  if (['super','adm','hr'].includes(me.role)) {
    res.json(db.prepare("SELECT * FROM users WHERE active=1 ORDER BY name").all().map(safeUser));
  } else if (me.role === 'mgr') {
    res.json(db.prepare("SELECT * FROM users WHERE dept=? AND active=1 ORDER BY name").all(me.dept).map(safeUser));
  } else {
    res.json([safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(me.id))]);
  }
});
app.get('/api/users/:id', auth, (req,res) => {
  const id = parseInt(req.params.id);
  const me = req.session.user;
  if (me.role !== 'adm' && me.id !== id) return res.status(403).json({error:'Forbidden'});
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({error:'Not found'});
  res.json(safeUser(u));
});
app.post('/api/users', admin, (req,res) => {
  const f = req.body;
  if (!f.username||!f.name) return res.status(400).json({error:'Missing required'});
  if (db.prepare('SELECT id FROM users WHERE username=?').get(f.username)) return res.status(409).json({error:'Username exists'});
  const av = f.name.split(' ').map(w=>w[0]).join('').substring(0,2);
  const info = db.prepare(`INSERT INTO users(username,password,role,name,name_en,email,phone,extension,dept,title,title_en,salary,vacation_days,sick_days,reserve_days,hire_date,birth_date,id_number,address,city,bank,bank_branch,bank_account,emergency_name,emergency_phone,employment_type,scope_pct,color,avatar,menu,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(f.username,f.password||'1234',f.role||'emp',f.name,f.name_en||'',f.email||'',f.phone||'',f.extension||'',f.dept||'',f.title||'',f.title_en||'',parseInt(f.salary)||0,parseInt(f.vacation_days)||16,parseInt(f.sick_days)||10,parseInt(f.reserve_days)||0,f.hire_date||'',f.birth_date||'',f.id_number||'',f.address||'',f.city||'',f.bank||'',f.bank_branch||'',f.bank_account||'',f.emergency_name||'',f.emergency_phone||'',f.employment_type||'full',parseInt(f.scope_pct)||100,f.color||'#7C5CFC',av,JSON.stringify(f.menu||['home','feed','chat','req','train','forms','directory']),f.notes||'');
  res.json({id:info.lastInsertRowid,ok:true});
});
app.put('/api/users/:id', auth, (req,res) => {
  const id = parseInt(req.params.id);
  const me = req.session.user;
  if (me.role!=='adm' && me.role!=='super' && me.id!==id) return res.status(403).json({error:'Forbidden'});
  const f = req.body;
  const FIELDS = ['name','name_en','email','phone','extension','dept','title','title_en','salary','vacation_days','sick_days','reserve_days','hire_date','birth_date','id_number','address','city','bank','bank_branch','bank_account','emergency_name','emergency_phone','employment_type','scope_pct','color','notes'];
  if (me.role==='adm' || me.role==='super') FIELDS.push('username','active','role');
  let sets=[], vals=[];
  for (const field of FIELDS) {
    if (f[field] !== undefined) { sets.push(`${field}=?`); vals.push(f[field]); }
  }
  if (f.menu !== undefined) { sets.push('menu=?'); vals.push(JSON.stringify(f.menu)); }
  if (f.password) { sets.push('password=?'); vals.push(f.password); }
  if (f.name) { const av=f.name.split(' ').map(w=>w[0]).join('').substring(0,2); sets.push('avatar=?'); vals.push(av); }
  sets.push("updated_at=datetime('now')");
  vals.push(id);
  db.prepare(`UPDATE users SET ${sets.join(',')} WHERE id=?`).run(...vals);
  if (me.id===id) { const upd=db.prepare('SELECT * FROM users WHERE id=?').get(id); req.session.user=safeUser(upd); }
  res.json({ok:true});
});
app.delete('/api/users/:id', admin, (req,res) => {
  db.prepare('UPDATE users SET active=0 WHERE id=?').run(parseInt(req.params.id));
  res.json({ok:true});
});

// ── REQUESTS ──
app.get('/api/requests', auth, (req,res) => {
  const me = req.session.user;
  if (['super','adm','hr'].includes(me.role)) {
    res.json(db.prepare('SELECT r.*,u.name as user_name,u.dept as user_dept FROM requests r JOIN users u ON r.user_id=u.id ORDER BY r.created_at DESC').all());
  } else if (me.role === 'mgr') {
    res.json(db.prepare('SELECT r.*,u.name as user_name,u.dept as user_dept FROM requests r JOIN users u ON r.user_id=u.id WHERE u.dept=? ORDER BY r.created_at DESC').all(me.dept));
  } else {
    res.json(db.prepare('SELECT r.*,u.name as user_name FROM requests r JOIN users u ON r.user_id=u.id WHERE r.user_id=? ORDER BY r.created_at DESC').all(me.id));
  }
});
app.post('/api/requests', auth, (req,res) => {
  const me = req.session.user;
  const f = req.body;
  if (!f.subject) return res.status(400).json({error:'Missing subject'});
  const info = db.prepare('INSERT INTO requests(user_id,type,dept,subject,details,status,priority,current_salary,requested_salary,steps,current_step,copy_email) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(me.id,f.type||'general',f.dept||'',f.subject,f.details||'','pending',f.priority||'normal',parseInt(f.current_salary)||0,parseInt(f.requested_salary)||0,JSON.stringify(f.steps||['emp','manager','hr']),0,f.copy_email||'');
  const ticketId = info.lastInsertRowid;
  const createdAt = new Date().toLocaleDateString('he-IL');

  // שלח מייל ל-HR + עותק לפונה (nodemailer אם מוגדר, אחרת log בלבד)
  try {
    const settings = {};
    db.prepare('SELECT key,value FROM settings').all().forEach(r => settings[r.key]=r.value);
    if (settings.smtp_user && settings.smtp_pass) {
      const nodemailer = (() => { try { return require('nodemailer'); } catch(e){ return null; } })();
      if (nodemailer) {
        const transporter = nodemailer.createTransporter({
          host: settings.smtp_host||'smtp.gmail.com', port: parseInt(settings.smtp_port)||587,
          secure: false, auth: { user: settings.smtp_user, pass: settings.smtp_pass }
        });
        const typeLabels = {hr:'HR כללי',salary_raise:'העלאת שכר',conditions:'שינוי תנאים',vacation:'חופשה',sick:'מחלה',accident:'תאונת עבודה',equipment:'ציוד',it_issue:'תקלת IT',maintenance:'תחזוקה',general:'כללי'};
        const typeLabel = typeLabels[f.type||'general']||f.type||'כללי';
        const priorityLabel = f.priority==='urgent'?'⚡ דחוף':f.priority==='high'?'🔴 גבוהה':'🟡 רגיל';
        const emailBody = `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9f9f9;padding:20px;border-radius:12px">
  <div style="background:linear-gradient(135deg,#5C1F6A,#7B2D8B);padding:24px;border-radius:10px;text-align:center;margin-bottom:20px">
    <h1 style="color:#fff;margin:0;font-size:20px">📨 פנייה חדשה — שלוה</h1>
    <div style="color:rgba(255,255,255,.8);font-size:13px;margin-top:6px">פנייה #${ticketId} · ${createdAt}</div>
  </div>
  <div style="background:#fff;border-radius:10px;padding:20px;border:1px solid #e0d6f0">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:8px 0;color:#666;font-size:13px;width:120px">מספר פנייה:</td><td style="font-weight:700;font-size:15px;color:#5C1F6A">#${ticketId}</td></tr>
      <tr><td style="padding:8px 0;color:#666;font-size:13px">תאריך:</td><td style="font-size:13px">${createdAt}</td></tr>
      <tr><td style="padding:8px 0;color:#666;font-size:13px">שם הפונה:</td><td style="font-size:13px">${me.name}</td></tr>
      <tr><td style="padding:8px 0;color:#666;font-size:13px">מחלקה:</td><td style="font-size:13px">${me.dept||'—'}</td></tr>
      <tr><td style="padding:8px 0;color:#666;font-size:13px">סוג פנייה:</td><td style="font-size:13px">${typeLabel}</td></tr>
      <tr><td style="padding:8px 0;color:#666;font-size:13px">נושא:</td><td style="font-weight:700;font-size:13px">${f.subject}</td></tr>
      <tr><td style="padding:8px 0;color:#666;font-size:13px">עדיפות:</td><td style="font-size:13px">${priorityLabel}</td></tr>
    </table>
    ${f.details?`<div style="margin-top:14px;padding:14px;background:#f5f0fa;border-radius:8px;border-right:3px solid #7B2D8B"><div style="font-size:12px;color:#666;margin-bottom:6px">פרטי הפנייה:</div><div style="font-size:13px;color:#333;line-height:1.7">${f.details}</div></div>`:''}
  </div>
  <div style="text-align:center;margin-top:16px;font-size:11px;color:#999">מרכז לאומי שלוה · portal.shalva.org.il</div>
</div>`;
        // שלח ל-HR
        transporter.sendMail({
          from: `"פורטל שלוה" <${settings.smtp_user}>`,
          to: 'lilach-hr@shalva.org',
          subject: `[שלוה] פנייה חדשה #${ticketId} — ${f.subject}`,
          html: emailBody
        }).catch(e => console.error('HR email error:', e.message));
        // שלח עותק לפונה אם יש מייל
        const copyTo = f.copy_email || me.email;
        if (copyTo) {
          transporter.sendMail({
            from: `"פורטל שלוה" <${settings.smtp_user}>`,
            to: copyTo,
            subject: `[שלוה] אישור קבלת פנייה #${ticketId} — ${f.subject}`,
            html: emailBody.replace('<h1 style="color:#fff;margin:0;font-size:20px">📨 פנייה חדשה — שלוה</h1>', '<h1 style="color:#fff;margin:0;font-size:20px">✅ הפנייה שלך התקבלה!</h1>')
          }).catch(e => console.error('Copy email error:', e.message));
        }
      }
    } else {
      console.log(`📧 [סימולציה] מייל HR: פנייה #${ticketId} — ${f.subject} מאת ${me.name}`);
    }
  } catch(emailErr) { console.error('Email send error:', emailErr.message); }

  res.json({id:ticketId,ok:true,created_at:createdAt});
});
app.put('/api/requests/:id', auth, (req,res) => {
  const me = req.session.user;
  if (!['super','adm','hr','mgr'].includes(me.role)) return res.status(403).json({error:'Forbidden'});
  const f = req.body; const id = parseInt(req.params.id);
  const sets=[],vals=[];
  ['status','priority','current_step','resolution_note'].forEach(k=>{ if(f[k]!==undefined){sets.push(`${k}=?`);vals.push(f[k]);} });
  if (f.resolved_by) { sets.push('resolved_by=?'); vals.push(f.resolved_by); }
  sets.push("updated_at=datetime('now')"); vals.push(id);
  db.prepare(`UPDATE requests SET ${sets.join(',')} WHERE id=?`).run(...vals);
  res.json({ok:true});
});

// ── FEED ──
app.get('/api/feed', auth, (req,res) => {
  const isAdm = isManager(req.session.user);
  const showAll = isAdm && req.query.all === '1';
  const where = showAll ? '' : 'WHERE (hidden IS NULL OR hidden=0)';
  const rows = db.prepare(`SELECT * FROM feed_posts ${where} ORDER BY pinned DESC, created_at DESC LIMIT 50`).all();
  res.json(rows.map(p=>({...p, likes:JSON.parse(p.likes||'[]')})));
});
app.post('/api/feed', auth, (req,res) => {
  const me=req.session.user; const {text}=req.body;
  if (!text) return res.status(400).json({error:'Missing text'});
  const info = db.prepare('INSERT INTO feed_posts(author_id,author_name,author_color,text) VALUES(?,?,?,?)').run(me.id,me.name,me.color||'#00C49A',text);
  res.json({id:info.lastInsertRowid,ok:true});
});
app.post('/api/feed/:id/like', auth, (req,res) => {
  const me=req.session.user; const p=db.prepare('SELECT * FROM feed_posts WHERE id=?').get(parseInt(req.params.id));
  if (!p) return res.status(404).json({error:'Not found'});
  const likes=JSON.parse(p.likes||'[]'); const idx=likes.indexOf(me.id);
  if(idx>=0)likes.splice(idx,1); else likes.push(me.id);
  db.prepare('UPDATE feed_posts SET likes=? WHERE id=?').run(JSON.stringify(likes),p.id);
  res.json({likes});
});
// אדמין — הצמדה, הסתרה, מחיקה
app.put('/api/feed/:id/pin', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  db.prepare('UPDATE feed_posts SET pinned = CASE COALESCE(pinned,0) WHEN 1 THEN 0 ELSE 1 END WHERE id=?').run(parseInt(req.params.id));
  res.json({ok:true});
});
app.put('/api/feed/:id/hide', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  db.prepare('UPDATE feed_posts SET hidden = CASE COALESCE(hidden,0) WHEN 1 THEN 0 ELSE 1 END WHERE id=?').run(parseInt(req.params.id));
  res.json({ok:true});
});
app.delete('/api/feed/:id', admin, (req,res) => { db.prepare('DELETE FROM feed_posts WHERE id=?').run(parseInt(req.params.id)); res.json({ok:true}); });

// ── TRAININGS ──
app.get('/api/trainings', auth, (req,res) => {
  res.json(db.prepare('SELECT * FROM trainings ORDER BY type DESC,name').all().map(t=>({...t,completed_by:JSON.parse(t.completed_by||'[]')})));
});
app.post('/api/trainings', admin, (req,res) => {
  const f=req.body; if(!f.name) return res.status(400).json({error:'Missing name'});
  const info=db.prepare('INSERT INTO trainings(name,duration,type,deadline,description) VALUES(?,?,?,?,?)').run(f.name,f.duration||'',f.type||'mandatory',f.deadline||'',f.description||'');
  res.json({id:info.lastInsertRowid,ok:true});
});
app.put('/api/trainings/:id', admin, (req,res) => {
  const f=req.body; const id=parseInt(req.params.id);
  db.prepare('UPDATE trainings SET name=?,duration=?,type=?,deadline=?,description=? WHERE id=?').run(f.name,f.duration,f.type,f.deadline,f.description,id);
  res.json({ok:true});
});
app.delete('/api/trainings/:id', admin, (req,res) => { db.prepare('DELETE FROM trainings WHERE id=?').run(parseInt(req.params.id)); res.json({ok:true}); });
app.post('/api/trainings/:id/complete', auth, (req,res) => {
  const me=req.session.user; const t=db.prepare('SELECT * FROM trainings WHERE id=?').get(parseInt(req.params.id));
  if (!t) return res.status(404).json({error:'Not found'});
  const done=JSON.parse(t.completed_by||'[]'); if(!done.includes(me.id))done.push(me.id);
  db.prepare('UPDATE trainings SET completed_by=? WHERE id=?').run(JSON.stringify(done),t.id);
  res.json({ok:true});
});

// ── FORMS ──
app.get('/api/forms', auth, (req,res) => {
  const me=req.session.user;
  const rows = me.role==='adm'
    ? db.prepare('SELECT f.*,u.name as user_name FROM form_submissions f JOIN users u ON f.user_id=u.id ORDER BY f.created_at DESC').all()
    : db.prepare('SELECT * FROM form_submissions WHERE user_id=? ORDER BY created_at DESC').all(me.id);
  res.json(rows.map(r=>({...r,data:JSON.parse(r.data||'{}')})));
});
app.post('/api/forms', auth, (req,res) => {
  const me=req.session.user; const {form_type,data}=req.body;
  if(!form_type) return res.status(400).json({error:'Missing form_type'});
  const info=db.prepare('INSERT INTO form_submissions(user_id,form_type,data) VALUES(?,?,?)').run(me.id,form_type,JSON.stringify(data||{}));
  res.json({id:info.lastInsertRowid,ok:true});
});
app.put('/api/forms/:id', admin, (req,res) => {
  const {status,review_note}=req.body;
  db.prepare('UPDATE form_submissions SET status=?,review_note=?,reviewed_by=? WHERE id=?').run(status,review_note||'',req.session.user.id,parseInt(req.params.id));
  res.json({ok:true});
});

// ── EQUIPMENT ──
app.get('/api/equipment', auth, (req,res) => {
  const me=req.session.user;
  const rows = me.role==='adm'
    ? db.prepare('SELECT e.*,u.name as user_name FROM equipment_requests e JOIN users u ON e.user_id=u.id ORDER BY e.created_at DESC').all()
    : db.prepare('SELECT * FROM equipment_requests WHERE user_id=? ORDER BY created_at DESC').all(me.id);
  res.json(rows);
});
app.post('/api/equipment', auth, (req,res) => {
  const me=req.session.user; const f=req.body;
  if(!f.item) return res.status(400).json({error:'Missing item'});
  const info=db.prepare('INSERT INTO equipment_requests(user_id,item,quantity,urgency,reason,price_estimate) VALUES(?,?,?,?,?,?)').run(me.id,f.item,f.quantity||1,f.urgency||'normal',f.reason||'',f.price_estimate||0);
  res.json({id:info.lastInsertRowid,ok:true});
});

// ── VACATIONS ──
app.get('/api/vacations', auth, (req,res) => {
  const me=req.session.user;
  const rows = me.role==='adm'
    ? db.prepare('SELECT v.*,u.name as user_name FROM vacations v JOIN users u ON v.user_id=u.id ORDER BY v.created_at DESC').all()
    : db.prepare('SELECT * FROM vacations WHERE user_id=? ORDER BY created_at DESC').all(me.id);
  res.json(rows);
});
app.post('/api/vacations', auth, (req,res) => {
  const me=req.session.user; const f=req.body;
  if(!f.from_date||!f.to_date) return res.status(400).json({error:'Missing dates'});
  const info=db.prepare('INSERT INTO vacations(user_id,from_date,to_date,type,note) VALUES(?,?,?,?,?)').run(me.id,f.from_date,f.to_date,f.type||'annual',f.note||'');
  res.json({id:info.lastInsertRowid,ok:true});
});
app.put('/api/vacations/:id', admin, (req,res) => {
  db.prepare('UPDATE vacations SET status=? WHERE id=?').run(req.body.status,parseInt(req.params.id));
  res.json({ok:true});
});

// ── BROADCASTS ──
app.get('/api/broadcasts', auth, (req,res) => {
  res.json(db.prepare('SELECT b.*,u.name as sender_name FROM broadcasts b JOIN users u ON b.sender_id=u.id ORDER BY b.created_at DESC LIMIT 30').all().map(r=>({...r,channels:JSON.parse(r.channels||'[]')})));
});
app.post('/api/broadcasts', admin, (req,res) => {
  const me=req.session.user; const f=req.body;
  if(!f.subject||!f.body) return res.status(400).json({error:'Missing fields'});
  db.prepare('INSERT INTO broadcasts(sender_id,recipients,subject,body,channels) VALUES(?,?,?,?,?)').run(me.id,f.recipients||'all',f.subject,f.body,JSON.stringify(f.channels||['portal']));
  res.json({ok:true});
});

// ── NOTIFICATIONS ──
app.get('/api/notifications', auth, (req,res) => {
  const me=req.session.user;
  res.json(db.prepare("SELECT * FROM notifications WHERE user_id=? OR user_id='all' ORDER BY created_at DESC LIMIT 20").all(String(me.id)));
});
app.post('/api/notifications', admin, (req,res) => {
  const {user_id,text,type}=req.body;
  db.prepare('INSERT INTO notifications(user_id,text,type) VALUES(?,?,?)').run(String(user_id||'all'),text||'',type||'info');
  res.json({ok:true});
});
app.post('/api/notifications/read', auth, (req,res) => {
  const me=req.session.user;
  db.prepare("UPDATE notifications SET read=1 WHERE user_id=? OR user_id='all'").run(String(me.id));
  res.json({ok:true});
});

// ── SETTINGS ──
app.get('/api/settings', auth, (req,res) => {
  const rows=db.prepare('SELECT key,value FROM settings').all();
  const s={}; rows.forEach(r=>s[r.key]=r.value);
  // Don't send password to non-admin
  if (req.session.user.role!=='adm') delete s.smtp_pass;
  res.json(s);
});
app.put('/api/settings', admin, (req,res) => {
  const stmt=db.prepare("INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES(?,?,datetime('now'))");
  for (const [k,v] of Object.entries(req.body)) stmt.run(k,String(v));
  res.json({ok:true});
});

// ── PUBLIC CONFIG — הגדרות פומביות לדף הבית (בלי דרישת כניסה) ──
const PUBLIC_KEYS = [
  'org_name','org_name_en','logo_url',
  'home_banner_kicker','home_banner_welcome','home_banner_welcome_guest',
  'home_weather_city','home_weather_label',
  'home_nav_row1','home_nav_row2',
  'ai_enabled','ai_name','ai_welcome'
];
app.get('/api/public-config', (req,res) => {
  try {
    const rows = db.prepare(`SELECT key,value FROM settings WHERE key IN (${PUBLIC_KEYS.map(()=>'?').join(',')})`).all(...PUBLIC_KEYS);
    const s = {};
    rows.forEach(r => {
      // Parse JSON values if possible
      if (r.value && (r.value.startsWith('[') || r.value.startsWith('{'))) {
        try { s[r.key] = JSON.parse(r.value); } catch(e) { s[r.key] = r.value; }
      } else {
        s[r.key] = r.value;
      }
    });
    res.json(s);
  } catch(e) { res.json({}); }
});

// ── AI (שלומית) ──
// FAQ — כל המשתמשים מחוברים רואים
app.get('/api/ai/faq', auth, (req,res) => {
  try {
    const rows = db.prepare('SELECT * FROM ai_faq WHERE active=1 ORDER BY display_order ASC, id ASC').all();
    res.json(rows);
  } catch(e) { res.json([]); }
});
// FAQ CRUD (אדמין)
app.get('/api/ai/faq/all', admin, (req,res) => {
  try { res.json(db.prepare('SELECT * FROM ai_faq ORDER BY display_order ASC, id ASC').all()); }
  catch(e) { res.json([]); }
});
app.post('/api/ai/faq', admin, (req,res) => {
  const {question, answer, display_order} = req.body;
  if (!question || !answer) return res.status(400).json({error:'question and answer required'});
  const r = db.prepare('INSERT INTO ai_faq(question,answer,display_order) VALUES(?,?,?)').run(question, answer, parseInt(display_order)||0);
  res.json({id:r.lastInsertRowid});
});
app.put('/api/ai/faq/:id', admin, (req,res) => {
  const {question, answer, display_order, active} = req.body;
  db.prepare('UPDATE ai_faq SET question=?,answer=?,display_order=?,active=? WHERE id=?').run(question, answer, parseInt(display_order)||0, active===false?0:1, req.params.id);
  res.json({ok:true});
});
app.delete('/api/ai/faq/:id', admin, (req,res) => {
  db.prepare('DELETE FROM ai_faq WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// Chat proxy — מעביר את הבקשה ל-Anthropic API עם ה-API key מהשרת
app.post('/api/ai/chat', auth, async (req,res) => {
  const {message} = req.body;
  if (!message) return res.status(400).json({error:'message required'});

  // בדוק אם AI מופעל
  const enabled = db.prepare("SELECT value FROM settings WHERE key='ai_enabled'").get()?.value;
  if (enabled === 'false') return res.status(503).json({error:'AI מבוטל כרגע'});

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({error:'API key לא מוגדר. הוסף ANTHROPIC_API_KEY למשתני הסביבה של Railway.'});
  }

  const sysPrompt = db.prepare("SELECT value FROM settings WHERE key='ai_system_prompt'").get()?.value || '';
  const model = db.prepare("SELECT value FROM settings WHERE key='ai_model'").get()?.value || 'claude-sonnet-4-5-20250929';
  const maxTokens = parseInt(db.prepare("SELECT value FROM settings WHERE key='ai_max_tokens'").get()?.value) || 500;

  // בנה הקשר עם שאלות נפוצות
  let context = sysPrompt;
  try {
    const faq = db.prepare('SELECT question,answer FROM ai_faq WHERE active=1 ORDER BY display_order').all();
    if (faq.length) {
      context += '\n\nשאלות נפוצות ותשובות (אם השאלה תואמת — השתמש בתשובה):\n' +
        faq.map(f => `שאלה: ${f.question}\nתשובה: ${f.answer}`).join('\n\n');
    }
  } catch(e){}

  // מידע על המשתמש
  const me = req.session.user;
  const userInfo = `\n\nהמשתמש הפונה אליך: ${me.name} (${me.title||'עובד'}, מחלקת ${me.dept||'—'}).`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: context + userInfo,
        messages: [{role:'user', content:message}]
      })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('Anthropic API error:', data);
      return res.status(500).json({error: data.error?.message || 'שגיאה מ-Anthropic API'});
    }
    const text = data.content?.[0]?.text || 'לא התקבלה תשובה';
    res.json({text});
  } catch(e) {
    console.error('Chat error:', e);
    res.status(500).json({error: e.message});
  }
});

// ── FORM CATEGORIES ──
app.get('/api/form-categories', auth, (req,res) => {
  try {
    const showAll = isManager(req.session.user) && req.query.all === '1';
    const where = showAll ? '' : 'WHERE active=1';
    res.json(db.prepare(`SELECT * FROM form_categories ${where} ORDER BY display_order ASC, id ASC`).all());
  } catch(e) { res.json([]); }
});
app.post('/api/form-categories', admin, (req,res) => {
  const {name, icon, color, display_order} = req.body;
  if (!name) return res.status(400).json({error:'name required'});
  const r = db.prepare('INSERT INTO form_categories(name,icon,color,display_order) VALUES(?,?,?,?)').run(name, icon||'📋', color||'#7B2D8B', parseInt(display_order)||0);
  res.json({id:r.lastInsertRowid});
});
app.put('/api/form-categories/:id', admin, (req,res) => {
  const {name, icon, color, display_order, active} = req.body;
  db.prepare('UPDATE form_categories SET name=?,icon=?,color=?,display_order=?,active=? WHERE id=?').run(name, icon||'📋', color||'#7B2D8B', parseInt(display_order)||0, active===false?0:1, req.params.id);
  res.json({ok:true});
});
app.delete('/api/form-categories/:id', admin, (req,res) => {
  // מחק גם את הטפסים
  db.prepare('DELETE FROM forms WHERE category_id=?').run(req.params.id);
  db.prepare('DELETE FROM form_categories WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// ── FORMS ──
app.get('/api/forms', auth, (req,res) => {
  try {
    const showAll = isManager(req.session.user) && req.query.all === '1';
    const catFilter = req.query.category_id ? ' AND category_id=?' : '';
    const activeFilter = showAll ? '' : ' AND active=1';
    const where = 'WHERE 1=1' + activeFilter + catFilter;
    const params = req.query.category_id ? [parseInt(req.query.category_id)] : [];
    const rows = db.prepare(`SELECT * FROM forms ${where} ORDER BY display_order ASC, id ASC`).all(...params);
    res.json(rows.map(f => ({
      ...f,
      approval_steps: JSON.parse(f.approval_steps || '[]'),
      fields: JSON.parse(f.fields || '[]')
    })));
  } catch(e) { res.json([]); }
});
app.get('/api/forms/:id', auth, (req,res) => {
  try {
    const f = db.prepare('SELECT * FROM forms WHERE id=?').get(req.params.id);
    if (!f) return res.status(404).json({error:'not found'});
    f.approval_steps = JSON.parse(f.approval_steps || '[]');
    f.fields = JSON.parse(f.fields || '[]');
    res.json(f);
  } catch(e) { res.status(500).json({error:e.message}); }
});
app.post('/api/forms', admin, (req,res) => {
  const {category_id, name, icon, description, dept, approval_steps, fields, display_order} = req.body;
  if (!category_id || !name) return res.status(400).json({error:'category_id and name required'});
  const r = db.prepare('INSERT INTO forms(category_id,name,icon,description,dept,approval_steps,fields,display_order) VALUES(?,?,?,?,?,?,?,?)').run(
    parseInt(category_id), name, icon||'📄', description||'', dept||'HR',
    JSON.stringify(approval_steps||['עובד','HR']),
    JSON.stringify(fields||[]),
    parseInt(display_order)||0
  );
  res.json({id:r.lastInsertRowid});
});
app.put('/api/forms/:id', admin, (req,res) => {
  const {category_id, name, icon, description, dept, approval_steps, fields, display_order, active} = req.body;
  db.prepare('UPDATE forms SET category_id=?,name=?,icon=?,description=?,dept=?,approval_steps=?,fields=?,display_order=?,active=? WHERE id=?').run(
    parseInt(category_id), name, icon||'📄', description||'', dept||'HR',
    JSON.stringify(approval_steps||['עובד','HR']),
    JSON.stringify(fields||[]),
    parseInt(display_order)||0,
    active===false?0:1,
    req.params.id
  );
  res.json({ok:true});
});
app.delete('/api/forms/:id', admin, (req,res) => {
  db.prepare('DELETE FROM forms WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// ── PROJECTS ──
app.get('/api/projects', auth, (req,res) => {
  res.json(db.prepare('SELECT * FROM projects WHERE active=1').all().map(r=>({...r,data:JSON.parse(r.data||'{}')})));
});
app.post('/api/projects/referral', auth, (req,res) => {
  const me=req.session.user; const f=req.body;
  const proj=db.prepare("SELECT * FROM projects WHERE type='recruit'").get();
  if(!proj) return res.status(404).json({error:'Not found'});
  const data=JSON.parse(proj.data||'{}'); data.referrals=data.referrals||[];
  data.referrals.push({name:f.name,phone:f.phone,email:f.email,role:f.role,referrer_id:me.id,referrer_name:me.name,status:'new',date:new Date().toISOString().split('T')[0]});
  db.prepare("UPDATE projects SET data=? WHERE type='recruit'").run(JSON.stringify(data));
  res.json({ok:true});
});

// ── STATS ──
app.get('/api/stats', admin, (req,res) => {
  const empCount=db.prepare("SELECT COUNT(*) as c FROM users WHERE role='emp' AND active=1").get().c;
  const openReqs=db.prepare("SELECT COUNT(*) as c FROM requests WHERE status NOT IN ('approved','rejected')").get().c;
  const totalSalary=db.prepare("SELECT SUM(salary) as s FROM users WHERE role='emp' AND active=1").get().s||0;
  const approvedReqs=db.prepare("SELECT COUNT(*) as c FROM requests WHERE status='approved'").get().c;
  const emps=db.prepare("SELECT id FROM users WHERE role='emp' AND active=1").all();
  const trains=db.prepare("SELECT * FROM trainings WHERE type='mandatory'").all();
  let avgCompletion=0;
  if(trains.length&&emps.length){
    const total=trains.reduce((s,t)=>s+JSON.parse(t.completed_by||'[]').filter(id=>emps.find(u=>u.id===id)).length,0);
    avgCompletion=Math.round((total/(trains.length*emps.length))*100);
  }
  res.json({empCount,openReqs,totalSalary,approvedReqs,avgCompletion});
});

// ── FILE UPLOAD ──

// ── SERVE SPA ──
// NEWS PROXY — מביא RSS מהשרת
app.get('/api/news', auth, async (req, res) => {
  const src = req.query.src || 'ynet';
  const feeds = {
    ynet: 'https://www.ynet.co.il/Integration/StoryRss2.xml',
    a7:   'https://www.inn.co.il/Rss.aspx'
  };
  const url = feeds[src];
  if (!url) return res.status(400).json({error:'Unknown source'});
  try {
    const https = require('https');
    const http = require('http');
    
    const fetchUrl = (targetUrl) => new Promise((resolve, reject) => {
      const client = targetUrl.startsWith('https') ? https : http;
      const req2 = client.get(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*'
        },
        timeout: 10000
      }, (response) => {
        if ([301,302,303,307,308].includes(response.statusCode) && response.headers.location) {
          return fetchUrl(response.headers.location).then(resolve).catch(reject);
        }
        let data = '';
        response.setEncoding('utf8');
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
      });
      req2.on('error', reject);
      req2.on('timeout', () => { req2.destroy(); reject(new Error('timeout')); });
    });

    const xml = await fetchUrl(url);
    
    const items = [];
    const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    for (const item of itemMatches.slice(0, 8)) {
      const get = (tag) => {
        const m = item.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i'));
        return m ? (m[1] || m[2] || '').trim() : '';
      };
      const enclosure = item.match(/url="([^"]+\.(?:jpg|jpeg|png|webp))"/i);
      const title = get('title');
      if (!title) continue;
      items.push({
        title,
        link: get('link') || get('guid'),
        pubDate: get('pubDate'),
        thumbnail: enclosure ? enclosure[1] : '',
        src
      });
    }
    
    res.json({ ok: true, items, src });
  } catch(e) {
    console.error('News fetch error:', e.message);
    res.status(500).json({ ok: false, error: e.message, items: [] });
  }
});


// ── POSTS (כתבות שלוה) ──
app.get('/api/posts', (req,res) => {
  try { res.json(db.prepare('SELECT * FROM posts ORDER BY featured DESC, created_at DESC').all()); } catch(e){ res.json([]); }
});
app.get('/api/posts/:id', (req,res) => {
  try {
    const p = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
    if (!p) return res.status(404).json({error:'Not found'});
    res.json(p);
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/posts', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  const {title,sub,body,img,tag,link,author,featured} = req.body;
  if (!title) return res.status(400).json({error:'Title required'});
  const r = db.prepare('INSERT INTO posts(title,sub,body,img,tag,link,author,featured) VALUES(?,?,?,?,?,?,?,?)').run(title,sub||'',body||'',img||'',tag||'',link||'',author||'מערכת שלוה',featured?1:0);
  res.json({id:r.lastInsertRowid});
});
app.put('/api/posts/:id', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  const {title,sub,body,img,tag,link,author,featured} = req.body;
  db.prepare('UPDATE posts SET title=?,sub=?,body=?,img=?,tag=?,link=?,author=?,featured=?,updated_at=datetime("now") WHERE id=?').run(title,sub||'',body||'',img||'',tag||'',link||'',author||'מערכת שלוה',featured?1:0,req.params.id);
  res.json({ok:true});
});
app.put('/api/posts/:id/feature', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  db.prepare('UPDATE posts SET featured=0').run();
  db.prepare('UPDATE posts SET featured=1 WHERE id=?').run(req.params.id);
  res.json({ok:true});
});
app.delete('/api/posts/:id', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  db.prepare('DELETE FROM posts WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// ── ANNOUNCEMENTS (רולר) ──
app.get('/api/announcements', auth, (req,res) => {
  try {
    const msgs = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
    // הוסף ימי הולדת אוטומטיים
    const today = new Date();
    const users = db.prepare('SELECT name,dept,birth_date FROM users WHERE active=1 AND birth_date!=\'\' ').all();
    const bdayItems = users.filter(u => {
      if (!u.birth_date) return false;
      const bd = new Date(u.birth_date);
      const diff = (new Date(today.getFullYear(), bd.getMonth(), bd.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000;
      return diff >= 0 && diff <= 7;
    }).map(u => {
      const bd = new Date(u.birth_date);
      const diff = Math.round((new Date(today.getFullYear(), bd.getMonth(), bd.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
      return {type:'bday', name:u.name, dept:u.dept||'', date:diff===0?'היום 🎂':diff===1?'מחר 🎂':(bd.getDate()+'/'+(bd.getMonth()+1)+' 🎂'), color:'#E84393'};
    });
    res.json([...bdayItems, ...msgs.map(m=>({...m,type:'msg'}))]);
  } catch(e){ res.json([]); }
});
app.post('/api/announcements', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  const {title,body,color} = req.body;
  const r = db.prepare('INSERT INTO announcements(title,body,color) VALUES(?,?,?)').run(title,body||'',color||'#7B2D8B');
  res.json({id:r.lastInsertRowid});
});
app.delete('/api/announcements/:id', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  db.prepare('DELETE FROM announcements WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// ── ADS (פרסומות / סרטונים לדף הבית) ──
// public: only active ads, sorted by display_order
app.get('/api/ads', (req,res) => {
  try {
    const now = new Date().toISOString().slice(0,10);
    const ads = db.prepare(`SELECT * FROM ads WHERE active=1
      AND (start_date='' OR start_date <= ?)
      AND (end_date='' OR end_date >= ?)
      ORDER BY display_order ASC, id ASC`).all(now, now);
    res.json(ads);
  } catch(e){ res.json([]); }
});
// admin: all ads including inactive
app.get('/api/ads/all', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  try {
    res.json(db.prepare('SELECT * FROM ads ORDER BY display_order ASC, id ASC').all());
  } catch(e){ res.json([]); }
});
app.get('/api/ads/:id', (req,res) => {
  try {
    const a = db.prepare('SELECT * FROM ads WHERE id=?').get(req.params.id);
    if (!a) return res.status(404).json({error:'Not found'});
    res.json(a);
  } catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/ads', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  const {title,sub,type,media_url,poster_url,link_url,link_text,overlay_color,active,display_order,start_date,end_date} = req.body;
  if (!title || !media_url) return res.status(400).json({error:'Title and media URL required'});
  const r = db.prepare(`INSERT INTO ads(title,sub,type,media_url,poster_url,link_url,link_text,overlay_color,active,display_order,start_date,end_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    title, sub||'', type||'image', media_url, poster_url||'', link_url||'',
    link_text||'למידע נוסף', overlay_color||'rgba(26,10,46,.55)',
    active===false?0:1, parseInt(display_order)||0, start_date||'', end_date||''
  );
  res.json({id:r.lastInsertRowid});
});
app.put('/api/ads/:id', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  const {title,sub,type,media_url,poster_url,link_url,link_text,overlay_color,active,display_order,start_date,end_date} = req.body;
  db.prepare(`UPDATE ads SET title=?,sub=?,type=?,media_url=?,poster_url=?,link_url=?,link_text=?,overlay_color=?,active=?,display_order=?,start_date=?,end_date=?,updated_at=datetime('now') WHERE id=?`).run(
    title, sub||'', type||'image', media_url, poster_url||'', link_url||'',
    link_text||'למידע נוסף', overlay_color||'rgba(26,10,46,.55)',
    active===false?0:1, parseInt(display_order)||0, start_date||'', end_date||'',
    req.params.id
  );
  res.json({ok:true});
});
app.put('/api/ads/:id/toggle', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  db.prepare('UPDATE ads SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?').run(req.params.id);
  res.json({ok:true});
});
app.delete('/api/ads/:id', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  db.prepare('DELETE FROM ads WHERE id=?').run(req.params.id);
  res.json({ok:true});
});
// Anonymous view/click tracking
app.post('/api/ads/:id/view', (req,res) => {
  try { db.prepare('UPDATE ads SET views = views + 1 WHERE id=?').run(req.params.id); } catch(e){}
  res.json({ok:true});
});
app.post('/api/ads/:id/click', (req,res) => {
  try { db.prepare('UPDATE ads SET clicks = clicks + 1 WHERE id=?').run(req.params.id); } catch(e){}
  res.json({ok:true});
});

// ── MEDIA / UPLOADS (ספריית מדיה) ──
app.post('/api/upload', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({error: err.message || 'Upload failed'});
    if (!req.file) return res.status(400).json({error:'לא נבחר קובץ'});
    // בנה URL פומבי (public/uploads/YYYY-MM/xxx.mp4 → /uploads/YYYY-MM/xxx.mp4)
    const rel = req.file.path.replace(path.join(__dirname,'public'),'').replace(/\\/g,'/');
    const url = rel.startsWith('/') ? rel : '/'+rel;
    res.json({
      url,
      name: req.file.originalname,
      size: req.file.size,
      mime: req.file.mimetype
    });
  });
});
// רשימת כל הקבצים בספריית המדיה
app.get('/api/media', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  try {
    const files = [];
    const scan = (dir, rel) => {
      if (!fs.existsSync(dir)) return;
      fs.readdirSync(dir).forEach(name => {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          scan(full, rel + '/' + name);
        } else {
          const ext = path.extname(name).toLowerCase();
          const type = /\.(mp4|webm|mov)$/i.test(name) ? 'video'
                     : /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name) ? 'image'
                     : /\.(pdf)$/i.test(name) ? 'pdf' : 'file';
          files.push({
            url: '/uploads' + rel + '/' + name,
            name, size: stat.size, type,
            modified: stat.mtime.toISOString()
          });
        }
      });
    };
    scan(uploadRoot, '');
    files.sort((a,b) => b.modified.localeCompare(a.modified));
    res.json(files);
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});
// מחיקת קובץ מדיה
app.delete('/api/media', auth, (req,res) => {
  if (!isManager(req.session.user)) return res.status(403).json({error:'Forbidden'});
  const url = req.body.url;
  if (!url || !url.startsWith('/uploads/')) return res.status(400).json({error:'URL לא תקין'});
  try {
    const full = path.join(__dirname, 'public', url);
    // אבטחה — הקובץ חייב להיות בתוך uploadRoot
    if (!full.startsWith(uploadRoot)) return res.status(400).json({error:'נתיב לא חוקי'});
    if (fs.existsSync(full)) fs.unlinkSync(full);
    res.json({ok:true});
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});

// ══════════════════════════════════════════════════
// 📞 ALPHONE - אלפון עובדים (public directory)
// ══════════════════════════════════════════════════
app.get('/api/directory', auth, (req,res) => {
  try {
    const rows = db.prepare(`SELECT id, name, name_en, email, phone, extension, dept, title, title_en, color, avatar, active
                             FROM users WHERE active=1 ORDER BY name ASC`).all();
    res.json(rows);
  } catch(e) { res.json([]); }
});

// ══════════════════════════════════════════════════
// 📊 EXCEL IMPORT / DEACTIVATE
// ══════════════════════════════════════════════════
// יבוא עובדים מקובץ אקסל — עמודות תואמות לטבלת users
// עמודות מזוהות: username, name, email, phone, extension, dept, title, birth_date, hire_date, role, salary, vacation_days, id_number
app.post('/api/users/import', admin, (req,res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({error: err.message || 'Upload failed'});
    if (!req.file) return res.status(400).json({error:'לא נבחר קובץ'});
    try {
      const wb = XLSX.readFile(req.file.path);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      // מפוי עמודות: תמיכה בעברית ובאנגלית
      const colMap = {
        'שם משתמש':'username','username':'username','user':'username',
        'שם':'name','name':'name','שם מלא':'name','שם עובד':'name',
        'שם באנגלית':'name_en','name_en':'name_en','english name':'name_en',
        'מייל':'email','email':'email','דוא"ל':'email',
        'טלפון':'phone','phone':'phone','נייד':'phone',
        'שלוחה':'extension','extension':'extension','ext':'extension',
        'מחלקה':'dept','dept':'dept','department':'dept',
        'תפקיד':'title','title':'title','job':'title',
        'תפקיד באנגלית':'title_en','title_en':'title_en',
        'תאריך לידה':'birth_date','birth_date':'birth_date','birthday':'birth_date','תאריך יומולדת':'birth_date',
        'תאריך תחילת עבודה':'hire_date','hire_date':'hire_date','תאריך תחילת העסקה':'hire_date','תחילת עבודה':'hire_date',
        'תפקיד מערכתי':'role','role':'role',
        'שכר':'salary','salary':'salary',
        'ימי חופשה':'vacation_days','vacation_days':'vacation_days',
        'ימי מחלה':'sick_days','sick_days':'sick_days',
        'תעודת זהות':'id_number','id_number':'id_number','ת.ז':'id_number','ת"ז':'id_number','id':'id_number',
        'כתובת':'address','address':'address',
        'עיר':'city','city':'city',
        'סיסמה':'password','password':'password'
      };
      const normalize = (obj) => {
        const out = {};
        for (const [k,v] of Object.entries(obj)) {
          const key = colMap[String(k).trim().toLowerCase()] || colMap[String(k).trim()];
          if (key) out[key] = String(v).trim();
        }
        return out;
      };
      let created = 0, updated = 0, skipped = 0;
      const errors = [];
      const insUser = db.prepare(`INSERT INTO users(username,password,role,name,name_en,email,phone,extension,dept,title,title_en,salary,vacation_days,sick_days,hire_date,birth_date,id_number,address,city,color,active,menu) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const updUser = db.prepare(`UPDATE users SET name=?,name_en=?,email=?,phone=?,extension=?,dept=?,title=?,title_en=?,salary=?,vacation_days=?,sick_days=?,hire_date=?,birth_date=?,id_number=?,address=?,city=?,active=1,updated_at=datetime('now') WHERE id=?`);
      const findByUsername = db.prepare('SELECT id FROM users WHERE username=?');
      const findByEmail = db.prepare('SELECT id FROM users WHERE email=?');
      const findByIdNum = db.prepare("SELECT id FROM users WHERE id_number=? AND id_number!=''");

      const colors = ['#7B2D8B','#4BAEE8','#27AE60','#F4813A','#E84040','#9B59B6','#E84393','#16A085','#F39C12','#2C3E50'];
      let ci = 0;

      for (const raw of rows) {
        const r = normalize(raw);
        if (!r.name) { skipped++; errors.push({row: raw, error: 'חסר שם'}); continue; }

        // אתר משתמש קיים לפי username, email, או id_number
        let existing = null;
        if (r.username) existing = findByUsername.get(r.username);
        if (!existing && r.email) existing = findByEmail.get(r.email);
        if (!existing && r.id_number) existing = findByIdNum.get(r.id_number);

        try {
          if (existing) {
            updUser.run(
              r.name, r.name_en||'', r.email||'', r.phone||'', r.extension||'',
              r.dept||'', r.title||'', r.title_en||'',
              parseInt(r.salary)||0, parseInt(r.vacation_days)||16, parseInt(r.sick_days)||10,
              r.hire_date||'', r.birth_date||'', r.id_number||'',
              r.address||'', r.city||'', existing.id
            );
            updated++;
          } else {
            // נדרש username — אם אין, בנה מהמייל או השם
            const uname = r.username || r.email?.split('@')[0] || r.name.replace(/\s+/g,'_');
            const pwd = r.password || '1234';
            const role = r.role || 'emp';
            const color = colors[ci++ % colors.length];
            const defMenu = JSON.stringify(['home','feed','chat','req','forms','train','personal']);
            insUser.run(
              uname, pwd, role, r.name, r.name_en||'', r.email||'', r.phone||'', r.extension||'',
              r.dept||'', r.title||'', r.title_en||'',
              parseInt(r.salary)||0, parseInt(r.vacation_days)||16, parseInt(r.sick_days)||10,
              r.hire_date||'', r.birth_date||'', r.id_number||'',
              r.address||'', r.city||'',
              color, 1, defMenu
            );
            created++;
          }
        } catch(err) {
          skipped++;
          errors.push({row: r.name || 'unknown', error: err.message});
        }
      }
      // מחק את הקובץ
      try { fs.unlinkSync(req.file.path); } catch(e){}
      res.json({ok:true, created, updated, skipped, total: rows.length, errors: errors.slice(0,20)});
    } catch(e) {
      res.status(500).json({error: 'שגיאה בעיבוד הקובץ: ' + e.message});
    }
  });
});

// השבתה גורפת של עובדים מקובץ אקסל (עובדים שסיימו)
app.post('/api/users/deactivate-batch', admin, (req,res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({error: err.message});
    if (!req.file) return res.status(400).json({error:'לא נבחר קובץ'});
    try {
      const wb = XLSX.readFile(req.file.path);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
      let deactivated = 0, notFound = 0;
      const notFoundList = [];
      const deact = db.prepare("UPDATE users SET active=0, updated_at=datetime('now') WHERE id=?");
      const findByUsername = db.prepare("SELECT id, name FROM users WHERE username=? AND role != 'super'");
      const findByEmail = db.prepare("SELECT id, name FROM users WHERE email=? AND role != 'super'");
      const findByIdNum = db.prepare("SELECT id, name FROM users WHERE id_number=? AND id_number!='' AND role != 'super'");
      const findByName = db.prepare("SELECT id, name FROM users WHERE name=? AND role != 'super'");

      for (const raw of rows) {
        const norm = {};
        for (const [k,v] of Object.entries(raw)) {
          const key = String(k).trim().toLowerCase();
          if (key.includes('user') || key.includes('שם משתמש')) norm.username = String(v).trim();
          else if (key.includes('mail') || key.includes('מייל') || key.includes('דוא')) norm.email = String(v).trim();
          else if (key.includes('id') || key.includes('ת.ז') || key.includes('תעודת')) norm.id_number = String(v).trim();
          else if (key === 'שם' || key === 'name' || key.includes('שם עובד') || key.includes('שם מלא')) norm.name = String(v).trim();
        }
        let user = null;
        if (norm.username) user = findByUsername.get(norm.username);
        if (!user && norm.email) user = findByEmail.get(norm.email);
        if (!user && norm.id_number) user = findByIdNum.get(norm.id_number);
        if (!user && norm.name) user = findByName.get(norm.name);

        if (user) { deact.run(user.id); deactivated++; }
        else { notFound++; notFoundList.push(norm.name || norm.username || norm.email || 'unknown'); }
      }
      try { fs.unlinkSync(req.file.path); } catch(e){}
      res.json({ok:true, deactivated, notFound, notFoundList: notFoundList.slice(0,20), total: rows.length});
    } catch(e) {
      res.status(500).json({error: 'שגיאה בעיבוד הקובץ: ' + e.message});
    }
  });
});

// תבנית אקסל להורדה
app.get('/api/users/import-template', admin, (req,res) => {
  const template = [{
    'שם משתמש':'yossi', 'סיסמה':'1234', 'שם':'יוסי כהן', 'שם באנגלית':'Yossi Cohen',
    'מייל':'yossi@shalva.org', 'טלפון':'050-1234567', 'שלוחה':'201',
    'מחלקה':'HR', 'תפקיד':'מנהל HR', 'תפקיד באנגלית':'HR Manager',
    'תפקיד מערכתי':'mgr', 'שכר':15000, 'ימי חופשה':22, 'ימי מחלה':10,
    'תאריך תחילת עבודה':'2020-01-15', 'תאריך לידה':'1985-06-20',
    'תעודת זהות':'123456789', 'כתובת':'רחוב הרצל 10', 'עיר':'ירושלים'
  }];
  const ws = XLSX.utils.json_to_sheet(template);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'עובדים');
  const buf = XLSX.write(wb, {type:'buffer', bookType:'xlsx'});
  res.setHeader('Content-Disposition','attachment; filename="employees_template.xlsx"');
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ייצוא רשימת עובדים לאקסל
app.get('/api/users/export', admin, (req,res) => {
  const users = db.prepare(`SELECT username, name, name_en, email, phone, extension, dept, title, birth_date, hire_date, role, active FROM users ORDER BY name`).all();
  const rows = users.map(u => ({
    'שם משתמש':u.username, 'שם':u.name, 'שם באנגלית':u.name_en, 'מייל':u.email, 'טלפון':u.phone,
    'שלוחה':u.extension, 'מחלקה':u.dept, 'תפקיד':u.title,
    'תאריך לידה':u.birth_date, 'תאריך תחילת עבודה':u.hire_date,
    'תפקיד מערכתי':u.role, 'פעיל':u.active?'כן':'לא'
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'עובדים');
  const buf = XLSX.write(wb, {type:'buffer', bookType:'xlsx'});
  res.setHeader('Content-Disposition','attachment; filename="shalva_employees.xlsx"');
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

// ══════════════════════════════════════════════════
// 📧 MAILING LISTS - רשימות תפוצה
// ══════════════════════════════════════════════════
app.get('/api/mailing-lists', auth, (req,res) => {
  try {
    const lists = db.prepare('SELECT * FROM mailing_lists ORDER BY name ASC').all();
    // הרחב כל רשימה עם המספר של החברים בפועל
    for (const list of lists) {
      list.member_ids = JSON.parse(list.member_ids || '[]');
      list.member_count = resolveMailingListMembers(list).length;
    }
    res.json(lists);
  } catch(e) { res.json([]); }
});

app.get('/api/mailing-lists/:id/members', admin, (req,res) => {
  try {
    const list = db.prepare('SELECT * FROM mailing_lists WHERE id=?').get(req.params.id);
    if (!list) return res.status(404).json({error:'not found'});
    list.member_ids = JSON.parse(list.member_ids || '[]');
    const memberIds = resolveMailingListMembers(list);
    if (!memberIds.length) return res.json([]);
    const placeholders = memberIds.map(()=>'?').join(',');
    const users = db.prepare(`SELECT id,name,email,dept,title,active FROM users WHERE id IN (${placeholders}) AND active=1`).all(...memberIds);
    res.json(users);
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/api/mailing-lists', admin, (req,res) => {
  const {name, description, icon, color, criteria_type, criteria_value, member_ids} = req.body;
  if (!name) return res.status(400).json({error:'name required'});
  const r = db.prepare('INSERT INTO mailing_lists(name,description,icon,color,criteria_type,criteria_value,member_ids) VALUES(?,?,?,?,?,?,?)').run(
    name, description||'', icon||'📧', color||'#7B2D8B',
    criteria_type||'manual', criteria_value||'',
    JSON.stringify(member_ids||[])
  );
  res.json({id:r.lastInsertRowid});
});

app.put('/api/mailing-lists/:id', admin, (req,res) => {
  const {name, description, icon, color, criteria_type, criteria_value, member_ids} = req.body;
  db.prepare(`UPDATE mailing_lists SET name=?, description=?, icon=?, color=?, criteria_type=?, criteria_value=?, member_ids=?, updated_at=datetime('now') WHERE id=?`).run(
    name, description||'', icon||'📧', color||'#7B2D8B',
    criteria_type||'manual', criteria_value||'',
    JSON.stringify(member_ids||[]),
    req.params.id
  );
  res.json({ok:true});
});

app.delete('/api/mailing-lists/:id', admin, (req,res) => {
  db.prepare('DELETE FROM mailing_lists WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// עזר: פענוח חברי רשימה לפי criteria (manual / dept / role / all)
function resolveMailingListMembers(list) {
  try {
    if (list.criteria_type === 'all') {
      return db.prepare("SELECT id FROM users WHERE active=1").all().map(r=>r.id);
    }
    if (list.criteria_type === 'dept') {
      const depts = (list.criteria_value||'').split(',').map(s=>s.trim()).filter(Boolean);
      if (!depts.length) return [];
      const placeholders = depts.map(()=>'?').join(',');
      return db.prepare(`SELECT id FROM users WHERE active=1 AND dept IN (${placeholders})`).all(...depts).map(r=>r.id);
    }
    if (list.criteria_type === 'role') {
      const roles = (list.criteria_value||'').split(',').map(s=>s.trim()).filter(Boolean);
      if (!roles.length) return [];
      const placeholders = roles.map(()=>'?').join(',');
      return db.prepare(`SELECT id FROM users WHERE active=1 AND role IN (${placeholders})`).all(...roles).map(r=>r.id);
    }
    // manual — return the stored member_ids
    return Array.isArray(list.member_ids) ? list.member_ids : [];
  } catch(e) { return []; }
}

// ══════════════════════════════════════════════════
// 📸 SOCIAL POSTS (אינסטגרם / רשתות)
// ══════════════════════════════════════════════════
app.get('/api/social-posts', (req,res) => {
  try {
    const rows = db.prepare('SELECT * FROM social_posts WHERE active=1 ORDER BY display_order ASC, posted_at DESC LIMIT 12').all();
    res.json(rows);
  } catch(e) { res.json([]); }
});

app.get('/api/social-posts/all', admin, (req,res) => {
  try {
    res.json(db.prepare('SELECT * FROM social_posts ORDER BY display_order ASC, posted_at DESC').all());
  } catch(e) { res.json([]); }
});

app.post('/api/social-posts', admin, (req,res) => {
  const {source, image_url, post_url, caption, posted_at, display_order, active} = req.body;
  if (!image_url || !post_url) return res.status(400).json({error:'image_url and post_url required'});
  const r = db.prepare('INSERT INTO social_posts(source,image_url,post_url,caption,posted_at,display_order,active) VALUES(?,?,?,?,?,?,?)').run(
    source||'instagram', image_url, post_url, caption||'',
    posted_at || new Date().toISOString(),
    parseInt(display_order)||0,
    active===false?0:1
  );
  res.json({id:r.lastInsertRowid});
});

app.put('/api/social-posts/:id', admin, (req,res) => {
  const {source, image_url, post_url, caption, posted_at, display_order, active} = req.body;
  db.prepare('UPDATE social_posts SET source=?,image_url=?,post_url=?,caption=?,posted_at=?,display_order=?,active=? WHERE id=?').run(
    source||'instagram', image_url, post_url, caption||'',
    posted_at || new Date().toISOString(),
    parseInt(display_order)||0,
    active===false?0:1,
    req.params.id
  );
  res.json({ok:true});
});

app.delete('/api/social-posts/:id', admin, (req,res) => {
  db.prepare('DELETE FROM social_posts WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// ══════════════════════════════════════════════════
// 🎂 AUTO-BIRTHDAYS & ANNIVERSARIES — נבנה דינמית ב-roller
// ══════════════════════════════════════════════════
// endpoint משופר לרולר — הודעות + ימי הולדת אוטומטיים + ותק
app.get('/api/roller-items', (req,res) => {
  try {
    const items = [];
    // 1. הודעות מהניהול
    const anns = db.prepare('SELECT * FROM announcements ORDER BY id DESC LIMIT 20').all();
    anns.forEach(a => items.push({
      type:'msg', title:a.title, body:a.body, color:a.color, source:'manual'
    }));

    // 2. ימי הולדת ב-14 הימים הקרובים
    const today = new Date();
    const users = db.prepare("SELECT id, name, dept, color, birth_date, hire_date FROM users WHERE active=1 AND (birth_date != '' OR hire_date != '')").all();

    users.forEach(u => {
      // יום הולדת
      if (u.birth_date) {
        const bd = new Date(u.birth_date);
        if (!isNaN(bd)) {
          const thisYear = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
          const daysDiff = Math.floor((thisYear - today) / (1000*60*60*24));
          if (daysDiff >= 0 && daysDiff <= 14) {
            const dateStr = daysDiff === 0 ? 'היום 🎂' : daysDiff === 1 ? 'מחר 🎂' : bd.getDate()+'/'+(bd.getMonth()+1)+' 🎂';
            items.push({type:'bday', name:u.name, date:dateStr, dept:u.dept||'', color:u.color||'#E84393', daysUntil:daysDiff});
          }
        }
      }
      // ותק — יום השנה של תחילת עבודה
      if (u.hire_date) {
        const hd = new Date(u.hire_date);
        if (!isNaN(hd)) {
          const thisYear = new Date(today.getFullYear(), hd.getMonth(), hd.getDate());
          const daysDiff = Math.floor((thisYear - today) / (1000*60*60*24));
          if (daysDiff >= 0 && daysDiff <= 14) {
            const years = today.getFullYear() - hd.getFullYear();
            if (years > 0) {
              const emoji = years >= 10 ? '🏆' : years >= 5 ? '⭐' : '🎉';
              const dateStr = daysDiff === 0 ? 'היום '+emoji : daysDiff === 1 ? 'מחר '+emoji : hd.getDate()+'/'+(hd.getMonth()+1)+' '+emoji;
              items.push({
                type:'anniversary', name:u.name,
                title: years+' שנים בשלוה '+emoji,
                body: u.name + (u.dept?' · '+u.dept:''),
                date: dateStr, dept:u.dept||'',
                color: years>=10?'#D4A017':years>=5?'#9B59B6':'#F4813A',
                years, daysUntil:daysDiff
              });
            }
          }
        }
      }
    });

    // מיון: ימי הולדת/ותק להיום קודם, אז ההודעות, אז השאר
    items.sort((a,b) => {
      const aDays = a.daysUntil ?? 999;
      const bDays = b.daysUntil ?? 999;
      return aDays - bDays;
    });

    res.json(items);
  } catch(e) {
    console.error('roller-items error:', e);
    res.json([]);
  }
});

// ══════════════════════════════════════════════════
// 📡 BROADCASTS — עדכון: תמיכה ברשימת תפוצה
// ══════════════════════════════════════════════════
// Extended broadcast: takes mailing_list_id and sends only to those members
app.post('/api/broadcasts/send', admin, async (req,res) => {
  const {subject, body, mailing_list_id, channels} = req.body;
  if (!subject || !body) return res.status(400).json({error:'subject and body required'});
  try {
    let recipients = [];
    if (mailing_list_id) {
      const list = db.prepare('SELECT * FROM mailing_lists WHERE id=?').get(mailing_list_id);
      if (list) {
        list.member_ids = JSON.parse(list.member_ids || '[]');
        const memberIds = resolveMailingListMembers(list);
        if (memberIds.length) {
          const placeholders = memberIds.map(()=>'?').join(',');
          recipients = db.prepare(`SELECT id,name,email FROM users WHERE id IN (${placeholders}) AND active=1 AND email != ''`).all(...memberIds);
        }
      }
    } else {
      recipients = db.prepare("SELECT id,name,email FROM users WHERE active=1 AND email != ''").all();
    }
    const me = req.session.user;
    const listInfo = mailing_list_id ? `list:${mailing_list_id}` : 'all';
    db.prepare('INSERT INTO broadcasts(sender_id,recipients,subject,body,channels) VALUES(?,?,?,?,?)').run(
      me.id, listInfo, subject, body, JSON.stringify(channels||['portal'])
    );
    // הוספת התראה לכל נמען
    const insN = db.prepare('INSERT INTO notifications(user_id,text,type) VALUES(?,?,?)');
    recipients.forEach(u => insN.run(String(u.id), `📢 ${subject}`, 'broadcast'));
    res.json({ok:true, sent_to: recipients.length, recipients_preview: recipients.slice(0,5).map(r=>r.name)});
  } catch(e) {
    console.error('broadcast error:', e);
    res.status(500).json({error:e.message});
  }
});


// ── SPA fallback — חייב להיות אחרון, אחרי כל ה-API routes ──
app.get('*', (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT, () => {
  console.log(`\n🚀 פורטל שלוה פעיל!`);
  console.log(`   ► http://localhost:${PORT}`);
  console.log(`   עובד: מיכל/1234  מנהל: admin/admin123\n`);
});
