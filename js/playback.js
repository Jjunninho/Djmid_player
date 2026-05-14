// ═══════════════════════════════════════════════════════════════
// PLAYBACK CONTROL
// ═══════════════════════════════════════════════════════════════
function schedulerTick(){
  if(!isPlaying) return;
  const ctx      = getCtx();
  const now      = ctx.currentTime;
  const deadline = now + LOOKAHEAD;
  const offset   = pauseOffset;

  while(schedCursor < allNotes.length){
    const n = allNotes[schedCursor];
    const t0 = playStartTime + (n.timeSec - offset);
    if(t0 > deadline) break;
    n._startTime = t0;
    if(t0 >= now - 0.05){
      playNote(n);
      addEventLog(n);
    }
    schedCursor++;
  }

  // Cleanup dead nodes
  activeNodes = activeNodes.filter(({nodes,stopTime})=>{
    if(ctx.currentTime > stopTime){
      nodes.forEach(n=>{ try{n.stop&&n.stop();}catch(e){} try{n.disconnect();}catch(e){} });
      return false;
    }
    return true;
  });

  // Finished?
  if(schedCursor >= allNotes.length){
    const endTime = playStartTime + (totalTimeSec - offset);
    const remaining = (endTime - ctx.currentTime)*1000 + 200;
    clearInterval(schedTimer);
    schedTimer = null;
    loopTimer = setTimeout(()=>{
      if(isPlaying){
        if(loopEnabled){ doPlay(0); }
        else { doStop(); }
      }
    }, Math.max(200, remaining));
  }
}

function doPlay(fromSec){
  if(!allNotes.length){ alert('Carregue um arquivo MIDI primeiro!'); return; }
  const ctx = getCtx();
  if(ctx.state==='suspended') ctx.resume();

  // Stop any existing playback
  doStop(true);

  pauseOffset  = fromSec || 0;
  isPlaying    = true;
  isPaused     = false;
  playStartTime= ctx.currentTime + 0.08;

  // Find cursor at pauseOffset
  schedCursor = allNotes.findIndex(n=>n.timeSec >= pauseOffset);
  if(schedCursor<0) schedCursor=allNotes.length;

  schedulerTick();
  schedTimer = setInterval(schedulerTick, SCHED_MS);

  updateTransportUI();
  animatePlayhead();
}

function doPause(){
  if(!isPlaying) return;
  if(isPaused){
    // Resume
    doPlay(getCurrentPosition());
    return;
  }
  isPaused = true;
  isPlaying = false;
  clearInterval(schedTimer);
  clearTimeout(loopTimer);
  schedTimer=null;
  // Kill active nodes
  killActiveNodes();
  updateTransportUI();
  cancelAnimationFrame(rafId);
}

function doStop(silent){
  clearInterval(schedTimer);
  clearTimeout(loopTimer);
  schedTimer=null; loopTimer=null;
  isPlaying=false; isPaused=false;
  killActiveNodes();
  schedCursor=0;
  if(!silent){
    updateTransportUI();
    cancelAnimationFrame(rafId);
    updateSeekBar(0);
  }
}

function killActiveNodes(){
  activeNodes.forEach(({nodes})=>{
    nodes.forEach(n=>{ try{n.stop&&n.stop();}catch(e){} try{n.disconnect();}catch(e){} });
  });
  activeNodes=[];
}

function getCurrentPosition(){
  if(!isPlaying && !isPaused) return 0;
  const ctx = getCtx();
  return pauseOffset + (ctx.currentTime - playStartTime);
}

function seekTo(sec){
  const wasPlaying = isPlaying || isPaused;
  doStop(true);
  if(wasPlaying) doPlay(Math.max(0,Math.min(sec, totalTimeSec)));
  else { pauseOffset=sec; updateSeekBar(sec); }
}

// ═══════════════════════════════════════════════════════════════
// MIDI CC HANDLING
// ═══════════════════════════════════════════════════════════════
function applyCC(ch, cc, val){
  const state = channels[ch];
  if(cc===7)  { state.volume=val; updateChannelGain(ch); }
  if(cc===10) { state.pan=val; updateChannelPan(ch); }
  if(cc===11) { state.expression=val; }
  if(cc===64) { /* sustain pedal */ }
  if(cc===91) { state.reverbSend=val; }
  if(cc===93) { state.chorusSend=val; }
}

function updateChannelGain(ch){
  if(!channelGains[ch]) return;
  const ctx = getCtx();
  channelGains[ch].gain.setTargetAtTime(channels[ch].volume/127, ctx.currentTime, 0.01);
}

function updateChannelPan(ch){
  if(!channelPanners[ch]) return;
  const pan = (channels[ch].pan-64)/64;
  if(channelPanners[ch].pan) channelPanners[ch].pan.value=pan;
}