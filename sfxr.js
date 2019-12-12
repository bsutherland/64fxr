SFXR = function(opts) {
  console.log("player opts", opts);
  opts = opts || {};
  this.quality = opts.quality || jsSID.quality.good;
  this.clock = opts.clock || jsSID.chip.clock.PAL;
  this.model = opts.model || jsSID.chip.model.MOS6581;
  // state signaled to audiomanager
  this.finished = false;
  this.ready = false;

  var that = this;

  this.synth = jsSID.synthFactory({
    quality: this.quality,
    clock: this.clock,
    model: this.model,
    sampleRate: pico.samplerate
  });

  this.siddmp = null;
  this.samplesPerFrame = this.synth.mix_freq / 50; // PAL
  this.nextFrameNum = 0;
  this.samplesToNextFrame = 0;

  this.ad = 0;
  this.sr = 0;
  this.pw = 0;
  this.ctrl = 0;

  this.A = document.getElementById('A');
  this.D = document.getElementById('D');
  this.S = document.getElementById('S');
  this.R = document.getElementById('R');
  this.PW = document.getElementById('PW');

  this.WAVEFORMS = [
    'noi', 'pul', 'saw', 'tri'
  ].map(id => document.getElementById(id));

  this.OFF = document.getElementById('OFF');
  this.LP = document.getElementById('LP');
  this.HP = document.getElementById('HP');
  this.FC = document.getElementById('FC');
  this.Q = document.getElementById('Q');

  this.palette = new Map(['light-blue', 'blue'].map(c => [
    c, getComputedStyle(document.documentElement).getPropertyValue('--'+c)
  ]));
  this.osc = document.getElementById('oscilloscope');
  this.gfx = this.osc.getContext('2d');
  this.gfx.strokeStyle = this.palette.get('light-blue');

  this.initSID();
};

// Pico.js hook for processing
SFXR.prototype.process = function(L, R) {
  if (this.ready) {
    var written = this.generateIntoBuffer(L.length, L, 0);
    if (written === 0) {
      this.ready = false;
      this.finished = true;
      this.stop();
    } else {
      // copy left channel to right
      for (var i = 0; i < L.length; i++) {
        R[i] = L[i];
      }
      // draw oscilloscope
      this.gfx.clearRect(0, 0, this.osc.width, this.osc.height);
      this.gfx.beginPath();
      const half = this.osc.height/2;
      this.gfx.moveTo(0, half);
      for (var i = 0; i < L.length; i++) {
        this.gfx.lineTo(i, half+3*half*R[i]);
      }
      this.gfx.stroke();
    }
  } else {
    this.stop();
  }
};

SFXR.prototype.initSID = function() {
  this.attack();
  this.decay();
  this.sustain();
  this.release();
  this.pulsewidth();
  this.waveforms();
  this.filtertype();
  this.filtercutoff();
  this.filterres();
}

SFXR.prototype.play = function() {
  if (!this.ready) {
    this.ready = true;
    pico.play(this);
  }
};

SFXR.prototype.stop = function() {
  pico.pause();
  this.ready = false;
};

SFXR.prototype.keyup = function(key) {
  if (this.lastPlayedKey == key) {
    this.clearGate();
    this.lastPlayedKey = null;
  }
}

SFXR.prototype.keydown = function(key) {
  const KEYMAP = {
    'z': 'c-0',
    's': 'c#0',
    'x': 'd-0',
    'd': 'd#0',
    'c': 'e-0',
    'v': 'f-0',
    'g': 'f#0',
    'b': 'g-0',
    'h': 'g#0',
    'n': 'a-0',
    'j': 'a#0',
    'm': 'b-0',
    'q': 'c-1',
    '2': 'c#1',
    'w': 'd-1',
    '3': 'd#1',
    'e': 'e-1',
    'r': 'f-1',
    '5': 'f#1',
    't': 'g-1',
    '6': 'g#1',
    'y': 'a-1',
    '7': 'a#1',
  }
  const note = KEYMAP[key.toLowerCase()];
  if (note && this.lastPlayedKey != key) {
    this.lastPlayedKey = key;
    this.trigger(note);
  }
}

