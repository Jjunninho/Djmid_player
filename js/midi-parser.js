// ═══════════════════════════════════════════════════════════════
// MIDI PARSER — SMF Type 0 & 1
// ═══════════════════════════════════════════════════════════════
function parseMIDIFile(buffer){
  const view = new DataView(buffer);
  let pos = 0;

  function readU32(){ const v=view.getUint32(pos,false); pos+=4; return v; }
  function readU16(){ const v=view.getUint16(pos,false); pos+=2; return v; }
  function readU8(){  const v=view.getUint8(pos); pos++; return v; }
  function readVLQ(){
    let val=0,b;
    do{ b=readU8(); val=(val<<7)|(b&0x7f); } while(b&0x80);
    return val;
  }
  function readStr(n){ let s=''; for(let i=0;i<n;i++) s+=String.fromCharCode(readU8()); return s; }

  // Header chunk
  if(readStr(4)!=='MThd') throw new Error('Not a MIDI file');
  const hLen = readU32(); // 6
  const fmt  = readU16();
  const nTrk = readU16();
  const div  = readU16(); // ticks per quarter note (or SMPTE)
  const ticksPerBeat = (div & 0x8000) ? null : div;

  const tracks = [];
  for(let t=0; t<nTrk; t++){
    if(pos >= buffer.byteLength) break;
    const tag = readStr(4);
    const tLen = readU32();
    if(tag !== 'MTrk'){ pos+=tLen; continue; }
    const end = pos + tLen;
    const events = [];
    let tick = 0;
    let lastStatus = 0;

    while(pos < end){
      const dt = readVLQ();
      tick += dt;
      let status = view.getUint8(pos);

      // Running status
      if(status < 0x80){ status = lastStatus; }
      else { lastStatus = status; pos++; }

      const type = status & 0xf0;
      const ch   = status & 0x0f;

      if(type === 0x80 || type === 0x90){
        const pitch = readU8();
        const vel   = readU8();
        events.push({tick, type: (type===0x90 && vel>0) ? 'noteon' : 'noteoff', ch, pitch, vel});
      } else if(type === 0xa0){
        const pitch=readU8(), pres=readU8();
        events.push({tick,type:'aftertouch',ch,pitch,pres});
      } else if(type === 0xb0){
        const cc=readU8(), val=readU8();
        events.push({tick,type:'cc',ch,cc,val});
      } else if(type === 0xc0){
        const prog=readU8();
        events.push({tick,type:'pc',ch,prog});
      } else if(type === 0xd0){
        const pres=readU8();
        events.push({tick,type:'chanpres',ch,pres});
      } else if(type === 0xe0){
        const lo=readU8(),hi=readU8();
        const bend = ((hi<<7)|lo) - 8192;
        events.push({tick,type:'pitchbend',ch,bend});
      } else if(status === 0xff){
        // Meta event
        const mtype = readU8();
        const mlen  = readVLQ();
        const mdata = [];
        for(let i=0;i<mlen;i++) mdata.push(readU8());
        if(mtype===0x51 && mlen===3){
          const uspb = (mdata[0]<<16)|(mdata[1]<<8)|mdata[2];
          events.push({tick,type:'tempo',uspb});
        } else if(mtype===0x2f){
          break; // end of track
        } else if(mtype===0x01||mtype===0x02||mtype===0x03||mtype===0x06){
          const text = mdata.map(c=>String.fromCharCode(c)).join('');
          events.push({tick,type:'meta',mtype,text});
        }
      } else if(status === 0xf0 || status === 0xfe){
        // SysEx
        while(pos<end && readU8()!==0xf7);
      } else {
        // Unknown — skip
      }
    }
    pos = end;
    tracks.push(events);
  }
  return {fmt, ticksPerBeat, tracks};
}

// Convert ticks → seconds using tempo map
function buildTempoMap(parsed){
  // Merge all tempo events from all tracks
  const tempoEvts = [];
  for(const tr of parsed.tracks){
    for(const e of tr){
      if(e.type==='tempo') tempoEvts.push({tick:e.tick, uspb:e.uspb});
    }
  }
  tempoEvts.sort((a,b)=>a.tick-b.tick);
  if(tempoEvts.length===0) tempoEvts.push({tick:0,uspb:500000}); // 120bpm
  if(tempoEvts[0].tick!==0) tempoEvts.unshift({tick:0,uspb:500000});

  // Build map: [{tick, time, uspb}]
  const map = [];
  let cumTime = 0;
  const tpb = parsed.ticksPerBeat || 480;
  for(let i=0;i<tempoEvts.length;i++){
    const prev = i>0 ? tempoEvts[i-1] : null;
    if(prev){
      const dtTicks = tempoEvts[i].tick - prev.tick;
      cumTime += dtTicks * prev.uspb / tpb / 1e6;
    }
    map.push({tick:tempoEvts[i].tick, time:cumTime, uspb:tempoEvts[i].uspb});
  }
  return map;
}

function tickToSec(tick, tempoMap, tpb){
  let seg = tempoMap[0];
  for(let i=1;i<tempoMap.length;i++){
    if(tempoMap[i].tick<=tick) seg=tempoMap[i];
    else break;
  }
  const dtTicks = tick - seg.tick;
  return seg.time + dtTicks * seg.uspb / tpb / 1e6;
}

function processMIDI(parsed){
  const tempoMap = buildTempoMap(parsed);
  const tpb = parsed.ticksPerBeat || 480;

  // Flatten all track events into absolute time
  const flat = [];
  for(const tr of parsed.tracks){
    for(const e of tr){
      flat.push({...e, timeSec: tickToSec(e.tick, tempoMap, tpb)});
    }
  }
  flat.sort((a,b)=>a.timeSec-b.timeSec || a.tick-b.tick);

  // Build notes from noteon/noteoff pairs
  const openNotes = {}; // key = `${ch}_${pitch}`
  const notes = [];
  for(const e of flat){
    if(e.type==='noteon'){
      const k = `${e.ch}_${e.pitch}`;
      openNotes[k] = {timeSec:e.timeSec, pitch:e.pitch, vel:e.vel, ch:e.ch};
    } else if(e.type==='noteoff'){
      const k = `${e.ch}_${e.pitch}`;
      if(openNotes[k]){
        const n = openNotes[k];
        notes.push({timeSec:n.timeSec, durSec:Math.max(0.04,e.timeSec-n.timeSec), pitch:n.pitch, vel:n.vel, ch:n.ch, prog:channels[n.ch].program});
        delete openNotes[k];
      }
    } else if(e.type==='pc'){
      channels[e.ch].program = e.prog;
      channels[e.ch].name = e.ch===9 ? 'DRUMS' : (GM_NAMES[e.prog]||`PROG${e.prog}`).slice(0,8);
      updateChannelUI(e.ch);
    } else if(e.type==='cc'){
      applyCC(e.ch, e.cc, e.val);
    }
  }
  notes.sort((a,b)=>a.timeSec-b.timeSec);

  // total duration
  const lastNote = notes.length ? notes[notes.length-1] : null;
  totalTimeSec = lastNote ? lastNote.timeSec + lastNote.durSec + 0.5 : 0;

  return {flat, notes};
}