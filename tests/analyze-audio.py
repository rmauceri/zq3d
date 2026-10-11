"""Local signal analysis and fresh-context Edge playback isolation."""
import argparse
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--signal", action="store_true")
parser.add_argument("--seconds", type=int, default=30)
parser.add_argument("--theme", choices=["koi", "tropical", "deep", "zen", "ink"], default="tropical")
parser.add_argument("--modes", nargs="+", default=["sine", "water", "water-wet", "pads", "full", "game"])
parser.add_argument("--headful", action="store_true")
parser.add_argument("--meter", action="store_true")
parser.add_argument("--background", action="store_true")
args = parser.parse_args()
if args.seconds < 10 or args.seconds > 120:
    parser.error("--seconds must be between 10 and 120")
if any(mode not in ["sine", "water", "water-wet", "pads", "full", "game"] for mode in args.modes):
    parser.error("Unknown isolation mode")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass
    def do_GET(self):
        if self.path == "/audio-isolation":
            body = b'<!doctype html><title>Local audio isolation</title><link rel="icon" href="data:,">'
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()


SIGNAL = """async ({theme, mode, seconds}) => {
    const sampleRate = 48000;
    const offline = new OfflineAudioContext(2, sampleRate * seconds, sampleRate);
    let clock = 0, seed = 12345;
    const random = Math.random, native = window.AudioContext;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    // Advance only the scheduling clock; render the production nodes and automation offline.
    const proxy = new Proxy(offline, { get(target, key) {
        if (key === 'currentTime') return clock;
        if (key === 'state') return 'running';
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
    } });
    window.AudioContext = function() { return proxy; };
    const sound = new ZQAudio.Soundscape();
    try {
        sound.initialize(); sound.enabled = true; sound.setVolume(0.45); sound.setTheme(theme);
        sound.active = true;
        if (mode === 'water') {
            for (const entry of sound.ambient) if (!entry.source.buffer)
                for (const node of entry.nodes) if (node.gain) {
                    node.gain.cancelScheduledValues(0); node.gain.value = 0;
                }
        } else {
            sound.melodyTimer = 3; sound.textureTimer = 4;
            for (clock = 0; clock < seconds - 5; clock += 0.125) sound.schedule();
        }
        if (mode === 'dry') sound.reverb.disconnect();
        const buffer = await offline.startRendering();
        let peak = 0, energy = 0, curvature = 0, maximumCurve = 0, clipped = 0, nonfinite = 0;
        const anomalies = [], windows = [];
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const data = buffer.getChannelData(channel);
            for (let second = 1; second < seconds - 1; second++) {
                let localPeak = 0, localCurve = 0, localEnergy = 0;
                for (let i = second * sampleRate; i < (second + 1) * sampleRate; i++) {
                    const value = data[i], curve = Math.abs(value - 2 * data[i-1] + data[i-2]);
                    if (!Number.isFinite(value)) nonfinite++;
                    peak = Math.max(peak, Math.abs(value)); localPeak = Math.max(localPeak, Math.abs(value));
                    energy += value * value; localEnergy += value * value;
                    curvature += curve * curve; maximumCurve = Math.max(maximumCurve, curve);
                    localCurve = Math.max(localCurve, curve);
                    if (Math.abs(value) >= 0.999) clipped++;
                    if (curve > 0.02 && anomalies.length < 12) anomalies.push({channel, time:i/sampleRate, value, curve});
                }
                if (channel === 0) windows.push({second, peak:localPeak, rms:Math.sqrt(localEnergy/sampleRate), curvature:localCurve});
            }
        }
        const count = (seconds-2)*sampleRate*2;
        return {theme, mode, seconds, peak, rms:Math.sqrt(energy/count),
            curvatureRms:Math.sqrt(curvature/count), maximumCurve, clipped, nonfinite, anomalies,
            seamWindows:windows.filter(w => w.second % 12 === 0 || w.second % 12 === 11)};
    } finally { Math.random = random; window.AudioContext = native; }
}"""

