// ═══════════════════════════════════════════════════════════════
// FILE LOADING
// ═══════════════════════════════════════════════════════════════
function loadMIDIFile(file){
  showLoading(true,'Lendo arquivo...');
  const reader=new FileReader();
  reader.onload=async (e)=>{
    try{
      showLoading(true,'Parseando MIDI...');
      const parsed=parseMIDIFile(e.target.result);
      showLoading(true,'Processando eventos...');

      // Reset channel state
      channels.forEach((ch,i)=>{ ch.program=i===9?0:0; ch.name=i===9?'DRUMS':`CH${i+1}`; ch.volume=100; ch.pan=64; ch.mute=false; ch.solo=false; });

      const result=processMIDI(parsed);
      allEvents=result.flat;
      allNotes=result.notes;

      // Update roll channel selector
      const sel=document.getElementById('rollChannel');
      const usedChs=[...new Set(allNotes.map(n=>n.ch))].sort((a,b)=>a-b);
      sel.innerHTML='<option value="-1">All Channels</option>';
      usedChs.forEach(ch=>{
        const opt=document.createElement('option');
        opt.value=ch;
        opt.textContent=`CH${ch+1} — ${channels[ch].name}`;
        sel.appendChild(opt);
      });

      document.getElementById('seekLblEnd').textContent=formatTime(totalTimeSec);
      document.getElementById('fileName').textContent=file.name;
      document.getElementById('rollInfo').textContent=`${allNotes.length} notas | ${totalTimeSec.toFixed(1)}s`;

      buildChannelUI();
      drawRoll(0);
      drawKeyboard([]);
      updateTransportUI();

      showLoading(false);
      console.log(`[DJ MID] Loaded: ${allNotes.length} notes, ${totalTimeSec.toFixed(2)}s`);
    } catch(err){
      showLoading(false);
      alert('Erro ao parsear MIDI: '+err.message);
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ═══════════════════════════════════════════════════════════════
// LOADING OVERLAY
// ═══════════════════════════════════════════════════════════════
let loadPct=0;
function showLoading(show, msg){
  const ov=document.getElementById('loadOverlay');
  const bar=document.getElementById('loadBar');
  const msgEl=document.getElementById('loadMsg');
  if(show){
    ov.classList.add('show');
    loadPct=Math.min(90,loadPct+30);
    bar.style.width=loadPct+'%';
    if(msg) msgEl.textContent=msg;
  } else {
    bar.style.width='100%';
    setTimeout(()=>{ ov.classList.remove('show'); loadPct=0; bar.style.width='0%'; },300);
  }
}

// ═══════════════════════════════════════════════════════════════
// SEEK BAR INTERACTION
// ═══════════════════════════════════════════════════════════════
function initSeekBar(){
  const bar=document.getElementById('seekBar');
  let seeking=false;

  function seek(e){
    const rect=bar.getBoundingClientRect();
    const pct=Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width));
    seekTo(pct*totalTimeSec);
  }

  bar.addEventListener('mousedown',e=>{ seeking=true; seek(e); });
  document.addEventListener('mousemove',e=>{ if(seeking) seek(e); });
  document.addEventListener('mouseup',()=>{ seeking=false; });
}

// ═══════════════════════════════════════════════════════════════
// BPM CONTROL
// ═══════════════════════════════════════════════════════════════
function initBPM(){
  document.getElementById('bpmUp').addEventListener('click',()=>setBPM(currentBPM+1));
  document.getElementById('bpmDn').addEventListener('click',()=>setBPM(currentBPM-1));
  document.getElementById('bpmVal').addEventListener('dblclick',()=>{
    const v=prompt('Enter BPM:',currentBPM);
    if(v) setBPM(parseInt(v));
  });
}

function setBPM(v){
  currentBPM=Math.min(300,Math.max(20,v));
  document.getElementById('bpmVal').textContent=currentBPM;
}

// ═══════════════════════════════════════════════════════════════
// DRAG & DROP
// ═══════════════════════════════════════════════════════════════
function initDragDrop(){
  const drop = document.getElementById('fileDrop');
  const input = document.getElementById('fileInput');

  // Adicione este listener de clique caso o inline do HTML falhe
  drop.addEventListener('click', () => input.click());

  drop.addEventListener('dragover', e => { 
    e.preventDefault(); 
    drop.classList.add('drag'); 
  });
  
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  
  drop.addEventListener('drop', e => { 
    e.preventDefault(); 
    drop.classList.remove('drag'); 
    const f = e.dataTransfer.files[0]; 
    if(f) loadMIDIFile(f); 
  });

  input.addEventListener('change', () => { 
    if(input.files[0]) loadMIDIFile(input.files[0]); 
  });
}

// ═══════════════════════════════════════════════════════════════
// SUPORTE AO SF2
// ═══════════════════════════════════════════════════════════════
async function loadSF2File(file) {
  showLoading(true, 'Carregando SoundFont...');
  const reader = new FileReader();
  
  reader.onload = async (e) => {
    try {
      const arrayBuffer = e.target.result;
      
      // Chama a função de parse que já existe no seu audio-engine.js
      sf2Data = parseSF2(arrayBuffer);
      
      // Reseta o cache de samples antigos
      sf2Buffers = {};
      sf2Loaded = true;
      sf2Name = file.name;

      // Atualiza a interface (LED e Nome)
      const label = document.getElementById('sf2Label');
      const led = document.getElementById('sf2Led');
      
      if (label) label.textContent = file.name;
      if (led) {
        led.style.background = 'var(--cyan)';
        led.style.boxShadow = '0 0 10px var(--cyan)';
      }

      showLoading(false);
      console.log('[DJ MID] SoundFont carregado com sucesso:', file.name);
    } catch (err) {
      showLoading(false);
      alert('Erro ao carregar SoundFont: ' + err.message);
      console.error(err);
    }
  };

  reader.readAsArrayBuffer(file);
}
// ═══════════════════════════════════════════════════════════════
// SALVAR / CARREGAR ESTADO DA MESA (JSON)
// ═══════════════════════════════════════════════════════════════

function collectMixState(){
  // Canais
  const chState = channels.map(c=>({
    volume:     c.volume,
    pan:        c.pan,
    mute:       c.mute,
    solo:       c.solo,
    program:    c.program,
    expression: c.expression,
    reverbSend: c.reverbSend,
    chorusSend: c.chorusSend,
  }));

  // Sliders de FX
  const fxSliders = {};
  ['revRoom','revMix','revDamp','chorRate','chorDepth','chorMix',
   'delTime','delFb','delMix','masterVol'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) fxSliders[id] = el.value;
  });

  // Toggles FX (lê do objeto fxState que existe em ui.js)
  const fxToggles = { ...fxState };

  // EQ — 5 bandas
  const eqValues = [];
  for(let i=0;i<5;i++){
    const el = document.querySelector(`#eqBands .eq-band:nth-child(${i+1}) input`);
    eqValues.push(el ? el.value : '0');
  }

  // BPM e info do arquivo
  return {
    version:    2,
    savedAt:    new Date().toISOString(),
    midiFile:   document.getElementById('fileName')?.textContent || '',
    sf2File:    sf2Name || '',
    bpm:        currentBPM,
    channels:   chState,
    fxSliders,
    fxToggles,
    eqValues,
  };
}

