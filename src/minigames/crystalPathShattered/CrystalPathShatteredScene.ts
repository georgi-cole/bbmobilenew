import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  type FederatedPointerEvent,
} from 'pixi.js';
import type {
  BridgeRow,
  GlassBridgePhase,
  GlassBridgePlayerProgress,
  TileSide,
} from '../../features/glassBridge/glassBridgeSlice';
import {
  buildTokenStack,
  getInitials,
  SAFE_CONFIRM_MS,
  STEP_SUSPENSE_DELAY_MS,
  type CrystalPathShatteredAnimation,
  WRONG_CRACK_MS,
  WRONG_FALL_MS,
  WRONG_SHATTER_MS,
} from './crystalPathShatteredLogic';
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin';

interface ParticipantView {
  id: string;
  name: string;
  isHuman: boolean;
}

interface SceneState {
  phase: GlassBridgePhase;
  rows: BridgeRow[];
  rowsCount: number;
  currentPlayerRow: number;
  currentTurnIndex: number;
  turnOrder: string[];
  participants: ParticipantView[];
  progress: Record<string, GlassBridgePlayerProgress>;
  activeAnimation: CrystalPathShatteredAnimation | null;
  inputEnabled: boolean;
  humanId: string | null;
  onTileSelect?: (side: TileSide) => void;
}

interface Particle {
  sprite: Sprite;
  speed: number;
  phase: number;
  sway: number;
}

interface RowMetrics {
  y: number;
  leftX: number;
  rightX: number;
  tileWidth: number;
  tileHeight: number;
  laneGlowWidth: number;
  laneThickness: number;
  perspective: number;
}

const PARTICLE_COUNT = 20;
const DEFAULT_SCENE_WIDTH = 360;
const DEFAULT_SCENE_HEIGHT = 520;
const TOKEN_RADIUS = 14;
const ACTIVE_TOKEN_GLOW_OFFSET = 10;
const FINISHED_TOKEN_GLOW_OFFSET = 7;
const DEFAULT_TOKEN_GLOW_OFFSET = 4;
const BOARD_TOP_PADDING = 34;
const BOARD_BOTTOM_PADDING = 30;
const FALL_TRIGGER_MS = STEP_SUSPENSE_DELAY_MS + WRONG_CRACK_MS + WRONG_SHATTER_MS * 0.65;
const SHAKE_DURATION_MS = 240;
const SHAKE_STRENGTH = 5;
const BEAM_TOP_WIDTH_RATIO = 0.08;
const BEAM_BOTTOM_WIDTH_RATIO = 0.035;
const BEAM_HEIGHT_RATIO = 0.56;
const PANEL_CORNER_RADIUS = 8;
const PANEL_THICKNESS_RATIO = 0.18;
const PANEL_INSET_RATIO = 0.06;
const REFLECTION_SWEEP_MS = 1100;
const ROW_SPACING_OFFSET = 2.2;

export class CrystalPathShatteredScene {
  private readonly app: Application;

  // Layer order inside the Pixi playfield: abyss/chamber background, particles, bridge/tile geometry,
  // in-scene tokens, then transient FX like safe pulses, cracks, shards, and fall trails.
  private readonly root = new Container();

  private readonly backgroundLayer = new Container();

  private readonly particleLayer = new Container();

  private readonly boardLayer = new Container();

  private readonly tokenLayer = new Container();

  private readonly fxLayer = new Container();

  private readonly particles: Particle[] = [];

  private readonly sceneVariationSeed = cryptoSeed();

  private state: SceneState;

  private elapsedMs = 0;

  constructor(app: Application, initialState: SceneState) {
    this.app = app;
    this.state = initialState;

    this.root.addChild(
      this.backgroundLayer,
      this.particleLayer,
      this.boardLayer,
      this.tokenLayer,
      this.fxLayer,
    );
    this.app.stage.addChild(this.root);
    this.buildParticles();
    this.drawBackground();
    this.app.ticker.add(this.tick);
    this.render();
  }

  update(nextState: SceneState) {
    this.state = nextState;
    this.render();
  }

  resize() {
    this.drawBackground();
    this.reseedParticles();
    this.render();
  }

  destroy() {
    this.app.ticker.remove(this.tick);
    this.root.removeFromParent();
    this.root.destroy({ children: true });
  }

