// ═══════════════════════════════════════════════════════════════
// AUDIO ENGINE SETUP
// ═══════════════════════════════════════════════════════════════
function initAudio(){
  const ctx = getCtx();

  masterGain = ctx.createGain();
  masterGain.gain.value = 0.85;

  masterComp = ctx.createDynamicsCompressor();
  masterComp.threshold.value = -18;
  masterComp.knee.value      = 6;
  masterComp.ratio.value     = 4;
  masterComp.attack.value    = 0.003;
  masterComp.release.value   = 0.15;

  masterLimiter = ctx.createDynamicsCompressor();
  masterLimiter.threshold.value = -0.5;
  masterLimiter.knee.value      = 0;
  masterLimiter.ratio.value     = 20;
  masterLimiter.attack.value    = 0.001;
  masterLimiter.release.value   = 0.1;

  // EQ 5 bandas
  const eqFreqs = [80, 250, 1000, 4000, 12000];
  eqFilters = eqFreqs.map((f,i)=>{
    const flt = ctx.createBiquadFilter();
    flt.type = i===0 ? 'lowshelf' : i===4 ? 'highshelf' : 'peaking';
    flt.frequency.value = f;
    flt.gain.value = 0;
    flt.Q.value = 1.0;
    return flt;
  });
  for(let i=0;i<eqFilters.length-1;i++) eqFilters[i].connect(eqFilters[i+1]);
  eqFilters[eqFilters.length-1].connect(masterComp);
  masterComp.connect(masterLimiter);
  masterLimiter.connect(masterGain);
  masterGain.connect(ctx.destination);

  // Reverb via convolver
  reverbConv = ctx.createConvolver();
  reverbConv.buffer = makeImpulseResponse(ctx, 2.5, 0.5);
  reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.25;
  reverbConv.connect(reverbGain);
  reverbGain.connect(eqFilters[0]);

  // Chorus
  const chorDelay = ctx.createDelay(0.05);
  chorDelay.delayTime.value = 0.025;
  const chorLFO = ctx.createOscillator();
  chorLFO.type = 'sine';
  chorLFO.frequency.value = 0.5;
  const chorLFOGain = ctx.createGain();
  chorLFOGain.gain.value = 0.005;
  chorLFO.connect(chorLFOGain);
  chorLFOGain.connect(chorDelay.delayTime);
  chorLFO.start();
  chorusNode = chorDelay;
  chorusGain = ctx.createGain();
  chorusGain.gain.value = 0.2;
  chorDelay.connect(chorusGain);
  chorusGain.connect(eqFilters[0]);

  // Delay
  delayNode = ctx.createDelay(1.0);
  delayNode.delayTime.value = 0.25;
  delayFeedGain = ctx.createGain();
  delayFeedGain.gain.value = 0.3;
  delayGain = ctx.createGain();
  delayGain.gain.value = 0;
  delayNode.connect(delayFeedGain);
  delayFeedGain.connect(delayNode);
  delayNode.connect(delayGain);
  delayGain.connect(eqFilters[0]);

  // Gains e panners por canal
  channelGains = [];
  channelPanners = [];
  for(let i=0;i<16;i++){
    const g = ctx.createGain();
    g.gain.value = 1.0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createPanner();
    if(p.pan) p.pan.value = 0;
    g.connect(p);
    p.connect(eqFilters[0]);
    p.connect(reverbConv);
    p.connect(chorusNode);
    p.connect(delayNode);
    channelGains.push(g);
    channelPanners.push(p);
  }
}

function makeImpulseResponse(ctx, duration, decay){
  const sr = ctx.sampleRate;
  const len = sr * duration;
  const buf = ctx.createBuffer(2, len, sr);
  for(let c=0;c<2;c++){
    const d = buf.getChannelData(c);
    for(let i=0;i<len;i++){
      d[i] = (Math.random()*2-1) * Math.pow(1-i/len, decay*3);
    }
  }
  return buf;
}

function regenerateReverb(){
  const ctx = getCtx();
  const room = parseInt(document.getElementById('revRoom').value)/100;
  const damp = parseInt(document.getElementById('revDamp').value)/100;
  reverbConv.buffer = makeImpulseResponse(ctx, 0.5 + room*4, damp*2);
}

// ═══════════════════════════════════════════════════════════════
// SF2 SOUNDFONT PARSER
// ═══════════════════════════════════════════════════════════════