function saveMix(){
  const state = collectMixState();
  const json  = JSON.stringify(state, null, 2);
  const blob  = new Blob([json], {type:'application/json'});
  const url   = URL.createObjectURL(blob);

  // Nome sugerido: mesmo nome do midi + timestamp
  const midiName = (state.midiFile||'mix').replace(/\.[^.]+$/,'');
  const ts = new Date().toISOString().slice(0,16).replace('T','_').replace(':','-');
  const filename = `djmid_${midiName}_${ts}.json`;

  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showSaveToast(`💾 Mix salvo: ${filename}`);
  console.log('[DJ MID] Mix salvo:', filename, state);
}

function loadMix(file){
  const reader = new FileReader();
  reader.onload = (e)=>{
    try{
      const state = JSON.parse(e.target.result);
      if(!state.version) throw new Error('Arquivo JSON inválido');
      applyMixState(state);
      showSaveToast(`📂 Mix carregado: ${file.name}`);
      console.log('[DJ MID] Mix carregado:', file.name, state);
    } catch(err){
      alert('Erro ao carregar mix:\n'+err.message);
      console.error('[DJ MID] loadMix erro:', err);
    }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
window.addEventListener('load',()=>{
  initAudio();
  buildChannelUI();
  buildEQUI();
  initDragDrop();
  initSeekBar();
  initBPM();
  updateFX();
  drawRoll(0);
  drawKeyboard([]);
  
  // Dentro do window.addEventListener('load', () => { ... })

const sf2Input = document.getElementById('sf2Input');
if (sf2Input) {
  sf2Input.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      loadSF2File(e.target.files[0]);
    }
  });
}

// Também recomendo adicionar o suporte a Drag & Drop para o SF2
const sf2Drop = document.getElementById('sf2Drop');
if (sf2Drop) {
  sf2Drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    sf2Drop.classList.add('drag');
  });
  sf2Drop.addEventListener('dragleave', () => sf2Drop.classList.remove('drag'));
  sf2Drop.addEventListener('drop', (e) => {
    e.preventDefault();
    sf2Drop.classList.remove('drag');
    const f = e.dataTransfer.files[0];
    if (f) loadSF2File(f);
  });
}

  // Transport buttons
  document.getElementById('playBtn').addEventListener('click',()=>{ doPlay(isPaused?getCurrentPosition():0); });
  document.getElementById('pauseBtn').addEventListener('click',doPause);
  document.getElementById('stopBtn').addEventListener('click',()=>doStop());
  document.getElementById('loopBtn').addEventListener('click',function(){
    loopEnabled=!loopEnabled;
    this.classList.toggle('loop-on',loopEnabled);
  });

  // Roll controls
  document.getElementById('rollZoom').addEventListener('change',()=>drawRoll(getCurrentPosition()));
  document.getElementById('rollChannel').addEventListener('change',()=>drawRoll(getCurrentPosition()));

  // Resize
  window.addEventListener('resize',()=>{
    drawRoll(getCurrentPosition());
    drawKeyboard([]);
  });
  
  // Localize onde estão os outros listeners de clique e adicione este:
