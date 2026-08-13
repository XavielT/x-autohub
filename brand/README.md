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

## Regla para imágenes nuevas

Antes de agregar cualquier imagen a `src/assets/imgs/`:

- Borde largo máximo **1600px**. Nada se muestra más grande que eso en la web.
- Fotografías → **JPEG** calidad ~82. PNG solo si la imagen realmente necesita
  transparencia (logos, iconos con alpha).
- Una foto guardada como PNG pesa ~10× más. Esto ya costó 22 MB una vez.

Ver `docs/CONVENTIONS.md` para el detalle.
