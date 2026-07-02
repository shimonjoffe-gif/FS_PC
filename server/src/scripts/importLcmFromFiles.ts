/**
 * Импорт проблем и решений из LCM-файлов (Файлы LCM/) в гипотезы.
 * Запуск: npm run import:lcm (из server/)
 */
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { initDB, db } from '../db';
import { importLcmToHypothesis, parseLcmSheet, buildParsedLcmFromRowPairs, type ImportLcmResult, type LcmColumnOverride, type LcmRowPair, type ParsedLcmCanvas } from '../import/lcmCanvas';
import { normalizeSolutionName, pruneOrphanSolutions, deduplicateSolutions } from '../solutions';
import { recomputeAllSolutionCodes } from '../solutionNumbering';
import { recomputeAllProblemCodes } from '../problemNumbering';

const ROOT = path.join(process.cwd(), '..');
const LCM_DIR = path.join(ROOT, 'Файлы LCM');

interface FileMapping {
  file: string;
  sheet: string;
  hypothesisId?: number;
  hypothesisName: string;
  createIfMissing?: boolean;
  columns?: LcmColumnOverride;
  /** Явные пут со скрина — Excel может не совпадать 1:1 */
  rowPairs?: LcmRowPair[];
}

const BUDGETS_COLUMNS: LcmColumnOverride = {
  headerIdx: 2,
  problemCol: 1,
  problemLinkCol: -1,
  solutionCol: 3,
  solutionLinkCol: -1,
  splitMultilineSolutions: true,
  rowPairingOnly: true,
};

/** Данные со скрина «Проекты и бюджеты под контролем» (6 строк, колонка «Связь» пуста). */
const BUDGETS_ROW_PAIRS: LcmRowPair[] = [
  {
    problem: 'Нет фокуса. Руководителю сложно понять, какие проекты требуют внимания',
    solutions: [
      'Единая панель по портфелю проектов с индикаторами состояния проекта по срокам, бюджету и наличия рисков',
    ],
  },
  {
    problem: 'Размытая ответственность за проекты и их задачи',
    solutions: [
      'РП каждого проекта и ответственный по каждой задаче внутри проекта',
      'КСГ проекта / актируемые этапы –план/факт сроков с ответственными',
    ],
  },
  {
    problem: 'Проекты ведутся по разным правилам: разные форматы, разные инструменты, разная детализация. Сравнивать проекты невозможно',
    solutions: [
      'Единый ЖЦ проектов',
      'Единая структура этапов и КТ',
      'Единый формат дорожной карты проектов',
      'Единая шкала статусов готовности и % исполнения задач',
    ],
  },
  {
    problem: [
      'Экономика проекта и сроки ведутся в разных инструментах',
      'Не видны изменения бюджетов проектов при изменении сроков',
      'Отчетность по портфелю собирается вручную из разрозненных файлов. Подготовленный отчет уже не актуален',
    ].join('\n'),
    solutions: [
      'Сквозное решение для управления сроками и бюджетами проектов',
      'Пользователь один раз задает сроки актирования и условия оплаты по проекту, а система сама рассчитывает сроки поступлений и платежей',
      'Актуализация данных в системе по мере возникновения информации, а не под отчет',
    ],
  },
  {
    problem: [
      'Факт по бюджетам ведется в учетной системе и не сопоставим с планом',
      'Нужно видеть факт в проектах вплоть до первичных документов',
      'Двойной ввод данных',
    ].join('\n'),
    solutions: [
      'Ввод факта напрямую в системе или интеграции с учётными системами (опционально)',
    ],
  },
  {
    problem: 'Не получить актуальный прогноз по бюджетам портфеля с учетом фактических данных',
    solutions: [
      'Автоматическая актуализация прогноза по факту (опционально)',
    ],
  },
];

