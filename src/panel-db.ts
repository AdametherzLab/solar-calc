import { z } from 'zod';
import type { PanelConfig } from './types.js';

export const PanelSchema = z.object({
  id: z.string().min(3),
  manufacturer: z.string().min(2),
  model: z.string().min(2),
  year: z.number().int().min(2000).max(new Date().getFullYear() + 1),
  ratedPower: z.number().positive(),
  efficiency: z.number().min(0.1).max(0.3),
  temperatureCoefficient: z.number().max(-0.2).default(-0.4),
  panelArea: z.number().positive(),
  voc: z.number().positive(),
  vmp: z.number().positive(),
  isc: z.number().positive(),
  imp: z.number().positive(),
  length: z.number().positive().optional(),
  width: z.number().positive().optional(),
  weight: z.number().positive().optional(),
});

export type SolarPanel = PanelConfig & {
  id: string;
  manufacturer: string;
  model: string;
  year: number;
  efficiency: number;
  voc: number;
  vmp: number;
  isc: number;
  imp: number;
};

const panelDatabase: SolarPanel[] = [
  {
    id: 'SPR-X22-360',
    manufacturer: 'SunPower',
    model: 'X22-360',
    year: 2023,
    ratedPower: 360,
    efficiency: 0.224,
    temperatureCoefficient: -0.29,
    panelArea: 1.61,
    voc: 68.7,
    vmp: 54.7,
    isc: 7.03,
    imp: 6.58,
    length: 1550,
    width: 1046,
    weight: 19.5,
  },
  {
    id: 'LG-400N2T-A5',
    manufacturer: 'LG',
    model: 'NeON 2 400W',
    year: 2022,
    ratedPower: 400,
    efficiency: 0.218,
    temperatureCoefficient: -0.3,
    panelArea: 1.84,
    voc: 41.3,
    vmp: 34.8,
    isc: 12.1,
    imp: 11.5,
  },
  {
    id: 'CANADIAN-CS6R-390',
    manufacturer: 'Canadian Solar',
    model: 'CS6R-390MS',
    year: 2024,
    ratedPower: 390,
    efficiency: 0.201,
    temperatureCoefficient: -0.35,
    panelArea: 1.94,
    voc: 41.5,
    vmp: 34.9,
    isc: 11.8,
    imp: 11.2,
  },
];

export function loadPanelDatabase() {
  return PanelSchema.array().parse(panelDatabase);
}

export function getPanelById(id: string) {
  return loadPanelDatabase().find(p => p.id === id);
}

export function searchPanels(query: string) {
  const searchTerm = query.toLowerCase();
  return loadPanelDatabase().filter(p =>
    p.id.toLowerCase().includes(searchTerm) ||
    p.manufacturer.toLowerCase().includes(searchTerm) ||
    p.model.toLowerCase().includes(searchTerm)
  );
}
