// 演示数据全部虚构：教师、评价、资料与账号均不对应真实人物或记录。
export const SCHOOL = 'beihang'
const stamp = '2026-10-20T08:00:00Z'
export const ago = (days: number, hours = 0) => new Date(Date.now() - days * 864e5 - hours * 36e5).toISOString()
const obj = (id: string, kind: string, name: string, extra: Record<string, unknown> = {}) => ({ id, kind, name, school_id: SCHOOL, credits: null as number | null, aliases: [] as string[], revision: 1, updated_at: stamp, ...extra })

export const school = obj(SCHOOL, 'school', '北京航空航天大学', { aliases: ['北航', 'BUAA'] })
export const departments = [
  obj('d-math', 'department', '数学科学学院'), obj('d-cs', 'department', '计算机学院'), obj('d-auto', 'department', '自动化科学与电气工程学院'),
  obj('d-astro', 'department', '宇航学院'), obj('d-aero', 'department', '航空科学与工程学院'), obj('d-ee', 'department', '电子信息工程学院'), obj('d-hum', 'department', '人文社会科学学院'),
]
export const categories = [obj('c-base', 'category', '公共基础'), obj('c-core', 'category', '专业核心'), obj('c-gen', 'category', '通识选修')]
export const natures = [obj('n-req', 'nature', '必修'), obj('n-opt', 'nature', '选修')]
export const terms = [obj('t-25f', 'term', '2025 秋季学期'), obj('t-26s', 'term', '2026 春季学期'), obj('t-26f', 'term', '2026 秋季学期')]

type Seed = [id: string, name: string, code: string, dept: string, cat: string, nat: string, credits: number, heat: number, rating: number[]]
export const courseSeeds: Seed[] = [
  ['c1', '高等数学（上）', 'B1A09104', 'd-math', 'c-base', 'n-req', 6, 98, [4, 5, 4, 4, 3]],
  ['c2', '线性代数', 'B1A09105', 'd-math', 'c-base', 'n-req', 3.5, 86, [4, 4, 3, 3, 4]],
  ['c3', '数据结构与算法', 'B3I06201', 'd-cs', 'c-core', 'n-req', 4, 94, [5, 5, 4, 5, 3]],
  ['c4', '操作系统', 'B3I06302', 'd-cs', 'c-core', 'n-req', 4, 89, [5, 5, 5, 5, 3]],
  ['c5', '自动控制原理', 'B3I03211', 'd-auto', 'c-core', 'n-req', 4, 72, [4, 4, 4, 3, 3]],
  ['c6', '飞行器设计导论', 'B3I05110', 'd-aero', 'c-core', 'n-opt', 2, 64, [5, 5, 2, 2, 5]],
  ['c7', '航天器轨道力学', 'B3I15204', 'd-astro', 'c-core', 'n-req', 3, 51, [4, 4, 5, 4, 3]],
  ['c8', '信号与系统', 'B3I02206', 'd-ee', 'c-core', 'n-req', 4, 68, [3, 3, 4, 4, 3]],
  ['c9', '大学物理（2）', 'B1A11102', 'd-math', 'c-base', 'n-req', 4, 77, [3, 4, 4, 3, 3]],
  ['c10', '机器学习基础', 'B3I06410', 'd-cs', 'c-core', 'n-opt', 3, 91, [5, 4, 4, 4, 4]],
  ['c11', '航空航天概论', 'B1G05001', 'd-aero', 'c-gen', 'n-opt', 2, 83, [5, 5, 1, 1, 5]],
  ['c12', '中国近现代史纲要', 'B1G17002', 'd-hum', 'c-base', 'n-req', 3, 58, [3, 3, 2, 2, 4]],
]
export const courses: any[] = courseSeeds.map(([id, name, code, department_id, category_id, nature_id, credits]) => obj(id, 'course', name, { code, department_id, category_id, nature_id, credits }))

