/**
 * Пересчёт сквозной и гипотезной нумерации проблематик.
 * Запуск: npm run recompute:problem-codes --workspace=server
 */
import { initDB } from '../db';
import { recomputeProblemCatalogCodes, recomputeHypothesisProblemCodes } from '../problemNumbering';

initDB();
const catalog = recomputeProblemCatalogCodes();
const hypothesis = recomputeHypothesisProblemCodes();
console.log(`✓ Сквозные коды проблематик: ${catalog}, коды в гипотезах: ${hypothesis}`);
