// COPS vs SA is not a stored column — it's derived from department, since
// 'Student Assistant' is the only department that isn't part of CoPs
// Marketing. Kept in one place so the roster, dev/manager overview tables,
// print-roster, and export-members all agree on the same classification.
export const SA_DEPARTMENT = 'Student Assistant'

// The 4 units SA members are actually placed in. Standardized so each unit
// can eventually get its own manager/admin account scoped by position.
export const SA_POSITIONS = ['กีฬา', 'SDEC', 'กิจกรรมนิสิต', 'ห้องพยาบาล'] as const
export type SAPosition = typeof SA_POSITIONS[number]

export type StudentGroup = 'COPS' | 'SA'

export function studentGroup(department: string): StudentGroup {
  return department === SA_DEPARTMENT ? 'SA' : 'COPS'
}

export const GROUP_BADGE_STYLES: Record<StudentGroup, string> = {
  COPS: 'bg-indigo-600 text-white',
  SA:   'bg-emerald-600 text-white',
}
