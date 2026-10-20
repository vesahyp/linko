import { useEffect, useRef, useState } from 'react';
import { newRun, continueRun, step, DT, pickCard, applyCard, startStage } from '../game/sim';
import type { SimState, Tally } from '../game/state';
import { CARD_BY_ID, ENEMIES, GUN_COLOR, GUN_NAME, STAGES, type CardId, type DropKind } from '../game/content';
import { Renderer } from '../render/renderer';
import { InputController } from '../input/input';
import { audio } from '../audio';
import { UpdateBanner } from './Update';
import { readInsets } from './safe';

export interface RunSummary {
  stage: number;
  loop: number;
  score: number;
  kills: number;
  time: number;
  tally: Tally;
  /** the run's state, for a continue */
  sim: SimState;
}

interface Hud {
  hp: number;
  maxHp: number;
  stage: number;
  score: number;
  gun: SimState['ship']['gun'];
  gunLevel: number;
  charge: number;
  pod: SimState['pod']['mode'];
  boss: { name: string; frac: number; phase: number } | null;
  banner: SimState['banner'];
  hint: string | null;
  phase: SimState['phase'];
  offers: CardId[];
}

const params = new URLSearchParams(location.search);

export function sumTallies(ts: Tally[]): Tally {
  const o: Tally = { hits: 0, hurts: 0, drops: 0, formations: 0, bosses: 0, pings: 0, peakShots: 0, hurtBy: {}, bossTime: 0 };
  for (const t of ts) {
    for (const k of ['hits', 'hurts', 'drops', 'formations', 'bosses', 'pings'] as const) o[k] += t[k];
    for (const [src, n] of Object.entries(t.hurtBy)) o.hurtBy[src] = (o.hurtBy[src] ?? 0) + n;
    o.peakShots = Math.max(o.peakShots, t.peakShots);
  }
  return o;
}

/** ?stage=N starts on stage N with the build a run has by then; ?boss=1 skips to the stage's boss. */
function testRun(seed: number): SimState {
  const stage = Math.max(1, Math.min(STAGES.length, Number(params.get('stage')) || 1));
  const s = newRun(seed, stage);
  if (stage > 1) {
    const sh = s.ship;
    const guns: DropKind[] = ['red', 'blue', 'yellow'];
    sh.gun = (['spread', 'laser', 'homing'] as const)[guns.length % stage];
    sh.gunLevel = Math.min(3, stage);
    sh.speed = stage - 1;
    sh.missiles = Math.min(2, stage - 1);
    sh.bits = stage - 1;
    const cards: CardId[] = ['plates', 'capacitor', 'overdrive'];
    for (let i = 0; i < stage - 1; i++) applyCard(s, cards[i]);
    startStage(s, stage, 0);
  }
  if (params.get('boss')) {
    const script = STAGES[stage - 1].script;
    const at = script[script.length - 1].t - 2;
    s.stageTime = at;
    s.scroll = at * 45;
    s.cursor = script.length - 1;
  }
  // ?god=1: nothing hurts the ship, for screenshots
  if (params.get('god')) s.ship.invuln = 1e9;
  return s;
}

