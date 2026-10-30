"""Generate the extension's PNG icons (a rounded square with a check mark)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

for size in (16, 32, 48, 128):
    scale = 8
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=s // 5, fill=(29, 48, 71, 255))  # Deep Navy #1D3047
    w = max(scale * 2, s // 9)
    d.line([(s * 0.26, s * 0.52), (s * 0.43, s * 0.69), (s * 0.75, s * 0.32)],
           fill=(166, 185, 166, 255), width=w, joint="curve")
    img.resize((size, size), Image.LANCZOS).save(OUT / f"icon{size}.png")
    print("wrote", OUT / f"icon{size}.png")