/** Данные со скрина «БЗ Финансы» (7 строк, иерархия решений по отступам). */
const FINANCE_ROW_PAIRS: LcmRowPair[] = [
  {
    problem: 'Все проекты ведутся разрозненно в разных системах',
    solutions: [
      'Получение согласованных и всегда актуальных данных по состоянию проектов',
    ],
  },
  {
    problem: [
      'Динамика по снижению рентабельности организации',
      'Снижается маржинальность',
      'Стоимость денег съедает рентабельность',
      'Много не спланированных, не заложенных в бюджет расходов',
    ].join('\n'),
    solutions: [
      {
        child: 'Выстраиваем процесс прогнозирования сроков исполнения договоров',
        under: 'Получение согласованных и всегда актуальных данных по состоянию проектов',
      },
      {
        child: 'Объединяем все планы по проектам в единой системе',
        under: 'Получение согласованных и всегда актуальных данных по состоянию проектов',
      },
      {
        name: 'Контроль соблюдения сроков проектов и прямых расходов по контракту',
        children: [
          'Выстраиваем контроль состояния, экономики и денежного потока проектов',
          'Своевременно реагируем на возникающие отклонения',
        ],
      },
    ],
  },
  {
    problem: [
      'Финансовый результат на уровне ФД/ГД, а не на уровне ЦФО',
      'Фин.директор вынужден делать оптимизацию на уровне производственных процессов, в которые он не погружен все подразделения добросовестно выполняют свои функции, и уверены в прибыльности своей деятельности в меру своего понимания ситуативно рентабельность падает, появляются кассовые разрывы, и все это головная боль только Финансового и Генерального директоров',
      'Центров прибыли, которые отвечают и за доходную и за расходную составляющую (с учетом хотя бы части накладных) не выделено. В итоге часть центров прибыли является непосредственно ГД',
      'Все накладные расходы учитываются «котлом»',
    ].join('\n'),
    solutions: [{
      name: 'Планирование портфеля проектов с учетом перспективных объемов',
      children: [
        'оцениваем привлекательность проекта перед стартом',
        'Выстраиваем процесс прогнозирования доходных объемов с учетом текущих и перспективных проектов',
        'Регулярно актуализируем текущие проекты по срокам',
        'Мониторинг процесса контрактации',
        'Актуализируем Темплан с учетом прогноза исполнения. Принимаем решение о необходимости корректировки лимита инвестиций',
        'Оценка достаточности маржинальности для покрытия инвестиций в развитие',
      ],
    }],
  },
  {
    problem: [
      'Кассовые разрывы',
      'Крупные внеплановые платежи',
      'Неожиданные кассовые разрывы',
      'Не можем заплатить важные платежи',
      'Не можем экстренно найти деньги',
    ].join('\n'),
    solutions: [{
      name: 'Делегирование ответственности за рентабельность с ГД на подразделения',
      children: [
        'Выделены полноценные Центры прибыли, отвечающие за собственный хоз.расчет с учетом накладных расходов',
        'Выделены центры затрат, отвечающие за эффективное выполнение собственной функции',
        'Максимально распределяем ответственность за накладные расходы на ЦП',
        'Минимизировать отнесение затрат на ГД',
      ],
    }],
  },
  {
    problem: [
      'Слишком поздно узнаем о перерасходе средств и срыве сроков',
      'Без актуальной информации продвигаются не выгодные проекты, а те, которые удобны исполнителям',
      'Регулярно получаем штрафы',
      'Нет полноценного контроля проектов',
      'Из-за неактуальных данных слишком поздно узнаем о перерасходе средств',
    ].join('\n'),
    solutions: [
      {
        child: 'Планируем и учитываем факт расходов и выплат по всем накладным в ЦП и ЦЗ по проектному принципу',
        under: 'Делегирование ответственности за рентабельность с ГД на подразделения',
      },
      {
        child: 'Контролируем положительный хоз. расчет каждого ЦП',
        under: 'Делегирование ответственности за рентабельность с ГД на подразделения',
      },
      {
        child: 'Шаблоны бюджетов ЦФО (структура и состав статей), которые корректируют и дополняют бюджет разовыми затратами',
        under: 'Делегирование ответственности за рентабельность с ГД на подразделения',
      },
      {
        child: 'ЦП контролируют свою операционную прибыль в каждом периоде',
        under: 'Делегирование ответственности за рентабельность с ГД на подразделения',
      },
      {
        child: 'ЦФО с помощью инструментов проектного управления контролирует влияние изменений на собственный хоз.расчет',
        under: 'Делегирование ответственности за рентабельность с ГД на подразделения',
      },
    ],
  },
  {
    problem: [
      'Нет достоверной информации о состоянии портфеля с учетом контрактации персп. Объемов',
      'Учетная система не содержит информации о перспективных объемах, их планируют общей суммой',
      'Невозможно оценить прогресс контрактации и осуществимость этих планов',
      'Данные теряют актуальность в момент передачи ответственному',
      'Нельзя посмотреть на ситуацию в целом на какую-то перспективу',
      'Нет понимания, можем ли себе позволить инвестировать в развитие',
      'Плановая и фактическая маржинальность по году сильно различаются',
    ].join('\n'),
    solutions: [
      'Контроль денежного потока и рентабельности проектов и портфелей.',
      {
        name: 'Оценка прогноза и факта результата по финансам. Держать руку на пульсе если что-то снижает фин. Результат',
        children: [
          'Контролируем рентабельность и денежный поток организации в целом',
          'Фин.директор контролирует, что по компании есть чистая прибыль в каждом периоде и нет отрицательного денежного потока',
          'Фин.директор видит в реальном времени исполнение бюджета',
          'Фин.директор контролирует рентабельность организации в целом, денежный поток и отсутствие кассовых разрывов',
          'Оперативные данные от ЦФО могут быть использованы в системе «Казначейство» (опционально)',
        ],
      },
    ],
  },
  {
    problem: [
      'Данные долго и сложно готовятся вручную, данные постоянно съезжают',
      'Приходится изобретать сложные учетные формы и регулярно поддерживать их актуальность',
      'Кажется, что нет решений, подходящих средним компаниям. Дорого выстраивать систему бюджетирования',
      'Сложно построить прозрачную систему мотивации без актуальной информации по проектам',
      'Собираются данные со всех подразделений в отдельных таблицах (бюджеты)',
      'Бюджеты актуализируются максимум раз в квартал т.к. это трудоемкий и долгий процесс',
      'Доходность поехала, расходная выполнена (узнаем по факту, а не заранее)',
    ].join('\n'),
    solutions: [],
  },
];

