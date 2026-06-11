/* ═══════════════════════════════════════════════════════════
   DIGITAL IO — PATROL LOG  v3
   Urdu UI · GPS Map · Reminder · Voice/Video/Photo · Report
   ═══════════════════════════════════════════════════════════ */

registerPage('patrol', renderPatrol);

let _shift      = null;
let _shiftTimer = null;
let _gpsWatch   = null;
let _patrolMap  = null;
let _routeLine  = null;
let _routePts   = [];
let _totalDist  = 0;
let _lastLL     = null;
let _tab        = 'entry';
let _media      = [];
let _etype      = 'Call Aai';
let _vRec       = null;
let _vActive    = false;
let _vTarget    = null;
let _audioRec   = null;
let _audioChunks= [];
let _patrolRems = [];

const _ET = {
  'Call Aai':    { icon:'📞', color:'#4fc3f7' },
  'Incident':    { icon:'🚨', color:'#ef5350' },
  'Patrol Check':{ icon:'🚗', color:'#66bb6a' },
  'Aur Kuch':    { icon:'📋', color:'#ffa726' },
};

// ── MAIN ──────────────────────────────────────────────────────
async function renderPatrol(container) {
  container.innerHTML = `<div id="pt-root" style="max-width:520px;margin:0 auto;padding:4px 0;"></div>`;
  await _loadShift();
  _drawRoot();
}

async function _loadShift() {
  try {
    const oid = await getOfficerId();
    const { data } = await supabaseClient.from('patrol_shifts')
      .select('*').eq('officer_id',oid).eq('status','active')
      .order('started_at',{ascending:false}).limit(1);
    _shift = data?.length ? data[0] : null;
  } catch(_) { _shift=null; }
}

function _drawRoot() {
  const root = document.getElementById('pt-root');
  if (!root) return;
  if (!_shift) { _drawHome(root); return; }

  root.innerHTML = `
  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1a3a5c,#0d2a45);border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px;">
    <div style="font-size:24px;">🛡️</div>
    <div style="flex:1;">
      <div style="font-size:14px;font-weight:700;color:#fff;">Patrol Log — Digital IO</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.6);">${(currentOfficer?.full_name||'Officer')} · ${new Date().toLocaleDateString('ur-PK')}</div>
    </div>
  </div>

  <!-- Shift bar -->
  <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-size:11px;color:var(--text-muted);">Duty Shift</div>
      <div style="font-size:15px;font-weight:700;color:var(--green);">Shuru: ${_timeStr(_shift.started_at)}</div>
      <div style="font-size:13px;font-family:var(--font-mono);color:var(--accent);" id="ptimer">00:00:00</div>
    </div>
    <button class="btn btn-danger btn-sm" onclick="confirmEndShift()" style="font-size:12px;padding:8px 14px;">⏹ Shift Khatam Karo</button>
  </div>

  <!-- GPS bar -->
  <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-size:11px;font-weight:600;color:var(--accent);">📡 GPS Patrol Tracking</div>
      <div style="font-size:11px;color:var(--text-muted);" id="gps-lbl">GPS band hai — tracking shuru karo</div>
    </div>
    <button id="gps-tog-btn" class="btn btn-primary btn-sm" onclick="_toggleGPS()" style="font-size:11px;padding:7px 12px;">▶ Tracking Shuru</button>
  </div>

  <!-- Tabs -->
  <div style="display:flex;gap:3px;margin-bottom:10px;">
    ${[['entry','✏️ Entry'],['map','🗺️ Map'],['logs','📋 Log'],['reminder','🔔 Reminder'],['summary','📊 Summary']].map(([t,l])=>`
      <div class="pt-tab" id="pttab-${t}" onclick="_tab='${t}';_switchPTab()" style="flex:1;padding:7px 2px;border:1px solid ${_tab===t?'var(--accent)':'var(--border)'};border-radius:7px;background:${_tab===t?'var(--accent)':'var(--bg-card)'};color:${_tab===t?'#fff':'var(--text-muted)'};font-size:10px;cursor:pointer;text-align:center;">${l}</div>`).join('')}
  </div>

  <!-- Tab content -->
  <div id="pt-content"></div>`;

  _startTimer();
  _switchPTab();
}

function _switchPTab() {
  // Update tab styles
  [['entry','✏️ Entry'],['map','🗺️ Map'],['logs','📋 Log'],['reminder','🔔 Reminder'],['summary','📊 Summary']].forEach(([t])=>{
    const el=document.getElementById('pttab-'+t);
    if(!el)return;
    const on=_tab===t;
    el.style.borderColor=on?'var(--accent)':'var(--border)';
    el.style.background=on?'var(--accent)':'var(--bg-card)';
    el.style.color=on?'#fff':'var(--text-muted)';
  });
  const c=document.getElementById('pt-content');
  if(!c)return;
  if(_tab==='entry')   _tabEntry(c);
  if(_tab==='map')     _tabMap(c);
  if(_tab==='logs')    _tabLogs(c);
  if(_tab==='reminder')_tabReminder(c);
  if(_tab==='summary') _tabSummary(c);
}

