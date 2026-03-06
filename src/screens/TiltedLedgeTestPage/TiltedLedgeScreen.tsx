import React from 'react';
import TiltedLedge from '../../components/TiltedLedge/TiltedLedge';
import { submitEnduranceResult } from '../../services/challenges';

const TiltedLedgeScreen: React.FC = () => {
  const handleFinish = async (elapsedSeconds: number) => {
    try {
      await submitEnduranceResult({
        challengeId: 'tilted_ledge',
        elapsed_seconds: elapsedSeconds,
        metadata: { platform: 'web' },
      });
      console.log('Submitted endurance time:', elapsedSeconds);
    } catch (err) {
      console.error('Failed to submit tilted ledge result', err);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <h2>Tilted Ledge — Endurance</h2>
      <p>Stay on the ledge as long as you can. Time is your score.</p>
      <TiltedLedge width={900} height={450} onFinish={handleFinish} />
    </div>
  );
};

export default TiltedLedgeScreen;
