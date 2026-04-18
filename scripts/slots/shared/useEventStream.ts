// Stable-hook wrapper around ModuleEventsApi.subscribe.
//
// Slot impls use this to subscribe to the `resolverEvents` stream and fold
// events into local state (chip placements, projectile flights, etc.) without
// re-subscribing on every render.

import { useEffect, useRef, useState } from '../../_stub/moduleApi';
import type { ModuleEventsApi } from '../../_stub/moduleApi';

/**
 * Subscribe to a stream and derive a value from it via a reducer.
 *
 * The reducer is held in a ref so updating it doesn't re-subscribe; the
 * component only re-renders when `reduce` returns a new reference value.
 *
 * @param events       ModuleEventsApi from slot props.
 * @param streamId     Event stream id (HVCD: 'resolverEvents').
 * @param initial      Initial state value.
 * @param reduce       (state, event) => nextState — pure, called on every event.
 */
export function useEventStream<E, S>(
  events: ModuleEventsApi,
  streamId: string,
  initial: S,
  reduce: (state: S, event: E) => S,
): S {
  const [state, setState] = useState<S>(initial);
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;

  useEffect(() => {
    const unsub = events.subscribe<E>(streamId, (event) => {
      setState((prev) => reduceRef.current(prev, event));
    });
    return unsub;
  }, [events, streamId]);

  return state;
}
