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
    function model(pos, yaw = 0, pitch = 0, scale = 1, roll = 0) {
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
        const matrix = new Float32Array([
            cy * cp * scale, sp * scale, -sy * cp * scale, 0,
            -cy * sp * scale, cp * scale, sy * sp * scale, 0,
            sy * scale, 0, cy * scale, 0, ...pos, 1
        ]);
        return roll ? multiply(matrix, rotateX(roll)) : matrix;
    }
    function rotateX(angle) {
        const c = Math.cos(angle), s = Math.sin(angle);
        return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
    }
    const prizePositions = ZQ.prizePositions;
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
            const phase = center[0] * 1.7 + center[2] * 2.3 + center[1] * 0.9;
            const point = (r, s) => {
                const theta = r / rings * Math.PI, phi = s / segments * Math.PI * 2;
                const angle = phi + roughness * Math.sin(theta * 2 + phase);
                const n = [Math.sin(theta) * Math.cos(angle), Math.cos(theta), Math.sin(theta) * Math.sin(angle)];
                // Erode inward so irregular rock and coral silhouettes stay inside their solid envelopes.
                const ripple = 1 - roughness * Math.max(0.1, 1.1 + Math.sin(n[0] * 3 + phase) * Math.cos(n[1] * 4 - n[2] * 2)
                    + Math.sin(n[2] * 9 + phase) * 0.25);
                const p = n.map((v, i) => center[i] + v * radius[i] * ripple);
                const shade = 1 - roughness * (0.3 + (1 - n[1]) * 0.3);
                return [p, ZQ.normalize(n.map((v, i) => v / radius[i])), tint.map(c => c * shade)];
            };
            for (let r = 0; r < rings; r++) for (let s = 0; s < segments; s++) {
                const a = point(r, s), b = point(r + 1, s), c = point(r + 1, s + 1), d = point(r, s + 1);
                for (const [p, n, pigment] of [a, c, b, a, d, c]) this.vertex(p, n, pigment, part);
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

    const fishForm = def => ({
        ry: def.shape === 'round' ? 0.4 : def.shape === 'tall' ? 0.6 : def.shape === 'medaka' ? 0.2 : ['slim', 'catfish', 'threadfin'].includes(def.shape) ? 0.25 : 0.32,
        rz: def.shape === 'round' ? 0.3 : def.shape === 'tall' ? 0.17 : 0.21,
        finHeight: def.shape === 'tall' ? 0.92 : def.shape === 'betta' ? 0.78 : def.shape === 'round' ? 0.64 : def.shape === 'medaka' ? 0.35 : ['slim', 'catfish'].includes(def.shape) ? 0.49 : 0.56,
        tailSpan: def.shape === 'betta' ? 1.35 : def.shape === 'medaka' ? 0.6 : 0.98,
        tailLength: def.shape === 'betta' ? 1.48 : def.shape === 'lyretail' ? 1.5 : 1.32
    });
    function fishGeometry(def) {
        const g = new Geometry();
        const body = color(def.body), fin = color(def.fin), accent = color(def.accent);
        const { ry, rz, finHeight: height, tailSpan, tailLength } = fishForm(def);
        g.sphere([0, 0, 0], [0.76, ry, rz], body, 0, 14, 24);
        if (def.id === 'barreleye') g.sphere([0.34, 0.08, 0], [0.38, 0.26, 0.21], mix(body, accent, 0.38), 2, 10, 16);
        g.sphere([-0.68, 0, 0], [0.21, 0.12, 0.1], fin, 1, 6, 10);
        for (let i = 0; i < 9; i++) {
            const y1 = (i / 9 - 0.5) * tailSpan, y2 = ((i + 1) / 9 - 0.5) * tailSpan;
            const shade = mix(fin, accent, i % 2 ? 0.13 : 0.4);
            const edge = y => -tailLength + (def.shape === 'lyretail' ? (0.5 - Math.abs(y)) * 1.1 : Math.abs(y) * (def.shape === 'betta' ? 0.3 : 0.15));
            g.triangle([-0.72, 0, 0], [edge(y1), y1, 0.015], [edge(y2), y2, 0.015], shade, 1);
        }
        g.triangle([0.22, ry * 0.8, 0], [-0.35, height, 0], [-0.61, ry * 0.5, 0], mix(fin, accent, 0.3), 1);
        g.triangle([0.15, -ry * 0.8, 0], [-0.32, -height * 0.9, 0], [-0.6, -ry * 0.5, 0], fin, 1);
        if (def.shape === 'betta') for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
            const x = -0.64 + i * 0.1;
            g.triangle([0.18, side * ry * 0.75, 0], [x, side * (0.55 + 0.18 * Math.sin(i * 0.4)), 0.01],
                [x + 0.1, side * (0.55 + 0.18 * Math.sin((i + 1) * 0.4)), 0.01], mix(fin, accent, i % 2 ? 0.2 : 0.5), 1);
        }
        if (def.shape === 'catfish') {
            for (const side of [-1, 1]) g.tube([[0.7, -0.04, side * 0.08], [0.9, -0.18, side * 0.16],
                [1.02, -0.27, side * 0.2]], 0.012, accent, 2, 4);
            g.tube([[-0.58, 0, 0], [0, 0, 0], [0.55, 0, 0]], 0.014, accent, 2, 4);
            for (let x = -0.55; x < 0.35; x += 0.13)
                g.tube([[x, 0, 0], [x - 0.07, -0.13, 0.13]], 0.009, accent, 2, 4);
        }
        if (def.shape === 'threadfin') for (const side of [-1, 1])
            g.tube([[-0.12, side * ry, 0], [-0.48, side * 0.75, 0.02],
                [-0.95, side * 1.02, 0.03], [-1.35, side * 0.92, 0.02]], 0.012, accent, 1, 4);
        if (def.pattern === 12) for (const side of [-1, 1]) for (let i = 0; i < 12; i++) {
            const x = -0.5 + (i % 4) * 0.25, y = -0.11 + Math.floor(i / 4) * 0.11;
            const z = side * rz * Math.sqrt(Math.max(0, 1 - (x / 0.76) ** 2 - (y / ry) ** 2));
            g.sphere([x, y, z], [0.024, 0.023, 0.012], accent, 2, 4, 6);
        }
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
        g.sphere([0.72, -0.03, 0], [0.035, 0.043, 0.09], mix(body, color(PARAMS.eye), 0.35), 4, 5, 8);
        if (def.id === 'angler') {
            g.tube([[0.23, 0.3, 0], [0.36, 0.7, 0], [0.65, 0.79, 0], [0.8, 0.61, 0]], 0.025, accent, 1);
            g.sphere([0.8, 0.59, 0], [0.095, 0.095, 0.095], accent, 3, 8, 12);
        }
        if (def.id === 'biolum') for (const side of [-1, 1])
            g.tube([[0.22, side * ry * 0.8, 0], [-0.35, side * height, 0], [-0.61, side * ry * 0.5, 0]], 0.012, accent, 3, 4);
        return g;
    }
    function fishPreview(def) {
        const { ry, finHeight, tailSpan, tailLength } = fishForm(def);
        const tail = def.shape === 'betta'
            ? `M-.65 0 Q-1 -.9 -${tailLength} -${tailSpan / 2} Q-1.7 0 -${tailLength} ${tailSpan / 2} Q-1 .9 -.65 0`
            : `M-.65 0 L-${tailLength} -${tailSpan / 2} L-${def.shape === 'lyretail' ? 0.95 : 1.14} 0 L-${tailLength} ${tailSpan / 2} Z`;
        let markings = '';
        if ([1, 3].includes(def.pattern)) for (const x of [-0.45, 0, 0.43])
            markings += `<path d="M${x} -${ry}v${ry * 2}" stroke-width=".1"/>`;
        if (def.pattern === 8) for (const y of [-0.16, -0.05, 0.06, 0.17])
            markings += `<path d="M-.67 ${y}Q0 ${y - 0.03} .64 ${y}" stroke-width=".035"/>`;
        if ([5, 6].includes(def.pattern)) for (const x of [-0.4, -0.1, 0.2, 0.45])
            markings += `<circle cx="${x}" cy=".1" r=".035" fill="${def.accent}"/>`;
        if (def.pattern === 0) markings += `<path d="M-.5 -.1Q-.2 -.35 .1 -.12M.2 .05Q.4 .2 .55 .06" stroke-width=".13"/>`;
        if (def.pattern === 2) markings += '<ellipse cx="-.08" cy="0" rx=".25" ry=".14" stroke-width=".05"/>';
        if (def.pattern === 4) markings += '<path d="M-.6 .03H.5" stroke="#31bfda" stroke-width=".06"/>';
        if (def.pattern === 10) markings += '<path d="M-.6 -.04Q0 -.13 .55 -.04" stroke-width=".025"/>';
        if (def.pattern === 11) markings += '<path d="M-.6 0H.55" stroke-width=".045"/>';
        if (def.pattern === 12) for (let i = 0; i < 12; i++)
            markings += `<circle cx="${-0.5 + (i % 4) * 0.25}" cy="${-0.11 + Math.floor(i / 4) * 0.11}" r=".024" fill="${def.accent}"/>`;
        if (def.shape === 'catfish') markings += '<path d="M-.6 0H.5M-.4 0l-.06 .13M-.2 0l-.06 .13M0 0l-.06 .13M.2 0l-.06 .13" stroke-width=".018"/>';
        const extras = def.shape === 'threadfin' ? '<path d="M-.12 -.25Q-.5 -1.2 -1.35 -.92M-.12 .25Q-.5 1.2 -1.35 .92"/>'
            : def.shape === 'catfish' ? '<path d="M.68 .06Q.9 .12 1.02 .27M.67 .04Q.85 -.1 1.02 -.08"/>'
            : def.shape === 'tall' ? '<path d="M.15 .3Q.08 .75 -.22 1.1"/>' : def.id === 'angler' ? '<path d="M.23 -.3Q.36 -1 .8 -.6"/><circle cx=".8" cy="-.6" r=".09"/>' : '';
        return `<svg viewBox="-1.8 -1.2 3.1 2.4" class="fish-preview" role="img" aria-label="${def.name}" data-species="${def.id}">
            <defs><clipPath id="body-${def.id}"><ellipse rx=".76" ry="${ry}"/></clipPath></defs>
            <g stroke="${def.accent}" stroke-width=".025" stroke-linejoin="round">
            <path d="${tail}" fill="${def.fin}"/>
            <path d="M.22 -${ry * 0.8}L-.35 -${finHeight}L-.61 -${ry * 0.5}Z M.15 ${ry * 0.8}L-.32 ${finHeight * 0.9}L-.6 ${ry * 0.5}Z" fill="${def.fin}"/>
            <ellipse rx=".76" ry="${ry}" fill="${def.body}"/>
            <g clip-path="url(#body-${def.id})" fill="none">${markings}</g>
            <path d="M.18 0Q-.05 .45 -.35 .1" fill="${def.fin}"/>
            <g fill="none">${extras}</g><circle cx=".49" cy="-${ry * 0.3}" r=".085" fill="#eae6d7"/>
            <circle cx=".51" cy="-${ry * 0.3}" r=".046" fill="#18242c"/></g></svg>`;
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

    const prizePalette = theme => ({
        gold: theme.id === 'deep' ? '#76dcd7' : theme.id === 'zen' ? '#b7a36e' : theme.id === 'ink' ? '#8e724f' : PARAMS.prizeGold,
        wood: theme.id === 'koi' ? '#786952' : theme.id === 'tropical' ? '#507578'
            : theme.id === 'deep' ? '#354c69' : theme.id === 'zen' ? '#849287' : theme.id === 'ink' ? '#a99075' : PARAMS.prizeWood,
        shell: theme.id === 'deep' ? '#8b7bbb' : theme.id === 'tropical' ? '#edc8b5'
            : theme.id === 'zen' ? '#e1e2cc' : PARAMS.shell
    });
    function prizeGeometry(theme, id) {
        const base = new Geometry(), lid = new Geometry(), pearl = new Geometry();
        const palette = prizePalette(theme), gold = color(palette.gold), wood = color(palette.wood);
        if (id === 'chest') {
            base.box([0, 0.22, 0], [0.55, 0.22, 0.36], wood);
            base.box([0, 0.445, 0], [0.49, 0.01, 0.31], color(PARAMS.eye));
            for (const x of [-0.36, 0.36]) {
                base.box([x, 0.23, 0], [0.045, 0.24, 0.375], gold);
            }
            for (let i = 0; i < 12; i++) {
                const a = i / 12 * Math.PI, b = (i + 1) / 12 * Math.PI;
                const profile = t => [0.025 + Math.sin(t) * 0.18, 0.35 + Math.cos(t) * 0.36];
                const [ay, az] = profile(a), [by, bz] = profile(b);
                const tint = mix(wood, gold, i % 2 ? 0.08 : 0);
                lid.triangle([-0.55, ay, az], [0.55, ay, az], [0.55, by, bz], tint);
                lid.triangle([-0.55, ay, az], [0.55, by, bz], [-0.55, by, bz], tint);
                for (const side of [-1, 1]) lid.triangle([side * 0.55, 0.025, 0.35], [side * 0.55, ay, az], [side * 0.55, by, bz], wood);
                for (const x of [-0.36, 0.36]) lid.tube([[x, ay + 0.006, az], [x, by + 0.006, bz]], 0.014, gold, 2, 5);
            }
            lid.box([0, 0.012, 0.35], [0.55, 0.012, 0.36], wood);
            for (const y of [0.1, 0.22, 0.34]) {
                base.box([0, y, 0.362], [0.54, 0.004, 0.003], mix(wood, color(PARAMS.eye), 0.5));
                for (const x of [-0.36, 0.36]) base.sphere([x, y, 0.382], [0.024, 0.024, 0.015], gold, 2, 4, 6);
            }
            base.box([0, 0.31, 0.375], [0.08, 0.095, 0.025], gold);
            for (let i = 0; i < 7; i++) base.sphere([Math.sin(i * 2.4) * 0.3, 0.46, Math.cos(i * 2.4) * 0.18],
                [0.075, 0.02, 0.075], gold, 3, 4, 8);
        } else if (id === 'oyster') {
            const shell = color(palette.shell);
            base.sphere([0, 0.09, 0], [0.56, 0.145, 0.46], mix(shell, color(theme.rock), 0.18), 2, 12, 24, 0.07);
            base.sphere([0, 0.14, 0], [0.44, 0.045, 0.35], mix(shell, gold, 0.2), 2, 8, 16);
            pearl.sphere([0, 0.25, 0.05], [0.145, 0.145, 0.145], color(PARAMS.pearl), 3, 12, 18);
            lid.sphere([0, 0.1, 0.33], [0.56, 0.17, 0.46], shell, 2, 12, 24, 0.06);
            for (let i = 0; i < 11; i++) {
                const angle = (i / 10 - 0.5) * Math.PI;
                lid.tube([[0, 0.13, 0], [Math.sin(angle) * 0.27, 0.275, 0.32],
                    [Math.sin(angle) * 0.48, 0.16, 0.33 + Math.cos(angle) * 0.4]],
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
        return { base, lid: lid.vertices.length ? lid : null, pearl: pearl.vertices.length ? pearl : null };
    }
    const prizeOpening = (id, time, active, reduced) => Math.max(
        reduced ? 0 : id === 'chest' ? Math.max(0, Math.sin(time * 0.45)) * 0.35 : Math.max(0, Math.sin(time * 0.32)) * 0.9,
        Math.min(1, active * 0.8));

    const plantProfile = plant => {
        const phase = plant.x * 2.71 + plant.z * 3.19 + plant.h * 1.37;
        return { phase, width: 0.83 + Math.sin(phase) * 0.12,
            height: 0.89 + Math.cos(phase * 1.3) * 0.08, depth: 0.85 + Math.sin(phase * 0.7) * 0.1,
            lean: Math.sin(phase * 0.9) * 0.025 };
    };
    const groundHeight = (theme, bounds, x, z, habitat) => {
        return ZQ.terrainHeight(habitat?.terrain || ZQ.createTerrain(theme.id, bounds), x, z);
    };
    function plantGeometry(g, plant, floor, theme, random) {
        const start = g.vertices.length, profile = plantProfile(plant);
        const { x, z, h, form } = plant, pigment = color(plant.tint);
        const tint = theme.id === 'deep' ? mix(color(theme.rock), pigment, 0.32) : pigment;
        const path = Array.from({ length: 9 }, (_, j) => [x + Math.sin(j * 0.35 + x) * j * 0.023, floor + h * j / 8, z]);
        if (form === 'lily') {
            g.tube([[x, floor, z], [x + 0.06, floor + h * 0.5, z], [x, floor + h, z]], 0.025, tint, 6, 4);
            for (let i = 1; i < 20; i++) {
                const a = i * Math.PI * 2 / 20, b = (i + 1) * Math.PI * 2 / 20;
                g.triangle([x, floor + h, z], [x + Math.cos(a) * 0.66, floor + h, z + Math.sin(a) * 0.46],
                    [x + Math.cos(b) * 0.66, floor + h, z + Math.sin(b) * 0.46], mix(tint, color(theme.light), 0.12), 6);
            }
            if (plant.grove) for (let i = 0; i < 5; i++) {
                const dx = Math.sin(i * 2.4) * 0.45, dz = Math.cos(i * 2.4) * 0.3;
                g.tube([[x + dx, floor + h - 0.05, z + dz],
                    [x + dx + 0.07, floor + h - 0.7, z + dz],
                    [x + dx - 0.05, floor + h - 1.4, z + dz + 0.1]], 0.012, tint, 4, 4);
            }
        } else if (form === 'plate' || form === 'boulder') {
            if (form === 'boulder') g.sphere([x, floor + h * 0.35, z], [h * 0.34, h * 0.35, h * 0.32], tint, 6, 8, 12, 0.16);
            else {
                g.tube([[x, floor, z], [x, floor + h * 0.7, z]], 0.05, tint, 6, 4);
                for (const level of [0.25, 0.45, 0.65]) g.sphere([x + Math.sin(profile.phase + level * 8) * h * 0.035, floor + h * level, z],
                    [h * (0.4 - level * 0.1), h * 0.055, h * 0.29], mix(tint, color(theme.light), level * 0.2), 6, 5, 12, 0.12);
            }
        } else if (form === 'branch') {
            g.tube(path.slice(0, 6), 0.08, tint, 6, 5);
            for (let i = 0; i < 7; i++) {
                const angle = i * 2.4 + profile.phase, root = [x, floor + h * (0.18 + i * 0.07), z];
                const reach = 0.7 + Math.sin(i * 3.7 + profile.phase) * 0.25;
                const end = [x + Math.cos(angle) * h * 0.32 * reach, root[1] + h * (0.18 + 0.06 * Math.cos(angle)), z + Math.sin(angle) * h * 0.28 * reach];
                g.tube([root, [(root[0] + end[0]) / 2, end[1] - h * 0.12, (root[2] + end[2]) / 2], end], 0.055, tint, 6, 5);
                g.sphere(end, [0.06, 0.07, 0.06], mix(tint, color(theme.light), 0.3), 6, 4, 6);
            }
        } else if (form === 'fan' || form === 'anemone') {
            const luminous = theme.id === 'deep';
            g.tube(path.slice(0, 4), 0.04, tint, 6, 4);
            for (let i = 0; i < 9; i++) {
                const spread = (i - 4) / 4, root = [x, floor + h * 0.3, z];
                const length = 0.86 + Math.sin(i * 2.3 + profile.phase) * 0.12;
                const mid = [x + spread * h * 0.2, floor + h * 0.62, z + (form === 'anemone' ? Math.sin(i * 2.4) * 0.12 : 0)];
                const end = [x + spread * h * 0.3, floor + h * (0.9 - Math.abs(spread) * 0.13) * length, mid[2]];
                g.tube([root, mid, end], form === 'anemone' ? 0.023 : 0.013, tint, form === 'anemone' ? 4 : 6, 4);
                if (luminous) g.sphere(end, [0.045, 0.055, 0.045], pigment, 11, 4, 6);
                else g.tube([mid, [mid[0] + h * 0.07, mid[1] + h * 0.1, mid[2]]], 0.011, tint, 6, 4);
            }
        } else if (form === 'spire') {
            g.tube(path.slice(0, 7), h * 0.06, tint, 6, 5);
            for (const j of [3, 5, 7]) g.sphere(path[j], [0.06, 0.1, 0.06], pigment, 11, 4, 6);
        } else if (form === 'ribbon' || form === 'reed') {
            for (let i = 0; i < 7; i++) {
                const offset = (i - 3) * (plant.grove ? 0.16 : 0.07);
                let previous = [x + offset, floor, z];
                for (let j = 1; j <= 4; j++) {
                    const t = j / 4, width = Math.sin(t * Math.PI) * (plant.grove ? 0.14 : 0.085);
                    const point = [x + offset + Math.sin(t * 3 + i + profile.phase) * t * 0.09,
                        floor + h * (0.66 + (i % 4) * 0.1) * t, z + Math.sin(i + t * 2) * t * 0.09];
                    g.triangle(previous, [point[0] + width, point[1], point[2]], point, mix(tint, color(theme.light), i * 0.08), 4);
                    g.triangle(previous, point, [point[0] - width, point[1], point[2]], tint, 4);
                    previous = point;
                }
            }
        } else {
            g.tube(path, 0.016, tint, 4, 4);
            for (let j = 2; j < 9; j++) {
                const root = path[j], sign = j % 2 ? -1 : 1,
                    length = (0.3 + random() * 0.35) * (1 - j * 0.04) * (plant.grove ? h * 0.45 : 1);
                let previousLeft = root, previousRight = root;
                for (let k = 1; k <= 4; k++) {
                    const t = k / 4, width = Math.sin(Math.PI * t) * length * 0.18;
                    const mid = [root[0] + sign * length * t, root[1] + length * (t * 0.7 + Math.sin(t * Math.PI) * 0.16),
                        z + Math.sin(t * Math.PI + profile.phase) * t * 0.08];
                    const left = [mid[0], mid[1] + width, mid[2] + width * 0.4];
                    const right = [mid[0], mid[1] - width, mid[2] - width * 0.4];
                    g.triangle(previousLeft, previousRight, right, tint, 4);
                    g.triangle(previousLeft, right, left, mix(tint, color(theme.light), 0.12), 4);
                    previousLeft = left; previousRight = right;
                }
            }
        }
        for (let i = start; i < g.vertices.length; i += 10) {
            if (form !== 'lily') {
                const y = g.vertices[i + 1] - floor;
                g.vertices[i] = x + (g.vertices[i] - x) * profile.width + y * profile.lean;
                g.vertices[i + 1] = floor + y * profile.height;
                g.vertices[i + 2] = z + (g.vertices[i + 2] - z) * profile.depth;
                const normal = ZQ.normalize([g.vertices[i + 3] / profile.width,
                    (g.vertices[i + 4] - g.vertices[i + 3] * profile.lean / profile.width) / profile.height,
                    g.vertices[i + 5] / profile.depth]);
                for (let axis = 0; axis < 3; axis++) g.vertices[i + 3 + axis] = normal[axis];
            }
            const part = g.vertices[i + 9];
            // Encode local height in the existing part slot so raised roots stay anchored during sway.
            if (part === 4 || part === 11) g.vertices[i + 9] += ZQ.clamp((g.vertices[i + 1] - floor) * 0.04, 0, 0.45);
        }
    }

    function drawPlant2D(ctx, plant, p, theme, time, reduced) {
        const { h, form } = plant;
        const profile = plantProfile(plant);
        const sway = reduced || ['plate', 'boulder', 'branch', 'fan', 'lily', 'spire'].includes(form) ? 0 : Math.sin(time * 0.65 + plant.x) * 0.07;
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.scale, p.scale);
        if (form !== 'lily') ctx.transform(profile.width, 0, -profile.lean, profile.height, 0, 0);
        ctx.strokeStyle = plant.tint; ctx.fillStyle = plant.tint; ctx.lineWidth = theme.id === 'ink' ? 0.016 : 0.025;
        if (theme.id === 'deep') {
            ctx.strokeStyle = theme.rock;
            ctx.globalAlpha = reduced ? 0.88 : 0.88 + Math.sin(time * 0.35 + color(plant.tint)[0] * 8) * 0.12;
        }
        const path = points => {
            ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
        };
        if (form === 'lily') {
            path([[0, 0], [0.04, -h * 0.5], [0, -h]]);
            ctx.beginPath(); ctx.ellipse(0, -h, 0.66, 0.16, 0, 0.15, Math.PI * 2 - 0.15); ctx.lineTo(0, -h); ctx.fill();
            if (plant.grove) for (let i = 0; i < 5; i++) {
                const x = Math.sin(i * 2.4) * 0.45;
                path([[x, -h], [x + 0.07, -h + 0.7], [x - 0.05, -h + 1.4]]);
            }
        } else if (form === 'boulder') {
            ctx.beginPath();
            for (let i = 0; i <= 16; i++) {
                const a = i * Math.PI * 2 / 16, radius = 0.84 + Math.sin(a * 3 + profile.phase) * 0.1;
                const x = Math.cos(a) * h * 0.34 * radius, y = -h * 0.35 + Math.sin(a) * h * 0.35 * radius;
                if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
            }
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = theme.light; ctx.globalAlpha = 0.28;
            for (let i = 0; i < 10; i++) {
                ctx.beginPath(); ctx.arc(Math.sin(i * 2.4) * h * 0.23, -h * 0.35 + Math.cos(i * 2.4) * h * 0.2, 0.025, 0, Math.PI * 2); ctx.stroke();
            }
        } else if (form === 'plate') {
            path([[0, 0], [0, -h * 0.7]]);
            for (const level of [0.25, 0.45, 0.65]) {
                ctx.beginPath(); ctx.ellipse(Math.sin(profile.phase + level * 8) * h * 0.035, -h * level,
                    h * (0.4 - level * 0.1), h * 0.06, Math.sin(profile.phase + level * 8) * 0.12, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = theme.light; ctx.globalAlpha = 0.25; ctx.stroke(); ctx.globalAlpha = 1;
            }
        } else if (form === 'branch') {
            ctx.lineWidth = 0.06; path([[0, 0], [0.03, -h * 0.65]]);
            for (let i = 0; i < 7; i++) {
                const angle = i * 2.4 + profile.phase;
                const x = Math.cos(angle) * h * 0.32 * (0.7 + Math.sin(i * 3.7 + profile.phase) * 0.25), y = -h * (0.18 + i * 0.07);
                path([[0, y], [x * 0.5, y - h * 0.1], [x, y - h * (0.18 + 0.06 * Math.cos(angle))]]);
            }
        } else if (form === 'fan' || form === 'anemone') {
            path([[0, 0], [0, -h * 0.3]]);
            for (let i = 0; i < 9; i++) {
                const spread = (i - 4) / 4, x = spread * h * 0.3 + sway;
                const y = -h * (0.9 - Math.abs(spread) * 0.13) * (0.86 + Math.sin(i * 2.3 + profile.phase) * 0.12);
                ctx.beginPath(); ctx.moveTo(0, -h * 0.3); ctx.quadraticCurveTo(spread * h * 0.2, -h * 0.62, x, y); ctx.stroke();
                if (theme.id === 'deep') {
                    ctx.shadowColor = plant.tint; ctx.shadowBlur = 5;
                    ctx.beginPath(); ctx.arc(x, y, 0.035, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
                }
            }
        } else if (form === 'spire') {
            ctx.lineWidth = h * 0.12; path([[0, 0], [0.025, -h * 0.7]]);
            for (const level of [0.35, 0.6, 0.85]) {
                ctx.shadowColor = plant.tint; ctx.shadowBlur = 5; ctx.beginPath(); ctx.ellipse(0, -h * level, 0.05, 0.08, 0, 0, Math.PI * 2); ctx.fill();
            }
        } else if (form === 'ribbon' || form === 'reed') {
            for (let i = 0; i < 7; i++) {
                const offset = (i - 3) * (plant.grove ? 0.16 : 0.07), height = h * (0.66 + (i % 4) * 0.1);
                ctx.beginPath(); ctx.moveTo(offset, 0);
                ctx.quadraticCurveTo(offset + 0.18 + sway, -height * 0.55, offset - 0.04 + sway, -height);
                ctx.quadraticCurveTo(offset - 0.12 + sway, -height * 0.55, offset, 0); ctx.fill();
            }
        } else {
            path([[0, 0], [-0.08, -h * 0.4], [sway, -h]]);
            const canopy = plant.grove ? h * 0.45 : 1;
            for (let i = 1; i < 7; i++) {
                ctx.beginPath(); ctx.ellipse((i % 2 ? 1 : -1) * 0.2 * canopy + sway * i / 7, -h * i / 7, 0.22 * canopy, 0.065 * canopy,
                    i % 2 ? -0.7 : 0.7, 0, Math.PI * 2); ctx.stroke();
            }
        }
        ctx.restore();
    }

    function environment(theme, bounds, plantCount, groundExtent) {
        const g = new Geometry(), random = seeded(7319);
        const sand = color(theme.sand), rock = color(theme.rock);
        const floor = bounds.floor;
        const w = bounds.width;
        const habitat = ZQ.createHabitat(theme.id, bounds);
        const height = (x, z) => groundHeight(theme, bounds, x, z, habitat);
        const normals = new Map();
        const floorVertex = point => {
            const [x, y, z] = point, key = `${x}:${z}`;
            let normal = normals.get(key);
            if (!normal) {
                normal = ZQ.normalize([height(x - 0.1, z) - height(x + 0.1, z), 0.2,
                    height(x, z - 0.1) - height(x, z + 0.1)]);
                normals.set(key, normal);
            }
            const slope = 1 - normal[1];
            g.vertex(point, normal, mix(sand, rock, ZQ.clamp(slope * 0.65 + (y - floor) * 0.025, 0, 0.28)), 5);
        };
        const terrain = habitat.terrain;
        for (let ix = 0; ix < terrain.columns - 1; ix++) for (let iz = 0; iz < terrain.rows - 1; iz++) {
            const x = terrain.minX + ix * terrain.step, z = terrain.minZ + iz * terrain.step, step = terrain.step;
            const a = [x, height(x, z), z], b = [x, height(x, z + step), z + step];
            const c = [x + step, height(x + step, z + step), z + step], d = [x + step, height(x + step, z), z];
            for (const point of [a, b, c, a, c, d]) floorVertex(point);
        }
        const outerFloor = groundCorners(floor - Math.max(PARAMS.floorInset, 0.42), groundExtent);
        g.triangle(outerFloor[0], outerFloor[1], outerFloor[2], sand, 5);
        g.triangle(outerFloor[0], outerFloor[2], outerFloor[3], sand, 5);
        const rocks = habitat.rocks.flatMap(r => r.parts ? r.parts.map(p => ({ ...p, moss: r.moss })) : [r]);
        const sceneryRocks = [], sceneryPlants = [];
        const formations = plantCount > 40 ? 12 : plantCount > 20 ? 8 : 4;
        for (let i = 0; i < formations; i++) {
            const side = i % 2 ? 1 : -1;
            const x = side * (w + 1.3 + Math.floor(i / 2) * 1.7);
            const z = i % 4 < 2 ? -4.3 - random() * 2 : 7.5 + random();
            const h = 0.35 + random() * 0.9;
            sceneryRocks.push({ pos: [x, floor + h * 0.5, z], radius: [0.6 + random() * 0.7, h, 0.65] });
        }
        const extraPlants = Math.max(theme.id === 'ink' ? 8 : 0, plantCount - habitat.plants.length);
        const innerPlants = ['zen', 'ink'].includes(theme.id) ? Math.min(extraPlants, plantCount > 20 ? 12 : 8) : 0;
        for (let i = 0; i < innerPlants; i++) {
            const side = i % 2 ? 1 : -1, cluster = Math.floor(i / 2);
            sceneryPlants.push({ x: side * w * (0.42 + (cluster % 3) * 0.11) + (random() - 0.5) * 0.35,
                z: -2 + (cluster % 4) * 0.65 + (random() - 0.5) * 0.4,
                h: theme.id === 'zen' ? 0.65 + random() * 0.9 : 0.9 + random() * 1.2,
                tint: theme.plants[i % theme.plants.length], form: theme.id === 'zen' ? 'ribbon' : 'ink-leaf' });
        }
        for (let i = innerPlants; i < extraPlants; i++) {
            const side = i % 2 ? 1 : -1;
            sceneryPlants.push({ x: side * (w + 0.9 + random() * 7), z: i % 3 ? -4 - random() * 3 : 7.5 + random(),
                h: 0.65 + random() * 2.5, tint: habitat.plants[i % habitat.plants.length].tint,
                form: habitat.plants[i % habitat.plants.length].form });
        }
        sceneryRocks.forEach(r => { r.pos[1] += height(r.pos[0], r.pos[2]) - floor; });
        for (const { pos, radius, moss, roughness } of [...rocks, ...sceneryRocks]) {
            const solid = rocks.some(r => r.pos === pos);
            g.sphere([pos[0], height(pos[0], pos[2]) + 0.015, pos[2]], [radius[0] * 1.12, 0.018, radius[2] * 1.12],
                mix(sand, rock, theme.id === 'ink' ? 0.65 : 0.38), 10, solid ? 3 : 2, solid ? 12 : 6);
            g.sphere(pos, radius, mix(rock, sand, random() * 0.3), 6, solid ? 8 : 4, solid ? (plantCount > 20 ? 12 : 9) : 6, roughness ?? 0.2);
            if (moss || theme.id === 'koi' && random() > 0.65)
                g.sphere([pos[0], pos[1] + radius[1] * 0.8, pos[2]], [radius[0] * 0.56, radius[1] * 0.18, radius[2] * 0.6],
                    color(theme.plants[0]), 6, 5, 8);
        }
        const plants = habitat.plants;
        const allPlants = [...plants, ...sceneryPlants];
        sceneryPlants.forEach(p => { p.floor = height(p.x, p.z); });
        for (const plant of allPlants) plantGeometry(g, plant, plant.floor ?? floor, theme, random);
        const rakeContours = [];
        if (theme.id === 'zen') for (let i = 0; i < 12; i++) {
            const path = Array.from({ length: 24 }, (_, j) => {
                const x = -w + j * w * 2 / 23, z = -2.4 + i * 0.34 + Math.sin(x * 0.4) * 0.08;
                return [x, height(x, z) + 0.012, z];
            });
            rakeContours.push(path);
            g.tube(path, 0.004, mix(sand, rock, 0.22), 6, 3);
        }
        for (let i = 0; i < 60; i++) {
            const x = (random() - 0.5) * w * 2.5, z = (random() - 0.5) * 9, r = 0.025 + random() * 0.075;
            g.sphere([x, height(x, z) + r * 0.4, z], [r * 1.4, r * 0.7, r], mix(sand, rock, random() * 0.7), 6, 3, 5);
        }
        const rockContours = [...rocks, ...sceneryRocks].map(r => {
            const phase = r.pos[0] * 1.7 + r.pos[2] * 2.3;
            return Array.from({ length: 20 }, (_, i) => {
                const a = i * Math.PI * 2 / 20;
                const erosion = 0.81 + Math.sin(a * 3 + phase) * 0.09 + Math.cos(a * 5 - phase) * 0.04;
                return [Math.cos(a) * erosion, Math.sin(a) * erosion];
            });
        });
        const sandContours = Array.from({ length: 12 }, (_, i) => Array.from({ length: 24 }, (_, j) => {
            const x = -w + j * w * 2 / 23, z = -2.7 + i * 0.45 + Math.sin(x * 0.65 + i * 0.3) * 0.16;
            return [x, height(x, z) + 0.012, z];
        }));
        const terrainFaces = [];
        for (let x = -w - 1; x < w + 1; x += 0.8) for (let z = -4; z < bounds.depth + 1; z += 0.8) {
            const points = [[x, height(x, z), z], [x, height(x, z + 0.8), z + 0.8],
                [x + 0.8, height(x + 0.8, z + 0.8), z + 0.8], [x + 0.8, height(x + 0.8, z), z]];
            const shade = ZQ.clamp(0.06 + (points[2][1] - points[0][1]) * 0.18, 0, 0.22);
            const tint = mix(sand, rock, shade).map(n => Math.round(n * 255));
            terrainFaces.push({ points, pos: [x + 0.4, (points[0][1] + points[2][1]) / 2, z + 0.4], tint: `rgb(${tint.join(',')})` });
        }
        return { geometry: g, rocks, plants, sceneryRocks, sceneryPlants, rockContours, sandContours, rakeContours, habitat, terrainFaces };
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
        uniform float u_effort;
        uniform float u_bubble;
        varying vec3 v_world;
        varying vec3 v_normal;
        varying vec3 v_local;
        varying vec3 v_color;
        varying float v_part;
        void main() {
            vec3 p = a_position;
            if (u_kind < 0.5) {
                if (a_part > 3.5 && a_part < 4.5) {
                    p.y = -0.03 + (p.y + 0.03) * (1.0 + u_bubble * 1.4 * u_motion);
                    p.x += u_bubble * 0.035 * u_motion;
                } else if (a_part < 0.5) {
                    p.y *= 1.0 + max(0.0, p.x - 0.3) * u_bubble * 0.12 * u_motion;
                }
                float tail = max(0.0, -p.x + 0.15);
                p.z += sin(u_phase + p.x * 4.0) * tail * tail * 0.11 * u_motion * u_effort;
                if (a_part > 0.5 && a_part < 1.5) p.y += sin(u_phase * 0.65 + p.z * 4.0) * abs(p.z) * 0.16 * u_motion * u_effort;
            } else if (u_kind < 1.5 && ((a_part > 3.5 && a_part < 4.5) || (a_part > 10.5 && a_part < 11.5))) {
                float h = fract(a_part) * 25.0;
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
            if (u_ink > 0.5) base = mix(u_water, u_surface, 0.12 + uv.y * 0.68);
            float ray1 = pow(max(0.0, sin((uv.x + uv.y * 0.22) * 24.0 + sin(u_time * 0.08))), 14.0);
            float ray2 = pow(max(0.0, sin((uv.x + uv.y * 0.17) * 39.0 - u_time * 0.07)), 24.0);
            float rays = (ray1 * 0.085 + ray2 * 0.04) * pow(uv.y, 0.75);
            base += u_light * rays * (1.0 - u_deep * 0.85) * (1.0 - u_ink * 0.85);
            vec2 centered = (uv - vec2(0.48, 0.53)) * vec2(min(u_aspect, 1.4), 1.0);
            base *= 1.0 - min(0.36, dot(centered, centered) * 0.55) * (1.0 - u_ink * 0.88);
            if (u_style > 2.5 && u_style < 3.5) {
                float morning = exp(-length((uv - vec2(0.32, 0.9)) * vec2(1.1, 0.7)) * 3.0);
                float layers = sin(uv.x * 5.0 + uv.y * 3.0) * 0.025;
                base = mix(u_water, u_surface, smoothstep(0.1, 1.0, uv.y) * 0.55);
                base += u_light * morning * 0.07 + vec3(0.04, 0.08, 0.08) * layers;
            } else if (u_style < 0.5) {
                float shade = smoothstep(0.2, 0.8, sin(uv.x * 18.0 + sin(uv.y * 12.0 + u_time * 0.035)));
                base *= 1.0 - shade * uv.y * 0.12;
                base += u_light * pow(uv.y, 3.0) * 0.05;
            } else if (u_style < 1.5) {
                base = mix(base, vec3(0.025, 0.09, 0.25), (1.0 - uv.y) * 0.24);
            } else if (u_style < 2.5) {
                float haze = exp(-length((uv - vec2(0.7, 0.6)) * vec2(1.2, 1.0)) * 4.0);
                base += vec3(0.07, 0.025, 0.13) * haze;
            } else {
                float paper = sin(uv.x * 650.0) * sin(uv.y * 720.0) * 0.008;
                base += paper;
            }
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
        uniform float u_motion;
        uniform float u_pattern;
        uniform float u_ink;
        uniform float u_style;
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
                } else if (u_pattern > 7.5 && u_pattern < 8.5) {
                    float stripes = 1.0 - smoothstep(0.45, 0.7, abs(sin((v_local.y + sin(v_local.x * 3.0) * 0.012) * 29.0)));
                    base = mix(base, u_accent, stripes * 0.9);
                } else if (u_pattern > 8.5 && u_pattern < 9.5) {
                    float ribs = step(0.7, sin(v_local.x * 48.0 + v_local.y * 8.0));
                    base = mix(base, u_accent, ribs * 0.24);
                } else if (u_pattern > 9.5 && u_pattern < 10.5) {
                    float pearl = 1.0 - smoothstep(0.02, 0.08, abs(v_local.y + 0.02));
                    base = mix(base, u_accent, pearl * 0.45);
                } else if (u_pattern > 10.5 && u_pattern < 11.5) {
                    float stripe = 1.0 - smoothstep(0.02, 0.045, abs(v_local.y));
                    base = mix(base, u_accent, stripe * 0.9);
                } else if (u_pattern > 11.5) {
                    float dots = sin(v_local.x * 27.0) * sin(v_local.y * 55.0);
                    base = mix(base, u_accent, smoothstep(0.84, 0.96, dots));
                }
                float scales = sin(v_local.x * 90.0 + sin(v_local.y * 64.0)) * sin(v_local.y * 64.0);
                base *= 0.98 + scales * 0.018;
            }
            vec3 lightDir = normalize(vec3(-0.35, 0.9, 0.45));
            float diffuse = max(0.0, dot(normal, lightDir));
            float rim = pow(1.0 - facing, 3.0);
            float specular = pow(max(0.0, dot(normal, normalize(view + lightDir))), 38.0);
            vec3 lit = base * (0.48 + diffuse * 0.55) + u_light * (specular * 0.3 + rim * 0.13);
            if (u_style > 2.5 && u_style < 3.5) lit = base * (0.48 + diffuse * 0.58) + u_light * (specular * 0.18 + rim * 0.08);
            float c1 = sin(v_world.x * 2.7 + sin(v_world.z * 2.4 + u_time * 0.26) + u_time * 0.35);
            float c2 = sin(v_world.z * 3.1 + sin(v_world.x * 2.2 - u_time * 0.22));
            float caustic = pow(max(0.0, 1.0 - abs(c1 + c2) * 0.55), 12.0);
            lit += u_light * caustic * (0.06 + max(0.0, normal.y) * 0.14) * (1.0 - u_deep * 0.8);
            if (v_part > 4.5 && v_part < 5.5) {
                float sandWave = sin(v_world.x * 4.0 + v_world.z * 3.0 + sin(v_world.z * 1.5));
                if (u_style > 2.5 && u_style < 3.5) sandWave = sin((v_world.z + sin(v_world.x * 0.4) * 0.08) * 18.5);
                lit *= 0.94 + sandWave * 0.045;
            }
            if ((v_part > 2.5 && v_part < 3.5) || (v_part > 10.5 && v_part < 11.5)) glow = 0.65;
            if (u_deep > 0.5) glow *= 0.88 + sin(u_time * 0.35 + base.r * 8.0) * 0.12 * u_motion;
            lit += base * glow;
            lit += u_accent * rim * u_deep * 0.65 * (1.0 - step(3.5, v_part));
            if (u_ink > 0.5) {
                float isFish = 1.0 - step(0.5, v_part);
                float edge = 1.0 - smoothstep(0.04, mix(0.2, 0.34, isFish), facing);
                float shade = 1.0 - diffuse;
                float hatch = step(0.78, sin((v_local.x + v_local.y + v_local.z * 0.35) * 55.0)) * smoothstep(0.2, 0.8, shade);
                float crosshatch = step(0.86, sin((v_local.x - v_local.y + v_local.z * 0.5) * 65.0)) * smoothstep(0.65, 0.95, shade);
                float wash = 0.82 + sin(v_local.x * 8.0 + v_local.z * 5.0) * sin(v_local.y * 9.0) * 0.06;
                float stipple = step(0.93, sin(v_local.x * 103.0) * sin(v_local.y * 97.0)) * shade;
                vec3 paper = vec3(0.98, 0.94, 0.86);
                vec3 pigment = mix(paper, base, wash) * (0.72 + diffuse * 0.28);
                vec3 ink = mix(vec3(0.12, 0.15, 0.18), u_accent * 0.48, 0.25);
                lit = mix(pigment, ink, min(0.94, edge * 0.86 + hatch * 0.32 + crosshatch * 0.22 + stipple * 0.2));
                if (v_part > 4.5 && v_part < 5.5) lit = mix(paper, base, 0.85) * (0.55 + diffuse * 0.5 + caustic * 0.03);
                if (v_part > 1.5 && v_part < 3.5) lit = base;
            }
            float distanceToEye = length(v_world - u_camera);
            float clearWater = u_style > 2.5 ? 0.009 : 0.025;
            float fog = 1.0 - exp(-max(0.0, distanceToEye - 5.0) * (clearWater + (1.0 - u_health) * 0.14 + u_deep * 0.012));
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
        uniform float u_style;
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
                    this.environmentKey = null;
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
            this.canvas.setAttribute('aria-label', 'Living aquarium. Tap glass with G; drag empty water to orbit. Press creatures and drag outward to defend: X for jellyfish, squid, or octopus, J and L alternating for crabs. Hold on a coiling eel, or hold H, to discharge it. Open Residents for details and following.');
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
            const speciesChanged = this.theme?.id !== theme.id || this.gl && !this.fishMeshes?.length;
            this.theme = theme; this.bounds = { ...bounds };
            const cfg = PARAMS.quality[this.level];
            const tangent = Math.tan(PARAMS.fov / 2);
            this.groundExtent = PARAMS.camera.maxDistance + Math.hypot(bounds.width, bounds.depth)
                + PARAMS.far * Math.hypot(1, tangent, tangent * Math.max(6, Math.ceil(this.width / this.height)));
            const key = [theme.id, bounds.width, bounds.floor, bounds.surface, bounds.depth, this.level, this.groundExtent].join(':');
            if (key === this.environmentKey && !speciesChanged) return;
            this.environmentKey = key;
            this.decor = environment(theme, bounds, cfg.plants, this.groundExtent);
            this.palette = { water: color(theme.water), surface: color(theme.surface), light: color(theme.light), accent: color(theme.fish[0].accent) };
            if (this.gl) {
                this.releaseMesh(this.sceneMesh);
                this.sceneMesh = this.mesh(this.decor.geometry);
                if (speciesChanged) {
                    this.fishMeshes?.forEach(m => this.releaseMesh(m));
                    this.creatureMeshes?.forEach(m => this.releaseMesh(m));
                    Object.values(this.prizeMeshes || {}).forEach(m => { this.releaseMesh(m.base); this.releaseMesh(m.lid); this.releaseMesh(m.pearl); });
                    this.releaseMesh(this.cloudMesh);
                    this.fishMeshes = theme.fish.map(fishGeometry).map(g => this.mesh(g));
                    this.creatureMeshes = theme.visitors.map(creatureGeometry).map(g => this.mesh(g));
                    this.prizeMeshes = Object.fromEntries(ZQ.PRIZES.map(prize => {
                        const geometry = prizeGeometry(theme, prize.id);
                        return [prize.id, { base: this.mesh(geometry.base), lid: geometry.lid ? this.mesh(geometry.lid) : null,
                            pearl: geometry.pearl ? this.mesh(geometry.pearl) : null }];
                    }));
                    const cloud = new Geometry();
                    cloud.sphere([0, 0, 0], [1, 0.85, 1], color(PARAMS.ink), 2, 10, 16);
                    this.cloudMesh = this.mesh(cloud);
                }
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
            const halfHeight = (b.surface - b.floor) * 0.5;
            // Fill one screen dimension with active water; portrait crops the sides, wide screens crop vertically.
            const fit = Math.min((b.width + 0.2) / (Math.tan(PARAMS.fov / 2) * aspect),
                (halfHeight + 0.2) / Math.tan(PARAMS.fov / 2)) + b.depth * 0.35;
            const distance = ZQ.clamp(fit * c.zoom * (followed ? 0.62 : 1), limits.minDistance, limits.maxDistance);
            this.eye = [Math.sin(c.yaw) * Math.cos(c.pitch) * distance + c.target[0],
                Math.max(b.floor + limits.floorClearance, Math.sin(c.pitch) * distance + c.target[1]),
                Math.cos(c.yaw) * Math.cos(c.pitch) * distance + c.target[2]];
            const terrain = ZQ.createTerrain(state.themeId, b);
            this.eye[1] = Math.max(this.eye[1], ZQ.terrainHeight(terrain, this.eye[0], this.eye[2]) + limits.floorClearance);
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
        sandPoint(x, y, floor) {
            if (!this.vp) return null;
            const inv = inverse(this.vp);
            const a = transform(inv, [x / this.width * 2 - 1, 1 - y / this.height * 2, -1, 1]);
            const b = transform(inv, [x / this.width * 2 - 1, 1 - y / this.height * 2, 1, 1]);
            const start = a.slice(0, 3).map(n => n / a[3]), end = b.slice(0, 3).map(n => n / b[3]);
            const delta = end.map((n, i) => n - start[i]);
            if (Math.abs(delta[1]) < 1e-7) return null;
            const t = (floor - start[1]) / delta[1];
            if (t <= 0 || !Number.isFinite(t)) return null;
            if (this.decor?.habitat.terrain) {
                const length = Math.hypot(...delta), steps = Math.ceil(t * length / 0.12);
                let previous = 0;
                for (let i = 1; i <= steps; i++) {
                    const fraction = t * i / steps, p = start.map((n, axis) => n + delta[axis] * fraction);
                    if (p[1] <= ZQ.terrainHeight(this.decor.habitat.terrain, p[0], p[2])) {
                        let low = previous, high = fraction;
                        for (let j = 0; j < 18; j++) {
                            const mid = (low + high) / 2, point = start.map((n, axis) => n + delta[axis] * mid);
                            if (point[1] > ZQ.terrainHeight(this.decor.habitat.terrain, point[0], point[2])) low = mid;
                            else high = mid;
                        }
                        return start.map((n, axis) => n + delta[axis] * high);
                    }
                    previous = fraction;
                }
            }
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
                if (prize.preview) continue;
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
        drawMesh(mesh, matrix, kind, phase, accent, pattern = 7, alpha = 1, effort = 1, bubble = 0) {
            const gl = this.gl, p = this.main;
            this.attributes(p.program, mesh.buffer, [['a_position', 3], ['a_normal', 3], ['a_color', 3], ['a_part', 1]], 10);
            gl.uniformMatrix4fv(p.uniform('u_model'), false, matrix);
            gl.uniform1f(p.uniform('u_kind'), kind);
            gl.uniform1f(p.uniform('u_phase'), phase);
            gl.uniform3fv(p.uniform('u_accent'), accent);
            gl.uniform1f(p.uniform('u_pattern'), pattern);
            gl.uniform1f(p.uniform('u_alpha'), alpha);
            gl.uniform1f(p.uniform('u_effort'), effort);
            gl.uniform1f(p.uniform('u_bubble'), bubble);
            gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
        }
        particleData(state, time) {
            const data = [], rng = seeded(4421), b = state.bounds;
            const terrain = this.decor?.habitat.terrain || ZQ.createTerrain(this.theme.id, b);
            const count = this.reduced ? 16 : PARAMS.quality[this.level].motes;
            const base = this.palette.light;
            for (let i = 0; i < count; i++) {
                const r1 = rng(), r2 = rng(), r3 = rng();
                const bubble = i % 7 === 0, petal = this.theme.id === 'koi' && i % 5 === 0;
                const speed = bubble ? 0.1 : petal ? -0.015 : 0.019;
                const progress = ((r2 + time * speed / 8) % 1 + 1) % 1;
                const x = ZQ.clamp((r1 - 0.5) * b.width * 2 + Math.sin(time * 0.25 + i) * 0.2, -b.width, b.width),
                    z = (r3 - 0.5) * b.depth * 2;
                const ground = ZQ.terrainHeight(terrain, x, z);
                const pos = [x,
                    ground + progress * (b.surface - ground), z];
                const tint = petal ? color('#f0c0c0') : this.theme.id === 'deep' && !bubble
                    ? color(this.theme.plants[i % this.theme.plants.length]) : base;
                data.push(...pos, ...tint, bubble ? 7 + r3 * 6 : petal ? 6 : 2 + r3 * 3,
                    bubble ? 0.35 : this.theme.id === 'deep' ? 0.38 : 0.3, bubble ? 1 : petal ? 2 : 0);
            }
            for (const food of state.food) data.push(...food.pos, ...color(PARAMS.food), 7, Math.min(1, (ZQ.CONFIG.foodLifetime - food.age) / 2), 2);
            for (const bubble of state.bubbles || []) {
                const drift = Math.sin(bubble.age * 3 + bubble.phase) - Math.sin(bubble.phase);
                data.push(ZQ.clamp(bubble.pos[0] + drift * 0.06, -b.width, b.width), bubble.pos[1],
                    ZQ.clamp(bubble.pos[2] + drift * 0.035, -b.depth, b.depth), ...base,
                    ZQ.clamp(5 + bubble.size * 5, 5, 10) * (1 + bubble.age * 0.15),
                    Math.min(0.65, (2.4 - bubble.age) * 0.5), 1);
            }
            for (const attack of state.attacks) {
                if (attack.kind === 'stingers') {
                    for (const pos of attack.nodes) {
                        const tint = color(this.theme.visitors.find(v => v.kind === 'jellyfish').accent);
                        for (let i = 0; i < 8; i++) data.push(pos[0] + Math.sin(time * 2 + i) * 0.035,
                            pos[1] + i / 7 * ZQ.CONFIG.stingerLength, pos[2], ...tint, 10, 0.85, 0);
                    }
                } else if (attack.kind === 'shock') {
                    const radius = ZQ.electricRadius(attack);
                    for (let i = 0; i < 96; i++) {
                        const angle = (i % 32) * Math.PI / 16, plane = Math.floor(i / 32);
                        const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
                        data.push(attack.pos[0] + (plane === 2 ? 0 : x),
                            attack.pos[1] + (plane === 1 ? 0 : plane === 2 ? x : y),
                            attack.pos[2] + (plane === 0 ? 0 : y),
                            ...color(this.theme.visitors.find(v => v.kind === 'eel').accent), 12, Math.max(0, 1 - attack.age / attack.life), 0);
                    }
                }
            }
            for (const prize of this.prizes || []) {
                if (prize.preview) continue;
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
            if (c && !c.defended) {
                const tint = color(this.theme.visitors[c.index].accent);
                if (c.kind === 'crab' && c.phase === 'recover' && c.cooldown > ZQ.CONFIG.visitorKillCooldown - 0.9) {
                    const age = ZQ.CONFIG.visitorKillCooldown - c.cooldown;
                    for (let i = 0; i < 12; i++) {
                        const angle = i * Math.PI / 6, radius = 0.2 + age * 0.8;
                        data.push(c.pos[0] + Math.cos(angle) * radius, b.floor + 0.12 + age * 0.35,
                            c.pos[2] + Math.sin(angle) * radius, ...color(this.theme.sand), 10, (1 - age / 0.9) * 0.6, 0);
                    }
                }
                if (c.phase === 'windup') {
                    const warning = c.kind === 'eel' ? ZQ.CONFIG.eelWarning : ZQ.CONFIG.encounterWarning;
                    const radius = 0.65 + c.phaseTimer / warning * 0.9;
                    for (let i = 0; i < 24; i++) {
                        const angle = i * Math.PI / 12;
                        data.push(c.pos[0] + Math.cos(angle) * radius, c.pos[1] + Math.sin(angle) * radius, c.pos[2],
                            ...tint, 9, 0.75, 0);
                    }
                    if (c.kind === 'eel') for (let i = 0; i < 18 * c.holdCharge / ZQ.CONFIG.eelHold; i++) {
                        const angle = i * Math.PI / 9;
                        data.push(c.pos[0] + Math.cos(angle) * 0.5, c.pos[1] + Math.sin(angle) * 0.5, c.pos[2], ...tint, 12, 0.95, 0);
                    }
                }
                if (c.kind !== 'eel') for (let i = 0; i < c.defenseStep; i++) {
                    data.push(c.pos[0] + (i - 1) * 0.25, c.pos[1] + 0.8, c.pos[2], ...tint, 12, 0.9, 0);
                }
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
            const style = ['koi', 'tropical', 'deep', 'zen', 'ink'].indexOf(this.theme.id);
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
            gl.uniform1f(bg.uniform('u_style'), style);
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
            gl.uniform1f(p.uniform('u_style'), style);
            gl.uniform1f(p.uniform('u_deep'), deep);
            gl.uniform1f(p.uniform('u_health'), state.tankHealth / 100);
            this.drawMesh(this.sceneMesh, identity(), 1, 0, color(this.theme.id === 'ink' ? '#4a4137' : this.theme.plants[0]));
            const prizeAccent = color(prizePalette(this.theme).gold);
            for (const prize of this.prizes || []) {
                const mesh = this.prizeMeshes[prize.id], matrix = model(prize.pos);
                const alpha = prize.preview ? 0.35 : 1;
                if (prize.preview) { gl.enable(gl.BLEND); gl.depthMask(false); }
                this.drawMesh(mesh.base, matrix, 1, 0, prizeAccent, 7, alpha);
                if (mesh.lid) {
                    const active = state.prizeEffects[prize.id] || 0;
                    const opening = prizeOpening(prize.id, time, active, this.reduced);
                    if (mesh.pearl && opening > 0.42) this.drawMesh(mesh.pearl, matrix, 1, 0, color(PARAMS.pearl), 7, alpha);
                    const hinge = model([0, prize.id === 'chest' ? 0.44 : 0.15, prize.id === 'chest' ? -0.35 : -0.33]);
                    this.drawMesh(mesh.lid, multiply(matrix, multiply(hinge, rotateX(-opening * 1.1))), 1, 0, prizeAccent, 7, alpha);
                }
                if (prize.preview) { gl.depthMask(true); gl.disable(gl.BLEND); }
            }
            for (const f of state.fish) {
                const def = this.theme.fish[f.type];
                const bubble = ZQ.bubblePose(f);
                this.drawMesh(this.fishMeshes[f.type], model(f.pos, f.yaw, bubble.pitch, ZQ.fishScale(f), this.reduced ? 0 : f.roll),
                    0, f.phase, color(def.accent), def.pattern, 1,
                    ZQ.clamp((Math.hypot(...f.vel) / def.speed) *
                        (0.4 + ZQ.swimRhythm(f, def).propulsion * 0.6), 0.2, 1.5), bubble.pulse);
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
                const pose = ZQ.deathPose(f);
                this.drawMesh(this.fishMeshes[f.type], model(f.pos, f.yaw, pose.pitch, ZQ.fishScale(f), pose.roll),
                    0, f.phase, color(def.accent), def.pattern, pose.alpha, 0);
            }
            for (const attack of state.attacks) if (attack.kind === 'ink') {
                for (const blob of ZQ.inkBlobs(attack)) this.drawMesh(this.cloudMesh, model(blob.pos, 0, 0, blob.radius[0]),
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
            if (theme.id === 'zen') background.addColorStop(0.25, '#548ca6');
            if (theme.id === 'tropical') background.addColorStop(1, '#073254');
            ctx.fillStyle = background; ctx.fillRect(0, 0, w, h);
            if (theme.id === 'deep') {
                const haze = ctx.createRadialGradient(w * 0.7, h * 0.4, 0, w * 0.7, h * 0.4, Math.max(w, h) * 0.5);
                haze.addColorStop(0, '#37225c55'); haze.addColorStop(1, '#37225c00');
                ctx.fillStyle = haze; ctx.fillRect(0, 0, w, h);
            }
            ctx.globalAlpha = theme.id === 'deep' ? 0.012 : theme.id === 'zen' || theme.id === 'ink' ? 0.035 : 0.055;
            ctx.fillStyle = theme.light;
            for (let i = 0; i < 6; i++) {
                const x = w * i / 5 + Math.sin(time * 0.1 + i) * 15;
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - w * 0.18, h);
                ctx.lineTo(x - w * 0.18 + 80, h); ctx.lineTo(x + 18, 0); ctx.fill();
            }
            ctx.globalAlpha = 1;
            if (theme.id === 'koi') {
                ctx.save(); ctx.globalAlpha = 0.055; ctx.fillStyle = theme.rock;
                for (let i = 0; i < 14; i++) {
                    const x = w * (i / 14) + Math.sin(time * 0.035 + i) * 12;
                    ctx.beginPath(); ctx.ellipse(x, h * (0.05 + (i % 3) * 0.12), w * 0.045, h * 0.035, i, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }
            const corners = this.floorPolygon(state.bounds.floor);
            const sand = ctx.createLinearGradient(0, Math.min(...corners.map(p => p.y)), 0, h);
            sand.addColorStop(0, theme.sand + '00'); sand.addColorStop(0.3, theme.sand);
            ctx.beginPath(); corners.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
            ctx.closePath(); ctx.fillStyle = sand; ctx.globalAlpha = ['zen', 'ink'].includes(theme.id) ? 0.85 : 0.7; ctx.fill(); ctx.globalAlpha = 1;
            if (this.decor.sandContours) {
                ctx.save(); ctx.strokeStyle = theme.rock; ctx.globalAlpha = 0.12; ctx.lineWidth = 1.2;
                for (const line of this.decor.sandContours) {
                    ctx.beginPath();
                    line.forEach((point, i) => {
                        const p = this.project(point);
                        if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
                    });
                    ctx.stroke();
                }
                ctx.restore();
            }
            if (theme.id === 'zen') {
                ctx.save(); ctx.globalAlpha = 0.18; ctx.strokeStyle = theme.rock; ctx.lineWidth = 1;
                for (const line of this.decor.rakeContours || []) {
                    ctx.beginPath();
                    line.forEach((point, i) => {
                        const p = this.project(point);
                        if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
                    });
                    ctx.stroke();
                }
                ctx.restore();
            }
            const decorations = [...(this.decor.terrainFaces || []).map(face => ({ kind: 'terrain', pos: face.pos, item: face })),
                ...[...this.decor.rocks, ...this.decor.sceneryRocks].map((r, i) => ({ kind: 'rock', pos: r.pos, item: r, contour: this.decor.rockContours?.[i] })),
                ...[...this.decor.plants, ...this.decor.sceneryPlants].map(p => ({ kind: 'plant', pos: [p.x, p.floor ?? state.bounds.floor, p.z], item: p }))];
            decorations.sort((a, b) => this.project(b.pos).depth - this.project(a.pos).depth);
            for (const item of decorations) {
                const p = this.project(item.pos);
                if (!p.visible) continue;
                if (item.kind === 'terrain') {
                    ctx.fillStyle = item.item.tint; ctx.beginPath();
                    item.item.points.forEach((point, i) => { const screen = this.project(point);
                        if (i) ctx.lineTo(screen.x, screen.y); else ctx.moveTo(screen.x, screen.y);
                    });
                    ctx.closePath(); ctx.fill();
                } else if (item.kind === 'rock') {
                    const wash = ctx.createLinearGradient(p.x, p.y - item.item.radius[1] * p.scale, p.x, p.y + item.item.radius[1] * p.scale);
                    wash.addColorStop(0, theme.id === 'ink' ? '#a1aeb4' : theme.rock);
                    wash.addColorStop(1, theme.id === 'ink' ? '#394956' : theme.sand);
                    ctx.fillStyle = wash;
                    ctx.beginPath();
                    if (item.contour) {
                        const contour = item.contour;
                        const last = contour[contour.length - 1], first = contour[0];
                        ctx.moveTo(p.x + (last[0] + first[0]) * item.item.radius[0] * p.scale / 2,
                            p.y + (last[1] + first[1]) * item.item.radius[1] * p.scale / 2);
                        contour.forEach(([x, y], i) => {
                            const next = contour[(i + 1) % contour.length];
                            ctx.quadraticCurveTo(p.x + x * item.item.radius[0] * p.scale, p.y + y * item.item.radius[1] * p.scale,
                                p.x + (x + next[0]) * item.item.radius[0] * p.scale / 2,
                                p.y + (y + next[1]) * item.item.radius[1] * p.scale / 2);
                        });
                        ctx.closePath();
                    } else ctx.ellipse(p.x, p.y, item.item.radius[0] * p.scale, item.item.radius[1] * p.scale, 0.1, 0, Math.PI * 2);
                    ctx.fill();
                    if (theme.id === 'ink') {
                        ctx.strokeStyle = '#293742'; ctx.lineWidth = 1.4; ctx.stroke();
                        ctx.save(); ctx.clip(); ctx.globalAlpha = 0.35;
                        for (let j = -8; j < 9; j++) {
                            ctx.beginPath(); ctx.moveTo(p.x + j * 6, p.y);
                            ctx.lineTo(p.x + j * 6 - 20, p.y + item.item.radius[1] * p.scale); ctx.stroke();
                        }
                        ctx.fillStyle = '#293742';
                        for (let j = 0; j < 24; j++) {
                            ctx.beginPath();
                            ctx.arc(p.x + Math.sin(j * 2.4) * item.item.radius[0] * p.scale * 0.9,
                                p.y + (j / 24) * item.item.radius[1] * p.scale, 0.7, 0, Math.PI * 2); ctx.fill();
                        }
                        ctx.restore();
                    }
                    if (item.item.moss) {
                        ctx.fillStyle = theme.plants[0]; ctx.beginPath();
                        ctx.ellipse(p.x, p.y - item.item.radius[1] * p.scale * 0.78,
                            item.item.radius[0] * p.scale * 0.6, item.item.radius[1] * p.scale * 0.18, 0, 0, Math.PI * 2); ctx.fill();
                    }
                } else {
                    drawPlant2D(ctx, item.item, p, theme, time, this.reduced);
                }
            }
            const entities = state.fish.map(f => ({ pos: f.pos, fish: f }));
            for (const f of state.dead) entities.push({ pos: f.pos, fish: f, dead: true });
            if (state.creature) entities.push({ pos: state.creature.pos, creature: state.creature });
            entities.sort((a, b) => this.project(b.pos).depth - this.project(a.pos).depth);
            for (const entity of entities) {
                const p = this.project(entity.pos);
                if (!p.visible) continue;
                ctx.save(); ctx.translate(p.x, p.y);
                if (entity.dead) {
                    const pose = ZQ.deathPose(entity.fish);
                    ctx.globalAlpha = pose.alpha;
                    ctx.scale(1, Math.cos(pose.roll));
                }
                if (entity.fish) {
                    const f = entity.fish, def = theme.fish[f.type];
                    const bubble = entity.dead ? { pitch: f.pitch, pulse: 0 } : ZQ.bubblePose(f);
                    const size = p.scale * ZQ.fishScale(f);
                    const direction = Math.cos(f.yaw - this.camera.yaw) < 0 ? -1 : 1;
                    ctx.scale(size * direction, size);
                    ctx.rotate(entity.dead ? -ZQ.deathPose(f).pitch : -bubble.pitch + (this.reduced ? 0 : f.roll * 0.3));
                    const { ry, tailSpan, tailLength, finHeight } = fishForm(def);
                    ctx.fillStyle = def.fin; ctx.strokeStyle = theme.id === 'ink' ? '#263742' : def.accent; ctx.lineWidth = theme.id === 'ink' ? 0.035 : 0.02;
                    ctx.beginPath(); ctx.moveTo(-0.6, 0);
                    if (def.shape === 'betta') {
                        ctx.quadraticCurveTo(-1, -0.9, -tailLength, -tailSpan / 2);
                        ctx.quadraticCurveTo(-1.7, 0, -tailLength, tailSpan / 2);
                    } else {
                        ctx.lineTo(-tailLength, -tailSpan / 2); ctx.lineTo(def.shape === 'lyretail' ? -0.95 : -1.1 + Math.sin(f.phase) * 0.12, 0);
                        ctx.lineTo(-tailLength, tailSpan / 2);
                    }
                    ctx.closePath(); ctx.fill(); if (theme.id === 'ink') ctx.stroke();
                    if (['betta', 'lyretail', 'catfish'].includes(def.shape)) {
                        for (const side of [-1, 1]) {
                            ctx.beginPath(); ctx.moveTo(0.22, side * ry * 0.8); ctx.lineTo(-0.35, side * finHeight);
                            ctx.lineTo(-0.61, side * ry * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
                        }
                    }
                    const gradient = ctx.createLinearGradient(0, -ry, 0, ry);
                    gradient.addColorStop(0, def.accent); gradient.addColorStop(0.42, def.body); gradient.addColorStop(1, def.fin);
                    ctx.fillStyle = gradient; ctx.beginPath(); ctx.ellipse(0, 0, 0.76, ry, 0, 0, Math.PI * 2);
                    ctx.fill(); if (theme.id === 'ink') ctx.stroke();
                    const clipBody = () => {
                        ctx.beginPath(); ctx.ellipse(0, 0, 0.76, ry, 0, 0, Math.PI * 2); ctx.clip();
                    };
                    if (def.pattern === 0) {
                        ctx.save(); clipBody(); ctx.fillStyle = def.accent;
                        for (let i = 0; i < 3; i++) {
                            ctx.beginPath(); ctx.ellipse(-0.4 + i * 0.34, (i % 2 ? 1 : -1) * ry * 0.25,
                                0.16, ry * 0.58, i * 0.6, 0, Math.PI * 2); ctx.fill();
                        }
                        ctx.restore();
                    }
                    if (theme.id === 'ink') {
                        ctx.save(); clipBody(); ctx.strokeStyle = '#263742'; ctx.globalAlpha = 0.3; ctx.lineWidth = 0.015;
                        for (let x = -0.7; x < 0.6; x += 0.13) {
                            ctx.beginPath(); ctx.moveTo(x, 0.03); ctx.lineTo(x - 0.2, ry); ctx.stroke();
                        }
                        ctx.restore();
                    }
                    if (theme.id === 'deep' && def.pattern === 6) {
                        ctx.fillStyle = def.accent; ctx.shadowColor = def.accent; ctx.shadowBlur = 0.15;
                        for (let x = -0.5; x < 0.5; x += 0.18) {
                            ctx.beginPath(); ctx.arc(x, ry * 0.35, 0.028, 0, Math.PI * 2); ctx.fill();
                        }
                        ctx.shadowBlur = 0;
                    }
                    if (def.id === 'biolum') {
                        ctx.strokeStyle = def.accent; ctx.lineWidth = 0.02;
                        for (const side of [-1, 1]) {
                            ctx.beginPath(); ctx.moveTo(0.22, side * ry); ctx.lineTo(-0.35, side * finHeight); ctx.lineTo(-0.61, side * ry * 0.5); ctx.stroke();
                        }
                    }
                    if (def.pattern === 1 || def.pattern === 3) {
                        ctx.save(); clipBody(); ctx.strokeStyle = def.accent; ctx.lineWidth = 0.12;
                        for (const x of [-0.42, 0, 0.42]) { ctx.beginPath(); ctx.moveTo(x, -ry); ctx.lineTo(x, ry); ctx.stroke(); }
                        ctx.restore();
                    }
                    if (def.pattern === 8 || def.shape === 'catfish') {
                        ctx.save(); clipBody(); ctx.strokeStyle = def.accent; ctx.lineWidth = def.pattern === 8 ? 0.035 : 0.018;
                        if (def.pattern === 8) for (const y of [-0.16, -0.05, 0.06, 0.17]) {
                            ctx.beginPath(); ctx.moveTo(-0.7, y); ctx.quadraticCurveTo(0, y - 0.03, 0.7, y); ctx.stroke();
                        } else {
                            ctx.beginPath(); ctx.moveTo(-0.6, 0); ctx.lineTo(0.6, 0); ctx.stroke();
                            for (let x = -0.5; x < 0.4; x += 0.13) {
                                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 0.06, ry * 0.7); ctx.stroke();
                            }
                        }
                        ctx.restore();
                    }
                    if (def.pattern >= 10) {
                        ctx.save(); clipBody();
                        ctx.strokeStyle = def.accent; ctx.lineWidth = def.pattern === 11 ? 0.045 : 0.025;
                        if (def.pattern === 12) {
                            ctx.fillStyle = def.accent;
                            for (let i = 0; i < 12; i++) {
                                ctx.beginPath(); ctx.arc(-0.5 + (i % 4) * 0.25, -0.11 + Math.floor(i / 4) * 0.11, 0.024, 0, Math.PI * 2); ctx.fill();
                            }
                        } else { ctx.beginPath(); ctx.moveTo(-0.6, 0); ctx.lineTo(0.55, 0); ctx.stroke(); }
                        ctx.restore();
                    }
                    if (def.shape === 'threadfin') for (const side of [-1, 1]) {
                        ctx.strokeStyle = def.accent; ctx.lineWidth = 0.012;
                        ctx.beginPath(); ctx.moveTo(-0.12, side * ry);
                        ctx.bezierCurveTo(-0.48, side * 0.75, -0.95, side * 1.02, -1.35, side * 0.92); ctx.stroke();
                    }
                    if (def.shape === 'catfish') {
                        ctx.strokeStyle = def.accent; ctx.lineWidth = 0.015;
                        for (const side of [-1, 1]) {
                            ctx.beginPath(); ctx.moveTo(0.68, 0.04); ctx.quadraticCurveTo(0.88, side * 0.12, 1.02, side * 0.27); ctx.stroke();
                        }
                    }
                    if (def.id === 'neon') {
                        ctx.strokeStyle = PARAMS.neon; ctx.lineWidth = 0.055;
                        ctx.beginPath(); ctx.moveTo(0.5, -0.02); ctx.lineTo(-0.1, -0.02); ctx.stroke();
                        ctx.strokeStyle = PARAMS.red; ctx.beginPath(); ctx.moveTo(-0.1, 0.02); ctx.lineTo(-0.6, 0.02); ctx.stroke();
                    }
                    ctx.fillStyle = PARAMS.eye;
                    ctx.beginPath(); ctx.ellipse(0.72, 0.03, 0.025,
                        0.025 + bubble.pulse * (this.reduced ? 0.015 : 0.045), 0, 0, Math.PI * 2); ctx.fill();
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
                if (prize.preview) ctx.globalAlpha = 0.35;
                const palette = prizePalette(theme);
                ctx.strokeStyle = palette.gold; ctx.lineWidth = 0.035;
                const active = state.prizeEffects[prize.id] || 0;
                const opening = prizeOpening(prize.id, time, active, this.reduced);
                if (prize.id === 'chest') {
                    ctx.fillStyle = palette.wood; ctx.fillRect(-0.55, -0.44, 1.1, 0.44); ctx.strokeRect(-0.55, -0.44, 1.1, 0.44);
                    ctx.fillStyle = palette.gold;
                    ctx.fillRect(-0.36, -0.44, 0.07, 0.44); ctx.fillRect(0.29, -0.44, 0.07, 0.44);
                    for (const y of [-0.1, -0.22, -0.34]) {
                        ctx.beginPath(); ctx.moveTo(-0.54, y); ctx.lineTo(0.54, y); ctx.stroke();
                    }
                    ctx.fillStyle = palette.wood; ctx.beginPath();
                    ctx.moveTo(-0.55, -0.44 - opening * 0.24); ctx.bezierCurveTo(-0.55, -0.71 - opening * 0.24, 0.55, -0.71 - opening * 0.24, 0.55, -0.44 - opening * 0.24);
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                    ctx.fillStyle = palette.gold; ctx.fillRect(-0.07, -0.36, 0.14, 0.12);
                } else if (prize.id === 'oyster') {
                    ctx.fillStyle = palette.shell; ctx.beginPath(); ctx.ellipse(0, -0.12, 0.56, 0.15, 0, 0, Math.PI * 2); ctx.fill();
                    if (opening > 0.42) {
                        ctx.fillStyle = PARAMS.pearl; ctx.beginPath(); ctx.arc(0, -0.25, 0.13, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.fillStyle = palette.shell; ctx.beginPath(); ctx.ellipse(0, -0.24 - opening * 0.5, 0.54, 0.21, -opening * 0.2, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = theme.rock; ctx.lineWidth = 0.014;
                    for (let x = -0.42; x <= 0.42; x += 0.105) {
                        ctx.beginPath(); ctx.moveTo(x * 0.35, -0.39 - opening * 0.5);
                        ctx.quadraticCurveTo(x, -0.29 - opening * 0.5, x, -0.12 - opening * 0.5); ctx.stroke();
                    }
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
                ctx.fillStyle = PARAMS.ink; ctx.globalAlpha = Math.min(0.6, (a.life - a.age) / 4);
                for (const blob of ZQ.inkBlobs(a)) {
                    const p = this.project(blob.pos);
                    if (!p.visible) continue;
                    ctx.beginPath(); ctx.ellipse(p.x, p.y, blob.radius[0] * p.scale, blob.radius[1] * p.scale, 0, 0, Math.PI * 2); ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        }
        render(state, time, dt = 0.016, equipped = []) {
            if (this.lost || !this.theme) return;
            this.prizes = prizePositions(state.bounds, state.equippedPrizes || equipped, state.prizePositions);
            if (this.prizePreview) this.prizes.push({ ...this.prizePreview, preview: true });
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
    return { Renderer, PARAMS, color, multiply, perspective, lookAt, transform, inverse, prizeGeometry, creatureGeometry, fishGeometry, fishPreview, prizeOpening, plantGeometry, drawPlant2D, Geometry, groundHeight, plantProfile };
})();
