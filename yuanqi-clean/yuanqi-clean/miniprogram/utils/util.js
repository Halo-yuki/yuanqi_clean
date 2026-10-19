/**
 * util.js —— 通用工具：周次、时间节点、格式化
 */

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

// 取某个日期所在自然周的周一（周一为一周第一天）
function mondayOf(date) {
  var d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  var day = d.getDay() || 7 // 周日=7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * ===== 南航 2026-2027 学年第一学期校历 =====
 * 第 1 周周一 = 2026-08-31，全学期共 20 周
 * 第 20 周 = 2027-01-11 ~ 01-17，1 月 18 日起放寒假
 * 周次一律以校历为准（第 1 周开学 → 第 20 周结束）
 */
var TERM_START_MONDAY = new Date(2026, 7, 31).getTime() // 2026-08-31
var TERM_WEEKS = 20

// 第 n 周的周一日期
function termMondayOf(weekNo) {
  var d = new Date(TERM_START_MONDAY)
  d.setDate(d.getDate() + (weekNo - 1) * 7)
  d.setHours(0, 0, 0, 0)
  return d
}

// 某个周一对应校历第几周（未夹取的原始值）
function termWeekNoOf(mondayTs) {
  return Math.floor((mondayTs - TERM_START_MONDAY) / 86400000 / 7) + 1
}

// 周记录 id：T1W07 = 第一学期第 7 周
function weekKey(weekNo) {
  return 'T1W' + pad(weekNo)
}

// 生成最近 n 个校历周（含本周），从新到旧；早于第 1 周自动截断
function recentWeeks(n) {
  var now = new Date()
  var rawNo = termWeekNoOf(mondayOf(now).getTime())
  var curNo = Math.max(1, Math.min(TERM_WEEKS, rawNo))
  var list = []
  for (var i = 0; i < n; i++) {
    var no = curNo - i
    if (no < 1) break
    var mon = termMondayOf(no)
    var sun = new Date(mon.getTime())
    sun.setDate(sun.getDate() + 6)
    list.push({
      id: weekKey(no),
      no: no,
      label: '第 ' + no + ' 周',
      range: (mon.getMonth() + 1) + '.' + mon.getDate() + ' - ' + (sun.getMonth() + 1) + '.' + sun.getDate(),
      monday: mon.getTime(),
      sunday: sun.getTime(),
      isCurrent: i === 0
    })
  }
  return list
}

function currentWeekId() {
  return recentWeeks(1)[0].id
}

function formatTime(ts, withTime) {
  if (!ts) return '--'
  var d = new Date(ts)
  var s = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  if (withTime) s += ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  return s
}

// 周日 21:30 视为本周大扫除时间点
function sundayNightOf(mondayTs) {
  var d = new Date(mondayTs)
  d.setDate(d.getDate() + 6)
  d.setHours(21, 30, 0, 0)
  return d.getTime()
}

/**
 * 判断是否处于「照片上传」时间窗：周日 22:00 后 → 周一 8:00 前
 * @param {number} ts 时间戳
 */
function isUploadWindow(ts) {
  var d = new Date(ts)
  var day = d.getDay()
  var h = d.getHours() + d.getMinutes() / 60
  if (day === 0 && h >= 22) return true
  if (day === 1 && h < 8) return true
  return false
}

/**
 * 当前所处活动环节（用于首页状态卡）
 */
function currentPhase(ts) {
  var d = new Date(ts || Date.now())
  var day = d.getDay()
  var h = d.getHours() + d.getMinutes() / 60
  if (day === 0 && h >= 21.5 && h < 22) {
    return { key: 'clean', name: '常规清扫', tip: '周日晚 21:30—22:00 · 全员动起来' }
  }
  if ((day === 0 && h >= 22) || (day === 1 && h < 8)) {
    return { key: 'upload', name: '照片上传', tip: '周日 22:00 后至周一 8:00 · 逾期视为未完成' }
  }
  if (day === 0 && h >= 19 && h < 21.5) {
    return { key: 'inspect', name: '抽查核验', tip: '周日晚间 · 管理员实地抽查打分' }
  }
  if ((day === 1 && h >= 16) || (day === 2 && h < 20)) {
    return { key: 'mutual', name: '互评开展', tip: '周一 16:00—周二 20:00 · 逾期视为工作失职' }
  }
  return { key: 'notice', name: '结果公示', tip: '每月统一公示 · 汇总互评与抽查结果' }
}

const PHASE_ORDER = ['clean', 'upload', 'inspect', 'mutual', 'notice']

function genId(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

module.exports = {
  pad: pad,
  mondayOf: mondayOf,
  TERM_START_MONDAY: TERM_START_MONDAY,
  TERM_WEEKS: TERM_WEEKS,
  termMondayOf: termMondayOf,
  termWeekNoOf: termWeekNoOf,
  recentWeeks: recentWeeks,
  currentWeekId: currentWeekId,
  formatTime: formatTime,
  sundayNightOf: sundayNightOf,
  isUploadWindow: isUploadWindow,
  currentPhase: currentPhase,
  PHASE_ORDER: PHASE_ORDER,
  genId: genId
}
