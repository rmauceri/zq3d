'use strict';

const ZQ = (() => {
    const VERSION = 9;
    const STORAGE_KEY = 'zenquarium_zq3d_v1';
    const CONFIG = Object.freeze({
        startingScore: 100, feedCost: 5, cleanCost: 10, scoreRate: 0.5,
        hungerDecay: 0.6, starvationDamage: 3, recoveryRate: 2,
        dirtRate: 0.3, dirtyWaterDamage: 2, cleanRepair: 30,
        foodNutrition: 30, foodLifetime: 15, foodLimit: 96,
        babyGrowth: 0.02, birthChancePerSecond: 1 / 25,
        birthCooldown: [35, 65], firstVisitor: [30, 60], nextVisitor: [45, 90],
        visitorKillCooldown: 8, tapWindow: 5, emptyGrace: 5,
        stingerLife: 15, inkLife: 10, autoCap: 10, autoTarget: 5,
        crabDefenses: 3, decoyCooldown: 0.35, eelWarning: 2.6, eelDash: 1.2,
        eelSpeed: 4.8, prizeLimit: 3, prizeInteraction: 6,
        encounterWarning: 2.8, encounterRest: 6, repelSwipes: 3,
        eelHold: 0.7, shockRadius: 2.4, shockLife: 1.2, deathLife: 4,
        crabDash: 1.2, crabSpeed: 5.2, crabDirt: 5, stingerLength: 1.1, stingerRadius: 0.12,
        schoolRadius: 2.2, schoolAlignment: 0.42, schoolCohesion: 0.16,
        fishScale: 0.66, separationRadius: 0.65, separationPadding: 0.35,
        separationStrength: 2.8, boundaryLookahead: 0.9, boundaryStrength: 2.4,
        floor: -3.25, surface: 3.8, depth: 2.8,
        bonuses: Object.freeze({ perfect: 25, diversity: 15, birth: 10, clean: 20,
            sighting: 15, whisperer: 30, stingers: 50, ink: 40 }),
        penalties: Object.freeze({ death: 15, starvation: 20, stress: 5,
            stingers: 25, ink: 20, neglect: 10 })
    });

    const fish = (id, name, cost, size, speed, shape, traits, body, fin, accent, pattern, aggression) =>
        ({ id, name, cost, size, speed, shape, traits, body, fin, accent, pattern, aggression });
    const visitor = (kind, name, body, accent, size) => ({ kind, name, body, accent, size });
    // Prices, personalities, musical scales, and UI palettes follow Zenquarium.
    const THEMES = {
        koi: {
            id: 'koi', name: 'Koi Garden', subtitle: 'A moment in the sun',
            description: 'Warm shallows, drifting blossoms, and the quiet company of koi.',
            location: 'SUNLIT GARDEN', sound: 'Pentatonic chimes',
            ui: { bg: '#0a1628', surface: '#12294a', text: '#e8dcc8', accent: '#e8845c' },
            water: '#234c4c', surface: '#82977e', sand: '#c8b58e', rock: '#72786b',
            light: '#ffe6ae', plants: ['#2d5a3a', '#3a7048', '#4a8858', '#6aad78'],
            fish: [
                fish('koi-orange', 'Orange Koi', 20, 1.2, 0.7, 'standard', ['social', 'lazy'], '#e8845c', '#d4742c', '#fff5e6', 0, 0.3),
                fish('koi-white', 'White Koi', 25, 1.3, 0.6, 'standard', ['shy', 'explorer'], '#f0e6d4', '#d4c8b0', '#b9473d', 0, 0.2),
                fish('koi-red', 'Red Koi', 30, 1.1, 0.8, 'round', ['brave', 'greedy'], '#c94040', '#a03030', '#343c3e', 0, 0.5),
                fish('goldfish', 'Goldfish', 15, 0.8, 1, 'round', ['playful', 'curious'], '#f0a830', '#d4901c', '#fff0c0', 0, 0.2)
            ],
            visitors: [
                visitor('jellyfish', 'Moon Jelly', '#f0c8c8', '#d08080', 2.2),
                visitor('squid', 'Firefly Squid', '#e8c060', '#c08020', 1.8),
                visitor('octopus', 'Paper Octopus', '#c07848', '#e8a870', 2)
            ],
            music: { base: 65, chord: [1, 1.125, 1.333], notes: [262, 294, 330, 392, 440], decay: 1.5, interval: 0.4 }
        },
        tropical: {
            id: 'tropical', name: 'Tropical Reef', subtitle: 'Life in full color',
            description: 'Sunbeams find their way through a living reef. Every fin has a story.',
            location: 'CORAL SHALLOWS', sound: 'Island marimba',
            ui: { bg: '#061a2e', surface: '#083858', text: '#e8dcc8', accent: '#00d4aa' },
            water: '#064566', surface: '#50b8b0', sand: '#e0d5af', rock: '#627d89',
            light: '#c4f5e5', plants: ['#e04060', '#ff8040', '#d050d0', '#50d0a0'],
            fish: [
                fish('clown', 'Clownfish', 20, 0.8, 1.2, 'round', ['playful', 'brave'], '#f07020', '#1a1a1a', '#ffffff', 1, 0.4),
                fish('tang', 'Blue Tang', 25, 1, 1, 'slim', ['explorer', 'brave'], '#1870cc', '#f0d020', '#f0e040', 2, 0.6),
                fish('angel', 'Angelfish', 30, 1.2, 0.8, 'tall', ['greedy', 'brave'], '#d8d8d0', '#c0c0b8', '#303030', 3, 0.7),
                fish('neon', 'Neon Tetra', 10, 0.6, 1.5, 'slim', ['shy', 'social'], '#a8c8d8', '#88b0c8', '#e04040', 4, 0.1)
            ],
            visitors: [
                visitor('jellyfish', 'Blue Blubber', '#4090e0', '#80c8ff', 2.4),
                visitor('octopus', 'Blue-Ring Octopus', '#d09040', '#4090ff', 2)
            ],
            music: { base: 82, chord: [1, 1.25, 1.5], notes: [330, 392, 494, 523, 659], decay: 0.8, interval: 0.25 }
        },
        deep: {
            id: 'deep', name: 'Deep Ocean', subtitle: 'Into the beautiful unknown',
            description: 'Beyond the last light, a constellation of luminous creatures awakens.',
            location: 'MIDNIGHT ZONE', sound: 'Sub-oceanic resonance',
            ui: { bg: '#020508', surface: '#040a14', text: '#e8dcc8', accent: '#4dc9f6' },
            water: '#030c1b', surface: '#132847', sand: '#142733', rock: '#20394b',
            light: '#9aa9ff', plants: ['#34dfce', '#bf70ff', '#f36baa', '#bded68', '#efb35d'],
            fish: [
                fish('angler', 'Anglerfish', 30, 1.4, 0.5, 'round', ['lazy', 'greedy'], '#414172', '#66519c', '#ffbf68', 6, 0.9),
                fish('barreleye', 'Barreleye', 20, 0.9, 0.4, 'slim', ['shy', 'explorer'], '#397c8b', '#386180', '#65f5dc', 10, 0.1),
                fish('lantern', 'Lanternfish', 15, 0.6, 1.1, 'slim', ['social', 'playful'], '#454787', '#7255ab', '#ef8bd6', 6, 0.3),
                fish('biolum', 'Glowfin', 25, 0.8, 0.9, 'standard', ['curious', 'explorer'], '#285c58', '#427b78', '#b9ef70', 10, 0.4)
            ],
            visitors: [
                visitor('jellyfish', 'Crystal Jelly', '#a060e0', '#d0a0ff', 2.6),
                visitor('squid', 'Giant Squid', '#804020', '#ff5050', 2.8),
                visitor('octopus', 'Dumbo Octopus', '#e08080', '#ff80b0', 2.2)
            ],
            music: { base: 55, chord: [1, 1.189, 1.414], notes: [260, 328, 392, 440, 524], decay: 3.5, interval: 0.9 }
        },
        zen: {
            id: 'zen', name: 'Zen Garden', subtitle: 'Room to simply be',
            description: 'Morning light, moss islands, delicate schools, and the space between things.',
            location: 'STILLWATER SANCTUARY', sound: 'Resonant singing bowls',
            ui: { bg: '#142b2c', surface: '#264745', text: '#eee9d9', accent: '#d7b77e' },
            water: '#215879', surface: '#7bafbd', sand: '#e3d4af', rock: '#8b9b91',
            light: '#fff1cd', plants: ['#527d58', '#789867', '#a5b882', '#547e80'],
            fish: [
                fish('zen-medaka', 'Pearl Medaka', 25, 0.7, 0.8, 'medaka', ['lazy', 'social'], '#dcd8bb', '#a8c0ad', '#f5ebcf', 10, 0.3),
                fish('zen-cloud', 'White Cloud Minnow', 15, 0.65, 1.1, 'slim', ['playful', 'explorer'], '#a8bcbc', '#c78d71', '#eee5bd', 11, 0.2),
                fish('zen-danio', 'Celestial Pearl Danio', 30, 0.7, 0.95, 'slim', ['brave', 'greedy'], '#536f83', '#bc967c', '#ecdfad', 12, 0.6),
                fish('zen-threadfin', 'Threadfin Rainbowfish', 20, 0.9, 0.7, 'threadfin', ['curious', 'shy'], '#b8c9ba', '#bac1dd', '#dbbd7c', 10, 0.2)
            ],
            visitors: [
                visitor('jellyfish', 'Ghost Jelly', '#c0c0b8', '#e0e0d8', 2),
                visitor('squid', 'Glass Squid', '#a0a090', '#d0d0c0', 1.8),
                visitor('octopus', 'Stone Octopus', '#8a8878', '#b0a898', 2)
            ],
            music: { base: 73, chord: [1, 1.333, 1.5], notes: [392, 523, 659, 784], decay: 3, interval: 1.2 }
        },
        ink: {
            id: 'ink', name: 'Pen & Ink', subtitle: 'An aquarium, imagined',
            description: 'A living sketchbook. Paper, delicate lines, and a little imagination.',
            location: 'THE ARTIST\'S AQUARIUM', sound: 'Impressionist piano',
            ui: { bg: '#e8e0d4', surface: '#f5f0e8', text: '#1a1a1a', accent: '#2a2a2a' },
            water: '#6d90a6', surface: '#c0d7df', sand: '#dec49b', rock: '#626c77',
            light: '#fff2d8', plants: ['#335c50', '#56715b', '#735b78', '#976e44'],
            fish: [
                fish('ink-betta', 'Brushstroke Betta', 20, 1.1, 0.65, 'betta', ['curious', 'lazy'], '#cfaaa9', '#725777', '#362b48', 0, 0.3),
                fish('ink-zebra', 'Zebra Danio', 25, 0.7, 1.3, 'slim', ['playful', 'social'], '#e3d8bd', '#718492', '#273846', 8, 0.1),
                fish('ink-killifish', 'Lyretail Killifish', 15, 0.8, 1, 'lyretail', ['explorer', 'brave'], '#d9b578', '#8c6749', '#473326', 2, 0.2),
                fish('ink-glass', 'Glass Catfish', 30, 0.9, 0.75, 'catfish', ['shy', 'social'], '#c4d9d2', '#718e86', '#304d4b', 9, 0.1)
            ],
            visitors: [
                visitor('jellyfish', 'Ink Jelly', '#cbbfa9', '#4a3a2a', 2.2),
                visitor('octopus', 'Sketch Octopus', '#b9bfcc', '#2a3a5a', 2)
            ],
            music: { base: 78, chord: [1, 1.122, 1.26], notes: [330, 370, 415, 466, 523], decay: 1.8, interval: 0.35 }
        }
    };

    const ACHIEVEMENTS = [
        ['first-fish', 'First Fish', 'Buy your first fish.', 25],
        ['schooling', "School's In", 'Three of the same species school nearby.', 50],
        ['full-spectrum', 'Full Spectrum', 'Keep all four species in one aquarium.', 100],
        ['creature-encounter', 'Creature Encounter', 'Meet your first visiting creature.', 50],
        ['stinger-dodge', 'Stinger Dodge', 'Survive stingers without losing a fish.', 75],
        ['ink-survivor', 'Ink Survivor', 'Survive an ink cloud without losing a fish.', 75],
        ['glass-tapper', 'Glass Tapper', 'Tap the glass ten times in a session.', 25],
        ['survivor', 'Survivor', 'Recover water health from below 20% to above 80%.', 150],
        ['thousandaire', 'Thousandaire', 'Reach 1,000 points.', 50],
        ['ten-thousandaire', 'Ten Thousandaire', 'Reach 10,000 points.', 100],
        ['zen-master', 'Zen Master', 'Spend time in all five themes.', 500],
        ['baby-boom', 'Baby Boom', 'Welcome three babies in one session.', 75],
        ['pacifist', 'Pacifist', 'Finish a two-minute session with no fish lost.', 200],
        ['speed-run', 'Speed Run', 'Reach 1,000 points in under three active minutes.', 100],
        ['fish-whisperer', 'Fish Whisperer', 'Have at least fifteen fish alive.', 100],
        ['night-owl', 'Night Owl', 'Spend ten active minutes in one aquarium.', 50],
        ['streak-master', 'Streak Master', 'Build a three-times health multiplier.', 250],
        ['creature-collector', 'Creature Collector', 'Meet jellyfish, octopus, and squid in one session.', 200],
        ['danger-zone', 'Danger Zone', 'Survive three attacks in a session with no fish lost.', 150],
        ['high-roller', 'High Roller', 'Reach 5,000 points in one session.', 150]
    ].map(([id, name, description, bonus]) => ({ id, name, description, bonus }));
    const MILESTONES = [
        { id: 'bronze', name: 'Bronze Aquarist', score: 1000, description: 'Your small world is finding its rhythm.' },
        { id: 'silver', name: 'Silver Aquarist', score: 2500, description: 'A little care has become something remarkable.' },
        { id: 'gold', name: 'Gold Aquarist', score: 5000, description: 'Life is flourishing in your hands.' },
        { id: 'platinum', name: 'Platinum Aquarist', score: 10000, description: 'An extraordinary aquarium. A well-earned moment.' },
        { id: 'master', name: 'Master Aquarist', score: null, description: 'Fifteen fish, all four species, three continuous minutes. A living balance.' }
    ];
    const DEFAULT_SETTINGS = Object.freeze({ sound: false, volume: 0.45, quality: 'auto', motion: 'system', keepAwake: false });
    const CHALLENGE_VARIANTS = {
        koi: [['crab', 'Pebble Crab', '#f16b47', '#ffe09a', 1.9], ['eel', 'Ribbon Eel', '#718766', '#eedcb4', 2]],
        tropical: [['crab', 'Hermit Crab', '#ff9742', '#fff09b', 2], ['eel', 'Moray Eel', '#8f9952', '#dfdd90', 2.2]],
        deep: [['crab', 'Glass Crab', '#ef64bc', '#78fff0', 2], ['eel', 'Gulper Eel', '#38516e', '#75e0ef', 2.5]],
        zen: [['crab', 'Stone Crab', '#e8a53e', '#fff0bf', 1.8], ['eel', 'River Eel', '#64716a', '#bbbfac', 2]],
        ink: [['crab', 'Etched Crab', '#d97061', '#ffcc86', 1.9], ['eel', 'Brushstroke Eel', '#c1c7c5', '#455855', 2.1]]
    };
    for (const [id, variants] of Object.entries(CHALLENGE_VARIANTS)) {
        THEMES[id].visitors.push(...variants.map(args => visitor(...args)));
    }
    const PRIZES = [
        { id: 'chest', name: 'Bubble Chest', description: 'A little sunken treasure. Tap to open the lid and release a ribbon of bubbles.',
            requirement: 'Reach 1,000 points.', goal: 1000, stat: 'score' },
        { id: 'oyster', name: 'Pearl Oyster', description: 'An iridescent pearl, quietly growing. Tap to coax its shell open.',
            requirement: 'Welcome your first baby fish.', goal: 1, stat: 'born' },
        { id: 'lantern', name: 'Watchlight Lantern', description: 'A soft beacon for your little world. Tap to send out a luminous pulse.',
            requirement: 'Discharge a coiling eel with a sustained hold.', goal: 1, stat: 'eelsRepelled' },
        { id: 'arch', name: 'Tidekeeper Arch', description: 'A weathered stone arch with a secret current. Tap for a bubbling celebration.',
            requirement: 'Guide a crab away with alternating swipes.', goal: 1, stat: 'crabsRepelled' }
    ];
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const distanceSquared = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    const distance = (a, b) => Math.sqrt(distanceSquared(a, b));
    const normalize = v => {
        const length = Math.hypot(...v) || 1;
        return v.map(n => n / length);
    };
    const fishScale = f => f.size * CONFIG.fishScale * (0.3 + 0.7 * f.growth);
    const fishSpacing = (a, b) => Math.max(CONFIG.separationRadius, fishScale(a) + fishScale(b) + CONFIG.separationPadding);
    const clone = value => JSON.parse(JSON.stringify(value));
    const capacity = (width, height) => clamp(Math.round(20 * width * height / 960000), 15, 20);
    const boundsFor = () => ({
        width: 6.8,
        floor: CONFIG.floor, surface: CONFIG.surface, depth: CONFIG.depth
    });
    const terrainCache = new Map();
    function createTerrain(themeId, bounds, revision = VERSION) {
        const key = [themeId, bounds.width, bounds.depth, bounds.floor, revision].join(':');
        if (terrainCache.has(key)) return terrainCache.get(key);
        const step = 0.4, minX = -bounds.width - 5, minZ = -10;
        const columns = Math.ceil((bounds.width * 2 + 10) / step) + 1, rows = 46;
        const heights = [], amplitude = { koi: 1.05, tropical: 1.25, deep: 1.4, zen: 0.95, ink: 1.1 }[themeId];
        const smooth = n => { n = clamp(n, 0, 1); return n * n * (3 - 2 * n); };
        const pads = [[-bounds.width * 0.3, 1.1], [bounds.width * 0.08, 0.6],
            [bounds.width * 0.36, 1.1], [-bounds.width * 0.08, -1.5]];
        for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
            const x = minX + col * step, z = minZ + row * step;
            const broad = revision >= 9;
            const left = Math.exp(-(((x + bounds.width * (broad ? 0.7 : 0.48)) / (broad ? 3 : 2.2)) ** 2 + ((z + 1.45) / (broad ? 2.4 : 1.7)) ** 2));
            const right = Math.exp(-(((x - bounds.width * (broad ? 0.72 : 0.5)) / (broad ? 3.1 : 2.1)) ** 2 + ((z + 0.65) / (broad ? 2.5 : 1.65)) ** 2));
            const ridge = Math.exp(-(((x + bounds.width * 0.03) / (broad ? 5.5 : 3.5)) ** 2 + ((z + 2.7) / 1.3) ** 2)) * 0.55;
            const channel = smooth(Math.abs(x - Math.sin(z * 0.7) * 0.7) / 1.5);
            let support = smooth((bounds.depth + (broad ? 2 : 0.5) - z) / (broad ? 2 : 1.4));
            for (const [px, pz] of pads) support *= smooth((Math.hypot(x - px, z - pz) - 0.85) / 1.6);
            heights.push(bounds.floor + amplitude * (left + right * 0.85 + ridge) * channel * support);
        }
        const terrain = { minX, minZ, step, columns, rows, heights, floor: bounds.floor };
        if (terrainCache.size >= 16) terrainCache.delete(terrainCache.keys().next().value);
        terrainCache.set(key, terrain);
        return terrain;
    }
    function terrainHeight(terrain, x, z) {
        if (!terrain) return CONFIG.floor;
        const col = clamp((x - terrain.minX) / terrain.step, 0, terrain.columns - 1.000001);
        const row = clamp((z - terrain.minZ) / terrain.step, 0, terrain.rows - 1.000001);
        const ix = Math.floor(col), iz = Math.floor(row), tx = col - ix, tz = row - iz;
        const index = iz * terrain.columns + ix, a = terrain.heights[index], b = terrain.heights[index + terrain.columns],
            c = terrain.heights[index + terrain.columns + 1], d = terrain.heights[index + 1];
        // Match the rendered cell's diagonal, rather than letting swimmers sink into a bilinear approximation.
        return tz >= tx ? a * (1 - tz) + b * (tz - tx) + c * tx
            : a * (1 - tx) + c * tz + d * (tx - tz);
    }
    const prizePositions = (bounds, equipped, moved = {}) => {
        const positions = {
            chest: [-bounds.width * 0.3, bounds.floor + 0.12, 1.1],
            oyster: [bounds.width * 0.08, bounds.floor + 0.08, 0.6],
            lantern: [bounds.width * 0.36, bounds.floor + 0.12, 1.1],
            arch: [-bounds.width * 0.08, bounds.floor + 0.04, -1.5]
        };
        return equipped.filter(id => Object.hasOwn(positions, id)).map(id => ({ id, pos: moved[id] ? [...moved[id]] : positions[id] }));
    };
    function createPrizeObstacles(bounds, equipped, moved = {}) {
        const obstacles = [];
        for (const prize of prizePositions(bounds, equipped, moved)) {
            const part = (offset, radius, box = true) => obstacles.push({
                prizeId: prize.id, pos: prize.pos.map((n, i) => n + offset[i]), radius, box
            });
            // Reserve the full lid/shell sweep so opening animations cannot enter a swimmer.
            if (prize.id === 'chest') part([0, 0.59, -0.1], [0.58, 0.61, 0.52]);
            else if (prize.id === 'oyster') part([0, 0.47, -0.03], [0.62, 0.53, 0.52]);
            else if (prize.id === 'lantern') part([0, 0.55, 0], [0.36, 0.56, 0.33]);
            else {
                for (const side of [-1, 1]) part([side * 0.65, 0.52, 0.02], [0.25, 0.52, 0.32]);
                for (let i = 0; i < 7; i++) {
                    const angle = i / 6 * Math.PI;
                    part([Math.cos(angle) * 0.64, 0.84 + Math.sin(angle) * 0.48, 0], [0.24, 0.22, 0.292], false);
                }
            }
        }
        return obstacles;
    }
    function createHabitat(themeId, bounds, equipped = [], moved = {}, revision = VERSION) {
        const legacy = revision === true || revision === 6;
        const landscape = revision >= 8, immersive = revision >= 9;
        const terrain = landscape ? createTerrain(themeId, bounds, revision) : null;
        let seed = 7319;
        const random = () => {
            seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        const rocks = [], plants = [], shelters = [];
        for (let i = 0; i < 16; i++) {
            const side = i % 2 ? -1 : 1;
            const size = i < 6 ? 0.65 + random() * 0.7 : 0.16 + random() * 0.35;
            const tall = themeId === 'deep' ? 1.2 : 0.65;
            const pos = [side * (bounds.width * 0.6 + random() * bounds.width * 0.23),
                bounds.floor + size * tall * 0.7, -2 + random() * 3.8];
            const radius = [size, size * tall, size * 0.75];
            rocks.push({ pos, radius });
            if (i < 6) shelters.push([pos[0] - side * (size + 0.8), pos[1] + 0.7, pos[2]]);
        }
        if (themeId === 'zen' || themeId === 'ink') {
            for (let i = 0; i < 3; i++) rocks.push({
                pos: [-bounds.width * 0.25 + i * 0.09, bounds.floor + 0.28 + i * 0.5, -1.4],
                radius: [1.05 - i * 0.23, 0.38, 0.7 - i * 0.15]
            });
        }
        for (let i = 0; i < 20; i++) {
            const side = i % 2 ? 1 : -1;
            plants.push({ x: side * (bounds.width * 0.48 + random() * bounds.width * 0.45),
                z: -2.6 + random() * 4.3, h: (0.7 + random() * 2.7) * (themeId === 'zen' ? 0.62 : 1),
                tint: THEMES[themeId].plants[i % THEMES[themeId].plants.length] });
        }
        // Low interior formations leave central and foreground passages open.
        for (const side of [-1, 1]) {
            const pos = [side * bounds.width * 0.28, bounds.floor + 0.32, side * 1.55];
            rocks.push({ pos, radius: [0.65, 0.38, 0.48] });
            shelters.push([pos[0], pos[1] + 0.65, pos[2] - side * 0.9]);
        }
        if (themeId === 'zen' && !legacy) {
            rocks.splice(0, rocks.length,
                { pos: [-bounds.width * 0.32, bounds.floor + 0.52, -1.1], radius: [1.05, 0.62, 0.65], moss: true },
                { pos: [-bounds.width * 0.32 - 0.7, bounds.floor + 0.27, -0.3], radius: [0.7, 0.32, 0.5], moss: true },
                { pos: [-bounds.width * 0.32 + 0.65, bounds.floor + 0.24, -1.8], radius: [0.65, 0.28, 0.5] },
                { pos: [bounds.width * 0.43, bounds.floor + 0.75, -1.1], radius: [0.47, 0.82, 0.43] },
                { pos: [bounds.width * 0.43 + 0.65, bounds.floor + 0.25, -1.6], radius: [0.6, 0.3, 0.43], moss: true },
                { pos: [bounds.width * 0.43 - 0.5, bounds.floor + 0.15, -0.4], radius: [0.4, 0.18, 0.3] });
            plants.splice(12);
            for (let i = 0; i < plants.length; i++) {
                const side = i < 8 ? -1 : 1;
                plants[i].x = side * bounds.width * (0.58 + (i % 4) * 0.055);
                plants[i].z = -2.2 + (i % 4) * 0.4;
                plants[i].h = 0.65 + (i % 3) * 0.3;
            }
            shelters.splice(0, shelters.length, ...rocks.filter(r => r.moss)
                .map(r => [r.pos[0], r.pos[1] + r.radius[1] + 0.4, r.pos[2]]));
        }
        plants.forEach((p, i) => {
            p.form = themeId === 'zen' ? 'ribbon' : themeId === 'koi' ? (i % 5 === 0 ? 'lily' : 'reed')
                : themeId === 'tropical' ? ['branch', 'plate', 'boulder', 'fan'][i % 4]
                : themeId === 'deep' ? ['anemone', 'fan', 'spire'][i % 3] : 'ink-leaf';
            if (themeId === 'tropical') p.tint = THEMES.tropical.plants[Math.floor(i / 4) % 4];
            if (!legacy && p.form === 'lily') p.h = bounds.surface - bounds.floor - 0.2;
        });
        if (landscape) {
            const sceneScale = immersive ? clamp(bounds.width / 6.8, 0.5, 1) : 1;
            for (const rock of rocks) {
                const base = terrainHeight(terrain, rock.pos[0], rock.pos[2]);
                const scale = themeId === 'zen' ? 1.25 : 1.4;
                rock.pos[1] = base + (rock.pos[1] - bounds.floor) * scale;
                rock.radius = rock.radius.map(n => n * scale * sceneScale);
                if (immersive) rock.pos[1] = base + rock.radius[1] * 0.42;
            }
            if (immersive && themeId === 'ink') for (let i = 17; i < 19; i++) {
                const lower = rocks[i - 1], upper = rocks[i];
                upper.pos[1] = lower.pos[1] + lower.radius[1] * 0.6 + upper.radius[1] * 0.35;
                upper.roughness = lower.roughness = 0.06;
            }
            for (let i = 0; i < plants.length; i++) {
                const p = plants[i], side = i % 2 ? 1 : -1, group = Math.floor(i / 2);
                const margin = themeId === 'tropical' || themeId === 'deep' ? 0.64 : 0.45;
                p.x = side * bounds.width * ((immersive ? 0.65 : margin) + (group % 3) * (immersive ? 0.1 : 0.06)) + (random() - 0.5) * 0.35;
                p.z = (immersive ? -bounds.depth + 0.2 : -2.45) + (group % 5) * (immersive ? (bounds.depth * 2 - 1.3) / 4 : 0.72) + (random() - 0.5) * 0.3;
                p.floor = terrainHeight(terrain, p.x, p.z);
                p.h = p.form === 'lily' ? bounds.surface - p.floor - 0.2
                    : Math.min(bounds.surface - p.floor - 0.65,
                        (themeId === 'zen' ? (immersive ? 2.6 : 1.7) : (immersive ? 3 : 1.9)) + random() * (themeId === 'deep' ? 2.1 : 1.7));
                if (immersive) p.grove = true;
                if (immersive && (themeId === 'tropical' || themeId === 'deep')) p.h = Math.min(p.h, 3.4);
                if (immersive) p.h *= 0.5 + sceneScale * 0.5;
            }
            // Connected shoulders frame openings without sealing off the main swimming channel.
            for (const side of [-1, 1]) {
                const x = side * bounds.width * (immersive ? 0.62 : 0.46), z = side < 0 ? -1.9 : -0.7;
                const floor = terrainHeight(terrain, x, z);
                const rock = { pos: [x, floor + (immersive ? 0.65 : 0.55), z],
                    radius: immersive ? [2.6, 1.65, 1.35] : [1.25, 0.85, 0.85],
                    moss: themeId === 'zen' || themeId === 'koi' };
                if (['tropical', 'deep', 'ink'].includes(themeId) && side < 0) {
                    rock.hollow = true;
                    rock.parts = [
                        { pos: [x - 1, floor + 0.8, z - 0.08], radius: [0.38, 0.88, 0.7] },
                        { pos: [x + 1, floor + 0.72, z + 0.12], radius: [0.4, 0.82, 0.65] },
                        { pos: [x + 0.12, floor + 1.96, z], radius: [1.5, 0.34, 0.75] }
                    ];
                    if (immersive) rock.parts = [
                        { pos: [x - 1.6, terrainHeight(terrain, x - 1.6, z) + 0.95, z], radius: [0.9, 1.75, 0.95], roughness: 0.06 },
                        { pos: [x + 1.6, terrainHeight(terrain, x + 1.6, z) + 0.95, z], radius: [0.9, 1.75, 0.95], roughness: 0.06 },
                        { pos: [x, Math.min(terrainHeight(terrain, x - 1.6, z), terrainHeight(terrain, x + 1.6, z)) + 2.65, z],
                            radius: [2.6, 0.6, 1.05], roughness: 0.06 }
                    ];
                }
                if (immersive && sceneScale < 1) {
                    rock.radius = rock.radius.map(n => n * sceneScale);
                    if (rock.parts) for (const part of rock.parts) {
                        part.pos[0] = x + (part.pos[0] - x) * sceneScale;
                        part.pos[1] = floor + (part.pos[1] - floor) * sceneScale;
                        part.radius = part.radius.map(n => n * sceneScale);
                    }
                }
                rocks.push(rock);
            }
            shelters.splice(0, shelters.length);
            for (const side of [-1, 1]) for (const z of [-2.2, -0.5, 1.2]) {
                const x = side * bounds.width * (immersive ? 0.55 : 0.34);
                shelters.push([x, terrainHeight(terrain, x, z) + 1.1, z]);
            }
        }
        const stems = plants.map(p => {
            const rigid = themeId === 'tropical' || ['anemone', 'fan', 'spire', 'lily'].includes(p.form);
            return {
                pos: [p.x, (p.floor ?? bounds.floor) + (!legacy && p.form === 'lily' ? 0.2 : p.h * (legacy || !rigid ? 0.45 : 0.5)), p.z],
                radius: legacy ? [themeId === 'tropical' ? 0.18 : 0.08, p.h * 0.45, 0.12]
                    : themeId === 'tropical' ? [p.h * 0.4 + 0.14, p.h * 0.5 + 0.1, p.h * 0.36 + 0.1]
                    : p.form === 'anemone' || p.form === 'fan' ? [p.h * 0.37 + 0.06, p.h * 0.5 + 0.1, 0.18 + p.h * 0.035]
                    : p.form === 'spire' ? [0.25 + p.h * 0.065, p.h * 0.5 + 0.1, 0.1 + p.h * 0.035]
                    : p.form === 'lily' ? [0.1, 0.2, 0.1]
                    : [0.08, p.h * 0.45, 0.12],
                ...(!legacy && rigid ? { box: true } : {})
            };
        });
        for (const p of plants.filter(p => !legacy && p.form === 'lily'))
            stems.push({ pos: [p.x, (p.floor ?? bounds.floor) + p.h, p.z], radius: [0.7, 0.045, 0.5] });
        const prizeObstacles = createPrizeObstacles(bounds, equipped, moved);
        const rockSolids = rocks.flatMap(r => r.parts || [r]);
        const obstacles = [...rockSolids, ...stems, ...prizeObstacles];
        const ceiling = Math.max(...obstacles.map(obstacle => obstacle.pos[1] + obstacle.radius[1]));
        const routes = landscape ? [-1, 1].flatMap(side => [-1.9, 0.1].map(z => {
            return [-0.8, 0, 0.8].map(offset => {
                const x = side * bounds.width * 0.29 + offset;
                return [x, terrainHeight(terrain, x, z + offset * 0.45) + 1.65, z + offset * 0.45];
            });
        })) : [];
        if (immersive) for (const side of [-1, 1]) for (const elevation of [1.25, 3.3]) {
            routes.push([-bounds.depth + 0.3, 0, bounds.depth - 0.3].map(z => {
                const x = side * bounds.width * (elevation > 2 ? 0.8 : 0.5);
                return [x, Math.min(bounds.surface - 0.8, terrainHeight(terrain, x, z) + elevation), z];
            }));
        }
        for (const r of rocks.filter(r => r.hollow)) routes.push([-0.85, 0, 0.85].map(offset =>
            [r.pos[0], terrainHeight(terrain, r.pos[0], r.pos[2]) + 1.05, r.pos[2] + offset]));
        return { rocks, rockSolids, plants, shelters, stems, prizeObstacles, obstacles, ceiling, terrain, routes };
    }
    const currentAt = (pos, time) => [
        Math.sin(time * 0.09 + pos[2] * 0.6) * 0.055,
        Math.cos(time * 0.07 + pos[0] * 0.4) * 0.018,
        Math.sin(time * 0.08 + pos[0] * 0.3) * 0.045
    ];
    const inkBlobs = attack => {
        const fade = clamp((attack.life - attack.age) / 2, 0, 1);
        const scale = Math.min(1.65, 0.3 + attack.age * 0.35) * fade;
        if (scale === 0) return [];
        return Array.from({ length: 3 }, (_, i) => {
            const size = scale * (1 - i * 0.12);
            return { pos: attack.pos.map((n, axis) => n + Math.sin(i * 2 + axis) * 0.25 * fade),
                radius: [size, size * 0.85, size] };
        });
    };
    const electricRadius = attack => CONFIG.shockRadius * clamp(attack.age / 0.3, 0, 1);
    const deathPose = f => ({
        pitch: f.pitch * Math.max(0, 1 - f.age),
        roll: Math.PI * clamp(f.age / 0.8, 0, 1),
        alpha: clamp((CONFIG.deathLife - f.age) / 1.5, 0, 1)
    });
    const paddedRadius = (rock, axis, padding) => rock.radius[axis] + (typeof padding === 'number' ? padding : padding[axis]);
    const rockDistance = (pos, rock, padding = 0) => {
        const scalar = typeof padding === 'number';
        if (rock.box) return Math.max(
            Math.abs(pos[0] - rock.pos[0]) / paddedRadius(rock, 0, padding),
            Math.abs(pos[1] - rock.pos[1]) / paddedRadius(rock, 1, padding),
            Math.abs(pos[2] - rock.pos[2]) / paddedRadius(rock, 2, padding));
        return Math.sqrt(
            ((pos[0] - rock.pos[0]) / (rock.radius[0] + (scalar ? padding : padding[0]))) ** 2 +
            ((pos[1] - rock.pos[1]) / (rock.radius[1] + (scalar ? padding : padding[1]))) ** 2 +
            ((pos[2] - rock.pos[2]) / (rock.radius[2] + (scalar ? padding : padding[2]))) ** 2);
    };
    const creaturePadding = (kind, size) => kind === 'crab'
        ? [size * 0.55 * 1.2, size * 0.55 * 0.55, size * 0.55 * 1.25]
        : kind === 'eel' ? size * 0.55 * 0.55 : [size * 0.55 * 1.15, size * 0.55 * 1.8, size * 0.55 * 1.15];
    const SWIMMING = Object.freeze({
        cruise: { turn: 1.05, pitch: 0.36, acceleration: 1.6, bank: 0.06, pulse: 0.08, cadence: 1.1 },
        dart: { turn: 1.8, pitch: 0.48, acceleration: 3, bank: 0.1, pulse: 0.3, cadence: 2.5 },
        hover: { turn: 1.4, pitch: 0.42, acceleration: 1.8, bank: 0.025, pulse: 0.06, cadence: 1.8 },
        poised: { turn: 0.85, pitch: 0.3, acceleration: 1.1, bank: 0.015, pulse: 0.12, cadence: 0.8 }
    });
    const swimmingFor = def => SWIMMING[
        ['angler', 'barreleye'].includes(def.id) ? 'poised' :
        ['betta', 'catfish', 'threadfin', 'tall'].includes(def.shape) || def.pattern === 5 ? 'hover' :
        def.size <= 0.8 && def.speed >= 1 ? 'dart' : 'cruise'];
    const swimRhythm = (f, def) => {
        const swim = swimmingFor(def);
        const individuality = 0.86 + (Math.sin(f.id * 12.9898 + def.size * 7.3) + 1) * 0.14;
        const cycle = f.age / (swim === SWIMMING.dart ? 3.4 : swim === SWIMMING.hover ? 7.5 : swim === SWIMMING.poised ? 10 : 9)
            * (0.9 + individuality * 0.1) + f.id * 0.61803398875;
        const wave = (1 + Math.sin(cycle * Math.PI * 2)) * 0.5;
        const propulsion = swim === SWIMMING.dart ? wave ** 3 : wave * wave * (3 - 2 * wave);
        const pace = swim === SWIMMING.dart ? 0.48 + propulsion * 1.4
            : swim === SWIMMING.hover ? 0.22 + propulsion * 1.15
            : swim === SWIMMING.poised ? 0.45 + propulsion * 0.85 : 0.65 + propulsion * 0.7;
        return { pace: pace * individuality, propulsion, individuality };
    };
    const bubblePose = f => {
        const first = 8 + ((f.id * 0.61803398875) % 1) * 14;
        const period = 16 + ((f.id * 0.41421356237) % 1) * 12;
        const time = f.age < first ? -1 : (f.age - first) % period;
        const active = time >= 0 && time < 1.8 && f.hunger >= 45 && f.health >= 50 &&
            f.fear === 0 && f.burst === 0 && !['evade', 'forage'].includes(f.activity);
        const amount = active ? Math.min(1, time / 0.3, (1.8 - time) / 0.3) : 0;
        const beat = Math.round(time / 0.3);
        const pulse = active && beat >= 1 && beat <= 5 ? Math.exp(-(((time - beat * 0.3) / 0.07) ** 2)) * amount : 0;
        return { time, amount, pulse, pitch: f.pitch + amount * 0.22 };
    };
    const fishMouth = f => {
        const pitch = bubblePose(f).pitch, scale = fishScale(f);
        const y = -0.03 * Math.cos(f.roll), z = -0.03 * Math.sin(f.roll);
        const x = 0.78 * Math.cos(pitch) - y * Math.sin(pitch);
        return [f.pos[0] + (Math.cos(f.yaw) * x + Math.sin(f.yaw) * z) * scale,
            f.pos[1] + (0.78 * Math.sin(pitch) + y * Math.cos(pitch)) * scale,
            f.pos[2] + (-Math.sin(f.yaw) * x + Math.cos(f.yaw) * z) * scale];
    };
    const createProfile = () => ({
        highScore: 0, sessions: 0, bestMilestone: null, themesPlayed: [], achievements: {},
        prizes: {}, equippedPrizes: [],
        stats: { born: 0, lost: 0, food: 0, cleans: 0, creatures: 0, longest: 0, peak: 0, crabsRepelled: 0, eelsRepelled: 0 }
    });

    class Game {
        constructor(themeId, profile = createProfile(), options = {}) {
            if (!Object.hasOwn(THEMES, themeId)) throw new Error('Unknown aquarium theme.');
            this.theme = THEMES[themeId];
            this.profile = profile;
            this.demo = Boolean(options.demo);
            this.events = [];
            this.cursor = null;
            if (options.snapshot) {
                this.state = clone(options.snapshot);
                this.state.bubbles = [];
                const breedingLimit = CONFIG.birthCooldown[1] * (1 + 2 * this.state.fish.length / this.state.maxFish);
                this.state.reproduction = this.state.reproduction.map(n => Math.min(n, breedingLimit));
                if (this.state.creature) this.state.creature.holdCharge = 0;
                this.state.paused = true;
                this.habitat = createHabitat(themeId, this.state.bounds, this.state.equippedPrizes, this.state.prizePositions);
                this.clearHabitatOverlaps();
                return;
            }
            this.state = {
                themeId, seed: (options.seed ?? (Date.now() >>> 0)) || 1,
                bounds: boundsFor(options.width || 1200, options.height || 800),
                maxFish: capacity(options.width || 1200, options.height || 800),
                score: CONFIG.startingScore, tankHealth: 100, dirt: 0, damage: 0,
                multiplier: 1, streak: 0, elapsed: 0, auto: false, paused: false,
                ended: false, reason: '', outcome: '', fish: [], food: [], dead: [], bubbles: [],
                creature: null, attacks: [], spawnTimer: 0, reproduction: [0, 0, 0, 0],
                timers: { perfect: 0, diversity: 0, neglect: 0, autoFeed: 0, autoClean: 0,
                    autoBuy: 0, empty: 0, hungerWarning: 0 },
                stats: { born: 0, lost: 0, bought: 0, taps: 0, peak: 2,
                    creaturesSeen: [], attacksSurvived: 0, crabsRepelled: 0, eelsRepelled: 0 },
                tankWasLow: false, milestones: [], pending: null, milestone: null,
                newAchievements: [], nextId: 1, stress: 0, prizeEffects: {}, activity: [],
                prizes: {}, equippedPrizes: [], prizePositions: {}
            };
            this.habitat = createHabitat(themeId, this.state.bounds);
            this.state.reproduction = this.state.reproduction.map(() => this.range(...CONFIG.birthCooldown));
            this.state.spawnTimer = this.range(...CONFIG.firstVisitor);
            this.addFish(0);
            this.addFish(1);
            if (this.demo) {
                for (let i = 0; i < 7; i++) this.addFish(i % 4);
                this.state.fish.forEach(f => { f.hunger = 95; });
            } else {
                if (!profile.themesPlayed.includes(themeId)) profile.themesPlayed.push(themeId);
                this.checkAchievements();
            }
        }

        random() {
            let x = this.state.seed | 0;
            x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
            this.state.seed = x >>> 0;
            return (x >>> 0) / 4294967296;
        }
        range(lo, hi) { return lo + this.random() * (hi - lo); }
        pick(items) { return items[Math.floor(this.random() * items.length)]; }
        emit(type, message, extra = {}) {
            this.events.push({ type, message, ...extra });
            if (this.events.length > 64) this.events.shift();
            if (!this.demo && message && !['tap', 'feed', 'clean'].includes(type)) {
                this.state.activity.push({ type, message, time: this.state.elapsed, amount: extra.amount ?? null });
                if (this.state.activity.length > 40) this.state.activity.shift();
            }
        }
        drainEvents() { return this.events.splice(0); }
        reject(message) { this.emit('warning', message, { rejected: true }); return { ok: false, message }; }
        actionable() { return !this.state.paused && !this.state.ended && !this.demo; }
        floorAt(x, z) { return this.habitat.terrain ? terrainHeight(this.habitat.terrain, x, z) : this.state.bounds.floor; }
        bottomClearance(pos, padding) {
            const scalar = typeof padding === 'number', rx = scalar ? padding : padding[0],
                ry = scalar ? padding : padding[1], rz = scalar ? padding : padding[2];
            return Math.max(this.floorAt(pos[0], pos[2]), this.floorAt(pos[0] - rx, pos[2]),
                this.floorAt(pos[0] + rx, pos[2]), this.floorAt(pos[0], pos[2] - rz),
                this.floorAt(pos[0], pos[2] + rz)) + ry;
        }
        point() {
            const b = this.state.bounds;
            return [this.range(-b.width + 0.6, b.width - 0.6),
                this.range(b.floor + 1, b.surface - 0.7), this.range(-b.depth, b.depth)];
        }
        constrain(point) {
            const b = this.state.bounds;
            return [clamp(point[0], -b.width + 0.3, b.width - 0.3),
                clamp(point[1], this.floorAt(point[0], point[2]) + 0.6, b.surface - 0.45),
                clamp(point[2], -b.depth, b.depth)];
        }
        resize(width, height) {
            this.state.maxFish = capacity(width, height);
        }
        clearRock(point, padding = 0.4) {
            return this.resolveHabitat(this.constrain(point), padding);
        }
        resolveHabitat(pos, padding, ground = false, outside = false) {
            const py = typeof padding === 'number' ? padding : padding[1];
            pos[1] = Math.max(pos[1], ground ? this.floorAt(pos[0], pos[2]) + 0.42 : this.bottomClearance(pos, padding) + 0.04);
            for (let pass = 0; pass < 4; pass++) {
                let moved = false;
                for (const rock of pos[1] - py > this.habitat.ceiling ? [] : this.habitat.obstacles) {
                    const rx = paddedRadius(rock, 0, padding), ry = paddedRadius(rock, 1, padding), rz = paddedRadius(rock, 2, padding);
                    const dx = pos[0] - rock.pos[0], dy = pos[1] - rock.pos[1], dz = pos[2] - rock.pos[2];
                    if (Math.abs(dx) > rx * 1.03 || Math.abs(dy) > ry * 1.03 || Math.abs(dz) > rz * 1.03) continue;
                    if (rock.box) {
                        if (Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry, Math.abs(dz) / rz) >= 1.03) continue;
                        // The nearest face may lead into another solid, especially in older narrow tanks.
                        let axis = 0, destination = 0, nearest = Infinity, bestOverlap = Infinity;
                        for (let i = 0; i < 3; i++) {
                            if (ground && i === 1) continue;
                            const radius = paddedRadius(rock, i, padding) * 1.04;
                            const b = this.state.bounds;
                            const low = i === 1 ? b.floor + (outside ? 0.7 : 0.6) : i === 2 ? -b.depth : outside ? -Infinity : -b.width + 0.3;
                            const high = i === 1 ? b.surface - (outside ? 0.9 : 0.45) : i === 2 ? b.depth + (ground ? 2.5 : 0) : outside ? Infinity : b.width - 0.3;
                            for (const side of [-1, 1]) {
                                const exit = rock.pos[i] + side * radius;
                                if (exit < low || exit > high) continue;
                                const trial = [...pos]; trial[i] = exit;
                                let overlap = 0;
                                for (const other of this.habitat.obstacles) {
                                    if (other !== rock) overlap += Math.max(0, 1.03 - rockDistance(trial, other, padding));
                                }
                                const travel = Math.abs(exit - pos[i]);
                                if (overlap < bestOverlap - 1e-6 || Math.abs(overlap - bestOverlap) < 1e-6 && travel < nearest) {
                                    bestOverlap = overlap; nearest = travel; axis = i; destination = exit;
                                }
                            }
                        }
                        pos[axis] = destination;
                        moved = true;
                        continue;
                    }
                    const d2 = dx * dx / (rx * rx) + dy * dy / (ry * ry) + dz * dz / (rz * rz);
                    if (d2 >= 1.06) continue;
                    if (ground) {
                        const available = Math.sqrt(Math.max(0, 1.07 - dy * dy / (ry * ry)));
                        const planar = Math.sqrt(dx * dx / (rx * rx) + dz * dz / (rz * rz));
                        if (planar > 0.0001) {
                            pos[0] = rock.pos[0] + dx * available / planar;
                            pos[2] = rock.pos[2] + dz * available / planar;
                        } else pos[2] = rock.pos[2] + rz * available;
                    } else if (d2 > 0.00001) {
                        const scale = 1.04 / Math.sqrt(d2);
                        pos[0] = rock.pos[0] + dx * scale;
                        pos[1] = rock.pos[1] + dy * scale;
                        pos[2] = rock.pos[2] + dz * scale;
                    } else pos[1] = rock.pos[1] + ry * 1.04;
                    moved = true;
                }
                if (!moved) break;
            }
            const b = this.state.bounds;
            pos[1] = Math.max(pos[1], ground ? this.floorAt(pos[0], pos[2]) + 0.42 : this.bottomClearance(pos, padding) + 0.04);
            if (outside) return pos;
            pos[0] = clamp(pos[0], -b.width + 0.3, b.width - 0.3);
            pos[2] = clamp(pos[2], -b.depth, b.depth);
            pos[1] = clamp(pos[1], Math.max(b.floor + 0.6, this.bottomClearance(pos, padding) + 0.04), b.surface - 0.45);
            // Old phone saves can have rocks against a narrow boundary; escape above, not through it.
            for (const rock of pos[1] - py > this.habitat.ceiling ? [] : (this.habitat.rockSolids || this.habitat.rocks)) {
                if (Math.abs(pos[0] - rock.pos[0]) > paddedRadius(rock, 0, padding) ||
                    Math.abs(pos[2] - rock.pos[2]) > paddedRadius(rock, 2, padding)) continue;
                if (rockDistance(pos, rock, padding) < 1) pos[1] = Math.max(pos[1], rock.pos[1] + paddedRadius(rock, 1, padding) + 0.04);
            }
            for (const prize of this.habitat.prizeObstacles || []) {
                if (rockDistance(pos, prize, padding) < 1) pos[1] = Math.max(pos[1], prize.pos[1] + paddedRadius(prize, 1, padding) + 0.04);
            }
            pos[1] = Math.min(pos[1], b.surface - 0.45);
            return pos;
        }
        steerHabitat(pos, desired, padding, ground = false) {
            const length = Math.hypot(desired[0], desired[1], desired[2]);
            if (length < 0.001) return;
            const look = 0.6 / length;
            const x = pos[0] + desired[0] * look, y = pos[1] + desired[1] * look, z = pos[2] + desired[2] * look;
            if (!ground) {
                const clearance = this.bottomClearance([x, y, z], padding) + 0.2;
                if (y < clearance) desired[1] += (clearance - y) * Math.max(1.4, length);
            }
            if (y - (typeof padding === 'number' ? padding : padding[1]) - 0.2 > this.habitat.ceiling) return;
            for (const rock of this.habitat.obstacles) {
                const rx = paddedRadius(rock, 0, padding) + 0.2, ry = paddedRadius(rock, 1, padding) + 0.2, rz = paddedRadius(rock, 2, padding) + 0.2;
                const dx = x - rock.pos[0], dy = y - rock.pos[1], dz = z - rock.pos[2];
                if (Math.abs(dx) > rx || Math.abs(dy) > ry || Math.abs(dz) > rz) continue;
                const d2 = rock.box ? Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry, Math.abs(dz) / rz) ** 2
                    : dx * dx / (rx * rx) + dy * dy / (ry * ry) + dz * dz / (rz * rz);
                if (d2 >= 1) continue;
                const strength = (1 - Math.sqrt(d2)) * Math.max(1.4, length) * 2;
                const norm = Math.hypot(dx, ground ? 0 : dy, dz) || 1;
                desired[0] += dx / norm * strength;
                if (!ground) desired[1] += dy / norm * strength;
                desired[2] += dz / norm * strength;
                // A lateral suggestion avoids stopping nose-first against a solid feature.
                let side = pos[2] >= rock.pos[2] ? 1 : -1;
                const front = this.state.bounds.depth + (ground ? 2.5 : 0);
                const blocked = rock.prizeId && (side < 0 ? rock.pos[2] - rz < -this.state.bounds.depth : rock.pos[2] + rz > front);
                if (blocked) side *= -1;
                desired[2] += side * strength * (blocked ? 1.65 : 0.65);
            }
        }
        chooseIntent(f) {
            const chance = this.random();
            f.intent = chance < (f.traits.lazy ? 0.28 : 0.08) ? 'rest'
                : chance < 0.32 && (f.traits.shy || f.traits.curious || f.traits.explorer) ? 'investigate'
                : chance < 0.7 && f.traits.social && this.state.fish.some(other => other !== f && other.type === f.type && distance(f.pos, other.pos) < CONFIG.schoolRadius) ? 'socialize' : 'cruise';
            f.intentTime = this.range(8, 16);
            f.visitPhase = 'approach';
            f.dwellTime = 0;
            f.habitatRoute = []; f.routeStep = 0; f.habitatActivity = '';
            const nearestPoint = points => {
                let nearest = points[0], best = Infinity;
                for (const point of points) {
                    const d = distanceSquared(f.pos, point);
                    if (d < best) { best = d; nearest = point; }
                }
                return nearest;
            };
            if (f.intent === 'rest') {
                const refuge = nearestPoint(this.habitat.shelters);
                f.target = this.clearRock(refuge, fishScale(f) * 0.8 + 0.35);
            }
            else if (f.intent === 'investigate') {
                let plant = this.habitat.plants[0], best = Infinity;
                for (const p of this.habitat.plants) {
                    const d = (f.pos[0] - p.x) ** 2 + (f.pos[1] - ((p.floor ?? this.state.bounds.floor) + p.h * 0.7)) ** 2 + (f.pos[2] - p.z) ** 2;
                    if (d < best) { plant = p; best = d; }
                }
                f.target = this.clearRock([plant.x + (plant.x > 0 ? -0.7 : 0.7),
                    (plant.floor ?? this.state.bounds.floor) + plant.h * 0.7, plant.z + 0.45], fishScale(f) * 0.8 + 0.35);
                const padding = fishScale(f) * 0.8 + 0.15;
                const route = this.habitat.routes.filter(path => path.every(point =>
                    point[1] >= this.bottomClearance(point, padding) + 0.04 &&
                    this.habitat.obstacles.every(o => rockDistance(point, o, padding) >= 1.03)))
                    .reduce((best, path) =>
                        !best || distanceSquared(f.pos, path[0]) < distanceSquared(f.pos, best[0]) ? path : best, null);
                const browsing = Boolean(f.traits.greedy || f.traits.lazy);
                if (route && !browsing) {
                    f.habitatRoute = route.map(point => this.clearRock([...point], padding));
                    f.habitatActivity = 'explore';
                } else {
                    const side = plant.x > 0 ? -1 : 1;
                    f.habitatRoute = [-0.6, 0, 0.6].map(offset => this.clearRock([
                        plant.x + side * 1.1, this.floorAt(plant.x + side * 1.1, plant.z + offset) + 0.8 + padding,
                        plant.z + offset], padding));
                    if (distanceSquared(f.habitatRoute[0], f.habitatRoute[2]) < 0.7 ** 2) {
                        const x = plant.x * 0.7, z = Math.min(plant.z + 0.9, this.state.bounds.depth - 0.8);
                        f.habitatRoute = [-0.8, 0, 0.8].map(offset => this.clearRock([
                            x + offset, this.floorAt(x + offset, z) + padding + 0.5, z], padding));
                    }
                    f.habitatActivity = 'browse';
                }
                f.target = [...f.habitatRoute[0]];
                f.intentTime = 24;
            } else {
                const destination = this.point();
                if (f.intent === 'cruise') {
                    const side = this.random() < 0.7 ? (f.pos[0] < 0 ? 1 : -1) : (f.pos[0] < 0 ? -1 : 1);
                    destination[0] = side * this.state.bounds.width * this.range(0.75, 0.96);
                    const b = this.state.bounds, middle = (b.floor + b.surface) * 0.5;
                    destination[1] = f.pos[1] < middle
                        ? this.range(middle + 1, b.surface - 0.7)
                        : this.range(b.floor + 0.8, middle - 0.8);
                    destination[2] = (this.random() < 0.5 ? -1 : 1) * this.state.bounds.depth * this.range(0.7, 0.98);
                }
                if (f.intent === 'socialize' && this.habitat.routes.length) {
                    const route = this.habitat.routes[f.type % this.habitat.routes.length];
                    f.habitatRoute = route.map(p => this.clearRock([p[0] + Math.sin(f.id) * 0.15,
                        p[1] + Math.sin(f.id * 2) * 0.12, p[2] + Math.cos(f.id) * 0.12], fishScale(f) * 0.8 + 0.15));
                    f.habitatActivity = 'channel'; f.target = [...f.habitatRoute[0]];
                    f.intentTime = 24;
                    return;
                }
                f.target = this.clearRock(destination, fishScale(f) * 0.8);
            }
            if (f.intent !== 'socialize') {
                let length = distance(f.pos, f.target);
                for (let i = 1; i < f.habitatRoute.length; i++) length += distance(f.habitatRoute[i - 1], f.habitatRoute[i]);
                const travel = length / Math.max(0.2, this.theme.fish[f.type].speed * (f.traits.lazy ? 0.65 : 1));
                f.intentTime = clamp(travel * (f.intent === 'cruise' ? 1.4 : 2.5) + 12, 16, 60);
            }
            f.retarget = 4;
            if (f.traits.playful && this.random() < 0.3) f.burst = this.range(0.4, 0.8);
        }
        addFish(type, baby = false, position = null) {
            const def = this.theme.fish[type];
            if (!def) throw new Error('Unknown fish species.');
            const f = {
                id: this.state.nextId++, type, pos: position ? this.constrain([...position]) : this.point(),
                vel: [this.range(-0.6, 0.6), 0, this.range(-0.2, 0.2)], target: this.point(),
                hunger: 50, health: 100, growth: baby ? 0 : 1, age: 0,
                phase: this.range(0, Math.PI * 2), yaw: this.range(-Math.PI, Math.PI), pitch: 0,
                retarget: this.range(1.5, 4), burst: 0, fear: 0, schooling: false,
                intent: 'cruise', activity: 'cruise', intentTime: this.range(6, 12), roll: 0,
                visitPhase: 'approach', dwellTime: 0,
                habitatRoute: [], routeStep: 0, habitatActivity: '',
                size: def.size * this.range(0.85, 1.15), traits: {}
            };
            f.pos = this.clearRock(f.pos, fishScale(f) * 0.8);
            f.target = this.clearRock(f.target, fishScale(f) * 0.8);
            f.yaw = Math.atan2(-f.vel[2], f.vel[0]);
            for (const trait of def.traits) f.traits[trait] = this.range(0.7, 1.3);
            this.state.fish.push(f);
            this.state.stats.peak = Math.max(this.state.stats.peak, this.state.fish.length);
            return f;
        }
        award(amount, message, type = 'bonus') {
            const applied = amount > 0 ? amount * this.state.multiplier : amount;
            this.state.score = Math.max(0, this.state.score + applied);
            if (message) this.emit(type, message, { amount: applied });
            return applied;
        }
        unlock(id) {
            if (this.demo || Object.hasOwn(this.profile.achievements, id)) return false;
            const def = ACHIEVEMENTS.find(a => a.id === id);
            if (!def) throw new Error('Unknown achievement.');
            this.profile.achievements[id] = new Date().toISOString().slice(0, 10);
            this.state.newAchievements.push(id);
            this.award(def.bonus, def.name, 'achievement');
            return true;
        }
        buy(type) {
            if (!this.actionable()) return this.reject('Resume your aquarium before adding a fish.');
            const def = this.theme.fish[type];
            if (!def) return this.reject('Choose one of this aquarium\'s four species.');
            if (this.state.fish.length >= this.state.maxFish) return this.reject(`Your aquarium is at its ${this.state.maxFish}-fish capacity.`);
            if (this.state.score < def.cost) return this.reject(`A ${def.name} needs ${def.cost} points.`);
            this.state.score -= def.cost;
            const added = this.addFish(type);
            this.state.stats.bought++;
            this.state.timers.empty = 0;
            this.emit('purchase', `${def.name} joined your aquarium.`);
            this.unlock('first-fish');
            this.checkAchievements();
            return { ok: true, fish: added };
        }
        feed(point = null, automatic = false) {
            if (!this.actionable()) return this.reject('Resume your aquarium before feeding.');
            if (point !== null && (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)))
                return this.reject('Choose a food drop inside the aquarium.');
            const b = this.state.bounds;
            if (point && (Math.abs(point[0]) > b.width || Math.abs(point[2]) > b.depth))
                return this.reject('Choose a food drop inside the aquarium.');
            if (this.state.score < CONFIG.feedCost) return this.reject('Feeding needs 5 points. Healthy fish earn more over time.');
            if (this.state.food.length > CONFIG.foodLimit - 8) return this.reject('There is plenty of food in the water already.');
            const center = point || [0, b.surface - 0.3, 0];
            const count = automatic ? Math.floor(this.range(3, 7))
                : Math.max(Math.floor(this.range(4, 9)), this.state.fish.filter(f => f.hunger < 70).length);
            if (this.state.food.length + count > CONFIG.foodLimit) return this.reject('There is plenty of food in the water already.');
            this.state.score -= CONFIG.feedCost;
            for (let i = 0; i < count; i++) {
                this.state.food.push({
                    pos: [clamp(center[0] + this.range(point ? -0.4 : -0.75, point ? 0.4 : 0.75), -b.width + 0.3, b.width - 0.3),
                        point ? clamp(point[1] + this.range(-0.12, 0.12), this.floorAt(point[0], point[2]) + 0.1, b.surface - 0.25) : b.surface - this.range(0.25, 0.5),
                        clamp(center[2] + this.range(point ? -0.35 : -0.6, point ? 0.35 : 0.6), -b.depth, b.depth)],
                    age: 0, speed: this.range(0.21, 0.43), phase: this.range(0, 6.28)
                });
            }
            this.profile.stats.food += count;
            this.emit('feed', automatic ? 'Zen care: a little food for your fish.' : 'Dinner is drifting down.');
            return { ok: true };
        }
        waterHealth() {
            return clamp(100 - this.state.dirt * (1 + Math.max(0, this.state.fish.length - 12) * 0.1) - this.state.damage, 0, 100);
        }
        clean() {
            if (!this.actionable()) return this.reject('Resume your aquarium before cleaning.');
            if (this.state.score < CONFIG.cleanCost) return this.reject('Cleaning needs 10 points.');
            const before = this.state.tankHealth;
            this.state.score -= CONFIG.cleanCost;
            this.state.dirt = 0;
            this.state.damage = Math.max(0, this.state.damage - CONFIG.cleanRepair);
            this.state.tankHealth = this.waterHealth();
            this.profile.stats.cleans++;
            this.emit('clean', 'A fresh start for the water.');
            if (before > 70) this.award(CONFIG.bonuses.clean, 'Clean Sweep');
            this.checkAchievements();
            return { ok: true };
        }
        tap(point) {
            if (!this.actionable()) return this.reject('Resume your aquarium to interact.');
            this.state.stats.taps++;
            this.state.stress += 3;
            const c = this.state.creature;
            if (c && !c.defended) {
                c.provoked = true;
                c.taps = Math.min(3, c.taps + 1);
                c.lastTap = this.state.elapsed;
                if (!['windup', 'dash'].includes(c.phase)) {
                    c.phase = 'stalk'; c.phaseTimer = Math.min(c.phaseTimer, 1.2);
                    c.targetId = null; c.targetPoint = null;
                }
            }
            for (const f of this.state.fish) {
                if (distance(f.pos, point) > 2.2 + f.size * 0.4) continue;
                if (f.traits.curious && this.random() < 0.5) {
                    f.target = this.constrain(point.map((n, i) => n + (i === 1 ? 0.4 : 0)));
                    f.burst = 1;
                } else {
                    const direction = normalize(f.pos.map((n, i) => n - point[i] + this.range(-0.1, 0.1)));
                    const bravery = 1 - (f.traits.brave || 0) * 0.35;
                    f.target = this.constrain(f.pos.map((n, i) => n + direction[i] * 4 * bravery));
                    f.fear = 1.5;
                }
                f.retarget = 2;
            }
            if (this.state.stress > 10) {
                this.state.damage = clamp(this.state.damage + 2, 0, 100);
                this.state.tankHealth = this.waterHealth();
                this.award(-CONFIG.penalties.stress, 'Gentle hands. Too much tapping stresses your fish.', 'warning');
            } else {
                this.emit('tap', 'A ripple through their little world.', { point });
            }
            if (this.state.stats.taps >= 10) this.unlock('glass-tapper');
            return { ok: true };
        }
        tapCreature() {
            const c = this.state.creature;
            if (!c || c.defended) return this.rejectCreature('That visitor is already leaving, or has moved on.');
            return this.tap([...c.pos]);
        }
        rejectCreature(message) {
            this.emit('warning', message, { rejected: true, creature: true, encounter: this.state.creature });
            return { ok: false, message };
        }
        defendCreature(action, side = 0) {
            if (!this.actionable()) return this.rejectCreature('Resume your aquarium to defend its residents.');
            const c = this.state.creature;
            if (!c || c.defended) return this.rejectCreature('That visitor is already leaving, or has moved on.');
            if (action !== 'swipe' || c.kind === 'eel') return this.rejectCreature('Hold the eel during its coil; swipe other creatures outward.');
            if (c.decoyCooldown > 0) return this.rejectCreature('Give the creature a moment to react before the next swipe.');
            if (c.kind === 'crab') {
                if (![1, -1].includes(side)) return this.rejectCreature('Swipe the crab to the left or right.');
                if (side === c.lastLure) {
                    return this.rejectCreature('Switch direction: swipe toward the other claw.');
                } else {
                    c.defenseStep++;
                }
                c.lastLure = side;
            } else c.defenseStep++;
            c.decoyCooldown = CONFIG.decoyCooldown;
            c.flee = 0.8;
            c.direction = side || (c.pos[0] >= 0 ? 1 : -1);
            c.phase = 'recover'; c.phaseTimer = 1.6;
            c.targetId = null; c.targetPoint = null;
            this.emit('decoy', `${c.name}: ${c.defenseStep} / ${CONFIG.repelSwipes} swipes.`, { creature: true });
            if (c.defenseStep >= CONFIG.repelSwipes) this.repelChallenge(c);
            return { ok: true };
        }
        beginCreatureHold() {
            if (!this.actionable()) return this.rejectCreature('Resume your aquarium to defend its residents.');
            const c = this.state.creature;
            if (!c || c.defended || c.kind !== 'eel' || c.phase !== 'windup') return this.rejectCreature('Press and hold the eel while it coils, before the shock.');
            this.heldCreature = c;
            c.holdCharge = 0;
            return { ok: true };
        }
        endCreatureHold() {
            if (this.heldCreature) this.heldCreature.holdCharge = 0;
            this.heldCreature = null;
        }
        repelChallenge(c) {
            c.defended = true;
            c.phase = 'leaving';
            c.flee = 12;
            c.direction = c.pos[0] >= 0 ? 1 : -1;
            c.targetId = null; c.targetPoint = null;
            this.endCreatureHold();
            if (c.kind === 'crab' || c.kind === 'eel') {
                const stat = c.kind === 'crab' ? 'crabsRepelled' : 'eelsRepelled';
                this.profile.stats[stat]++; this.state.stats[stat]++;
            }
            this.emit('defended', `${c.name} is leaving. Your aquarium is safe for now.`);
            this.checkPrizes();
        }
        checkPrizes() {
            if (this.demo) return;
            for (const prize of PRIZES) {
                const progress = prize.stat === 'score' ? this.state.score : this.state.stats[prize.stat];
                if (progress < prize.goal || Object.hasOwn(this.state.prizes, prize.id)) continue;
                this.state.prizes[prize.id] = new Date().toISOString().slice(0, 10);
                let placed = false;
                if (this.state.equippedPrizes.length < CONFIG.prizeLimit) {
                    const spot = this.findPrizeSpot(prize.id);
                    if (spot) {
                        this.state.prizePositions[prize.id] = spot;
                        this.state.equippedPrizes.push(prize.id); placed = true;
                        this.refreshPrizeObstacles();
                    }
                }
                this.emit('prize', `Tank prize earned: ${prize.name}. ${placed ? 'Placed on open sand.' : 'Kept in your collection; put another prize away to make room.'}`, { prizeId: prize.id });
            }
        }
        refreshPrizeObstacles() {
            const h = this.habitat;
            h.prizeObstacles = createPrizeObstacles(this.state.bounds, this.state.equippedPrizes, this.state.prizePositions);
            h.obstacles = [...(h.rockSolids || h.rocks), ...h.stems, ...h.prizeObstacles];
            h.ceiling = Math.max(...h.obstacles.map(o => o.pos[1] + o.radius[1]));
            this.clearHabitatOverlaps();
        }
        clearHabitatOverlaps() {
            const solids = this.habitat.obstacles;
            if (!solids.length) return;
            for (const f of this.state.fish) {
                const padding = fishScale(f) * 0.8;
                if (f.pos[1] < this.bottomClearance(f.pos, padding) + 0.04 ||
                    solids.some(p => rockDistance(f.pos, p, padding) < 1.03)) this.resolveHabitat(f.pos, padding);
            }
            this.clearCreatureOverlaps();
        }
        clearCreatureOverlaps() {
            const solids = this.habitat.obstacles;
            const c = this.state.creature;
            if (!c || !c.entered) return;
            const front = this.state.bounds.depth + (c.kind === 'crab' || c.defended ? 2.5 : 0);
            const size = this.theme.visitors[c.index].size, padding = creaturePadding(c.kind, size);
            const points = c.kind === 'eel' ? Array.from({ length: 8 }, (_, i) => {
                const offset = (1.05 - i * 3.15 / 7) * size * 0.55;
                return [c.pos[0] + Math.cos(c.yaw) * offset, c.pos[1], c.pos[2] - Math.sin(c.yaw) * offset];
            }) : [c.pos];
            if (c.pos[2] >= -this.state.bounds.depth && c.pos[2] <= front &&
                c.pos[1] <= this.state.bounds.surface - 0.9 && !points.some(point => point[1] < (c.kind === 'crab' ? this.floorAt(point[0], point[2]) + 0.4 : this.bottomClearance(point, padding)) ||
                solids.some(p => rockDistance(point, p, padding) < 1.03))) return;
            if (c.kind === 'eel') {
                for (let pass = 0; pass < 8; pass++) for (let sample = 0; sample < 8; sample++) {
                    const offset = (1.05 - sample * 3.15 / 7) * size * 0.55;
                    const point = [c.pos[0] + Math.cos(c.yaw) * offset, c.pos[1], c.pos[2] - Math.sin(c.yaw) * offset];
                    const original = [...point];
                    this.resolveHabitat(point, padding, false, true);
                    for (let axis = 0; axis < 3; axis++) c.pos[axis] += point[axis] - original[axis];
                }
            } else this.resolveHabitat(c.pos, padding, c.kind === 'crab', true);
            const clearAt = pos => {
                if (pos[1] > this.state.bounds.surface - 0.9 || pos[2] < -this.state.bounds.depth || pos[2] > front) return false;
                for (let sample = 0; sample < (c.kind === 'eel' ? 8 : 1); sample++) {
                    const offset = c.kind === 'eel' ? (1.05 - sample * 3.15 / 7) * size * 0.55 : 0;
                    const point = [pos[0] + Math.cos(c.yaw) * offset, pos[1], pos[2] - Math.sin(c.yaw) * offset];
                    if (point[1] < (c.kind === 'crab' ? this.floorAt(point[0], point[2]) + 0.4 : this.bottomClearance(point, padding)) ||
                        this.habitat.obstacles.some(o => rockDistance(point, o, padding) < 1.03)) return false;
                }
                return true;
            };
            if (clearAt(c.pos)) return;
            // A newly placed solid can trap an already overlapping full body between neighboring props.
            const b = this.state.bounds, origin = [...c.pos];
            for (let radius = 0.25; radius <= b.width * 2 + 8; radius += 0.25) {
                const candidates = c.kind === 'crab' ? [] : [[origin[0], clamp(origin[1] + radius, b.floor + 0.7, b.surface - 0.9), clamp(origin[2], -b.depth, front)]];
                for (let i = 0; i < 24; i++) {
                    const angle = i * Math.PI / 12;
                    candidates.push([origin[0] + Math.cos(angle) * radius,
                        c.kind === 'crab' ? this.floorAt(origin[0] + Math.cos(angle) * radius, origin[2] + Math.sin(angle) * radius) + 0.42
                            : clamp(origin[1], b.floor + 0.7, b.surface - 0.9), origin[2] + Math.sin(angle) * radius]);
                }
                for (const candidate of candidates) {
                    if (candidate[2] < -b.depth || candidate[2] > front) continue;
                    if (clearAt(candidate)) { c.pos = candidate; return; }
                }
            }
            throw new Error('Unable to clear a creature from the solid habitat.');
        }
        equipPrize(id) {
            if (!this.actionable()) return this.reject('Resume your aquarium to arrange its prizes.');
            if (!PRIZES.some(p => p.id === id) || !Object.hasOwn(this.state.prizes, id)) return this.reject('Earn this tank prize in this aquarium before placing it.');
            const placed = this.state.equippedPrizes.indexOf(id);
            if (placed >= 0) this.state.equippedPrizes.splice(placed, 1);
            else if (this.state.equippedPrizes.length >= CONFIG.prizeLimit) return this.reject('Three prizes fit comfortably. Put one away before placing another.');
            else {
                const spot = this.findPrizeSpot(id);
                if (!spot) return this.reject('There is no open sand for that prize. Move or put away another prize first.');
                this.state.prizePositions[id] = spot;
                this.state.equippedPrizes.push(id);
            }
            this.refreshPrizeObstacles();
            this.emit('arrange', placed >= 0 ? 'Your prize is safely kept in your collection.' : 'A new detail for your little world.');
            return { ok: true };
        }
        interactPrize(id) {
            if (!this.actionable()) return this.reject('Resume your aquarium to enjoy its prizes.');
            if (!this.state.equippedPrizes.includes(id)) return this.reject('Place that prize in your aquarium first.');
            this.state.prizeEffects[id] = CONFIG.prizeInteraction;
            this.emit('prize-play', `${PRIZES.find(p => p.id === id).name}: a small moment of wonder.`);
            return { ok: true };
        }
        prizeMoveCandidate(id, point) {
            if (!PRIZES.some(p => p.id === id) || !Object.hasOwn(this.state.prizes, id)) return { ok: false, message: 'Earn that prize in this aquarium first.' };
            if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) return { ok: false, message: 'Choose a spot on the sand inside your aquarium.' };
            const b = this.state.bounds, original = prizePositions(b, [id])[0].pos;
            const base = this.floorAt(point[0], point[2]);
            const pos = [point[0], base + original[1] - b.floor, point[2]];
            const solids = createPrizeObstacles(b, [id], { [id]: pos });
            for (const solid of solids) for (const dx of [-solid.radius[0], solid.radius[0]]) for (const dz of [-solid.radius[2], solid.radius[2]]) {
                if (Math.abs(this.floorAt(solid.pos[0] + dx, solid.pos[2] + dz) - base) > 0.12)
                    return { ok: false, message: 'Choose a level patch of sand so the whole prize rests securely.' };
            }
            for (const solid of solids) {
                if (Math.abs(solid.pos[0]) + solid.radius[0] > b.width - 0.1 ||
                    Math.abs(solid.pos[2]) + solid.radius[2] > b.depth + 1.3) return { ok: false, message: 'Keep the whole prize inside the sandy habitat.' };
                for (const other of this.habitat.obstacles) {
                    if (other.prizeId === id) continue;
                    if (rockDistance(solid.pos, other, solid.radius) < 1.03) return { ok: false, message: 'That spot overlaps a rock, stem, or another prize. Try open sand.' };
                }
            }
            return { ok: true, pos };
        }
        findPrizeSpot(id) {
            const b = this.state.bounds, preferred = prizePositions(b, [id], this.state.prizePositions)[0].pos;
            const preferredCandidate = this.prizeMoveCandidate(id, preferred);
            if (preferredCandidate.ok) return preferredCandidate.pos;
            for (let z = b.depth; z >= -b.depth; z -= 0.45) for (let x = -b.width + 0.9; x <= b.width - 0.9; x += 0.45) {
                const candidate = this.prizeMoveCandidate(id, [x, preferred[1], z]);
                if (candidate.ok) return candidate.pos;
            }
            return null;
        }
        movePrize(id, point) {
            if (!this.actionable()) return this.reject('Resume your aquarium before moving a prize.');
            if (!this.state.equippedPrizes.includes(id)) return this.reject('Place that prize before moving it.');
            const candidate = this.prizeMoveCandidate(id, point);
            if (!candidate.ok) return this.reject(candidate.message);
            this.state.prizePositions[id] = candidate.pos;
            this.refreshPrizeObstacles();
            this.emit('arrange', 'Your prize has a new place on the sand.');
            return { ok: true };
        }
        spawnCreature() {
            if (this.state.creature || this.demo) return;
            const index = Math.floor(this.random() * this.theme.visitors.length);
            const def = this.theme.visitors[index];
            const direction = this.random() < 0.5 ? 1 : -1;
            this.state.creature = {
                index, kind: def.kind, name: def.name, pos: [-direction * (this.state.bounds.width + 1.5), this.range(-0.7, 2), this.range(-1.6, 1.6)],
                direction, age: 0, cooldown: 0, taps: 0, lastTap: -10,
                flee: 0, provoked: false, eaten: 0, entered: false, yaw: direction > 0 ? 0 : Math.PI,
                phase: 'stalk',
                phaseTimer: CONFIG.encounterRest, defenseStep: 0, lastLure: 0, decoyCooldown: 0, holdCharge: 0,
                defended: false, targetId: null, targetPoint: null
            };
            if (def.kind === 'crab' || def.kind === 'eel') {
                this.state.creature.pos[1] = this.state.bounds.floor + (def.kind === 'crab' ? 0.42 : 0.85);
                this.state.creature.pos[2] = def.kind === 'crab' ? this.state.bounds.depth + 2 : -1.2;
            }
            if (def.kind !== 'crab') this.state.creature.pos[2] = this.state.bounds.depth + 2;
            this.profile.stats.creatures++;
            if (!this.state.stats.creaturesSeen.includes(def.kind)) this.state.stats.creaturesSeen.push(def.kind);
            const guidance = def.kind === 'crab' ? 'Swipe it left, right, then left.'
                : def.kind === 'eel' ? 'Press and hold it when it coils.'
                : 'Swipe outward from it three times.';
            this.award(CONFIG.bonuses.sighting, `${def.name} is approaching. ${guidance}`, 'visitor');
            this.unlock('creature-encounter');
            if (['jellyfish', 'octopus', 'squid'].every(kind => this.state.stats.creaturesSeen.includes(kind))) this.unlock('creature-collector');
        }
        kill(f, cause) {
            const index = this.state.fish.indexOf(f);
            if (index < 0) return;
            this.state.fish.splice(index, 1);
            this.state.dead.push({ type: f.type, pos: [...f.pos], yaw: f.yaw, pitch: f.pitch,
                phase: f.phase, growth: f.growth, size: f.size, age: 0 });
            this.state.stats.lost++;
            this.profile.stats.lost++;
            const starvation = cause === 'starvation';
            const name = this.theme.fish[f.type].name;
            this.award(-CONFIG.penalties[starvation ? 'starvation' : 'death'],
                `${name} ${starvation ? 'was lost to hunger' : cause === 'predator' ? 'was caught by a predator' : 'was lost'}.`, 'loss');
        }
        updateFish(f, dt) {
            const s = this.state;
            const def = this.theme.fish[f.type];
            const swim = swimmingFor(def);
            f.age += dt;
            f.growth = Math.min(1, f.growth + CONFIG.babyGrowth * dt);
            f.fear = Math.max(0, f.fear - dt);
            f.burst = Math.max(0, f.burst - dt);
            f.retarget = Math.max(-0.1, f.retarget - dt);
            if (!['evade', 'forage'].includes(f.activity)) f.intentTime = Math.max(0, f.intentTime - dt);
            const friends = [];
            for (const other of s.fish) if (other !== f && other.type === f.type && distanceSquared(f.pos, other.pos) < CONFIG.schoolRadius ** 2) friends.push(other);
            f.schooling = friends.length >= 2;
            if (!this.demo) {
                f.hunger = Math.max(0, f.hunger - dt * CONFIG.hungerDecay * (f.traits.social && friends.length ? 0.6 : 1));
                if (f.hunger < 15) f.health -= CONFIG.starvationDamage * dt;
                if (f.hunger > 60) f.health = Math.min(100, f.health + CONFIG.recoveryRate * dt);
                if (s.tankHealth < 30) f.health -= CONFIG.dirtyWaterDamage * dt;
                if (f.health <= 0) { this.kill(f, f.hunger < 10 ? 'starvation' : 'health'); return; }
            }
            let target = f.target;
            let speed = def.speed * (1 - (f.traits.lazy || 0) * 0.35);
            let school = false;
            if (f.intentTime <= 0 || !f.habitatRoute.length && distance(f.pos, target) < 0.4 && ['cruise', 'socialize'].includes(f.intent)) {
                this.chooseIntent(f);
                target = f.target;
            }
            f.activity = f.intent;
            const visiting = f.intent === 'rest' || f.intent === 'investigate';
            let threat = null;
            if (s.creature && !s.creature.defended && s.creature.flee === 0) {
                const c = s.creature;
                const awareness = c.kind === 'crab' ? 1.6 : f.traits.brave ? 2 : 3.2;
                if (distance(f.pos, c.pos) < awareness) threat = c.pos;
            }
            for (const attack of s.attacks) {
                const points = attack.kind === 'stingers' ? attack.nodes : [attack.pos];
                const nearby = points.find(pos => distance(f.pos, pos) < (attack.kind === 'shock' ? 2.8 : attack.kind === 'ink' ? 2.1 : 1.2));
                if (nearby) threat = nearby;
            }
            if (threat) {
                target = this.clearRock(f.pos.map((n, i) => n + (n - threat[i]) * 2), fishScale(f) * 0.8);
                if (f.traits.shy) {
                    let refuge = null, best = Infinity;
                    for (const p of this.habitat.shelters) {
                        const d = distanceSquared(f.pos, p);
                        if (distanceSquared(p, threat) > 9 && d < best) { refuge = p; best = d; }
                    }
                    if (refuge) target = this.clearRock(refuge, fishScale(f) * 0.8);
                }
                f.activity = 'evade';
                speed = Math.max(1.4, def.speed * 2);
            } else if (f.fear > 0) { speed = Math.max(1.5, def.speed * 2.5); f.activity = 'evade'; }
            else {
                if (f.burst > 0) speed *= 1.6;
                let food = null;
                if (f.hunger < 70) {
                    let nearest = (f.traits.greedy ? 10 : 5.7) ** 2;
                    for (const item of s.food) {
                        const d = distanceSquared(f.pos, item.pos);
                        if (d < nearest) { nearest = d; food = item; }
                    }
                }
                if (food) {
                    target = food.pos;
                    f.activity = 'forage';
                    speed *= f.traits.greedy ? 3 : 2;
                    if (distance(f.pos, food.pos) < (f.traits.greedy ? 0.43 : 0.29)) {
                        f.hunger = Math.min(100, f.hunger + CONFIG.foodNutrition);
                        s.food.splice(s.food.indexOf(food), 1);
                    }
                } else if (!this.demo && f.hunger < 20 && f.size > 0.9 && f.growth === 1) {
                    const prey = s.fish.find(other => other !== f && other.size * (0.3 + 0.7 * other.growth) < f.size * 0.7 && distanceSquared(f.pos, other.pos) < 4.3 ** 2);
                    if (prey) {
                        target = prey.pos;
                        f.activity = 'forage';
                        speed *= 2.5;
                        if (distance(f.pos, prey.pos) < 0.25) {
                            this.kill(prey, 'predator');
                            f.hunger = Math.min(100, f.hunger + 50);
                        }
                    }
                } else if (f.traits.curious && this.cursor && distance(f.pos, this.cursor) < 2.9) {
                    target = this.cursor;
                    f.activity = 'investigate';
                    speed *= 0.75;
                } else if (!visiting && (f.schooling || (f.traits.social && friends.length))) {
                    school = true;
                    f.activity = 'socialize';
                }
                if (!food) {
                    const bully = s.fish.find(other => other !== f && this.theme.fish[other.type].aggression > def.aggression + 0.25 && distanceSquared(f.pos, other.pos) < 1.7 ** 2);
                    if (bully) {
                        target = this.constrain(f.pos.map((n, i) => n + (n - bully.pos[i]) * (f.traits.brave ? 0.6 : 1.5)));
                        speed *= 1.4;
                        school = false;
                        f.activity = 'evade';
                    }
                }
            }
            if (f.activity === f.intent && f.habitatRoute.length) {
                if (distanceSquared(f.pos, f.target) < 0.65 ** 2) {
                    if (f.routeStep + 1 < f.habitatRoute.length) {
                        f.routeStep++; f.target = [...f.habitatRoute[f.routeStep]]; target = f.target;
                        f.visitPhase = 'approach';
                    } else {
                        f.habitatRoute = [];
                        f.routeStep = 0;
                        f.visitPhase = 'dwell'; f.dwellTime = this.range(3, 6);
                        if (f.intent === 'socialize') f.intentTime = 0;
                    }
                }
                speed *= f.habitatActivity === 'browse' ? 0.7 : 0.9;
            }
            if (f.activity === f.intent && visiting && !f.habitatRoute.length) {
                const arrived = distanceSquared(f.pos, f.target) < 0.75 ** 2;
                if (f.visitPhase === 'approach' && arrived) {
                    f.visitPhase = 'dwell';
                    f.dwellTime = this.range(f.intent === 'rest' ? 4 : 3, f.intent === 'rest' ? 9 : 6);
                }
                if (f.visitPhase === 'dwell') {
                    f.dwellTime = Math.max(0, f.dwellTime - dt);
                    f.intentTime = Math.max(f.intentTime, f.dwellTime + 1);
                    if (f.dwellTime === 0) {
                        f.intentTime = 0;
                    } else if (f.intent === 'investigate') {
                        const angle = f.age * 0.65 + f.id;
                        target = [f.target[0] + Math.cos(angle) * 0.32, f.target[1], f.target[2] + Math.sin(angle) * 0.32];
                        speed *= 0.4;
                    } else speed *= 0.18;
                }
                speed *= clamp(distance(f.pos, target) * 1.5, 0, 1);
            }
            const rhythm = swimRhythm(f, def);
            if (f.activity !== 'evade' && f.activity !== 'forage') speed *= rhythm.pace;
            const bubbling = bubblePose(f);
            if (bubbling.amount > 0) {
                speed *= 1 - bubbling.amount * 0.8;
                school = false;
            }
            const dx = target[0] - f.pos[0], dy = target[1] - f.pos[1], dz = target[2] - f.pos[2];
            const targetLength = Math.hypot(dx, dy, dz) || 1;
            const direction = [dx / targetLength, dy / targetLength, dz / targetLength];
            const desired = [direction[0] * speed, direction[1] * speed, direction[2] * speed];
            if (school) {
                const center = [0, 0, 0], alignment = [0, 0, 0];
                let spacing = 0;
                for (const friend of friends) {
                    spacing += fishSpacing(f, friend) / friends.length;
                    for (let i = 0; i < 3; i++) {
                        center[i] += friend.pos[i] / friends.length;
                        alignment[i] += friend.vel[i] / friends.length;
                    }
                }
                const heading = normalize(alignment);
                const cohesion = Math.max(0, distance(f.pos, center) - spacing) * CONFIG.schoolCohesion;
                const toward = normalize(center.map((n, i) => n - f.pos[i]));
                // Keep each fish's own route; neighbors suggest a heading, not a shared destination.
                for (let i = 0; i < 3; i++) {
                    desired[i] += (heading[i] * speed - desired[i]) * CONFIG.schoolAlignment + toward[i] * cohesion;
                }
            }
            const separation = [0, 0, 0];
            for (const other of s.fish) {
                if (other === f) continue;
                const squared = distanceSquared(f.pos, other.pos);
                const spacing = fishSpacing(f, other);
                if (squared < spacing * spacing) {
                    const d = Math.sqrt(squared);
                    const sign = f.id > other.id ? 1 : -1;
                    const angle = (f.id + other.id) * Math.PI * (3 - Math.sqrt(5));
                    const strength = (1 - d / spacing) * CONFIG.separationStrength;
                    if (d > 0.001) {
                        separation[0] += (f.pos[0] - other.pos[0]) / d * strength;
                        separation[1] += (f.pos[1] - other.pos[1]) / d * strength;
                        separation[2] += (f.pos[2] - other.pos[2]) / d * strength;
                    } else {
                        separation[0] += Math.cos(angle) * sign * strength;
                        separation[1] += Math.sin(angle * 2) * sign * strength;
                        separation[2] += Math.sin(angle) * sign * strength;
                    }
                }
            }
            const separationLimit = Math.max(1, Math.hypot(...separation) / CONFIG.separationStrength);
            const ahead = f.pos.map((n, i) => n + direction[i] * CONFIG.boundaryLookahead);
            const safe = this.constrain(ahead);
            for (let i = 0; i < 3; i++) {
                desired[i] += separation[i] / separationLimit + (safe[i] - ahead[i]) * CONFIG.boundaryStrength;
            }
            const padding = fishScale(f) * 0.8;
            this.steerHabitat(f.pos, desired, padding);
            const limit = Math.max(0.8, Math.min(4, speed + 1.1));
            const desiredLength = Math.hypot(...desired);
            const yaw = desiredLength > 0.02 ? Math.atan2(-desired[2], desired[0]) : f.yaw;
            const yawDelta = Math.atan2(Math.sin(yaw - f.yaw), Math.cos(yaw - f.yaw));
            const turnRate = f.activity === 'evade' ? 1.8 : swim.turn;
            const oldSpeed = Math.hypot(...f.vel);
            const turnLimit = Math.min(turnRate, 2.5 / Math.max(1, oldSpeed));
            const turn = clamp(yawDelta, -turnLimit * dt, turnLimit * dt);
            f.yaw += turn;
            const pitchLimit = f.activity === 'evade' || f.activity === 'forage' ? 0.75
                : visiting && f.visitPhase === 'approach' ? Math.max(swim.pitch, 0.6)
                    : f.intent === 'cruise' ? Math.max(swim.pitch, 0.65) : swim.pitch;
            const pitch = clamp(Math.atan2(desired[1], Math.hypot(desired[0], desired[2])), -pitchLimit, pitchLimit);
            f.pitch += clamp(pitch - f.pitch, -turnRate * dt, turnRate * dt);
            const aligned = Math.max(0.35, Math.cos(yawDelta));
            const wantedSpeed = Math.min(limit, desiredLength) * aligned;
            const acceleration = f.activity === 'evade' ? 5 : swim.acceleration;
            const actualSpeed = Math.max(0, oldSpeed + clamp(wantedSpeed - oldSpeed, -acceleration * dt, acceleration * dt));
            const cp = Math.cos(f.pitch);
            const vx = Math.cos(f.yaw) * cp * actualSpeed, vy = Math.sin(f.pitch) * actualSpeed, vz = -Math.sin(f.yaw) * cp * actualSpeed;
            const velocityChange = Math.hypot(vx - f.vel[0], vy - f.vel[1], vz - f.vel[2]);
            const blend = Math.min(1, 5 * dt / (velocityChange || 1));
            f.vel[0] += (vx - f.vel[0]) * blend;
            f.vel[1] += (vy - f.vel[1]) * blend;
            f.vel[2] += (vz - f.vel[2]) * blend;
            for (let i = 0; i < 3; i++) f.pos[i] += f.vel[i] * dt;
            this.resolveHabitat(f.pos, padding);
            const bank = actualSpeed > 0.3 && f.activity !== 'rest' ? -turn / Math.max(dt, 0.001) * swim.bank * Math.min(1, actualSpeed) : 0;
            f.roll += (clamp(bank, -0.12, 0.12) - f.roll) * (1 - Math.exp(-6 * dt));
            f.phase += dt * (swim === SWIMMING.hover ? 2.3 + rhythm.propulsion
                : 0.8 + actualSpeed * (1.8 + rhythm.propulsion * 2.4));
            if (bubbling.amount > 0) {
                const beat = Math.floor((bubbling.time + 1e-8) / 0.3);
                const previous = Math.floor((bubbling.time - dt + 1e-8) / 0.3);
                if (beat > previous && beat >= 1 && beat <= 5 && s.bubbles.length < 64) {
                    const point = fishMouth(f);
                    s.bubbles.push({ pos: point, age: 0, phase: f.id + beat * 2.4, size: fishScale(f) });
                    this.emit('bubble', '', { point, fishId: f.id });
                }
            }
        }
        updateCreature(dt) {
            const s = this.state;
            s.spawnTimer -= dt;
            if (!s.creature && s.spawnTimer <= 0) this.spawnCreature();
            const c = s.creature;
            if (!c) return;
            c.age += dt;
            c.cooldown = Math.max(0, c.cooldown - dt);
            c.flee = Math.max(0, c.flee - dt);
            c.decoyCooldown = Math.max(0, c.decoyCooldown - dt);
            const fullyInside = Math.abs(c.pos[0]) < s.bounds.width - 0.7 && (c.kind === 'crab' || c.pos[2] <= s.bounds.depth);
            c.entered ||= fullyInside;
            const step = [c.direction * 0.48, Math.cos(c.age * 1.5) * 0.11, Math.sin(c.age * 0.4) * 0.07];
            if (c.kind !== 'crab' && !c.entered) {
                step[1] = 0; step[2] = 0;
                if (Math.abs(c.pos[0]) < s.bounds.width * 0.08) { step[0] = 0; step[2] = -0.75; }
            }
            this.advanceEncounter(c, dt, fullyInside);
            if (c.kind === 'crab') this.moveCrab(c, step, dt, fullyInside);
            else if (c.kind === 'eel') this.moveEel(c, step, dt, fullyInside);
            else if (c.entered && !c.defended) {
                if (c.phase === 'windup' || c.phase === 'recover') step.fill(0);
                else if (s.fish.length) {
                    const prey = this.nearestResident(c.pos);
                    const toward = normalize(prey.pos.map((n, i) => n - c.pos[i]));
                    const pace = c.kind === 'jellyfish' ? 0.34 : c.kind === 'squid' ? 0.9 : 0.62;
                    for (let i = 0; i < 3; i++) step[i] = toward[i] * pace;
                } else step.fill(0);
            }
            if (c.flee > 0 && (c.kind !== 'crab' || c.defended)) {
                step[0] = c.direction * (c.provoked ? 2.8 : 2.1);
                step[1] = c.kind === 'crab' ? 0 : 0.12;
                if (c.kind !== 'crab' && c.defended && c.pos[2] < s.bounds.depth + 2.4) {
                    step[0] = 0; step[1] = 0; step[2] = 1.8;
                }
            }
            if (c.defended && c.kind === 'crab') {
                // Use the open foreground sand to leave dense planting without teleporting through it.
                if (c.pos[2] < s.bounds.depth + 2.4) {
                    step[0] = 0; step[1] = 0; step[2] = 1.8;
                } else {
                    step[0] = c.direction * 2.1; step[1] = 0; step[2] = 0;
                }
            }
            if (!c.defended && c.entered) {
                if (Math.abs(c.pos[0] + step[0] * dt) > s.bounds.width - 0.8) step[0] = -Math.sign(c.pos[0]) * 0.4;
            }
            if (c.kind === 'crab' || c.kind === 'eel') this.navigateCreature(c, step, dt);
            else {
                const padding = creaturePadding(c.kind, this.theme.visitors[c.index].size);
                this.steerHabitat(c.pos, step, padding);
                for (let i = 0; i < 3; i++) c.pos[i] += step[i] * dt;
                this.resolveHabitat(c.pos, padding, false, true);
            }
            if (c.kind === 'eel' && c.phase === 'dash' && !c.defended) {
                for (const attack of s.attacks) if (attack.kind === 'shock') attack.pos = [...c.pos];
            }
            c.pos[1] = clamp(c.pos[1], this.floorAt(c.pos[0], c.pos[2]) + (c.kind === 'crab' ? 0.42 : 0.4), s.bounds.surface - 0.9);
            c.pos[2] = clamp(c.pos[2], -s.bounds.depth, s.bounds.depth + ((!c.entered || c.defended || c.kind === 'crab') ? 2.5 : 0));
            if (c.kind !== 'eel') c.yaw = Math.atan2(-step[2], step[0]);
            if (!c.defended && c.entered && c.cooldown === 0 && c.kind === 'crab' && c.phase !== 'windup') {
                this.catchResident(c);
            }
            if (c.defended && Math.abs(c.pos[0]) > s.bounds.width + 1.7) {
                if (c.eaten === 0) this.award(CONFIG.bonuses.whisperer, 'Creature Whisperer: your visitor left peacefully.');
                s.creature = null;
                s.spawnTimer = this.range(...CONFIG.nextVisitor);
            }
        }
        nearestResident(pos, maxHeight = Infinity) {
            let nearest = null, best = Infinity;
            for (const f of this.state.fish) {
                if (f.pos[1] > maxHeight) continue;
                const d = distanceSquared(f.pos, pos);
                if (d < best) { best = d; nearest = f; }
            }
            return nearest;
        }
        sheltered(from, to) {
            const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
            for (const rock of this.habitat.rocks.flatMap(r => r.parts || [r])) {
                const x = (from[0] - rock.pos[0]) / rock.radius[0];
                const y = (from[1] - rock.pos[1]) / rock.radius[1];
                const z = (from[2] - rock.pos[2]) / rock.radius[2];
                const vx = dx / rock.radius[0], vy = dy / rock.radius[1], vz = dz / rock.radius[2];
                const length = vx * vx + vy * vy + vz * vz;
                if (!length) continue;
                const t = clamp(-(x * vx + y * vy + z * vz) / length, 0, 1);
                if ((x + vx * t) ** 2 + (y + vy * t) ** 2 + (z + vz * t) ** 2 < 1) return true;
            }
            return false;
        }
        advanceEncounter(c, dt, fullyInside) {
            if (c.defended || !c.entered) return;
            if (c.kind === 'eel' && c.phase === 'windup' && this.heldCreature === c) {
                c.holdCharge = Math.min(CONFIG.eelHold, c.holdCharge + dt);
                // The warning must still be live when charging completes.
                if (c.holdCharge >= CONFIG.eelHold && c.phaseTimer >= dt) {
                    this.repelChallenge(c);
                    this.state.prizeEffects.flash = 1.5;
                    this.emit('flash', 'Charge released. The eel is retreating.', { creature: true });
                    return;
                }
            } else c.holdCharge = 0;
            c.phaseTimer = Math.max(0, c.phaseTimer - dt);
            if (c.phase === 'recover' && c.phaseTimer === 0) {
                c.phase = 'stalk'; c.phaseTimer = CONFIG.encounterRest;
            } else if (['drift', 'forage', 'stalk'].includes(c.phase) && c.phaseTimer === 0 && this.state.fish.length) {
                const prey = (c.kind === 'crab' && this.nearestResident(c.pos, this.state.bounds.floor + 3)) || this.nearestResident(c.pos);
                c.targetId = prey.id; c.targetPoint = [...prey.pos];
                c.phase = 'windup';
                c.phaseTimer = c.kind === 'eel' ? CONFIG.eelWarning : CONFIG.encounterWarning;
                this.emit('challenge', `${c.name} is preparing to attack.`, { creature: true });
            } else if (c.phase === 'windup' && c.phaseTimer === 0) {
                if (c.kind === 'crab') {
                    c.targetPoint ||= [...(this.nearestResident(c.pos)?.pos || c.pos)];
                    c.phase = 'dash'; c.phaseTimer = CONFIG.crabDash;
                } else {
                    this.releaseCreatureAttack(c);
                    if (c.kind !== 'eel') c.cooldown = CONFIG.visitorKillCooldown;
                    c.phase = c.kind === 'eel' ? 'dash' : 'recover';
                    c.phaseTimer = c.kind === 'eel' ? CONFIG.eelDash : CONFIG.encounterRest;
                }
                this.endCreatureHold();
            } else if (c.phase === 'dash' && c.phaseTimer === 0) {
                if (c.kind === 'crab') {
                    this.releaseCreatureAttack(c);
                }
                c.phase = 'recover'; c.phaseTimer = CONFIG.encounterRest;
                c.targetId = null; c.targetPoint = null;
            }
        }
        releaseCreatureAttack(c) {
            if (c.kind === 'crab') {
                if (c.cooldown === 0) this.catchResident(c);
                this.state.dirt += CONFIG.crabDirt;
                this.state.tankHealth = this.waterHealth();
                this.emit('attack', `${c.name} snapped its claws and stirred up sand. Water quality is falling.`, { creature: true });
                return;
            }
            const kind = c.kind === 'eel' ? 'shock' : c.kind === 'jellyfish' ? 'stingers' : 'ink';
            const attack = { kind, age: 0, life: kind === 'shock' ? CONFIG.shockLife : kind === 'ink' ? CONFIG.inkLife : CONFIG.stingerLife,
                pos: [...c.pos], nodes: [], hitIds: [], lostBefore: this.state.stats.lost };
            if (kind === 'stingers') {
                for (let i = 0; i < 7; i++) {
                    const angle = i * Math.PI * 2 / 7;
                    attack.nodes.push([c.pos[0] + Math.cos(angle) * 0.65, c.pos[1] - 0.25, c.pos[2] + Math.sin(angle) * 0.65]);
                }
            } else if (kind === 'ink') {
                this.state.damage = clamp(this.state.damage + this.range(15, 20), 0, 100);
                this.state.tankHealth = this.waterHealth();
            }
            this.state.attacks.push(attack);
            if (this.state.attacks.length > 4) this.state.attacks.shift();
            if (kind === 'shock') this.emit('attack', `${c.name} discharged an electric pulse!`, { creature: true });
            else this.award(-CONFIG.penalties[kind], kind === 'stingers'
                ? 'Stinging tentacles drift through the water!' : 'An ink cloud! Your water needs extra care.', 'attack');
        }
        catchResident(c) {
            if (c.kind !== 'crab' || c.defended || c.cooldown > 0) return;
            const scale = this.theme.visitors[c.index].size * 0.55;
            const reach = [scale * 1.2, scale * 0.55, scale * 1.25];
            const center = c.pos.map((n, i) => n + (i === 1 ? scale * 0.1 : 0));
            const prey = this.state.fish.find(f => rockDistance(f.pos, { pos: center, radius: reach }, fishScale(f) * 0.5) <= 1
                && !this.sheltered(c.pos, f.pos));
            if (!prey) return;
            this.kill(prey, 'predator');
            c.eaten++;
            c.cooldown = CONFIG.visitorKillCooldown;
        }
        navigateCreature(c, step, dt) {
            const ground = c.kind === 'crab', b = this.state.bounds;
            const leap = ground && c.phase === 'dash' && !c.defended
                ? Math.sin(Math.PI * clamp(1 - c.phaseTimer / CONFIG.crabDash, 0, 1)) *
                    clamp((c.targetPoint?.[1] ?? b.floor) - this.floorAt(c.pos[0], c.pos[2]) - 0.42, 0, 2.4) : 0;
            const front = b.depth + ((ground || !c.entered || c.defended) ? 2.5 : 0);
            const scale = this.theme.visitors[c.index].size * 0.55;
            const padding = creaturePadding(c.kind, this.theme.visitors[c.index].size);
            this.steerHabitat(c.pos, step, ground ? padding : scale * 1.2, ground);
            if (ground) step[1] = 0;
            const speed = Math.hypot(...step);
            const speedLimit = c.defended ? 2.1 : c.phase === 'dash' ? (ground ? CONFIG.crabSpeed : CONFIG.eelSpeed) : 1.2;
            if (speed > speedLimit) for (let i = 0; i < 3; i++) step[i] *= speedLimit / speed;
            const yaw = Math.hypot(step[0], step[2]) > 0.01 ? Math.atan2(-step[2], step[0]) : c.yaw;
            const difference = Math.atan2(Math.sin(yaw - c.yaw), Math.cos(yaw - c.yaw));
            const turn = ground ? difference : clamp(difference, -1.7 * dt, 1.7 * dt);
            const startYaw = c.yaw;
            if (!ground) {
                const horizontal = Math.hypot(step[0], step[2]);
                step[0] = Math.cos(startYaw + turn) * horizontal;
                step[2] = -Math.sin(startYaw + turn) * horizontal;
            }
            const pieces = Math.max(1, Math.ceil(Math.hypot(...step) * dt / 0.08),
                ground ? Math.ceil(Math.abs(this.floorAt(c.pos[0] + step[0] * dt, c.pos[2] + step[2] * dt) + 0.42 + leap - c.pos[1]) / 0.08) : 1,
                ground ? 1 : Math.ceil(Math.abs(turn) * 2.1 * scale / 0.08));
            const clearAt = (pos, yaw) => {
                if (pos[1] > b.surface - 0.9 || pos[2] < -b.depth || pos[2] > front) return false;
                for (let sample = 0; sample < (ground ? 1 : 8); sample++) {
                    const offset = ground ? 0 : (1.05 - sample * 3.15 / 7) * scale;
                    const point = [pos[0] + Math.cos(yaw) * offset, pos[1], pos[2] - Math.sin(yaw) * offset];
                    if (point[1] < (ground ? this.floorAt(point[0], point[2]) + 0.4 : this.bottomClearance(point, padding)) ||
                        !this.habitat.obstacles.every(obstacle => rockDistance(point, obstacle, padding) >= 1)) return false;
                }
                return true;
            };
            if (!clearAt(c.pos, c.yaw)) this.clearCreatureOverlaps();
            for (let part = 0; part < pieces; part++) {
                const sampleYaw = startYaw + turn * (part + 1) / pieces;
                const candidate = c.pos.map((n, i) => n + step[i] * dt / pieces);
                candidate[1] = ground ? this.floorAt(candidate[0], candidate[2]) + 0.42 + leap
                    : clamp(candidate[1], this.bottomClearance(candidate, padding) + 0.04, b.surface - 0.9);
                candidate[2] = clamp(candidate[2], -b.depth, front);
                if (ground) this.resolveHabitat(candidate, padding, leap === 0, true);
                else {
                    // Resolve the whole head-to-tail capsule at each swept movement/turn sample.
                    for (let pass = 0; pass < 6; pass++) {
                        let moved = false;
                        for (let sample = 0; sample < 8; sample++) {
                            const offset = (1.05 - sample * 3.15 / 7) * scale;
                            const point = [candidate[0] + Math.cos(sampleYaw) * offset, candidate[1], candidate[2] - Math.sin(sampleYaw) * offset];
                            const before = [...point];
                            this.resolveHabitat(point, padding, false, true);
                            for (let i = 0; i < 3; i++) {
                                const change = point[i] - before[i];
                                candidate[i] += change;
                                moved ||= Math.abs(change) > 0.00001;
                            }
                        }
                        if (!moved) break;
                    }
                }
                candidate[1] = ground ? this.floorAt(candidate[0], candidate[2]) + 0.42 + leap
                    : clamp(candidate[1], this.bottomClearance(candidate, padding) + 0.04, b.surface - 0.9);
                candidate[2] = clamp(candidate[2], -b.depth, front);
                if (!clearAt(candidate, sampleYaw) || !ground && speed > 0.01 && distanceSquared(candidate, c.pos) < 1e-10) {
                    if (ground || speed < 0.01) break;
                    // A long eel can translate out of a tight turn without rotating its tail through a solid.
                    const travel = Math.min(0.08, speed * dt / pieces);
                    const alternatives = [[0, travel, 0],
                        [-Math.cos(c.yaw) * travel, 0, Math.sin(c.yaw) * travel],
                        [0, 0, -Math.sign(c.pos[2]) * travel],
                        [travel, 0, 0], [-travel, 0, 0], [0, 0, travel], [0, 0, -travel], [0, -travel, 0]];
                    const escape = alternatives.map(delta => c.pos.map((n, i) => n + delta[i]))
                        .find(pos => pos[1] >= b.floor + 0.7 && pos[1] <= b.surface - 0.9 &&
                            pos[2] >= -b.depth && pos[2] <= front &&
                            (!c.entered || c.defended || Math.abs(pos[0]) <= b.width - 0.3) && clearAt(pos, c.yaw));
                    if (!escape) break;
                    c.pos = escape;
                    continue;
                }
                c.pos = candidate;
                c.yaw = Math.atan2(Math.sin(sampleYaw), Math.cos(sampleYaw));
            }
        }
        moveCrab(c, step, dt, fullyInside) {
            const s = this.state;
            step[1] = 0; step[2] = 0;
            if (!c.entered || c.defended) return;
            if (c.flee > 0) { step[0] = c.lastLure * 0.7; return; }
            if (c.phase === 'dash') {
                const prey = s.fish.find(f => f.id === c.targetId);
                if (prey) c.targetPoint = prey.pos.map((n, i) => n + prey.vel[i] * 0.2);
                const dx = c.targetPoint[0] - c.pos[0], dz = c.targetPoint[2] - c.pos[2];
                const length = Math.hypot(dx, dz);
                const speed = Math.min(CONFIG.crabSpeed, length / dt);
                step[0] = length ? dx / length * speed : 0;
                step[2] = length ? dz / length * speed : 0;
                return;
            }
            if (c.phase === 'windup') { step[0] = 0; return; }
            let food = null, nearest = Infinity;
            for (const f of s.food) {
                const d = distance(f.pos, c.pos);
                if (f.pos[1] < this.floorAt(f.pos[0], f.pos[2]) + 1.4 && d < nearest) { nearest = d; food = f; }
            }
            if (food) {
                const toward = normalize([food.pos[0] - c.pos[0], 0, food.pos[2] - c.pos[2]]);
                step[0] = toward[0] * 0.65; step[2] = toward[2] * 0.65;
                if (distance(c.pos, food.pos) < 0.7) {
                    s.food.splice(s.food.indexOf(food), 1);
                    s.dirt += 1.5;
                    this.emit('warning', `${c.name} stole a flake and stirred up the sand. Distract its claws.`);
                }
            } else {
                const prey = this.nearestResident(c.pos, s.bounds.floor + 3) || this.nearestResident(c.pos);
                const toward = prey ? normalize([prey.pos[0] - c.pos[0], 0, prey.pos[2] - c.pos[2]]) : [0, 0, 0];
                step[0] = toward[0] * 1.2;
                step[2] = toward[2] * 1.2;
            }
        }
        moveEel(c, step, dt, fullyInside) {
            const s = this.state;
            if (c.defended) return;
            if (!fullyInside && !c.entered) { step[1] = 0; return; }
            if (c.phase === 'stalk' || c.phase === 'recover') {
                const prey = this.nearestResident(c.pos);
                const toward = prey ? normalize(prey.pos.map((n, i) => n - c.pos[i])) : [0, 0, 0];
                for (let i = 0; i < 3; i++) step[i] = toward[i] * 1.1;
            } else if (c.phase === 'windup') {
                step[0] = 0; step[1] = 0; step[2] = 0;
            } else if (c.phase === 'dash') {
                const prey = s.fish.find(f => f.id === c.targetId);
                if (prey) c.targetPoint = this.constrain(prey.pos.map((n, i) => n + prey.vel[i] * 0.2));
                const direction = normalize(c.targetPoint.map((n, i) => n - c.pos[i]));
                for (let i = 0; i < 3; i++) step[i] = direction[i] * CONFIG.eelSpeed;
            }
        }
        updateAttacks(dt) {
            const s = this.state;
            for (const attack of s.attacks) {
                attack.age += dt;
                if (attack.age >= attack.life) {
                    if (attack.kind !== 'shock' && s.stats.lost === attack.lostBefore && s.fish.length > 0) {
                        this.award(CONFIG.bonuses[attack.kind], attack.kind === 'ink' ? 'Ink Cloud Survivor' : 'Stinger Survivor');
                        this.unlock(attack.kind === 'ink' ? 'ink-survivor' : 'stinger-dodge');
                        s.stats.attacksSurvived++;
                        if (s.stats.attacksSurvived >= 3 && s.stats.lost === 0) this.unlock('danger-zone');
                    }
                    continue;
                }
                const blobs = attack.kind === 'ink' ? inkBlobs(attack) : [];
                if (attack.kind === 'stingers') {
                    attack.nodes.forEach((pos, i) => {
                        pos[1] -= dt * 0.26;
                        pos[0] += Math.sin(attack.age + i) * dt * 0.1;
                    });
                }
                for (const f of [...s.fish]) {
                    const hit = attack.kind === 'shock'
                        ? distanceSquared(f.pos, attack.pos) < (electricRadius(attack) + fishScale(f) * 0.5) ** 2
                        : attack.kind === 'ink'
                        ? blobs.some(blob => rockDistance(f.pos, blob, fishScale(f) * 0.5) <= 1)
                        : attack.nodes.some(pos => {
                            const dy = f.pos[1] - clamp(f.pos[1], pos[1], pos[1] + CONFIG.stingerLength);
                            return (f.pos[0] - pos[0]) ** 2 + dy * dy + (f.pos[2] - pos[2]) ** 2 <
                                (CONFIG.stingerRadius + fishScale(f) * 0.5) ** 2;
                        });
                    if (!hit) continue;
                    if (attack.kind === 'shock') {
                        if (!attack.hitIds.includes(f.id)) attack.hitIds.push(f.id);
                        this.kill(f, 'attack');
                    } else this.kill(f, 'attack');
                }
            }
            s.attacks = s.attacks.filter(a => a.age < a.life);
        }
        reproduce(dt) {
            const s = this.state;
            const cap = s.auto ? Math.min(CONFIG.autoCap, s.maxFish) : s.maxFish;
            s.reproduction = s.reproduction.map(n => Math.max(0, n - dt));
            for (let type = 0; type < 4; type++) {
                if (s.fish.length >= cap || s.reproduction[type] > 0 || s.tankHealth <= 50) continue;
                const adults = s.fish.filter(f => f.type === type && f.growth === 1 && f.hunger >= 50 && f.health >= 60);
                if (adults.length < 2) continue;
                const hunger = adults.reduce((n, f) => n + f.hunger, 0) / adults.length;
                const health = adults.reduce((n, f) => n + f.health, 0) / adults.length;
                const room = (cap - s.fish.length) / cap;
                if (hunger > 65 && health > 70 && this.random() < 1 - Math.pow(1 - CONFIG.birthChancePerSecond * room * room, dt)) {
                    const parent = this.pick(adults);
                    this.addFish(type, true, parent.pos.map(n => n + this.range(-0.3, 0.3)));
                    s.stats.born++;
                    this.profile.stats.born++;
                    this.award(CONFIG.bonuses.birth, `A baby ${this.theme.fish[type].name}!`, 'birth');
                    s.reproduction = s.reproduction.map(() => this.range(...CONFIG.birthCooldown) * (1 + (1 - room) * 2));
                    if (s.stats.born >= 3) this.unlock('baby-boom');
                }
            }
        }
        autoCare(dt) {
            const s = this.state;
            const t = s.timers;
            t.autoFeed -= dt; t.autoClean -= dt; t.autoBuy -= dt;
            if (t.autoFeed <= 0) {
                t.autoFeed = 3;
                if (s.fish.some(f => f.hunger < 50) && s.score >= CONFIG.feedCost && s.food.length < CONFIG.foodLimit - 8) this.feed(null, true);
            }
            if (t.autoClean <= 0) {
                t.autoClean = 5;
                if (s.tankHealth < 60 && s.score >= CONFIG.cleanCost) this.clean();
            }
            if (t.autoBuy <= 0) {
                t.autoBuy = 8;
                if (s.fish.length < CONFIG.autoTarget && s.fish.length < CONFIG.autoCap) {
                    const affordable = this.theme.fish.map((f, i) => ({ ...f, index: i })).filter(f => f.cost <= s.score);
                    if (affordable.length) this.buy(this.pick(affordable).index);
                }
            }
        }
        checkAchievements() {
            const s = this.state;
            if (this.demo) return;
            if (new Set(s.fish.map(f => f.type)).size === 4) this.unlock('full-spectrum');
            if (s.fish.some(f => f.schooling)) this.unlock('schooling');
            if (s.score >= 1000) this.unlock('thousandaire');
            if (s.score >= 5000) this.unlock('high-roller');
            if (s.score >= 10000) this.unlock('ten-thousandaire');
            if (s.score >= 1000 && s.elapsed < 180) this.unlock('speed-run');
            if (s.fish.length >= 15) this.unlock('fish-whisperer');
            if (s.elapsed >= 600) this.unlock('night-owl');
            if (s.multiplier === 3) this.unlock('streak-master');
            if (this.profile.themesPlayed.length === 5) this.unlock('zen-master');
            if (s.tankHealth < 20) s.tankWasLow = true;
            if (s.tankWasLow && s.tankHealth > 80) { this.unlock('survivor'); s.tankWasLow = false; }
            this.profile.highScore = Math.max(this.profile.highScore, Math.floor(s.score));
            this.profile.stats.peak = Math.max(this.profile.stats.peak, s.fish.length);
            this.checkPrizes();
        }
        progression(dt) {
            const s = this.state;
            const t = s.timers;
            const allHealthy = s.fish.length > 0 && s.fish.every(f => f.health > 80);
            if (allHealthy) {
                s.streak += dt;
                s.multiplier = Math.max(s.multiplier, s.streak >= 180 ? 3 : s.streak >= 90 ? 2 : s.streak >= 30 ? 1.5 : 1);
            } else {
                s.streak = 0;
                if (!s.fish.length || s.fish.some(f => f.health < 50)) s.multiplier = 1;
            }
            s.score += s.fish.filter(f => f.health > 50 && f.growth === 1).length * CONFIG.scoreRate * dt * s.multiplier;
            const diverse = new Set(s.fish.map(f => f.type)).size === 4;
            t.perfect = s.fish.length >= 5 && s.fish.every(f => f.health > 90) ? t.perfect + dt : 0;
            t.diversity = diverse ? t.diversity + dt : 0;
            t.neglect = s.tankHealth < 25 ? t.neglect + dt : 0;
            if (t.perfect >= 60) { t.perfect -= 60; this.award(CONFIG.bonuses.perfect, 'Perfect Tank'); }
            if (t.diversity >= 45) { t.diversity -= 45; this.award(CONFIG.bonuses.diversity, 'Biodiversity'); }
            if (t.neglect >= 30) { t.neglect -= 30; this.award(-CONFIG.penalties.neglect, 'Your water needs care.', 'warning'); }
            s.thriving = diverse && s.fish.length >= 15 ? (s.thriving || 0) + dt : 0;
            this.checkAchievements();
            if (!s.pending && !s.milestone) {
                const milestone = MILESTONES.find(m => !s.milestones.includes(m.id) && (m.score === null ? s.thriving >= 180 : s.score >= m.score));
                if (milestone) s.pending = { id: milestone.id, remaining: 1 };
            }
            if (s.pending) {
                s.pending.remaining -= dt;
                if (s.pending.remaining <= 0) {
                    s.milestone = s.pending.id;
                    s.milestones.push(s.milestone);
                    s.pending = null;
                    const rank = MILESTONES.findIndex(m => m.id === s.milestone);
                    if (rank > MILESTONES.findIndex(m => m.id === this.profile.bestMilestone)) this.profile.bestMilestone = s.milestone;
                    this.emit('milestone', MILESTONES[rank].name);
                }
            }
        }
        update(dt) {
            if (!Number.isFinite(dt) || dt < 0 || dt > 0.101) throw new Error('Simulation steps must be between zero and 0.1 seconds.');
            const s = this.state;
            if (s.paused || s.ended || dt === 0) return;
            s.elapsed += dt;
            s.bubbles.forEach(bubble => {
                bubble.age += dt;
                bubble.pos[1] += dt * 0.65;
            });
            s.bubbles = s.bubbles.filter(bubble => bubble.age < 2.4 && bubble.pos[1] < s.bounds.surface);
            if (!this.demo) {
                s.dirt += CONFIG.dirtRate * dt;
                s.tankHealth = this.waterHealth();
                if (s.tankHealth <= 0) { this.finish('defeat', 'The water became uninhabitable.'); return; }
            }
            for (const item of s.food) {
                item.age += dt;
                item.pos[1] = Math.max(this.floorAt(item.pos[0], item.pos[2]) + 0.1, item.pos[1] - item.speed * dt);
                const settled = item.pos[1] <= this.floorAt(item.pos[0], item.pos[2]) + 0.100001;
                const current = currentAt(item.pos, s.elapsed);
                item.pos[0] = clamp(item.pos[0] + (Math.sin(item.phase + item.age * 1.4) * 0.06 + current[0]) * dt, -s.bounds.width + 0.3, s.bounds.width - 0.3);
                item.pos[2] = clamp(item.pos[2] + current[2] * dt, -s.bounds.depth, s.bounds.depth);
                const ground = this.floorAt(item.pos[0], item.pos[2]) + 0.1;
                item.pos[1] = settled ? ground : Math.max(item.pos[1], ground);
            }
            s.food = s.food.filter(item => item.age < CONFIG.foodLifetime);
            for (const f of [...s.fish]) {
                if (s.fish.includes(f)) this.updateFish(f, dt);
            }
            s.dead.forEach(f => { f.age += dt; f.pos[1] += dt * 0.6; });
            s.dead = s.dead.filter(f => f.age < CONFIG.deathLife);
            for (const id of Object.keys(s.prizeEffects)) {
                s.prizeEffects[id] = Math.max(0, s.prizeEffects[id] - dt);
                if (s.prizeEffects[id] === 0) delete s.prizeEffects[id];
            }
            if (this.demo) return;
            this.updateCreature(dt);
            this.updateAttacks(dt);
            this.reproduce(dt);
            if (s.auto) this.autoCare(dt);
            s.stress = Math.max(0, s.stress - dt * 0.5);
            if (!s.fish.length) {
                if (s.timers.empty === 0) this.emit('warning', 'Your tank is empty. Add a fish within five seconds!');
                s.timers.empty += dt;
                if (s.timers.empty >= CONFIG.emptyGrace) { this.finish('defeat', 'Your last fish was lost.'); return; }
            } else s.timers.empty = 0;
            s.timers.hungerWarning = Math.max(0, s.timers.hungerWarning - dt);
            if (s.timers.hungerWarning === 0 && s.fish.some(f => f.hunger < 20)) {
                this.emit('warning', 'Hungry fish need you. Drop some food before they start to struggle.');
                s.timers.hungerWarning = 12;
            }
            this.progression(dt);
        }
        resume() {
            if (this.state.ended) return this.reject('This session has ended. Begin a new aquarium.');
            this.endCreatureHold();
            this.state.paused = false;
            return { ok: true };
        }
        continueMilestone() {
            if (!this.state.milestone) return this.reject('There is no milestone waiting.');
            this.endCreatureHold();
            this.state.milestone = null;
            return { ok: true };
        }
        finish(outcome = 'complete', reason = 'A little time well spent.') {
            const s = this.state;
            if (s.ended) return { ok: false, message: 'This session has already ended.' };
            if (outcome === 'victory' && !s.milestone) return this.reject('Reach a milestone before ending with a victory.');
            if (s.stats.lost === 0 && s.elapsed >= 120) this.unlock('pacifist');
            this.checkAchievements();
            s.ended = true;
            s.paused = true;
            s.outcome = outcome;
            s.reason = reason;
            this.profile.sessions++;
            this.profile.stats.longest = Math.max(this.profile.stats.longest, s.elapsed);
            this.emit('end', reason);
            return { ok: true };
        }
        snapshot() {
            const result = clone(this.state);
            // Short-lived particles are not aquarium progress and must not replay after restoring.
            delete result.bubbles;
            result.thriving ??= 0;
            return result;
        }
    }

    function validateSave(data) {
        const fail = path => { throw new Error(`Saved aquarium has an invalid ${path}.`); };
        const record = (value, path) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path);
        };
        const num = (value, min, max, path) => {
            if (!Number.isFinite(value) || value < min || value > max) fail(path);
        };
        const bool = (value, path) => { if (typeof value !== 'boolean') fail(path); };
        const list = (value, max, path) => { if (!Array.isArray(value) || value.length > max) fail(path); };
        const vector = (value, path) => {
            list(value, 3, path);
            if (value.length !== 3) fail(path);
            value.forEach(n => num(n, -10000, 10000, path));
        };
        const enumList = (value, allowed, path) => {
            list(value, allowed.length, path);
            if (new Set(value).size !== value.length || value.some(id => !allowed.includes(id))) fail(path);
        };
        const achievements = ACHIEVEMENTS.map(a => a.id);
        const milestones = MILESTONES.map(m => m.id);
        const prizeIds = PRIZES.map(p => p.id);
        record(data, 'save');
        if (data.version === 1) {
            data = clone(data);
            record(data.profile, 'profile');
            record(data.profile.stats, 'lifetime statistics');
            data.version = 2;
            data.profile.prizes = {};
            data.profile.equippedPrizes = [];
            data.profile.stats.crabsRepelled = 0;
            data.profile.stats.eelsRepelled = 0;
            if (data.session !== null) {
                record(data.session, 'session');
                data.session.prizeEffects = {};
                if (data.session.creature) Object.assign(data.session.creature, {
                    phase: 'drift', phaseTimer: 5, defenseStep: 0, lastLure: 0, decoyCooldown: 0,
                    defended: false, targetId: null, targetPoint: null
                });
            }
        }
        if (data.version === 2) {
            data = clone(data);
            data.version = 3;
            if (data.session !== null) {
                record(data.session, 'session');
                list(data.session.fish, 20, 'fish');
                data.session.activity = [];
                data.session.fish.forEach(f => {
                    record(f, 'fish');
                    Object.assign(f, { intent: 'cruise', activity: 'cruise', intentTime: 6, roll: 0 });
                });
            }
        }
        if (data.version === 3) {
            data = clone(data);
            data.version = 4;
            if (data.session !== null) {
                record(data.session, 'session');
                list(data.session.fish, 20, 'fish');
                data.session.fish.forEach(f => {
                    record(f, 'fish');
                    Object.assign(f, { visitPhase: 'approach', dwellTime: 0 });
                });
            }
        }
        if (data.version === 4) {
            data = clone(data);
            data.version = 5;
            if (data.session !== null) {
                record(data.session, 'session');
                if (data.session.creature) {
                    const c = data.session.creature;
                    record(c, 'visitor');
                    bool(c.provoked, 'visitor state'); bool(c.defended, 'visitor defense');
                    if (!['drift', 'forage', 'stalk', 'windup', 'dash', 'leaving'].includes(c.phase)) fail('visitor behavior');
                    c.holdCharge = 0;
                    if (c.kind === 'crab' && !c.entered) c.pos[2] = data.session.bounds.depth + 2;
                    // Previously departing visitors stay departing; active visitors get a fresh warning.
                    if (c.provoked || c.defended) {
                        c.defended = true; c.phase = 'leaving'; c.flee = 12;
                    } else {
                        c.phase = 'stalk'; c.phaseTimer = CONFIG.encounterRest;
                        c.flee = 0; c.targetId = null; c.targetPoint = null;
                    }
                }
                list(data.session.attacks, 4, 'hazards');
                data.session.attacks.forEach(a => { record(a, 'hazard'); a.hitIds = []; });
            }
        }
        if (data.version === 5) {
            data = clone(data);
            data.version = 6;
            if (data.session !== null) {
                record(data.session, 'session'); record(data.profile, 'profile');
                record(data.profile.prizes, 'prize collection');
                list(data.profile.equippedPrizes, CONFIG.prizeLimit, 'placed prizes');
                data.session.prizes = clone(data.profile.prizes);
                data.session.equippedPrizes = clone(data.profile.equippedPrizes);
                data.session.prizePositions = {};
                record(data.session.stats, 'session statistics');
                data.session.stats.crabsRepelled = 0; data.session.stats.eelsRepelled = 0;
                if (data.session.themeId === 'ink') {
                    list(data.session.fish, 20, 'fish');
                    const oldTraits = [['social', 'lazy'], ['curious', 'explorer'], ['playful', 'social'], ['shy', 'brave']];
                    for (const f of data.session.fish) {
                        record(f, 'fish'); record(f.traits, 'fish traits');
                        const old = oldTraits[f.type], next = THEMES.ink.fish[f.type];
                        if (!old || !next || Object.keys(f.traits).length !== 2 || old.some(t => !Object.hasOwn(f.traits, t))) fail('fish traits');
                        f.traits = Object.fromEntries(next.traits.map((t, i) => [t, f.traits[old[i]]]));
                    }
                }
            }
        }
        const priorVersion = data.version;
        const upgradeHabitat = priorVersion === 6 || priorVersion === 7 || priorVersion === 8;
        if (upgradeHabitat) { data = clone(data); data.version = VERSION; }
        if (data.version !== VERSION) throw new Error('This saved aquarium uses a different version. It has not been changed.');
        record(data.profile, 'profile');
        const p = data.profile;
        num(p.highScore, 0, 1e12, 'best score');
        num(p.sessions, 0, 1e9, 'session count');
        if (p.bestMilestone !== null && !milestones.includes(p.bestMilestone)) fail('best milestone');
        enumList(p.themesPlayed, Object.keys(THEMES), 'themes');
        record(p.achievements, 'achievements');
        if (Object.keys(p.achievements).some(id => !achievements.includes(id) || !/^\d{4}-\d{2}-\d{2}$/.test(p.achievements[id]))) fail('achievement dates');
        record(p.stats, 'lifetime statistics');
        Object.keys(createProfile().stats).forEach(key => num(p.stats[key], 0, 1e12, key));
        record(p.prizes, 'prize collection');
        if (Object.keys(p.prizes).some(id => !prizeIds.includes(id) || !/^\d{4}-\d{2}-\d{2}$/.test(p.prizes[id]))) fail('prize collection');
        enumList(p.equippedPrizes, prizeIds, 'placed prizes');
        if (p.equippedPrizes.length > CONFIG.prizeLimit || p.equippedPrizes.some(id => !Object.hasOwn(p.prizes, id))) fail('placed prizes');
        record(data.settings, 'settings');
        const settings = data.settings;
        bool(settings.sound, 'sound setting'); bool(settings.keepAwake, 'wake lock setting');
        num(settings.volume, 0, 1, 'volume');
        if (!['auto', 'high', 'balanced', 'battery'].includes(settings.quality)) fail('quality setting');
        if (!['system', 'full', 'reduced'].includes(settings.motion)) fail('motion setting');
        if (data.session === null) return data;
        const s = data.session;
        record(s, 'session');
        if (upgradeHabitat) {
            list(s.fish, 20, 'fish');
            s.fish.forEach(f => { record(f, 'fish'); Object.assign(f, { habitatRoute: [], routeStep: 0, habitatActivity: '' }); });
        }
        if (!Object.hasOwn(THEMES, s.themeId)) fail('theme');
        num(s.seed, 1, 4294967295, 'random state');
        num(s.nextId, 1, 1e9, 'fish identity counter');
        record(s.bounds, 'aquarium bounds');
        num(s.bounds.width, 3.4, 8, 'aquarium width');
        if (s.bounds.floor !== CONFIG.floor || s.bounds.surface !== CONFIG.surface || s.bounds.depth !== CONFIG.depth) fail('aquarium bounds');
        num(s.maxFish, 15, 20, 'population cap');
        num(s.score, 0, 1e12, 'score');
        num(s.tankHealth, 0, 100, 'water health');
        num(s.dirt, 0, 1e6, 'water condition'); num(s.damage, 0, 100, 'water damage');
        num(s.elapsed, 0, 1e9, 'elapsed time'); num(s.streak, 0, 1e9, 'streak');
        num(s.thriving, 0, 1e9, 'thriving timer'); num(s.stress, 0, 1e9, 'tap stress');
        num(s.spawnTimer, -1e9, 90, 'visitor timer');
        if (![1, 1.5, 2, 3].includes(s.multiplier)) fail('multiplier');
        ['auto', 'paused', 'ended', 'tankWasLow'].forEach(key => bool(s[key], key));
        if (typeof s.reason !== 'string' || s.reason.length > 300) fail('session reason');
        if (!['', 'complete', 'victory', 'defeat'].includes(s.outcome)) fail('session outcome');
        enumList(s.milestones, milestones, 'milestones');
        enumList(s.newAchievements, achievements, 'session achievements');
        if (s.milestone !== null && !s.milestones.includes(s.milestone)) fail('active milestone');
        if (s.pending !== null) {
            record(s.pending, 'pending milestone');
            if (!milestones.includes(s.pending.id)) fail('pending milestone');
            num(s.pending.remaining, 0, 1, 'milestone delay');
        }
        record(s.stats, 'session statistics');
        ['born', 'lost', 'bought', 'taps', 'peak', 'attacksSurvived', 'crabsRepelled', 'eelsRepelled'].forEach(key => num(s.stats[key], 0, 1e9, key));
        record(s.prizes, 'round prize collection');
        if (Object.keys(s.prizes).some(id => !prizeIds.includes(id) || !/^\d{4}-\d{2}-\d{2}$/.test(s.prizes[id]))) fail('round prize collection');
        enumList(s.equippedPrizes, prizeIds, 'round placed prizes');
        if (s.equippedPrizes.length > CONFIG.prizeLimit || s.equippedPrizes.some(id => !Object.hasOwn(s.prizes, id))) fail('round placed prizes');
        record(s.prizePositions, 'prize positions');
        for (const [id, pos] of Object.entries(s.prizePositions)) {
            if (!Object.hasOwn(s.prizes, id)) fail('prize position identity');
            vector(pos, 'prize position');
            const terrain = upgradeHabitat && priorVersion < 8 ? null : createTerrain(s.themeId, s.bounds, upgradeHabitat ? priorVersion : VERSION);
            const floor = terrain ? terrainHeight(terrain, pos[0], pos[2]) : s.bounds.floor;
            if (Math.abs(pos[1] - (prizePositions(s.bounds, [id])[0].pos[1] + floor - s.bounds.floor)) > 1e-7) fail('prize floor position');
            for (const part of createPrizeObstacles(s.bounds, [id], { [id]: pos })) {
                if (Math.abs(part.pos[0]) + part.radius[0] > s.bounds.width - 0.1 ||
                    Math.abs(part.pos[2]) + part.radius[2] > s.bounds.depth + 1.3) fail('prize position bounds');
                if (terrain) for (const dx of [-part.radius[0], part.radius[0]]) for (const dz of [-part.radius[2], part.radius[2]]) {
                    if (Math.abs(terrainHeight(terrain, part.pos[0] + dx, part.pos[2] + dz) - floor) > 0.12) fail('prize slope');
                }
            }
            const placedHabitat = createHabitat(s.themeId, s.bounds, s.equippedPrizes, s.prizePositions, upgradeHabitat ? priorVersion : VERSION);
            for (const part of placedHabitat.prizeObstacles) {
                if (!Object.hasOwn(s.prizePositions, part.prizeId)) continue;
                if (placedHabitat.obstacles.some(other => other.prizeId !== part.prizeId && rockDistance(part.pos, other, part.radius) < 1.03)) fail('overlapping prize position');
            }
        }
        enumList(s.stats.creaturesSeen, ['jellyfish', 'octopus', 'squid', 'crab', 'eel'], 'visitors seen');
        list(s.activity, 40, 'activity history');
        s.activity.forEach(entry => {
            record(entry, 'activity entry');
            if (typeof entry.type !== 'string' || entry.type.length > 40 || typeof entry.message !== 'string' || entry.message.length > 500) fail('activity entry');
            num(entry.time, 0, s.elapsed, 'activity time');
            if (entry.amount !== null) num(entry.amount, -1e12, 1e12, 'activity points');
        });
        record(s.prizeEffects, 'prize animations');
        if (Object.keys(s.prizeEffects).some(id => ![...prizeIds, 'flash'].includes(id))) fail('prize animations');
        Object.values(s.prizeEffects).forEach(n => num(n, 0, CONFIG.prizeInteraction, 'prize animation'));
        record(s.timers, 'timers');
        ['perfect', 'diversity', 'neglect', 'autoFeed', 'autoClean', 'autoBuy', 'empty', 'hungerWarning'].forEach(key => num(s.timers[key], -0.101, 1e9, key));
        list(s.reproduction, 4, 'reproduction timers');
        if (s.reproduction.length !== 4) fail('reproduction timers');
        s.reproduction.forEach(n => num(n, 0, Math.max(180, CONFIG.birthCooldown[1] * 3), 'reproduction timer'));
        list(s.fish, 20, 'fish');
        const ids = new Set();
        const fishShape = (f, living) => {
            record(f, 'fish');
            num(f.type, 0, 3, 'species');
            if (!Number.isInteger(f.type)) fail('species');
            vector(f.pos, 'fish position');
            num(f.yaw, -1e12, 1e12, 'fish heading');
            num(f.pitch, -4, 4, 'fish pitch');
            num(f.phase, 0, 1e12, 'fish animation');
            num(f.size, 0.1, 3, 'fish size');
            num(f.growth, 0, 1, 'fish growth');
            num(f.age, 0, 1e9, 'fish age');
            if (!living) return;
            num(f.id, 1, s.nextId - 1, 'fish identity');
            if (!Number.isInteger(f.id) || ids.has(f.id)) fail('fish identity');
            ids.add(f.id);
            vector(f.vel, 'fish velocity'); vector(f.target, 'fish destination');
            num(f.hunger, 0, 100, 'fish hunger'); num(f.health, 0, 100, 'fish health');
            num(f.retarget, -0.101, 4, 'fish direction timer');
            num(f.burst, 0, 2, 'fish dart timer'); num(f.fear, 0, 2, 'fish fear');
            bool(f.schooling, 'schooling');
            if (!['cruise', 'investigate', 'rest', 'socialize'].includes(f.intent) ||
                !['cruise', 'investigate', 'rest', 'socialize', 'forage', 'evade'].includes(f.activity)) fail('fish intention');
            num(f.intentTime, 0, 60, 'fish intention timer');
            if (!['approach', 'dwell'].includes(f.visitPhase)) fail('habitat visit phase');
            num(f.dwellTime, 0, 9, 'habitat dwell timer');
            list(f.habitatRoute, 3, 'habitat route');
            f.habitatRoute.forEach(p => vector(p, 'habitat waypoint'));
            num(f.routeStep, 0, Math.max(0, f.habitatRoute.length - 1), 'habitat route step');
            if (!Number.isInteger(f.routeStep) || !['', 'explore', 'browse', 'channel'].includes(f.habitatActivity)) fail('habitat activity');
            num(f.roll, -0.3, 0.3, 'fish bank');
            record(f.traits, 'fish traits');
            const allowed = THEMES[s.themeId].fish[f.type].traits;
            if (Object.keys(f.traits).length !== allowed.length || Object.keys(f.traits).some(key => !allowed.includes(key))) fail('fish traits');
            allowed.forEach(key => num(f.traits[key], 0.7, 1.3, 'trait intensity'));
        };
        s.fish.forEach(f => fishShape(f, true));
        list(s.dead, 20, 'departed fish'); s.dead.forEach(f => fishShape(f, false));
        list(s.food, CONFIG.foodLimit, 'food');
        s.food.forEach(f => {
            record(f, 'food'); vector(f.pos, 'food position');
            num(f.age, 0, CONFIG.foodLifetime, 'food age');
            num(f.speed, 0.21, 0.43, 'food speed'); num(f.phase, 0, 6.28, 'food animation');
        });
        if (s.creature !== null) {
            const c = s.creature;
            record(c, 'visitor');
            if (!Number.isInteger(c.index) || !THEMES[s.themeId].visitors[c.index]) fail('visitor species');
            const def = THEMES[s.themeId].visitors[c.index];
            if (c.kind !== def.kind || c.name !== def.name) fail('visitor identity');
            vector(c.pos, 'visitor position');
            if (![1, -1].includes(c.direction)) fail('visitor direction');
            num(c.age, 0, 1e9, 'visitor age'); num(c.cooldown, 0, 8, 'visitor cooldown');
            num(c.taps, 0, 3, 'visitor taps'); num(c.lastTap, -10, s.elapsed, 'visitor tap time');
            num(c.flee, 0, 12, 'visitor escape'); num(c.eaten, 0, 100, 'visitor appetite');
            num(c.yaw, -4, 4, 'visitor heading');
            bool(c.provoked, 'visitor state'); bool(c.entered, 'visitor entry');
            if (!['drift', 'forage', 'stalk', 'windup', 'dash', 'recover', 'leaving'].includes(c.phase)) fail('visitor behavior');
            num(c.phaseTimer, -0.101, 8, 'visitor behavior timer');
            num(c.defenseStep, 0, CONFIG.crabDefenses, 'crab distractions');
            if (!Number.isInteger(c.defenseStep)) fail('visitor defense progress');
            if (![-1, 0, 1].includes(c.lastLure)) fail('crab decoy');
            num(c.decoyCooldown, 0, CONFIG.decoyCooldown, 'decoy cooldown');
            num(c.holdCharge, 0, CONFIG.eelHold, 'eel hold charge');
            bool(c.defended, 'visitor defense');
            if (c.targetId !== null) num(c.targetId, 1, s.nextId - 1, 'visitor target');
            if (c.targetPoint !== null) vector(c.targetPoint, 'visitor lunge target');
            if ((c.kind === 'eel' && ['dash', 'windup'].includes(c.phase) || c.kind === 'crab' && c.phase === 'dash') && !c.targetPoint) fail('visitor lunge target');
        }
        list(s.attacks, 4, 'hazards');
        s.attacks.forEach(a => {
            record(a, 'hazard');
            if (!['stingers', 'ink', 'shock'].includes(a.kind)) fail('hazard type');
            if (a.life !== (a.kind === 'shock' ? CONFIG.shockLife : a.kind === 'ink' ? CONFIG.inkLife : CONFIG.stingerLife)) fail('hazard duration');
            num(a.age, 0, a.life, 'hazard age'); vector(a.pos, 'hazard position');
            num(a.lostBefore, 0, s.stats.lost, 'hazard survival record');
            list(a.nodes, 7, 'stingers');
            if (a.nodes.length !== (a.kind === 'stingers' ? 7 : 0)) fail('stingers');
            a.nodes.forEach(pos => vector(pos, 'stinger position'));
            list(a.hitIds, 20, 'shock victims');
            if (new Set(a.hitIds).size !== a.hitIds.length || a.kind !== 'shock' && a.hitIds.length) fail('shock victims');
            a.hitIds.forEach(id => { num(id, 1, s.nextId - 1, 'shock victim'); if (!Number.isInteger(id)) fail('shock victim'); });
        });
        if (upgradeHabitat) {
            const restored = new Game(s.themeId, p, { snapshot: s });
            for (const id of new Set([...restored.state.equippedPrizes, ...Object.keys(restored.state.prizePositions)])) {
                const current = prizePositions(s.bounds, [id], restored.state.prizePositions)[0].pos;
                const candidate = restored.prizeMoveCandidate(id, current);
                if (candidate.ok) {
                    restored.state.prizePositions[id] = candidate.pos;
                    restored.refreshPrizeObstacles();
                    continue;
                }
                const spot = restored.findPrizeSpot(id);
                if (spot) {
                    restored.state.prizePositions[id] = spot;
                    restored.emit('arrange', 'A prize moved to open sand as the habitat was refreshed.');
                } else {
                    restored.state.equippedPrizes = restored.state.equippedPrizes.filter(placed => placed !== id);
                    delete restored.state.prizePositions[id];
                    restored.emit('warning', 'A prize returned to your collection because the refreshed habitat has no open sand.');
                }
                restored.refreshPrizeObstacles();
            }
            data.session = restored.snapshot();
            data.session.paused = s.paused;
            data.session.fish.forEach(f => {
                if (!f.habitatRoute.length) f.routeStep = 0;
            });
        }
        return data;
    }

    return { VERSION, STORAGE_KEY, CONFIG, THEMES, ACHIEVEMENTS, MILESTONES, PRIZES, DEFAULT_SETTINGS,
        Game, createProfile, validateSave, boundsFor, capacity, createHabitat, currentAt, inkBlobs, rockDistance,
        clamp, distance, normalize, fishScale, fishSpacing, swimRhythm, bubblePose, fishMouth, creaturePadding, prizePositions, createPrizeObstacles, electricRadius, deathPose, clone, createTerrain, terrainHeight };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ZQ;