const ISB_COLUMNS: LcmColumnOverride = {
  headerIdx: 3,
  problemCol: 1,           // B — проблемы (презентация)
  problemLinkCol: 3,       // D — связь с решением
  solutionCol: 4,          // E — решения (текст из D, если E = ссылки)
  solutionTextFallbackCol: 3,
  extraProblemLinkCols: [2], // C — доп. связи проблема→решение
  solutionLinkCol: 4,
};

const MAPPINGS: FileMapping[] = [
  {
    file: 'Lean Canvas Model_БЗ Производство.xlsx',
    sheet: 'БЗ Производство ИСБ',
    hypothesisName: 'БЗ Производство тр',
    createIfMissing: true,
    columns: ISB_COLUMNS,
  },
  {
    file: 'Lean Canvas Model_БЗ Производство.xlsx',
    sheet: 'БЗ Производство ИСБ',
    hypothesisName: 'БЗ Производство рп',
    createIfMissing: true,
    // A — проблемы, C — связь, D — решения, E — обратная связь (как на скрине)
  },
  { file: 'Lean Canvas Model_БЗ Финансы.xlsx', sheet: 'БЗ Финансы', hypothesisId: 4, hypothesisName: 'БЗ Финансы тр', rowPairs: FINANCE_ROW_PAIRS },
  {
    file: 'Lean Canvas Model_Бюджеты проектов под контролем.xlsx',
    sheet: 'Проекты и бюджеты под контролем',
    hypothesisId: 2,
    hypothesisName: 'Проекты и бюджеты под контролем',
    columns: BUDGETS_COLUMNS,
    rowPairs: BUDGETS_ROW_PAIRS,
  },
  { file: 'Lean Canvas Model (инжиниринг).xlsx', sheet: 'Инжиниринг', hypothesisId: 5, hypothesisName: 'Инжиниринг' },
  { file: 'Lean Canvas Model Длинноцикловое производство.xlsx', sheet: 'Лист3', hypothesisName: 'Длинноцикловое производство', createIfMissing: true },
];

