// Tether — glowing line drawn from a parked source card to its in-flight entity
// (projectile) or effect-end token. ui-design.md §6e, §6g.
//
// Wave-2 placeholder: a straight drei <Line>; final behavior is a bezier arc
// that rises up over the rail.

import { memo, useMemo } from '../../_stub/moduleApi';
import { Line } from '../../_stub/moduleApi';
import { Vector3 } from '../../_stub/moduleApi';

export interface TetherProps {
  from: [number, number, number];
  to: [number, number, number];
  color?: string;
  /** Line thickness in pixels (drei Line uses the renderer's line-thickness path). */
  width?: number;
  /** Pulse intensity [0..1] for the effect-active visual cue (ui §6g). */
  pulse?: number;
}

function TetherBase({
  from,
  to,
  color = '#ffe493',
  width = 1.5,
  pulse = 0,
}: TetherProps) {
  const points = useMemo(
    () => [
      new Vector3(from[0], from[1], from[2]),
      // midpoint arched up
      new Vector3(
        (from[0] + to[0]) / 2,
        Math.max(from[1], to[1]) + 0.25,
        (from[2] + to[2]) / 2,
      ),
      new Vector3(to[0], to[1], to[2]),
    ],
    [from, to],
  );
  const effectiveOpacity = 0.6 + 0.35 * Math.min(1, Math.max(0, pulse));

  return (
    <Line
      points={points}
      color={color}
      lineWidth={width}
      transparent
      opacity={effectiveOpacity}
      dashed={false}
    />
  );
}

export const Tether = memo(TetherBase);
