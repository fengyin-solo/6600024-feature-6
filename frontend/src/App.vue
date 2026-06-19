<template>
  <div class="app-container">
    <!-- 顶部导航栏 -->
    <header class="app-header">
      <div class="header-left">
        <el-icon :size="24" class="text-cyan-400"><Monitor /></el-icon>
        <h1 class="app-title">OPC-UA 工业节点浏览与数据采集</h1>
      </div>
      <div class="header-right">
        <el-badge :value="store.activeAlarmsCount" :max="99" class="alarm-badge">
          <el-icon :size="20" class="text-yellow-400"><Bell /></el-icon>
        </el-badge>
        <el-tag type="success" v-if="store.isConnected" class="status-tag">
          <el-icon><CircleCheck /></el-icon>
          在线
        </el-tag>
        <el-tag type="danger" v-else class="status-tag">
          <el-icon><CircleClose /></el-icon>
          离线
        </el-tag>
        <el-button
          :type="store.isConnected ? 'danger' : 'success'"
          size="small"
          @click="toggleConnection"
        >
          {{ store.isConnected ? '断开' : '连接' }}
        </el-button>
      </div>
    </header>

    <!-- 主内容区域 -->
    <div class="app-main">
      <!-- 左侧面板: 节点树 -->
      <aside class="left-panel">
        <NodeTree />
      </aside>

      <!-- 中央区域: 仪表盘 -->
      <main class="center-panel">
        <DataDashboard />
      </main>

      <!-- 右侧面板: 报警列表 -->
      <aside class="right-panel">
        <div class="alarm-panel">
          <div class="alarm-header">
            <h3 class="text-lg font-bold text-yellow-400">报警事件</h3>
            <div class="alarm-header-actions">
              <el-button type="info" size="small" text @click="store.resetFilters()" v-if="hasActiveFilters">
                重置筛选
              </el-button>
              <el-button type="danger" size="small" text @click="store.clearAlarms()" v-if="store.alarms.length > 0">
                清空
              </el-button>
            </div>
          </div>

          <!-- 筛选区域 -->
          <div class="alarm-filters">
            <div class="filter-group">
              <label class="filter-label">严重级别</label>
              <el-select v-model="selectedSeverity" size="small" placeholder="全部级别" class="filter-select" @change="handleSeverityChange">
                <el-option label="全部级别" value="all" />
                <el-option label="严重" value="Critical" />
                <el-option label="高" value="High" />
                <el-option label="中" value="Medium" />
                <el-option label="低" value="Low" />
                <el-option label="信息" value="Info" />
              </el-select>
            </div>
            <div class="filter-group">
              <label class="filter-label">确认状态</label>
              <el-select v-model="selectedAcknowledged" size="small" placeholder="全部状态" class="filter-select" @change="handleAcknowledgedChange">
                <el-option label="全部状态" value="all" />
                <el-option label="已确认" value="acknowledged" />
                <el-option label="未确认" value="unacknowledged" />
              </el-select>
            </div>
            <div class="filter-group">
              <label class="filter-label">节点区域</label>
              <el-select v-model="selectedArea" size="small" placeholder="全部区域" class="filter-select" @change="handleAreaChange">
                <el-option label="全部区域" value="all" />
                <el-option v-for="area in availableAreas" :key="area" :label="area" :value="area" />
              </el-select>
            </div>
          </div>

          <div class="alarm-stats">
            <el-tag type="danger" size="small">严重: {{ criticalCount }}</el-tag>
            <el-tag type="warning" size="small">活跃: {{ store.activeAlarmsCount }}</el-tag>
            <el-tag type="info" size="small">总计: {{ store.filteredAlarms.length }}/{{ store.alarms.length }}</el-tag>
          </div>

          <div class="alarm-list">
            <div
              v-for="alarm in store.filteredAlarms"
              :key="alarm.id"
              class="alarm-item"
              :class="{
                'alarm-critical': alarm.severity === 'Critical',
                'alarm-high': alarm.severity === 'High',
                'alarm-medium': alarm.severity === 'Medium',
                'alarm-acknowledged': alarm.acknowledged
              }"
            >
              <div class="alarm-item-header">
                <el-tag
                  :type="getSeverityType(alarm.severity)"
                  size="small"
                  effect="dark"
                >
                  {{ getSeverityLabel(alarm.severity) }}
                </el-tag>
                <span class="alarm-time">{{ formatTime(alarm.timestamp) }}</span>
              </div>
              <div class="alarm-item-body">
                <div class="alarm-meta">
                  <span class="alarm-node">{{ alarm.nodeName }}</span>
                  <el-tag size="small" type="info" class="alarm-area-tag">{{ store.getNodeArea(alarm.nodeId) }}</el-tag>
                </div>
                <p class="alarm-message">{{ alarm.message }}</p>
              </div>
              <el-button
                v-if="!alarm.acknowledged"
                type="primary"
                size="small"
                text
                @click="store.acknowledgeAlarm(alarm.id)"
              >
                确认
              </el-button>
            </div>

            <div v-if="store.filteredAlarms.length === 0" class="no-alarms">
              <el-empty :description="store.alarms.length === 0 ? '暂无报警' : '无符合筛选条件的报警'" :image-size="60" />
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Monitor, Bell, CircleCheck, CircleClose } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useOpcuaStore, type SeverityFilter, type AcknowledgedFilter, type AreaFilter } from './store/opcua'
import NodeTree from './components/NodeTree.vue'
import DataDashboard from './components/DataDashboard.vue'
import type { AlarmEvent } from './types'