function parseSF2(ab){
  const view  = new DataView(ab);
  const bytes = new Uint8Array(ab);

  function str(off, len){
    let s='';
    for(let i=0;i<len;i++){
      const c=bytes[off+i];
      if(c===0) break;
      s+=String.fromCharCode(c);
    }
    return s;
  }

  if(str(0,4)!=='RIFF') throw new Error('Nao e um arquivo RIFF');
  if(str(8,4)!=='sfbk') throw new Error('Nao e um arquivo SF2');

  // Navegacao de chunks RIFF
  const chunks = {};
  let pos = 12;
  const fileEnd = view.getUint32(4, true) + 8;

  while(pos < fileEnd - 8){
    const id   = str(pos, 4);
    const size = view.getUint32(pos+4, true);
    const data = pos + 8;

    if(id === 'LIST'){
      let sub = data + 4;
      const subEnd = data + size;
      while(sub < subEnd - 8){
        const sid   = str(sub, 4);
        const ssize = view.getUint32(sub+4, true);
        chunks[sid] = { offset: sub+8, size: ssize };
        sub += 8 + ssize + (ssize%2);
      }
    }
    pos = data + size + (size%2);
  }

  const required = ['phdr','pbag','pgen','inst','ibag','igen','shdr','smpl'];
  for(const r of required){
    if(!chunks[r]) throw new Error("SF2: chunk '" + r + "' nao encontrado");
  }

  function phdrParse(){
    const {offset,size} = chunks.phdr;
    const n = Math.floor(size/38), out=[];
    for(let i=0;i<n;i++){
      const o=offset+i*38;
      out.push({ name:str(o,20), prog:view.getUint16(o+20,true), bank:view.getUint16(o+22,true), bagIdx:view.getUint16(o+24,true) });
    }
    return out;
  }
  function pbagParse(){
    const {offset,size} = chunks.pbag;
    const n=Math.floor(size/4), out=[];
    for(let i=0;i<n;i++){ const o=offset+i*4; out.push({genIdx:view.getUint16(o,true),modIdx:view.getUint16(o+2,true)}); }
    return out;
  }
  function pgenParse(){
    const {offset,size} = chunks.pgen;
    const n=Math.floor(size/4), out=[];
    for(let i=0;i<n;i++){ const o=offset+i*4; out.push({oper:view.getUint16(o,true),amount:view.getUint16(o+2,true)}); }
    return out;
  }
  function instParse(){
    const {offset,size} = chunks.inst;
    const n=Math.floor(size/22), out=[];
    for(let i=0;i<n;i++){ const o=offset+i*22; out.push({name:str(o,20),bagIdx:view.getUint16(o+20,true)}); }
    return out;
  }
  function ibagParse(){
    const {offset,size} = chunks.ibag;
    const n=Math.floor(size/4), out=[];
    for(let i=0;i<n;i++){ const o=offset+i*4; out.push({genIdx:view.getUint16(o,true),modIdx:view.getUint16(o+2,true)}); }
    return out;
  }
  function igenParse(){
    const {offset,size} = chunks.igen;
    const n=Math.floor(size/4), out=[];
    for(let i=0;i<n;i++){ const o=offset+i*4; out.push({oper:view.getUint16(o,true),amount:view.getUint16(o+2,true),iamt:view.getInt16(o+2,true)}); }
    return out;
  }
  function shdrParse(){
    const {offset,size} = chunks.shdr;
    const n=Math.floor(size/46), out=[];
    for(let i=0;i<n;i++){
      const o=offset+i*46;
      out.push({
        name:str(o,20),
        start:view.getUint32(o+20,true), end:view.getUint32(o+24,true),
        startLoop:view.getUint32(o+28,true), endLoop:view.getUint32(o+32,true),
        sampleRate:view.getUint32(o+36,true),
        originalPitch:view.getUint8(o+40), pitchCorrection:view.getInt8(o+41),
        sampleType:view.getUint16(o+44,true),
      });
    }
    return out;
  }

  // smpl: vista Int16 com fallback de alinhamento
  const smplOff = chunks.smpl.offset;
  const smplSize= chunks.smpl.size;
  let smplView;
  try {
    smplView = new Int16Array(ab, smplOff, Math.floor(smplSize/2));
  } catch(e){
    const copy = ab.slice(smplOff, smplOff+smplSize);
    smplView = new Int16Array(copy);
  }

  return {
    phdr:phdrParse(), pbag:pbagParse(), pgen:pgenParse(),
    inst:instParse(), ibag:ibagParse(), igen:igenParse(),
    shdr:shdrParse(), smplView
  };
}

