// pages/index/index.js —— 首页：活动规则展示（需求一）
const RULES = require('../../utils/rules.js')
const util = require('../../utils/util.js')
const store = require('../../utils/store.js')
const stats = require('../../utils/stats.js')

Page({
  data: {
    activityName: RULES.ACTIVITY_NAME,
    academy: RULES.ACADEMY,
    versionText: RULES.VERSION_TEXT,
    sections: RULES.SECTIONS,
    phases: [
      { key: 'clean', name: '常规清扫' },
      { key: 'upload', name: '照片上传' },
      { key: 'inspect', name: '抽查核验' },
      { key: 'mutual', name: '互评开展' },
      { key: 'notice', name: '结果公示' }
    ],
    expanded: { rule: true, flow: false, photo: false, role: false, notice: false },
    phase: {},
    phaseIndex: 0,
    weekLabel: '',
    weekRange: '',
    submitCount: 0,
    roomCount: 0,
    reviewCount: 0,
    uploadWindow: false
  },

  onLoad() {
    const weeks = util.recentWeeks(5)
    const cur = weeks[0]
    this.setData({
      weekLabel: cur.label,
      weekRange: cur.range
    })
  },

  onShow() {
    const weeks = util.recentWeeks(5)
    const data = store.getData()
    const weekId = weeks[0].id
    const subs = store.getSubmissions({ weekId })
    const reviews = store.getReviews({ weekId })
    const phase = util.currentPhase()
    let phaseIndex = util.PHASE_ORDER.indexOf(phase.key)
    if (phaseIndex < 0) phaseIndex = 4

    this.setData({
      phase: phase,
      phaseIndex: phaseIndex,
      submitCount: subs.length,
      roomCount: data.rooms.length,
      reviewCount: reviews.length,
      uploadWindow: util.isUploadWindow(Date.now())
    })
  },

  // 卡片展开 / 收起
  toggle(e) {
    const id = e.currentTarget.dataset.id
    const key = 'expanded.' + id
    this.setData({ [key]: !this.data.expanded[id] })
  },

  goUpload() {
    wx.switchTab({ url: '/pages/upload/upload' })
  },

  goScore() {
    wx.switchTab({ url: '/pages/score/score' })
  },

  goRank() {
    wx.switchTab({ url: '/pages/rank/rank' })
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' })
  },

  onShareAppMessage() {
    return {
      title: RULES.ACTIVITY_NAME + ' · ' + RULES.ACADEMY,
      path: '/pages/index/index'
    }
  }
})
