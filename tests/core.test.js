'use strict';

(() => {
    const core = typeof ZQ !== 'undefined' ? ZQ : require('../core.js');
    const results = [];
    const assert = (condition, message = 'Assertion failed') => { if (!condition) throw new Error(message); };
    const equal = (actual, expected) => assert(JSON.stringify(actual) === JSON.stringify(expected), `Expected ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`);
    const near = (actual, expected, epsilon = 1e-7) => assert(Math.abs(actual - expected) <= epsilon, `Expected ${expected}; received ${actual}`);
    const throws = fn => { let threw = false; try { fn(); } catch { threw = true; } assert(threw, 'Expected invalid input to throw'); };
    const test = (name, fn) => {
        try { fn(); results.push({ name, passed: true }); }
        catch (error) { results.push({ name, passed: false, error: error.message }); }
    };
    const established = () => {
        const profile = core.createProfile();
        for (const a of core.ACHIEVEMENTS) profile.achievements[a.id] = '2026-01-01';
        return profile;
    };
    const make = (theme = 'tropical', profile = established()) => new core.Game(theme, profile, { seed: 12345, width: 1200, height: 800 });
    const envelope = game => ({ version: core.VERSION, profile: game.profile, settings: { ...core.DEFAULT_SETTINGS }, session: game.snapshot() });
    const steps = (game, seconds, dt = 1 / 60) => {
        for (let i = 0; i < Math.round(seconds / dt); i++) game.update(dt);
    };
    const spawn = (game, kind) => {
        const original = game.random;
        const index = game.theme.visitors.findIndex(v => v.kind === kind);
        assert(index >= 0, 'Missing challenge variant');
        game.random = () => (index + 0.1) / game.theme.visitors.length;
        game.spawnCreature();
        game.random = original;
        return game.state.creature;
    };

    test('Five worlds preserve four species, existing prices, and progression', () => {
        equal(Object.keys(core.THEMES), ['koi', 'tropical', 'deep', 'zen', 'ink']);
        equal(Object.values(core.THEMES).map(t => t.fish.map(f => f.cost)),
            [[20, 25, 30, 15], [20, 25, 30, 10], [30, 20, 15, 25], [25, 15, 30, 20], [20, 25, 15, 30]]);
        for (const theme of Object.values(core.THEMES)) {
            equal(theme.fish.length, 4);
            equal(new Set(theme.fish.map(f => f.id)).size, 4);
            assert(theme.music.notes.length >= 4 && theme.visitors.length >= 2);
        }
        equal(core.ACHIEVEMENTS.length, 20);
        equal(core.MILESTONES.length, 5);
    });
    test('Barreleye replaces only the resident jellyfish, including in existing saves', () => {
        const theme = core.THEMES.deep;
        equal(theme.fish[1].id, 'barreleye');
        equal(theme.fish[1].name, 'Barreleye');
        equal(theme.fish[1].shape, 'slim');
        equal(theme.fish[1].cost, 20);
        equal(theme.fish[1].traits, ['shy', 'explorer']);
        assert(theme.fish.every(f => f.id !== 'jelly' && f.name !== 'Jellyfish'));
        assert(theme.visitors.some(v => v.kind === 'jellyfish' && v.name === 'Crystal Jelly'));
        for (const version of [1, 2]) {
            const g = make('deep');
            g.state.fish[1].health = 83;
            g.state.fish[1].hunger = 68;
            const saved = envelope(g);
            saved.version = version;
            if (version === 1) {
                delete saved.profile.prizes; delete saved.profile.equippedPrizes;
                delete saved.profile.stats.crabsRepelled; delete saved.profile.stats.eelsRepelled;
                delete saved.session.prizeEffects;
            }
            const before = JSON.stringify(saved);
            const loaded = core.validateSave(saved);
            const resumed = new core.Game('deep', loaded.profile, { snapshot: loaded.session });
            equal(resumed.state.fish, saved.session.fish);
            equal(resumed.theme.fish[resumed.state.fish[1].type].name, 'Barreleye');
            equal(resumed.state.score, saved.session.score);
            equal(JSON.stringify(saved), before);
        }
    });
    test('Initial state starts with 100 points, two healthy fish, and no unearned purchase achievement', () => {
        const g = make('koi', core.createProfile());
        equal(g.state.score, 100);
        equal(g.state.fish.map(f => f.type), [0, 1]);
        assert(g.state.fish.every(f => f.health === 100 && f.hunger === 50));
        assert(!g.profile.achievements['first-fish']);
    });
    test('Purchase spends the species price and awards First Fish only once across sessions', () => {
        const p = core.createProfile(), g = make('koi', p);
        assert(g.buy(3).ok);
        equal(g.state.score, 110);
        assert(g.buy(3).ok);
        equal(g.state.score, 95);
        const next = make('koi', p);
        next.buy(3);
        equal(next.state.score, 85);
        equal(g.state.stats.bought, 2);
    });
    test('Unaffordable, invalid, over-capacity, paused, and ended purchases do not change balance', () => {
        const g = make();
        g.state.score = 0;
        assert(!g.buy(0).ok);
        equal(g.state.score, 0);
        g.state.score = 100;
        assert(!g.buy(99).ok);
        g.state.paused = true; assert(!g.buy(0).ok); g.state.paused = false;
        while (g.state.fish.length < g.state.maxFish) g.addFish(0);
        assert(!g.buy(0).ok);
        equal(g.state.score, 100);
        g.state.ended = true; assert(!g.buy(0).ok);
    });
    test('Positive events receive the multiplier; penalties and purchases do not', () => {
        const g = make();
        g.state.multiplier = 3;
        g.award(25, 'Test');
        equal(g.state.score, 175);
        g.award(-20, 'Penalty');
        equal(g.state.score, 155);
        g.buy(3);
        equal(g.state.score, 145);
        g.feed();
        equal(g.state.score, 140);
        g.award(-1000, 'Floor');
        equal(g.state.score, 0);
    });
    test('Base rate counts healthy adults, not babies or unhealthy fish', () => {
        const g = make();
        g.state.fish[0].health = 49;
        g.addFish(2, true);
        g.progression(1);
        near(g.state.score, 100.5);
    });
    test('Streak thresholds are exactly 30, 90, and 180 active healthy seconds', () => {
        const g = make();
        g.progression(29.9); equal(g.state.multiplier, 1);
        g.progression(0.1); equal(g.state.multiplier, 1.5);
        g.progression(59.9); equal(g.state.multiplier, 1.5);
        g.progression(0.1); equal(g.state.multiplier, 2);
        g.progression(89.9); equal(g.state.multiplier, 2);
        g.progression(0.1); equal(g.state.multiplier, 3);
    });
    test('Interrupted health streak stops building; below 50 resets even before the first threshold', () => {
        const g = make();
        g.state.streak = 20; g.state.fish[0].health = 49;
        g.progression(0.01);
        equal(g.state.streak, 0); equal(g.state.multiplier, 1);
        g.state.multiplier = 2; g.state.fish[0].health = 70;
        g.progression(1);
        equal(g.state.streak, 0); equal(g.state.multiplier, 2);
        g.state.fish[0].health = 49; g.progression(0.01);
        equal(g.state.multiplier, 1);
    });
    test('A genuinely empty tank resets the multiplier', () => {
        const g = make();
        g.state.fish = []; g.state.multiplier = 3;
        g.progression(0.01);
        equal(g.state.multiplier, 1);
    });
    test('Clean Sweep checks water health before cleaning', () => {
        const healthy = make(); healthy.state.dirt = 20; healthy.state.tankHealth = healthy.waterHealth();
        healthy.clean();
        equal(healthy.state.score, 110); equal(healthy.state.tankHealth, 100);
        const dirty = make(); dirty.state.dirt = 31; dirty.state.tankHealth = dirty.waterHealth();
        dirty.clean();
        equal(dirty.state.score, 90); equal(dirty.state.tankHealth, 100);
        dirty.state.damage = 20; dirty.state.tankHealth = dirty.waterHealth(); dirty.clean();
        equal(dirty.state.damage, 0);
    });
    test('Perfect Tank requires five fish each above 90%, not just clean water', () => {
        const g = make(); g.addFish(0); g.addFish(0); g.addFish(0);
        g.state.fish[0].health = 85;
        g.state.timers.perfect = 59.99; g.progression(0.02);
        equal(g.state.timers.perfect, 0);
        g.state.fish[0].health = 100;
        g.state.tankHealth = 60; g.state.timers.perfect = 59.99;
        g.progression(0.02);
        assert(g.drainEvents().some(e => e.message === 'Perfect Tank'));
    });
    test('Biodiversity requires all four living species for 45 continuous seconds', () => {
        const g = make(); g.addFish(2); g.addFish(3);
        g.state.timers.diversity = 44.99; g.progression(0.02);
        assert(g.drainEvents().some(e => e.message === 'Biodiversity'));
        g.state.timers.diversity = 44; g.state.fish.pop(); g.progression(0.1);
        equal(g.state.timers.diversity, 0);
    });
    test('Hunger and recovery are simulation-time based, bounded, and pause safely', () => {
        const g = make();
        g.state.fish[0].hunger = 100; g.state.fish[0].health = 90;
        steps(g, 1);
        near(g.state.fish[0].hunger, 98.5, 1e-5);
        near(g.state.fish[0].health, 92, 1e-5);
        g.state.paused = true;
        const snapshot = JSON.stringify(g.state);
        steps(g, 2);
        equal(JSON.stringify(g.state), snapshot);
    });
    test('Deaths are charged and counted once, with a larger starvation penalty', () => {
        const g = make(), f = g.state.fish[0];
        g.kill(f, 'starvation'); g.kill(f, 'starvation');
        equal(g.state.score, 80); equal(g.state.stats.lost, 1); equal(g.profile.stats.lost, 1);
        g.kill(g.state.fish[0], 'predator');
        equal(g.state.score, 65); equal(g.state.stats.lost, 2);
    });
    test('Empty aquariums get five seconds and a purchase resets the rescue timer', () => {
        const g = make();
        g.state.fish = [];
        steps(g, 4);
        assert(!g.state.ended);
        g.buy(3);
        equal(g.state.timers.empty, 0);
        steps(g, 2);
        assert(!g.state.ended);
        g.state.fish = [];
        steps(g, 5.1);
        assert(g.state.ended);
        equal(g.state.outcome, 'defeat');
    });
    test('Zero water health ends the game immediately', () => {
        const g = make();
        g.state.dirt = 100;
        g.update(1 / 60);
        assert(g.state.ended);
        equal(g.state.reason, 'The water became uninhabitable.');
    });
    test('Milestones wait one active second, pause, and cannot be bypassed with ordinary Resume', () => {
        const g = make();
        g.state.score = 1000;
        steps(g, 0.5);
        assert(g.state.pending && !g.state.milestone);
        steps(g, 0.6);
        equal(g.state.milestone, 'bronze'); assert(g.state.paused);
        assert(!g.resume().ok); assert(g.state.paused);
        g.continueMilestone();
        assert(!g.state.paused); equal(g.state.milestone, null);
        steps(g, 2);
        assert(!g.state.milestone);
        equal(g.profile.bestMilestone, 'bronze');
    });
    test('Master requires fifteen residents, four species, and three continuous minutes', () => {
        const g = make();
        g.state.milestones = ['bronze', 'silver', 'gold', 'platinum'];
        while (g.state.fish.length < 15) g.addFish(g.state.fish.length % 4);
        g.state.thriving = 179; g.progression(0.9);
        assert(!g.state.pending);
        g.state.fish.pop(); g.progression(0.1);
        equal(g.state.thriving, 0);
        g.addFish(2); g.state.thriving = 179.99; g.progression(0.02);
        equal(g.state.pending.id, 'master');
    });
    test('Ending records the Pacifist bonus in the final score and cannot double-count sessions', () => {
        const p = core.createProfile(), g = make('koi', p);
        g.state.elapsed = 120;
        g.finish();
        equal(g.state.score, 300);
        equal(p.highScore, 300);
        equal(p.sessions, 1);
        assert(p.achievements.pacifist);
        g.finish();
        equal(p.sessions, 1);
        equal(g.state.score, 300);
    });
    test('Victory requires a reached milestone', () => {
        const g = make();
        assert(!g.finish('victory').ok);
        assert(!g.state.ended);
        g.state.milestone = 'bronze'; g.state.milestones = ['bronze'];
        assert(g.finish('victory', 'Bronze Aquarist').ok);
        equal(g.state.outcome, 'victory');
    });
    test('Population and aquarium bounds adapt without deleting residents on rotation', () => {
        equal(core.capacity(320, 568), 15);
        equal(core.capacity(1200, 800), 20);
        equal(core.capacity(4000, 3000), 20);
        const g = make();
        while (g.state.fish.length < 20) g.addFish(0);
        g.resize(320, 568);
        equal(g.state.fish.length, 20); equal(g.state.maxFish, 15);
        assert(g.state.fish.every(f => Math.abs(f.pos[0]) <= g.state.bounds.width));
        assert(!g.buy(0).ok);
    });
    test('Personal space follows actual fish size and growth in all three dimensions', () => {
        const adult = { size: 1.3, growth: 1 }, baby = { size: 1.3, growth: 0 };
        near(core.fishScale(adult), 1.3 * core.CONFIG.fishScale);
        near(core.fishScale(baby), core.fishScale(adult) * 0.3);
        assert(core.fishSpacing(adult, adult) > core.fishSpacing(adult, baby));
        assert(core.fishSpacing(adult, baby) > core.fishSpacing(baby, baby));
        const g = make('koi', core.createProfile());
        g.state.fish = [];
        for (let i = 0; i < 3; i++) {
            const f = g.addFish(0);
            f.pos = [0, 0, (i - 1) * 0.1];
            f.vel = [0, 0, 0]; f.target = [5, 0, 0]; f.retarget = 4; f.hunger = 100;
        }
        steps(g, 3);
        const distances = g.state.fish.flatMap((f, i) => g.state.fish.slice(i + 1).map(o => core.distance(f.pos, o.pos)));
        assert(Math.min(...distances) > 0.9, 'A school collapsed into overlapping bodies');
        assert(g.profile.achievements.schooling, 'Looser schools must still unlock School\'s In');
    });
    test('Coincident residents separate without invalid vectors or permanent overlap', () => {
        const g = make('koi');
        g.state.fish.forEach(f => {
            f.pos = [0, 0, 0]; f.vel = [0, 0, 0]; f.target = [5, 0, 0]; f.retarget = 4; f.hunger = 100;
        });
        steps(g, 2);
        assert(core.distance(g.state.fish[0].pos, g.state.fish[1].pos) > 0.8);
        assert(g.state.fish.every(f => f.pos.every(Number.isFinite) && f.vel.every(Number.isFinite)));
    });
    test('Ordinary populations stay spread through the 3D volume on desktop and phones', () => {
        for (const theme of Object.keys(core.THEMES)) for (const width of [1200, 390]) {
            const g = new core.Game(theme, core.createProfile(), { demo: true, seed: 71437, width, height: 800 });
            let crowded = 0, nearest = 0, samples = 0;
            const span = [0, 0, 0];
            for (let frame = 0; frame < 2700; frame++) {
                g.update(1 / 30);
                if (frame < 900 || frame % 30) continue;
                samples++;
                const fish = g.state.fish;
                for (const f of fish) {
                    const others = fish.filter(o => o !== f);
                    nearest += Math.min(...others.map(o => core.distance(f.pos, o.pos))) / fish.length;
                    crowded += others.some(o => core.distance(f.pos, o.pos) < (core.fishScale(f) + core.fishScale(o)) * 0.76) / fish.length;
                }
                for (let axis = 0; axis < 3; axis++) {
                    span[axis] += Math.max(...fish.map(f => f.pos[axis])) - Math.min(...fish.map(f => f.pos[axis]));
                }
            }
            const label = `${theme} at ${width}px`;
            assert(crowded / samples < 0.1, `${label}: more than 10% of residents remain body-close`);
            assert(nearest / samples > 1.65, `${label}: neighbors do not have breathing room`);
            assert(span[0] / samples > g.state.bounds.width * 1.2, `${label}: fish ignore the tank's width`);
            assert(span[1] / samples > 3.2 && span[2] / samples > 3.6, `${label}: fish have flattened into a narrow layer`);
        }
    });
    test('Food has a bounded lifetime and a hard population limit', () => {
        const g = make();
        g.state.score = 10000;
        for (let i = 0; i < 40; i++) g.feed();
        assert(g.state.food.length <= core.CONFIG.foodLimit);
        assert(!g.feed().ok);
        g.state.fish.forEach(f => { f.hunger = 100; });
        const food = g.state.food[0];
        food.age = 14.99;
        g.update(0.02);
        assert(!g.state.food.includes(food));
    });
    test('Repeated taps incur the exact stress penalty and persistent water damage', () => {
        const g = make();
        for (let i = 0; i < 4; i++) g.tap([0, 0, 0]);
        equal(g.state.score, 95);
        equal(g.state.damage, 2);
        g.update(0.05);
        assert(g.state.tankHealth < 98);
    });
    test('Visitors cannot kill fish outside the aquarium and honor their eight-second cooldown', () => {
        const g = make('koi');
        g.spawnCreature();
        const c = g.state.creature;
        g.state.fish.forEach(f => { f.pos = [...c.pos]; });
        const count = g.state.fish.length;
        g.updateCreature(0.01);
        equal(g.state.fish.length, count);
        c.pos = [0, 0, 0]; c.kind = 'jellyfish'; c.flee = 0;
        g.state.fish.forEach(f => { f.pos = [0, 0, 0]; });
        g.updateCreature(0.01);
        equal(g.state.fish.length, count - 1);
        g.updateCreature(0.01);
        equal(g.state.fish.length, count - 1);
        assert(c.cooldown > 7.9);
    });
    test('Three visitor taps provoke a single attack; a five-second gap resets the count', () => {
        const g = make('koi');
        spawn(g, 'jellyfish');
        const c = g.state.creature;
        c.kind = 'jellyfish'; c.pos = [0, 0, 0];
        g.tapCreature(); g.tapCreature();
        equal(g.state.attacks.length, 0);
        g.state.elapsed = 6; g.tapCreature();
        equal(c.taps, 1);
        g.tapCreature(); g.tapCreature();
        equal(g.state.attacks.length, 1);
        equal(g.state.attacks[0].kind, 'stingers');
        equal(g.state.attacks[0].nodes.length, 7);
        equal(g.state.score, 90);
        assert(!g.tapCreature().ok);
        equal(g.state.attacks.length, 1);
    });
    test('Attack survival bonuses wait for active-time expiry and require living survivors', () => {
        const g = make();
        g.state.attacks = [{ kind: 'ink', age: 9.9, life: 10, pos: [100, 100, 100], nodes: [], lostBefore: 0 }];
        g.state.paused = true;
        g.update(0.1);
        equal(g.state.attacks[0].age, 9.9);
        equal(g.state.score, 100);
        g.state.paused = false;
        g.updateAttacks(0.11);
        equal(g.state.score, 140);
        equal(g.state.stats.attacksSurvived, 1);
        equal(g.state.attacks.length, 0);
        const empty = make();
        empty.state.fish = [];
        empty.state.attacks = [{ kind: 'ink', age: 9.9, life: 10, pos: [0, 0, 0], nodes: [], lostBefore: 0 }];
        empty.updateAttacks(0.11);
        equal(empty.state.score, 100);
    });
    test('A fish loss invalidates the attack-survivor award', () => {
        const g = make();
        g.state.attacks = [{ kind: 'ink', age: 9.9, life: 10, pos: [100, 100, 100], nodes: [], lostBefore: 0 }];
        g.kill(g.state.fish[0], 'starvation');
        g.updateAttacks(0.11);
        equal(g.state.score, 80);
        equal(g.state.stats.attacksSurvived, 0);
    });
    test('Reproduction obeys the Zen care population cap across all species in one step', () => {
        const g = make();
        g.state.auto = true;
        for (let type = 0; type < 4; type++) while (g.state.fish.filter(f => f.type === type).length < 2) g.addFish(type);
        g.addFish(0);
        g.state.fish.forEach(f => { f.hunger = 100; f.health = 100; });
        g.random = () => 0;
        g.reproduce(0.1);
        equal(g.state.fish.length, 10);
        equal(g.state.stats.born, 1);
        assert(g.state.fish.some(f => f.growth === 0));
    });
    test('Zen care uses the ordinary costs and preserves the cap', () => {
        const g = make();
        g.state.auto = true;
        g.state.fish.forEach(f => { f.hunger = 40; });
        g.state.dirt = 45; g.state.tankHealth = g.waterHealth();
        g.autoCare(0.01);
        equal(g.state.fish.length, 3);
        assert(g.state.food.length >= 3 && g.state.food.length <= 6);
        equal(g.state.tankHealth, 100);
        assert(g.state.score >= 55 && g.state.score <= 75);
    });
    test('Save snapshots round-trip every active mechanic and resume paused', () => {
        const g = make('deep');
        g.feed(); g.buy(2); g.state.auto = true;
        spawn(g, 'jellyfish'); g.tapCreature(); g.tapCreature(); g.tapCreature();
        g.state.fish[0].hunger = 88; g.state.streak = 19;
        const data = core.validateSave(JSON.parse(JSON.stringify(envelope(g))));
        const resumed = new core.Game('deep', data.profile, { snapshot: data.session });
        assert(resumed.state.paused);
        equal(resumed.state.fish, g.state.fish);
        equal(resumed.state.food, g.state.food);
        equal(resumed.state.attacks, g.state.attacks);
        equal(resumed.state.creature, g.state.creature);
        equal(resumed.state.seed, g.state.seed);
        resumed.resume();
        resumed.update(0.01);
        assert(resumed.state.elapsed > g.state.elapsed);
    });
    test('Malformed nested saves are rejected, not partially loaded', () => {
        const mutations = [
            d => { d.version = 999; }, d => { d.session.themeId = 'unknown'; },
            d => { d.session.fish[0].pos = [0, null, 1]; },
            d => { d.session.fish[0].traits = null; },
            d => { d.session.fish[1].id = d.session.fish[0].id; },
            d => { d.session.food = [{ pos: [0, 0, 0] }]; },
            d => { d.profile.stats = {}; }, d => { d.settings.quality = 'ultra'; },
            d => { d.session.pending = { id: 'fake', remaining: 1 }; },
            d => { d.session.score = -1; }, d => { d.session.attacks = [{}]; }
        ];
        for (const mutation of mutations) {
            const data = envelope(make()); mutation(data); throws(() => core.validateSave(data));
        }
    });
    test('Demo aquariums do not award achievements or simulate neglect', () => {
        const p = core.createProfile(), g = new core.Game('tropical', p, { demo: true, seed: 12345 });
        steps(g, 60);
        equal(g.state.score, 100);
        equal(g.state.tankHealth, 100);
        equal(g.state.fish.length, 9);
        equal(p.themesPlayed, []);
        equal(p.achievements, {});
    });
    test('Seeded simulation is deterministic at the same simulation timestep', () => {
        const a = make(), b = make();
        steps(a, 10); steps(b, 10);
        equal(a.state, b.state);
        throws(() => a.update(Infinity)); throws(() => a.update(-1)); throws(() => a.update(1));
    });
    test('Zen care survives a bounded active-time soak with valid snapshots and bounded effects', () => {
        for (const id of Object.keys(core.THEMES)) {
            const g = make(id);
            g.state.auto = true;
            for (let i = 0; i < 18000 && !g.state.ended; i++) {
                if (g.state.milestone) g.continueMilestone();
                g.update(1 / 30);
                if (i % 900 === 0) core.validateSave(envelope(g));
            }
            core.validateSave(envelope(g));
            assert(g.state.food.length <= core.CONFIG.foodLimit);
            assert(g.state.fish.length <= g.state.maxFish);
            assert(Number.isFinite(g.state.score));
            assert(g.state.elapsed >= 120, `${id} failed too early: ${g.state.elapsed}`);
        }
    });
    test('Matrix inversion supports picking after camera rotation', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const vp = ZQRenderer.multiply(ZQRenderer.perspective(1.4), ZQRenderer.lookAt([6, 4, 12], [0, 0, 0]));
        const inverse = ZQRenderer.inverse(vp);
        const p = [2, -1, 0.4, 1], clip = ZQRenderer.transform(vp, p), restored = ZQRenderer.transform(inverse, clip);
        for (let i = 0; i < 3; i++) near(restored[i] / restored[3], p[i], 1e-4);
    });
    test('Every camera limit and following pose keeps the near plane above a continuous floor', () => {
        if (typeof ZQRenderer === 'undefined') return;
        for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390], [3000, 600], [200, 1400]]) {
            const g = new core.Game('tropical', core.createProfile(), { width, height, seed: 12345 });
            const r = Object.create(ZQRenderer.Renderer.prototype);
            Object.assign(r, { width, height, level: 'battery', reduced: true });
            r.setTheme(g.theme, g.state.bounds);
            const b = g.state.bounds, limits = ZQRenderer.PARAMS.camera;
            for (const follow of [null, g.state.fish[0].id]) for (const fishY of [b.floor + 0.6, b.surface - 0.45]) {
                g.state.fish[0].pos = [b.width - 0.3, fishY, b.depth];
                for (let turn = 0; turn < 8; turn++) for (const pitch of [-2, 0.02, 0.75, 3]) for (const zoom of [0.1, 1, 4]) {
                    r.camera = { yaw: turn * Math.PI / 4, pitch, zoom, target: [0, 0, 0], follow };
                    r.updateCamera(g.state, 1 / 60);
                    assert(r.camera.pitch >= limits.minPitch && r.camera.pitch <= limits.maxPitch);
                    assert(r.camera.zoom >= limits.minZoom && r.camera.zoom <= limits.maxZoom);
                    assert(r.eye[1] >= b.floor + limits.floorClearance, 'Camera eye went below the sand');
                    const inv = ZQRenderer.inverse(r.vp);
                    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
                        const clip = ZQRenderer.transform(inv, [x, y, z, 1]);
                        const p = clip.slice(0, 3).map(n => n / clip[3]);
                        if (z === -1) assert(p[1] > b.floor + 0.095, 'Near plane can cut beneath the terrain');
                        assert(Math.abs(p[0]) < r.groundExtent && Math.abs(p[2]) < r.groundExtent, 'The camera can expose a floor edge');
                    }
                    const polygon = r.floorPolygon(b.floor);
                    assert(polygon.length >= 3, 'Compatibility floor disappeared');
                    assert(polygon.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)
                        && p.x >= -0.01 && p.x <= width + 0.01 && p.y >= -0.01 && p.y <= height + 0.01),
                    'Compatibility ground was not clipped to the view');
                    for (const x of [0, width]) assert(polygon.some(p => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - height) < 0.01),
                        'Compatibility floor leaves a gap at the bottom');
                }
            }
        }
    });
    test('Glass coordinates stay under the pointer through full orbits and camera gestures respect bounds', () => {
        if (typeof ZQRenderer === 'undefined') return;
        const g = make();
        const r = Object.create(ZQRenderer.Renderer.prototype);
        Object.assign(r, { width: 1200, height: 800, reduced: true, camera: {} });
        r.reset();
        for (let turn = 0; turn < 8; turn++) {
            r.camera.yaw = turn * Math.PI / 4;
            r.updateCamera(g.state, 1 / 60);
            for (const [x, y] of [[250, 200], [600, 400], [1000, 650]]) {
                const p = r.project(r.worldPoint(x, y));
                near(p.x, x, 0.02); near(p.y, y, 0.02);
            }
        }
        r.orbit(0, -1000);
        equal(r.camera.pitch, ZQRenderer.PARAMS.camera.minPitch);
        r.orbit(0, 1000);
        equal(r.camera.pitch, ZQRenderer.PARAMS.camera.maxPitch);
        r.zoom(0.0001);
        equal(r.camera.zoom, ZQRenderer.PARAMS.camera.minZoom);
        r.zoom(1000);
        equal(r.camera.zoom, ZQRenderer.PARAMS.camera.maxZoom);
    });
    test('Every theme adds distinct crab and eel variants without replacing its existing visitors', () => {
        for (const theme of Object.values(core.THEMES)) {
            assert(theme.visitors.some(v => v.kind === 'crab'));
            assert(theme.visitors.some(v => v.kind === 'eel'));
            assert(theme.visitors.some(v => v.kind === 'jellyfish'));
            assert(theme.visitors.some(v => v.kind === 'octopus'));
        }
    });
    test('Crabs require three alternating decoys, reject rapid repeats, and award a persistent arch once', () => {
        const g = make();
        const c = spawn(g, 'crab');
        c.pos = [0, g.state.bounds.floor + 0.42, 0.8]; c.entered = true;
        assert(g.defendCreature('decoy', -1).ok);
        assert(!g.defendCreature('decoy', 1).ok);
        c.decoyCooldown = 0;
        g.defendCreature('decoy', -1);
        equal(c.defenseStep, 1);
        c.decoyCooldown = 0; g.defendCreature('decoy', 1);
        c.decoyCooldown = 0; g.defendCreature('decoy', -1);
        assert(c.defended); equal(c.phase, 'leaving');
        equal(g.profile.stats.crabsRepelled, 1);
        assert(g.profile.prizes.arch);
        assert(g.profile.equippedPrizes.includes('arch'));
        assert(!g.defendCreature('decoy', 1).ok);
        equal(g.profile.stats.crabsRepelled, 1);
        core.validateSave(envelope(g));
    });
    test('An undefended crab steals settled food and leaves extra dirt', () => {
        const g = make();
        const c = spawn(g, 'crab');
        c.pos = [0, g.state.bounds.floor + 0.42, 0.8];
        const item = { pos: [0, g.state.bounds.floor + 0.1, 0.8], age: 10, speed: 0.3, phase: 1 };
        g.state.food.push(item);
        g.updateCreature(0.01);
        assert(!g.state.food.includes(item));
        near(g.state.dirt, 1.5);
    });
    test('Eels telegraph a lunge and only a correctly timed flash unlocks the lantern', () => {
        const g = make();
        const c = spawn(g, 'eel');
        c.pos = [0, -2, -1.2]; c.entered = true; c.phaseTimer = 0;
        assert(!g.defendCreature('flash').ok);
        g.updateCreature(0.01);
        equal(c.phase, 'windup');
        near(c.phaseTimer, core.CONFIG.eelWarning);
        assert(g.defendCreature('flash').ok);
        assert(c.defended); equal(c.phase, 'leaving');
        equal(g.profile.stats.eelsRepelled, 1);
        assert(g.profile.prizes.lantern);
        assert(!g.defendCreature('flash').ok);
        core.validateSave(envelope(g));
    });
    test('Ignoring an eel coil leads to a dash; pausing freezes its warning window', () => {
        const g = make();
        const c = spawn(g, 'eel');
        c.pos = [0, -2, -1.2]; c.entered = true; c.phaseTimer = 0;
        g.updateCreature(0.01);
        g.state.paused = true;
        steps(g, 1);
        near(c.phaseTimer, core.CONFIG.eelWarning);
        g.state.paused = false; c.phaseTimer = 0.01;
        g.updateCreature(0.02);
        equal(c.phase, 'dash');
        assert(!g.defendCreature('flash').ok);
        assert(!g.profile.prizes.lantern);
    });
    test('New visitors do not accidentally satisfy the original Creature Collector achievement', () => {
        const g = make('koi', core.createProfile());
        g.state.stats.creaturesSeen = ['jellyfish', 'crab'];
        spawn(g, 'eel');
        assert(!g.profile.achievements['creature-collector']);
        g.state.creature = null;
        g.state.stats.creaturesSeen = ['jellyfish', 'octopus', 'crab', 'eel'];
        spawn(g, 'squid');
        assert(g.profile.achievements['creature-collector']);
    });
    test('Prizes are earned across sessions, cap at three placements, and never award farmable score', () => {
        const g = make();
        g.state.score = 1000;
        g.profile.stats.born = 1; g.profile.stats.eelsRepelled = 1; g.profile.stats.crabsRepelled = 1;
        g.checkPrizes();
        equal(Object.keys(g.profile.prizes).length, 4);
        equal(g.profile.equippedPrizes.length, 3);
        assert(!g.equipPrize('arch').ok);
        assert(g.equipPrize('chest').ok);
        assert(g.equipPrize('arch').ok);
        const score = g.state.score;
        for (let i = 0; i < 10; i++) assert(g.interactPrize('oyster').ok);
        equal(g.state.score, score);
        equal(g.state.prizeEffects.oyster, core.CONFIG.prizeInteraction);
        const next = make('ink', g.profile);
        equal(next.profile.equippedPrizes, g.profile.equippedPrizes);
        assert(next.profile.prizes.oyster);
        core.validateSave(envelope(g));
    });
    test('Unearned prizes cannot be placed and prize animations freeze while paused', () => {
        const g = make();
        assert(!g.equipPrize('chest').ok);
        assert(!g.interactPrize('chest').ok);
        g.profile.stats.born = 1; g.checkPrizes();
        g.interactPrize('oyster');
        g.state.paused = true; steps(g, 2);
        equal(g.state.prizeEffects.oyster, 6);
        g.state.paused = false; steps(g, 0.5);
        near(g.state.prizeEffects.oyster, 5.5);
    });
    test('Version-one saves migrate without changing original data or losing progress', () => {
        const old = envelope(make('deep'));
        old.version = 1;
        delete old.profile.prizes; delete old.profile.equippedPrizes;
        delete old.profile.stats.crabsRepelled; delete old.profile.stats.eelsRepelled;
        delete old.session.prizeEffects;
        const before = JSON.stringify(old);
        const upgraded = core.validateSave(old);
        equal(upgraded.version, 2);
        equal(upgraded.profile.prizes, {});
        equal(upgraded.profile.stats.eelsRepelled, 0);
        equal(upgraded.session.fish, old.session.fish);
        equal(JSON.stringify(old), before);
    });

    globalThis.ZQ_TEST_RESULTS = results;
    if (typeof module !== 'undefined' && module.exports) {
        for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}`);
        if (results.some(r => !r.passed)) process.exitCode = 1;
        module.exports = results;
    }
})();
