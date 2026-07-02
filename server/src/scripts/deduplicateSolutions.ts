/**
 * Объединяет дубли решений по названию и перепривязывает проблематики.
 * Запуск: npm run dedupe:solutions --workspace=server
 */
import { initDB } from '../db';
import { deduplicateSolutions } from '../solutions';
import { recomputeAllSolutionCodes } from '../solutionNumbering';

initDB();
const result = deduplicateSolutions();
recomputeAllSolutionCodes();
console.log(`✓ Дедупликация: групп ${result.groups}, удалено дублей ${result.deleted}`);
