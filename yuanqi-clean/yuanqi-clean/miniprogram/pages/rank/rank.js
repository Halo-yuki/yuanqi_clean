// pages/rank/rank.js —— 首页：本周卫生成果照片 + 焕新之星 + 得分榜
const RULES = require('../../utils/rules.js')
const util = require('../../utils/util.js')
const store = require('../../utils/store.js')
const stats = require('../../utils/stats.js')

Page({
  data: {
    weeks: [],
    weekIndex: 0,
    weekId: '',
    weekLabel: '',
    starList: [],
    candList: [],
    weekRows: [],
    punishedList: [],
    warnedList: [],
    starEmpty: true,
    photoWall: [],
    canSeeViolation: false,
    myViolation: null,
    summary: { rooms: 0, submitted: 0, graded: 0 }
  },

  onShow() {
    const weeks = util.recentWeeks(5)
    this.setData({ weeks: weeks })
    this.refresh()
  },

  onWeekChange(e) {
    const idx = Number(e.detail.value)
    this.setData({ weekIndex: idx })
    this.refresh()
  },

  refresh() {
    const weeks = this.data.weeks
    const week = weeks[this.data.weekIndex]
    const weekId = week.id
    const data = store.getData()
    const profile = store.getProfile()
    const overview = stats.buildOverview(data, weeks)
    const subs = store.getSubmissions({ weekId })

    // 违规名单只对管理员 / 生活部公开
    const canSeeViolation = profile.role === 'admin' || profile.role === 'life'

    // 焕新之星：不排名次、不展示分数，只展示寝室与本周照片
    const starList = overview.starRooms.map(function (r) {
      const sub = subs.filter(function (s) { return s.roomId === r.id })[0]
      return {
        id: r.id,
        name: r.name,
        excellentWeeks: r.excellentWeeks,
        photos: sub && sub.photos ? sub.photos : []
      }
    })

    // 月度候选（已达标但未进入焕新之星）
    const candList = overview.candidates.filter(function (r) { return !r.isStar }).map(function (r) {
      return {
        id: r.id,
        name: r.name,
        excellentWeeks: r.excellentWeeks,
        avgTotal: r.avgTotal
      }
    })

    // 本周得分榜（含本周上传的照片，可展开查看五维得分）
    const rows = (overview.weekMap[weekId] || []).map(function (ws) {
      return {
        id: ws.roomId,
        name: ws.roomName,
        total: ws.total,
        grade: ws.grade,
        gradeTag: ws.grade === 'A' ? 'green' : (['C', 'D', 'E'].indexOf(ws.grade) >= 0 ? 'red' : (ws.grade ? 'warn' : 'gray')),
        gradeText: ws.grade ? ws.grade + ' 级' : '未评定',
        mutualText: ws.mutualText,
        mutualTag: ws.mutual === 'excellent' ? 'green' : (ws.mutual === 'pass' ? 'red' : 'gray'),
        excellentRateText: ws.excellentRateText,
        submitted: ws.submitted,
        isCandidate: ws.isCandidate,
        dimsList: stats.toDimsList(ws.dims),
        reviewCount: ws.reviewCount,
        photos: ws.submission && ws.submission.photos ? ws.submission.photos : [],
        // 违规提示仅管理员 / 生活部 / 本寝室自己可见
        showViolation: canSeeViolation || profile.roomId === ws.roomId,
        open: false
      }
    }).sort(function (a, b) { return b.total - a.total })

    // 本周照片墙：把所有寝室上传的照片平铺展示
    const photoWall = []
    subs.forEach(function (s) {
      if (!s.photos || !s.photos.length) return
      const room = data.rooms.filter(function (r) { return r.id === s.roomId })[0]
      s.photos.forEach(function (p) {
        photoWall.push({ roomName: room ? room.name : '未知寝室', path: p.path })
      })
    })

    const punishedList = canSeeViolation ? overview.punished.map(function (r) {
      return {
        name: r.name,
        count: r.violationCount,
        items: r.violations.map(function (v) { return v.label + '：' + v.text })
      }
    }) : []

    const warnedList = canSeeViolation ? overview.warned.map(function (r) {
      return {
        name: r.name,
        count: r.violationCount,
        items: r.violations.map(function (v) { return v.label + '：' + v.text })
      }
    }) : []

    // 本人所在寝室的违规提醒（仅本人可见，不公示）
    let myViolation = null
    if (profile.roomId) {
      const mine = overview.rooms.filter(function (r) { return r.id === profile.roomId })[0]
      if (mine && mine.violationCount > 0) {
        myViolation = {
          name: mine.name,
          count: mine.violationCount,
          items: mine.violations.map(function (v) { return v.label + '：' + v.text })
        }
      }
    }

    const weekReviews = store.getReviews({ weekId })

    this.setData({
      weekId: weekId,
      weekLabel: week.label,
      starList: starList,
      candList: candList,
      weekRows: rows,
      punishedList: punishedList,
      warnedList: warnedList,
      photoWall: photoWall,
      canSeeViolation: canSeeViolation,
      myViolation: myViolation,
      starEmpty: starList.length === 0,
      summary: {
        rooms: data.rooms.length,
        submitted: subs.length,
        graded: weekReviews.length
      }
    })
  },

  toggleRow(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const key = 'weekRows[' + idx + '].open'
    this.setData({ [key]: !this.data.weekRows[idx].open })
  },

  previewPhoto(e) {
    const url = e.currentTarget.dataset.url
    const urls = this.data.photoWall.map(function (p) { return p.path })
    wx.previewImage({ current: url, urls: urls.length ? urls : [url] })
  },

  previewRowPhoto(e) {
    const url = e.currentTarget.dataset.url
    const idx = Number(e.currentTarget.dataset.index)
    const urls = this.data.weekRows[idx].photos.map(function (p) { return p.path })
    wx.previewImage({ current: url, urls: urls })
  },

  previewStarPhoto(e) {
    const url = e.currentTarget.dataset.url
    const idx = Number(e.currentTarget.dataset.index)
    const urls = this.data.starList[idx].photos.map(function (p) { return p.path })
    wx.previewImage({ current: url, urls: urls })
  },

  goRules() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
