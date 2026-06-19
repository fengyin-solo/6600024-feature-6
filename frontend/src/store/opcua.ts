import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { OPCUANode, DataValue, AlarmEvent, SubscriptionConfig } from '../types'

export type SeverityFilter = 'all' | AlarmEvent['severity']
export type AcknowledgedFilter = 'all' | 'acknowledged' | 'unacknowledged'
export type AreaFilter = 'all' | string

export const useOpcuaStore = defineStore('opcua', () => {
  // 状态
  const nodeTree = ref<OPCUANode[]>([])
  const selectedNode = ref<OPCUANode | null>(null)
  const subscriptions = ref<Map<string, SubscriptionConfig>>(new Map())
  const alarms = ref<AlarmEvent[]>([])
  const realTimeData = ref<Map<string, DataValue>>(new Map())
  const isConnected = ref(false)
  const dataHistory = ref<Map<string, Array<{ timestamp: number; value: number }>>>(new Map())

  // 筛选状态
  const severityFilter = ref<SeverityFilter>('all')
  const acknowledgedFilter = ref<AcknowledgedFilter>('all')
  const areaFilter = ref<AreaFilter>('all')

  // 初始化模拟节点树
  function initNodeTree() {
    nodeTree.value = [
      {
        id: 'server',
        name: 'Server',
        nodeId: 'ns=0;i=2253',
        type: 'Object',
        description: 'OPC-UA 服务器根节点',
        children: [
          {
            id: 'objects',
            name: 'Objects',
            nodeId: 'ns=0;i=85',
            type: 'Object',
            description: '对象文件夹',
            children: [
              {
                id: 'plc_area1',
                name: 'PLC_Area1',
                nodeId: 'ns=2;i=1001',
                type: 'Object',
                description: '1号生产区域 PLC',
                children: [
                  {
                    id: 'temp_sensor',
                    name: 'Temperature_Sensor',
                    nodeId: 'ns=2;i=1002',
                    type: 'Variable',
                    dataType: 'Double',
                    value: 25.6,
                    unit: '°C',
                    quality: 'Good',
                    description: '温度传感器'
                  },
                  {
                    id: 'pressure_transmitter',
                    name: 'Pressure_Transmitter',
                    nodeId: 'ns=2;i=1003',
                    type: 'Variable',
                    dataType: 'Double',
                    value: 3.45,
                    unit: 'MPa',
                    quality: 'Good',
                    description: '压力变送器'
                  },
                  {
                    id: 'pump_status',
                    name: 'Pump_Status',
                    nodeId: 'ns=2;i=1004',
                    type: 'Variable',
                    dataType: 'Boolean',
                    value: true,
                    quality: 'Good',
                    description: '泵运行状态'
                  }
                ]
              },
              {
                id: 'plc_area2',
                name: 'PLC_Area2',
                nodeId: 'ns=2;i=2001',
                type: 'Object',
                description: '2号生产区域 PLC',
                children: [
                  {
                    id: 'flow_meter',
                    name: 'Flow_Meter',
                    nodeId: 'ns=2;i=2002',
                    type: 'Variable',
                    dataType: 'Double',
                    value: 156.7,
                    unit: 'L/min',
                    quality: 'Good',
                    description: '流量计'
                  },
                  {
                    id: 'valve_position',
                    name: 'Valve_Position',
                    nodeId: 'ns=2;i=2003',
                    type: 'Variable',
                    dataType: 'Double',
                    value: 75,
                    unit: '%',
                    quality: 'Good',
                    description: '阀门开度'
                  },
                  {
                    id: 'motor_speed',
                    name: 'Motor_Speed',
                    nodeId: 'ns=2;i=2004',
                    type: 'Variable',
                    dataType: 'Int32',
                    value: 1480,
                    unit: 'RPM',
                    quality: 'Good',
                    description: '电机转速'
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }

  // 模拟实时数据更新
  function simulateDataUpdate() {
    const nodes = getAllVariableNodes()
    nodes.forEach(node => {
      const currentValue = realTimeData.value.get(node.id)?.value ?? node.value
      
      let newValue: number | boolean | string
      if (node.dataType === 'Double') {
        const numVal = typeof currentValue === 'number' ? currentValue : parseFloat(String(currentValue))
        const variation = (Math.random() - 0.5) * 2
        newValue = Math.round((numVal + variation) * 100) / 100
      } else if (node.dataType === 'Int32') {
        const numVal = typeof currentValue === 'number' ? currentValue : parseInt(String(currentValue))
        const variation = Math.floor((Math.random() - 0.5) * 10)
        newValue = numVal + variation
      } else if (node.dataType === 'Boolean') {
        newValue = Math.random() > 0.95 ? !currentValue : currentValue
      } else {
        newValue = currentValue
      }

      const dataValue: DataValue = {
        nodeId: node.nodeId,
        value: newValue,
        quality: Math.random() > 0.98 ? 'Uncertain' : 'Good',
        timestamp: Date.now(),
        sourceTimestamp: Date.now(),
        serverTimestamp: Date.now()
      }

      realTimeData.value.set(node.id, dataValue)
      node.value = newValue
      node.quality = dataValue.quality

      // 记录历史数据
      const history = dataHistory.value.get(node.id) || []
      history.push({ timestamp: Date.now(), value: typeof newValue === 'number' ? newValue : 0 })
      if (history.length > 100) history.shift()
      dataHistory.value.set(node.id, history)

      // 检查报警条件
      checkAlarms(node, newValue)
    })
  }

  // 检查报警
  function checkAlarms(node: OPCUANode, value: number | boolean | string) {
    if (node.id === 'temp_sensor' && typeof value === 'number' && value > 28) {
      addAlarm({
        nodeId: node.nodeId,
        nodeName: node.name,
        severity: 'High',
        message: `温度过高: ${value}°C (阈值: 28°C)`,
        value,
        threshold: 28
      })
    }
    if (node.id === 'pressure_transmitter' && typeof value === 'number' && value > 4.0) {
      addAlarm({
        nodeId: node.nodeId,
        nodeName: node.name,
        severity: 'Critical',
        message: `压力超限: ${value} MPa (阈值: 4.0 MPa)`,
        value,
        threshold: 4.0
      })
    }
    if (node.id === 'motor_speed' && typeof value === 'number' && value > 1550) {
      addAlarm({
        nodeId: node.nodeId,
        nodeName: node.name,
        severity: 'Medium',
        message: `电机转速偏高: ${value} RPM (阈值: 1550 RPM)`,
        value,
        threshold: 1550
      })
    }
  }

  // 添加报警
  function addAlarm(alarm: Omit<AlarmEvent, 'id' | 'timestamp' | 'acknowledged'>) {
    const newAlarm: AlarmEvent = {
      ...alarm,
      id: `alarm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      acknowledged: false
    }
    alarms.value.unshift(newAlarm)
    if (alarms.value.length > 50) alarms.value.pop()
  }

  // 获取所有变量节点
  function getAllVariableNodes(): OPCUANode[] {
    const variables: OPCUANode[] = []
    function traverse(nodes: OPCUANode[]) {
      nodes.forEach(node => {
        if (node.type === 'Variable') {
          variables.push(node)
        }
        if (node.children) {
          traverse(node.children)
        }
      })
    }
    traverse(nodeTree.value)
    return variables
  }

  // 选择节点
  function selectNode(node: OPCUANode) {
    selectedNode.value = node
  }

  // 添加订阅
  function addSubscription(nodeId: string, config: Partial<SubscriptionConfig> = {}) {
    const subscription: SubscriptionConfig = {
      nodeId,
      publishingInterval: config.publishingInterval || 1000,
      samplingInterval: config.samplingInterval || 500,
      queueSize: config.queueSize || 10,
      discardOldest: config.discardOldest ?? true,
      enabled: true
    }
    subscriptions.value.set(nodeId, subscription)
  }

  // 移除订阅
  function removeSubscription(nodeId: string) {
    subscriptions.value.delete(nodeId)
  }

  // 确认报警
  function acknowledgeAlarm(alarmId: string) {
    const alarm = alarms.value.find(a => a.id === alarmId)
    if (alarm) {
      alarm.acknowledged = true
    }
  }

  // 清空报警
  function clearAlarms() {
    alarms.value = []
  }

  // 连接模拟
  function connect() {
    isConnected.value = true
    initNodeTree()
  }

  // 断开连接
  function disconnect() {
    isConnected.value = false
  }

  // 获取节点所在的区域名称
  function getNodeArea(nodeId: string): string {
    function traverse(nodes: OPCUANode[], currentPath: string[] = []): string | null {
      for (const node of nodes) {
        const newPath = [...currentPath, node.name]
        if (node.nodeId === nodeId || node.id === nodeId) {
          const areaIndex = newPath.findIndex(name => name.startsWith('PLC_Area') || name.includes('Area'))
          if (areaIndex !== -1) {
            return newPath[areaIndex]
          }
          if (currentPath.length >= 2) {
            return currentPath[currentPath.length - 1]
          }
          return '未知区域'
        }
        if (node.children) {
          const result = traverse(node.children, newPath)
          if (result) return result
        }
      }
      return null
    }
    return traverse(nodeTree.value) || '未知区域'
  }

  // 获取所有可用的区域列表
  function getAvailableAreas(): string[] {
    const areas = new Set<string>()
    function traverse(nodes: OPCUANode[]) {
      for (const node of nodes) {
        if (node.name.startsWith('PLC_Area') || node.name.includes('Area')) {
          areas.add(node.name)
        }
        if (node.children) {
          traverse(node.children)
        }
      }
    }
    traverse(nodeTree.value)
    return Array.from(areas)
  }

  // 筛选后的报警列表
  const filteredAlarms = computed(() => {
    return alarms.value.filter(alarm => {
      if (severityFilter.value !== 'all' && alarm.severity !== severityFilter.value) {
        return false
      }
      if (acknowledgedFilter.value === 'acknowledged' && !alarm.acknowledged) {
        return false
      }
      if (acknowledgedFilter.value === 'unacknowledged' && alarm.acknowledged) {
        return false
      }
      if (areaFilter.value !== 'all') {
        const alarmArea = getNodeArea(alarm.nodeId)
        if (alarmArea !== areaFilter.value) {
          return false
        }
      }
      return true
    })
  })

  // 设置筛选条件
  function setSeverityFilter(filter: SeverityFilter) {
    severityFilter.value = filter
  }
  function setAcknowledgedFilter(filter: AcknowledgedFilter) {
    acknowledgedFilter.value = filter
  }
  function setAreaFilter(filter: AreaFilter) {
    areaFilter.value = filter
  }
  function resetFilters() {
    severityFilter.value = 'all'
    acknowledgedFilter.value = 'all'
    areaFilter.value = 'all'
  }

  // 计算属性
  const activeAlarmsCount = computed(() => alarms.value.filter(a => !a.acknowledged).length)
  const criticalAlarmsCount = computed(() => alarms.value.filter(a => a.severity === 'Critical' && !a.acknowledged).length)

  return {
    // 状态
    nodeTree,
    selectedNode,
    subscriptions,
    alarms,
    realTimeData,
    isConnected,
    dataHistory,
    // 筛选状态
    severityFilter,
    acknowledgedFilter,
    areaFilter,
    // 方法
    initNodeTree,
    simulateDataUpdate,
    selectNode,
    addSubscription,
    removeSubscription,
    acknowledgeAlarm,
    clearAlarms,
    connect,
    disconnect,
    getAllVariableNodes,
    getNodeArea,
    getAvailableAreas,
    setSeverityFilter,
    setAcknowledgedFilter,
    setAreaFilter,
    resetFilters,
    // 计算属性
    activeAlarmsCount,
    criticalAlarmsCount,
    filteredAlarms
  }
})
