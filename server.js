const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { initDB, getDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const db = initDB();

['uploads','public'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); });

const upload = multer({ dest: 'uploads/', limits: { fileSize: 10*1024*1024 } });
const uploadLogo = multer({ storage: multer.diskStorage({
  destination: 'public/',
  filename: (req, file, cb) => cb(null, 'logo' + path.extname(file.originalname))
})});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'shalva-portal-2026-secret',
  resave: false, saveUninitialized: false,
  cookie: { maxAge: 8*60*60*1000, secure: false }
}));

const auth = (req,res,next) => req.session.user ? next() : res.status(401).json({error:'Unauthorized'});
const admin = (req,res,next) => req.session.user?.role==='adm' ? next() : res.status(403).json({error:'Forbidden'});

function safeUser(u) {
  const {password:_,...s} = u;
  try { s.menu = JSON.parse(s.menu||'[]'); } catch { s.menu=[]; }
  return s;
}

// ── AUTH ──
app.post('/api/login', (req,res) => {
  const {username,password,role='emp'} = req.body;
  const u = db.prepare('SELECT * FROM users WHERE username=? AND role=? AND active=1').get(username, role);
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
  if (me.role !== 'adm') return res.json([safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(me.id))]);
  res.json(db.prepare("SELECT * FROM users WHERE role='emp' AND active=1 ORDER BY name").all().map(safeUser));
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
  if (me.role==='adm') {
    res.json(db.prepare('SELECT r.*,u.name as user_name,u.dept as user_dept FROM requests r JOIN users u ON r.user_id=u.id ORDER BY r.created_at DESC').all());
  } else {
    res.json(db.prepare('SELECT r.*,u.name as user_name FROM requests r JOIN users u ON r.user_id=u.id WHERE r.user_id=? ORDER BY r.created_at DESC').all(me.id));
  }
});
app.post('/api/requests', auth, (req,res) => {
  const me = req.session.user;
  const f = req.body;
  if (!f.subject) return res.status(400).json({error:'Missing subject'});
  const info = db.prepare('INSERT INTO requests(user_id,type,dept,subject,details,status,priority,current_salary,requested_salary,steps,current_step) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(me.id,f.type||'general',f.dept||'',f.subject,f.details||'','pending',f.priority||'normal',parseInt(f.current_salary)||0,parseInt(f.requested_salary)||0,JSON.stringify(f.steps||['emp','manager','hr']),0);
  res.json({id:info.lastInsertRowid,ok:true});
});
app.put('/api/requests/:id', admin, (req,res) => {
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
app.post('/api/upload/logo', admin, uploadLogo.single('logo'), (req,res) => {
  if(!req.file) return res.status(400).json({error:'No file'});
  const ext=path.extname(req.file.originalname); const name='logo'+ext; const dest=path.join('public',name);
  if(req.file.path!==dest) { try { fs.renameSync(req.file.path,dest); } catch(e) { fs.copyFileSync(req.file.path,dest); fs.unlinkSync(req.file.path); } }
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('logo_url',?)").run('/'+name);
  res.json({url:'/'+name,ok:true});
});
app.post('/api/upload/file', auth, upload.single('file'), (req,res) => {
  if(!req.file) return res.status(400).json({error:'No file'});
  res.json({url:'/uploads/'+req.file.filename,name:req.file.originalname});
});

// ── SERVE SPA ──
app.get('*', (req,res) => res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT, () => {
  console.log(`\n🚀 פורטל שלוה פעיל!`);
  console.log(`   ► http://localhost:${PORT}`);
  console.log(`   עובד: מיכל/1234  מנהל: admin/admin123\n`);
});
