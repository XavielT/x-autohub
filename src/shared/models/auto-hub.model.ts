export interface AutoHubModel{
    id: number;
    brand: string;
    model: string;
    year: number;
    price: number;
    color: string;
    mileage: number;
    chasisType: 'sedan' | 'suv' | 'hatchback' | 'pickup' ;
    doors: number;
    traction: 'fwd' | 'rwd' | 'awd' | '4x4';
    fuel: 'gasoline' | 'diesel' | 'glp' | 'electric';
    cylinders: number;
    images: string[];
    description: string;
    location: string;
    contact: number;
}