const store = useOpcuaStore()
const updateTimer = ref<number | null>(null)

// 筛选绑定值
const selectedSeverity = ref<SeverityFilter>('all')
const selectedAcknowledged = ref<AcknowledgedFilter>('all')
const selectedArea = ref<AreaFilter>('all')

// 获取可用区域列表
const availableAreas = computed(() => store.getAvailableAreas())

// 是否有激活的筛选
const hasActiveFilters = computed(() => {
  return store.severityFilter !== 'all' || store.acknowledgedFilter !== 'all' || store.areaFilter !== 'all'
})

// 同步 store 中的筛选值到本地
watch(() => store.severityFilter, (val) => { selectedSeverity.value = val })
watch(() => store.acknowledgedFilter, (val) => { selectedAcknowledged.value = val })
watch(() => store.areaFilter, (val) => { selectedArea.value = val })

// 筛选变更处理
function handleSeverityChange(val: SeverityFilter) {
  store.setSeverityFilter(val)
}
function handleAcknowledgedChange(val: AcknowledgedFilter) {
  store.setAcknowledgedFilter(val)
}
function handleAreaChange(val: AreaFilter) {
  store.setAreaFilter(val)
}

const criticalCount = computed(() =>
  store.alarms.filter(a => a.severity === 'Critical' && !a.acknowledged).length
)

function toggleConnection() {
  if (store.isConnected) {
    store.disconnect()
    if (updateTimer.value) {
      clearInterval(updateTimer.value)
      updateTimer.value = null
    }
    ElMessage.warning('已断开 OPC-UA 连接')
  } else {
    store.connect()
    startSimulation()
    ElMessage.success('已连接 OPC-UA 服务器')
  }
}

function startSimulation() {
  updateTimer.value = window.setInterval(() => {
    store.simulateDataUpdate()
  }, 1000)
}

function getSeverityType(severity: AlarmEvent['severity']) {
  switch (severity) {
    case 'Critical': return 'danger'
    case 'High': return 'danger'
    case 'Medium': return 'warning'
    case 'Low': return 'info'
    case 'Info': return 'info'
  }
}

function getSeverityLabel(severity: AlarmEvent['severity']) {
  switch (severity) {
    case 'Critical': return '严重'
    case 'High': return '高'
    case 'Medium': return '中'
    case 'Low': return '低'
    case 'Info': return '信息'
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
}

onMounted(() => {
  store.connect()
  startSimulation()
})

onUnmounted(() => {
  if (updateTimer.value) {
    clearInterval(updateTimer.value)
  }
})
</script>

<style scoped>
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0f172a;
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 56px;
  background: rgba(15, 23, 42, 0.95);
  border-bottom: 1px solid rgba(71, 85, 105, 0.5);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-title {
  font-size: 18px;
  font-weight: bold;
  background: linear-gradient(90deg, #06b6d4, #22d3ee);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-tag {
  display: flex;
  align-items: center;
  gap: 4px;
}

.app-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.left-panel {
  width: 320px;
  background: rgba(30, 41, 59, 0.6);
  border-right: 1px solid rgba(71, 85, 105, 0.5);
  overflow-y: auto;
  flex-shrink: 0;
}

.center-panel {
  flex: 1;
  overflow-y: auto;
  background: #0f172a;
}

.right-panel {
  width: 340px;
  background: rgba(30, 41, 59, 0.6);
  border-left: 1px solid rgba(71, 85, 105, 0.5);
  overflow-y: auto;
  flex-shrink: 0;
}

.alarm-panel {
  padding: 12px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.alarm-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.alarm-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.alarm-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(71, 85, 105, 0.3);
  border-radius: 6px;
  margin-bottom: 12px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.filter-select {
  width: 100%;
}

.alarm-stats {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.alarm-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.alarm-item {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(71, 85, 105, 0.5);
  border-radius: 6px;
  padding: 10px;
  border-left: 3px solid #64748b;
}

.alarm-critical {
  border-left-color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
}

.alarm-high {
  border-left-color: #f97316;
  background: rgba(249, 115, 22, 0.05);
}

.alarm-medium {
  border-left-color: #eab308;
  background: rgba(234, 179, 8, 0.05);
}

.alarm-acknowledged {
  opacity: 0.5;
}

.alarm-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.alarm-time {
  font-size: 11px;
  color: #64748b;
  font-family: monospace;
}

.alarm-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.alarm-node {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

.alarm-area-tag {
  font-size: 10px;
  padding: 0 4px;
  height: 16px;
  line-height: 16px;
}

.alarm-message {
  font-size: 13px;
  color: #cbd5e1;
  margin-top: 4px;
}

.no-alarms {
  display: flex;
  justify-content: center;
  padding-top: 40px;
}

.alarm-badge {
  cursor: pointer;
}
</style>
