// -----------------------------------------------------------------------------
// TEMPORARY SHIM — DO NOT SHIP
//
// Per hvcd-tabletop-contracts/renderer-slots.md §API-surface-details (and the
// OQ-4 resolution note), HVCD's module bundle must import React, three, R3F,
// and drei through the platform-frozen surface exposed by
// `@tabletoplabs/module-api`. That package is being built concurrently by
// Agent A1 — until it lands and the path alias is wired into this repo's
// tooling, all slot impls and bundle code in `scripts/slots/` and
// `scripts/bundle/` import from here instead.
//
// When `@tabletoplabs/module-api` is available:
//   1. Replace every `from '../_stub/moduleApi'` with `from '@tabletoplabs/module-api'`.
//   2. Delete this file.
//
// Production modules are BANNED from directly importing React / three / R3F /
// drei. This file is the only place in the module where those direct imports
// appear; it is labeled clearly and scheduled for removal.
// -----------------------------------------------------------------------------

/* eslint-disable import/no-extraneous-dependencies */

// React
export {
  Fragment,
  createContext,
  forwardRef,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
export type {
  ComponentType,
  PropsWithChildren,
  ReactNode,
  RefObject,
} from 'react';

// R3F
export { Canvas, useFrame, useThree, useLoader } from '@react-three/fiber';
export type { ThreeEvent } from '@react-three/fiber';

// drei (a small curated surface; platform re-export will define the final set)
export { Text, Line, Html } from '@react-three/drei';

// three
export {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  FrontSide,
  Group,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';

// -----------------------------------------------------------------------------
// Slot contract types — mirror hvcd-tabletop-contracts/renderer-slots.md.
// The real platform re-export will own these; the stub defines just enough for
// TypeScript to compile the slot impls.
// -----------------------------------------------------------------------------

import type { ComponentType } from 'react';

export type SeatId = 'p1' | 'p2';

export interface ViewerIdentity {
  participantId: string;
  userId: string | null;
  seatId: SeatId | null;
  role: 'seated-player' | 'spectator' | 'unseated';
}

export interface ModuleWorldAccess {
  /** Read a snapshot of a module-owned custom-data KV (e.g., tray counters). */
  readSeatData<T = unknown>(seatId: SeatId, path: string): T | undefined;
  /** Enumerate entities of a given kind. Returned shape is platform-TBD. */
  listEntitiesByKind(kind: string): ReadonlyArray<EntitySnapshot>;
  /** Current session match clock — global frame of the cursor. 0 between turns. */
  readonly cursorGlobalFrame: number;
}

export interface EntitySnapshot {
  id: number;
  kind: string;
  position: [number, number, number];
  rotationY: number;
  customData?: Record<string, unknown>;
}

export interface ModuleAssetApi {
  /** Resolve an asset UUID (per asset-protocol.md) to a URL the R3F loader can consume. */
  resolveAssetUrl(assetUuid: string): string | null;
  /** Preload a set of assets; returns a promise that resolves when ready. */
  preload(assetUuids: readonly string[]): Promise<void>;
}

export interface ModuleEventsApi {
  /**
   * Subscribe to a typed event stream. Returns an unsubscribe fn.
   * Handler will be called on the main tick / event schedule.
   */
  subscribe<E = unknown>(streamId: string, handler: (event: E) => void): () => void;
}

export interface GameModuleManifest {
  moduleId: string;
  version: string;
  declarations?: {
    rendererSlots?: Array<{
      slotId: string;
      renderPhase?: string;
      privacy?: string;
      mount?: { type: string; url?: string; allowedOrigins?: string[] };
    }>;
  };
  // (Other fields are read by the platform, not by slot impls.)
}

export interface BaseSlotProps {
  world: ModuleWorldAccess;
  manifest: GameModuleManifest;
  viewer: ViewerIdentity;
  events: ModuleEventsApi;
  assets: ModuleAssetApi;
}

export type SessionSlotProps = BaseSlotProps;

export interface PerSeatSlotProps extends BaseSlotProps {
  seatId: SeatId;
  isViewerSeat: boolean;
}

export interface PerEntitySlotProps extends BaseSlotProps {
  entityId: number;
  entitySnapshot: EntitySnapshot;
}

export type RendererSlotImpl<P extends BaseSlotProps = BaseSlotProps> = ComponentType<P>;

// -----------------------------------------------------------------------------
// ModuleApi — the surface passed into the bundle's default `register(api)` fn.
// Mirrors the `ModuleRegisterApi` shape from game-module-manifest.md.
// -----------------------------------------------------------------------------

/**
 * Platform end-game capability — mirrors PlatformEndGameApi in the real
 * ModuleApi (see TabletopLabs `src/module-host/types.ts`). Exposed via
 * `api.platform` (mount-time) and re-exposed onto sandboxed state-script
 * `ctx.platform` (per Wave 4 ScriptContext extension) so per-tick state
 * scripts can trigger signed, server-to-server outbound POSTs to the
 * project's allow-listed callback URL per session-api.md § End-game
 * capability.
 */
export interface PlatformEndGameApi {
  endGame(args: {
    callbackUrl: string;
    payload: unknown;
    idempotencyKey?: string;
  }): Promise<{ accepted: true; attemptId: string }>;
  /**
   * Returns the project-configured callback URL (per session-api.md §
   * Callback URL allowlist). Modules should NOT hardcode the URL —
   * the platform owns the allowlist + project-dashboard configuration.
   */
  getCallbackUrl(): string;
}

export type PlatformApi = PlatformEndGameApi;

/** Track A10 — module → page event envelope. */
export interface WebSurfaceOutboundMessage {
  kind: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** Track A10 — page → module event envelope (after origin filtering). */
export interface WebSurfaceInboundMessage {
  kind: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface ModuleApi {
  registerRendererSlot<P extends BaseSlotProps>(
    slotId: string,
    component: RendererSlotImpl<P>,
  ): void;
  /**
   * Platform capabilities — currently the end-game capability. HVCD's
   * scripts/states/match-end.ts calls `api.platform.endGame(...)` from
   * the terminal state.
   */
  platform: PlatformApi;

  /**
   * Track A10 — emit a structured event to the WebSurfaceMesh hosting
   * `slotId`. No-op when the slot doesn't have a web-surface mount.
   */
  emitToWebSurface(slotId: string, message: WebSurfaceOutboundMessage): boolean;

  /**
   * Track A10 — subscribe to page → module messages. Off by default;
   * gated by `mount.acceptPageMessages: true` in the manifest.
   */
  subscribeFromWebSurface(
    slotId: string,
    handler: (message: WebSurfaceInboundMessage) => void,
  ): () => void;

  /**
   * Subscribe to platform-to-module event-log events. Currently a global
   * fan-out; Track A4 will replace with typed per-stream subscribers.
   */
  subscribeToEvents<T = unknown>(handler: (event: T) => void): () => void;

  /** Read access to the parsed module manifest. */
  manifest: GameModuleManifest;
  // Other register* methods exist on the real surface; slot impls don't use them.
}

export type ModuleRegister = (api: ModuleApi) => void | Promise<void>;