const teacherSeeds = [
  ['p1', '林知远', 'd-math', '主讲高等数学十余年，板书细致，讲义逐年更新。'], ['p2', '周清和', 'd-math', '研究方向为数值代数，课堂喜欢用几何直观解释概念。'],
  ['p3', '许文澜', 'd-cs', '算法与系统方向，课程实验贴近工业实践。'], ['p4', '陈砚秋', 'd-cs', '长期指导操作系统课程设计，重视动手能力。'],
  ['p5', '沈若谷', 'd-auto', '控制理论方向，习惯用工程案例引入新内容。'], ['p6', '顾星河', 'd-aero', '飞行器总体设计方向，带队参加多项航模竞赛。'],
  ['p7', '宋既明', 'd-astro', '航天动力学方向，考试偏重推导。'], ['p8', '叶听澜', 'd-ee', '信号处理方向，作业量适中，答疑及时。'],
  ['p9', '方亦舟', 'd-cs', '机器学习方向，课程项目自由度高。'], ['p10', '苏以安', 'd-hum', '近现代史方向，讲课以史料为线索。'],
]
export const teachers = teacherSeeds.map(([id, name, department_id, biography]) => obj(id!, 'teacher', name!, { department_id, biography }))

const links: [course: string, teacher: string][] = [['c1', 'p1'], ['c1', 'p2'], ['c2', 'p2'], ['c3', 'p3'], ['c4', 'p4'], ['c4', 'p3'], ['c5', 'p5'], ['c6', 'p6'], ['c7', 'p7'], ['c8', 'p8'], ['c9', 'p2'], ['c10', 'p9'], ['c11', 'p6'], ['c12', 'p10']]
export const teachesIn = links
export const offerings = terms.flatMap((term) => courses.map((c) => obj(`${c.id}-${term.id}`, 'term_course', `${c.name}（${term.name}）`, { course_id: c.id, term_id: term.id, credits: c.credits })))
const places = ['新主楼 A201', '主 M101', '新主楼 F306', '教三 402', '主 M204', '沙河 J3-112', '新主楼 B512']
export const classes = links.flatMap(([c, p], i) => terms.map((term) => obj(`k-${c}-${p}-${term.id}`, 'class', `${String(i + 1).padStart(2, '0')} 班`, { term_course_id: `${c}-${term.id}`, course_id: c, term_id: term.id, teacher_id: p, category_id: courses.find((x) => x.id === c)?.category_id, nature_id: courses.find((x) => x.id === c)?.nature_id })))
const slots = ['周一 08:00–09:35', '周二 09:50–11:25', '周三 14:00–15:35', '周四 08:00–09:35', '周五 09:50–11:25', '周二 15:50–17:25', '周四 14:00–15:35']
export const schedules = classes.map((k, i) => obj(`s-${k.id}`, 'schedule', '教学时间', { class_id: k.id, time_text: slots[i % slots.length], location: places[i % places.length] }))
export const catalogByKind: Record<string, ReturnType<typeof obj>[]> = { school: [school], department: departments, category: categories, nature: natures, term: terms, course: courses, teacher: teachers, term_course: offerings, class: classes, schedule: schedules }
export const allObjects = Object.values(catalogByKind).flat()

export const enrollments = [
  ...['c3', 'c5', 'c8', 'c10'].map((c, i) => ({ id: `e-now-${i}`, subject: 'demo', school_id: SCHOOL, course_id: c, term_id: 't-26f', class_id: `k-${c}-${links.find((l) => l[0] === c)![1]}-t-26f`, teacher_ids: [links.find((l) => l[0] === c)![1]], active: true })),
  ...['c1', 'c2', 'c9'].map((c, i) => ({ id: `e-old-${i}`, subject: 'demo', school_id: SCHOOL, course_id: c, term_id: 't-26s', class_id: `k-${c}-${links.find((l) => l[0] === c)![1]}-t-26s`, teacher_ids: [links.find((l) => l[0] === c)![1]], active: true })),
]