export function Game({ seed, from, onEnd, onQuit }: { seed: number; from: SimState | null; onEnd: (r: RunSummary) => void; onQuit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef<HTMLDivElement>(null);
  const chargeRef = useRef<HTMLDivElement>(null);
  const podRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<SimState | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<Hud | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const root = rootRef.current!;
    const sim = from ? continueRun(from) : testRun(seed);
    simRef.current = sim;
    const w0 = window as unknown as Record<string, unknown>;
    w0.__sim = sim;
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
      renderer.resize(w, h, ins);
      const pr = Math.max(24, Math.min(32, h * 0.075));
      input.podBtn = { x: w - ins.r - pr - 14, y: h - Math.max(ins.b, 4) - pr - 12, r: pr };
      input.scale = renderer.scale;
      const pb = podRef.current;
      if (pb) {
        pb.style.left = `${input.podBtn.x - pr}px`;
        pb.style.top = `${input.podBtn.y - pr}px`;
        pb.style.width = pb.style.height = `${pr * 2}px`;
      }
      w0.__layout = { w, h, scale: renderer.scale, pod: input.podBtn };
    };
    layout();
    window.addEventListener('resize', layout);

    // ?hand=1: the hand (tools/hand.ts) plays. It never feeds the sim: it
    // publishes where its thumbs are, and scripts/playthrough.mjs turns them
    // into real touches on this page.
    type HandT = { tick: (s: SimState, v: { w: number; h: number; scale: number }) => { podTap: boolean }; pick: (s: SimState) => CardId };
    let hand: HandT | null = null;
    if (params.get('hand')) void import('../../tools/hand').then((m) => (hand = new m.Hand(seed) as unknown as HandT));
    let podTaps = 0;
    let pickWant: CardId | null = null;

    const speed = Number(params.get('speed')) || 1;
    let acc = 0;
    let last = performance.now();
    let hudAt = 0;
    let raf = 0;
    let ended = false;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const s = simRef.current!;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      input.ship = { x: s.ship.x, y: s.ship.y };
      if (hand) {
        const thumbs = hand.tick(s, { w: root.clientWidth, h: root.clientHeight, scale: renderer.scale });
        if (thumbs.podTap) podTaps++;
        if (s.phase === 'pick') pickWant ??= hand.pick(s);
        else pickWant = null;
        w0.__hand = { thumbs, podTaps, pick: pickWant };
      }
      if (!pausedRef.current && s.phase !== 'pick') {
        acc += dt * speed;
        let first = true;
        const inp = input.read();
        while (acc >= DT) {
          step(s, first ? inp : { ...inp, release: false, pod: false });
          first = false;
          acc -= DT;
        }
        for (const snd of s.sounds) audio.play(snd);
        s.sounds.length = 0;
      } else acc = 0;
      renderer.draw(s);
      // the thumbs: a ring where each landed, a dot where it is
      for (const [el, th] of [
        [moveRef.current, input.move],
        [chargeRef.current, input.charge],
      ] as const) {
        if (!el) continue;
        el.style.display = th.active ? 'block' : 'none';
        if (th.active) el.style.transform = `translate(${th.x}px, ${th.y}px)`;
      }
      if (now - hudAt > 100 || s.phase !== 'play') {
        hudAt = now;
        const b = s.boss !== null ? s.enemies.find((e) => e.id === s.boss) : null;
        setHud({
          hp: Math.ceil(s.ship.hp),
          maxHp: s.ship.maxHp,
          stage: s.stage,
          score: s.score,
          gun: s.ship.gun,
          gunLevel: s.ship.gunLevel,
          charge: s.ship.charge,
          pod: s.pod.mode,
          boss: b && b.t > 1 ? { name: ENEMIES[b.kind].name, frac: Math.max(0, b.hp / b.maxHp), phase: b.phase } : null,
          banner: s.banner ? { ...s.banner } : null,
          hint: s.hint && s.phase === 'play' ? s.hint.text : null,
          phase: s.phase,
          offers: [...s.offers],
        });
      }
      if (s.phase === 'dead' && s.phaseTime > 2 && !ended) {
        ended = true;
        onEnd({ stage: s.stage, loop: s.loop, score: s.score, kills: s.kills, time: s.time, tally: sumTallies([...s.stageTallies, s.tally]), sim: s });
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
  }, [seed, from, onEnd]);

  const setPause = (p: boolean) => {
    pausedRef.current = p;
    inputRef.current?.reset();
    setPaused(p);
  };

  const pick = (id: CardId) => {
    const s = simRef.current;
    if (!s) return;
    pickCard(s, id);
    inputRef.current?.reset();
    for (const snd of s.sounds) audio.play(snd);
    s.sounds.length = 0;
  };

  const hpFrac = hud ? hud.hp / hud.maxHp : 1;
  return (
    <div className="game" ref={rootRef}>
      <canvas ref={canvasRef} />
      <div className="thumb" ref={moveRef} />
      <div className="thumb charge" ref={chargeRef} />
      <div className={`podbtn ${hud?.pod ?? 'front'}`} ref={podRef}>
        <span>{hud?.pod === 'out' || hud?.pod === 'return' ? 'RECALL' : 'POD'}</span>
      </div>
      {hud && (
        <div className="hud">
          <div className="hull">
            <div className="bar">
              <div className={hpFrac < 0.3 ? 'fill low' : 'fill'} style={{ width: `${hpFrac * 100}%` }} />
            </div>
            <span>{hud.hp}</span>
          </div>
          <div className="gun" style={{ color: GUN_COLOR[hud.gun] }}>
            {GUN_NAME[hud.gun]}
            <span className="pips">
              {[1, 2, 3].map((i) => (
                <i key={i} className={i <= hud.gunLevel ? 'on' : ''} />
              ))}
            </span>
          </div>
          <div className="stage">Stage {hud.stage}</div>
          <div className="score">{hud.score.toLocaleString('en')}</div>
          <button className="pause" data-ui onClick={() => setPause(true)} aria-label="Pause">
            ❚❚
          </button>
        </div>
      )}
      {hud?.boss && (
        <div className="bossbar">
          <span>
            {hud.boss.name}
            {hud.boss.phase > 1 ? ` · phase ${hud.boss.phase}` : ''}
          </span>
          <div className="bar">
            <div className="fill" style={{ width: `${hud.boss.frac * 100}%` }} />
          </div>
        </div>
      )}
      {hud && (
        <div className={`beam ${hud.charge >= 1 ? 'full' : ''}`}>
          <span>BEAM</span>
          <div className="bar">
            <div className="fill" style={{ width: `${hud.charge * 100}%` }} />
          </div>
        </div>
      )}
      {hud?.banner && hud.phase !== 'pick' && (
        <div className={`banner ${hud.banner.text === 'Warning' ? 'warning' : ''}`} style={{ opacity: Math.min(1, hud.banner.life * 2) }}>
          <b>{hud.banner.text}</b>
          <span>{hud.banner.sub}</span>
        </div>
      )}
      {hud?.hint && <div className="hint">{hud.hint}</div>}
      {hud?.phase === 'pick' && (
        <div className="overlay pick" data-ui>
          <h2>Stage {hud.stage} clear</h2>
          <p className="sub">Pick one for the ship</p>
          <div className="cards">
            {hud.offers.map((id) => {
              const c = CARD_BY_ID[id];
              const lvl = simRef.current?.ship.cards[id] ?? 0;
              return (
                <button key={id} className="card" data-id={id} onClick={() => pick(id)}>
                  <b>{c.name}</b>
                  <span className="pips">
                    {c.levels.map((_, i) => (
                      <i key={i} className={i <= lvl ? 'on' : ''} />
                    ))}
                  </span>
                  <span className="what">{c.levels[Math.min(lvl, c.levels.length - 1)]}</span>
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
