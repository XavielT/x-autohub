import { ProductFulfillment, ProductFitmentType, ProductModel } from "../models/product.model";
import { slugify } from "../utils/slugify";
import { LEGACY_CATEGORY_TO_SLUG, PRODUCT_CATEGORIES_MOCK } from "./product-category.mock";

/**
 * Los campos que tenía una pieza antes del pivote (migración 0017).
 *
 * `category` es el texto de entonces ("frenos", "interior"…): ya no existe en la base
 * (migración 0021) ni en `ProductModel`, pero aquí sigue sirviendo para asignar la
 * categoría del árbol nuevo con `LEGACY_CATEGORY_TO_SLUG`.
 */
interface LegacyPart {
    id: number;
    category: string;
    imgUrl: string;
    images?: string[];
    name: string;
    brand: string;
    starsRating: number;
    price: number;
    description: string;
    isTest?: boolean;
}

/** Lo que el pivote le agrega a cada pieza. Una fila por id, abajo. */
interface ProductExtras {
    /** Unidades en inventario propio. */
    stock: number;
    fulfillment?: ProductFulfillment;
    leadTimeDays?: number;
    fitmentType: ProductFitmentType;
    compareAtPrice?: number;
    featured?: boolean;
    /** Id del servicio que instala la pieza (el catálogo de servicios es de la fase 5). */
    installationServiceId?: number;
    soldCount?: number;
    specs?: Record<string, string>;
}

