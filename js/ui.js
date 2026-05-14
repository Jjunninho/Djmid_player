// ═══════════════════════════════════════════════════════════════
// CHANNEL UI
// ═══════════════════════════════════════════════════════════════
function buildChannelUI(){
  const grid = document.getElementById('channelsGrid');
  grid.innerHTML='';
  for(let i=0;i<16;i++){
    const ch = channels[i];
    const div = document.createElement('div');
    div.className='channel-strip';
    div.id=`ch-strip-${i}`;
    
    // ATENÇÃO: A crase começa aqui e só termina no final do bloco!
    div.innerHTML=`
      <div class="ch-num">${i===9?'DR':String(i+1).padStart(2,'0')}</div>
      <div class="ch-name" id="ch-name-${i}">${ch.name}</div>
      <div class="vu-wrap"><div class="vu-bar" id="vu-${i}"></div></div>
      <div class="knob-wrap">
        <div class="knob" id="pan-${i}" data-ch="${i}" data-type="pan" title="Pan" style="--rot:0deg"></div>
        <div class="knob-lbl">PAN</div>
      </div>
      <div class="fader-wrap">
        <div class="fader-track" id="fader-track-${i}" data-ch="${i}">
          <div class="fader-thumb" id="fader-${i}" style="top:${Math.round((1-ch.volume/127)*38)}px"></div>
        </div>
        <div class="knob-lbl">VOL</div>
      </div>
      <div class="ch-btns">
        <div class="ch-btn mute-btn" id="mute-${i}" title="Mute" onclick="toggleMute(${i})">M</div>
        <div class="ch-btn solo-btn" id="solo-${i}" title="Solo" onclick="toggleSolo(${i})">S</div>
      </div>
      <select class="ch-prog-sel" id="ch-prog-${i}" onchange="changeChannelProgram(${i}, this.value)">
        ${GM_NAMES.map((name, idx) => 
          `<option value="${idx}" ${ch.program === idx ? 'selected' : ''}>${String(idx).padStart(3,'0')} ${name}</option>`
        ).join('')}
      </select>
    `;
    // A crase terminou logo acima do ponto e vírgula

    grid.appendChild(div);
    setupFaderDrag(i);
    setupKnobDrag(i);
  }
}

function updateChannelUI(ch){
  const name = document.getElementById(`ch-name-${ch}`);
  const prog = document.getElementById(`ch-prog-${ch}`);
  const strip= document.getElementById(`ch-strip-${ch}`);
  if(name) name.textContent=channels[ch].name.slice(0,7);
  if(prog) prog.textContent=channels[ch].program;
}

function toggleMute(ch){
  channels[ch].mute=!channels[ch].mute;
  const btn=document.getElementById(`mute-${ch}`);
  const strip=document.getElementById(`ch-strip-${ch}`);
  btn.classList.toggle('on',channels[ch].mute);
  strip.classList.toggle('muted',channels[ch].mute);
  if(!channels[ch].mute) updateChannelGain(ch);
}

function toggleSolo(ch){
  channels[ch].solo=!channels[ch].solo;
  document.getElementById(`solo-${ch}`).classList.toggle('on',channels[ch].solo);
  document.getElementById(`ch-strip-${ch}`).classList.toggle('soloed',channels[ch].solo);
}

function setupFaderDrag(ch){
  const track = document.getElementById(`fader-track-${ch}`);
  const thumb = document.getElementById(`fader-${ch}`);
  let dragging=false, startY=0, startTop=0;
  const maxTop=38;

  track.addEventListener('mousedown',e=>{
    e.preventDefault();
    dragging=true;
    startY=e.clientY;
    startTop=parseInt(thumb.style.top)||0;
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });
  function onMove(e){
    if(!dragging) return;
    let t=Math.min(maxTop,Math.max(0,startTop+(e.clientY-startY)));
    thumb.style.top=t+'px';
    channels[ch].volume=Math.round((1-t/maxTop)*127);
    updateChannelGain(ch);
  }
  function onUp(){
    dragging=false;
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onUp);
  }
}

function setupKnobDrag(ch){
  const knob=document.getElementById(`pan-${ch}`);
  let dragging=false, startY=0, startVal=0;
  knob.addEventListener('mousedown',e=>{
    e.preventDefault(); dragging=true; startY=e.clientY; startVal=channels[ch].pan;
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  });
  function onMove(e){
    if(!dragging) return;
    const delta=startY-e.clientY;
    channels[ch].pan=Math.max(0,Math.min(127,startVal+delta));
    updateChannelPan(ch);
    const deg=(channels[ch].pan-64)/64*150;
    knob.style.setProperty('--rot',deg+'deg');
  }
  function onUp(){ dragging=false; document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); }
}

