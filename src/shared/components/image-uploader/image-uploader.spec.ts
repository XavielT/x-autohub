import { TestBed } from '@angular/core/testing';
import { ToastService } from '../../services/toast.service';
import { ImageUploader } from './image-uploader';

function foto(name: string, type = 'image/jpeg', size = 10): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('ImageUploader', () => {
  function montar(files: File[] = []) {
    const show = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: { show } }] });
    const fixture = TestBed.createComponent(ImageUploader);
    fixture.componentRef.setInput('files', files);
    fixture.detectChanges();
    return { fixture, uploader: fixture.componentInstance, show };
  }

  it('agrega las fotos válidas y rechaza las demás con un aviso', async () => {
    const { uploader, show } = montar();
    await uploader.add([foto('a.jpg'), foto('b.gif', 'image/gif'), foto('c.jpg', 'image/jpeg', 11 * 1024 * 1024)]);

    expect(uploader.files().map((f) => f.name)).toEqual(['a.jpg']);
    expect(show).toHaveBeenCalledTimes(2);
  });

  it('no pasa del máximo de fotos', async () => {
    const { uploader, show } = montar();
    await uploader.add(Array.from({ length: 10 }, (_, i) => foto(`f${i}.jpg`)));

    expect(uploader.files().length).toBe(8);
    expect(show).toHaveBeenCalledWith(expect.stringContaining('Máximo 8'), 'error');

    await uploader.add([foto('extra.jpg')]);
    expect(uploader.files().length).toBe(8);
  });

  it('reordena con las flechas y quita una foto', () => {
    const a = foto('a.jpg');
    const b = foto('b.jpg');
    const c = foto('c.jpg');
    const { uploader } = montar([a, b, c]);

    uploader.move(0, 1);
    expect(uploader.files()).toEqual([b, a, c]);
    uploader.move(0, -1);
    expect(uploader.files()).toEqual([b, a, c]);

    uploader.remove(1);
    expect(uploader.files()).toEqual([b, c]);
  });

  it('la primera foto lleva la insignia "Portada" y abre el visor al tocarla', () => {
    const { fixture, uploader } = montar([foto('a.jpg'), foto('b.jpg')]);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.up__cover').length).toBe(1);
    uploader.openLightbox(1);
    expect(uploader.lightboxOpen()).toBe(true);
    expect(uploader.lightboxIndex()).toBe(1);
  });
});
