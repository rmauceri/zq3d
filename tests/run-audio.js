'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const intervals = new Map();
let nextInterval = 0;
const parameter = () => ({
    value: 0, events: [],
    setValueAtTime(value, time) { this.events.push({ kind: 'set', value, time }); },
    setTargetAtTime(value, time, constant) { this.events.push({ kind: 'target', value, time, constant }); },
    linearRampToValueAtTime(value, time) { this.events.push({ kind: 'linear', value, time }); },
    exponentialRampToValueAtTime(value, time) { this.events.push({ kind: 'exponential', value, time }); }
});
class AudioContext {
    constructor(options) { this.options = options; this.currentTime = 0; this.sampleRate = 1000; this.state = 'suspended'; this.nodes = []; }
    node() {
        const node = { gain: parameter(), frequency: parameter(), pan: parameter(),
            threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter(),
            connect() {}, disconnect() {}, start(time = 0) { this.started = time; },
            stop(time = 0) { this.stopped = time; } };
        this.nodes.push(node);
        return node;
    }
    createGain() { return this.node(); }
    createDynamicsCompressor() { return this.node(); }
    createConvolver() { return this.node(); }
    createOscillator() { return this.node(); }
    createBufferSource() { return this.node(); }
    createBiquadFilter() { return this.node(); }
    createStereoPanner() { return this.node(); }
    createBuffer(channels, length) {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return { numberOfChannels: channels, getChannelData: channel => data[channel] };
    }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
}
const math = Object.create(Math);
math.random = () => 0.1;
const context = vm.createContext({ console, Math: math, window: { AudioContext },
    setInterval(callback) { const id = ++nextInterval; intervals.set(id, callback); return id; },
    clearInterval(id) { intervals.delete(id); } });