// Busca/cria AudioBuffer para (bank, prog, key, vel) — cache lazy
function getSF2Sample(audioCtx, bank, prog, key, vel){
  if(!sf2Data) return null;
  const cacheKey = bank+'_'+prog+'_'+key;
  if(sf2Buffers[cacheKey]) return sf2Buffers[cacheKey];

  const {phdr,pbag,pgen,inst,ibag,igen,shdr,smplView} = sf2Data;

  // 1. Preset
  let pi=-1;
  for(let i=0;i<phdr.length-1;i++){
    if(phdr[i].prog===prog && phdr[i].bank===bank){ pi=i; break; }
  }
  if(pi<0){ for(let i=0;i<phdr.length-1;i++){ if(phdr[i].prog===prog){ pi=i; break; } } }
  if(pi<0) return null;

  // 2. Instrumento via preset generators
  let instIdx=-1;
  const bS=phdr[pi].bagIdx, bE=phdr[pi+1].bagIdx;
  loop1: for(let b=bS;b<bE;b++){
    const gS=pbag[b].genIdx, gE=pbag[b+1]?pbag[b+1].genIdx:pgen.length;
    let keyOk=true,velOk=true,cand=-1;
    for(let g=gS;g<gE;g++){
      const {oper,amount}=pgen[g];
      if(oper===43){ const lo=amount&0xFF,hi=(amount>>8)&0xFF; if(key<lo||key>hi) keyOk=false; }
      if(oper===44){ const lo=amount&0xFF,hi=(amount>>8)&0xFF; if(vel<lo||vel>hi) velOk=false; }
      if(oper===41) cand=amount;
    }
    if(keyOk&&velOk&&cand>=0){ instIdx=cand; break loop1; }
    if(cand>=0&&instIdx<0) instIdx=cand;
  }
  if(instIdx<0||instIdx>=inst.length-1) return null;

  // 3. Sample via instrument generators
  let sampleIdx=-1, loopMode=0;
  const ibS=inst[instIdx].bagIdx, ibE=inst[instIdx+1]?inst[instIdx+1].bagIdx:ibag.length;
  loop2: for(let b=ibS;b<ibE;b++){
    const gS=ibag[b].genIdx, gE=ibag[b+1]?ibag[b+1].genIdx:igen.length;
    let keyOk=true,velOk=true,cand=-1,lm=0;
    for(let g=gS;g<gE;g++){
      const {oper,amount}=igen[g];
      if(oper===43){ const lo=amount&0xFF,hi=(amount>>8)&0xFF; if(key<lo||key>hi) keyOk=false; }
      if(oper===44){ const lo=amount&0xFF,hi=(amount>>8)&0xFF; if(vel<lo||vel>hi) velOk=false; }
      if(oper===53) cand=amount;
      if(oper===54) lm=amount;
    }
    if(keyOk&&velOk&&cand>=0){ sampleIdx=cand; loopMode=lm; break loop2; }
    if(cand>=0&&sampleIdx<0){ sampleIdx=cand; loopMode=lm; }
  }
  if(sampleIdx<0||sampleIdx>=shdr.length) return null;

  // 4. Cria AudioBuffer
  const s=shdr[sampleIdx];
  if(s.sampleType===0||s.sampleType>=32768) return null;
  const sLen=s.end-s.start;
  if(sLen<=0||sLen>s.sampleRate*30) return null;

  const buf=audioCtx.createBuffer(1,sLen,s.sampleRate);
  const cd=buf.getChannelData(0);
  for(let i=0;i<sLen;i++) cd[i]=smplView[s.start+i]/32768;

  const result={
    buffer:buf,
    originalPitch:s.originalPitch+s.pitchCorrection/100,
    loopMode:loopMode&1,
    loopStart:Math.max(0,s.startLoop-s.start)/s.sampleRate,
    loopEnd:Math.max(0,s.endLoop-s.start)/s.sampleRate,
    sr:s.sampleRate,
  };
  sf2Buffers[cacheKey]=result;
  return result;
}

// ═══════════════════════════════════════════════════════════════
// SINTESE — toca uma nota
// Usa SF2 quando carregado; osciladores como fallback
// ═══════════════════════════════════════════════════════════════
const DRUM_CHANNEL = 9;

