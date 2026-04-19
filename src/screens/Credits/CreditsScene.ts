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
  CREDITS_BIG_EYE_SOURCES,
  CREDITS_CITY_SOURCES,
  CREDITS_MOON_SOURCES,
} from './creditsAssetPaths';
import { buildCreditsAssetCandidates } from './creditsAssetPaths';

const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;
const SMALL_STAR_COUNT = 42;
const MEDIUM_STAR_COUNT = 18;
const HERO_STAR_COUNT = 6;
const STAR_GROUPS = [
  {
    count: SMALL_STAR_COUNT,
    radiusRange: [0.45, 0.9] as const,
    alphaRange: [0.16, 0.3] as const,
    amplitudeRange: [0.04, 0.08] as const,
    speedRange: [0.24, 0.46] as const,
    yRange: [0.05, 0.52] as const,
  },
  {
    count: MEDIUM_STAR_COUNT,
    radiusRange: [0.85, 1.45] as const,
    alphaRange: [0.28, 0.5] as const,
    amplitudeRange: [0.06, 0.12] as const,
    speedRange: [0.28, 0.5] as const,
    yRange: [0.08, 0.46] as const,
  },
  {
    count: HERO_STAR_COUNT,
    radiusRange: [1.5, 2.2] as const,
    alphaRange: [0.46, 0.72] as const,
    amplitudeRange: [0.08, 0.16] as const,
    speedRange: [0.18, 0.36] as const,
    yRange: [0.12, 0.4] as const,
  },
] as const;
const WINDOW_LIGHT_COUNT = 84;
const CREDIT_CYCLE_SECONDS = 4.5;
const SCENE_INTRO_DURATION = 1.8;
const TEXT_DELAY_AFTER_SCENE = 0.6;
const SKY_TEXTURE_WIDTH = 64;
const SKY_TEXTURE_HEIGHT = 256;
const FOG_TEXTURE_WIDTH = 640;
const FOG_TEXTURE_HEIGHT = 200;
const SKY_TOP = '#020610';
const SKY_BOTTOM = '#0c2a3c';
const TEXT_TINT = '#f8fbff';
const WARM_WINDOW_COLOR = 0xffe8a3;
const PLAYFUL_FONT_STACK = '\'Trebuchet MS\', \'Avenir Next Rounded\', \'Arial Rounded MT Bold\', \'Montserrat\', sans-serif';