const LEGACY_PARTS: LegacyPart[] = [
    {
        id: 1,
        category: "frenos",
        imgUrl: "assets/imgs/hub-parts/disco-brembo-gtr.jpg",
        images: ["assets/imgs/hub-parts/disco-brembo-gtr.jpg", "assets/imgs/hub-parts/disco-brembo-gtr-2.jpg", "assets/imgs/hub-parts/disco-brembo-gtr-3.jpg"],
        name: "Disco ventilado GTR 355mm",
        brand: "Brembo",
        starsRating: 4.9,
        price: 12950,
        description: "Disco de alto rendimiento con excelente disipacion de calor para uso diario y track day."
    },
    {
        id: 2,
        category: "filtros",
        imgUrl: "assets/imgs/hub-parts/filtro-kyn-universal.jpg",
        name: "Filtro de aire de alto flujo",
        brand: "K&N",
        starsRating: 4.7,
        price: 2850,
        description: "Filtro reusable que mejora la respiracion del motor y la respuesta de aceleracion."
    },
    {
        id: 3,
        category: "suspension",
        imgUrl: "assets/imgs/hub-parts/coilover-street-pro.jpg",
        name: "Kit Coilover Street Pro",
        brand: "BC Racing",
        starsRating: 4.8,
        price: 32500,
        description: "Suspension ajustable en altura y dureza para mayor control y mejor estabilidad."
    },
    {
        id: 4,
        category: "aceites",
        imgUrl: "assets/imgs/hub-parts/aceite-5w30-sintetico.jpg",
        name: "Aceite sintetico 5W-30 5L",
        brand: "Motul",
        starsRating: 4.6,
        price: 2250,
        description: "Lubricante premium para motores gasolina y turbo con proteccion termica avanzada."
    },
    {
        id: 5,
        category: "luces",
        imgUrl: "assets/imgs/hub-parts/kit-led-h7-coolwhite.jpg",
        name: "Kit LED H7 Cool White",
        brand: "Philips",
        starsRating: 4.5,
        price: 3650,
        description: "Iluminacion blanca de alta intensidad con bajo consumo y larga duracion."
    },
    {
        id: 6,
        category: "escape",
        imgUrl: "assets/imgs/hub-parts/downpipe-3in-stainless.jpg",
        name: "Downpipe 3 pulgadas inox",
        brand: "Borla",
        starsRating: 4.8,
        price: 11800,
        description: "Mejora el flujo de gases para obtener mejor sonido y respuesta del turbo."
    },
    {
        id: 7,
        category: "bateria",
        imgUrl: "assets/imgs/hub-parts/bateria-agm-70ah.jpg",
        name: "Bateria AGM 70Ah",
        brand: "Bosch",
        starsRating: 4.7,
        price: 6900,
        description: "Bateria de alto arranque para vehiculos modernos con sistema start-stop."
    },
    {
        id: 8,
        category: "interior",
        imgUrl: "assets/imgs/hub-parts/alfombras-allweather.jpg",
        name: "Alfombras all-weather",
        brand: "WeatherTech",
        starsRating: 4.4,
        price: 2950,
        description: "Juego de alfombras de goma reforzada para proteger contra agua, lodo y polvo."
    },
    {
        id: 9,
        category: "refrigeracion",
        imgUrl: "assets/imgs/hub-parts/radiador-aluminio-race.jpg",
        name: "Radiador aluminio racing",
        brand: "Mishimoto",
        starsRating: 4.9,
        price: 15400,
        description: "Radiador de mayor capacidad para mantener temperaturas estables en uso exigente."
    },
    {
        id: 10,
        category: "llantas",
        imgUrl: "assets/imgs/hub-parts/rin-forjado-18x8.jpg",
        name: "Rin forjado 18x8.5",
        brand: "Enkei",
        starsRating: 4.6,
        price: 9800,
        description: "Aro ligero y resistente que mejora manejo, frenado y estetica del vehiculo."
    },
    {
        id: 11,
        category: "frenos",
        imgUrl: "assets/imgs/hub-parts/pastillas-ceramicas-sport.jpg",
        name: "Pastillas ceramicas Sport",
        brand: "EBC",
        starsRating: 4.7,
        price: 4100,
        description: "Compuesto ceramico con menor polvo y frenada consistente en ciudad y carretera."
    },
    {
        id: 12,
        category: "frenos",
        imgUrl: "assets/imgs/hub-parts/liquido-frenos-dot4.jpg",
        name: "Liquido de frenos DOT 4",
        brand: "Liqui Moly",
        starsRating: 4.5,
        price: 950,
        description: "Liquido de alto punto de ebullicion para mantener respuesta firme del pedal."
    },
    {
        id: 13,
        category: "suspension",
        imgUrl: "assets/imgs/hub-parts/barra-estabilizadora-adjust.jpg",
        name: "Barra estabilizadora ajustable",
        brand: "Whiteline",
        starsRating: 4.6,
        price: 7400,
        description: "Reduce balanceo de carroceria y mejora la precision en curvas."
    },
    {
        id: 14,
        category: "suspension",
        imgUrl: "assets/imgs/hub-parts/amortiguador-gas-premium.jpg",
        name: "Amortiguador a gas Premium",
        brand: "KYB",
        starsRating: 4.4,
        price: 5200,
        description: "Confort y control mejorados para uso diario con mejor absorcion de impactos."
    },
    {
        id: 15,
        category: "motor",
        imgUrl: "assets/imgs/hub-parts/bobina-encendido-coil.jpg",
        name: "Bobina de encendido performance",
        brand: "NGK",
        starsRating: 4.7,
        price: 2150,
        description: "Entrega chispa estable para mejorar arranque y eficiencia de combustion."
    },
    {
        id: 16,
        category: "motor",
        imgUrl: "assets/imgs/hub-parts/bujias-iridio-set4.jpg",
        name: "Set bujias iridio x4",
        brand: "Denso",
        starsRating: 4.8,
        price: 1850,
        description: "Mayor durabilidad y respuesta del motor con electrodo de iridio."
    },
    {
        id: 17,
        category: "motor",
        imgUrl: "assets/imgs/hub-parts/intake-cold-air-carbon.jpg",
        name: "Intake cold air carbono",
        brand: "Corsa",
        starsRating: 4.6,
        price: 11200,
        description: "Sistema de admision de aire frio para mejorar flujo y sonido de admision."
    },
    {
        id: 18,
        category: "escape",
        imgUrl: "assets/imgs/hub-parts/catback-street-series.jpg",
        name: "Catback Street Series",
        brand: "MagnaFlow",
        starsRating: 4.8,
        price: 22400,
        description: "Escape completo con tono deportivo y flujo optimizado."
    },
    {
        id: 19,
        category: "transmision",
        imgUrl: "assets/imgs/hub-parts/clutch-stage2-kit.jpg",
        name: "Kit clutch Stage 2",
        brand: "Exedy",
        starsRating: 4.7,
        price: 16700,
        description: "Mayor capacidad de torque para proyectos turbo y manejo exigente."
    },
    {
        id: 20,
        category: "transmision",
        imgUrl: "assets/imgs/hub-parts/aceite-transmision-75w90.jpg",
        name: "Aceite transmision 75W-90",
        brand: "Red Line",
        starsRating: 4.5,
        price: 1450,
        description: "Proteccion de engranajes y cambios mas suaves en caja manual."
    },
    {
        id: 21,
        category: "refrigeracion",
        imgUrl: "assets/imgs/hub-parts/intercooler-front-mount.jpg",
        name: "Intercooler front mount",
        brand: "Garrett",
        starsRating: 4.9,
        price: 19800,
        description: "Reduce temperatura del aire de admision para mantener potencia estable."
    },
    {
        id: 22,
        category: "refrigeracion",
        imgUrl: "assets/imgs/hub-parts/termostato-racing.jpg",
        name: "Termostato racing 68C",
        brand: "Mishimoto",
        starsRating: 4.4,
        price: 1350,
        description: "Apertura temprana para controlar mejor la temperatura del motor."
    },
    {
        id: 23,
        category: "electrico",
        imgUrl: "assets/imgs/hub-parts/alternador-high-output.jpg",
        name: "Alternador high output",
        brand: "Powermaster",
        starsRating: 4.3,
        price: 13200,
        description: "Mayor salida de corriente para sistemas de audio y accesorios adicionales."
    },
    {
        id: 24,
        category: "electrico",
        imgUrl: "assets/imgs/hub-parts/cable-kit-0awg.jpg",
        name: "Kit cableado 0 AWG",
        brand: "Stinger",
        starsRating: 4.6,
        price: 2950,
        description: "Kit completo de instalacion para amplificador con conductores de baja perdida."
    },
    {
        id: 25,
        category: "luces",
        imgUrl: "assets/imgs/hub-parts/faro-proyector-bi-led.jpg",
        name: "Faro proyector Bi-LED",
        brand: "Morimoto",
        starsRating: 4.8,
        price: 18600,
        description: "Haz mas uniforme y potente para mejor visibilidad nocturna."
    },
    {
        id: 26,
        category: "luces",
        imgUrl: "assets/imgs/hub-parts/barra-led-offroad-20.jpg",
        name: "Barra LED offroad 20in",
        brand: "Rigid",
        starsRating: 4.7,
        price: 6400,
        description: "Iluminacion auxiliar de largo alcance ideal para rutas y caminos oscuros."
    },
    {
        id: 27,
        category: "audio",
        imgUrl: "assets/imgs/hub-parts/subwoofer-12-1000w.jpg",
        name: "Subwoofer 12in 1000W",
        brand: "JL Audio",
        starsRating: 4.9,
        price: 9600,
        description: "Bajos profundos con gran control para sistemas SQ o SPL."
    },
    {
        id: 28,
        category: "audio",
        imgUrl: "assets/imgs/hub-parts/amplificador-monoblock.jpg",
        name: "Amplificador monoblock Clase D",
        brand: "Pioneer",
        starsRating: 4.5,
        price: 7800,
        description: "Amplificador eficiente de alta potencia para subwoofers."
    },
    {
        id: 29,
        category: "detailing",
        imgUrl: "assets/imgs/hub-parts/shampoo-ph-neutro.jpg",
        name: "Shampoo pH neutro 1L",
        brand: "Meguiar's",
        starsRating: 4.4,
        price: 780,
        description: "Limpieza segura para pintura con acabado brillante sin remover cera."
    },
    {
        id: 30,
        category: "detailing",
        imgUrl: "assets/imgs/hub-parts/cera-hibrida-spray.jpg",
        name: "Cera hibrida en spray",
        brand: "Turtle Wax",
        starsRating: 4.3,
        price: 1150,
        description: "Proteccion hidrofobica rapida con brillo intenso para uso frecuente."
    },
    {
        id: 31,
        category: "interior",
        imgUrl: "assets/imgs/hub-parts/volante-gamuza-racing.jpg",
        name: "Volante racing en gamuza",
        brand: "MOMO",
        starsRating: 4.8,
        price: 8900,
        description: "Agarre superior y look deportivo para cabina estilo track."
    },
    {
        id: 32,
        category: "exterior",
        imgUrl: "assets/imgs/hub-parts/lip-frontal-universal.jpg",
        name: "Lip frontal universal",
        brand: "Maxton",
        starsRating: 4.2,
        price: 3250,
        description: "Mejora estetica frontal con instalacion sencilla y acabado resistente."
    },
    {
        id: 33,
        category: "exterior",
        imgUrl: "assets/imgs/hub-parts/spoiler-gt-ajustable.jpg",
        name: "Spoiler GT ajustable",
        brand: "APR",
        starsRating: 4.6,
        price: 21400,
        description: "Aleron con soportes regulables para look agresivo y carga aerodinamica."
    },
    {
        id: 34,
        category: "herramientas",
        imgUrl: "assets/imgs/hub-parts/torque-wrench-20-200.jpg",
        name: "Llave torque 20-200 Nm",
        brand: "Tekton",
        starsRating: 4.7,
        price: 3650,
        description: "Ajuste preciso de torque para trabajos de mantenimiento y montaje."
    },
    {
        id: 35,
        category: "herramientas",
        imgUrl: "assets/imgs/hub-parts/scanner-obd2-bluetooth.jpg",
        name: "Scanner OBD2 Bluetooth",
        brand: "Autel",
        starsRating: 4.5,
        price: 2450,
        description: "Lectura y borrado de codigos de falla desde el celular."
    },
    // Artículo de prueba (fase 6). Solo lo ven admin, moderador y usuarios de
    // prueba; para el resto no existe, ni en el catálogo ni por URL directa.
    // Sirve para probar el carrito y el checkout contra el sitio real sin que
    // ningún cliente se tropiece con él. Ver shared/utils/test-visibility.ts.
    {
        id: 36,
        category: "herramientas",
        imgUrl: "assets/imgs/hub-parts/scanner-obd2-bluetooth.jpg",
        name: "PRUEBA - Pieza de prueba",
        brand: "X AutoHub",
        starsRating: 5,
        price: 100,
        description: "Articulo de prueba del equipo. No esta a la venta.",
        isTest: true
    }
];