SFXR.prototype.generateIntoBuffer = function(samples, data, dataOffset) {
  if (!this.ready) return 0;
  const generated = this.synth.generateIntoBuffer(samples, data, dataOffset);
  return generated;
};

SFXR.prototype.attack = function() {
  const x = this.A.value;
  this.ad = (this.ad & 0x0f) | ((x&0xf) << 4);
  this.synth.poke(0x05, this.ad);
}

SFXR.prototype.decay = function() {
  const x = this.D.value;
  this.ad = (this.ad & 0xf0) | (x&0xf);
  this.synth.poke(0x05, this.ad);
}

SFXR.prototype.sustain = function() {
  const x = this.S.value;
  this.sr = (this.sr & 0x0f) | ((x&0xf) << 4);
  this.synth.poke(0x06, this.sr);
}

SFXR.prototype.release = function() {
  const x = this.R.value;
  this.sr = (this.sr & 0xf0) | (x&0xf);
  this.synth.poke(0x06, this.sr);
}

SFXR.prototype.pulsewidth = function() {
  const x = this.PW.value;
  this.synth.poke(0x02, x & 0xf);
  this.synth.poke(0x03, x >> 8);
}

SFXR.prototype.filtertype = function() {
  let x = 0;
  if (this.HP.checked) x |= 0x4;
  if (this.LP.checked) x |= 0x1;
  this.filterres();
  this.synth.poke(0x18, (x<<4) | 0xf); // always full volume
}

SFXR.prototype.filterres = function() {
  const x = this.Q.value << 4;
  const y = this.OFF.checked ? 0 : 1;
  this.synth.poke(0x17, x | y); // make sure filter is enabled on ch1
}

SFXR.prototype.filtercutoff = function() {
  const x = this.FC.value;
  this.synth.poke(0x15, x & 0x7);
  this.synth.poke(0x16, (x >> 3) & 0xff);
}

SFXR.prototype.waveforms = function() {
  let x = 0;
  this.WAVEFORMS.forEach((cb) => {
    x <<= 1;
    if (cb.checked) x += 1;
  });
  this.ctrl = (this.ctrl & 0xf) | (x<<4);
  this.synth.poke(0x04, this.ctrl);
}

SFXR.prototype.clearGate = function() {
  this.ctrl &= ~1;
  this.synth.poke(0x04, this.ctrl);
}

SFXR.prototype.trigger = function(note) {
  console.log(note);
  const NOTEMAP = {
    'c-0': 0x4540,
    'c#0': 0x495e,
    'd-0': 0x4dbb,
    'd#0': 0x525a,
    'e-0': 0x573f,
    'f-0': 0x5c6f,
    'f#0': 0x61ef,
    'g-0': 0x67c2,
    'g#0': 0x6ded,
    'a-0': 0x7476,
    'a#0': 0x7b63,
    'b-0': 0x82b9,
    'c-1': 0x8a7f,
    'c#1': 0x92bc,
    'd-1': 0x9b75,
    'd#1': 0xa4b4,
    'e-1': 0xae7f,
    'f-1': 0xb8df,
    'f#1': 0xc3de,
    'g-1': 0xcf84,
    'g#1': 0xdbd9,
    'a-1': 0xe8ed,
    'a#1': 0xf6c6,
  };
  const reg16 = NOTEMAP[note] / 32;
  // because Chrome requires a click before sound can start.
  this.play();

  // Set frequency to C-3
  // http://sta.c64.org/cbm64sndfreq.html
  this.synth.poke(0x01, reg16 >> 8);
  this.synth.poke(0x00, reg16 & 0xff);

  this.ctrl |= 1;
  this.synth.poke(0x04, this.ctrl);
}