const KOLEQUANT_LOGO_SOURCES = buildCreditsAssetCandidates('assets/kolequant.png');
/** Keep projected credits readable on narrow portrait screens. */
const MIN_CREDIT_FONT_SIZE = 18;
/** Preserve airy line spacing once credits wrap to multiple lines. */
const CREDIT_LINE_HEIGHT_RATIO = 1.38;
const CREDIT_LINE_HEIGHT_PADDING = 8;
const MIN_CREDIT_WRAP_WIDTH = 160;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type StarConfig = {
  sprite: Graphics;
  x: number;
  y: number;
  baseScale: number;
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
  private readonly celestialLayer = new Container();
  private readonly cityLayer = new Container();
  private readonly windowsLayer = new Container();
  private readonly fogLayer = new Container();
  private readonly textLayer = new Container();
  private readonly logoLayer = new Container();
  private readonly generatedTextures: Texture[] = [];
  private readonly starConfigs: StarConfig[] = [];
  private readonly windowLightConfigs: WindowLightConfig[] = [];
  private readonly fogBlurFilter = new BlurFilter({ strength: 14, quality: 2 });
  private readonly tick = () => {
    this.update();
  };
  private readonly handleWindowResize = () => {
    this.layout();
  };

  private resizeObserver: ResizeObserver | null = null;
  private fallbackResizeHandlerAttached = false;
  private skySprite!: Sprite;
  private moonSprite!: Sprite;
  private eyeSprite!: Sprite;
  private citySprite!: Sprite;
  private fogBack!: Sprite;
  private fogFront!: Sprite;
  private logoSprite: Sprite | null = null;
  private creditsText!: Text;
  private exitText!: Text;
  private elapsedSeconds = 0;
  private currentCreditIndex = -1;
  private designScale = 1;
  private creditsBaseY = 0;
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

    const [cityTexture, moonTexture, eyeTexture] = await Promise.all([
      this.loadTexture(CREDITS_CITY_SOURCES),
      this.loadTexture(CREDITS_MOON_SOURCES),
      this.loadTexture(CREDITS_BIG_EYE_SOURCES),
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
      this.celestialLayer,
      this.cityLayer,
      this.windowsLayer,
      this.fogLayer,
      this.textLayer,
      this.logoLayer,
    );

    this.createSky();
    this.createStars();
    this.createCelestial(moonTexture, eyeTexture);
    this.createCity(cityTexture);
    this.createWindowLights();
    this.createFog();
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
          y: group.yRange[0] + Math.random() * (group.yRange[1] - group.yRange[0]),
          baseScale: 0.82 + Math.random() * 0.46,
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

  private createCelestial(moonTexture: Texture, eyeTexture: Texture): void {
    this.moonSprite = new Sprite(moonTexture);
    this.moonSprite.anchor.set(0.5);
    this.moonSprite.alpha = 0.92;

    this.eyeSprite = new Sprite(eyeTexture);
    this.eyeSprite.anchor.set(0.5);
    this.eyeSprite.alpha = 0.9;

    this.celestialLayer.addChild(this.moonSprite, this.eyeSprite);
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
        baseAlpha,
        targetAlpha: baseAlpha,
        currentAlpha: baseAlpha,
        fadeSpeed: 0.7 + Math.random() * 1.1,
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
        fontSize: 24,
        fontWeight: '700',
        letterSpacing: 1.2,
        lineHeight: 38,
        wordWrap: true,
        wordWrapWidth: 260,
      },
    });
    this.creditsText.anchor.set(0.5);

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

    this.textLayer.addChild(this.creditsText, this.exitText);
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
      starConfig.sprite.scale.set((0.76 + this.designScale * 0.24) * starConfig.baseScale);
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

    const moonSize = clamp(width * 0.34, 110, 168);
    this.moonSprite.x = width * 0.26;
    this.moonSprite.y = height * 0.17;
    this.moonSprite.width = moonSize;
    this.moonSprite.height = moonSize;

    const eyeWidth = moonSize * 0.82;
    this.eyeSprite.x = this.moonSprite.x + moonSize * 0.05;
    this.eyeSprite.y = this.moonSprite.y - moonSize * 0.01;
    this.eyeSprite.width = eyeWidth;
    this.eyeSprite.height = eyeWidth * (this.eyeSprite.texture.height / this.eyeSprite.texture.width);

    this.refreshCreditLayout();

    this.exitText.x = width * 0.5;
    this.exitText.y = height - Math.max(28, 44 * this.designScale);
    this.exitText.style.fontSize = Math.max(11, 13 * this.designScale);

    if (this.logoSprite) {
      const logoSize = Math.min(width * 0.35, 140) * this.designScale;
      this.logoSprite.x = width * 0.5;
      this.logoSprite.y = height * 0.42;
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

    const cityTop = this.citySprite.y - this.citySprite.height;
    const minCreditsY = this.moonSprite.y + this.moonSprite.height * 0.7;
    const maxCreditsY = cityTop - Math.max(44, height * 0.05);

    this.creditsBaseY = Math.max(minCreditsY, Math.min(height * 0.37, maxCreditsY));
    this.creditsText.x = width * 0.5;
    this.creditsText.y = this.creditsBaseY;
    this.creditsText.text = creditText;

    let fontSize = Math.max(22, Math.round(27 * this.designScale));
    let lineHeight = Math.max(
      Math.round(fontSize * CREDIT_LINE_HEIGHT_RATIO),
      fontSize + CREDIT_LINE_HEIGHT_PADDING,
    );
    const wordWrapWidth = Math.floor(clamp(width * 0.72, MIN_CREDIT_WRAP_WIDTH, 320));
    this.creditsText.style.fontSize = fontSize;
    this.creditsText.style.lineHeight = lineHeight;
    this.creditsText.style.wordWrapWidth = wordWrapWidth;

    let bounds = this.creditsText.getLocalBounds();
    while ((bounds.width > wordWrapWidth || bounds.height > height * 0.2) && fontSize > MIN_CREDIT_FONT_SIZE) {
      fontSize -= 1;
      lineHeight = Math.max(
        Math.round(fontSize * CREDIT_LINE_HEIGHT_RATIO),
        fontSize + CREDIT_LINE_HEIGHT_PADDING,
      );
      this.creditsText.style.fontSize = fontSize;
      this.creditsText.style.lineHeight = lineHeight;
      bounds = this.creditsText.getLocalBounds();
    }
  }

  private update(): void {
    this.elapsedSeconds += this.app.ticker.deltaMS / 1000;

    for (const starConfig of this.starConfigs) {
      const shimmer = Math.sin(this.elapsedSeconds * starConfig.speed + starConfig.phase);
      const twinkle = clamp(starConfig.baseAlpha + shimmer * starConfig.amplitude, 0.08, 0.98);
      starConfig.sprite.alpha = twinkle;
      starConfig.sprite.scale.set(
        (0.76 + this.designScale * 0.24)
        * starConfig.baseScale
        * (0.92 + ((shimmer + 1) * 0.5) * 0.18),
      );
    }

    for (const windowConfig of this.windowLightConfigs) {
      if (this.elapsedSeconds >= windowConfig.nextChangeAt) {
        windowConfig.targetAlpha = clamp(
          windowConfig.baseAlpha * (0.45 + Math.random() * 1.75),
          0.12,
          0.95,
        );
        windowConfig.fadeSpeed = 0.7 + Math.random() * 1.1;
        windowConfig.nextChangeAt = this.elapsedSeconds + 0.5 + Math.random() * 1.8;
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

    const sceneIntro = Math.min(1, this.elapsedSeconds / SCENE_INTRO_DURATION);
    const celestialPulse = (Math.sin(this.elapsedSeconds * 0.32) + 1) * 0.5;
    this.moonSprite.alpha = sceneIntro * (0.86 + celestialPulse * 0.1);
    this.eyeSprite.alpha = sceneIntro * (0.78 + celestialPulse * 0.16);

    const textStartTime = TEXT_DELAY_AFTER_SCENE;
    const textElapsed = Math.max(0, this.elapsedSeconds - textStartTime);

    const totalCycleTime = this.credits.length * CREDIT_CYCLE_SECONDS;
    const logoFlashStart = totalCycleTime;
    const logoFlashDuration = 2.4;
    const fullCycleDuration = totalCycleTime + logoFlashDuration;
    const loopTime = textElapsed % fullCycleDuration;

    if (textElapsed <= 0) {
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
        this.creditsText.alpha = cycleProgress * sceneIntro;
      } else if (cycleProgress < 3.5) {
        this.creditsText.alpha = sceneIntro;
      } else {
        this.creditsText.alpha = Math.max(0, 1 - (cycleProgress - 3.5) * 2) * sceneIntro;
      }
      this.creditsText.y = this.creditsBaseY + Math.sin((this.elapsedSeconds + cycleIndex) * 0.8) * (4 * this.designScale);

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