// ── HOME ──────────────────────────────────────────────────────
async function _drawHome(root) {
  const hist = await _fetchHist();
  root.innerHTML = `
  <div class="card" style="text-align:center;padding:32px 20px;margin-bottom:14px;">
    <div style="font-size:52px;margin-bottom:10px;">🚔</div>
    <div style="font-size:17px;font-weight:800;margin-bottom:6px;">Patrol Log</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:22px;">GPS tracking · Call log · Duty report</div>
    <button class="btn btn-primary" style="font-size:14px;padding:12px 32px;" onclick="startShift()">🟢 Shift Shuru Karo</button>
  </div>
  ${hist.length?`<div class="card"><div class="card-title" style="margin-bottom:10px;">📋 Purani Shifts</div>
    ${hist.map(s=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="font-size:20px;">📅</div>
      <div style="flex:1;"><div style="font-size:12px;font-weight:600;">${formatDate(s.started_at)}</div>
      <div style="font-size:10px;color:var(--text-muted);">${_timeStr(s.started_at)} → ${s.ended_at?_timeStr(s.ended_at):'—'} · ${s.ended_at?_dur(s.started_at,s.ended_at):'—'}</div></div>
      <button class="btn btn-secondary btn-sm" onclick="viewShift('${s.id}')">Dekho</button>
    </div>`).join('')}</div>` : ''}`;
}

// ── ENTRY TAB ─────────────────────────────────────────────────
function _tabEntry(el) {
  _media=[];
  el.innerHTML=`<div class="card">
    <div style="font-size:10px;color:var(--accent);font-weight:700;letter-spacing:1px;margin-bottom:7px;">ENTRY KA QISM</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;">
      ${Object.entries(_ET).map(([t,c])=>`
        <div id="et-${t.replace(/ /g,'_')}" onclick="_selET('${t}')" style="padding:10px;border:1px solid ${_etype===t?c.color:'var(--border)'};border-radius:8px;background:${_etype===t?'rgba(79,195,247,0.08)':'var(--bg-tertiary)'};color:${_etype===t?c.color:'var(--text-muted)'};font-size:12px;cursor:pointer;text-align:center;font-weight:${_etype===t?'700':'400'};">
          ${c.icon} ${t}
        </div>`).join('')}
    </div>

    <div style="font-size:10px;color:var(--accent);font-weight:700;letter-spacing:1px;margin-bottom:7px;">CALLER / SHAKHS KI INFO</div>
    <input class="form-input" id="pe-name" placeholder="👤 Caller / Shakhs ka naam (optional)" style="margin-bottom:6px;">
    <input class="form-input" id="pe-cell" type="tel" placeholder="📱 Cell Number (e.g. 0300-1234567)" style="margin-bottom:6px;">
    <input class="form-input" id="pe-loc"  placeholder="📍 Jagah / Mohalla / Gali" style="margin-bottom:14px;">

    <div style="font-size:10px;color:var(--accent);font-weight:700;letter-spacing:1px;margin-bottom:5px;">MASLA — CALLER NE KYA KAHA</div>
    <div style="display:flex;gap:6px;margin-bottom:4px;">
      <textarea class="form-input" id="pe-desc" rows="3" placeholder="Caller ka masla yahan likho ya mic se bolo..." style="flex:1;resize:none;"></textarea>
      <button id="pmic1" onclick="_pVoice('pe-desc','pmic1')" style="width:42px;border:1px solid var(--border);border-radius:8px;background:var(--bg-tertiary);font-size:20px;cursor:pointer;align-self:stretch;">🎙️</button>
    </div>
    <div style="font-size:10px;color:var(--text-faint);margin-bottom:12px;">✏️ Mic dabao aur Urdu/English mein bolo</div>

    <div style="font-size:10px;color:var(--accent);font-weight:700;letter-spacing:1px;margin-bottom:5px;">MERA RESPONSE / MUSHAHIDA</div>
    <div style="display:flex;gap:6px;margin-bottom:4px;">
      <textarea class="form-input" id="pe-resp" rows="2" placeholder="Aapne kya kiya, kya dekha, kya response diya..." style="flex:1;resize:none;"></textarea>
      <button id="pmic2" onclick="_pVoice('pe-resp','pmic2')" style="width:42px;border:1px solid var(--border);border-radius:8px;background:var(--bg-tertiary);font-size:20px;cursor:pointer;align-self:stretch;">🎙️</button>
    </div>
    <div style="font-size:10px;color:var(--text-faint);margin-bottom:12px;">✏️ Mic dabao — apna mushahida bolo</div>

    <div style="font-size:10px;color:var(--accent);font-weight:700;letter-spacing:1px;margin-bottom:7px;">📸 PHOTOS / VIDEOS / VOICE RECORDING</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">
      <label style="padding:12px 6px;border:1px solid var(--border);border-radius:8px;background:var(--bg-tertiary);font-size:11px;cursor:pointer;text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px;">
        <span style="font-size:24px;">📷</span>Photo Lo / Upload
        <input type="file" accept="image/*" capture="environment" onchange="_addMedia(this,'image')" style="display:none;">
      </label>
      <label style="padding:12px 6px;border:1px solid var(--border);border-radius:8px;background:var(--bg-tertiary);font-size:11px;cursor:pointer;text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px;">
        <span style="font-size:24px;">🎥</span>Video Record / Upload
        <input type="file" accept="video/*" capture="camcorder" onchange="_addMedia(this,'video')" style="display:none;">
      </label>
      <button onclick="_startAudioRec()" id="audio-rec-btn" style="padding:12px 6px;border:1px solid var(--border);border-radius:8px;background:var(--bg-tertiary);color:var(--text-secondary);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;">
        <span style="font-size:24px;">🎙️</span>Voice Recording
      </button>
      <label style="padding:12px 6px;border:1px solid var(--border);border-radius:8px;background:var(--bg-tertiary);font-size:11px;cursor:pointer;text-align:center;display:flex;flex-direction:column;align-items:center;gap:4px;">
        <span style="font-size:24px;">📎</span>Koi Bhi File
        <input type="file" onchange="_addMedia(this,'doc')" style="display:none;">
      </label>
    </div>
    <div id="pt-media-prev" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;"></div>

    <button class="btn btn-primary" style="width:100%;padding:12px;font-size:14px;" onclick="saveEntry()">💾 Entry Save Karo</button>
  </div>`;
}

function _selET(t) {
  _etype=t;
  Object.entries(_ET).forEach(([k,c])=>{
    const el=document.getElementById('et-'+k.replace(/ /g,'_'));
    if(!el)return;
    const on=k===t;
    el.style.borderColor=on?c.color:'var(--border)';
    el.style.background=on?'rgba(79,195,247,0.08)':'var(--bg-tertiary)';
    el.style.color=on?c.color:'var(--text-muted)';
    el.style.fontWeight=on?'700':'400';
  });
}

function _addMedia(input,type) {
  const file=input.files[0]; if(!file)return;
  const r=new FileReader();
  r.onload=e=>{
    _media.push({id:Date.now(),type,name:file.name,data:e.target.result});
    _renderMediaPrev();
  };
  r.readAsDataURL(file);
}

function _renderMediaPrev() {
  const el=document.getElementById('pt-media-prev'); if(!el)return;
  el.innerHTML=_media.map(m=>`
    <div style="position:relative;width:56px;height:56px;">
      ${m.type==='image'?`<img src="${m.data}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--border);">`
        :`<div style="width:56px;height:56px;background:var(--bg-tertiary);border-radius:6px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:22px;">${m.type==='video'?'🎥':m.type==='audio'?'🎙️':'📎'}</div>`}
      <div onclick="_rmMedia(${m.id})" style="position:absolute;top:-4px;right:-4px;background:var(--red);color:#fff;border-radius:50%;width:15px;height:15px;font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</div>
    </div>`).join('');
}

function _rmMedia(id){_media=_media.filter(m=>m.id!==id);_renderMediaPrev();}

// Audio recording
async function _startAudioRec() {
  const btn=document.getElementById('audio-rec-btn');
  if(_audioRec&&_audioRec.state==='recording'){
    _audioRec.stop();
    if(btn){btn.innerHTML='<span style="font-size:24px;">🎙️</span>Voice Recording';btn.style.borderColor='var(--border)';}
    return;
  }
  try {
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    _audioChunks=[];
    _audioRec=new MediaRecorder(stream);
    _audioRec.ondataavailable=e=>{if(e.data.size>0)_audioChunks.push(e.data);};
    _audioRec.onstop=()=>{
      const blob=new Blob(_audioChunks,{type:'audio/webm'});
      const r=new FileReader();
      r.onload=e=>{
        _media.push({id:Date.now(),type:'audio',name:'voice-'+Date.now()+'.webm',data:e.target.result});
        _renderMediaPrev();
      };
      r.readAsDataURL(blob);
      stream.getTracks().forEach(t=>t.stop());
    };
    _audioRec.start();
    if(btn){btn.innerHTML='<span style="font-size:24px;">⏹</span>Recording... (Rok ne ke liye tap karo)';btn.style.borderColor='var(--red)';}
    showToast('🔴 Voice recording shuru...','info',2000);
  } catch(e){showToast('⚠️ Mic permission nahi mili','error');}
}

async function saveEntry() {
  const desc=document.getElementById('pe-desc')?.value.trim();
  if(!desc){showToast('⚠️ Masla likhna zaruri hai','error');return;}
  const meta={
    entry_type:_etype,
    caller:document.getElementById('pe-name')?.value.trim()||'',
    cell:document.getElementById('pe-cell')?.value.trim()||'',
    response:document.getElementById('pe-resp')?.value.trim()||'',
    media:_media.map(m=>({type:m.type,name:m.name,data:m.data}))
  };
  const loc=document.getElementById('pe-loc')?.value.trim()||'';
  const oid=await getOfficerId();
  try {
    // Try to get GPS location
    const _save=async(lat,lng)=>{
      await supabaseClient.from('patrol_logs').insert({
        shift_id:_shift.id,officer_id:oid,
        log_type:_etype.toLowerCase(),
        lat,lng,address:loc,notes:desc,
        severity:_etype==='Incident'?'high':'medium',
        logged_at:new Date().toISOString(),meta
      });
      showToast('✅ Entry save ho gayi!','success');
      _media=[];
      ['pe-name','pe-cell','pe-desc','pe-resp','pe-loc'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
      _renderMediaPrev();
    };
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(
        async p=>await _save(p.coords.latitude,p.coords.longitude),
        async ()=>await _save(null,null),
        {timeout:5000}
      );
    } else { await _save(null,null); }
  } catch(e){showToast('❌ '+e.message,'error');}
}

// ── MAP TAB ───────────────────────────────────────────────────
function _tabMap(el) {
  el.innerHTML=`
  <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-size:11px;font-weight:600;" id="map-gps-lbl">📡 GPS Ready</div>
      <div style="font-size:10px;color:var(--text-muted);" id="map-coords">—</div>
    </div>
    <button id="map-gps-btn" class="btn btn-primary btn-sm" onclick="_toggleMapGPS()">▶ GPS On</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;">
    <div style="background:var(--bg-card);border-radius:8px;padding:9px;text-align:center;border:1px solid var(--border);">
      <div style="font-size:17px;font-weight:700;color:var(--accent);" id="stat-km">0.00</div>
      <div style="font-size:10px;color:var(--text-muted);">KM Safar</div>
    </div>
    <div style="background:var(--bg-card);border-radius:8px;padding:9px;text-align:center;border:1px solid var(--border);">
      <div style="font-size:17px;font-weight:700;color:var(--accent);" id="stat-pts">0</div>
      <div style="font-size:10px;color:var(--text-muted);">GPS Points</div>
    </div>
    <div style="background:var(--bg-card);border-radius:8px;padding:9px;text-align:center;border:1px solid var(--border);">
      <div style="font-size:17px;font-weight:700;color:var(--accent);" id="stat-dur">0m</div>
      <div style="font-size:10px;color:var(--text-muted);">Muddat</div>
    </div>
  </div>
  <div style="height:300px;border-radius:10px;overflow:hidden;border:1px solid var(--border);margin-bottom:8px;" id="patrol-map"></div>
  <button onclick="_exportGPX()" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text-primary);font-size:12px;cursor:pointer;">⬇️ GPX Route Download Karo</button>`;

  if(!window.L){
    const lk=document.createElement('link');
    lk.rel='stylesheet';lk.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(lk);
    const s=document.createElement('script');
    s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload=_initMap;
    document.head.appendChild(s);
  } else { setTimeout(_initMap,100); }
}

