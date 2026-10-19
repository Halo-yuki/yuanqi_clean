/**
 * stats.js —— 统计计算层（多维度得分 / 互评优秀率 / 焕新之星 / 违规名单）
 * 页面只负责展示，所有业务计算都放这里，方便单独调试与复用。
 */
const RULES = require('./rules.js')

/**
 * 把 {ground:18,...} 转成可直接渲染的列表
 */
function toDimsList(dims) {
  return RULES.DIMENSIONS.map(function (d) {
    var v = dims && typeof dims[d.key] === 'number' ? dims[d.key] : 0
    return {
      key: d.key,
      name: d.name,
      desc: d.desc,
      max: d.max,
      value: Math.round(v * 10) / 10,
      percent: Math.min(100, Math.round((v / d.max) * 100))
    }
  })
}

function avgDims(rows) {
  var res = {}
  var sum = {}
  var cnt = {}
  RULES.DIMENSIONS.forEach(function (d) { res[d.key] = 0; sum[d.key] = 0; cnt[d.key] = 0 })
  rows.forEach(function (r) {
    if (!r.dims) return
    RULES.DIMENSIONS.forEach(function (d) {
      if (typeof r.dims[d.key] === 'number') {
        sum[d.key] += r.dims[d.key]
        cnt[d.key] += 1
      }
    })
  })
  RULES.DIMENSIONS.forEach(function (d) {
    res[d.key] = cnt[d.key] ? Math.round((sum[d.key] / cnt[d.key]) * 10) / 10 : 0
  })
  return res
}

function sumDims(dims) {
  var t = 0
  RULES.DIMENSIONS.forEach(function (d) { t += (dims && dims[d.key]) || 0 })
  return Math.round(t * 10) / 10
}

// 互评档位 key → 中文名（未互评时返回「未互评」）
function mutualName(key) {
  if (!key) return '未互评'
  for (var i = 0; i < RULES.MUTUAL_OPTIONS.length; i++) {
    if (RULES.MUTUAL_OPTIONS[i].key === key) return RULES.MUTUAL_OPTIONS[i].name
  }
  return '未互评'
}

/**
 * 某一周、所有寝室的表现
 * @param {object} data store 中的完整数据
 * @param {string} weekId
 * @param {boolean} countable 该周是否已产生评分记录（未产生则不计违规）
 */
function buildWeekStats(data, weekId, countable) {
  var subs = data.submissions.filter(function (s) { return s.weekId === weekId })
  var rvs = data.reviews.filter(function (r) { return r.weekId === weekId })

  return data.rooms.map(function (room) {
    var sub = null
    for (var i = 0; i < subs.length; i++) {
      if (subs[i].roomId === room.id) { sub = subs[i]; break }
    }
    var myReviews = rvs.filter(function (r) { return r.roomId === room.id })
    var mutualRows = myReviews.filter(function (r) { return r.kind === 'mutual' })
    var inspectRows = myReviews.filter(function (r) { return r.kind === 'inspect' })

    var dims = avgDims(myReviews)
    var total = sumDims(dims)

    // 互评四档：优秀 / 良好 / 中等 / 合格（不打分，只统计档位占比）
    var lv = { excellent: 0, good: 0, medium: 0, pass: 0 }
    mutualRows.forEach(function (r) { if (lv[r.mutual] !== undefined) lv[r.mutual]++ })
    var mutualCount = mutualRows.length
    var excellentRate = mutualCount ? lv.excellent / mutualCount : 0
    var goodRate = mutualCount ? (lv.excellent + lv.good) / mutualCount : 0
    var mediumRate = mutualCount ? (lv.excellent + lv.good + lv.medium) / mutualCount : 0

    var mutualResult = ''
    if (mutualCount > 0) {
      if (excellentRate >= RULES.STAR_EXCELLENT_RATE) mutualResult = 'excellent'
      else if (goodRate >= RULES.STAR_EXCELLENT_RATE) mutualResult = 'good'
      else if (mediumRate >= RULES.STAR_EXCELLENT_RATE) mutualResult = 'medium'
      else mutualResult = 'pass'
    }

    // 抽查评级取最新一条现场抽查记录
    var grade = ''
    if (inspectRows.length) {
      var latest = inspectRows.slice().sort(function (a, b) { return b.createdAt - a.createdAt })[0]
      grade = latest.grade || ''
    }

    var violations = []
    if (countable) {
      if (!sub) violations.push({ type: 'nophoto', text: '未按时上传卫生照片' })
      else if (sub.status === 'invalid') violations.push({ type: 'badphoto', text: '照片不合格 / 虚假拍照' })
      // 互评最低档「合格」计 1 次违规（旧方案为「不合格」，新方案四档最低档即合格）
      if (mutualResult === 'pass') violations.push({ type: 'mutual', text: '单周互评结果为合格（最低档）' })
      if (['C', 'D', 'E'].indexOf(grade) >= 0) violations.push({ type: 'grade', text: '现场抽查评级 ' + grade + ' 级' })
    }

    return {
      roomId: room.id,
      roomName: room.name,
      submitted: !!sub,
      submission: sub,
      reviewCount: myReviews.length,
      mutualCount: mutualCount,
      inspectCount: inspectRows.length,
      dims: dims,
      total: total,
      grade: grade,
      excellentRate: excellentRate,
      excellentRateText: mutualCount ? Math.round(excellentRate * 100) + '%' : '未互评',
      mutual: mutualResult,
      mutualText: mutualName(mutualResult),
      isCandidate: mutualResult === 'excellent' && grade === 'A',
      violations: violations
    }
  })
}

