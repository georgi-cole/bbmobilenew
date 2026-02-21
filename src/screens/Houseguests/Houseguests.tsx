import { useState } from 'react';
import { useAppSelector } from '../../store/hooks';
import { selectAlivePlayers, selectEvictedPlayers } from '../../store/gameSlice';
import PlayerAvatar from '../../components/ui/PlayerAvatar';
import HouseguestProfile from '../../components/HouseguestProfile/HouseguestProfile';
import type { Player } from '../../types';
import './Houseguests.css';

export default function Houseguests() {
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const evictedPlayers = useAppSelector(selectEvictedPlayers);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  return (
    <div className="placeholder-screen houseguests-screen">
      <h1 className="placeholder-screen__title">👥 Houseguests</h1>

      <section>
        <h2 className="placeholder-screen__section">Active ({alivePlayers.length})</h2>
        <div className="houseguests-screen__grid">
          {alivePlayers.map((p) => (
            <PlayerAvatar key={p.id} player={p} size="lg" onSelect={setSelectedPlayer} />
          ))}
        </div>
      </section>

      {evictedPlayers.length > 0 && (
        <section>
          <h2 className="placeholder-screen__section">Evicted / Jury ({evictedPlayers.length})</h2>
          <div className="houseguests-screen__grid houseguests-screen__grid--out">
            {evictedPlayers.map((p) => (
              <PlayerAvatar key={p.id} player={p} size="md" onSelect={setSelectedPlayer} />
            ))}
          </div>
        </section>
      )}

      {selectedPlayer && (
        <HouseguestProfile
          player={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}