function _initMap(){
  const el=document.getElementById('patrol-map');
  if(!el)return;
  if(_patrolMap){_patrolMap.invalidateSize();return;}
  _patrolMap=L.map('patrol-map').setView([30.1575,71.5249],13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(_patrolMap);
  _routeLine=L.polyline([],{color:'#1976d2',weight:4}).addTo(_patrolMap);
}

let _mapGpsOn=false;
function _toggleMapGPS(){
  const btn=document.getElementById('map-gps-btn');
  if(_mapGpsOn){
    if(_gpsWatch){navigator.geolocation.clearWatch(_gpsWatch);_gpsWatch=null;}
    _mapGpsOn=false;
    if(btn){btn.textContent='▶ GPS On';btn.className='btn btn-primary btn-sm';}
    document.getElementById('map-gps-lbl').textContent='📡 GPS Band';
  } else {
    _mapGpsOn=true;
    if(btn){btn.textContent='⏹ GPS Off';btn.className='btn btn-danger btn-sm';}
    document.getElementById('map-gps-lbl').textContent='📡 Live tracking chal rahi hai...';
    _gpsWatch=navigator.geolocation.watchPosition(pos=>{
      const lat=pos.coords.latitude,lng=pos.coords.longitude;
      if(_lastLL)_totalDist+=_hav(_lastLL[0],_lastLL[1],lat,lng);
      _lastLL=[lat,lng];
      _routePts.push({lat,lng,time:Date.now()});
      const kmEl=document.getElementById('stat-km'); if(kmEl)kmEl.textContent=_totalDist.toFixed(2);
      const pEl=document.getElementById('stat-pts'); if(pEl)pEl.textContent=_routePts.length;
      const dur=_dur(_shift.started_at,new Date().toISOString());
      const dEl=document.getElementById('stat-dur'); if(dEl)dEl.textContent=dur;
      const cEl=document.getElementById('map-coords'); if(cEl)cEl.textContent=lat.toFixed(5)+', '+lng.toFixed(5);
      // Also update header GPS label
      const hl=document.getElementById('gps-lbl'); if(hl)hl.textContent='📡 Live tracking chal rahi hai...';
      if(_patrolMap&&_routeLine){
        _routeLine.addLatLng([lat,lng]);
        _patrolMap.setView([lat,lng],15);
        L.circleMarker([lat,lng],{radius:4,color:'#1976d2',fillColor:'#4fc3f7',fillOpacity:1}).addTo(_patrolMap);
      }
    },err=>{
      const lbl=document.getElementById('map-gps-lbl');
      if(lbl)lbl.textContent='⚠️ GPS Error: '+err.message;
    },{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  }
}

function _toggleGPS(){
  _tab='map'; _switchPTab();
  setTimeout(_toggleMapGPS,300);
}

function _hav(la1,lo1,la2,lo2){
  const R=6371,dLa=(la2-la1)*Math.PI/180,dLo=(lo2-lo1)*Math.PI/180;
  const a=Math.sin(dLa/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function _exportGPX(){
  if(!_routePts.length){showToast('⚠️ Koi GPS points nahi','error');return;}
  let g='<?xml version="1.0"?><gpx version="1.1" creator="Digital IO"><trk><trkseg>\n';
  _routePts.forEach(p=>{g+=`<trkpt lat="${p.lat}" lon="${p.lng}"><time>${new Date(p.time).toISOString()}</time></trkpt>\n`;});
  g+='</trkseg></trk></gpx>';
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([g],{type:'application/gpx+xml'}));
  a.download='patrol-route-'+new Date().toISOString().slice(0,10)+'.gpx';
  a.click();
  showToast('⬇️ GPX download ho rahi hai!','success');
}

// ── LOGS TAB ──────────────────────────────────────────────────
async function _tabLogs(el){
  el.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text-muted);">Lad ho raha hai...</div>`;
  const{data}=await supabaseClient.from('patrol_logs').select('*').eq('shift_id',_shift.id).order('logged_at',{ascending:false});
  const logs=data||[];
  const cnt={};Object.keys(_ET).forEach(k=>{cnt[k]=0;});
  logs.forEach(l=>{const t=l.meta?.entry_type||'Aur Kuch';if(cnt[t]!==undefined)cnt[t]++;});
  el.innerHTML=`
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:10px;">
    ${Object.entries(cnt).map(([t,n])=>`
      <div style="background:var(--bg-card);border-radius:8px;padding:8px;text-align:center;border:1px solid var(--border);">
        <div style="font-size:16px;font-weight:700;color:var(--accent);">${n}</div>
        <div style="font-size:9px;color:var(--text-muted);">${_ET[t]?.icon||'📋'}</div>
      </div>`).join('')}
  </div>
  <div style="display:flex;flex-direction:column;gap:7px;">
    ${logs.length?logs.map(l=>{
      const m=l.meta||{};const tc=_ET[m.entry_type]||{icon:'📋',color:'#ffa726'};
      const media=m.media||[];
      return`<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:9px;padding:10px 12px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <div style="width:8px;height:8px;border-radius:50%;background:${tc.color};flex-shrink:0;"></div>
          <span style="font-size:11px;font-weight:700;color:${tc.color};flex:1;">${tc.icon} ${m.entry_type||l.log_type}</span>
          <span style="font-size:10px;color:var(--text-faint);">${_timeStr(l.logged_at)}</span>
          <span onclick="_delLog('${l.id}')" style="color:var(--text-muted);cursor:pointer;font-size:13px;">✕</span>
        </div>
        ${m.caller?`<div style="font-size:11px;color:var(--text-muted);">👤 ${m.caller}${m.cell?' · 📱'+m.cell:''}</div>`:''}
        <div style="font-size:13px;color:var(--text-primary);margin:3px 0;">${l.notes||''}</div>
        ${m.response?`<div style="font-size:11px;color:#81c784;background:rgba(46,125,50,0.1);border-left:2px solid #2e7d32;padding:4px 7px;border-radius:4px;margin-bottom:3px;">✍️ ${m.response}</div>`:''}
        ${l.address?`<div style="font-size:11px;color:var(--text-muted);">📍 ${l.address}</div>`:''}
        ${l.lat?`<a href="https://maps.google.com/?q=${l.lat},${l.lng}" target="_blank" style="font-size:10px;color:var(--accent);">📌 Maps mein dekho</a>`:''}
        ${media.length?`<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;">${media.map(m=>m.type==='image'?`<img src="${m.data}" style="width:40px;height:40px;object-fit:cover;border-radius:5px;">`:`<div style="width:40px;height:40px;background:var(--bg-tertiary);border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:18px;">${m.type==='video'?'🎥':m.type==='audio'?'🎙️':'📎'}</div>`).join('')}</div>`:''}</div>`;
    }).join(''):`<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:12px;">Koi entry nahi — Entry tab se daalen</div>`}
  </div>`;
}

async function _delLog(id){
  await supabaseClient.from('patrol_logs').delete().eq('id',id);
  showToast('🗑️ Entry delete ho gayi','info');
  _tabLogs(document.getElementById('pt-content'));
}

// ── REMINDER TAB ──────────────────────────────────────────────
function _tabReminder(el){
  el.innerHTML=`
  <div class="card" style="margin-bottom:10px;">
    <div style="font-size:10px;color:var(--accent);font-weight:700;letter-spacing:1px;margin-bottom:8px;">🔔 NAYA REMINDER</div>
    <input class="form-input" id="rem-txt" placeholder="Reminder likhein (e.g. FIR follow-up — Ali ka case)" style="margin-bottom:6px;">
    <div style="display:flex;gap:6px;margin-bottom:10px;">
      <input class="form-input" type="time" id="rem-time" style="flex:1;">
      <button class="btn btn-primary" onclick="_addReminder()">🔔 Set Karo</button>
    </div>
    <div style="font-size:10px;color:var(--text-faint);">Browser notifications allow karo reminder ke liye</div>
  </div>
  <div id="rem-list">
    ${_patrolRems.length?_patrolRems.map(r=>`
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:9px 12px;display:flex;align-items:center;gap:8px;margin-bottom:7px;">
        <span style="font-size:18px;">🔔</span>
        <div style="flex:1;">
          <div style="font-size:13px;color:var(--text-primary);">${r.text}</div>
          <div style="font-size:11px;color:var(--accent);">⏰ ${r.time}</div>
        </div>
        <span onclick="_delReminder(${r.id})" style="color:var(--text-muted);cursor:pointer;font-size:14px;">✕</span>
      </div>`).join(''):`<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px;">Koi reminder nahi</div>`}
  </div>`;
}

function _addReminder(){
  const txt=document.getElementById('rem-txt')?.value.trim();
  const time=document.getElementById('rem-time')?.value;
  if(!txt){showToast('⚠️ Reminder text likhein','error');return;}
  if(!time){showToast('⚠️ Time bhi chunein','error');return;}
  const rem={id:Date.now(),text:txt,time};
  _patrolRems.push(rem);
  _scheduleNotif(txt,time);
  showToast('🔔 Reminder set ho gaya!','success');
  document.getElementById('rem-txt').value='';
  document.getElementById('rem-time').value='';
  _tabReminder(document.getElementById('pt-content'));
}

function _delReminder(id){
  _patrolRems=_patrolRems.filter(r=>r.id!==id);
  _tabReminder(document.getElementById('pt-content'));
}

function _scheduleNotif(txt,timeStr){
  if(!('Notification' in window))return;
  const now=new Date(),parts=timeStr.split(':');
  const target=new Date(now.getFullYear(),now.getMonth(),now.getDate(),+parts[0],+parts[1],0);
  let diff=target-now; if(diff<0)diff+=86400000;
  Notification.requestPermission().then(p=>{
    if(p==='granted') setTimeout(()=>{
      new Notification('Patrol Reminder — Digital IO',{body:txt,icon:'/icon-192.png'});
    },diff);
  });
}

// ── SUMMARY TAB ───────────────────────────────────────────────
async function _tabSummary(el){
  el.innerHTML=`<div style="text-align:center;padding:20px;color:var(--text-muted);">Report ban rahi hai...</div>`;
  const o=currentOfficer||{};
  const{data}=await supabaseClient.from('patrol_logs').select('*').eq('shift_id',_shift.id).order('logged_at',{ascending:true});
  const logs=data||[];
  const now=new Date();
  const cnt={};Object.keys(_ET).forEach(k=>{cnt[k]=0;});
  logs.forEach(l=>{const t=l.meta?.entry_type||'Aur Kuch';if(cnt[t]!==undefined)cnt[t]++;});

  let r='╔══════════════════════════════╗\n';
  r+='║   PATROL DUTY REPORT         ║\n';
  r+='║   Digital IO — Punjab Police ║\n';
  r+='╚══════════════════════════════╝\n\n';
  r+=`Officer : ${o.full_name||'—'}\n`;
  r+=`Rank    : ${o.designation||'—'}, Badge: ${o.badge_number||'—'}\n`;
  r+=`Station : ${o.station||'—'}, ${o.district||'—'}\n`;
  r+=`Date    : ${now.toLocaleDateString('en-PK',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}\n`;
  r+=`Shift   : ${_timeStr(_shift.started_at)} → ${_timeStr(now.toISOString())}\n`;
  r+=`Muddat  : ${_dur(_shift.started_at,now.toISOString())}\n`;
  r+=`GPS KM  : ${_totalDist.toFixed(2)} km safar\n\n`;
  r+='━━━━ KHULASA ━━━━\n';
  Object.entries(cnt).forEach(([t,n])=>{r+=`${_ET[t]?.icon||'📋'} ${t.padEnd(14)}: ${n}\n`;});
  r+=`   Kul Total     : ${logs.length}\n\n`;
  if(logs.length){
    r+='━━━━ TAFSEEL ━━━━\n';
    logs.forEach((l,i)=>{
      const m=l.meta||{};
      r+=`\n${i+1}. [${_timeStr(l.logged_at)}] ${_ET[m.entry_type]?.icon||'📋'} ${m.entry_type||l.log_type}\n`;
      if(m.caller)r+=`   Caller  : ${m.caller}\n`;
      if(m.cell)r+=`   Cell    : ${m.cell}\n`;
      if(l.address)r+=`   Jagah   : ${l.address}\n`;
      if(l.lat)r+=`   GPS     : ${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}\n`;
      r+=`   Masla   : ${l.notes||''}\n`;
      if(m.response)r+=`   Response: ${m.response}\n`;
    });
  }
  r+=`\n━━━━━━━━━━━━━━━━━━\nGenerated by Digital IO\n${now.toLocaleString('en-PK')}`;

  el.innerHTML=`
  <div id="pt-report" data-txt="${btoa(unescape(encodeURIComponent(r)))}" style="background:var(--bg-tertiary);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px;font-size:11px;line-height:1.8;color:var(--text-secondary);white-space:pre-wrap;max-height:360px;overflow-y:auto;font-family:monospace;">${r}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
    <button onclick="_copyRep()" style="padding:10px 4px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text-primary);font-size:11px;cursor:pointer;">📋 Copy Karo</button>
    <button onclick="_shareRep()" style="padding:10px 4px;border:1px solid #25D366;border-radius:8px;background:rgba(37,211,102,0.08);color:#25D366;font-size:11px;cursor:pointer;">📱 WhatsApp</button>
    <button onclick="_dlRep()" style="padding:10px 4px;border:1px solid var(--accent);border-radius:8px;background:rgba(56,189,248,0.08);color:var(--accent);font-size:11px;cursor:pointer;">⬇️ Download</button>
  </div>`;
}

function _getRep(){
  const el=document.getElementById('pt-report');
  if(!el)return'';
  try{return decodeURIComponent(escape(atob(el.dataset.txt)));}catch(_){return el.textContent;}
}
function _copyRep(){navigator.clipboard.writeText(_getRep()).then(()=>showToast('📋 Copy ho gayi!','success'));}
function _shareRep(){
  const t=_getRep();
  if(navigator.share){navigator.share({title:'Patrol Report',text:t}).catch(()=>{});}
  else{navigator.clipboard.writeText(t).then(()=>showToast('Copy ho gayi — WhatsApp mein paste karo','info'));}
}
function _dlRep(){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([_getRep()],{type:'text/plain'}));
  a.download='patrol-report-'+new Date().toISOString().slice(0,10)+'.txt';
  a.click();showToast('⬇️ Download ho rahi hai!','success');
}

// ── VOICE INPUT ───────────────────────────────────────────────
function _pVoice(tId,bId){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){showToast('⚠️ Browser mein voice support nahi','error');return;}
  if(_vActive&&_vTarget===tId){
    _vRec?.stop();_vActive=false;_vTarget=null;
    const b=document.getElementById(bId);if(b){b.style.background='var(--bg-tertiary)';b.textContent='🎙️';}
    return;
  }
  if(_vActive)_vRec?.stop();
  _vTarget=tId;_vActive=true;
  const b=document.getElementById(bId);if(b){b.style.background='var(--red)';b.textContent='⏹';}
  _vRec=new SR();_vRec.lang='ur-PK';_vRec.continuous=false;_vRec.interimResults=false;
  _vRec.onresult=e=>{const inp=document.getElementById(tId);if(inp)inp.value+=(inp.value?' ':'')+e.results[0][0].transcript;};
  _vRec.onend=()=>{_vActive=false;_vTarget=null;const b=document.getElementById(bId);if(b){b.style.background='var(--bg-tertiary)';b.textContent='🎙️';}};
  _vRec.onerror=()=>{_vActive=false;const b=document.getElementById(bId);if(b){b.style.background='var(--bg-tertiary)';b.textContent='🎙️';}};
  _vRec.start();
}

// ── SHIFT ─────────────────────────────────────────────────────
async function startShift(){
  const oid=await getOfficerId();
  const{data,error}=await supabaseClient.from('patrol_shifts').insert({officer_id:oid,status:'active',started_at:new Date().toISOString()}).select().single();
  if(error){showToast('❌ '+error.message,'error');return;}
  _shift=data;_tab='entry';
  showToast('🟢 Shift shuru ho gayi!','success');
  _drawRoot();
}

function confirmEndShift(){
  openModal('⏹ Shift Khatam Karo',
    `<p style="color:var(--text-secondary);font-size:13px;margin-bottom:10px;">Kya aap shift khatam karna chahte hain?</p>
     <label class="form-label">Akhri Notes (optional)</label>
     <textarea class="form-input" id="end-notes" rows="2" placeholder="Koi akhri baat..."></textarea>`,
    `<button class="btn btn-secondary" onclick="closeModal()">Wapas</button>
     <button class="btn btn-danger" onclick="endShift()">⏹ Haan, Khatam Karo</button>`);
}

async function endShift(){
  const notes=document.getElementById('end-notes')?.value.trim()||'';
  closeModal();
  if(_gpsWatch){navigator.geolocation.clearWatch(_gpsWatch);_gpsWatch=null;}
  clearInterval(_shiftTimer);_shiftTimer=null;
  if(_vRec)_vRec.stop();
  if(_audioRec&&_audioRec.state==='recording')_audioRec.stop();
  await supabaseClient.from('patrol_shifts').update({status:'completed',ended_at:new Date().toISOString(),notes}).eq('id',_shift.id);
  _shift=null;_routePts=[];_totalDist=0;_lastLL=null;_patrolMap=null;_routeLine=null;_mapGpsOn=false;
  showToast('✅ Shift khatam — Acha kaam kiya!','success');
  const c=document.getElementById('page-content');if(c)renderPatrol(c);
}

// ── TIMER ─────────────────────────────────────────────────────
function _startTimer(){
  if(_shiftTimer)clearInterval(_shiftTimer);
  const s=new Date(_shift.started_at).getTime();
  _shiftTimer=setInterval(()=>{
    const d=Math.floor((Date.now()-s)/1000);
    const h=String(Math.floor(d/3600)).padStart(2,'0');
    const m=String(Math.floor((d%3600)/60)).padStart(2,'0');
    const sec=String(d%60).padStart(2,'0');
    const t=document.getElementById('ptimer');if(t)t.textContent=h+':'+m+':'+sec;
  },1000);
}

// ── HELPERS ───────────────────────────────────────────────────
async function _fetchHist(){
  const oid=await getOfficerId();
  const{data}=await supabaseClient.from('patrol_shifts').select('*').eq('officer_id',oid).eq('status','completed').order('started_at',{ascending:false}).limit(10);
  return data||[];
}

async function viewShift(id){
  openModal('📋 Shift Ki Tafseel','<div style="text-align:center;padding:20px;">Lad ho raha hai...</div>','');
  const{data:logs}=await supabaseClient.from('patrol_logs').select('*').eq('shift_id',id).order('logged_at',{ascending:true});
  const{data:s}=await supabaseClient.from('patrol_shifts').select('*').eq('id',id).single();
  const body=`
    <div style="background:var(--bg-tertiary);border-radius:8px;padding:10px;margin-bottom:10px;font-size:12px;">
      📅 ${formatDate(s.started_at)} · ${_timeStr(s.started_at)} → ${s.ended_at?_timeStr(s.ended_at):'—'}<br>
      ⏱ ${s.ended_at?_dur(s.started_at,s.ended_at):'—'} · ${(logs||[]).length} entries
      ${s.notes?'<br>📝 '+s.notes:''}
    </div>
    <div style="max-height:380px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">
      ${(logs||[]).map(l=>{const m=l.meta||{};const tc=_ET[m.entry_type]||{icon:'📋',color:'#ffa726'};
        return`<div style="background:var(--bg-card);border-radius:8px;padding:8px;font-size:12px;">
          <span style="color:${tc.color};font-weight:700;">${tc.icon} ${m.entry_type||l.log_type}</span>
          <span style="color:var(--text-faint);margin-left:8px;">${_timeStr(l.logged_at)}</span>
          ${m.caller?`<div>👤 ${m.caller}${m.cell?' 📱'+m.cell:''}</div>`:''}
          <div>${l.notes||''}</div>
          ${m.response?`<div style="color:#81c784;">✍️ ${m.response}</div>`:''}
          ${l.address?`<div style="color:var(--text-muted);">📍 ${l.address}</div>`:''}
          ${l.lat?`<a href="https://maps.google.com/?q=${l.lat},${l.lng}" target="_blank" style="color:var(--accent);">📌 Maps</a>`:''}
        </div>`;}).join('')}
    </div>`;
  document.querySelector('#modal-root .modal-body').innerHTML=body;
  document.querySelector('#modal-root .modal-footer').innerHTML='<button class="btn btn-secondary" onclick="closeModal()">Band Karo</button>';
}

function _timeStr(iso){if(!iso)return'—';const d=new Date(iso);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function _dur(s,e){const d=Math.floor((new Date(e)-new Date(s))/1000);const h=Math.floor(d/3600),m=Math.floor((d%3600)/60);return(h?h+'h ':'')+m+'m';}
