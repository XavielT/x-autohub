import { BrandedPhotosService } from './branded-photos.service';

describe('BrandedPhotosService', () => {
  it('entrega lo ofrecido una sola vez', () => {
    const service = new BrandedPhotosService();
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    expect(service.take()).toBeNull();
    service.offer({ destination: 'vehiculos', files: [file] });
    expect(service.take()).toEqual({ destination: 'vehiculos', files: [file] });
    expect(service.take()).toBeNull();
  });
});
