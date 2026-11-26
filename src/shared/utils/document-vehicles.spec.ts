import { DocumentVehicle } from '../models/business-document.model';
import { allVehicles, cleanExtraVehicles, emptyDocumentVehicle, hasVehicleData, moveLineInSlot, vehicleLabel, vehicleSlot } from './document-vehicles';

const car = (text: string, plate = ''): DocumentVehicle => ({ ...emptyDocumentVehicle(), text, plate });

describe('varios vehículos en un documento', () => {
  it('el principal va primero y los demás después, en orden', () => {
    const doc = { vehicle: car('Jetta'), extraVehicles: [car('Civic'), car('Hilux')] };
    expect(allVehicles(doc).map((v) => v.text)).toEqual(['Jetta', 'Civic', 'Hilux']);
    expect(allVehicles({ vehicle: car('Jetta') })).toHaveLength(1);
  });

  it('el nombre lleva la placa, y uno sin nombre se numera', () => {
    expect(vehicleLabel(car('Jetta 2012', 'A123'), 0)).toBe('Jetta 2012 · A123');
    expect(vehicleLabel(car(''), 1)).toBe('Vehículo 2');
  });

  it('los extra en blanco no se guardan', () => {
    expect(cleanExtraVehicles([car('Civic'), emptyDocumentVehicle()])).toHaveLength(1);
    expect(hasVehicleData(emptyDocumentVehicle())).toBe(false);
    expect(cleanExtraVehicles(undefined)).toEqual([]);
  });
});

describe('mover líneas entre las de su mismo vehículo', () => {
  const l = (uid: string, vehicle?: number) => ({ uid, ...(vehicle !== undefined && { vehicle }) });

  it('salta las líneas de otro vehículo y solo cambia de lugar con su vecina', () => {
    const items = [l('a', 0), l('x', 1), l('b', 0), l('y', 1)];
    expect(moveLineInSlot(items, 'b', -1, 2).map((i) => i.uid)).toEqual(['b', 'x', 'a', 'y']);
    expect(moveLineInSlot(items, 'x', 1, 2).map((i) => i.uid)).toEqual(['a', 'y', 'b', 'x']);
  });

  it('en el borde del grupo no se mueve, y una línea sin vehículo es general', () => {
    const items = [l('a', 0), l('g'), l('b', 0)];
    expect(moveLineInSlot(items, 'a', -1, 2).map((i) => i.uid)).toEqual(['a', 'g', 'b']);
    expect(vehicleSlot(l('g'), 2)).toBeNull();
    expect(vehicleSlot(l('z', 5), 2)).toBeNull();
  });
});
