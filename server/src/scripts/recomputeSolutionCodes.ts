/**
 * Пересчёт сквозной и гипотезной нумерации решений.
 * Запуск: npm run recompute:solution-codes --workspace=server
 */
import { initDB } from '../db';
import { recomputeAllSolutionCodes, recomputeCatalogCodes, recomputeHypothesisSolutionCodes } from '../solutionNumbering';

initDB();
const catalog = recomputeCatalogCodes();
const hypothesis = recomputeHypothesisSolutionCodes();
console.log(`✓ Сквозные коды: ${catalog}, коды в гипотезах: ${hypothesis}`);
