import { isImageFile, isVideoFile, mediaOf, socialMediaProblem } from './social-media';

describe('social-media', () => {
  it('mediaOf usa `media` y, si falta, la imagen de las publicaciones sembradas', () => {
    expect(mediaOf({ media: [{ type: 'video', url: 'v.mp4' }], imageUrl: 'a.jpg' })).toEqual([{ type: 'video', url: 'v.mp4' }]);
    expect(mediaOf({ media: [], imageUrl: 'a.jpg' })).toEqual([{ type: 'image', url: 'a.jpg' }]);
    expect(mediaOf({})).toEqual([]);
  });

  it('distingue fotos de videos', () => {
    expect(isImageFile({ type: 'image/webp' })).toBe(true);
    expect(isVideoFile({ type: 'video/mp4' })).toBe(true);
    expect(isVideoFile({ type: 'video/quicktime' })).toBe(false);
  });

  it('acepta foto o video de hasta 25 MB y rechaza el resto', () => {
    expect(socialMediaProblem({ type: 'video/webm', size: 24 * 1024 * 1024 })).toBeNull();
    expect(socialMediaProblem({ type: 'image/gif', size: 10 })).toMatch(/MP4 o WebM/);
    expect(socialMediaProblem({ type: 'video/mp4', size: 26 * 1024 * 1024 })).toMatch(/25 MB/);
  });
});