/**
 * 学年（累计）总览：多维度均分、达标周数、违规记录、焕新之星
 * @param {object} data
 * @param {Array} weeks [{id,...}] 由新到旧
 */
function buildOverview(data, weeks) {
  var weekMap = {}
  var rooms = data.rooms.map(function (r) {
    return {
      id: r.id,
      name: r.name,
      building: r.building,
      room: r.room,
      weekList: [],
      excellentWeeks: 0,
      gradedWeeks: 0,
      totalSum: 0,
      dimsSum: {},
      violations: []
    }
  })
  RULES.DIMENSIONS.forEach(function (d) {
    rooms.forEach(function (r) { r.dimsSum[d.key] = 0 })
  })

  weeks.forEach(function (wk) {
    var rvs = data.reviews.filter(function (r) { return r.weekId === wk.id })
    var countable = rvs.length > 0
    var list = buildWeekStats(data, wk.id, countable)
    weekMap[wk.id] = list
    list.forEach(function (ws, idx) {
      var r = rooms[idx]
      r.weekList.push({ weekId: wk.id, label: wk.label, total: ws.total, grade: ws.grade, mutual: ws.mutual, isCandidate: ws.isCandidate })
      if (countable) {
        r.gradedWeeks += 1
        r.totalSum += ws.total
        RULES.DIMENSIONS.forEach(function (d) { r.dimsSum[d.key] += ws.dims[d.key] })
        if (ws.isCandidate) r.excellentWeeks += 1
        ws.violations.forEach(function (v) {
          r.violations.push({ weekId: wk.id, label: wk.label, type: v.type, text: v.text })
        })
      }
    })
  })

  rooms.forEach(function (r) {
    r.avgTotal = r.gradedWeeks ? Math.round((r.totalSum / r.gradedWeeks) * 10) / 10 : 0
    r.dims = {}
    RULES.DIMENSIONS.forEach(function (d) {
      r.dims[d.key] = r.gradedWeeks ? Math.round((r.dimsSum[d.key] / r.gradedWeeks) * 10) / 10 : 0
    })
    r.dimsList = toDimsList(r.dims)
    r.violationCount = r.violations.length
    r.isPunished = r.violationCount >= RULES.VIOLATION_LIMIT
    r.isWarn = r.violationCount > 0 && r.violationCount < RULES.VIOLATION_LIMIT
    r.isCandidate = r.excellentWeeks > 0 && r.violationCount === 0
    // 最近一周的评级，用于列表徽标
    var latest = r.weekList.filter(function (w) { return w.grade })[0]
    r.latestGrade = latest ? latest.grade : ''
  })

  // 焕新之星：无违规 + 累计达标次数排名靠前
  var candidates = rooms.filter(function (r) { return r.isCandidate })
  candidates.sort(function (a, b) {
    if (b.excellentWeeks !== a.excellentWeeks) return b.excellentWeeks - a.excellentWeeks
    return b.avgTotal - a.avgTotal
  })
  candidates.slice(0, 3).forEach(function (r, i) {
    r.isStar = true
    r.starRank = i + 1
  })

  rooms.sort(function (a, b) {
    if (a.violationCount !== b.violationCount) return a.violationCount - b.violationCount
    if (b.excellentWeeks !== a.excellentWeeks) return b.excellentWeeks - a.excellentWeeks
    return b.avgTotal - a.avgTotal
  })

  return {
    rooms: rooms,
    weekMap: weekMap,
    candidates: candidates,
    starRooms: candidates.filter(function (r) { return r.isStar }),
    punished: rooms.filter(function (r) { return r.isPunished }),
    warned: rooms.filter(function (r) { return r.isWarn })
  }
}

module.exports = {
  toDimsList: toDimsList,
  avgDims: avgDims,
  sumDims: sumDims,
  buildWeekStats: buildWeekStats,
  buildOverview: buildOverview
}
