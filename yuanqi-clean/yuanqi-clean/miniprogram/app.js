// app.js —— 全局入口
const store = require('./utils/store.js')

App({
  globalData: {
    version: '1.0.0'
  },

  onLaunch() {
    // 首次进入时初始化本地数据（寝室 / 评委 / 演示周数据）
    store.init()
  },

  onShow() {
    // 每次回到前台刷新一次数据时间戳，便于页面判断是否重载
    this.globalData.resumeAt = Date.now()
  }
})