/*
 * Mezcla a propósito: de inventario y bajo pedido, universales y específicos,
 * con y sin oferta, instalables y no. Un solo producto "agotado" (id 12) y dos
 * específicos sin compatibilidad cargada (1 y 13) para que la ficha muestre
 * "Consultar compatibilidad". La compatibilidad de los demás está en
 * product-fitment.mock.ts.
 */
const EXTRAS: Readonly<Record<number, ProductExtras>> = {
    1:  { stock: 4,  fitmentType: "specific", featured: true, installationServiceId: 4, soldCount: 18, specs: { Diametro: "355 mm", Tipo: "Ventilado" } },
    2:  { stock: 12, fitmentType: "specific", compareAtPrice: 3400, soldCount: 64, specs: { Material: "Algodon con aceite", Reusable: "Si" } },
    3:  { stock: 0,  fitmentType: "specific", fulfillment: "on_order", leadTimeDays: 15, featured: true, installationServiceId: 5, soldCount: 9, specs: { Ajuste: "Altura y dureza" } },
    4:  { stock: 40, fitmentType: "universal", installationServiceId: 2, soldCount: 210, specs: { Viscosidad: "5W-30", Contenido: "5 L" } },
    5:  { stock: 25, fitmentType: "specific", installationServiceId: 7, soldCount: 87, specs: { Base: "H7", Temperatura: "6000 K" } },
    6:  { stock: 0,  fitmentType: "specific", fulfillment: "on_order", leadTimeDays: 20, soldCount: 5, specs: { Diametro: "3 pulgadas", Material: "Acero inoxidable" } },
    7:  { stock: 9,  fitmentType: "universal", installationServiceId: 6, soldCount: 52, specs: { Capacidad: "70 Ah", Tecnologia: "AGM" } },
    8:  { stock: 16, fitmentType: "specific", soldCount: 41, specs: { Material: "Termoplastico", Piezas: "4" } },
    9:  { stock: 0,  fitmentType: "specific", fulfillment: "on_order", leadTimeDays: 12, soldCount: 7, specs: { Material: "Aluminio", Filas: "2" } },
    10: { stock: 0,  fitmentType: "universal", fulfillment: "on_order", leadTimeDays: 21, compareAtPrice: 11500, featured: true, soldCount: 12, specs: { Medida: "18x8.5", Material: "Forjado" } },
    11: { stock: 22, fitmentType: "specific", installationServiceId: 4, soldCount: 73, specs: { Compuesto: "Ceramico" } },
    12: { stock: 0,  fitmentType: "universal", soldCount: 95, specs: { Tipo: "DOT 4", Contenido: "500 ml" } },
    13: { stock: 6,  fitmentType: "specific", soldCount: 4, specs: { Ajuste: "Ajustable" } },
    14: { stock: 14, fitmentType: "specific", installationServiceId: 5, soldCount: 38, specs: { Tipo: "A gas" } },
    15: { stock: 30, fitmentType: "specific", soldCount: 47, specs: { Cantidad: "1 unidad" } },
    16: { stock: 35, fitmentType: "specific", installationServiceId: 3, soldCount: 118, specs: { Electrodo: "Iridio", Cantidad: "4 unidades" } },
    17: { stock: 0,  fitmentType: "specific", fulfillment: "on_order", leadTimeDays: 10, soldCount: 6, specs: { Material: "Fibra de carbono" } },
    18: { stock: 0,  fitmentType: "specific", fulfillment: "on_order", leadTimeDays: 18, compareAtPrice: 25900, soldCount: 3, specs: { Material: "Acero inoxidable" } },
    19: { stock: 0,  fitmentType: "specific", fulfillment: "on_order", leadTimeDays: 14, soldCount: 2, specs: { Etapa: "Stage 2" } },
    20: { stock: 28, fitmentType: "universal", soldCount: 33, specs: { Viscosidad: "75W-90", Contenido: "1 L" } },
    21: { stock: 0,  fitmentType: "specific", fulfillment: "on_order", leadTimeDays: 16, soldCount: 1 },
    22: { stock: 18, fitmentType: "specific", soldCount: 21, specs: { Apertura: "68 C" } },
    23: { stock: 0,  fitmentType: "specific", fulfillment: "on_order", leadTimeDays: 10, installationServiceId: 6, soldCount: 8, specs: { Amperaje: "Alta salida" } },
    24: { stock: 20, fitmentType: "universal", soldCount: 29, specs: { Calibre: "0 AWG" } },
    25: { stock: 0,  fitmentType: "specific", fulfillment: "on_order", leadTimeDays: 20, featured: true, installationServiceId: 1, soldCount: 4, specs: { Tecnologia: "Bi-LED" } },
    26: { stock: 11, fitmentType: "universal", compareAtPrice: 7200, installationServiceId: 1, soldCount: 36, specs: { Largo: "20 pulgadas" } },
    27: { stock: 7,  fitmentType: "universal", featured: true, installationServiceId: 1, soldCount: 24, specs: { Diametro: "12 pulgadas", Potencia: "1000 W" } },
    28: { stock: 10, fitmentType: "universal", compareAtPrice: 8900, installationServiceId: 1, soldCount: 19, specs: { Clase: "D", Canales: "1" } },
    29: { stock: 60, fitmentType: "universal", soldCount: 140, specs: { pH: "Neutro", Contenido: "1 L" } },
    30: { stock: 45, fitmentType: "universal", soldCount: 102, specs: { Tipo: "Spray" } },
    31: { stock: 0,  fitmentType: "specific", fulfillment: "on_order", leadTimeDays: 12, soldCount: 5, specs: { Material: "Gamuza" } },
    32: { stock: 13, fitmentType: "universal", installationServiceId: 1, soldCount: 17, specs: { Material: "ABS" } },
    33: { stock: 0,  fitmentType: "specific", fulfillment: "on_order", leadTimeDays: 15, soldCount: 3, specs: { Ajuste: "Angulo regulable" } },
    34: { stock: 17, fitmentType: "universal", soldCount: 26, specs: { Rango: "20-200 Nm" } },
    35: { stock: 23, fitmentType: "universal", compareAtPrice: 2900, featured: true, soldCount: 88, specs: { Conexion: "Bluetooth" } },
    36: { stock: 25, fitmentType: "universal" },
};

