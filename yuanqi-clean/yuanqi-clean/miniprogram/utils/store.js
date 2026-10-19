/**
 * store.js —— 本地数据层
 * ---------------------------------------------------------------
 * 学习阶段用「微信本地缓存 + 本地文件系统」模拟后端：
 *   · 业务数据  → wx.setStorageSync  (上限 10MB)
 *   · 照片文件  → wx.env.USER_DATA_PATH 本地文件 (上限 200MB)
 *
 * 【后续接云开发的改法】
 *   把下面每个 getXxx / addXxx 换成 wx.cloud.database().collection(...) 调用即可，
 *   页面层完全不用改，因为页面只依赖这里暴露的方法名。
 * ---------------------------------------------------------------
 */
const util = require('./util.js')
const RULES = require('./rules.js')

const DATA_KEY = 'yuanqi_data_v3' // v3：角色精简为寝室长/生活部/管理员，互评改四档不打分
const PHOTO_DIR = wx.env.USER_DATA_PATH + '/yuanqi_photos'

const fs = wx.getFileSystemManager()

/* ============ 内部：读写 ============ */

function emptyData() {
  return {
    rooms: [],
    submissions: [],
    reviews: [],
    raters: [],
    profile: { name: '', role: 'leader', roomId: '' },
    meta: { seeded: false, updatedAt: 0 }
  }
}

function read() {
  var d = wx.getStorageSync(DATA_KEY)
  if (!d || typeof d !== 'object') return emptyData()
  // 兼容旧版本缺字段
  var base = emptyData()
  Object.keys(base).forEach(function (k) {
    if (d[k] === undefined) d[k] = base[k]
  })
  return d
}

function write(data) {
  data.meta.updatedAt = Date.now()
  wx.setStorageSync(DATA_KEY, data)
  return data
}

/* ============ 内部：演示数据 ============ */

function splitDims(total) {
  var base = Math.floor(total / 5)
  var rest = total - base * 5
  var arr = [base, base, base, base, base]
  for (var i = 0; i < rest; i++) arr[i]++
  return { ground: arr[0], desk: arr[1], items: arr[2], sink: arr[3], whole: arr[4] }
}

function makeReview(weekId, roomId, total, raterName, raterRole, kind, mutual) {
  // 交叉互评只评档位、不打分：不写入维度分与总分
  var isMutual = kind === 'mutual'
  return {
    id: util.genId('rv'),
    weekId: weekId,
    roomId: roomId,
    raterName: raterName,
    raterRole: raterRole,
    kind: kind,
    dims: isMutual ? null : splitDims(total),
    total: isMutual ? 0 : total,
    grade: isMutual ? '' : gradeOf(total),
    mutual: mutual || '',
    remark: '',
    createdAt: Date.now()
  }
}

function gradeOf(total) {
  for (var i = 0; i < RULES.GRADE_RULES.length; i++) {
    if (total >= RULES.GRADE_RULES[i].min) return RULES.GRADE_RULES[i].grade
  }
  return 'E'
}

// 演示矩阵：6 间寝室 × 过去 4 周 的抽查总分
const DEMO_ROOMS = [
  { id: 'rm_1', building: 'B8', room: '888' },
  { id: 'rm_2', building: 'B8', room: '612' },
  { id: 'rm_3', building: 'B9', room: '305' },
  { id: 'rm_4', building: 'B9', room: '412' },
  { id: 'rm_5', building: 'B8', room: '721' },
  { id: 'rm_6', building: 'B9', room: '518' }
]

const DEMO_TOTALS = [
  [96, 94, 97, 95],
  [93, 89, 92, 90],
  [91, 86, 88, 90],
  [84, 83, 85, 82],
  [79, 78, 80, 77],
  [72, 70, 74, 71]
]

// 两位生活部评委给出的互评档位：优秀 / 良好 / 中等 / 合格
const DEMO_MUTUAL = [
  ['excellent', 'excellent'],
  ['excellent', 'excellent'],
  ['excellent', 'excellent'],
  ['good', 'good'],
  ['medium', 'medium'],
  ['pass', 'pass']
]

