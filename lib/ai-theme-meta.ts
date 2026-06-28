export const THEME_META: Record<string, { label: string; desc: string; color: string }> = {
  CHIP_DESIGN:       { label: "AI芯片设计",       desc: "日本SoC/MCU/光学半导体设计",           color: "indigo" },
  SEMI_EQUIPMENT:    { label: "AI半导体设备",      desc: "CVD/刻蚀/清洗/EUV检查装置",           color: "blue" },
  TEST_EQUIPMENT:    { label: "AI测试设备",        desc: "ATE测试仪/电子显微镜/测量装置",        color: "cyan" },
  CHIP_MATERIAL:     { label: "AI芯片材料",        desc: "硅晶圆/EUV光刻胶/封装材料",           color: "teal" },
  HBM_PACKAGING:     { label: "HBM・先进封装",     desc: "FC-BGA基板/ABF基板/封装材料",          color: "violet" },
  SENSOR_PRECISION:  { label: "AI传感器・精密",    desc: "CMOS传感器/MLCC/连接器",              color: "purple" },
  SERVER_DC:         { label: "AI服务器・DC",      desc: "AI服务器/国产云/DC运营/光纤",          color: "amber" },
  NETWORK:           { label: "AI网络通信",        desc: "光纤电缆/5G/IOWN全光网络",            color: "orange" },
  ROBOT_AUTO:        { label: "AI机器人・自动化",  desc: "工业机器人/机器视觉/FA控制",           color: "emerald" },
  SOFTWARE_CLOUD:    { label: "AI软件・云・SaaS",  desc: "AI开发平台/云会计/HR SaaS",           color: "sky" },
  INTERNET_PLATFORM: { label: "AI互联网・平台",    desc: "LINE AI/HR平台/流媒体内容",            color: "pink" },
  MEDICAL_LIFE:      { label: "AI医疗・生命科学",  desc: "AI药物发现/诊断设备/医疗平台",         color: "rose" },
  SECURITY_VISION:   { label: "AI安防・图像识别",  desc: "人脸识别/机器视觉/AI安防系统",         color: "red" },
  POWER_INFRA:       { label: "AI电力・能源",      desc: "AI DC供电/パワー电子/输电电缆",        color: "yellow" },
};

export const THEME_ORDER = [
  "CHIP_DESIGN", "SEMI_EQUIPMENT", "TEST_EQUIPMENT", "CHIP_MATERIAL",
  "HBM_PACKAGING", "SENSOR_PRECISION", "SERVER_DC", "NETWORK",
  "ROBOT_AUTO", "SOFTWARE_CLOUD", "INTERNET_PLATFORM", "MEDICAL_LIFE",
  "SECURITY_VISION", "POWER_INFRA",
];
