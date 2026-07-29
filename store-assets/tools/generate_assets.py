from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[2]
STORE = ROOT / "store-assets"
MASTER = STORE / "source" / "app-icon-master.png"

SCREENSHOTS = [
    ("01-social-strategy", ROOT / "docs/screenshots/step2_decision_modal.png"),
    ("02-final-three-competition", ROOT / "docs/screenshots/step6_final3_comp1.png"),
    ("03-chain-of-greed", ROOT / "docs/screenshots/chain-of-greed/11-real-active-turn.png"),
    ("04-glass-bridge", ROOT / "docs/screenshots/glass-bridge/gb-03-playing-human-turn.png"),
    ("05-season-recap", ROOT / "screenshots/recap-vibe-curator.png"),
]

STORY_SCENES = [
    {
        "name": "01-house-drama",
        "art": STORE / "source/scenes/01-house-drama.png",
        "ui": ROOT / "docs/screenshots/step1_plea_chat.png",
        "headline": "EVERY ALLIANCE HAS\nA BREAKING POINT",
        "subhead": "Build trust. Read the room. Choose a side.",
    },
    {
        "name": "02-win-power",
        "art": STORE / "source/scenes/02-competition.png",
        "ui": ROOT / "docs/screenshots/glass-bridge/gb-03-playing-human-turn.png",
        "headline": "WIN POWER WHEN\nIT MATTERS",
        "subhead": "Play high-stakes competitions.",
    },
    {
        "name": "03-name-the-nominees",
        "art": STORE / "source/scenes/03-confessional.png",
        "ui": ROOT / "docs/pr-screenshots/04-confessional-decision-screen.png",
        "headline": "DECIDE THEIR FATE\nIN CONFESSIONAL",
        "subhead": "Speak freely. Make the private call.",
    },
    {
        "name": "04-survive-eviction",
        "art": STORE / "source/scenes/04-eviction.png",
        "ui": ROOT / "docs/screenshots/step7_eviction_splash.png",
        "headline": "SURVIVE THE EVICTION",
        "subhead": "One vote can change the season.",
    },
    {
        "name": "05-finale-night",
        "art": STORE / "source/scenes/05-finale.png",
        "ui": ROOT / "docs/pr-screenshots/finale-overlay-mobile-after.png",
        "headline": "MAKE IT TO\nFINALE NIGHT",
        "subhead": "Turn every move into your story.",
    },
]

PRODUCT_SCENES = [
    {
        "name": "01-ai-housemates",
        "label": "AI-DRIVEN SOCIAL STRATEGY",
        "headline": "HOUSEMATES REMEMBER\nEVERY MOVE",
        "subhead": "Relationships evolve. Alliances react. Your history matters.",
        "portraits": ["Mimi_informal.png", "Zed_informal.png", "Lia_informal.png"],
        "ui": ROOT / "docs/pr-screenshots/social-panel-overview.png",
    },
    {
        "name": "02-public-mode",
        "label": "PUBLIC MODE",
        "headline": "LET THE PUBLIC\nCHANGE THE GAME",
        "subhead": "Viewer pressure, requests and saves can reshape the season.",
        "portraits": ["Rae_informal.png", "Noa_informal.png", "Finn_informal.png"],
        "ui": ROOT / "docs/screenshots/public-meter-modernized-overview.png",
    },
    {
        "name": "03-glass-bridge",
        "label": "PLAYABLE MINIGAMES",
        "headline": "READ THE BRIDGE.\nTAKE THE RISK.",
        "subhead": "Compete directly in the season's decisive challenges.",
        "portraits": ["Blue_informal.png", "Sol_informal.png", "Ivy_informal.png"],
        "ui": ROOT / "docs/screenshots/glass-bridge/gb-03-playing-human-turn.png",
    },
    {
        "name": "04-chain-of-greed",
        "label": "PLAYABLE MINIGAMES",
        "headline": "PUSH HIGHER\nOR BANK IT NOW",
        "subhead": "Every competition asks for a different kind of strategy.",
        "portraits": ["Jax_informal.png", "Vee_informal.png", "Kai_informal.png"],
        "ui": ROOT / "docs/screenshots/chain-of-greed/11-real-active-turn.png",
    },
    {
        "name": "05-confessional",
        "label": "PRIVATE DECISIONS",
        "headline": "CONFESS. DECIDE.\nADAPT.",
        "subhead": "Make pivotal calls away from the rest of the cast.",
        "portraits": ["Quinn_informal.png", "Zed_informal.png", "Mimi_informal.png"],
        "ui": ROOT / "docs/pr-screenshots/04-confessional-decision-screen.png",
    },
    {
        "name": "06-season-story",
        "label": "A DIFFERENT STORY EVERY TIME",
        "headline": "TURN EVERY MOVE\nINTO A SEASON",
        "subhead": "Twists, eliminations and recaps remember how you played.",
        "portraits": ["Aria_informal.png", "Jax_informal.png", "Vee_informal.png"],
        "ui": ROOT / "docs/pr-screenshots/finale-overlay-mobile-after.png",
    },
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def gradient(size: tuple[int, int], top=(5, 8, 28), bottom=(42, 17, 92)) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        t = y / max(height - 1, 1)
        color = tuple(round(a * (1 - t) + b * t) for a, b in zip(top, bottom))
        draw.line((0, y, width, y), fill=color)
    return image


def save_rgb(image: Image.Image, path: Path, quality: int = 95) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path, optimize=True, quality=quality)


