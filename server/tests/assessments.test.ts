import { describe, expect, it } from 'vitest';
import { createCampaignSchema, instrumentsFor } from '@sanithelp/shared';

describe('catálogo de evaluaciones', () => {
  it('la batería psicosocial conserva su orden según la forma', () => {
    expect(instrumentsFor(['psychosocial'], 'A')).toEqual(['intra_A', 'extra', 'stress']);
    expect(instrumentsFor(['psychosocial'], 'B')).toEqual(['intra_B', 'extra', 'stress']);
  });
  it('las evaluaciones desconocidas no aportan cuestionarios', () => {
    expect(instrumentsFor(['inexistente'], 'A')).toEqual([]);
    expect(instrumentsFor(['disc'], null)).toEqual(['disc']);
  });
  it('una campaña sin evaluaciones indicadas usa la batería psicosocial', () => {
    const r = createCampaignSchema.parse({ companyId: '00000000-0000-0000-0000-000000000000', name: 'Ronda' });
    expect(r.assessments).toEqual(['psychosocial']);
  });
  it('rechaza evaluaciones desconocidas', () => {
    expect(createCampaignSchema.safeParse({ companyId: '00000000-0000-0000-0000-000000000000', name: 'Ronda', assessments: ['foo'] }).success).toBe(false);
  });
});