function buildDemo(weeks) {
  var data = emptyData()
  data.rooms = DEMO_ROOMS.map(function (r) {
    return {
      id: r.id,
      building: r.building,
      room: r.room,
      name: r.building + '-' + r.room
    }
  })
  data.raters = [
    { id: util.genId('rt'), name: '刘老师', role: 'admin', enabled: true },
    { id: util.genId('rt'), name: '张老师', role: 'admin', enabled: true },
    { id: util.genId('rt'), name: '李同学', role: 'life', enabled: true },
    { id: util.genId('rt'), name: '王同学', role: 'life', enabled: true }
  ]
  data.profile = { name: '寝室长小明', role: 'leader', roomId: 'rm_1' }

  // weeks: 最近 5 周（含本周）；前 4 周造历史，本周留白供实操
  var history = weeks.slice(1) // 由新到旧
  for (var wi = 0; wi < history.length; wi++) {
    var wk = history[wi]
    var ti = history.length - 1 - wi // 让最早的一周对应矩阵第 0 列
    for (var ri = 0; ri < data.rooms.length; ri++) {
      var room = data.rooms[ri]
      var total = DEMO_TOTALS[ri][ti]
      data.reviews.push(makeReview(wk.id, room.id, total, '张老师', 'admin', 'inspect', ''))
      data.reviews.push(makeReview(wk.id, room.id, Math.min(100, total + 1), '李同学', 'life', 'mutual', DEMO_MUTUAL[ri][0]))
      data.reviews.push(makeReview(wk.id, room.id, Math.max(0, total - 2), '王同学', 'life', 'mutual', DEMO_MUTUAL[ri][1]))
      // 最后一周（最近的历史周）里，B9-518 未上传照片 → 违规 1 次
      if (!(wi === 0 && ri === 5)) {
        data.submissions.push({
          id: util.genId('sb'),
          roomId: room.id,
          weekId: wk.id,
          photos: [],
          createdAt: wk.monday + 6 * 86400000 + 22 * 3600000,
          late: false,
          status: 'pending',
          note: ''
        })
      }
    }
  }
  data.meta.seeded = true
  return data
}

/* ============ 对外：初始化 ============ */

function init() {
  var data = read()
  if (!data.meta.seeded) {
    var weeks = util.recentWeeks(5)
    data = buildDemo(weeks)
    write(data)
  }
  return data
}

function getData() {
  return read()
}

/* ============ 对外：照片文件 ============ */

function savePhotoFile(tempPath) {
  try {
    fs.accessSync(PHOTO_DIR)
  } catch (e) {
    fs.mkdirSync(PHOTO_DIR, true)
  }
  var ext = (tempPath.split('.').pop() || 'jpg').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].indexOf(ext) < 0) ext = 'jpg'
  var dest = PHOTO_DIR + '/' + util.genId('p') + '.' + ext
  fs.saveFileSync(tempPath, dest)
  return dest
}

function removePhotoFile(path) {
  if (!path) return
  try {
    fs.unlinkSync(path)
  } catch (e) {}
}

/* ============ 对外：寝室 ============ */

function getRooms() {
  return read().rooms
}

function getRoom(id) {
  var rooms = read().rooms
  for (var i = 0; i < rooms.length; i++) {
    if (rooms[i].id === id) return rooms[i]
  }
  return null
}

function addRoom(building, room) {
  var data = read()
  var name = building + '-' + room
  for (var i = 0; i < data.rooms.length; i++) {
    if (data.rooms[i].name === name) return { ok: false, msg: '该寝室已存在' }
  }
  var item = { id: util.genId('rm'), building: building, room: room, name: name }
  data.rooms.push(item)
  write(data)
  return { ok: true, room: item }
}

