'use strict';

const ZQ = (() => {
    const VERSION = 2;
    const STORAGE_KEY = 'zenquarium_zq3d_v1';
    const CONFIG = Object.freeze({
        startingScore: 100, feedCost: 5, cleanCost: 10, scoreRate: 0.5,
        hungerDecay: 1.5, starvationDamage: 3, recoveryRate: 2,
        dirtRate: 0.3, dirtyWaterDamage: 2, cleanRepair: 30,
        foodNutrition: 30, foodLifetime: 15, foodLimit: 96,
        babyGrowth: 0.02, birthChancePerSecond: 1 - Math.pow(0.98, 60),
        birthCooldown: [20, 40], firstVisitor: [30, 60], nextVisitor: [45, 90],
        visitorKillCooldown: 8, tapWindow: 5, emptyGrace: 5,
        stingerLife: 15, inkLife: 10, autoCap: 10, autoTarget: 5,
        crabDefenses: 3, decoyCooldown: 0.35, eelWarning: 2.6, eelDash: 1.2,
        eelSpeed: 4.8, prizeLimit: 3, prizeInteraction: 6,
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
            water: '#143945', surface: '#568878', sand: '#b6a078', rock: '#66766c',
            light: '#ffe6ae', plants: ['#2d5a3a', '#3a7048', '#4a8858', '#6aad78'],
            fish: [
                fish('koi-orange', 'Orange Koi', 20, 1.2, 0.7, 'standard', ['social', 'lazy'], '#e8845c', '#d4742c', '#fff5e6', 0, 0.3),
                fish('koi-white', 'White Koi', 25, 1.3, 0.6, 'standard', ['shy', 'explorer'], '#f0e6d4', '#d4c8b0', '#ffffff', 0, 0.2),
                fish('koi-red', 'Red Koi', 30, 1.1, 0.8, 'round', ['brave', 'greedy'], '#c94040', '#a03030', '#f0d0d0', 0, 0.5),
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
            water: '#07394b', surface: '#32798b', sand: '#c5b58f', rock: '#637e78',
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
            light: '#73d7ee', plants: ['#1a3040', '#284050', '#1a4858', '#305868'],
            fish: [
                fish('angler', 'Anglerfish', 30, 1.4, 0.5, 'round', ['lazy', 'greedy'], '#3a5070', '#2a3858', '#00ffcc', 6, 0.9),
                fish('barreleye', 'Barreleye', 20, 0.9, 0.4, 'slim', ['shy', 'explorer'], '#647e8b', '#395564', '#b7edb6', 6, 0.1),
                fish('lantern', 'Lanternfish', 15, 0.6, 1.1, 'slim', ['social', 'playful'], '#2878a8', '#1a5880', '#80ff80', 6, 0.3),
                fish('biolum', 'Glowfin', 25, 0.8, 0.9, 'standard', ['curious', 'explorer'], '#1a4a2a', '#0d3a1a', '#39ff14', 6, 0.4)
            ],
            visitors: [
                visitor('jellyfish', 'Crystal Jelly', '#a060e0', '#d0a0ff', 2.6),
                visitor('squid', 'Giant Squid', '#804020', '#ff5050', 2.8),
                visitor('octopus', 'Dumbo Octopus', '#e08080', '#ff80b0', 2.2)
            ],
            music: { base: 55, chord: [1, 1.189, 1.414], notes: [65, 82, 98, 110, 131], decay: 3.5, interval: 0.9 }
        },
        zen: {
            id: 'zen', name: 'Zen Garden', subtitle: 'Room to simply be',
            description: 'Sculpted stones, gentle currents, and the space between things.',
            location: 'STILLWATER SANCTUARY', sound: 'Resonant singing bowls',
            ui: { bg: '#0a0a0a', surface: '#141414', text: '#d4cec4', accent: '#d4742c' },
            water: '#202a28', surface: '#69756c', sand: '#a7a397', rock: '#666b64',
            light: '#e2dcc8', plants: ['#2a2a20', '#343428', '#3d3a28', '#4a4838'],
            fish: [
                fish('zen-gold', 'Golden Carp', 25, 1, 0.6, 'standard', ['lazy', 'social'], '#d4742c', '#b05820', '#f0d8a0', 0, 0.3),
                fish('zen-silver', 'Silver Minnow', 15, 0.6, 1.2, 'slim', ['playful', 'explorer'], '#909898', '#707878', '#c0c8c8', 4, 0.2),
                fish('zen-black', 'Ink Koi', 30, 1.2, 0.5, 'round', ['brave', 'greedy'], '#282828', '#1a1a1a', '#505050', 0, 0.6),
                fish('zen-white', 'Pearl Koi', 20, 1.1, 0.7, 'standard', ['curious', 'shy'], '#e8e0d0', '#d0c8b8', '#ffffff', 0, 0.2)
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
            water: '#e4ddcd', surface: '#f5f0e8', sand: '#d8cdb7', rock: '#a89f8b',
            light: '#fff9ea', plants: ['#3a3a3a', '#4a4a4a', '#5a5a5a', '#6a6a6a'],
            fish: [
                fish('ink-koi', 'Ink Koi', 20, 1.1, 0.7, 'standard', ['social', 'lazy'], '#e5d9c3', '#cabc9e', '#5c3a1a', 0, 0.3),
                fish('ink-angel', 'Sketch Angel', 25, 1, 0.8, 'tall', ['curious', 'explorer'], '#dce0e6', '#bac4d5', '#2a3a6a', 3, 0.5),
                fish('ink-tetra', 'Line Tetra', 15, 0.6, 1.3, 'slim', ['playful', 'social'], '#dce2d1', '#b6c6b0', '#2a5a3a', 4, 0.1),
                fish('ink-puffer', 'Doodle Puffer', 30, 0.9, 0.5, 'round', ['shy', 'brave'], '#ead8c6', '#d4b5a0', '#8a3a2a', 5, 0.4)
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
        koi: [['crab', 'Pebble Crab', '#bd7951', '#ebc290', 1.9], ['eel', 'Ribbon Eel', '#718766', '#eedcb4', 2]],
        tropical: [['crab', 'Hermit Crab', '#d48348', '#f3c772', 2], ['eel', 'Moray Eel', '#8f9952', '#dfdd90', 2.2]],
        deep: [['crab', 'Glass Crab', '#7197b5', '#9ef3ed', 2], ['eel', 'Gulper Eel', '#38516e', '#75e0ef', 2.5]],
        zen: [['crab', 'Stone Crab', '#818174', '#c7c4ab', 1.8], ['eel', 'River Eel', '#64716a', '#bbbfac', 2]],
        ink: [['crab', 'Etched Crab', '#d5c7b1', '#705b3f', 1.9], ['eel', 'Brushstroke Eel', '#c1c7c5', '#455855', 2.1]]
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
            requirement: 'Repel an eel with a well-timed flash.', goal: 1, stat: 'eelsRepelled' },
        { id: 'arch', name: 'Tidekeeper Arch', description: 'A weathered stone arch with a secret current. Tap for a bubbling celebration.',
            requirement: 'Guide a crab away with alternating decoys.', goal: 1, stat: 'crabsRepelled' }
    ];
    const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const normalize = v => {
        const length = Math.hypot(...v) || 1;
        return v.map(n => n / length);
    };
    const fishScale = f => f.size * CONFIG.fishScale * (0.3 + 0.7 * f.growth);
    const fishSpacing = (a, b) => Math.max(CONFIG.separationRadius, fishScale(a) + fishScale(b) + CONFIG.separationPadding);
    const clone = value => JSON.parse(JSON.stringify(value));
    const capacity = (width, height) => clamp(Math.round(20 * width * height / 960000), 15, 20);
    const boundsFor = (width, height) => ({
        width: clamp(width / Math.max(1, height) * 5.8, 3.4, 8),
        floor: CONFIG.floor, surface: CONFIG.surface, depth: CONFIG.depth
    });
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
                this.state.paused = true;
                return;
            }
            this.state = {
                themeId, seed: (options.seed ?? (Date.now() >>> 0)) || 1,
                bounds: boundsFor(options.width || 1200, options.height || 800),
                maxFish: capacity(options.width || 1200, options.height || 800),
                score: CONFIG.startingScore, tankHealth: 100, dirt: 0, damage: 0,
                multiplier: 1, streak: 0, elapsed: 0, auto: false, paused: false,
                ended: false, reason: '', outcome: '', fish: [], food: [], dead: [],
                creature: null, attacks: [], spawnTimer: 0, reproduction: [0, 0, 0, 0],
                timers: { perfect: 0, diversity: 0, neglect: 0, autoFeed: 0, autoClean: 0,
                    autoBuy: 0, empty: 0, hungerWarning: 0 },
                stats: { born: 0, lost: 0, bought: 0, taps: 0, peak: 2,
                    creaturesSeen: [], attacksSurvived: 0 },
                tankWasLow: false, milestones: [], pending: null, milestone: null,
                newAchievements: [], nextId: 1, stress: 0, prizeEffects: {}
            };
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
        }
        drainEvents() { return this.events.splice(0); }
        reject(message) { this.emit('warning', message); return { ok: false, message }; }
        actionable() { return !this.state.paused && !this.state.ended && !this.demo; }
        point() {
            const b = this.state.bounds;
            return [this.range(-b.width + 0.6, b.width - 0.6),
                this.range(b.floor + 1, b.surface - 0.7), this.range(-b.depth, b.depth)];
        }
        constrain(point) {
            const b = this.state.bounds;
            return [clamp(point[0], -b.width + 0.3, b.width - 0.3),
                clamp(point[1], b.floor + 0.6, b.surface - 0.45),
                clamp(point[2], -b.depth, b.depth)];
        }
        resize(width, height) {
            const old = this.state.bounds;
            this.state.bounds = boundsFor(width, height);
            this.state.maxFish = capacity(width, height);
            const scale = this.state.bounds.width / old.width;
            for (const f of this.state.fish) {
                f.pos[0] *= scale;
                f.target[0] *= scale;
                f.pos = this.constrain(f.pos);
                f.target = this.constrain(f.target);
            }
            for (const food of this.state.food) food.pos[0] *= scale;
            if (this.state.creature) this.state.creature.pos[0] *= scale;
            for (const attack of this.state.attacks) {
                attack.pos[0] *= scale;
                attack.nodes.forEach(n => { n[0] *= scale; });
            }
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
                size: def.size * this.range(0.85, 1.15), traits: {}
            };
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
            if (this.state.score < CONFIG.feedCost) return this.reject('Feeding needs 5 points. Healthy fish earn more over time.');
            if (this.state.food.length > CONFIG.foodLimit - 8) return this.reject('There is plenty of food in the water already.');
            this.state.score -= CONFIG.feedCost;
            const b = this.state.bounds;
            const center = point || [0, b.surface - 0.3, 0];
            const count = Math.floor(this.range(automatic ? 3 : 4, automatic ? 7 : 9));
            for (let i = 0; i < count; i++) {
                this.state.food.push({
                    pos: [clamp(center[0] + this.range(-0.75, 0.75), -b.width + 0.3, b.width - 0.3),
                        b.surface - this.range(0.25, 0.5),
                        clamp(center[2] + this.range(-0.6, 0.6), -b.depth, b.depth)],
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
            if (!this.actionable()) return this.reject('Resume your aquarium to guide a visitor away.');
            const c = this.state.creature;
            if (!c) return this.reject('No visitor is in the aquarium right now.');
            if (c.kind === 'crab') return this.reject('Distract alternate claws: use the left and right decoys to guide the crab away.');
            if (c.kind === 'eel') return this.defendCreature('flash');
            if (c.provoked) return this.reject('The visitor is leaving. Give it some space.');
            if (this.state.elapsed - c.lastTap > CONFIG.tapWindow) c.taps = 0;
            c.lastTap = this.state.elapsed;
            c.taps++;
            c.flee = this.range(2, 3);
            c.direction = c.pos[0] >= 0 ? 1 : -1;
            if (c.taps >= 3) {
                c.provoked = true;
                c.flee = 12;
                const kind = c.kind === 'jellyfish' ? 'stingers' : 'ink';
                const attack = {
                    kind, age: 0, life: kind === 'stingers' ? CONFIG.stingerLife : CONFIG.inkLife,
                    pos: [...c.pos], nodes: [], lostBefore: this.state.stats.lost
                };
                if (kind === 'stingers') {
                    for (let i = 0; i < 7; i++) attack.nodes.push(c.pos.map(n => n + this.range(-0.5, 0.5)));
                } else {
                    this.state.damage = clamp(this.state.damage + this.range(15, 20), 0, 100);
                    this.state.tankHealth = this.waterHealth();
                }
                this.state.attacks.push(attack);
                this.award(-CONFIG.penalties[kind], kind === 'stingers'
                    ? 'Stingers released. Keep your fish out of their path!'
                    : 'An ink cloud! Your water needs extra care.', 'attack');
            } else {
                this.emit('visitor-tap', `${c.name} is moving away. Three taps within five seconds provoke an attack.`);
            }
            return { ok: true };
        }
        defendCreature(action, side = 0) {
            if (!this.actionable()) return this.reject('Resume your aquarium to defend its residents.');
            const c = this.state.creature;
            if (!c || c.defended) return this.reject('That visitor is already leaving, or has moved on.');
            if (c.kind === 'crab' && action === 'decoy') {
                if (![1, -1].includes(side)) return this.reject('Choose the left or right decoy.');
                if (c.decoyCooldown > 0) return this.reject('Give the crab a moment to notice the decoy.');
                c.decoyCooldown = CONFIG.decoyCooldown;
                if (side === c.lastLure) {
                    c.defenseStep = 1;
                    this.emit('warning', 'The crab caught on. Alternate the other claw next.');
                } else {
                    c.defenseStep++;
                    this.emit('decoy', `Crab distracted: ${c.defenseStep} of ${CONFIG.crabDefenses}. Alternate the other claw.`);
                }
                c.lastLure = side;
                c.flee = 0.8;
                if (c.defenseStep >= CONFIG.crabDefenses) this.repelChallenge(c);
                return { ok: true };
            }
            if (c.kind === 'eel' && action === 'flash') {
                if (c.phase !== 'windup') return this.reject('Watch for the eel to coil, then flash the light before it lunges.');
                this.repelChallenge(c);
                this.state.prizeEffects.flash = 1.5;
                this.emit('flash', 'A well-timed flash! The eel is retreating.');
                return { ok: true };
            }
            return this.reject('That defense does not match this visitor.');
        }
        repelChallenge(c) {
            c.defended = true;
            c.phase = 'leaving';
            c.flee = 12;
            c.direction = c.pos[0] >= 0 ? 1 : -1;
            this.profile.stats[c.kind === 'crab' ? 'crabsRepelled' : 'eelsRepelled']++;
            this.emit('defended', `${c.name} is leaving. Your aquarium is safe for now.`);
            this.checkPrizes();
        }
        checkPrizes() {
            if (this.demo) return;
            for (const prize of PRIZES) {
                const progress = prize.stat === 'score' ? Math.max(this.profile.highScore, this.state.score) : this.profile.stats[prize.stat];
                if (progress < prize.goal || Object.hasOwn(this.profile.prizes, prize.id)) continue;
                this.profile.prizes[prize.id] = new Date().toISOString().slice(0, 10);
                if (this.profile.equippedPrizes.length < CONFIG.prizeLimit) this.profile.equippedPrizes.push(prize.id);
                this.emit('prize', `Tank prize earned: ${prize.name}. Find it in your prize collection.`, { prizeId: prize.id });
            }
        }
        equipPrize(id) {
            if (!this.actionable()) return this.reject('Resume your aquarium to arrange its prizes.');
            if (!PRIZES.some(p => p.id === id) || !Object.hasOwn(this.profile.prizes, id)) return this.reject('Earn this tank prize before placing it.');
            const placed = this.profile.equippedPrizes.indexOf(id);
            if (placed >= 0) this.profile.equippedPrizes.splice(placed, 1);
            else if (this.profile.equippedPrizes.length >= CONFIG.prizeLimit) return this.reject('Three prizes fit comfortably. Put one away before placing another.');
            else this.profile.equippedPrizes.push(id);
            this.emit('arrange', placed >= 0 ? 'Your prize is safely kept in your collection.' : 'A new detail for your little world.');
            return { ok: true };
        }
        interactPrize(id) {
            if (!this.actionable()) return this.reject('Resume your aquarium to enjoy its prizes.');
            if (!this.profile.equippedPrizes.includes(id)) return this.reject('Place that prize in your aquarium first.');
            this.state.prizeEffects[id] = CONFIG.prizeInteraction;
            this.emit('prize-play', `${PRIZES.find(p => p.id === id).name}: a small moment of wonder.`);
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
                phase: def.kind === 'eel' ? 'stalk' : def.kind === 'crab' ? 'forage' : 'drift',
                phaseTimer: this.range(5, 8), defenseStep: 0, lastLure: 0, decoyCooldown: 0,
                defended: false, targetId: null, targetPoint: null
            };
            if (def.kind === 'crab' || def.kind === 'eel') {
                this.state.creature.pos[1] = this.state.bounds.floor + (def.kind === 'crab' ? 0.42 : 0.85);
                this.state.creature.pos[2] = def.kind === 'crab' ? 0.8 : -1.2;
            }
            this.profile.stats.creatures++;
            if (!this.state.stats.creaturesSeen.includes(def.kind)) this.state.stats.creaturesSeen.push(def.kind);
            const guidance = def.kind === 'crab' ? 'Alternate left and right decoys to send it away.'
                : def.kind === 'eel' ? 'Watch for its coil, then flash the light.'
                : 'Tap once to guide it away.';
            this.award(CONFIG.bonuses.sighting, `${def.name} is visiting. ${guidance}`, 'visitor');
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
            f.age += dt;
            f.growth = Math.min(1, f.growth + CONFIG.babyGrowth * dt);
            f.fear = Math.max(0, f.fear - dt);
            f.burst = Math.max(0, f.burst - dt);
            f.retarget -= dt;
            const friends = s.fish.filter(other => other !== f && other.type === f.type && distance(f.pos, other.pos) < CONFIG.schoolRadius);
            f.schooling = friends.length >= 2;
            if (!this.demo) {
                f.hunger = Math.max(0, f.hunger - dt * (CONFIG.hungerDecay - (f.traits.social && friends.length ? 0.6 : 0)));
                if (f.hunger < 15) f.health -= CONFIG.starvationDamage * dt;
                if (f.hunger > 60) f.health = Math.min(100, f.health + CONFIG.recoveryRate * dt);
                if (s.tankHealth < 30) f.health -= CONFIG.dirtyWaterDamage * dt;
                if (f.health <= 0) { this.kill(f, f.hunger < 10 ? 'starvation' : 'health'); return; }
            }
            let target = f.target;
            let speed = def.speed * (f.traits.lazy ? 0.65 : 1);
            let school = false;
            if (f.retarget <= 0 || distance(f.pos, target) < 0.35) {
                const range = f.traits.explorer ? 5 : 2.15;
                f.target = this.constrain(f.pos.map(n => n + this.range(-range, range)));
                if (f.traits.lazy) f.target[1] = Math.min(0.5, f.target[1]);
                if (f.traits.shy && this.random() < 0.3) f.target[0] = (f.pos[0] < 0 ? -1 : 1) * (s.bounds.width - 0.8);
                f.retarget = f.traits.explorer ? this.range(0.8, 1.8) : this.range(1.5, 4);
                if (this.random() < (f.traits.playful ? 0.4 * f.traits.playful : 0.15)) f.burst = this.range(0.4, 1);
                target = f.target;
            }
            if (f.fear > 0) speed *= 6;
            else {
                if (f.burst > 0) speed *= 2.8;
                let food = null;
                if (f.hunger < 70) {
                    let nearest = f.traits.greedy ? 10 : 5.7;
                    for (const item of s.food) {
                        const d = distance(f.pos, item.pos);
                        if (d < nearest) { nearest = d; food = item; }
                    }
                }
                if (food) {
                    target = food.pos;
                    speed *= f.traits.greedy ? 3 : 2;
                    if (distance(f.pos, food.pos) < (f.traits.greedy ? 0.43 : 0.29)) {
                        f.hunger = Math.min(100, f.hunger + CONFIG.foodNutrition);
                        s.food.splice(s.food.indexOf(food), 1);
                    }
                } else if (!this.demo && f.hunger < 20 && f.size > 0.9 && f.growth === 1) {
                    const prey = s.fish.find(other => other !== f && other.size * (0.3 + 0.7 * other.growth) < f.size * 0.7 && distance(f.pos, other.pos) < 4.3);
                    if (prey) {
                        target = prey.pos;
                        speed *= 2.5;
                        if (distance(f.pos, prey.pos) < 0.25) {
                            this.kill(prey, 'predator');
                            f.hunger = Math.min(100, f.hunger + 50);
                        }
                    }
                } else if (f.traits.curious && this.cursor && distance(f.pos, this.cursor) < 2.9) {
                    target = this.cursor;
                    speed *= 0.75;
                } else if (f.schooling || (f.traits.social && friends.length)) {
                    school = true;
                }
                if (!food) {
                    const bully = s.fish.find(other => other !== f && this.theme.fish[other.type].aggression > def.aggression + 0.25 && distance(f.pos, other.pos) < 1.7);
                    if (bully) {
                        target = this.constrain(f.pos.map((n, i) => n + (n - bully.pos[i]) * (f.traits.brave ? 0.6 : 1.5)));
                        speed *= 1.4;
                        school = false;
                    }
                }
            }
            const direction = normalize(target.map((n, i) => n - f.pos[i]));
            const desired = direction.map(n => n * speed);
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
                const d = distance(f.pos, other.pos);
                const spacing = fishSpacing(f, other);
                if (d < spacing) {
                    const sign = f.id > other.id ? 1 : -1;
                    const angle = (f.id + other.id) * Math.PI * (3 - Math.sqrt(5));
                    const away = d > 0.001 ? f.pos.map((n, i) => (n - other.pos[i]) / d)
                        : normalize([Math.cos(angle) * sign, Math.sin(angle * 2) * sign, Math.sin(angle) * sign]);
                    for (let i = 0; i < 3; i++) separation[i] += away[i] * (1 - d / spacing) * CONFIG.separationStrength;
                }
            }
            const separationLimit = Math.max(1, Math.hypot(...separation) / CONFIG.separationStrength);
            const ahead = f.pos.map((n, i) => n + direction[i] * CONFIG.boundaryLookahead);
            const safe = this.constrain(ahead);
            for (let i = 0; i < 3; i++) {
                desired[i] += separation[i] / separationLimit + (safe[i] - ahead[i]) * CONFIG.boundaryStrength;
            }
            const blend = 1 - Math.exp(-3.8 * dt);
            for (let i = 0; i < 3; i++) {
                f.vel[i] += (desired[i] - f.vel[i]) * blend;
                f.pos[i] += f.vel[i] * dt;
            }
            f.pos = this.constrain(f.pos);
            const yaw = Math.atan2(-f.vel[2], f.vel[0]);
            const yawDelta = Math.atan2(Math.sin(yaw - f.yaw), Math.cos(yaw - f.yaw));
            f.yaw += yawDelta * (1 - Math.exp(-5 * dt));
            f.pitch += (Math.atan2(f.vel[1], Math.hypot(f.vel[0], f.vel[2])) * 0.7 - f.pitch) * blend;
            f.phase += dt * (4 + Math.hypot(...f.vel) * 3);
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
            const fullyInside = Math.abs(c.pos[0]) < s.bounds.width - 0.7;
            c.entered ||= fullyInside;
            const step = [c.direction * 0.48, Math.cos(c.age * 1.5) * 0.11, Math.sin(c.age * 0.4) * 0.07];
            let prey = null;
            if (c.kind === 'crab') this.moveCrab(c, step, dt, fullyInside);
            else if (c.kind === 'eel') this.moveEel(c, step, dt, fullyInside);
            else if (fullyInside && c.cooldown === 0 && c.flee === 0) {
                let nearest = c.kind === 'jellyfish' ? 0.64 : 2.86;
                for (const f of s.fish) {
                    const d = distance(f.pos, c.pos);
                    if (d < nearest) { nearest = d; prey = f; }
                }
                if (prey && c.kind !== 'jellyfish') {
                    const toward = normalize(prey.pos.map((n, i) => n - c.pos[i]));
                    for (let i = 0; i < 3; i++) step[i] = toward[i] * 0.95;
                }
                if (prey && distance(prey.pos, c.pos) < 0.64) {
                    this.kill(prey, 'predator');
                    c.eaten++;
                    c.cooldown = CONFIG.visitorKillCooldown;
                }
            }
            if (c.flee > 0 && (c.kind !== 'crab' || c.defended)) {
                step[0] = c.direction * (c.provoked ? 2.8 : 2.1);
                step[1] = c.kind === 'crab' ? 0 : 0.12;
            }
            for (let i = 0; i < 3; i++) c.pos[i] += step[i] * dt;
            c.pos[1] = clamp(c.pos[1], s.bounds.floor + (c.kind === 'crab' ? 0.42 : 0.7), s.bounds.surface - 0.9);
            c.pos[2] = clamp(c.pos[2], -s.bounds.depth, s.bounds.depth);
            c.yaw = Math.atan2(-step[2], step[0]);
            if ((c.entered || c.flee > 0 || c.age > 8) && Math.abs(c.pos[0]) > s.bounds.width + 1.7 || c.age > 100) {
                if (c.eaten === 0) this.award(CONFIG.bonuses.whisperer, 'Creature Whisperer: your visitor left peacefully.');
                s.creature = null;
                s.spawnTimer = this.range(...CONFIG.nextVisitor);
            }
        }
        moveCrab(c, step, dt, fullyInside) {
            const s = this.state;
            step[1] = 0; step[2] = 0;
            if (!fullyInside || c.defended) return;
            if (c.flee > 0) { step[0] = c.lastLure * 0.7; return; }
            let food = null, nearest = Infinity;
            for (const f of s.food) {
                const d = distance(f.pos, c.pos);
                if (f.pos[1] < s.bounds.floor + 1.4 && d < nearest) { nearest = d; food = f; }
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
                step[0] = Math.sin(c.age * 0.5) * 0.45;
                step[2] = Math.cos(c.age * 0.4) * 0.17;
            }
            const prey = s.fish.find(f => distance(f.pos, c.pos) < 0.64);
            if (prey && c.cooldown === 0) {
                this.kill(prey, 'predator'); c.eaten++; c.cooldown = CONFIG.visitorKillCooldown;
            }
        }
        moveEel(c, step, dt, fullyInside) {
            const s = this.state;
            if (c.defended) return;
            if (!fullyInside && !c.entered) { step[1] = 0; return; }
            c.phaseTimer = Math.max(0, c.phaseTimer - dt);
            if (c.phase === 'stalk') {
                step[0] = Math.sin(c.age * 0.6) * 0.23;
                step[1] = (s.bounds.floor + 0.85 - c.pos[1]) * 0.7;
                if (c.phaseTimer <= 0 && s.fish.length) {
                    const prey = s.fish.reduce((nearest, fish) => distance(fish.pos, c.pos) < distance(nearest.pos, c.pos) ? fish : nearest);
                    c.targetId = prey.id; c.targetPoint = [...prey.pos];
                    c.phase = 'windup'; c.phaseTimer = CONFIG.eelWarning;
                    this.emit('challenge', `${c.name} is coiling. Flash the light now to stop its lunge!`);
                }
            } else if (c.phase === 'windup') {
                step[0] = 0; step[1] = 0; step[2] = 0;
                if (c.phaseTimer <= 0) {
                    c.phase = 'dash'; c.phaseTimer = CONFIG.eelDash;
                }
            } else if (c.phase === 'dash') {
                const direction = normalize(c.targetPoint.map((n, i) => n - c.pos[i]));
                for (let i = 0; i < 3; i++) step[i] = direction[i] * CONFIG.eelSpeed;
                const prey = s.fish.find(f => distance(f.pos, c.pos) < 0.6);
                if (prey && c.cooldown === 0 && fullyInside) {
                    this.kill(prey, 'predator'); c.eaten++; c.cooldown = CONFIG.visitorKillCooldown;
                    c.phaseTimer = 0;
                }
                if (c.phaseTimer <= 0) {
                    c.phase = 'stalk'; c.phaseTimer = this.range(5, 8);
                    c.targetId = null; c.targetPoint = null;
                }
            }
        }
        updateAttacks(dt) {
            const s = this.state;
            for (const attack of s.attacks) {
                attack.age += dt;
                if (attack.kind === 'stingers') {
                    attack.nodes.forEach((pos, i) => {
                        pos[1] -= dt * 0.26;
                        pos[0] += Math.sin(attack.age + i) * dt * 0.1;
                    });
                }
                for (const f of [...s.fish]) {
                    const hit = attack.kind === 'ink'
                        ? distance(f.pos, attack.pos) < Math.min(1.65, 0.3 + attack.age * 0.35) * Math.min(1, (attack.life - attack.age) / 2)
                        : attack.nodes.some(pos => distance(f.pos, pos) < 0.2);
                    if (hit) this.kill(f, 'attack');
                }
                if (attack.age >= attack.life && s.stats.lost === attack.lostBefore && s.fish.length > 0) {
                    this.award(CONFIG.bonuses[attack.kind], attack.kind === 'ink' ? 'Ink Cloud Survivor' : 'Stinger Survivor');
                    this.unlock(attack.kind === 'ink' ? 'ink-survivor' : 'stinger-dodge');
                    s.stats.attacksSurvived++;
                    if (s.stats.attacksSurvived >= 3 && s.stats.lost === 0) this.unlock('danger-zone');
                }
            }
            s.attacks = s.attacks.filter(a => a.age < a.life);
        }
        reproduce(dt) {
            const s = this.state;
            const cap = s.auto ? Math.min(CONFIG.autoCap, s.maxFish) : s.maxFish;
            for (let type = 0; type < 4; type++) {
                s.reproduction[type] = Math.max(0, s.reproduction[type] - dt);
                if (s.fish.length >= cap || s.reproduction[type] > 0 || s.tankHealth <= 50) continue;
                const adults = s.fish.filter(f => f.type === type && f.growth === 1 && f.hunger >= 50 && f.health >= 60);
                if (adults.length < 2) continue;
                const hunger = adults.reduce((n, f) => n + f.hunger, 0) / adults.length;
                const health = adults.reduce((n, f) => n + f.health, 0) / adults.length;
                if (hunger > 65 && health > 70 && this.random() < 1 - Math.pow(1 - CONFIG.birthChancePerSecond, dt)) {
                    const parent = this.pick(adults);
                    this.addFish(type, true, parent.pos.map(n => n + this.range(-0.3, 0.3)));
                    s.stats.born++;
                    this.profile.stats.born++;
                    this.award(CONFIG.bonuses.birth, `A baby ${this.theme.fish[type].name}!`, 'birth');
                    s.reproduction[type] = this.range(...CONFIG.birthCooldown);
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
                    s.paused = true;
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
            if (!this.demo) {
                s.dirt += CONFIG.dirtRate * dt;
                s.tankHealth = this.waterHealth();
                if (s.tankHealth <= 0) { this.finish('defeat', 'The water became uninhabitable.'); return; }
            }
            for (const item of s.food) {
                item.age += dt;
                item.pos[1] = Math.max(s.bounds.floor + 0.1, item.pos[1] - item.speed * dt);
                item.pos[0] += Math.sin(item.phase + item.age * 1.4) * dt * 0.06;
            }
            s.food = s.food.filter(item => item.age < CONFIG.foodLifetime);
            for (const f of [...s.fish]) {
                if (s.fish.includes(f)) this.updateFish(f, dt);
            }
            s.dead.forEach(f => { f.age += dt; f.pos[1] += dt * 0.6; });
            s.dead = s.dead.filter(f => f.age < 1.5);
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
            if (this.state.milestone) return this.reject('Choose whether to continue at your milestone.');
            this.state.paused = false;
            return { ok: true };
        }
        continueMilestone() {
            if (!this.state.milestone) return this.reject('There is no milestone waiting.');
            this.state.milestone = null;
            this.state.paused = false;
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
            data.version = VERSION;
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
        ['born', 'lost', 'bought', 'taps', 'peak', 'attacksSurvived'].forEach(key => num(s.stats[key], 0, 1e9, key));
        enumList(s.stats.creaturesSeen, ['jellyfish', 'octopus', 'squid', 'crab', 'eel'], 'visitors seen');
        record(s.prizeEffects, 'prize animations');
        if (Object.keys(s.prizeEffects).some(id => ![...prizeIds, 'flash'].includes(id))) fail('prize animations');
        Object.values(s.prizeEffects).forEach(n => num(n, 0, CONFIG.prizeInteraction, 'prize animation'));
        record(s.timers, 'timers');
        ['perfect', 'diversity', 'neglect', 'autoFeed', 'autoClean', 'autoBuy', 'empty', 'hungerWarning'].forEach(key => num(s.timers[key], -0.101, 1e9, key));
        list(s.reproduction, 4, 'reproduction timers');
        if (s.reproduction.length !== 4) fail('reproduction timers');
        s.reproduction.forEach(n => num(n, 0, 40, 'reproduction timer'));
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
            num(c.age, 0, 101, 'visitor age'); num(c.cooldown, 0, 8, 'visitor cooldown');
            num(c.taps, 0, 3, 'visitor taps'); num(c.lastTap, -10, s.elapsed, 'visitor tap time');
            num(c.flee, 0, 12, 'visitor escape'); num(c.eaten, 0, 100, 'visitor appetite');
            num(c.yaw, -4, 4, 'visitor heading');
            bool(c.provoked, 'visitor state'); bool(c.entered, 'visitor entry');
            if (!['drift', 'forage', 'stalk', 'windup', 'dash', 'leaving'].includes(c.phase)) fail('visitor behavior');
            num(c.phaseTimer, -0.101, 8, 'visitor behavior timer');
            num(c.defenseStep, 0, CONFIG.crabDefenses, 'crab distractions');
            if (![-1, 0, 1].includes(c.lastLure)) fail('crab decoy');
            num(c.decoyCooldown, 0, CONFIG.decoyCooldown, 'decoy cooldown');
            bool(c.defended, 'visitor defense');
            if (c.targetId !== null) num(c.targetId, 1, s.nextId - 1, 'visitor target');
            if (c.targetPoint !== null) vector(c.targetPoint, 'visitor lunge target');
            if (c.phase === 'dash' && !c.targetPoint) fail('visitor lunge target');
        }
        list(s.attacks, 4, 'hazards');
        s.attacks.forEach(a => {
            record(a, 'hazard');
            if (!['stingers', 'ink'].includes(a.kind)) fail('hazard type');
            if (a.life !== (a.kind === 'ink' ? CONFIG.inkLife : CONFIG.stingerLife)) fail('hazard duration');
            num(a.age, 0, a.life, 'hazard age'); vector(a.pos, 'hazard position');
            num(a.lostBefore, 0, s.stats.lost, 'hazard survival record');
            list(a.nodes, 7, 'stingers');
            if (a.nodes.length !== (a.kind === 'ink' ? 0 : 7)) fail('stingers');
            a.nodes.forEach(pos => vector(pos, 'stinger position'));
        });
        return data;
    }

    return { VERSION, STORAGE_KEY, CONFIG, THEMES, ACHIEVEMENTS, MILESTONES, PRIZES, DEFAULT_SETTINGS,
        Game, createProfile, validateSave, boundsFor, capacity, clamp, distance, normalize, fishScale, fishSpacing, clone };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ZQ;
