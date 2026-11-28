// Blackhole Timer — alert sounds with the Web Audio API: synthesised tones, and the
// spooky voices (recorded clips from voices.js) played through pitch, distortion, echo
// and reverb effects.
(() => {
  'use strict';

  /** Synthesised tones: partials with a frequency, start, decay, gain (and optional slide). */
  const TONES = {
    Glass: [{ f: 1568, d: 1.4, g: 0.5 }, { f: 2349, d: 0.9, g: 0.3 }, { f: 3136, d: 0.5, g: 0.15 }],
    Crystal: [{ f: 1047, d: 0.9, g: 0.4, type: 'triangle' }, { f: 1319, at: 0.12, d: 0.9, g: 0.35, type: 'triangle' },
              { f: 1568, at: 0.24, d: 1.2, g: 0.35, type: 'triangle' }],
    Ping: [{ f: 1760, d: 0.7, g: 0.5 }, { f: 3520, d: 0.25, g: 0.12 }],
    Beacon: [{ f: 880, d: 0.35, g: 0.35, type: 'triangle' }, { f: 1175, at: 0.28, d: 0.5, g: 0.35, type: 'triangle' }],
    Pulse: [{ f: 660, d: 0.18, g: 0.4 }, { f: 660, at: 0.22, d: 0.18, g: 0.4 }, { f: 660, at: 0.44, d: 0.3, g: 0.4 }],
    Sonar: [{ f: 1200, d: 2.0, g: 0.4, slide: 900 }],
    Marimba: [{ f: 523, d: 0.6, g: 0.5 }, { f: 1569, d: 0.25, g: 0.2 },
              { f: 784, at: 0.18, d: 0.6, g: 0.45 }, { f: 2352, at: 0.18, d: 0.25, g: 0.18 }],
  };

  /** Spoken tones: recorded phrases (alarm / reminder) through effects. */
  const VOICES = [
    { name: 'Demon', stem: 'demon', layers: [-900, -500], distortion: 0.14, echo: null, reverb: 0.45, reverbSeconds: 3.2 },
    { name: 'Ghost', stem: 'ghost', layers: [-250, -230], distortion: 0, echo: { delay: 0.38, feedback: 0.5, mix: 0.3 },
      reverb: 0.4, reverbSeconds: 3.5 },
    { name: 'Robot', stem: 'robot', layers: [-100], distortion: 0.35, echo: null, reverb: 0.12, reverbSeconds: 0.8 },
    { name: 'Doom Organ', stem: 'organ', layers: [-300], distortion: 0, echo: null, reverb: 0.5, reverbSeconds: 3.2 },
    { name: 'Alien', stem: 'alien', layers: [200, -400], distortion: 0.4, echo: { delay: 0.18, feedback: 0.35, mix: 0.25 },
      reverb: 0.3, reverbSeconds: 2 },
  ];

  let ctx = null;
  const buffers = new Map();   // "demon-alarm" -> AudioBuffer (or null if it failed)
  const impulses = new Map();  // reverb seconds -> AudioBuffer

  function audio() {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  const voiceNamed = (name) => VOICES.find((v) => v.name === name);
  const hasVoiceClips = (voice) => Boolean(window.VOICE_CLIPS && window.VOICE_CLIPS[`${voice.stem}-alarm`]);

  /** Starts decoding the recorded clips in the background. */
  async function preload() {
    const clips = window.VOICE_CLIPS || {};
    for (const [key, url] of Object.entries(clips)) {
      if (buffers.has(key)) continue;
      try {
        const data = await (await fetch(url)).arrayBuffer();
        buffers.set(key, await audio().decodeAudioData(data));
      } catch (error) {
        console.warn('Could not decode voice clip', key, error);
        buffers.set(key, null);
      }
    }
  }

  // MARK: Synthesised tones

  function playTone(name, volume) {
    const ac = audio();
    const partials = TONES[name] || TONES.Glass;
    const out = ac.createGain();
    out.gain.value = volume;
    out.connect(ac.destination);
    const now = ac.currentTime + 0.02;
    const sources = [];
    let duration = 0;
    for (const p of partials) {
      const at = p.at || 0;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = p.type || 'sine';
      osc.frequency.setValueAtTime(p.f, now + at);
      if (p.slide) osc.frequency.exponentialRampToValueAtTime(p.slide, now + at + p.d);
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(p.g, now + at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + p.d);
      osc.connect(gain).connect(out);
      osc.start(now + at);
      osc.stop(now + at + p.d + 0.05);
      sources.push(osc);
      duration = Math.max(duration, at + p.d);
    }
    return {
      duration,
      stop() {
        sources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
        out.disconnect();
      },
    };
  }

  // MARK: Voices

  function distortionCurve(amount) {
    const k = amount * 400;
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  function impulse(seconds) {
    if (impulses.has(seconds)) return impulses.get(seconds);
    const ac = audio();
    const length = Math.floor(ac.sampleRate * seconds);
    const buffer = ac.createBuffer(2, length, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
    impulses.set(seconds, buffer);
    return buffer;
  }

  /** Plays a voice clip once through its effects; null if the clip isn't available. */
  function playVoice(voice, kind, volume) {
    const buffer = buffers.get(`${voice.stem}-${kind}`);
    if (!buffer) return null;
    const ac = audio();
    const out = ac.createGain();
    out.gain.value = volume;
    out.connect(ac.destination);

    // Layers: the clip at each pitch, mixed together.
    const mix = ac.createGain();
    const sources = voice.layers.map((cents) => {
      const src = ac.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = Math.pow(2, cents / 1200);
      src.connect(mix);
      return src;
    });

    let last = mix;
    if (voice.distortion > 0) {
      const shaper = ac.createWaveShaper();
      shaper.curve = distortionCurve(voice.distortion);
      const wet = ac.createGain();
      const dry = ac.createGain();
      const merged = ac.createGain();
      wet.gain.value = voice.distortion;
      dry.gain.value = 1 - voice.distortion;
      last.connect(shaper).connect(wet).connect(merged);
      last.connect(dry).connect(merged);
      last = merged;
    }
    if (voice.echo) {
      const delay = ac.createDelay(2);
      const feedback = ac.createGain();
      const wet = ac.createGain();
      const merged = ac.createGain();
      delay.delayTime.value = voice.echo.delay;
      feedback.gain.value = voice.echo.feedback;
      wet.gain.value = voice.echo.mix;
      last.connect(merged);
      last.connect(delay);
      delay.connect(feedback).connect(delay);
      delay.connect(wet).connect(merged);
      last = merged;
    }
    const reverb = ac.createConvolver();
    reverb.buffer = impulse(voice.reverbSeconds);
    const wet = ac.createGain();
    const dry = ac.createGain();
    wet.gain.value = voice.reverb;
    dry.gain.value = 1 - voice.reverb * 0.5;
    last.connect(reverb).connect(wet).connect(out);
    last.connect(dry).connect(out);

    sources.forEach((s) => s.start());
    const slowest = Math.min(...voice.layers.map((cents) => Math.pow(2, cents / 1200)));
    return {
      duration: buffer.duration / slowest,
      stop() {
        sources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
        setTimeout(() => out.disconnect(), 50);
      },
    };
  }

  // MARK: Public API

  /** Plays a sound once. kind: "alarm" or "reminder". Returns { duration, stop() }. */
  function play(name, kind = 'alarm', volume = 1) {
    const voice = voiceNamed(name);
    if (voice) {
      const handle = playVoice(voice, kind, volume);
      if (handle) return handle;
      return playTone('Glass', volume);  // clip missing: fall back to a tone
    }
    return playTone(name, volume * (kind === 'reminder' ? 0.6 : 1));
  }

  /**
   * Plays a sound again and again (with a pause in between) until `until` (ms timestamp)
   * or until stopped. Calls onEnd when it finishes by itself. Returns { stop() }.
   */
  function loop(name, kind, { until, volume = 1, gap = 1, onEnd } = {}) {
    let current = null;
    let timer = null;
    let stopped = false;
    const next = () => {
      if (stopped) return;
      if (Date.now() >= until) {
        stopped = true;
        if (onEnd) onEnd();
        return;
      }
      current = play(name, kind, volume);
      timer = setTimeout(next, (current.duration + gap) * 1000);
    };
    next();
    return {
      stop() {
        stopped = true;
        clearTimeout(timer);
        if (current) current.stop();
      },
    };
  }

  window.Sounds = {
    tones: Object.keys(TONES),
    voices: VOICES.map((v) => v.name),
    isVoice: (name) => Boolean(voiceNamed(name)),
    hasVoiceClips: (name) => { const v = voiceNamed(name); return Boolean(v && hasVoiceClips(v)); },
    preload,
    play,
    loop,
  };
})();
