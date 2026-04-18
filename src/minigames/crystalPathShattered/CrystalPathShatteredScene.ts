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

export class CrystalPathShatteredScene {
  private readonly app: Application;

  private readonly root = new Container();

  private readonly backgroundLayer = new Container();

  private readonly particleLayer = new Container();

  private readonly boardLayer = new Container();

  private readonly tokenLayer = new Container();

  private readonly fxLayer = new Container();

  private readonly particles: Particle[] = [];

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
        centerX - width * 0.17,
        0,
        centerX + width * 0.17,
        0,
        centerX + width * 0.07,
        height * 0.6,
        centerX - width * 0.07,
        height * 0.6,
      ])
      .fill({ color: 0xe6ffff, alpha: 0.08 });

    const chamberGlow = new Graphics()
      .ellipse(centerX, height * 0.24, width * 0.26, height * 0.12)
      .fill({ color: 0x00e5ff, alpha: 0.15 });

    const chamberShadowLeft = new Graphics()
      .ellipse(width * 0.08, height * 0.5, width * 0.22, height * 0.42)
      .fill({ color: 0x000000, alpha: 0.48 });
    const chamberShadowRight = new Graphics()
      .ellipse(width * 0.92, height * 0.5, width * 0.22, height * 0.42)
      .fill({ color: 0x000000, alpha: 0.48 });

    const fog = new Graphics()
      .ellipse(centerX, height * 0.75, width * 0.42, height * 0.12)
      .fill({ color: 0x6d7fa7, alpha: 0.05 });

    const abyss = new Graphics()
      .ellipse(centerX, height * 0.92, width * 0.38, height * 0.12)
      .fill({ color: 0x000000, alpha: 0.92 });

    const chamberFrame = new Graphics()
      .roundRect(width * 0.03, height * 0.03, width * 0.94, height * 0.94, 34)
      .stroke({ color: 0xb4f2ff, width: 1.5, alpha: 0.07 });

    this.backgroundLayer.addChild(
      base,
      overheadBeam,
      chamberGlow,
      chamberShadowLeft,
      chamberShadowRight,
      fog,
      abyss,
      chamberFrame,
    );
  }

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
      particle.sprite.x = width * (((index * 41) % 100) / 100);
      particle.sprite.y = height * (((index * 17) % 100) / 100);
    }
  }

  private render() {
    const width = this.app.renderer.width || DEFAULT_SCENE_WIDTH;
    const height = this.app.renderer.height || DEFAULT_SCENE_HEIGHT;
    this.boardLayer.removeChildren().forEach((child) => child.destroy());
    this.tokenLayer.removeChildren().forEach((child) => child.destroy());
    this.fxLayer.removeChildren().forEach((child) => child.destroy());

    const rowsCount = Math.max(1, this.state.rowsCount);
    const metrics = Array.from({ length: rowsCount }, (_, index) => this.getRowMetrics(index, rowsCount, width, height));

    for (let rowIndex = rowsCount - 1; rowIndex >= 0; rowIndex -= 1) {
      const row = this.state.rows[rowIndex];
      if (!row) continue;
      const rowMetrics = metrics[rowIndex];
      const selectable = this.state.phase === 'playing'
        && this.state.currentPlayerRow === rowIndex + 1
        && this.state.inputEnabled;
      const targetAnimation = this.state.activeAnimation?.rowIndex === rowIndex ? this.state.activeAnimation : null;

      this.boardLayer.addChild(this.createLaneBeam(rowMetrics));
      this.boardLayer.addChild(this.createTile(row, 'left', rowMetrics, selectable, targetAnimation));
      this.boardLayer.addChild(this.createTile(row, 'right', rowMetrics, selectable, targetAnimation));
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
      const baseY = rowMetrics ? rowMetrics.y - rowMetrics.tileHeight * 0.55 : height - 22;
      const tokenPosition = this.resolveAnimatedTokenPosition(token.playerId, baseX, baseY, metrics, height);
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
        const elapsed = this.elapsedMs - activeAnimation.startedAt;
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
    const depth = rowIndex / Math.max(1, rowsCount - 1);
    const perspective = 1 - depth * 0.3;
    const y = boardBottom - depth * (boardBottom - boardTop);
    const laneSpread = width * (0.25 - depth * 0.09);
    const tileWidth = Math.max(62, width * (0.24 + perspective * 0.08));
    const tileHeight = 18 + perspective * 10;
    return {
      y,
      leftX: width / 2 - laneSpread,
      rightX: width / 2 + laneSpread,
      tileWidth,
      tileHeight,
      laneGlowWidth: laneSpread * 1.85,
      perspective,
    };
  }

  private createLaneBeam(metrics: RowMetrics) {
    const beam = new Graphics();
    beam.roundRect(
      (metrics.leftX + metrics.rightX) / 2 - metrics.laneGlowWidth / 2,
      metrics.y - 3,
      metrics.laneGlowWidth,
      6,
      3,
    ).fill({ color: 0x9beeff, alpha: 0.05 + metrics.perspective * 0.04 });
    return beam;
  }

  private createTile(
    row: BridgeRow,
    side: TileSide,
    metrics: RowMetrics,
    selectable: boolean,
    activeAnimation: CrystalPathShatteredAnimation | null,
  ) {
    const x = side === 'left' ? metrics.leftX : metrics.rightX;
    const y = metrics.y;
    const width = metrics.tileWidth;
    const height = metrics.tileHeight;
    const container = new Container();
    const glow = new Graphics();
    const shadow = new Graphics();
    const glass = new Graphics();
    const facet = new Graphics();
    const rim = new Graphics();
    const isBroken = side === 'left' ? row.leftBroken : row.rightBroken;
    const isSafe = row.revealedSafeSide === side;
    const isAnimatingTarget = activeAnimation?.side === side;
    const pulse = selectable ? 0.24 + Math.sin(this.elapsedMs / 330) * 0.08 : isSafe ? 0.22 : 0.06;
    const edgeAlpha = selectable ? 0.82 : isSafe ? 0.72 : 0.34;

    if (isBroken || (activeAnimation?.type === 'wrong' && isAnimatingTarget && this.hasAnimationCollapsed())) {
      container.addChild(this.createHole(x, y + 2, width, height));
    } else {
      shadow.ellipse(x, y + height * 0.85, width * 0.5, height * 0.58).fill({ color: 0x000000, alpha: 0.42 });
      glow.roundRect(x - width / 2 - 7, y - height * 0.64, width + 14, height * 1.32, 16)
        .fill({ color: selectable ? 0x00e5ff : 0x93f6ff, alpha: pulse });
      glass.roundRect(x - width / 2, y - height * 0.56, width, height * 1.12, 14)
        .fill({ color: isSafe ? 0x85f7ff : 0x0d1c34, alpha: isSafe ? 0.48 : 0.34 });
      glass.roundRect(x - width / 2, y - height * 0.56, width, height * 1.12, 14)
        .stroke({ color: isSafe ? 0xffffff : 0xa9eeff, width: 2, alpha: edgeAlpha });
      facet.poly([
        x - width * 0.34,
        y - height * 0.16,
        x - width * 0.08,
        y - height * 0.42,
        x + width * 0.3,
        y - height * 0.26,
        x + width * 0.18,
        y + height * 0.2,
        x - width * 0.24,
        y + height * 0.26,
      ]).fill({ color: 0xffffff, alpha: isSafe ? 0.18 : 0.1 });
      rim.roundRect(x - width / 2 + 10, y - height * 0.44, width - 20, height * 0.24, 10)
        .fill({ color: 0xffffff, alpha: selectable ? 0.18 : 0.08 });
      container.addChild(shadow, glow, glass, facet, rim);
    }

    if (selectable) {
      container.addChild(this.createSparkles(x, y, width, height));
    }

    if (activeAnimation?.type === 'wrong' && isAnimatingTarget) {
      const elapsed = this.elapsedMs - activeAnimation.startedAt;
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
    const voidShape = new Graphics()
      .ellipse(x, y + 4, width * 0.48, height * 0.86)
      .fill({ color: 0x000000, alpha: 0.96 });
    const brokenRim = new Graphics()
      .poly([
        x - width * 0.44, y,
        x - width * 0.16, y - height * 0.58,
        x + width * 0.2, y - height * 0.52,
        x + width * 0.45, y + 2,
        x + width * 0.22, y + height * 0.58,
        x - width * 0.26, y + height * 0.52,
      ])
      .stroke({ color: 0xb8f6ff, width: 2, alpha: 0.35 });
    const innerGlow = new Graphics()
      .ellipse(x, y + 2, width * 0.34, height * 0.48)
      .fill({ color: 0xff5e2b, alpha: 0.07 });
    hole.addChild(voidShape, innerGlow, brokenRim);
    return hole;
  }

  private createSparkles(x: number, y: number, width: number, height: number) {
    const sparkles = new Graphics();
    const breath = 0.35 + Math.sin(this.elapsedMs / 380) * 0.15;
    for (let index = 0; index < 3; index += 1) {
      const offsetX = (index - 1) * width * 0.22;
      const offsetY = -height * (0.9 + index * 0.12);
      sparkles.circle(x + offsetX, y + offsetY, 1.4 + index * 0.4)
        .fill({ color: 0xffffff, alpha: breath * (0.65 - index * 0.12) });
    }
    return sparkles;
  }

  private createStressFlash(x: number, y: number, width: number, height: number, progress: number) {
    return new Graphics()
      .roundRect(x - width / 2, y - height * 0.56, width, height * 1.12, 14)
      .fill({ color: 0xff6f3c, alpha: 0.1 + progress * 0.16 });
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
    cracks.stroke({ color: 0xffffff, width: 2, alpha: 0.26 + progress * 0.5 });
    return cracks;
  }

  private createShards(x: number, y: number, width: number, elapsed: number) {
    const shards = new Graphics();
    const progress = Math.min(1, elapsed / Math.max(1, WRONG_SHATTER_MS + WRONG_FALL_MS * 0.42));
    for (let index = 0; index < 10; index += 1) {
      const spread = (index - 4.5) * (width * 0.09);
      const rise = progress < 0.28 ? -26 * progress : 0;
      const drop = Math.max(0, progress - 0.16) * 110;
      const cx = x + spread * (0.45 + progress * 0.9);
      const cy = y + rise + drop + Math.abs(spread) * 0.08;
      const tint = index % 3 === 0 ? 0xffffff : index % 2 === 0 ? 0xb7fbff : 0xff8250;
      shards.poly([
        cx - 8,
        cy - 4,
        cx + 4,
        cy - 7,
        cx + 7,
        cy + 1,
        cx + 1,
        cy + 8,
        cx - 7,
        cy + 4,
      ]).fill({ color: tint, alpha: 0.46 * (1 - progress) });
    }
    return shards;
  }

  private hasAnimationCollapsed() {
    const activeAnimation = this.state.activeAnimation;
    if (!activeAnimation || activeAnimation.type !== 'wrong') return false;
    return this.elapsedMs - activeAnimation.startedAt > STEP_SUSPENSE_DELAY_MS + WRONG_CRACK_MS + WRONG_SHATTER_MS * 0.45;
  }

  private resolveAnimatedTokenPosition(
    playerId: string,
    x: number,
    y: number,
    metrics: RowMetrics[],
    height: number,
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
    const targetY = rowMetrics.y - rowMetrics.tileHeight * 0.55;
    const elapsed = this.elapsedMs - activeAnimation.startedAt;
    if (elapsed <= FALL_TRIGGER_MS) {
      const tension = Math.min(1, elapsed / Math.max(1, FALL_TRIGGER_MS));
      return {
        x: targetX,
        y: targetY - tension * 8,
        alpha: 1,
        scale: 1,
        rotation: -0.16 * tension,
        trailAlpha: 0,
      };
    }

    const fallProgress = Math.min(1, (elapsed - FALL_TRIGGER_MS) / Math.max(1, WRONG_FALL_MS));
    return {
      x: targetX + Math.sin(fallProgress * Math.PI * 2.1) * 14,
      y: targetY + fallProgress * fallProgress * (height * 0.56),
      alpha: fallProgress < 0.62 ? 1 : 1 - (fallProgress - 0.62) / 0.38,
      scale: 1 - fallProgress * 0.38,
      rotation: -0.18 + fallProgress * 1.18,
      trailAlpha: Math.max(0, 0.18 - fallProgress * 0.14),
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
