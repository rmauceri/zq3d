'use strict';

const ZQAudio = (() => {
    const PARAMS = { waterGain: 0.16, ambience: 0.7, effects: 0.55, reverb: 0.13, impulseSeconds: 2 };

    class Soundscape {
        constructor() {
            this.context = null;
            this.themeId = 'tropical';
            this.enabled = false;
            this.active = false;
            this.sources = new Set();
            this.ambient = [];
            this.melodyTimer = 4;
            this.textureTimer = 3;
            this.generation = 0;
        }
        noise(seconds, fade = false) {
            const ctx = this.context, buffer = ctx.createBuffer(fade ? 2 : 1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const data = buffer.getChannelData(channel);
                for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (fade ? Math.pow(1 - i / data.length, 3) : 1);
            }
            return buffer;
        }
        initialize() {
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) throw new Error('Synthesized audio is not supported by this browser.');
            this.context = new Audio();
            const ctx = this.context;
            this.master = ctx.createGain();
            this.master.gain.value = 0;
            this.compressor = ctx.createDynamicsCompressor();
            this.compressor.threshold.value = -16;
            this.compressor.knee.value = 16;
            this.compressor.ratio.value = 5;
            this.compressor.attack.value = 0.01;
            this.compressor.release.value = 0.25;
            this.master.connect(this.compressor);
            this.compressor.connect(ctx.destination);
            this.ambientBus = ctx.createGain(); this.ambientBus.gain.value = PARAMS.ambience;
            this.effectsBus = ctx.createGain(); this.effectsBus.gain.value = PARAMS.effects;
            this.ambientBus.connect(this.master); this.effectsBus.connect(this.master);
            this.reverb = ctx.createConvolver(); this.reverb.buffer = this.noise(PARAMS.impulseSeconds, true);
            this.wet = ctx.createGain(); this.wet.gain.value = PARAMS.reverb;
            this.ambientBus.connect(this.reverb); this.effectsBus.connect(this.reverb);
            this.reverb.connect(this.wet); this.wet.connect(this.master);
        }
        track(source, nodes, ambient = false) {
            const entry = { source, nodes };
            this.sources.add(entry);
            if (ambient) this.ambient.push(entry);
            source.onended = () => {
                source.disconnect();
                nodes.forEach(node => node.disconnect());
                this.sources.delete(entry);
            };
            return entry;
        }
        setVolume(volume) {
            this.volume = ZQ.clamp(volume, 0, 1);
            if (this.context) this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.context.currentTime, 0.08);
        }
        async enable(themeId, volume) {
            const generation = ++this.generation;
            if (!this.context) this.initialize();
            this.enabled = true;
            this.setVolume(volume);
            this.setTheme(themeId);
            await this.context.resume();
            if (generation !== this.generation || !this.enabled) return;
            this.active = true;
        }
        async disable() {
            ++this.generation;
            this.enabled = false;
            this.active = false;
            if (this.context) {
                this.master.gain.setValueAtTime(0, this.context.currentTime);
                await this.context.suspend();
            }
        }
        async suspend() {
            this.active = false;
            ++this.generation;
            if (this.context && this.context.state !== 'closed') await this.context.suspend();
        }
        async resume() {
            if (!this.enabled || !this.context) return;
            const generation = ++this.generation;
            await this.context.resume();
            if (generation === this.generation && this.enabled) this.active = true;
        }
        setTheme(themeId) {
            if (!Object.hasOwn(ZQ.THEMES, themeId)) throw new Error('Unknown soundscape.');
            if (this.themeId === themeId && this.ambient.length) return;
            this.themeId = themeId;
            if (!this.context) return;
            for (const entry of this.sources) {
                entry.source.stop();
                entry.source.disconnect();
                entry.nodes.forEach(node => node.disconnect());
            }
            this.sources.clear();
            this.ambient = [];
            const ctx = this.context, music = ZQ.THEMES[themeId].music;
            const water = ctx.createBufferSource();
            water.buffer = this.noise(4); water.loop = true;
            const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 200;
            const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 40;
            const waterGain = ctx.createGain(); waterGain.gain.value = PARAMS.waterGain;
            water.connect(high); high.connect(low); low.connect(waterGain); waterGain.connect(this.ambientBus);
            water.start(); this.track(water, [low, high, waterGain], true);
            const waterLfo = ctx.createOscillator(), depth = ctx.createGain();
            waterLfo.frequency.value = 0.1; depth.gain.value = 30;
            waterLfo.connect(depth); depth.connect(low.frequency); waterLfo.start(); this.track(waterLfo, [depth], true);
            music.chord.forEach((interval, i) => {
                const source = ctx.createOscillator(), gain = ctx.createGain();
                source.type = i === 0 ? 'sine' : 'triangle'; source.frequency.value = music.base * interval;
                gain.gain.value = [0.085, 0.035, 0.018][i];
                source.connect(gain); gain.connect(this.ambientBus); source.start(); this.track(source, [gain], true);
                const lfo = ctx.createOscillator(), modulation = ctx.createGain();
                lfo.frequency.value = 0.05 + i * 0.03; modulation.gain.value = 0.8 + i * 0.3;
                lfo.connect(modulation); modulation.connect(source.frequency); lfo.start(); this.track(lfo, [modulation], true);
            });
            this.melodyTimer = 3;
            this.textureTimer = 4;
        }
        tone(frequency, decay, amplitude, options = {}) {
            if (!this.enabled || !this.active || !this.context || this.context.state !== 'running') return;
            const ctx = this.context, t = ctx.currentTime + (options.delay || 0);
            const source = ctx.createOscillator(), envelope = ctx.createGain(), filter = ctx.createBiquadFilter();
            source.type = options.wave || 'sine';
            source.frequency.setValueAtTime(frequency, t);
            if (options.end) source.frequency.exponentialRampToValueAtTime(options.end, t + decay * 0.8);
            envelope.gain.setValueAtTime(0, t);
            envelope.gain.linearRampToValueAtTime(amplitude, t + Math.min(0.04, decay / 4));
            envelope.gain.exponentialRampToValueAtTime(0.0001, t + decay);
            filter.type = 'lowpass'; filter.frequency.value = options.cutoff || 2200;
            source.connect(filter); filter.connect(envelope);
            const nodes = [filter, envelope];
            const bus = options.ambient ? this.ambientBus : this.effectsBus;
            if (ctx.createStereoPanner) {
                const pan = ctx.createStereoPanner();
                pan.pan.value = ZQ.clamp(options.pan || 0, -0.85, 0.85);
                envelope.connect(pan); pan.connect(bus); nodes.push(pan);
            } else envelope.connect(bus);
            source.start(t); source.stop(t + decay + 0.05);
            this.track(source, nodes);
        }
        effect(type, pan = 0) {
            if (type === 'feed') this.tone(400, 0.2, 0.16, { end: 80, pan });
            else if (type === 'tap' || type === 'visitor-tap') {
                this.tone(180, 0.22, 0.1, { end: 60, pan });
                [2200, 3400, 4800].forEach((n, i) => this.tone(n, 0.6 + i * 0.2, 0.025 / (i + 1), { cutoff: 5200, pan }));
            } else if (type === 'birth' || type === 'achievement' || type === 'milestone' || type === 'prize') {
                [523, 659, 784, 1047].forEach((n, i) => this.tone(n, 0.75, 0.07, { delay: i * 0.12, pan }));
            } else if (type === 'clean') {
                [2093, 2637, 3136, 4186].forEach((n, i) => this.tone(n, 0.22, 0.04, { delay: i * 0.08, cutoff: 5000, pan }));
            } else if (type === 'loss') this.tone(150, 0.25, 0.1, { end: 40, pan });
            else if (type === 'decoy') this.tone(340, 0.25, 0.07, { end: 180, pan });
            else if (type === 'flash' || type === 'defended') this.tone(659, 1.1, 0.045, { end: 880, pan });
            else if (type === 'prize-play') [523, 784, 1047].forEach((n, i) => this.tone(n, 0.8, 0.03, { delay: i * 0.15, pan }));
            else if (type === 'challenge') this.tone(220, 0.65, 0.06, { end: 330, pan });
            else if (type === 'attack') {
                [1100, 930, 780, 650].forEach((n, i) => this.tone(n, 0.6, 0.035, { end: n * 0.3, delay: i * 0.06, pan }));
            } else if (type === 'visitor') this.tone(330, 2, 0.045, { end: 260, ambient: true });
        }
        update(dt) {
            if (!this.active || !this.enabled) return;
            const music = ZQ.THEMES[this.themeId].music;
            this.melodyTimer -= dt;
            this.textureTimer -= dt;
            if (this.melodyTimer <= 0) {
                this.melodyTimer = 5 + Math.random() * 3;
                if (Math.random() < 0.7) {
                    const start = Math.floor(Math.random() * music.notes.length);
                    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
                        this.tone(music.notes[(start + i) % music.notes.length], music.decay, this.themeId === 'deep' ? 0.09 : 0.05,
                            { ambient: true, delay: i * music.interval, wave: this.themeId === 'tropical' ? 'triangle' : 'sine',
                                cutoff: this.themeId === 'deep' ? 900 : 1800, pan: Math.sin(start + i) * 0.45 });
                    }
                }
            }
            if (this.textureTimer <= 0) {
                this.textureTimer = 6 + Math.random() * 4;
                if (this.themeId === 'koi') this.tone([1318, 1568, 2093, 2637][Math.floor(Math.random() * 4)], 2, 0.025, { ambient: true });
                if (this.themeId === 'tropical') this.tone(900, 0.45, 0.02, { end: 1500, ambient: true, pan: -0.5 });
                if (this.themeId === 'deep') this.tone(100, 4, 0.07, { end: 47, ambient: true, cutoff: 500 });
                if (this.themeId === 'zen') [1, 2.71, 5.4].forEach((p, i) => this.tone(262 * p, 4, 0.035 / (i + 1), { ambient: true }));
                if (this.themeId === 'ink') this.tone(music.notes[Math.floor(Math.random() * music.notes.length)], 2.5, 0.04, { ambient: true, wave: 'triangle' });
            }
        }
        async dispose() {
            this.enabled = false;
            this.active = false;
            ++this.generation;
            if (this.context && this.context.state !== 'closed') await this.context.close();
            this.sources.clear(); this.ambient = [];
        }
    }
    return { Soundscape };
})();
