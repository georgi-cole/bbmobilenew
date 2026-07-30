"""Generate native launcher and splash assets from the approved store icon."""

from pathlib import Path
import os
import time

from PIL import Image, ImageDraw, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "store-assets/source/app-icon-master.png"
IOS_ASSETS = ROOT / "ios/App/App/Assets.xcassets"
ANDROID_RES = ROOT / "android/app/src/main/res"
BACKGROUND = (4, 6, 22)


def save_png(image: Image.Image, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.tmp")
    image.save(temporary, format="PNG", optimize=True, compress_level=9)
    for attempt in range(5):
        try:
            os.replace(temporary, target)
            return
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.1)


def generate_ios(source: Image.Image) -> None:
    app_icon = ImageOps.fit(source.convert("RGB"), (1024, 1024), Image.Resampling.LANCZOS)
    save_png(app_icon, IOS_ASSETS / "AppIcon.appiconset/AppIcon-512@2x.png")

    splash = Image.new("RGB", (2732, 2732), BACKGROUND)
    mark = ImageOps.fit(source.convert("RGBA"), (720, 720), Image.Resampling.LANCZOS)
    mask = Image.new("L", mark.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((8, 8, 711, 711), radius=100, fill=255)
    mark.putalpha(mask.filter(ImageFilter.GaussianBlur(18)))
    splash.paste(
        mark,
        ((splash.width - mark.width) // 2, (splash.height - mark.height) // 2),
        mark,
    )
    for name in (
        "splash-2732x2732.png",
        "splash-2732x2732-1.png",
        "splash-2732x2732-2.png",
    ):
        save_png(splash, IOS_ASSETS / f"Splash.imageset/{name}")


def round_icon(source: Image.Image, size: int) -> Image.Image:
    icon = ImageOps.fit(source.convert("RGBA"), (size, size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    icon.putalpha(mask)
    return icon


def adaptive_foreground(source: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mark_size = round(size * 0.72)
    mark = ImageOps.fit(source.convert("RGBA"), (mark_size, mark_size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, ((size - mark_size) // 2, (size - mark_size) // 2))
    return canvas


def generate_android_icons(source: Image.Image) -> None:
    sizes = {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }
    foreground_sizes = {
        "mdpi": 108,
        "hdpi": 162,
        "xhdpi": 216,
        "xxhdpi": 324,
        "xxxhdpi": 432,
    }
    for density, size in sizes.items():
        directory = ANDROID_RES / f"mipmap-{density}"
        save_png(
            ImageOps.fit(source.convert("RGBA"), (size, size), Image.Resampling.LANCZOS),
            directory / "ic_launcher.png",
        )
        save_png(round_icon(source, size), directory / "ic_launcher_round.png")
        save_png(
            adaptive_foreground(source, foreground_sizes[density]),
            directory / "ic_launcher_foreground.png",
        )


def generate_android_splashes(source: Image.Image) -> None:
    splash_paths = [
        path
        for path in ANDROID_RES.glob("drawable*/splash.png")
        if path.is_file()
    ]
    for target in splash_paths:
        with Image.open(target) as existing:
            size = existing.size
        splash = Image.new("RGB", size, BACKGROUND)
        mark_size = max(1, round(min(size) * 0.28))
        mark = ImageOps.fit(
            source.convert("RGBA"),
            (mark_size, mark_size),
            Image.Resampling.LANCZOS,
        )
        mask = Image.new("L", mark.size, 0)
        radius = max(1, round(mark_size * 0.14))
        ImageDraw.Draw(mask).rounded_rectangle(
            (1, 1, mark_size - 2, mark_size - 2),
            radius=radius,
            fill=255,
        )
        mark.putalpha(mask.filter(ImageFilter.GaussianBlur(max(1, round(mark_size * 0.025)))))
        splash.paste(
            mark,
            ((size[0] - mark_size) // 2, (size[1] - mark_size) // 2),
            mark,
        )
        save_png(splash, target)


def main() -> None:
    with Image.open(MASTER) as source:
        source.load()
        generate_ios(source)
        generate_android_icons(source)
        generate_android_splashes(source)


if __name__ == "__main__":
    main()
