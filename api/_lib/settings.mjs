let localSettings = {}

export function configureLocalSettings(settings) {
  localSettings = {
    ZHIHU_ACCESS_SECRET: settings.ZHIHU_ACCESS_SECRET,
    ZHIDA_DAILY_BUDGET: settings.ZHIDA_DAILY_BUDGET,
  }
}

export function readSetting(name) {
  return process.env[name] ?? localSettings[name]
}