const aliases = ['小舟', '青禾', '南风', '远山', '白鹭', '落星', '听雨', '长庚']
let aliasAt = 0
const author = (name?: string) => (name ? { anonymous: false, handle: name, profile: { name } } : { anonymous: true, handle: aliases[aliasAt++ % aliases.length]! })
type Row = [id: string, target: string, term: string, teacher: string, title: string, body: string, ratings: number[], up: number, down: number, days: number, who?: string, featured?: boolean]
const rows: Row[] = [
  ['r1', 'c3', 't-26s', 'p3', '实验很硬核，但学完真的会写代码', '许老师讲课节奏偏快，建议提前看一遍讲义。五次上机实验难度递增，最后的图算法实验花了我整整一个周末。考试题目和作业风格一致，只要把实验自己做完，分数不会差。\n\n如果你已经刷过一些题，这门课会很舒服。零基础的同学前四周要多花时间，助教答疑很及时，别不好意思问。', [5, 5, 4, 5, 3], 128, 4, 3, undefined, true],
  ['r2', 'c3', 't-25f', 'p3', '作业量大，收获也大', '每周一次书面作业加一次上机。推荐配合课本习题复习，期末重点在树和图。', [4, 4, 4, 5, 4], 64, 2, 40, '航小北'],
  ['r3', 'c1', 't-26s', 'p1', '板书清楚，跟上就不会掉队', '林老师每节课都从上节内容带着回顾，推导过程写得很全。习题课非常值得去，期中前把极限和微分练熟，后面会轻松很多。', [5, 5, 4, 4, 3], 212, 6, 20, undefined, true],
  ['r4', 'c1', 't-25f', 'p2', '更偏直观理解，适合想搞懂原理的同学', '周老师喜欢画图解释概念，考试题目比较灵活。只背公式不够，需要自己多想一步。', [4, 5, 5, 4, 3], 87, 5, 60],
  ['r5', 'c2', 't-26s', 'p2', '几何直观讲得特别好', '特征值那一章讲得让我第一次真正看懂了。作业不多，但期末有几道证明题要注意。', [5, 5, 3, 2, 4], 96, 1, 18, '不周山'],
  ['r6', 'c4', 't-26s', 'p4', '课程设计是这门课的灵魂', '从 bootloader 一路写到文件系统，强度很高，建议组队前先商量好分工。期末考试反而不算难。陈老师对同学的设计思路很有耐心。', [5, 5, 5, 5, 3], 176, 8, 25],
  ['r7', 'c5', 't-26s', 'p5', '案例多，公式也多', '沈老师会用实际系统引入理论，比纯推导好懂。根轨迹和频域部分需要多练。', [4, 4, 4, 3, 3], 41, 2, 33],
  ['r8', 'c6', 't-25f', 'p6', '最有意思的选修之一', '课程以小组设计无人机为主线，结课要飞起来。考核压力不大，做项目很快乐。', [5, 5, 2, 2, 5], 73, 0, 70, '云上'],
  ['r9', 'c10', 't-26s', 'p9', '项目自由度高，理论不算轻松', '可以自选课题，老师会认真给建议。推导部分需要一定数学基础，建议先修好线代和概率。', [5, 4, 4, 4, 4], 118, 3, 12, undefined, true],
  ['r10', 'c11', 't-26s', 'p6', '轻松又长见识', '每周一个主题，还有参观实验室的机会。作业是两篇小论文。', [5, 5, 1, 1, 5], 59, 1, 9],
  ['r11', 'c8', 't-26s', 'p8', '作业适中，答疑很及时', '叶老师会在课程群里解答问题。卷积和傅里叶部分是难点，提前预习效果好。', [4, 4, 4, 3, 4], 33, 1, 15],
  ['r12', 'c7', 't-25f', 'p7', '推导量很大，但很系统', '考试重推导，建议把课上例题完整做一遍。', [4, 4, 5, 4, 3], 22, 2, 80],
  ['r13', 'c9', 't-26s', 'p2', '题目比想象中难', '电磁学部分需要多刷题，平时分占比不低，别缺勤。', [3, 4, 4, 4, 3], 28, 2, 26],
  ['r14', 'c12', 't-26s', 'p10', '史料讲得很有意思', '苏老师上课不念 PPT，结课论文给分比较公道。', [4, 4, 2, 2, 4], 19, 0, 11],
  ['r15', 'p3', '', '', '讲得快但讲得透', '许老师对问题的回答很有条理，课后邮件也会回复。', [5, 0, 0, 0, 0], 42, 1, 16, '航小北'],
  ['r16', 'c10', 't-26s', 'p9', '我写的：适合想做项目的同学', '我们组做了一个校园图像分类，老师给了不少建议。', [5, 4, 4, 4, 4], 12, 0, 6, '小航同学'],
]
const stateFor = (id: string) => (id === 'r16' ? { mine: true, can_edit: true } : { mine: false, can_edit: false })
export const reviews = rows.map(([id, target_id, term_id, teacher_id, title, body, ratings, upvotes, downvotes, days, who, featured]) => ({
  id, root_id: id, kind: target_id.startsWith('p') ? 'mentor' : 'course', school_id: SCHOOL, target_id, ...(term_id ? { term_id } : {}), ...(teacher_id ? { teacher_id } : {}), title, body, ratings, preview: false, author: author(who), revision: 1, published_at: ago(days), upvotes, downvotes, my_vote: 0, state: 'published', ...(featured ? { featured } : {}), ...stateFor(id),
}))
export const replies = [
  { root: 'r1', who: '不周山', body: '同意，图算法那个实验确实要预留足够时间。', days: 2 },
  { root: 'r1', who: '', body: '请问零基础选这个老师的班合适吗？', days: 2 },
  { root: 'r1', who: '航小北', body: '合适，但前四周多投入一些，助教很耐心。', days: 1 },
  { root: 'r3', who: '', body: '习题课真的很有用，强烈推荐。', days: 10 },
].map((r, i) => ({ id: `reply-${i}`, root_id: r.root, parent_id: r.root, kind: 'reply', school_id: SCHOOL, target_id: r.root, title: '', body: r.body, ratings: [0, 0, 0, 0, 0], preview: false, author: author(r.who), revision: 1, published_at: ago(r.days), upvotes: i, downvotes: 0, my_vote: 0, mine: false, state: 'published', can_edit: false }))
export const drafts = [
  { id: 'dr1', revision: 2, input: { kind: 'course', target_id: 'c5', term_id: 't-26s', teacher_id: 'p5', title: '控制原理的学习建议', body: '还没写完：想说说根轨迹……', ratings: [4, 4, 0, 0, 0], signed: false }, withdrawn: false },
]
export const tasks = [
  { id: 'tk1', school_id: SCHOOL, content_kind: 'review', submission: { object_id: 'r16', kind: 'review', reason: 'content_review', evidence: [] }, object_revision: 1, revision: 2, state: 'decided', created_at: ago(7), updated_at: ago(6), can_appeal: false },
  { id: 'tk2', school_id: SCHOOL, content_kind: 'review', submission: { object_id: 'r13', kind: 'report', reason: '评价内容涉及人身攻击', evidence: [] }, object_revision: 1, revision: 1, state: 'waiting', created_at: ago(1), updated_at: ago(1), can_appeal: false },
]
export const statDims = (r: number[]) => r.map((level, i) => ({ level, samples: 18 + ((level * 37 + i * 11) % 60), courses: 1 }))