INSTRUMENT = """() => {
    const probe = window.probe = {contexts:[], events:[], stalls:[], underruns:[], calls:{}, frames:[]};
    const native = window.AudioContext;
    window.AudioContext = class extends native {
        constructor(...args) {
            super(...args); probe.contexts.push(this);
            this.addEventListener('statechange', () => probe.events.push({name:'state',state:this.state,ms:performance.now()}));
        }
    };
    const wrap = (object, name) => {
        const original = object[name]; if (!original) return;
        object[name] = function(...values) {
            const start = performance.now();
            if(name==='enable') probe.lastSound=this;
            try { return original.apply(this, values); }
            finally {
                const duration = performance.now() - start;
                const stats = probe.calls[name] ||= {count:0,total:0,max:0};
                stats.count++; stats.total+=duration; stats.max=Math.max(stats.max,duration);
                if (duration > 10) probe.stalls.push({name,ms:start,duration});
                if (['enable','suspend','disable','setTheme','startScheduler'].includes(name))
                    probe.events.push({name,ms:start});
            }
        };
    };
    for (const name of ['enable','suspend','disable','setTheme','startScheduler','schedule','tone','waterNoise'])
        wrap(ZQAudio.Soundscape.prototype,name);
    wrap(Storage.prototype,'setItem');
    document.addEventListener('visibilitychange', () => probe.events.push({name:'visibility',hidden:document.hidden,ms:performance.now()}));
    for (const name of ['blur','focus']) window.addEventListener(name, () => probe.events.push({name,ms:performance.now()}));
    new PerformanceObserver(list => {
        for (const event of list.getEntries()) probe.stalls.push({name:'longtask',ms:event.startTime,duration:event.duration});
    }).observe({type:'longtask',buffered:true});
    let previous;
    const frame = ms => { if(previous) probe.frames.push(ms-previous); previous=ms; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    probe.wrap = wrap;
}"""

METER = """async context => {
    const code = `class Meter extends AudioWorkletProcessor {
        constructor() { super(); this.a=0; this.b=0; this.peak=0; this.curve=0; this.zero=0; this.blocks=0; }
        process(inputs,outputs) {
            const input=inputs[0], output=outputs[0];
            for(let c=0;c<output.length;c++) if(input[c]||input[0]) output[c].set(input[c]||input[0]);
            const data=input[0]; let nonzero=false;
            if(data) for(const value of data) {
                this.peak=Math.max(this.peak,Math.abs(value));
                this.curve=Math.max(this.curve,Math.abs(value-2*this.a+this.b));
                this.b=this.a; this.a=value; nonzero ||= value!==0;
            }
            if(!nonzero) this.zero++;
            if(++this.blocks>=375) {
                this.port.postMessage({audioTime:currentTime,peak:this.peak,curvature:this.curve,zeroBlocks:this.zero});
                this.peak=0;this.curve=0;this.zero=0;this.blocks=0;
            }
            return true;
        }
    } registerProcessor('local-meter',Meter);`;
    const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
    try { await context.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    const node=new AudioWorkletNode(context,'local-meter');
    node.port.onmessage=event=>probe.signal.push(event.data);
    return node;
}"""

START = """async ({mode,meter}) => {
    const sound = window.sound = new ZQAudio.Soundscape();
    if (mode === 'sine') {
        sound.context = new AudioContext({latencyHint:'playback'});
        const osc = sound.context.createOscillator(), gain = sound.context.createGain();
        osc.frequency.value=220; gain.gain.value=0.025;
        osc.connect(gain);
        if(meter) {
            const node=await window.attachMeter(sound.context);
            gain.connect(node); node.connect(sound.context.destination);
        } else gain.connect(sound.context.destination);
        osc.start();
        await sound.context.resume();
    } else {
        await sound.enable(window.testTheme,0.45);
        if (mode !== 'full') sound.stopScheduler();
        if (mode === 'water' || mode === 'water-wet') {
            for(const entry of sound.ambient) if(!entry.source.buffer)
                for(const node of entry.nodes) if(node.gain) {
                    node.gain.cancelScheduledValues(sound.context.currentTime); node.gain.value=0;
                }
        }
        if (mode === 'pads') for(const entry of sound.ambient) if(entry.source.buffer)
            for(const node of entry.nodes) if(node.gain) {
                node.gain.cancelScheduledValues(sound.context.currentTime); node.gain.value=0;
            }
        if (mode === 'water' || mode === 'pads') sound.reverb.disconnect();
        if(meter) {
            const node=await window.attachMeter(sound.context);
            sound.compressor.disconnect(); sound.compressor.connect(node); node.connect(sound.context.destination);
        }
    }
}"""

SAMPLE = """() => {
    const probe = window.probe;
    probe.start = performance.now(); probe.frames=[]; probe.calls={}; probe.stalls=[]; probe.signal=[];
    probe.previous = probe.contexts.map(c => c.playbackStats ? {...c.playbackStats.toJSON()} : null);
    probe.startStats = probe.previous.map(stats => stats ? {...stats} : null);
    let prior = performance.now();
    probe.timer = setInterval(() => {
        const ms=performance.now(), lateness=ms-prior-100; prior=ms;
        if(lateness>25) probe.stalls.push({name:'poll-late',ms,duration:lateness});
        probe.contexts.forEach((c,i) => {
            const stats=c.playbackStats ? {...c.playbackStats.toJSON()} : null, before=probe.previous[i];
            if(stats && before && stats.underrunEvents>before.underrunEvents)
                probe.underruns.push({ms:ms-probe.start,audioTime:c.currentTime,
                    count:stats.underrunEvents-before.underrunEvents,
                    duration:stats.underrunDuration-before.underrunDuration});
            probe.previous[i]=stats;
        });
    },100);
}"""

