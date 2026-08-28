const STORE = "lc-citadel-song";
const BPM = 76;
const BEAT = 60 / BPM;

function loadMuted(): boolean {
  try {
    return localStorage.getItem(STORE) === "off";
  } catch {
    return false;
  }
}

function saveMuted(m: boolean) {
  try {
    localStorage.setItem(STORE, m ? "off" : "on");
  } catch {
    /* private mode */
  }
}

export type CitadelTheme = {
  unlock: () => void;
  start: () => void;
  stop: () => void;
  howl: () => void;
  setMuted: (m: boolean) => void;
  muted: () => boolean;
  playing: () => boolean;
  dispose: () => void;
};

export function createCitadelTheme(): CitadelTheme {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let music: GainNode | null = null;
  let sfx: GainNode | null = null;
  let muted = loadMuted();
  let running = false;
  let nextBeat = 0;
  let beat = 0;
  let timer = 0;
  let noise: AudioBuffer | null = null;

  function Ctor(): typeof AudioContext | null {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    return w.AudioContext || w.webkitAudioContext || null;
  }

  function ac(): AudioContext | null {
    if (ctx && ctx.state === "closed") ctx = null;
    if (ctx) return ctx;
    try {
      const C = Ctor();
      if (!C) return null;
      ctx = new C({ latencyHint: "playback" });
      master = ctx.createGain();
      music = ctx.createGain();
      sfx = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      music.gain.value = 0.7;
      sfx.gain.value = 1;
      music.connect(master);
      sfx.connect(master);
      master.connect(ctx.destination);
      const data = new Float32Array(ctx.sampleRate * 2);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise = ctx.createBuffer(1, data.length, ctx.sampleRate);
      noise.getChannelData(0).set(data);
      return ctx;
    } catch {
      ctx = null;
      return null;
    }
  }

  function env(g: GainNode, t0: number, attack: number, dur: number, peak: number) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  function osc(
    c: AudioContext,
    dest: AudioNode,
    type: OscillatorType,
    freq: number,
    t0: number,
    dur: number,
    peak: number,
    attack = 0.04,
    to?: number,
  ) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur * 0.9);
    env(g, t0, attack, dur, peak);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function pad(c: AudioContext, dest: AudioNode, freqs: number[], t0: number, dur: number, peak: number) {
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(420, t0);
    lp.frequency.linearRampToValueAtTime(980, t0 + dur * 0.45);
    lp.frequency.linearRampToValueAtTime(380, t0 + dur);
    lp.Q.value = 0.7;
    const g = c.createGain();
    env(g, t0, 0.35, dur, peak);
    lp.connect(g);
    g.connect(dest);
    for (const f of freqs) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, t0);
      const p = c.createStereoPanner();
      p.pan.value = f < 90 ? -0.15 : 0.2;
      o.connect(p);
      p.connect(lp);
      o.start(t0);
      o.stop(t0 + dur + 0.08);
    }
  }

  function choir(c: AudioContext, dest: AudioNode, freqs: number[], t0: number, dur: number, peak: number) {
    const g = c.createGain();
    env(g, t0, 0.28, dur, peak);
    g.connect(dest);
    freqs.forEach((f, i) => {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f * (i % 2 ? 1.003 : 0.997), t0);
      o.connect(g);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    });
  }

  function timp(c: AudioContext, dest: AudioNode, t0: number, freq: number, peak: number) {
    osc(c, dest, "sine", freq, t0, 0.55, peak, 0.01, freq * 0.72);
    if (!noise) return;
    const src = c.createBufferSource();
    src.buffer = noise;
    const bp = c.createBiquadFilter();
    bp.type = "lowpass";
    bp.frequency.value = 140;
    const g = c.createGain();
    env(g, t0, 0.005, 0.22, peak * 0.45);
    src.connect(bp);
    bp.connect(g);
    g.connect(dest);
    src.start(t0);
    src.stop(t0 + 0.24);
  }

  function sparkle(c: AudioContext, dest: AudioNode, freq: number, t0: number) {
    osc(c, dest, "sine", freq, t0, 0.22, 0.035, 0.008, freq * 2.1);
  }

  const CHORDS = [
    [73.42, 110, 146.83, 174.61],
    [58.27, 116.54, 174.61, 233.08],
    [87.31, 130.81, 174.61, 220],
    [65.41, 98, 130.81, 196],
  ];
  const MELODY = [
    293.66, 349.23, 392, 440, 392, 349.23, 293.66, 261.63, 233.08, 261.63, 293.66, 349.23, 329.63, 293.66, 220, 293.66,
    440, 392, 349.23, 293.66, 261.63, 293.66, 349.23, 392, 466.16, 440, 392, 349.23, 293.66, 220, 246.94, 293.66,
  ];

  function scheduleBar(c: AudioContext, barStart: number, bar: number) {
    if (!music) return;
    const chord = CHORDS[bar % CHORDS.length];
    const dur = BEAT * 4;
    pad(c, music, [chord[0] / 2, chord[0], chord[1]], barStart, dur + 0.12, 0.07);
    choir(c, music, [chord[1], chord[2], chord[3]], barStart, dur + 0.08, 0.045);
    timp(c, music, barStart, chord[0] / 2, bar % 4 === 0 ? 0.16 : 0.1);
    timp(c, music, barStart + BEAT * 2, chord[0] / 2, 0.07);
    for (let i = 0; i < 4; i++) {
      const t = barStart + i * BEAT;
      const note = MELODY[(bar * 4 + i) % MELODY.length];
      osc(c, music, "triangle", note, t, BEAT * 1.15, 0.09, 0.03, note * 0.99);
      osc(c, music, "sine", note * 2, t + 0.02, BEAT * 0.7, 0.028, 0.04);
      if (i % 2 === 1) sparkle(c, music, note * 3, t + BEAT * 0.5);
    }
    if (bar % 4 === 0) {
      osc(c, music, "sine", chord[0] / 4, barStart, dur, 0.05, 0.4);
    }
  }

  function tick() {
    if (!running || !ctx || muted) return;
    const now = ctx.currentTime;
    while (nextBeat < now + 0.9) {
      if (beat % 4 === 0) scheduleBar(ctx, nextBeat, Math.floor(beat / 4) % 8);
      nextBeat += BEAT;
      beat += 1;
    }
    timer = window.setTimeout(tick, 180);
  }

  function unlock() {
    const c = ac();
    if (!c) return;
    if (c.state === "suspended") void c.resume();
  }

  return {
    unlock,
    start() {
      unlock();
      if (!ctx || muted || running) return;
      running = true;
      beat = 0;
      nextBeat = ctx.currentTime + 0.12;
      if (music) {
        music.gain.cancelScheduledValues(ctx.currentTime);
        music.gain.setValueAtTime(0.0001, ctx.currentTime);
        music.gain.exponentialRampToValueAtTime(0.7, ctx.currentTime + 1.4);
      }
      tick();
    },
    stop() {
      running = false;
      window.clearTimeout(timer);
      if (ctx && music) {
        const t = ctx.currentTime;
        music.gain.cancelScheduledValues(t);
        music.gain.setTargetAtTime(0.0001, t, 0.25);
      }
    },
    howl() {
      unlock();
      if (!ctx || !sfx || muted) return;
      const t0 = ctx.currentTime;
      osc(ctx, sfx, "triangle", 330, t0, 1.15, 0.14, 0.06, 92);
      osc(ctx, sfx, "sine", 196, t0 + 0.05, 0.9, 0.06, 0.08, 82);
      osc(ctx, sfx, "sine", 494, t0, 0.35, 0.04, 0.04, 220);
      if (music && running) {
        music.gain.cancelScheduledValues(t0);
        music.gain.setValueAtTime(0.7, t0);
        music.gain.linearRampToValueAtTime(0.28, t0 + 0.08);
        music.gain.linearRampToValueAtTime(0.7, t0 + 1.4);
      }
    },
    setMuted(m: boolean) {
      muted = m;
      saveMuted(m);
      if (master && ctx) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.05);
      }
      if (m) {
        running = false;
        window.clearTimeout(timer);
      }
    },
    muted: () => muted,
    playing: () => running && !muted,
    dispose() {
      running = false;
      window.clearTimeout(timer);
      try {
        master?.disconnect();
        ctx?.close();
      } catch {
        /* already closed */
      }
      ctx = null;
      master = null;
      music = null;
      sfx = null;
    },
  };
}