  private readonly tick = (ticker: { deltaTime: number; deltaMS: number }) => {
    this.elapsedMs += ticker.deltaMS;
    const width = this.app.renderer.width || DEFAULT_SCENE_WIDTH;
    const height = this.app.renderer.height || DEFAULT_SCENE_HEIGHT;

    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index];
      particle.sprite.y -= particle.speed * ticker.deltaTime;
      particle.sprite.x += Math.sin(this.elapsedMs * 0.0012 + particle.phase) * particle.sway;
      if (particle.sprite.y < -12) {
        particle.sprite.y = height + (index % 5) * 16;
        particle.sprite.x = width * (((index * 37) % 100) / 100);
      }
    }

    if (this.state.activeAnimation || this.state.inputEnabled) {
      this.render();
    }
  };

  private drawBackground() {
    this.backgroundLayer.removeChildren().forEach((child) => child.destroy());
    const width = this.app.renderer.width || DEFAULT_SCENE_WIDTH;
    const height = this.app.renderer.height || DEFAULT_SCENE_HEIGHT;
    const centerX = width / 2;

    const base = new Graphics()
      .rect(0, 0, width, height)
      .fill({ color: 0x02030a, alpha: 1 });

    const overheadBeam = new Graphics()
      .poly([
        centerX - width * BEAM_TOP_WIDTH_RATIO,
        0,
        centerX + width * BEAM_TOP_WIDTH_RATIO,
        0,
        centerX + width * BEAM_BOTTOM_WIDTH_RATIO,
        height * BEAM_HEIGHT_RATIO,
        centerX - width * BEAM_BOTTOM_WIDTH_RATIO,
        height * BEAM_HEIGHT_RATIO,
      ])
      .fill({ color: 0xf9ffff, alpha: 0.04 });

    const beamCore = new Graphics()
      .poly([
        centerX - width * 0.045,
        0,
        centerX + width * 0.045,
        0,
        centerX + width * 0.018,
        height * 0.58,
        centerX - width * 0.018,
        height * 0.58,
      ])
      .fill({ color: 0xffffff, alpha: 0.045 });

    const chamberGlow = new Graphics()
      .ellipse(centerX, height * 0.18, width * 0.18, height * 0.06)
      .fill({ color: 0x00e5ff, alpha: 0.08 });

    const rigLines = new Graphics();
    const stageLighting = new Graphics();
    for (const offset of [-0.36, -0.22, -0.1, 0.1, 0.22, 0.36]) {
      rigLines.moveTo(centerX, height * 0.06);
      rigLines.lineTo(centerX + width * offset, height * 0.64);
    }
    rigLines.stroke({ color: 0xf8f3d8, width: 1, alpha: 0.06 });
    for (let stringIndex = 0; stringIndex < 3; stringIndex += 1) {
      const inset = stringIndex * 0.05;
      const startX = width * (0.08 + inset);
      const endX = width * (0.92 - inset);
      const y = height * (0.055 + stringIndex * 0.05);
      const midY = y + height * (0.045 + stringIndex * 0.014);
      stageLighting.moveTo(startX, y);
      stageLighting.quadraticCurveTo(centerX, midY, endX, y);
    }
    stageLighting.stroke({ color: 0xffefc6, width: 2.2, alpha: 0.12 });
    for (const anchorX of [width * 0.12, width * 0.22, centerX, width * 0.78, width * 0.88]) {
      stageLighting.ellipse(anchorX, height * 0.1, width * 0.022, height * 0.012)
        .fill({ color: 0xfff6db, alpha: anchorX === centerX ? 0.26 : 0.16 });
    }
    for (const x of [width * 0.09, width * 0.91]) {
      stageLighting.roundRect(x - 1.3, height * 0.18, 2.6, height * 0.62, 2)
        .fill({ color: 0xffefcd, alpha: 0.18 });
    }

    const chamberShadowLeft = new Graphics()
      .ellipse(width * 0.08, height * 0.5, width * 0.22, height * 0.42)
      .fill({ color: 0x000000, alpha: 0.48 });
    const chamberShadowRight = new Graphics()
      .ellipse(width * 0.92, height * 0.5, width * 0.22, height * 0.42)
      .fill({ color: 0x000000, alpha: 0.48 });

    const depthFogUpper = new Graphics()
      .ellipse(centerX, height * 0.72, width * 0.34, height * 0.09)
      .fill({ color: 0x50657f, alpha: 0.035 });
    const depthFogLower = new Graphics()
      .ellipse(centerX, height * 0.84, width * 0.28, height * 0.06)
      .fill({ color: 0x4b5970, alpha: 0.02 });

    const abyssFalloff = new Graphics()
      .rect(0, height * 0.62, width, height * 0.38)
      .fill({ color: 0x000000, alpha: 0.34 });

    const abyss = new Graphics()
      .poly([
        centerX - width * 0.23, height * 0.72,
        centerX + width * 0.23, height * 0.72,
        centerX + width * 0.16, height,
        centerX - width * 0.16, height,
      ])
      .fill({ color: 0x000000, alpha: 0.98 });

    const abyssCore = new Graphics()
      .ellipse(centerX, height * 0.92, width * 0.22, height * 0.06)
      .fill({ color: 0x000000, alpha: 1 });

    const bridgeMist = new Graphics()
      .ellipse(centerX, height * 0.74, width * 0.22, height * 0.04)
      .fill({ color: 0x8b9db4, alpha: 0.03 });

    const distantStage = new Graphics()
      .roundRect(width * 0.34, height * 0.16, width * 0.32, height * 0.08, 14)
      .stroke({ color: 0xfff2d6, width: 1.2, alpha: 0.14 });

    const chamberFrame = new Graphics()
      .roundRect(width * 0.03, height * 0.03, width * 0.94, height * 0.94, 34)
      .stroke({ color: 0xb4f2ff, width: 1.25, alpha: 0.04 });

    this.backgroundLayer.addChild(
      base,
      overheadBeam,
      beamCore,
      chamberGlow,
      rigLines,
      stageLighting,
      chamberShadowLeft,
      chamberShadowRight,
      depthFogUpper,
      depthFogLower,
      abyssFalloff,
      abyss,
      abyssCore,
      bridgeMist,
      distantStage,
      chamberFrame,
    );
  }

  private lastRenderKey: string | null = null;

  private buildParticles() {
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.anchor.set(0.5);
      sprite.tint = index % 4 === 0 ? 0xffffff : index % 3 === 0 ? 0xbaf3ff : 0x8dd7ff;
      const size = 1.2 + (index % 3) * 0.8;
      sprite.width = size;
      sprite.height = size;
      sprite.alpha = 0.08 + (index % 5) * 0.03;
      this.particleLayer.addChild(sprite);
      this.particles.push({
        sprite,
        speed: 0.22 + (index % 4) * 0.09,
        phase: index * 0.71,
        sway: 0.16 + (index % 5) * 0.05,
      });
    }
    this.reseedParticles();
  }

  private reseedParticles() {
    const width = this.app.renderer.width || DEFAULT_SCENE_WIDTH;
    const height = this.app.renderer.height || DEFAULT_SCENE_HEIGHT;
    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index];
      particle.sprite.x = width * (0.22 + (((index * 41) % 56) / 100));
      particle.sprite.y = height * (0.46 + (((index * 17) % 52) / 100));
    }
  }

  private getRenderKey(width: number, height: number) {
    return JSON.stringify({
      width,
      height,
      phase: this.state.phase,
      rowsCount: this.state.rowsCount,
      currentPlayerRow: this.state.currentPlayerRow,
      currentTurnIndex: this.state.currentTurnIndex,
      inputEnabled: this.state.inputEnabled,
      rows: this.state.rows,
      activeAnimation: this.state.activeAnimation,
    });
  }

  private render() {
    const width = this.app.renderer.width || DEFAULT_SCENE_WIDTH;
    const height = this.app.renderer.height || DEFAULT_SCENE_HEIGHT;
    const now = Date.now();
    const renderKey = this.getRenderKey(width, height);

    const rowsCount = Math.max(1, this.state.rowsCount);
    const metrics = Array.from({ length: rowsCount }, (_, index) => this.getRowMetrics(index, rowsCount, width, height));
    const shake = this.getCameraShake(now);
    for (const layer of [this.boardLayer, this.tokenLayer, this.fxLayer]) {
      layer.position.set(shake.x, shake.y);
    }

    if (!this.state.activeAnimation && this.lastRenderKey === renderKey) {
      return;
    }

    this.lastRenderKey = renderKey;
    this.boardLayer.removeChildren().forEach((child) => child.destroy());
    this.tokenLayer.removeChildren().forEach((child) => child.destroy());
    this.fxLayer.removeChildren().forEach((child) => child.destroy());

    for (let rowIndex = rowsCount - 1; rowIndex >= 0; rowIndex -= 1) {
      const row = this.state.rows[rowIndex];
      if (!row) continue;
      const rowMetrics = metrics[rowIndex];
      const selectable = this.state.phase === 'playing'
        && this.state.currentPlayerRow === rowIndex + 1
        && this.state.inputEnabled;
      const targetAnimation = this.state.activeAnimation?.rowIndex === rowIndex ? this.state.activeAnimation : null;

      this.boardLayer.addChild(this.createLaneBeam(rowMetrics));
      this.boardLayer.addChild(this.createTile(row, rowIndex, 'left', rowMetrics, selectable, targetAnimation, now));
      this.boardLayer.addChild(this.createTile(row, rowIndex, 'right', rowMetrics, selectable, targetAnimation, now));
    }

    const activePlayerId = this.state.turnOrder[this.state.currentTurnIndex] ?? null;
    const tokens = buildTokenStack(
      {
        phase: this.state.phase,
        seed: 0,
        competitionType: 'LOH',
        participants: this.state.participants,
        rowsCount: this.state.rowsCount,
        rows: this.state.rows,
        globalTimeLimitMs: 0,
        challengeStartTimeMs: null,
        chosenNumbers: {},
        turnOrder: this.state.turnOrder,
        currentTurnIndex: this.state.currentTurnIndex,
        currentPlayerRow: this.state.currentPlayerRow,
        progress: this.state.progress,
        eliminationOrder: [],
        winnerId: null,
        placements: [],
        outcomeResolved: false,
        timerExpired: false,
        humanPlayerId: this.state.humanId,
        humanSpectating: false,
      },
      activePlayerId,
      this.state.activeAnimation,
    );

    for (const token of tokens) {
      const rowMetrics = token.rowIndex <= 0
        ? null
        : metrics[Math.min(token.rowIndex - 1, metrics.length - 1)] ?? null;
      const baseX = rowMetrics
        ? token.side === 'left'
          ? rowMetrics.leftX
          : token.side === 'right'
            ? rowMetrics.rightX
            : width / 2
        : width / 2;
      const baseY = rowMetrics ? rowMetrics.y - rowMetrics.tileHeight * 0.62 : height - 22;
      const tokenPosition = this.resolveAnimatedTokenPosition(token.playerId, baseX, baseY, metrics, height, now);
      this.tokenLayer.addChild(
        this.createToken(
          token.name,
          tokenPosition.x + token.stackIndex * 16 - 8,
          tokenPosition.y - token.stackIndex * 8,
          token.active,
          token.finished,
          tokenPosition.alpha,
          tokenPosition.scale,
          tokenPosition.rotation,
        ),
      );

      if (tokenPosition.trailAlpha > 0) {
        this.fxLayer.addChild(this.createFallTrail(tokenPosition.x, tokenPosition.y, tokenPosition.trailAlpha));
      }
    }

    const activeAnimation = this.state.activeAnimation;
    if (activeAnimation?.type === 'safe') {
      const rowMetrics = metrics[activeAnimation.rowIndex];
      if (rowMetrics) {
        const x = activeAnimation.side === 'left' ? rowMetrics.leftX : rowMetrics.rightX;
        const elapsed = now - activeAnimation.startedAt;
        const pulse = Math.min(1, elapsed / (STEP_SUSPENSE_DELAY_MS + SAFE_CONFIRM_MS));
        const ring = new Graphics()
          .ellipse(x, rowMetrics.y + 3, rowMetrics.tileWidth * (0.28 + pulse * 0.18), rowMetrics.tileHeight * (0.55 + pulse * 0.24))
          .stroke({ color: 0xffffff, width: 2, alpha: 0.44 * (1 - pulse) });
        this.fxLayer.addChild(ring);
      }
    }
  }

  private getRowMetrics(rowIndex: number, rowsCount: number, width: number, height: number): RowMetrics {
    const boardTop = BOARD_TOP_PADDING;
    const boardBottom = height - BOARD_BOTTOM_PADDING;
    const usableHeight = boardBottom - boardTop;
    const depth = rowIndex / Math.max(1, rowsCount - 1);
    const perspective = 1 - depth * 0.34;
    const y = boardBottom - Math.pow(depth, 1.05) * usableHeight * 0.9;
    const rowGap = usableHeight / Math.max(6, rowsCount + ROW_SPACING_OFFSET);
    const laneSpread = width * (0.19 - depth * 0.06);
    const tileWidth = Math.max(64, width * (0.19 + perspective * 0.07));
    const tileHeight = Math.max(18, rowGap * (0.84 + perspective * 0.2));
    return {
      y,
      leftX: width / 2 - laneSpread,
      rightX: width / 2 + laneSpread,
      tileWidth,
      tileHeight,
      laneGlowWidth: tileWidth * 2.18 + laneSpread * 0.28,
      laneThickness: Math.max(5, rowGap * 0.22),
      perspective,
    };
  }

  private createLaneBeam(metrics: RowMetrics) {
    const beam = new Container();
    const bridgeWidth = metrics.laneGlowWidth;
    const bridgeLeft = (metrics.leftX + metrics.rightX) / 2 - bridgeWidth / 2;
    const bridgeTop = metrics.y - metrics.tileHeight * 0.38;
    const bridgeHeight = metrics.tileHeight * 0.9;
    const dividerWidth = Math.max(8, metrics.tileWidth * 0.09);
    const beamFocus = this.getBeamInfluence((metrics.leftX + metrics.rightX) / 2, metrics.y, metrics.tileWidth * 2.3);
    const shadow = new Graphics()
      .roundRect(
        bridgeLeft,
        bridgeTop + bridgeHeight * 0.7,
        bridgeWidth,
        metrics.laneThickness,
        4,
      )
      .fill({ color: 0x000000, alpha: 0.34 });
    const deck = new Graphics()
      .roundRect(
        bridgeLeft,
        bridgeTop,
        bridgeWidth,
        bridgeHeight,
        6,
      )
      .fill({ color: 0x04070d, alpha: 0.82 });
    const beamHit = new Graphics()
      .roundRect(
        bridgeLeft + bridgeWidth * 0.18,
        bridgeTop + 1,
        bridgeWidth * 0.64,
        Math.max(5, bridgeHeight * 0.34),
        6,
      )
      .fill({ color: 0xeaffff, alpha: 0.03 + beamFocus * 0.07 });
    const divider = new Graphics()
      .roundRect(
        (metrics.leftX + metrics.rightX) / 2 - dividerWidth / 2,
        bridgeTop,
        dividerWidth,
        bridgeHeight,
        3,
      )
      .fill({ color: 0x05080d, alpha: 0.94 });
    const leftRail = new Graphics()
      .moveTo(bridgeLeft + 2, bridgeTop + 2)
      .lineTo(bridgeLeft + 2, bridgeTop + bridgeHeight - 2)
      .stroke({ color: 0xf1e2ff, width: 1.2, alpha: 0.28 + metrics.perspective * 0.12 });
    const rightRail = new Graphics()
      .moveTo(bridgeLeft + bridgeWidth - 2, bridgeTop + 2)
      .lineTo(bridgeLeft + bridgeWidth - 2, bridgeTop + bridgeHeight - 2)
      .stroke({ color: 0xf1e2ff, width: 1.2, alpha: 0.28 + metrics.perspective * 0.12 });
    beam.addChild(shadow, deck, beamHit, divider, leftRail, rightRail);
    return beam;
  }

  private createTile(
    row: BridgeRow,
    rowIndex: number,
    side: TileSide,
    metrics: RowMetrics,
    selectable: boolean,
    activeAnimation: CrystalPathShatteredAnimation | null,
    now: number,
  ) {
    const x = side === 'left' ? metrics.leftX : metrics.rightX;
    const y = metrics.y;
    const width = metrics.tileWidth;
    const height = metrics.tileHeight;
    const container = new Container();
    const shadow = new Graphics();
    const underside = new Graphics();
    const glass = new Graphics();
    const paneShade = new Graphics();
    const edgeGlow = new Graphics();
    const reflections = new Graphics();
    const highlight = new Graphics();
    const isBroken = side === 'left' ? row.leftBroken : row.rightBroken;
    const isSafe = row.revealedSafeSide === side;
    const isAnimatingTarget = activeAnimation?.side === side;
    const pulse = selectable ? 0.16 + Math.sin(this.elapsedMs / 340) * 0.06 : isSafe ? 0.12 : 0.02;
    const tileVariant = this.getTileVariant(rowIndex, side);
    const beamInfluence = this.getBeamInfluence(x, y, width);
    const panelInset = Math.max(2, width * PANEL_INSET_RATIO);
    const panelWidth = width - panelInset * 2;
    const panelHeight = height * 0.96;
    const panelLeft = x - panelWidth / 2;
    const panelTop = y - panelHeight * 0.5;
    const panelBottom = panelTop + panelHeight;
    const thickness = Math.max(3, height * PANEL_THICKNESS_RATIO);
    const reflectionXOffset = ((Math.sin(this.elapsedMs / REFLECTION_SWEEP_MS + metrics.perspective * 4 + tileVariant * 5) + 1) / 2) * panelWidth;
    const idleFill = 0x081019;
    const activeFill = 0x0c1d2f;
    const safeFill = 0x1f3e53;
    const fillColor = isSafe ? safeFill : selectable ? activeFill : idleFill;
    const edgeColor = isSafe ? 0xf7ffff : selectable ? 0xcffbff : 0xcbd7ee;
    const edgeAlpha = isSafe ? 0.32 : selectable ? 0.24 : 0.12;
    const baseAlpha = (isSafe ? 0.34 : selectable ? 0.24 : 0.18) + beamInfluence * 0.05 + tileVariant * 0.02;

    if (isBroken || (activeAnimation?.type === 'wrong' && isAnimatingTarget && this.hasAnimationCollapsed(now))) {
      container.addChild(this.createHole(x, y + 2, width, height));
    } else {
      shadow.ellipse(x, panelBottom + height * 0.28, panelWidth * 0.58, thickness * 1.8).fill({ color: 0x000000, alpha: 0.52 - metrics.perspective * 0.08 });
      underside.roundRect(panelLeft, panelBottom - thickness * 0.35, panelWidth, thickness, 4)
        .fill({ color: 0x091019, alpha: 0.96 });
      underside.roundRect(panelLeft + 1, panelBottom - thickness * 0.28, panelWidth - 2, thickness * 0.45, 3)
        .fill({ color: 0xb2c9dd, alpha: 0.06 + beamInfluence * 0.06 });
      glass.roundRect(panelLeft, panelTop, panelWidth, panelHeight, PANEL_CORNER_RADIUS)
        .fill({ color: fillColor, alpha: baseAlpha });
      glass.roundRect(panelLeft + 1.5, panelTop + 1.5, panelWidth - 3, panelHeight * (0.34 + tileVariant * 0.04), PANEL_CORNER_RADIUS - 1)
        .fill({ color: 0xf5fdff, alpha: 0.035 + beamInfluence * 0.06 + (isSafe ? 0.05 : 0) });
      glass.roundRect(panelLeft, panelTop, panelWidth, panelHeight, PANEL_CORNER_RADIUS)
        .stroke({ color: edgeColor, width: 1.15, alpha: edgeAlpha + beamInfluence * 0.08 });
      paneShade.roundRect(panelLeft + 2, panelTop + 2, panelWidth - 4, panelHeight - 4, PANEL_CORNER_RADIUS - 1)
        .fill({ color: 0x000000, alpha: 0.12 + (1 - beamInfluence) * 0.06 });
      edgeGlow.roundRect(panelLeft + 2, panelTop + 2, panelWidth - 4, panelHeight - 4, PANEL_CORNER_RADIUS - 1)
        .stroke({ color: selectable ? 0xaafaff : isSafe ? 0xffffff : 0xdce9f5, width: 0.8, alpha: pulse * 0.45 + beamInfluence * 0.08 });
      reflections.poly([
        panelLeft + panelWidth * (0.08 + tileVariant * 0.08),
        panelTop + 1,
        panelLeft + panelWidth * (0.24 + tileVariant * 0.08),
        panelTop + 1,
        panelLeft + panelWidth * (0.15 + tileVariant * 0.05),
        panelBottom - 3,
        panelLeft + panelWidth * (0.01 + tileVariant * 0.03),
        panelBottom - 3,
      ]).fill({ color: 0xffffff, alpha: 0.05 + beamInfluence * 0.07 + (isSafe ? 0.04 : 0) });
      reflections.poly([
        panelLeft + reflectionXOffset * (0.72 + tileVariant * 0.16),
        panelTop + 2,
        panelLeft + reflectionXOffset * (0.72 + tileVariant * 0.16) + panelWidth * (0.06 + tileVariant * 0.02),
        panelTop + 2,
        panelLeft + reflectionXOffset * (0.72 + tileVariant * 0.16) - panelWidth * (0.01 + tileVariant * 0.02),
        panelBottom - 2,
        panelLeft + reflectionXOffset * (0.72 + tileVariant * 0.16) - panelWidth * (0.08 + tileVariant * 0.02),
        panelBottom - 2,
      ]).fill({ color: 0xffffff, alpha: 0.03 + beamInfluence * 0.06 + (selectable ? 0.02 : 0) });
      reflections.moveTo(panelLeft + panelWidth * (0.48 + tileVariant * 0.08), panelTop + panelHeight * 0.14);
      reflections.lineTo(panelLeft + panelWidth * 0.84, panelTop + panelHeight * (0.34 + tileVariant * 0.08));
      reflections.moveTo(panelLeft + panelWidth * (0.46 - tileVariant * 0.05), panelTop + panelHeight * 0.52);
      reflections.lineTo(panelLeft + panelWidth * 0.84, panelTop + panelHeight * (0.72 - tileVariant * 0.03));
      reflections.stroke({ color: 0xe8f9ff, width: 0.9, alpha: 0.08 + beamInfluence * 0.1 + (isSafe ? 0.08 : 0) });
      highlight.moveTo(panelLeft + 5, panelTop + 2);
      highlight.lineTo(panelLeft + panelWidth * (0.86 + tileVariant * 0.05), panelTop + 2);
      highlight.stroke({ color: 0xffffff, width: 1.15, alpha: 0.12 + beamInfluence * 0.18 + (isSafe ? 0.14 : 0) });
      container.addChild(shadow, underside, glass, paneShade, edgeGlow, reflections, highlight);
    }

    if (selectable) {
      container.addChild(this.createSparkles(x, y, width, height));
    }

    if (activeAnimation?.type === 'wrong' && isAnimatingTarget) {
      const elapsed = now - activeAnimation.startedAt;
      const crackElapsed = Math.max(0, elapsed - STEP_SUSPENSE_DELAY_MS);
      const crackProgress = Math.min(1, crackElapsed / Math.max(1, WRONG_CRACK_MS));
      if (crackProgress > 0) {
        container.addChild(this.createStressFlash(x, y, width, height, crackProgress));
        container.addChild(this.createCracks(x, y, width, height, crackProgress));
      }
      if (crackElapsed > WRONG_CRACK_MS) {
        this.fxLayer.addChild(this.createShards(x, y, width, crackElapsed - WRONG_CRACK_MS));
      }
    }

    container.eventMode = selectable ? 'static' : 'none';
    container.cursor = selectable ? 'pointer' : 'default';
    if (selectable) {
      container.on('pointertap', (_event: FederatedPointerEvent) => {
        this.state.onTileSelect?.(side);
      });
    }
    return container;
  }

  private createHole(x: number, y: number, width: number, height: number) {
    const hole = new Container();
    const panelInset = Math.max(2, width * PANEL_INSET_RATIO);
    const panelWidth = width - panelInset * 2;
    const panelHeight = height * 0.96;
    const panelLeft = x - panelWidth / 2;
    const panelTop = y - panelHeight * 0.5;
    const falloff = new Graphics()
      .ellipse(x, y + height * 2.1, width * 0.9, height * 1.5)
      .fill({ color: 0x02030a, alpha: 0.2 });
    const voidShape = new Graphics()
      .roundRect(panelLeft, panelTop, panelWidth, panelHeight, PANEL_CORNER_RADIUS)
      .fill({ color: 0x000000, alpha: 0.96 });
    const brokenRim = new Graphics()
      .poly([
        panelLeft + 3, panelTop + panelHeight * 0.08,
        panelLeft + panelWidth * 0.24, panelTop,
        panelLeft + panelWidth * 0.56, panelTop + 3,
        panelLeft + panelWidth - 3, panelTop + panelHeight * 0.14,
        panelLeft + panelWidth - 5, panelTop + panelHeight * 0.84,
        panelLeft + panelWidth * 0.68, panelTop + panelHeight - 2,
        panelLeft + panelWidth * 0.3, panelTop + panelHeight - 3,
        panelLeft + 2, panelTop + panelHeight * 0.88,
      ])
      .stroke({ color: 0xd8fbff, width: 2, alpha: 0.38 });
    const innerGlow = new Graphics()
      .roundRect(panelLeft + 4, panelTop + 4, panelWidth - 8, panelHeight - 8, PANEL_CORNER_RADIUS - 2)
      .fill({ color: 0xff6430, alpha: 0.1 });
    const ember = new Graphics()
      .ellipse(x, panelTop + panelHeight * 0.62, width * 0.18, height * 0.18)
      .fill({ color: 0xff7c43, alpha: 0.18 });
    hole.addChild(falloff, voidShape, innerGlow, ember, brokenRim);
    return hole;
  }

  private getBeamInfluence(x: number, y: number, width: number) {
    const sceneWidth = this.app.renderer.width || DEFAULT_SCENE_WIDTH;
    const sceneHeight = this.app.renderer.height || DEFAULT_SCENE_HEIGHT;
    const centerX = sceneWidth / 2;
    const beamHalfWidth = this.getBeamHalfWidthAtY(y, sceneWidth, sceneHeight) + width * 0.18;
    return Math.max(0, 1 - Math.abs(x - centerX) / Math.max(1, beamHalfWidth));
  }

  private getBeamHalfWidthAtY(y: number, width: number, height: number) {
    const clampedY = Math.max(0, Math.min(height * BEAM_HEIGHT_RATIO, y));
    const progress = clampedY / Math.max(1, height * BEAM_HEIGHT_RATIO);
    return width * (BEAM_TOP_WIDTH_RATIO - (BEAM_TOP_WIDTH_RATIO - BEAM_BOTTOM_WIDTH_RATIO) * progress);
  }

  private getTileVariant(rowIndex: number, side: TileSide) {
    const seed = ((this.sceneVariationSeed || 1) % 997) * 0.001 + (rowIndex + 1) * 0.173 + (side === 'left' ? 0.11 : 0.31);
    return (Math.sin(seed * 17.31) + 1) / 2;
  }

  private createSparkles(x: number, y: number, width: number, height: number) {
    const sparkles = new Graphics();
    const breath = 0.35 + Math.sin(this.elapsedMs / 380) * 0.15;
    sparkles.moveTo(x - width * 0.24, y - height * 0.28);
    sparkles.lineTo(x - width * 0.19, y - height * 0.16);
    sparkles.moveTo(x - width * 0.24, y - height * 0.16);
    sparkles.lineTo(x - width * 0.14, y - height * 0.16);
    sparkles.moveTo(x + width * 0.1, y + height * 0.02);
    sparkles.lineTo(x + width * 0.18, y + height * 0.1);
    sparkles.moveTo(x + width * 0.1, y + height * 0.1);
    sparkles.lineTo(x + width * 0.22, y + height * 0.1);
    sparkles.stroke({ color: 0xffffff, width: 1.15, alpha: breath * 0.6 });
    return sparkles;
  }

  private createStressFlash(x: number, y: number, width: number, height: number, progress: number) {
    return new Graphics()
      .roundRect(
        x - width * 0.44,
        y - height * 0.48,
        width * 0.88,
        height * 0.96,
        PANEL_CORNER_RADIUS,
      )
      .fill({ color: 0xff6f3c, alpha: 0.08 + progress * 0.18 });
  }

  private createCracks(x: number, y: number, width: number, height: number, progress: number) {
    const cracks = new Graphics();
    cracks.moveTo(x, y - height * 0.54);
    cracks.lineTo(x - width * 0.16, y - height * 0.08);
    cracks.lineTo(x - width * 0.3, y + height * 0.4);
    cracks.moveTo(x + width * 0.06, y - height * 0.48);
    cracks.lineTo(x + width * 0.18, y - height * 0.02);
    cracks.lineTo(x + width * 0.28, y + height * 0.38);
    cracks.moveTo(x - width * 0.08, y - height * 0.08);
    cracks.lineTo(x + width * 0.02, y + height * 0.3);
    cracks.lineTo(x + width * 0.18, y + height * 0.5);
    cracks.stroke({ color: 0xfdfefe, width: 2, alpha: 0.32 + progress * 0.56 });
    return cracks;
  }

  private createShards(x: number, y: number, width: number, elapsed: number) {
    const shards = new Graphics();
    const progress = Math.min(1, elapsed / Math.max(1, WRONG_SHATTER_MS + WRONG_FALL_MS * 0.54));
    for (let index = 0; index < 12; index += 1) {
      const spread = (index - 5.5) * (width * 0.075);
      const eject = 0.42 + progress * 1.1;
      const rise = progress < 0.24 ? -30 * progress : -8 + progress * 8;
      const drop = Math.max(0, progress - 0.12) * 132;
      const cx = x + spread * eject;
      const cy = y + rise + drop + Math.abs(spread) * 0.1;
      const tint = index % 4 === 0 ? 0xffffff : index % 3 === 0 ? 0xff8b5c : 0xb7fbff;
      shards.poly([
        cx - 8,
        cy - 3,
        cx + 5,
        cy - 8,
        cx + 8,
        cy + 1,
        cx + 2,
        cy + 9,
        cx - 6,
        cy + 5,
      ]).fill({ color: tint, alpha: 0.54 * (1 - progress) });
      if (index < 4) {
        shards.circle(cx, cy + 12, 1.8 + index * 0.2).fill({ color: 0xff8b5c, alpha: 0.28 * (1 - progress) });
      }
    }
    return shards;
  }

  private hasAnimationCollapsed(now: number) {
    const activeAnimation = this.state.activeAnimation;
    if (!activeAnimation || activeAnimation.type !== 'wrong') return false;
    return now - activeAnimation.startedAt > STEP_SUSPENSE_DELAY_MS + WRONG_CRACK_MS + WRONG_SHATTER_MS * 0.45;
  }

  private getCameraShake(now: number) {
    const activeAnimation = this.state.activeAnimation;
    if (!activeAnimation || activeAnimation.type !== 'wrong') {
      return { x: 0, y: 0 };
    }
    const elapsed = now - activeAnimation.startedAt;
    const impactStart = STEP_SUSPENSE_DELAY_MS + WRONG_CRACK_MS + WRONG_SHATTER_MS * 0.18;
    const impactProgress = Math.max(0, elapsed - impactStart);
    if (impactProgress <= 0 || impactProgress > SHAKE_DURATION_MS) {
      return { x: 0, y: 0 };
    }
    const strength = (1 - impactProgress / SHAKE_DURATION_MS) * SHAKE_STRENGTH;
    return {
      x: Math.sin(impactProgress * 0.18) * strength,
      y: Math.cos(impactProgress * 0.24) * strength * 0.55,
    };
  }

  private resolveAnimatedTokenPosition(
    playerId: string,
    x: number,
    y: number,
    metrics: RowMetrics[],
    height: number,
    now: number,
  ) {
    const activeAnimation = this.state.activeAnimation;
    if (!activeAnimation || activeAnimation.playerId !== playerId || activeAnimation.type !== 'wrong') {
      return { x, y, alpha: 1, scale: 1, rotation: 0, trailAlpha: 0 };
    }

    const rowMetrics = metrics[activeAnimation.rowIndex];
    if (!rowMetrics) {
      return { x, y, alpha: 1, scale: 1, rotation: 0, trailAlpha: 0 };
    }

    const targetX = activeAnimation.side === 'left' ? rowMetrics.leftX : rowMetrics.rightX;
    const targetY = rowMetrics.y - rowMetrics.tileHeight * 0.62;
    const elapsed = now - activeAnimation.startedAt;
    if (elapsed <= FALL_TRIGGER_MS) {
      const tension = Math.min(1, elapsed / Math.max(1, FALL_TRIGGER_MS));
      return {
        x: targetX,
        y: targetY - tension * 6,
        alpha: 1,
        scale: 1,
        rotation: -0.22 * tension,
        trailAlpha: 0,
      };
    }

    const fallProgress = Math.min(1, (elapsed - FALL_TRIGGER_MS) / Math.max(1, WRONG_FALL_MS));
    return {
      x: targetX + Math.sin(fallProgress * Math.PI * 2.2) * 11,
      y: targetY + fallProgress * fallProgress * (height * 0.66),
      alpha: fallProgress < 0.78 ? 1 : 1 - (fallProgress - 0.78) / 0.22,
      scale: 1 - fallProgress * 0.34,
      rotation: -0.24 + fallProgress * 1.28,
      trailAlpha: Math.max(0, 0.24 - fallProgress * 0.15),
    };
  }

  private createFallTrail(x: number, y: number, alpha: number) {
    return new Graphics()
      .ellipse(x, y + 18, 12, 34)
      .fill({ color: 0xbdefff, alpha });
  }

  private createToken(
    name: string,
    x: number,
    y: number,
    active: boolean,
    finished: boolean,
    alpha: number,
    scale: number,
    rotation: number,
  ) {
    const container = new Container();
    const shadow = new Graphics()
      .ellipse(0, TOKEN_RADIUS + 6, TOKEN_RADIUS * 0.92, TOKEN_RADIUS * 0.34)
      .fill({ color: 0x000000, alpha: 0.32 });
    const glow = new Graphics()
      .circle(
        0,
        0,
        TOKEN_RADIUS + (active
          ? ACTIVE_TOKEN_GLOW_OFFSET
          : finished
            ? FINISHED_TOKEN_GLOW_OFFSET
            : DEFAULT_TOKEN_GLOW_OFFSET),
      )
      .fill({ color: finished ? 0xffef94 : active ? 0xc6ffff : 0x113050, alpha: active ? 0.42 : 0.22 });
    const chip = new Graphics()
      .circle(0, 0, TOKEN_RADIUS)
      .fill({ color: finished ? 0xf6dc70 : 0x081324, alpha: 0.97 })
      .stroke({ color: active ? 0xffffff : 0xa7eaff, width: 2, alpha: 0.92 });
    const label = new Text({
      text: getInitials(name),
      style: {
        fill: active ? 0xffffff : 0xd9f7ff,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 12,
        fontWeight: '700',
      },
    });
    label.anchor.set(0.5);
    container.addChild(shadow, glow, chip, label);
    container.position.set(x, y);
    container.alpha = Math.max(0, alpha);
    container.scale.set(scale);
    container.rotation = rotation;
    return container;
  }
}