// ═══════════════════════════════════════════════════════════════
// VU METERS UPDATE
// ═══════════════════════════════════════════════════════════════
function updateVUMeters(){
  for(let i=0;i<16;i++){
    const bar=document.getElementById(`vu-${i}`);
    if(!bar) continue;
    const lv=channels[i].vuLevel;
    bar.style.height=(lv*100).toFixed(1)+'%';
    channels[i].vuLevel=Math.max(0,lv-0.04); // decay
    // Active channel
    if(lv>0.05) document.getElementById(`ch-strip-${i}`)?.classList.add('active');
    else document.getElementById(`ch-strip-${i}`)?.classList.remove('active');
  }
}

// ═══════════════════════════════════════════════════════════════
// PIANO ROLL
// ═══════════════════════════════════════════════════════════════
function drawRoll(currentPos){
  const canvas=document.getElementById('rollCanvas');
  const wrap=document.getElementById('rollWrap');
  canvas.width=wrap.clientWidth;
  canvas.height=wrap.clientHeight;
  const ctx=canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;

  const zoom=parseInt(document.getElementById('rollZoom').value)||2;
  const filterCh=parseInt(document.getElementById('rollChannel').value);
  const pos=currentPos||0;
  const pxPerSec=W/(totalTimeSec/zoom);
  const viewStart=Math.max(0,pos-totalTimeSec/zoom*0.25);

  // Background
  ctx.fillStyle='#080810';
  ctx.fillRect(0,0,W,H);

  // Pitch grid (MIDI 21-108, piano range)
  const minPitch=21, maxPitch=108, pitchRange=maxPitch-minPitch;
  const rowH=H/pitchRange;
  // White/black key rows
  for(let p=minPitch;p<=maxPitch;p++){
    const y=H-(p-minPitch+1)*rowH;
    const isBlack=[1,3,6,8,10].includes(p%12);
    ctx.fillStyle=isBlack ? '#0c0c18' : '#0f0f1e';
    ctx.fillRect(0,y,W,rowH);
  }
  // Beat lines
  const beatsPerSec=currentBPM/60;
  const beatW=pxPerSec/beatsPerSec;
  let beatStart=Math.floor(viewStart*beatsPerSec);
  for(let b=beatStart; b<(viewStart+totalTimeSec/zoom)*beatsPerSec+1; b++){
    const x=(b/beatsPerSec-viewStart)*pxPerSec;
    ctx.strokeStyle=b%4===0 ? 'rgba(255,140,0,.2)' : 'rgba(255,255,255,.03)';
    ctx.lineWidth=b%4===0?1:0.5;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
  }

  // Notes
  const colors=['#00d4ff','#ff8c00','#39ff14','#ff2d78','#ffb347','#7fffff',
    '#ff6b35','#a8e6cf','#ffd3b6','#ffaaa5','#a8d8ea','#aa96da',
    '#fcbad3','#ffffd2','#98ddca','#d5ecc2'];

  for(const n of allNotes){
    if(filterCh>=0 && n.ch!==filterCh) continue;
    if(n.timeSec+n.durSec < viewStart) continue;
    if(n.timeSec > viewStart+totalTimeSec/zoom) continue;
    const x=(n.timeSec-viewStart)*pxPerSec;
    const w=Math.max(2,n.durSec*pxPerSec-1);
    const y=H-(n.pitch-minPitch+1)*rowH;
    const alpha=0.3+0.7*(n.vel/127);
    ctx.fillStyle=colors[n.ch%16];
    ctx.globalAlpha=alpha;
    ctx.fillRect(x,y,w,rowH*0.85);
    ctx.globalAlpha=1;
  }

  // Playhead
  const px=(pos-viewStart)*pxPerSec;
  ctx.strokeStyle='rgba(255,140,0,.9)';
  ctx.lineWidth=2;
  ctx.shadowColor=colors[0]; ctx.shadowBlur=8;
  ctx.beginPath(); ctx.moveTo(px,0); ctx.lineTo(px,H); ctx.stroke();
  ctx.shadowBlur=0;
}

