// pages/upload/upload.js —— 寝室长上传打扫后照片（需求二）
const RULES = require('../../utils/rules.js')
const util = require('../../utils/util.js')
const store = require('../../utils/store.js')

Page({
  data: {
    weeks: [],
    weekIndex: 0,
    weekId: '',
    slots: [],
    profile: {},
    room: null,
    roomName: '',
    canSubmit: false,
    uploadWindow: false,
    myList: [],
    nameFormat: '',
    hasPermission: true
  },

  onShow() {
    const weeks = util.recentWeeks(5)
    const profile = store.getProfile()
    const room = profile.roomId ? store.getRoom(profile.roomId) : null
    const weekId = weeks[0].id
    const rolesCanUpload = ['leader', 'admin']

    // 初始化三个照片位
    const oldPaths = {}
    this.data.slots.forEach(function (s) { if (s.path) oldPaths[s.key] = s.path })

    const slots = RULES.PHOTO_SLOTS.map(function (s) {
      return {
        key: s.key,
        no: s.no,
        name: s.name,
        desc: s.desc,
        path: oldPaths[s.key] || ''
      }
    })

    this.setData({
      weeks: weeks,
      weekId: weekId,
      slots: slots,
      profile: profile,
      room: room,
      roomName: room ? room.name : '',
      nameFormat: room ? room.name : '未设置寝室',
      uploadWindow: util.isUploadWindow(Date.now()),
      hasPermission: rolesCanUpload.indexOf(profile.role) >= 0,
      filledCount: slots.filter(function (s) { return !!s.path }).length,
      canSubmit: false
    })

    this.refreshList()
  },

  // 周次切换
  onWeekChange(e) {
    const idx = Number(e.detail.value)
    this.setData({
      weekIndex: idx,
      weekId: this.data.weeks[idx].id
    })
    this.refreshList()
  },

  // 选择照片：只允许现场拍摄，不能从相册选（防止交旧照片充数）
  choosePhoto(e) {
    const key = e.currentTarget.dataset.key
    const self = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'], // 仅拍照，不提供相册入口
      sizeType: ['compressed'], // 压缩，避免超过本地文件 10MB 限制
      success(res) {
        const temp = res.tempFiles[0].tempFilePath
        let saved = ''
        try {
          saved = store.savePhotoFile(temp)
        } catch (err) {
          // 真机/工具环境差异时，退化为直接使用临时路径
          saved = temp
        }
        const slots = self.data.slots.map(function (s) {
          if (s.key !== key) return s
          if (s.path) store.removePhotoFile(s.path)
          return Object.assign({}, s, { path: saved })
        })
        self.setData({ slots: slots })
        self.updateCanSubmit()
        wx.showToast({ title: '已添加', icon: 'success' })
      }
    })
  },

  removePhoto(e) {
    const key = e.currentTarget.dataset.key
    const slots = this.data.slots.map(function (s) {
      if (s.key !== key) return s
      store.removePhotoFile(s.path)
      return Object.assign({}, s, { path: '' })
    })
    this.setData({ slots: slots })
    this.updateCanSubmit()
  },

  previewPhoto(e) {
    const url = e.currentTarget.dataset.url
    const urls = this.data.slots.filter(function (s) { return s.path }).map(function (s) { return s.path })
    wx.previewImage({ current: url, urls: urls })
  },

  updateCanSubmit() {
    const filled = this.data.slots.filter(function (s) { return !!s.path }).length
    this.setData({
      filledCount: filled,
      canSubmit: filled === 3 && !!this.data.room && this.data.hasPermission
    })
  },

  // 提交本周照片
  submit() {
    if (!this.data.room) {
      wx.showToast({ title: '请先到「我的」绑定寝室', icon: 'none' })
      return
    }
    const missing = this.data.slots.filter(function (s) { return !s.path })
    if (missing.length) {
      wx.showToast({ title: '还差 ' + missing.length + ' 张照片', icon: 'none' })
      return
    }

    const now = Date.now()
    const photos = this.data.slots.map(function (s) {
      return { slot: s.key, path: s.path }
    })

    // 同一周同一寝室只允许一条记录，重复提交则覆盖
    const exist = store.getSubmissions({ weekId: this.data.weekId, roomId: this.data.room.id })
    if (exist.length) store.removeSubmission(exist[0].id)

    store.addSubmission({
      id: util.genId('sb'),
      roomId: this.data.room.id,
      weekId: this.data.weekId,
      photos: photos,
      createdAt: now,
      late: !util.isUploadWindow(now),
      status: 'pending',
      note: ''
    })

    // 清空照片位
    this.setData({
      slots: this.data.slots.map(function (s) { return Object.assign({}, s, { path: '' }) })
    })
    this.updateCanSubmit()
    this.refreshList()

    wx.showModal({
      title: '提交成功',
      content: '命名：' + this.data.room.name + '（' + this.data.weeks[this.data.weekIndex].label + '）' +
        (this.data.uploadWindow ? '' : '\n注意：当前不在规定上传时间窗内，将标记为「逾期」'),
      showCancel: false,
      confirmText: '好的'
    })
  },

  refreshList() {
    const profile = store.getProfile()
    const roomId = profile.roomId
    if (!roomId) {
      this.setData({ myList: [] })
      return
    }
    const weeks = this.data.weeks
    const list = store.getSubmissions({ roomId: roomId }).map(function (s) {
      const wk = weeks.filter(function (w) { return w.id === s.weekId })[0]
      const reviews = store.getReviews({ weekId: s.weekId, roomId: roomId })
      let statusText = '待评定'
      let statusTag = 'gray'
      if (s.status === 'invalid') { statusText = '照片不合格'; statusTag = 'red' }
      else if (reviews.length) {
        const bad = reviews.some(function (r) { return ['D', 'E'].indexOf(r.grade) >= 0 })
        statusText = bad ? '需整改' : '已评分'
        statusTag = bad ? 'red' : 'green'
      }
      return {
        id: s.id,
        weekLabel: wk ? wk.label : s.weekId,
        timeText: util.formatTime(s.createdAt, true),
        late: s.late,
        photos: s.photos,
        photoCount: s.photos.length,
        statusText: statusText,
        statusTag: statusTag
      }
    }).sort(function (a, b) { return b.timeText < a.timeText ? -1 : 1 })

    this.setData({ myList: list })
  },

  previewRecordPhoto(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({ current: url, urls: [url] })
  },

  deleteRecord(e) {
    const id = e.currentTarget.dataset.id
    const self = this
    wx.showModal({
      title: '删除这条提交？',
      content: '照片文件也会一并删除，删除后需重新上传。',
      success(res) {
        if (res.confirm) {
          store.removeSubmission(id)
          self.refreshList()
          wx.showToast({ title: '已删除' })
        }
      }
    })
  },

  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' })
  },

  goRules() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
