import { DocumentVehicle } from '../models/business-document.model';
import { allVehicles, cleanExtraVehicles, emptyDocumentVehicle, hasVehicleData, vehicleLabel } from './document-vehicles';

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
