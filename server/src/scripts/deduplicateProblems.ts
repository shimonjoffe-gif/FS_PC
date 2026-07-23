/**
 * Объединяет проблематики с полностью совпадающим name.
 * Канон: больше связей (решения + брифинги), при равенстве — меньший id.
 * Запуск: npm run dedupe:problems --workspace=server
 */
import { initDB } from '../db';
import { deduplicateProblems } from '../problems';

initDB();
const result = deduplicateProblems();
console.log(`✓ Дедупликация проблематик: групп ${result.groups}, удалено дублей ${result.deleted}`);