const names = (zh: string, en: string) => ({ 'zh-CN': zh, 'en-US': en })
const yearField = { key: 'year', names: names('年份', 'Year'), kind: 'integer', required: false, filterable: true, groupable: true, min: 2000, max: 2030 }
export const resCategories = [
  { id: 'exam', revision: 1, names: names('往年试卷', 'Past papers'), enabled: true, order: 1, group_by: 'year', fields: [yearField] },
  { id: 'note', revision: 1, names: names('课程笔记', 'Notes'), enabled: true, order: 2, group_by: '', fields: [] },
  { id: 'slide', revision: 1, names: names('课件讲义', 'Slides'), enabled: true, order: 3, group_by: '', fields: [] },
  { id: 'solution', revision: 1, names: names('习题解答', 'Solutions'), enabled: true, order: 4, group_by: '', fields: [] },
]
type ResRow = [id: string, title: string, desc: string, cat: number, course: string, file: string, type: string, size: number, year: number, owned: boolean, state: string, days: number]
const resRows: ResRow[] = [
  ['x1', '数据结构 2025 秋期末试卷（回忆版）', '整理了选择题和两道大题的思路，答案为同学讨论结果，仅供参考。', 0, 'c3', '数据结构2025秋期末.pdf', 'application/pdf', 1_420_000, 2025, false, 'published', 4],
  ['x2', '数据结构上机实验指南', '五次实验的环境配置与常见错误清单。', 2, 'c3', '上机实验指南.pdf', 'application/pdf', 3_800_000, 2026, false, 'published', 12],
  ['x3', '高等数学（上）期中复习笔记', '手写笔记扫描版，按极限、微分、积分三部分整理。', 1, 'c1', '高数上期中笔记.pdf', 'application/pdf', 18_200_000, 2026, false, 'published', 8],
  ['x4', '高等数学（上）2024 期末试卷', '带参考答案。', 0, 'c1', '高数上2024期末.pdf', 'application/pdf', 980_000, 2024, false, 'published', 90],
  ['x5', '线性代数习题解答（前六章）', '对照教材课后习题，部分题目给出两种解法。', 3, 'c2', '线代习题解答.pdf', 'application/pdf', 6_400_000, 2026, false, 'published', 30],
  ['x6', '操作系统课程设计报告模板', 'Word 模板，含目录结构和评分要点。', 2, 'c4', '课设报告模板.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 220_000, 2026, false, 'published', 21],
  ['x7', '自动控制原理重点公式速查', '两页 A4，考前翻看。', 1, 'c5', '控制原理速查.pdf', 'application/pdf', 340_000, 2026, true, 'published', 14],
  ['x8', '机器学习基础课堂笔记', '我整理的推导笔记，持续更新。', 1, 'c10', '机器学习笔记.pdf', 'application/pdf', 5_100_000, 2026, true, 'draft', 2],
  ['x9', '信号与系统 2025 期末试卷', '回忆版，不含答案。', 0, 'c8', '信号与系统2025.pdf', 'application/pdf', 760_000, 2025, false, 'published', 45],
  ['x10', '航空航天概论结课论文选题参考', '往届同学选题方向汇总。', 2, 'c11', '选题参考.pdf', 'application/pdf', 410_000, 2026, false, 'published', 18],
]
export const resources: any[] = resRows.map(([id, title, description, c, course_id, filename, content_type, size, year, owned, state, days]) => {
  const category = resCategories[c]!
  const version = { id: `${id}-v1`, number: 1, metadata: { title, description, tags: [], category_id: category.id, category_revision: 1, attributes: c === 0 ? { year: { number: year } } : {}, associations: { school_id: SCHOOL, course_id }, access: 'public', origin: { kind: 'original' } }, category, file: { version_id: `${id}-f`, filename, content_type, size, sha256: 'a'.repeat(64) }, state: state === 'draft' ? 'draft' : 'published', created_at: ago(days) }
  return { id, revision: 2, state, ...(state === 'draft' ? { proposal: version } : { current: version }), download_allowed: state !== 'draft', access_reason: 'allowed', owned }
})
export const directories = [
  { id: 'dir-ds', revision: 1, school_id: SCHOOL, course_id: 'c3', parent_id: '', names: names('数据结构资料包', 'Data structures'), enabled: true },
]
export const receipts = [
  { id: 'q1', resource_id: 'x7', kind: 'withdrawal', state: 'waiting', can_appeal: false, created_at: ago(2) },
  { id: 'q2', resource_id: 'x4', kind: 'complaint', state: 'decided', decision_reason: '资料来源已核实，继续保留。', can_appeal: true, created_at: ago(15) },
]
export const capabilities = { terms: { version: 'v1', digest: 'a'.repeat(64), url: 'https://example.invalid/terms' }, allowed_types: ['application/pdf', 'image/png', 'text/plain'], max_file_size: 200_000_000, max_package_bytes: 1_000_000_000, max_package_files: 100, purchase_available: false, upload_profiles: [{ school_id: SCHOOL, access: 'public', purpose: 'resource' }] }

const GB = 1e9
export const contribution = {
  policy: { terms: { version: 'v1', digest: 'a'.repeat(64), url: 'https://example.invalid/terms' }, adapters: ['bhpan'], min_bytes: GB, max_bytes: 1000 * GB, min_term_seconds: 86400, max_term_seconds: 31536000, exit_target_seconds: 86400, max_per_owner: 5, observation_max_age_seconds: 3600 },
  statistics: { declared_bytes: 4200 * GB, available_bytes: 2900 * GB, used_bytes: 1300 * GB, reserved_bytes: 40 * GB, contributions: 86, fresh_observations: 83, status: 'current', generated_at: ago(0, 1) },
  item: { id: 'ct1', adapter: 'bhpan', revision: 3, applied_revision: 3, desired_state: 'active', state: 'active', reason: '', conditions: { limit_bytes: 50 * GB, personal_reserve: 10 * GB, until: '2027-06-30T00:00:00Z' }, consent: { version: 'v1', digest: 'a'.repeat(64), url: 'https://example.invalid/terms' }, accepted_at: ago(60), created_at: ago(60), updated_at: ago(3), observation: { observed_at: ago(0, 1), authorization_expires_at: '2027-06-30T00:00:00Z', quota_expires_at: '2027-06-30T00:00:00Z', authorized: true, used_bytes: 18 * GB, reserved_bytes: 2 * GB, available_bytes: 30 * GB, remaining_replicas: 3 } },
  options: { items: [{ id: 'cu1', adapter: 'bhpan', available_bytes: 80 * GB, authorization_expires_at: '2027-06-30T00:00:00Z' }], next_cursor: '' },
}
export const custody = {
  policy: { version: 'v1', digest: 'a'.repeat(64), url: 'https://example.invalid/custody', max_term_seconds: 31536000 },
  items: [{ id: '00000000-0000-4000-8000-000000000001', adapter: 'bhpan', revision: 1, state: 'ready', authorization_expires_at: '2027-06-30T00:00:00Z', request_id: '00000000-0000-4000-8000-000000000001', last_error: '' }],
}
export const verification = {
  school: { id: SCHOOL, name: '北京航空航天大学', enabled: true, methods: ['school_sso', 'student_email_outbound_otp', 'manual_material_review'], notice_version: 'v1', opening_date: '2026-09-01', newcomer_days: 30, email_domain: 'buaa.edu.cn', material_types: ['student_card'], revision: 1 },
  credential: (state: string) => ({ id: 'cred', school_id: SCHOOL, method: 'school_sso', stage: 'bachelor', kind: 'student', state, student_display: '23****17', revision: 1, verified_at: ago(50), expires_at: state === 'expired' ? ago(3) : '2027-07-01T00:00:00Z' }),
  application: { id: 'app1', school_id: SCHOOL, method: 'manual_material_review', stage: 'bachelor', kind: 'student', state: 'pending_review', revision: 2, created_at: ago(1), updated_at: ago(0, 5), expires_at: '2027-01-01T00:00:00Z', credential_id: '', result_code: '' },
}
