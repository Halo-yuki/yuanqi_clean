// pages/score/score.js —— 指定评委分项评分（需求三 + 需求四）
const RULES = require('../../utils/rules.js')
const util = require('../../utils/util.js')
const store = require('../../utils/store.js')

const DEFAULT_DIM = 16 // 每个维度的默认分值（总分 80，对应 B 级）

// 互评档位 key → 中文名
function mutualName(key) {
  for (var i = 0; i < RULES.MUTUAL_OPTIONS.length; i++) {
    if (RULES.MUTUAL_OPTIONS[i].key === key) return RULES.MUTUAL_OPTIONS[i].name
  }
  return '未评'
}

Page({
  data: {
    weeks: [],
    weekIndex: 0,
    weekId: '',
    profile: {},
    mutualOptions: RULES.MUTUAL_OPTIONS,
    gradeRules: RULES.GRADE_RULES,
    roleText: '',
    canReview: false,
    kind: 'mutual',
    kindText: '',
    pendingList: [],
    gradedCount: 0,
    totalRooms: 0,
    panel: {
      show: false,
      roomId: '',
      roomName: '',
      submissionId: '',
      photos: [],
      dims: {},
      dimList: [],
      total: 0,
      grade: '',
      gradeLabel: '',
      gradeColor: 'green',
      mutual: '',
      remark: '',
      editingId: '',
      kindChoose: 'mutual',
      isAdmin: false
    },
    panelIndex: -1
  },

  onShow() {
    const weeks = util.recentWeeks(5)
    const profile = store.getProfile()
    const roles = RULES.ROLES
    let roleText = ''
    roles.forEach(function (r) { if (r.key === profile.role) roleText = r.name })

    // 只有「管理员 / 生活部」可以评分；寝室长看不到评分内容
    let kind = ''
    if (profile.role === 'life') kind = 'mutual'
    else if (profile.role === 'admin') kind = 'both'
    const canReview = !!kind
    const kindText = kind === 'mutual'
      ? '交叉互评（优秀 / 良好 / 中等 / 合格 · 不打分）'
      : (kind === 'both' ? '现场抽查打分 + 交叉互评' : '无评分权限')

    this.setData({
      weeks: weeks,
      profile: profile,
      roleText: roleText,
      canReview: canReview,
      kind: kind,
      kindText: kindText
    })
    this.refreshList()
  },

  onWeekChange(e) {
    const idx = Number(e.detail.value)
    this.setData({ weekIndex: idx, weekId: this.data.weeks[idx].id })
    this.refreshList()
  },

  refreshList() {
    const weekId = this.data.weeks[this.data.weekIndex].id
    const data = store.getData()
    const profile = this.data.profile
    const subs = store.getSubmissions({ weekId })
    const reviews = store.getReviews({ weekId })

    const list = data.rooms.map(function (room) {
      const sub = subs.filter(function (s) { return s.roomId === room.id })[0]
      const mine = reviews.filter(function (r) {
        return r.roomId === room.id && r.raterName === profile.name
      })[0]
      return {
        roomId: room.id,
        roomName: room.name,
        submissionId: sub ? sub.id : '',
        submitted: !!sub,
        photoCount: sub ? sub.photos.length : 0,
        photos: sub ? sub.photos : [],
        submitText: sub ? util.formatTime(sub.createdAt, true) : '未提交',
        invalid: sub ? sub.status === 'invalid' : false,
        myReviewId: mine ? mine.id : '',
        myTotal: mine ? mine.total : 0,
        mutual: mine ? mine.mutual : '',
        grade: mine ? mine.grade : '',
        statusText: !sub ? '未提交照片'
          : (mine ? (mine.kind === 'mutual' ? ('互评 ' + mutualName(mine.mutual)) : (mine.total + ' 分')) : '待评分'),
        statusTag: !sub ? 'red' : (mine ? 'green' : 'gray'),
        // 本寝室被其他评委评过的次数
        otherCount: reviews.filter(function (r) { return r.roomId === room.id && r.raterName !== profile.name }).length
      }
    })

    this.setData({
      weekId: weekId,
      pendingList: list,
      totalRooms: list.length,
      gradedCount: list.filter(function (r) { return !!r.myReviewId }).length
    })
  },

  /* ================= 评分面板 ================= */

  openPanel(e) {
    if (!this.data.canReview) return
    const idx = Number(e.currentTarget.dataset.index)
    const item = this.data.pendingList[idx]
    const profile = this.data.profile

    let dims = {}
    RULES.DIMENSIONS.forEach(function (d) { dims[d.key] = DEFAULT_DIM })

    let mutual = ''
    let remark = ''
    let editingId = ''
    const reviews = store.getReviews({ weekId: this.data.weekId, roomId: item.roomId })
    const mine = reviews.filter(function (r) { return r.raterName === profile.name })[0]
    if (mine) {
      dims = Object.assign({}, dims, mine.dims)
      mutual = mine.mutual || ''
      remark = mine.remark || ''
      editingId = mine.id
    }

    // 生活部只做互评；管理员默认现场抽查，可自行切换
    const kindChoose = profile.role === 'admin' ? (mine ? mine.kind : 'inspect') : 'mutual'

    this.setData({
      panelIndex: idx,
      'panel.show': true,
      'panel.kindChoose': kindChoose,
      'panel.isAdmin': profile.role === 'admin',
      'panel.roomId': item.roomId,
      'panel.roomName': item.roomName,
      'panel.submissionId': item.submissionId,
      'panel.photos': item.photos,
      'panel.dims': dims,
      'panel.mutual': mutual,
      'panel.remark': remark,
      'panel.editingId': editingId
    })
    this.recalc()
  },

  closePanel() {
    this.setData({ 'panel.show': false, panelIndex: -1 })
  },

  onSlider(e) {
    const key = e.currentTarget.dataset.key
    const val = Number(e.detail.value)
    const dims = Object.assign({}, this.data.panel.dims)
    dims[key] = val
    this.setData({ 'panel.dims': dims })
    this.recalc()
  },

  recalc() {
    const dims = this.data.panel.dims
    let total = 0
    RULES.DIMENSIONS.forEach(function (d) { total += dims[d.key] || 0 })
    const grade = store.gradeOf(total)
    let gradeLabel = ''
    let gradeColor = 'green'
    RULES.GRADE_RULES.forEach(function (g) {
      if (g.grade === grade) { gradeLabel = g.label; gradeColor = g.color }
    })
    const dimList = RULES.DIMENSIONS.map(function (d) {
      const v = dims[d.key] || 0
      return {
        key: d.key,
        name: d.name,
        desc: d.desc,
        max: d.max,
        value: v,
        percent: Math.round((v / d.max) * 100)
      }
    })
    this.setData({
      'panel.dimList': dimList,
      'panel.total': total,
      'panel.grade': grade,
      'panel.gradeLabel': gradeLabel,
      'panel.gradeColor': gradeColor
    })
  },

  pickMutual(e) {
    this.setData({ 'panel.mutual': e.currentTarget.dataset.key })
  },

  switchKind(e) {
    this.setData({ 'panel.kindChoose': e.currentTarget.dataset.key })
  },

  pickGrade(e) {
    // 现场抽查时也可直接点选最终评级
    const g = e.currentTarget.dataset.key
    const dims = {}
    const per = Math.floor(RULES.GRADE_RULES.filter(function (x) { return x.grade === g })[0].min / 5)
    RULES.DIMENSIONS.forEach(function (d) { dims[d.key] = per })
    this.setData({ 'panel.dims': dims })
    this.recalc()
  },

  onRemark(e) {
    this.setData({ 'panel.remark': e.detail.value })
  },

  previewPhoto(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({ current: url, urls: this.data.panel.photos.map(function (p) { return p.path }) })
  },

  // 标记该寝室的照片不合格（对应处罚规则第一条）
  markInvalid() {
    const self = this
    if (!this.data.panel.submissionId) {
      wx.showToast({ title: '该寝室本周未提交照片', icon: 'none' })
      return
    }
    wx.showModal({
      title: '标记照片不合格',
      content: '确认将 ' + this.data.panel.roomName + ' 本周照片标记为不合格？该寝室将累计 1 次违规。',
      success(res) {
        if (res.confirm) {
          store.setSubmissionStatus(self.data.panel.submissionId, 'invalid', '评委判定：照片不合格 / 虚假拍照')
          wx.showToast({ title: '已标记', icon: 'success' })
          self.refreshList()
        }
      }
    })
  },

  // 保存评分
  saveReview() {
    const p = this.data.panel
    const profile = this.data.profile
    const kind = p.kindChoose || (profile.role === 'admin' ? 'inspect' : 'mutual')

    if (kind === 'mutual' && !p.mutual) {
      wx.showToast({ title: '请选择互评结论', icon: 'none' })
      return
    }

    // 互评优秀占比不得超过所评寝室总数的 2/3
    if (kind === 'mutual' && p.mutual === 'excellent') {
      const weekReviews = store.getReviews({ weekId: this.data.weekId }).filter(function (r) {
        return r.kind === 'mutual' && r.raterName === profile.name && r.id !== p.editingId
      })
      const totalRated = weekReviews.length + 1
      const excellent = weekReviews.filter(function (r) { return r.mutual === 'excellent' }).length + 1
      if (excellent > Math.floor(totalRated * RULES.MUTUAL_EXCELLENT_LIMIT)) {
        wx.showModal({
          title: '超出优秀占比上限',
          content: '互评中「优秀」占比不得超过所评寝室总数的 2/3（当前 ' + excellent + '/' + totalRated + '）。请改为「良好 / 中等 / 合格」或先评更多寝室。',
          showCancel: false
        })
        return
      }
    }

    if (p.editingId) store.removeReview(p.editingId)

    store.addReview({
      id: util.genId('rv'),
      weekId: this.data.weekId,
      roomId: p.roomId,
      raterName: profile.name,
      raterRole: profile.role,
      kind: kind,
      // 互评只存档位，不存分数
      dims: kind === 'mutual' ? null : p.dims,
      total: kind === 'mutual' ? 0 : p.total,
      grade: kind === 'mutual' ? '' : p.grade,
      mutual: kind === 'mutual' ? p.mutual : '',
      remark: p.remark,
      createdAt: Date.now()
    })

    this.setData({ 'panel.show': false, panelIndex: -1 })
    this.refreshList()
    wx.showToast({ title: '评分已保存', icon: 'success' })
  },

  deleteReview() {
    const self = this
    if (!this.data.panel.editingId) return
    wx.showModal({
      title: '删除评分记录？',
      content: '删除后该寝室本周将回到「待评分」状态。',
      success(res) {
        if (res.confirm) {
          store.removeReview(self.data.panel.editingId)
          self.setData({ 'panel.show': false, panelIndex: -1 })
          self.refreshList()
        }
      }
    })
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' })
  },

  // 一键体验：直接切换为名单中第一个可用评委
  quickUseRater() {
    const list = store.getRaters().filter(function (r) { return r.enabled })
    if (!list.length) {
      wx.showToast({ title: '请先在「我的」添加评委', icon: 'none' })
      return
    }
    const rater = list[0]
    store.setProfile({ role: rater.role, name: rater.name, roomId: '' })
    this.onShow()
    wx.showToast({ title: '已切换为 ' + rater.name, icon: 'success' })
  }
})
