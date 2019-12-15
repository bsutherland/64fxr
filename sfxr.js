SFXR = function(opts) {
  console.log("player opts", opts);
  opts = opts || {};
  this.quality = opts.quality || jsSID.quality.good;
  this.clock = opts.clock || jsSID.chip.clock.PAL;
  this.model = opts.model || jsSID.chip.model.MOS6581;
  // state signaled to audiomanager
  this.finished = false;
  this.ready = false;

  pico.setup({cellsize: 256});

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

  this.ad = [0, 0];
  this.sr = [0, 0];
  this.pw = [0, 0];
  this.ctrl = [0, 0];

  ['A', 'D', 'S', 'R', 'PW'].forEach(p => {
    this[p] = [0, 1].map(i => {
      const id = p + (i+1);
      return document.getElementById(id);
    });
  });
  this.WAVEFORMS = [
    ['noi1', 'pul1', 'saw1', 'tri1'],
    ['noi2', 'pul2', 'saw2', 'tri2'],
  ].map(ids => ids.map(id => document.getElementById(id)));
  this.ring = document.getElementById('ring');
  this.sync = document.getElementById('sync');

  this.OFF = document.getElementById('OFF');
  this.LP = document.getElementById('LP');
  this.BP = document.getElementById('BP');
  this.HP = document.getElementById('HP');
  this.FC = document.getElementById('FC');
  this.Q = document.getElementById('Q');

  this.palette = new Map(['light-blue', 'blue'].map(c => [
    c, getComputedStyle(document.documentElement).getPropertyValue('--'+c)
  ]));
  this.oscilloscope = document.getElementById('oscilloscope');
  this.gfx = this.oscilloscope.getContext('2d');
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
      this.gfx.clearRect(0, 0, this.oscilloscope.width, this.oscilloscope.height);
      this.gfx.beginPath();
      const half = this.oscilloscope.height/2;
      this.gfx.moveTo(0, half);
      for (var i = 0; i < L.length; i++) {
        this.gfx.lineTo(i, half+3*half*R[i]);
      }
      this.gfx.stroke();
      // console.log(R[0], R[1], R[2]);
    }
  } else {
    this.stop();
  }
};

SFXR.prototype.initSID = function() {
  for (var i = 0; i < 2; i++) {
    this.attack(i);
    this.decay(i);
    this.sustain(i);
    this.release(i);
    this.pulsewidth(i);
    this.waveforms(i);
    this.ctrlbits(i);
  }
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
    this.clearGate(1);
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
    this.trigger(1, note);
  }
}

SFXR.prototype.generateIntoBuffer = function(samples, data, dataOffset) {
  if (!this.ready) return 0;
  const generated = this.synth.generateIntoBuffer(samples, data, dataOffset);
  return generated;
};

SFXR.prototype.offset = function(osc) {
  return (osc)*7;
};

SFXR.prototype.attack = function(osc) {
  const x = this.A[osc].value;
  this.ad[osc] = (this.ad[osc] & 0x0f) | ((x&0xf) << 4);
  this.synth.poke(0x05 + this.offset(osc), this.ad[osc]);
}

SFXR.prototype.decay = function(osc) {
  const x = this.D[osc].value;
  this.ad[osc] = (this.ad[osc] & 0xf0) | (x&0xf);
  this.synth.poke(0x05 + this.offset(osc), this.ad[osc]);
}

SFXR.prototype.sustain = function(osc) {
  const x = this.S[osc].value;
  this.sr[osc] = (this.sr[osc] & 0x0f) | ((x&0xf) << 4);
  this.synth.poke(0x06 + this.offset(osc), this.sr[osc]);
}

SFXR.prototype.release = function(osc) {
  const x = this.R[osc].value;
  this.sr[osc] = (this.sr[osc] & 0xf0) | (x&0xf);
  this.synth.poke(0x06 + this.offset(osc), this.sr[osc]);
}

SFXR.prototype.pulsewidth = function(osc) {
  const x = this.PW[osc].value;
  this.synth.poke(0x02 + this.offset(osc), x & 0xf);
  this.synth.poke(0x03 + this.offset(osc), x >> 8);
}

SFXR.prototype.waveforms = function(osc) {
  let x = 0;
  this.WAVEFORMS[osc].forEach((cb) => {
    x <<= 1;
    if (cb.checked) x += 1;
  });
  this.ctrl[osc] = (this.ctrl[osc] & 0x0f) | (x<<4);
  this.synth.poke(0x04 + this.offset(osc), this.ctrl[osc]);
}

SFXR.prototype.ctrlbits = function(osc) {
  const x = (this.ring.checked ? 4 : 0) | (this.sync.checked ? 2 : 0);
  this.ctrl[osc] = (this.ctrl[osc] & 0xf9) | x;
  this.synth.poke(0x04 + this.offset(osc), this.ctrl[osc]);
}

SFXR.prototype.filtertype = function() {
  let x = 0;
  if (this.HP.checked) x |= 0x4;
  if (this.BP.checked) x |= 0x2;
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

SFXR.prototype.clearGate = function(osc) {
  this.ctrl[osc] &= ~1;
  this.synth.poke(0x04 + this.offset(osc), this.ctrl[osc]);
}

SFXR.prototype.trigger = function(osc, note) {
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
  this.synth.poke(0x01 + this.offset(osc), reg16 >> 8);
  this.synth.poke(0x00 + this.offset(osc), reg16 & 0xff);

  this.ctrl[osc] |= 1;
  this.synth.poke(0x04 + this.offset(osc), this.ctrl[osc]);
}
