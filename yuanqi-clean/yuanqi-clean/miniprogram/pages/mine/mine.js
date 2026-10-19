// pages/mine/mine.js —— 身份与权限配置、名单管理、数据管理
const RULES = require('../../utils/rules.js')
const store = require('../../utils/store.js')

// 评委只有两类：生活部（交叉互评）、管理员（现场抽查打分 + 互评）
const RATER_ROLES = [
  { key: 'life', name: '生活部' },
  { key: 'admin', name: '管理员' }
]

Page({
  data: {
    profile: {},
    roles: RULES.ROLES,
    roleIndex: 0,
    roleDesc: '',
    roomNames: [],
    roomIndex: 0,
    nameInput: '',

    raterList: [],
    raterNameInput: '',
    raterRoleIndex: 0,
    raterRoles: RATER_ROLES,

    roomList: [],
    buildingInput: '',
    roomNoInput: '',

    stat: { rooms: 0, submissions: 0, reviews: 0, photos: 0 }
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const data = store.getData()
    const profile = store.getProfile()
    const roles = RULES.ROLES
    let roleIndex = 0
    let roleDesc = ''
    roles.forEach(function (r, i) {
      if (r.key === profile.role) { roleIndex = i; roleDesc = r.desc }
    })

    const roomNames = data.rooms.map(function (r) { return r.name })
    let roomIndex = 0
    data.rooms.forEach(function (r, i) {
      if (r.id === profile.roomId) roomIndex = i
    })

    let photos = 0
    data.submissions.forEach(function (s) { photos += (s.photos ? s.photos.length : 0) })

    this.setData({
      profile: profile,
      roleIndex: roleIndex,
      roleDesc: roleDesc,
      roomNames: roomNames,
      roomIndex: roomIndex,
      nameInput: profile.name,
      raterList: store.getRaters(),
      roomList: data.rooms.map(function (r) {
        return { id: r.id, name: r.name }
      }),
      stat: {
        rooms: data.rooms.length,
        submissions: data.submissions.length,
        reviews: data.reviews.length,
        photos: photos
      }
    })
  },

  /* ============ 我的身份 ============ */

  onNameInput(e) {
    this.setData({ nameInput: e.detail.value })
  },

  saveName() {
    const name = (this.data.nameInput || '').trim()
    if (!name) {
      wx.showToast({ title: '姓名不能为空', icon: 'none' })
      return
    }
    store.setProfile({ name: name })
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  onRoleChange(e) {
    const idx = Number(e.detail.value)
    const role = RULES.ROLES[idx]
    const patch = { role: role.key }

    // 切到评委类身份时，自动匹配一个该角色的评委姓名
    if (['life', 'admin'].indexOf(role.key) >= 0) {
      const match = store.getRaters().filter(function (r) { return r.role === role.key && r.enabled })[0]
      if (match) patch.name = match.name
      patch.roomId = ''
    }
    store.setProfile(patch)
    this.refresh()
    wx.showToast({ title: '身份已切换', icon: 'success' })
  },

  onRoomChange(e) {
    const idx = Number(e.detail.value)
    const rooms = store.getRooms()
    if (rooms[idx]) store.setProfile({ roomId: rooms[idx].id })
    this.refresh()
  },

  // 直接点击评委卡片，切换为该评委身份
  useRater(e) {
    const id = e.currentTarget.dataset.id
    const rater = store.getRaters().filter(function (r) { return r.id === id })[0]
    if (!rater) return
    if (!rater.enabled) {
      wx.showToast({ title: '该评委已被停用', icon: 'none' })
      return
    }
    store.setProfile({ role: rater.role, name: rater.name, roomId: '' })
    this.refresh()
    wx.showToast({ title: '已切换为 ' + rater.name, icon: 'success' })
  },

  /* ============ 评委名单（权限可配置） ============ */

  onRaterNameInput(e) {
    this.setData({ raterNameInput: e.detail.value })
  },

  onRaterRoleChange(e) {
    this.setData({ raterRoleIndex: Number(e.detail.value) })
  },

  addRater() {
    const name = (this.data.raterNameInput || '').trim()
    if (!name) {
      wx.showToast({ title: '请输入评委姓名', icon: 'none' })
      return
    }
    const role = RATER_ROLES[this.data.raterRoleIndex].key
    store.addRater(name, role)
    this.setData({ raterNameInput: '' })
    this.refresh()
    wx.showToast({ title: '已添加', icon: 'success' })
  },

  removeRater(e) {
    const id = e.currentTarget.dataset.id
    const self = this
    wx.showModal({
      title: '移除评委？',
      content: '移除后将无法再以该身份评分。',
      success(res) {
        if (res.confirm) {
          store.removeRater(id)
          self.refresh()
        }
      }
    })
  },

  toggleRater(e) {
    store.toggleRater(e.currentTarget.dataset.id)
    this.refresh()
  },

  /* ============ 寝室名单 ============ */

  onBuildingInput(e) {
    this.setData({ buildingInput: e.detail.value })
  },

  onRoomNoInput(e) {
    this.setData({ roomNoInput: e.detail.value })
  },

  addRoom() {
    const building = (this.data.buildingInput || '').trim()
    const roomNo = (this.data.roomNoInput || '').trim()
    if (!building || !roomNo) {
      wx.showToast({ title: '请填写楼栋和寝室号', icon: 'none' })
      return
    }
    const res = store.addRoom(building, roomNo)
    if (!res.ok) {
      wx.showToast({ title: res.msg, icon: 'none' })
      return
    }
    this.setData({ buildingInput: '', roomNoInput: '' })
    this.refresh()
    wx.showToast({ title: '已添加', icon: 'success' })
  },

  removeRoom(e) {
    const id = e.currentTarget.dataset.id
    const self = this
    wx.showModal({
      title: '删除寝室？',
      content: '该寝室的提交与评分记录也会一并删除。',
      success(res) {
        if (res.confirm) {
          store.removeRoom(id)
          self.refresh()
        }
      }
    })
  },

  /* ============ 数据管理 ============ */

  clearData() {
    const self = this
    wx.showModal({
      title: '清空业务数据',
      content: '将删除所有提交记录与评分记录（寝室与评委名单保留）。',
      success(res) {
        if (res.confirm) {
          store.clearBusinessData()
          self.refresh()
          wx.showToast({ title: '已清空' })
        }
      }
    })
  },

  loadDemo() {
    const self = this
    wx.showModal({
      title: '载入演示数据',
      content: '将覆盖当前全部数据，包含 6 间寝室、4 周历史评分。',
      success(res) {
        if (res.confirm) {
          store.loadDemoData()
          self.refresh()
          wx.showToast({ title: '已载入', icon: 'success' })
        }
      }
    })
  },

  goUpload() {
    wx.switchTab({ url: '/pages/upload/upload' })
  },

  goScore() {
    wx.switchTab({ url: '/pages/score/score' })
  }
})
