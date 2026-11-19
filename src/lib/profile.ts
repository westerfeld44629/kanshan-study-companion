/**
 * 浏览器端画像：存在 localStorage，随请求发给后端参与排序。
 * 后端永远不持久化用户画像，符合「个人数据按需读取」的边界。
 */
import { emptyProfile, applyEvent, migrateProfile, type Profile, type ProfileEvent } from '../../shared/profile.mjs'

const KEY = 'kanshan.profile.v1'

export type { Profile, ProfileEvent }

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyProfile()
    return migrateProfile(JSON.parse(raw))
  } catch {
    return emptyProfile()
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
    return true
  } catch {
    return false
  }
}

export function record(event: ProfileEvent): Profile {
  const next = applyEvent(loadProfile(), event)
  saveProfile(next)
  return next
}

export function resetProfile(): Profile {
  const p = emptyProfile()
  saveProfile(p)
  return p
}

