/**
 * Удаляет проблематики без связи с гипотезами.
 * Запуск: npm run prune:unlinked-problems --workspace=server
 */
import { initDB, db } from '../db';
import { pruneProblemsWithoutHypothesis } from '../problems';

initDB();
const before = (db.prepare(`SELECT COUNT(*) as c FROM problems`).get() as { c: number }).c;
const unlinked = (db.prepare(`
  SELECT COUNT(*) as c FROM problems
  WHERE id NOT IN (SELECT DISTINCT problem_id FROM hypothesis_problems)
`).get() as { c: number }).c;

const deleted = pruneProblemsWithoutHypothesis();
const after = (db.prepare(`SELECT COUNT(*) as c FROM problems`).get() as { c: number }).c;

console.log(`✓ Было проблематик: ${before}, без гипотез: ${unlinked}, удалено: ${deleted}, осталось: ${after}`);
