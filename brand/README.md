# Brand assets — originales

Archivos fuente en alta resolución. **No forman parte del build**: nada en esta
carpeta se copia a `dist/`. Sirven como origen para regenerar los assets que sí
se publican.

| Archivo             | Uso                                                             |
| ------------------- | --------------------------------------------------------------- |
| `autohub-logo.png`  | Logo horizontal. Origen de `src/assets/imgs/autohub-logo.png`.   |
| `xh-logo.png`       | Marca cuadrada 1024×1024. Origen de los favicons en `public/`.   |
| `xh2-logo.png`      | Variante alterna de la marca cuadrada.                           |

## Regenerar los favicons

Los iconos en `public/` (`favicon.ico`, `icon-32.png`, `icon-192.png`,
`icon-512.png`, `apple-touch-icon.png`) se generan desde `xh-logo.png`:

```bash
python3 - <<'PY'
from PIL import Image
src = Image.open('brand/xh-logo.png').convert('RGBA')
src.save('public/favicon.ico', sizes=[(16,16),(32,32),(48,48),(64,64)])
for size, name in [(32,'icon-32.png'), (192,'icon-192.png'),
                   (512,'icon-512.png'), (180,'apple-touch-icon.png')]:
    src.resize((size, size), Image.LANCZOS).save(f'public/{name}', 'PNG', optimize=True)
PY
```

## Regenerar los iconos de la PWA (maskable)

`icon-192-maskable.png` e `icon-512-maskable.png` llevan el logo al 80 % central (la zona
segura: el sistema recorta los bordes en círculo o squircle) sobre `#121212`. El fondo
negro del logo se funde con el del icono (`lighter` = máximo por canal, el naranja no se toca):

```bash
python3 - <<'PY'
from PIL import Image, ImageChops
src = Image.open('brand/xh-logo.png').convert('RGB')
bg = (18, 18, 18)  # #121212
for size, name in [(192, 'icon-192-maskable.png'), (512, 'icon-512-maskable.png')]:
    inner = round(size * 0.8)
    logo = src.resize((inner, inner), Image.LANCZOS)
    logo = ImageChops.lighter(logo, Image.new('RGB', logo.size, bg))
    canvas = Image.new('RGB', (size, size), bg)
    canvas.paste(logo, ((size - inner) // 2, (size - inner) // 2))
    canvas.save(f'public/{name}', 'PNG', optimize=True)
PY
```

Los `icon-192.png` / `icon-512.png` normales (propósito `any`) siguen siendo los de arriba.

## Regla para imágenes nuevas

Antes de agregar cualquier imagen a `src/assets/imgs/`:

- Borde largo máximo **1600px**. Nada se muestra más grande que eso en la web.
- Fotografías → **JPEG** calidad ~82. PNG solo si la imagen realmente necesita
  transparencia (logos, iconos con alpha).
- Una foto guardada como PNG pesa ~10× más. Esto ya costó 22 MB una vez.

Ver `docs/CONVENTIONS.md` para el detalle.
