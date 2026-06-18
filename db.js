const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
let db;
function getDB() {
  if (!db) {
    const dir = path.join(__dirname, 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(path.join(dir, 'shalva.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}
function initDB() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      role TEXT DEFAULT 'emp',
      name TEXT NOT NULL, name_en TEXT DEFAULT '', email TEXT DEFAULT '', phone TEXT DEFAULT '',
      dept TEXT DEFAULT '', title TEXT DEFAULT '', title_en TEXT DEFAULT '',
      salary INTEGER DEFAULT 0, vacation_days INTEGER DEFAULT 16, sick_days INTEGER DEFAULT 10,
      reserve_days INTEGER DEFAULT 0, hire_date TEXT DEFAULT '', birth_date TEXT DEFAULT '',
      id_number TEXT DEFAULT '', address TEXT DEFAULT '', city TEXT DEFAULT '',
      bank TEXT DEFAULT '', bank_branch TEXT DEFAULT '', bank_account TEXT DEFAULT '',
      emergency_name TEXT DEFAULT '', emergency_phone TEXT DEFAULT '',
      employment_type TEXT DEFAULT 'full', scope_pct INTEGER DEFAULT 100,
      avatar TEXT DEFAULT '', color TEXT DEFAULT '#7C5CFC', menu TEXT DEFAULT '[]',
      notes TEXT DEFAULT '', active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      manager_id INTEGER DEFAULT 0,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#7B2D8B',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      type TEXT DEFAULT 'general', dept TEXT DEFAULT '', subject TEXT NOT NULL,
      details TEXT DEFAULT '', status TEXT DEFAULT 'pending', priority TEXT DEFAULT 'normal',
      current_salary INTEGER DEFAULT 0, requested_salary INTEGER DEFAULT 0,
      steps TEXT DEFAULT '[]', current_step INTEGER DEFAULT 0,
      resolved_by INTEGER DEFAULT 0, resolution_note TEXT DEFAULT '',
      copy_email TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS feed_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, author_id INTEGER NOT NULL,
      author_name TEXT NOT NULL, author_color TEXT DEFAULT '#7B2D8B',
      text TEXT NOT NULL, likes TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS trainings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      duration TEXT DEFAULT '', type TEXT DEFAULT 'mandatory', deadline TEXT DEFAULT '',
      description TEXT DEFAULT '', completed_by TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS form_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      form_type TEXT NOT NULL, data TEXT DEFAULT '{}', status TEXT DEFAULT 'pending',
      reviewed_by INTEGER DEFAULT 0, review_note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS equipment_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      item TEXT NOT NULL, quantity INTEGER DEFAULT 1, urgency TEXT DEFAULT 'normal',
      reason TEXT DEFAULT '', price_estimate INTEGER DEFAULT 0, status TEXT DEFAULT 'pending',
      current_step INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vacations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
      from_date TEXT NOT NULL, to_date TEXT NOT NULL, type TEXT DEFAULT 'annual',
      note TEXT DEFAULT '', status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS broadcasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id INTEGER NOT NULL,
      recipients TEXT DEFAULT 'all', subject TEXT NOT NULL, body TEXT NOT NULL,
      channels TEXT DEFAULT '["portal"]', created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
      text TEXT NOT NULL, type TEXT DEFAULT 'info', read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
      description TEXT DEFAULT '', bonus INTEGER DEFAULT 0, data TEXT DEFAULT '{}',
      active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // הוסף עמודות חדשות אם לא קיימות (migration)
  const migrations = [
    `ALTER TABLE requests ADD COLUMN copy_email TEXT DEFAULT ''`,
    `ALTER TABLE equipment_requests ADD COLUMN current_step INTEGER DEFAULT 0`,
  ];
  migrations.forEach(sql => { try { db.exec(sql); } catch(e) {} });

  const ins = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  [['org_name','המרכז הלאומי שלוה'],['org_name_en','Shalva National Center'],
   ['org_email','info@shalva.org.il'],['smtp_host','smtp.gmail.com'],['smtp_port','587'],
   ['smtp_user',''],['smtp_pass',''],['whatsapp_num','+972501234567'],
   ['sms_provider','twilio'],['sms_active','true'],['chatbot_active','true'],
   ['auto_approve','false'],['recruit_bonus','500'],['logo_url','/logo.png'],['maintenance','false']
  ].forEach(([k,v]) => ins.run(k,v));

  if (db.prepare('SELECT COUNT(*) as c FROM users').get().c === 0) {
    const iu = db.prepare('INSERT INTO users(username,password,role,name,email,dept,title,salary,vacation_days,sick_days,color,avatar,menu,hire_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    // סופר אדמין
    iu.run('admin','admin123','super','מנהל ראשי','admin@shalva.org.il','הנהלה','מנהל מערכת ראשי',0,0,0,'#2C3E50','👑',JSON.stringify([]),'2015-01-01');
    // HR
    iu.run('רות','1234','hr','רות כץ','ruth@shalva.org.il','HR','מנהלת HR',19000,20,5,'#E84393','ר.כ',JSON.stringify(['home','feed','chat','req','hr','sal','bulk','train','forms','proj']),'2016-09-10');
    // מנהלי מחלקות
    iu.run('מיכל','1234','mgr','מיכל כהן','michal@shalva.org.il','תפעול','מנהלת תפעול',18500,22,8,'#7B2D8B','מ.כ',JSON.stringify(['home','feed','chat','req','hr','sal','train','forms','proj','int']),'2018-03-15');
    iu.run('יוסי','1234','mgr','יוסי לוי','yosi@shalva.org.il','שכר','מנהל שכר',16200,18,10,'#F4813A','י.ל',JSON.stringify(['home','feed','chat','req','sal','train','forms']),'2021-06-01');
    // עובדים
    iu.run('דן','1234','emp','דן שמיר','dan@shalva.org.il','ביטחון','קצין ביטחון',15000,18,12,'#4BAEE8','ד.ש',JSON.stringify(['home','feed','chat','req','sal','train','forms']),'2020-01-20');
    iu.run('שרה','1234','emp','שרה אברהם','sara@shalva.org.il','תפעול','רכזת תפעול',13500,16,10,'#E84040','ש.א',JSON.stringify(['home','feed','chat','req','sal','train','forms']),'2022-03-01');

    // מחלקות
    const id = db.prepare('INSERT INTO departments(name,manager_id,description,color) VALUES(?,?,?,?)');
    id.run('תפעול',3,'מחלקת תפעול כללי','#7B2D8B');
    id.run('שכר',4,'מחלקת שכר ומשאבי אנוש','#F4813A');
    id.run('HR',2,'מחלקת משאבי אנוש','#E84393');
    id.run('ביטחון',0,'מחלקת ביטחון','#27AE60');
    id.run('שיווק',0,'מחלקת שיווק ותקשורת','#4BAEE8');
    id.run('תחזוקה',0,'מחלקת תחזוקה','#E84040');

    const it = db.prepare('INSERT INTO trainings(name,duration,type,deadline,completed_by) VALUES(?,?,?,?,?)');
    it.run('בטיחות אש 2026','7 דק׳','mandatory','2026-05-15','[]');
    it.run('ביטחון שנתי','15 דק׳','mandatory','2026-06-01','[]');
    it.run('מניעת הטרדה מינית','20 דק׳','mandatory','2026-12-31','[1,2,3,4]');
    it.run('פיתוח מנהלים','6 מפגשים','optional','2026-12-31','[1,3]');

    const ip = db.prepare('INSERT INTO feed_posts(author_id,author_name,author_color,text) VALUES(?,?,?,?)');
    ip.run(1,'מחלקת HR','#7B2D8B','ארוחת צוות קיץ — 20.06.26 🎉 גן החברה 18:00');
    ip.run(1,'הנהלה','#2C3E50','עדכון נהלי חופשה 2026');

    const ir = db.prepare('INSERT INTO requests(user_id,type,dept,subject,details,status,priority,current_salary,requested_salary) VALUES(?,?,?,?,?,?,?,?,?)');
    ir.run(5,'salary_raise','שכר','בקשת העלאת שכר','לאחר 3 שנות ביצועים מצוינים','hr_review','high',15000,17000);
    ir.run(6,'conditions','HR','שינוי היקף משרה','מ-80% ל-100%','pending','normal',0,0);

    db.prepare('INSERT INTO projects(name,type,description,bonus,data) VALUES(?,?,?,?,?)').run('חבר מביא חבר','recruit','תוכנית הפניות',500,'{"referrals":[]}');
  }
  console.log('✅ DB ready');
  return db;
}
module.exports = { getDB, initDB };