document.getElementById('sf2Drop').addEventListener('click', () => {
    document.getElementById('sf2Input').click();
});

// E para processar o arquivo após a seleção:
document.getElementById('sf2Input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        // Aqui você deve chamar a sua função de carregar SF2 (ex: loadSF2(file))
        console.log("SF2 selecionado:", file.name);
        // Exemplo de implementação necessária:
        // loadSF2File(file); 
    }
});

  // Botões Salvar / Carregar mix
  document.getElementById('saveMixBtn')?.addEventListener('click', saveMix);
  document.getElementById('loadMixBtn')?.addEventListener('click', ()=>{
    document.getElementById('mixFileInput').click();
  });
  document.getElementById('mixFileInput')?.addEventListener('change', (e)=>{
    if(e.target.files[0]) loadMix(e.target.files[0]);
    e.target.value=''; // permite recarregar o mesmo arquivo
  });

  updateTransportUI();
  console.log('[DJ MID] Iniciado. Arraste um arquivo .mid para começar!');
});

function changeChannelProgram(chIndex, prog) {
  const newProg = parseInt(prog);
  channels[chIndex].program = newProg;
  
  // Atualiza o nome exibido no topo do canal (máximo 8 caracteres)
  const nameEl = document.getElementById(`ch-name-${chIndex}`);
  if (nameEl) {
    const instrumentName = chIndex === 9 ? 'DRUMS' : GM_NAMES[newProg] || 'PROG';
    channels[chIndex].name = instrumentName;
    nameEl.textContent = instrumentName.slice(0, 8);
  }
  
  console.log(`[DJ MID] Canal ${chIndex + 1} alterado para: ${GM_NAMES[newProg]}`);
}