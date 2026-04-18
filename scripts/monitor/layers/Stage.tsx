/**
 * Stage background plate — ui-design.md §10b's `<Stage plate={stageId} />`.
 *
 * Placeholder: renders a flat dark gradient. Real stages come from B5's
 * asset-authoring wave as per-stage image/video plates.
 */

import { memo, useMemo } from '../../_stub/moduleApi';
import { useEnqueueDraw } from '../canvasRuntime';

export interface StageProps {
  plate: string;
}

function StageBase({ plate }: StageProps) {
  // TODO: real asset per stage manifest — load plate URL from B5 assets.
  const draw = useMemo(
    () =>
      (ctx: CanvasRenderingContext2D, _frame: number, res: { width: number; height: number }) => {
        const grad = ctx.createLinearGradient(0, 0, 0, res.height);
        grad.addColorStop(0, '#15161c');
        grad.addColorStop(1, '#0a0b10');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, res.width, res.height);
      },
    [],
  );

  useEnqueueDraw(
    { z: 0, layerKey: `stage:${plate}`, draw },
    [plate, draw],
  );

  return null;
}

export const Stage = memo(StageBase);
