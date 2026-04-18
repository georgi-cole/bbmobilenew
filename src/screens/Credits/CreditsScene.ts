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

const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;
const STAR_COUNT = 50;
const WINDOW_LIGHT_COUNT = 60;
const CREDIT_CYCLE_SECONDS = 4;
const SKY_TEXTURE_WIDTH = 64;
const SKY_TEXTURE_HEIGHT = 256;
const BEAM_TEXTURE_WIDTH = 480;
const BEAM_TEXTURE_HEIGHT = 960;
const FOG_TEXTURE_WIDTH = 640;
const FOG_TEXTURE_HEIGHT = 200;
const GLOW_TEXTURE_SIZE = 256;

const SKY_TOP = '#020610';
const SKY_BOTTOM = '#0c2a3c';
const TEXT_TINT = '#f0f6ff';
const WARM_WINDOW_COLOR = 0xffe8a3;
const PLAYFUL_FONT_STACK = '\'Trebuchet MS\', \'Avenir Next Rounded\', \'Arial Rounded MT Bold\', \'Montserrat\', sans-serif';

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
  private readonly generatedTextures: Texture[] = [];
  private readonly starConfigs: StarConfig[] = [];
  private readonly windowLightConfigs: WindowLightConfig[] = [];
  private readonly fogBlurFilter = new BlurFilter({ strength: 14, quality: 2 });
  private readonly beamOuterBlurFilter = new BlurFilter({ strength: 18, quality: 2 });
  private readonly beamCoreBlurFilter = new BlurFilter({ strength: 10, quality: 2 });
  private readonly sourceGlowFilter = new BlurFilter({ strength: 8, quality: 2 });
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
  private beamOuter!: Sprite;
  private beamInner!: Sprite;
  private sourceGlow!: Sprite;
  private creditsText!: Text;
  private exitText!: Text;
  private elapsedSeconds = 0;
  private currentCreditIndex = -1;
  private designScale = 1;
  private beamOriginX = 0;
  private beamOriginY = 0;
  private destroyed = false;
  private appInitialized = false;
  private appDisposed = false;
  private exitTextFadedIn = false;

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

    this.app.stage.addChild(this.root);
    this.root.addChild(
      this.skyLayer,
      this.starsLayer,
      this.cityLayer,
      this.windowsLayer,
      this.fogLayer,
      this.beamLayer,
      this.textLayer,
    );

    this.createSky();
    this.createStars();
    this.createCity(cityTexture);
    this.createWindowLights();
    this.createFog();
    this.createBeam();
    this.createTexts();
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
    for (let index = 0; index < STAR_COUNT; index += 1) {
      const radius = 0.5 + Math.random() * 1.2;
      const star = new Graphics();

      star.circle(0, 0, radius).fill({ color: 0xffffff, alpha: 1 });
      this.starsLayer.addChild(star);
      this.starConfigs.push({
        sprite: star,
        x: 0.04 + Math.random() * 0.92,
        y: 0.02 + Math.random() * 0.32,
        baseAlpha: 0.15 + Math.random() * 0.35,
        amplitude: 0.04 + Math.random() * 0.12,
        speed: 0.25 + Math.random() * 0.45,
        phase: Math.random() * Math.PI * 2,
      });
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
        y: 0.15 + Math.random() * 0.7,
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
    this.fogBack.alpha = 0.1;
    this.fogBack.filters = [this.fogBlurFilter];

    this.fogFront = new Sprite(fogTexture);
    this.fogFront.anchor.set(0.5, 1);
    this.fogFront.alpha = 0.14;
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
    gradient.addColorStop(0.5, 'rgba(200, 220, 240, 0.25)');
    gradient.addColorStop(1, 'rgba(180, 205, 230, 0.4)');

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = Texture.from(canvas);
    this.generatedTextures.push(texture);
    return texture;
  }

  private createBeam(): void {
    const outerTexture = this.createBeamTexture({ core: false });
    const innerTexture = this.createBeamTexture({ core: true });
    const glowTexture = this.createGlowTexture();

    this.beamOuter = new Sprite(outerTexture);
    this.beamOuter.anchor.set(0.5, 0);
    this.beamOuter.alpha = 0.14;
    this.beamOuter.filters = [this.beamOuterBlurFilter];

    this.beamInner = new Sprite(innerTexture);
    this.beamInner.anchor.set(0.5, 0);
    this.beamInner.alpha = 0.18;
    this.beamInner.filters = [this.beamCoreBlurFilter];

    this.sourceGlow = new Sprite(glowTexture);
    this.sourceGlow.anchor.set(0.5);
    this.sourceGlow.alpha = 0.35;
    this.sourceGlow.tint = 0xdff0ff;
    this.sourceGlow.filters = [this.sourceGlowFilter];

    this.beamLayer.addChild(this.beamOuter, this.beamInner, this.sourceGlow);
  }

  private createBeamTexture(options: { core: boolean }): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = BEAM_TEXTURE_WIDTH;
    canvas.height = BEAM_TEXTURE_HEIGHT;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context unavailable for projector beam.');
    }

    const topWidth = options.core ? canvas.width * 0.04 : canvas.width * 0.07;
    const bottomWidth = options.core ? canvas.width * 0.18 : canvas.width * 0.28;
    const cx = canvas.width * 0.5;

    context.save();
    context.beginPath();
    context.moveTo(cx - topWidth, 0);
    context.lineTo(cx - bottomWidth, canvas.height);
    context.lineTo(cx + bottomWidth, canvas.height);
    context.lineTo(cx + topWidth, 0);
    context.closePath();
    context.clip();

    const verticalFade = context.createLinearGradient(0, 0, 0, canvas.height);
    verticalFade.addColorStop(0, options.core ? 'rgba(240, 248, 255, 0.7)' : 'rgba(210, 235, 255, 0.4)');
    verticalFade.addColorStop(0.3, options.core ? 'rgba(225, 240, 255, 0.35)' : 'rgba(200, 225, 250, 0.18)');
    verticalFade.addColorStop(0.7, options.core ? 'rgba(210, 232, 250, 0.12)' : 'rgba(190, 218, 245, 0.06)');
    verticalFade.addColorStop(1, 'rgba(190, 218, 245, 0)');
    context.fillStyle = verticalFade;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const horizontalFade = context.createRadialGradient(
      cx,
      canvas.height * 0.2,
      canvas.width * 0.01,
      cx,
      canvas.height * 0.35,
      canvas.width * 0.25,
    );
    horizontalFade.addColorStop(0, options.core ? 'rgba(245, 252, 255, 0.5)' : 'rgba(220, 240, 255, 0.2)');
    horizontalFade.addColorStop(1, 'rgba(220, 240, 255, 0)');
    context.fillStyle = horizontalFade;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.restore();

    const texture = Texture.from(canvas);
    this.generatedTextures.push(texture);
    return texture;
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

  private createTexts(): void {
    this.creditsText = new Text({
      text: '',
      style: {
        align: 'center',
        dropShadow: {
          alpha: 0.5,
          blur: 14,
          color: '#000000',
          distance: 0,
        },
        fill: TEXT_TINT,
        fontFamily: PLAYFUL_FONT_STACK,
        fontSize: 22,
        fontWeight: '600',
        letterSpacing: 0.9,
        lineHeight: 30,
        wordWrap: true,
        wordWrapWidth: 200,
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
      starConfig.sprite.scale.set(0.8 + this.designScale * 0.25);
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

    this.beamOriginX = width * 0.58;
    this.beamOriginY = -height * 0.04;
    const beamWidth = Math.max(width * 0.34, 140);
    const beamHeight = Math.max(height * 0.72, 580);
    const beamRotation = 0.06;

    this.beamOuter.x = this.beamOriginX;
    this.beamOuter.y = this.beamOriginY;
    this.beamOuter.width = beamWidth * 1.1;
    this.beamOuter.height = beamHeight;
    this.beamOuter.rotation = beamRotation;

    this.beamInner.x = this.beamOriginX;
    this.beamInner.y = this.beamOriginY;
    this.beamInner.width = beamWidth * 0.7;
    this.beamInner.height = beamHeight * 0.95;
    this.beamInner.rotation = beamRotation;

    this.sourceGlow.x = this.beamOriginX;
    this.sourceGlow.y = this.beamOriginY + height * 0.01;
    this.sourceGlow.width = width * 0.12;
    this.sourceGlow.height = width * 0.12;

    const textX = this.beamOriginX + Math.sin(beamRotation) * beamHeight * 0.42;
    const textY = height * 0.42;
    this.creditsText.x = textX;
    this.creditsText.y = textY;
    this.creditsText.style.fontSize = Math.max(18, 22 * this.designScale);
    this.creditsText.style.lineHeight = Math.max(24, 30 * this.designScale);
    this.creditsText.style.wordWrapWidth = Math.max(170, width * 0.42);

    this.exitText.x = width * 0.5;
    this.exitText.y = height - Math.max(28, 44 * this.designScale);
    this.exitText.style.fontSize = Math.max(11, 13 * this.designScale);
  }

  private update(): void {
    this.elapsedSeconds += this.app.ticker.deltaMS / 1000;

    for (const starConfig of this.starConfigs) {
      const shimmer = (Math.sin(this.elapsedSeconds * starConfig.speed + starConfig.phase) + 1) * 0.5;
      starConfig.sprite.alpha = starConfig.baseAlpha + shimmer * starConfig.amplitude;
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

    const beamPulse = (Math.sin(this.elapsedSeconds * 0.35) + 1) * 0.5;
    this.beamOuter.alpha = 0.1 + beamPulse * 0.04;
    this.beamInner.alpha = 0.14 + beamPulse * 0.04;
    this.sourceGlow.alpha = 0.25 + beamPulse * 0.08;

    const cycleIndex = Math.floor(this.elapsedSeconds / CREDIT_CYCLE_SECONDS) % this.credits.length;
    const cycleProgress = this.elapsedSeconds % CREDIT_CYCLE_SECONDS;

    if (cycleIndex !== this.currentCreditIndex) {
      this.currentCreditIndex = cycleIndex;
      this.creditsText.text = this.credits[cycleIndex];
    }

    if (cycleProgress < 1) {
      this.creditsText.alpha = cycleProgress;
    } else if (cycleProgress < 3) {
      this.creditsText.alpha = 1;
    } else {
      this.creditsText.alpha = Math.max(0, 1 - (cycleProgress - 3));
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
