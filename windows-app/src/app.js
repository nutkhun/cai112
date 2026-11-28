// Blackhole Timer — timers, reminders, alarms, settings and the animated views.
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const desktop = window.desktop || null;  // Electron bridge (absent in a plain browser)

  const PRESETS = [['1m', 60, '1 min'], ['5m', 300, '5 min'], ['10m', 600, '10 min'],
                   ['15m', 900, '15 min'], ['25m', 1500, '25 min'], ['1h', 3600, '1 hour']];
  const REMINDER_CHOICES = [1, 2, 3, 5, 10, 15, 30];
  const REMINDER_LENGTHS = [[0, 'Once'], [10, '10 sec'], [30, '30 sec'], [60, '1 min'], [180, '3 min']];
  const MAX_ALARM_MS = 120000;  // the alarm stops by itself after 2 minutes

  // MARK: Settings (shared by all timers, saved between launches)

  const SETTINGS_KEY = 'blackhole.settings';
  // Voice tones only appear once their recordings are included (see scripts/embed-voices.mjs).
  const availableVoices = () => Sounds.voices.filter((name) => Sounds.hasVoiceClips(name));
  const allSounds = () => [...availableVoices(), ...Sounds.tones];
  const settings = Object.assign(
    { sound: 'Glass', reminders: [5, 2, 1], remindersEnabled: true, reminderLength: 180 },
    loadSettings(),
  );
  if (!allSounds().includes(settings.sound)) settings.sound = 'Glass';

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* not essential */ }
  }
  const activeReminders = () => (settings.remindersEnabled ? settings.reminders : []);

  // MARK: Timers

  function newTimer() {
    return {
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()),
      label: '', h: 0, m: 5, s: 0,
      state: 'idle',          // idle | running | paused | finished
      remaining: 0, total: 0, endAt: 0, lastDuration: 0,
      pending: [],            // reminder offsets (seconds before the end) still to go off
      fired: new Set(),       // reminder minutes that have gone off in this countdown
      finishedAt: 0,          // when time ran out (drives the black hole)
      ringing: false, alarm: null, reminder: null,
    };
  }

  const timers = [newTimer()];
  let selectedId = timers[0].id;
  const selected = () => timers.find((t) => t.id === selectedId) || timers[0];
  const nameOf = (t) => t.label || `Timer ${timers.indexOf(t) + 1}`;
  const configured = (t) => t.h * 3600 + t.m * 60 + t.s;
  const isActive = (t) => t.state === 'running' || t.state === 'paused';
  const remainingAt = (t, now) => (t.state === 'running' ? Math.max(0, (t.endAt - now) / 1000) : t.remaining);
  const progressAt = (t, now) => (t.total > 0 ? remainingAt(t, now) / t.total : 0);
  const blackHole = (t, now) =>
    (t.state === 'finished' && t.finishedAt ? Math.min(Math.max((now - t.finishedAt) / 3500, 0), 1) : 0);

  const pad = (n) => String(n).padStart(2, '0');
  function clock(seconds) {
    const s = Math.max(0, seconds);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
  }
  const format = (seconds) => clock(Math.ceil(seconds - 1e-6));
  const timeLeftText = (offset) => (offset === 60 ? '1 minute left' : `${Math.round(offset / 60)} minutes left`);
  const endTime = (t) => new Date(t.endAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const finishedTitle = (t) => (t.label ? `${t.label}: time's up!` : "Time's up!");
  const finishedMessage = (t) =>
    (t.label ? `${t.label}: your ${format(t.lastDuration)} countdown has finished.`
             : `Your ${format(t.lastDuration)} countdown has finished.`);
  const warningBody = (t) => (t.label ? `${t.label} ends at ${endTime(t)}.` : `Countdown ends at ${endTime(t)}.`);

  function start(t, seconds = configured(t)) {
    if (seconds <= 0) return;
    stopAlarm(t);
    silence(t);
    t.lastDuration = seconds;
    t.total = seconds;
    t.remaining = seconds;
    t.fired = new Set();
    run(t);
  }

  function startPreset(t, seconds) {
    t.h = Math.floor(seconds / 3600);
    t.m = Math.floor((seconds % 3600) / 60);
    t.s = seconds % 60;
    start(t);
  }

  function run(t) {
    t.endAt = Date.now() + t.remaining * 1000;
    t.state = 'running';
    t.finishedAt = 0;
    // Only reminders still ahead; one equal to the full duration would go off at once.
    t.pending = activeReminders().map((m) => m * 60).filter((o) => o < t.remaining - 0.5);
    for (const o of t.pending) t.fired.delete(o / 60);  // ahead again (e.g. after +1 min)
    changed();
  }

  function pause(t) {
    if (t.state !== 'running') return;
    t.remaining = remainingAt(t, Date.now());
    t.state = 'paused';
    silence(t);
    changed();
  }

  const resume = (t) => { if (t.state === 'paused') run(t); };
  const toggle = (t) => (t.state === 'running' ? pause(t) : resume(t));

  function reset(t) {
    stopAlarm(t);
    silence(t);
    t.state = 'idle';
    t.remaining = 0;
    t.total = 0;
    t.pending = [];
    t.fired = new Set();
    t.finishedAt = 0;
    dismissAlertFor(t);
    changed();
  }

  function addTime(t, seconds) {
    if (!isActive(t)) return;
    t.total += seconds;
    t.remaining = remainingAt(t, Date.now()) + seconds;
    if (t.state === 'running') run(t); else changed();
  }

  function silence(t) {
    if (t.reminder) t.reminder.stop();
    t.reminder = null;
    t.ringing = false;
  }

  function stopAlarm(t) {
    if (t.alarm) t.alarm.stop();
    t.alarm = null;
  }

  function remind(t, offset) {
    silence(t);
    const length = settings.reminderLength;
    if (length > 0) {
      t.ringing = true;
      t.reminder = Sounds.loop(settings.sound, 'reminder', {
        until: Date.now() + length * 1000,
        volume: 0.75,
        onEnd: () => { t.ringing = false; t.reminder = null; changed(); },
      });
    } else {
      Sounds.play(settings.sound, 'reminder', 0.75);
    }
    notify(timeLeftText(offset), warningBody(t));
    changed();
  }

  function finish(t) {
    silence(t);
    t.remaining = 0;
    t.state = 'finished';
    t.finishedAt = Date.now();
    t.pending = [];
    t.alarm = Sounds.loop(settings.sound, 'alarm', { until: Date.now() + MAX_ALARM_MS });
    notify(finishedTitle(t), finishedMessage(t));
    if (desktop) desktop.attention();
    queueAlert(t);
    changed();
  }

  function notify(title, body) {
    try {
      new Notification(title, { body, silent: true, icon: '../assets/icon.png' });
    } catch { /* notifications unavailable */ }
  }

  // Every 100 ms: count down, set off reminders, and finish timers.
  setInterval(() => {
    const now = Date.now();
    for (const t of timers) {
      if (t.state !== 'running') continue;
      t.remaining = remainingAt(t, now);
      if (t.remaining <= 0) { finish(t); continue; }
      // After sleep several can be due at once: go off once, for the latest.
      const due = t.pending.filter((o) => t.remaining <= o);
      if (due.length) {
        t.pending = t.pending.filter((o) => !due.includes(o));
        due.forEach((o) => t.fired.add(o / 60));
        remind(t, Math.min(...due));
      }
    }
    renderTabs();
  }, 100);

  // MARK: Time's up dialog (one at a time if several timers finish)

  const alertQueue = [];

  function queueAlert(t) {
    if (!alertQueue.includes(t)) alertQueue.push(t);
    showAlert();
  }

  function showAlert() {
    const t = alertQueue[0];
    $('#alert').classList.toggle('hidden', !t);
    if (!t) return;
    $('#alert-title').textContent = finishedTitle(t);
    $('#alert-text').textContent = finishedMessage(t);
  }

  function answerAlert(action) {
    const t = alertQueue.shift();
    if (t) {
      stopAlarm(t);
      if (t.state === 'finished') {
        if (action === 'snooze') { t.total = 60; t.remaining = 60; run(t); }
        else if (action === 'restart') start(t, t.lastDuration);
        else reset(t);
      }
    }
    showAlert();
  }

  function dismissAlertFor(t) {
    const i = alertQueue.indexOf(t);
    if (i >= 0) { alertQueue.splice(i, 1); showAlert(); }
  }

  // MARK: Rendering

  let renderQueued = false;
  function changed() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function icon(id) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${id}`);
    svg.appendChild(use);
    return svg;
  }

  let lastTabsKey = '';
  function renderTabs() {
    const key = JSON.stringify([selectedId, timers.map((t) =>
      [t.id, nameOf(t), t.state, t.state === 'idle' ? '' : format(t.remaining), t.ringing])]);
    if (key === lastTabsKey) return;
    lastTabsKey = key;

    const tabs = $('#tabs');
    tabs.replaceChildren();
    for (const t of timers) {
      const tab = el('button', `tab${t.id === selectedId ? ' selected' : ''}`);
      tab.dataset.id = t.id;
      tab.title = nameOf(t);
      tab.append(el('span', `dot ${t.state}`), el('span', 'name', nameOf(t)));
      if (t.state !== 'idle') tab.append(el('span', 'tab-time', format(t.remaining)));
      if (t.ringing) { const bell = icon('i-bell'); bell.classList.add('bell'); tab.append(bell); }
      if (timers.length > 1) {
        const remove = el('span', 'remove');
        remove.title = 'Remove this timer';
        remove.dataset.remove = t.id;
        remove.append(icon('i-x'));
        tab.append(remove);
      }
      tabs.append(tab);
    }
    const add = el('button', 'add-tab');
    add.id = 'add-timer';
    add.title = 'Add another timer (Ctrl+T)';
    add.append(icon('i-plus'));
    tabs.append(add);
    updateTray();
  }

  let lastView = '';
  function render() {
    const t = selected();
    renderTabs();

    // Setup or countdown, with a fresh entrance when it changes (or the tab changes).
    const view = t.state === 'idle' ? 'setup' : 'running';
    const viewKey = `${t.id}:${view}`;
    if (viewKey !== lastView) {
      lastView = viewKey;
      for (const id of ['setup', 'running']) {
        const node = $(`#${id}`);
        node.classList.toggle('hidden', id !== view);
        node.style.animation = 'none';
        void node.offsetWidth;
        node.style.animation = '';
      }
    }

    // Setup
    for (const digit of document.querySelectorAll('.digit')) {
      const input = digit.querySelector('input');
      if (document.activeElement !== input) input.value = pad(t[digit.dataset.unit]);
    }
    $('#start').disabled = configured(t) === 0;

    // Countdown controls
    $('#toggle-icon').setAttribute('href', t.state === 'running' ? '#i-pause' : '#i-play');
    $('#toggle').title = t.state === 'running' ? 'Pause (Space)' : 'Resume (Space)';
    $('#toggle').classList.toggle('invisible', !isActive(t));
    $('#add').disabled = !isActive(t);
    $('#silence').classList.toggle('hidden', !t.ringing);
    $('#center-live').classList.toggle('hidden', t.state === 'finished');
    $('#center-done').classList.toggle('hidden', t.state !== 'finished');

    renderSettings(t);
  }

  function renderSettings(t) {
    const label = $('#label');
    const labelText = $('#label-text');
    label.classList.toggle('hidden', t.state !== 'idle');
    labelText.classList.toggle('hidden', t.state === 'idle');
    if (document.activeElement !== label) label.value = t.label;
    labelText.textContent = t.label || 'None';

    const list = settings.reminders;
    $('#rem-summary').textContent = settings.remindersEnabled && list.length ? `${list.join(', ')} min before` : 'Off';
    $('#rem-switch').classList.toggle('on', settings.remindersEnabled);
    $('#rem-switch').setAttribute('aria-checked', String(settings.remindersEnabled));
    $('#rem-body').classList.toggle('off', !settings.remindersEnabled);

    const chips = $('#rem-chips');
    if (!chips.querySelector('input')) {  // don't rebuild while typing a custom time
      chips.replaceChildren();
      const options = [...new Set([...REMINDER_CHOICES, ...list])].sort((a, b) => a - b);
      for (const minutes of options) {
        const on = list.includes(minutes);
        const fired = t.fired.has(minutes);
        const chip = el('button', `chip${on && !fired ? ' on' : ''}${fired ? ' fired' : ''}`, `${fired ? '✓ ' : ''}${minutes}m`);
        chip.dataset.minutes = minutes;
        chip.disabled = !settings.remindersEnabled;
        chip.title = fired ? 'Already reminded in this countdown'
          : on ? `Turn off the ${minutes}-minute reminder` : `Remind me ${minutes} min before the end`;
        chips.append(chip);
      }
      const custom = el('button', 'chip', 'Custom');
      custom.id = 'custom';
      custom.prepend(icon('i-plus'));
      custom.disabled = !settings.remindersEnabled;
      custom.title = 'Add a reminder at any number of minutes before the end';
      chips.append(custom);
    }
    $('#rem-length').value = String(settings.reminderLength);
    $('#rem-length').disabled = !settings.remindersEnabled;
    $('#sound').value = settings.sound;
  }

  function updateTray() {
    if (!desktop) return;
    const now = Date.now();
    const busy = timers.filter((t) => t.state !== 'idle');
    const soonest = timers.filter((t) => t.state === 'running')
      .sort((a, b) => remainingAt(a, now) - remainingAt(b, now))[0];
    desktop.updateTray({
      tooltip: soonest ? `Blackhole Timer — ${nameOf(soonest)} ${format(remainingAt(soonest, now))}` : 'Blackhole Timer',
      timers: busy.map((t) => ({
        name: nameOf(t),
        text: t.state === 'paused' ? `paused at ${format(t.remaining)}`
          : t.state === 'finished' ? "time's up" : format(remainingAt(t, now)),
      })),
    });
  }

  // MARK: Animation (stars, eclipse, aurora)

  const dpr = () => window.devicePixelRatio || 1;
  function fit(canvas, width, height) {
    const ratio = dpr();
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return ctx;
  }

  const starsCanvas = $('#stars');
  const eclipseCanvas = $('#eclipse');
  const auroraCanvas = $('#aurora');
  const anim = { last: performance.now(), travel: 0, wave: 0, breath: 0, beat: -1 };

  function marksFor(t) {
    if (t.total <= 0) return [];
    return activeReminders()
      .map((minutes) => ({ minutes, fraction: (minutes * 60) / t.total }))
      .filter((m) => m.fraction > 0 && m.fraction < 1);
  }

  function frame(now) {
    const dt = Math.min((now - anim.last) / 1000, 0.1);
    anim.last = now;
    if (!document.hidden) drawFrame(dt, now / 1000);
    requestAnimationFrame(frame);
  }

  function drawFrame(dt, time) {
    const t = selected();
    const wall = Date.now();
    const finished = t.state === 'finished';
    const progress = finished ? 1 : progressAt(t, wall);
    const elapsed = t.state === 'idle' ? 0 : finished ? 1 : 1 - progress;

    // The stars fly faster as time runs out; the aura and breathing speed up too.
    const speed = { idle: 0.01, paused: 0.003, finished: 0.02 }[t.state] ?? 0.01 + 0.45 * Math.pow(elapsed, 2.2);
    const energy = t.state === 'paused' ? 0 : finished ? 1.3 : 0.25 + 0.85 * elapsed * elapsed;
    anim.travel += dt * speed;
    anim.wave += dt * (0.1 + 0.3 * energy);
    anim.breath += dt * (0.8 + 1.5 * energy);
    const hole = blackHole(t, wall);

    const running = t.state !== 'idle';
    let center = { x: window.innerWidth / 2, y: window.innerHeight * 0.38 };
    if (running) {
      const r = eclipseCanvas.getBoundingClientRect();
      center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    Visuals.drawStars(fit(starsCanvas, window.innerWidth, window.innerHeight),
      window.innerWidth, window.innerHeight, { center, time, travel: anim.travel, speed, hole });

    if (!running) {
      Visuals.drawAurora(fit(auroraCanvas, 380, 380), 380, time);
      return;
    }

    const breath = (Math.sin(time * 2.4) + 1) / 2;
    const dim = t.state === 'paused' ? 0.35 + 0.35 * breath : 1;
    const pal = Visuals.palette(elapsed, t.state === 'paused' ? 0.75 : 0);
    Visuals.drawEclipse(fit(eclipseCanvas, 380, 380), 380, {
      time, wavePhase: anim.wave, breathPhase: anim.breath, progress,
      palette: pal, intensity: dim * (1 - 0.8 * hole), marks: marksFor(t),
    });
    document.documentElement.style.setProperty('--orb', Visuals.rgba(pal.warm, 1));

    // The numbers in the middle.
    const live = remainingAt(t, wall);
    const whole = Math.floor(live);
    $('#c-main').textContent = clock(whole);
    $('#c-tenths').textContent = `.${Math.floor((live - whole) * 10)}`;
    $('#c-main').parentElement.classList.toggle('long', whole >= 3600);
    $('#c-label').textContent = t.label ? t.label.toUpperCase() : 'REMAINING';
    $('#c-status').textContent = t.state === 'paused' ? 'PAUSED' : endTime(t);
    $('#c-status-icon').setAttribute('href', t.state === 'paused' ? '#i-pause' : '#i-bell');
    $('#center-live').style.opacity = t.state === 'paused' ? 0.45 + 0.55 * breath : 1;

    // A little heartbeat each second during the last 10 seconds.
    const second = Math.ceil(live);
    if (t.state === 'running' && live <= 10 && second !== anim.beat) {
      anim.beat = second;
      const node = $('#c-main').parentElement;
      node.classList.remove('heartbeat');
      void node.offsetWidth;
      node.classList.add('heartbeat');
    }
  }

  // MARK: Input

  function addTimer() {
    const t = newTimer();
    timers.push(t);
    selectedId = t.id;
    changed();
  }

  function removeTimer(id) {
    const t = timers.find((x) => x.id === id);
    if (!t) return;
    reset(t);
    if (timers.length === 1) return;
    const index = timers.indexOf(t);
    timers.splice(index, 1);
    if (selectedId === id) selectedId = timers[Math.min(index, timers.length - 1)].id;
    changed();
  }

  const LIMITS = { h: 99, m: 59, s: 59 };

  function setupDigits() {
    for (const digit of document.querySelectorAll('.digit')) {
      const unit = digit.dataset.unit;
      const input = digit.querySelector('input');
      input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 2); });
      const commit = () => {
        const value = Math.min(parseInt(input.value || '0', 10), LIMITS[unit]);
        selected()[unit] = value;
        input.value = pad(value);
        changed();
      };
      input.addEventListener('change', commit);
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { commit(); start(selected()); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          step(unit, e.key === 'ArrowUp' ? 1 : -1);
        }
      });
      input.addEventListener('focus', () => input.select());
      for (const button of digit.querySelectorAll('.step')) {
        button.addEventListener('click', () => step(unit, Number(button.dataset.step)));
      }
    }
  }

  function step(unit, delta) {
    const t = selected();
    const max = LIMITS[unit];
    t[unit] = (t[unit] + delta + max + 1) % (max + 1);  // wraps around
    changed();
  }

  function setupControls() {
    const presets = $('#presets');
    for (const [short, seconds, title] of PRESETS) {
      const chip = el('button', 'chip', short);
      chip.title = `Start ${title}`;
      chip.addEventListener('click', () => startPreset(selected(), seconds));
      presets.append(chip);
    }
    $('#start').addEventListener('click', () => start(selected()));
    $('#cancel').addEventListener('click', () => reset(selected()));
    $('#toggle').addEventListener('click', () => toggle(selected()));
    $('#add').addEventListener('click', () => addTime(selected(), 60));
    $('#silence').addEventListener('click', () => { silence(selected()); changed(); });

    $('#tabs').addEventListener('click', (e) => {
      const remove = e.target.closest('[data-remove]');
      if (remove) { removeTimer(remove.dataset.remove); return; }
      if (e.target.closest('#add-timer')) { addTimer(); return; }
      const tab = e.target.closest('.tab');
      if (tab) { selectedId = tab.dataset.id; changed(); }
    });

    $('#label').addEventListener('input', (e) => { selected().label = e.target.value; lastTabsKey = ''; renderTabs(); });

    $('#rem-switch').addEventListener('click', () => {
      settings.remindersEnabled = !settings.remindersEnabled;
      remindersChanged();
    });

    $('#rem-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-minutes]');
      if (chip) {
        const minutes = Number(chip.dataset.minutes);
        settings.reminders = settings.reminders.includes(minutes)
          ? settings.reminders.filter((m) => m !== minutes)
          : [...settings.reminders, minutes].sort((a, b) => b - a);
        remindersChanged();
        return;
      }
      if (e.target.closest('#custom')) openCustomChip();
    });

    const length = $('#rem-length');
    for (const [seconds, title] of REMINDER_LENGTHS) length.append(new Option(title, String(seconds)));
    length.addEventListener('change', () => { settings.reminderLength = Number(length.value); saveSettings(); });

    const sound = $('#sound');
    if (availableVoices().length) {
      const voices = document.createElement('optgroup');
      voices.label = 'Spooky voices';
      availableVoices().forEach((name) => voices.append(new Option(name, name)));
      sound.append(voices);
    }
    const tones = document.createElement('optgroup');
    tones.label = 'Sounds';
    Sounds.tones.forEach((name) => tones.append(new Option(name, name)));
    sound.append(tones);
    sound.addEventListener('change', () => { settings.sound = sound.value; saveSettings(); });

    let preview = null;
    $('#preview').addEventListener('click', () => {
      if (preview) preview.stop();
      preview = Sounds.play(settings.sound, 'alarm', 1);
    });

    $('#badge').addEventListener('click', () => { if (desktop) desktop.openWebsite(); });

    $('#alert-stop').addEventListener('click', () => answerAlert('stop'));
    $('#alert-snooze').addEventListener('click', () => answerAlert('snooze'));
    $('#alert-restart').addEventListener('click', () => answerAlert('restart'));

    document.addEventListener('keydown', (e) => {
      const typing = e.target.matches('input, select');
      const t = selected();
      if (!$('#alert').classList.contains('hidden')) {
        if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); answerAlert('stop'); }
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); addTimer(); return; }
      if (typing) return;
      if (e.key === ' ' && isActive(t)) { e.preventDefault(); toggle(t); }
      else if (e.key === 'Escape' && t.state !== 'idle') reset(t);
      else if (e.key === 'Enter' && t.state === 'idle') start(t);
    });

    // Audio needs a first interaction before it can play everywhere.
    document.addEventListener('pointerdown', () => Sounds.preload(), { once: true });
  }

  function remindersChanged() {
    saveSettings();
    for (const t of timers) if (t.state === 'running') run(t);
    changed();
  }

  function openCustomChip() {
    const custom = $('#custom');
    const chip = el('span', 'chip on');
    const input = el('input');
    input.inputMode = 'numeric';
    input.maxLength = 3;
    input.placeholder = '0';
    chip.append(input, el('span', null, 'm'));
    custom.replaceWith(chip);
    input.focus();
    let done = false;
    const close = (add) => {
      if (done) return;
      done = true;
      const minutes = parseInt(input.value, 10);
      chip.remove();  // lets the chips rebuild
      if (add && minutes >= 1 && minutes <= 999 && !settings.reminders.includes(minutes)) {
        settings.reminders = [...settings.reminders, minutes].sort((a, b) => b - a);
        remindersChanged();
      } else {
        changed();
      }
    };
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(true);
      if (e.key === 'Escape') close(false);
    });
    input.addEventListener('blur', () => close(true));
  }

  // MARK: Start up

  setupDigits();
  setupControls();
  Sounds.preload();
  render();
  setInterval(updateTray, 1000);
  requestAnimationFrame(frame);
})();