const FIRST_PART_DATE = new Date("2026-08-01T12:00:00Z");

/**
 * Las piezas de la tienda, ya como `ProductModel`.
 *
 * El slug y el SKU salen igual que los generaría el trigger de la migración
 * 0017 (`nombre-<id>` y `XAH-000123`), así que el mock y la base real dan las
 * mismas URLs.
 */
export const HUB_PART_MOCK: ProductModel[] = LEGACY_PARTS.map((part) => {
    const extra = EXTRAS[part.id];
    if (!extra) throw new Error(`Falta la fila de EXTRAS para la pieza ${part.id}`);

    const categorySlug = LEGACY_CATEGORY_TO_SLUG[part.category];
    const category = PRODUCT_CATEGORIES_MOCK.find((c) => c.slug === categorySlug);
    if (!category) throw new Error(`La categoria ${part.category} no tiene mapeo`);

    const fulfillment = extra.fulfillment ?? "stock";
    return {
        id: part.id,
        categoryId: category.id,
        slug: `${slugify(part.name) || "producto"}-${part.id}`,
        sku: `XAH-${String(part.id).padStart(6, "0")}`,
        name: part.name,
        brand: part.brand,
        // Las descripciones son de una sola frase: la corta es la primera.
        shortDescription: part.description.split(".")[0],
        imgUrl: part.imgUrl,
        images: part.images,
        starsRating: part.starsRating,
        price: part.price,
        compareAtPrice: extra.compareAtPrice ?? null,
        description: part.description,
        stock: extra.stock,
        isFeatured: extra.featured ?? false,
        fulfillment,
        leadTimeDays: fulfillment === "on_order" ? extra.leadTimeDays ?? null : null,
        fitmentType: extra.fitmentType,
        installable: extra.installationServiceId !== undefined,
        installationServiceId: extra.installationServiceId ?? null,
        specs: extra.specs ?? {},
        soldCount: extra.soldCount ?? 0,
        isTest: part.isTest ?? false,
        isActive: true,
        createdAt: FIRST_PART_DATE,
        updatedAt: FIRST_PART_DATE,
    };
});