// ═══════════════════════════════════════════════════════════════
// VIRTUAL KEYBOARD
// ═══════════════════════════════════════════════════════════════
function drawKeyboard(activeNotes){
  const canvas=document.getElementById('keyboardCanvas');
  const wrap=document.getElementById('keyboardWrap');
  canvas.width=wrap.clientWidth;
  canvas.height=wrap.clientHeight;
  const ctx=canvas.getContext('2d');
  const W=canvas.width, H=canvas.height;

  // Draw 7 octaves: C1-C8, MIDI 24-108
  const startNote=24, endNote=108;
  // Count white keys
  const whites=[];
  for(let n=startNote;n<=endNote;n++){
    if(![1,3,6,8,10].includes(n%12)) whites.push(n);
  }
  const wW=W/whites.length;
  const wH=H;
  const bW=wW*0.6;
  const bH=wH*0.6;

  // Active notes set
  const active=new Set(activeNotes||[]);
  const colors=['#00d4ff','#ff8c00','#39ff14','#ff2d78','#ffb347','#7fffff',
    '#ff6b35','#a8e6cf','#ffd3b6','#ffaaa5','#a8d8ea','#aa96da',
    '#fcbad3','#ffffd2','#98ddca','#d5ecc2'];

  // Draw white keys
  ctx.fillStyle='#0f0f1e';
  ctx.fillRect(0,0,W,H);
  whites.forEach((note,i)=>{
    const x=i*wW;
    const isActive=active.has(note);
    ctx.fillStyle=isActive ? (colors[note%12]) : '#dde2f0';
    ctx.strokeStyle='#0a0a12';
    ctx.lineWidth=1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x+0.5,0,wW-1,wH-2,2) : ctx.rect(x+0.5,0,wW-1,wH-2);
    ctx.fill(); ctx.stroke();
    if(isActive){
      ctx.shadowColor=colors[note%12]; ctx.shadowBlur=10;
      ctx.fill();
      ctx.shadowBlur=0;
    }
    // C label
    if(note%12===0){
      ctx.fillStyle='#333';
      ctx.font=`${Math.max(8,wW*0.5)}px Orbitron,monospace`;
      ctx.textAlign='center';
      ctx.fillText(`C${Math.floor(note/12)-1}`,x+wW/2,wH-4);
    }
  });

  // Draw black keys
  const blackOffsets={1:0.6,3:1.6,6:3.6,8:4.6,10:5.6};
  for(let note=startNote;note<=endNote;note++){
    const mod=note%12;
    if(![1,3,6,8,10].includes(mod)) continue;
    const octave=Math.floor((note-startNote)/12);
    const baseWhite=octave*7+{1:0,3:1,6:3,8:4,10:5}[mod];
    const x=baseWhite*wW+wW*0.65;
    const isActive=active.has(note);
    ctx.fillStyle=isActive ? (colors[note%12]) : '#1a1a2e';
    ctx.strokeStyle='#000';
    ctx.lineWidth=0.5;
    ctx.fillRect(x,0,bW,bH);
    ctx.strokeRect(x,0,bW,bH);
    if(isActive){
      ctx.shadowColor=colors[note%12]; ctx.shadowBlur=8;
      ctx.fillRect(x,0,bW,bH);
      ctx.shadowBlur=0;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════════════════════════════════
let lastAnimTime=0;
function animatePlayhead(ts){
  if(!isPlaying){ rafId=null; return; }
  rafId=requestAnimationFrame(animatePlayhead);

  const now=ts||0;
  if(now-lastAnimTime < 16) return; // ~60fps
  lastAnimTime=now;

  const pos=getCurrentPosition();
  updateSeekBar(pos);
  updateTimeDisplay(pos);
  updateVUMeters();

  // Notes active at current pos
  const activeNotes=allNotes
    .filter(n=>n.timeSec<=pos && n.timeSec+n.durSec>=pos)
    .map(n=>n.pitch);

  drawRoll(pos);
  drawKeyboard(activeNotes);

  // Update roll info
  const bps=currentBPM/60;
  const beat=pos*bps;
  const bar=Math.floor(beat/4)+1;
  const bt=Math.floor(beat%4)+1;
  document.getElementById('rollInfo').textContent=`BAR ${String(bar).padStart(3,'0')} : BEAT ${bt}`;
}

function updateSeekBar(pos){
  if(!totalTimeSec) return;
  const pct=Math.min(1,pos/totalTimeSec)*100;
  document.getElementById('seekFill').style.width=pct+'%';
  document.getElementById('seekHead').style.left=pct+'%';
  document.getElementById('seekLbl').textContent=formatTime(pos);
}

function updateTimeDisplay(pos){
  const bps=currentBPM/60;
  const beat=pos*bps;
  const bar=Math.floor(beat/4)+1;
  const bt=Math.floor(beat%4)+1;
  const ms=Math.floor((pos%1)*1000);
  const secs=Math.floor(pos%60);
  const mins=Math.floor(pos/60);
  document.getElementById('timeDisp').textContent=
    `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}.${String(ms).padStart(3,'0')} | BAR ${String(bar).padStart(2,'0')}:${bt}`;
}

function formatTime(sec){
  const m=Math.floor(sec/60), s=Math.floor(sec%60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ═══════════════════════════════════════════════════════════════
// TRANSPORT UI
// ═══════════════════════════════════════════════════════════════
function updateTransportUI(){
  document.getElementById('playBtn').classList.toggle('play-active', isPlaying && !isPaused);
  document.getElementById('pauseBtn').classList.toggle('active', isPaused);
  document.getElementById('stopBtn').classList.toggle('active', !isPlaying && !isPaused && allNotes.length>0);
  document.getElementById('statusLed').className='led'+(isPlaying?' on':isPaused?' loading':'');
}

// ═══════════════════════════════════════════════════════════════
// FX PANEL
// ═══════════════════════════════════════════════════════════════
const fxState={rev:true,chor:true,del:false,lim:true};

function toggleFX(name, el){
  fxState[name]=!fxState[name];
  el.classList.toggle('on',fxState[name]);
  updateFX();
}

function updateFX(){
  // Update display values
  ['revRoom','revMix','revDamp','chorRate','chorDepth','chorMix','delTime','delFb','delMix','masterVol'].forEach(id=>{
    const el=document.getElementById(id);
    const valEl=document.getElementById(id+'Val');
    if(el&&valEl){
      valEl.textContent=id==='masterVol'?el.value+'%':el.value;
    }
  });

  if(!masterGain) return;

  // Master volume
  const mv=parseInt(document.getElementById('masterVol').value)/100;
  masterGain.gain.value=mv;

  // Reverb
  const revMix=fxState.rev ? parseInt(document.getElementById('revMix').value)/100*0.5 : 0;
  reverbGain.gain.value=revMix;

  // Chorus
  const chorMix=fxState.chor ? parseInt(document.getElementById('chorMix').value)/100*0.4 : 0;
  chorusGain.gain.value=chorMix;
  const chorRate=parseInt(document.getElementById('chorRate').value)/100*2;
  // Would need to update LFO frequency here if we kept a reference

  // Delay
  const delMix=fxState.del ? parseInt(document.getElementById('delMix').value)/100*0.4 : 0;
  delayGain.gain.value=delMix;
  const delTime=parseInt(document.getElementById('delTime').value)/100*0.8;
  delayNode.delayTime.value=Math.max(0.001,delTime);
  const delFb=parseInt(document.getElementById('delFb').value)/100*0.9;
  delayFeedGain.gain.value=delFb;

  // Limiter
  masterLimiter.ratio.value=fxState.lim?20:1;

  // Regenerate reverb on room/damp change
  regenerateReverb();
}

// ═══════════════════════════════════════════════════════════════
// EQ UI
// ═══════════════════════════════════════════════════════════════
function buildEQUI(){
  const bands=document.getElementById('eqBands');
  const freqs=['80Hz','250Hz','1kHz','4kHz','12kHz'];
  bands.innerHTML='';
  freqs.forEach((f,i)=>{
    const div=document.createElement('div');
    div.className='eq-band';
    div.innerHTML=`
      <div class="eq-gain" id="eq-gain-${i}">0dB</div>
      <input type="range" class="eq-fader" min="-12" max="12" value="0" oninput="updateEQ(${i},this.value)" style="direction:rtl">
      <div class="eq-freq">${f}</div>
    `;
    bands.appendChild(div);
  });
}

function updateEQ(band,val){
  document.getElementById(`eq-gain-${band}`).textContent=`${val>0?'+':''}${val}dB`;
  if(eqFilters[band]) eqFilters[band].gain.value=parseFloat(val);
}

// ═══════════════════════════════════════════════════════════════
// APLICAR ESTADO DA MESA (chamado pelo loadMix)
// ═══════════════════════════════════════════════════════════════
function applyMixState(state){
  // ── BPM
  if(state.bpm) setBPM(state.bpm);

  // ── Canais
  if(state.channels){
    state.channels.forEach((saved, i)=>{
      if(i>=16) return;
      const ch = channels[i];
      ch.volume     = saved.volume     ?? ch.volume;
      ch.pan        = saved.pan        ?? ch.pan;
      ch.mute       = saved.mute       ?? false;
      ch.solo       = saved.solo       ?? false;
      ch.program    = saved.program    ?? ch.program;
      ch.expression = saved.expression ?? 127;
      ch.reverbSend = saved.reverbSend ?? ch.reverbSend;
      ch.chorusSend = saved.chorusSend ?? ch.chorusSend;

      // Atualiza áudio
      updateChannelGain(i);
      updateChannelPan(i);
    });
    // Reconstrói UI dos canais para refletir tudo
    buildChannelUI();
  }

  // ── Sliders de FX
  if(state.fxSliders){
    Object.entries(state.fxSliders).forEach(([id, val])=>{
      const el = document.getElementById(id);
      if(el){ el.value = val; }
    });
  }

  // ── Toggles de FX
  if(state.fxToggles){
    Object.entries(state.fxToggles).forEach(([name, on])=>{
      fxState[name] = on;
      const elId = name+'Toggle';
      const el   = document.getElementById(elId);
      if(el) el.classList.toggle('on', on);
    });
  }

  // ── EQ bands
  if(state.eqValues){
    state.eqValues.forEach((val, i)=>{
      const band = document.querySelector(`#eqBands .eq-band:nth-child(${i+1})`);
      if(!band) return;
      const input  = band.querySelector('input');
      const gainEl = band.querySelector('.eq-gain');
      if(input){
        input.value = val;
        const v = parseFloat(val);
        if(gainEl) gainEl.textContent = (v>0?'+':'')+v+'dB';
        if(eqFilters[i]) eqFilters[i].gain.value = v;
      }
    });
  }

  // Atualiza todos os parâmetros de áudio via updateFX
  updateFX();
  drawRoll(getCurrentPosition());
}

// ── Toast de confirmação
function showSaveToast(msg){
  let toast = document.getElementById('saveToast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'saveToast';
    toast.style.cssText = [
      'position:fixed','bottom:24px','left:50%','transform:translateX(-50%) translateY(20px)',
      'background:#0f0f1a','border:1px solid var(--cyan)','color:var(--cyan)',
      'font-family:Orbitron,sans-serif','font-size:11px','letter-spacing:2px',
      'padding:10px 20px','border-radius:4px','z-index:99999',
      'box-shadow:0 0 20px rgba(0,212,255,.3)','transition:all .3s','opacity:0',
    ].join(';');
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  // Animate in
  requestAnimationFrame(()=>{
    toast.style.opacity='1';
    toast.style.transform='translateX(-50%) translateY(0)';
  });
  clearTimeout(toast._timer);
  toast._timer = setTimeout(()=>{
    toast.style.opacity='0';
    toast.style.transform='translateX(-50%) translateY(20px)';
  }, 3000);
}

// ═══════════════════════════════════════════════════════════════
// EVENT LOG
// ═══════════════════════════════════════════════════════════════
const logBuffer=[];
let logFlushTimer=null;
function addEventLog(n){
  const typeName=n.ch===DRUM_CHANNEL?'DRUM':'NOTE';
  logBuffer.push({time:formatTime(n.timeSec),type:typeName,ch:n.ch,data:`P${n.pitch} V${n.vel}`});
  if(!logFlushTimer) logFlushTimer=setTimeout(flushLog,100);
}
function flushLog(){
  logFlushTimer=null;
  const log=document.getElementById('eventLog');
  const frag=document.createDocumentFragment();
  while(logBuffer.length){
    const {time,type,ch,data}=logBuffer.shift();
    const div=document.createElement('div');
    div.className='event-item';
    div.innerHTML=`<span class="event-tick">${time}</span><span class="event-type ${type==='NOTE'?'note':'pc'}">${type}</span><span class="event-data">CH${ch+1} ${data}</span>`;
    frag.appendChild(div);
  }
  log.appendChild(frag);
  // Keep last 200 items
  while(log.children.length>201) log.removeChild(log.children[1]);
  log.scrollTop=log.scrollHeight;
}