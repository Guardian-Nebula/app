

(function(){
  "use strict";

  /* ================= SUPABASE CONFIG =================
     Fill these in after creating a Supabase project and running
     supabase-schema.sql against it. Until then the app runs in
     local-only mode (localStorage, no login required, no sync). */
  var SUPABASE_URL = 'https://lnsjpwfclvlyfrhfyjqe.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_eFQpEso1PGz4YhYBM1CaWA_I_Ba3-QJ';
  var CLOUD_CONFIGURED = SUPABASE_URL.indexOf('YOUR_SUPABASE') === -1 && SUPABASE_ANON_KEY.indexOf('YOUR_SUPABASE') === -1;
  var sb = null;
  if(CLOUD_CONFIGURED && window.supabase){
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  var currentUser = null; // set once signed in

  /* ---------------- ambient starfield ---------------- */
  (function seedStarfield(){
    var field = document.getElementById('starfield');
    if(!field) return;
    var html = '';
    for(var i=0;i<80;i++){
      var top = (Math.random()*100).toFixed(2);
      var left = (Math.random()*100).toFixed(2);
      var delay = (Math.random()*5).toFixed(2);
      var size = (Math.random() < 0.15) ? '3px' : '2px';
      html += '<span style="top:'+top+'%;left:'+left+'%;animation-delay:'+delay+'s;width:'+size+';height:'+size+';"></span>';
    }
    field.innerHTML = html;
  })();

  /* ---------------- habit definitions ---------------- */
  var CATEGORIES = {
    recovery:{ color:'#34C77B', label:'Recovery' },
    mind:{ color:'#34C77B', label:'Mind' },
    body:{ color:'#F0B429', label:'Body reset' },
    movement:{ color:'#8C8DF5', label:'Movement' },
    fuel:{ color:'#8C8DF5', label:'Fuel' },
    connection:{ color:'#8C8DF5', label:'Connection' }
  };

  var BUILTIN_HABITS = [
    { id:'sleep',     name:'Sleep',         cat:'recovery',   unit:'hours',   r:14, anchor:true, icon:'sleep', builtin:true },
    { id:'meditate',  name:'Meditation',    cat:'mind',       unit:'minutes', r:14, anchor:true, icon:'meditate', builtin:true },
    { id:'cold',      name:'Cold shower',   cat:'body',       unit:'minutes', r:12, icon:'cold', builtin:true },
    { id:'sun',       name:'Sunlight',      cat:'body',       unit:'minutes', r:12, icon:'sun', builtin:true },
    { id:'earth',     name:'Earthing',      cat:'body',       unit:'minutes', r:12, icon:'earth', builtin:true },
    { id:'walk',      name:'Walk',          cat:'movement',   unit:'minutes', r:12, icon:'walk', builtin:true },
    { id:'workout',   name:'Workout',       cat:'movement',   unit:'minutes', r:12, icon:'workout', builtin:true },
    { id:'food',      name:'Clean food',    cat:'fuel',       unit:null,      r:12, icon:'food', builtin:true },
    { id:'social',    name:'Social time',   cat:'connection', unit:'minutes', r:12, icon:'social', builtin:true }
  ];

  var CUSTOM_KEY = 'guardian-nebula-custom-habits-v1';
  function loadLocalCustomHabits(){
    try{ var raw = window.localStorage.getItem(CUSTOM_KEY); return raw ? JSON.parse(raw) : []; }
    catch(e){ return []; }
  }
  function saveLocalCustomHabits(list){
    try{ window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); }catch(e){}
  }
  var customHabits = loadLocalCustomHabits();

  var HABITS = [];
  var HABIT_BY_ID = {};
  var EDGES = [];

  function slugify(name){
    var base = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
    var id = base || 'practice';
    var n = 1;
    while(HABIT_BY_ID[id] || customHabits.some(function(c){return c.id===id && id!==base;})){
      id = base+'-'+(++n);
    }
    return id;
  }

  function hashJitter(id, spread){
    var h = 0;
    for(var i=0;i<id.length;i++){ h = ((h<<5)-h+id.charCodeAt(i))|0; }
    var a = ((h % 1000)/1000);
    var b = (((h>>3) % 1000)/1000);
    return { dx:(a-0.5)*2*spread, dy:(b-0.5)*2*spread };
  }

  function computeLayout(list){
    var anchors = list.filter(function(h){return h.anchor;});
    var orbit = list.filter(function(h){return !h.anchor;});
    var cx=400, cy=260;

    var aSpacing = 90;
    var aStartY = cy - ((anchors.length-1)*aSpacing)/2;
    anchors.forEach(function(h,i){
      var j = hashJitter(h.id, 6);
      h.x = cx + j.dx; h.y = aStartY + i*aSpacing + j.dy;
    });

    var n = Math.max(orbit.length,1);
    var radius = Math.min(150 + Math.max(0, orbit.length-8)*6, 210);
    orbit.forEach(function(h,i){
      var angle = (2*Math.PI*i/n) - Math.PI/2;
      var j = hashJitter(h.id, 16);
      h.x = cx + radius*Math.cos(angle) + j.dx;
      h.y = cy + radius*Math.sin(angle)*0.82 + j.dy;
    });
  }

  function computeEdges(list){
    var anchors = list.filter(function(h){return h.anchor;});
    var orbit = list.filter(function(h){return !h.anchor;});
    var edges = [];
    orbit.forEach(function(h){
      // nearest anchor only — a soft single tether instead of a line to every anchor,
      // so the sky reads as a drifting cluster rather than a rigid asterisk.
      var nearest = anchors[0], best = Infinity;
      anchors.forEach(function(a){
        var d = Math.hypot(a.x-h.x, a.y-h.y);
        if(d < best){ best = d; nearest = a; }
      });
      if(nearest) edges.push([h.id, nearest.id]);
    });
    for(var i=0;i<anchors.length-1;i++) edges.push([anchors[i].id, anchors[i+1].id]);
    return edges;
  }

  function rebuildHabits(){
    HABITS = BUILTIN_HABITS.concat(customHabits);
    HABIT_BY_ID = {};
    HABITS.forEach(function(h){ HABIT_BY_ID[h.id] = h; });
    computeLayout(HABITS);
    EDGES = computeEdges(HABITS);
  }
  rebuildHabits();

  function addCustomHabit(data){
    var habit = {
      id: slugify(data.name),
      name: data.name,
      cat: data.cat,
      unit: data.unit || null,
      r: 12,
      anchor: false,
      icon: data.icon || 'spark',
      builtin: false
    };
    customHabits.push(habit);
    saveLocalCustomHabits(customHabits);
    if(sb && currentUser){
      sb.from('nebula_custom_habits').upsert({
        user_id: currentUser.id, habit_id: habit.id, name: habit.name,
        category: habit.cat, unit: habit.unit, icon: habit.icon
      }, { onConflict:'user_id,habit_id' }).then(function(res){
        if(res.error) console.warn('cloud custom-habit save failed:', res.error.message);
      });
    }
    rebuildHabits();
  }

  function removeCustomHabit(habitId){
    customHabits = customHabits.filter(function(h){ return h.id !== habitId; });
    saveLocalCustomHabits(customHabits);
    if(sb && currentUser){
      sb.from('nebula_custom_habits').delete().eq('user_id', currentUser.id).eq('habit_id', habitId).then(function(res){
        if(res.error) console.warn('cloud custom-habit delete failed:', res.error.message);
      });
    }
    rebuildHabits();
  }

  var DEVICE_PROVIDERS = [
    { id:'fitbit', name:'Fitbit', blurb:'Steps, sleep stages, heart rate.' },
    { id:'googlefit', name:'Google Fit', blurb:'Android and Wear OS activity data.' },
    { id:'applehealth', name:'Apple Health', blurb:'iPhone and Apple Watch, via the Health app export.' },
    { id:'oura', name:'Oura', blurb:'Sleep, readiness, and body temperature.' },
    { id:'garmin', name:'Garmin', blurb:'Workouts, steps, and sleep from Garmin devices.' },
    { id:'boatxtend', name:'boAt Xtend', blurb:'Direct BLE sync for steps, heart rate, calories, distance, and active time.' }
  ];

  /* ---------------- icon glyphs (paths only, colored via currentColor) ---------------- */
  var ICON_PATHS = {
    sleep:'M-6,-8 A8,8 0 1 0 6,7 A6,6 0 1 1 -6,-8 Z',
    meditate:'M0,-9 C2,-5 2,-2 0,0 C-2,-2 -2,-5 0,-9 Z M-7,3 C-4,-1 4,-1 7,3 C4,7 -4,7 -7,3 Z',
    cold:'M0,-9 C4,-3 7,1 7,4.5 A7,7 0 1 1 -7,4.5 C-7,1 -4,-3 0,-9 Z',
    sun:'M0,-4.5 A4.5,4.5 0 1 0 0,4.5 A4.5,4.5 0 1 0 0,-4.5 Z M0,-10 L0,-7.5 M0,10 L0,7.5 M-10,0 L-7.5,0 M10,0 L7.5,0 M-7,-7 L-5.3,-5.3 M7,7 L5.3,5.3 M7,-7 L5.3,-5.3 M-7,7 L-5.3,5.3',
    earth:'M0,8 L0,-2 M0,-2 C-2,-6 -6,-7 -9,-6 C-8,-2 -4,0 0,-2 M0,-2 C2,-6 6,-7 9,-6 C8,-2 4,0 0,-2 M-5,8 L5,8',
    walk:'M-3,-9 A2.6,2.6 0 1 0 -3,-3.8 A2.6,2.6 0 1 0 -3,-9 Z M-3,-3 C-5,0 -6,3 -4,8 L-1,8 L-2,2 L1,6 L4,8 L2,8 L-1,3',
    workout:'M-9,0 L9,0 M-9,-4 L-9,4 M9,-4 L9,4 M-13,-2.5 L-13,2.5 M13,-2.5 L13,2.5',
    food:'M0,-7 C-1.5,-9 -4,-9 -4,-6.5 C-4,-8 -1,-8 0,-7 Z M0,-5 C5,-5 8,0 6,5 C4,9 -4,9 -6,5 C-8,0 -5,-5 0,-5 Z',
    social:'M-4,-2 A3.4,3.4 0 1 0 -4,-8.8 A3.4,3.4 0 1 0 -4,-2 Z M4,-2 A3.4,3.4 0 1 0 4,-8.8 A3.4,3.4 0 1 0 4,-2 Z M-9,8 C-9,2 -1,2 -1,8 M1,8 C1,2 9,2 9,8',
    spark:'M0,-10 L2.2,-2.2 L10,0 L2.2,2.2 L0,10 L-2.2,2.2 L-10,0 L-2.2,-2.2 Z'
  };

  var svgNS = "http://www.w3.org/2000/svg";
  function buildIconDefs(){
    var defs = document.getElementById('iconDefs');
    Object.keys(ICON_PATHS).forEach(function(key){
      var sym = document.createElementNS(svgNS,'symbol');
      sym.setAttribute('id','icon-'+key);
      sym.setAttribute('viewBox','-13 -13 26 26');
      var path = document.createElementNS(svgNS,'path');
      path.setAttribute('d', ICON_PATHS[key]);
      path.setAttribute('stroke','currentColor');
      path.setAttribute('stroke-width','1.6');
      path.setAttribute('stroke-linecap','round');
      path.setAttribute('stroke-linejoin','round');
      path.setAttribute('fill', key==='sun' || key==='sleep' || key==='food' || key==='spark' ? 'currentColor' : 'none');
      path.setAttribute('fill-opacity', key==='sun' ? '0.15' : (key==='sleep' || key==='food' ? '0.9' : (key==='spark' ? '0.85' : '0')));
      sym.appendChild(path);
      defs.appendChild(sym);
    });
  }

  /* ---------------- local storage fallback ---------------- */
  var STORAGE_KEY = 'guardian-nebula-logs-v1';
  var PROFILE_KEY = 'guardian-nebula-profile-v1';
  var NOTES_KEY = 'guardian-nebula-notes-v1';

  function loadLocalLogs(){
    try{ var raw = window.localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; }
    catch(e){ return {}; }
  }
  function saveLocalLogs(logs){
    try{ window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs)); }catch(e){}
  }
  function loadLocalProfile(){
    try{ var raw = window.localStorage.getItem(PROFILE_KEY); return raw ? JSON.parse(raw) : {}; }
    catch(e){ return {}; }
  }
  function saveLocalProfile(p){
    try{ window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); }catch(e){}
  }
  function loadLocalNotes(){
    try{ var raw = window.localStorage.getItem(NOTES_KEY); return raw ? JSON.parse(raw) : {}; }
    catch(e){ return {}; }
  }
  function saveLocalNotes(n){
    try{ window.localStorage.setItem(NOTES_KEY, JSON.stringify(n)); }catch(e){}
  }

  var HABIT_REMINDERS_KEY = 'guardian-nebula-habit-reminders-v1';
  function loadLocalHabitReminders(){
    try{ var raw = window.localStorage.getItem(HABIT_REMINDERS_KEY); return raw ? JSON.parse(raw) : {}; }
    catch(e){ return {}; }
  }
  function saveLocalHabitReminders(r){
    try{ window.localStorage.setItem(HABIT_REMINDERS_KEY, JSON.stringify(r)); }catch(e){}
  }

  var LOGS = loadLocalLogs();      // { 'YYYY-MM-DD': { habitId: {done, value} } }
  var PROFILE = loadLocalProfile(); // { birth_year, life_expectancy_years, reminder_time, reminders_enabled, habit_reminders }
  var NOTES = loadLocalNotes();    // { 'YYYY-MM-DD': 'text' }
  var HABIT_REMINDERS = Object.assign({}, loadLocalHabitReminders(), PROFILE.habit_reminders||{}); // { habitId: {enabled, time} }

  function noteFor(dateStr){ return NOTES[dateStr] || ''; }
  function setNote(dateStr, text){
    if(text){ NOTES[dateStr] = text; } else { delete NOTES[dateStr]; }
    saveLocalNotes(NOTES);
    if(sb && currentUser){
      if(text){
        sb.from('nebula_day_notes').upsert({
          user_id: currentUser.id, log_date: dateStr, note: text
        }, { onConflict:'user_id,log_date' }).then(function(res){
          if(res.error) console.warn('cloud note save failed:', res.error.message);
        });
      } else {
        sb.from('nebula_day_notes').delete().eq('user_id', currentUser.id).eq('log_date', dateStr).then(function(){});
      }
    }
  }

  /* ---------------- date helpers ---------------- */
  function pad(n){ return n < 10 ? '0'+n : ''+n; }
  function fmt(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function today(){ return fmt(new Date()); }
  function addDays(dateStr, delta){
    var d = new Date(dateStr+'T00:00:00');
    d.setDate(d.getDate()+delta);
    return fmt(d);
  }
  function dayLabel(dateStr){
    var d = new Date(dateStr+'T00:00:00');
    return ['S','M','T','W','T','F','S'][d.getDay()];
  }
  function monthLabel(y,m){ return new Date(y,m,1).toLocaleString('en-US',{month:'short'}); }

  function entry(dateStr, habitId){
    return (LOGS[dateStr] && LOGS[dateStr][habitId]) || { done:false, value:null };
  }

  function setEntry(dateStr, habitId, val){
    if(!LOGS[dateStr]) LOGS[dateStr] = {};
    LOGS[dateStr][habitId] = val;
    saveLocalLogs(LOGS);
    if(sb && currentUser){
      sb.from('nebula_habit_logs').upsert({
        user_id: currentUser.id, log_date: dateStr, habit_id: habitId,
        done: !!val.done, value: (val.value===undefined?null:val.value)
      }, { onConflict:'user_id,log_date,habit_id' }).then(function(res){
        if(res.error) console.warn('cloud save failed, kept locally:', res.error.message);
      });
    }
  }

  function streakFor(habitId, fromDate){
    var count = 0, d = fromDate || today();
    while(true){
      var e = entry(d, habitId);
      if(e.done){ count++; d = addDays(d,-1); } else break;
      if(count > 3650) break;
    }
    return count;
  }
  function firstLogDate(){
    var keys = Object.keys(LOGS).sort();
    return keys.length ? keys[0] : null;
  }

  /* ---------------- cloud load ---------------- */
  function loadCloudData(){
    if(!sb || !currentUser) return Promise.resolve();
    var logsP = sb.from('nebula_habit_logs').select('*').eq('user_id', currentUser.id);
    var profP = sb.from('nebula_profiles').select('*').eq('user_id', currentUser.id).maybeSingle();
    var customP = sb.from('nebula_custom_habits').select('*').eq('user_id', currentUser.id);
    var notesP = sb.from('nebula_day_notes').select('*').eq('user_id', currentUser.id);
    return Promise.all([logsP, profP, customP, notesP]).then(function(results){
      var logsRes = results[0], profRes = results[1], customRes = results[2], notesRes = results[3];
      if(!logsRes.error && logsRes.data){
        var merged = {};
        logsRes.data.forEach(function(row){
          if(!merged[row.log_date]) merged[row.log_date] = {};
          merged[row.log_date][row.habit_id] = { done: row.done, value: row.value };
        });
        LOGS = merged;
      }
      if(!profRes.error && profRes.data){
        PROFILE = {
          birth_year: profRes.data.birth_year,
          life_expectancy_years: profRes.data.life_expectancy_years,
          reminder_time: profRes.data.reminder_time,
          reminders_enabled: profRes.data.reminders_enabled,
          habit_reminders: profRes.data.habit_reminders || {}
        };
        HABIT_REMINDERS = PROFILE.habit_reminders || {};
        saveLocalHabitReminders(HABIT_REMINDERS);
      }
      if(!customRes.error && customRes.data){
        customHabits = customRes.data.map(function(row){
          return { id: row.habit_id, name: row.name, cat: row.category, unit: row.unit, r:12, anchor:false, icon: row.icon || 'spark', builtin:false };
        });
        saveLocalCustomHabits(customHabits);
        rebuildHabits();
      }
      if(!notesRes.error && notesRes.data){
        var n = {};
        notesRes.data.forEach(function(row){ n[row.log_date] = row.note; });
        NOTES = n;
        saveLocalNotes(NOTES);
      }
    }).catch(function(err){ console.warn('cloud load failed, using local cache:', err); });
  }

  function saveProfile(p){
    PROFILE = Object.assign({}, PROFILE, p);
    saveLocalProfile(PROFILE);
    if(sb && currentUser){
      sb.from('nebula_profiles').upsert({
        user_id: currentUser.id,
        birth_year: PROFILE.birth_year,
        life_expectancy_years: PROFILE.life_expectancy_years,
        reminder_time: PROFILE.reminder_time,
        reminders_enabled: PROFILE.reminders_enabled,
        habit_reminders: PROFILE.habit_reminders || {}
      }, { onConflict:'user_id' }).then(function(res){
        if(res.error) console.warn('cloud profile save failed:', res.error.message);
      });
    }
  }

  /* ================= AUTH ================= */
  var authOverlay = document.getElementById('authOverlay');
  var authMode = 'signin';

  function showAuthOverlay(){ authOverlay.classList.remove('hidden'); showAuthStep('welcome'); }
  function hideAuthOverlay(){ authOverlay.classList.add('hidden'); }

  function showAuthStep(step){
    document.querySelectorAll('.auth-step').forEach(function(el){
      el.classList.toggle('active', el.dataset.step === step);
    });
    document.getElementById('prog1').classList.toggle('done', true);
    document.getElementById('prog2').classList.toggle('done', step === 'credentials');
  }
  function handleSkip(){ hideAuthOverlay(); boot(); }
  document.getElementById('welcomeContinueBtn').addEventListener('click', function(){ showAuthStep('credentials'); });
  document.getElementById('authBackBtn').addEventListener('click', function(){ showAuthStep('welcome'); });
  document.getElementById('authSkipBtnWelcome').addEventListener('click', handleSkip);

  function setAuthMode(mode){
    authMode = mode;
    document.querySelectorAll('.auth-tabs button').forEach(function(b){
      b.classList.toggle('active', b.dataset.mode===mode);
    });
    document.getElementById('authTitle').textContent = mode==='signin' ? 'Welcome back' : 'Create your account';
    document.getElementById('authSub').textContent = mode==='signin'
      ? 'Sign in to sync your constellation across devices.'
      : 'A few seconds, then your sky follows you anywhere.';
    document.getElementById('authSubmitBtn').textContent = mode==='signin' ? 'Sign in' : 'Create account';
    document.getElementById('authMsg').textContent = '';
  }
  document.querySelectorAll('.auth-tabs button').forEach(function(b){
    b.addEventListener('click', function(){ setAuthMode(b.dataset.mode); });
  });

  document.getElementById('authSubmitBtn').addEventListener('click', function(){
    var email = document.getElementById('authEmail').value.trim();
    var password = document.getElementById('authPassword').value;
    var msg = document.getElementById('authMsg');
    msg.className = 'auth-msg'; msg.textContent = '';
    if(!sb){ msg.className='auth-msg err'; msg.textContent='Cloud sync is not configured on this deployment.'; return; }
    if(!email || !password){ msg.className='auth-msg err'; msg.textContent='Enter an email and password.'; return; }

    var action = authMode==='signin'
      ? sb.auth.signInWithPassword({ email:email, password:password })
      : sb.auth.signUp({ email:email, password:password });

    action.then(function(res){
      if(res.error){ msg.className='auth-msg err'; msg.textContent = res.error.message; return; }
      if(authMode==='signup' && res.data && res.data.user && !res.data.session){
        msg.className='auth-msg ok'; msg.textContent='Check your inbox to confirm your email, then sign in.';
        setAuthMode('signin');
        return;
      }
      onSignedIn(res.data.session ? res.data.session.user : res.data.user);
    });
  });

  document.getElementById('authGoogleBtn').addEventListener('click', function(){
    var msg = document.getElementById('authMsg');
    if(!sb){ msg.className='auth-msg err'; msg.textContent='Cloud sync is not configured on this deployment.'; return; }
    sb.auth.signInWithOAuth({
      provider:'google',
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
  });

  document.getElementById('authSkipBtn').addEventListener('click', handleSkip);

  function onSignedIn(user){
    currentUser = user;
    hideAuthOverlay();
    loadCloudData().then(boot);
    renderAccountChip();
  }

  function renderAccountChip(){
    var chip = document.getElementById('accountChip');
    if(currentUser){
      chip.innerHTML = '<span class="sync-pill cloud">Synced</span> <b>'+ (currentUser.email||'Account') +'</b> <button id="signOutBtn">Sign out</button>';
      var btn = document.getElementById('signOutBtn');
      if(btn) btn.addEventListener('click', function(){
        sb.auth.signOut().then(function(){ window.location.reload(); });
      });
    } else if(sb){
      chip.innerHTML = '<span class="sync-pill local">This device only</span> <button id="signInPromptBtn">Sign in</button>';
      var btn2 = document.getElementById('signInPromptBtn');
      if(btn2) btn2.addEventListener('click', showAuthOverlay);
    } else {
      chip.innerHTML = '<span class="sync-pill local">This device only</span>';
    }
    document.getElementById('storageModeNote').textContent = currentUser
      ? 'Guardian Nebula — synced to your account.'
      : 'Guardian Nebula — data stays on this device.';
    updateMetaGreeting();
  }

  /* ---------------- meta bar: greeting, date, clock, location ---------------- */
  function updateMetaGreeting(){
    var g = document.getElementById('metaGreeting');
    if(!g) return;
    if(currentUser && currentUser.email){
      g.textContent = 'Hi, ' + currentUser.email.split('@')[0];
    } else {
      g.textContent = 'This device only';
    }
  }

  function deviceLocationLabel(){
    try{
      var locale = navigator.language || 'en-US';
      var parts = locale.split('-');
      var region = parts.length > 1 ? parts[parts.length-1] : null;
      if(region && /^[A-Za-z]{2}$/.test(region) && window.Intl && Intl.DisplayNames){
        var dn = new Intl.DisplayNames([locale], { type:'region' });
        var name = dn.of(region.toUpperCase());
        if(name) return name;
      }
    }catch(e){}
    try{
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if(tz) return tz.split('/').pop().replace(/_/g,' ');
    }catch(e){}
    return '';
  }

  function updateMetaLocation(){
    var wrap = document.getElementById('metaLocation');
    var txt = document.getElementById('metaLocationText');
    if(!wrap || !txt) return;
    var loc = deviceLocationLabel();
    if(loc){ txt.textContent = loc; wrap.style.display = ''; }
    else { wrap.style.display = 'none'; }
  }

  function updateMetaClock(){
    var now = new Date();
    var dateEl = document.getElementById('metaDate');
    var clockEl = document.getElementById('metaClock');
    if(dateEl) dateEl.textContent = now.toLocaleDateString(undefined,{ weekday:'short', month:'short', day:'numeric' });
    if(clockEl) clockEl.textContent = now.toLocaleTimeString(undefined,{ hour:'2-digit', minute:'2-digit' });
  }

  function initAuth(){
    if(!sb){
      if(CLOUD_CONFIGURED){
        // keys are filled in, but window.supabase never showed up — the CDN script(s) failed.
        document.getElementById('authSdkWarning').style.display = 'block';
      } else {
        document.getElementById('authConfigWarning').style.display = 'block';
      }
      renderAccountChip();
      showAuthOverlay();
      return Promise.resolve(false);
    }
    return sb.auth.getSession().then(function(res){
      var session = res.data && res.data.session;
      if(session && session.user){
        currentUser = session.user;
        renderAccountChip();
        return loadCloudData().then(function(){ boot(); return true; });
      } else {
        renderAccountChip();
        showAuthOverlay();
        return false;
      }
    }).catch(function(err){
      console.warn('Supabase session check failed, falling back to local mode:', err);
      document.getElementById('authConfigWarning').style.display = 'block';
      document.getElementById('authConfigWarning').textContent = 'Couldn\u2019t reach Supabase — check your project URL/key, or continue on this device only.';
      renderAccountChip();
      showAuthOverlay();
      return false;
    });
  }

  /* ---------------- constellation render ---------------- */
  var edgesLayer = document.getElementById('edgesLayer');
  var starsLayer = document.getElementById('starsLayer');

  function renderConstellation(){
    edgesLayer.innerHTML = '';
    starsLayer.innerHTML = '';
    var t = today();

    EDGES.forEach(function(pair){
      var a = HABIT_BY_ID[pair[0]], b = HABIT_BY_ID[pair[1]];
      var lit = entry(t,a.id).done && entry(t,b.id).done;
      var line = document.createElementNS(svgNS,'line');
      line.setAttribute('x1',a.x); line.setAttribute('y1',a.y);
      line.setAttribute('x2',b.x); line.setAttribute('y2',b.y);
      line.setAttribute('class','edge'+(lit?' lit':''));
      edgesLayer.appendChild(line);
    });

    HABITS.forEach(function(h, i){
      var e = entry(t,h.id);
      var streak = streakFor(h.id);
      var color = CATEGORIES[h.cat].color;

      var g = document.createElementNS(svgNS,'g');
      g.setAttribute('class','star-btn'+(e.done?' done':' dim')+(streak>=7?' streak-hot':''));
      g.setAttribute('tabindex','0');
      g.setAttribute('role','button');
      g.setAttribute('aria-label', h.name + (e.done?', logged today':', not logged today'));
      g.dataset.habit = h.id;

      // soft nebula haze behind the star — always present, brighter once lit
      var haze = document.createElementNS(svgNS,'circle');
      haze.setAttribute('cx',h.x); haze.setAttribute('cy',h.y);
      haze.setAttribute('r', h.r + (h.anchor ? 30 : 24));
      haze.setAttribute('fill', color);
      haze.setAttribute('opacity', e.done ? '0.16' : '0.055');
      haze.setAttribute('class','star-haze');
      g.appendChild(haze);

      if(streak>=7){
        var ring = document.createElementNS(svgNS,'circle');
        ring.setAttribute('cx',h.x); ring.setAttribute('cy',h.y);
        ring.setAttribute('r', h.r+9);
        ring.setAttribute('class','star-ring');
        ring.setAttribute('stroke', '#F0B429');
        ring.setAttribute('stroke-width','1.4');
        ring.setAttribute('opacity','0.6');
        g.appendChild(ring);
      }

      var core = document.createElementNS(svgNS,'circle');
      core.setAttribute('cx',h.x); core.setAttribute('cy',h.y);
      core.setAttribute('r', h.r + 6);
      core.setAttribute('fill', e.done ? color : 'var(--dim-star)');
      core.setAttribute('opacity', e.done ? '0.16' : '0.1');
      core.setAttribute('class','star-core');
      g.appendChild(core);

      var use = document.createElementNS(svgNS,'use');
      use.setAttributeNS('http://www.w3.org/1999/xlink','href','#icon-'+h.icon);
      use.setAttribute('href','#icon-'+h.icon);
      use.setAttribute('x', h.x-h.r); use.setAttribute('y', h.y-h.r);
      use.setAttribute('width', h.r*2); use.setAttribute('height', h.r*2);
      use.setAttribute('class','star-icon icon-'+h.icon);
      // stagger the ambient blink so stars twinkle out of sync with each other
      var twDelay = (i % 7) * 0.55;
      var twDur = 3.2 + (i % 5) * 0.5;
      use.setAttribute('style','color:'+(e.done?color:'#5E6786')+';animation-delay:'+twDelay+'s;animation-duration:'+twDur+'s;');
      g.appendChild(use);

      var label = document.createElementNS(svgNS,'text');
      label.setAttribute('x',h.x);
      label.setAttribute('y', h.y + h.r + 20);
      label.setAttribute('text-anchor','middle');
      label.setAttribute('class','star-label');
      label.textContent = h.name;
      g.appendChild(label);

      g.addEventListener('click', function(){ openPopover(h.id, g); });
      g.addEventListener('keydown', function(evt){
        if(evt.key==='Enter' || evt.key===' '){ evt.preventDefault(); openPopover(h.id, g); }
      });

      starsLayer.appendChild(g);
    });

    updateTodayStrip();
  }

  function updateTodayStrip(){
    var t = today();
    var doneCount = HABITS.reduce(function(n,h){ return n + (entry(t,h.id).done?1:0); },0);
    document.getElementById('todayScore').textContent = doneCount+'/'+HABITS.length;
    document.getElementById('todayDate').textContent = new Date().toLocaleDateString('en-US',{weekday:'long', month:'long', day:'numeric'});
    var ring = document.getElementById('ringFill');
    if(ring){
      var circumference = 2*Math.PI*21;
      var frac = HABITS.length ? (doneCount/HABITS.length) : 0;
      ring.setAttribute('stroke-dasharray', (circumference*frac).toFixed(1)+' '+circumference.toFixed(1));
      ring.style.stroke = frac >= 1 ? 'var(--ember)' : 'var(--guardian)';
    }
  }

  /* ---------------- popover ---------------- */
  var popover = document.getElementById('popover');
  var popCat = document.getElementById('popCat');
  var popName = document.getElementById('popName');
  var popToggle = document.getElementById('popToggle');
  var popNumRow = document.getElementById('popNumRow');
  var popNumLabel = document.getElementById('popNumLabel');
  var popNumInput = document.getElementById('popNumInput');
  var popStreak = document.getElementById('popStreak');
  var activeHabitId = null;

  function openPopover(habitId, starEl){
    activeHabitId = habitId;
    var h = HABIT_BY_ID[habitId];
    var e = entry(today(), habitId);

    popCat.textContent = CATEGORIES[h.cat].label;
    popName.textContent = h.name;
    popToggle.className = 'toggle' + (e.done ? ' on' : '');

    if(h.unit){
      popNumRow.style.display = 'block';
      popNumLabel.textContent = h.unit.charAt(0).toUpperCase()+h.unit.slice(1);
      popNumInput.value = e.value != null ? e.value : '';
    } else {
      popNumRow.style.display = 'none';
    }

    var streak = streakFor(habitId);
    popStreak.textContent = streak > 0
      ? streak + '-day streak' + (streak>=7 ? ' — burning bright' : '')
      : 'No active streak yet';

    var wrapRect = document.querySelector('.constellation-wrap').getBoundingClientRect();
    var starRect = starEl.getBoundingClientRect();
    var top = starRect.top - wrapRect.top + starRect.height/2 - 10;
    var left = starRect.left - wrapRect.left + starRect.width/2 - 10;
    left = Math.min(Math.max(left, 10), wrapRect.width - 240);
    top = Math.min(Math.max(top, 10), wrapRect.height - 200);
    popover.style.top = top+'px';
    popover.style.left = left+'px';
    popover.classList.add('open');
  }

  function closePopover(){ popover.classList.remove('open'); activeHabitId = null; }
  document.getElementById('popoverClose').addEventListener('click', closePopover);
  document.addEventListener('click', function(evt){
    if(popover.classList.contains('open') &&
       !popover.contains(evt.target) &&
       !evt.target.closest('.star-btn')){
      closePopover();
    }
  });

  popToggle.addEventListener('click', function(){
    if(!activeHabitId) return;
    var e = entry(today(), activeHabitId);
    var newDone = !e.done;
    setEntry(today(), activeHabitId, { done:newDone, value: e.value });
    popToggle.className = 'toggle' + (newDone ? ' on' : '');
    renderConstellation();
    renderView();
  });

  popNumInput.addEventListener('change', function(){
    if(!activeHabitId) return;
    var e = entry(today(), activeHabitId);
    var v = popNumInput.value === '' ? null : Number(popNumInput.value);
    setEntry(today(), activeHabitId, { done:e.done, value:v });
    renderConstellation();
    renderView();
  });

  /* ---------------- nav ---------------- */
  document.querySelectorAll('nav button[data-scroll]').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelector(btn.dataset.scroll).scrollIntoView({behavior:'smooth'});
    });
  });

  /* ---------------- manual entry form ---------------- */
  var entryHabitSelect = document.getElementById('entryHabit');
  function populateEntrySelect(){
    var prev = entryHabitSelect.value;
    entryHabitSelect.innerHTML = '';
    HABITS.forEach(function(h){
      var opt = document.createElement('option');
      opt.value = h.id; opt.textContent = h.name;
      entryHabitSelect.appendChild(opt);
    });
    if(HABIT_BY_ID[prev]) entryHabitSelect.value = prev;
    syncEntryValueField();
  }
  document.getElementById('entryDate').value = today();

  function syncEntryValueField(){
    var h = HABIT_BY_ID[entryHabitSelect.value] || HABITS[0];
    var field = document.getElementById('entryValueField');
    var label = document.getElementById('entryValueLabel');
    if(h.unit){
      field.style.display = '';
      label.textContent = h.unit.charAt(0).toUpperCase()+h.unit.slice(1);
    } else {
      field.style.display = 'none';
    }
  }
  entryHabitSelect.addEventListener('change', syncEntryValueField);

  document.getElementById('entryForm').addEventListener('submit', function(evt){
    evt.preventDefault();
    var date = document.getElementById('entryDate').value || today();
    var habitId = HABIT_BY_ID[entryHabitSelect.value] ? entryHabitSelect.value : HABITS[0].id;
    var done = document.getElementById('entryDone').checked;
    var valRaw = document.getElementById('entryValue').value;
    var value = valRaw === '' ? null : Number(valRaw);
    setEntry(date, habitId, { done:done, value:value });
    document.getElementById('entryStatus').textContent = 'Saved '+HABIT_BY_ID[habitId].name+' for '+date+'.';
    renderConstellation();
    renderView();
  });

  /* ---------------- add / manage custom practices ---------------- */
  var addPracticeForm = document.getElementById('addPracticeForm');
  var addIconSelect = document.getElementById('addPracticeIcon');
  Object.keys(ICON_PATHS).forEach(function(key){
    var opt = document.createElement('option');
    opt.value = key; opt.textContent = key.charAt(0).toUpperCase()+key.slice(1);
    addIconSelect.appendChild(opt);
  });
  var addCatSelect = document.getElementById('addPracticeCat');
  Object.keys(CATEGORIES).forEach(function(key){
    var opt = document.createElement('option');
    opt.value = key; opt.textContent = CATEGORIES[key].label;
    addCatSelect.appendChild(opt);
  });

  addPracticeForm.addEventListener('submit', function(evt){
    evt.preventDefault();
    var name = document.getElementById('addPracticeName').value.trim();
    if(!name) return;
    addCustomHabit({
      name: name,
      cat: addCatSelect.value,
      unit: document.getElementById('addPracticeUnit').value.trim(),
      icon: addIconSelect.value
    });
    document.getElementById('addPracticeName').value = '';
    document.getElementById('addPracticeUnit').value = '';
    renderConstellation();
    renderView();
    populateEntrySelect();
    renderManageList();
    renderHabitReminders();
  });

  function renderManageList(){
    var wrap = document.getElementById('manageList');
    wrap.innerHTML = '';
    HABITS.forEach(function(h){
      var row = el('div','manage-row');
      row.appendChild(el('div','manage-name','<span class="dot" style="background:'+CATEGORIES[h.cat].color+'"></span>'+h.name+(h.builtin?' <span class="manage-tag">default</span>':' <span class="manage-tag">custom</span>')));
      if(!h.builtin){
        var rmBtn = el('button','btn ghost','Remove');
        rmBtn.type = 'button';
        rmBtn.addEventListener('click', function(){
          if(confirm('Remove "'+h.name+'" and stop tracking it? Past logged data for it stays in your history.')){
            removeCustomHabit(h.id);
            renderConstellation();
            renderView();
            populateEntrySelect();
            renderManageList();
            renderHabitReminders();
          }
        });
        row.appendChild(rmBtn);
      }
      wrap.appendChild(row);
    });
  }


  /* ---------------- dashboard views ---------------- */
  var tabbar = document.getElementById('tabbar');
  var viewContent = document.getElementById('viewContent');
  var currentView = 'daily';

  tabbar.addEventListener('click', function(evt){
    var btn = evt.target.closest('button[data-view]');
    if(!btn) return;
    tabbar.querySelectorAll('button').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    currentView = btn.dataset.view;
    renderView();
  });

  function el(tag, cls, html){
    var e = document.createElement(tag);
    if(cls) e.className = cls;
    if(html !== undefined) e.innerHTML = html;
    return e;
  }

  function renderView(){
    viewContent.innerHTML = '';
    if(currentView==='daily') renderDaily();
    else if(currentView==='weekly') renderWeekly();
    else if(currentView==='monthly') renderMonthly();
    else if(currentView==='yearly') renderYearly();
    else renderLife();

    var f = firstLogDate();
    document.getElementById('firstLogNote').textContent = f ? ('Tracking since '+f) : '';
  }

  function statCard(k,l,accent){
    var c = el('div','stat-card');
    if(accent) c.style.setProperty('--card-accent', accent);
    c.appendChild(el('div','k mono',k));
    c.appendChild(el('div','l',l));
    return c;
  }

  function renderDaily(){
    var t = today(), y = addDays(t,-1);
    renderWearableSummary(t);
    var n = HABITS.length;
    var doneT = HABITS.reduce(function(n,h){return n+(entry(t,h.id).done?1:0);},0);
    var doneY = HABITS.reduce(function(n,h){return n+(entry(y,h.id).done?1:0);},0);

    var stats = el('div','stat-row');
    stats.appendChild(statCard(doneT+'/'+n,'lit today','var(--guardian)'));
    stats.appendChild(statCard(doneY+'/'+n,'lit yesterday','var(--nebula)'));
    var bestStreak = Math.max.apply(null, HABITS.map(function(h){return streakFor(h.id);}).concat([0]));
    stats.appendChild(statCard(bestStreak+'d','longest active streak','var(--ember)'));
    viewContent.appendChild(stats);

    viewContent.appendChild(el('div','panel-title','<h3>Today\u2019s practices</h3><span class="n">'+t+'</span>'));

    HABITS.forEach(function(h){
      var e = entry(t,h.id);
      var streak = streakFor(h.id);
      var block = el('div','habit-block'); block.style.setProperty('--accent', CATEGORIES[h.cat].color);
      var head = el('div','habit-block-head');
      head.appendChild(el('div','habit-name','<span class="dot" style="background:'+CATEGORIES[h.cat].color+'"></span>'+h.name));
      var meta = el('div','habit-meta',
        '<span>'+(e.done?'Done':'Not yet')+'</span>' +
        (h.unit && e.value!=null ? '<span><b>'+e.value+'</b> '+h.unit+'</span>' : '') +
        '<span><b>'+streak+'</b>d streak</span>'
      );
      head.appendChild(meta);
      block.appendChild(head);
      viewContent.appendChild(block);
    });

    viewContent.appendChild(el('div','panel-title','<h3 style="margin-top:26px;">Memory</h3><span class="n">a line about today, if you want one</span>'));
    var noteBlock = el('div','habit-block');
    var ta = el('textarea',null,'');
    ta.rows = 3;
    ta.placeholder = 'What mattered today?';
    ta.style.cssText = 'width:100%;background:var(--void);border:1px solid var(--hairline);border-radius:8px;color:var(--text);font-family:Inter,sans-serif;font-size:13.5px;padding:10px;resize:vertical;';
    ta.value = noteFor(t);
    ta.addEventListener('change', function(){ setNote(t, ta.value.trim()); });
    noteBlock.appendChild(ta);
    viewContent.appendChild(noteBlock);

    var pastNotes = Object.keys(NOTES).sort().reverse().filter(function(d){return d!==t;}).slice(0,6);
    if(pastNotes.length){
      viewContent.appendChild(el('div','panel-title','<h3 style="margin-top:22px;">Recent memories</h3>'));
      pastNotes.forEach(function(d){
        var mb = el('div','habit-block');
        mb.appendChild(el('div','habit-block-head','<div class="habit-name">'+d+'</div>'));
        mb.appendChild(el('p',null,NOTES[d]));
        viewContent.appendChild(mb);
      });
    }
  }


  function renderWeekly(){
    renderWearableSummary(today(), true);
    var days = [];
    for(var i=6;i>=0;i--) days.push(addDays(today(),-i));

    var totalPossible = days.length*HABITS.length;
    var totalDone = 0;
    days.forEach(function(d){ HABITS.forEach(function(h){ if(entry(d,h.id).done) totalDone++; }); });

    var stats = el('div','stat-row');
    stats.appendChild(statCard(Math.round(100*totalDone/totalPossible)+'%','week completion','var(--guardian)'));
    stats.appendChild(statCard(totalDone,'practices logged','var(--nebula)'));
    viewContent.appendChild(stats);

    viewContent.appendChild(el('div','panel-title','<h3>Last 7 days</h3><span class="n"></span>'));

    HABITS.forEach(function(h){
      var block = el('div','habit-block'); block.style.setProperty('--accent', CATEGORIES[h.cat].color);
      var doneDays = days.filter(function(d){return entry(d,h.id).done;}).length;
      var head = el('div','habit-block-head');
      head.appendChild(el('div','habit-name','<span class="dot" style="background:'+CATEGORIES[h.cat].color+'"></span>'+h.name));
      head.appendChild(el('div','habit-meta','<span><b>'+doneDays+'</b>/7 days</span><span><b>'+streakFor(h.id)+'</b>d streak</span>'));
      block.appendChild(head);

      var bars = el('div','bars');
      days.forEach(function(d){
        var e = entry(d,h.id);
        var height = e.done ? (h.unit && e.value ? Math.min(100, 20+e.value*2) : 70) : 6;
        var bar = el('div','bar'+(e.done?' filled':''));
        bar.style.height = height+'%';
        bar.style.setProperty('--bar-color', CATEGORIES[h.cat].color);
        bars.appendChild(bar);
      });
      block.appendChild(bars);

      var labels = el('div','bar-labels');
      days.forEach(function(d){ labels.appendChild(el('span',null,dayLabel(d))); });
      block.appendChild(labels);

      viewContent.appendChild(block);
    });
  }

  function renderMonthly(){
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth();
    var daysInMonth = new Date(y,m+1,0).getDate();
    var monthDays = [];
    for(var d=1; d<=daysInMonth; d++) monthDays.push(y+'-'+pad(m+1)+'-'+pad(d));

    var totalPossible = monthDays.length*HABITS.length;
    var totalDone = 0;
    monthDays.forEach(function(d){ HABITS.forEach(function(h){ if(entry(d,h.id).done) totalDone++; }); });

    var stats = el('div','stat-row');
    stats.appendChild(statCard(Math.round(100*totalDone/totalPossible)+'%','month completion','var(--guardian)'));
    stats.appendChild(statCard(totalDone,'practices logged','var(--nebula)'));
    var bestStreak = Math.max.apply(null, HABITS.map(function(h){return streakFor(h.id);}).concat([0]));
    stats.appendChild(statCard(bestStreak+'d','current best streak','var(--ember)'));
    viewContent.appendChild(stats);

    viewContent.appendChild(el('div','panel-title','<h3>'+monthLabel(y,m)+' heatmap</h3><span class="n">by day, all habits</span>'));
    var heat = el('div','heatmap');
    monthDays.forEach(function(d){
      var doneCount = HABITS.reduce(function(n,h){return n+(entry(d,h.id).done?1:0);},0);
      var alpha = doneCount===0 ? 0 : (0.18 + 0.82*(doneCount/HABITS.length));
      var cell = el('div','heat-cell', d.slice(-2));
      if(doneCount>0) cell.style.background = 'rgba(52,199,123,'+alpha.toFixed(2)+')';
      heat.appendChild(cell);
    });
    viewContent.appendChild(heat);

    viewContent.appendChild(el('div','panel-title','<h3 style="margin-top:26px;">Per-practice completion</h3>'));
    HABITS.forEach(function(h){
      var doneDays = monthDays.filter(function(d){return entry(d,h.id).done;}).length;
      var pct = Math.round(100*doneDays/monthDays.length);
      var block = el('div','habit-block'); block.style.setProperty('--accent', CATEGORIES[h.cat].color);
      var head = el('div','habit-block-head');
      head.appendChild(el('div','habit-name','<span class="dot" style="background:'+CATEGORIES[h.cat].color+'"></span>'+h.name));
      head.appendChild(el('div','habit-meta','<span><b>'+pct+'%</b> of days</span><span><b>'+doneDays+'</b>/'+monthDays.length+'</span>'));
      block.appendChild(head);
      viewContent.appendChild(block);
    });
  }

  function renderYearly(){
    var y = new Date().getFullYear();
    var monthTotals = [];
    for(var m=0;m<12;m++){
      var dim = new Date(y,m+1,0).getDate();
      var done=0, possible=0;
      for(var d=1; d<=dim; d++){
        var ds = y+'-'+pad(m+1)+'-'+pad(d);
        if(new Date(ds) > new Date()) continue;
        HABITS.forEach(function(h){ possible++; if(entry(ds,h.id).done) done++; });
      }
      monthTotals.push({done:done, possible:possible});
    }
    var yearDone = monthTotals.reduce(function(s,x){return s+x.done;},0);
    var yearPossible = monthTotals.reduce(function(s,x){return s+x.possible;},0);

    var stats = el('div','stat-row');
    stats.appendChild(statCard(yearDone,'practices logged in '+y,'var(--nebula)'));
    stats.appendChild(statCard(yearPossible? Math.round(100*yearDone/yearPossible)+'%':'0%','year completion','var(--guardian)'));
    viewContent.appendChild(stats);

    viewContent.appendChild(el('div','panel-title','<h3>Month by month</h3><span class="n">'+y+'</span>'));
    var block = el('div','habit-block');
    var bars = el('div','bars months');
    monthTotals.forEach(function(mt){
      var pct = mt.possible ? Math.round(100*mt.done/mt.possible) : 0;
      var bar = el('div','bar'+(pct>0?' filled':''));
      bar.style.height = Math.max(pct,3)+'%';
      bar.style.setProperty('--bar-color', '#34C77B');
      bar.title = pct+'%';
      bars.appendChild(bar);
    });
    block.appendChild(bars);
    var labels = el('div','bar-labels');
    for(var m2=0;m2<12;m2++) labels.appendChild(el('span',null, monthLabel(y,m2).slice(0,1)));
    block.appendChild(labels);
    viewContent.appendChild(block);

    viewContent.appendChild(el('div','panel-title','<h3 style="margin-top:26px;">Totals by practice</h3>'));
    HABITS.forEach(function(h){
      var count = 0, sum = 0;
      Object.keys(LOGS).forEach(function(d){
        if(d.slice(0,4) !== String(y)) return;
        var e = entry(d,h.id);
        if(e.done) count++;
        if(e.value) sum += e.value;
      });
      var block2 = el('div','habit-block');
      var head = el('div','habit-block-head');
      head.appendChild(el('div','habit-name','<span class="dot" style="background:'+CATEGORIES[h.cat].color+'"></span>'+h.name));
      var extra = h.unit ? '<span><b>'+sum+'</b> '+h.unit+' total</span>' : '';
      head.appendChild(el('div','habit-meta','<span><b>'+count+'</b> days</span>'+extra));
      block2.appendChild(head);
      viewContent.appendChild(block2);
    });
  }

  function renderLife(){
    var first = firstLogDate();
    var stats = el('div','stat-row');

    if(!first){
      stats.appendChild(statCard('0','days tracked'));
      viewContent.appendChild(stats);
      viewContent.appendChild(el('div','empty-note','Your life view fills in once you log your first practice. Tap a star above to begin.'));
      return;
    }

    var dayCount = Object.keys(LOGS).length;
    var totalDone = 0;
    Object.keys(LOGS).forEach(function(d){
      HABITS.forEach(function(h){ if(entry(d,h.id).done) totalDone++; });
    });
    var bestEver = Math.max.apply(null, HABITS.map(function(h){
      var dates = Object.keys(LOGS).sort();
      var max=0, cur=0, prev=null;
      dates.forEach(function(d){
        var e = entry(d,h.id);
        if(e.done){
          if(prev && addDays(prev,1)===d) cur++; else cur=1;
          max = Math.max(max,cur);
        } else { cur=0; }
        prev = d;
      });
      return max;
    }).concat([0]));

    stats.appendChild(statCard(dayCount,'days tracked','var(--guardian)'));
    stats.appendChild(statCard(totalDone,'practices logged, ever','var(--nebula)'));
    stats.appendChild(statCard(bestEver+'d','longest streak ever','var(--ember)'));
    viewContent.appendChild(stats);

    viewContent.appendChild(el('div','panel-title','<h3>Lifetime totals by practice</h3><span class="n">since '+first+'</span>'));
    HABITS.forEach(function(h){
      var count=0, sum=0;
      Object.keys(LOGS).forEach(function(d){
        var e = entry(d,h.id);
        if(e.done) count++;
        if(e.value) sum += e.value;
      });
      var block = el('div','habit-block'); block.style.setProperty('--accent', CATEGORIES[h.cat].color);
      var head = el('div','habit-block-head');
      head.appendChild(el('div','habit-name','<span class="dot" style="background:'+CATEGORIES[h.cat].color+'"></span>'+h.name));
      var extra = h.unit ? '<span><b>'+sum+'</b> '+h.unit+' total</span>' : '';
      head.appendChild(el('div','habit-meta','<span><b>'+count+'</b> total days</span>'+extra));
      block.appendChild(head);
      viewContent.appendChild(block);
    });
  }

  /* ---------------- perspective / life expectancy ---------------- */
  var lifeExpSelect = document.getElementById('lifeExpectancy');
  var customField = document.getElementById('customExpectancyField');
  lifeExpSelect.addEventListener('change', function(){
    customField.style.display = lifeExpSelect.value==='custom' ? '' : 'none';
  });

  function renderPerspectiveFromProfile(){
    if(PROFILE.birth_year){
      document.getElementById('birthYear').value = PROFILE.birth_year;
    }
    if(PROFILE.life_expectancy_years){
      var known = ['73','80','72','83'];
      if(known.indexOf(String(PROFILE.life_expectancy_years)) > -1){
        lifeExpSelect.value = String(PROFILE.life_expectancy_years);
      } else {
        lifeExpSelect.value = 'custom';
        customField.style.display = '';
        document.getElementById('customExpectancy').value = PROFILE.life_expectancy_years;
      }
      computePerspective();
    }
  }

  function computePerspective(){
    var birthYear = Number(document.getElementById('birthYear').value);
    var expectancy = lifeExpSelect.value==='custom'
      ? Number(document.getElementById('customExpectancy').value)
      : Number(lifeExpSelect.value);

    var empty = document.getElementById('perspectiveEmpty');
    var results = document.getElementById('perspectiveResults');

    if(!birthYear || birthYear < 1900 || birthYear > new Date().getFullYear() || !expectancy){
      empty.style.display = '';
      results.classList.remove('show');
      return;
    }

    saveProfile({ birth_year: birthYear, life_expectancy_years: expectancy });

    var nowYear = new Date().getFullYear();
    var age = nowYear - birthYear;
    var yearsLeft = Math.max(0, expectancy - age);
    var weeksLeft = Math.round(yearsLeft*52.18);
    var monthsLeft = Math.round(yearsLeft*12);

    empty.style.display = 'none';
    results.classList.add('show');

    var statsWrap = document.getElementById('perspectiveStats');
    statsWrap.innerHTML = '';
    statsWrap.appendChild(statCard(String(age),'years lived','var(--nebula)'));
    statsWrap.appendChild(statCard(String(yearsLeft)+'y','remaining at this average','var(--guardian)'));
    statsWrap.appendChild(statCard(monthsLeft.toLocaleString(),'months remaining','var(--ember)'));
    statsWrap.appendChild(statCard(weeksLeft.toLocaleString(),'weeks remaining','var(--nebula)'));

    var grid = document.getElementById('lifeGrid');
    grid.innerHTML = '';
    var totalYears = Math.max(expectancy, age+1);
    var totalWeeks = Math.round(totalYears*52.18);
    var weeksLived = Math.round(age*52.18);
    for(var wk=0; wk<totalWeeks; wk++){
      var cell = el('div','life-cell');
      if(wk < weeksLived) cell.classList.add('lived');
      else if(wk === weeksLived) cell.classList.add('current');
      grid.appendChild(cell);
    }
  }

  document.getElementById('perspectiveCalc').addEventListener('click', computePerspective);
  document.getElementById('birthYear').addEventListener('change', computePerspective);
  document.getElementById('customExpectancy').addEventListener('change', computePerspective);

  /* ---------------- wearable dashboard data ---------------- */
  var XTEND_KEY = 'guardian-nebula-boat-xtend-v1';
  var XTEND = loadXtendData();
  function loadXtendData(){
    try { return JSON.parse(window.localStorage.getItem(XTEND_KEY) || '{}'); } catch(e){ return {}; }
  }
  function saveXtendData(){ try { window.localStorage.setItem(XTEND_KEY, JSON.stringify(XTEND)); } catch(e){} }
  function xtendDay(dateStr){ return XTEND[dateStr] || null; }

  function updateLiveMonitor(metrics){
    var d = Object.assign({}, xtendDay(today()) || {}, metrics || {});
    var vals = {
      steps: d.steps,
      heart_rate: d.heart_rate,
      spo2: d.spo2,
      stress: d.stress,
      calories: d.calories,
      distance_m: d.distance_m,
      active_minutes: d.active_minutes
    };
    var ids = {steps:'liveSteps',heart_rate:'liveHeart',spo2:'liveSpo2',stress:'liveStress',calories:'liveCalories',distance_m:'liveDistance',active_minutes:'liveActive'};
    Object.keys(ids).forEach(function(k){
      var node=document.getElementById(ids[k]); if(!node) return;
      var next = vals[k]==null ? '—' : String(vals[k]);
      if(node.textContent!==next){ node.textContent=next; var card=node.closest('.live-metric'); if(card){ card.classList.remove('updated'); void card.offsetWidth; card.classList.add('updated'); }}
    });
    var last = d.updated_at ? new Date(d.updated_at) : null;
    document.getElementById('liveLastUpdate').textContent = last ? ('Last update '+last.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})) : 'Waiting for a wearable reading';
    var practice=[];
    if(d.active_minutes!=null) practice.push('Walk '+Math.round(d.active_minutes)+' min');
    if(d.sleep_hours!=null) practice.push('Sleep '+d.sleep_hours+' h');
    if(d.workout_minutes!=null) practice.push('Workout '+Math.round(d.workout_minutes)+' min');
    document.getElementById('livePracticeSync').textContent = practice.length ? practice.join(' · ') : 'Walk / Sleep / Workout practice sync is automatic when source data is available';
  }
  function setLiveStatus(text, connected){
    var wrap=document.getElementById('liveMonitor');
    var status=document.getElementById('liveStatus');
    var btn=document.getElementById('liveSyncBtn');
    if(status) status.textContent=text;
    if(wrap) wrap.classList.toggle('connected',!!connected);
    if(btn) btn.textContent=connected ? 'Sync now' : 'Connect Xtend';
  }
  function num(v){ return (typeof v==='number' && isFinite(v)) ? v : null; }
  function fmtMetric(v, suffix){ return v==null ? '—' : String(v) + (suffix||''); }
  function renderWearableSummary(dateStr, compact){
    var d = xtendDay(dateStr);
    if(dateStr===today()) updateLiveMonitor(d || {});
    if(!d) return;
    var panel = el('div','wearable-panel');
    panel.innerHTML = '<div class="panel-title"><h3>boAt Xtend</h3><span class="n">'+(d.updated_at ? new Date(d.updated_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'synced')+'</span></div>';
    var row = el('div','stat-row');
    row.appendChild(statCard(fmtMetric(num(d.steps)), 'steps', 'var(--nebula)'));
    row.appendChild(statCard(fmtMetric(num(d.heart_rate), ' bpm'), 'heart rate', 'var(--guardian)'));
    row.appendChild(statCard(fmtMetric(num(d.calories), ' kcal'), 'calories', 'var(--ember)'));
    row.appendChild(statCard(fmtMetric(num(d.distance_m), ' m'), 'distance', 'var(--nebula)'));
    if(!compact) {
      var sub = el('div','wearable-details');
      sub.innerHTML = '<span>Active time: <b>'+fmtMetric(num(d.active_minutes), ' min')+'</b></span>'+
        '<span>Battery: <b>'+fmtMetric(num(d.battery), '%')+'</b></span>'+
        (d.source ? '<span>Source: <b>'+d.source+'</b></span>' : '');
      panel.appendChild(sub);
    }
    panel.appendChild(row);
    viewContent.insertBefore(panel, viewContent.firstChild);
  }

  function syncXtendIntoDashboard(metrics){
    var date = today();
    XTEND[date] = Object.assign({}, XTEND[date] || {}, metrics, {updated_at:new Date().toISOString(), source:'boAt Xtend'});
    saveXtendData();
    // Map compatible wearable measurements into the existing practices without
    // pretending that steps are minutes. Sleep is already an hours habit; active
    // minutes feed Walk, and a meaningful active period lights Workout.
    if(num(metrics.sleep_hours)!=null){ setEntry(date,'sleep',{done:metrics.sleep_hours>0,value:metrics.sleep_hours}); }
    if(num(metrics.active_minutes)!=null && metrics.active_minutes>0){ setEntry(date,'walk',{done:true,value:Math.round(metrics.active_minutes)}); }
    if(num(metrics.workout_minutes)!=null && metrics.workout_minutes>0){ setEntry(date,'workout',{done:true,value:Math.round(metrics.workout_minutes)}); }
    renderConstellation();
    renderView();
  }

  /* ---------------- device connections ---------------- */
  var DEVICE_ICON_PATHS = {
    fitbit:'M0,-8 A2,2 0 1 0 0,-4 A2,2 0 1 0 0,-8 Z M0,-1 A2.4,2.4 0 1 0 0,3.8 A2.4,2.4 0 1 0 0,-1 Z M0,6 A1.6,1.6 0 1 0 0,9.2 A1.6,1.6 0 1 0 0,6 Z',
    googlefit:'M-8,4 L-2,-6 L2,2 L5,-4 L9,4',
    applehealth:'M0,7 C-8,1 -9,-6 -3,-7 C0,-7.5 0,-4 0,-4 C0,-4 0,-7.5 3,-7 C9,-6 8,1 0,7 Z',
    oura:'M0,0 A8,8 0 1 0 0.01,0 Z M0,0 A4,4 0 1 0 0.01,0 Z',
    garmin:'M0,-9 L7,4 L-7,4 Z',
    boatxtend:'M-8,-4 L-4,-8 L4,-8 L8,-4 L8,4 L4,8 L-4,8 L-8,4 Z'
  };

  var XTEND_SERVICE = '00000af0-0000-1000-8000-00805f9b34fb';
  var XTEND_WRITE = '00000af6-0000-1000-8000-00805f9b34fb';
  var XTEND_NOTIFY = '00000af7-0000-1000-8000-00805f9b34fb';
  var XTEND_ALT_WRITE = '00000af1-0000-1000-8000-00805f9b34fb';
  var XTEND_ALT_NOTIFY = '00000af2-0000-1000-8000-00805f9b34fb';
  var xtendDevice = null, xtendServer = null, xtendWrite = null, xtendNotify = null, xtendHrNotify = null, xtendStdHr = null, xtendStdSpo2 = null, xtendStdSpo2Spot = null;
  var xtendLiveTimer = null, xtendReconnectTimer = null, xtendConnecting = false, xtendAuthorized = false;
  var xtendLastConnectAttempt = 0, xtendLastPacketAt = 0, xtendReconnectBackoff = 2500, xtendVitalListenersBound = false;

  function bytesToHex(bytes){ return Array.from(bytes).map(function(b){return b.toString(16).padStart(2,'0');}).join(' '); }
  function setLiveMode(mode){
    var wrap=document.getElementById('liveMonitor'); if(!wrap) return;
    wrap.classList.toggle('searching', mode==='searching');
    wrap.classList.toggle('error', mode==='error');
  }
  function updateLiveConnectionUi(){
    var forget=document.getElementById('liveForgetBtn');
    var measure=document.getElementById('liveMeasureBtn');
    if(forget) forget.style.display=xtendAuthorized ? '' : 'none';
    if(measure) measure.disabled=!(xtendDevice && xtendDevice.gatt && xtendDevice.gatt.connected);
    if(measure) measure.title=measure.disabled?'Connect Xtend first':'Request the activity packet from the watch';
  }
  function setConnectionDetail(text){ var n=document.getElementById('liveConnectionDetail'); if(n) n.textContent=text; }
  function markPacketReceived(){
    xtendLastPacketAt=Date.now();
    setConnectionDetail('Receiving BLE data · '+new Date(xtendLastPacketAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}));
    updateLiveConnectionUi();
  }
  function safeCharacteristicWrite(ch, bytes){
    if(!ch) return Promise.reject(new Error('Xtend write characteristic unavailable'));
    if(ch.properties && ch.properties.writeWithoutResponse && ch.writeValueWithoutResponse) return ch.writeValueWithoutResponse(bytes);
    return ch.writeValue(bytes);
  }
  function clearXtendListeners(){
    try{ if(xtendNotify) xtendNotify.removeEventListener('characteristicvaluechanged', handleXtendNotification); }catch(e){}
    try{ if(xtendHrNotify) xtendHrNotify.removeEventListener('characteristicvaluechanged', handleXtendHeartNotification); }catch(e){}
    try{ if(xtendStdHr) xtendStdHr.removeEventListener('characteristicvaluechanged', handleStandardHeartRate); }catch(e){}
    try{ if(xtendStdSpo2) xtendStdSpo2.removeEventListener('characteristicvaluechanged', handleStandardSpO2); }catch(e){}
    try{ if(xtendStdSpo2Spot) xtendStdSpo2Spot.removeEventListener('characteristicvaluechanged', handleStandardSpO2); }catch(e){}
    xtendStdHr=null; xtendStdSpo2=null; xtendStdSpo2Spot=null; xtendVitalListenersBound=false;
  }
  function scheduleXtendReconnect(delay){
    if(xtendReconnectTimer || !xtendDevice || !xtendAuthorized) return;
    xtendReconnectTimer=setTimeout(function(){ xtendReconnectTimer=null; connectKnownXtend(true); }, delay||3000);
  }
  function onXtendDisconnected(){
    stopXtendLiveMonitoring(); clearXtendListeners(); xtendServer=null; xtendWrite=null; xtendNotify=null; xtendHrNotify=null;
    setConnectionDetail('Disconnected · looking for the watch nearby');
    xtendStatus('Disconnected · retrying automatically');
    scheduleXtendReconnect(xtendReconnectBackoff);
    xtendReconnectBackoff=Math.min(30000, Math.round(xtendReconnectBackoff*1.7));
    updateLiveConnectionUi();
  }
  async function bindXtendDevice(device, automatic){
    if(!device) return false;
    if(xtendConnecting) return false;
    xtendConnecting=true; setLiveMode('searching');
    var btn=document.getElementById('liveSyncBtn'); if(btn) btn.disabled=true;
    try{
      xtendDevice=device; xtendAuthorized=true; updateLiveConnectionUi();
      if(!device.__guardianDisconnectBound){ device.addEventListener('gattserverdisconnected', onXtendDisconnected); device.__guardianDisconnectBound=true; }
      if(device.gatt && !device.gatt.connected){ xtendStatus(automatic ? 'Nearby Xtend found · connecting…' : 'Connecting…'); }
      xtendServer = device.gatt && device.gatt.connected ? device.gatt : await device.gatt.connect();
      var service=await xtendServer.getPrimaryService(XTEND_SERVICE);
      // Prefer the characteristic that actually exposes write/write-without-response.
      var chars=await service.getCharacteristics();
      xtendWrite=chars.find(function(c){return c.uuid===XTEND_WRITE;}) || chars.find(function(c){return c.uuid===XTEND_ALT_WRITE;}) || chars.find(function(c){return c.properties.writeWithoutResponse||c.properties.write;});
      xtendNotify=chars.find(function(c){return c.uuid===XTEND_NOTIFY;}) || chars.find(function(c){return c.uuid===XTEND_ALT_NOTIFY;}) || chars.find(function(c){return c.properties.notify;});
      xtendHrNotify=null;
      if(!xtendWrite || !xtendNotify) throw new Error('Xtend service characteristics were not exposed by the watch');
      clearXtendListeners();
      await xtendNotify.startNotifications();
      xtendNotify.addEventListener('characteristicvaluechanged', handleXtendNotification);
      // Subscribe to the other notify characteristic when present. It may carry HR or other telemetry.
      var secondary=chars.find(function(c){return c!==xtendNotify && c.properties.notify;});
      if(secondary){
        try{ await secondary.startNotifications(); secondary.addEventListener('characteristicvaluechanged', handleXtendHeartNotification); xtendHrNotify=secondary; }catch(e){ console.info('Xtend secondary notification unavailable',e); }
      }
      // Standard services are optional on Xtend. Bind every supported HR/SpO2 measurement
      // characteristic and remove listeners before each reconnect to prevent duplicates.
      try{
        var hs=await xtendServer.getPrimaryService('heart_rate');
        var hcs=await hs.getCharacteristics();
        xtendStdHr=hcs.find(function(c){return c.uuid==='00002a37-0000-1000-8000-00805f9b34fb' && c.properties.notify;}) || null;
        if(xtendStdHr){ await xtendStdHr.startNotifications(); xtendStdHr.addEventListener('characteristicvaluechanged',handleStandardHeartRate); }
      }catch(e){ console.info('No standard Heart Rate service',e); }
      try{
        var os=await xtendServer.getPrimaryService('pulse_oximeter');
        var ocs=await os.getCharacteristics();
        xtendStdSpo2=ocs.find(function(c){return c.uuid==='00002a5f-0000-1000-8000-00805f9b34fb' && c.properties.notify;}) || null;
        xtendStdSpo2Spot=ocs.find(function(c){return c.uuid==='00002a5e-0000-1000-8000-00805f9b34fb' && c.properties.notify;}) || null;
        if(xtendStdSpo2){ await xtendStdSpo2.startNotifications(); xtendStdSpo2.addEventListener('characteristicvaluechanged',handleStandardSpO2); }
        if(xtendStdSpo2Spot){ await xtendStdSpo2Spot.startNotifications(); xtendStdSpo2Spot.addEventListener('characteristicvaluechanged',handleStandardSpO2); }
      }catch(e){ console.info('No standard Pulse Oximeter service',e); }
      xtendReconnectBackoff=2500;
      setConnectionDetail('Bluetooth connected · waiting for first packet');
      xtendStatus('Connected · waiting for wearable data'); setLiveMode('connected');
      startXtendLiveMonitoring();
      await requestXtendLive();
      return true;
    }catch(e){
      console.warn('Xtend connection failed',e);
      setLiveMode('error');
      xtendStatus('Could not connect · retrying when nearby');
      scheduleXtendReconnect(4000);
      return false;
    }finally{
      xtendConnecting=false; if(btn) btn.disabled=false;
    }
  }
  async function connectKnownXtend(automatic){
    if(!navigator.bluetooth || !navigator.bluetooth.getDevices) return false;
    try{
      var devices=await navigator.bluetooth.getDevices();
      var candidate=devices.find(function(d){
        return d && ((d.name||'').toLowerCase().includes('xtend') || d.id===localStorage.getItem('guardian-nebula-xtend-device-id'));
      });
      if(candidate){ localStorage.setItem('guardian-nebula-xtend-device-id',candidate.id); return bindXtendDevice(candidate, automatic!==false); }
    }catch(e){ console.info('Known Xtend lookup unavailable',e); }
    return false;
  }
  async function connectBoatXtend(){
    if(!navigator.bluetooth){ alert('Web Bluetooth is not available in this browser. Use Chrome or Edge over HTTPS.'); return; }
    if(xtendDevice && xtendDevice.gatt && xtendDevice.gatt.connected){ requestXtendLive(); return; }
    if(await connectKnownXtend(false)) return;
    try{
      setLiveMode('searching'); xtendStatus('Choose your boAt Xtend once…');
      var device=await navigator.bluetooth.requestDevice({
        filters:[
          {services:[XTEND_SERVICE]},
          {namePrefix:'boAt'},
          {namePrefix:'Xtend'}
        ],
        optionalServices:[XTEND_SERVICE,'heart_rate','pulse_oximeter']
      });
      if(!device) return;
      localStorage.setItem('guardian-nebula-xtend-device-id',device.id);
      await bindXtendDevice(device,false);
    }catch(e){
      if(e && e.name==='NotFoundError'){ xtendStatus('No device selected · ready to retry'); setLiveMode('error'); }
      else { console.warn(e); xtendStatus('Connection cancelled or unavailable'); setLiveMode('error'); }
    }
  }
  function parseXtendA0(data){
    if(data.length < 18 || data[0]!==0x02 || data[1]!==0xA0) return null;
    var dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    var out = { raw:bytesToHex(data), packet_type:'activity' };
    try{ out.steps=dv.getUint32(2,true); out.calories=dv.getUint32(6,true); out.distance_m=dv.getUint32(10,true); out.active_minutes=dv.getUint32(14,true); }catch(e){ return null; }
    return out;
  }
  function parseXtendHeart(data){
    if(!data || !data.length) return null;
    // 0AF2 is proprietary. Do not interpret arbitrary bytes as HR.
    if(data.length===2 && data[0]===0x01 && data[1]>=30 && data[1]<=220) return {heart_rate:data[1],raw:bytesToHex(data),packet_type:'heart_rate'};
    return {raw:bytesToHex(data),packet_type:'unknown'};
  }
  function handleStandardHeartRate(evt){
    var d=new Uint8Array(evt.target.value.buffer.slice(0)); if(d.length<2)return;
    var flags=d[0], hr=(flags&1)?(d[1]|((d[2]||0)<<8)):d[1];
    if(hr>=30&&hr<=220){ syncXtendIntoDashboard({heart_rate:hr,heart_rate_source:'standard BLE'}); markPacketReceived(); }
  }
  function handleStandardSpO2(evt){
    var d=new Uint8Array(evt.target.value.buffer.slice(0)); if(d.length<3)return;
    var raw=d[1]|(d[2]<<8), mant=raw&0x0FFF, exp=(raw>>12)&0x0F;
    if(mant&0x0800)mant-=0x1000; if(exp&0x08)exp-=0x10;
    var spo2=mant*Math.pow(10,exp);
    if(spo2>=70&&spo2<=100){ syncXtendIntoDashboard({spo2:Math.round(spo2*10)/10,spo2_source:'standard BLE'}); markPacketReceived(); }
  }
  function xtendStatus(text){
    var connected=/Connected|live sync active|activity synced|HR synced/i.test(text);
    setLiveStatus(text,connected); updateLiveConnectionUi();
    var cards=document.querySelectorAll('#deviceGrid .device-card');
    cards.forEach(function(c){ if(c.querySelector('.dev-name') && c.querySelector('.dev-name').textContent==='boAt Xtend'){ var s=c.querySelector('.dev-status'); s.textContent=text; s.classList.toggle('connected',connected); }});
  }
  function handleXtendNotification(evt){
    var data=new Uint8Array(evt.target.value.buffer.slice(0));
    var parsed=parseXtendA0(data);
    if(parsed){ syncXtendIntoDashboard(parsed); markPacketReceived(); xtendStatus('Connected · live sync active'); }
    XTEND.last_raw=bytesToHex(data); XTEND.last_raw_at=new Date().toISOString(); saveXtendData();
  }
  function handleXtendHeartNotification(evt){
    var data=new Uint8Array(evt.target.value.buffer.slice(0));
    var parsed=parseXtendHeart(data);
    XTEND.last_hr_raw=bytesToHex(data); XTEND.last_hr_raw_at=new Date().toISOString();
    if(parsed && parsed.heart_rate!=null){ syncXtendIntoDashboard({heart_rate:parsed.heart_rate,heart_rate_source:'Xtend verified packet'}); markPacketReceived(); xtendStatus('Connected · HR received'); }
    saveXtendData();
  }
  async function requestXtendLive(){
    if(!xtendWrite || !xtendDevice || !xtendDevice.gatt || !xtendDevice.gatt.connected) return false;
    try{ await safeCharacteristicWrite(xtendWrite,new Uint8Array([0x02,0xA0])); return true; }
    catch(e){ console.warn('Xtend live request failed',e); onXtendDisconnected(); return false; }
  }
  function startXtendLiveMonitoring(){
    if(xtendLiveTimer) clearInterval(xtendLiveTimer);
    requestXtendLive();
    xtendLiveTimer=setInterval(function(){ requestXtendLive(); },10000);
  }
  function stopXtendLiveMonitoring(){ if(xtendLiveTimer){clearInterval(xtendLiveTimer);xtendLiveTimer=null;} }
  document.getElementById('liveSyncBtn').addEventListener('click',connectBoatXtend);
  document.getElementById('liveMeasureBtn').addEventListener('click',async function(){
    if(!(xtendDevice && xtendDevice.gatt && xtendDevice.gatt.connected)){ return connectBoatXtend(); }
    setConnectionDetail('Connected · requesting the latest activity packet');
    await requestXtendLive();
  });
  setInterval(function(){
    if(xtendLastPacketAt && Date.now()-xtendLastPacketAt>30000 && xtendDevice && xtendDevice.gatt && xtendDevice.gatt.connected){
      setConnectionDetail('Bluetooth connected · no packet for '+Math.round((Date.now()-xtendLastPacketAt)/1000)+'s');
    }
  },5000);
  document.getElementById('liveForgetBtn').addEventListener('click',function(){
    stopXtendLiveMonitoring(); clearTimeout(xtendReconnectTimer); xtendReconnectTimer=null; clearXtendListeners();
    try{ if(xtendDevice && xtendDevice.gatt && xtendDevice.gatt.connected) xtendDevice.gatt.disconnect(); }catch(e){}
    xtendDevice=null; xtendServer=null; xtendWrite=null; xtendNotify=null; xtendHrNotify=null; xtendStdHr=null; xtendStdSpo2=null; xtendStdSpo2Spot=null; xtendAuthorized=false; xtendLastPacketAt=0; xtendReconnectBackoff=2500;
    localStorage.removeItem('guardian-nebula-xtend-device-id'); updateLiveConnectionUi(); setLiveMode('error'); xtendStatus('Device forgotten · connect again');
  });

  // Web Bluetooth cannot perform a silent first-time scan. After the user grants
  // access once, getDevices() can rediscover the paired Xtend and reconnect when it is nearby.
  async function autoReconnectXtend(){
    if(!navigator.bluetooth || !navigator.bluetooth.getDevices) return;
    if(document.visibilityState==='hidden') return;
    if(xtendConnecting || (xtendDevice && xtendDevice.gatt && xtendDevice.gatt.connected)) return;
    await connectKnownXtend(true);
  }
  window.addEventListener('focus',autoReconnectXtend);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible') autoReconnectXtend();});
  setTimeout(autoReconnectXtend,1200);
  setInterval(autoReconnectXtend,20000);

  function renderDeviceGrid(){
    var grid = document.getElementById('deviceGrid');
    grid.innerHTML = '';
    DEVICE_PROVIDERS.forEach(function(p){
      var card = el('div','device-card');
      var head = el('div','dev-head');
      var iconSvg = '<svg class="dev-icon" viewBox="-13 -13 26 26" xmlns="http://www.w3.org/2000/svg"><path d="'+DEVICE_ICON_PATHS[p.id]+'" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      head.innerHTML = iconSvg + '<span class="dev-name">'+p.name+'</span>';
      card.appendChild(head);
      card.appendChild(el('p',null,p.blurb));
      card.appendChild(el('div','dev-status','Not connected'));
      var btn = el('button','btn ghost', p.id==='boatxtend' ? 'Connect Xtend' : 'Connect');
      btn.style.marginTop = '4px';
      if(p.id==='boatxtend') btn.addEventListener('click', connectBoatXtend);
      else btn.addEventListener('click', function(providerName){
        return function(){ alert(providerName+' isn\u2019t wired up yet — it needs an OAuth integration built server-side.'); };
      }(p.name));
      card.appendChild(btn);
      grid.appendChild(card);
    });
  }

  /* ---------------- reminders / notifications ---------------- */
  var REMINDER_NOTIFIED_KEY = 'guardian-nebula-notified-date-v1';
  var reminderEnableBtn = document.getElementById('reminderEnableBtn');
  var reminderTimeInput = document.getElementById('reminderTime');
  var reminderStatus = document.getElementById('reminderStatus');

  function refreshReminderStatus(){
    if(!('Notification' in window)){
      reminderStatus.textContent = 'This browser doesn\u2019t support notifications.';
      reminderEnableBtn.disabled = true;
      return;
    }
    if(Notification.permission==='granted' && PROFILE.reminders_enabled){
      reminderStatus.textContent = 'Notifications are on for this device, only while this tab is open — set for ' + (PROFILE.reminder_time||'20:00') + '.';
      reminderEnableBtn.textContent = 'Notifications enabled';
    } else if(Notification.permission==='denied'){
      reminderStatus.textContent = 'Notifications are blocked in your browser settings for this site — re-enable them there if you want reminders.';
    } else {
      reminderStatus.textContent = 'Notifications need your browser\u2019s permission and only fire while this tab is open on this device \u2014 a static page can\u2019t send background push notifications without a server behind it.';
    }
  }

  reminderEnableBtn.addEventListener('click', function(){
    if(!('Notification' in window)) return;
    Notification.requestPermission().then(function(perm){
      if(perm==='granted'){
        saveProfile({ reminders_enabled:true, reminder_time: reminderTimeInput.value||'20:00' });
        new Notification('Guardian Nebula', { body:'Reminders are on. I\u2019ll nudge you here if the sky\u2019s still dim by '+ (reminderTimeInput.value||'20:00') +'.' });
      }
      refreshReminderStatus();
    });
  });

  document.getElementById('reminderSaveBtn').addEventListener('click', function(){
    saveProfile({ reminder_time: reminderTimeInput.value||'20:00' });
    refreshReminderStatus();
  });

  /* ---------------- per-practice reminders ---------------- */
  var HABIT_NOTIFIED_KEY = 'guardian-nebula-notified-habits-v1';

  function saveHabitReminders(){
    saveLocalHabitReminders(HABIT_REMINDERS);
    saveProfile({ habit_reminders: HABIT_REMINDERS });
  }

  function renderHabitReminders(){
    var wrap = document.getElementById('habitReminderList');
    if(!wrap) return;
    wrap.innerHTML = '';
    HABITS.forEach(function(h){
      var setting = HABIT_REMINDERS[h.id] || { enabled:false, time:'20:00' };
      var row = el('div','reminder-row');

      var nameEl = el('div','rr-name','<span class="dot" style="background:'+CATEGORIES[h.cat].color+'"></span>'+h.name);
      row.appendChild(nameEl);

      var controls = el('div','rr-controls');

      var toggleBtn = el('button','toggle'+(setting.enabled?' on':''));
      toggleBtn.type = 'button';
      toggleBtn.setAttribute('aria-label','Toggle reminder for '+h.name);
      controls.appendChild(toggleBtn);

      var timeInput = document.createElement('input');
      timeInput.type = 'time';
      timeInput.value = setting.time || '20:00';
      timeInput.disabled = !setting.enabled;
      controls.appendChild(timeInput);

      row.appendChild(controls);
      wrap.appendChild(row);

      toggleBtn.addEventListener('click', function(){
        setting = Object.assign({}, setting, { enabled: !setting.enabled });
        HABIT_REMINDERS[h.id] = setting;
        toggleBtn.classList.toggle('on', setting.enabled);
        timeInput.disabled = !setting.enabled;
        saveHabitReminders();
      });
      timeInput.addEventListener('change', function(){
        setting = Object.assign({}, setting, { time: timeInput.value || '20:00' });
        HABIT_REMINDERS[h.id] = setting;
        saveHabitReminders();
      });
    });
  }

  var remindersAllOnBtn = document.getElementById('remindersAllOnBtn');
  var remindersAllOffBtn = document.getElementById('remindersAllOffBtn');
  if(remindersAllOnBtn) remindersAllOnBtn.addEventListener('click', function(){
    if(!('Notification' in window)) return;
    Notification.requestPermission().then(function(perm){
      HABITS.forEach(function(h){
        var setting = HABIT_REMINDERS[h.id] || { time:'20:00' };
        HABIT_REMINDERS[h.id] = Object.assign({}, setting, { enabled: perm==='granted' });
      });
      saveHabitReminders();
      renderHabitReminders();
    });
  });
  if(remindersAllOffBtn) remindersAllOffBtn.addEventListener('click', function(){
    HABITS.forEach(function(h){
      var setting = HABIT_REMINDERS[h.id] || { time:'20:00' };
      HABIT_REMINDERS[h.id] = Object.assign({}, setting, { enabled:false });
    });
    saveHabitReminders();
    renderHabitReminders();
  });

  function checkReminderTick(){
    if(!('Notification' in window) || Notification.permission!=='granted') return;
    var now = new Date();
    var hh = pad(now.getHours()), mm = pad(now.getMinutes());
    var nowStr = hh+':'+mm;
    var t = today();

    // master "sky" reminder
    if(PROFILE.reminders_enabled){
      var target = (PROFILE.reminder_time||'20:00');
      var alreadyNotified = window.localStorage.getItem(REMINDER_NOTIFIED_KEY) === t;
      if(nowStr >= target && !alreadyNotified){
        var doneCount = HABITS.reduce(function(n,h){ return n + (entry(t,h.id).done?1:0); },0);
        if(doneCount < HABITS.length){
          new Notification('Guardian Nebula', { body: doneCount+'/'+HABITS.length+' lit today \u2014 still time to light a few more.' });
        }
        window.localStorage.setItem(REMINDER_NOTIFIED_KEY, t);
      }
    }

    // per-practice reminders
    var notifiedRaw = null;
    try{ notifiedRaw = JSON.parse(window.localStorage.getItem(HABIT_NOTIFIED_KEY)||'null'); }catch(e){}
    if(!notifiedRaw || notifiedRaw.date !== t){ notifiedRaw = { date:t, ids:[] }; }

    HABITS.forEach(function(h){
      var setting = HABIT_REMINDERS[h.id];
      if(!setting || !setting.enabled) return;
      var target = setting.time || '20:00';
      if(nowStr < target) return;
      if(notifiedRaw.ids.indexOf(h.id) !== -1) return;
      if(entry(t,h.id).done) return;
      new Notification('Guardian Nebula', { body: h.name+' isn\u2019t lit yet today \u2014 still time.' });
      notifiedRaw.ids.push(h.id);
    });
    window.localStorage.setItem(HABIT_NOTIFIED_KEY, JSON.stringify(notifiedRaw));
  }

  /* ---------------- PWA install ---------------- */
  function registerPWA(){
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('sw.js').catch(function(){ /* optional, ignore if sw.js isn't deployed */ });
    }
  }

  /* ---------------- export ---------------- */
  function downloadBlob(filename, content, mime){
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  function exportJSON(){
    var payload = {
      exported_at: new Date().toISOString(),
      account: currentUser ? currentUser.email : null,
      profile: PROFILE,
      logs: LOGS,
      custom_habits: customHabits,
      notes: NOTES
    };
    downloadBlob('guardian-nebula-export-'+today()+'.json', JSON.stringify(payload, null, 2), 'application/json');
  }

  function exportCSV(){
    var rows = [['date','habit_id','habit_name','category','done','value','unit']];
    Object.keys(LOGS).sort().forEach(function(date){
      Object.keys(LOGS[date]).forEach(function(habitId){
        var e = LOGS[date][habitId];
        var h = HABIT_BY_ID[habitId];
        rows.push([
          date,
          habitId,
          h ? h.name : habitId,
          h ? CATEGORIES[h.cat].label : '',
          e.done ? 'true' : 'false',
          (e.value===null || e.value===undefined) ? '' : e.value,
          (h && h.unit) ? h.unit : ''
        ]);
      });
    });
    var csv = rows.map(function(r){
      return r.map(function(cell){
        var s = String(cell);
        return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
      }).join(',');
    }).join('\n');
    downloadBlob('guardian-nebula-logs-'+today()+'.csv', csv, 'text/csv');
  }

  document.getElementById('exportJsonBtn').addEventListener('click', exportJSON);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);

  /* ---------------- boot ---------------- */
  var booted = false;
  function boot(){
    if(booted) return;
    booted = true;
    buildIconDefs();
    populateEntrySelect();
    renderManageList();
    renderConstellation();
    renderView();
    renderPerspectiveFromProfile();
    renderDeviceGrid();
  updateLiveMonitor(xtendDay(today()) || {});
    renderAccountChip();
    if(PROFILE.reminder_time) reminderTimeInput.value = PROFILE.reminder_time;
    refreshReminderStatus();
    renderHabitReminders();
    updateMetaLocation();
    updateMetaClock();
    setInterval(updateMetaClock, 30000);
    setInterval(checkReminderTick, 60000);
    registerPWA();
  }

  initAuth().then(function(alreadySignedIn){
    if(alreadySignedIn) return; // boot() already called inside the signed-in path above
    // Otherwise the overlay is showing (configured-but-signed-out, or unconfigured/local-only) —
    // boot() runs once the person signs in, or clicks "continue without an account".
  });

})();