function waveForProg(prog){
  if(prog<8)  return {type:'triangle',flt:4000,vol:0.38};
  if(prog<16) return {type:'triangle',flt:3500,vol:0.35};
  if(prog<24) return {type:'sine',    flt:2500,vol:0.42};
  if(prog<32) return {type:'triangle',flt:3000,vol:0.38};
  if(prog<40) return {type:'sawtooth',flt:1200,vol:0.35};
  if(prog<48) return {type:'sawtooth',flt:3500,vol:0.30};
  if(prog<56) return {type:'sawtooth',flt:4000,vol:0.28};
  if(prog<64) return {type:'sawtooth',flt:3500,vol:0.30};
  if(prog<72) return {type:'triangle',flt:4000,vol:0.30};
  if(prog<80) return {type:'sine',    flt:4500,vol:0.28};
  if(prog<88) return {type:'square',  flt:2500,vol:0.22};
  if(prog<96) return {type:'triangle',flt:2000,vol:0.20};
  return        {type:'triangle',     flt:3000,vol:0.25};
}
function m2f(note){ return 440*Math.pow(2,(note-69)/12); }
function makeNoise(ctx,dur){
  const buf=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*dur),ctx.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
  const src=ctx.createBufferSource(); src.buffer=buf; return src;
}

function playNote(note){
  const ch      = note.ch;
  const chState = channels[ch];
  if(chState.mute) return;
  const anySolo = channels.some(c=>c.solo);
  if(anySolo && !chState.solo) return;

  const ctx  = getCtx();
  const t0   = note._startTime;
  if(t0 < ctx.currentTime - 0.05) return;

  const vel    = (note.vel||80)/127;
  const vol    = (chState.volume/127)*(chState.expression/127)*vel;
  const dur    = note.durSec;
  const prog   = chState.program;
  const isDrum = (ch===DRUM_CHANNEL);

  const gain = ctx.createGain();
  gain.connect(channelGains[ch]);
  const nodes = [gain];

  // ── Tenta SF2
  if(sf2Loaded){
    const bank  = isDrum ? 128 : 0;
    const sfProg= isDrum ? 0 : prog;
    const sf = getSF2Sample(ctx, bank, sfProg, note.pitch, note.vel||80);

    if(sf){
      const src = ctx.createBufferSource();
      src.buffer = sf.buffer;
      src.loop   = sf.loopMode===1;
      if(src.loop){
        src.loopStart = sf.loopStart;
        src.loopEnd   = sf.loopEnd > sf.loopStart ? sf.loopEnd : sf.buffer.duration;
      }
      const cents = (note.pitch - sf.originalPitch)*100 + chState.pitchBend*200;
      src.detune.value = cents;
      src.connect(gain);

      const atkEnd = t0 + 0.008;
      const relEnd = t0 + Math.max(dur, 0.05);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol, atkEnd);
      if(src.loop){
        gain.gain.setValueAtTime(vol, relEnd - 0.04);
        gain.gain.linearRampToValueAtTime(0, relEnd + 0.04);
        src.start(t0); src.stop(relEnd + 0.06);
      } else {
        const ratio = Math.pow(2, cents/1200);
        const natEnd = t0 + (ratio > 0 ? sf.buffer.duration/ratio : sf.buffer.duration);
        const stopAt = Math.min(natEnd, relEnd + 0.1);
        gain.gain.setValueAtTime(vol, stopAt - 0.03);
        gain.gain.linearRampToValueAtTime(0, stopAt);
        src.start(t0); src.stop(stopAt);
      }
      nodes.push(src);
      channels[ch].vuLevel = Math.min(1, Math.max(chState.vuLevel, vol));
      activeNodes.push({nodes, stopTime: t0+dur+0.2});
      return;
    }
  }

  // ── Fallback: osciladores
  if(isDrum) _playDrum(note,t0,vol,gain,nodes,ctx);
  else        _playTonal(note,t0,vol,dur,prog,gain,nodes,ctx,chState);

  channels[ch].vuLevel = Math.min(1, Math.max(chState.vuLevel, vol));
  activeNodes.push({nodes, stopTime: t0+dur+0.1});
}

