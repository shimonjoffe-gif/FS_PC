/**
 * Очистка справочника решений и всех связей проблема→решение.
 * Гипотезы и их проблематики (hypothesis_problems) не затрагиваются.
 */
import { initDB, db } from '../db';

function clearSolutionsCatalog() {
  const beforeSolutions = (db.prepare(`SELECT COUNT(*) as c FROM solutions`).get() as { c: number }).c;
  const beforeLinks = (db.prepare(`SELECT COUNT(*) as c FROM problem_solution_map`).get() as { c: number }).c;

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM briefing_widget_sel`).run();
    db.prepare(`DELETE FROM briefing_solution_sel`).run();
    db.prepare(`DELETE FROM solution_widget_map`).run();
    db.prepare(`DELETE FROM solution_fs_map`).run();
    db.prepare(`DELETE FROM problem_solution_map`).run();
    db.prepare(`DELETE FROM solutions`).run();
  });
  tx();

  const afterSolutions = (db.prepare(`SELECT COUNT(*) as c FROM solutions`).get() as { c: number }).c;
  const afterLinks = (db.prepare(`SELECT COUNT(*) as c FROM problem_solution_map`).get() as { c: number }).c;
  const hypothesisProblems = (db.prepare(`SELECT COUNT(*) as c FROM hypothesis_problems`).get() as { c: number }).c;

  console.log(`✓ Справочник решений очищен`);
  console.log(`  Решений: ${beforeSolutions} → ${afterSolutions}`);
  console.log(`  Связей проблема→решение: ${beforeLinks} → ${afterLinks}`);
  console.log(`  Проблематик в гипотезах (без изменений): ${hypothesisProblems}`);
}

initDB();
clearSolutionsCatalog();
