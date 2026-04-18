// -----------------------------------------------------------------------------
// TEMPORARY SHIM — DO NOT SHIP
//
// Per hvcd-tabletop-contracts/game-module-manifest.md OQ-1 resolution, Remotion
// lives in the higher-trust bundle alongside renderer-slot impls. Once Agent A1
// publishes `@tabletoplabs/module-api`, Remotion primitives will be exposed via
// a dedicated subpath:
//
//     import { Composition, Sequence, useCurrentFrame }
//       from '@tabletoplabs/module-api/remotion';
//
// Until that subpath lands, the monitor composition pipeline
// (`scripts/monitor/*`) imports from here and gets the primitives directly from
// the upstream `remotion` package.
//
// Required runtime dependency (declare in the bundle builder, not here):
//     "remotion": "^4.0.0"
//
// When the platform subpath is available:
//   1. Replace every `from '../_stub/remotionApi'` with
//      `from '@tabletoplabs/module-api/remotion'`.
//   2. Delete this file.
//
// Production modules are BANNED from directly importing `remotion`. This file
// is the ONLY place in the module where that direct import appears; it is
// clearly labeled and scheduled for removal.
// -----------------------------------------------------------------------------

/* eslint-disable import/no-extraneous-dependencies */

// Core composition primitives.
export {
  Composition,
  Sequence,
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  Series,
  Loop,
} from 'remotion';

export type {
  CompositionProps,
  SequenceProps,
} from 'remotion';
