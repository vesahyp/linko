import { useEffect, useRef, useState } from 'react';
import { newRun, step, DT, pickUpgrade, applyUpgrade, startWave } from '../game/sim';
import { NO_INPUT, type SimState, type SimInput, type GravityTally } from '../game/state';
import { UPGRADE_BY_ID, type UpgradeId } from '../game/content';
import { Renderer } from '../render/renderer';
import { InputController } from '../input/input';
import { audio } from '../audio';
import { UpdateBanner } from './Update';

export interface RunSummary {
  wave: number;
  score: number;
  kills: number;
  time: number;
  tally: GravityTally;
  upgrades: SimState['ship']['upgrades'];
}

interface Hud {
  hp: number;
  maxHp: number;
  wave: number;
  score: number;
  left: number;
  pod: SimState['pod']['mode'];
  banner: SimState['banner'];
  phase: SimState['phase'];
  offers: UpgradeId[];
  tally: GravityTally | null;
}

const params = new URLSearchParams(location.search);

/** Sum of tallies, for the end of a run. */
export function sumTallies(ts: GravityTally[]): GravityTally {
  const o: GravityTally = { bentHits: 0, hits: 0, planetKills: 0, slingshots: 0, planetDamage: 0, bentHurts: 0, hurts: 0 };
  for (const t of ts) for (const k of Object.keys(o) as (keyof GravityTally)[]) o[k] += t[k];
  return o;
}

/** One line on what the planet did, for the card screen and the end. */
export function gravityLine(t: GravityTally): string {
  const parts = [];
  if (t.hits) parts.push(`${Math.round((100 * t.bentHits) / t.hits)}% of your hits curved round the planet`);
  if (t.planetKills) parts.push(`${t.planetKills} ${t.planetKills === 1 ? 'enemy' : 'enemies'} hit the planet`);
  if (t.slingshots) parts.push(`${t.slingshots} slingshot${t.slingshots === 1 ? '' : 's'}`);
  if (t.planetDamage) parts.push(`${t.planetDamage} hull lost to the planet`);
  return parts.join(' · ');
}

function readInsets(): { l: number; r: number; t: number; b: number } {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const o = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  probe.remove();
  return o;
}

