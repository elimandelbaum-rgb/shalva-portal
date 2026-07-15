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
      extension TEXT DEFAULT '',
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
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, sub TEXT DEFAULT '', body TEXT DEFAULT '',
      img TEXT DEFAULT '', tag TEXT DEFAULT '', link TEXT DEFAULT '',
      author TEXT DEFAULT 'מערכת שלוה',
      featured INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, body TEXT DEFAULT '',
      color TEXT DEFAULT '#7B2D8B',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL,
      description TEXT DEFAULT '', bonus INTEGER DEFAULT 0, data TEXT DEFAULT '{}',
      active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      sub TEXT DEFAULT '',
      type TEXT NOT NULL DEFAULT 'image',
      media_url TEXT NOT NULL,
      poster_url TEXT DEFAULT '',
      link_url TEXT DEFAULT '',
      link_text TEXT DEFAULT 'למידע נוסף',
      overlay_color TEXT DEFAULT 'rgba(26,10,46,.55)',
      active INTEGER DEFAULT 1,
      display_order INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ai_faq (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS form_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '📋',
      color TEXT DEFAULT '#7B2D8B',
      display_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '📄',
      description TEXT DEFAULT '',
      dept TEXT DEFAULT 'HR',
      approval_steps TEXT DEFAULT '["עובד","HR"]',
      fields TEXT DEFAULT '[]',
      display_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS mailing_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT '📧',
      color TEXT DEFAULT '#7B2D8B',
      criteria_type TEXT DEFAULT 'manual',
      criteria_value TEXT DEFAULT '',
      member_ids TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS social_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT DEFAULT 'instagram',
      image_url TEXT NOT NULL,
      post_url TEXT NOT NULL,
      caption TEXT DEFAULT '',
      posted_at TEXT DEFAULT (datetime('now')),
      display_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // הוסף עמודות חדשות אם לא קיימות (migration)
  const migrations = [
    `ALTER TABLE requests ADD COLUMN copy_email TEXT DEFAULT ''`,
    `ALTER TABLE equipment_requests ADD COLUMN current_step INTEGER DEFAULT 0`,
    `ALTER TABLE posts ADD COLUMN body TEXT DEFAULT ''`,
    `ALTER TABLE posts ADD COLUMN author TEXT DEFAULT 'מערכת שלוה'`,
    `ALTER TABLE feed_posts ADD COLUMN pinned INTEGER DEFAULT 0`,
    `ALTER TABLE feed_posts ADD COLUMN hidden INTEGER DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN extension TEXT DEFAULT ''`,
  ];
  migrations.forEach(sql => { try { db.exec(sql); } catch(e) {} });

  const ins = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
  [['org_name','המרכז הלאומי שלוה'],['org_name_en','Shalva National Center'],
   ['org_email','info@shalva.org.il'],['smtp_host','smtp.gmail.com'],['smtp_port','587'],
   ['smtp_user',''],['smtp_pass',''],['whatsapp_num','+972501234567'],
   ['sms_provider','twilio'],['sms_active','true'],['chatbot_active','true'],
   ['auto_approve','false'],['recruit_bonus','500'],['logo_url','/logo.png'],['maintenance','false'],
   // הגדרות דף הבית
   ['home_banner_kicker','פורטל עובדים שלוה'],
   ['home_banner_welcome','שלום'],
   ['home_banner_welcome_guest','ברוכים הבאים! 🌟'],
   ['home_weather_city','Jerusalem'],
   ['home_weather_label','ירושלים'],
   ['home_nav_row1', JSON.stringify([
     {ic:'📨',lb:'פניות HR',target:'req',color:'#7B2D8B'},
     {ic:'📋',lb:'מחלקות',target:'forms',color:'#1565C0'},
     {ic:'🎓',lb:'הדרכות',target:'train',color:'#27AE60'},
     {ic:'⭐',lb:'הערכה',target:'hr',color:'#F4813A'}
   ])],
   ['home_nav_row2', JSON.stringify([
     {ic:'🤖',lb:'שלומית AI',target:'chat',color:'#E84393'},
     {ic:'🎁',lb:'הטבות',target:'https://boomclub.org.il/',color:'#D4A017',caption:'boomclub'},
     {ic:'📱',lb:'חילן',target:'https://shalva.net.hilan.co.il/login',color:'#4BAEE8',caption:'חילן שלוה'},
     {ic:'👤',lb:'הפרופיל',target:'personal',color:'#5C1F6A'}
   ])],
   // הגדרות שלומית AI
   ['ai_enabled','true'],
   ['ai_name','שלומית'],
   ['ai_welcome','שלום {name}! 👋 אני שלומית, העוזרת הדיגיטלית של שלוה. איך אוכל לעזור לך היום?'],
   ['ai_system_prompt','אתה שלומית, עוזרת AI של המרכז הלאומי שלוה בירושלים. המרכז נותן שירותים לילדים ומבוגרים עם צרכים מיוחדים. אתה עוזרת לעובדים בנושאי HR, נהלים, טפסים, ושאלות כלליות על הארגון. תעני בעברית, קצר וממוקד, בטון חם ומכבד. אם שאלה חורגת מתחום עבודתך — הפני לגורם המתאים.'],
   ['ai_model','claude-sonnet-4-5-20250929'],
   ['ai_max_tokens','500']
  ].forEach(([k,v]) => ins.run(k,v));

  // כתבות שלוה לדוגמה (רק אם הטבלה ריקה)
  try {
    if (db.prepare('SELECT COUNT(*) as c FROM posts').get().c === 0) {
      const ipost = db.prepare('INSERT INTO posts(title,sub,body,img,tag,link,author,featured) VALUES(?,?,?,?,?,?,?,?)');
      ipost.run(
        'ילדים מיוחדים, הישגים מיוחדים',
        'תוכנית הקיץ של שלוה 2026 — פתיחה בקרוב',
        'תוכנית הקיץ השנתית של המרכז הלאומי שלוה יוצאת לדרך גם השנה, עם מגוון פעילויות חווייתיות המותאמות לילדים ובוגרים עם צרכים מיוחדים.\n\nהתוכנית כוללת סדנאות יצירה, פעילויות ספורט מותאמות, חוגי מוזיקה ותרפיה, וטיולים בטבע. צוות המדריכים המקצועי שלנו עבר הכשרה ייעודית כדי להבטיח חוויה בטוחה ומעצימה לכל משתתף.\n\nההרשמה תיפתח בשבועות הקרובים. למידע נוסף ולפרטי הרשמה ניתן לפנות למשרדי המרכז.',
        'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800','חינוך','','מערכת שלוה',1);
      ipost.run(
        'מתנדבים יקרים — תודה מהלב',
        'מעל 500 מתנדבים חדשים בשנת 2026',
        'השנה זכינו לקבל לשורותינו מעל 500 מתנדבים חדשים, אשר תורמים מזמנם ומליבם למען חניכי שלוה.\n\nהמתנדבים שלנו הם עמוד התווך של הפעילות במרכז — הם מלווים את החניכים בפעילויות היומיום, מסייעים בסדנאות, ומעניקים חום ואהבה.\n\nאנו מודים לכל אחת ואחד מהם על המסירות והנתינה ללא גבול.',
        'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800','קהילה','','מערכת שלוה',0);
      ipost.run(
        'מרכז שלוה החדש באשקלון',
        'פתיחה רשמית בספטמבר',
        'אנו גאים להכריז על הקמת מרכז שלוה החדש בעיר אשקלון, אשר ייפתח רשמית בחודש ספטמבר הקרוב.\n\nהמרכז החדש יעניק שירותים לעשרות משפחות באזור הדרום, ויכלול חדרי טיפול, אולם פעילות, גן חושים (סנוזלן), ומרחבים ירוקים.\n\nהקמת המרכז התאפשרה הודות לתרומה נדיבה שגויסה במשלחת ההתרמה לאירופה.',
        'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800','פיתוח','','מערכת שלוה',0);
      ipost.run(
        'גיוס תרומות — הצלחה גדולה!',
        '170,000 אירו נאספו במשלחת הולנד ושוודיה',
        'משלחת ההתרמה של שלוה להולנד ושוודיה הסתיימה בהצלחה מרשימה, עם גיוס של כ-170,000 אירו למען פעילות המרכז.\n\nהמשלחת ביקרה באמסטרדם, ניימכן, שטוקהולם וערים נוספות, ונפגשה עם תורמים, ידידים וקהילות התומכות בפעילות שלוה לאורך שנים.\n\nבין ההתחייבויות הבולטות — תרומה משמעותית להקמת המרכז החדש באשקלון. תודה לכל השותפים והתורמים!',
        'https://images.unsplash.com/photo-1607748862156-7c548e7e98f4?w=800','גיוס','','מערכת שלוה',0);
      ipost.run(
        'הדרכות קיץ 2026',
        'הירשמו עכשיו לתוכנית ההדרכה השנתית',
        'תוכנית ההדרכה השנתית לצוותי שלוה נפתחת לרישום. התוכנית מיועדת לעובדים, מדריכים ומתנדבים, ומטרתה להעשיר את הכלים המקצועיים בעבודה עם אנשים עם צרכים מיוחדים.\n\nההדרכות יכללו נושאים כגון תקשורת מותאמת, ניהול התנהגות, עזרה ראשונה, ובטיחות.\n\nההשתתפות חינם לכלל עובדי המרכז.',
        'https://images.unsplash.com/photo-1544717305-2782549b5136?w=800','הדרכה','','מערכת שלוה',0);
      ipost.run(
        'אירועי צוות קרובים',
        'גן החברה — יוני 2026',
        'אנו שמחים להזמין את כל עובדי המרכז לאירוע גיבוש צוות קיצי שיתקיים בגן החברה.\n\nבאירוע יהיו פעילויות, הפעלות, אוכל טוב ואווירה משפחתית. זו הזדמנות מצוינת להכיר עמיתים ממחלקות אחרות ולחזק את הקשרים בין הצוותים.\n\nפרטים מלאים יישלחו בקרוב במייל ובפורטל.',
        'https://images.unsplash.com/photo-1491438590914-bc09fcaaf77a?w=800','קהילה','','מערכת שלוה',0);
    }
  } catch(e) { console.error('posts seed error:', e.message); }

  // הודעות לרולר לדוגמה (רק אם הטבלה ריקה)
  try {
    if (db.prepare('SELECT COUNT(*) as c FROM announcements').get().c === 0) {
      const iann = db.prepare('INSERT INTO announcements(title,body,color) VALUES(?,?,?)');
      iann.run('ארוחת צוות קיץ 🎉','20.06 בגן החברה 18:00','#27AE60');
      iann.run('עדכון נהלי חופשה','אנא קראו את העדכון החדש','#1565C0');
      iann.run('ישיבת צוות שלישי','10:00 בחדר ישיבות A','#9B59B6');
      iann.run('יום כיף שנתי 🌳','15.07 — פרטים בקרוב','#16A085');
    }
  } catch(e) { console.error('announcements seed error:', e.message); }

  // שאלות נפוצות לשלומית AI (רק אם הטבלה ריקה)
  try {
    if (db.prepare('SELECT COUNT(*) as c FROM ai_faq').get().c === 0) {
      const ifaq = db.prepare('INSERT INTO ai_faq(question,answer,display_order) VALUES(?,?,?)');
      ifaq.run('איך אני מבקש חופשה?','להיכנס ל"פניה למחלקות" ← HR ומשאבי אנוש ← חופשה, למלא את הטופס ולהגיש. הבקשה עוברת לאישור המנהל הישיר ואז ל-HR.', 1);
      ifaq.run('מתי מגיע לי יום מנוחה?','לכל עובד מגיעים ימי חופשה שנתיים לפי הוותק. אפשר לראות את הצבירה שלך באזור האישי.', 2);
      ifaq.run('איפה רואים תלוש שכר?','תלושי שכר זמינים במערכת חילנט. יש קישור אליה מאייקון "חילן" בדף הבית.', 3);
      ifaq.run('איך שולחים בקשה לתחזוקה?','להיכנס ל"פניה למחלקות" ← תחזוקה ← קריאת תחזוקה, למלא מיקום ותיאור.', 4);
    }
  } catch(e) { console.error('ai_faq seed error:', e.message); }

  // קטגוריות טפסים וטפסים דיפולטיים (רק אם הטבלה ריקה)
  try {
    if (db.prepare('SELECT COUNT(*) as c FROM form_categories').get().c === 0) {
      const icat = db.prepare('INSERT INTO form_categories(name,icon,color,display_order) VALUES(?,?,?,?)');
      const iform = db.prepare('INSERT INTO forms(category_id,name,icon,dept,approval_steps,fields,display_order) VALUES(?,?,?,?,?,?,?)');

      // fc0 — HR ומשאבי אנוש
      const hrId = icat.run('HR ומשאבי אנוש','👥','#7B2D8B',1).lastInsertRowid;
      iform.run(hrId,'חופשה','✈️','HR',JSON.stringify(['עובד','מנהל ישיר','HR']),JSON.stringify([
        {id:'vtype',lb:'סוג חופשה',type:'select',options:['שנתית','יום אישי','חירום','חתונה','אבל']},
        {id:'from',lb:'מתאריך',type:'date',required:true},
        {id:'to',lb:'עד תאריך',type:'date',required:true},
        {id:'note',lb:'הערות',type:'textarea'}
      ]),1);
      iform.run(hrId,'מחלה','🤒','HR',JSON.stringify(['עובד','HR']),JSON.stringify([
        {id:'from',lb:'מתאריך',type:'date',required:true},
        {id:'to',lb:'עד תאריך',type:'date',required:true},
        {id:'reason',lb:'סיבה',type:'textarea'}
      ]),2);
      iform.run(hrId,'תאונת עבודה','🚑','HR',JSON.stringify(['עובד','מנהל ישיר','HR']),JSON.stringify([
        {id:'date',lb:'תאריך',type:'date',required:true},
        {id:'time',lb:'שעה',type:'time'},
        {id:'loc',lb:'מיקום',type:'text',required:true},
        {id:'desc',lb:'תיאור',type:'textarea',required:true},
        {id:'injuries',lb:'פציעות',type:'textarea'}
      ]),3);
      iform.run(hrId,'הערכה עצמית','⭐','HR',JSON.stringify(['עובד','HR']),JSON.stringify([
        {id:'year',lb:'שנת הערכה',type:'text'},
        {id:'text',lb:'משוב',type:'textarea',required:true}
      ]),4);
      iform.run(hrId,'חבר מביא חבר','👥','HR',JSON.stringify(['עובד','HR']),JSON.stringify([
        {id:'name',lb:'שם המועמד',type:'text',required:true},
        {id:'phone',lb:'טלפון',type:'tel',required:true},
        {id:'role',lb:'תפקיד מתאים',type:'text'},
        {id:'why',lb:'למה מתאים?',type:'textarea'}
      ]),5);
      iform.run(hrId,'מילואים','🪖','HR',JSON.stringify(['עובד','HR']),JSON.stringify([
        {id:'days',lb:'ימי שירות',type:'number',required:true},
        {id:'unit',lb:'יחידה',type:'text',required:true},
        {id:'from',lb:'מתאריך',type:'date'},
        {id:'to',lb:'עד תאריך',type:'date'},
        {id:'order',lb:'מספר צו',type:'text'}
      ]),6);
      iform.run(hrId,'שינוי תנאים','📋','HR',JSON.stringify(['עובד','מנהל ישיר','HR']),JSON.stringify([
        {id:'type',lb:'סוג השינוי',type:'select',options:['שינוי היקף משרה','עדכון תפקיד','שינוי שעות','עבודה מהבית','אחר']},
        {id:'details',lb:'פירוט',type:'textarea',required:true}
      ]),7);
      iform.run(hrId,'חל"ד','✈️','HR',JSON.stringify(['עובד','מנהל ישיר','HR']),JSON.stringify([
        {id:'from',lb:'מתאריך',type:'date',required:true},
        {id:'to',lb:'עד תאריך',type:'date',required:true},
        {id:'reason',lb:'סיבה',type:'textarea',required:true}
      ]),8);

      // fc2 — ציוד ומחשוב
      const itId = icat.run('ציוד ומחשוב','📦','#4BAEE8',2).lastInsertRowid;
      iform.run(itId,'הזמנת ציוד','📦','מחשוב',JSON.stringify(['עובד','מנהל ישיר','מחשוב']),JSON.stringify([
        {id:'item',lb:'פריט',type:'text',required:true},
        {id:'qty',lb:'כמות',type:'number'},
        {id:'urg',lb:'דחיפות',type:'select',options:['רגיל','גבוהה','דחוף']},
        {id:'price',lb:'מחיר ₪',type:'number'},
        {id:'reason',lb:'נימוק',type:'textarea',required:true},
        {id:'link',lb:'קישור',type:'url'}
      ]),1);
      iform.run(itId,'תקלת IT','💻','מחשוב',JSON.stringify(['עובד','מחשוב']),JSON.stringify([
        {id:'type',lb:'סוג',type:'select',options:['מחשב','רשת','מדפסת','תוכנה','מייל','אחר']},
        {id:'desc',lb:'תיאור',type:'textarea',required:true}
      ]),2);

      // fc3 — תחזוקה
      const mntId = icat.run('תחזוקה','🔧','#E84040',3).lastInsertRowid;
      iform.run(mntId,'קריאת תחזוקה','🔧','תחזוקה',JSON.stringify(['עובד','תחזוקה']),JSON.stringify([
        {id:'type',lb:'סוג',type:'select',options:['חשמל','אינסטלציה','מיזוג','ניקיון','ריהוט','אחר']},
        {id:'loc',lb:'מיקום',type:'text',required:true,placeholder:'חדר / קומה...'},
        {id:'desc',lb:'תיאור',type:'textarea',required:true},
        {id:'urg',lb:'דחיפות',type:'select',options:['רגיל','גבוהה','סכנת בטיחות']}
      ]),1);

      // fc4 — שיווק וצילום
      const mktId = icat.run('שיווק וצילום','📣','#E84393',4).lastInsertRowid;
      iform.run(mktId,'צילום','📸','שיווק',JSON.stringify(['עובד','מנהל','שיווק']),JSON.stringify([
        {id:'type',lb:'סוג',type:'select',options:['אירוע','תוכן לרשתות','צילום קבוצתי','פורטרט','אחר']},
        {id:'date',lb:'תאריך',type:'date',required:true},
        {id:'time',lb:'שעה',type:'time'},
        {id:'desc',lb:'תיאור',type:'textarea',required:true}
      ]),1);
      iform.run(mktId,'וידאו','🎬','שיווק',JSON.stringify(['עובד','מנהל','שיווק']),JSON.stringify([
        {id:'type',lb:'סוג',type:'select',options:['תדמית','אירוע','Reel','הדרכה','אחר']},
        {id:'date',lb:'תאריך הפקה',type:'date'},
        {id:'desc',lb:'תיאור',type:'textarea',required:true}
      ]),2);

      // fc5 — מזכירות
      const secId = icat.run('מזכירות','📋','#9B59B6',5).lastInsertRowid;
      iform.run(secId,'בקשה כללית','📋','מזכירות',JSON.stringify(['עובד','מזכירות']),JSON.stringify([
        {id:'type',lb:'סוג',type:'select',options:['תיאום פגישה','הזמנת חדר','הפקת מסמך','אישור חתימה','משלוח','כיבוד','אחר']},
        {id:'dt',lb:'תאריך ושעה',type:'datetime-local'},
        {id:'desc',lb:'פרטים',type:'textarea',required:true}
      ]),1);
      iform.run(secId,'הזמנת חדר','🗓️','מזכירות',JSON.stringify(['עובד','מזכירות']),JSON.stringify([
        {id:'room',lb:'חדר',type:'select',options:['חדר A (8 מקומות)','חדר B (20 מקומות)','אולם (50+)','חדר הנהלה']},
        {id:'date',lb:'תאריך',type:'date',required:true},
        {id:'hours',lb:'שעות',type:'text',placeholder:'09:00-11:00'},
        {id:'count',lb:'משתתפים',type:'number'}
      ]),2);

      // fc7 — ביטחון
      const secDeptId = icat.run('ביטחון','🔒','#27AE60',6).lastInsertRowid;
      iform.run(secDeptId,'דיווח אירוע ביטחוני','🚨','ביטחון',JSON.stringify(['עובד','ביטחון']),JSON.stringify([
        {id:'date',lb:'תאריך',type:'date',required:true},
        {id:'time',lb:'שעה',type:'time'},
        {id:'loc',lb:'מיקום',type:'text',required:true},
        {id:'desc',lb:'תיאור האירוע',type:'textarea',required:true}
      ]),1);

      // fc8 — רווחה ופנאי
      const welId = icat.run('רווחה ופנאי','❤️','#E74C3C',7).lastInsertRowid;
      iform.run(welId,'הצעת אירוע','🎉','רווחה',JSON.stringify(['עובד','רווחה']),JSON.stringify([
        {id:'title',lb:'שם האירוע',type:'text',required:true},
        {id:'date',lb:'תאריך רצוי',type:'date'},
        {id:'desc',lb:'תיאור',type:'textarea',required:true}
      ]),1);
    }
  } catch(e) { console.error('forms seed error:', e.message); }


  // פרסומות / סרטונים לדף הבית (רק אם הטבלה ריקה)
  try {
    if (db.prepare('SELECT COUNT(*) as c FROM ads').get().c === 0) {
      const iad = db.prepare(`INSERT INTO ads(title,sub,type,media_url,poster_url,link_url,link_text,overlay_color,active,display_order) VALUES(?,?,?,?,?,?,?,?,?,?)`);
      // הוידאו הראשי של שלוה
      iad.run('שלוה — נותנים תקווה, משנים חיים','ראו את הסיפור שלנו','video','/media/sha.mp4','/media/sha_poster.jpg','https://www.shalva.org','לצפייה באתר שלוה','rgba(26,10,46,.35)',1,1);
      // תמונות פרסום לדוגמה
      iad.run('קמפיין ההתרמה השנתי','הצטרפו לפעילות ההתרמה — כל תרומה עושה הבדל','image','https://images.unsplash.com/photo-1593113646773-028c64a8f1b8?w=1200','','https://www.shalva.org/donate','לתרומה','rgba(26,10,46,.55)',1,2);
      iad.run('מרכז שלוה החדש באשקלון','פתיחה חגיגית — ספטמבר 2026','image','https://images.unsplash.com/photo-1541535650810-10d26f5c2ab3?w=1200','','','','rgba(26,10,46,.55)',1,3);
      iad.run('הצטרפו לצוות שלוה','דרושים אנשי חינוך, טיפול, ואדמיניסטרציה','image','https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200','','','','rgba(26,10,46,.55)',1,4);
    }
  } catch(e) { console.error('ads seed error:', e.message); }



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
