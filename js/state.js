// ╔══════════════════════════════════════════════════════════════╗
// ║  DJ MID — Engine Principal                                   ║
// ╚══════════════════════════════════════════════════════════════╝

// ── AudioContext
let audioCtx = null;
function getCtx(){
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

// ── State
let midiData      = null;   // parsed MIDI file
let allEvents     = [];     // flat sorted event list {timeSec, type, ch, ...}
let allNotes      = [];     // {timeSec, durSec, pitch, vel, ch, prog}
let totalTimeSec  = 0;
let currentBPM    = 120;
let isPlaying     = false;
let isPaused      = false;
let loopEnabled   = false;
let playStartTime = 0;      // audioCtx.currentTime when playback began
let pauseOffset   = 0;      // seconds into song when paused
let schedCursor   = 0;
let schedTimer    = null;
let loopTimer     = null;
let rafId         = null;

const LOOKAHEAD   = 2.0;
const SCHED_MS    = 100;

// Channel state (1-indexed, 0=ch1..15=ch16)
const channels = Array.from({length:16}, (_,i)=>({
  num: i+1,
  name: i===9 ? 'DRUMS' : `CH${i+1}`,
  program: 0,
  volume: 100,
  pan: 64,
  mute: false,
  solo: false,
  expression: 127,
  reverbSend: 40,
  chorusSend: 20,
  pitchBend: 0,
  vuLevel: 0,
  vuDecay: 0
}));

// ── Audio Nodes
let masterGain, masterComp, masterLimiter;
let reverbNode, reverbGain, reverbConv;
let chorusNode, chorusGain;
let delayNode, delayFeedGain, delayGain;
let eqFilters = [];
let channelGains = [], channelPanners = [];
let activeNodes = []; // {pitch, ch, nodes[], stopTime}

// GM Program names (first 128)
const GM_NAMES = [
  'Acoustic Grand','Bright Acoustic','Electric Grand','Honky-Tonk','El. Piano 1','El. Piano 2','Harpsichord','Clavi',
  'Celesta','Glockenspiel','Music Box','Vibraphone','Marimba','Xylophone','Tubular Bells','Dulcimer',
  'Drawbar Organ','Percussive Organ','Rock Organ','Church Organ','Reed Organ','Accordion','Harmonica','Bandoneon',
  'Nylon Guitar','Steel Guitar','Jazz Guitar','Clean Guitar','Muted Guitar','Overdriven','Distortion','Harmonics',
  'Acoustic Bass','Finger Bass','Pick Bass','Fretless','Slap Bass 1','Slap Bass 2','Synth Bass 1','Synth Bass 2',
  'Violin','Viola','Cello','Contrabass','Tremolo Str','Pizzicato','Orchestral Hp','Timpani',
  'String Ens 1','String Ens 2','Synth Str 1','Synth Str 2','Choir Aahs','Voice Oohs','Synth Voice','Orchestra Hit',
  'Trumpet','Trombone','Tuba','Muted Trumpet','French Horn','Brass Section','Synth Brass 1','Synth Brass 2',
  'Soprano Sax','Alto Sax','Tenor Sax','Baritone Sax','Oboe','English Horn','Bassoon','Clarinet',
  'Piccolo','Flute','Recorder','Pan Flute','Blown Bottle','Shakuhachi','Whistle','Ocarina',
  'Square Lead','Sawtooth Lead','Calliope Lead','Chiff Lead','Charang Lead','Voice Lead','Fifths Lead','Bass+Lead',
  'New Age Pad','Warm Pad','Polysynth Pad','Choir Pad','Bowed Pad','Metallic Pad','Halo Pad','Sweep Pad',
  'Rain FX','Soundtrack FX','Crystal FX','Atmosphere FX','Brightness FX','Goblins FX','Echoes FX','Sci-fi FX',
  'Sitar','Banjo','Shamisen','Koto','Kalimba','Bagpipe','Fiddle','Shanai',
  'Tinkle Bell','Agogo','Steel Drums','Woodblock','Taiko Drum','Melodic Tom','Synth Drum','Reverse Cymbal',
  'Guitar Fret','Breath Noise','Seashore','Bird Tweet','Telephone','Helicopter','Applause','Gunshot'
];

// ── SoundFont SF2 State
let sf2Data    = null;   // { phdr, pbag, pgen, inst, ibag, igen, shdr, smplView, ab }
let sf2Buffers = {};     // cache lazy: `${bank}_${prog}_${key}` → {buffer, originalPitch, loopMode, loopStart, loopEnd, sr}
let sf2Loaded  = false;
let sf2Name    = '';