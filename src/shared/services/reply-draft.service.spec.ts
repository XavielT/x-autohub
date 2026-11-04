import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ReplyDraftService } from './reply-draft.service';

describe('ReplyDraftService', () => {
  it('en modo simulado la IA no está: devuelve null y la pantalla usa la plantilla', async () => {
    TestBed.configureTestingModule({});

    expect(await firstValueFrom(TestBed.inject(ReplyDraftService).draft('order', 'o1', 2))).toBeNull();
  });
});