def framed_portrait(source: Image.Image, size: tuple[int, int], inset: int) -> Image.Image:
    width, height = size
    background = ImageOps.fit(source.convert("RGB"), size, method=Image.Resampling.LANCZOS)
    background = background.filter(ImageFilter.GaussianBlur(radius=max(width, height) // 35))
    veil = Image.new("RGBA", size, (3, 5, 20, 178))
    canvas = Image.alpha_composite(background.convert("RGBA"), veil)

    available = (width - inset * 2, height - inset * 2)
    scale = min(available[0] / source.width, available[1] / source.height)
    shot = source.convert("RGB").resize(
        (round(source.width * scale), round(source.height * scale)),
        Image.Resampling.LANCZOS,
    )
    x = (width - shot.width) // 2
    y = (height - shot.height) // 2
    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        (x - 16, y - 16, x + shot.width + 16, y + shot.height + 16),
        radius=34,
        fill=(0, 0, 0, 150),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.paste(shot, (x, y))
    return canvas.convert("RGB")


def make_icons() -> None:
    source = Image.open(MASTER).convert("RGB")
    apple = ImageOps.fit(source, (1024, 1024), method=Image.Resampling.LANCZOS)
    save_rgb(apple, STORE / "apple/app-store-icon-1024.png")

    google = ImageOps.fit(source, (512, 512), method=Image.Resampling.LANCZOS).convert("RGBA")
    google.putalpha(255)
    target = STORE / "google-play/app-icon-512.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    google.save(target, optimize=True, compress_level=9)


def make_screenshots() -> None:
    for name, source_path in SCREENSHOTS:
        source = Image.open(source_path).convert("RGB")

        iphone = ImageOps.fit(
            source,
            (1320, 2868),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.5),
        )
        save_rgb(iphone, STORE / f"apple/iphone-6.9/{name}.png")

        ipad = framed_portrait(source, (2048, 2732), inset=92)
        save_rgb(ipad, STORE / f"apple/ipad-13/{name}.png")

        play = framed_portrait(source, (1080, 1920), inset=42)
        save_rgb(play, STORE / f"google-play/phone/{name}.png")


def make_feature_graphic() -> None:
    canvas = gradient((1024, 500), top=(5, 8, 29), bottom=(55, 17, 102)).convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    for x, color in [(680, (80, 72, 255, 42)), (810, (255, 179, 40, 34))]:
        draw.ellipse((x - 260, -170, x + 260, 350), fill=color)

    cards = [SCREENSHOTS[2][1], SCREENSHOTS[3][1], SCREENSHOTS[0][1]]
    placements = [(690, 18, -8), (810, 16, 4), (925, 35, 10)]
    for source_path, (cx, cy, angle) in zip(cards, placements):
        shot = Image.open(source_path).convert("RGB")
        shot.thumbnail((190, 440), Image.Resampling.LANCZOS)
        frame = Image.new("RGBA", (shot.width + 16, shot.height + 16), (0, 0, 0, 0))
        ImageDraw.Draw(frame).rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), radius=20, fill=(9, 12, 35, 255), outline=(139, 118, 255, 180), width=3)
        frame.paste(shot, (8, 8))
        frame = frame.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        canvas.alpha_composite(frame, (cx - frame.width // 2, cy))

    icon = ImageOps.fit(Image.open(MASTER).convert("RGB"), (132, 132), method=Image.Resampling.LANCZOS)
    canvas.paste(icon, (58, 66))
    draw = ImageDraw.Draw(canvas)
    draw.text((58, 222), "THE BIG EYE", font=font(58, bold=True), fill=(255, 255, 255))
    draw.text((62, 298), "Scheme. Compete. Survive the vote.", font=font(26), fill=(212, 204, 255))
    draw.rounded_rectangle((58, 362, 494, 424), radius=31, fill=(111, 82, 255, 230), outline=(170, 151, 255, 255), width=2)
    draw.text((96, 377), "YOUR SEASON. YOUR STORY.", font=font(21, bold=True), fill=(255, 255, 255))
    save_rgb(canvas, STORE / "google-play/feature-graphic-1024x500.png")


def rounded_panel(image: Image.Image, size: tuple[int, int], radius: int) -> Image.Image:
    fitted = ImageOps.contain(image.convert("RGB"), size, method=Image.Resampling.LANCZOS)
    panel = Image.new("RGBA", fitted.size, (0, 0, 0, 0))
    mask = Image.new("L", fitted.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, fitted.width - 1, fitted.height - 1), radius=radius, fill=255)
    panel.paste(fitted, (0, 0), mask)
    ImageDraw.Draw(panel).rounded_rectangle((1, 1, fitted.width - 2, fitted.height - 2), radius=radius, outline=(139, 118, 255, 210), width=max(3, radius // 8))
    return panel


def story_screenshot(scene: dict, size: tuple[int, int]) -> Image.Image:
    width, height = size
    canvas = gradient(size, top=(4, 6, 22), bottom=(24, 10, 51)).convert("RGBA")
    art_height = round(height * (0.43 if height / width > 2 else 0.40))
    art = ImageOps.fit(Image.open(scene["art"]).convert("RGB"), (width, art_height), method=Image.Resampling.LANCZOS)
    canvas.paste(art, (0, 0))

    fade_height = round(height * 0.16)
    fade = Image.new("RGBA", (width, fade_height), (0, 0, 0, 0))
    fade_draw = ImageDraw.Draw(fade)
    for y in range(fade_height):
        alpha = round(255 * (y / max(1, fade_height - 1)) ** 1.5)
        fade_draw.line((0, y, width, y), fill=(6, 7, 25, alpha))
    canvas.alpha_composite(fade, (0, art_height - fade_height))

    headline_size = max(44, round(width * 0.060))
    subhead_size = max(24, round(width * 0.025))
    headline_font = font(headline_size, bold=True)
    subhead_font = font(subhead_size)
    text_x = round(width * 0.07)
    text_y = round(art_height * 0.08)
    text_layer = Image.new("RGBA", size, (0, 0, 0, 0))
    td = ImageDraw.Draw(text_layer)
    bbox = td.multiline_textbbox((text_x, text_y), scene["headline"], font=headline_font, spacing=round(headline_size * 0.12))
    pad = round(width * 0.025)
    td.rounded_rectangle((bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad), radius=pad, fill=(5, 7, 25, 178))
    td.multiline_text((text_x, text_y), scene["headline"], font=headline_font, fill=(255, 255, 255), spacing=round(headline_size * 0.12))
    td.text((text_x, bbox[3] + pad * 2), scene["subhead"], font=subhead_font, fill=(224, 217, 255))
    canvas = Image.alpha_composite(canvas, text_layer)

    ui = Image.open(scene["ui"]).convert("RGB")
    panel_top = round(height * 0.39)
    panel_bottom_pad = round(height * 0.025)
    panel_width = round(width * (0.72 if width / height > 0.6 else 0.86))
    panel_height = height - panel_top - panel_bottom_pad
    panel = rounded_panel(ui, (panel_width, panel_height), radius=max(18, width // 45))
    px = (width - panel.width) // 2
    py = panel_top + (panel_height - panel.height) // 2
    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((px - 14, py - 14, px + panel.width + 14, py + panel.height + 14), radius=40, fill=(0, 0, 0, 170))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(12, width // 45)))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.alpha_composite(panel, (px, py))
    return canvas.convert("RGB")


def make_story_media() -> None:
    for scene in STORY_SCENES:
        save_rgb(story_screenshot(scene, (1320, 2868)), STORE / f"apple/iphone-6.9-story/{scene['name']}.png")
        save_rgb(story_screenshot(scene, (2048, 2732)), STORE / f"apple/ipad-13-story/{scene['name']}.png")
        save_rgb(story_screenshot(scene, (1080, 1920)), STORE / f"google-play/phone-story/{scene['name']}.png")

    background = ImageOps.fit(Image.open(STORY_SCENES[0]["art"]).convert("RGB"), (1024, 500), method=Image.Resampling.LANCZOS, centering=(0.52, 0.46)).convert("RGBA")
    overlay = Image.new("RGBA", background.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for x in range(700):
        alpha = round(225 * (1 - x / 700) ** 1.8)
        od.line((x, 0, x, 500), fill=(5, 7, 25, alpha))
    background = Image.alpha_composite(background, overlay)
    draw = ImageDraw.Draw(background)
    draw.text((54, 68), "THE BIG EYE", font=font(28, bold=True), fill=(202, 190, 255))
    draw.multiline_text((54, 126), "PLAY THE DRAMA.\nCONTROL THE VOTE.", font=font(49, bold=True), fill=(255, 255, 255), spacing=5)
    draw.text((58, 276), "Every alliance has a breaking point.", font=font(23), fill=(230, 224, 255))
    draw.rounded_rectangle((54, 342, 414, 410), radius=34, fill=(106, 76, 255, 235), outline=(177, 157, 255, 255), width=2)
    draw.text((92, 361), "YOUR MOVE CHANGES EVERYTHING", font=font(17, bold=True), fill=(255, 255, 255))
    save_rgb(background, STORE / "google-play/feature-graphic-story-1024x500.png")


def product_screenshot(scene: dict, size: tuple[int, int]) -> Image.Image:
    width, height = size
    canvas = gradient(size, top=(5, 8, 29), bottom=(33, 13, 73)).convert("RGBA")
    header_height = round(height * (0.40 if height / width > 2 else 0.42))
    hd = ImageDraw.Draw(canvas)

    # Abstract AI relationship network: deliberately not a physical game house.
    nodes = [
        (0.08, 0.18), (0.19, 0.34), (0.31, 0.15), (0.43, 0.30),
        (0.58, 0.13), (0.70, 0.32), (0.83, 0.17), (0.94, 0.35),
    ]
    pts = [(round(width * x), round(header_height * y)) for x, y in nodes]
    for i, point in enumerate(pts):
        for j in (i + 1, i + 3):
            if j < len(pts):
                hd.line((*point, *pts[j]), fill=(116, 94, 255, 62), width=max(2, width // 500))
        r = max(7, width // 90)
        hd.ellipse((point[0] - r, point[1] - r, point[0] + r, point[1] + r), fill=(159, 140, 255, 155), outline=(255, 190, 71, 170), width=max(2, width // 600))

    portraits = []
    for filename in scene["portraits"]:
        portrait = Image.open(ROOT / "public/assets/Informal_attires" / filename).convert("RGBA")
        portrait.thumbnail((round(width * 0.33), round(header_height * 0.82)), Image.Resampling.LANCZOS)
        portraits.append(portrait)
    centers = [0.68, 0.82, 0.94]
    for portrait, center in zip(portraits, centers):
        x = round(width * center - portrait.width / 2)
        y = header_height - portrait.height + round(header_height * 0.03)
        canvas.alpha_composite(portrait, (x, y))

    shade = Image.new("RGBA", (round(width * 0.68), header_height), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for x in range(shade.width):
        alpha = round(205 * (1 - x / max(1, shade.width - 1)) ** 1.7)
        sd.line((x, 0, x, header_height), fill=(5, 7, 26, alpha))
    canvas.alpha_composite(shade, (0, 0))

    draw = ImageDraw.Draw(canvas)
    text_x = round(width * 0.06)
    draw.text((text_x, round(header_height * 0.10)), scene["label"], font=font(max(20, round(width * 0.024)), bold=True), fill=(191, 178, 255))
    headline_font = font(max(43, round(width * 0.058)), bold=True)
    headline_y = round(header_height * 0.21)
    draw.multiline_text((text_x, headline_y), scene["headline"], font=headline_font, fill=(255, 255, 255), spacing=max(4, width // 200))
    draw.multiline_text((text_x, round(header_height * 0.61)), scene["subhead"], font=font(max(23, round(width * 0.025))), fill=(224, 218, 255), spacing=4)

    ui = Image.open(scene["ui"]).convert("RGB")
    panel_top = round(header_height * 0.82)
    panel_width = round(width * (0.90 if height / width > 2 else 0.76))
    panel_height = height - panel_top - round(height * 0.03)
    panel = rounded_panel(ui, (panel_width, panel_height), radius=max(20, width // 44))
    px = (width - panel.width) // 2
    py = panel_top + (panel_height - panel.height) // 2
    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((px - 16, py - 16, px + panel.width + 16, py + panel.height + 16), radius=42, fill=(0, 0, 0, 180))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(14, width // 44)))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.alpha_composite(panel, (px, py))
    return canvas.convert("RGB")


def make_product_media() -> None:
    for scene in PRODUCT_SCENES:
        save_rgb(product_screenshot(scene, (1320, 2868)), STORE / f"apple/iphone-6.9-product/{scene['name']}.png")
        save_rgb(product_screenshot(scene, (2048, 2732)), STORE / f"apple/ipad-13-product/{scene['name']}.png")
        save_rgb(product_screenshot(scene, (1080, 1920)), STORE / f"google-play/phone-product/{scene['name']}.png")

    feature = gradient((1024, 500), top=(5, 8, 29), bottom=(40, 14, 82)).convert("RGBA")
    fd = ImageDraw.Draw(feature)
    for a, b in [((610, 70), (820, 210)), ((690, 320), (930, 160)), ((530, 390), (790, 250))]:
        fd.line((*a, *b), fill=(126, 104, 255, 95), width=3)
    for x, y in [(610, 70), (820, 210), (690, 320), (930, 160), (530, 390), (790, 250)]:
        fd.ellipse((x - 8, y - 8, x + 8, y + 8), fill=(166, 147, 255), outline=(255, 190, 71), width=2)
    people = ["Mimi_informal.png", "Zed_informal.png", "Lia_informal.png", "Jax_informal.png"]
    for i, filename in enumerate(people):
        person = Image.open(ROOT / "public/assets/Informal_attires" / filename).convert("RGBA")
        person.thumbnail((190, 440), Image.Resampling.LANCZOS)
        feature.alpha_composite(person, (530 + i * 112, 500 - person.height))
    fade = Image.new("RGBA", (720, 500), (0, 0, 0, 0))
    fdd = ImageDraw.Draw(fade)
    for x in range(720):
        fdd.line((x, 0, x, 500), fill=(5, 7, 25, round(225 * (1 - x / 720) ** 1.6)))
    feature.alpha_composite(fade, (0, 0))
    fd = ImageDraw.Draw(feature)
    fd.text((52, 58), "THE BIG EYE", font=font(27, bold=True), fill=(190, 177, 255))
    fd.multiline_text((52, 112), "AI HOUSEMATES.\nPUBLIC PRESSURE.\nYOUR STRATEGY.", font=font(43, bold=True), fill=(255, 255, 255), spacing=2)
    fd.text((55, 322), "Relationships, minigames and a new story every season.", font=font(20), fill=(225, 219, 255))
    save_rgb(feature, STORE / "google-play/feature-graphic-product-1024x500.png")


def main() -> None:
    if not MASTER.exists():
        raise SystemExit(f"Missing icon master: {MASTER}")
    make_icons()
    make_screenshots()
    make_feature_graphic()
    make_product_media()
    print("Generated Apple and Google Play store assets.")


if __name__ == "__main__":
    main()
