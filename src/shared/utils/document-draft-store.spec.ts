import { clearDocumentDraft, readDocumentDraft, saveDocumentDraft } from './document-draft-store';
import { DocumentDraft } from '../models/business-document.model';

describe('document-draft-store', () => {
  const draft = { kind: 'factura', items: [], customerName: 'Ana', id: null } as unknown as DocumentDraft;

  beforeEach(() => localStorage.clear());

  it('guarda, lee y borra el borrador', () => {
    expect(readDocumentDraft()).toBeNull();

    saveDocumentDraft(draft, ['Frenos']);
    const read = readDocumentDraft();
    expect(read?.draft.customerName).toBe('Ana');
    expect(read?.titles).toEqual(['Frenos']);

    clearDocumentDraft();
    expect(readDocumentDraft()).toBeNull();
  });

  it('ignora lo guardado que no tiene forma de borrador', () => {
    localStorage.setItem('x-autohub.documentDraft', '{"draft":{"foo":1}}');
    expect(readDocumentDraft()).toBeNull();
    localStorage.setItem('x-autohub.documentDraft', 'no es json');
    expect(readDocumentDraft()).toBeNull();
  });
});
