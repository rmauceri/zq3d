'use strict';

const ZQRenderer = (() => {
    const PARAMS = {
        fov: 48 * Math.PI / 180, near: 0.1, far: 100,
        camera: { yaw: 0.12, pitch: 0.14, minPitch: 0.02, maxPitch: 1.12,
            minZoom: 0.62, maxZoom: 1.6, minDistance: 5, maxDistance: 60,
            floorClearance: 0.45, views: [0.14, 0.75, 0.02] },
        floorInset: 0.12, floorFade: [0.45, 0.85],
        quality: {
            high: { ratio: 2, motes: 130, plants: 46, fps: 60 },
            balanced: { ratio: 1.4, motes: 80, plants: 32, fps: 60 },
            battery: { ratio: 1, motes: 32, plants: 20, fps: 30 }
        },
        eye: '#101b21', eyeWhite: '#e9eddf', highlight: '#ffffff',
        food: '#d4ad62', ink: '#202332', neon: '#00d4ff', red: '#e83030',
        prizeWood: '#795540', prizeGold: '#d2b272', shell: '#d8bbae', pearl: '#fff3df'
    };
    const color = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mix = (a, b, t) => a.map((n, i) => n + (b[i] - n) * t);
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
    const groundCorners = (floor, extent) => [[-extent, floor, -extent], [-extent, floor, extent],
        [extent, floor, extent], [extent, floor, -extent]];
    const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    function multiply(a, b) {
        const m = new Float32Array(16);
        for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
            m[c * 4 + r] = a[r] * b[c * 4] + a[r + 4] * b[c * 4 + 1] + a[r + 8] * b[c * 4 + 2] + a[r + 12] * b[c * 4 + 3];
        return m;
    }
    function perspective(aspect) {
        const f = 1 / Math.tan(PARAMS.fov / 2);
        const n = PARAMS.near, far = PARAMS.far;
        return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + n) / (n - far), -1, 0, 0, 2 * far * n / (n - far), 0]);
    }
    function lookAt(eye, target) {
        const z = ZQ.normalize(eye.map((n, i) => n - target[i]));
        const x = ZQ.normalize(cross([0, 1, 0], z)), y = cross(z, x);
        return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
            -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
    }
    function transform(m, p) {
        const v = [p[0], p[1], p[2], p[3] ?? 1];
        return [0, 1, 2, 3].map(r => m[r] * v[0] + m[r + 4] * v[1] + m[r + 8] * v[2] + m[r + 12] * v[3]);
    }
    function inverse(m) {
        const rows = Array.from({ length: 4 }, (_, r) => [
            m[r], m[r + 4], m[r + 8], m[r + 12], ...[0, 1, 2, 3].map(c => c === r ? 1 : 0)
        ]);
        for (let i = 0; i < 4; i++) {
            let pivot = i;
            for (let j = i + 1; j < 4; j++) if (Math.abs(rows[j][i]) > Math.abs(rows[pivot][i])) pivot = j;
            [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
            const divisor = rows[i][i];
            if (Math.abs(divisor) < 1e-10) throw new Error('The camera transform is not invertible.');
            rows[i] = rows[i].map(n => n / divisor);
            for (let j = 0; j < 4; j++) {
                if (j === i) continue;
                const factor = rows[j][i];
                rows[j] = rows[j].map((n, c) => n - rows[i][c] * factor);
            }
        }
        return new Float32Array(Array.from({ length: 16 }, (_, i) => rows[i % 4][4 + Math.floor(i / 4)]));
    }
    function model(pos, yaw = 0, pitch = 0, scale = 1) {
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
        return new Float32Array([
            cy * cp * scale, sp * scale, -sy * cp * scale, 0,
            -cy * sp * scale, cp * scale, sy * sp * scale, 0,
            sy * scale, 0, cy * scale, 0, ...pos, 1
        ]);
    }
    function rotateX(angle) {
        const c = Math.cos(angle), s = Math.sin(angle);
        return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
    }
    const prizePositions = (bounds, equipped) => {
        const positions = {
            chest: [-bounds.width * 0.3, bounds.floor + 0.12, 1.1],
            oyster: [bounds.width * 0.08, bounds.floor + 0.08, 0.6],
            lantern: [bounds.width * 0.36, bounds.floor + 0.12, 1.1],
            arch: [-bounds.width * 0.08, bounds.floor + 0.04, -1.5]
        };
        return equipped.filter(id => Object.hasOwn(positions, id)).map(id => ({ id, pos: positions[id] }));
    };
    const seeded = seed => () => {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        return seed / 4294967296;
    };

    class Geometry {
        constructor() { this.vertices = []; }
        vertex(p, n, c, part) { this.vertices.push(...p, ...n, ...c, part); }
        triangle(a, b, c, tint, part = 2) {
            const n = ZQ.normalize(cross(b.map((v, i) => v - a[i]), c.map((v, i) => v - a[i])));
            for (const p of [a, b, c]) this.vertex(p, n, tint, part);
        }
        box(center, radius, tint, part = 2) {
            const points = [[-1,-1,-1], [1,-1,-1], [1,1,-1], [-1,1,-1],
                [-1,-1,1], [1,-1,1], [1,1,1], [-1,1,1]].map(p => p.map((n, i) => center[i] + n * radius[i]));
            for (const [a, b, c, d] of [[4,5,6,7], [1,0,3,2], [0,4,7,3], [5,1,2,6], [3,7,6,2], [0,1,5,4]]) {
                this.triangle(points[a], points[b], points[c], tint, part);
                this.triangle(points[a], points[c], points[d], tint, part);
            }
        }
        sphere(center, radius, tint, part = 2, rings = 10, segments = 16, roughness = 0) {
            const point = (r, s) => {
                const theta = r / rings * Math.PI, phi = s / segments * Math.PI * 2;
                const n = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
                const ripple = 1 + roughness * Math.sin(n[0] * 9 + n[2] * 5) * Math.cos(n[1] * 12);
                const p = n.map((v, i) => center[i] + v * radius[i] * ripple);
                return [p, ZQ.normalize(n.map((v, i) => v / radius[i]))];
            };
            for (let r = 0; r < rings; r++) for (let s = 0; s < segments; s++) {
                const a = point(r, s), b = point(r + 1, s), c = point(r + 1, s + 1), d = point(r, s + 1);
                for (const [p, n] of [a, c, b, a, d, c]) this.vertex(p, n, tint, part);
            }
        }
        tube(path, radius, tint, part = 2, sides = 6) {
            for (let j = 0; j < path.length - 1; j++) {
                const a = path[j], b = path[j + 1];
                const axis = ZQ.normalize(b.map((v, i) => v - a[i]));
                const x = ZQ.normalize(cross(axis, Math.abs(axis[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]));
                const y = cross(axis, x);
                const ring = (p, angle, fraction) => {
                    const n = x.map((v, i) => v * Math.cos(angle) + y[i] * Math.sin(angle));
                    return [p.map((v, i) => v + n[i] * radius * (1 - fraction * 0.7)), n];
                };
                for (let i = 0; i < sides; i++) {
                    const t = i / sides * Math.PI * 2, t2 = (i + 1) / sides * Math.PI * 2;
                    const p = ring(a, t, j / path.length), q = ring(b, t, (j + 1) / path.length);
                    const r = ring(b, t2, (j + 1) / path.length), s = ring(a, t2, j / path.length);
                    for (const [v, n] of [p, r, q, p, s, r]) this.vertex(v, n, tint, part);
                }
            }
        }
    }

    function fishGeometry(def) {
        const g = new Geometry();
        const body = color(def.body), fin = color(def.fin), accent = color(def.accent);
        const ry = def.shape === 'round' ? 0.4 : def.shape === 'tall' ? 0.6 : def.shape === 'slim' ? 0.25 : 0.32;
        const rz = def.shape === 'round' ? 0.3 : def.shape === 'tall' ? 0.17 : 0.21;
        g.sphere([0, 0, 0], [0.76, ry, rz], body, 0, 14, 24);
        if (def.id === 'barreleye') g.sphere([0.34, 0.08, 0], [0.38, 0.26, 0.21], mix(body, accent, 0.38), 2, 10, 16);
        g.sphere([-0.68, 0, 0], [0.21, 0.12, 0.1], fin, 1, 6, 10);
        for (let i = 0; i < 9; i++) {
            const y1 = (i / 9 - 0.5) * 0.98, y2 = ((i + 1) / 9 - 0.5) * 0.98;
            const shade = mix(fin, accent, i % 2 ? 0.13 : 0.4);
            g.triangle([-0.72, 0, 0], [-1.32 + Math.abs(y1) * 0.15, y1, 0.015], [-1.32 + Math.abs(y2) * 0.15, y2, 0.015], shade, 1);
        }
        const height = def.shape === 'tall' ? 0.92 : ry + 0.24;
        g.triangle([0.22, ry * 0.8, 0], [-0.35, height, 0], [-0.61, ry * 0.5, 0], mix(fin, accent, 0.3), 1);
        g.triangle([0.15, -ry * 0.8, 0], [-0.32, -height * 0.9, 0], [-0.6, -ry * 0.5, 0], fin, 1);
        for (const side of [-1, 1]) {
            g.triangle([0.18, -ry * 0.28, side * rz * 0.8], [-0.23, -ry * 0.9, side * 0.64], [-0.35, -ry * 0.4, side * rz], mix(fin, accent, 0.28), 1);
            if (def.id === 'barreleye') {
                g.sphere([0.35, 0.24, side * 0.12], [0.07, 0.1, 0.065], accent, 3, 7, 10);
                g.sphere([0.37, 0.31, side * 0.13], [0.04, 0.025, 0.04], color(PARAMS.eye), 2, 6, 8);
            } else {
                g.sphere([0.46, ry * 0.3, side * rz * 0.83], [0.11, 0.105, 0.074], color(PARAMS.eyeWhite), 2, 7, 10);
                g.sphere([0.49, ry * 0.3, side * (rz * 0.83 + 0.061)], [0.056, 0.065, 0.026], color(PARAMS.eye), 2, 6, 10);
                g.sphere([0.5, ry * 0.3 + 0.023, side * (rz * 0.83 + 0.083)], [0.02, 0.022, 0.012], color(PARAMS.highlight), 3, 5, 6);
            }
            if (def.shape === 'tall') {
                g.tube([[0.15, -0.32, side * 0.12], [0.08, -0.75, side * 0.1], [-0.22, -1.1, side * 0.13]], 0.016, fin, 1, 4);
            }
        }
        g.sphere([0.72, -0.03, 0], [0.035, 0.043, 0.09], mix(body, color(PARAMS.eye), 0.35), 2, 5, 8);
        if (def.id === 'angler') {
            g.tube([[0.23, 0.3, 0], [0.36, 0.7, 0], [0.65, 0.79, 0], [0.8, 0.61, 0]], 0.025, accent, 1);
            g.sphere([0.8, 0.59, 0], [0.095, 0.095, 0.095], accent, 3, 8, 12);
        }
        return g;
    }

    function creatureGeometry(def) {
        const g = new Geometry();
        const body = color(def.body), accent = color(def.accent);
        if (def.kind === 'crab') {
            g.sphere([0, 0.1, 0], [0.65, 0.25, 0.45], body, 8, 10, 18);
            for (const side of [-1, 1]) {
                for (let i = 0; i < 4; i++) {
                    const z = 0.1 - i * 0.17;
                    g.tube([[side * 0.45, 0.02, z], [side * 0.92, -0.1, z - 0.2], [side * 1.05, -0.38, z + 0.12]],
                        0.052, mix(body, accent, 0.25), 9, 5);
                }
                g.tube([[side * 0.45, 0.1, 0.26], [side * 0.87, 0.17, 0.6], [side * 0.91, 0.31, 0.78]], 0.09, body, 8);
                g.sphere([side * 0.91, 0.31, 0.78], [0.2, 0.15, 0.21], accent, 8, 7, 10);
                g.tube([[side * 0.98, 0.32, 0.89], [side * 1.06, 0.33, 1.12], [side * 0.95, 0.33, 1.15]], 0.065, body, 8);
                g.tube([[side * 0.83, 0.32, 0.9], [side * 0.81, 0.33, 1.09]], 0.06, body, 8);
                g.tube([[side * 0.23, 0.22, 0.29], [side * 0.26, 0.44, 0.37]], 0.03, body, 2);
                g.sphere([side * 0.26, 0.44, 0.37], [0.08, 0.085, 0.065], color(PARAMS.eye), 2, 6, 8);
                g.sphere([side * 0.25, 0.46, 0.424], [0.019, 0.022, 0.013], color(PARAMS.highlight), 3, 4, 6);
            }
            for (let i = 0; i < 5; i++) g.sphere([(i - 2) * 0.14, 0.34, -0.04], [0.026, 0.022, 0.12], accent, 2, 4, 6);
        } else if (def.kind === 'eel') {
            const path = Array.from({ length: 20 }, (_, i) => [0.62 - i * 0.14, Math.sin(i * 0.32) * 0.07, 0]);
            g.tube(path, 0.25, body, 8, 12);
            g.sphere([0.66, 0.04, 0], [0.38, 0.23, 0.25], body, 8, 10, 16);
            for (let i = 1; i < path.length - 1; i++) {
                const a = path[i], b = path[i + 1];
                g.triangle([a[0], a[1] + 0.15, 0], [a[0], a[1] + 0.38 - i * 0.01, 0], [b[0], b[1] + 0.15, 0], accent, 8);
            }
            for (const side of [-1, 1]) {
                g.sphere([0.76, 0.12, side * 0.19], [0.085, 0.082, 0.055], accent, 3, 6, 8);
                g.sphere([0.78, 0.12, side * 0.234], [0.04, 0.06, 0.018], color(PARAMS.eye), 2, 5, 8);
            }
            g.tube([[0.93, -0.015, -0.13], [1.02, -0.03, 0], [0.93, -0.015, 0.13]], 0.018, color(PARAMS.eye), 2, 4);
        } else if (def.kind === 'jellyfish') {
            g.sphere([0, 0.23, 0], [0.64, 0.43, 0.64], body, 8, 12, 20);
            g.sphere([0, 0.24, 0], [0.26, 0.17, 0.26], accent, 3, 8, 12);
            for (let i = 0; i < 10; i++) {
                const angle = i / 10 * Math.PI * 2, r = i % 2 ? 0.44 : 0.3;
                const path = Array.from({ length: 11 }, (_, j) => [
                    Math.cos(angle) * r + Math.sin(j * 0.8 + i) * 0.06,
                    -j * (i % 2 ? 0.12 : 0.17),
                    Math.sin(angle) * r + Math.cos(j + i) * 0.06
                ]);
                g.tube(path, i % 2 ? 0.018 : 0.038, mix(body, accent, 0.6), 9, 5);
            }
        } else {
            const squid = def.kind === 'squid';
            g.sphere([0, squid ? 0.48 : 0.24, 0], [squid ? 0.32 : 0.55, squid ? 0.88 : 0.58, 0.4], body, 8, 12, 18);
            if (squid) {
                g.triangle([0, 1.22, 0], [-0.68, 0.48, 0], [0, 0.35, 0], mix(body, accent, 0.45), 8);
                g.triangle([0, 1.22, 0], [0, 0.35, 0], [0.68, 0.48, 0], mix(body, accent, 0.45), 8);
            }
            for (let i = 0; i < (squid ? 10 : 8); i++) {
                const angle = i / 8 * Math.PI * 2;
                const length = squid ? (i > 7 ? 1.55 : 0.85) : 1.15;
                const path = Array.from({ length: 12 }, (_, j) => {
                    const t = j / 11;
                    return [Math.cos(angle) * (0.15 + t * 0.65),
                        -0.1 - t * length + Math.pow(t, 4) * 0.5,
                        Math.sin(angle) * (0.2 + t * 0.65) + Math.sin(t * 5) * 0.08];
                });
                g.tube(path, squid ? 0.045 : 0.09, mix(body, accent, i % 3 / 5), 9, 6);
                if (!squid) for (let j = 3; j < 11; j += 3) g.sphere(path[j], [0.055, 0.035, 0.055], accent, 9, 4, 6);
            }
            for (const side of [-1, 1]) {
                g.sphere([side * 0.26, 0.16, 0.32], [0.14, 0.15, 0.1], color(PARAMS.eyeWhite), 2, 8, 10);
                g.sphere([side * 0.26, 0.16, 0.407], [0.075, 0.09, 0.026], color(PARAMS.eye), 2, 6, 10);
                g.sphere([side * 0.24, 0.2, 0.43], [0.023, 0.025, 0.012], color(PARAMS.highlight), 3, 4, 6);
            }
            for (let i = 0; i < 9; i++) {
                const a = i * 2.4;
                g.sphere([Math.cos(a) * 0.4, 0.3 + Math.sin(a) * 0.24, 0.33], [0.042, 0.04, 0.025], accent, 3, 4, 6);
            }
        }
        return g;
    }

    function prizeGeometry(theme, id) {
        const base = new Geometry(), lid = new Geometry();
        const gold = color(PARAMS.prizeGold), wood = color(PARAMS.prizeWood);
        if (id === 'chest') {
            base.box([0, 0.22, 0], [0.55, 0.22, 0.36], wood);
            base.box([0, 0.445, 0], [0.49, 0.01, 0.31], color(PARAMS.eye));
            for (const x of [-0.36, 0.36]) {
                base.box([x, 0.23, 0], [0.045, 0.24, 0.375], gold);
                lid.box([x, 0.09, 0.35], [0.046, 0.11, 0.385], gold);
            }
            lid.box([0, 0.09, 0.35], [0.56, 0.09, 0.37], wood);
            base.box([0, 0.31, 0.375], [0.08, 0.095, 0.025], gold);
            for (let i = 0; i < 7; i++) base.sphere([Math.sin(i * 2.4) * 0.3, 0.46, Math.cos(i * 2.4) * 0.18],
                [0.075, 0.02, 0.075], gold, 3, 4, 8);
        } else if (id === 'oyster') {
            const shell = color(PARAMS.shell);
            base.sphere([0, 0.08, 0], [0.56, 0.1, 0.46], shell, 2, 10, 18, 0.025);
            base.sphere([0, 0.14, 0], [0.44, 0.045, 0.35], mix(shell, gold, 0.2), 2, 8, 16);
            base.sphere([0, 0.25, 0.05], [0.145, 0.145, 0.145], color(PARAMS.pearl), 3, 12, 18);
            lid.sphere([0, 0.02, 0.33], [0.56, 0.105, 0.46], shell, 2, 10, 18, 0.04);
            for (let i = 0; i < 11; i++) {
                const angle = (i / 10 - 0.5) * Math.PI;
                lid.tube([[0, 0.065, 0], [Math.sin(angle) * 0.27, 0.13, 0.32],
                    [Math.sin(angle) * 0.48, 0.06, 0.33 + Math.cos(angle) * 0.4]],
                    0.013, mix(shell, color(PARAMS.pearl), 0.55), 2, 4);
            }
        } else if (id === 'lantern') {
            const rock = color(theme.rock);
            base.box([0, 0.08, 0], [0.35, 0.08, 0.32], rock);
            base.box([0, 0.23, 0], [0.16, 0.09, 0.16], rock);
            for (const x of [-0.25, 0.25]) for (const z of [-0.22, 0.22])
                base.tube([[x, 0.3, z], [x, 0.83, z]], 0.027, gold, 2, 5);
            base.sphere([0, 0.55, 0], [0.15, 0.23, 0.15], color(theme.light), 3, 10, 16);
            base.box([0, 0.87, 0], [0.33, 0.065, 0.3], rock);
            base.sphere([0, 0.96, 0], [0.23, 0.14, 0.21], rock, 2, 7, 12);
        } else {
            for (const side of [-1, 1]) for (let i = 0; i < 3; i++)
                base.box([side * 0.64, 0.17 + i * 0.3, 0], [0.21, 0.145, 0.28], mix(color(theme.rock), color(theme.sand), i * 0.08));
            for (let i = 0; i < 7; i++) {
                const angle = i / 6 * Math.PI;
                base.sphere([Math.cos(angle) * 0.64, 0.84 + Math.sin(angle) * 0.48, 0],
                    [0.23, 0.21, 0.28], color(theme.rock), 2, 6, 9, 0.04);
            }
            for (const side of [-1, 1]) base.sphere([side * 0.65, 0.94, 0.18], [0.25, 0.075, 0.15], color(theme.plants[0]), 2, 5, 8);
        }
        return { base, lid: lid.vertices.length ? lid : null };
    }

    function environment(theme, bounds, plantCount, groundExtent) {
        const g = new Geometry(), random = seeded(7319);
        const sand = color(theme.sand), rock = color(theme.rock);
        const floor = bounds.floor;
        const w = bounds.width;
        const height = (x, z) => floor + Math.sin(x * 1.3 + z) * 0.06 + Math.cos(z * 1.7) * 0.035;
        for (let x = -w - 5; x < w + 5; x += 0.8) for (let z = -10; z < 8; z += 0.8) {
            const a = [x, height(x, z), z], b = [x, height(x, z + 0.8), z + 0.8];
            const c = [x + 0.8, height(x + 0.8, z + 0.8), z + 0.8], d = [x + 0.8, height(x + 0.8, z), z];
            g.triangle(a, b, c, sand, 5); g.triangle(a, c, d, sand, 5);
        }
        const outerFloor = groundCorners(floor - PARAMS.floorInset, groundExtent);
        g.triangle(outerFloor[0], outerFloor[1], outerFloor[2], sand, 5);
        g.triangle(outerFloor[0], outerFloor[2], outerFloor[3], sand, 5);
        const rocks = [];
        for (let i = 0; i < 22; i++) {
            const side = i % 2 ? -1 : 1;
            const x = side * (w * 0.52 + random() * w * 0.42);
            const z = -2.8 + random() * 4.3;
            const size = i < 6 ? 0.8 + random() * 1.1 : 0.18 + random() * 0.55;
            const tall = theme.id === 'deep' ? 1.7 : 0.65;
            const pos = [x, floor + size * tall * 0.34, z];
            const radius = [size, size * tall, size * 0.75];
            g.sphere(pos, radius, mix(rock, sand, random() * 0.3), 6, 6, 9, 0.09);
            rocks.push({ pos, radius });
        }
        if (theme.id === 'zen' || theme.id === 'ink') {
            for (let i = 0; i < 3; i++) {
                const radius = [1.05 - i * 0.23, 0.38, 0.7 - i * 0.15];
                g.sphere([-w * 0.25 + i * 0.09, floor + 0.28 + i * 0.5, -1.4], radius, mix(rock, sand, i * 0.13), 6, 8, 12, 0.035);
            }
        }
        const plants = [];
        for (let i = 0; i < plantCount; i++) {
            const side = i % 2 ? 1 : -1;
            const x = side * (w * 0.44 + random() * w * 0.61);
            const z = -3.8 + random() * 4.4;
            const h = (0.7 + random() * 2.9) * (theme.id === 'zen' ? 0.62 : 1);
            const tint = color(theme.plants[i % theme.plants.length]);
            plants.push({ x, z, h, tint: theme.plants[i % theme.plants.length] });
            if (theme.id === 'tropical' && i % 3 !== 0) {
                const stem = [[x, floor, z], [x + 0.08, floor + h * 0.45, z], [x - 0.06, floor + h * 0.65, z]];
                g.tube(stem, 0.09, tint, 4);
                for (let j = 0; j < 5; j++) {
                    const angle = j * 2.4 + i, y = floor + h * (0.2 + j * 0.1);
                    const end = [x + Math.cos(angle) * h * 0.38, y + h * 0.25, z + Math.sin(angle) * h * 0.26];
                    g.tube([[x, y, z], [end[0], y + h * 0.14, end[2]], end], 0.075, tint, 4);
                    g.sphere(end, [0.075, 0.11, 0.075], mix(tint, color(theme.light), 0.28), 4, 4, 6);
                }
            } else {
                const path = Array.from({ length: 9 }, (_, j) => [x + Math.sin(j * 0.35 + i) * j * 0.033, floor + h * j / 8, z]);
                g.tube(path, theme.id === 'ink' ? 0.016 : 0.027, tint, 4, 4);
                for (let j = 2; j < 9; j++) {
                    const root = path[j], sign = j % 2 ? -1 : 1;
                    const length = (0.3 + random() * 0.35) * (1 - j * 0.04);
                    const tip = [root[0] + sign * length, root[1] + length * 0.7, root[2] + 0.06];
                    const middle = [(root[0] + tip[0]) / 2, (root[1] + tip[1]) / 2, root[2] + 0.14];
                    const back = [middle[0], middle[1] - 0.1, root[2] - 0.12];
                    g.triangle(root, middle, tip, tint, 4);
                    g.triangle(root, tip, back, mix(tint, color(theme.light), 0.12), 4);
                }
                if (theme.id === 'deep') g.sphere(path[8], [0.048, 0.08, 0.048], color(theme.light), 3, 4, 6);
            }
        }
        for (let i = 0; i < 60; i++) {
            const x = (random() - 0.5) * w * 2.5, z = (random() - 0.5) * 9, r = 0.025 + random() * 0.075;
            g.sphere([x, height(x, z) + r * 0.4, z], [r * 1.4, r * 0.7, r], mix(sand, rock, random() * 0.7), 6, 3, 5);
        }
        return { geometry: g, rocks, plants };
    }

    const VERTEX = `
        precision mediump float;
        attribute vec3 a_position;
        attribute vec3 a_normal;
        attribute vec3 a_color;
        attribute float a_part;
        uniform mat4 u_model;
        uniform mat4 u_vp;
        uniform float u_time;
        uniform float u_phase;
        uniform float u_kind;
        uniform float u_motion;
        varying vec3 v_world;
        varying vec3 v_normal;
        varying vec3 v_local;
        varying vec3 v_color;
        varying float v_part;
        void main() {
            vec3 p = a_position;
            if (u_kind < 0.5) {
                float tail = max(0.0, -p.x + 0.15);
                p.z += sin(u_phase + p.x * 4.0) * tail * tail * 0.11 * u_motion;
                if (a_part > 0.5 && a_part < 1.5) p.y += sin(u_phase * 0.65 + p.z * 4.0) * abs(p.z) * 0.16 * u_motion;
            } else if (u_kind < 1.5 && a_part > 3.5 && a_part < 4.5) {
                float h = max(0.0, p.y + 3.25);
                p.x += sin(u_time * 0.65 + p.x + h * 1.7) * h * 0.065 * u_motion;
                p.z += cos(u_time * 0.43 + p.x) * h * 0.035 * u_motion;
            } else if (u_kind > 2.5 && u_kind < 3.5) {
                p.z += sin(u_phase + p.x * 4.0) * (0.06 + max(0.0, -p.x) * 0.17) * u_motion;
            } else if (u_kind > 1.5) {
                if (a_part > 8.5) {
                    p.x += sin(u_phase + p.y * 4.0 + p.z * 3.0) * abs(p.y) * 0.14 * u_motion;
                    p.z += cos(u_phase * 0.8 + p.y * 3.0) * abs(p.y) * 0.08 * u_motion;
                } else if (a_part > 7.5) {
                    p.xz *= 1.0 + sin(u_phase) * 0.045 * u_motion;
                }
            }
            vec4 world = u_model * vec4(p, 1.0);
            v_world = world.xyz;
            v_normal = normalize(mat3(u_model) * a_normal);
            v_local = a_position;
            v_color = a_color;
            v_part = a_part;
            gl_Position = u_vp * world;
        }`;
    const WATER_COLOR = `
        vec3 waterColor(vec2 uv) {
            vec3 base = mix(u_water * 0.55, u_surface, pow(uv.y, 2.2) * 0.6);
            if (u_ink > 0.5) base = mix(u_water, u_surface, 0.25 + uv.y * 0.65);
            float ray1 = pow(max(0.0, sin((uv.x + uv.y * 0.22) * 24.0 + sin(u_time * 0.08))), 14.0);
            float ray2 = pow(max(0.0, sin((uv.x + uv.y * 0.17) * 39.0 - u_time * 0.07)), 24.0);
            float rays = (ray1 * 0.085 + ray2 * 0.04) * pow(uv.y, 0.75);
            base += u_light * rays * (1.0 - u_deep * 0.85) * (1.0 - u_ink * 0.85);
            vec2 centered = (uv - vec2(0.48, 0.53)) * vec2(min(u_aspect, 1.4), 1.0);
            base *= 1.0 - min(0.36, dot(centered, centered) * 0.55) * (1.0 - u_ink * 0.88);
            return base;
        }`;
    const FRAGMENT = `
        precision mediump float;
        uniform vec3 u_camera;
        uniform vec3 u_water;
        uniform vec3 u_surface;
        uniform vec3 u_light;
        uniform vec3 u_accent;
        uniform float u_time;
        uniform float u_pattern;
        uniform float u_ink;
        uniform float u_deep;
        uniform float u_health;
        uniform float u_alpha;
        uniform float u_aspect;
        uniform vec2 u_resolution;
        varying vec3 v_world;
        varying vec3 v_normal;
        varying vec3 v_local;
        varying vec3 v_color;
        varying float v_part;
        ${WATER_COLOR}
        void main() {
            vec3 base = v_color;
            vec3 normal = normalize(v_normal);
            vec3 view = normalize(u_camera - v_world);
            if (!gl_FrontFacing) normal = -normal;
            float facing = abs(dot(normal, view));
            float glow = 0.0;
            if (v_part < 0.5) {
                if (u_pattern < 0.5) {
                    float patch = sin(v_local.x * 9.0 + sin(v_local.y * 14.0)) * cos(v_local.z * 12.0 + v_local.x * 3.0);
                    base = mix(base, u_accent, smoothstep(0.25, 0.42, patch) * 0.92);
                } else if (u_pattern < 1.5) {
                    float bar = min(abs(v_local.x + 0.45), min(abs(v_local.x + 0.01), abs(v_local.x - 0.43)));
                    base = mix(base, vec3(0.055, 0.07, 0.065), 1.0 - smoothstep(0.1, 0.13, bar));
                    base = mix(base, u_accent, 1.0 - smoothstep(0.07, 0.09, bar));
                } else if (u_pattern < 2.5) {
                    float oval = length((v_local.xy + vec2(0.08, -0.05)) * vec2(1.35, 3.8));
                    base = mix(base, vec3(0.03, 0.07, 0.12), smoothstep(0.42, 0.5, oval) * (1.0 - smoothstep(0.75, 0.85, oval)));
                } else if (u_pattern < 3.5) {
                    base = mix(base, u_accent, smoothstep(0.45, 0.65, sin(v_local.x * 17.0)));
                } else if (u_pattern < 4.5) {
                    float stripe = 1.0 - smoothstep(0.035, 0.067, abs(v_local.y - 0.03));
                    vec3 stripeColor = v_local.x > -0.05 ? vec3(0.0, 0.83, 1.0) : vec3(0.91, 0.19, 0.19);
                    base = mix(base, stripeColor, stripe);
                    glow = stripe * 0.28;
                } else if (u_pattern < 5.5) {
                    float spots = sin(v_local.x * 30.0) * sin(v_local.y * 30.0);
                    base = mix(base, u_accent, smoothstep(0.6, 0.8, spots));
                } else if (u_pattern < 6.5) {
                    float spots = step(0.65, sin(v_local.x * 39.0)) * (1.0 - smoothstep(0.015, 0.045, abs(v_local.y + 0.11)));
                    base = mix(base, u_accent, spots);
                    glow = spots * 1.3;
                }
                float scales = sin(v_local.x * 90.0 + sin(v_local.y * 64.0)) * sin(v_local.y * 64.0);
                base *= 0.98 + scales * 0.018;
            }
            vec3 lightDir = normalize(vec3(-0.35, 0.9, 0.45));
            float diffuse = max(0.0, dot(normal, lightDir));
            float rim = pow(1.0 - facing, 3.0);
            float specular = pow(max(0.0, dot(normal, normalize(view + lightDir))), 38.0);
            vec3 lit = base * (0.48 + diffuse * 0.55) + u_light * (specular * 0.3 + rim * 0.13);
            float c1 = sin(v_world.x * 2.7 + sin(v_world.z * 2.4 + u_time * 0.26) + u_time * 0.35);
            float c2 = sin(v_world.z * 3.1 + sin(v_world.x * 2.2 - u_time * 0.22));
            float caustic = pow(max(0.0, 1.0 - abs(c1 + c2) * 0.55), 12.0);
            lit += u_light * caustic * (0.06 + max(0.0, normal.y) * 0.14) * (1.0 - u_deep * 0.8);
            if (v_part > 4.5 && v_part < 5.5) {
                float sandWave = sin(v_world.x * 4.0 + v_world.z * 3.0 + sin(v_world.z * 1.5));
                lit *= 0.94 + sandWave * 0.045;
            }
            if (v_part > 2.5 && v_part < 3.5) glow = 0.8;
            lit += base * glow;
            lit += u_accent * rim * u_deep * 0.45 * (1.0 - step(3.5, v_part));
            if (u_ink > 0.5) {
                float edge = 1.0 - smoothstep(0.06, 0.24, facing);
                float hatch = step(0.76, sin((v_local.x + v_local.y) * 70.0)) * (1.0 - smoothstep(0.2, 0.6, diffuse));
                vec3 paper = mix(vec3(0.94, 0.91, 0.85), base, 0.12);
                lit = mix(paper, u_accent, min(0.85, edge * 0.82 + hatch * 0.28));
                if (v_part > 1.5 && v_part < 3.5) lit = base;
            }
            float distanceToEye = length(v_world - u_camera);
            float fog = 1.0 - exp(-max(0.0, distanceToEye - 5.0) * (0.025 + (1.0 - u_health) * 0.14 + u_deep * 0.012));
            if (v_part > 4.5 && v_part < 5.5) {
                fog = max(fog, smoothstep(${(PARAMS.far * PARAMS.floorFade[0]).toFixed(1)}, ${(PARAMS.far * PARAMS.floorFade[1]).toFixed(1)}, distanceToEye));
                lit = mix(lit, waterColor(gl_FragCoord.xy / u_resolution), fog);
            } else {
                lit = mix(lit, u_water, min(0.86, fog));
            }
            gl_FragColor = vec4(lit, u_alpha);
        }`;
    const BACK_VERTEX = `
        attribute vec2 a_position;
        varying vec2 v_uv;
        void main() { v_uv = a_position * 0.5 + 0.5; gl_Position = vec4(a_position, 0.999, 1.0); }`;
    const BACK_FRAGMENT = `
        precision mediump float;
        varying vec2 v_uv;
        uniform vec3 u_water;
        uniform vec3 u_surface;
        uniform vec3 u_light;
        uniform float u_time;
        uniform float u_deep;
        uniform float u_ink;
        uniform float u_aspect;
        ${WATER_COLOR}
        void main() {
            gl_FragColor = vec4(waterColor(v_uv), 1.0);
        }`;
    const POINT_VERTEX = `
        attribute vec3 a_position;
        attribute vec3 a_color;
        attribute float a_size;
        attribute float a_alpha;
        attribute float a_kind;
        uniform mat4 u_vp;
        uniform float u_ratio;
        varying vec3 v_color;
        varying float v_alpha;
        varying float v_kind;
        void main() {
            vec4 p = u_vp * vec4(a_position, 1.0);
            gl_Position = p;
            gl_PointSize = clamp(a_size * u_ratio * 14.0 / max(1.0, p.w), 1.0, 48.0);
            v_color = a_color; v_alpha = a_alpha; v_kind = a_kind;
        }`;
    const POINT_FRAGMENT = `
        precision mediump float;
        varying vec3 v_color;
        varying float v_alpha;
        varying float v_kind;
        void main() {
            vec2 p = gl_PointCoord * 2.0 - 1.0;
            float d = length(p);
            if (d > 1.0) discard;
            float alpha = (1.0 - smoothstep(0.0, 1.0, d)) * v_alpha;
            if (v_kind > 0.5 && v_kind < 1.5) alpha = (smoothstep(0.5, 0.8, d) * (1.0 - smoothstep(0.82, 1.0, d)) + pow(max(0.0, 1.0 - length(p - vec2(-0.3, 0.35)) * 3.0), 3.0)) * v_alpha;
            if (v_kind > 1.5) alpha = (1.0 - smoothstep(0.7, 1.0, abs(p.x) * 0.8 + abs(p.y))) * v_alpha;
            gl_FragColor = vec4(v_color, alpha);
        }`;

    class Renderer {
        constructor(host, callbacks = {}) {
            this.host = host;
            this.callbacks = callbacks;
            this.camera = { yaw: PARAMS.camera.yaw, pitch: PARAMS.camera.pitch, zoom: 1, target: [0, 0, 0], follow: null };
            this.quality = 'auto';
            this.level = matchMedia('(pointer: coarse)').matches ? 'balanced' : 'high';
            this.reduced = false;
            this.lost = false;
            this.width = 1; this.height = 1;
            this.resources = [];
            this.theme = null;
            this.frameSamples = [];
            this.newCanvas();
            try {
                this.gl = this.canvas.getContext('webgl', { alpha: false, antialias: true, preserveDrawingBuffer: false });
                if (!this.gl) throw new Error('WebGL is not available on this device.');
                this.initializeGL();
                this.is3D = true;
            } catch (error) {
                console.warn('zq3d: using the perspective canvas renderer.', error);
                this.useFallback(error.message);
            }
            this.onLost = event => {
                event.preventDefault();
                this.lost = true;
                this.callbacks.lost?.();
            };
            this.onRestored = () => {
                try {
                    this.resources = [];
                    this.sceneMesh = null;
                    this.fishMeshes = [];
                    this.creatureMeshes = [];
                    this.cloudMesh = null;
                    this.prizeMeshes = {};
                    this.attributeCount = 0;
                    this.initializeGL();
                    if (this.theme) this.setTheme(this.theme, this.bounds);
                    this.lost = false;
                    this.callbacks.restored?.();
                } catch (error) {
                    console.error('zq3d: the graphics context could not be restored.', error);
                    this.useFallback('3D graphics could not be restored. Perspective mode is still playable.');
                    this.lost = false;
                    this.callbacks.restored?.();
                }
            };
            this.canvas.addEventListener('webglcontextlost', this.onLost);
            this.canvas.addEventListener('webglcontextrestored', this.onRestored);
        }
        newCanvas() {
            this.canvas?.remove();
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'aquarium';
            this.canvas.tabIndex = 0;
            this.canvas.setAttribute('aria-label', 'Living aquarium. Click, tap, or press G to tap the glass; drag to orbit. Open Residents for fish details and following. Camera buttons support keyboard controls.');
            this.canvas.setAttribute('role', 'img');
            this.host.prepend(this.canvas);
        }
        useFallback(message) {
            this.failureReason = message;
            this.is3D = false;
            if (this.gl) this.deleteResources();
            this.gl = null;
            this.newCanvas();
            this.ctx = this.canvas.getContext('2d', { alpha: false });
            if (!this.ctx) throw new Error('This browser cannot create a canvas. Try a browser with canvas support.');
            this.resize();
            this.callbacks.fallback?.(message);
        }
        deleteResources() {
            for (const { kind, value } of this.resources) {
                if (kind === 'buffer') this.gl.deleteBuffer(value);
                if (kind === 'program') this.gl.deleteProgram(value);
            }
            this.resources = [];
        }
        program(vertex, fragment) {
            const gl = this.gl;
            const compile = (type, source) => {
                const shader = gl.createShader(type);
                gl.shaderSource(shader, source); gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    const message = gl.getShaderInfoLog(shader);
                    gl.deleteShader(shader);
                    throw new Error(`Aquarium shader: ${message}`);
                }
                return shader;
            };
            const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
            const program = gl.createProgram();
            gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
            gl.deleteShader(vs); gl.deleteShader(fs);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                const message = gl.getProgramInfoLog(program);
                gl.deleteProgram(program);
                throw new Error(`Aquarium program: ${message}`);
            }
            this.resources.push({ kind: 'program', value: program });
            const uniforms = new Map();
            return { program, uniform: name => {
                if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
                return uniforms.get(name);
            } };
        }
        buffer(data, usage) {
            const gl = this.gl, buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
            this.resources.push({ kind: 'buffer', value: buffer });
            return buffer;
        }
        mesh(geometry) {
            return { buffer: this.buffer(new Float32Array(geometry.vertices)), count: geometry.vertices.length / 10 };
        }
        initializeGL() {
            const gl = this.gl;
            this.main = this.program(VERTEX, FRAGMENT);
            this.background = this.program(BACK_VERTEX, BACK_FRAGMENT);
            this.particles = this.program(POINT_VERTEX, POINT_FRAGMENT);
            this.quad = this.buffer(new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]));
            this.pointBuffer = this.buffer(new Float32Array(0), gl.DYNAMIC_DRAW);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.disable(gl.CULL_FACE);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }
        releaseMesh(mesh) {
            if (!mesh || !this.gl) return;
            this.gl.deleteBuffer(mesh.buffer);
            this.resources = this.resources.filter(r => r.value !== mesh.buffer);
        }
        setTheme(theme, bounds) {
            this.theme = theme; this.bounds = { ...bounds };
            const cfg = PARAMS.quality[this.level];
            const tangent = Math.tan(PARAMS.fov / 2);
            this.groundExtent = PARAMS.camera.maxDistance + Math.hypot(bounds.width, bounds.depth)
                + PARAMS.far * Math.hypot(1, tangent, tangent * this.width / this.height);
            this.decor = environment(theme, bounds, cfg.plants, this.groundExtent);
            this.palette = { water: color(theme.water), surface: color(theme.surface), light: color(theme.light), accent: color(theme.fish[0].accent) };
            if (this.gl) {
                this.releaseMesh(this.sceneMesh);
                this.fishMeshes?.forEach(m => this.releaseMesh(m));
                this.creatureMeshes?.forEach(m => this.releaseMesh(m));
                Object.values(this.prizeMeshes || {}).forEach(m => { this.releaseMesh(m.base); this.releaseMesh(m.lid); });
                this.releaseMesh(this.cloudMesh);
                this.sceneMesh = this.mesh(this.decor.geometry);
                this.fishMeshes = theme.fish.map(fishGeometry).map(g => this.mesh(g));
                this.creatureMeshes = theme.visitors.map(creatureGeometry).map(g => this.mesh(g));
                this.prizeMeshes = Object.fromEntries(ZQ.PRIZES.map(prize => {
                    const geometry = prizeGeometry(theme, prize.id);
                    return [prize.id, { base: this.mesh(geometry.base), lid: geometry.lid ? this.mesh(geometry.lid) : null }];
                }));
                const cloud = new Geometry();
                cloud.sphere([0, 0, 0], [1, 0.85, 1], color(PARAMS.ink), 2, 10, 16, 0.07);
                this.cloudMesh = this.mesh(cloud);
            }
            this.decor.geometry = null;
            this.lastFrame = 0;
        }
        setQuality(quality) {
            this.quality = quality;
            this.level = quality === 'auto' ? (matchMedia('(pointer: coarse)').matches ? 'balanced' : 'high') : quality;
            this.frameSamples = [];
            this.resize();
            if (this.theme) this.setTheme(this.theme, this.bounds);
        }
        get fps() { return PARAMS.quality[this.level].fps; }
        resize() {
            const rect = this.host.getBoundingClientRect();
            this.width = Math.max(1, rect.width);
            this.height = Math.max(1, rect.height);
            this.ratio = Math.min(devicePixelRatio || 1, PARAMS.quality[this.level].ratio);
            this.canvas.width = Math.max(1, Math.round(this.width * this.ratio));
            this.canvas.height = Math.max(1, Math.round(this.height * this.ratio));
            if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
        reset() {
            this.camera.yaw = PARAMS.camera.yaw; this.camera.pitch = PARAMS.camera.pitch; this.camera.zoom = 1;
            this.camera.follow = null; this.camera.target = [0, 0, 0];
        }
        orbit(dx, dy) {
            this.camera.yaw += dx;
            this.camera.pitch = ZQ.clamp(this.camera.pitch + dy, PARAMS.camera.minPitch, PARAMS.camera.maxPitch);
            this.camera.follow = null;
        }
        zoom(amount) { this.camera.zoom = ZQ.clamp(this.camera.zoom * amount, PARAMS.camera.minZoom, PARAMS.camera.maxZoom); }
        updateCamera(state, dt) {
            const c = this.camera, limits = PARAMS.camera, b = state.bounds;
            c.pitch = ZQ.clamp(c.pitch, limits.minPitch, limits.maxPitch);
            c.zoom = ZQ.clamp(c.zoom, limits.minZoom, limits.maxZoom);
            const followed = state.fish.find(f => f.id === c.follow);
            const target = followed ? followed.pos : [0, -0.1, 0];
            const blend = this.reduced ? 1 : 1 - Math.exp(-Math.max(dt, 0.016) * 3);
            const range = [[-b.width, b.width], [b.floor + 0.6, b.surface - 0.45], [-b.depth, b.depth]];
            c.target = c.target.map((v, i) => ZQ.clamp(v + (target[i] - v) * blend, ...range[i]));
            const aspect = this.width / this.height;
            const fit = Math.max(10.5, (b.width + 0.8) / (Math.tan(PARAMS.fov / 2) * aspect)) + 2.6;
            const distance = ZQ.clamp(fit * c.zoom * (followed ? 0.62 : 1), limits.minDistance, limits.maxDistance);
            this.eye = [Math.sin(c.yaw) * Math.cos(c.pitch) * distance + c.target[0],
                Math.max(b.floor + limits.floorClearance, Math.sin(c.pitch) * distance + c.target[1]),
                Math.cos(c.yaw) * Math.cos(c.pitch) * distance + c.target[2]];
            this.vp = multiply(perspective(aspect), lookAt(this.eye, c.target));
        }
        project(pos) {
            if (!this.vp) return { x: 0, y: 0, scale: 0, visible: false };
            const p = transform(this.vp, pos);
            return { x: (p[0] / p[3] * 0.5 + 0.5) * this.width,
                y: (-p[1] / p[3] * 0.5 + 0.5) * this.height,
                scale: this.height / (2 * Math.tan(PARAMS.fov / 2) * Math.max(0.1, p[3])),
                visible: p[3] > 0 && Math.abs(p[0] / p[3]) < 1.15 && Math.abs(p[1] / p[3]) < 1.15,
                depth: p[3] };
        }
        worldPoint(x, y) {
            if (!this.vp) return [0, 0, 0];
            const inv = inverse(this.vp);
            const a = transform(inv, [x / this.width * 2 - 1, 1 - y / this.height * 2, -1, 1]);
            const b = transform(inv, [x / this.width * 2 - 1, 1 - y / this.height * 2, 1, 1]);
            const start = a.slice(0, 3).map(n => n / a[3]), end = b.slice(0, 3).map(n => n / b[3]);
            const delta = end.map((n, i) => n - start[i]);
            const normal = ZQ.normalize(this.eye.map((n, i) => n - this.camera.target[i]));
            const t = dot(this.camera.target.map((n, i) => n - start[i]), normal) / dot(delta, normal);
            return start.map((n, i) => n + delta[i] * t);
        }
        floorPolygon(floor) {
            let polygon = groundCorners(floor - PARAMS.floorInset, this.groundExtent).map(p => transform(this.vp, p));
            // Clip before perspective division; behind-camera corners must not flip the ground.
            for (let axis = 0; axis < 3; axis++) for (const side of [-1, 1]) {
                const clipped = [];
                for (let i = 0; i < polygon.length; i++) {
                    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
                    const da = a[3] + side * a[axis], db = b[3] + side * b[axis];
                    if (da >= 0) clipped.push(a);
                    if ((da >= 0) !== (db >= 0)) clipped.push(a.map((n, j) => n + (b[j] - n) * da / (da - db)));
                }
                polygon = clipped;
            }
            return polygon.map(p => ({ x: (p[0] / p[3] * 0.5 + 0.5) * this.width,
                y: (0.5 - p[1] / p[3] * 0.5) * this.height }));
        }
        pick(state, x, y) {
            const c = state.creature;
            if (c) {
                const p = this.project(c.pos);
                if (p.visible && Math.hypot(x - p.x, y - p.y) < Math.max(36, p.scale * (c.kind === 'crab' ? 1.3 : c.kind === 'eel' ? 1.5 : 0.9))) return { kind: 'creature', entity: c };
            }
            let nearest = null, radius = 54;
            for (const f of state.fish) {
                const p = this.project(f.pos), d = Math.hypot(x - p.x, y - p.y);
                if (p.visible && d < Math.max(30, p.scale * f.size) && d < radius) {
                    nearest = { kind: 'fish', entity: f }; radius = d;
                }
            }
            if (nearest) return nearest;
            for (const prize of this.prizes || []) {
                const p = this.project(prize.pos.map((n, i) => n + (i === 1 ? 0.35 : 0)));
                if (p.visible && Math.hypot(x - p.x, y - p.y) < Math.max(28, p.scale * 0.7)) return { kind: 'prize', entity: prize };
            }
            return null;
        }
        attributes(program, buffer, attributes, stride) {
            const gl = this.gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            // Different programs can reuse attribute slots with incompatible layouts.
            for (let i = 0; i < this.attributeCount; i++) gl.disableVertexAttribArray(i);
            this.attributeCount = 0;
            let offset = 0;
            for (const [name, size] of attributes) {
                const location = gl.getAttribLocation(program, name);
                if (location >= 0) {
                    gl.enableVertexAttribArray(location);
                    gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride * 4, offset * 4);
                    this.attributeCount = Math.max(this.attributeCount, location + 1);
                }
                offset += size;
            }
        }
        drawMesh(mesh, matrix, kind, phase, accent, pattern = 7, alpha = 1) {
            const gl = this.gl, p = this.main;
            this.attributes(p.program, mesh.buffer, [['a_position', 3], ['a_normal', 3], ['a_color', 3], ['a_part', 1]], 10);
            gl.uniformMatrix4fv(p.uniform('u_model'), false, matrix);
            gl.uniform1f(p.uniform('u_kind'), kind);
            gl.uniform1f(p.uniform('u_phase'), phase);
            gl.uniform3fv(p.uniform('u_accent'), accent);
            gl.uniform1f(p.uniform('u_pattern'), pattern);
            gl.uniform1f(p.uniform('u_alpha'), alpha);
            gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        }
        particleData(state, time) {
            const data = [], rng = seeded(4421), b = state.bounds;
            const count = this.reduced ? 16 : PARAMS.quality[this.level].motes;
            const base = this.palette.light;
            for (let i = 0; i < count; i++) {
                const r1 = rng(), r2 = rng(), r3 = rng();
                const bubble = i % 7 === 0, petal = this.theme.id === 'koi' && i % 5 === 0;
                const speed = bubble ? 0.1 : petal ? -0.015 : 0.019;
                const progress = ((r2 + time * speed / 8) % 1 + 1) % 1;
                const pos = [(r1 - 0.5) * b.width * 2.3 + Math.sin(time * 0.25 + i) * 0.2,
                    b.floor + progress * (b.surface - b.floor), (r3 - 0.5) * 8];
                const tint = petal ? color('#f0c0c0') : base;
                data.push(...pos, ...tint, bubble ? 7 + r3 * 6 : petal ? 6 : 2 + r3 * 3,
                    bubble ? 0.35 : this.theme.id === 'deep' ? 0.65 : 0.3, bubble ? 1 : petal ? 2 : 0);
            }
            for (const food of state.food) data.push(...food.pos, ...color(PARAMS.food), 7, Math.min(1, (ZQ.CONFIG.foodLifetime - food.age) / 2), 2);
            for (const attack of state.attacks) if (attack.kind === 'stingers') {
                for (const pos of attack.nodes) data.push(...pos, ...color(this.theme.visitors.find(v => v.kind === 'jellyfish').accent), 14, 0.9, 0);
            }
            for (const prize of this.prizes || []) {
                const active = state.prizeEffects[prize.id] || 0;
                const count = prize.id === 'chest' ? (active ? 15 : 5) : active ? 12 : prize.id === 'lantern' ? 3 : 0;
                for (let i = 0; i < count; i++) {
                    const age = ((time * 0.24 + i * 0.17) % 1);
                    const pos = [prize.pos[0] + Math.sin(i * 2.4 + time) * 0.12,
                        prize.pos[1] + (prize.id === 'lantern' ? 0.65 : 0.35) + age * 2.3,
                        prize.pos[2] + Math.cos(i * 2.4) * 0.13];
                    data.push(...pos, ...base, 6 + i % 4, (1 - age) * 0.6, prize.id === 'lantern' ? 0 : 1);
                }
            }
            const c = state.creature;
            if (c?.kind === 'eel' && c.phase === 'windup') {
                data.push(c.pos[0], c.pos[1] + 0.5, c.pos[2], ...color(c ? this.theme.visitors[c.index].accent : this.theme.light), 24, 0.45 + Math.sin(time * 10) * 0.25, 0);
            }
            if (state.prizeEffects.flash) {
                const center = c ? c.pos : [0, 0, 0];
                for (let i = 0; i < 16; i++) {
                    const angle = i * Math.PI / 8, radius = (1.5 - state.prizeEffects.flash) * 2;
                    data.push(center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius,
                        center[2], ...base, 18, state.prizeEffects.flash / 1.5, 0);
                }
            }
            return new Float32Array(data);
        }
        drawGL(state, time) {
            const gl = this.gl, bg = this.background, p = this.main;
            const deep = this.theme.id === 'deep' ? 1 : 0;
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(false);
            gl.useProgram(bg.program);
            this.attributes(bg.program, this.quad, [['a_position', 2]], 2);
            gl.uniform3fv(bg.uniform('u_water'), this.palette.water);
            gl.uniform3fv(bg.uniform('u_surface'), this.palette.surface);
            gl.uniform3fv(bg.uniform('u_light'), this.palette.light);
            gl.uniform1f(bg.uniform('u_time'), time);
            gl.uniform1f(bg.uniform('u_deep'), deep);
            gl.uniform1f(bg.uniform('u_ink'), this.theme.id === 'ink' ? 1 : 0);
            gl.uniform1f(bg.uniform('u_aspect'), this.width / this.height);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
            gl.useProgram(p.program);
            gl.uniformMatrix4fv(p.uniform('u_vp'), false, this.vp);
            gl.uniform3fv(p.uniform('u_camera'), this.eye);
            gl.uniform3fv(p.uniform('u_water'), this.palette.water);
            gl.uniform3fv(p.uniform('u_surface'), this.palette.surface);
            gl.uniform3fv(p.uniform('u_light'), this.palette.light);
            gl.uniform1f(p.uniform('u_aspect'), this.width / this.height);
            gl.uniform2f(p.uniform('u_resolution'), this.canvas.width, this.canvas.height);
            gl.uniform1f(p.uniform('u_time'), time);
            gl.uniform1f(p.uniform('u_motion'), this.reduced ? 0.25 : 1);
            gl.uniform1f(p.uniform('u_ink'), this.theme.id === 'ink' ? 1 : 0);
            gl.uniform1f(p.uniform('u_deep'), deep);
            gl.uniform1f(p.uniform('u_health'), state.tankHealth / 100);
            this.drawMesh(this.sceneMesh, identity(), 1, 0, color(this.theme.id === 'ink' ? '#4a4137' : this.theme.plants[0]));
            for (const prize of this.prizes || []) {
                const mesh = this.prizeMeshes[prize.id], matrix = model(prize.pos);
                this.drawMesh(mesh.base, matrix, 1, 0, color(PARAMS.prizeGold));
                if (mesh.lid) {
                    const active = state.prizeEffects[prize.id] || 0;
                    const natural = prize.id === 'chest' ? Math.max(0, Math.sin(time * 0.45)) * 0.35 : (Math.sin(time * 0.32) + 1) * 0.45;
                    const opening = Math.max(natural, Math.min(1, active * 0.8));
                    const hinge = model([0, prize.id === 'chest' ? 0.44 : 0.15, prize.id === 'chest' ? -0.35 : -0.33]);
                    this.drawMesh(mesh.lid, multiply(matrix, multiply(hinge, rotateX(-opening * 1.1))), 1, 0, color(PARAMS.prizeGold));
                }
            }
            for (const f of state.fish) {
                const def = this.theme.fish[f.type];
                this.drawMesh(this.fishMeshes[f.type], model(f.pos, f.yaw, f.pitch, ZQ.fishScale(f)),
                    0, f.phase, color(def.accent), def.id === 'zen-silver' ? 7 : def.pattern);
            }
            gl.enable(gl.BLEND);
            const c = state.creature;
            if (c) {
                const def = this.theme.visitors[c.index];
                gl.depthMask(c.kind !== 'jellyfish');
                const yaw = c.kind === 'jellyfish' || c.kind === 'crab' ? 0 : c.kind === 'eel' ? c.yaw : c.yaw * 0.35;
                this.drawMesh(this.creatureMeshes[c.index], model(c.pos, yaw, 0, def.size * 0.55),
                    c.kind === 'eel' ? 3 : 2, c.age * (c.phase === 'windup' ? 7 : 2.3), color(def.accent), 7, c.kind === 'jellyfish' ? 0.72 : 1);
            }
            gl.depthMask(false);
            for (const f of state.dead) {
                const def = this.theme.fish[f.type];
                this.drawMesh(this.fishMeshes[f.type], model(f.pos, f.yaw, f.pitch + f.age * 2, ZQ.fishScale(f)),
                    0, f.phase, color(def.accent), def.pattern, Math.max(0, 1 - f.age / 1.5));
            }
            for (const attack of state.attacks) if (attack.kind === 'ink') {
                const scale = Math.min(1.65, 0.3 + attack.age * 0.35);
                for (let i = 0; i < 3; i++) this.drawMesh(this.cloudMesh, model(attack.pos.map((n, j) => n + Math.sin(i * 2 + j) * 0.25), 0, 0, scale * (1 - i * 0.12)),
                    1, 0, color(PARAMS.ink), 7, Math.min(0.45, (attack.life - attack.age) / 5));
            }
            const points = this.particles, data = this.particleData(state, time);
            gl.useProgram(points.program);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
            this.attributes(points.program, this.pointBuffer, [['a_position', 3], ['a_color', 3], ['a_size', 1], ['a_alpha', 1], ['a_kind', 1]], 9);
            gl.uniformMatrix4fv(points.uniform('u_vp'), false, this.vp);
            gl.uniform1f(points.uniform('u_ratio'), this.ratio);
            gl.drawArrays(gl.POINTS, 0, data.length / 9);
            gl.depthMask(true); gl.disable(gl.BLEND);
        }
        draw2D(state, time) {
            const ctx = this.ctx, w = this.width, h = this.height, theme = this.theme;
            ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
            const background = ctx.createLinearGradient(0, 0, 0, h);
            background.addColorStop(0, theme.surface); background.addColorStop(0.7, theme.water);
            ctx.fillStyle = background; ctx.fillRect(0, 0, w, h);
            ctx.globalAlpha = 0.055;
            ctx.fillStyle = theme.light;
            for (let i = 0; i < 6; i++) {
                const x = w * i / 5 + Math.sin(time * 0.1 + i) * 15;
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - w * 0.18, h);
                ctx.lineTo(x - w * 0.18 + 80, h); ctx.lineTo(x + 18, 0); ctx.fill();
            }
            ctx.globalAlpha = 1;
            const corners = this.floorPolygon(state.bounds.floor);
            const sand = ctx.createLinearGradient(0, Math.min(...corners.map(p => p.y)), 0, h);
            sand.addColorStop(0, theme.sand + '00'); sand.addColorStop(0.3, theme.sand);
            ctx.beginPath(); corners.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
            ctx.closePath(); ctx.fillStyle = sand; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
            const decorations = [...this.decor.rocks.map(r => ({ kind: 'rock', pos: r.pos, item: r })),
                ...this.decor.plants.map(p => ({ kind: 'plant', pos: [p.x, state.bounds.floor, p.z], item: p }))];
            decorations.sort((a, b) => this.project(b.pos).depth - this.project(a.pos).depth);
            for (const item of decorations) {
                const p = this.project(item.pos);
                if (!p.visible) continue;
                if (item.kind === 'rock') {
                    ctx.fillStyle = theme.rock;
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, item.item.radius[0] * p.scale, item.item.radius[1] * p.scale, 0.1, 0, Math.PI * 2); ctx.fill();
                } else {
                    const plant = item.item;
                    const sway = Math.sin(time * 0.65 + plant.x) * (this.reduced ? 2 : 8);
                    ctx.strokeStyle = plant.tint; ctx.lineWidth = Math.max(1, p.scale * 0.035);
                    ctx.beginPath(); ctx.moveTo(p.x, p.y);
                    ctx.bezierCurveTo(p.x - 10, p.y - plant.h * p.scale * 0.4, p.x + sway, p.y - plant.h * p.scale * 0.7, p.x + sway, p.y - plant.h * p.scale); ctx.stroke();
                    for (let j = 1; j < 7; j++) {
                        ctx.beginPath(); const y = p.y - plant.h * p.scale * j / 7;
                        ctx.ellipse(p.x + (j % 2 ? 1 : -1) * 7 + sway * j / 7, y, p.scale * 0.22, p.scale * 0.07, j % 2 ? -0.7 : 0.7, 0, Math.PI * 2);
                        if (theme.id === 'ink') ctx.stroke(); else { ctx.fillStyle = plant.tint; ctx.fill(); }
                    }
                }
            }
            const entities = state.fish.map(f => ({ pos: f.pos, fish: f }));
            if (state.creature) entities.push({ pos: state.creature.pos, creature: state.creature });
            entities.sort((a, b) => this.project(b.pos).depth - this.project(a.pos).depth);
            for (const entity of entities) {
                const p = this.project(entity.pos);
                if (!p.visible) continue;
                ctx.save(); ctx.translate(p.x, p.y);
                if (entity.fish) {
                    const f = entity.fish, def = theme.fish[f.type];
                    const size = p.scale * ZQ.fishScale(f);
                    const direction = Math.cos(f.yaw - this.camera.yaw) < 0 ? -1 : 1;
                    ctx.scale(size * direction, size); ctx.rotate(-f.pitch);
                    const ry = def.shape === 'tall' ? 0.58 : def.shape === 'round' ? 0.4 : 0.27;
                    ctx.fillStyle = def.fin; ctx.strokeStyle = def.accent; ctx.lineWidth = 0.02;
                    ctx.beginPath(); ctx.moveTo(-0.6, 0); ctx.lineTo(-1.25, -0.43); ctx.lineTo(-1.1 + Math.sin(f.phase) * 0.12, 0);
                    ctx.lineTo(-1.25, 0.43); ctx.closePath(); if (theme.id === 'ink') ctx.stroke(); else ctx.fill();
                    const gradient = ctx.createLinearGradient(0, -ry, 0, ry);
                    gradient.addColorStop(0, def.accent); gradient.addColorStop(0.42, def.body); gradient.addColorStop(1, def.fin);
                    ctx.fillStyle = gradient; ctx.beginPath(); ctx.ellipse(0, 0, 0.76, ry, 0, 0, Math.PI * 2);
                    if (theme.id === 'ink') ctx.stroke(); else ctx.fill();
                    if (def.pattern === 1 || def.pattern === 3) {
                        ctx.save(); ctx.clip(); ctx.strokeStyle = def.accent; ctx.lineWidth = 0.12;
                        for (const x of [-0.42, 0, 0.42]) { ctx.beginPath(); ctx.moveTo(x, -ry); ctx.lineTo(x, ry); ctx.stroke(); }
                        ctx.restore();
                    }
                    if (def.id === 'neon') {
                        ctx.strokeStyle = PARAMS.neon; ctx.lineWidth = 0.055;
                        ctx.beginPath(); ctx.moveTo(0.5, -0.02); ctx.lineTo(-0.1, -0.02); ctx.stroke();
                        ctx.strokeStyle = PARAMS.red; ctx.beginPath(); ctx.moveTo(-0.1, 0.02); ctx.lineTo(-0.6, 0.02); ctx.stroke();
                    }
                    if (def.id === 'barreleye') {
                        ctx.fillStyle = def.accent; ctx.beginPath(); ctx.ellipse(0.35, -0.22, 0.075, 0.1, 0, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = PARAMS.eye; ctx.beginPath(); ctx.ellipse(0.37, -0.29, 0.04, 0.025, 0, 0, Math.PI * 2); ctx.fill();
                    } else {
                        ctx.fillStyle = PARAMS.eyeWhite; ctx.beginPath(); ctx.arc(0.47, -ry * 0.27, 0.1, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = PARAMS.eye; ctx.beginPath(); ctx.arc(0.5, -ry * 0.27, 0.057, 0, Math.PI * 2); ctx.fill();
                    }
                } else {
                    const c = entity.creature, def = theme.visitors[c.index], scale = p.scale * def.size * 0.55;
                    ctx.scale(scale, scale); ctx.fillStyle = def.body; ctx.strokeStyle = def.accent; ctx.lineWidth = 0.04;
                    ctx.globalAlpha = c.kind === 'jellyfish' ? 0.72 : 1;
                    if (c.kind === 'eel') {
                        ctx.lineWidth = 0.3; ctx.lineCap = 'round'; ctx.strokeStyle = def.body;
                        ctx.beginPath(); ctx.moveTo(0.7, 0);
                        ctx.bezierCurveTo(-0.2, Math.sin(time * 3) * 0.3, -1.2, -Math.sin(time * 3) * 0.4, -2, 0); ctx.stroke();
                        ctx.fillStyle = def.accent; ctx.beginPath(); ctx.arc(0.63, -0.07, 0.06, 0, Math.PI * 2); ctx.fill();
                    } else if (c.kind === 'crab') {
                        ctx.beginPath(); ctx.ellipse(0, 0, 0.65, 0.28, 0, 0, Math.PI * 2); ctx.fill();
                        for (const side of [-1, 1]) {
                            for (let i = 0; i < 4; i++) {
                                ctx.beginPath(); ctx.moveTo(side * 0.45, 0); ctx.lineTo(side * (0.8 + i * 0.07), 0.1 + i * 0.05); ctx.lineTo(side * 1.08, 0.38); ctx.stroke();
                            }
                            ctx.beginPath(); ctx.ellipse(side * 0.86, -0.2, 0.22, 0.18, 0, 0, Math.PI * 2); ctx.fill();
                        }
                    } else {
                        ctx.beginPath(); ctx.ellipse(0, -0.2, 0.62, c.kind === 'squid' ? 0.9 : 0.5, 0, 0, Math.PI * 2); ctx.fill();
                    }
                    for (let i = 0; i < (['crab', 'eel'].includes(c.kind) ? 0 : 8); i++) {
                        const x = (i - 3.5) * 0.12;
                        ctx.beginPath(); ctx.moveTo(x, 0);
                        ctx.bezierCurveTo(x + Math.sin(time + i) * 0.25, 0.6, x - 0.2, 1, x + Math.sin(time + i) * 0.3, 1.35); ctx.stroke();
                    }
                }
                ctx.restore();
            }
            for (const prize of this.prizes || []) {
                const p = this.project(prize.pos);
                if (!p.visible) continue;
                ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.scale, p.scale);
                ctx.strokeStyle = PARAMS.prizeGold; ctx.lineWidth = 0.035;
                const active = state.prizeEffects[prize.id] || 0;
                if (prize.id === 'chest') {
                    ctx.fillStyle = PARAMS.prizeWood; ctx.fillRect(-0.55, -0.44, 1.1, 0.44); ctx.strokeRect(-0.55, -0.44, 1.1, 0.44);
                    ctx.fillStyle = PARAMS.prizeGold;
                    ctx.fillRect(-0.36, -0.44, 0.07, 0.44); ctx.fillRect(0.29, -0.44, 0.07, 0.44);
                    ctx.fillRect(-0.58, -0.51 - (active ? 0.2 : 0), 1.16, 0.08);
                } else if (prize.id === 'oyster') {
                    ctx.fillStyle = PARAMS.shell; ctx.beginPath(); ctx.ellipse(0, -0.12, 0.56, 0.15, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.ellipse(0, -0.28 - (active ? 0.25 : 0), 0.5, 0.17, -0.15, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = PARAMS.pearl; ctx.beginPath(); ctx.arc(0, -0.23, 0.13, 0, Math.PI * 2); ctx.fill();
                } else if (prize.id === 'lantern') {
                    ctx.fillStyle = theme.rock; ctx.fillRect(-0.3, -0.1, 0.6, 0.1); ctx.fillRect(-0.32, -0.9, 0.64, 0.08);
                    ctx.strokeRect(-0.24, -0.85, 0.48, 0.72); ctx.fillStyle = theme.light;
                    ctx.beginPath(); ctx.ellipse(0, -0.55, 0.12, 0.24, 0, 0, Math.PI * 2); ctx.fill();
                } else {
                    ctx.strokeStyle = theme.rock; ctx.lineWidth = 0.32;
                    ctx.beginPath(); ctx.moveTo(-0.62, 0); ctx.lineTo(-0.62, -0.7); ctx.arc(0, -0.7, 0.62, Math.PI, 0); ctx.lineTo(0.62, 0); ctx.stroke();
                }
                ctx.restore();
            }
            const data = this.particleData(state, time);
            for (let i = 0; i < data.length; i += 9) {
                const p = this.project([data[i], data[i + 1], data[i + 2]]);
                if (!p.visible) continue;
                ctx.globalAlpha = data[i + 7];
                ctx.fillStyle = `rgb(${data[i + 3] * 255},${data[i + 4] * 255},${data[i + 5] * 255})`;
                ctx.strokeStyle = ctx.fillStyle;
                ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, data[i + 6] * 7 / p.depth), 0, Math.PI * 2);
                if (data[i + 8] === 1) ctx.stroke(); else ctx.fill();
            }
            for (const a of state.attacks) if (a.kind === 'ink') {
                const p = this.project(a.pos);
                ctx.fillStyle = PARAMS.ink; ctx.globalAlpha = Math.min(0.6, (a.life - a.age) / 4);
                ctx.beginPath(); ctx.arc(p.x, p.y, Math.min(1.65, 0.3 + a.age * 0.35) * p.scale, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
        render(state, time, dt = 0.016, equipped = []) {
            if (this.lost || !this.theme) return;
            this.prizes = prizePositions(state.bounds, equipped);
            this.updateCamera(state, dt);
            if (this.gl) this.drawGL(state, time); else this.draw2D(state, time);
        }
        sampleFrame(ms) {
            if (this.quality !== 'auto' || this.level === 'battery' || ms > 150) return;
            this.frameSamples.push(ms);
            if (this.frameSamples.length < 240) return;
            const average = this.frameSamples.reduce((a, b) => a + b, 0) / this.frameSamples.length;
            this.frameSamples = [];
            if (average > (this.level === 'high' ? 26 : 38)) {
                this.level = this.level === 'high' ? 'balanced' : 'battery';
                this.resize();
                this.setTheme(this.theme, this.bounds);
                this.callbacks.quality?.(this.level);
            }
        }
        dispose() {
            this.canvas.removeEventListener('webglcontextlost', this.onLost);
            this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
            if (this.gl) this.deleteResources();
            this.canvas.remove();
        }
    }
    return { Renderer, PARAMS, color, multiply, perspective, lookAt, transform, inverse };
})();
