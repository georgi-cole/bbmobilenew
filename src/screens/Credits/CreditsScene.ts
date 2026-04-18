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
const STAR_COUNT = 96;
const WINDOW_LIGHT_COUNT = 72;
const CREDIT_CYCLE_SECONDS = 4;

const SKY_TOP = '#040814';
const SKY_BOTTOM = '#123247';
const WARM_WINDOW_COLOR = 0xffe8a3;

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
  x: number;
  y: number;
  width: number;
  height: number;
  baseAlpha: number;
  minAlpha: number;
  maxAlpha: number;
  speed: number;
  phase: number;
  threshold: number;
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
  private readonly windowsLayer = new Container();
  private readonly beamLayer = new Container();
  private readonly textLayer = new Container();
  private readonly generatedTextures: Texture[] = [];
  private readonly starConfigs: StarConfig[] = [];
  private readonly windowLightConfigs: WindowLightConfig[] = [];
  private readonly moonGlowFilter = new BlurFilter({ strength: 18, quality: 2 });
  private readonly beamGlowFilter = new BlurFilter({ strength: 14, quality: 2 });
  private readonly eyeGlowFilter = new BlurFilter({ strength: 10, quality: 2 });
  private readonly tick = () => {
    this.update();
  };
  private readonly handleWindowResize = () => {
    this.layout();
  };

  private resizeObserver: ResizeObserver | null = null;
  private fallbackResizeHandlerAttached = false;
  private skySprite!: Sprite;
  private moonGlow!: Sprite;
  private moonSprite!: Sprite;
  private citySprite!: Sprite;
  private beamGlow!: Sprite;
  private beamSprite!: Sprite;
  private eyeGlow!: Sprite;
  private eyeSprite!: Sprite;
  private projectorHousing!: Graphics;
  private projectorLamp!: Graphics;
  private creditsText!: Text;
  private exitText!: Text;
  private elapsedSeconds = 0;
  private currentCreditIndex = -1;
  private designScale = 1;
  private cityBaseX = 0;
  private beamBaseRotation = 0;
  private sourceX = 0;
  private sourceY = 0;
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
      this.beamLayer,
      this.textLayer,
    );

    this.createSky();
    this.createStars();
    this.createMoon(moonTexture);
    this.createCity(cityTexture);
    this.createProjector();
    this.createBeam();
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
    canvas.width = 64;
    canvas.height = 256;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context unavailable for sky gradient.');
    }

    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, SKY_TOP);
    gradient.addColorStop(1, SKY_BOTTOM);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const texture = Texture.from(canvas);
    this.generatedTextures.push(texture);
    return texture;
  }

  private createStars(): void {
    for (let index = 0; index < STAR_COUNT; index += 1) {
      const radius = 0.8 + Math.random() * 1.8;
      const star = new Graphics();

      star.circle(0, 0, radius).fill({ color: 0xffffff, alpha: 1 });
      this.starsLayer.addChild(star);
      this.starConfigs.push({
        sprite: star,
        x: Math.random(),
        y: Math.random() * 0.66,
        baseAlpha: 0.18 + Math.random() * 0.5,
        amplitude: 0.12 + Math.random() * 0.28,
        speed: 0.4 + Math.random() * 1.1,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private createMoon(texture: Texture): void {
    this.moonGlow = new Sprite(texture);
    this.moonGlow.anchor.set(0.5);
    this.moonGlow.tint = 0xe6f0ff;
    this.moonGlow.alpha = 0.22;
    this.moonGlow.filters = [this.moonGlowFilter];

    this.moonSprite = new Sprite(texture);
    this.moonSprite.anchor.set(0.5);
    this.moonSprite.alpha = 0.92;

    this.moonLayer.addChild(this.moonGlow, this.moonSprite);
  }

  private createCity(texture: Texture): void {
    this.citySprite = new Sprite(texture);
    this.citySprite.anchor.set(0.5, 1);

    this.cityLayer.addChild(this.citySprite, this.windowsLayer);
    this.windowsLayer.mask = this.citySprite;

    for (let index = 0; index < WINDOW_LIGHT_COUNT; index += 1) {
      const width = 2 + Math.floor(Math.random() * 3);
      const height = 3 + Math.floor(Math.random() * 4);
      const light = new Graphics();

      light.rect(0, 0, width, height).fill({ color: WARM_WINDOW_COLOR, alpha: 1 });
      this.windowsLayer.addChild(light);
      this.windowLightConfigs.push({
        sprite: light,
        x: Math.random(),
        y: 0.12 + Math.random() * 0.72,
        width,
        height,
        baseAlpha: 0.2 + Math.random() * 0.35,
        minAlpha: 0.05 + Math.random() * 0.12,
        maxAlpha: 0.45 + Math.random() * 0.45,
        speed: 0.45 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
        threshold: -0.25 + Math.random() * 0.7,
      });
    }
  }

  private createProjector(): void {
    this.projectorHousing = new Graphics();
    this.projectorHousing.roundRect(-12, -4, 24, 10, 4).fill({ color: 0x0f172a, alpha: 0.96 });
    this.projectorHousing.rect(8, -1, 10, 4).fill({ color: 0x23314d, alpha: 0.9 });

    this.projectorLamp = new Graphics();
    this.projectorLamp.circle(0, 0, 10).fill({ color: 0xc7e5ff, alpha: 0.4 });
    this.projectorLamp.circle(0, 0, 4).fill({ color: 0xf8fafc, alpha: 0.95 });
    this.projectorLamp.filters = [new BlurFilter({ strength: 6, quality: 2 })];

    this.beamLayer.addChild(this.projectorLamp, this.projectorHousing);
  }

  private createBeam(): void {
    const beamTexture = this.createBeamTexture();

    this.beamGlow = new Sprite(beamTexture);
    this.beamGlow.anchor.set(0.5, 1);
    this.beamGlow.alpha = 0.28;
    this.beamGlow.filters = [this.beamGlowFilter];

    this.beamSprite = new Sprite(beamTexture);
    this.beamSprite.anchor.set(0.5, 1);
    this.beamSprite.alpha = 0.48;

    this.beamLayer.addChildAt(this.beamGlow, 0);
    this.beamLayer.addChildAt(this.beamSprite, 1);
  }

  private createBeamTexture(): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 720;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context unavailable for projector beam.');
    }

    const gradient = context.createLinearGradient(0, canvas.height, 0, 0);
    gradient.addColorStop(0, 'rgba(214, 235, 255, 0.55)');
    gradient.addColorStop(0.4, 'rgba(176, 220, 255, 0.26)');
    gradient.addColorStop(1, 'rgba(176, 220, 255, 0.02)');

    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(canvas.width * 0.47, canvas.height);
    context.lineTo(canvas.width * 0.08, canvas.height * 0.08);
    context.lineTo(canvas.width * 0.92, canvas.height * 0.08);
    context.closePath();
    context.fill();

    const texture = Texture.from(canvas);
    this.generatedTextures.push(texture);
    return texture;
  }

  private createEye(texture: Texture): void {
    this.eyeGlow = new Sprite(texture);
    this.eyeGlow.anchor.set(0.5);
    this.eyeGlow.alpha = 0.55;
    this.eyeGlow.tint = 0xd7efff;
    this.eyeGlow.filters = [this.eyeGlowFilter];

    this.eyeSprite = new Sprite(texture);
    this.eyeSprite.anchor.set(0.5);
    this.eyeSprite.alpha = 0.92;

    this.textLayer.addChild(this.eyeGlow, this.eyeSprite);
  }

  private createTexts(): void {
    this.creditsText = new Text({
      text: '',
      style: {
        align: 'center',
        dropShadow: {
          alpha: 0.45,
          blur: 8,
          color: '#dbeafe',
          distance: 0,
        },
        fill: '#ffffff',
        fontFamily: 'Inter, Avenir, Helvetica, Arial, sans-serif',
        fontSize: 22,
        fontWeight: '600',
        lineHeight: 28,
        letterSpacing: 0.5,
      },
    });
    this.creditsText.anchor.set(0.5);

    this.exitText = new Text({
      text: 'Tap to exit',
      style: {
        align: 'center',
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
      starConfig.sprite.scale.set(0.9 + this.designScale * 0.35);
    }

    const moonSize = Math.max(72, Math.min(width, height) * 0.17);
    const moonX = width * 0.23;
    const moonY = height * 0.13;

    this.moonGlow.x = moonX;
    this.moonGlow.y = moonY;
    this.moonGlow.width = moonSize * 1.18;
    this.moonGlow.height = moonSize * 1.18;

    this.moonSprite.x = moonX;
    this.moonSprite.y = moonY;
    this.moonSprite.width = moonSize;
    this.moonSprite.height = moonSize;

    const scaledCityHeight = this.citySprite.texture.height * (width / this.citySprite.texture.width);

    this.citySprite.width = width;
    this.citySprite.height = scaledCityHeight;
    this.cityBaseX = width * 0.5;
    this.citySprite.x = this.cityBaseX;
    this.citySprite.y = height;

    const cityLeft = this.cityBaseX - this.citySprite.width / 2;
    const cityTop = height - this.citySprite.height;

    for (const windowConfig of this.windowLightConfigs) {
      windowConfig.sprite.scale.set(Math.max(0.9, this.designScale));
      windowConfig.sprite.x = cityLeft + windowConfig.x * this.citySprite.width;
      windowConfig.sprite.y = cityTop + windowConfig.y * this.citySprite.height;
    }

    this.sourceX = cityLeft + this.citySprite.width * 0.79;
    this.sourceY = cityTop + this.citySprite.height * 0.28;

    this.projectorHousing.x = this.sourceX;
    this.projectorHousing.y = this.sourceY;
    this.projectorHousing.scale.set(Math.max(0.85, this.designScale));

    this.projectorLamp.x = this.sourceX + 2;
    this.projectorLamp.y = this.sourceY + 1;
    this.projectorLamp.scale.set(Math.max(0.9, this.designScale));

    const beamWidth = Math.max(width * 0.46, 180);
    const beamHeight = Math.max(height * 0.6, 420);
    this.beamBaseRotation = -0.22 + ((width / height) - (BASE_WIDTH / BASE_HEIGHT)) * 0.12;

    this.beamGlow.x = this.sourceX + beamWidth * 0.02;
    this.beamGlow.y = this.sourceY + 6;
    this.beamGlow.width = beamWidth * 1.12;
    this.beamGlow.height = beamHeight;
    this.beamGlow.rotation = this.beamBaseRotation;

    this.beamSprite.x = this.sourceX;
    this.beamSprite.y = this.sourceY + 4;
    this.beamSprite.width = beamWidth;
    this.beamSprite.height = beamHeight;
    this.beamSprite.rotation = this.beamBaseRotation;

    const beamTargetX = this.sourceX - beamWidth * 0.2;
    const eyeWidth = Math.max(74, width * 0.18);
    const eyeHeight = eyeWidth * 0.54;

    this.eyeGlow.x = beamTargetX;
    this.eyeGlow.y = height * 0.26;
    this.eyeGlow.width = eyeWidth * 1.1;
    this.eyeGlow.height = eyeHeight * 1.1;

    this.eyeSprite.x = beamTargetX;
    this.eyeSprite.y = height * 0.26;
    this.eyeSprite.width = eyeWidth;
    this.eyeSprite.height = eyeHeight;

    this.creditsText.x = beamTargetX;
    this.creditsText.y = height * 0.39;
    this.creditsText.style.fontSize = Math.max(20, 22 * this.designScale);
    this.creditsText.style.lineHeight = Math.max(24, 30 * this.designScale);

    this.exitText.x = width * 0.5;
    this.exitText.y = height - Math.max(26, 42 * this.designScale);
    this.exitText.style.fontSize = Math.max(12, 14 * this.designScale);
  }

  private update(): void {
    this.elapsedSeconds += this.app.ticker.deltaMS / 1000;

    const cityDrift = Math.sin(this.elapsedSeconds * 0.08) * (6 * this.designScale);
    this.citySprite.x = this.cityBaseX + cityDrift;
    this.windowsLayer.x = cityDrift;

    const moonPulse = 1 + Math.sin(this.elapsedSeconds * 0.24) * 0.03;
    this.moonGlow.alpha = 0.16 + (Math.sin(this.elapsedSeconds * 0.22) + 1) * 0.05;
    this.moonGlow.scale.set(moonPulse * 1.04);
    this.moonSprite.scale.set(1 + Math.sin(this.elapsedSeconds * 0.2) * 0.018);

    for (const starConfig of this.starConfigs) {
      const shimmer = (Math.sin(this.elapsedSeconds * starConfig.speed + starConfig.phase) + 1) * 0.5;
      starConfig.sprite.alpha = Math.min(1, starConfig.baseAlpha + shimmer * starConfig.amplitude);
    }

    for (const windowConfig of this.windowLightConfigs) {
      const flicker = Math.sin(this.elapsedSeconds * windowConfig.speed + windowConfig.phase);
      const pulse = (Math.sin(this.elapsedSeconds * windowConfig.speed * 0.41 + windowConfig.phase) + 1) * 0.5;
      windowConfig.sprite.alpha = flicker > windowConfig.threshold
        ? windowConfig.baseAlpha + pulse * (windowConfig.maxAlpha - windowConfig.baseAlpha)
        : windowConfig.minAlpha;
    }

    const beamDrift = Math.sin(this.elapsedSeconds * 0.18) * 0.014;
    this.beamSprite.rotation = this.beamBaseRotation + beamDrift;
    this.beamGlow.rotation = this.beamBaseRotation + beamDrift * 1.15;
    this.projectorLamp.alpha = 0.28 + (Math.sin(this.elapsedSeconds * 0.8) + 1) * 0.1;

    const eyePulse = 1 + Math.sin(this.elapsedSeconds * 0.35) * 0.05;
    this.eyeSprite.scale.set(eyePulse);
    this.eyeGlow.scale.set(eyePulse * 1.05);
    this.eyeGlow.alpha = 0.35 + (Math.sin(this.elapsedSeconds * 0.35) + 1) * 0.12;

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

    this.exitText.alpha = 0.55 + (Math.sin(this.elapsedSeconds * 0.85) + 1) * 0.12;
  }
}
