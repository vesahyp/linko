import { useCallback, useState } from 'react';
import { Game, type RunSummary } from './ui/Game';
import { UpdateBanner } from './ui/Update';
import { BUILD_NAME } from './version';
import { STAGES } from './game/content';
import type { SimState } from './game/state';
import { goFullscreen, iPhoneSafari } from './ui/safe';

type Screen = { kind: 'title' } | { kind: 'run'; seed: number; from: SimState | null } | { kind: 'dead'; r: RunSummary; best: boolean };

const BEST_KEY = 'linko.best';

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'title' });
  const [best, setBest] = useState(loadBest);

  const start = () => {
    goFullscreen();
    const asked = Number(new URLSearchParams(location.search).get('seed'));
    setScreen({ kind: 'run', seed: asked || (Date.now() ^ (Math.random() * 1e9)) >>> 0, from: null });
  };
  const onEnd = useCallback(
    (r: RunSummary) => {
      const isBest = r.score > best;
      if (isBest) {
        setBest(r.score);
        try {
          localStorage.setItem(BEST_KEY, String(r.score));
        } catch {
          /* private mode: no best kept */
        }
      }
      setScreen({ kind: 'dead', r, best: isBest });
    },
    [best],
  );
  const onQuit = useCallback(() => setScreen({ kind: 'title' }), []);

  return (
    <>
      <div className="rotate">
        <b>Turn your phone sideways</b>
        <span>Linko plays in landscape.</span>
      </div>
      {screen.kind === 'title' && (
        <div className="screen title">
          <h1>LINKO</h1>
          <p className="tag">Charge the beam. Launch the pod. Dodge everything.</p>
          <button className="btn primary big" onClick={start}>
            Play
          </button>
          <ul className="how">
            <li>
              <b>Left thumb</b>: drag anywhere on the left to fly. The ship follows your thumb.
            </li>
            <li>
              <b>Right thumb</b>: hold to charge the beam, lift to fire. The guns fire by themselves.
            </li>
            <li>
              <b>POD</b>: launch it ahead, tap again to call it back. It blocks shots.
            </li>
            <li>
              Shoot the <b>glass carriers</b> for crystals: red spread, blue laser, yellow homing.
            </li>
          </ul>
          {iPhoneSafari() && <p className="install">For full screen on iPhone: tap Share, then Add to Home Screen, and play from the home screen icon.</p>}
          <p className="foot">
            {best ? `Best ${best.toLocaleString('en')} · ` : ''}build {BUILD_NAME}
          </p>
        </div>
      )}
      {screen.kind === 'run' && <Game key={screen.seed} seed={screen.seed} from={screen.from} onEnd={onEnd} onQuit={onQuit} />}
      {screen.kind === 'dead' && (
        <div className="screen dead">
          <h2>
            Ship lost on stage {screen.r.stage}: {STAGES[screen.r.stage - 1].name}
          </h2>
          <p className="big-score">
            {screen.r.score.toLocaleString('en')}
            {screen.best && <em> new best</em>}
          </p>
          <p>
            {screen.r.kills} kills · {screen.r.tally.bosses} {screen.r.tally.bosses === 1 ? 'boss' : 'bosses'} · {screen.r.tally.formations} formations wiped · {Math.round(screen.r.time)} s
          </p>
          <div className="row">
            <button className="btn primary big" onClick={() => setScreen({ kind: 'run', seed: (screen.r.sim.seed + 1) >>> 0, from: screen.r.sim })}>
              Continue stage {screen.r.stage}
            </button>
            <button className="btn" onClick={start}>
              New run
            </button>
            <button className="btn" onClick={() => setScreen({ kind: 'title' })}>
              Title
            </button>
          </div>
          <p className="foot">A continue keeps your ship and starts the stage again with the score at zero.</p>
        </div>
      )}
      {screen.kind !== 'run' && <UpdateBanner />}
    </>
  );
}