REPORT = """mode => {
    clearInterval(probe.timer);
    const frames=probe.frames.sort((a,b)=>a-b);
    return {mode, hidden:document.hidden, focused:document.hasFocus(),
        frames:{median:frames[Math.floor(frames.length*.5)],p99:frames[Math.floor(frames.length*.99)],max:frames.at(-1)},
        calls:probe.calls, events:probe.events, stalls:probe.stalls, underruns:probe.underruns,
        signal:{windows:probe.signal.length,
            peak:Math.max(0,...probe.signal.map(s=>s.peak)),
            curvature:Math.max(0,...probe.signal.map(s=>s.curvature)),
            zeroBlocks:probe.signal.reduce((n,s)=>n+s.zeroBlocks,0)},
        audio:probe.contexts.map((c,i) => {
            const stats=c.playbackStats?.toJSON?.(), before=probe.startStats[i];
            return {state:c.state,rate:c.sampleRate,latency:c.baseLatency,outputLatency:c.outputLatency,
                count:stats&&before?stats.underrunEvents-before.underrunEvents:null,
                duration:stats&&before?stats.underrunDuration-before.underrunDuration:null};
        })};
}"""


def load_audio(page):
    page.goto(f"http://127.0.0.1:{server.server_port}/audio-isolation")
    for filename in ["core.js", "audio.js"]:
        page.add_script_tag(content=(ROOT / filename).read_text(encoding="utf-8"))


server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            channel="msedge", headless=not args.headful,
            ignore_default_args=["--disable-background-timer-throttling",
                                 "--disable-renderer-backgrounding",
                                 "--disable-backgrounding-occluded-windows"],
            args=["--autoplay-policy=no-user-gesture-required"])
        try:
            if args.signal:
                for theme in ["koi", "tropical", "deep", "zen", "ink"]:
                    for mode in ["water", "dry", "full"]:
                        page = browser.new_page()
                        try:
                            load_audio(page)
                            print(json.dumps(page.evaluate(SIGNAL, {
                                "theme": theme, "mode": mode, "seconds": args.seconds})), flush=True)
                        finally:
                            page.close()
            else:
                for mode in args.modes:
                    page = browser.new_page(viewport={"width": 1200, "height": 800})
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    try:
                        page.context.new_cdp_session(page).send(
                            "Emulation.setFocusEmulationEnabled", {"enabled": False})
                        if mode == "game":
                            page.goto(f"http://127.0.0.1:{server.server_port}/index.html")
                            page.wait_for_function("typeof ZQApp !== 'undefined' && ZQApp.renderer")
                        else:
                            load_audio(page)
                        page.evaluate(INSTRUMENT)
                        page.evaluate("() => probe.signal=[]")
                        page.evaluate("() => { window.attachMeter = " + METER + "; }")
                        if mode == "game":
                            page.evaluate("""() => {
                                for(const name of ['render','sampleFrame','particleData']) probe.wrap(ZQApp.renderer,name);
                                probe.wrap(ZQ.Game.prototype,'update');
                            }""")
                            page.locator(f'[data-theme="{args.theme}"]').click()
                            page.locator("#begin-button").click()
                            page.evaluate("ZQApp.game.state.auto=true; ZQApp.game.state.spawnTimer=999")
                            page.evaluate("document.getElementById('sound-button').click()")
                            if args.meter:
                                page.wait_for_function("probe.lastSound?.active")
                                page.evaluate("""async () => {
                                    const sound=probe.lastSound, node=await attachMeter(sound.context);
                                    sound.compressor.disconnect(); sound.compressor.connect(node);
                                    node.connect(sound.context.destination);
                                }""")
                        else:
                            page.evaluate("theme => window.testTheme=theme", args.theme)
                            page.evaluate(START, {"mode": mode, "meter": args.meter})
                        page.wait_for_timeout(2000)
                        page.evaluate(SAMPLE)
                        blocker = None
                        if args.background:
                            cdp = browser.new_browser_cdp_session()
                            blocker = cdp.send("Target.createTarget", {"url": "about:blank", "newWindow": True})
                            cdp.send("Target.activateTarget", {"targetId": blocker["targetId"]})
                        page.wait_for_timeout(args.seconds * 1000)
                        report = page.evaluate(REPORT, mode)
                        if args.background:
                            report["backgroundVerified"] = not report["focused"]
                            if report["focused"]:
                                report["backgroundWarning"] = (
                                    "The new-window request did not produce measured focus loss. "
                                    "Do not interpret this sample as a background comparison.")
                        if mode == "game":
                            report["paused"] = page.evaluate("ZQApp.game.state.paused")
                        report["errors"] = errors
                        print(json.dumps(report), flush=True)
                        if blocker:
                            cdp.send("Target.closeTarget", {"targetId": blocker["targetId"]})
                    finally:
                        page.close()
        finally:
            browser.close()
finally:
    server.shutdown()
    server.server_close()