function splitEngineeringHypothesis(): void {
  const row = db.prepare(`SELECT id, name FROM hypotheses WHERE id=5`).get() as { id: number; name: string } | undefined;
  if (!row) {
    console.warn('  ⚠ Гипотеза id=5 не найдена — пропуск split');
    return;
  }
  db.prepare(`UPDATE hypotheses SET name=?, updated_at=CURRENT_TIMESTAMP WHERE id=5`).run('Инжиниринг');
  console.log(`  ✓ id=5 переименована: «${row.name.replace(/\s+/g, ' ').slice(0, 50)}…» → «Инжиниринг»`);

  const existing = db.prepare(`SELECT id FROM hypotheses WHERE name=?`).get('Длинноцикловое производство') as { id: number } | undefined;
  if (existing) {
    console.log(`  ✓ «Длинноцикловое производство» уже есть (id=${existing.id})`);
    return;
  }
  const result = db.prepare(`INSERT INTO hypotheses(name) VALUES (?)`).run('Длинноцикловое производство');
  console.log(`  ✓ Создана гипотеза «Длинноцикловое производство» (id=${result.lastInsertRowid})`);
}

function resolveHypothesisId(mapping: FileMapping): number {
  if (mapping.hypothesisId) {
    const row = db.prepare(`SELECT id FROM hypotheses WHERE id=?`).get(mapping.hypothesisId) as { id: number } | undefined;
    if (row) return row.id;
  }
  const byName = db.prepare(`SELECT id FROM hypotheses WHERE name=?`).get(mapping.hypothesisName) as { id: number } | undefined;
  if (byName) return byName.id;
  if (mapping.createIfMissing) {
    const result = db.prepare(`INSERT INTO hypotheses(name) VALUES (?)`).run(mapping.hypothesisName);
    return Number(result.lastInsertRowid);
  }
  throw new Error(`Гипотеза не найдена: ${mapping.hypothesisName}`);
}

