const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { initDB, getDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const db = initDB();

['uploads','public'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); });


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
  const info = db.prepare(`INSERT INTO users(username,password,role,name,name_en,email,phone,dept,title,title_en,salary,vacation_days,sick_days,reserve_days,hire_date,birth_date,id_number,address,city,bank,bank_branch,bank_account,emergency_name,emergency_phone,employment_type,scope_pct,color,avatar,menu,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(f.username,f.password||'1234','emp',f.name,f.name_en||'',f.email||'',f.phone||'',f.dept||'',f.title||'',f.title_en||'',parseInt(f.salary)||0,parseInt(f.vacation_days)||16,parseInt(f.sick_days)||10,parseInt(f.reserve_days)||0,f.hire_date||'',f.birth_date||'',f.id_number||'',f.address||'',f.city||'',f.bank||'',f.bank_branch||'',f.bank_account||'',f.emergency_name||'',f.emergency_phone||'',f.employment_type||'full',parseInt(f.scope_pct)||100,f.color||'#7C5CFC',av,JSON.stringify(f.menu||['home','feed','chat','req','sal','train','forms']),f.notes||'');
  res.json({id:info.lastInsertRowid,ok:true});
});
app.put('/api/users/:id', auth, (req,res) => {
  const id = parseInt(req.params.id);
  const me = req.session.user;
  if (me.role!=='adm' && me.id!==id) return res.status(403).json({error:'Forbidden'});
  const f = req.body;
  const FIELDS = ['name','name_en','email','phone','dept','title','title_en','salary','vacation_days','sick_days','reserve_days','hire_date','birth_date','id_number','address','city','bank','bank_branch','bank_account','emergency_name','emergency_phone','employment_type','scope_pct','color','notes'];
  if (me.role==='adm') FIELDS.push('username','active');
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
  const rows = db.prepare('SELECT * FROM feed_posts ORDER BY created_at DESC LIMIT 50').all();
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

// ── SPA fallback — חייב להיות אחרון, אחרי כל ה-API routes ──
app.get('*', (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT, () => {
  console.log(`\n🚀 פורטל שלוה פעיל!`);
  console.log(`   ► http://localhost:${PORT}`);
  console.log(`   עובד: מיכל/1234  מנהל: admin/admin123\n`);
});
