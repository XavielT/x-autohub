import { ServiciosCardModel } from "../models/servicios-card.model";

export const SERVICIOS_CARD_MOCK : ServiciosCardModel[] = [
    {
        id: 1,
        icon: 'assets/icons/maintenance-hub-icon.svg',
        title: 'Mantenimiento',
        description: 'Preventivo y correctivo para tu vehiculo.',
    },
    {
        id: 2,
        icon: 'assets/icons/repair-hub-icon.svg',
        title: 'Reparacion',
        description: 'Especialistas en mecanica avanzada y Performance.',
    },
    {
        id: 3,
        icon: 'assets/icons/medical-scanner-hub-icon.svg',
        title: 'Chequeo y Diagnostico',
        description: 'Analisis computarizado y revision de toda la electronica de su vehiculo.',
    },
    {
        id: 4,
        icon: 'assets/icons/search-check-hub-icon.svg',
        title: 'Busqueda y Revision',
        description: 'Te ayudamos a encontrar y verificar tu proximo vehiculo.',
    },
]