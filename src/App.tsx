import { useCallback, useState } from 'react';
import { Game, gravityLine, type RunSummary } from './ui/Game';
import { UpdateBanner } from './ui/Update';
import { BUILD_NAME } from './version';
import { UPGRADE_BY_ID, type UpgradeId } from './game/content';

type Screen = { kind: 'title' } | { kind: 'run'; seed: number } | { kind: 'dead'; r: RunSummary; best: boolean };

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
    const asked = Number(new URLSearchParams(location.search).get('seed'));
    setScreen({ kind: 'run', seed: asked || (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
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
        <span>Linko plays in landscape: left thumb flies, right thumb charges the cannon.</span>
      </div>
      {screen.kind === 'title' && (
        <div className="screen title">
          <h1>LINKO</h1>
          <p className="tag">The planet pulls everything. Use it.</p>
          <button className="btn primary big" onClick={start}>
            Play
          </button>
          <ul className="how">
            <li>
              <b>Left thumb</b> flies the ship. Let go and you fall round the planet.
            </li>
            <li>
              <b>Right thumb</b> charges the wave cannon. Drag to aim, lift to fire. The guns fire by themselves.
            </li>
            <li>
              <b>POD</b> launches the pod; it orbits and shields. Tap again to call it back.
            </li>
          </ul>
          <p className="foot">
            {best ? `Best ${best.toLocaleString('en')} · ` : ''}build {BUILD_NAME}
          </p>
        </div>
      )}
      {screen.kind === 'run' && <Game key={screen.seed} seed={screen.seed} onEnd={onEnd} onQuit={onQuit} />}
      {screen.kind === 'dead' && (
        <div className="screen dead">
          <h2>Ship lost on wave {screen.r.wave}</h2>
          <p className="big-score">
            {screen.r.score.toLocaleString('en')}
            {screen.best && <em> new best</em>}
          </p>
          <p>
            {screen.r.kills} kills · {Math.round(screen.r.time)} s
          </p>
          <p className="grav">{gravityLine(screen.r.tally)}</p>
          <p className="ups">
            {(Object.entries(screen.r.upgrades) as [UpgradeId, number][])
              .filter(([id, v]) => v && id !== 'repair')
              .map(([id, v]) => `${UPGRADE_BY_ID[id].name} ${v}`)
              .join(' · ') || 'No upgrades'}
          </p>
          <div className="row">
            <button className="btn primary big" onClick={start}>
              Play again
            </button>
            <button className="btn" onClick={() => setScreen({ kind: 'title' })}>
              Title
            </button>
          </div>
        </div>
      )}
      {screen.kind !== 'run' && <UpdateBanner />}
    </>
  );
}
