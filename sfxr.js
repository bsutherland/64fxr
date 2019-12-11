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
  this.WAVEFORMS = [
    'noi', 'pul', 'saw', 'tri'
  ].map(id => document.getElementById(id));
  this.PW = document.getElementById('PW');

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
  // console.log('process');
  if (this.ready) {
    var written = this.generateIntoBuffer(L.length, L, 0);
    // console.log(written, 'bytes written')
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
  this.synth.poke(0x18, 0xf); // set full volume
  this.attack();
  this.decay();
  this.waveforms();
  this.pulsewidth();
}

SFXR.prototype.play = function() {
  this.ready = true;
  pico.play(this);
};

SFXR.prototype.stop = function() {
  pico.pause();
  this.ready = false;
};

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
  }
  const note = KEYMAP[key.toLowerCase()];
  this.trigger(note);
}

SFXR.prototype.generateIntoBuffer = function(samples, data, dataOffset) {
  if (!this.ready) return 0;
  const generated = this.synth.generateIntoBuffer(samples, data, dataOffset);
  // console.log(samples, generated, dataOffset);
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

SFXR.prototype.waveforms = function() {
  let x = 0;
  this.WAVEFORMS.forEach((cb) => {
    x <<= 1;
    if (cb.checked) x += 1;
  });
  this.ctrl = (this.ctrl & 0xf) | (x<<4);
  this.synth.poke(0x04, this.ctrl);
}

SFXR.prototype.pulsewidth = function() {
  const x = this.PW.value;
  this.synth.poke(0x02, x & 0xf);
  this.synth.poke(0x03, x >> 8);
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
  };
  const reg16 = NOTEMAP[note] / 16;
  // because Chrome requires a click before sound can start.
  this.play();

  // Set frequency to C-3
  // http://sta.c64.org/cbm64sndfreq.html
  this.synth.poke(0x01, reg16 >> 8);
  this.synth.poke(0x00, reg16 & 0xff);

  this.ctrl &= ~1;
  this.synth.poke(0x04, this.ctrl);
  this.ctrl |= 1;
  this.synth.poke(0x04, this.ctrl);
}
