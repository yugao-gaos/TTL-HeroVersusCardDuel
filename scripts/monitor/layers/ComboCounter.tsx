/**
 * Combo counter — ui-design.md §10b `<ComboCounter events={events} />`.
 *
 * HUD-style corner display of the current combo hit count. Reads combo state
 * via the selector so it's resilient to event reordering.
 */

import { memo, useMemo } from '../../_stub/moduleApi';
import { useEnqueueDraw } from '../canvasRuntime';
import { selectComboState } from '../eventSelectors';
import type { ResolverEvent } from '../../resolver/types';

export interface ComboCounterProps {
  events: readonly ResolverEvent[];
}

const COMBO_COUNTER_Z = 90;

function ComboCounterBase({ events }: ComboCounterProps) {
  const combo = useMemo(() => selectComboState(events), [events]);

  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, _frame: number, res: { width: number; height: number }) => {
        if (combo.hitCount <= 0 || combo.attackerSeat === null) return;
        const anchorLeft = combo.attackerSeat === 'p1';
        const x = anchorLeft ? 24 : res.width - 24;
        const y = res.height * 0.3;

        ctx.save();
        ctx.textAlign = anchorLeft ? 'left' : 'right';

        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.font = 'bold 42px system-ui, sans-serif';
        const count = String(combo.hitCount);
        ctx.strokeText(count, x, y);
        ctx.fillText(count, x, y);

        ctx.fillStyle = '#ffd860';
        ctx.font = 'bold 16px system-ui, sans-serif';
        ctx.fillText('HIT COMBO', x, y + 22);

        ctx.restore();
      },
    [combo.hitCount, combo.attackerSeat],
  );

  useEnqueueDraw(
    {
      z: COMBO_COUNTER_Z,
      layerKey: `combo-counter`,
      draw,
    },
    [draw],
  );

  return null;
}

export const ComboCounter = memo(ComboCounterBase);
