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

const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;
const STAR_COUNT = 80;
const CREDIT_CYCLE_SECONDS = 4;
const SKY_TEXTURE_WIDTH = 64;
const SKY_TEXTURE_HEIGHT = 256;
const BEAM_TEXTURE_WIDTH = 720;
const BEAM_TEXTURE_HEIGHT = 1200;
const FOG_TEXTURE_WIDTH = 640;
const FOG_TEXTURE_HEIGHT = 240;
const GLOW_TEXTURE_SIZE = 256;

const SKY_TOP = '#030711';
const SKY_BOTTOM = '#0f3043';
const LIGHT_TINT = 0xdff0ff;
const TEXT_TINT = '#f8fbff';

type StarConfig = {
  sprite: Graphics;
  x: number;
  y: number;
  baseAlpha: number;
  amplitude: number;
  speed: number;
  phase: number;
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
  private readonly moonLayer = new Container();
  private readonly cityLayer = new Container();
  private readonly fogLayer = new Container();
  private readonly beamLayer = new Container();
  private readonly textLayer = new Container();
  private readonly generatedTextures: Texture[] = [];
  private readonly starConfigs: StarConfig[] = [];
  private readonly moonGlowFilter = new BlurFilter({ strength: 26, quality: 2 });
  private readonly fogBlurFilter = new BlurFilter({ strength: 18, quality: 2 });
  private readonly beamOuterBlurFilter = new BlurFilter({ strength: 22, quality: 2 });
  private readonly beamCoreBlurFilter = new BlurFilter({ strength: 12, quality: 2 });
  private readonly eyeGlowFilter = new BlurFilter({ strength: 12, quality: 2 });
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
  private moonGlow!: Sprite;
  private moonSprite!: Sprite;
  private fogBack!: Sprite;
  private fogFront!: Sprite;
  private beamOuter!: Sprite;
  private beamInner!: Sprite;
  private sourceGlow!: Sprite;
  private eyeGlow!: Sprite;
  private eyeSprite!: Sprite;
  private projectorBody!: Graphics;
  private creditsText!: Text;
  private exitText!: Text;
  private elapsedSeconds = 0;
  private currentCreditIndex = -1;
  private designScale = 1;
  private sourceX = 0;
  private sourceY = 0;
  private beamAnchorX = 0;
  private beamAnchorY = 0;
  private beamWidth = 0;
  private beamHeight = 0;
  private destroyed = false;
  private appInitialized = false;
  private appDisposed = false;

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

    const [cityTexture, eyeTexture, moonTexture] = await Promise.all([
      this.loadTexture(CREDITS_CITY_SOURCES),
      this.loadTexture(CREDITS_BIG_EYE_SOURCES),
      this.loadTexture(CREDITS_MOON_SOURCES),
    ]);

    if (this.destroyed) {
      this.disposeApplication();
      return;
    }

    this.app.stage.addChild(this.root);
    this.root.addChild(
      this.skyLayer,
      this.starsLayer,
      this.moonLayer,
      this.cityLayer,
      this.fogLayer,
      this.beamLayer,
      this.textLayer,
    );

    this.createSky();
    this.createStars();
    this.createMoon(moonTexture);
    this.createCity(cityTexture);
    this.createFog();
    this.createBeam();
    this.createProjector();
    this.createEye(eyeTexture);
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
    gradient.addColorStop(0.55, '#07131d');
    gradient.addColorStop(1, SKY_BOTTOM);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = Texture.from(canvas);
    this.generatedTextures.push(texture);
    return texture;
  }

  private createStars(): void {
    for (let index = 0; index < STAR_COUNT; index += 1) {
      const radius = 0.8 + Math.random() * 1.6;
      const star = new Graphics();

      star.circle(0, 0, radius).fill({ color: 0xffffff, alpha: 1 });
      this.starsLayer.addChild(star);
      this.starConfigs.push({
        sprite: star,
        x: 0.04 + Math.random() * 0.92,
        y: 0.03 + Math.random() * 0.34,
        baseAlpha: 0.18 + Math.random() * 0.32,
        amplitude: 0.06 + Math.random() * 0.14,
        speed: 0.35 + Math.random() * 0.55,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private createMoon(texture: Texture): void {
    this.moonGlow = new Sprite(texture);
    this.moonGlow.anchor.set(0.5);
    this.moonGlow.tint = 0xf3f7ff;
    this.moonGlow.alpha = 0.12;
    this.moonGlow.filters = [this.moonGlowFilter];

    this.moonSprite = new Sprite(texture);
    this.moonSprite.anchor.set(0.5);
    this.moonSprite.alpha = 0.22;

    this.moonLayer.addChild(this.moonGlow, this.moonSprite);
  }

  private createCity(texture: Texture): void {
    this.citySprite = new Sprite(texture);
    this.citySprite.anchor.set(0.5, 1);
    this.cityLayer.addChild(this.citySprite);
  }

  private createFog(): void {
    const fogTexture = this.createFogTexture();

    this.fogBack = new Sprite(fogTexture);
    this.fogBack.anchor.set(0.5, 1);
    this.fogBack.alpha = 0.16;
    this.fogBack.filters = [this.fogBlurFilter];

    this.fogFront = new Sprite(fogTexture);
    this.fogFront.anchor.set(0.5, 1);
    this.fogFront.alpha = 0.22;
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

    const gradient = context.createRadialGradient(
      canvas.width * 0.5,
      canvas.height * 0.88,
      canvas.width * 0.06,
      canvas.width * 0.5,
      canvas.height * 0.76,
      canvas.width * 0.5,
    );
    gradient.addColorStop(0, 'rgba(238, 246, 255, 0.72)');
    gradient.addColorStop(0.45, 'rgba(217, 232, 246, 0.26)');
    gradient.addColorStop(1, 'rgba(217, 232, 246, 0)');

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
    this.beamOuter.anchor.set(0.5, 1);
    this.beamOuter.alpha = 0.3;
    this.beamOuter.filters = [this.beamOuterBlurFilter];

    this.beamInner = new Sprite(innerTexture);
    this.beamInner.anchor.set(0.5, 1);
    this.beamInner.alpha = 0.34;
    this.beamInner.filters = [this.beamCoreBlurFilter];

    this.sourceGlow = new Sprite(glowTexture);
    this.sourceGlow.anchor.set(0.5);
    this.sourceGlow.alpha = 0.58;
    this.sourceGlow.tint = LIGHT_TINT;
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

    const baseWidth = options.core ? canvas.width * 0.12 : canvas.width * 0.18;
    const topWidth = options.core ? canvas.width * 0.36 : canvas.width * 0.58;
    const tipY = canvas.height * 0.06;

    context.save();
    context.beginPath();
    context.moveTo(canvas.width * 0.5 - baseWidth, canvas.height);
    context.lineTo(canvas.width * 0.5 - topWidth, tipY);
    context.lineTo(canvas.width * 0.5 + topWidth, tipY);
    context.lineTo(canvas.width * 0.5 + baseWidth, canvas.height);
    context.closePath();
    context.clip();

    const crossFade = context.createRadialGradient(
      canvas.width * 0.52,
      canvas.height * 0.82,
      canvas.width * 0.03,
      canvas.width * 0.5,
      canvas.height * 0.46,
      canvas.width * 0.48,
    );
    crossFade.addColorStop(0, options.core ? 'rgba(244, 250, 255, 0.95)' : 'rgba(220, 239, 255, 0.7)');
    crossFade.addColorStop(0.28, options.core ? 'rgba(215, 236, 255, 0.55)' : 'rgba(198, 224, 244, 0.28)');
    crossFade.addColorStop(1, 'rgba(160, 210, 255, 0)');
    context.fillStyle = crossFade;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const verticalFade = context.createLinearGradient(0, canvas.height, 0, tipY);
    verticalFade.addColorStop(0, options.core ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.55)');
    verticalFade.addColorStop(0.25, options.core ? 'rgba(236,245,255,0.52)' : 'rgba(220,236,251,0.26)');
    verticalFade.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = verticalFade;
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (let index = 0; index < 10; index += 1) {
      const progress = index / 9;
      const centerY = canvas.height * (0.94 - progress * 0.72);
      const radiusX = canvas.width * (options.core ? 0.06 + progress * 0.07 : 0.09 + progress * 0.11);
      const radiusY = canvas.height * (options.core ? 0.035 + progress * 0.032 : 0.055 + progress * 0.046);
      const glow = context.createRadialGradient(
        canvas.width * 0.5,
        centerY,
        radiusX * 0.14,
        canvas.width * 0.5,
        centerY,
        radiusX,
      );
      glow.addColorStop(0, options.core ? 'rgba(245,250,255,0.12)' : 'rgba(223,240,255,0.08)');
      glow.addColorStop(1, 'rgba(223,240,255,0)');
      context.fillStyle = glow;
      context.beginPath();
      context.ellipse(canvas.width * 0.5, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
      context.fill();
    }

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
      canvas.width * 0.06,
      canvas.width * 0.5,
      canvas.height * 0.5,
      canvas.width * 0.5,
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.22, 'rgba(215,235,255,0.8)');
    gradient.addColorStop(1, 'rgba(215,235,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = Texture.from(canvas);
    this.generatedTextures.push(texture);
    return texture;
  }

  private createProjector(): void {
    this.projectorBody = new Graphics();
    this.projectorBody.roundRect(-18, -8, 36, 14, 5).fill({ color: 0x0c1220, alpha: 0.96 });
    this.projectorBody.roundRect(12, -4, 12, 6, 3).fill({ color: 0x18253a, alpha: 0.9 });
    this.projectorBody.rect(-8, 6, 16, 3).fill({ color: 0x07111d, alpha: 0.9 });
    this.beamLayer.addChild(this.projectorBody);
  }

  private createEye(texture: Texture): void {
    this.eyeGlow = new Sprite(texture);
    this.eyeGlow.anchor.set(0.5);
    this.eyeGlow.alpha = 0.44;
    this.eyeGlow.tint = LIGHT_TINT;
    this.eyeGlow.filters = [this.eyeGlowFilter];

    this.eyeSprite = new Sprite(texture);
    this.eyeSprite.anchor.set(0.5);
    this.eyeSprite.alpha = 0.9;

    this.textLayer.addChild(this.eyeGlow, this.eyeSprite);
  }

  private createTexts(): void {
    this.creditsText = new Text({
      text: '',
      style: {
        align: 'center',
        dropShadow: {
          alpha: 0.4,
          blur: 12,
          color: '#00111d',
          distance: 0,
        },
        fill: TEXT_TINT,
        fontFamily: 'Inter, Avenir, Helvetica, Arial, sans-serif',
        fontSize: 22,
        fontWeight: '600',
        letterSpacing: 0.5,
        lineHeight: 28,
        wordWrap: true,
        wordWrapWidth: 150,
      },
    });
    this.creditsText.anchor.set(0.5);

    this.exitText = new Text({
      text: 'Tap to exit',
      style: {
        align: 'center',
        dropShadow: {
          alpha: 0.4,
          blur: 8,
          color: '#00111d',
          distance: 0,
        },
        fill: '#dbeafe',
        fontFamily: 'Inter, Avenir, Helvetica, Arial, sans-serif',
        fontSize: 14,
        fontWeight: '500',
        letterSpacing: 1,
      },
    });
    this.exitText.anchor.set(0.5);

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
      starConfig.sprite.scale.set(0.85 + this.designScale * 0.28);
    }

    const cityScale = Math.max(width / this.citySprite.texture.width, height / this.citySprite.texture.height);
    this.citySprite.width = this.citySprite.texture.width * cityScale;
    this.citySprite.height = this.citySprite.texture.height * cityScale;
    this.citySprite.x = width * 0.5;
    this.citySprite.y = height;

    const cityLeft = this.citySprite.x - this.citySprite.width / 2;
    const cityTop = this.citySprite.y - this.citySprite.height;

    const moonX = cityLeft + this.citySprite.width * 0.25;
    const moonY = cityTop + this.citySprite.height * 0.17;
    const moonSize = Math.max(72, width * 0.15);
    this.moonGlow.x = moonX;
    this.moonGlow.y = moonY;
    this.moonGlow.width = moonSize * 1.48;
    this.moonGlow.height = moonSize * 1.48;
    this.moonSprite.x = moonX;
    this.moonSprite.y = moonY;
    this.moonSprite.width = moonSize;
    this.moonSprite.height = moonSize;

    const fogHorizonY = cityTop + this.citySprite.height * 0.79;
    this.fogBack.x = width * 0.5;
    this.fogBack.y = fogHorizonY + height * 0.02;
    this.fogBack.width = width * 1.08;
    this.fogBack.height = height * 0.19;

    this.fogFront.x = width * 0.56;
    this.fogFront.y = fogHorizonY + height * 0.012;
    this.fogFront.width = width * 1.18;
    this.fogFront.height = height * 0.16;

    this.sourceX = cityLeft + this.citySprite.width * 0.79;
    this.sourceY = cityTop + this.citySprite.height * 0.57;
    this.beamAnchorX = this.sourceX - width * 0.02;
    this.beamAnchorY = this.sourceY + height * 0.014;
    this.beamWidth = Math.max(width * 0.48, 220);
    this.beamHeight = Math.max(height * 0.62, 520);

    const beamRotation = -0.26;
    this.beamOuter.x = this.beamAnchorX;
    this.beamOuter.y = this.beamAnchorY;
    this.beamOuter.width = this.beamWidth * 1.06;
    this.beamOuter.height = this.beamHeight;
    this.beamOuter.rotation = beamRotation;

    this.beamInner.x = this.beamAnchorX;
    this.beamInner.y = this.beamAnchorY;
    this.beamInner.width = this.beamWidth * 0.74;
    this.beamInner.height = this.beamHeight * 0.95;
    this.beamInner.rotation = beamRotation;

    this.sourceGlow.x = this.sourceX + width * 0.003;
    this.sourceGlow.y = this.sourceY;
    this.sourceGlow.width = width * 0.15;
    this.sourceGlow.height = width * 0.15;

    this.projectorBody.x = this.sourceX;
    this.projectorBody.y = this.sourceY + height * 0.004;
    this.projectorBody.scale.set(Math.max(0.82, this.designScale * 0.94));

    const eyeX = this.beamAnchorX - this.beamWidth * 0.18;
    const eyeY = this.beamAnchorY - this.beamHeight * 0.52;
    const eyeWidth = Math.max(70, width * 0.18);
    const eyeHeight = eyeWidth * 0.54;
    this.eyeGlow.x = eyeX;
    this.eyeGlow.y = eyeY;
    this.eyeGlow.width = eyeWidth * 1.14;
    this.eyeGlow.height = eyeHeight * 1.14;
    this.eyeSprite.x = eyeX;
    this.eyeSprite.y = eyeY;
    this.eyeSprite.width = eyeWidth;
    this.eyeSprite.height = eyeHeight;

    this.creditsText.x = eyeX;
    this.creditsText.y = eyeY + height * 0.1;
    this.creditsText.style.fontSize = Math.max(19, 22 * this.designScale);
    this.creditsText.style.lineHeight = Math.max(24, 29 * this.designScale);
    this.creditsText.style.wordWrapWidth = Math.max(150, width * 0.34);

    this.exitText.x = width * 0.5;
    this.exitText.y = height - Math.max(26, 42 * this.designScale);
    this.exitText.style.fontSize = Math.max(12, 14 * this.designScale);
  }

  private update(): void {
    this.elapsedSeconds += this.app.ticker.deltaMS / 1000;

    this.moonGlow.alpha = 0.08 + (Math.sin((this.elapsedSeconds / 6.5) * Math.PI * 2) + 1) * 0.03;
    this.moonSprite.alpha = 0.16 + (Math.sin((this.elapsedSeconds / 7.5) * Math.PI * 2) + 1) * 0.03;

    for (const starConfig of this.starConfigs) {
      const shimmer = (Math.sin(this.elapsedSeconds * starConfig.speed + starConfig.phase) + 1) * 0.5;
      starConfig.sprite.alpha = starConfig.baseAlpha + shimmer * starConfig.amplitude;
    }

    const fogDrift = Math.sin(this.elapsedSeconds * 0.08) * (14 * this.designScale);
    this.fogBack.x = this.app.renderer.screen.width * 0.5 + fogDrift;
    this.fogFront.x = this.app.renderer.screen.width * 0.56 - fogDrift * 0.65;

    const beamPulse = (Math.sin(this.elapsedSeconds * 0.42) + 1) * 0.5;
    this.beamOuter.alpha = 0.23 + beamPulse * 0.08;
    this.beamInner.alpha = 0.25 + beamPulse * 0.09;
    this.sourceGlow.alpha = 0.45 + beamPulse * 0.12;

    const eyePulse = 1 + Math.sin(this.elapsedSeconds * 0.36) * 0.03;
    this.eyeSprite.scale.set(eyePulse);
    this.eyeGlow.scale.set(eyePulse * 1.04);
    this.eyeGlow.alpha = 0.34 + beamPulse * 0.1;

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

    this.exitText.alpha = 0.54 + (Math.sin(this.elapsedSeconds * 0.85) + 1) * 0.1;
  }
}
