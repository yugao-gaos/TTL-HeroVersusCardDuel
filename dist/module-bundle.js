import { jsxs, jsx } from "react/jsx-runtime";
import { memo, useMemo, Color, useState, useRef, useEffect, useFrame, Vector3, Line, CanvasTexture, SRGBColorSpace } from "@tabletoplabs/module-api";
const TABLE_HALF_X = 1.6;
const TABLE_HALF_Z = 2.4;
const RAIL_WIDTH = 0.5;
const RAIL_DEPTH_RECESS = 0.02;
const RAIL_NEAR_Z = -TABLE_HALF_Z + 0.6;
const RAIL_FAR_Z = TABLE_HALF_Z - 0.8;
const RAIL_LENGTH = RAIL_FAR_Z - RAIL_NEAR_Z;
const RAIL_FRAME_CAPACITY = 60;
const P1_CENTER_X = -0.9;
const P2_CENTER_X = 0.9;
function seatCenterX(seatId) {
  return seatId === "p1" ? P1_CENTER_X : P2_CENTER_X;
}
const HP_TRAY_LOCAL = { x: -0.35, y: 0.02, z: 0 };
const RAGE_TRAY_LOCAL = { x: 0.05, y: 0.02, z: 0 };
const POOL_TRAY_LOCAL = { x: 0.45, y: 0.02, z: 0 };
const SEQ_LANE_NEAR_Z = -TABLE_HALF_Z + 1.3;
const SEQ_LANE_FAR_Z = RAIL_NEAR_Z - 0.1;
const SEQ_LANE_WIDTH = 0.45;
const RACK_LOCAL = { x: -0.95, y: 0.25, z: -0.15 };
const RACK_TILT_DEG = 35;
const SIDE_AREA_LOCAL_X_OFFSET = 0.65;
const SIDE_AREA_NEAR_Z = SEQ_LANE_NEAR_Z + 0.2;
const SIDE_AREA_FAR_Z = SEQ_LANE_FAR_Z;
const MONITOR_POS = { x: 0, y: 1.2, z: TABLE_HALF_Z };
const MONITOR_SIZE = { w: 2.2, h: 1.24 };
const PROJECTILE_Y = 0.4;
const PROJECTILE_APEX_Y = 0.9;
const AVATAR_LOCAL = { x: 0, y: 0.3, z: -0.4 };
function frameToRailZ(frame, originFrame = 0) {
  const offset = frame - originFrame;
  const clamped = Math.max(0, Math.min(offset, RAIL_FRAME_CAPACITY));
  const t = clamped / RAIL_FRAME_CAPACITY;
  return RAIL_NEAR_Z + t * RAIL_LENGTH;
}
function seatLaneX(seatId) {
  return seatId === "p1" ? -RAIL_WIDTH / 4 : RAIL_WIDTH / 4;
}
const CABINET_ASSET_UUID = "hvcd.cabinet.chassis.v0";
function CabinetChassisImpl({ assets }) {
  useMemo(() => assets.resolveAssetUrl(CABINET_ASSET_UUID), [assets]);
  const metalColor = useMemo(() => new Color("#3c4148"), []);
  const rimColor = useMemo(() => new Color("#1b1d22"), []);
  const trimColor = useMemo(() => new Color("#ff6b3d"), []);
  const sideHeight = 0.85;
  const sideThickness = 0.18;
  const prosceniumHeight = 1.9;
  const prosceniumDepth = 0.22;
  return /* @__PURE__ */ jsxs("group", { children: [
    /* @__PURE__ */ jsxs(
      "mesh",
      {
        position: [-TABLE_HALF_X - sideThickness / 2, sideHeight / 2 - 0.05, 0],
        castShadow: true,
        receiveShadow: true,
        children: [
          /* @__PURE__ */ jsx("boxGeometry", { args: [sideThickness, sideHeight, TABLE_HALF_Z * 2] }),
          /* @__PURE__ */ jsx("meshStandardMaterial", { color: metalColor, roughness: 0.55, metalness: 0.6 })
        ]
      }
    ),
    /* @__PURE__ */ jsxs(
      "mesh",
      {
        position: [TABLE_HALF_X + sideThickness / 2, sideHeight / 2 - 0.05, 0],
        castShadow: true,
        receiveShadow: true,
        children: [
          /* @__PURE__ */ jsx("boxGeometry", { args: [sideThickness, sideHeight, TABLE_HALF_Z * 2] }),
          /* @__PURE__ */ jsx("meshStandardMaterial", { color: metalColor, roughness: 0.55, metalness: 0.6 })
        ]
      }
    ),
    /* @__PURE__ */ jsxs(
      "mesh",
      {
        position: [0, 0.03, -TABLE_HALF_Z - 0.04],
        castShadow: true,
        children: [
          /* @__PURE__ */ jsx("boxGeometry", { args: [TABLE_HALF_X * 2 + sideThickness * 2, 0.06, 0.08] }),
          /* @__PURE__ */ jsx("meshStandardMaterial", { color: rimColor, roughness: 0.7, metalness: 0.45 })
        ]
      }
    ),
    /* @__PURE__ */ jsxs("group", { position: [0, MONITOR_POS.y, TABLE_HALF_Z], children: [
      /* @__PURE__ */ jsxs("mesh", { position: [0, MONITOR_SIZE.h / 2 + 0.12, prosceniumDepth / 2], children: [
        /* @__PURE__ */ jsx("boxGeometry", { args: [MONITOR_SIZE.w + 0.6, 0.24, prosceniumDepth] }),
        /* @__PURE__ */ jsx("meshStandardMaterial", { color: metalColor, roughness: 0.5, metalness: 0.65 })
      ] }),
      /* @__PURE__ */ jsxs("mesh", { position: [0, -1.24 / 2 - 0.12, prosceniumDepth / 2], children: [
        /* @__PURE__ */ jsx("boxGeometry", { args: [MONITOR_SIZE.w + 0.6, 0.24, prosceniumDepth] }),
        /* @__PURE__ */ jsx("meshStandardMaterial", { color: metalColor, roughness: 0.5, metalness: 0.65 })
      ] }),
      /* @__PURE__ */ jsxs("mesh", { position: [-2.2 / 2 - 0.18, 0, prosceniumDepth / 2], children: [
        /* @__PURE__ */ jsx("boxGeometry", { args: [0.36, prosceniumHeight, prosceniumDepth] }),
        /* @__PURE__ */ jsx("meshStandardMaterial", { color: metalColor, roughness: 0.5, metalness: 0.65 })
      ] }),
      /* @__PURE__ */ jsxs("mesh", { position: [MONITOR_SIZE.w / 2 + 0.18, 0, prosceniumDepth / 2], children: [
        /* @__PURE__ */ jsx("boxGeometry", { args: [0.36, prosceniumHeight, prosceniumDepth] }),
        /* @__PURE__ */ jsx("meshStandardMaterial", { color: metalColor, roughness: 0.5, metalness: 0.65 })
      ] }),
      /* @__PURE__ */ jsxs("mesh", { position: [0, MONITOR_SIZE.h / 2 + 0.12, prosceniumDepth + 1e-3], children: [
        /* @__PURE__ */ jsx("boxGeometry", { args: [MONITOR_SIZE.w + 0.3, 0.02, 6e-3] }),
        /* @__PURE__ */ jsx(
          "meshStandardMaterial",
          {
            color: trimColor,
            emissive: trimColor,
            emissiveIntensity: 1.3
          }
        )
      ] })
    ] }),
    [-1, 1].map(
      (sideSign) => Array.from({ length: 8 }, (_, i) => {
        const z = -TABLE_HALF_Z + 0.25 + i * ((TABLE_HALF_Z * 2 - 0.5) / 7);
        return /* @__PURE__ */ jsxs(
          "mesh",
          {
            position: [
              sideSign * (TABLE_HALF_X + sideThickness + 1e-3),
              0.25,
              z
            ],
            rotation: [0, 0, sideSign * Math.PI / 2],
            children: [
              /* @__PURE__ */ jsx("cylinderGeometry", { args: [0.015, 0.015, 0.012, 8] }),
              /* @__PURE__ */ jsx("meshStandardMaterial", { color: "#1a1a1a", roughness: 0.3, metalness: 0.9 })
            ]
          },
          `rivet-${sideSign}-${i}`
        );
      })
    )
  ] });
}
const CabinetChassis = memo(CabinetChassisImpl);
function FrameTicksBase({
  originFrame = 0,
  count = RAIL_FRAME_CAPACITY,
  y = 2e-3
}) {
  const ticks = useMemo(() => {
    const result = [];
    for (let i = 0; i <= count; i++) {
      const z = frameToRailZ(originFrame + i, originFrame);
      result.push({
        position: [0, y, z],
        major: i % 5 === 0
      });
    }
    return result;
  }, [originFrame, count, y]);
  return /* @__PURE__ */ jsxs("group", { children: [
    ticks.map((tick, i) => /* @__PURE__ */ jsxs("mesh", { position: tick.position, children: [
      /* @__PURE__ */ jsx(
        "boxGeometry",
        {
          args: [
            tick.major ? RAIL_WIDTH * 0.85 : RAIL_WIDTH * 0.6,
            2e-3,
            tick.major ? 8e-3 : 4e-3
          ]
        }
      ),
      /* @__PURE__ */ jsx(
        "meshStandardMaterial",
        {
          color: tick.major ? "#2b2b2b" : "#555555",
          roughness: 1
        }
      )
    ] }, i)),
    /* @__PURE__ */ jsxs("mesh", { position: [0, y, RAIL_NEAR_Z - 0.02], children: [
      /* @__PURE__ */ jsx("boxGeometry", { args: [RAIL_WIDTH, 4e-3, 0.01] }),
      /* @__PURE__ */ jsx("meshStandardMaterial", { color: "#1a1a1a" })
    ] })
  ] });
}
const FrameTicks = memo(FrameTicksBase);
function PlayheadBase({
  position,
  width,
  height = 0.35,
  color = "#aee4ff"
}) {
  const colorObj = useMemo(() => new Color(color), [color]);
  return /* @__PURE__ */ jsxs("group", { position, children: [
    /* @__PURE__ */ jsxs("mesh", { position: [0, height / 2, 0], children: [
      /* @__PURE__ */ jsx("boxGeometry", { args: [width, height, 8e-3] }),
      /* @__PURE__ */ jsx(
        "meshStandardMaterial",
        {
          color: colorObj,
          emissive: colorObj,
          emissiveIntensity: 1.6,
          transparent: true,
          opacity: 0.55
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("mesh", { position: [0, 4e-3, 0], children: [
      /* @__PURE__ */ jsx("boxGeometry", { args: [width * 1.1, 8e-3, 0.03] }),
      /* @__PURE__ */ jsx("meshStandardMaterial", { color: colorObj, emissive: colorObj, emissiveIntensity: 0.9 })
    ] })
  ] });
}
const Playhead = memo(PlayheadBase);
const KIND_COLOR = {
  hit: "#d94a3e",
  grab: "#8b3fb8",
  projectile: "#3fb8d9",
  parry: "#d9b83f",
  effect: "#3fb8a5",
  block: "#3f6ed9",
  armor: "#d98a3f",
  evasion: "#5fd13f",
  reflect: "#a43fd9",
  cancel: "#f5f5f5",
  stun: "#e8564d",
  knockdown: "#e8564d",
  "effect-end": "#3fb8a5"
};
const ATTACK_KINDS = /* @__PURE__ */ new Set(["hit", "grab", "projectile", "parry", "effect"]);
const DEFENSE_KINDS = /* @__PURE__ */ new Set(["block", "armor", "evasion", "reflect"]);
function TokenChipBase({
  position,
  kind,
  fromPool = false,
  armed = false,
  hitCancel = false,
  dim = false
}) {
  const baseColor = KIND_COLOR[kind] ?? "#888888";
  const color = useMemo(() => new Color(baseColor), [baseColor]);
  const emissive = useMemo(
    () => new Color(baseColor).multiplyScalar(kind === "stun" || kind === "knockdown" ? 0.9 : 0.25),
    [baseColor, kind]
  );
  const isAttack = ATTACK_KINDS.has(kind);
  const isDefense = DEFENSE_KINDS.has(kind);
  const isCancel = kind === "cancel";
  const isEffect = kind === "effect" || kind === "stun" || kind === "knockdown" || kind === "effect-end";
  const radius = isCancel ? 0.036 : 0.042;
  const height = isCancel ? 8e-3 : 0.018;
  const segments = isAttack ? 6 : isDefense ? 24 : isCancel ? 32 : 24;
  const emissiveIntensity = dim ? 0.08 : isEffect ? 0.9 : armed ? 0.6 : 0.15;
  const opacity = dim ? 0.55 : 1;
  const hasGoldRing = kind === "knockdown";
  const hasGoldCore = isCancel && armed;
  return /* @__PURE__ */ jsxs("group", { position, children: [
    /* @__PURE__ */ jsxs("mesh", { castShadow: true, children: [
      /* @__PURE__ */ jsx("cylinderGeometry", { args: [radius, radius, height, segments] }),
      /* @__PURE__ */ jsx(
        "meshStandardMaterial",
        {
          color,
          emissive,
          emissiveIntensity,
          roughness: isCancel ? 0.25 : 0.5,
          metalness: 0.2,
          transparent: dim,
          opacity
        }
      )
    ] }),
    hasGoldRing ? /* @__PURE__ */ jsxs("mesh", { position: [0, height / 2 + 2e-3, 0], children: [
      /* @__PURE__ */ jsx("torusGeometry", { args: [radius * 1.05, 4e-3, 8, 24] }),
      /* @__PURE__ */ jsx("meshStandardMaterial", { color: "#d9b83f", emissive: "#d9b83f", emissiveIntensity: 0.9 })
    ] }) : null,
    hasGoldCore ? /* @__PURE__ */ jsxs("mesh", { position: [0, height / 2 + 2e-3, 0], children: [
      /* @__PURE__ */ jsx("cylinderGeometry", { args: [radius * 0.5, radius * 0.5, height * 0.6, 24] }),
      /* @__PURE__ */ jsx("meshStandardMaterial", { color: "#d9b83f", emissive: "#d9b83f", emissiveIntensity: 0.8 })
    ] }) : null,
    fromPool ? /* @__PURE__ */ jsxs("mesh", { position: [radius * 0.9, 0, 0], children: [
      /* @__PURE__ */ jsx("boxGeometry", { args: [radius * 0.15, height * 1.05, radius * 0.25] }),
      /* @__PURE__ */ jsx("meshStandardMaterial", { color: "#000", roughness: 0.9 })
    ] }) : null,
    isCancel && hitCancel ? /* @__PURE__ */ jsxs("mesh", { position: [0, height / 2 + 3e-3, 0], children: [
      /* @__PURE__ */ jsx("ringGeometry", { args: [radius * 0.9, radius, 24] }),
      /* @__PURE__ */ jsx("meshBasicMaterial", { color: "#ffffff" })
    ] }) : null
  ] });
}
const TokenChip = memo(TokenChipBase);
function useEventStream(events, streamId, initial, reduce2) {
  const [state, setState] = useState(initial);
  const reduceRef = useRef(reduce2);
  reduceRef.current = reduce2;
  useEffect(() => {
    const unsub = events.subscribe(streamId, (event) => {
      setState((prev) => reduceRef.current(prev, event));
    });
    return unsub;
  }, [events, streamId]);
  return state;
}
const INITIAL$6 = {
  tokens: [],
  cursorGlobalFrame: 0,
  cursorFrac: 0,
  originFrame: 0
};
function reduceRail(state, event) {
  switch (event.kind) {
    case "showdown-started":
      return {
        ...state,
        cursorGlobalFrame: event.startGlobalFrame,
        cursorFrac: 0,
        originFrame: event.startGlobalFrame
      };
    case "cursor-advanced":
      return { ...state, cursorGlobalFrame: event.newGlobalFrame, cursorFrac: 0 };
    case "showdown-paused":
      return { ...state, cursorFrac: 0 };
    case "window-tokens-placed": {
      const [cardStart, cardEnd] = event.frames;
      const newTokens = [];
      for (let f = cardStart; f <= cardEnd; f++) {
        const global = event.cardStartGlobalFrame + f;
        newTokens.push({
          id: `${event.cardId}@${event.seat}@${event.windowKind}@${global}`,
          seat: event.seat,
          kind: event.windowKind,
          frame: global,
          fromPool: event.payload.fromPool,
          armed: event.payload.armed,
          hitCancel: event.payload.hitCancel,
          dim: event.windowKind === "effect"
        });
      }
      return { ...state, tokens: [...state.tokens, ...newTokens] };
    }
    case "stun-placed":
    case "knockdown-placed": {
      const [start, end] = event.frames;
      const kind = event.kind === "stun-placed" ? "stun" : "knockdown";
      const newTokens = [];
      for (let f = start; f <= end; f++) {
        newTokens.push({
          id: `${kind}@${event.seat}@${f}`,
          seat: event.seat,
          kind,
          frame: f
        });
      }
      return { ...state, tokens: [...state.tokens, ...newTokens] };
    }
    case "block-stun-extended": {
      const [start, end] = event.extensionFrames;
      const newTokens = [];
      for (let f = start; f < start + event.tokensPlaced && f <= end; f++) {
        newTokens.push({
          id: `block-ext@${event.seat}@${f}`,
          seat: event.seat,
          kind: "block",
          frame: f,
          fromPool: true
        });
      }
      return { ...state, tokens: [...state.tokens, ...newTokens] };
    }
    default:
      return state;
  }
}
function TimelineRailImpl({ events }) {
  const state = useEventStream(
    events,
    "resolverEvents",
    INITIAL$6,
    reduceRail
  );
  const playheadP1Ref = useRef(null);
  const playheadP2Ref = useRef(null);
  const FRAMES_PER_SEC = 8;
  useFrame((_threeState, delta) => {
    const effectiveFrame = state.cursorGlobalFrame + state.cursorFrac + delta * FRAMES_PER_SEC * 0;
    const z = frameToRailZ(effectiveFrame, state.originFrame);
    if (playheadP1Ref.current) playheadP1Ref.current.position.z = z;
    if (playheadP2Ref.current) playheadP2Ref.current.position.z = z;
  });
  const cursorZ = useMemo(
    () => frameToRailZ(state.cursorGlobalFrame, state.originFrame),
    [state.cursorGlobalFrame, state.originFrame]
  );
  return /* @__PURE__ */ jsxs("group", { children: [
    /* @__PURE__ */ jsxs(
      "mesh",
      {
        position: [0, -RAIL_DEPTH_RECESS / 2, RAIL_NEAR_Z + RAIL_LENGTH / 2],
        receiveShadow: true,
        children: [
          /* @__PURE__ */ jsx("boxGeometry", { args: [RAIL_WIDTH, RAIL_DEPTH_RECESS, RAIL_LENGTH] }),
          /* @__PURE__ */ jsx("meshStandardMaterial", { color: "#1f2228", roughness: 0.9, metalness: 0.2 })
        ]
      }
    ),
    /* @__PURE__ */ jsx(FrameTicks, { originFrame: state.originFrame, y: 1e-3 }),
    /* @__PURE__ */ jsx("group", { ref: playheadP1Ref, position: [seatLaneX("p1"), 0, cursorZ], children: /* @__PURE__ */ jsx(Playhead, { position: [0, 0, 0], width: RAIL_WIDTH / 2 - 0.02 }) }),
    /* @__PURE__ */ jsx("group", { ref: playheadP2Ref, position: [seatLaneX("p2"), 0, cursorZ], children: /* @__PURE__ */ jsx(Playhead, { position: [0, 0, 0], width: RAIL_WIDTH / 2 - 0.02 }) }),
    state.tokens.map((token) => /* @__PURE__ */ jsx(
      TokenChip,
      {
        position: [
          seatLaneX(token.seat),
          0.01,
          frameToRailZ(token.frame, state.originFrame)
        ],
        kind: token.kind,
        fromPool: token.fromPool,
        armed: token.armed,
        hitCancel: token.hitCancel,
        dim: token.dim
      },
      token.id
    ))
  ] });
}
const TimelineRail = memo(TimelineRailImpl);
function Card3DBase({
  position,
  rotation = [0, 0, 0],
  width = 0.22,
  height = 0.32,
  face = "down",
  frontColor = "#d4c79a",
  backColor = "#2a2e55",
  frameCost = null
}) {
  const showFront = face === "up";
  const cardColor = useMemo(
    () => new Color(showFront ? frontColor : backColor),
    [showFront, frontColor, backColor]
  );
  const thickness = 6e-3;
  return /* @__PURE__ */ jsxs("group", { position, rotation, children: [
    /* @__PURE__ */ jsxs("mesh", { castShadow: true, receiveShadow: true, children: [
      /* @__PURE__ */ jsx("boxGeometry", { args: [width, thickness, height] }),
      /* @__PURE__ */ jsx("meshStandardMaterial", { color: cardColor, roughness: 0.7 })
    ] }),
    frameCost != null ? /* @__PURE__ */ jsxs("mesh", { position: [0, thickness / 2 + 5e-4, 0], children: [
      /* @__PURE__ */ jsx("planeGeometry", { args: [width * 0.85, 0.01] }),
      /* @__PURE__ */ jsx("meshBasicMaterial", { color: "#f2c14e" })
    ] }) : null
  ] });
}
const Card3D = memo(Card3DBase);
const INITIAL$5 = { slots: { p1: [], p2: [] } };
function reduce$4(state, event) {
  switch (event.kind) {
    case "slot-committed": {
      const slots = state.slots[event.seat].slice();
      slots.splice(event.slotIndex, 0, {
        key: `${event.seat}-${event.slotIndex}-${Math.random().toString(36).slice(2, 8)}`,
        slotIndex: event.slotIndex,
        frameCost: event.slot.frameCost,
        kindHint: event.slot.kind
      });
      return { slots: { ...state.slots, [event.seat]: slots } };
    }
    case "slot-discarded-from-sequence": {
      const slots = state.slots[event.seat].filter((s) => s.slotIndex !== event.slotIndex);
      return { slots: { ...state.slots, [event.seat]: slots } };
    }
    case "slot-reordered": {
      const slots = state.slots[event.seat].slice();
      const [moved] = slots.splice(event.fromIndex, 1);
      if (moved) slots.splice(event.toIndex, 0, moved);
      return { slots: { ...state.slots, [event.seat]: slots } };
    }
    case "slot-dequeued": {
      const slots = state.slots[event.seat].slice(1);
      return { slots: { ...state.slots, [event.seat]: slots } };
    }
    case "reveal-beat": {
      const next = { slots: { p1: [], p2: [] } };
      Object.keys(event.publishedBySeat).forEach((seat) => {
        next.slots[seat] = event.publishedBySeat[seat].slotFrameCosts.map((cost, i) => ({
          key: `${seat}-reveal-${i}`,
          slotIndex: i,
          frameCost: cost
        }));
      });
      return next;
    }
    default:
      return state;
  }
}
function SequenceLaneImpl({ seatId, events }) {
  const state = useEventStream(
    events,
    "resolverEvents",
    INITIAL$5,
    reduce$4
  );
  const seatSlots = state.slots[seatId];
  const slotDepth = (SEQ_LANE_FAR_Z - SEQ_LANE_NEAR_Z) / 12;
  const MIN_FRAME = 1;
  const MAX_FRAME = 10;
  const positioned = useMemo(
    () => seatSlots.map((slot, i) => {
      const normalizedWidth = Math.min(Math.max(slot.frameCost, MIN_FRAME), MAX_FRAME) / MAX_FRAME * SEQ_LANE_WIDTH;
      return {
        slot,
        position: [
          seatCenterX(seatId),
          8e-3,
          SEQ_LANE_NEAR_Z + slotDepth * (i + 0.5)
        ],
        width: normalizedWidth,
        // block-spacer visual differs slightly (ui §5 spacer tile rendering)
        face: slot.kindHint === "block-spacer" ? "up" : "down",
        frontColor: slot.kindHint === "block-spacer" ? "#3f6ed9" : "#d4c79a"
      };
    }),
    [seatSlots, seatId, slotDepth]
  );
  return /* @__PURE__ */ jsxs("group", { children: [
    /* @__PURE__ */ jsxs(
      "mesh",
      {
        position: [
          seatCenterX(seatId),
          1e-3,
          (SEQ_LANE_NEAR_Z + SEQ_LANE_FAR_Z) / 2
        ],
        children: [
          /* @__PURE__ */ jsx(
            "planeGeometry",
            {
              args: [SEQ_LANE_WIDTH + 0.04, SEQ_LANE_FAR_Z - SEQ_LANE_NEAR_Z + 0.04]
            }
          ),
          /* @__PURE__ */ jsx("meshStandardMaterial", { color: "#16181c", roughness: 0.9 })
        ]
      }
    ),
    positioned.map(({ slot, position, width, face, frontColor }) => /* @__PURE__ */ jsx(
      Card3D,
      {
        position,
        width,
        face,
        frontColor,
        frameCost: slot.frameCost
      },
      slot.key
    ))
  ] });
}
const SequenceLane = memo(SequenceLaneImpl);
function ChipBase({
  position,
  color,
  radius = 0.045,
  thickness = 0.018,
  emissiveIntensity = 0,
  notched = false
}) {
  const colorObj = useMemo(() => new Color(color), [color]);
  const emissive = useMemo(() => new Color(color).multiplyScalar(0.4), [color]);
  return /* @__PURE__ */ jsxs("group", { position, children: [
    /* @__PURE__ */ jsxs("mesh", { castShadow: true, receiveShadow: true, children: [
      /* @__PURE__ */ jsx("cylinderGeometry", { args: [radius, radius, thickness, 24] }),
      /* @__PURE__ */ jsx(
        "meshStandardMaterial",
        {
          color: colorObj,
          emissive,
          emissiveIntensity,
          roughness: 0.45,
          metalness: 0.15
        }
      )
    ] }),
    notched ? /* @__PURE__ */ jsxs("mesh", { position: [radius * 0.9, 0, 0], rotation: [0, 0, 0], children: [
      /* @__PURE__ */ jsx("boxGeometry", { args: [radius * 0.15, thickness * 1.05, radius * 0.25] }),
      /* @__PURE__ */ jsx("meshStandardMaterial", { color: "#000000", roughness: 0.9 })
    ] }) : null
  ] });
}
const Chip = memo(ChipBase);
const DEFAULT_HP = 16;
const DEFAULT_RAGE_MAX = 20;
const DEFAULT_POOL_MAX = 6;
const INITIAL$4 = {
  seats: {
    p1: {
      hp: DEFAULT_HP,
      hpMax: DEFAULT_HP,
      rage: 0,
      rageMax: DEFAULT_RAGE_MAX,
      pool: DEFAULT_POOL_MAX,
      poolMax: DEFAULT_POOL_MAX,
      poolDimmed: 0
    },
    p2: {
      hp: DEFAULT_HP,
      hpMax: DEFAULT_HP,
      rage: 0,
      rageMax: DEFAULT_RAGE_MAX,
      pool: DEFAULT_POOL_MAX,
      poolMax: DEFAULT_POOL_MAX,
      poolDimmed: 0
    }
  }
};
function reduce$3(state, event) {
  switch (event.kind) {
    case "match-started": {
      const next = { seats: { ...state.seats } };
      Object.keys(event.setup.seats).forEach((seat) => {
        const s = event.setup.seats[seat];
        next.seats[seat] = {
          hp: s.hp,
          hpMax: s.hp,
          rage: s.rage,
          rageMax: DEFAULT_RAGE_MAX,
          pool: s.blockPool,
          poolMax: s.blockPool,
          poolDimmed: 0
        };
      });
      return next;
    }
    case "damage-applied":
      return {
        seats: {
          ...state.seats,
          [event.seat]: { ...state.seats[event.seat], hp: event.hpAfter }
        }
      };
    case "hp-restored":
      return {
        seats: {
          ...state.seats,
          [event.seat]: { ...state.seats[event.seat], hp: event.hpAfter }
        }
      };
    case "rage-gained":
    case "rage-paid":
      return {
        seats: {
          ...state.seats,
          [event.seat]: { ...state.seats[event.seat], rage: event.rageAfter }
        }
      };
    case "block-pool-consumed":
      return {
        seats: {
          ...state.seats,
          [event.seat]: {
            ...state.seats[event.seat],
            pool: event.poolAfter,
            poolDimmed: event.reason === "spacer-commit" ? state.seats[event.seat].poolDimmed + event.amount : state.seats[event.seat].poolDimmed
          }
        }
      };
    case "block-pool-refilled":
      return {
        seats: {
          ...state.seats,
          [event.seat]: {
            ...state.seats[event.seat],
            pool: event.poolAfter,
            poolDimmed: 0
          }
        }
      };
    default:
      return state;
  }
}
function hpColor(fraction) {
  if (fraction > 0.6) return "#5fd13f";
  if (fraction > 0.3) return "#e8b04d";
  return "#e8564d";
}
function ChipTrayImpl({ seatId, events }) {
  const state = useEventStream(
    events,
    "resolverEvents",
    INITIAL$4,
    reduce$3
  );
  const counters = state.seats[seatId];
  const baseX = seatCenterX(seatId);
  const baseZ = -TABLE_HALF_Z + 0.35;
  const chipSpacingX = 0.03;
  const hpChips = useMemo(() => {
    const chips = [];
    for (let i = 0; i < counters.hpMax; i++) {
      const filled = i < counters.hp;
      const fraction = counters.hp / Math.max(counters.hpMax, 1);
      chips.push({
        key: `hp-${i}`,
        x: i * chipSpacingX,
        color: filled ? hpColor(fraction) : "#2c2f36",
        pulse: filled && fraction <= 0.3
      });
    }
    return chips;
  }, [counters.hp, counters.hpMax]);
  const rageChips = useMemo(() => {
    const chips = [];
    for (let i = 0; i < counters.rageMax; i++) {
      const filled = i < counters.rage;
      chips.push({
        key: `rage-${i}`,
        x: i * chipSpacingX,
        color: filled ? "#d94a3e" : "#2c2f36"
      });
    }
    return chips;
  }, [counters.rage, counters.rageMax]);
  const poolChips = useMemo(() => {
    const chips = [];
    for (let i = 0; i < counters.poolMax; i++) {
      const remaining = i < counters.pool;
      const dimmed = i >= counters.pool && i < counters.pool + counters.poolDimmed;
      chips.push({
        key: `pool-${i}`,
        y: i * 0.02,
        color: remaining ? "#3f6ed9" : dimmed ? "#26385a" : "#1a1c20",
        dim: dimmed
      });
    }
    return chips;
  }, [counters.pool, counters.poolMax, counters.poolDimmed]);
  return /* @__PURE__ */ jsxs("group", { position: [baseX, 0, baseZ], children: [
    /* @__PURE__ */ jsxs("group", { position: [HP_TRAY_LOCAL.x, HP_TRAY_LOCAL.y, HP_TRAY_LOCAL.z], children: [
      /* @__PURE__ */ jsxs("mesh", { position: [(counters.hpMax - 1) * chipSpacingX / 2, -0.012, 0], children: [
        /* @__PURE__ */ jsx("boxGeometry", { args: [counters.hpMax * chipSpacingX + 0.02, 0.012, 0.08] }),
        /* @__PURE__ */ jsx("meshStandardMaterial", { color: "#16181c", roughness: 0.9 })
      ] }),
      hpChips.map((c) => /* @__PURE__ */ jsx(
        Chip,
        {
          position: [c.x, 0, 0],
          color: c.color,
          radius: 0.013,
          thickness: 0.01,
          emissiveIntensity: c.pulse ? 0.5 : 0
        },
        c.key
      ))
    ] }),
    /* @__PURE__ */ jsxs("group", { position: [RAGE_TRAY_LOCAL.x, RAGE_TRAY_LOCAL.y, RAGE_TRAY_LOCAL.z], children: [
      /* @__PURE__ */ jsxs("mesh", { position: [(counters.rageMax - 1) * chipSpacingX / 2, -0.012, 0], children: [
        /* @__PURE__ */ jsx("boxGeometry", { args: [counters.rageMax * chipSpacingX + 0.02, 0.012, 0.08] }),
        /* @__PURE__ */ jsx("meshStandardMaterial", { color: "#1a1214", roughness: 0.9 })
      ] }),
      rageChips.map((c) => /* @__PURE__ */ jsx(
        Chip,
        {
          position: [c.x, 0, 0],
          color: c.color,
          radius: 0.013,
          thickness: 0.01
        },
        c.key
      ))
    ] }),
    /* @__PURE__ */ jsx("group", { position: [POOL_TRAY_LOCAL.x, POOL_TRAY_LOCAL.y, POOL_TRAY_LOCAL.z], children: poolChips.map((c) => /* @__PURE__ */ jsx(
      Chip,
      {
        position: [0, c.y, 0],
        color: c.color,
        radius: 0.03,
        thickness: 0.018,
        emissiveIntensity: c.dim ? 0 : 0.05
      },
      c.key
    )) })
  ] });
}
const ChipTray = memo(ChipTrayImpl);
function TetherBase({
  from,
  to,
  color = "#ffe493",
  width = 1.5,
  pulse = 0
}) {
  const points = useMemo(
    () => [
      new Vector3(from[0], from[1], from[2]),
      // midpoint arched up
      new Vector3(
        (from[0] + to[0]) / 2,
        Math.max(from[1], to[1]) + 0.25,
        (from[2] + to[2]) / 2
      ),
      new Vector3(to[0], to[1], to[2])
    ],
    [from, to]
  );
  const effectiveOpacity = 0.6 + 0.35 * Math.min(1, Math.max(0, pulse));
  return /* @__PURE__ */ jsx(
    Line,
    {
      points,
      color,
      lineWidth: width,
      transparent: true,
      opacity: effectiveOpacity,
      dashed: false
    }
  );
}
const Tether = memo(TetherBase);
const INITIAL$3 = {
  seats: { p1: [], p2: [] },
  projectilePositions: {},
  originFrame: 0,
  cursorFrame: 0
};
function reduce$2(state, event) {
  switch (event.kind) {
    case "showdown-started":
      return { ...state, originFrame: event.startGlobalFrame, cursorFrame: event.startGlobalFrame };
    case "cursor-advanced":
      return { ...state, cursorFrame: event.newGlobalFrame };
    case "card-parked-to-side-area": {
      const parked = {
        cardId: event.cardId,
        reason: event.reason,
        ...event.reason === "projectile" ? { projectileId: event.tetherTargetId } : {}
      };
      return {
        ...state,
        seats: {
          ...state.seats,
          [event.seat]: [...state.seats[event.seat], parked]
        }
      };
    }
    case "card-released-from-side-area": {
      const filtered = state.seats[event.seat].filter(
        (c) => c.cardId !== event.cardId
      );
      return {
        ...state,
        seats: { ...state.seats, [event.seat]: filtered }
      };
    }
    case "projectile-launched":
      return {
        ...state,
        projectilePositions: {
          ...state.projectilePositions,
          [event.projectileId]: {
            x: seatLaneX(event.ownerSeat),
            y: PROJECTILE_Y,
            z: frameToRailZ(event.spawnGlobalFrame, state.originFrame)
          }
        }
      };
    case "projectile-arrived": {
      const next = { ...state.projectilePositions };
      delete next[event.projectileId];
      return { ...state, projectilePositions: next };
    }
    case "effect-activated":
      if (event.endGlobalFrame == null) return state;
      return {
        ...state,
        seats: {
          ...state.seats,
          [event.casterSeat]: state.seats[event.casterSeat].map(
            (c, i, arr) => i === arr.length - 1 && c.reason === "standing-effect" ? {
              ...c,
              effectEndFrame: event.endGlobalFrame,
              effectTargetSeat: event.targetSeat
            } : c
          )
        }
      };
    default:
      return state;
  }
}
function SideAreaImpl({ seatId, events }) {
  const state = useEventStream(
    events,
    "resolverEvents",
    INITIAL$3,
    reduce$2
  );
  const parked = state.seats[seatId];
  const sign = seatId === "p1" ? -1 : 1;
  const baseX = seatCenterX(seatId) + sign * SIDE_AREA_LOCAL_X_OFFSET;
  const positioned = useMemo(() => {
    return parked.map((card, i) => {
      const z = SIDE_AREA_NEAR_Z + (SIDE_AREA_FAR_Z - SIDE_AREA_NEAR_Z) / 6 * (i + 0.5);
      const cardPos = [baseX, 0.08, z];
      const tiltX = -Math.PI / 6;
      const cardRot = [tiltX, 0, 0];
      let tetherTarget = null;
      if (card.reason === "projectile" && card.projectileId) {
        const p = state.projectilePositions[card.projectileId];
        if (p) tetherTarget = [p.x, p.y, p.z];
      } else if (card.reason === "standing-effect" && card.effectEndFrame != null && card.effectTargetSeat) {
        tetherTarget = [
          seatLaneX(card.effectTargetSeat),
          0.05,
          frameToRailZ(card.effectEndFrame, state.originFrame)
        ];
      }
      return { card, cardPos, cardRot, tetherTarget };
    });
  }, [parked, baseX, state.projectilePositions, state.originFrame]);
  const pulse = 0.6;
  return /* @__PURE__ */ jsxs("group", { children: [
    /* @__PURE__ */ jsxs(
      "mesh",
      {
        position: [
          baseX,
          1e-3,
          (SIDE_AREA_NEAR_Z + SIDE_AREA_FAR_Z) / 2
        ],
        children: [
          /* @__PURE__ */ jsx("planeGeometry", { args: [0.28, SIDE_AREA_FAR_Z - SIDE_AREA_NEAR_Z + 0.04] }),
          /* @__PURE__ */ jsx("meshStandardMaterial", { color: "#131518", roughness: 0.95 })
        ]
      }
    ),
    positioned.map(({ card, cardPos, cardRot, tetherTarget }) => /* @__PURE__ */ jsxs("group", { children: [
      /* @__PURE__ */ jsx(
        Card3D,
        {
          position: cardPos,
          rotation: cardRot,
          width: 0.18,
          height: 0.26,
          face: "up",
          frontColor: card.reason === "standing-effect" ? "#5fb09a" : "#6aa4c4"
        }
      ),
      tetherTarget ? /* @__PURE__ */ jsx(
        Tether,
        {
          from: cardPos,
          to: tetherTarget,
          color: card.reason === "standing-effect" ? "#8effd9" : "#ffe493",
          pulse: card.reason === "standing-effect" ? pulse : 0
        }
      ) : null
    ] }, `${seatId}-parked-${card.cardId}`))
  ] });
}
const SideArea = memo(SideAreaImpl);
const INITIAL$2 = { items: { p1: [], p2: [] } };
function reduce$1(state, event) {
  switch (event.kind) {
    case "match-started": {
      const next = { items: { p1: [], p2: [] } };
      Object.keys(event.setup.seats).forEach((seat) => {
        next.items[seat] = event.setup.seats[seat].inventory.map((item, i) => ({
          instanceKey: `${seat}-${item.itemId}-${i}`,
          itemId: item.itemId,
          usagesRemaining: item.usages ?? 1
        }));
      });
      return next;
    }
    case "slot-committed": {
      if (event.slot.kind !== "item" || !event.slot.itemId) return state;
      const arr = state.items[event.seat];
      const idx = arr.findIndex((i) => i.itemId === event.slot.itemId);
      if (idx < 0) return state;
      const next = arr.slice();
      next.splice(idx, 1);
      return { items: { ...state.items, [event.seat]: next } };
    }
    case "item-returned-to-inventory": {
      const arr = state.items[event.seat];
      const idx = arr.findIndex((i) => i.itemId === event.itemId);
      if (idx >= 0) {
        const next = arr.slice();
        next[idx] = { ...next[idx], usagesRemaining: event.usagesRemaining };
        return { items: { ...state.items, [event.seat]: next } };
      }
      return {
        items: {
          ...state.items,
          [event.seat]: [
            ...arr,
            {
              instanceKey: `${event.seat}-${event.itemId}-${Date.now()}`,
              itemId: event.itemId,
              usagesRemaining: event.usagesRemaining
            }
          ]
        }
      };
    }
    case "item-consumed":
      return {
        items: {
          ...state.items,
          [event.seat]: state.items[event.seat].filter(
            (i) => i.itemId !== event.itemId
          )
        }
      };
    default:
      return state;
  }
}
function InventoryRackImpl({ seatId, isViewerSeat, events }) {
  if (!isViewerSeat) return null;
  const state = useEventStream(
    events,
    "resolverEvents",
    INITIAL$2,
    reduce$1
  );
  const items = state.items[seatId];
  const tiltRad = RACK_TILT_DEG * Math.PI / 180;
  const positioned = useMemo(() => {
    const itemSpacing = 0.22;
    return items.map((item, i) => ({
      item,
      localPos: [(i - (items.length - 1) / 2) * itemSpacing, 0, 0]
    }));
  }, [items]);
  return /* @__PURE__ */ jsxs(
    "group",
    {
      position: [
        seatCenterX(seatId) + RACK_LOCAL.x,
        RACK_LOCAL.y,
        -TABLE_HALF_Z + RACK_LOCAL.z + 0.2
      ],
      rotation: [-tiltRad, 0, 0],
      children: [
        /* @__PURE__ */ jsxs("mesh", { position: [0, -0.02, 0], children: [
          /* @__PURE__ */ jsx("boxGeometry", { args: [Math.max(0.3, items.length * 0.22 + 0.1), 0.02, 0.28] }),
          /* @__PURE__ */ jsx("meshStandardMaterial", { color: "#2b2d33", roughness: 0.8, metalness: 0.4 })
        ] }),
        /* @__PURE__ */ jsxs("mesh", { position: [0, 0.12, -0.12], rotation: [Math.PI / 2, 0, 0], children: [
          /* @__PURE__ */ jsx("planeGeometry", { args: [Math.max(0.3, items.length * 0.22 + 0.1), 0.28] }),
          /* @__PURE__ */ jsx("meshStandardMaterial", { color: "#1c1e22", roughness: 0.95 })
        ] }),
        positioned.map(({ item, localPos }) => /* @__PURE__ */ jsxs("group", { position: localPos, children: [
          /* @__PURE__ */ jsx(
            Card3D,
            {
              position: [0, 0.01, 0],
              width: 0.18,
              height: 0.26,
              face: "up",
              frontColor: "#c9a25e"
            }
          ),
          /* @__PURE__ */ jsx("group", { position: [-0.06, 0.02, 0.1], children: Array.from({ length: Math.max(1, item.usagesRemaining) }).map((_, i) => /* @__PURE__ */ jsxs("mesh", { position: [i * 0.022, 1e-3, 0], children: [
            /* @__PURE__ */ jsx("cylinderGeometry", { args: [8e-3, 8e-3, 4e-3, 12] }),
            /* @__PURE__ */ jsx(
              "meshStandardMaterial",
              {
                color: i < item.usagesRemaining ? "#f6d86a" : "#3a3a3a",
                emissive: i < item.usagesRemaining ? "#f6d86a" : "#000",
                emissiveIntensity: 0.35
              }
            )
          ] }, `pip-${i}`)) })
        ] }, item.instanceKey))
      ]
    }
  );
}
const InventoryRack = memo(InventoryRackImpl);
const MONITOR_INTERNAL_W = 720;
const MONITOR_INTERNAL_H = 405;
function MonitorMeshImpl(_props) {
  const canvas = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = MONITOR_INTERNAL_W;
    c.height = MONITOR_INTERNAL_H;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#0a0c12";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#ff6b3d";
      ctx.font = "bold 64px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("HVCD MONITOR", c.width / 2, c.height / 2 - 20);
      ctx.fillStyle = "#6f7685";
      ctx.font = "20px sans-serif";
      ctx.fillText(
        "Remotion composition mounts here (B4)",
        c.width / 2,
        c.height / 2 + 40
      );
    }
    return c;
  }, []);
  const texture = useMemo(() => {
    if (!canvas) return null;
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [canvas]);
  const textureRef = useRef(texture);
  textureRef.current = texture;
  useEffect(() => {
    if (typeof window === "undefined" || !texture) return;
    const hook = {
      canvas,
      tick: () => {
        if (textureRef.current) textureRef.current.needsUpdate = true;
      },
      /** B4 calls this if its composition owns its own canvas. */
      setCanvas: (_c) => {
      }
    };
    window.__hvcdMonitor = hook;
    return () => {
      if (window.__hvcdMonitor === hook) {
        delete window.__hvcdMonitor;
      }
    };
  }, [canvas, texture]);
  useEffect(() => {
    return () => {
      texture?.dispose();
    };
  }, [texture]);
  if (!texture) {
    return null;
  }
  return /* @__PURE__ */ jsxs("group", { position: [MONITOR_POS.x, MONITOR_POS.y, MONITOR_POS.z], children: [
    /* @__PURE__ */ jsxs("mesh", { rotation: [0, Math.PI, 0], children: [
      /* @__PURE__ */ jsx("planeGeometry", { args: [MONITOR_SIZE.w, MONITOR_SIZE.h] }),
      /* @__PURE__ */ jsx("meshBasicMaterial", { map: texture, toneMapped: false })
    ] }),
    /* @__PURE__ */ jsxs("mesh", { position: [0, 0, -0.01], children: [
      /* @__PURE__ */ jsx("planeGeometry", { args: [MONITOR_SIZE.w + 0.06, MONITOR_SIZE.h + 0.06] }),
      /* @__PURE__ */ jsx("meshStandardMaterial", { color: "#0a0c12", roughness: 0.9 })
    ] })
  ] });
}
const MonitorMesh = memo(MonitorMeshImpl);
const INITIAL$1 = {
  projectiles: [],
  originFrame: 0,
  cursorFrame: 0
};
function reduce(state, event) {
  switch (event.kind) {
    case "showdown-started":
      return { ...state, originFrame: event.startGlobalFrame, cursorFrame: event.startGlobalFrame };
    case "cursor-advanced":
      return { ...state, cursorFrame: event.newGlobalFrame };
    case "projectile-launched": {
      const targetSeat = event.ownerSeat === "p1" ? "p2" : "p1";
      return {
        ...state,
        projectiles: [
          ...state.projectiles,
          {
            id: event.projectileId,
            ownerSeat: event.ownerSeat,
            targetSeat,
            spawnFrame: event.spawnGlobalFrame,
            arrivalFrame: event.arrivalGlobalFrame,
            resolvedAt: null,
            resolvedKind: null
          }
        ]
      };
    }
    case "projectile-arrived":
      return {
        ...state,
        projectiles: state.projectiles.map(
          (p) => p.id === event.projectileId ? { ...p, resolvedAt: event.atGlobalFrame, resolvedKind: "landed" } : p
        )
      };
    case "projectile-clashed": {
      const aDead = event.aRemainingHits <= 0;
      const bDead = event.bRemainingHits <= 0;
      return {
        ...state,
        projectiles: state.projectiles.map((p) => {
          if (p.id === event.aProjectileId && aDead) {
            return { ...p, resolvedAt: event.atGlobalFrame, resolvedKind: "clashed" };
          }
          if (p.id === event.bProjectileId && bDead) {
            return { ...p, resolvedAt: event.atGlobalFrame, resolvedKind: "clashed" };
          }
          return p;
        })
      };
    }
    case "projectile-reflected": {
      const newTarget = event.newOwnerSeat === "p1" ? "p2" : "p1";
      return {
        ...state,
        projectiles: state.projectiles.map(
          (p) => p.id === event.projectileId ? {
            ...p,
            ownerSeat: event.newOwnerSeat,
            targetSeat: newTarget,
            spawnFrame: state.cursorFrame,
            arrivalFrame: event.newArrivalGlobalFrame,
            resolvedKind: "reflected"
          } : p
        )
      };
    }
    default:
      return state;
  }
}
function ProjectileMesh({ projectile, cursorFrameRef, originFrame }) {
  const groupRef = useRef(null);
  useFrame(() => {
    if (!groupRef.current) return;
    const cursor = cursorFrameRef.current;
    const totalFrames = Math.max(1, projectile.arrivalFrame - projectile.spawnFrame);
    const rawT = (cursor - projectile.spawnFrame) / totalFrames;
    const t = Math.max(0, Math.min(1, rawT));
    const fromX = seatLaneX(projectile.ownerSeat);
    const toX = seatLaneX(projectile.targetSeat);
    const x = fromX + (toX - fromX) * t;
    const fromZ = frameToRailZ(projectile.spawnFrame, originFrame);
    const toZ = frameToRailZ(projectile.arrivalFrame, originFrame);
    const z = fromZ + (toZ - fromZ) * t;
    const y = PROJECTILE_Y + (PROJECTILE_APEX_Y - PROJECTILE_Y) * 4 * t * (1 - t);
    groupRef.current.position.set(x, y, z);
    groupRef.current.visible = projectile.resolvedAt == null || t < 1.05;
  });
  return /* @__PURE__ */ jsxs("group", { ref: groupRef, children: [
    /* @__PURE__ */ jsxs("mesh", { castShadow: true, children: [
      /* @__PURE__ */ jsx("sphereGeometry", { args: [0.06, 16, 12] }),
      /* @__PURE__ */ jsx(
        "meshStandardMaterial",
        {
          color: "#3fb8d9",
          emissive: "#3fb8d9",
          emissiveIntensity: 1.3
        }
      )
    ] }),
    /* @__PURE__ */ jsxs("mesh", { children: [
      /* @__PURE__ */ jsx("sphereGeometry", { args: [0.11, 12, 10] }),
      /* @__PURE__ */ jsx("meshBasicMaterial", { color: "#3fb8d9", transparent: true, opacity: 0.18 })
    ] })
  ] });
}
function ProjectileLayerImpl({ events }) {
  const state = useEventStream(
    events,
    "resolverEvents",
    INITIAL$1,
    reduce
  );
  const cursorFrameRef = useRef(state.cursorFrame);
  cursorFrameRef.current = state.cursorFrame;
  const live = useMemo(() => state.projectiles, [state.projectiles]);
  return /* @__PURE__ */ jsx("group", { children: live.map((p) => /* @__PURE__ */ jsx(
    ProjectileMesh,
    {
      projectile: p,
      cursorFrameRef,
      originFrame: state.originFrame
    },
    p.id
  )) });
}
const ProjectileLayer = memo(ProjectileLayerImpl);
const INITIAL = { currentEmote: "idle", emoteStartedAt: 0 };
function reducerForSeat(seatId) {
  return function reduce2(state, event) {
    const now = Date.now();
    switch (event.kind) {
      case "damage-applied":
        if (event.seat === seatId) {
          return { currentEmote: "flinch", emoteStartedAt: now };
        }
        return state;
      case "hit-parried":
        if (event.parrierSeat === seatId) {
          return { currentEmote: "smirk", emoteStartedAt: now };
        }
        return state;
      case "knockdown-placed":
        if (event.seat !== seatId) {
          return { currentEmote: "nod", emoteStartedAt: now };
        }
        return state;
      case "ko":
        if (event.losingSeat !== seatId) {
          return { currentEmote: "cheer", emoteStartedAt: now };
        }
        return state;
      default:
        return state;
    }
  };
}
function AvatarRigImpl({ seatId, events }) {
  const reduce2 = useMemo(() => reducerForSeat(seatId), [seatId]);
  const state = useEventStream(
    events,
    "resolverEvents",
    INITIAL,
    reduce2
  );
  const torsoRef = useRef(null);
  const handLRef = useRef(null);
  const handRRef = useRef(null);
  useFrame((_threeState, delta) => {
    if (!torsoRef.current) return;
    const time = performance.now() / 1e3;
    const breath = Math.sin(time * 1.2) * 6e-3;
    torsoRef.current.position.y = 0.3 + breath;
    if (handLRef.current) {
      handLRef.current.position.y = 0.42 + Math.sin(time * 0.9 + 0.4) * 0.012;
    }
    if (handRRef.current) {
      handRRef.current.position.y = 0.42 + Math.sin(time * 0.9) * 0.012;
    }
    const elapsed = (Date.now() - state.emoteStartedAt) / 1e3;
    const fade = Math.max(0, 1 - elapsed / 0.8);
    if (fade > 0) {
      switch (state.currentEmote) {
        case "flinch":
          torsoRef.current.position.z = -0.02 * fade;
          torsoRef.current.rotation.x = -0.08 * fade;
          break;
        case "smirk":
          torsoRef.current.rotation.y = 0.04 * Math.sin(time * 12) * fade;
          break;
        case "nod":
          torsoRef.current.rotation.x = 0.12 * Math.sin(time * 8) * fade;
          break;
        case "cheer":
          if (handLRef.current && handRRef.current) {
            handLRef.current.position.y = 0.42 + 0.18 * fade;
            handRRef.current.position.y = 0.42 + 0.18 * fade;
          }
          break;
      }
    } else if (state.currentEmote !== "idle") {
      torsoRef.current.position.z = 0;
      torsoRef.current.rotation.x = 0;
      torsoRef.current.rotation.y = 0;
    }
  });
  const baseX = seatCenterX(seatId) + AVATAR_LOCAL.x;
  const baseY = AVATAR_LOCAL.y;
  const baseZ = -TABLE_HALF_Z - 0.4 + AVATAR_LOCAL.z;
  const bodyColor = seatId === "p1" ? "#3f6ed9" : "#d94a3e";
  const headColor = seatId === "p1" ? "#8ec0ff" : "#ffc0b0";
  return /* @__PURE__ */ jsxs("group", { position: [baseX, baseY, baseZ], children: [
    /* @__PURE__ */ jsxs("group", { ref: torsoRef, position: [0, 0.3, 0], children: [
      /* @__PURE__ */ jsxs("mesh", { position: [0, 0, 0], castShadow: true, children: [
        /* @__PURE__ */ jsx("boxGeometry", { args: [0.32, 0.48, 0.22] }),
        /* @__PURE__ */ jsx("meshStandardMaterial", { color: bodyColor, roughness: 0.7 })
      ] }),
      /* @__PURE__ */ jsxs("mesh", { position: [0, 0.38, 0], castShadow: true, children: [
        /* @__PURE__ */ jsx("boxGeometry", { args: [0.22, 0.22, 0.22] }),
        /* @__PURE__ */ jsx("meshStandardMaterial", { color: headColor, roughness: 0.6 })
      ] })
    ] }),
    /* @__PURE__ */ jsx("group", { ref: handLRef, position: [-0.28, 0.42, 0.25], children: /* @__PURE__ */ jsxs("mesh", { castShadow: true, children: [
      /* @__PURE__ */ jsx("boxGeometry", { args: [0.1, 0.08, 0.12] }),
      /* @__PURE__ */ jsx("meshStandardMaterial", { color: headColor, roughness: 0.6 })
    ] }) }),
    /* @__PURE__ */ jsx("group", { ref: handRRef, position: [0.28, 0.42, 0.25], children: /* @__PURE__ */ jsxs("mesh", { castShadow: true, children: [
      /* @__PURE__ */ jsx("boxGeometry", { args: [0.1, 0.08, 0.12] }),
      /* @__PURE__ */ jsx("meshStandardMaterial", { color: headColor, roughness: 0.6 })
    ] }) })
  ] });
}
const AvatarRig = memo(AvatarRigImpl);
const SLOT_BINDINGS = [
  // Registry-authoritative ids
  ["hvcd.cabinet", CabinetChassis],
  ["hvcd.timelineRail", TimelineRail],
  ["hvcd.sequenceLanes", SequenceLane],
  ["hvcd.chipTrays", ChipTray],
  ["hvcd.inventoryRack", InventoryRack],
  ["hvcd.monitorMesh", MonitorMesh],
  ["hvcd.projectileLayer", ProjectileLayer],
  ["hvcd.avatarRig", AvatarRig],
  // Alias / not-yet-registry ids (see doc comment above)
  ["hvcd.cabinetChassis", CabinetChassis],
  ["hvcd.sequenceLane", SequenceLane],
  ["hvcd.chipTray", ChipTray],
  ["hvcd.sideArea", SideArea]
];
function register(api) {
  for (const [slotId, component] of SLOT_BINDINGS) {
    api.registerRendererSlot(slotId, component);
  }
}
export {
  register as default
};
//# sourceMappingURL=module-bundle.js.map
