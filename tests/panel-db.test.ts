import { describe, it, expect } from 'bun:test';
import { loadPanelDatabase, getPanelById, searchPanels, PanelSchema } from '../src/panel-db.js';

describe('Panel Database', () => {
  it('should load valid panel database', () => {
    const panels = loadPanelDatabase();
    expect(panels.length).toBeGreaterThan(2);
    panels.forEach(panel => {
      expect(PanelSchema.parse(panel)).toBeTruthy();
    });
  });

  it('should find panel by ID', () => {
    const panel = getPanelById('SPR-X22-360');
    expect(panel).toBeDefined();
    expect(panel?.manufacturer).toBe('SunPower');
    expect(panel?.ratedPower).toBe(360);
  });

  it('should return undefined for invalid ID', () => {
    expect(getPanelById('INVALID')).toBeUndefined();
  });

  it('should search panels by query', () => {
    const results = searchPanels('canadian');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].manufacturer).toBe('Canadian Solar');
  });

  it('should validate panel schema', () => {
    const badPanel = {
      id: 'BAD',
      manufacturer: 'X',
      model: 'Y',
      year: 1999,
      ratedPower: -100,
      efficiency: 0.5,
      voc: 0,
    };
    
    expect(() => PanelSchema.parse(badPanel)).toThrow();
  });
});
