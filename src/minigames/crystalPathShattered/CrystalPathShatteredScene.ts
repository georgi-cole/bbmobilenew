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
  type CrystalPathShatteredAnimation,
  STEP_SUSPENSE_DELAY_MS,
  SAFE_CONFIRM_MS,
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
  drift: number;
  speed: number;
  phase: number;
}

const TILE_WIDTH_RATIO = 0.3;
const TOKEN_RADIUS = 15;
const PARTICLE_COUNT = 26;
const DEFAULT_SCENE_WIDTH = 360;
const DEFAULT_SCENE_HEIGHT = 520;
const ACTIVE_TOKEN_GLOW_OFFSET = 9;
const FINISHED_TOKEN_GLOW_OFFSET = 7;
const DEFAULT_TOKEN_GLOW_OFFSET = 5;

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
    this.render();
  }

  destroy() {
    this.app.ticker.remove(this.tick);
    this.root.destroy({ children: true });
  }

  private readonly tick = (ticker: { deltaTime: number }) => {
    const width = this.app.renderer.width;
    const height = this.app.renderer.height;
    const delta = ticker.deltaTime;

    for (const particle of this.particles) {
      particle.sprite.y -= particle.speed * delta;
      particle.sprite.x += Math.sin((Date.now() / 1000) + particle.phase) * particle.drift * 0.04;
      if (particle.sprite.y < -10) {
        particle.sprite.y = height + Math.random() * 20;
        particle.sprite.x = Math.random() * width;
      }
    }

    if (this.state.activeAnimation) {
      this.render();
    }
  };

  private drawBackground() {
    this.backgroundLayer.removeChildren().forEach((child) => child.destroy());
    const width = this.app.renderer.width;
    const height = this.app.renderer.height;

    const chamber = new Graphics()
      .rect(0, 0, width, height)
      .fill({ color: 0x050817, alpha: 1 });

    const glow = new Graphics()
      .circle(width / 2, height * 0.2, Math.max(width * 0.45, 160))
      .fill({ color: 0x173a7a, alpha: 0.18 });
    const voidGlow = new Graphics()
      .ellipse(width / 2, height * 0.92, width * 0.42, height * 0.18)
      .fill({ color: 0x02030a, alpha: 0.95 });

    const arch = new Graphics()
      .roundRect(width * 0.06, height * 0.06, width * 0.88, height * 0.88, 34)
      .stroke({ color: 0x7fdcff, width: 2, alpha: 0.12 });

    this.backgroundLayer.addChild(chamber, glow, voidGlow, arch);
  }

  private buildParticles() {
    const width = this.app.renderer.width || DEFAULT_SCENE_WIDTH;
    const height = this.app.renderer.height || DEFAULT_SCENE_HEIGHT;

    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.tint = index % 3 === 0 ? 0xaef6ff : index % 2 === 0 ? 0x79d2ff : 0xc5c2ff;
      const scale = 1 + (index % 4) * 0.35;
      sprite.anchor.set(0.5);
      sprite.width = scale * 2.2;
      sprite.height = scale * 2.2;
      sprite.alpha = 0.2 + (index % 5) * 0.08;
      sprite.x = (width / PARTICLE_COUNT) * index;
      sprite.y = Math.random() * height;
      this.particleLayer.addChild(sprite);
      this.particles.push({
        sprite,
        drift: 2 + (index % 5),
        speed: 0.25 + (index % 4) * 0.12,
        phase: index * 0.7,
      });
    }
  }

  private render() {
    const width = this.app.renderer.width;
    const height = this.app.renderer.height;
    this.boardLayer.removeChildren().forEach((child) => child.destroy());
    this.tokenLayer.removeChildren().forEach((child) => child.destroy());
    this.fxLayer.removeChildren().forEach((child) => child.destroy());

    const rowsCount = Math.max(1, this.state.rowsCount);
    const boardTop = 72;
    const boardBottom = height - 82;
    const rowGap = rowsCount <= 1 ? 0 : (boardBottom - boardTop) / (rowsCount - 1);
    const tileWidth = Math.max(72, width * TILE_WIDTH_RATIO);
    const leftX = width * 0.28;
    const rightX = width * 0.72;
    const now = Date.now();

    for (let rowIndex = 0; rowIndex < rowsCount; rowIndex += 1) {
      const row = this.state.rows[rowIndex];
      const y = boardBottom - rowIndex * rowGap;
      const selectable = this.state.phase === 'playing' && this.state.currentPlayerRow === rowIndex + 1 && this.state.inputEnabled;
      const targetAnimation = this.state.activeAnimation?.rowIndex === rowIndex ? this.state.activeAnimation : null;

      this.boardLayer.addChild(this.createLaneBeam(width / 2, y));
      this.boardLayer.addChild(this.createTile(row, 'left', leftX, y, tileWidth, selectable, targetAnimation, now));
      this.boardLayer.addChild(this.createTile(row, 'right', rightX, y, tileWidth, selectable, targetAnimation, now));
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
      const x = token.side === 'left' ? leftX : token.side === 'right' ? rightX : width / 2;
      const baseY = token.rowIndex <= 0 ? boardBottom + 32 : boardBottom - (token.rowIndex - 1) * rowGap;
      const tokenPosition = this.resolveAnimatedTokenPosition(token.playerId, x, baseY, now, leftX, rightX, rowGap, boardBottom);
      this.tokenLayer.addChild(
        this.createToken(
          token.name,
          tokenPosition.x + token.stackIndex * 18 - 9,
          tokenPosition.y - token.stackIndex * 10,
          token.active,
          token.finished,
          tokenPosition.alpha,
          tokenPosition.scale,
          tokenPosition.rotation,
        ),
      );
    }

    const activeAnimation = this.state.activeAnimation;
    if (activeAnimation?.type === 'safe') {
      const x = activeAnimation.side === 'left' ? leftX : rightX;
      const y = boardBottom - activeAnimation.rowIndex * rowGap;
      const elapsed = now - activeAnimation.startedAt;
      const pulse = Math.min(1, elapsed / (STEP_SUSPENSE_DELAY_MS + SAFE_CONFIRM_MS));
      const ring = new Graphics()
        .circle(x, y, 26 + pulse * 44)
        .stroke({ color: 0xb9fbff, width: 3, alpha: 0.4 * (1 - pulse) });
      this.fxLayer.addChild(ring);
    }
  }

  private createLaneBeam(x: number, y: number) {
    return new Graphics()
      .roundRect(x - 92, y - 3, 184, 6, 4)
      .fill({ color: 0x74cfff, alpha: 0.08 });
  }

  private createTile(
    row: BridgeRow,
    side: TileSide,
    x: number,
    y: number,
    width: number,
    selectable: boolean,
    activeAnimation: CrystalPathShatteredAnimation | null,
    now: number,
  ) {
    const container = new Container();
    const tile = new Graphics();
    const glow = new Graphics();
    const accent = new Graphics();
    const hole = new Graphics();
    const isBroken = side === 'left' ? row.leftBroken : row.rightBroken;
    const isSafe = row.revealedSafeSide === side;
    const isAnimatingTarget = activeAnimation?.side === side;
    const activeRowGlow = selectable ? 0.26 + Math.sin(now / 230) * 0.08 : 0.1;
    const fillColor = isSafe ? 0x7ef8ff : selectable ? 0x3d6ee8 : 0x16355e;

    if (isBroken || (activeAnimation?.type === 'wrong' && isAnimatingTarget && this.hasAnimationCollapsed(now))) {
      hole.ellipse(x, y + 3, width * 0.44, 18).fill({ color: 0x02030a, alpha: 0.98 });
      hole.ellipse(x, y + 2, width * 0.48, 20).stroke({ color: 0x91e8ff, width: 2, alpha: 0.22 });
      container.addChild(hole);
    } else {
      glow.roundRect(x - width / 2 - 6, y - 16, width + 12, 34, 16).fill({ color: 0x6feaff, alpha: activeRowGlow });
      tile.roundRect(x - width / 2, y - 13, width, 28, 14).fill({ color: fillColor, alpha: 0.34 });
      tile.roundRect(x - width / 2, y - 13, width, 28, 14).stroke({ color: 0xd8fbff, width: 2, alpha: 0.52 });
      accent.moveTo(x - width / 2 + 12, y - 5);
      accent.lineTo(x + width / 2 - 14, y - 10);
      accent.lineTo(x + width / 2 - 22, y + 7);
      accent.lineTo(x - width / 2 + 20, y + 10);
      accent.closePath();
      accent.fill({ color: 0xffffff, alpha: isSafe ? 0.16 : 0.07 });
      container.addChild(glow, tile, accent);
    }

    if (activeAnimation?.type === 'wrong' && isAnimatingTarget) {
      const elapsed = now - activeAnimation.startedAt;
      const crackElapsed = Math.max(0, elapsed - STEP_SUSPENSE_DELAY_MS);
      const crackProgress = Math.min(1, crackElapsed / Math.max(1, WRONG_CRACK_MS));
      if (crackProgress > 0) {
        const cracks = new Graphics();
        cracks.moveTo(x, y - 13);
        cracks.lineTo(x - width * 0.18, y - 2 + crackProgress * 3);
        cracks.lineTo(x - width * 0.3, y + 10);
        cracks.moveTo(x + 6, y - 11);
        cracks.lineTo(x + width * 0.12, y - 4 + crackProgress * 2);
        cracks.lineTo(x + width * 0.24, y + 8);
        cracks.moveTo(x - width * 0.1, y - 6);
        cracks.lineTo(x + width * 0.08, y + 9);
        cracks.stroke({ color: 0xffffff, width: 2, alpha: 0.18 + crackProgress * 0.5 });
        container.addChild(cracks);
      }
      if (crackElapsed > WRONG_CRACK_MS) {
        this.fxLayer.addChild(this.createShards(x, y, crackElapsed - WRONG_CRACK_MS));
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

  private createShards(x: number, y: number, elapsed: number) {
    const shards = new Graphics();
    const progress = Math.min(1, elapsed / Math.max(1, WRONG_SHATTER_MS + WRONG_FALL_MS * 0.4));
    for (let index = 0; index < 7; index += 1) {
      const spread = (index - 3) * 14;
      const rise = progress < 0.35 ? -18 * progress : 0;
      const drop = Math.max(0, progress - 0.18) * 88;
      const rotate = progress * (index % 2 === 0 ? 1 : -1) * 9;
      const cx = x + spread * (0.4 + progress);
      const cy = y + rise + drop + Math.abs(spread) * 0.08;
      shards.poly([
        cx - 8,
        cy - 5,
        cx + 6,
        cy - 3 + rotate,
        cx + 2,
        cy + 7,
        cx - 6,
        cy + 4,
      ]).fill({ color: 0xbefbff, alpha: 0.38 * (1 - progress) });
    }
    return shards;
  }

  private hasAnimationCollapsed(now: number) {
    const activeAnimation = this.state.activeAnimation;
    if (!activeAnimation || activeAnimation.type !== 'wrong') return false;
    return now - activeAnimation.startedAt > STEP_SUSPENSE_DELAY_MS + WRONG_CRACK_MS + WRONG_SHATTER_MS * 0.45;
  }

  private resolveAnimatedTokenPosition(
    playerId: string,
    x: number,
    y: number,
    now: number,
    leftX: number,
    rightX: number,
    rowGap: number,
    boardBottom: number,
  ) {
    const activeAnimation = this.state.activeAnimation;
    if (!activeAnimation || activeAnimation.playerId !== playerId || activeAnimation.type !== 'wrong') {
      return { x, y, alpha: 1, scale: 1, rotation: 0 };
    }
    const targetX = activeAnimation.side === 'left' ? leftX : rightX;
    const targetY = boardBottom - activeAnimation.rowIndex * rowGap;
    const elapsed = now - activeAnimation.startedAt;
    const fallStart = STEP_SUSPENSE_DELAY_MS + WRONG_CRACK_MS + WRONG_SHATTER_MS * 0.65;
    if (elapsed <= fallStart) {
      return { x: targetX, y: targetY - 4, alpha: 1, scale: 1, rotation: 0 };
    }
    const fallProgress = Math.min(1, (elapsed - fallStart) / Math.max(1, WRONG_FALL_MS));
    return {
      x: targetX + Math.sin(fallProgress * Math.PI * 2.3) * 18,
      y: targetY + fallProgress * fallProgress * 280,
      alpha: 1 - fallProgress * 0.9,
      scale: 1 - fallProgress * 0.45,
      rotation: fallProgress * 0.8,
    };
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
    const glow = new Graphics()
      .circle(
        0,
        0,
        TOKEN_RADIUS
          + (active
            ? ACTIVE_TOKEN_GLOW_OFFSET
            : finished
              ? FINISHED_TOKEN_GLOW_OFFSET
              : DEFAULT_TOKEN_GLOW_OFFSET),
      )
      .fill({ color: finished ? 0xffef8c : active ? 0x89f8ff : 0x33528a, alpha: active ? 0.34 : 0.2 });
    const chip = new Graphics()
      .circle(0, 0, TOKEN_RADIUS)
      .fill({ color: finished ? 0xf6dc70 : 0x0d1630, alpha: 0.94 })
      .stroke({ color: active ? 0xcfffff : 0x8acbff, width: 2, alpha: 0.9 });
    const label = new Text({
      text: getInitials(name),
      style: {
        fill: active ? 0xebfdff : 0xd4eeff,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 13,
        fontWeight: '700',
      },
    });
    label.anchor.set(0.5);
    container.addChild(glow, chip, label);
    container.position.set(x, y);
    container.alpha = alpha;
    container.scale.set(scale);
    container.rotation = rotation;
    return container;
  }
}