function removeRoom(id) {
  var data = read()
  data.rooms = data.rooms.filter(function (r) { return r.id !== id })
  data.submissions = data.submissions.filter(function (s) { return s.roomId !== id })
  data.reviews = data.reviews.filter(function (r) { return r.roomId !== id })
  if (data.profile.roomId === id) data.profile.roomId = ''
  write(data)
}

/* ============ 对外：提交记录 ============ */

function getSubmissions(opt) {
  opt = opt || {}
  var list = read().submissions
  if (opt.weekId) list = list.filter(function (s) { return s.weekId === opt.weekId })
  if (opt.roomId) list = list.filter(function (s) { return s.roomId === opt.roomId })
  return list
}

function addSubmission(item) {
  var data = read()
  data.submissions.push(item)
  write(data)
  return item
}

function removeSubmission(id) {
  var data = read()
  var target = null
  data.submissions = data.submissions.filter(function (s) {
    if (s.id === id) { target = s; return false }
    return true
  })
  if (target && target.photos) {
    target.photos.forEach(function (p) { removePhotoFile(p.path) })
  }
  write(data)
}

function setSubmissionStatus(id, status, note) {
  var data = read()
  data.submissions.forEach(function (s) {
    if (s.id === id) {
      s.status = status
      s.note = note || ''
    }
  })
  write(data)
}

/* ============ 对外：评分记录 ============ */

function getReviews(opt) {
  opt = opt || {}
  var list = read().reviews
  if (opt.weekId) list = list.filter(function (r) { return r.weekId === opt.weekId })
  if (opt.roomId) list = list.filter(function (r) { return r.roomId === opt.roomId })
  if (opt.kind) list = list.filter(function (r) { return r.kind === opt.kind })
  return list
}

function addReview(item) {
  var data = read()
  data.reviews.push(item)
  write(data)
  return item
}

function removeReview(id) {
  var data = read()
  data.reviews = data.reviews.filter(function (r) { return r.id !== id })
  write(data)
}

/* ============ 对外：评委名单（权限可配置） ============ */

function getRaters() {
  return read().raters
}

function addRater(name, role) {
  var data = read()
  data.raters.push({ id: util.genId('rt'), name: name, role: role, enabled: true })
  write(data)
}

function removeRater(id) {
  var data = read()
  data.raters = data.raters.filter(function (r) { return r.id !== id })
  write(data)
}

function toggleRater(id) {
  var data = read()
  data.raters.forEach(function (r) {
    if (r.id === id) r.enabled = !r.enabled
  })
  write(data)
}

/* ============ 对外：我的身份 ============ */

function getProfile() {
  return read().profile
}

function setProfile(patch) {
  var data = read()
  Object.keys(patch).forEach(function (k) {
    data.profile[k] = patch[k]
  })
  write(data)
  return data.profile
}

/* ============ 对外：数据管理 ============ */

function clearBusinessData() {
  var data = read()
  data.submissions.forEach(function (s) {
    if (s.photos) s.photos.forEach(function (p) { removePhotoFile(p.path) })
  })
  data.submissions = []
  data.reviews = []
  write(data)
}

function loadDemoData() {
  clearBusinessData()
  var weeks = util.recentWeeks(5)
  var fresh = buildDemo(weeks)
  write(fresh)
  return fresh
}

module.exports = {
  init: init,
  getData: getData,
  gradeOf: gradeOf,
  savePhotoFile: savePhotoFile,
  removePhotoFile: removePhotoFile,
  getRooms: getRooms,
  getRoom: getRoom,
  addRoom: addRoom,
  removeRoom: removeRoom,
  getSubmissions: getSubmissions,
  addSubmission: addSubmission,
  removeSubmission: removeSubmission,
  setSubmissionStatus: setSubmissionStatus,
  getReviews: getReviews,
  addReview: addReview,
  removeReview: removeReview,
  getRaters: getRaters,
  addRater: addRater,
  removeRater: removeRater,
  toggleRater: toggleRater,
  getProfile: getProfile,
  setProfile: setProfile,
  clearBusinessData: clearBusinessData,
  loadDemoData: loadDemoData
}