function importFile(mapping: FileMapping): ImportLcmResult {
  const hypothesisId = resolveHypothesisId(mapping);
  const hypRow = db.prepare(`SELECT name FROM hypotheses WHERE id=?`).get(hypothesisId) as { name: string };

  if (mapping.rowPairs?.length) {
    const parsed = buildParsedLcmFromRowPairs(mapping.rowPairs);
    return importLcmToHypothesis(hypothesisId, hypRow.name, parsed);
  }

  const filePath = path.join(LCM_DIR, mapping.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Файл не найден: ${filePath}`);
  }

  const wb = XLSX.readFile(filePath);
  if (!wb.SheetNames.includes(mapping.sheet)) {
    throw new Error(`Лист «${mapping.sheet}» не найден в ${mapping.file} (есть: ${wb.SheetNames.slice(0, 5).join(', ')}…)`);
  }

  const parsed = parseLcmSheet(wb.Sheets[mapping.sheet], `${mapping.file}/${mapping.sheet}`, mapping.columns);
  if (!parsed) {
    throw new Error(`Не найдена строка заголовков LCM на листе «${mapping.sheet}»`);
  }

  return importLcmToHypothesis(hypothesisId, hypRow.name, parsed);
}

function collectSolutionNamesFromParsed(parsed: ParsedLcmCanvas, out: Set<string>): void {
  for (const item of parsed.solutions) {
    const name = item.name.trim();
    if (name) out.add(normalizeSolutionName(name));
  }
}

function collectSolutionNamesFromRowPairs(rows: LcmRowPair[], out: Set<string>): void {
  const add = (name: string) => {
    const trimmed = name.trim();
    if (trimmed) out.add(normalizeSolutionName(trimmed));
  };
  for (const row of rows) {
    for (const entry of row.solutions) {
      if (typeof entry === 'string') {
        add(entry);
      } else if ('under' in entry) {
        add(entry.child);
        add(entry.under);
      } else {
        add(entry.name);
        for (const child of entry.children ?? []) add(child);
      }
    }
  }
}

function collectAllLcmSolutionNames(): Set<string> {
  const names = new Set<string>();
  for (const mapping of MAPPINGS) {
    if (mapping.rowPairs?.length) {
      collectSolutionNamesFromRowPairs(mapping.rowPairs, names);
      continue;
    }
    const filePath = path.join(LCM_DIR, mapping.file);
    if (!fs.existsSync(filePath)) continue;
    const wb = XLSX.readFile(filePath);
    if (!wb.SheetNames.includes(mapping.sheet)) continue;
    const parsed = parseLcmSheet(wb.Sheets[mapping.sheet], `${mapping.file}/${mapping.sheet}`, mapping.columns);
    if (parsed) collectSolutionNamesFromParsed(parsed, names);
  }
  return names;
}

function main() {
  initDB();

  if (!fs.existsSync(LCM_DIR)) {
    console.error(`Каталог не найден: ${LCM_DIR}`);
    process.exit(1);
  }

  console.log('=== Подготовка гипотез ===');
  splitEngineeringHypothesis();

  console.log('\n=== Импорт LCM ===');
  const results: ImportLcmResult[] = [];
  const allWarnings: string[] = [];

  for (const mapping of MAPPINGS) {
    if (mapping.hypothesisName === 'Длинноцикловое производство'
      || mapping.hypothesisName === 'БЗ Производство рп'
      || mapping.hypothesisName === 'БЗ Производство тр') {
      mapping.hypothesisId = resolveHypothesisId(mapping);
    }
    try {
      console.log(`\n→ ${mapping.file} / ${mapping.sheet}`);
      const result = importFile(mapping);
      results.push(result);
      console.log(`  проблем: ${result.problems}, решений: ${result.solutions}, связей: ${result.links}`);
      if (result.warnings.length) {
        console.log(`  предупреждений: ${result.warnings.length}`);
        allWarnings.push(...result.warnings);
      }
    } catch (err) {
      console.error(`  ✗ ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  }

  console.log('\n=== Итого по гипотезам ===');
  console.log('| Гипотеза | id | проблем | решений | связей |');
  console.log('|----------|-----|---------|---------|--------|');
  for (const r of results) {
    console.log(`| ${r.hypothesisName} | ${r.hypothesisId} | ${r.problems} | ${r.solutions} | ${r.links} |`);
  }

  if (allWarnings.length) {
    console.log(`\n=== Предупреждения парсинга (${allWarnings.length}) ===`);
    for (const w of allWarnings.slice(0, 30)) console.log(`  • ${w}`);
    if (allWarnings.length > 30) console.log(`  … и ещё ${allWarnings.length - 30}`);
  }

  console.log('\n=== Очистка сирот (не из LCM-файлов) ===');
  const lcmNames = collectAllLcmSolutionNames();
  const deleted = pruneOrphanSolutions(lcmNames);
  const remaining = (db.prepare(`SELECT COUNT(*) as c FROM solutions`).get() as { c: number }).c;
  console.log(`  Уникальных имён в LCM: ${lcmNames.size}`);
  console.log(`  Удалено сирот: ${deleted}`);
  console.log(`  Решений в справочнике: ${remaining}`);

  console.log('\n=== Дедупликация решений ===');
  const deduped = deduplicateSolutions();
  const afterDedup = (db.prepare(`SELECT COUNT(*) as c FROM solutions`).get() as { c: number }).c;
  console.log(`  Групп дублей: ${deduped.groups}, удалено: ${deduped.deleted}`);
  console.log(`  Решений после дедупа: ${afterDedup}`);

  console.log('\n=== Нумерация решений ===');
  recomputeAllSolutionCodes();
  recomputeAllProblemCodes();
  const withCatalog = (db.prepare(`SELECT COUNT(*) as c FROM solutions WHERE catalog_code IS NOT NULL`).get() as { c: number }).c;
  const hypCodes = (db.prepare(`SELECT COUNT(*) as c FROM solution_hypothesis_codes`).get() as { c: number }).c;
  console.log(`  Сквозных кодов: ${withCatalog}, кодов в гипотезах: ${hypCodes}`);

  console.log('\n✓ Импорт LCM завершён');
}

main();