function _playDrum(note,t0,vol,gain,nodes,ctx){
  const p=note.pitch;
  if(p===35||p===36){
    const osc=ctx.createOscillator(); osc.type='sine'; osc.connect(gain);
    osc.frequency.setValueAtTime(180,t0); osc.frequency.exponentialRampToValueAtTime(35,t0+0.14);
    gain.gain.setValueAtTime(vol,t0); gain.gain.exponentialRampToValueAtTime(0.001,t0+0.22);
    osc.start(t0); osc.stop(t0+0.25); nodes.push(osc);
  } else if(p===38||p===40){
    const ns=makeNoise(ctx,0.22), f=ctx.createBiquadFilter();
    f.type='bandpass'; f.frequency.value=3000; f.Q.value=0.7;
    ns.connect(f); f.connect(gain);
    gain.gain.setValueAtTime(0.85*vol,t0); gain.gain.exponentialRampToValueAtTime(0.001,t0+0.18);
    ns.start(t0); ns.stop(t0+0.22); nodes.push(ns,f);
  } else if(p===39){
    const ns=makeNoise(ctx,0.15), f=ctx.createBiquadFilter();
    f.type='bandpass'; f.frequency.value=1800; f.Q.value=1.2;
    ns.connect(f); f.connect(gain);
    gain.gain.setValueAtTime(0.65*vol,t0); gain.gain.exponentialRampToValueAtTime(0.001,t0+0.12);
    ns.start(t0); ns.stop(t0+0.14); nodes.push(ns,f);
  } else if([41,43,45,47,48,50].includes(p)){
    const osc=ctx.createOscillator(); osc.type='sine'; osc.connect(gain);
    const bf=80+(p-41)*12;
    osc.frequency.setValueAtTime(bf,t0); osc.frequency.exponentialRampToValueAtTime(bf*0.4,t0+0.18);
    gain.gain.setValueAtTime(0.75*vol,t0); gain.gain.exponentialRampToValueAtTime(0.001,t0+0.22);
    osc.start(t0); osc.stop(t0+0.25); nodes.push(osc);
  } else if(p===42||p===44){
    const ns=makeNoise(ctx,0.07), f=ctx.createBiquadFilter();
    f.type='highpass'; f.frequency.value=8000;
    ns.connect(f); f.connect(gain);
    gain.gain.setValueAtTime(0.4*vol,t0); gain.gain.exponentialRampToValueAtTime(0.001,t0+0.05);
    ns.start(t0); ns.stop(t0+0.07); nodes.push(ns,f);
  } else if(p===46){
    const ns=makeNoise(ctx,0.22), f=ctx.createBiquadFilter();
    f.type='highpass'; f.frequency.value=7000;
    ns.connect(f); f.connect(gain);
    gain.gain.setValueAtTime(0.45*vol,t0); gain.gain.exponentialRampToValueAtTime(0.001,t0+0.18);
    ns.start(t0); ns.stop(t0+0.22); nodes.push(ns,f);
  } else if([49,51,52,55,57,59].includes(p)){
    const ns=makeNoise(ctx,0.65), f=ctx.createBiquadFilter();
    f.type='highpass'; f.frequency.value=6000;
    const dec=[49,52,57].includes(p)?0.6:0.3;
    ns.connect(f); f.connect(gain);
    gain.gain.setValueAtTime(0.38*vol,t0); gain.gain.exponentialRampToValueAtTime(0.001,t0+dec);
    ns.start(t0); ns.stop(t0+dec+0.05); nodes.push(ns,f);
  } else {
    const ns=makeNoise(ctx,0.15), f=ctx.createBiquadFilter();
    f.type='bandpass'; f.frequency.value=2000; f.Q.value=1;
    ns.connect(f); f.connect(gain);
    gain.gain.setValueAtTime(0.45*vol,t0); gain.gain.exponentialRampToValueAtTime(0.001,t0+0.1);
    ns.start(t0); ns.stop(t0+0.12); nodes.push(ns,f);
  }
}

function _playTonal(note,t0,vol,dur,prog,gain,nodes,ctx,chState){
  const tw=waveForProg(prog);
  const osc=ctx.createOscillator();
  const flt=ctx.createBiquadFilter();
  flt.type='lowpass'; flt.Q.value=1.2; flt.frequency.value=tw.flt;
  osc.type=tw.type;
  osc.frequency.value=m2f(note.pitch);
  osc.detune.value=(Math.random()-0.5)*8+chState.pitchBend*200;
  osc.connect(flt); flt.connect(gain);
  const v=tw.vol*vol;
  const atkEnd=t0+0.015, susEnd=t0+Math.min(0.08,dur*0.3), relEnd=t0+dur;
  gain.gain.setValueAtTime(0,t0);
  gain.gain.linearRampToValueAtTime(v,atkEnd);
  gain.gain.linearRampToValueAtTime(v*0.8,susEnd);
  gain.gain.linearRampToValueAtTime(0,relEnd);
  osc.start(t0); osc.stop(relEnd+0.02);
  nodes.push(osc,flt);
}
