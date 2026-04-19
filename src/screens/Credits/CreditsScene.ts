import {
  Application,
  Assets,
  BlurFilter,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import {
  CREDITS_CITY_SOURCES,
} from './creditsAssetPaths';
import { buildCreditsAssetCandidates } from './creditsAssetPaths';
import {
  getCreditTextPlacement,
  getMoonExclusionZone,
  getTextRevealMaskDimensions,
  getVisibleBeamDimensions,
  textBlockIntersectsMoonZone,
} from './creditsSceneLayout';

const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;
const SMALL_STAR_COUNT = 30;
const MEDIUM_STAR_COUNT = 14;
const HERO_STAR_COUNT = 4;
const STAR_GROUPS = [
  {
    count: SMALL_STAR_COUNT,
    radiusRange: [0.45, 0.9] as const,
    alphaRange: [0.12, 0.24] as const,
    amplitudeRange: [0.02, 0.05] as const,
    speedRange: [0.18, 0.34] as const,
  },
  {
    count: MEDIUM_STAR_COUNT,
    radiusRange: [0.85, 1.45] as const,
    alphaRange: [0.22, 0.4] as const,
    amplitudeRange: [0.04, 0.08] as const,
    speedRange: [0.22, 0.42] as const,
  },
  {
    count: HERO_STAR_COUNT,
    radiusRange: [1.5, 2.2] as const,
    alphaRange: [0.4, 0.62] as const,
    amplitudeRange: [0.05, 0.1] as const,
    speedRange: [0.16, 0.32] as const,
  },
] as const;
const WINDOW_LIGHT_COUNT = 60;
const CREDIT_CYCLE_SECONDS = 4.5;
const SKY_TEXTURE_WIDTH = 64;
const SKY_TEXTURE_HEIGHT = 256;
const FOG_TEXTURE_WIDTH = 640;
const FOG_TEXTURE_HEIGHT = 200;
const GLOW_TEXTURE_SIZE = 256;
const SKY_TOP = '#020610';
const SKY_BOTTOM = '#0c2a3c';
const TEXT_TINT = '#f0f6ff';
const WARM_WINDOW_COLOR = 0xffe8a3;
const PLAYFUL_FONT_STACK = '\'Trebuchet MS\', \'Avenir Next Rounded\', \'Arial Rounded MT Bold\', \'Montserrat\', sans-serif';

const KOLEQUANT_LOGO_SOURCES = buildCreditsAssetCandidates('assets/kolequant.png');

/** Beam angle in radians from +x, aimed from right rooftop toward upper center-left. */
const BEAM_ANGLE = -2;

/** Duration in seconds for the projector beam to fade in at scene start. */
const BEAM_INTRO_DURATION = 1.8;
/** Additional delay after beam before credits text appears. */
const TEXT_DELAY_AFTER_BEAM = 0.8;
/** Keep projected credits readable on narrow portrait screens. */
const MIN_CREDIT_FONT_SIZE = 18;
/** Preserve airy line spacing once credits wrap to multiple lines. */
const CREDIT_LINE_HEIGHT_RATIO = 1.38;
const CREDIT_LINE_HEIGHT_PADDING = 8;
const TEXT_DISTANCE_STEP = 12;
const MIN_MASK_TRAIL = 92;
const MAX_TEXT_DISTANCE_CHECKS = 12;
const CREDIT_WRAP_STEP = 10;
const MIN_CREDIT_WRAP_WIDTH = 160;
const MAX_TEXT_FIT_ADJUSTMENTS = 4;

type StarConfig = {
  sprite: Graphics;
  x: number;
  y: number;
  baseAlpha: number;
  amplitude: number;
  speed: number;
  phase: number;
};

type WindowLightConfig = {
  sprite: Graphics;
  baseAlpha: number;
  targetAlpha: number;
  currentAlpha: number;
  fadeSpeed: number;
  nextChangeAt: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type CreditsSceneOptions = {
  host: HTMLElement;
  credits: string[];
};

export default class CreditsScene {
  private readonly host: HTMLElement;
  private readonly credits: string[];
  private readonly app = new Application();
  private readonly root = new Container();
  private readonly skyLayer = new Container();
  private readonly starsLayer = new Container();
  private readonly cityLayer = new Container();
  private readonly windowsLayer = new Container();
  private readonly fogLayer = new Container();
  private readonly beamLayer = new Container();
  private readonly textLayer = new Container();
  private readonly logoLayer = new Container();
  private readonly generatedTextures: Texture[] = [];
  private readonly starConfigs: StarConfig[] = [];
  private readonly windowLightConfigs: WindowLightConfig[] = [];
  private readonly fogBlurFilter = new BlurFilter({ strength: 14, quality: 2 });
  private readonly beamOuterBlurFilter = new BlurFilter({ strength: 22, quality: 3 });
  private readonly beamCoreBlurFilter = new BlurFilter({ strength: 12, quality: 2 });
  private readonly sourceGlowFilter = new BlurFilter({ strength: 10, quality: 2 });
  private readonly tick = () => {
    this.update();
  };
  private readonly handleWindowResize = () => {
    this.layout();
  };

  private resizeObserver: ResizeObserver | null = null;
  private fallbackResizeHandlerAttached = false;
  private skySprite!: Sprite;
  private citySprite!: Sprite;
  private fogBack!: Sprite;
  private fogFront!: Sprite;
  private beamOuter!: Graphics;
  private beamInner!: Graphics;
  private beamMask!: Graphics;
  private sourceGlow!: Sprite;
  private logoSprite: Sprite | null = null;
  private creditsText!: Text;
  private exitText!: Text;
  private elapsedSeconds = 0;
  private currentCreditIndex = -1;
  private designScale = 1;
  private beamOriginX = 0;
  private beamOriginY = 0;
  private beamIntroProgress = 0;
  private destroyed = false;
  private appInitialized = false;
  private appDisposed = false;
  private exitTextFadedIn = false;
  private logoFlashTriggered = false;

  constructor(options: CreditsSceneOptions) {
    this.host = options.host;
    this.credits = options.credits.length > 0 ? options.credits : ['Thanks for playing'];
  }

  async init(): Promise<void> {
    this.destroyed = false;

    await this.app.init({
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0,
      resizeTo: this.host,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    this.appInitialized = true;

    if (this.destroyed) {
      this.disposeApplication();
      return;
    }

    this.host.replaceChildren();
    this.host.appendChild(this.app.canvas as HTMLCanvasElement);

    const [cityTexture] = await Promise.all([
      this.loadTexture(CREDITS_CITY_SOURCES),
    ]);

    if (this.destroyed) {
      this.disposeApplication();
      return;
    }

    let logoTexture: Texture | null = null;
    try {
      logoTexture = await this.loadTexture(KOLEQUANT_LOGO_SOURCES);
    } catch {
      // Logo is optional — scene works without it.
    }

    if (this.destroyed) {
      this.disposeApplication();
      return;
    }

    this.app.stage.addChild(this.root);
    this.root.addChild(
      this.skyLayer,
      this.starsLayer,
      this.cityLayer,
      this.windowsLayer,
      this.fogLayer,
      this.beamLayer,
      this.textLayer,
      this.logoLayer,
    );

    this.createSky();
    this.createStars();
    this.createCity(cityTexture);
    this.createWindowLights();
    this.createFog();
    this.createBeam();
    this.createTexts();
    if (logoTexture) {
      this.createLogo(logoTexture);
    }
    this.attachResizeHandling();
    this.layout();
    this.app.ticker.add(this.tick);
  }

  destroy(): void {
    this.destroyed = true;

    if (this.appInitialized) {
      this.app.ticker.remove(this.tick);
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.fallbackResizeHandlerAttached) {
      window.removeEventListener('resize', this.handleWindowResize);
      this.fallbackResizeHandlerAttached = false;
    }

    this.generatedTextures.forEach((texture) => texture.destroy(true));
    this.generatedTextures.length = 0;
    this.starConfigs.length = 0;
    this.windowLightConfigs.length = 0;
    this.host.replaceChildren();
    this.disposeApplication();
  }

  private disposeApplication(): void {
    if (this.appDisposed || !this.appInitialized) {
      return;
    }

    this.appDisposed = true;
    this.app.destroy({ removeView: true }, { children: true });
  }

  private async loadTexture(candidates: string[]): Promise<Texture> {
    let lastError: unknown;

    for (const candidate of candidates) {
      try {
        return await Assets.load<Texture>(candidate);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Unable to load required credits asset.');
  }

  private createSky(): void {
    this.skySprite = new Sprite(this.createSkyTexture());
    this.skyLayer.addChild(this.skySprite);
  }

  private createSkyTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = SKY_TEXTURE_WIDTH;
    canvas.height = SKY_TEXTURE_HEIGHT;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context unavailable for sky gradient.');
    }

    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, SKY_TOP);
    gradient.addColorStop(0.5, '#061320');
    gradient.addColorStop(1, SKY_BOTTOM);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = Texture.from(canvas);
    this.generatedTextures.push(texture);
    return texture;
  }

  private createStars(): void {
    for (const group of STAR_GROUPS) {
      for (let index = 0; index < group.count; index += 1) {
        const radius = group.radiusRange[0] + Math.random() * (group.radiusRange[1] - group.radiusRange[0]);
        const star = new Graphics();

        star.circle(0, 0, radius).fill({ color: 0xffffff, alpha: 1 });
        this.starsLayer.addChild(star);
        this.starConfigs.push({
          sprite: star,
          x: 0.04 + Math.random() * 0.92,
          y: 0.02 + Math.random() * 0.32,
          baseAlpha: group.alphaRange[0] + Math.random() * (group.alphaRange[1] - group.alphaRange[0]),
          amplitude: group.amplitudeRange[0] + Math.random() * (group.amplitudeRange[1] - group.amplitudeRange[0]),
          speed: group.speedRange[0] + Math.random() * (group.speedRange[1] - group.speedRange[0]),
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  private createCity(texture: Texture): void {
    this.citySprite = new Sprite(texture);
    this.citySprite.anchor.set(0.5, 1);
    this.cityLayer.addChild(this.citySprite);
  }

  private createWindowLights(): void {
    for (let index = 0; index < WINDOW_LIGHT_COUNT; index += 1) {
      const width = 2 + Math.floor(Math.random() * 2);
      const height = 2 + Math.floor(Math.random() * 3);
      const light = new Graphics();

      light.rect(0, 0, width, height).fill({ color: WARM_WINDOW_COLOR, alpha: 1 });
      this.windowsLayer.addChild(light);

      const baseAlpha = 0.15 + Math.random() * 0.3;
      this.windowLightConfigs.push({
        sprite: light,
        x: Math.random(),
        y: 0.56 + Math.random() * 0.28,
        width,
        height,
        baseAlpha,
        targetAlpha: baseAlpha,
        currentAlpha: baseAlpha,
        fadeSpeed: 0.5 + Math.random() * 0.8,
        nextChangeAt: Math.random() * 3,
      });
    }
  }

  private createFog(): void {
    const fogTexture = this.createFogTexture();

    this.fogBack = new Sprite(fogTexture);
    this.fogBack.anchor.set(0.5, 1);
    this.fogBack.alpha = 0.07;
    this.fogBack.filters = [this.fogBlurFilter];

    this.fogFront = new Sprite(fogTexture);
    this.fogFront.anchor.set(0.5, 1);
    this.fogFront.alpha = 0.1;
    this.fogFront.filters = [this.fogBlurFilter];

    this.fogLayer.addChild(this.fogBack, this.fogFront);
  }

  private createFogTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = FOG_TEXTURE_WIDTH;
    canvas.height = FOG_TEXTURE_HEIGHT;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context unavailable for fog layer.');
    }

    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(200, 220, 240, 0)');
    gradient.addColorStop(0.5, 'rgba(200, 220, 240, 0.2)');
    gradient.addColorStop(1, 'rgba(180, 205, 230, 0.35)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = Texture.from(canvas);
    this.generatedTextures.push(texture);
    return texture;
  }

  private createBeam(): void {
    const glowTexture = this.createGlowTexture();

    this.beamOuter = new Graphics();
    this.beamOuter.alpha = 0;
    this.beamOuter.filters = [this.beamOuterBlurFilter];

    this.beamInner = new Graphics();
    this.beamInner.alpha = 0;
    this.beamInner.filters = [this.beamCoreBlurFilter];

    this.beamMask = new Graphics();
    this.beamMask.alpha = 0.001;

    this.sourceGlow = new Sprite(glowTexture);
    this.sourceGlow.anchor.set(0.5);
    this.sourceGlow.alpha = 0;
    this.sourceGlow.tint = 0xdff0ff;
    this.sourceGlow.filters = [this.sourceGlowFilter];

    this.beamLayer.addChild(this.beamOuter, this.beamInner, this.sourceGlow);
  }

  private drawBeamShape(
    graphic: Graphics,
    options: {
      originX: number;
      originY: number;
      angle: number;
      length: number;
      nearWidth: number;
      farWidth: number;
      alpha: number;
    },
  ): void {
    const dx = Math.cos(options.angle);
    const dy = Math.sin(options.angle);
    const halfNear = options.nearWidth * 0.5;
    const halfFar = options.farWidth * 0.5;

    const nearLeftX = options.originX - dy * halfNear;
    const nearLeftY = options.originY + dx * halfNear;
    const nearRightX = options.originX + dy * halfNear;
    const nearRightY = options.originY - dx * halfNear;
    const farCenterX = options.originX + dx * options.length;
    const farCenterY = options.originY + dy * options.length;
    const farLeftX = farCenterX - dy * halfFar;
    const farLeftY = farCenterY + dx * halfFar;
    const farRightX = farCenterX + dy * halfFar;
    const farRightY = farCenterY - dx * halfFar;

    graphic.clear()
      .moveTo(nearLeftX, nearLeftY)
      .lineTo(farLeftX, farLeftY)
      .lineTo(farRightX, farRightY)
      .lineTo(nearRightX, nearRightY)
      .closePath()
      .fill({ color: 0xffffff, alpha: options.alpha });
  }

  private createGlowTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = GLOW_TEXTURE_SIZE;
    canvas.height = GLOW_TEXTURE_SIZE;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context unavailable for glow texture.');
    }

    const gradient = context.createRadialGradient(
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.width * 0.04,
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.width * 0.5,
    );
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.15, 'rgba(230,245,255,0.5)');
    gradient.addColorStop(0.5, 'rgba(215,235,255,0.1)');
    gradient.addColorStop(1, 'rgba(215,235,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = Texture.from(canvas);
    this.generatedTextures.push(texture);
    return texture;
  }

  private createLogo(texture: Texture): void {
    this.logoSprite = new Sprite(texture);
    this.logoSprite.anchor.set(0.5);
    this.logoSprite.alpha = 0;
    this.logoLayer.addChild(this.logoSprite);
  }

  private createTexts(): void {
    this.creditsText = new Text({
      text: '',
      style: {
        align: 'center',
        dropShadow: {
          alpha: 0.7,
          blur: 18,
          color: '#000000',
          distance: 0,
        },
        fill: TEXT_TINT,
        fontFamily: PLAYFUL_FONT_STACK,
        fontSize: 22,
        fontWeight: '600',
        letterSpacing: 0.9,
        lineHeight: 36,
        wordWrap: true,
        wordWrapWidth: 240,
      },
    });
    this.creditsText.anchor.set(0.5);
    this.creditsText.mask = this.beamMask;

    this.exitText = new Text({
      text: 'Tap to exit',
      style: {
        align: 'center',
        dropShadow: {
          alpha: 0.3,
          blur: 6,
          color: '#000000',
          distance: 0,
        },
        fill: '#94a3b8',
        fontFamily: PLAYFUL_FONT_STACK,
        fontSize: 13,
        fontWeight: '500',
        letterSpacing: 1.1,
      },
    });
    this.exitText.anchor.set(0.5);
    this.exitText.alpha = 0;

    this.textLayer.addChild(this.beamMask, this.creditsText, this.exitText);
  }

  private attachResizeHandling(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.layout();
      });
      this.resizeObserver.observe(this.host);
      return;
    }

    window.addEventListener('resize', this.handleWindowResize);
    this.fallbackResizeHandlerAttached = true;
  }

  private layout(): void {
    const screen = this.app.renderer.screen;
    const width = screen.width;
    const height = screen.height;

    if (!width || !height) {
      return;
    }

    this.designScale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);

    this.skySprite.x = 0;
    this.skySprite.y = 0;
    this.skySprite.width = width;
    this.skySprite.height = height;

    for (const starConfig of this.starConfigs) {
      starConfig.sprite.x = starConfig.x * width;
      starConfig.sprite.y = starConfig.y * height;
      starConfig.sprite.scale.set(0.78 + this.designScale * 0.22);
    }

    const cityWidthScale = width / this.citySprite.texture.width;
    this.citySprite.width = this.citySprite.texture.width * cityWidthScale;
    this.citySprite.height = this.citySprite.texture.height * cityWidthScale;
    this.citySprite.x = width * 0.5;
    this.citySprite.y = height;

    const cityLeft = this.citySprite.x - this.citySprite.width / 2;
    const cityTop = this.citySprite.y - this.citySprite.height;

    for (const windowConfig of this.windowLightConfigs) {
      windowConfig.sprite.scale.set(Math.max(0.8, this.designScale));
      windowConfig.sprite.x = cityLeft + windowConfig.x * this.citySprite.width;
      windowConfig.sprite.y = cityTop + windowConfig.y * this.citySprite.height;
    }

    const fogHorizonY = cityTop + this.citySprite.height * 0.1;
    this.fogBack.x = width * 0.5;
    this.fogBack.y = fogHorizonY + height * 0.04;
    this.fogBack.width = width * 1.15;
    this.fogBack.height = height * 0.12;

    this.fogFront.x = width * 0.55;
    this.fogFront.y = fogHorizonY + height * 0.02;
    this.fogFront.width = width * 1.25;
    this.fogFront.height = height * 0.1;

    // Hard-anchor the beam to a right-side rooftop point on the skyline.
    this.beamOriginX = width * 0.78;
    this.beamOriginY = this.citySprite.y - this.citySprite.height * 0.55;
    this.refreshCreditLayout();

    this.sourceGlow.x = this.beamOriginX;
    this.sourceGlow.y = this.beamOriginY;
    this.sourceGlow.width = width * 0.18;
    this.sourceGlow.height = width * 0.18;

    this.exitText.x = width * 0.5;
    this.exitText.y = height - Math.max(28, 44 * this.designScale);
    this.exitText.style.fontSize = Math.max(11, 13 * this.designScale);

    if (this.logoSprite) {
      const logoSize = Math.min(width * 0.35, 140) * this.designScale;
      this.logoSprite.x = width * 0.5;
      this.logoSprite.y = height * 0.45;
      this.logoSprite.width = logoSize;
      this.logoSprite.height = logoSize * (this.logoSprite.texture.height / this.logoSprite.texture.width);
    }
  }

  private refreshCreditLayout(creditText = this.currentCreditIndex >= 0
    ? this.credits[this.currentCreditIndex]
    : this.credits[0]): void {
    const screen = this.app.renderer.screen;
    const width = screen.width;
    const height = screen.height;

    if (!width || !height) {
      return;
    }

    const beamLength = Math.max(height * 0.78, 540);
    const placement = getCreditTextPlacement({
      screenWidth: width,
      screenHeight: height,
      designScale: this.designScale,
      beamOriginX: this.beamOriginX,
      beamOriginY: this.beamOriginY,
      beamAngle: BEAM_ANGLE,
      beamLength,
    });

    this.creditsText.x = placement.textX;
    this.creditsText.y = placement.textY;
    this.creditsText.text = creditText;

    let fontSize = placement.baseFontSize;
    let lineHeight = placement.lineHeight;
    let wordWrapWidth = placement.maxTextWidth;
    this.creditsText.style.fontSize = fontSize;
    this.creditsText.style.lineHeight = lineHeight;
    this.creditsText.style.wordWrapWidth = wordWrapWidth;

    let bounds = this.creditsText.getLocalBounds();
    while (bounds.width > wordWrapWidth && fontSize > MIN_CREDIT_FONT_SIZE) {
      fontSize -= 1;
      lineHeight = Math.max(
        Math.round(fontSize * CREDIT_LINE_HEIGHT_RATIO),
        fontSize + CREDIT_LINE_HEIGHT_PADDING,
      );
      this.creditsText.style.fontSize = fontSize;
      this.creditsText.style.lineHeight = lineHeight;
      bounds = this.creditsText.getLocalBounds();
    }

    let textDistance = placement.textDistance;
    const dx = Math.cos(BEAM_ANGLE);
    const dy = Math.sin(BEAM_ANGLE);
    const moonZone = getMoonExclusionZone(width, height);
    let fitAdjustments = 0;
    let distanceChecks = 0;
    while (textDistance > placement.minTextDistance && distanceChecks < MAX_TEXT_DISTANCE_CHECKS) {
      const candidateX = this.beamOriginX + dx * textDistance;
      const candidateY = this.beamOriginY + dy * textDistance;
      const exceedsLeftSafeArea = candidateX - bounds.width * 0.5 < placement.screenMargin;
      const exceedsRightSafeArea = candidateX + bounds.width * 0.5 > width - placement.screenMargin;
      const overlapsMoon = textBlockIntersectsMoonZone(
        candidateX,
        candidateY,
        bounds.width,
        bounds.height,
        moonZone,
      );

      if (!exceedsLeftSafeArea && !exceedsRightSafeArea && !overlapsMoon) {
        break;
      }

      if (fitAdjustments < MAX_TEXT_FIT_ADJUSTMENTS && wordWrapWidth > MIN_CREDIT_WRAP_WIDTH) {
        wordWrapWidth = Math.max(MIN_CREDIT_WRAP_WIDTH, wordWrapWidth - CREDIT_WRAP_STEP);
        if (fontSize > MIN_CREDIT_FONT_SIZE) {
          fontSize -= 1;
        }
        lineHeight = Math.max(
          Math.round(fontSize * CREDIT_LINE_HEIGHT_RATIO),
          fontSize + CREDIT_LINE_HEIGHT_PADDING,
        );
        this.creditsText.style.fontSize = fontSize;
        this.creditsText.style.lineHeight = lineHeight;
        this.creditsText.style.wordWrapWidth = wordWrapWidth;
        bounds = this.creditsText.getLocalBounds();
        fitAdjustments += 1;
        continue;
      }

      textDistance = Math.max(placement.minTextDistance, textDistance - TEXT_DISTANCE_STEP);
      distanceChecks += 1;
    }

    this.creditsText.x = this.beamOriginX + dx * textDistance;
    this.creditsText.y = this.beamOriginY + dy * textDistance;

    const maskLength = Math.max(
      textDistance + Math.max(bounds.height + placement.beamPadding, MIN_MASK_TRAIL),
      beamLength * 0.48,
    );
    const visibleBeamLength = Math.max(
      Math.min(textDistance + Math.max(bounds.height * 0.45, 74), beamLength * 0.56),
      beamLength * 0.44,
    );
    const visibleBeam = getVisibleBeamDimensions(width);
    const textRevealMask = getTextRevealMaskDimensions({
      screenWidth: width,
      textWidth: bounds.width,
      textHeight: bounds.height,
      textDistance,
      maskLength,
      beamPadding: placement.beamPadding,
    });

    this.drawBeamShape(this.beamOuter, {
      originX: this.beamOriginX,
      originY: this.beamOriginY,
      angle: BEAM_ANGLE,
      length: visibleBeamLength,
      nearWidth: visibleBeam.outerNearWidth,
      farWidth: visibleBeam.outerFarWidth,
      alpha: 0.18,
    });
    this.drawBeamShape(this.beamInner, {
      originX: this.beamOriginX,
      originY: this.beamOriginY,
      angle: BEAM_ANGLE,
      length: visibleBeamLength * 0.94,
      nearWidth: visibleBeam.innerNearWidth,
      farWidth: visibleBeam.innerFarWidth,
      alpha: 0.28,
    });
    this.drawBeamShape(this.beamMask, {
      originX: this.beamOriginX,
      originY: this.beamOriginY,
      angle: BEAM_ANGLE,
      length: maskLength,
      nearWidth: textRevealMask.nearWidth,
      farWidth: textRevealMask.farWidth,
      alpha: 1,
    });
  }

  private update(): void {
    this.elapsedSeconds += this.app.ticker.deltaMS / 1000;

    for (const starConfig of this.starConfigs) {
      const shimmer = Math.sin(this.elapsedSeconds * starConfig.speed + starConfig.phase);
      starConfig.sprite.alpha = Math.max(0.06, Math.min(0.95, starConfig.baseAlpha + shimmer * starConfig.amplitude));
    }

    for (const windowConfig of this.windowLightConfigs) {
      if (this.elapsedSeconds >= windowConfig.nextChangeAt) {
        windowConfig.targetAlpha = windowConfig.baseAlpha * (0.3 + Math.random() * 1.2);
        windowConfig.fadeSpeed = 0.5 + Math.random() * 0.8;
        windowConfig.nextChangeAt = this.elapsedSeconds + 0.8 + Math.random() * 2;
      }

      const delta = windowConfig.targetAlpha - windowConfig.currentAlpha;
      const step = windowConfig.fadeSpeed * (this.app.ticker.deltaMS / 1000);
      if (Math.abs(delta) < step) {
        windowConfig.currentAlpha = windowConfig.targetAlpha;
      } else {
        windowConfig.currentAlpha += Math.sign(delta) * step;
      }
      windowConfig.sprite.alpha = windowConfig.currentAlpha;
    }

    const fogDrift = Math.sin(this.elapsedSeconds * 0.06) * (10 * this.designScale);
    this.fogBack.x = this.app.renderer.screen.width * 0.5 + fogDrift;
    this.fogFront.x = this.app.renderer.screen.width * 0.55 - fogDrift * 0.6;

    // Beam intro — fades in over BEAM_INTRO_DURATION seconds
    this.beamIntroProgress = Math.min(1, this.elapsedSeconds / BEAM_INTRO_DURATION);
    const beamIntro = this.beamIntroProgress * this.beamIntroProgress; // easeIn

    const beamPulse = (Math.sin(this.elapsedSeconds * 0.35) + 1) * 0.5;
    this.beamOuter.alpha = beamIntro * (0.22 + beamPulse * 0.06);
    this.beamInner.alpha = beamIntro * (0.32 + beamPulse * 0.06);
    this.sourceGlow.alpha = beamIntro * (0.55 + beamPulse * 0.15);

    // Credits text — only appears after beam + delay
    const textStartTime = BEAM_INTRO_DURATION + TEXT_DELAY_AFTER_BEAM;
    const textElapsed = Math.max(0, this.elapsedSeconds - textStartTime);

    const totalCycleTime = this.credits.length * CREDIT_CYCLE_SECONDS;
    const logoFlashStart = totalCycleTime;
    const logoFlashDuration = 2.4;
    const fullCycleDuration = totalCycleTime + logoFlashDuration;
    const loopTime = textElapsed % fullCycleDuration;

    if (textElapsed <= 0) {
      // Still in beam intro — hide text and logo
      this.creditsText.alpha = 0;
      if (this.logoSprite) {
        this.logoSprite.alpha = 0;
      }
    } else if (loopTime < totalCycleTime) {
      // Regular credits cycle
      this.logoFlashTriggered = false;

      const cycleIndex = Math.floor(loopTime / CREDIT_CYCLE_SECONDS) % this.credits.length;
      const cycleProgress = loopTime % CREDIT_CYCLE_SECONDS;

      if (cycleIndex !== this.currentCreditIndex) {
        this.currentCreditIndex = cycleIndex;
        this.refreshCreditLayout(this.credits[cycleIndex]);
      }

      if (cycleProgress < 1) {
        // Keep text visibility tied to the beam reveal so the credits read as projected light,
        // not standalone UI floating over the skyline.
        this.creditsText.alpha = cycleProgress * beamIntro;
      } else if (cycleProgress < 3.5) {
        this.creditsText.alpha = beamIntro;
      } else {
        this.creditsText.alpha = Math.max(0, 1 - (cycleProgress - 3.5) * 2) * beamIntro;
      }

      if (this.logoSprite) {
        this.logoSprite.alpha = 0;
      }
    } else {
      // Kolequant logo flash
      this.creditsText.alpha = 0;
      this.currentCreditIndex = -1;

      if (this.logoSprite) {
        if (!this.logoFlashTriggered) {
          this.logoFlashTriggered = true;
        }

        const flashProgress = loopTime - logoFlashStart;
        const fadeDuration = 0.5;

        if (flashProgress < fadeDuration) {
          this.logoSprite.alpha = flashProgress / fadeDuration;
        } else if (flashProgress < logoFlashDuration - fadeDuration) {
          this.logoSprite.alpha = 1;
        } else {
          this.logoSprite.alpha = Math.max(0, 1 - (flashProgress - (logoFlashDuration - fadeDuration)) / fadeDuration);
        }
      }
    }

    if (!this.exitTextFadedIn && this.elapsedSeconds > 1.5) {
      this.exitTextFadedIn = true;
    }

    if (this.exitTextFadedIn) {
      const fadeProgress = Math.min(1, (this.elapsedSeconds - 1.5) / 1.2);
      const breathe = (Math.sin(this.elapsedSeconds * 0.6) + 1) * 0.5;
      this.exitText.alpha = fadeProgress * (0.3 + breathe * 0.12);
    }
  }
}
