import { getProjectTypeCoefficients, getProjectTypeRates, getProjectTypes } from './api';
import type { HeadcountCoeffs, ProjectType } from './types';

export interface AssessmentNsiCache {
  projectTypes: ProjectType[];
  ratesByTypeId: Map<number, number>;
  coeffsByTypeId: Map<number, Map<string, HeadcountCoeffs>>;
}

export async function loadAssessmentNsi(): Promise<AssessmentNsiCache> {
  const projectTypes = await getProjectTypes();
  const activeTypes = projectTypes.filter(pt => pt.is_active !== 0);

  const ratesByTypeId = new Map<number, number>();
  const coeffsByTypeId = new Map<number, Map<string, HeadcountCoeffs>>();

  await Promise.all(activeTypes.map(async pt => {
    const [rates, coeffs] = await Promise.all([
      getProjectTypeRates(pt.id),
      getProjectTypeCoefficients(pt.id),
    ]);
    ratesByTypeId.set(pt.id, rates[0]?.hourly_rate ?? 5000);

    const byCat = new Map<string, HeadcountCoeffs>();
    for (const c of coeffs) {
      byCat.set(c.category, {
        c62: c.category,
        c63: c.c63,
        c64: c.c64,
        c67: c.c67,
        c68: c.c68,
      });
    }
    coeffsByTypeId.set(pt.id, byCat);
  }));

  return { projectTypes: activeTypes, ratesByTypeId, coeffsByTypeId };
}