for (const file of ['core.js', 'audio.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
}
const Soundscape = vm.runInContext('ZQAudio.Soundscape', context);
const tick = (sound, time) => {
    sound.context.currentTime = time;
    for (const callback of [...intervals.values()]) callback();
};

(async () => {
    const sound = new Soundscape();
    await sound.enable('tropical', 0.5);
    assert.equal(sound.context.options.latencyHint, 'playback', 'Audio requested a fragile low-latency output buffer');
    assert.equal(intervals.size, 1);
    tick(sound, 2.25);
    let notes = [...sound.sources].filter(entry => !entry.continuous);
    assert(notes.length > 0, 'Music starts without animation-frame updates');
    assert(notes.every(entry => entry.source.started >= 2.25 && entry.source.started <= 3.25));
    assert(sound.pendingNotes.length > 0, 'Distant phrase notes wait outside the scheduling horizon');
    console.log('PASS Music uses audio-clock lookahead without animation frames');

    const pending = [...sound.pendingNotes];
    tick(sound, 3);
    notes = [...sound.sources].filter(entry => !entry.continuous);
    assert(notes.length > 1);
    assert(notes.every(entry => entry.source.started <= 4));
    assert(sound.pendingNotes.length < pending.length);
    console.log('PASS Phrase notes enter a bounded one-second schedule horizon');

    const continuous = [...sound.sources].filter(entry => entry.continuous);
    await sound.suspend();
    assert.equal(intervals.size, 0);
    assert.equal(sound.pendingNotes.length, 0);
    assert([...sound.sources].every(entry => entry.continuous));
    assert(notes.every(entry => entry.source.stopped === 0));
    assert(continuous.every(entry => entry.source.stopped === undefined));
    tick(sound, 20);
    await sound.resume();
    assert.equal(intervals.size, 1);
    assert(sound.melodyTimer > 20 && sound.textureTimer > 20);
    assert([...sound.sources].every(entry => entry.continuous));
    console.log('PASS Pause cancels scheduled notes; resume rebases rather than catching up');

    tick(sound, 22.25);
    const before = sound.sources.size;
    tick(sound, 60);
    const fresh = [...sound.sources].filter(entry => !entry.continuous && entry.source.started >= 60);
    assert(fresh.length <= 2, 'A stalled clock must not replay every overdue phrase');
    assert(sound.sources.size <= before + 2);
    assert(fresh.every(entry => entry.source.started <= 61));
    console.log('PASS Long stalls discard overdue notes without catchup bursts');

    sound.setTheme('deep');
    assert.equal(intervals.size, 1);
    assert.equal(sound.pendingNotes.length, 0);
    assert(continuous.every(entry => entry.source.stopped === 0));
    assert(sound.melodyTimer > 60);
    await sound.disable();
    assert.equal(intervals.size, 0);
    assert.equal(sound.active, false);
    assert.equal(sound.context.state, 'suspended');
    await sound.enable('deep', 0.4);
    assert.equal(intervals.size, 1);
    await sound.dispose();
    assert.equal(intervals.size, 0);
    assert.equal(sound.sources.size, 0);
    assert.equal(sound.context.state, 'closed');
    console.log('PASS Theme, mute, re-enable and dispose maintain one cancellable scheduler');

    const interrupted = new Soundscape();
    const enabling = interrupted.enable('koi', 0.5);
    await interrupted.suspend();
    await enabling;
    assert.equal(interrupted.active, false);
    assert.equal(intervals.size, 0);
    await interrupted.dispose();
    console.log('PASS Late audio resume cannot restart sound after a pause');

    const bubbling = new Soundscape();
    await bubbling.enable('koi', 0.5);
    const baseline = bubbling.sources.size;
    bubbling.effect('bubble', 0.6);
    const pop = [...bubbling.sources].find(entry => !entry.continuous);
    assert.equal(bubbling.sources.size, baseline + 1);
    const sweep = pop.source.frequency.events;
    assert(sweep[0].value >= 600 && sweep[0].value <= 1000);
    assert(sweep[1].value >= 1200 && sweep[1].value <= 1800);
    assert.equal(sweep[1].time, 0.08);
    assert(pop.nodes.some(node => node.type === 'highpass' && node.frequency.value === 800));
    assert(pop.nodes.some(node => node.pan.value === 0.6));
    const envelope = pop.nodes.find(node => node.gain.events.some(event => event.kind === 'exponential'));
    assert.equal(envelope.gain.events[0].value, 0);
    assert.equal(envelope.gain.events[1].time, 0.006);
    assert.equal(envelope.gain.events[1].value, 0.04);
    assert.equal(envelope.gain.events.at(-1).value, 0);
    assert(pop.source.stopped > envelope.gain.events.at(-1).time);
    pop.source.onended();
    assert.equal(bubbling.sources.size, baseline);
    await bubbling.suspend();
    bubbling.effect('bubble');
    assert.equal(bubbling.sources.size, baseline, 'Paused bubbles produce sound');
    await bubbling.disable();
    bubbling.effect('bubble');
    assert.equal(bubbling.sources.size, baseline, 'Muted bubbles produce sound');
    await bubbling.dispose();
    console.log('PASS Original rising bubble timbre is spatial, fades at its endpoints and respects pause/mute');

    const smooth = new Soundscape();
    smooth.context = new AudioContext(); smooth.context.sampleRate = 48000;
    let seed = 12345;
    math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const water = smooth.waterNoise(12).getChannelData(0);
    let energy = 0, difference = 0, mean = 0;
    for (let i = 0; i < water.length; i++) {
        assert(Number.isFinite(water[i]));
        mean += water[i]; energy += water[i] ** 2;
        difference += (water[i] - water[(i + water.length - 1) % water.length]) ** 2;
    }
    assert(Math.abs(mean / water.length) < 0.00001, 'Water bed has a DC offset');
    assert(Math.sqrt(energy / water.length) > 0.02, 'Smoothing removed the water sound');
    assert(Math.sqrt(difference / water.length) < 0.02, 'Water contains sharp sample transitions');
    assert(Math.abs(water[0] - water[water.length - 1]) < 0.025, 'Water loop has a sharp seam');
    console.log('PASS Water loop is band-limited and DC-free with settled periodic filter state');

    math.random = () => 0.1;
    const deep = new Soundscape();
    await deep.enable('deep', 0.5);
    const bed = [...deep.sources].find(entry => entry.source.buffer);
    assert(bed.source.loop);
    assert.equal(bed.source.buffer.getChannelData(0).length, deep.context.sampleRate * 12);
    assert(bed.nodes.some(node => node.gain.events.some(event => event.kind === 'linear' && event.time === 0.8)));
    const lowPads = [...deep.sources].filter(entry => entry.continuous && entry.source.frequency.value >= 55);
    assert(lowPads.length >= 3, 'Deep Ocean lost its low supporting chord');
    tick(deep, 2.25);
    const melody = [...deep.sources].filter(entry => !entry.continuous);
    assert(melody.length > 0);
    for (const entry of melody) {
        const frequency = entry.source.frequency.events.find(event => event.kind === 'set').value;
        assert(frequency >= 260 && frequency <= 524, 'Deep Ocean melody is still sub-bass');
        const envelope = entry.nodes.find(node => node.gain.events.some(event => event.kind === 'exponential'));
        assert(envelope.gain.events.some(event => event.kind === 'linear' && event.value === 0.09));
        const end = envelope.gain.events.at(-1);
        assert.equal(end.value, 0);
        assert(end.time < entry.source.stopped, 'Oscillator stops before its envelope reaches silence');
        assert(envelope.gain.events[1].time - entry.source.started >= 0.24, 'Ambient tone has an abrupt attack');
    }
    await deep.dispose();
    console.log('PASS Deep melody occupies the middle register, preserves bass support, and fades fully before stopping');
})().catch(error => { console.error(error); process.exitCode = 1; });
