import { BrandedPhotosService } from './branded-photos.service';

describe('BrandedPhotosService', () => {
  it('entrega lo ofrecido una sola vez', () => {
    const service = new BrandedPhotosService();
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    expect(service.take('vehiculos')).toBeNull();
    service.offer({ destination: 'vehiculos', files: [file] });
    expect(service.take('vehiculos')).toEqual({ destination: 'vehiculos', files: [file] });
    expect(service.take('vehiculos')).toBeNull();
  });

  it('no entrega a quien no es el destino y lo deja pendiente', () => {
    const service = new BrandedPhotosService();
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    service.offer({ destination: 'hubmarket', files: [file] });
    expect(service.take('piezas', 'vehiculos', 'noticias')).toBeNull();
    expect(service.take('hubmarket')?.files).toEqual([file]);
  });
});