export function Game({ seed, onEnd, onQuit }: { seed: number; onEnd: (r: RunSummary) => void; onQuit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const podRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<SimState | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<Hud | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const root = rootRef.current!;
    const sim = newRun(seed);
    // ?wave=N: start on wave N with the cards a run would have picked by then
    const startAt = Number(params.get('wave')) || 1;
    if (startAt > 1) {
      const order: UpgradeId[] = ['spread', 'wave', 'armor', 'rapid', 'bits', 'missiles', 'engine', 'heavy', 'podgun'];
      for (let i = 0; i < startAt - 1; i++) applyUpgrade(sim, order[i % order.length]);
      sim.enemies = [];
      startWave(sim, startAt);
    }
    simRef.current = sim;
    (window as unknown as { __sim: SimState }).__sim = sim;
    const renderer = new Renderer(canvas);
    const input = new InputController();
    inputRef.current = input;
    input.attach(root);
    const unlock = () => audio.unlock();
    root.addEventListener('touchstart', unlock);
    root.addEventListener('mousedown', unlock);

    const layout = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      const ins = readInsets();
      renderer.resize(w, h, { l: ins.l, r: ins.r, t: Math.max(ins.t, 4), b: Math.max(ins.b, 4) });
      const pr = Math.max(26, Math.min(36, h * 0.085));
      input.podBtn = { x: w - ins.r - pr - 16, y: h - ins.b - pr - 18, r: pr };
      const pb = podRef.current;
      if (pb) {
        pb.style.left = `${input.podBtn.x - pr}px`;
        pb.style.top = `${input.podBtn.y - pr}px`;
        pb.style.width = pb.style.height = `${pr * 2}px`;
      }
      (window as unknown as { __layout: unknown }).__layout = { w, h, pod: input.podBtn };
    };
    layout();
    window.addEventListener('resize', layout);

    // ?hand=1: the hand (tools/hand.ts) plays. It never feeds the sim: it
    // publishes where its thumbs are, and scripts/playthrough.mjs turns them
    // into real touches on this page.
    let hand: { tick: (s: SimState) => unknown; pick: (s: SimState) => UpgradeId } | null = null;
    if (params.get('hand')) {
      void import('../../tools/hand').then((m) => {
        hand = new m.Hand(seed);
      });
    }

    let podTaps = 0;
    let pickWant: UpgradeId | null = null;
    const speed = Number(params.get('speed')) || 1;
    let acc = 0;
    let last = performance.now();
    let hudAt = 0;
    let raf = 0;
    let ended = false;
    let lastInp: SimInput = NO_INPUT;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const s = simRef.current!;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (hand) {
        const w = window as unknown as { __hand: unknown };
        const thumbs = hand.tick(s) as { podTap: boolean };
        if (thumbs.podTap) podTaps++;
        w.__hand = { thumbs, podTaps, pick: s.phase === 'pick' ? (pickWant ??= hand.pick(s)) : (pickWant = null) };
      }
      if (!pausedRef.current && s.phase !== 'pick') {
        acc += dt * speed;
        let first = true;
        const inp = input.read();
        while (acc >= DT) {
          // edges go to the first step of the frame only
          step(s, first ? inp : { ...inp, release: false, pod: false });
          first = false;
          acc -= DT;
        }
        if (!first) lastInp = inp;
        for (const snd of s.sounds) audio.play(snd);
        s.sounds.length = 0;
      } else acc = 0;
      const sp = renderer.toScreen(s.ship.x, s.ship.y);
      input.shipScreen = sp;
      renderer.draw(s, lastInp, 0);
      // the sticks under the thumbs
      for (const [el, st] of [
        [moveRef.current, input.move],
        [rightRef.current, input.right],
      ] as const) {
        if (!el) continue;
        el.style.display = st.active ? 'block' : 'none';
        if (st.active) {
          el.style.transform = `translate(${st.cx}px, ${st.cy}px)`;
          const knob = el.firstElementChild as HTMLElement;
          const dx = st.x - st.cx;
          const dy = st.y - st.cy;
          const d = Math.hypot(dx, dy);
          const k = d > 60 ? 60 / d : 1;
          knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        }
      }
      if (now - hudAt > 100 || s.phase !== 'fight') {
        hudAt = now;
        setHud({
          hp: Math.ceil(s.ship.hp),
          maxHp: s.ship.maxHp,
          wave: s.wave,
          score: s.score,
          left: s.enemies.length + s.queue.reduce((a, q) => a + q.count, 0),
          pod: s.pod.mode,
          banner: s.banner ? { ...s.banner } : null,
          phase: s.phase,
          offers: [...s.offers],
          tally: s.phase === 'pick' ? s.waveTallies[s.waveTallies.length - 1] : null,
        });
      }
      if (s.phase === 'dead' && s.deadTime > 1.8 && !ended) {
        ended = true;
        onEnd({ wave: s.wave, score: s.score, kills: s.kills, time: s.time, tally: sumTallies([...s.waveTallies, s.tally]), upgrades: { ...s.ship.upgrades } });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      input.detach(root);
      window.removeEventListener('resize', layout);
      root.removeEventListener('touchstart', unlock);
      root.removeEventListener('mousedown', unlock);
    };
  }, [seed, onEnd]);

  const setPause = (p: boolean) => {
    pausedRef.current = p;
    inputRef.current?.reset();
    setPaused(p);
  };

  const pick = (id: UpgradeId) => {
    const s = simRef.current;
    if (!s) return;
    pickUpgrade(s, id);
    inputRef.current?.reset();
    for (const snd of s.sounds) audio.play(snd);
    s.sounds.length = 0;
  };

  const hpFrac = hud ? hud.hp / hud.maxHp : 1;
  return (
    <div className="game" ref={rootRef}>
      <canvas ref={canvasRef} />
      <div className="stick" ref={moveRef}>
        <div className="knob" />
      </div>
      <div className="stick charge" ref={rightRef}>
        <div className="knob" />
      </div>
      <div className={`podbtn ${hud?.pod ?? 'docked'}`} ref={podRef}>
        <span>{hud?.pod === 'docked' ? 'POD' : 'RECALL'}</span>
      </div>
      {hud && (
        <div className="hud">
          <div className="hull">
            <div className="bar">
              <div className={hpFrac < 0.3 ? 'fill low' : 'fill'} style={{ width: `${hpFrac * 100}%` }} />
            </div>
            <span>{hud.hp}</span>
          </div>
          <div className="wave">
            Wave {hud.wave} <small>· {hud.left} left</small>
          </div>
          <div className="score">{hud.score.toLocaleString('en')}</div>
          <button className="pause" data-ui onClick={() => setPause(true)} aria-label="Pause">
            ❚❚
          </button>
        </div>
      )}
      {hud?.banner && hud.phase === 'fight' && (
        <div className="banner" style={{ opacity: Math.min(1, hud.banner.life * 2) }}>
          <b>{hud.banner.text}</b>
          <span>{hud.banner.sub}</span>
        </div>
      )}
      {hud?.phase === 'pick' && (
        <div className="overlay pick" data-ui>
          <h2>Wave {hud.wave} clear</h2>
          {hud.tally && <p className="grav">{gravityLine(hud.tally) || ' '}</p>}
          <div className="cards">
            {hud.offers.map((id) => {
              const u = UPGRADE_BY_ID[id];
              const lvl = simRef.current?.ship.upgrades[id] ?? 0;
              return (
                <button key={id} className={`card ${u.slot}`} data-id={id} onClick={() => pick(id)}>
                  <small>{u.slot === 'gun' ? 'GUN' : 'SHIP'}</small>
                  <b>{u.name}</b>
                  {id !== 'repair' && (
                    <span className="pips">
                      {u.levels.map((_, i) => (
                        <i key={i} className={i <= lvl ? 'on' : ''} />
                      ))}
                    </span>
                  )}
                  <span className="what">{u.levels[Math.min(lvl, u.levels.length - 1)]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {paused && (
        <div className="overlay pausemenu" data-ui>
          <h2>Paused</h2>
          <button className="btn primary" onClick={() => setPause(false)}>
            Resume
          </button>
          <button className="btn" onClick={onQuit}>
            Quit run
          </button>
        </div>
      )}
      <UpdateBanner />
    </div>
  );
}
