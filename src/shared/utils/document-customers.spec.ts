import { CustomerFields, CustomerSource, customerEnrichedBy, customerFromSource, customerKey, searchCustomers } from './document-customers';

const car = (text: string, plate = '') => ({ text, plate, mileage: '', vin: '' });

const jose: CustomerFields = {
  name: 'José Pérez',
  phone: '809-555-0134',
  email: 'jose.perez@ejemplo.com',
  rnc: '131-12345-6',
  address: 'Calle Duarte 12, Santiago',
  vehicles: [car('Toyota Corolla 2018', 'B999')],
};
const ana: CustomerFields = { name: 'Ana Lora', phone: '829-111-2222', email: '', rnc: '', vehicles: [] };
const all = [jose, ana];

describe('búsqueda de clientes', () => {
  it('"José  PÉREZ" y "jose perez" son el mismo nombre', () => {
    expect(customerKey('  José  PÉREZ ')).toBe(customerKey('jose perez'));
  });

  it('por nombre, sin acentos ni mayúsculas y por cualquier parte', () => {
    expect(searchCustomers(all, 'JOSE')).toEqual([jose]);
    expect(searchCustomers(all, 'perez')).toEqual([jose]);
    expect(searchCustomers(all, 'lor')).toEqual([ana]);
  });

  it('por teléfono, ignorando guiones y espacios', () => {
    expect(searchCustomers(all, '5550134')).toEqual([jose]);
    expect(searchCustomers(all, '809 555')).toEqual([jose]);
    expect(searchCustomers(all, '829-111')).toEqual([ana]);
  });

  it('por RNC o cédula, con o sin guiones', () => {
    expect(searchCustomers(all, '131-12345-6')).toEqual([jose]);
    expect(searchCustomers(all, '12345')).toEqual([jose]);
  });

  it('por correo', () => {
    expect(searchCustomers(all, 'jose.perez@')).toEqual([jose]);
    expect(searchCustomers(all, 'EJEMPLO.COM')).toEqual([jose]);
  });

  it('por placa o modelo del vehículo, y por dirección', () => {
    expect(searchCustomers(all, 'b999')).toEqual([jose]);
    expect(searchCustomers(all, 'corolla')).toEqual([jose]);
    expect(searchCustomers(all, 'santiago')).toEqual([jose]);
  });

  it('una placa con números (k123) no se confunde con un teléfono ni un RNC', () => {
    const kia: CustomerFields = { ...ana, vehicles: [car('Kia Rio', 'K123')] };
    expect(searchCustomers([jose, kia], 'k123')).toEqual([kia]);
  });

  it('varias palabras: tienen que cumplirse todas, aunque vengan de campos distintos', () => {
    expect(searchCustomers(all, 'jose 0134')).toEqual([jose]);
    expect(searchCustomers(all, 'jose 1112')).toEqual([]);
  });

  it('un número con muy pocos dígitos no trae cualquier cosa, y vacío no trae nada', () => {
    expect(searchCustomers(all, '82')).toEqual([]);
    expect(searchCustomers(all, '   ')).toEqual([]);
  });

  it('respeta el límite', () => {
    expect(searchCustomers(all, 'a', 1)).toHaveLength(1);
  });
});

describe('lo que un documento le aporta a su cliente', () => {
  const doc = (over: Partial<CustomerSource> = {}): CustomerSource => ({
    customerName: 'José Pérez',
    customerPhone: '',
    customerEmail: '',
    customerRnc: '',
    vehicle: car(''),
    ...over,
  });

  it('completa lo que faltaba y suma el vehículo nuevo al principio', () => {
    const next = customerEnrichedBy(ana, doc({ customerName: 'Ana Lora', customerEmail: 'ana@x.com', vehicle: car('Kia Rio', 'K1') }))!;
    expect(next.email).toBe('ana@x.com');
    expect(next.vehicles.map((v) => v.plate)).toEqual(['K1']);
  });

  it('nunca pisa un dato que el cliente ya tiene', () => {
    expect(customerEnrichedBy(jose, doc({ customerPhone: '999-999-9999', customerEmail: 'otro@x.com', customerRnc: '1' }))).toBeNull();
  });

  it('el mismo vehículo (por placa, sin importar mayúsculas) no se repite', () => {
    expect(customerEnrichedBy(jose, doc({ vehicle: car('Corolla', 'b999') }))).toBeNull();
  });

  it('sin nada nuevo devuelve null', () => {
    expect(customerEnrichedBy(jose, doc())).toBeNull();
  });

  it('un cliente nuevo sale de lo escrito en el documento', () => {
    const c = customerFromSource(doc({ customerName: '  Marta ', customerPhone: '809 1', vehicle: car('Honda Civic', 'H1') }));
    expect(c).toMatchObject({ name: 'Marta', phone: '809 1' });
    expect(c.vehicles).toHaveLength(1);
    expect(customerFromSource(doc()).vehicles).toEqual([]);
  });
});
