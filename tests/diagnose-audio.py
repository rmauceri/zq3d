"""Bounded local Edge diagnostics; no existing browser profile or external uploads."""
import functools
import argparse
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--theme", choices=["koi", "tropical", "deep", "zen", "ink"], default="tropical")
parser.add_argument("--audio-only", action="store_true")
args = parser.parse_args()


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True,
                                    args=["--autoplay-policy=no-user-gesture-required"])
        page = browser.new_page(viewport={"width": 1200, "height": 800})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        cdp = page.context.new_cdp_session(page)
        audio_contexts = []
        cdp.send("WebAudio.enable")
        cdp.on("WebAudio.contextCreated", lambda event: audio_contexts.append(event["context"]))
        cdp.on("WebAudio.contextWillBeDestroyed", lambda event: audio_contexts.__setitem__(
            slice(None), [c for c in audio_contexts if c["contextId"] != event["contextId"]]))
        page.goto(f"http://127.0.0.1:{server.server_port}/index.html")
        page.wait_for_function("typeof ZQApp !== 'undefined' && ZQApp.renderer")
        page.evaluate("""() => {
            window.audioProbe = { calls: {}, frames: [], longTasks: [], contexts: [] };
            const Native = window.AudioContext;
            window.AudioContext = class extends Native {
                constructor(...args) { super(...args); audioProbe.contexts.push(this); }
            };
            const wrap = (object, name) => {
                const original = object[name];
                object[name] = function(...args) {
                    const start = performance.now();
                    try { return original.apply(this, args); }
                    finally {
                        const elapsed = performance.now() - start, stats = audioProbe.calls[name] ||= { count: 0, total: 0, max: 0 };
                        stats.count++; stats.total += elapsed; stats.max = Math.max(stats.max, elapsed);
                    }
                };
            };
            for (const name of ['schedule', 'tone', 'setTheme', 'startScheduler', 'waterNoise']) wrap(ZQAudio.Soundscape.prototype, name);
            for (const name of ['render', 'sampleFrame', 'particleData']) wrap(ZQApp.renderer, name);
            new PerformanceObserver(list => audioProbe.longTasks.push(...list.getEntries().map(e => ({ time: e.startTime, duration: e.duration }))))
                .observe({ type: 'longtask', buffered: true });
            let previous;
            const frame = time => { if (previous) audioProbe.frames.push(time - previous); previous = time; requestAnimationFrame(frame); };
            requestAnimationFrame(frame);
        }""")
        page.locator(f'[data-theme="{args.theme}"]').click()
        page.locator("#begin-button").click()
        page.evaluate("ZQApp.game.state.auto = true; ZQApp.game.state.spawnTimer = 999")
        modes = ["audio-only"] if args.audio_only else ["silent", "full", "water-only", "music-only", "dry-full", "no-drawing"]
        for mode in modes:
            if mode == "audio-only":
                page.evaluate("""async () => {
                    ZQApp.game.state.paused = true;
                    window.probeSound = new ZQAudio.Soundscape();
                    await probeSound.enable(ZQApp.game.state.themeId, 0.45);
                }""")
            if mode == "full":
                page.evaluate("document.getElementById('sound-button').click()")
            # Capture the sound instance through its scheduler rather than exposing private app state.
            if mode == "silent":
                page.evaluate("""() => {
                    const original = ZQAudio.Soundscape.prototype.schedule;
                    ZQAudio.Soundscape.prototype.schedule = function() { window.probeSound = this; return original.call(this); };
                }""")
            if mode == "water-only":
                page.evaluate("""() => {
                    probeSound.stopScheduler();
                    for (const entry of probeSound.sources) if (!entry.source.buffer) {
                        for (const node of entry.nodes) if (node.gain) node.gain.value = 0;
                    }
                }""")
            if mode == "music-only":
                page.evaluate("""() => {
                    for (const entry of probeSound.sources) if (entry.source.buffer)
                        for (const node of entry.nodes) if (node.gain) node.gain.value = 0;
                    probeSound.startScheduler();
                }""")
            if mode == "dry-full":
                page.evaluate("""async () => {
                    await probeSound.dispose();
                    window.probeSound = new ZQAudio.Soundscape();
                    await probeSound.enable(ZQApp.game.state.themeId, 0.45);
                    probeSound.reverb.disconnect();
                }""")
            if mode == "no-drawing":
                page.evaluate("ZQApp.renderer.render = () => {}")
            page.evaluate("""() => {
                audioProbe.frames = []; audioProbe.longTasks = []; audioProbe.calls = {};
                audioProbe.startStats = audioProbe.contexts.map(c => c.playbackStats?.toJSON?.());
            }""")
            page.wait_for_timeout(16000)
            report = page.evaluate("""mode => {
                const frames = audioProbe.frames.sort((a,b) => a-b);
                return { mode, frames: { median: frames[Math.floor(frames.length*.5)], p99: frames[Math.floor(frames.length*.99)],
                    max: frames.at(-1), over50: frames.filter(x => x > 50).length },
                    calls: audioProbe.calls, longTasks: audioProbe.longTasks,
                    audio: audioProbe.contexts.map((c, i) => {
                        const stats = c.playbackStats?.toJSON?.(), start = audioProbe.startStats[i];
                        return { sampleRate: c.sampleRate, baseLatency: c.baseLatency,
                            outputLatency: c.outputLatency, playbackStats: stats,
                            underrunsDuringSample: stats && start ? stats.underrunEvents - start.underrunEvents : null };
                    }),
                    renderer: { level: ZQApp.renderer.level, is3D: ZQApp.renderer.is3D } };
            }""", mode)
            print(json.dumps(report), flush=True)
            for audio_context in audio_contexts:
                print(json.dumps({"context": audio_context, "realtime": cdp.send(
                    "WebAudio.getRealtimeData", {"contextId": audio_context["contextId"]})}), flush=True)
        print(json.dumps({"errors": errors}), flush=True)
        browser.close()
finally:
    server.shutdown()
    server.server_close()
